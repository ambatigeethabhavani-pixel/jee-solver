import { Worker } from 'bullmq';
import { GoogleGenAI } from '@google/genai';
import IORedis from 'ioredis';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const worker = new Worker('jee-processing', async (job) => {
  const { imageBase64, subject } = job.data;
  
  const structuredPrompt = `You are an elite IIT-JEE professor. Analyze this scanned ${subject} problem image. 
  Provide a highly structured response containing:
  1. Core Concept & Topic Identify
  2. Step-by-Step Mathematical Derivation
  3. Final Numerical Answer or Option Clearly Highlighted.
  Format your entire output using clean markdown.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg'
        }
      },
      structuredPrompt
    ]
  });

  return { solution: response.text };
}, { connection });

console.log('Worker is listening for jobs...');
