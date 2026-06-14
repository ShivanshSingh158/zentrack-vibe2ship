/**
 * googleCalendar.ts — Client-side Google Calendar integration using
 * the Google Identity Services (GIS) popup OAuth flow.
 *
 * No backend proxy needed. Access tokens are held in memory only
 * (sessionStorage) — never persisted to Firestore.
 *
 * Setup required (one-time, by the developer):
 *   1. Go to https://console.cloud.google.com
 *   2. Create/select a project
 *   3. Enable "Google Calendar API"
 *   4. Go to APIs & Services → Credentials → Create OAuth 2.0 Client ID
 *      - Application type: Web Application
 *      - Authorized JavaScript origins: http://localhost:5174, https://your-domain.com
 *   5. Copy the Client ID into your .env as VITE_GOOGLE_CALENDAR_CLIENT_ID
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID as string | undefined;
const SCOPES    = 'https://www.googleapis.com/auth/calendar.events';

let tokenClient: any = null;
let gapiLoaded      = false;
let gisLoaded       = false;

type AuthCallback = (err: Error | null) => void;

/** Dynamically loads the Google API JS client library */
const loadGapiScript = (): Promise<void> => {
  if (gapiLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => {
      (window as any).gapi.load('client', async () => {
        await (window as any).gapi.client.init({});
        await (window as any).gapi.client.load('https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest');
        gapiLoaded = true;
        resolve();
      });
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
};

/** Dynamically loads the Google Identity Services script */
const loadGisScript = (): Promise<void> => {
  if (gisLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => { gisLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
};

/** Call once on first use. Loads both GAPI and GIS scripts in parallel. */
export const initGoogleCalendar = async (): Promise<boolean> => {
  if (!CLIENT_ID) {
    console.warn('[GoogleCalendar] VITE_GOOGLE_CALENDAR_CLIENT_ID is not set.');
    return false;
  }
  try {
    await Promise.all([loadGapiScript(), loadGisScript()]);
    return true;
  } catch (err) {
    console.error('[GoogleCalendar] Failed to load Google API scripts:', err);
    return false;
  }
};

/** Returns true if the user has a valid access token stored in sessionStorage */
export const isSignedInToGoogle = (): boolean => {
  const token = sessionStorage.getItem('gc_access_token');
  const exp   = parseInt(sessionStorage.getItem('gc_token_exp') || '0', 10);
  return !!token && Date.now() < exp;
};

/**
 * Triggers the Google OAuth popup and stores the token in sessionStorage.
 * Resolves when the user successfully signs in, rejects on error/cancel.
 */
export const signInWithGoogle = (): Promise<void> => {
  if (!CLIENT_ID) return Promise.reject(new Error('VITE_GOOGLE_CALENDAR_CLIENT_ID not set'));

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          // Store token with a 55-minute TTL (Google tokens last 1 hour)
          sessionStorage.setItem('gc_access_token', response.access_token);
          sessionStorage.setItem('gc_token_exp', (Date.now() + 55 * 60 * 1000).toString());
          (window as any).gapi.client.setToken({ access_token: response.access_token });
          resolve();
        },
      });
    }
    tokenClient.requestAccessToken({ prompt: isSignedInToGoogle() ? '' : 'consent' });
  });
};

/** Revokes the current token and clears session storage */
export const signOutGoogle = (): void => {
  const token = sessionStorage.getItem('gc_access_token');
  if (token && (window as any).google?.accounts?.oauth2) {
    (window as any).google.accounts.oauth2.revoke(token, () => {});
  }
  sessionStorage.removeItem('gc_access_token');
  sessionStorage.removeItem('gc_token_exp');
  tokenClient = null;
};

export interface GCalEvent {
  title: string;
  date: string;       // YYYY-MM-DD
  description?: string;
  type: string;
}

/**
 * Adds a single event to the user's primary Google Calendar.
 * Ensures the user is signed in first (will trigger OAuth popup if not).
 */
export const addEventToGoogleCalendar = async (event: GCalEvent): Promise<void> => {
  if (!isSignedInToGoogle()) {
    await signInWithGoogle();
  }

  const token = sessionStorage.getItem('gc_access_token');
  (window as any).gapi.client.setToken({ access_token: token });

  const calEvent = {
    summary: event.title,
    description: event.description || `Added from ZenTrack (${event.type})`,
    start: { date: event.date },
    end:   { date: event.date },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 60 },       // 1 hour before
      ],
    },
  };

  const response = await (window as any).gapi.client.calendar.events.insert({
    calendarId: 'primary',
    resource: calEvent,
  });

  if (response.status !== 200) {
    throw new Error(`Google Calendar API error: ${response.status}`);
  }
};

/** Exports a batch of events to Google Calendar */
export const exportEventsToGoogleCalendar = async (
  events: GCalEvent[],
  onProgress?: (done: number, total: number) => void
): Promise<{ success: number; failed: number }> => {
  let success = 0;
  let failed  = 0;

  for (let i = 0; i < events.length; i++) {
    try {
      await addEventToGoogleCalendar(events[i]);
      success++;
    } catch {
      failed++;
    }
    onProgress?.(i + 1, events.length);
  }

  return { success, failed };
};
