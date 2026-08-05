/**
 * LearningScreen.tsx — ZenTrack Mobile (Refactored Orchestrator)
 * 
 * This file is now a thin orchestrator (~220 lines).
 * Heavy sub-components have been extracted to:
 *   - components/Learning/LearningTopicCard.tsx   (topic cards + subtask list)
 *   - components/Learning/LearningVideoPlayer.tsx  (YouTube player + AI chat + notes)
 *   - components/Learning/LearningModals.tsx       (add/edit/import modals)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  DeviceEventEmitter, Alert, LayoutAnimation, UIManager, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData, LearningTopic, LearningSubTask } from '../contexts/MobileDataContext';
import { FONT_FAMILY, SHADOW, RADIUS } from '../theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { collection, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy, parseProxyResponse } from '../services/geminiProxy';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useNavigation } from '@react-navigation/native';
import LearningTopicCard from '../components/Learning/LearningTopicCard';
import LearningVideoPlayer from '../components/Learning/LearningVideoPlayer';
import LearningModals from '../components/Learning/LearningModals';
import { COLLECTION, GEMINI_PROXY_BASE } from '../config/constants';

// ─── Stage 0: Direct YouTube TimedText API Fetcher (Instant ~50ms) ────────────
// Calls YouTube's public TimedText XML REST API directly (https://www.youtube.com/api/timedtext).
// Returns timestamped captions in ~50ms. Zero HTML scraping, zero network error!
const fetchYouTubeTimedTextDirect = async (videoId: string): Promise<{ transcript: string; error: string | null }> => {
  try {
    const parseXmlTranscript = (xml: string): string => {
      let lines: string[] = [];
      
      // 1. Try srv3 format (<p t="ms" d="ms">)
      const pRegex = /<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatches = [...xml.matchAll(pRegex)];
      
      if (pMatches.length > 0) {
        lines = pMatches.map(m => {
          const startSec = Math.floor(parseInt(m[1]) / 1000);
          const mm = Math.floor(startSec / 60);
          const ss = String(startSec % 60).padStart(2, '0');
          // clean inner tags like <s>
          let inner = m[2].replace(/<[^>]+>/g, '');
          const cleanText = inner
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n/g, ' ')
            .trim();
          return `[${mm}:${ss}] ${cleanText}`;
        }).filter(line => line.length > 5);
      } else {
        // 2. Fallback to srv1 / classic format (<text start="s" dur="s">)
        const textMatches = [...xml.matchAll(new RegExp('<text\\s+start="([\\d.]+)"[^>]*>(.*?)</text>', 'gi'))];
        lines = textMatches.map(m => {
          const startSec = Math.floor(parseFloat(m[1]));
          const mm = Math.floor(startSec / 60);
          const ss = String(startSec % 60).padStart(2, '0');
          const cleanText = m[2]
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(new RegExp('<[^>]*>', 'g'), '')
            .replace(/\n/g, ' ')
            .trim();
          return `[${mm}:${ss}] ${cleanText}`;
        }).filter(line => line.length > 5);
      }
      return lines.join('\n');
    };

    // 1. Direct language code checks (English, Hindi, Auto-translated)
    const langCodes = ['en', 'hi', 'en-US', 'en-GB', 'a.en', 'a.hi'];
    for (const lang of langCodes) {
      try {
        const res = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`);
        if (res.ok) {
          const xml = await res.text();
          if (xml && xml.includes('<text')) {
            const formatted = parseXmlTranscript(xml);
            if (formatted.length > 50) {
              return { transcript: formatted, error: null };
            }
          }
        }
      } catch {}
    }

    // 2. Track list lookup — get all available track languages
    try {
      const listRes = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&type=list`);
      if (listRes.ok) {
        const listXml = await listRes.text();
        const matches = [...listXml.matchAll(/<track[^>]+lang_code="([^"]+)"[^>]*\/>/gi)];
        if (matches.length > 0) {
          const firstLang = matches[0][1];
          const trackRes = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${firstLang}`);
          if (trackRes.ok) {
            const xml = await trackRes.text();
            const formatted = parseXmlTranscript(xml);
            if (formatted.length > 50) {
              return { transcript: formatted, error: null };
            }
          }
        }
      }
    } catch {}

    // 3. InnerTube API (Android Client payload) - extremely reliable on mobile IPs
    try {
      const innertubeRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
        },
        body: JSON.stringify({
          context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
          videoId: videoId,
        }),
      });
      const data = await innertubeRes.json();
      const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captionTracks && captionTracks.length > 0) {
        let selectedTrack = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode === 'en-US' || t.languageCode?.startsWith('en'));
        if (!selectedTrack) selectedTrack = captionTracks[0];
        if (selectedTrack && selectedTrack.baseUrl) {
          // Natively fetch the URL WITHOUT appending anything, to preserve signature!
          const xmlRes = await fetch(selectedTrack.baseUrl, {
            headers: {
              'Accept-Language': selectedTrack.languageCode,
              'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
            }
          });
          const xmlText = await xmlRes.text();
          if (xmlText && (xmlText.includes('<text') || xmlText.includes('<p'))) {
            const formatted = parseXmlTranscript(xmlText);
            if (formatted.length > 50) return { transcript: formatted, error: null };
          }
        }
      }
    } catch (e: any) {
      console.log('InnerTube error:', e);
    }

    // 4. Direct YouTube Page Scrape (with robust regex dotAll flag)
    let pageHtml = '';
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      pageHtml = await pageRes.text();
      let jsonStr = '';
      
      const match1 = pageHtml.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]+?});/);
      const match2 = pageHtml.match(new RegExp('ytInitialPlayerResponse\\s*=\\s*({[\\s\\S]+?})</script>'));
      
      if (match1) jsonStr = match1[1];
      else if (match2) jsonStr = match2[1];
      
      if (jsonStr) {
        const playerResponse = JSON.parse(jsonStr);
        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (captionTracks && captionTracks.length > 0) {
          let selectedTrack = captionTracks.find((t: any) => t.languageCode === 'en' || t.languageCode === 'en-US' || t.languageCode?.startsWith('en'));
          if (!selectedTrack) selectedTrack = captionTracks[0];
          if (selectedTrack && selectedTrack.baseUrl) {
            // Natively fetch the URL WITHOUT appending anything, to preserve signature!
            const xmlRes = await fetch(selectedTrack.baseUrl, {
              headers: {
                'Accept-Language': selectedTrack.languageCode,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              }
            });
            const xmlText = await xmlRes.text();
            if (xmlText && (xmlText.includes('<text') || xmlText.includes('<p'))) {
              const formatted = parseXmlTranscript(xmlText);
              if (formatted.length > 50) return { transcript: formatted, error: null };
            }
          }
        }
      }
    } catch (e: any) {
      console.log('HTML Scrape error:', e);
    }

    // If we reach here, ALL 4 on-device stages failed.
    const hasYtInitial = pageHtml.includes('ytInitialPlayerResponse');
    const hasCaptcha = pageHtml.includes('captcha') || pageHtml.includes('consent.youtube.com');
    
    return { 
      transcript: '', 
      error: `Scraper V3 Failed (Initial: ${hasYtInitial}, Captcha: ${hasCaptcha}) - video may have NO captions at all` 
    };
  } catch (e: any) {
    return { transcript: '', error: e?.message || 'TimedText fetch failed' };
  }
};

// ─── Stage 1: YouTube Captions via Vercel Endpoint ────────────────────────────
// Calls the Vercel /api/transcript endpoint as backup
const fetchYouTubeCaptions = async (videoId: string): Promise<{ transcript: string; error: string | null }> => {
  try {
    let user = auth.currentUser;
    if (!user) {
      await new Promise(r => setTimeout(r, 1000));
      user = auth.currentUser;
    }

    const idToken = user ? await user.getIdToken(true).catch(() => '') : '';
    const headers: Record<string, string> = {};
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const res = await fetch(`${GEMINI_PROXY_BASE}/api/transcript?videoId=${videoId}`, { headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { transcript: '', error: errData?.error || `Server error (${res.status})` };
    }
    const data = await res.json();
    if (data.transcript && data.transcript.length > 50) {
      return { transcript: data.transcript, error: null };
    }
    return { transcript: '', error: 'No captions on this video' };
  } catch (e: any) {
    return { transcript: '', error: e?.message || 'Network error' };
  }
};

// ─── Stage 2: Gemini Native YouTube Video Understanding ─────────────────────────
const GEMINI_VIDEO_TIMEOUT_MS = 25000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const analyzeVideoWithGemini = async (
  videoId: string,
  videoTitle: string,
): Promise<{ analysis: string; error: string | null }> => {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const timeoutFallback = { analysis: '', error: 'Timed out after 25s — video may be too long for real-time analysis' };

  const work = (async (): Promise<{ analysis: string; error: string | null }> => {
    try {
      const data = await callProxy({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri: youtubeUrl, mimeType: 'video/mp4' } } as any,
            {
              text: `Analyze this YouTube lecture: "${videoTitle}".
Produce a DETAILED breakdown with:
## Overview (2-3 sentences)
## Timestamped Breakdown — every 2-3 min: [MM:SS] what is taught, code shown, examples
## Key Concepts — every concept/algorithm/technique
## Code Examples — reproduce any code shown (specify language)
## Key Takeaways
Be precise. Reproduce exact code from the screen.`,
            },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      });
      const analysis = parseProxyResponse(data).text;
      if (!analysis || analysis.length < 50) return { analysis: '', error: 'Gemini returned empty analysis' };
      return { analysis, error: null };
    } catch (e: any) {
      return { analysis: '', error: e?.message || 'Gemini video analysis failed' };
    }
  })();

  return withTimeout(work, GEMINI_VIDEO_TIMEOUT_MS, timeoutFallback);
};

// ─── Master Lecture Context Fetcher ────────────────────────────────────────────
export type TranscriptSource = 'captions' | 'gemini-vision' | 'none';
export interface LectureContext {
  content: string;
  source: TranscriptSource;
  error: string | null;
}

const fetchLectureContext = async (
  videoId: string,
  videoTitle: string,
  onStageUpdate: (msg: string) => void,
): Promise<LectureContext> => {
  onStageUpdate('⏳ Loading lecture transcript directly...');

  // STAGE 0: Direct YouTube TimedText API fetch (instant ~50ms)
  const directResult = await fetchYouTubeTimedTextDirect(videoId);
  if (directResult.transcript) {
    return { content: directResult.transcript, source: 'captions', error: null };
  }

  // Fallback: Run Vercel captions endpoint + Gemini Vision in parallel
  onStageUpdate('⏳ Checking backup transcript sources...');
  const [captionResult, geminiResult] = await Promise.all([
    fetchYouTubeCaptions(videoId),
    analyzeVideoWithGemini(videoId, videoTitle),
  ]);

  if (captionResult.transcript) {
    return { content: captionResult.transcript, source: 'captions', error: null };
  }
  if (geminiResult.analysis) {
    return { content: geminiResult.analysis, source: 'gemini-vision', error: null };
  }

  // All failed
  return {
    content: '',
    source: 'none',
    error: `On-Device: ${directResult.error || 'none'} | Server: ${captionResult.error || 'none'} | Gemini Vision: ${geminiResult.error || 'failed'}`,
  };
};

// ─── System Prompt Builder ──────────────────────────────────────────────────
// Mirror of the web tutor's buildSystemInstruction — same 8 Laws of Zen Tutoring
const buildZenGptSystemPrompt = (
  videoTitle: string,
  topicName: string,
  transcript: string,
  currentVideoSecond?: number,
): string => {
  const timestampCtx = currentVideoSecond !== undefined
    ? `\nStudent is currently at: ${formatSeconds(currentVideoSecond)} in the video.`
    : '';

  return `You are ZEN-GPT — a world-class expert educator and AI tutor embedded inside ZenTrack mobile.
The student is watching: 📺 "${videoTitle}" — 📚 Topic: "${topicName}"${timestampCtx}

== THE 8 LAWS OF ZEN TUTORING (NEVER BREAK) ==

1. RICHARD FEYNMAN TECHNIQUE: Explain concepts simply, as if teaching a beginner. Strip away all jargon. Use clear, vivid, everyday analogies. Never give a dense academic explanation when a simple analogy works better.

2. CODE = WORKING + EXPLAINED: For any code question:
   a) A minimal working code example (< 30 lines if possible)
   b) A line-by-line explanation of the key parts
   c) One common mistake beginners make
   Use triple backtick code blocks always.
   ADAPTIVE LANGUAGE: Always use the coding language the student asks for, or detect it from the transcript/lecture title. If unsure, ask which language before writing code.

3. ANALOGIES ARE MANDATORY: For abstract concepts, ALWAYS provide a real-world analogy BEFORE the technical explanation. e.g., "Think of a pointer like a sticky note with someone's address — the note isn't the house, it just tells you where the house is."

4. CONFUSION DETECTION: If the student says "I don't get it", "confused", "explain again" — NEVER repeat the same explanation. Instead:
   a) Ask: "Which specific part is unclear — [A] or [B]?"
   b) Break it into the smallest possible step
   c) Use a completely different analogy

5. CROSS-TOPIC CONNECTIONS: Actively connect new concepts to fundamentals. "This is the same idea as X, which you've likely seen before..."

6. FOLLOW-UP QUESTIONS: End EVERY response with 2 specific, intellectually curious follow-up questions:
   💡 **Ask next:** "Question 1?" · "Question 2?"
   Must be specific to THIS lecture's content — not generic.

7. QUIZ MODE (triggered by "quiz me", "test me", "quiz"):
   - Exactly 3 MCQ questions labeled Q1, Q2, Q3
   - Each tests understanding, not memorization
   - Difficulty: Q1 = conceptual, Q2 = applied, Q3 = tricky edge case
   - Options: (A) (B) (C) (D)
   - Do NOT reveal answers until student responds
   - After response, explain WHY each option is right/wrong

8. NOTES MODE (triggered by "save this", "make notes", "summarize for notes"):
   - Start with ## [Clear Title]
   - Structure: Key concept → How it works → Code example → When to use it
   - Make it a self-contained reference the student can study from later
   - Include timestamps if available

== RESPONSE FORMAT ==
- **bold** for key terms, 'inline code' for snippets, fenced code blocks for all code
- Numbered lists for steps, bullets for features/options/comparisons
- Use ## and ### headers to organize detailed responses
- Write as deeply as the topic demands — NEVER artificially truncate a response
- Complex topics deserve full explanations with multiple examples, edge cases, and analogies
- NEVER start with "Sure!", "Of course!", "Great question!" — get directly to the explanation
- Always finish every thought completely

${transcript
  ? `=== VIDEO TRANSCRIPT (with timestamps) ===
Reference timestamps precisely when answering: "At 4:32, she explains..." — quote directly from the transcript when relevant.

${transcript}
=== END TRANSCRIPT ===`
  : '(No transcript available — answer from the video title, topic, and your deep expert knowledge of this subject.)'}`;
};

const formatSeconds = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function LearningScreen() {
  const { learningTopics, user } = useMobileData();
  const navigation = useNavigation();
  const { colors } = useTheme();

  // ── Modal state ──
  const [topicModalVisible, setTopicModalVisible] = useState(false);
  const [subtaskModalVisible, setSubtaskModalVisible] = useState(false);
  const [roadmapModalVisible, setRoadmapModalVisible] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [activeOptionsData, setActiveOptionsData] = useState<{ type: 'topic' | 'subtask'; topicId: string; subtaskId?: string } | null>(null);

  // ── UI state ──
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});

  // ── Video state ──
  const [activeVideoSub, setActiveVideoSub] = useState<LearningSubTask | null>(null);
  const [activeVideoTopicId, setActiveVideoTopicId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPip, setIsPip] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isNativeFullScreen, setIsNativeFullScreen] = useState(false);
  const playerRef = useRef<any>(null);
  const [videoLayout, setVideoLayout] = useState({ width: 300, height: 200 });

  // ── AI chat state ──
  const [aiChatVisible, setAiChatVisible] = useState(false);
  const [aiHistory, setAiHistory] = useState<{ role: string; text: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ── ZEN-GPT Tutor context (persisted for full session) ──
  const tutorSystemPromptRef = useRef<string>('');
  const tutorConversationRef = useRef<{ role: string; parts: { text: string }[] }[]>([]);
  const tutorTranscriptRef = useRef<string>('');
  const [transcriptStatus, setTranscriptStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

  // ── Notes state ──
  const [notesVisible, setNotesVisible] = useState(false);
  const [currentNotes, setCurrentNotes] = useState('');

  // ── Sara voice event listener ──
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('agent-play-video', () => {
      const firstTopic = learningTopics[0];
      if (!firstTopic) return;
      const firstSub = firstTopic.subTasks?.find(s => !s.isCompleted && s.url && s.url.includes('youtu'));
      if (firstSub) openVideo(firstTopic.id!, firstSub);
      else Alert.alert('Sara', 'Could not find an uncompleted lecture to play.');
    });
    return () => sub.remove();
  }, [learningTopics]);

  // ── Hide tab bar when panels open ──
  useEffect(() => {
    const baseTabBarStyle = {
      position: 'absolute' as const,
      bottom: 20,
      left: 20,
      right: 20,
      borderRadius: RADIUS.xxl,
      borderWidth: 1,
      borderColor: colors.borderHover,
      elevation: 20,
      height: 70,
      overflow: 'hidden' as const,
      paddingBottom: 0,
    };

    if (aiChatVisible || notesVisible) {
      navigation.setOptions({ tabBarStyle: { display: 'none' } });
    } else {
      navigation.setOptions({ tabBarStyle: baseTabBarStyle });
    }
    return () => navigation.setOptions({ tabBarStyle: baseTabBarStyle });
  }, [aiChatVisible, notesVisible, navigation, colors]);

  // ── Helpers ──
  const extractVideoId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };

  const toggleTopic = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newSet = new Set(expandedTopics);
    if (newSet.has(id)) {
      newSet.delete(id);
      setVisibleLimits(prev => ({ ...prev, [id]: 15 }));
    } else {
      newSet.add(id);
    }
    setExpandedTopics(newSet);
  };

  const loadMoreSubTasks = (topicId: string) => {
    setVisibleLimits(prev => ({ ...prev, [topicId]: (prev[topicId] || 15) + 30 }));
  };

  const toggleSubtask = async (topicId: string, subtaskId: string) => {
    const topic = learningTopics.find(t => t.id === topicId);
    if (!topic) return;
    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, isCompleted: !s.isCompleted } : s
    );
    try { await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, topicId), { subTasks: updatedSubtasks }); } catch (e) {}
  };

  const togglePin = async (topicId: string, subtaskId: string) => {
    const topic = learningTopics.find(t => t.id === topicId);
    if (!topic) return;
    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, pinned: !s.pinned } : s
    );
    try { await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, topicId), { subTasks: updatedSubtasks }); } catch (e) {}
  };

  const showTopicOptions = (id: string) => {
    setActiveOptionsData({ type: 'topic', topicId: id });
    setOptionsModalVisible(true);
  };

  const showSubtaskOptions = (topicId: string, subtaskId: string) => {
    setActiveOptionsData({ type: 'subtask', topicId, subtaskId });
    setOptionsModalVisible(true);
  };

  const onDragEnd = async ({ data }: { data: LearningTopic[] }) => {
    try {
      const batch = writeBatch(db);
      data.forEach((topic, index) => {
        batch.update(doc(db, COLLECTION.LEARNING_TOPICS, topic.id!), { order: index });
      });
      await batch.commit();
    } catch (error) { console.error('Failed to reorder topics:', error); }
  };

  const openVideo = async (topicId: string, sub: LearningSubTask) => {
    const vidId = extractVideoId(sub.url);
    if (!vidId) { Alert.alert('Invalid URL', 'Only YouTube links are supported.'); return; }
    setActiveVideoTopicId(topicId);
    setActiveVideoSub(sub);
    setPlaying(true);
    setIsPip(false);
    setIsFocusMode(false);
    setCurrentNotes(sub.notes || '');

    // Safe title — some old subtasks may have missing or undefined title
    const videoTitle = sub.title?.trim() || 'this lecture';
    const topic = learningTopics.find(t => t.id === topicId);
    const topicName = topic?.title || 'your learning path';

    // Reset tutor context for the new video
    tutorConversationRef.current = [];
    tutorTranscriptRef.current = '';
    tutorSystemPromptRef.current = buildZenGptSystemPrompt(videoTitle, topicName, '');

    // Show live stage updates in the chat
    setAiHistory([{ role: 'model', text: `I am **ZEN-GPT**, your AI tutor for **${videoTitle}**. ⏳ Loading transcript...` }]);
    setTranscriptStatus('loading');

    // Two-stage fetch: captions → Gemini Video AI
    const { content, source, error } = await fetchLectureContext(
      vidId,
      videoTitle,
      (stageMsg) => setAiHistory(() => [
        { role: 'model', text: `I am **ZEN-GPT**, your AI tutor for **${videoTitle}**. ${stageMsg}` },
      ]),
    );

    tutorTranscriptRef.current = content;
    tutorSystemPromptRef.current = buildZenGptSystemPrompt(
      videoTitle,
      topicName,
      content,
    );
    setTranscriptStatus(content ? 'ready' : 'unavailable');

    // Honest final status message
    let statusMsg: string;
    if (source === 'captions' && content) {
      statusMsg = `✅ **YouTube captions loaded** — ~${Math.round(content.length / 5)} words. I know this lecture in precise detail with exact timestamps. Ask me anything!`;
    } else if (source === 'gemini-vision' && content) {
      statusMsg = `🧠 **Gemini Video AI** analyzed this lecture directly (no captions available). I watched the video, heard the audio, and read any code shown on screen. My knowledge is based on the actual video content — ask me anything!`;
    } else {
      statusMsg = `❌ **Could not understand this lecture.**\n_${error || 'Both caption fetch and Gemini video analysis failed.'}_\n\nI can only answer from my general knowledge of the topic "${topicName}" — not from this specific video.`;
    }

    setAiHistory([
      { role: 'model', text: `I am **ZEN-GPT**, your AI tutor for **${videoTitle}** (${topicName}). 🎓` },
      { role: 'model', text: statusMsg },
    ]);

    try {
      const timeStr = await AsyncStorage.getItem(`@video_time_${sub.id}`);
      if (timeStr && playerRef.current) {
        playerRef.current.seekTo(parseInt(timeStr, 10), true);
      }
    } catch (e) {}
  };

  const closeVideo = async () => {
    if (activeVideoSub && playerRef.current) {
      try {
        const time = await playerRef.current.getCurrentTime();
        await AsyncStorage.setItem(`@video_time_${activeVideoSub.id}`, Math.floor(time).toString());
      } catch (e) {}
    }
    setActiveVideoSub(null);
    setAiChatVisible(false);
    setNotesVisible(false);
    setIsFocusMode(false);
  };

  const saveNotes = async () => {
    if (!activeVideoTopicId || !activeVideoSub) return;
    const topic = learningTopics.find(t => t.id === activeVideoTopicId);
    if (!topic) return;
    const updated = (topic.subTasks || []).map(s =>
      s.id === activeVideoSub.id ? { ...s, notes: currentNotes } : s
    );
    try { await updateDoc(doc(db, COLLECTION.LEARNING_TOPICS, activeVideoTopicId), { subTasks: updated }); } catch (e) {}
  };

  const generateQuiz = async () => {
    await sendAiMessage('Quiz me on this lecture. Give me 3 multiple-choice questions (A/B/C/D). Label them Q1, Q2, Q3. Do NOT reveal the answers yet.');
  };

  const sendAiMessage = useCallback(async (overrideText?: string) => {
    const msg = (overrideText ?? aiInput).trim();
    if (!msg || aiLoading) return;
    if (!overrideText) setAiInput('');

    const userMsg = { role: 'user', text: msg };
    const newHistory = [...aiHistory, userMsg];
    setAiHistory(newHistory);
    setAiLoading(true);

    // Build context: inject current playback second so AI can reference timestamps precisely
    let currentSecond: number | undefined;
    try {
      if (playerRef.current?.getCurrentTime) {
        currentSecond = Math.floor(await playerRef.current.getCurrentTime());
      }
    } catch { /* ignore */ }

    // Refresh system prompt with latest playback position
    if (activeVideoSub) {
      const topic = learningTopics.find(t => t.id === activeVideoTopicId);
      tutorSystemPromptRef.current = buildZenGptSystemPrompt(
        activeVideoSub.title,
        topic?.title || activeVideoTopicId || '',
        tutorTranscriptRef.current,
        currentSecond,
      );
    }

    // Build full multi-turn conversation for Gemini
    const userTurn = { role: 'user', parts: [{ text: msg }] };
    const conversationHistory = [...tutorConversationRef.current, userTurn];

    try {
      const data = await callProxy({
        model: 'gemini-2.5-flash',
        contents: conversationHistory,
        systemInstruction: tutorSystemPromptRef.current,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 32768,
        },
      });

      const { text: reply } = parseProxyResponse(data);
      if (!reply) throw new Error('Empty response from ZEN-GPT');

      // Persist conversation history for multi-turn memory
      tutorConversationRef.current = [
        ...conversationHistory,
        { role: 'model', parts: [{ text: reply }] },
      ];

      setAiHistory([...newHistory, { role: 'model', text: reply }]);
    } catch (e: any) {
      setAiHistory([...newHistory, { role: 'model', text: `⚠️ Error connecting to ZEN-GPT: ${e?.message || 'Please try again.'}` }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, aiHistory, activeVideoSub, activeVideoTopicId, learningTopics, playerRef]);

  const sortedTopics = [...learningTopics].sort((a, b) => (a.order || 0) - (b.order || 0));

  const renderListHeader = () => (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <View style={s.headerIconWrapper}>
          <Ionicons name="book" size={20} color="#a599ff" />
        </View>
        <Text style={s.screenTitle}>Learning paths</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 12 }}>
        <TouchableOpacity onPress={() => setRoadmapModalVisible(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="add" size={16} color="#a599ff" />
          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#f2f2f7' }}>Quick import</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
        <View style={[s.searchBar, { flex: 1, marginBottom: 0 }]}>
          <Ionicons name="search" size={16} color="#8e8e93" />
          <Text style={s.searchText}>Search</Text>
        </View>
        <TouchableOpacity style={[s.primaryBlockBtn, { width: 48, paddingVertical: 0, justifyContent: 'center', alignItems: 'center' }]} onPress={() => setTopicModalVisible(true)}>
          <Ionicons name="add" size={24} color="#000" />
        </TouchableOpacity>
      </View>
    </View>
  );

  function renderTopicCard(params: any) {
    return (
      <LearningTopicCard
        {...params}
        expandedTopics={expandedTopics}
        visibleLimits={visibleLimits}
        toggleTopic={toggleTopic}
        toggleSubtask={toggleSubtask}
        togglePin={togglePin}
        showTopicOptions={showTopicOptions}
        showSubtaskOptions={showSubtaskOptions}
        loadMoreSubTasks={loadMoreSubTasks}
        extractVideoId={extractVideoId}
        openVideo={openVideo}
        setActiveTopicId={setActiveTopicId}
        setSubtaskModalVisible={setSubtaskModalVisible}
      />
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <DraggableFlatList
        data={sortedTopics}
        keyExtractor={t => t.id!}
        contentContainerStyle={s.list}
        ListHeaderComponent={renderListHeader}
        renderItem={renderTopicCard}
        onDragEnd={onDragEnd}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No learning topics yet.</Text>
          </View>
        }
      />

      {activeVideoSub && extractVideoId(activeVideoSub.url) && (
        <LearningVideoPlayer
          activeVideoSub={activeVideoSub}
          extractVideoId={extractVideoId}
          playerRef={playerRef}
          playing={playing}
          setPlaying={setPlaying}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          isPip={isPip}
          setIsPip={setIsPip}
          isFocusMode={isFocusMode}
          setIsFocusMode={setIsFocusMode}
          isNativeFullScreen={isNativeFullScreen}
          setIsNativeFullScreen={setIsNativeFullScreen}
          videoLayout={videoLayout}
          setVideoLayout={setVideoLayout}
          aiChatVisible={aiChatVisible}
          setAiChatVisible={setAiChatVisible}
          notesVisible={notesVisible}
          setNotesVisible={setNotesVisible}
          aiHistory={aiHistory}
          aiInput={aiInput}
          setAiInput={setAiInput}
          aiLoading={aiLoading}
          sendAiMessage={sendAiMessage}
          generateQuiz={generateQuiz}
          currentNotes={currentNotes}
          setCurrentNotes={setCurrentNotes}
          saveNotes={saveNotes}
          closeVideo={closeVideo}
        />
      )}

      <LearningModals
        user={user}
        learningTopics={learningTopics}
        topicModalVisible={topicModalVisible}
        setTopicModalVisible={setTopicModalVisible}
        topicTitle={topicTitle}
        setTopicTitle={setTopicTitle}
        subtaskModalVisible={subtaskModalVisible}
        setSubtaskModalVisible={setSubtaskModalVisible}
        activeTopicId={activeTopicId}
        subTitle={subTitle}
        setSubTitle={setSubTitle}
        subUrl={subUrl}
        setSubUrl={setSubUrl}
        roadmapModalVisible={roadmapModalVisible}
        setRoadmapModalVisible={setRoadmapModalVisible}
        playlistUrl={playlistUrl}
        setPlaylistUrl={setPlaylistUrl}
        optionsModalVisible={optionsModalVisible}
        setOptionsModalVisible={setOptionsModalVisible}
        activeOptionsData={activeOptionsData}
        setActiveOptionsData={setActiveOptionsData}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  list: { padding: 18, paddingBottom: 100 },
  headerIconWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(165,153,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  screenTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: '#fff' },
  searchBar: { backgroundColor: '#141416', borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8, marginBottom: 24, borderWidth: 1, borderColor: '#2c2c2e' },
  searchText: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 13 },
  primaryBlockBtn: { backgroundColor: '#a599ff', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  empty: { padding: 24, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyText: { fontFamily: FONT_FAMILY.body, color: '#8e8e93', fontSize: 13 },
});
