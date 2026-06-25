import { ensureToken } from './googleCalendar';

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
    } catch {}
    throw new Error(`Google Workspace API error: ${errorMsg}`);
  }

  if (method === 'DELETE') return undefined as T;
  return res.json() as Promise<T>;
};

// ─── GMAIL ──────────────────────────────────────────────────────────────────

let _gmailCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 60000; // 1 minute cache

export const fetchUnreadEmails = async (query: string = 'is:unread', signal?: AbortSignal) => {
  if (_gmailCache && Date.now() - _gmailCache.timestamp < CACHE_TTL) {
    return _gmailCache.data; // Return cached result within same session
  }

  const data = await workspaceFetch<any>(`${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=5`, 'GET', undefined, undefined, signal);
  if (!data.messages) return [];

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
  _gmailCache = { data: result, timestamp: Date.now() };
  return result;
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

/** Appends text content to an existing Google Doc */
export const writeToGoogleDoc = async (docId: string, content: string, signal?: AbortSignal) => {
  await workspaceFetch<any>(`${DOCS_API}/${docId}:batchUpdate`, 'POST', {
    requests: [
      {
        insertText: {
          location: { index: 1 },
          text: content + '\n'
        }
      }
    ]
  }, undefined, signal);
  return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
};

// ─── ARCHIVE ──────────────────────────────────────────────────────────────────

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
  const timeMin = new Date(date + 'T00:00:00').toISOString();
  const timeMax = new Date(date + 'T23:59:59').toISOString();
  const data = await workspaceFetch<any>(
    `${CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    'GET', undefined, undefined, signal
  );
  return data.items || [];
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
