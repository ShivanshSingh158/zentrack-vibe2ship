import { ensureToken } from './googleCalendar';
import { localDatabase } from './localDatabase';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DOCS_API = 'https://docs.googleapis.com/v1/documents';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// ─── Core Fetch Helper (internal) ───────────────────────────────────────────

const workspaceFetch = async <T>(
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: object,
  extraHeaders?: Record<string, string>,
  signal?: AbortSignal
): Promise<T> => {
  const token = await ensureToken();

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
      throw new Error(`429 Rate Limited: retry after ${retryAfter}s`);
    }

    let errorMsg = `HTTP ${res.status}`;
    try {
      const errData = await res.json();
      errorMsg = errData?.error?.message || errorMsg;
    } catch (e) { console.error('Failed to parse API error response', e); }
    throw new Error(`Google Workspace API error: ${errorMsg}`);
  }

  if (method === 'DELETE') return undefined as T;
  return res.json() as Promise<T>;
};

// ─── GMAIL ──────────────────────────────────────────────────────────────────

export const fetchUnreadEmails = async (query: string = 'is:unread', signal?: AbortSignal) => {
  const cacheKey = `gmail_${query}`;
  const cached = await localDatabase.getGmailCache(cacheKey);

  const fetchFresh = async () => {
    try {
      const [profileData, data] = await Promise.all([
        workspaceFetch<any>(`${GMAIL_API}/profile`, 'GET', undefined, undefined, signal).catch(() => ({ emailAddress: 'unknown' })),
        workspaceFetch<any>(`${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=15`, 'GET', undefined, undefined, signal)
      ]);
      
      if (!data.messages) {
        const emptyData = { emails: [], emailAddress: profileData.emailAddress };
        await localDatabase.saveGmailCache(cacheKey, emptyData);
        return emptyData;
      }

      const detailPromises = data.messages.map((msg: any) => 
        workspaceFetch<any>(
          `${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=Message-ID`,
          'GET', undefined, undefined, signal
        ).then((details) => {
          const headers = details.payload.headers;
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
          const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
          const date = headers.find((h: any) => h.name === 'Date')?.value || '';
          return { id: msg.id, threadId: details.threadId, snippet: details.snippet, subject, from, date, labelIds: details.labelIds };
        })
      );

      const result = await Promise.all(detailPromises);
      const finalData = { emails: result, emailAddress: profileData.emailAddress };
      await localDatabase.saveGmailCache(cacheKey, finalData);
      return finalData;
    } catch (e) {
      console.error('[Gmail Sync Error]', e);
      throw e;
    }
  };

  if (cached) {
    // Stale-While-Revalidate: return cache instantly, update silently
    fetchFresh().catch(() => {});
    return cached.data;
  }

  return fetchFresh();
};

/** Fetch full Gmail conversation thread — all messages, not just latest unread.
 *  Powers: "What did I promise Rahul in our last 5 emails?" and meeting prep briefs.
 */
export const fetchEmailThread = async (threadIdOrQuery: string, signal?: AbortSignal) => {
  // Heuristic: a bare Gmail thread ID has no spaces and is ~16 hex chars
  const isThreadId = /^[0-9a-f]{10,}$/i.test(threadIdOrQuery.trim());
  let threadId: string | null = isThreadId ? threadIdOrQuery.trim() : null;

  if (!threadId) {
    // Resolve by search query (e.g. "from:rahul@co.in")
    const data = await workspaceFetch<any>(
      `${GMAIL_API}/messages?q=${encodeURIComponent(threadIdOrQuery)}&maxResults=1`,
      'GET', undefined, undefined, signal
    );
    if (!data.messages?.length) return { messages: [], threadId: null, messageCount: 0 };
    const firstMsg = await workspaceFetch<any>(
      `${GMAIL_API}/messages/${data.messages[0].id}?format=metadata`,
      'GET', undefined, undefined, signal
    );
    threadId = firstMsg.threadId;
  }

  const thread = await workspaceFetch<any>(
    `${GMAIL_API}/threads/${threadId}?format=metadata`,
    'GET', undefined, undefined, signal
  );
  const messages = (thread.messages || []).map((msg: any) => {
    const hdrs = msg.payload?.headers || [];
    const h = (n: string) => hdrs.find((x: any) => x.name === n)?.value || '';
    return { id: msg.id, threadId: msg.threadId, from: h('From'), to: h('To'), subject: h('Subject'), date: h('Date'), snippet: msg.snippet || '' };
  });
  return { messages, threadId, messageCount: messages.length };
};

export const sendEmail = async (to: string, subject: string, bodyText: string, signal?: AbortSignal) => {
  const rawEmail = `To: ${to}\r\n` +
                   `Subject: ${subject}\r\n` +
                   `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
                   `${bodyText}`;

  const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return await workspaceFetch<any>(`${GMAIL_API}/messages/send`, 'POST', { raw: encodedEmail }, undefined, signal);
};

export const createDraftEmail = async (to: string, subject: string, bodyText: string, signal?: AbortSignal) => {
  const rawEmail = `To: ${to}\r\n` +
                   `Subject: ${subject}\r\n` +
                   `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
                   `${bodyText}`;

  const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return await workspaceFetch<any>(`${GMAIL_API}/drafts`, 'POST', { message: { raw: encodedEmail } }, undefined, signal);
};

/** Reply to an existing email thread */
export const replyToEmail = async (threadId: string, to: string, subject: string, bodyText: string, signal?: AbortSignal) => {
  const rawEmail = `To: ${to}\r\n` +
                   `Subject: Re: ${subject}\r\n` +
                   `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
                   `${bodyText}`;

  const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return await workspaceFetch<any>(`${GMAIL_API}/messages/send`, 'POST', {
    raw: encodedEmail,
    threadId
  }, undefined, signal);
};

/** Archive (remove from INBOX) an email by message ID */
export const archiveEmail = async (messageId: string, signal?: AbortSignal) => {
  return await workspaceFetch<any>(`${GMAIL_API}/messages/${messageId}/modify`, 'POST', {
    removeLabelIds: ['INBOX']
  }, undefined, signal);
};

/** Permanently delete an email (moves to trash) */
export const trashEmail = async (messageId: string, signal?: AbortSignal) => {
  return await workspaceFetch<any>(`${GMAIL_API}/messages/${messageId}/trash`, 'POST', {}, undefined, signal);
};

// ─── SCRIBE ───────────────────────────────────────────────────────────────────

export const createGoogleDoc = async (title: string, signal?: AbortSignal) => {
  const data = await workspaceFetch<any>(DOCS_API, 'POST', { title }, undefined, signal);
  return {
    docId: data.documentId,
    url: `https://docs.google.com/document/d/${data.documentId}/edit`
  };
};

/** 
 * Writes richly-formatted content to a Google Doc.
 * 
 * Strategy: Upload as HTML via the Drive multipart API.
 * Google Docs automatically converts HTML tables, headings, bold,
 * italic, and lists into native Docs formatting. This is the only
 * reliable way to produce real tables — the Docs batchUpdate API
 * requires complex index tracking that breaks with any edit.
 * 
 * Markdown syntax supported:
 *   # H1  ## H2  ### H3
 *   **bold**  *italic*  ~~strikethrough~~
 *   - bullet  1. numbered
 *   | col | col |  (pipe tables → real Google Docs tables)
 *   ---  (horizontal rule)
 *   > blockquote
 *   `code`  ```code block```
 */
export const writeToGoogleDoc = async (docId: string, content: string, optionsOrSignal?: AbortSignal | { isHtml?: boolean; signal?: AbortSignal }) => {
  const signal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : (optionsOrSignal as any)?.signal;
  const token = await ensureToken();

  // ── Step 1: Convert Markdown → HTML ──────────────────────────────────────────
  const htmlBody = markdownToHtml(content);
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; margin: 72pt; }
  h1 { font-size: 20pt; font-weight: 700; color: #1a1a2e; border-bottom: 2pt solid #4a90d9; padding-bottom: 4pt; margin-top: 24pt; }
  h2 { font-size: 16pt; font-weight: 700; color: #1a1a2e; margin-top: 18pt; }
  h3 { font-size: 13pt; font-weight: 700; color: #2c3e50; margin-top: 14pt; }
  h4 { font-size: 11pt; font-weight: 700; color: #34495e; margin-top: 10pt; }
  p  { margin: 6pt 0; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  del { text-decoration: line-through; color: #888; }
  code { font-family: 'Courier New', monospace; font-size: 9.5pt; background: #f5f5f5; padding: 1pt 3pt; border-radius: 2pt; }
  pre  { font-family: 'Courier New', monospace; font-size: 9.5pt; background: #f5f5f5; padding: 10pt; border-left: 3pt solid #4a90d9; margin: 8pt 0; white-space: pre-wrap; }
  blockquote { border-left: 3pt solid #bdc3c7; margin: 8pt 0 8pt 20pt; padding-left: 10pt; color: #555; font-style: italic; }
  ul { margin: 4pt 0; padding-left: 22pt; }
  ol { margin: 4pt 0; padding-left: 22pt; }
  li { margin: 3pt 0; }
  hr { border: none; border-top: 1pt solid #bdc3c7; margin: 16pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
  th { background-color: #2c3e50; color: white; font-weight: 700; padding: 8pt 10pt; text-align: left; border: 1pt solid #2c3e50; font-size: 10pt; }
  td { padding: 7pt 10pt; border: 1pt solid #bdc3c7; font-size: 10pt; vertical-align: top; }
  tr:nth-child(even) td { background-color: #f8f9fa; }
  tr:hover td { background-color: #eaf2ff; }
  .highlight { background-color: #fff9c4; padding: 1pt 3pt; }
</style>
</head>
<body>${htmlBody}</body>
</html>`;

  // ── Step 2: Upload as HTML to Drive — Docs auto-converts it ──────────────────
  const boundary = '-------314159265358979323846';
  const metadata = JSON.stringify({
    mimeType: 'application/vnd.google-apps.document',
  });

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    fullHtml,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${docId}?uploadType=multipart&convert=true`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
      signal,
    }
  );

  if (!res.ok) {
    let errMsg = `Drive upload HTTP ${res.status}`;
    try { const e = await res.json(); errMsg = e?.error?.message || errMsg; } catch {}
    throw new Error(`Google Doc write failed: ${errMsg}`);
  }

  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
};

/**
 * Converts Markdown text to HTML.
 * Handles: headings, bold, italic, strikethrough, code, blockquotes,
 *          horizontal rules, unordered + ordered lists, and pipe tables.
 */
function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let codeAccum: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableIsHeader = true;
  let inUl = false;
  let inOl = false;

  const flushTable = () => {
    if (!tableRows.length) return;
    out.push('<table>');
    tableRows.forEach((cells, ri) => {
      if (ri === 0) {
        out.push('<tr>' + cells.map(c => `<th>${inlineFormat(c)}</th>`).join('') + '</tr>');
      } else {
        out.push('<tr>' + cells.map(c => `<td>${inlineFormat(c)}</td>`).join('') + '</tr>');
      }
    });
    out.push('</table>');
    tableRows = [];
    inTable = false;
    tableIsHeader = true;
  };

  const flushList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw;

    // ── Fenced code blocks ────────────────────────────────────────────────────
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeAccum = [];
      } else {
        inCodeBlock = false;
        flushList();
        if (inTable) flushTable();
        out.push(`<pre>${escHtml(codeAccum.join('\n'))}</pre>`);
      }
      continue;
    }
    if (inCodeBlock) { codeAccum.push(raw); continue; }

    // ── Pipe tables ───────────────────────────────────────────────────────────
    if (line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')) {
      // Skip separator rows (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) { tableIsHeader = false; continue; }
      flushList();
      inTable = true;
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // ── Headings ──────────────────────────────────────────────────────────────
    const h4Match = line.match(/^#### (.+)/);
    const h3Match = line.match(/^### (.+)/);
    const h2Match = line.match(/^## (.+)/);
    const h1Match = line.match(/^# (.+)/);
    if (h4Match) { flushList(); out.push(`<h4>${inlineFormat(h4Match[1])}</h4>`); continue; }
    if (h3Match) { flushList(); out.push(`<h3>${inlineFormat(h3Match[1])}</h3>`); continue; }
    if (h2Match) { flushList(); out.push(`<h2>${inlineFormat(h2Match[1])}</h2>`); continue; }
    if (h1Match) { flushList(); out.push(`<h1>${inlineFormat(h1Match[1])}</h1>`); continue; }

    // ── Horizontal rules ──────────────────────────────────────────────────────
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      flushList();
      out.push('<hr>');
      continue;
    }

    // ── Blockquote ────────────────────────────────────────────────────────────
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) { flushList(); out.push(`<blockquote>${inlineFormat(bqMatch[1])}</blockquote>`); continue; }

    // ── Unordered list ────────────────────────────────────────────────────────
    const ulMatch = line.match(/^(\s*)[*\-+]\s(.+)/);
    if (ulMatch) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineFormat(ulMatch[2])}</li>`);
      continue;
    }

    // ── Ordered list ──────────────────────────────────────────────────────────
    const olMatch = line.match(/^\d+\.\s(.+)/);
    if (olMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // ── Blank line / paragraph break ──────────────────────────────────────────
    if (line.trim() === '') {
      flushList();
      // Only add <br> between paragraphs, not tables/headings
      if (out.length > 0 && !out[out.length - 1].startsWith('<h') && !out[out.length - 1].startsWith('<table') && !out[out.length - 1].startsWith('<pre') && !out[out.length - 1] === '</ul>' as any) {
        out.push('<br>');
      }
      continue;
    }

    // ── Normal paragraph ──────────────────────────────────────────────────────
    flushList();
    out.push(`<p>${inlineFormat(line)}</p>`);
  }

  // Flush any open blocks
  if (inCodeBlock) out.push(`<pre>${escHtml(codeAccum.join('\n'))}</pre>`);
  if (inTable) flushTable();
  flushList();

  return out.join('\n');
}

/** Apply inline formatting: bold, italic, strikethrough, code, links */
function inlineFormat(text: string): string {
  return text
    // Code (must come first to avoid processing its contents)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold+italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Links
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    // Escape remaining HTML
    .replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, '&amp;');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ─── ARCHIVE ──────────────────────────────────────────────────────────────────

/** Moves a file to the trash in Google Drive */
export const trashDriveFile = async (fileId: string, signal?: AbortSignal) => {
  return await workspaceFetch<any>(`${DRIVE_API}/${fileId}`, 'PATCH', { trashed: true }, undefined, signal);
};

export const searchGoogleDrive = async (query: string, signal?: AbortSignal) => {
  const data = await workspaceFetch<any>(
    `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink,modifiedTime,size)&pageSize=10&orderBy=modifiedTime desc`,
    'GET', undefined, undefined, signal
  );
  return data.files || [];
};

/** List recent files in Drive without a search query */
export const listDriveFiles = async (pageSize = 15, signal?: AbortSignal) => {
  const data = await workspaceFetch<any>(
    `${DRIVE_API}?fields=files(id,name,mimeType,webViewLink,modifiedTime)&pageSize=${pageSize}&orderBy=modifiedTime desc`,
    'GET', undefined, undefined, signal
  );
  return data.files || [];
};

/** Open a specific file in the browser by Drive file ID */
export const openDriveFile = async (fileId: string, signal?: AbortSignal): Promise<{ url: string; name: string; mimeType: string }> => {
  const data = await workspaceFetch<any>(`${DRIVE_API}/${fileId}?fields=id,name,mimeType,webViewLink,exportLinks`, 'GET', undefined, undefined, signal);
  const url = data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  // Auto-open the file in a new tab
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }

  return { url, name: data.name, mimeType: data.mimeType };
};

/** Get the PDF export link for a Google Doc/Sheet */
export const getFilePdfLink = async (fileId: string, signal?: AbortSignal): Promise<string> => {
  const data = await workspaceFetch<any>(`${DRIVE_API}/${fileId}?fields=exportLinks`, 'GET', undefined, undefined, signal);
  const pdfUrl = data.exportLinks?.['application/pdf'];
  if (!pdfUrl) throw new Error('This file cannot be exported as PDF (not a Google Docs/Sheets file)');
  return pdfUrl;
};

// ─── CALENDAR ───────────────────────────────────────────────────────────────

/** List calendar events for a specific date */
export const listCalendarEventsOnDate = async (date: string, signal?: AbortSignal) => {
  const cacheKey = `cal_${date}`;
  const cached = await localDatabase.getCalendarCache(cacheKey);

  const fetchFresh = async () => {
    try {
      const timeMin = new Date(date + 'T00:00:00').toISOString();
      const timeMax = new Date(date + 'T23:59:59').toISOString();
      const data = await workspaceFetch<any>(
        `${CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
        'GET', undefined, undefined, signal
      );
      const items = data.items || [];
      await localDatabase.saveCalendarCache(cacheKey, items);
      return items;
    } catch (e) {
      console.error('[Calendar Sync Error]', e);
      throw e;
    }
  };

  if (cached) {
    // Stale-While-Revalidate: return cache instantly, update silently
    fetchFresh().catch(() => {});
    return cached.data;
  }

  return fetchFresh();
};

/** Update an existing calendar event (patch by event ID) */
export const updateCalendarEvent = async (eventId: string, changes: {
  title?: string;
  startDateTime?: string;
  endDateTime?: string;
  description?: string;
  location?: string;
  attendees?: string[];
}, signal?: AbortSignal) => {
  const patch: any = {};
  if (changes.title) patch.summary = changes.title;
  if (changes.description) patch.description = changes.description;
  if (changes.location) patch.location = changes.location;
  if (changes.startDateTime) patch.start = { dateTime: changes.startDateTime };
  if (changes.endDateTime) patch.end = { dateTime: changes.endDateTime };
  if (changes.attendees) patch.attendees = changes.attendees.map(email => ({ email }));

  const data = await workspaceFetch<any>(
    `${CALENDAR_API}/calendars/primary/events/${eventId}`,
    'PATCH',
    patch,
    undefined,
    signal
  );
  return { eventId: data.id, htmlLink: data.htmlLink };
};

// ─── GOOGLE MEET ─────────────────────────────────────────────────────────────

/** Creates a Google Calendar event WITH an attached Google Meet conference link */
export const createGoogleMeet = async (params: {
  title: string;
  startDateTime: string;  // ISO 8601
  endDateTime: string;    // ISO 8601
  description?: string;
  attendees?: string[];   // Email addresses
}, signal?: AbortSignal): Promise<{ meetLink: string; eventId: string; calendarLink: string }> => {
  const body: any = {
    summary: params.title,
    description: params.description || 'Created by ZenTrack AI Agent',
    start: { dateTime: params.startDateTime },
    end: { dateTime: params.endDateTime },
    conferenceData: {
      createRequest: {
        requestId: `zen-meet-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };

  if (params.attendees && params.attendees.length > 0) {
    body.attendees = params.attendees.map(email => ({ email }));
  }

  const data = await workspaceFetch<any>(
    `${CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1`,
    'POST',
    body,
    undefined,
    signal
  );

  const meetLink = data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri
    || data.hangoutLink
    || 'https://meet.google.com';

  // Auto-open the Meet link if it's happening now (within 10 minutes)
  const startTime = new Date(params.startDateTime).getTime();
  const now = Date.now();
  if (Math.abs(startTime - now) < 10 * 60 * 1000 && typeof window !== 'undefined') {
    window.open(meetLink, '_blank');
  }

  return {
    meetLink,
    eventId: data.id,
    calendarLink: data.htmlLink
  };
};

// ─── GOOGLE DOCS — READ ─────────────────────────────────────────────────────
// ✅ BUG-C2 / ISSUE-T6 FIX: Implement the missing read_google_doc service function.
// ARCHIVE and SCRIBE both had read_google_doc in their tool whitelists but the
// executor had no case for it — it fell through to "Unknown tool" every time.
// This function reads a Doc via the Docs API and extracts all paragraph text.
export const readGoogleDoc = async (fileId: string, signal?: AbortSignal): Promise<{ title: string; content: string; charCount: number }> => {
  // Strip any URL prefix if user passed the full Doc URL instead of the ID
  const docId = fileId.replace(/.*\/document\/d\/([a-zA-Z0-9_-]+).*/i, '$1');

  const data = await workspaceFetch<any>(
    `${DOCS_API}/${docId}?fields=title,body`,
    'GET',
    undefined,
    undefined,
    signal
  );

  // Walk the document body content array and extract all paragraph text
  const lines: string[] = [];
  for (const el of (data.body?.content || [])) {
    if (!el.paragraph) continue;
    const lineText = (el.paragraph.elements || [])
      .map((e: any) => e.textRun?.content || '')
      .join('');
    if (lineText.trim()) lines.push(lineText.trimEnd());
  }

  const content = lines.join('\n');
  return {
    title: data.title || 'Untitled',
    content,
    charCount: content.length,
  };
};

