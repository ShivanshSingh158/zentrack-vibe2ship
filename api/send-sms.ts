import type { VercelRequest, VercelResponse } from '@vercel/node';
import twilio from 'twilio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
    const myNumber = process.env.MY_PERSONAL_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioNumber || !myNumber) {
      console.warn('[Twilio] Missing API keys or phone numbers. SMS skipped.');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const client = twilio(accountSid, authToken);

    const response = await client.messages.create({
      body: message,
      from: twilioNumber,
      to: myNumber
    });

    console.log(`[Twilio] SMS sent successfully. SID: ${response.sid}`);
    return res.status(200).json({ success: true, sid: response.sid });
  } catch (error: any) {
    console.error('[Twilio] Error sending SMS:', error);
    return res.status(500).json({ error: 'Failed to send SMS', details: error.message });
  }
}
