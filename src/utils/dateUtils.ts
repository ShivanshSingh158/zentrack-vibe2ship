export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    const monthName = MONTHS[parseInt(m, 10) - 1];
    return `${d}-${monthName}-${y}`;
  }
  return dateStr;
}



export function formatHoursDisplay(val: string | number | undefined): string {
  if (val === undefined || val === null || val === '') return '';
  
  // Try parsing as decimal hours
  const numVal = typeof val === 'string' ? parseFloat(val) : val;
  
  if (isNaN(numVal)) {
    // Maybe they typed "50 min" already, just return it
    return String(val);
  }

  // Convert decimal hours to minutes
  const totalMinutes = Math.round(numVal * 60);
  
  if (totalMinutes === 0) return '0 min';
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours > 0 && minutes > 0) {
    return `${hours} hr ${minutes} min`;
  } else if (hours > 0) {
    return `${hours} hr`;
  } else {
    return `${minutes} min`;
  }
}

/**
 * Checks if transcribed speech is empty, silence, background noise,
 * or STT hallucination (e.g. "[silence]", "Thank you.", "Task", etc.)
 */
export function isSilenceOrNoise(text: string | null | undefined): boolean {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  if (clean.length === 0) return true;

  if (/^[\s.?!,\-–—_"'`~*#@$%^&()\[\]{}|\\/<>:;+=]*$/.test(clean)) return true;

  const silenceTokens = [
    'silence',
    '[silence]',
    '(silence)',
    'blank audio',
    '[blank_audio]',
    '(blank_audio)',
    'background noise',
    '[background noise]',
    'coughing',
    '[coughing]',
    'music',
    '[music]',
    'thank you',
    'thank you.',
    'thanks',
    'thanks.',
    'subtitles by',
    'am',
    'task',
    'task.',
    'add task',
    'add task.',
    'unspecified',
    'unspecified.',
    'listening',
    'listening...',
    'sound of',
    'you',
    'the',
  ];

  if (silenceTokens.includes(clean)) return true;
  if (/^\[.*\]$/.test(clean) || /^\(.*\)$/.test(clean)) return true;
  if (clean.startsWith('subtitles by') || clean.startsWith('captioned by')) return true;

  return false;
}

