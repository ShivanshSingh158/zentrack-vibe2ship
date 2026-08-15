/**
 * youtubeTranscriptService.ts — ZenTrack Mobile
 *
 * 4-Layer Resilient Transcript Extractor
 *
 * Client-side flow:
 *   1. Hit /api/youtube/transcript on our backend (which internally tries 4 layers)
 *   2. If backend unavailable, try direct InnerTube TimedText fallback from the client
 *   3. If that fails, use Gemini multimodal to understand the video via callProxy
 *
 * The server-side layers (Layer 1→4) are the primary path.
 * Layers 2-3 here are mobile-only emergency fallbacks.
 */

import { callProxy, parseProxyResponse } from './geminiProxy';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface TranscriptCue {
  start: number;       // Seconds (e.g. 74.5)
  duration: number;    // Seconds
  text: string;
  formattedTime: string; // "01:14"
}

export type TranscriptSource =
  | 'server_innertube'
  | 'server_gemini_multimodal'
  | 'server_supadata'
  | 'server_gemini_audio'
  | 'client_innertube'
  | 'client_gemini_multimodal'
  | 'client_gemini_ai_summary';

export interface TranscriptResult {
  cues: TranscriptCue[];
  source: TranscriptSource;
  latencyMs?: number;
  layersTried?: number;
}

// ── Utility ────────────────────────────────────────────────────────────────────
export function formatSeconds(sec: number): string {
  const totalSec = Math.max(0, Math.floor(sec));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function makeCue(start: number, duration: number, text: string): TranscriptCue {
  return {
    start,
    duration,
    text: text.replace(/\n/g, ' ').trim(),
    formattedTime: formatSeconds(start),
  };
}

// ── Parse InnerTube JSON3 TimedText ────────────────────────────────────────────
function parseJson3Transcript(data: any): TranscriptCue[] {
  if (!data?.events || !Array.isArray(data.events)) return [];
  const cues: TranscriptCue[] = [];
  for (const event of data.events) {
    if (!event.segs || !Array.isArray(event.segs)) continue;
    const text = event.segs.map((s: any) => s.utf8 || '').join('').trim();
    if (!text || text === '\n') continue;
    const startSec = (event.tStartMs || 0) / 1000;
    const durSec = (event.dDurationMs || 0) / 1000;
    cues.push(makeCue(startSec, durSec, text));
  }
  return cues;
}

// ── Parse Gemini text → Structured Cues ───────────────────────────────────────
function parseGeminiCues(text: string): TranscriptCue[] {
  if (!text) return [];
  try {
    const firstB = text.indexOf('[');
    const lastB = text.lastIndexOf(']');
    if (firstB !== -1 && lastB !== -1) {
      const items = JSON.parse(text.substring(firstB, lastB + 1));
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item: any) =>
          makeCue(Number(item.start) || 0, Number(item.duration) || 15, String(item.text || ''))
        );
      }
    }
  } catch (_) {}
  // Regex fallback [MM:SS] pattern
  const cues: TranscriptCue[] = [];
  const pattern = /\[?(\d{1,2}):(\d{2})\]?\s*[:\-]?\s*(.+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const m = parseInt(match[1], 10);
    const s = parseInt(match[2], 10);
    cues.push(makeCue(m * 60 + s, 30, match[3].trim()));
  }
  return cues;
}

// ════════════════════════════════════════════════════════════════════════════════
// CLIENT LAYER 1 (Fallback): Direct InnerTube TimedText
// ════════════════════════════════════════════════════════════════════════════════
async function clientLayer1_innerTube(videoId: string): Promise<TranscriptCue[] | null> {
  const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';

  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': ANDROID_UA } });
      if (!res.ok) continue;
      const data = await res.json();
      const cues = parseJson3Transcript(data);
      if (cues.length > 2) return cues;
    } catch (_) {}
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// CLIENT LAYER 2 (Fallback): Gemini Multimodal via callProxy
// ════════════════════════════════════════════════════════════════════════════════
async function clientLayer2_gemini(videoId: string, videoTitle?: string): Promise<TranscriptCue[] | null> {
  const prompt = `Analyze this YouTube lecture video directly using its URL.
YouTube URL: https://www.youtube.com/watch?v=${videoId}
Title: "${videoTitle || 'Educational Lecture'}"

Watch the video and produce a comprehensive timestamped transcript with 20-35 segments.
Include: key concepts, formulas, code shown on screen, definitions, and topic transitions.

Output ONLY a raw valid JSON array (no markdown, no extra text):
[
  { "start": 0, "duration": 25, "text": "Introduction to the lecture topic." },
  { "start": 45, "duration": 30, "text": "Core concept explained with example." }
]`;

  try {
    const response = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });
    const { text } = parseProxyResponse(response);
    if (!text) return null;
    const cues = parseGeminiCues(text);
    return cues.length > 3 ? cues : null;
  } catch (e) {
    console.warn('[TranscriptService:clientL2] Gemini multimodal failed:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PUBLIC: fetchVideoTranscript — Primary entry point
// ════════════════════════════════════════════════════════════════════════════════
export async function fetchVideoTranscript(
  videoId: string,
  videoTitle?: string
): Promise<TranscriptResult> {
  if (!videoId) return { cues: [], source: 'client_gemini_ai_summary' };

  const t0 = Date.now();

  // ── Stage 1: Hit our backend 4-layer pipeline ────────────────────────────────
  try {
    const backendUrl = `https://zentrackworld.vercel.app/api/youtube/transcript?videoId=${encodeURIComponent(videoId)}&title=${encodeURIComponent(videoTitle || '')}`;
    const res = await fetch(backendUrl, { signal: AbortSignal.timeout(30000) });

    if (res.ok) {
      const data = await res.json();
      if (data?.cues && Array.isArray(data.cues) && data.cues.length > 2) {
        const sourceMap: Record<string, TranscriptSource> = {
          innertube: 'server_innertube',
          gemini_multimodal: 'server_gemini_multimodal',
          supadata: 'server_supadata',
          gemini_audio: 'server_gemini_audio',
        };
        return {
          cues: data.cues as TranscriptCue[],
          source: sourceMap[data.source] || 'server_innertube',
          latencyMs: Date.now() - t0,
          layersTried: data.layers_tried,
        };
      }
    }
  } catch (e) {
    console.warn('[TranscriptService] Backend pipeline failed or timed out:', e);
  }

  // ── Stage 2: Client-side InnerTube direct fallback ───────────────────────────
  try {
    const cues = await clientLayer1_innerTube(videoId);
    if (cues && cues.length > 2) {
      return { cues, source: 'client_innertube', latencyMs: Date.now() - t0, layersTried: 2 };
    }
  } catch (e) {
    console.warn('[TranscriptService] Client InnerTube failed:', e);
  }

  // ── Stage 3: Client-side Gemini Multimodal ────────────────────────────────────
  try {
    const cues = await clientLayer2_gemini(videoId, videoTitle);
    if (cues && cues.length > 0) {
      return { cues, source: 'client_gemini_multimodal', latencyMs: Date.now() - t0, layersTried: 3 };
    }
  } catch (e) {
    console.warn('[TranscriptService] Client Gemini multimodal failed:', e);
  }

  // ── All stages failed — return empty gracefully ───────────────────────────────
  return { cues: [], source: 'client_gemini_ai_summary', latencyMs: Date.now() - t0, layersTried: 3 };
}

// ── Convenience: Transcript as plain text for AI context ─────────────────────
export function transcriptToPlainText(cues: TranscriptCue[], maxChars = 12000): string {
  let out = '';
  for (const cue of cues) {
    const line = `[${cue.formattedTime}] ${cue.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out.trim();
}
