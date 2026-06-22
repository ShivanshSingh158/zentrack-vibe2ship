// Spotify OAuth + API helpers

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
].join(' ');

export const SPOTIFY_CONFIGURED = !!CLIENT_ID;

const STORAGE_KEYS = {
  ACCESS_TOKEN:  'spotify_access_token',
  REFRESH_TOKEN: 'spotify_refresh_token',
  EXPIRES_AT:    'spotify_expires_at',
  PROFILE:       'spotify_profile',
};

// ─── Auth URL ─────────────────────────────────────────────────────────────────

export function getSpotifyAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID!,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    // show_dialog: true so users can switch accounts freely
    show_dialog:   'true',
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// ─── Token Storage ─────────────────────────────────────────────────────────────

export function getStoredTokens() {
  return {
    accessToken:  localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
    refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
    expiresAt:    parseInt(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT) || '0', 10),
    profile: (() => {
      try {
        const p = localStorage.getItem(STORAGE_KEYS.PROFILE);
        return p ? JSON.parse(p) : null;
      } catch {
        return null;
      }
    })(),
  };
}

function storeTokens(data: { access_token: string; refresh_token?: string; expires_in: number }) {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
  if (data.refresh_token) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
  localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, String(Date.now() + data.expires_in * 1000));
}

export function clearSpotifyTokens() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
}

// ─── Token Exchange ────────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch('/api/spotify-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Token exchange failed (${res.status})`);
  }
  const data = await res.json();
  storeTokens(data);
  return data;
}

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) throw new Error('No refresh token stored');

  const res = await fetch('/api/spotify-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Token refresh failed (${res.status})`);
  }
  const data = await res.json();
  storeTokens(data);
  return data.access_token;
}

// ─── Ensure Valid Token ────────────────────────────────────────────────────────

// Shared in-flight refresh promise to prevent parallel refresh storms
let _refreshPromise: Promise<string> | null = null;

async function ensureValidToken(): Promise<string> {
  const { accessToken, expiresAt } = getStoredTokens();
  if (!accessToken) throw new Error('Not connected to Spotify');
  // Refresh 90s before expiry (gives time to complete before it's needed)
  if (Date.now() < expiresAt - 90_000) return accessToken;

  // Deduplicate concurrent refresh calls
  if (!_refreshPromise) {
    _refreshPromise = refreshAccessToken().finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

// ─── API Calls ─────────────────────────────────────────────────────────────────

async function spotifyFetch(path: string, options?: RequestInit, retried = false): Promise<any> {
  const token = await ensureValidToken();
  const method = options?.method || 'GET';
  const fetchOptions: RequestInit = {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  };
  if (method.toUpperCase() === 'GET') {
    fetchOptions.cache = 'no-store';
  }
  const res = await fetch(`https://api.spotify.com/v1${path}`, fetchOptions);

  // 204 No Content (e.g. nothing currently playing) — not an error
  if (res.status === 204) return null;

  // Rate limited — wait for Retry-After seconds then retry once
  if (res.status === 429 && !retried) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(path, options, true);
  }

  // Auto-refresh token on 401 and retry once
  if (res.status === 401 && !retried) {
    try {
      await refreshAccessToken();
      return spotifyFetch(path, options, true);
    } catch (refreshErr: any) {
      // Refresh failed — session is definitively expired
      clearSpotifyTokens();
      throw new Error('Spotify session expired. Please reconnect in Settings.');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Spotify API error: ${res.status}`);
  }
  return res.json();
}

export async function fetchSpotifyProfile() {
  const profile = await spotifyFetch('/me');
  if (profile) localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  return profile;
}

export async function fetchSpotifyQueue() {
  try {
    const data = await spotifyFetch('/me/player/queue');
    return data;
  } catch {
    return null;
  }
}

export async function fetchUserPlaylists() {
  const data = await spotifyFetch('/me/playlists?limit=50');
  const playlists = (data?.items || []) as Array<{
    id: string;
    name: string;
    images: Array<{ url: string }>;
    tracks: { total: number };
    external_urls: { spotify: string };
  }>;
  
  try {
    const profile = getStoredTokens().profile;
    if (profile && profile.id) {
      playlists.unshift({
        id: `user:${profile.id}:collection`,
        name: '❤️ Liked Songs',
        images: [],
        tracks: { total: 0 },
        external_urls: { spotify: '' },
      });
    }
  } catch {}

  return playlists;
}

// ─── Playback Control ──────────────────────────────────────────────────────────

export async function getCurrentPlayback() {
  try {
    const token = await ensureValidToken();
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    // 204 = nothing playing, not an error
    if (res.status === 204 || !res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function controlPlayback(action: 'play' | 'pause' | 'next' | 'previous', deviceId?: string) {
  try {
    const isPost = action === 'next' || action === 'previous';
    const endpoint =
      action === 'next'     ? '/me/player/next'
      : action === 'previous' ? '/me/player/previous'
      : action === 'play'     ? '/me/player/play'
      : '/me/player/pause';

    const path = deviceId ? `${endpoint}?device_id=${deviceId}` : endpoint;
    await spotifyFetch(path, { method: isPost ? 'POST' : 'PUT' });
  } catch (e) {
    console.warn('Spotify control error:', e);
  }
}

/** Start playing a playlist URI on a specific device (Web Playback SDK device) */
export async function startPlaylistOnDevice(playlistId: string, deviceId: string): Promise<void> {
  const context_uri = playlistId.startsWith('user:')
    ? `spotify:${playlistId}`
    : `spotify:playlist:${playlistId}`;

  await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context_uri }),
  });
}

/** Transfer active playback to a device */
export async function transferPlaybackToDevice(deviceId: string): Promise<void> {
  await spotifyFetch('/me/player', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: true }),
  });
}

/** Get a fresh valid token (used by Spotify SDK getOAuthToken callback) */
export async function getFreshToken(): Promise<string> {
  return ensureValidToken();
}

// ─── Search and Track Playback ───────────────────────────────────────────────

export async function searchSpotifyTracks(query: string) {
  const data = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track`);
  return data?.tracks?.items || [];
}

function cleanTrackName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritic marks
    .split(/[\(\[\{\-–—\|,]/)[0] // split by brackets, hyphens, en-dash, em-dash, pipe, comma
    .replace(/[\s\p{P}]/gu, '') // strip remaining punctuation and whitespace (Unicode-aware)
    .trim();
}

export async function startTrackOnDevice(trackUri: string, deviceId?: string): Promise<void> {
  console.log('[Zentrack Spotify] startTrackOnDevice called with:', { trackUri, deviceId });
  const trackId = trackUri.split(':').pop();
  let uris = [trackUri];
  
  if (trackId) {
    try {
      // The /recommendations API was deprecated in Nov 2024.
      // Fallback: Fetch track details to get the artist, then search for tracks by that artist to form a pseudo-radio queue.
      const trackDetail = await spotifyFetch(`/tracks/${trackId}`);
      console.log('[Zentrack Spotify] trackDetail retrieved:', trackDetail?.name);
      if (trackDetail?.artists?.[0]?.name) {
        const artistName = trackDetail.artists[0].name;
        const searchRes = await spotifyFetch(`/search?q=artist:${encodeURIComponent(artistName)}&type=track&limit=40`);
        console.log('[Zentrack Spotify] artist search results count:', searchRes?.tracks?.items?.length || 0);
        
        if (searchRes?.tracks?.items) {
          const uniqueNames = new Set<string>();
          const uniqueUris = new Set<string>([trackUri]);
          
          // Ensure the original track's name is in the set so we don't queue alternate versions of the same song
          if (trackDetail.name) {
            const cleanOriginal = cleanTrackName(trackDetail.name);
            uniqueNames.add(cleanOriginal);
            console.log('[Zentrack Spotify] original clean name:', cleanOriginal);
          }

          const filteredTracks: string[] = [];
          for (const t of searchRes.tracks.items) {
            if (!t.uri || uniqueUris.has(t.uri)) continue;
            if (!t.name) continue;
            const cleanName = cleanTrackName(t.name);
            if (uniqueNames.has(cleanName)) {
              console.log('[Zentrack Spotify] Filtering out duplicate/remix track:', { name: t.name, cleanName });
              continue;
            }
            uniqueNames.add(cleanName);
            uniqueUris.add(t.uri);
            filteredTracks.push(t.uri);
          }

          console.log('[Zentrack Spotify] filtered results count:', filteredTracks.length);
          
          // If we have shuffle enabled, we should shuffle the 'moreTracks' before appending,
          // so it feels more like a radio station rather than a top-tracks list.
          const shuffled = filteredTracks.sort(() => 0.5 - Math.random());
          uris = [trackUri, ...shuffled];
        }
      }
    } catch (e) {
      console.warn('[Zentrack Spotify] Could not fetch pseudo-radio tracks:', e);
    }
  }

  const path = `/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`;
  console.log('[Zentrack Spotify] Sending play request with URIs:', uris);
  try {
    await spotifyFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris }),
    });
    console.log('[Zentrack Spotify] Play request succeeded');
  } catch (e) {
    console.error('[Zentrack Spotify] Play request failed:', e);
    throw e;
  }
}

// ─── Curated Study Playlists ─────────────────────────────────────────────────

export const CURATED_PLAYLISTS = [
  { id: '37i9dQZF1DX8Uebhn9wzrS', name: '🎵 Lofi Hip Hop',    desc: 'Chill beats to study to' },
  { id: '37i9dQZF1DWZeKCadgRdKQ', name: '🧠 Deep Focus',       desc: 'Long sessions, zero distractions' },
  { id: '37i9dQZF1DX4sWSpwq3LiO', name: '🎹 Peaceful Piano',   desc: 'Calm and classical' },
  { id: '37i9dQZF1DWXLeA8Omikj7', name: '🔬 Brain Food',       desc: 'Instrumental for concentration' },
  { id: '37i9dQZF1DX9sIqqvKsjEp', name: '📚 Study Beats',      desc: 'Energetic, upbeat study vibes' },
  { id: '37i9dQZF1DWWQRwui0ExPn', name: '🌿 Ambient Chill',    desc: 'Smooth ambient for flow state' },
];
