import express from 'express';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';

const app = express();
app.use(cors());

// Increase the JSON payload limit since phone photo Base64 strings are large
app.use(express.json({ limit: '50mb' }));

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In-memory map to store and track jobs safely
const jobs = new Map();

// 1. POST Endpoint: Handles the initial problem submission
app.post('/api/solve', async (req, res) => {
    try {
        const { imageBase64, subject } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ jobId: "", status: "failed" });
        }

        // Create a unique ticket ID for this request
        const jobId = "job_" + Date.now();
        
        // Save initial processing state to our store
        jobs.set(jobId, { id: jobId, status: "processing", result: null });

        // Instantly hand back the ticket to the mobile app so it doesn't time out
        res.json({ jobId: jobId, status: "processing" });

        // Kick off the AI task asynchronously in the background
        (async () => {
            try {
                const prompt = `You are an expert tutor specializing in JEE Advanced and Main preparation for ${subject || 'Physics'}. Solve this step-by-step with clear formulas and explanations.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        prompt,
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: imageBase64
                            }
                        }
                    ],
                });

                // Update the ticket store with the successful solution data structure
                jobs.set(jobId, {
                    id: jobId,
                    status: "completed",
                    result: { solution: response.text }
                });

            } catch (aiError) {
                console.error("Gemini Error:", aiError);
                jobs.set(jobId, {
                    id: jobId,
                    status: "failed",
                    result: { solution: `AI generation failed: ${aiError.message}` }
                });
            }
        })();

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ jobId: "", status: "failed" });
    }
});

// 2. GET Endpoint: The mobile app polls this to look for updates
app.get('/api/status/:id', (req, res) => {
    const jobId = req.params.id;
    const job = jobs.get(jobId);

    if (!job) {
        return res.json({ 
            id: jobId, 
            status: "failed", 
            result: { solution: "Job session not found on the server." } 
        });
    }

    // Returns the data structure matching your mobile client's StatusResponse
    res.json({
        id: job.id,
        status: job.status,
        result: job.result
    });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server matches ApiService layout perfectly on port ${PORT}`);
});
