import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || '');

async function run() {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  try {
    const result = await model.generateContent("Hello");
    console.log("Success with gemini-1.5-pro:", result.response.text());
  } catch (e) {
    console.error("Error with gemini-1.5-pro:", e.message);
  }

  const model2 = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  try {
    const result = await model2.generateContent("Hello");
    console.log("Success with gemini-1.5-flash:", result.response.text());
  } catch (e) {
    console.error("Error with gemini-1.5-flash:", e.message);
  }
}

run();
