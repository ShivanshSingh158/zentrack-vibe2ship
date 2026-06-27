/**
 * AgentTTS — Smart Text-to-Speech engine for ZenTrack AI responses.
 *
 * Key design decision: We do NOT read the raw AEGIS report aloud.
 * AEGIS embeds a "SPOKEN_SUMMARY:" marker at the end of its response.
 * We extract just that 2-sentence summary and speak it.
 * This gives a natural, conversational voice experience.
 */

const SPOKEN_SUMMARY_MARKER = 'SPOKEN_SUMMARY:';

export function parseAgentResponse(rawResponse: string): { uiText: string; spokenText: string } {
  // Match SPOKEN_SUMMARY: with optional bold asterisks around it
  const match = rawResponse.match(/(?:\*\*?)?SPOKEN_SUMMARY:(?:\*\*?)?\s*(.*)/is);
  
  if (match) {
    // The UI text is everything before the marker
    const uiText = rawResponse.substring(0, match.index).trim();
    // The spoken text is everything after the marker, cleaned up
    const rawSpoken = match[1].replace(/\*\*/g, '').replace(/#{1,6} /g, '').split('\n')[0].trim();
    return { uiText, spokenText: rawSpoken };
  }

  // Fallback: generate a generic summary from content
  let spokenText = "Your request has been processed. Check the chat for the full details.";
  if (rawResponse.includes('✅') || rawResponse.includes('Mission Complete')) {
    spokenText = "Done! Your request has been completed. Check the response for full details.";
  } else if (rawResponse.includes('⚠️') || rawResponse.includes('failed')) {
    spokenText = "I ran into some issues completing your request. Check the response for what went wrong.";
  }

  return { uiText: rawResponse.trim(), spokenText };
}

/**
 * Select the best available voice for TTS.
 * Prefers natural-sounding English voices over robotic ones.
 */
function selectBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Priority list: prefer these by name fragment (in order)
  const preferredNames = [
    'Samantha', // macOS — very natural
    'Google US English',
    'Microsoft Aria',
    'Microsoft Jenny',
    'Alex',
    'Karen',
    'Daniel',
    'Moira',
  ];

  for (const preferred of preferredNames) {
    const match = voices.find(v => v.name.includes(preferred) && v.lang.startsWith('en'));
    if (match) return match;
  }

  // Fallback: any en-US voice
  const enUS = voices.find(v => v.lang === 'en-US');
  if (enUS) return enUS;

  // Last resort: any English voice
  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

/**
 * Stop any currently playing TTS immediately.
 */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

/**
 * Check if TTS is currently speaking.
 */
export function isSpeaking(): boolean {
  return typeof window !== 'undefined' &&
    window.speechSynthesis?.speaking === true;
}

/**
 * Speak the agent's response.
 * Extracts SPOKEN_SUMMARY from AEGIS output and reads it naturally.
 * 
 * @param rawResponse - The full AEGIS text response
 * @param onStart - Called when speech begins
 * @param onEnd - Called when speech ends or is cancelled
 */
export async function speakAgentResponse(
  rawResponse: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('[AgentTTS] Web Speech API not available in this environment.');
    onEnd?.();
    return;
  }

  // Cancel any previous speech
  stopSpeaking();

  const { spokenText } = parseAgentResponse(rawResponse);
  const textToSpeak = spokenText;

  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    currentUtterance = utterance;

    // Voice params — calm, clear, not too fast
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Assign voice — might need to wait for voices to load
    const assignVoice = () => {
      const voice = selectBestVoice();
      if (voice) utterance.voice = voice;
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      assignVoice();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', assignVoice, { once: true });
    }

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      currentUtterance = null;
      onEnd?.();
      resolve();
    };

    utterance.onerror = (e) => {
      // 'interrupted' is normal when user cancels — not a real error
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('[AgentTTS] Speech error:', e.error);
      }
      currentUtterance = null;
      onEnd?.();
      resolve();
    };

    // Chrome bug: sometimes speech doesn't start — nudge it
    setTimeout(() => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        window.speechSynthesis.speak(utterance);
      }
    }, 50);

    window.speechSynthesis.speak(utterance);
  });
}
