import express from 'express';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';

const app = express();
app.use(cors());

// Handle large image payloads safely
app.use(express.json({ limit: '50mb' }));

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In-memory map to store processing jobs
const jobs = new Map();

// 1. POST Endpoint: Submits the problem
app.post('/api/solve', async (req, res) => {
    try {
        const { imageBase64, subject } = req.body;

        if (!imageBase64) {
            return res.json({ jobId: "", status: "failed" });
        }

        const jobId = "job_" + Date.now();
        jobs.set(jobId, { id: jobId, status: "processing", result: null });

        // Instantly hand back the ticket ID to the mobile app
        res.json({ jobId: jobId, status: "processing" });

        // Run the AI task asynchronously in the background
        (async () => {
            try {
                // Remove the data URL prefix if it exists
                let cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

                // Clear out hidden characters, newlines, and accidental backslashes
                cleanBase64 = cleanBase64.replace(/\\n/g, "")
                                         .replace(/\\r/g, "")
                                         .replace(/[\r\n\s]/g, "")
                                         .replace(/\\/g, "");

                // Master Prompt engineered for maximum accuracy, diagrams, and absolute zero asterisks
                const prompt = `You are an elite, world-class tutor specializing in JEE Advanced and Main preparation for ${subject || 'Physics'}. 
                Your goal is absolute perfection and 99.9% full accuracy on every problem.
                
                VISUAL ANALYSIS INSTRUCTION:
                If the image contains any diagrams, graphs, circuits, geometry drawings, coordinate axes, vectors, or chemical structures, analyze them with extreme care. Read all axis labels, intercept values, slopes, angle markings, geometric dimensions, or molecular bonds precisely before beginning any numerical calculation.
                
                ⚠️ CRITICAL FORMATTING RULES TO PREVENT APP DISPLAY ERRORS:
                1. ABSOLUTELY NO ASTERISKS: Do not use the star character (*) anywhere in your entire response. Do not use it for bolding, do not use it for bullet points, and do not use it for multiplication.
                2. NO LATEX OR CODE: Do not use any backslashes or code syntax (Never write terms like \\frac, \\left, \\right, \\times, \\text).
                3. NO PROGRAMMER JARGON: Do not use underscores or computer variable labels (Do not write things like v_car or speed_of_sound_m_s). Use plain, clear human words.
                4. STEP HEADINGS FORMATTING: To make your step headings stand out clearly as bold/distinct without using stars, write them in ALL CAPITAL LETTERS with an empty line before and after them. For example:
                   
                   STEP 1: ANALYZING THE GIVEN GRAPH
                   
                5. MATH EXPRESSIONS: Write formulas using simple plain text symbols. Use '/' for division, '+' for addition, '-' for subtraction, and write out 'times' or use simple brackets for multiplication.
                6. FINAL ANSWER HIGHLIGHT: At the absolute bottom of your response, print the final answer cleanly in all capital letters without any stars, like this:
                   
                   🎯 FINAL ANSWER: Option (X) [Write value here]`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        prompt,
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: cleanBase64
                            }
                        }
                    ],
                });

                jobs.set(jobId, {
                    id: jobId,
                    status: "completed",
                    result: { solution: response.text }
                });

            } catch (aiError) {
                console.error("Gemini Error:", aiError);
                jobs.set(jobId, {
                    id: jobId,
                    status: "completed",
                    result: { solution: `⚠️ API Error: ${aiError.message}` }
                });
            }
        })();

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ jobId: "", status: "failed" });
    }
});

// 2. GET Endpoint: The mobile app polls this for the answer
app.get('/api/status/:id', (req, res) => {
    const jobId = req.params.id;
    const job = jobs.get(jobId);

    if (!job) {
        return res.json({ 
            id: jobId, 
            status: "completed", 
            result: { solution: "Job session timed out or not found on server." } 
        });
    }

    res.json({
        id: job.id,
        status: job.status,
        result: job.result
    });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server optimized for diagram processing active on port ${PORT}`);
});
