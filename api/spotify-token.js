/**
 * Vercel Serverless Function: /api/spotify-token
 *
 * Handles Spotify OAuth token exchange and refresh.
 * Server-side so the client_secret is never exposed to the browser.
 *
 * Security hardened:
 *  - Content-Type validation (prevents CSRF-style abuse with form submissions)
 *  - CORS restricted to production domain via ALLOWED_ORIGINS env var
 */
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

// ── Rate Limiting ────────────────────────────────────────────────────────────
// Per-IP: max 30 token requests per 60 seconds
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => t > windowStart);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  if (rateLimitMap.size > 500) {
    for (const [k, v] of rateLimitMap) {
      if (v[v.length - 1] < windowStart) rateLimitMap.delete(k);
    }
  }
  return timestamps.length > RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
  // ── Rate limiting ─────────────────────────────────────────────────────────
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait before retrying.' });
  }

  // Restrict CORS to configured origins (set ALLOWED_ORIGINS in Vercel env vars,
  // comma-separated, e.g. "https://myzentrack.vercel.app,https://zentrack.app")
  const origin = req.headers['origin'] || '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const corsOrigin =
    allowedOrigins.length > 0 && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] || '*'; // fallback to * for local dev without ALLOWED_ORIGINS

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require JSON body — prevents CSRF via form submissions
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Spotify credentials not configured on server.' });
  }

  const { code, redirect_uri, refresh_token, grant_type } = req.body || {};
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let body;
  if (grant_type === 'authorization_code') {
    if (!code || !redirect_uri) {
      return res.status(400).json({ error: 'code and redirect_uri required for authorization_code grant' });
    }
    body = { grant_type: 'authorization_code', code, redirect_uri };
  } else if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token required for refresh_token grant' });
    }
    body = { grant_type: 'refresh_token', refresh_token };
  } else {
    return res.status(400).json({ error: `Invalid grant_type: "${grant_type}". Must be "authorization_code" or "refresh_token".` });
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error_description || data.error || 'Token exchange failed',
      });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error('[spotify-token] Error:', err);
    return res.status(500).json({ error: 'Internal server error during token exchange' });
  }
}
