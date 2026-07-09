
import { contextStorage } from './firebase';

export class GoogleNotConnectedError extends Error {
  constructor() {
    super('Google Workspace is not connected.');
    this.name = 'GoogleNotConnectedError';
  }
}

export const ensureToken = async (): Promise<string> => {
  const token = contextStorage.getStore()?.googleAccessToken;
  if (!token) throw new GoogleNotConnectedError();
  return token;
};

// ─── REST API Helper ──────────────────────────────────────────────────────────

const calendarFetch = async <T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: object,
  signal?: AbortSignal
): Promise<T> => {
  const token = await ensureToken();

  const res = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
      // Surface the API-not-enabled URL for easy fixing
      if (errData?.error?.errors?.[0]?.reason === 'accessNotConfigured') {
        const detailsUrl = errData.error.errors[0]?.extendedHelp || '';
        throw new Error(`Google Calendar API is not enabled. Enable it at: ${detailsUrl || 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'}`);
      }
    } catch (e: any) {
      if (e.message.includes('not enabled') || e.message.includes('Enable it')) throw e;
    }
    throw new Error(`Google Calendar API error: ${errorMsg}`);
  }

  if (method === 'DELETE') return undefined as T;
  return res.json() as Promise<T>;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GCalEvent {
  title: string;
  date: string;        // YYYY-MM-DD
  startDateTime?: string; // ISO String
  endDateTime?: string;   // ISO String
  description?: string;
  location?: string;
  attendees?: string[];
  type?: string;
  zentrackId?: string; // Firestore document ID — stored in GCal for dedup
}

export interface GCalListEvent {
  id: string;
  summary: string;
  description?: string;
  status?: string;     // 'cancelled' for deleted events
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  htmlLink: string;
  extendedProperties?: {
    private?: { source?: string; zentrackId?: string; type?: string };
  };
}

// ─── Date Helper ─────────────────────────────────────────────────────────────

const nextDay = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

const buildCalEventBody = (event: GCalEvent) => ({
  summary: event.title,
  description: event.description ?? `ZenTrack — ${event.type || 'Event'}`,
  location: event.location,
  attendees: event.attendees?.map(email => ({ email })),
  start: event.startDateTime ? { dateTime: event.startDateTime } : { date: event.date },
  end: event.endDateTime ? { dateTime: event.endDateTime } : { date: nextDay(event.date) },
  extendedProperties: {
    private: {
      source: ZENTRACK_SOURCE_TAG,
      zentrackId: event.zentrackId ?? '',
      type: event.type || 'auto-scheduled',
    },
  },
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 24 * 60 },
      { method: 'popup', minutes: 60 },
    ],
  },
});

// ─── CREATE ───────────────────────────────────────────────────────────────────

/** Creates event in Google Calendar and returns the GCal event ID */
export const addEventToGoogleCalendar = async (event: GCalEvent, signal?: AbortSignal): Promise<string> => {
  const result = await calendarFetch<any>(
    '/calendars/primary/events',
    'POST',
    buildCalEventBody(event),
    signal
  );
  console.log('[GoogleCalendar] ✅ Created:', result?.summary, result?.id);
  return result.id as string;
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/** Updates an existing GCal event by its GCal event ID */
export const updateGoogleCalendarEvent = async (gcalEventId: string, event: GCalEvent, signal?: AbortSignal): Promise<void> => {
  await calendarFetch<any>(
    `/calendars/primary/events/${gcalEventId}`,
    'PUT',
    buildCalEventBody(event),
    signal
  );
  console.log('[GoogleCalendar] ✅ Updated:', event.title);
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

/** Deletes a GCal event by its GCal event ID */
export const deleteGoogleCalendarEvent = async (gcalEventId: string, signal?: AbortSignal): Promise<void> => {
  await calendarFetch<void>(`/calendars/primary/events/${gcalEventId}`, 'DELETE', undefined, signal);
  console.log('[GoogleCalendar] ✅ Deleted gcalId:', gcalEventId);
};

// ─── POLL FOR CHANGES ────────────────────────────────────────────────────────

export interface GCalChangesResult {
  added: GCalListEvent[];      // New events added externally (not from ZenTrack)
  deleted: string[];           // GCal IDs of deleted events
  nextSyncToken: string | null;
}

/**
 * Polls Google Calendar for changes since last sync.
 * First call does a full initial sync; subsequent calls use syncToken.
 */
export const pollGoogleCalendarChanges = async (signal?: AbortSignal): Promise<GCalChangesResult> => {
  let url: string;

  if (_syncToken) {
    // Incremental sync using the syncToken from last poll
    url = `/calendars/primary/events?syncToken=${encodeURIComponent(_syncToken)}&singleEvents=true`;
  } else {
    // Initial full sync — fetch events from 90 days ago to 180 days ahead
    const timeMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    url = `/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&maxResults=250`;
  }

  // ✅ FIX: Handle nextPageToken — without this, >250 events were silently truncated
  const allItems: GCalListEvent[] = [];
  let currentUrl = url;

  while (currentUrl) {
    const data = await calendarFetch<{
      items?: GCalListEvent[];
      nextSyncToken?: string;
      nextPageToken?: string;
    }>(currentUrl, 'GET', undefined, signal);

    if (data.nextSyncToken) {
      _syncToken = data.nextSyncToken;
    }
    _lastSyncTime = Date.now();

    const pageItems = data.items ?? [];
    allItems.push(...pageItems);

    // If there are more pages, follow them
    if (data.nextPageToken) {
      const baseUrl = currentUrl.split('&pageToken=')[0];
      currentUrl = `${baseUrl}&pageToken=${encodeURIComponent(data.nextPageToken)}`;
    } else {
      break;
    }
  }

  const added: GCalListEvent[] = [];
  const deleted: string[] = [];

  for (const item of allItems) {
    if (item.status === 'cancelled') {
      deleted.push(item.id);
      continue;
    }
    // Skip events we created from ZenTrack (identified by extendedProperties)
    const isFromZentrack = item.extendedProperties?.private?.source === ZENTRACK_SOURCE_TAG;
    if (!isFromZentrack) {
      added.push(item);
    }
  }

  return { added, deleted, nextSyncToken: _syncToken };
};

export const getLastSyncTime = (): number => _lastSyncTime;

// ─── BATCH EXPORT ─────────────────────────────────────────────────────────────

export const exportEventsToGoogleCalendar = async (
  events: GCalEvent[],
  onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number; gcalIds: Record<string, string> }> => {
  let success = 0;
  let failed = 0;
  const gcalIds: Record<string, string> = {};

  for (let i = 0; i < events.length; i++) {
    try {
      const gcalId = await addEventToGoogleCalendar(events[i]);
      if (events[i].zentrackId) gcalIds[events[i].zentrackId!] = gcalId;
      success++;
    } catch (err) {
      console.error('[GoogleCalendar] Export failed:', events[i].title, err);
      failed++;
    }
    onProgress?.(i + 1, events.length);
  }

  return { success, failed, gcalIds };
};
