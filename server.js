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

                // Formatted prompt to force clean, plain text math explanations
                const prompt = `You are an expert tutor specializing in JEE Advanced and Main preparation for ${subject || 'Physics'}. 
                Provide a highly clear, step-by-step numerical solution for the problem in this image.
                
                ⚠️ STRICT FORMATTING RULES FOR YOUR RESPONSE:
                1. DO NOT use any LaTeX syntax or symbols (NEVER use words starting with backslashes like \\frac, \\left, \\right, \\times, \\text, etc.).
                2. Write all math formulas using standard plain-text characters (e.g., use '/' for division, '*' for multiplication, '^' for powers, and simple names like v_sound or v_bus).
                3. Break down the calculations step-by-step using simple numbers.
                4. At the very end of your response, output a clearly highlighted final answer block like this:
                   
                   🎯 FINAL ANSWER: Option (X) [Write the exact option value here]`;

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
    console.log(`Server scrubbing and plain math output active on port ${PORT}`);
});
