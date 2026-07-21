import express from 'express';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('[Guardian] Firebase Admin init failed:', err.message);
  }
}

const db = admin.firestore();

// The system prompt that gives Sara her proactive personality
const GUARDIAN_PROMPT = `You are Sara, a highly intelligent and proactive personal assistant.
You are evaluating a user's current status (tasks, habits, etc.) to determine if they need a push notification nudge right now.

RULES:
1. You must ONLY nudge if something is critical (e.g., an overdue high-priority task, a habit streak about to break, or a class they are skipping).
2. DO NOT spam. If they are doing fine, do not nudge.
3. Keep the notification short, witty, and actionable (max 150 chars). No emojis unless appropriate.
4. Output your decision as JSON:
{
  "shouldNudge": true/false,
  "title": "Notification Title (if nudging)",
  "body": "Notification Body (if nudging)"
}`;

async function callGemini(prompt, data) {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: GUARDIAN_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `User Data:\n${JSON.stringify(data, null, 2)}\n\nAnalyze and decide if a nudge is needed.` }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const json = await res.json();
    return JSON.parse(json.candidates[0].content.parts[0].text);
  } catch (e) {
    console.error('[Guardian] Gemini error:', e.message);
    return null;
  }
}

async function sendExpoPush(token, title, body) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data: { route: 'Sara' }, // Opens Sara chat when tapped
      }),
    });
    console.log(`[Guardian] Push sent: ${title}`);
  } catch (e) {
    console.error('[Guardian] Push error:', e.message);
  }
}

const router = express.Router();
router.all('/', async (req, res) => {
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && req.headers['authorization'] !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const usersSnap = await db.collection('users').get();
    let nudgesSent = 0;

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      if (!userData.pushToken) continue; // No Expo push token registered

      // Fetch their state
      const uid = userDoc.id;
      const nowStr = new Date().toISOString().slice(0, 10);
      
      const [tasksSnap, habitsSnap, habitLogsSnap] = await Promise.all([
        db.collection('tasks').where('userId', '==', uid).where('completed', '==', false).get(),
        db.collection('habits').where('userId', '==', uid).get(),
        db.collection('habitLogs').where('userId', '==', uid).where('date', '==', nowStr).get(),
      ]);

      const tasks = tasksSnap.docs.map(d => d.data());
      const habits = habitsSnap.docs.map(d => d.data());
      const habitLogIds = new Set(habitLogsSnap.docs.map(d => d.data().habitId));

      const unloggedHabits = habits.filter(h => !habitLogIds.has(h.id));

      const aiDecision = await callGemini(GUARDIAN_PROMPT, {
        currentTime: new Date().toISOString(),
        pendingTasks: tasks,
        unloggedHabits: unloggedHabits
      });

      if (aiDecision && aiDecision.shouldNudge) {
        await sendExpoPush(userData.pushToken, aiDecision.title, aiDecision.body);
        nudgesSent++;
      }
    }

    return res.status(200).json({ success: true, nudgesSent });
  } catch (err) {
    console.error('[Guardian] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}


export default router;
