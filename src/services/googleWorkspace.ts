import { ensureToken } from './googleCalendar';
import { localDatabase } from './localDatabase';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DOCS_API = 'https://docs.googleapis.com/v1/documents';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// ─── Core Fetch Helper ───────────────────────────────────────────────────────

export const workspaceFetch = async <T>(
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

/** Appends text content to an existing Google Doc with basic Markdown parsing */
export const writeToGoogleDoc = async (docId: string, content: string, signal?: AbortSignal) => {
  const requests: any[] = [];
  let currentIndex = 1; // Google Docs text index is 1-based
  let rawText = '';
  
  const lines = content.split('\n');
  const bulletRanges: { start: number; end: number }[] = [];
  
  for (const line of lines) {
    let processLine = line;
    let headingType: string | null = null;
    let isBullet = false;
    
    // Parse Headings
    if (processLine.startsWith('# ')) {
      headingType = 'HEADING_1';
      processLine = processLine.substring(2);
    } else if (processLine.startsWith('## ')) {
      headingType = 'HEADING_2';
      processLine = processLine.substring(3);
    } else if (processLine.startsWith('### ')) {
      headingType = 'HEADING_3';
      processLine = processLine.substring(4);
    }
    // Parse Bullets (we only support top-level bullets for simplicity)
    else if (processLine.startsWith('- ') || processLine.startsWith('* ')) {
      isBullet = true;
      processLine = processLine.substring(2);
    }
    
    const boldRanges: { start: number; end: number }[] = [];
    const italicRanges: { start: number; end: number }[] = [];
    
    // Parse Bold (**text**)
    let boldMatch;
    while ((boldMatch = /\*\*(.*?)\*\*/.exec(processLine)) !== null) {
      const matchText = boldMatch[1];
      const matchStart = boldMatch.index;
      processLine = processLine.substring(0, matchStart) + matchText + processLine.substring(matchStart + matchText.length + 4);
      boldRanges.push({ start: currentIndex + matchStart, end: currentIndex + matchStart + matchText.length });
    }
    
    // Parse Italic (*text*)
    let italicMatch;
    while ((italicMatch = /\*(.*?)\*/.exec(processLine)) !== null) {
      const matchText = italicMatch[1];
      const matchStart = italicMatch.index;
      processLine = processLine.substring(0, matchStart) + matchText + processLine.substring(matchStart + matchText.length + 2);
      italicRanges.push({ start: currentIndex + matchStart, end: currentIndex + matchStart + matchText.length });
    }

    const lineStart = currentIndex;
    rawText += processLine + '\n';
    const lineEnd = currentIndex + processLine.length + 1; // +1 for the newline
    
    if (headingType) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: lineStart, endIndex: lineEnd },
          paragraphStyle: { namedStyleType: headingType },
          fields: 'namedStyleType'
        }
      });
    }
    
    if (isBullet) {
      bulletRanges.push({ start: lineStart, end: lineEnd });
    }
    
    for (const r of boldRanges) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: r.start, endIndex: r.end },
          textStyle: { bold: true },
          fields: 'bold'
        }
      });
    }
    
    for (const r of italicRanges) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: r.start, endIndex: r.end },
          textStyle: { italic: true },
          fields: 'italic'
        }
      });
    }
    
    currentIndex = lineEnd;
  }
  
  if (bulletRanges.length > 0) {
    for (const br of bulletRanges) {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: br.start, endIndex: br.end },
          bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE'
        }
      });
    }
  }
  
  // The first request MUST be the text insertion. All subsequent styling requests 
  // will apply perfectly since we tracked indices based on the rawText structure.
  const finalRequests = [
    {
      insertText: {
        location: { index: 1 },
        text: rawText
      }
    },
    ...requests
  ];

  await workspaceFetch<any>(`${DOCS_API}/${docId}:batchUpdate`, 'POST', {
    requests: finalRequests
  }, undefined, signal);
  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
};

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

// ─── GOOGLE SHEETS ───────────────────────────────────────────────────────────

export const createGoogleSheet = async (title: string, signal?: AbortSignal) => {
  const data = await workspaceFetch<any>(SHEETS_API, 'POST', {
    properties: { title }
  }, undefined, signal);
  return {
    sheetId: data.spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`
  };
};
