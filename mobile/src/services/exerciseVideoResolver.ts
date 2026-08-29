/**
 * exerciseVideoResolver.ts — ZenTrack Mobile
 * S.A.R.A AI Auto-Video Form Finder & YouTube Resolver.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy } from './geminiProxy';
import { KNOWN_EXERCISE_VIDEOS, sanitizeName } from './exerciseVideoDatabase';

const VIDEO_CACHE_PREFIX = '@zentrack_video_id_';

export async function autoResolveExerciseVideoId(exerciseName: string, forceRefresh = false): Promise<string | null> {
  if (!exerciseName || !exerciseName.trim()) return null;

  const sanitized = sanitizeName(exerciseName);
  const cacheKey = `${VIDEO_CACHE_PREFIX}${sanitized}`;

  let isRateLimited = false;

  if (forceRefresh) {
    try {
      await AsyncStorage.removeItem(cacheKey);
    } catch (_) {}
  } else {
    // 1. Direct exact match in dictionary (400+ Exercises)
    if (KNOWN_EXERCISE_VIDEOS[sanitized]) {
      return KNOWN_EXERCISE_VIDEOS[sanitized];
    }

    // 2. Smart Modifier-Aware Partial Match
    const sortedKeys = Object.keys(KNOWN_EXERCISE_VIDEOS).sort((a, b) => b.length - a.length);
    const keyMatch = sortedKeys.find(k => {
      const hasReverseInName = sanitized.includes('reverse') || sanitized.includes('rear');
      const hasReverseInKey = k.includes('reverse') || k.includes('rear');
      if (hasReverseInName !== hasReverseInKey) return false;

      const hasInclineInName = sanitized.includes('incline');
      const hasInclineInKey = k.includes('incline');
      if (hasInclineInName !== hasInclineInKey) return false;

      const hasDeclineInName = sanitized.includes('decline');
      const hasDeclineInKey = k.includes('decline');
      if (hasDeclineInName !== hasDeclineInKey) return false;

      return sanitized.includes(k) || k.includes(sanitized);
    });

    if (keyMatch) {
      return KNOWN_EXERCISE_VIDEOS[keyMatch];
    }

    // 3. Local AsyncStorage Cache
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && cached !== 'NONE') return cached;
    } catch (_) { /* ignore */ }
  }

  // 4. S.A.R.A AI Live Search Resolution — Queries YouTube live for a fresh video
  try {
    const prompt = `Target Exercise: "${exerciseName}".
STRICT CONSTRAINTS FOR YOUTUBE VIDEO RESOLUTION:
1. EXPLICIT MATCH: The video MUST demonstrate proper form for "${exerciseName}".
2. RECENT CONTENT (2020 TO PRESENT): Must be a modern YouTube Shorts or video published between 2020 and 2026.
3. MAX DURATION (<= 1 MIN 30 SEC): YouTube Shorts or quick form demonstration under 1 minute 30 seconds max duration.
4. ACTIVE & PUBLIC: Must be a publicly available, working YouTube video ID.
${forceRefresh ? '5. FRESH REFRESH: Return a DIFFERENT active working YouTube Shorts ID for this exercise than before.' : ''}

Output ONLY the raw 11-character YouTube video ID string (e.g. vB_hT1sK2kM). If no match, return "NONE".`;

    const res = await callProxy({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: `You are S.A.R.A, ZenTrack's AI fitness video resolver. Output ONLY an 11-character YouTube video ID string or "NONE". No spaces, no markdown codeblocks, no explanations.`,
      generationConfig: {
        temperature: forceRefresh ? 0.7 : 0.1,
        maxOutputTokens: 20,
      }
    });

    const textResult = res?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textResult) {
      const cleanId = textResult.replace(/[^a-zA-Z0-9_-]/g, '').trim();
      if (cleanId.length === 11 && cleanId.toUpperCase() !== 'NONE') {
        AsyncStorage.setItem(cacheKey, cleanId).catch(() => {});
        return cleanId;
      }
    }
  } catch (e: any) {
    if (e?.message?.includes('API Error') || e?.message?.includes('429') || e?.message?.includes('401')) {
      isRateLimited = true;
    } else {
      console.warn('[VideoResolver] Primary AI live search error:', e);
    }
  }

  // 5. Tier 5 Simplified Core Movement Fallback (skip if API is rate limited to avoid spam)
  if (!isRateLimited) {
    try {
      const simplifiedName = exerciseName
        .replace(/hammer strength|machine|cable|smith machine|seated|standing|weighted|barbell|dumbbell|ez-bar|ez bar/gi, '')
        .trim() || exerciseName;

      const retryPrompt = `Target Exercise: "${simplifiedName}".
Find an ACTIVE, WORKING 11-character YouTube Shorts ID demonstrating proper form for "${simplifiedName}" (published 2020-2026, under 1:30 duration).
Return ONLY the 11-character YouTube video ID string.`;

      const res = await callProxy({
        contents: [{ parts: [{ text: retryPrompt }] }],
        systemInstruction: `Output ONLY a valid 11-character YouTube video ID string. No text.`,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 20,
        }
      });

      const textResult = res?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textResult) {
        const cleanId = textResult.replace(/[^a-zA-Z0-9_-]/g, '').trim();
        if (cleanId.length === 11 && cleanId.toUpperCase() !== 'NONE') {
          AsyncStorage.setItem(cacheKey, cleanId).catch(() => {});
          return cleanId;
        }
      }
    } catch (e) {
      console.warn('[VideoResolver] Tier 5 fallback error:', e);
    }
  }

  // Guaranteed Movement Pattern Fallback — Ensures NO EXERCISE ever returns empty null!
  if (sanitized.includes('swing') || sanitized.includes('kettlebell')) return 'ysO0yL2z_o8';
  if (sanitized.includes('press') || sanitized.includes('bench')) return 'hWbUlkb5Ms4';
  if (sanitized.includes('row') || sanitized.includes('pulldown') || sanitized.includes('pullup') || sanitized.includes('chinup')) return 'G8l_8chR5BE';
  if (sanitized.includes('squat') || sanitized.includes('lunge')) return 'RVEZruvfkqI';
  if (sanitized.includes('deadlift') || sanitized.includes('rdl') || sanitized.includes('hinge')) return '2SHsk9AzdjA';
  if (sanitized.includes('curl')) return 'kwG2ipFRgfo';
  if (sanitized.includes('extension') || sanitized.includes('pushdown') || sanitized.includes('dip')) return 'NvZKjiZ8NYc';
  if (sanitized.includes('raise') || sanitized.includes('fly')) return 'Kl3LEzQ5Zqs';
  if (sanitized.includes('crunch') || sanitized.includes('plank') || sanitized.includes('ab')) return 'mnRhbUB3Fjs';

  return 'ysO0yL2z_o8';
}
