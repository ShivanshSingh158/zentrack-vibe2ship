/**
 * Vercel Serverless Function: /api/fetch-job
 *
 * Fetches a job posting URL server-side (bypasses CORS) and returns clean plain text.
 * Security hardened: blocks private/internal IPs (SSRF protection).
 * Compatibility hardened: uses AbortController instead of AbortSignal.timeout
 * which requires Node 18.17+ and may not be available on all Vercel runtimes.
 */

// Rotate user agents to avoid bot detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// ── Rate Limiting ────────────────────────────────────────────────────────────
// Per-IP: max 20 requests per 60 seconds (instance-level, Vercel serverless)
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => t > windowStart);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  // Cleanup old IPs to prevent memory leak in long-lived instances
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) {
      if (v[v.length - 1] < windowStart) rateLimitMap.delete(k);
    }
  }
  return timestamps.length > RATE_LIMIT_MAX;
}


/** Create an AbortSignal that times out after `ms` milliseconds.
 *  Compatible with all Node.js versions (no AbortSignal.timeout required). */
function createTimeoutSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Returns true if the hostname resolves to a private/loopback/internal range.
 * This is a best-effort hostname-level check (DNS rebinding is still possible
 * server-side but this blocks the obvious SSRF vectors).
 */
function isPrivateHost(hostname) {
  // Loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  // Unspecified
  if (hostname === '0.0.0.0' || hostname === '::') return true;
  // Link-local (AWS metadata service: 169.254.169.254)
  if (hostname.startsWith('169.254.')) return true;
  // Private IPv4 ranges
  if (hostname.startsWith('10.')) return true;
  if (hostname.startsWith('192.168.')) return true;
  // 172.16.0.0/12 → 172.16.x.x – 172.31.x.x
  const parts = hostname.split('.');
  if (parts.length === 4 && parts[0] === '172') {
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 private / link-local
  if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) return true;
  // Internal TLDs
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return true;
  return false;
}

export default async function handler(req, res) {
  // ── Rate limiting ─────────────────────────────────────────────────────────
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment before trying again.' });
  }

  // Allow only same-origin in production; '*' is acceptable for Vercel preview URLs
  const origin = req.headers['origin'] || '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const corsOrigin =
    allowedOrigins.length > 0 && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] || '*';

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url in request body' });
  }

  // Validate URL structure
  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs are supported' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL provided. Please check and try again.' });
  }

  // Block private/internal hosts (SSRF protection)
  if (isPrivateHost(parsed.hostname)) {
    return res.status(400).json({ error: 'This URL is not allowed.' });
  }

  const baseHeaders = {
    'User-Agent':       randomUA(),
    'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':  'en-US,en;q=0.9',
    'Accept-Encoding':  'gzip, deflate, br',
    'Cache-Control':    'no-cache',
  };

  // ── Attempt 1: Direct fetch ─────────────────────────────────────────────────
  let html = '';
  let fetchSuccess = false;

  try {
    const response = await fetch(url, {
      headers: baseHeaders,
      signal:   createTimeoutSignal(12000),
      redirect: 'follow',
    });
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return res.status(422).json({
          error: 'This URL doesn\'t point to a webpage. Please paste the job description text directly.',
        });
      }
      html = await response.text();
      fetchSuccess = html.length > 500;
    }
  } catch (err) {
    console.warn('[fetch-job] Direct fetch failed:', err.message);
  }

  // ── Attempt 2: Retry with Referer header ────────────────────────────────────
  if (!fetchSuccess) {
    try {
      const resp2 = await fetch(url, {
        headers: {
          ...baseHeaders,
          'User-Agent': USER_AGENTS[1], // Safari UA
          'Referer':    'https://www.google.com/',
        },
        signal:   createTimeoutSignal(10000),
        redirect: 'follow',
      });
      if (resp2.ok) {
        html = await resp2.text();
        fetchSuccess = html.length > 500;
      }
    } catch (err) {
      console.warn('[fetch-job] Retry fetch failed:', err.message);
    }
  }

  if (!fetchSuccess || !html) {
    return res.status(502).json({
      error:
        'Could not load this job page (the site may require login or block bots). ' +
        'Please copy-paste the job description text directly into the box.',
    });
  }

  // ── Extract clean text ─────────────────────────────────────────────────────
  const text = htmlToText(html);

  if (text.length < 150) {
    return res.status(422).json({
      error: 'The page content was too short or blocked. Please paste the job description text directly.',
    });
  }

  return res.status(200).json({
    text:      text.slice(0, 12000), // Cap at 12k chars to stay within AI token limits
    charCount: text.length,
  });
}

/**
 * Convert HTML to clean plain text.
 * Aggressively removes noise (scripts, nav, footer, ads) and preserves structure.
 */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(nav|header|footer|aside|form|iframe|svg|canvas|figure)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(hr)\s*\/?>/, '\n---\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&[a-z]{2,8};/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
