const express = require('express');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Set up memory storage for handling incoming images safely
const upload = multer({ storage: multer.memoryStorage() });

// Initialize the Gemini API client using your environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/solve', upload.single('image'), async (req, res) => {
    try {
        const { subject } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ solution: "Error: No image file received by the server." });
        }

        // Convert the uploaded image buffer into the inlineData format Gemini expects
        const imagePart = {
            inlineData: {
                data: req.file.buffer.toString("base64"),
                mimeType: req.file.mimetype || "image/jpeg"
            },
        };

        const prompt = `You are an expert tutor specializing in JEE Advanced and Main preparation for ${subject || 'Physics'}. Solve this step-by-step with clear formulas and explanations.`;

        // Generate content using the proper gemini-2.5-flash model
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [prompt, imagePart],
        });

        res.json({ solution: response.text });
        
    } catch (error) {
        console.error(error);
        res.json({ solution: `The AI encountered an error processing this image: ${error.message}` });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
