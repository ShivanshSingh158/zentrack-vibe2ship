import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Initialize Firebase Admin for local dev so Vercel API files have credentials
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (Object.keys(serviceAccount).length > 0) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      admin.initializeApp({ projectId: 'dummy-project-id' });
    }
  } catch (err) {
    console.warn('[sarvamGateway] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON, using dummy auth.');
    admin.initializeApp({ projectId: 'dummy-project-id' });
  }
}

// Dynamically import API functions so they load after Firebase init
const geminiProxyStream = (await import('../api/gemini-proxy-stream.js')).default;
const geminiProxy = (await import('../api/gemini-proxy.js')).default;
const transcript = (await import('../api/transcript.js')).default;
const youtube = (await import('../api/youtube.js')).default;
const youtubeSearch = (await import('../api/youtube-search.js')).default;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // needed for Vercel functions

app.all('/api/gemini-proxy-stream', async (req, res) => { try { await geminiProxyStream(req, res); } catch (e) { console.error(e); res.status(500).send('Error'); } });
app.all('/api/gemini-proxy', async (req, res) => { try { await geminiProxy(req, res); } catch (e) { console.error(e); res.status(500).send('Error'); } });
app.all('/api/transcript', async (req, res) => { try { await transcript(req, res); } catch (e) { console.error(e); res.status(500).send('Error'); } });
app.all('/api/youtube', async (req, res) => { try { await youtube(req, res); } catch (e) { console.error(e); res.status(500).send('Error'); } });
app.all('/api/youtube-search', async (req, res) => { try { await youtubeSearch(req, res); } catch (e) { console.error(e); res.status(500).send('Error'); } });

app.post('/api/relay-command', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required' });

    const identityPath = path.resolve(__dirname, '../../../voice_agent_system/agent/agent_identity.json');
    if (!fs.existsSync(identityPath)) {
      return res.status(404).json({ error: 'Agent identity not found. Is the agent running?' });
    }

    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
    const { computer_id, auth_token } = identity;

    const response = await fetch('http://localhost:5000/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ computer_id, auth_token, command })
    });

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('[Gateway] Relay Error:', error);
    res.status(500).json({ error: 'Failed to communicate with relay server' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ─────────────────────────────────────────────────────────────────────────────
// ROBUST KEY ROTATION MANAGER
// Collects ALL keys from env (SARVAM_API_KEY_1, _2, _3 … or legacy single key)
// and round-robins across them. A key is only marked exhausted after receiving
// an explicit 429 response from Sarvam.  It is automatically retried after a
// configurable cooldown window.
// ─────────────────────────────────────────────────────────────────────────────

const COOLDOWN_MS = 60_000; // 1 minute cooldown after a key hits 429

function collectApiKeys() {
  const keys = [];

  // Support up to 10 numbered keys: SARVAM_API_KEY_1 … SARVAM_API_KEY_10
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`SARVAM_API_KEY_${i}`] || process.env[`VITE_SARVAM_API_KEY_${i}`];
    if (key) keys.push(key.trim());
  }

  // Fallback: legacy single-key env vars
  const legacy = process.env.VITE_SARVAM_API_KEY || process.env.SARVAM_API_KEY;
  if (legacy && !keys.includes(legacy.trim())) {
    keys.push(legacy.trim());
  }

  return keys;
}

const API_KEYS = collectApiKeys();

if (API_KEYS.length === 0) {
  console.error('[Gateway] ❌  No Sarvam API keys found. Set SARVAM_API_KEY_1, SARVAM_API_KEY_2 … in .env');
} else {
  console.log(`[Gateway] ✅  Loaded ${API_KEYS.length} Sarvam API key(s)`);
}

// Per-key state
const keyState = API_KEYS.map((key, idx) => ({
  key,
  label: `key${idx + 1}`,
  rateLimitedUntil: 0,   // epoch ms – 0 means "available now"
  requestCount: 0,
}));

let roundRobinIndex = 0;

/**
 * Returns the next available key using round-robin, skipping keys that are
 * currently in their cooldown period.
 *
 * Returns null only when every key is simultaneously rate-limited.
 */
function getNextAvailableKey() {
  const now = Date.now();
  const total = keyState.length;

  // Try every key starting from the next round-robin position
  for (let attempt = 0; attempt < total; attempt++) {
    const idx = (roundRobinIndex + attempt) % total;
    const state = keyState[idx];

    if (now >= state.rateLimitedUntil) {
      // Advance the pointer past this key so the NEXT call uses a different key
      roundRobinIndex = (idx + 1) % total;
      state.requestCount++;
      return state;
    }
  }

  // All keys are in cooldown – find which one recovers soonest
  const soonest = keyState.reduce((a, b) => (a.rateLimitedUntil < b.rateLimitedUntil ? a : b));
  const waitMs = Math.max(0, soonest.rateLimitedUntil - now);
  console.warn(`[Gateway] ⚠️  All keys are rate-limited. Next available: ${soonest.label} in ${Math.ceil(waitMs / 1000)}s`);
  return null;
}

/**
 * Marks a key as rate-limited and immediately removes it from rotation for
 * COOLDOWN_MS milliseconds.
 */
function markKeyRateLimited(keyStateEntry) {
  keyStateEntry.rateLimitedUntil = Date.now() + COOLDOWN_MS;
  console.warn(`[Gateway] 🔴  ${keyStateEntry.label} rate-limited. Cooling down for ${COOLDOWN_MS / 1000}s. Remaining available keys: ${keyState.filter(k => Date.now() >= k.rateLimitedUntil).length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TTS HELPER — retries across all available keys before giving up
// ─────────────────────────────────────────────────────────────────────────────

async function callSarvamTTS(sentence, clientWs) {
  const total = keyState.length;
  let attemptsLeft = total;

  while (attemptsLeft > 0) {
    const keyEntry = getNextAvailableKey();

    if (!keyEntry) {
      // All keys exhausted simultaneously – send error to client
      clientWs.send(JSON.stringify({ type: 'error', message: 'All Sarvam API keys are currently rate-limited. Please wait ~1 minute.' }));
      return;
    }

    console.log(`[Gateway] 🔑  Using ${keyEntry.label} for TTS (req #${keyEntry.requestCount})`);

    try {
      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': keyEntry.key,
        },
        body: JSON.stringify({
          inputs: [sentence],
          target_language_code: 'hi-IN',
          speaker: 'shubh',
          pitch: 0,
          pace: 1.1,
          loudness: 1.5,
          speech_sample_rate: 8000,
          enable_preprocessing: true,
          model: 'bulbul:v3',
        }),
      });

      if (response.status === 429) {
        markKeyRateLimited(keyEntry);
        attemptsLeft--;
        // Loop immediately to try the next available key
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Gateway] ❌  TTS HTTP ${response.status} with ${keyEntry.label}: ${errText}`);
        clientWs.send(JSON.stringify({ type: 'error', message: `Sarvam TTS error: ${response.status}` }));
        return;
      }

      const result = await response.json();
      if (result.audios && result.audios.length > 0) {
        const audioBuffer = Buffer.from(result.audios[0], 'base64');
        clientWs.send(audioBuffer);
        console.log(`[Gateway] ✅  TTS audio delivered via ${keyEntry.label}`);
      }
      return; // success – exit loop

    } catch (err) {
      console.error(`[Gateway] ❌  Network error calling Sarvam with ${keyEntry.label}:`, err.message);
      attemptsLeft--;
    }
  }

  // If we reach here every single key failed (network issues, not just rate limits)
  clientWs.send(JSON.stringify({ type: 'error', message: 'TTS failed on all available keys due to network errors.' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// STT HELPER — builds a Sarvam STT WebSocket using the best available key
// ─────────────────────────────────────────────────────────────────────────────

function buildSarvamSttWebSocket() {
  const keyEntry = getNextAvailableKey();
  if (!keyEntry) {
    console.warn('[Gateway] No available keys to open STT WebSocket');
    return null;
  }

  console.log(`[Gateway] 🔑  Opening STT WebSocket with ${keyEntry.label}`);

  const sarvamSttWs = new WebSocket('wss://api.sarvam.ai/speech-to-text-translate', {
    headers: { 'api-subscription-key': keyEntry.key },
  });

  sarvamSttWs.on('open', () => {
    console.log(`[Gateway] Connected to Sarvam STT WebSocket (${keyEntry.label})`);
    sarvamSttWs.send(JSON.stringify({
      language_code: 'hi-IN',
      model: 'saaras:v1',
      enable_preprocessing: true,
      encoding: 'webm/opus',
    }));
  });

  sarvamSttWs.on('error', (err) => {
    console.error(`[Gateway] Sarvam STT Error (${keyEntry.label}):`, err.message);
    if (err.message && err.message.includes('429')) {
      markKeyRateLimited(keyEntry);
    }
  });

  sarvamSttWs.on('close', (code, reason) => {
    console.log(`[Gateway] Sarvam STT Disconnected (${keyEntry.label}) – code ${code}`);
    if (code === 429) {
      markKeyRateLimited(keyEntry);
    }
  });

  return sarvamSttWs;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS ENDPOINT — lets the frontend or ops team inspect key health
// ─────────────────────────────────────────────────────────────────────────────

app.get('/status', (_req, res) => {
  const now = Date.now();
  res.json({
    totalKeys: keyState.length,
    keys: keyState.map(k => ({
      label: k.label,
      requestCount: k.requestCount,
      available: now >= k.rateLimitedUntil,
      cooldownRemainingSeconds: Math.max(0, Math.ceil((k.rateLimitedUntil - now) / 1000)),
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET CONNECTION HANDLER
// ─────────────────────────────────────────────────────────────────────────────

wss.on('connection', (clientWs) => {
  console.log('[Gateway] Client connected for Real-Time Voice');

  let sarvamSttWs = null;
  let ttsBuffer = '';

  if (API_KEYS.length > 0) {
    sarvamSttWs = buildSarvamSttWebSocket();

    if (sarvamSttWs) {
      sarvamSttWs.on('message', (data) => {
        try {
          const result = JSON.parse(data.toString());
          if (result && result.transcript) {
            clientWs.send(JSON.stringify({
              type: 'transcript',
              text: result.transcript,
              isFinal: !!result.is_final,
            }));
          }
        } catch (e) {
          console.error('[Gateway] Error parsing Sarvam STT response', e);
        }
      });
    }
  } else {
    console.warn('[Gateway] No Sarvam API keys – STT disabled');
  }

  clientWs.on('message', async (message) => {
    // Raw buffer → microphone audio for STT
    if (Buffer.isBuffer(message)) {
      if (sarvamSttWs && sarvamSttWs.readyState === WebSocket.OPEN) {
        sarvamSttWs.send(message);
      }
      return;
    }

    // JSON → TTS chunk
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'tts_chunk' && data.text) {
        ttsBuffer += data.text;

        // Sentence boundary detector – flush complete sentences immediately
        const boundaryMatch = ttsBuffer.match(/(.*?[.?!])\s*(.*)/s);
        if (boundaryMatch) {
          const sentence = boundaryMatch[1].trim();
          ttsBuffer = boundaryMatch[2];

          if (sentence) {
            console.log(`[Gateway] TTS sentence: "${sentence.substring(0, 60)}…"`);
            await callSarvamTTS(sentence, clientWs);
          }
        }
      }
    } catch (_e) {
      // Non-JSON message – ignore
    }
  });

  clientWs.on('close', () => {
    console.log('[Gateway] Client disconnected');
    if (sarvamSttWs) sarvamSttWs.close();
  });
});

const PORT = process.env.GATEWAY_PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Gateway] Sarvam Orchestration Server running on ws://localhost:${PORT}`);
  console.log(`[Gateway] Key status available at http://localhost:${PORT}/status`);
});
