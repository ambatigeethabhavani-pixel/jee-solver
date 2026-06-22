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

             const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-lite',
                    contents: [
                        {
                            inlineData: {
                                data: cleanBase64,
                                mimeType: "image/jpeg"
                            }
                        },
                        "Please solve the JEE problem present in this image."
                    ],
                    config: {
                        systemInstruction: "You are an elite JEE tutor. Solve the question in the image with absolute accuracy, but keep your response highly concise, clean, and easy to read on a mobile screen.\n\n" +
                                           "STRICT FORMATTING RULES:\n" +
                                           "1. NO ASTERISKS OR MARKDOWNS: Do not use the '*' character or markdown bold stars (**text**) anywhere. Use plain text numbers and letters.\n" +
                                           "2. NO LATEX: Do not use backslashes, \\(, \\[, or complex code blocks. Write equations using simple text layout (e.g., use '^' for powers, '/' for division, 'sqrt()' for roots).\n" +
                                           "3. NO DENSE PARAGRAPHS: Break every single thought into a short, new line. Explain any difficult concepts in very simple high-school terms.\n\n" +
                                           "RESPONSE STRUCTURE:\n" +
                                           "GIVEN:\n" +
                                           "[List known values cleanly on separate lines]\n\n" +
                                           "FORMULA:\n" +
                                           "[State the main equation clearly]\n\n" +
                                           "CALCULATION:\n" +
                                           "[Show only 3 to 5 core calculation steps on short, clear lines]\n\n" +
                                           "🎯 FINAL ANSWER: Option (X) [Value]"
                    }
                });

                // Save the successful solution to your jobs object with your disclaimer
                jobs.set(jobId, {
                    id: jobId,
                    status: "completed",
                    result: { solution: response.text + "\n\n( Jee AI isn't human and can make mistakes, so double-check it )" }
                });

            } catch (aiError) {
                console.error("Gemini Error:", aiError);
                jobs.set(jobId, {
                    id: jobId,
                    status: "completed",
                    result: { solution: `⚠️ API Error: ${aiError.message}` }
                });
            }
        })(); // <--- Fixed: Properly closed out the background function block here

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
    console.log(`Server running minimal response output on port ${PORT}`);
});
