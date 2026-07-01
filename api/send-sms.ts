/**
 * api/send-sms.ts (security hardened)
 *
 * Sends a Twilio SMS notification for a specific task alert.
 * Called by:
 *   - The AI agent fleet (via send_notification tool) for CRITICAL task alerts
 *   - The frontend panic mode / SecuritySettingsModal for test SMS
 *
 * Body: { message, taskName?, priority?, dueDate? }
 *
 * SEC-FIX (CRIT-5): Auth now uses Firebase ID Token (Bearer) instead of
 * VITE_INTERNAL_SECRET which was exposed in the browser bundle.
 *
 * SEC-FIX (HIGH-4): `toPhone` is NEVER accepted from the request body.
 * The destination phone number is always read from the caller's Firestore
 * user_profiles document, keyed by their verified Firebase UID.
 * This prevents billing fraud (sending SMS to arbitrary numbers).
 *
 * CRON JOBS: Cron jobs (cron-watchdog.js, cron-classes.js) use the
 * Firebase Admin SDK directly to send FCM pushes — they do NOT call this
 * endpoint, so CRON_SECRET is not needed here.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import twilio from 'twilio';
import admin from 'firebase-admin';

// ── Firebase Admin Init (singleton) ──────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err: any) {
    console.error('[send-sms] Failed to initialize Firebase Admin:', err.message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  const origin = req.headers['origin'] || '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://myzentrack.vercel.app')
    .split(',').map((o: string) => o.trim());
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // ── SEC-FIX (CRIT-5): Firebase ID Token auth ───────────────────────────────
  // The old X-Internal-Secret / VITE_INTERNAL_SECRET was baked into the JS
  // bundle and visible to anyone in DevTools. Firebase ID tokens are short-lived
  // (1h), user-scoped, and verified cryptographically by Firebase Admin SDK.
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Firebase ID token required' });
  }

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(authHeader.replace('Bearer ', ''));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired Firebase token' });
  }

  const uid = decodedToken.uid;

  // ── SEC-FIX (HIGH-4): Always read phone from Firestore, never from body ────
  // Accepting toPhone from the request body would allow the caller to target
  // any phone number in the world, running up the Twilio bill.
  let targetPhone: string | undefined;
  try {
    const db = admin.firestore();
    const profileSnap = await db.collection('user_profiles').doc(uid).get();
    targetPhone = profileSnap.data()?.phoneNumber
      || profileSnap.data()?.phone
      || process.env.MY_PERSONAL_PHONE_NUMBER;
  } catch (e: any) {
    console.warn('[send-sms] Failed to read user profile, falling back to default phone:', e.message);
    targetPhone = process.env.MY_PERSONAL_PHONE_NUMBER;
  }

  if (!targetPhone) {
    return res.status(400).json({ error: 'No phone number on file for this account. Save a phone number in Settings first.' });
  }

  try {
    const { message, taskName, priority, dueDate } = req.body || {};

    if (!message && !taskName) {
      return res.status(400).json({ error: 'Either message or taskName is required' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn('[send-sms] Missing Twilio credentials');
      return res.status(500).json({ error: 'Twilio not configured' });
    }

    // Build formatted message if task details are provided
    let smsBody = message;
    if (taskName && !message) {
      const priorityLabel = (priority || 'medium').toUpperCase();
      smsBody = [
        `ZenTrack Alert`,
        ``,
        `Task: "${taskName}"`,
        `Priority: ${priorityLabel}`,
        dueDate ? `Due: ${dueDate}` : '',
        ``,
        `Open ZenTrack: myzentrack.vercel.app`,
      ].filter((line: string | null | undefined) => line !== null && line !== undefined).join('\n');
    }

    const client = twilio(accountSid, authToken);
    const response = await client.messages.create({
      body: smsBody,
      from: fromNumber,
      to: targetPhone,
    });

    console.log(`[send-sms] Sent to uid=${uid} — SID: ${response.sid}`);
    return res.status(200).json({ success: true, sid: response.sid });

  } catch (error: any) {
    console.error('[send-sms] Error:', error);
    return res.status(500).json({ error: 'Failed to send SMS', details: error.message });
  }
}
