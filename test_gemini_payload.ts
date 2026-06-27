import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

async function main() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const apiKey = envFile.split('\n').find(l => l.startsWith('VITE_GEMINI_API_KEY'))?.split('=')[1]?.trim() || '';
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  
  try {
    console.log("Sending request...");
    const res = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: "Read my last 15 emails" }] },
        { role: 'model', parts: [{ functionCall: { name: 'read_gmail', args: { query: 'is:unread' } } }] },
        { 
          role: 'function', 
          parts: [{
            functionResponse: { 
              name: 'read_gmail', 
              response: { 
                result: { 
                  emails: Array(15).fill({
                    id: '123', threadId: '456', snippet: 'A long snippet of text... '.repeat(10),
                    subject: 'Hello', from: 'test@example.com', date: 'Mon, 27 Jun 2026', labelIds: ['INBOX']
                  })
                },
                message: 'Fetched 15 emails'
              } 
            }
          }] 
        }
      ]
    });
    console.log("Success!", res.response.text());
  } catch (err: any) {
    console.error("ERROR:");
    console.error(err.message);
    if (err.response) {
       console.error("Response:", err.response);
    }
  }
}
main();
