import express from 'express';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';

const app = express();
app.use(cors());

// Handle large image payloads safely
app.use(express.json({ limit: '50mb' }));

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In-memory map to store processing jobs for the image solver
const jobs = new Map();

// ==========================================
// 1. IMAGE SOLVER ENDPOINTS (Original Code)
// ==========================================
app.post('/api/solve', async (req, res) => {
    try {
        const { imageBase64, subject } = req.body;

        if (!imageBase64) {
            return res.json({ jobId: "", status: "failed" });
        }

        const jobId = "job_" + Date.now();
        jobs.set(jobId, { id: jobId, status: "processing", result: null });

        res.json({ jobId: jobId, status: "processing" });

        (async () => {
            try {
                let cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
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
                                           "3. NO DENSE PARAGRAPHS: Break every single thought into a short, new line.\n\n" +
                                           "RESPONSE STRUCTURE:\n" +
                                           "GIVEN:\n[List known values cleanly]\n\n" +
                                           "FORMULA:\n[State the main equation clearly]\n\n" +
                                           "CALCULATION:\n[Show only 3 to 5 core calculation steps]\n\n" +
                                           "🎯 FINAL ANSWER: Option (X) [Value]"
                    }
                });

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
        })();

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ jobId: "", status: "failed" });
    }
});

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

    res.json({ id: job.id, status: job.status, result: job.result });
});

// ==========================================
// 2. NEW ENDPOINT: INFINITE QUIZ GENERATOR
// ==========================================
app.post('/api/quiz/generate', async (req, res) => {
    try {
        const { subject } = req.body; // Expects "Physics", "Chemistry", or "Mathematics"

        if (!subject) {
            return res.status(400).json({ error: "Please specify a subject." });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: `Generate a brand new multiple-choice JEE question for the subject: ${subject}.`,
            config: {
                // Forces Gemini to output a clean, programmable JSON object back to the server
                responseMimeType: "application/json",
                systemInstruction: "You are a JEE practice exam generator. Generate a completely new, realistic question every time.\n" +
                                   "Return ONLY a valid JSON object matching this structural layout exactly. Do not warp it inside markdown tags:\n" +
                                   "{\n" +
                                   "  \"question\": \"The question text (Strict plain text only, no markdown asterisks, no LaTeX syntax, clean line breaks)\",\n" +
                                   "  \"options\": [\"Option 1 text\", \"Option 2 text\", \"Option 3 text\", \"Option 4 text\"],\n" +
                                   "  \"hint\": \"A quick, smart side-hint to push the student in the right direction\",\n" +
                                   "  \"correctOption\": 1,\n" +
                                   "  \"solution\": \"A highly simplified, easy-to-read step-by-step calculation breakdown\"\n" +
                                   "}\n" +
                                   "Note: correctOption must be a pure integer number representing the correct choice: 1, 2, 3, or 4."
            }
        });

        // Parse the raw text from Gemini into a real code object and ship it to the phone app
        const questionPackage = JSON.parse(response.text.trim());
        res.json(questionPackage);

    } catch (error) {
        console.error("Quiz Generator Error:", error);
        res.status(500).json({ error: "Failed to generate new question. Try hitting refresh!" });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server handling infinite multi-subject quizzes running on port ${PORT}`);
});
