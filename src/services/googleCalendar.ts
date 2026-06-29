/**
 * googleCalendar.ts — Full bidirectional Google Calendar sync
 *
 * Uses Google Identity Services (GIS) OAuth Authorization Code Flow
 * Supports offline access and background auto-refresh via /api/auth/refresh
 * Supports: create, update, delete, poll for external changes.
 *
 * REQUIRED SETUP:
 *   1. https://console.cloud.google.com → APIs & Services
 *   2. Enable "Google Calendar API"  ← MUST DO THIS
 *   3. Credentials → OAuth 2.0 Client ID (Web Application)
 *      Authorized JS Origins: http://localhost:5173, https://myzentrack.vercel.app
 *   4. Set VITE_GOOGLE_CALENDAR_CLIENT_ID in .env
 */

import { auth } from './firebase';

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
  if ((window as any).google?.accounts?.oauth2) {
    _gisLoaded = true;
    return Promise.resolve();
  }
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

    // If we have a refresh token and the current access token is expired (or close to it)
    if (localStorage.getItem('zen_gcal_refresh_token') && Date.now() > _tokenExpiry - 10 * 60 * 1000) {
      try {
        await forceSilentRefresh();
      } catch (err) {
        console.warn('[GoogleCalendar] Initial silent refresh failed:', err);
      }
    }

    return true;
  } catch (err) {
    console.error('[GoogleCalendar] Failed to load GIS script:', err);
    return false;
  }
};

// ─── Token State ──────────────────────────────────────────────────────────────

// ✅ FIX BUG 4: Was evaluated at module init — stale localStorage could show connected when offline.
// Now also checks navigator.onLine and adds a 5-minute buffer before expiry to prevent
// stale-token API failures when the token is about to expire.
export const isSignedInToGoogle = (): boolean => {
  if (!navigator.onLine) return false; // offline — don't pretend we're connected
  if (!_accessToken) return false;
  const BUFFER_MS = 5 * 60 * 1000; // 5min buffer before expiry
  return Date.now() < (_tokenExpiry - BUFFER_MS);
};

export const wasEverConnectedToGoogle = (): boolean =>
  !!localStorage.getItem('zen_gcal_access_token');

export const getTokenTimeRemaining = (): number =>
  _accessToken ? Math.max(0, _tokenExpiry - Date.now()) : 0;

let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

export const forceSilentRefresh = async (): Promise<void> => {
  console.log('[GoogleCalendar] 🔄 Proactive token refresh triggered...');
  const refreshToken = localStorage.getItem('zen_gcal_refresh_token');
  if (!refreshToken) throw new Error('No refresh token available for silent refresh');
  
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  
  if (!res.ok) throw new Error('Failed to refresh token from server');
  const data = await res.json();
  // Don't call storeToken here if it creates a loop, wait, storeToken is what sets the timer.
  // Actually, we can just call storeToken from here!
  storeToken(data.access_token, data.expires_in, data.refresh_token);
  console.log('[GoogleCalendar] ✅ Token silently refreshed.');
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('google-token-refreshed'));
  }
};

const storeToken = (accessToken: string, expiresIn: number, refreshToken?: string) => {
  _accessToken = accessToken;
  _tokenExpiry = Date.now() + Math.min(expiresIn * 1000, 55 * 60 * 1000);
  localStorage.setItem('zen_gcal_access_token', _accessToken);
  localStorage.setItem('zen_gcal_token_expiry', _tokenExpiry.toString());
  if (refreshToken) {
    localStorage.setItem('zen_gcal_refresh_token', refreshToken);
  }

  // Schedule a proactive silent refresh 5 minutes before expiry
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const refreshIn = Math.max(0, _tokenExpiry - Date.now() - 5 * 60 * 1000);
  _refreshTimer = setTimeout(async () => {
    try {
      await forceSilentRefresh();
    } catch (err) {
      console.warn('[GoogleCalendar] Silent refresh failed:', err);
      // If it fails, clear token to force re-auth
      _accessToken = null;
      localStorage.removeItem('zen_gcal_access_token');
      localStorage.removeItem('zen_gcal_token_expiry');
    }
  }, refreshIn);
};

// ─── OAuth Sign-in ────────────────────────────────────────────────────────────

let _isAuthFailingLoop = false;

export const signInWithGoogle = async (): Promise<void> => {
  if (!CLIENT_ID) return Promise.reject(new Error('VITE_GOOGLE_CALENDAR_CLIENT_ID not set'));
  
  if (_isAuthFailingLoop) {
    return Promise.reject(new Error('Auth is in a failing loop. Please restart the app.'));
  }

  // Attempt silent refresh first if we have a refresh token
  if (localStorage.getItem('zen_gcal_refresh_token')) {
    try {
      await forceSilentRefresh();
      return; // Success! No popup needed.
    } catch (err) {
      console.warn('[GoogleCalendar] signInWithGoogle silent refresh fallback failed, prompting user...', err);
      // Fall through to manual popup
    }
  }

  return new Promise((resolve, reject) => {
    // Add a 45-second timeout safeguard so the auth panel state does not hang indefinitely if the popup is blocked
    const timeoutId = setTimeout(() => {
      reject(new Error('Authentication timed out or the Google authorization popup was blocked.'));
    }, 45000);

    const doRequest = () => {
      try {
        const needsConsent = !localStorage.getItem('zen_gcal_refresh_token');
        const authConfig: any = {
          client_id: CLIENT_ID,
          scope: SCOPES,
          ux_mode: 'popup',
          access_type: 'offline', // Crucial for getting a refresh_token
          callback: async (response: any) => {
            clearTimeout(timeoutId);
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            try {
              const user = auth.currentUser;
              if (!user) throw new Error('You must be logged into the app first.');
              const idToken = await user.getIdToken();
              
              // Exchange code via backend
              const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: response.code, idToken })
              });
              
              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('text/html')) {
                _isAuthFailingLoop = true;
                throw new Error('Backend returned HTML (404). You must run the app with "npx vercel dev" instead of "npm run dev" to use API routes!');
              }

              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to exchange token');
              }
              
              const data = await res.json();
              storeToken(data.access_token, data.expires_in ?? 3600, data.refresh_token);
              console.log('[GoogleCalendar] ✅ Token obtained via backend');
              _isAuthFailingLoop = false;
              resolve();
            } catch (err: any) {
              reject(new Error(err.message || 'Server exchange failed'));
            }
          },
          error_callback: (err: any) => {
            clearTimeout(timeoutId);
            reject(new Error(err?.message || 'OAuth failed'));
          },
        };

        // If we don't have a refresh token saved locally, force the consent screen so Google gives us one
        if (needsConsent) {
          authConfig.prompt = 'consent';
        }

        _tokenClient = (window as any).google.accounts.oauth2.initCodeClient(authConfig);

        
        // initCodeClient uses requestCode instead of requestAccessToken
        _tokenClient.requestCode();
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
    try { (window as any).google.accounts.oauth2.revoke(_accessToken, () => { /* best-effort revoke */ }); } catch { /* ignore — token revoke is best-effort */ }
  }
  _accessToken = null;
  _tokenExpiry = 0;
  _tokenClient = null;
  _syncToken = null;
  _lastSyncTime = 0;
  localStorage.removeItem('zen_gcal_access_token');
  localStorage.removeItem('zen_gcal_token_expiry');
  localStorage.removeItem('zen_gcal_refresh_token'); // ✅ BUG FIX: was missing — caused silent re-auth on next page load
};

// ─── Token Refresh ────────────────────────────────────────────────────────────

/**
 * Custom error class to distinguish "not connected" from other errors.
 * Callers (agent, workspace services) can catch this and show a friendly
 * "please connect Google Workspace" message WITHOUT opening a popup.
 *
 * IMPORTANT: This function NEVER opens an OAuth popup automatically.
 * Popups must only be triggered by explicit user gestures (button clicks).
 */
export class GoogleNotConnectedError extends Error {
  constructor() {
    super('Google Workspace is not connected. Please connect it from the app banner or Integrations page.');
    this.name = 'GoogleNotConnectedError';
  }
}

export const ensureToken = async (): Promise<string> => {
  // Fast path — valid token exists
  if (isSignedInToGoogle()) return _accessToken!;

  // Try silent refresh via backend — this requires NO user gesture
  const refreshToken = localStorage.getItem('zen_gcal_refresh_token');
  if (refreshToken) {
    try {
      await forceSilentRefresh();
      if (isSignedInToGoogle()) return _accessToken!;
    } catch (e) {
      console.warn('[GoogleCalendar] ensureToken: silent refresh failed:', e);
      // Clear stale tokens so the disconnected state is accurately reflected
      _accessToken = null;
      _tokenExpiry = 0;
      localStorage.removeItem('zen_gcal_access_token');
      localStorage.removeItem('zen_gcal_token_expiry');
      localStorage.removeItem('zen_gcal_refresh_token');
    }
  }

  // ❌ DO NOT call signInWithGoogle() here — that opens an OAuth popup
  // which will be BLOCKED by browsers since there is no user gesture.
  // Instead, throw a well-typed error so callers can show a "connect" prompt.
  throw new GoogleNotConnectedError();
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
