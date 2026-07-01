/**
 * api/daily-briefing.ts
 *
 * ZenTrack — Daily Morning Briefing (email summary).
 *
 * NOTE: This endpoint is a scaffold for future email briefing functionality.
 * It is NOT currently wired into the cron workflow.
 *
 * Dependencies intentionally minimal — no @sendgrid/mail import so that
 * the package does not need to be installed in the project.
 * When email sending is needed, use the Resend API (free tier, no SDK needed)
 * or add @sendgrid/mail to package.json first.
 *
 * Auth: CRON_SECRET in Authorization header (server-to-server only).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

// ── Firebase Admin Init (singleton) ──────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err: any) {
    console.error('[daily-briefing] Firebase Admin init failed:', err.message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ── Config check ──────────────────────────────────────────────────────────
    // Daily briefing requires email config — skip gracefully if not set up.
    const toEmail = process.env.MY_PERSONAL_EMAIL;
    const geminiKeys = process.env.GEMINI_API_KEYS; // server-side keys pool

    if (!toEmail || !geminiKeys) {
      console.warn('[daily-briefing] MY_PERSONAL_EMAIL or GEMINI_API_KEYS not set. Skipping.');
      return res.status(200).json({ skipped: true, reason: 'Email or Gemini not configured' });
    }

    // ── Generate briefing content via Gemini proxy pattern ────────────────────
    // Use first available key from the server-side pool
    const apiKey = (geminiKeys.split(',')[0] || '').trim();
    if (!apiKey) {
      return res.status(500).json({ error: 'No Gemini API keys available' });
    }

    // Fetch today's summary data from Firestore
    const db = admin.firestore();
    const today = new Date().toISOString().split('T')[0];

    // Get all users with FCM tokens (active users)
    const usersSnap = await db.collection('fcm_tokens').limit(1).get();
    if (usersSnap.empty) {
      return res.status(200).json({ skipped: true, reason: 'No active users' });
    }

    // Call Gemini directly (server-side — key never leaves server)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `Generate a short, motivational daily briefing summary for ${today}. Keep it under 100 words. Be concise and uplifting.` }]
          }]
        }),
      }
    );

    if (!geminiRes.ok) {
      console.warn('[daily-briefing] Gemini call failed:', geminiRes.status);
      return res.status(200).json({ skipped: true, reason: 'Gemini unavailable' });
    }

    const geminiData = await geminiRes.json();
    const briefingText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'Have a great day!';

    // ── TODO: Send via Resend/SendGrid when email is configured ──────────────
    // Example with Resend (free, no SDK needed):
    // await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ from: 'ZenTrack <noreply@yourdomain.com>', to: toEmail, subject: 'Daily Briefing', html: `<p>${briefingText}</p>` })
    // });

    console.log('[daily-briefing] Briefing generated (email send not yet configured).');
    return res.status(200).json({ success: true, preview: briefingText.slice(0, 100) });

  } catch (error: any) {
    console.error('[daily-briefing] Error:', error);
    return res.status(500).json({ error: 'Failed to process daily briefing', details: error.message });
  }
}
