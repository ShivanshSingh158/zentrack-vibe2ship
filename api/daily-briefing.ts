import type { VercelRequest, VercelResponse } from '@vercel/node';
import sgMail from '@sendgrid/mail';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Note: To use firebase-admin, you would import it and initialize it here using the service account key.
// import * as admin from 'firebase-admin';
// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!))
//   });
// }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Verify Cron secret if triggered by Vercel Cron
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sendgridKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const toEmail = process.env.MY_PERSONAL_EMAIL;
    const geminiKey = process.env.VITE_GEMINI_API_KEY;

    if (!sendgridKey || !fromEmail || !toEmail || !geminiKey) {
      console.warn('[Briefing] Missing configuration keys. Skipping daily briefing.');
      return res.status(500).json({ error: 'Missing environment variables' });
    }

    // 1. In a full implementation, fetch data from Firestore using firebase-admin
    // const db = admin.firestore();
    // const today = new Date().toISOString().split('T')[0];
    // const tasksSnap = await db.collection('tasks').where('date', '==', today).get();
    
    // For now, we will simulate the data context
    const mockContext = {
      tasks: ['Finish CS Assignment', 'Submit Math homework', 'Workout for 45 mins'],
      habits: ['Drink Water', 'Read 10 pages'],
      events: ['10:00 AM - Physics Lecture']
    };

    // 2. Generate HTML email using Gemini
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `You are the Zen Agent, an elite productivity assistant.
Generate a beautiful, modern HTML email for the user's daily morning briefing. 
Use this data for today:
Tasks: ${mockContext.tasks.join(', ')}
Habits: ${mockContext.habits.join(', ')}
Events: ${mockContext.events.join(', ')}

Make it highly aesthetic, with inline CSS, vibrant colors, and a motivational tone.
Output ONLY the raw HTML string, nothing else. No markdown formatting blocks.`;

    const result = await model.generateContent(prompt);
    let htmlContent = result.response.text();
    
    // Clean up markdown code blocks if Gemini accidentally wraps it
    htmlContent = htmlContent.replace(/^```html\n?/, '').replace(/\n?```$/, '');

    // 3. Send email using SendGrid
    sgMail.setApiKey(sendgridKey);
    const msg = {
      to: toEmail,
      from: fromEmail,
      subject: '☀️ Your Zentrack Daily Briefing',
      html: htmlContent,
    };

    await sgMail.send(msg);

    console.log('[Briefing] Daily briefing email sent successfully.');
    return res.status(200).json({ success: true, message: 'Briefing sent' });
  } catch (error: any) {
    console.error('[Briefing] Error generating/sending briefing:', error);
    return res.status(500).json({ error: 'Failed to process daily briefing', details: error.message });
  }
}
