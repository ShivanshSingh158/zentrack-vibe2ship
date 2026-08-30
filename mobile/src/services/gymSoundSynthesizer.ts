/**
 * gymSoundSynthesizer.ts — ZenTrack Mobile & Web
 *
 * Zero-Asset Programmatic Audio Synthesizer:
 * Generates mathematically pure audio beeps and chimes directly via:
 * 1. Web Audio API (AudioContext Oscillator) on Web.
 * 2. In-Memory PCM WAV Data-URIs + Expo-AV Sound buffers on Native Mobile.
 *
 * Zero MP3/WAV files to bundle, 0 KB added to APK, zero network requests, instant 0ms latency.
 */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

let webAudioCtx: any = null;

function getWebAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!webAudioCtx) {
    webAudioCtx = new AudioCtx();
  }
  return webAudioCtx;
}

/**
 * Synthesizes pure sine wave audio in Web Audio API
 */
function playWebBeep(freq: number, durationMs: number) {
  try {
    const ctx = getWebAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';

    const t0 = ctx.currentTime;
    const durSec = durationMs / 1000;
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.02);
  } catch (e) {
    // Ignore audio context errors
  }
}

/**
 * Generates a valid in-memory 8-bit mono PCM WAV Data-URI
 */
function generatePcmWavDataUri(freq: number, durationMs: number, sampleRate = 8000): string {
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const bytes = new Uint8Array(44 + numSamples);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) bytes[offset + i] = str.charCodeAt(i);
  };
  const writeUint32LE = (offset: number, val: number) => {
    bytes[offset] = val & 0xff;
    bytes[offset + 1] = (val >> 8) & 0xff;
    bytes[offset + 2] = (val >> 16) & 0xff;
    bytes[offset + 3] = (val >> 24) & 0xff;
  };
  const writeUint16LE = (offset: number, val: number) => {
    bytes[offset] = val & 0xff;
    bytes[offset + 1] = (val >> 8) & 0xff;
  };

  writeString(0, 'RIFF');
  writeUint32LE(4, 36 + numSamples);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  writeUint32LE(16, 16);
  writeUint16LE(20, 1); // PCM
  writeUint16LE(22, 1); // Mono
  writeUint32LE(24, sampleRate);
  writeUint32LE(28, sampleRate);
  writeUint16LE(32, 1);
  writeUint16LE(34, 8); // 8-bit
  writeString(36, 'data');
  writeUint32LE(40, numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * (3500 / durationMs));
    const sample = Math.sin(2 * Math.PI * freq * t) * decay;
    bytes[44 + i] = Math.floor((sample + 1) * 127.5);
  }

  // Pure JS Base64 encoder
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : 0;
    const b3 = i < bytes.length ? bytes[i++] : 0;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    let enc3 = ((b2 & 15) << 2) | (b3 >> 6);
    let enc4 = b3 & 63;

    if (i - 1 === bytes.length) {
      enc4 = 64;
    } else if (i === bytes.length) {
      enc3 = 64;
      enc4 = 64;
    }

    base64 += chars.charAt(enc1) + chars.charAt(enc2) + (enc3 === 64 ? '=' : chars.charAt(enc3)) + (enc4 === 64 ? '=' : chars.charAt(enc4));
  }

  return `data:audio/wav;base64,${base64}`;
}

// Pre-synthesized Base64 sound data URIs
const TICK_URI = generatePcmWavDataUri(880, 85);
const CHIME_URI = generatePcmWavDataUri(1320, 240);
const COMPLETE_URI = generatePcmWavDataUri(660, 110);

let nativeSoundCache: Record<string, any> = {};

async function playNativeSound(uri: string) {
  try {
    const { Audio } = require('expo-av');
    if (!nativeSoundCache[uri]) {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      );
      nativeSoundCache[uri] = sound;
    } else {
      await nativeSoundCache[uri].replayAsync();
    }
  } catch (e) {
    // Graceful fallback if audio is muted or busy
  }
}

/**
 * 3... 2... 1... Countdown Tick (880 Hz High-Pitch Pulse + Medium Haptic)
 */
export function playCountdownTick() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch (e) {}

  if (Platform.OS === 'web') {
    playWebBeep(880, 85);
  } else {
    playNativeSound(TICK_URI);
  }
}

/**
 * Timer Completed Chime (1320 Hz Resonant Gong + Success Haptic)
 */
export function playTimerFinishChime() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {}

  if (Platform.OS === 'web') {
    playWebBeep(1320, 240);
  } else {
    playNativeSound(CHIME_URI);
  }
}

/**
 * Set Logged / Checked Off Tone (660 Hz Subtle Ping + Light Haptic)
 */
export function playSetCompleteTone() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {}

  if (Platform.OS === 'web') {
    playWebBeep(660, 110);
  } else {
    playNativeSound(COMPLETE_URI);
  }
}
