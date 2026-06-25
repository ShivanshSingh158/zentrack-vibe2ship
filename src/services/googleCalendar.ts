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
const SCOPES = 'https://www.googleapis.com/auth/calendar ' +
               'https://www.googleapis.com/auth/gmail.readonly ' +
               'https://www.googleapis.com/auth/gmail.send ' +
               'https://www.googleapis.com/auth/gmail.modify ' +
               'https://www.googleapis.com/auth/drive.file ' +
               'https://www.googleapis.com/auth/documents ' +
               'https://www.googleapis.com/auth/spreadsheets ' +
               'https://www.googleapis.com/auth/generative-language.retriever';
// NOTE: 'generative-language' (full) scope is NOT used here.
// Gemini generateContent API only accepts API Keys, NOT OAuth bearer tokens.
// Attempting to request this scope causes Error 400: invalid_scope unless the
// GCP project has explicit Generative Language API enrollment + consent screen approval.
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

export const wasEverConnectedToGoogle = (): boolean =>
  !!localStorage.getItem('zen_gcal_access_token');

export const getTokenTimeRemaining = (): number =>
  _accessToken ? Math.max(0, _tokenExpiry - Date.now()) : 0;

let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

const storeToken = (accessToken: string, expiresIn: number) => {
  _accessToken = accessToken;
  _tokenExpiry = Date.now() + Math.min(expiresIn * 1000, 55 * 60 * 1000);
  localStorage.setItem('zen_gcal_access_token', _accessToken);
  localStorage.setItem('zen_gcal_token_expiry', _tokenExpiry.toString());

  // Schedule a proactive silent refresh 5 minutes before expiry
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const refreshIn = Math.max(0, _tokenExpiry - Date.now() - 5 * 60 * 1000);
  _refreshTimer = setTimeout(async () => {
    try {
      console.log('[GoogleCalendar] 🔄 Proactive token refresh triggered...');
      await signInWithGoogle();
      console.log('[GoogleCalendar] ✅ Token silently refreshed.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('google-token-refreshed'));
      }
    } catch (err) {
      console.warn('[GoogleCalendar] Silent refresh failed (user will be prompted on next action):', err);
    }
  }, refreshIn);
};

// ─── OAuth Sign-in ────────────────────────────────────────────────────────────

export const signInWithGoogle = (): Promise<void> => {
  if (!CLIENT_ID) return Promise.reject(new Error('VITE_GOOGLE_CALENDAR_CLIENT_ID not set'));

  return new Promise((resolve, reject) => {
    // Add a 45-second timeout safeguard so the auth panel state does not hang indefinitely if the popup is blocked
    const timeoutId = setTimeout(() => {
      reject(new Error('Authentication timed out or the Google authorization popup was blocked.'));
    }, 45000);

    const doRequest = () => {
      try {
        _tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (response: any) => {
            clearTimeout(timeoutId);
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            storeToken(response.access_token, response.expires_in ?? 3600);
            console.log('[GoogleCalendar] ✅ Token obtained');
            resolve();
          },
          error_callback: (err: any) => {
            clearTimeout(timeoutId);
            reject(new Error(err?.message || 'OAuth failed'));
          },
        });
        // Use prompt: 'select_account' so it reliably prompts user account chooser window
        _tokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (err: any) {
        clearTimeout(timeoutId);
        reject(new Error(err?.message || 'Failed to initialize Google Identity Services token client'));
      }
    };

    if (_gisLoaded && (window as any).google?.accounts?.oauth2) {
      doRequest();
    } else {
      loadGisScript()
        .then(doRequest)
        .catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
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

let _tokenRefreshPromise: Promise<string> | null = null;

export const ensureToken = async (): Promise<string> => {
  const BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  const isFresh = !!_accessToken && Date.now() < (_tokenExpiry - BUFFER_MS);
  if (isFresh && _accessToken) return _accessToken;
  
  if (_tokenRefreshPromise) {
    return _tokenRefreshPromise;
  }

  _tokenRefreshPromise = (async () => {
    try {
      await signInWithGoogle();
      if (!_accessToken) throw new Error('Could not obtain Google access token');
      return _accessToken;
    } finally {
      _tokenRefreshPromise = null;
    }
  })();

  return _tokenRefreshPromise;
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

  const data = await calendarFetch<{
    items?: GCalListEvent[];
    nextSyncToken?: string;
    nextPageToken?: string;
  }>(url, 'GET', undefined, signal);

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
