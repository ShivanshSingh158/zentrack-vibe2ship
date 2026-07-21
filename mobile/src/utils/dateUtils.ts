const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

export function parseNLDate(text: string): { date: string | null; timeSlot: string | null; cleanTitle: string; multiDays?: number } {
  const now = new Date();
  let dateResult: Date | null = null;
  let timeSlot: string | null = null;
  let multiDays: number | undefined;
  let cleaned = text;

  const timeMatch1 = cleaned.match(/\bat\s?(\d{1,2})(?::(\d{2}))?\s?(am|pm)?/i);
  const timeMatch2 = cleaned.match(/\b(\d{1,2}):(\d{2})\s?(am|pm)\b/i);
  const timeMatch3 = cleaned.match(/\b(\d{1,2})\s?(am|pm)\b/i);

  let matchStr = '';
  let hours = 0;
  let mins = 0;
  let period = '';

  if (timeMatch1) {
    hours = parseInt(timeMatch1[1], 10);
    mins = timeMatch1[2] ? parseInt(timeMatch1[2], 10) : 0;
    period = (timeMatch1[3] || '').toLowerCase();
    matchStr = timeMatch1[0];
  } else if (timeMatch2) {
    hours = parseInt(timeMatch2[1], 10);
    mins = parseInt(timeMatch2[2], 10);
    period = (timeMatch2[3] || '').toLowerCase();
    matchStr = timeMatch2[0];
  } else if (timeMatch3) {
    hours = parseInt(timeMatch3[1], 10);
    period = (timeMatch3[2] || '').toLowerCase();
    matchStr = timeMatch3[0];
  }

  if (matchStr) {
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    timeSlot = `${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`;
    cleaned = cleaned.replace(matchStr, '').trim();
  }

  // "today"
  if (/\btoday\b/i.test(cleaned)) {
    dateResult = new Date(now);
    cleaned = cleaned.replace(/\btoday\b/i, '').trim();
  }
  // "tomorrow"
  else if (/\btomorrow\b/i.test(cleaned)) {
    dateResult = new Date(now);
    dateResult.setDate(dateResult.getDate() + 1);
    cleaned = cleaned.replace(/\btomorrow\b/i, '').trim();
  }
  // "for next N days"
  else if (/\b(?:for\s+)?(?:the\s+)?next\s+(\d+)\s+days?\b/i.test(cleaned)) {
    const m = cleaned.match(/\b(?:for\s+)?(?:the\s+)?next\s+(\d+)\s+days?\b/i)!;
    multiDays = parseInt(m[1], 10);
    dateResult = new Date(now);
    cleaned = cleaned.replace(m[0], '').trim();
  }
  // "in N days" (single future date)
  else if (/\bin\s+(\d+)\s+days?\b/i.test(cleaned)) {
    const m = cleaned.match(/\bin\s+(\d+)\s+days?\b/i)!;
    dateResult = new Date(now);
    dateResult.setDate(dateResult.getDate() + parseInt(m[1], 10));
    cleaned = cleaned.replace(m[0], '').trim();
  }
  // "in N weeks"
  else if (/\bin\s+(\d+)\s+weeks?\b/i.test(cleaned)) {
    const m = cleaned.match(/\bin\s+(\d+)\s+weeks?\b/i)!;
    dateResult = new Date(now);
    dateResult.setDate(dateResult.getDate() + parseInt(m[1], 10) * 7);
    cleaned = cleaned.replace(m[0], '').trim();
  }
  // "next monday" / "monday"
  else {
    for (let di = 0; di < DAY_NAMES.length; di++) {
      const dayName = DAY_NAMES[di];
      const nextKw = new RegExp(`\\bnext\\s+${dayName}\\b`, 'i');
      const plainKw = new RegExp(`\\b${dayName}\\b`, 'i');
      if (nextKw.test(cleaned) || plainKw.test(cleaned)) {
        const target = di;
        const cur = now.getDay();
        let diff = target - cur;
        if (nextKw.test(cleaned)) diff = diff <= 0 ? diff + 7 : diff + 7;
        else if (diff <= 0) diff += 7;
        dateResult = new Date(now);
        dateResult.setDate(dateResult.getDate() + diff);
        cleaned = cleaned.replace(nextKw.test(cleaned) ? nextKw : plainKw, '').trim();
        break;
      }
    }
  }

  // Clean up leading/trailing punctuation
  cleaned = cleaned.replace(/^[,\s]+|[,\s]+$/g, '').trim();

  const dateStr = dateResult
    ? dateResult.toISOString().slice(0, 10)
    : null;

  return { date: dateStr, timeSlot, cleanTitle: cleaned || text, multiDays };
}

export function timeAgo(dateInput: any): string {
  if (!dateInput) return '';
  let date: Date;
  if (typeof dateInput.toDate === 'function') {
    date = dateInput.toDate();
  } else if (typeof dateInput.toMillis === 'function') {
    date = new Date(dateInput.toMillis());
  } else if (typeof dateInput === 'number' || typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return '';
  }

  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `1 day ago`;
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return `1 month ago`;
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? `1 year ago` : `${years} years ago`;
}
