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

                // Powerful new prompt instructing the AI to use textbook styling 
                const prompt = `You are an expert tutor specializing in JEE Advanced and Main preparation for ${subject || 'Physics'}. 
                Provide a beautifully clear, clean, step-by-step numerical solution for the problem in this image.
                
                ⚠️ STRICT FORMATTING RULES FOR YOUR RESPONSE:
                1. NEVER use LaTeX syntax or backslashes (NO phrases like \\frac, \\left, \\right, \\times, \\text).
                2. NEVER use programmer notation or underscores (DO NOT write variables like v_car, v_sound, v_car_km_hr).
                3. ALWAYS use normal human words for terms (e.g., write "Speed of the car", "Speed of sound", "Reflected frequency").
                4. Keep the math steps exceptionally clean and easy to read. Write fractions simply using normal text brackets, like: (480 / 440) or 345 / 23.
                5. Use clear double line breaks between steps so it displays as an easy-to-read list on a phone screen.
                6. Highlight the final answer clearly at the absolute bottom of the screen exactly like this:
                   
                   🎯 FINAL ANSWER: Option (X) [Value]`;

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
    console.log(`Server textbook view active on port ${PORT}`);
});
