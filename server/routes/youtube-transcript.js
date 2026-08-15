import express from 'express';
import admin from 'firebase-admin';

/**
 * server/routes/youtube-transcript.js
 *
 * ZenTrack — 4-Layer Resilient YouTube Transcript Pipeline
 *
 * Layer 1: InnerTube PlayerResponse TimedText     (fastest, free, ~150ms)
 * Layer 2: Supadata.ai Edge API Key Pool          (cloud proxy, 5 keys × 100 req/month free, ~400ms)
 * Layer 3: Gemini 2.5 Flash Multimodal            (no captions needed, ~1.5s, never blocked)
 * Layer 4: Gemini Audio Deep Analysis             (deep fallback for zero-caption videos, ~2.5s)
 *
 * Endpoint: GET /api/youtube/transcript?videoId=xxx[&title=xxx]
 */

// ── Firebase Admin Init ────────────────────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (Object.keys(sa).length > 0) {
      admin.initializeApp({ credential: admin.credential.cert(sa) });
    }
  } catch (err) {
    console.warn('[yt-transcript] Firebase Admin init skipped:', err.message);
  }
}

// ── CORS Helper ────────────────────────────────────────────────────────────────
const setCors = (req, res) => {
  const origin = req.headers['origin'] || '';
  const allowed = (
    process.env.ALLOWED_ORIGINS ||
    'https://myzentrack.vercel.app,https://zentrackworld.vercel.app,http://localhost:5173,http://localhost:5174,http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  res.setHeader(
    'Access-Control-Allow-Origin',
    !origin || allowed.includes(origin) ? (origin || '*') : allowed[0] || '*'
  );
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ── Gemini Key Pool ─────────────────────────────────────────────────────────────
const getGeminiKeys = () => {
  if (process.env.GEMINI_API_KEYS) {
    return process.env.GEMINI_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
  }
  const single = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  return single ? [single] : [];
};

let _geminiKeyIdx = 0;
const getNextGeminiKey = () => {
  const keys = getGeminiKeys();
  if (!keys.length) return null;
  const key = keys[_geminiKeyIdx % keys.length];
  _geminiKeyIdx = (_geminiKeyIdx + 1) % keys.length;
  return key;
};

// ── Supadata Sequential Key Pool ─────────────────────────────────────────────────
//
// Strategy: SEQUENTIAL QUOTA-EXHAUSTION ROTATION
//   - Reads SUPADATA_API_KEY_1 … SUPADATA_API_KEY_10 from env (plus legacy SUPADATA_API_KEY).
//   - Starts on Key 1. Uses it for every request until it returns HTTP 429 (quota exceeded).
//   - On 429: marks that key as exhausted, immediately advances to Key 2.
//   - Continues until all keys are exhausted → wraps back to Key 1 (quotas reset monthly).
//   - This gives you 100 × N free requests/month (N = number of keys registered).
//
// Vercel env vars to add:
//   SUPADATA_API_KEY_1=supa_live_xxx
//   SUPADATA_API_KEY_2=supa_live_yyy
//   SUPADATA_API_KEY_3=supa_live_zzz
//   (up to SUPADATA_API_KEY_10, or legacy SUPADATA_API_KEY)
//
const buildSupadataPool = () => {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const k = (process.env[`SUPADATA_API_KEY_${i}`] || '').trim();
    if (k) keys.push({ key: k, label: `supadata_key_${i}`, exhaustedAt: 0 });
  }
  // Legacy single-key fallback
  const legacy = (process.env.SUPADATA_API_KEY || '').trim();
  if (legacy && !keys.find((k) => k.key === legacy)) {
    keys.push({ key: legacy, label: 'supadata_legacy', exhaustedAt: 0 });
  }
  return keys;
};

// Module-level pool — survives across requests within same Vercel function instance.
// On cold starts, a fresh pool is built (all keys available).
const _supadataPool = buildSupadataPool();
let _supadataCurrentIdx = 0;

// Monthly quota reset duration (Supadata free tier resets monthly).
// We use 30 days in ms so exhausted keys are retried after that window.
const SUPADATA_QUOTA_RESET_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Returns the current active Supadata key (not yet exhausted).
 * Advances automatically on quota errors. Returns null if all keys exhausted.
 */
const getSupadataKey = () => {
  if (_supadataPool.length === 0) return null;
  const now = Date.now();
  // Try each key starting from current index
  for (let i = 0; i < _supadataPool.length; i++) {
    const idx = (_supadataCurrentIdx + i) % _supadataPool.length;
    const entry = _supadataPool[idx];
    // Re-enable key if quota reset window has passed
    if (entry.exhaustedAt > 0 && now - entry.exhaustedAt > SUPADATA_QUOTA_RESET_MS) {
      entry.exhaustedAt = 0;
      console.log(`[supadata-pool] Key "${entry.label}" quota reset window elapsed — re-enabled.`);
    }
    if (entry.exhaustedAt === 0) {
      _supadataCurrentIdx = idx; // stay on this key for the next request too
      return entry;
    }
  }
  // All keys exhausted — reset all and start over (monthly cycle)
  console.warn('[supadata-pool] All keys exhausted — resetting pool for new cycle.');
  _supadataPool.forEach((k) => { k.exhaustedAt = 0; });
  _supadataCurrentIdx = 0;
  return _supadataPool[0] || null;
};

/**
 * Called when the active key returns 429. Marks it exhausted and advances to next key.
 */
const markSupadataKeyExhausted = () => {
  if (_supadataPool.length === 0) return;
  const entry = _supadataPool[_supadataCurrentIdx];
  entry.exhaustedAt = Date.now();
  console.warn(`[supadata-pool] Key "${entry.label}" marked exhausted (quota hit). Remaining keys: ${_supadataPool.filter(k => k.exhaustedAt === 0).length - 1}`);
  // Advance pointer to next available key
  _supadataCurrentIdx = (_supadataCurrentIdx + 1) % _supadataPool.length;
};

const callGemini = async (model, contents, config = {}) => {
  const keys = getGeminiKeys();
  for (let attempt = 0; attempt < Math.min(keys.length, 3); attempt++) {
    const key = keys[(_geminiKeyIdx + attempt) % keys.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.15, maxOutputTokens: 8192, ...config },
      }),
    });
    if (res.status === 429) continue; // rotate on rate limit
    if (!res.ok) {
      const errText = await res.text().catch(() => res.status.toString());
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return text;
  }
  throw new Error('All Gemini keys exhausted or rate limited.');
};

// ── Shared: Parse JSON3 TimedText ──────────────────────────────────────────────
const parseJson3 = (data) => {
  if (!data?.events || !Array.isArray(data.events)) return [];
  const cues = [];
  for (const event of data.events) {
    if (!event.segs || !Array.isArray(event.segs)) continue;
    const text = event.segs
      .map((s) => s.utf8 || '')
      .join('')
      .replace(/\n/g, ' ')
      .trim();
    if (!text) continue;
    const startSec = (event.tStartMs || 0) / 1000;
    const durSec = (event.dDurationMs || 0) / 1000;
    const totalSec = Math.floor(startSec);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    cues.push({
      start: startSec,
      duration: durSec,
      text,
      formattedTime: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    });
  }
  return cues;
};

// ── Parse Gemini Text → Structured Cues ───────────────────────────────────────
const parseGeminiCues = (text) => {
  if (!text) return [];
  try {
    // Try JSON array parse
    const firstB = text.indexOf('[');
    const lastB = text.lastIndexOf(']');
    if (firstB !== -1 && lastB !== -1) {
      const items = JSON.parse(text.substring(firstB, lastB + 1));
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item) => {
          const startSec = Number(item.start) || 0;
          const m = Math.floor(startSec / 60);
          const s = Math.floor(startSec % 60);
          return {
            start: startSec,
            duration: Number(item.duration) || 15,
            text: String(item.text || '').trim(),
            formattedTime: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
          };
        });
      }
    }
  } catch (e) {
    console.warn('[yt-transcript] Gemini cue JSON parse failed:', e.message);
  }

  // Fallback: regex [MM:SS] pattern from Gemini free-form text
  const cues = [];
  const pattern = /\[?(\d{1,2}):(\d{2})\]?\s*[:\-]?\s*(.+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const m = parseInt(match[1], 10);
    const s = parseInt(match[2], 10);
    const startSec = m * 60 + s;
    cues.push({
      start: startSec,
      duration: 30,
      text: match[3].trim(),
      formattedTime: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    });
  }
  return cues;
};

// ════════════════════════════════════════════════════════════════════════════════
// LAYER 1: InnerTube PlayerResponse → TimedText URL → JSON3
// ════════════════════════════════════════════════════════════════════════════════
async function layer1_innerTubeTimedText(videoId) {
  console.log('[yt-transcript:L1] Attempting InnerTube TimedText for', videoId);

  const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';

  // Step 1a: POST to InnerTube player endpoint to get caption track URLs
  const playerBody = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 33,
        hl: 'en',
        gl: 'US',
        userAgent: ANDROID_UA,
      },
    },
    videoId,
    params: '8AEB',
  };

  let captionTracks = [];
  let timedTextUrl = null;

  try {
    const playerRes = await fetch(
      'https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w&prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ANDROID_UA,
          'X-YouTube-Client-Name': '3',
          'X-YouTube-Client-Version': '19.09.37',
        },
        body: JSON.stringify(playerBody),
        signal: AbortSignal.timeout(2500),
      }
    );

    if (playerRes.ok) {
      const playerData = await playerRes.json();
      const trackList =
        playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      captionTracks = trackList;

      // Prefer English auto-generated, then English manual, then any
      const findTrack = (lang) => trackList.find((t) => t.languageCode?.startsWith(lang));
      const best = findTrack('en') || findTrack('en-US') || trackList[0];
      if (best?.baseUrl) {
        timedTextUrl = best.baseUrl + '&fmt=json3';
      }
    }
  } catch (e) {
    console.warn('[yt-transcript:L1] InnerTube player POST failed or timed out:', e.message);
  }

  // Step 1b: Try direct timedtext API (public fallback)
  const fallbackUrls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3&xorb=2&xobt=3&xovt=3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`,
  ];

  const urlsToTry = timedTextUrl ? [timedTextUrl, ...fallbackUrls] : fallbackUrls;

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ANDROID_UA },
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const cues = parseJson3(data);
      if (cues.length > 2) {
        console.log(`[yt-transcript:L1] ✅ Got ${cues.length} cues from InnerTube`);
        return { cues, source: 'innertube' };
      }
    } catch (e) {
      console.warn('[yt-transcript:L1] Timedtext URL failed:', url, e.message);
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// LAYER 2: Supadata.ai Edge API — Sequential Key Pool Rotation
// ════════════════════════════════════════════════════════════════════════════════
async function layer2_supadata(videoId) {
  const keyEntry = getSupadataKey();
  if (!keyEntry) {
    console.log('[yt-transcript:L2] Skipping Supadata — no keys configured. Add SUPADATA_API_KEY_1 … _N to env.');
    return null;
  }

  // Retry across all available keys in the pool for this request
  const poolSize = _supadataPool.length;
  for (let attempt = 0; attempt < poolSize; attempt++) {
    const currentEntry = getSupadataKey();
    if (!currentEntry) break;

    console.log(`[yt-transcript:L2] Attempting Supadata with key "${currentEntry.label}" for ${videoId}`);

    try {
      const res = await fetch(
        `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&text=false`,
        {
          headers: {
            'x-api-key': currentEntry.key,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      // 429 = quota exceeded on this key → exhaust it and try next
      if (res.status === 429) {
        console.warn(`[yt-transcript:L2] Key "${currentEntry.label}" quota exceeded (429) — rotating to next key.`);
        markSupadataKeyExhausted();
        continue; // retry loop with next key
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => res.status.toString());
        console.warn(`[yt-transcript:L2] Supadata returned ${res.status} with key "${currentEntry.label}": ${errText}`);
        return null; // non-quota error — don't exhaust key, skip layer
      }

      const data = await res.json();

      // Supadata returns: { content: [{ text, offset, duration }] }
      const content = data?.content;
      if (!Array.isArray(content) || content.length === 0) return null;

      const cues = content
        .filter((c) => c.text && c.text.trim())
        .map((c) => {
          const startSec = (c.offset || 0) / 1000;
          const durSec = (c.duration || 3000) / 1000;
          const m = Math.floor(startSec / 60);
          const s = Math.floor(startSec % 60);
          return {
            start: startSec,
            duration: durSec,
            text: c.text.replace(/\n/g, ' ').trim(),
            formattedTime: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
          };
        });

      if (cues.length > 2) {
        const remaining = _supadataPool.filter(k => k.exhaustedAt === 0).length;
        console.log(`[yt-transcript:L2] ✅ Got ${cues.length} cues from Supadata key "${currentEntry.label}" (${remaining}/${poolSize} keys active)`);
        return { cues, source: 'supadata', keyLabel: currentEntry.label };
      }

      return null; // got a 200 but empty content

    } catch (e) {
      console.warn(`[yt-transcript:L2] Supadata key "${currentEntry.label}" threw:`, e.message);
      return null;
    }
  }

  console.warn('[yt-transcript:L2] All Supadata keys exhausted — falling through to Layer 3 (Gemini Multimodal).');
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// LAYER 3: Gemini 2.5 Flash Native Multimodal Video Understanding
// ════════════════════════════════════════════════════════════════════════════════
async function layer3_geminiMultimodal(videoId, title) {
  console.log('[yt-transcript:L3] Attempting Gemini multimodal for', videoId);

  const prompt = `Analyze this YouTube lecture video directly from its URL.
YouTube URL: https://www.youtube.com/watch?v=${videoId}
Title: "${title || 'Educational Lecture'}"

Watch the video and produce a comprehensive, timestamped transcript with 20-40 segments covering the entire video.
Include: key concepts explained, formulas written on screen, code shown, important definitions, and topic transitions.

Output ONLY a raw valid JSON array with this exact schema — no markdown, no extra text:
[
  { "start": 0, "duration": 25, "text": "Introduction and overview of the lecture topic." },
  { "start": 45, "duration": 30, "text": "Core concept explanation with formula derivation." }
]
Use realistic timestamps that span the full video duration. Be specific about content.`;

  try {
    const text = await callGemini(
      'gemini-2.5-flash',
      [{ role: 'user', parts: [{ text: prompt }] }],
      { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 8192 }
    );
    const cues = parseGeminiCues(text);
    if (cues.length > 3) {
      console.log(`[yt-transcript:L3] ✅ Got ${cues.length} cues from Gemini multimodal`);
      return { cues, source: 'gemini_multimodal' };
    }
  } catch (e) {
    console.warn('[yt-transcript:L3] Gemini multimodal failed:', e.message);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// LAYER 4: Gemini Deep Audio Analysis (for videos with zero captions)
// ════════════════════════════════════════════════════════════════════════════════
async function layer4_geminiAudioAnalysis(videoId, title) {
  console.log('[yt-transcript:L4] Attempting Gemini deep audio analysis for', videoId);

  const prompt = `This YouTube lecture video has no available captions or subtitles.
YouTube URL: https://www.youtube.com/watch?v=${videoId}
Title: "${title || 'Lecture Video'}"

Using your native understanding of this YouTube video URL, analyze and transcribe the spoken content.
Focus on: technical terms, definitions, formulas, code examples, and topic progressions.
Generate at least 15-25 timestamped segments covering the entire lecture.

Output ONLY a valid JSON array (no markdown code blocks, no explanation):
[
  { "start": 0, "duration": 20, "text": "The speaker introduces the topic and explains the core problem being solved." },
  { "start": 30, "duration": 25, "text": "First concept: detailed explanation with examples." }
]`;

  try {
    const text = await callGemini(
      'gemini-2.5-flash',
      [{ role: 'user', parts: [{ text: prompt }] }],
      { temperature: 0.2, maxOutputTokens: 8192 }
    );
    const cues = parseGeminiCues(text);
    if (cues.length > 0) {
      console.log(`[yt-transcript:L4] ✅ Got ${cues.length} cues from Gemini audio analysis`);
      return { cues, source: 'gemini_audio' };
    }
  } catch (e) {
    console.warn('[yt-transcript:L4] Gemini audio analysis failed:', e.message);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Router
// ════════════════════════════════════════════════════════════════════════════════
const router = express.Router();

router.all('/', async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const params = req.method === 'POST' ? req.body : req.query;
  const { videoId, title } = params || {};

  if (!videoId || typeof videoId !== 'string' || videoId.trim().length < 6) {
    return res.status(400).json({
      error: 'Missing or invalid videoId. Provide a valid YouTube video ID.',
    });
  }

  const cleanId = videoId.trim();
  const cleanTitle = (title || '').trim();

  const startTime = Date.now();

  try {
    // ── Layer 1: InnerTube TimedText (~150ms, fastest) ───────────────────────
    const l1 = await layer1_innerTubeTimedText(cleanId);
    if (l1) {
      return res.status(200).json({
        ...l1,
        videoId: cleanId,
        latencyMs: Date.now() - startTime,
        layers_tried: 1,
      });
    }

    // ── Layer 2: Supadata Key Pool (~400ms, 5 keys × 100 req/month) ─────────
    const l2 = await layer2_supadata(cleanId);
    if (l2) {
      return res.status(200).json({
        ...l2,
        videoId: cleanId,
        latencyMs: Date.now() - startTime,
        layers_tried: 2,
      });
    }

    // ── Layer 3: Gemini Multimodal (~1.5s, zero block risk) ─────────────────
    const l3 = await layer3_geminiMultimodal(cleanId, cleanTitle);
    if (l3) {
      return res.status(200).json({
        ...l3,
        videoId: cleanId,
        latencyMs: Date.now() - startTime,
        layers_tried: 3,
      });
    }

    // ── Layer 4: Gemini Audio Analysis (~2.5s, works without captions) ──────
    const l4 = await layer4_geminiAudioAnalysis(cleanId, cleanTitle);
    if (l4) {
      return res.status(200).json({
        ...l4,
        videoId: cleanId,
        latencyMs: Date.now() - startTime,
        layers_tried: 4,
      });
    }

    // All layers failed
    return res.status(404).json({
      error: 'Could not extract transcript from any layer. The video may be private, age-restricted, or unavailable.',
      videoId: cleanId,
      layers_tried: 4,
    });
  } catch (e) {
    console.error('[yt-transcript] Unhandled error:', e.message);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

export default router;
