import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error('[auth/google] Failed to initialize Firebase Admin:', err);
  }
}

const db = admin.firestore();

export default async function handler(req: any, res: any) {
  // CORS
  const origin = req.headers['origin'] || '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,https://myzentrack.vercel.app')
    .split(',').map((o: string) => o.trim()).filter(Boolean);

  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, idToken } = req.body;
  if (!code || !idToken) {
    return res.status(400).json({ error: 'Missing code or idToken' });
  }

  let uid;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (e) {
    console.error('Invalid ID Token', e);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client_id = process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    console.error('Missing Google OAuth environment variables');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id,
        client_secret,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code'
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Google OAuth Exchange Error:', data);
      return res.status(400).json({ error: data.error, details: data.error_description });
    }

    // Securely save the refresh_token (only provided on first login or if prompt=consent)
    if (data.refresh_token) {
      await db.collection('users').doc(uid).set({
        googleRefreshToken: data.refresh_token
      }, { merge: true });
    }

    return res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in
    });

  } catch (err) {
    console.error('Failed to exchange code:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
