/**
 * youtubeTranscriptService.ts — ZenTrack Web
 *
 * 4-Layer Resilient Transcript Extractor (Full Mobile Parity):
 *   1. Backend 4-Layer Pipeline (/api/youtube/transcript or https://zentrackworld.vercel.app)
 *   2. Client InnerTube TimedText JSON3 (with multilingual track fallbacks)
 *   3. Client Gemini Multimodal Video Understanding (callWithFallback)
 *   4. Client Gemini AI Syllabus & Concept Breakdown
 */

import { callWithFallback } from './gemini/core';

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

export function formatSeconds(sec: number): string {
  const totalSec = Math.max(0, Math.floor(sec));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function makeCue(start: number, duration: number, text: string): TranscriptCue {
  return {
    start,
    duration,
    text: text.replace(/\n/g, ' ').trim(),
    formattedTime: formatSeconds(start),
  };
}

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
// LAYER 1: Backend 4-Layer Transcript Pipeline
// ════════════════════════════════════════════════════════════════════════════════
async function layer1_backendPipeline(videoId: string, videoTitle?: string): Promise<{ cues: TranscriptCue[]; source: TranscriptSource } | null> {
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const base = isLocal ? 'https://zentrackworld.vercel.app' : '';
  const url = `${base}/api/youtube/transcript?videoId=${encodeURIComponent(videoId)}&title=${encodeURIComponent(videoTitle || '')}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
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
        };
      }
    }
  } catch (err) {
    console.warn('[TranscriptService] Layer 1 (Backend Pipeline) bypassed or failed:', err);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// LAYER 2: Client-side Direct InnerTube TimedText JSON3
// ════════════════════════════════════════════════════════════════════════════════
async function layer2_clientInnerTube(videoId: string): Promise<TranscriptCue[] | null> {
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en-US&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=hi&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=json3`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const cues = parseJson3Transcript(data);
      if (cues.length > 2) return cues;
    } catch (_) {}
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════════
// LAYER 3: Client-side Gemini Multimodal AI Understanding
// ════════════════════════════════════════════════════════════════════════════════
async function layer3_geminiMultimodal(videoId: string, videoTitle?: string): Promise<TranscriptCue[] | null> {
  const prompt = `Analyze this YouTube lecture video directly using its URL.
YouTube URL: https://www.youtube.com/watch?v=${videoId}
Title: "${videoTitle || 'Educational Lecture'}"

Watch the video and produce a comprehensive timestamped transcript breakdown with 20-35 sequential timeline cues.
Include: key concepts, formulas, code shown on screen, definitions, and topic transitions.

Output ONLY a raw valid JSON array:
[
  { "start": 0, "duration": 25, "text": "Introduction to the lecture topic." },
  { "start": 45, "duration": 30, "text": "Core concept explained with example." }
]`;

  try {
    const text = await callWithFallback(async (model) => {
      const res = await model.generateContent(prompt);
      return res.response.text();
    });

    const cues = parseGeminiCues(text);
    return cues.length > 2 ? cues : null;
  } catch (e) {
    console.warn('[TranscriptService] Layer 3 (Gemini Multimodal) failed:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// LAYER 4: Client-side Gemini AI Concept & Syllabus Breakdown
// ════════════════════════════════════════════════════════════════════════════════
async function layer4_geminiSyllabus(videoTitle: string): Promise<TranscriptCue[] | null> {
  const prompt = `You are an expert curriculum author.
Break down this lecture topic into an estimated 15-20 sequential timestamp study milestones:
Lecture: "${videoTitle}"

Output ONLY a raw valid JSON array with sequential seconds:
[
  { "start": 0, "duration": 60, "text": "Overview and prerequisites" },
  { "start": 60, "duration": 120, "text": "Core theory and fundamentals" }
]`;

  try {
    const text = await callWithFallback(async (model) => {
      const res = await model.generateContent(prompt);
      return res.response.text();
    });

    const cues = parseGeminiCues(text);
    return cues.length > 0 ? cues : null;
  } catch (e) {
    console.warn('[TranscriptService] Layer 4 (Gemini Syllabus) failed:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// PUBLIC: fetchVideoTranscript (Runs 4-Layer Cascade)
// ════════════════════════════════════════════════════════════════════════════════
export async function fetchVideoTranscript(
  videoId: string,
  videoTitle?: string
): Promise<TranscriptResult> {
  if (!videoId) return { cues: [], source: 'client_gemini_ai_summary', latencyMs: 0, layersTried: 0 };

  const start = Date.now();
  let layersTried = 0;

  // 1. Try Backend 4-Layer Pipeline
  layersTried++;
  const backendRes = await layer1_backendPipeline(videoId, videoTitle);
  if (backendRes && backendRes.cues.length > 0) {
    return {
      cues: backendRes.cues,
      source: backendRes.source,
      latencyMs: Date.now() - start,
      layersTried,
    };
  }

  // 2. Try Client Direct InnerTube TimedText JSON3
  layersTried++;
  const directCues = await layer2_clientInnerTube(videoId);
  if (directCues && directCues.length > 0) {
    return {
      cues: directCues,
      source: 'client_innertube',
      latencyMs: Date.now() - start,
      layersTried,
    };
  }

  // 3. Try Client Gemini Multimodal Video Understanding
  layersTried++;
  const geminiCues = await layer3_geminiMultimodal(videoId, videoTitle);
  if (geminiCues && geminiCues.length > 0) {
    return {
      cues: geminiCues,
      source: 'client_gemini_multimodal',
      latencyMs: Date.now() - start,
      layersTried,
    };
  }

  // 4. Try Client Gemini AI Syllabus Fallback
  layersTried++;
  const syllabusCues = await layer4_geminiSyllabus(videoTitle || 'Lecture');
  if (syllabusCues && syllabusCues.length > 0) {
    return {
      cues: syllabusCues,
      source: 'client_gemini_ai_summary',
      latencyMs: Date.now() - start,
      layersTried,
    };
  }

  return {
    cues: [],
    source: 'client_gemini_ai_summary',
    latencyMs: Date.now() - start,
    layersTried,
  };
}

export function transcriptToPlainText(cues: TranscriptCue[], maxChars = 12000): string {
  let out = '';
  for (const cue of cues) {
    const line = `[${cue.formattedTime}] ${cue.text}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out.trim();
}
