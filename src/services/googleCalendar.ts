/**
 * googleCalendar.ts — Full bidirectional Google Calendar sync
 *
 * Uses Google Identity Services (GIS) OAuth + direct REST API calls.
 * Supports: create, update, delete, poll for external changes.
 *
 * REQUIRED SETUP:
 *   1. https://console.cloud.google.com → APIs & Services
 *   2. Enable "Google Calendar API"  ← MUST DO THIS
 *   3. Credentials → OAuth 2.0 Client ID (Web Application)
 *      Authorized JS Origins: http://localhost:5173, https://myzentrack.vercel.app
 *   4. Set VITE_GOOGLE_CALENDAR_CLIENT_ID in .env
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID as string | undefined;
const SCOPES = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// ZenTrack source tag stored on GCal events to identify them
const ZENTRACK_SOURCE_TAG = 'zentrack-autosync';

// In-memory token state (initialized from localStorage)
let _accessToken: string | null = localStorage.getItem('zen_gcal_access_token');
let _tokenExpiry: number = parseInt(localStorage.getItem('zen_gcal_token_expiry') || '0', 10);
let _tokenClient: any = null;
let _gisLoaded = false;

// Sync state
let _syncToken: string | null = null;
let _lastSyncTime: number = 0;

// ─── Script Loader ────────────────────────────────────────────────────────────

const loadGisScript = (): Promise<void> => {
  if (_gisLoaded) return Promise.resolve();
  const existing = document.getElementById('__gis_script__');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => { _gisLoaded = true; resolve(); });
      existing.addEventListener('error', reject);
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = '__gis_script__';
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => { _gisLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
};

// ─── Initialization ───────────────────────────────────────────────────────────

export const initGoogleCalendar = async (): Promise<boolean> => {
  if (!CLIENT_ID) {
    console.warn('[GoogleCalendar] VITE_GOOGLE_CALENDAR_CLIENT_ID is not set.');
    return false;
  }
  try {
    await loadGisScript();
    return true;
  } catch (err) {
    console.error('[GoogleCalendar] Failed to load GIS script:', err);
    return false;
  }
};

// ─── Token State ──────────────────────────────────────────────────────────────

export const isSignedInToGoogle = (): boolean =>
  !!_accessToken && Date.now() < _tokenExpiry;

const storeToken = (accessToken: string, expiresIn: number) => {
  _accessToken = accessToken;
  _tokenExpiry = Date.now() + Math.min(expiresIn * 1000, 55 * 60 * 1000);
  localStorage.setItem('zen_gcal_access_token', _accessToken);
  localStorage.setItem('zen_gcal_token_expiry', _tokenExpiry.toString());
};

// ─── OAuth Sign-in ────────────────────────────────────────────────────────────

export const signInWithGoogle = (): Promise<void> => {
  if (!CLIENT_ID) return Promise.reject(new Error('VITE_GOOGLE_CALENDAR_CLIENT_ID not set'));

  return new Promise((resolve, reject) => {
    const doRequest = () => {
      _tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          storeToken(response.access_token, response.expires_in ?? 3600);
          console.log('[GoogleCalendar] ✅ Token obtained');
          resolve();
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'OAuth failed'));
        },
      });
      _tokenClient.requestAccessToken({ prompt: '' });
    };

    if (_gisLoaded && (window as any).google?.accounts?.oauth2) {
      doRequest();
    } else {
      loadGisScript().then(doRequest).catch(reject);
    }
  });
};

export const signOutGoogle = (): void => {
  if (_accessToken && (window as any).google?.accounts?.oauth2) {
    try { (window as any).google.accounts.oauth2.revoke(_accessToken, () => {}); } catch {}
  }
  _accessToken = null;
  _tokenExpiry = 0;
  _tokenClient = null;
  _syncToken = null;
  _lastSyncTime = 0;
  localStorage.removeItem('zen_gcal_access_token');
  localStorage.removeItem('zen_gcal_token_expiry');
};

// ─── Token Refresh ────────────────────────────────────────────────────────────

const ensureToken = async (): Promise<string> => {
  if (isSignedInToGoogle() && _accessToken) return _accessToken;
  await signInWithGoogle();
  if (!_accessToken) throw new Error('Could not obtain Google access token');
  return _accessToken;
};

// ─── REST API Helper ──────────────────────────────────────────────────────────

const calendarFetch = async <T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<T> => {
  const token = await ensureToken();

  const res = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
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
  description?: string;
  type: string;
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
  description: event.description ?? `ZenTrack — ${event.type}`,
  start: { date: event.date },
  end: { date: nextDay(event.date) },
  extendedProperties: {
    private: {
      source: ZENTRACK_SOURCE_TAG,
      zentrackId: event.zentrackId ?? '',
      type: event.type,
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
export const addEventToGoogleCalendar = async (event: GCalEvent): Promise<string> => {
  const result = await calendarFetch<any>(
    '/calendars/primary/events',
    'POST',
    buildCalEventBody(event)
  );
  console.log('[GoogleCalendar] ✅ Created:', result?.summary, result?.id);
  return result.id as string;
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/** Updates an existing GCal event by its GCal event ID */
export const updateGoogleCalendarEvent = async (gcalEventId: string, event: GCalEvent): Promise<void> => {
  await calendarFetch<any>(
    `/calendars/primary/events/${gcalEventId}`,
    'PUT',
    buildCalEventBody(event)
  );
  console.log('[GoogleCalendar] ✅ Updated:', event.title);
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

/** Deletes a GCal event by its GCal event ID */
export const deleteGoogleCalendarEvent = async (gcalEventId: string): Promise<void> => {
  await calendarFetch<void>(`/calendars/primary/events/${gcalEventId}`, 'DELETE');
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
export const pollGoogleCalendarChanges = async (): Promise<GCalChangesResult> => {
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

  const data = await calendarFetch<{
    items?: GCalListEvent[];
    nextSyncToken?: string;
    nextPageToken?: string;
  }>(url);

  _syncToken = data.nextSyncToken ?? null;
  _lastSyncTime = Date.now();

  const items = data.items ?? [];
  const added: GCalListEvent[] = [];
  const deleted: string[] = [];

  for (const item of items) {
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
