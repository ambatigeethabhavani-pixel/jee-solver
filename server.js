import express from 'express';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';

const app = express();
app.use(cors());

// Increase the payload limit to handle high-res photos safely
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
                // Strip out the data header if the mobile app includes it
                const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

                const prompt = `You are an expert tutor specializing in JEE Advanced and Main preparation for ${subject || 'Physics'}. Solve this step-by-step with clear formulas and explanations.`;

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
                // We mark it completed but pass the error text so your phone prints it out
                jobs.set(jobId, {
                    id: jobId,
                    status: "completed",
                    result: { solution: `⚠️ API Error: ${aiError.message}\n\nPlease check if GEMINI_API_KEY is correctly set in your Render Environment settings.` }
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
    console.log(`Server running perfectly on port ${PORT}`);
});
