/**
 * api/send-sms.ts (upgraded)
 *
 * Sends a Twilio SMS notification for a specific task alert.
 * Called by:
 *   - The AI agent fleet (via send_notification tool) for CRITICAL task alerts
 *   - The frontend panic mode for immediate SMS
 *
 * Body: { message, taskName?, priority?, dueDate?, toPhone? }
 *   - toPhone is optional — defaults to MY_PERSONAL_PHONE_NUMBER
 *   - If priority is provided, message is auto-formatted with priority indicator
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import twilio from 'twilio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS?.split(',')[0] || 'https://myzentrack.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Internal secret auth (same secret the agent fleet uses)
  const internalSecret = process.env.ZENTRACK_INTERNAL_SECRET;
  if (internalSecret) {
    const provided = req.headers['x-internal-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    // Allow both internal secret AND cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (provided !== internalSecret && provided !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const { message, taskName, priority, dueDate, toPhone } = req.body || {};

    if (!message && !taskName) {
      return res.status(400).json({ error: 'Either message or taskName is required' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const defaultTo  = process.env.MY_PERSONAL_PHONE_NUMBER;
    const targetPhone = toPhone || defaultTo;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn('[send-sms] Missing Twilio credentials');
      return res.status(500).json({ error: 'Twilio not configured' });
    }

    if (!targetPhone) {
      return res.status(400).json({ error: 'No destination phone number' });
    }

    // Build formatted message if task details are provided
    let smsBody = message;
    if (taskName && !message) {
      const priorityEmoji = priority === 'high' ? '🚨' : priority === 'medium' ? '⚠️' : '📌';
      const priorityLabel = (priority || 'medium').toUpperCase();
      smsBody = [
        `${priorityEmoji} ZenTrack Alert`,
        ``,
        `Task: "${taskName}"`,
        `Priority: ${priorityLabel}`,
        dueDate ? `Due: ${dueDate}` : '',
        ``,
        `Open ZenTrack: myzentrack.vercel.app`,
      ].filter(line => line !== null && line !== undefined).join('\n');
    }

    const client = twilio(accountSid, authToken);
    const response = await client.messages.create({
      body: smsBody,
      from: fromNumber,
      to: targetPhone,
    });

    console.log(`[send-sms] Sent to ${targetPhone} — SID: ${response.sid}`);
    return res.status(200).json({ success: true, sid: response.sid });

  } catch (error: any) {
    console.error('[send-sms] Error:', error);
    return res.status(500).json({ error: 'Failed to send SMS', details: error.message });
  }
}
