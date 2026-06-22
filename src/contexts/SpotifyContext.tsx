import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  getStoredTokens,
  getCurrentPlayback,
  CURATED_PLAYLISTS,
  getFreshToken,
  startPlaylistOnDevice,
  startTrackOnDevice,
} from '../services/spotify';

// ── Spotify Web Playback SDK types ───────────────────────────────────────────
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifySDKPlayer;
    };
  }
}
interface SpotifySDKPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: any) => void): boolean;
  removeListener(event: string, cb?: (data: any) => void): boolean;
  togglePlay(): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getCurrentState(): Promise<any>;
}

interface TrackInfo {
  title: string;
  artist: string;
  albumArt: string;
  progressMs: number;
  durationMs: number;
}

interface SpotifyContextValue {
  isConnected: boolean;
  sdkReady: boolean;
  sdkError: string | null;
  isPremium: boolean;          // false = Free tier, controls disabled
  isPlaying: boolean;
  isShuffle: boolean;
  currentTrack: TrackInfo | null;
  showFloating: boolean;
  currentPlaylistId: string;
  setCurrentPlaylistId: (id: string) => void;
  startPlaylist: (playlistId: string) => Promise<void>;
  startTrack: (trackUri: string) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  hideFloating: () => void;
  setShowFloating: (v: boolean) => void;
  disconnect: () => void;
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

export const useSpotify = () => {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error('useSpotify must be used within SpotifyProvider');
  return ctx;
};

// ── Load the Spotify Web Playback SDK script ─────────────────────────────────
// Returns a promise that resolves only when the SDK is fully ready to use.
// Handles the case where the script was already injected (e.g. HMR / re-mount).
function loadSpotifySDK(): Promise<void> {
  return new Promise((resolve) => {
    // SDK already initialised from a previous mount — resolve immediately
    if (window.Spotify) {
      resolve();
      return;
    }
    // Register the ready callback BEFORE injecting the script to avoid the
    // race where the script loads before we set onSpotifyWebPlaybackSDKReady.
    window.onSpotifyWebPlaybackSDKReady = resolve;

    if (!document.getElementById('spotify-sdk-script')) {
      const script = document.createElement('script');
      script.id = 'spotify-sdk-script';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export const SpotifyProvider = ({ children }: { children: React.ReactNode }) => {
  const [isConnected, setIsConnected]   = useState(false);
  const [sdkReady, setSdkReady]         = useState(false);
  const [sdkError, setSdkError]         = useState<string | null>(null);
  const [isPremium, setIsPremium]       = useState(true);  // optimistic: assume Premium until proved otherwise
  const [deviceId, setDeviceId]         = useState<string | null>(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [isShuffle, setIsShuffle]       = useState(false);
  const [currentTrack, setCurrentTrack] = useState<TrackInfo | null>(null);
  const [showFloating, setShowFloating] = useState(false);
  const [currentPlaylistId, setCurrentPlaylistId] = useState(CURATED_PLAYLISTS[0].id);

  const playerRef = useRef<SpotifySDKPlayer | null>(null);
  const pollRef   = useRef<number | null>(null);

  // ── Check auth ──────────────────────────────────────────────────────────────
  const checkConnection = useCallback(() => {
    const { accessToken } = getStoredTokens();
    setIsConnected(!!accessToken);
  }, []);

  const disconnect = useCallback(() => {
    import('../services/spotify').then(({ clearSpotifyTokens }) => {
      clearSpotifyTokens();
      setIsConnected(false);
      setSdkReady(false);
      setDeviceId(null);
      setIsPlaying(false);
      setCurrentTrack(null);
      setShowFloating(false);
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    checkConnection();

    // ── React to same-page SPA auth events ─────────────────────────────────
    // window.focus only fires on tab switch. For SPA OAuth callback (same tab
    // router navigation), we fire a custom event so context updates instantly.
    const onConnected = () => {
      // Reset Premium assumption on every new connection — gets corrected by
      // SDK's account_error if the user is actually on Free tier
      setIsPremium(true);
      checkConnection();
    };
    const onDisconnected = () => checkConnection();

    window.addEventListener('focus',                checkConnection);
    window.addEventListener('spotify-connected',    onConnected);
    window.addEventListener('spotify-disconnected', onDisconnected);

    return () => {
      window.removeEventListener('focus',                checkConnection);
      window.removeEventListener('spotify-connected',    onConnected);
      window.removeEventListener('spotify-disconnected', onDisconnected);
    };
  }, [checkConnection]);


  // ── Initialise Spotify Web Playback SDK ─────────────────────────────────────
  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;
    let player: SpotifySDKPlayer | null = null;

    loadSpotifySDK().then(() => {
      if (cancelled) return;

      player = new window.Spotify.Player({
        name: 'Zentrack Player',
        getOAuthToken: async (cb) => {
          try { cb(await getFreshToken()); } catch { cb(''); }
        },
        volume: 0.7,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        if (cancelled) return;
        console.log('[Spotify SDK] Ready, device:', device_id);
        setDeviceId(device_id);
        setSdkReady(true);
        setSdkError(null);
      });

      player.addListener('not_ready', () => {
        if (cancelled) return;
        setSdkReady(false);
      });

      player.addListener('player_state_changed', (state: any) => {
        if (!state || cancelled) return;
        const track = state.track_window?.current_track;
        if (track) {
          setCurrentTrack({
            title:      track.name,
            artist:     (track.artists || []).map((a: any) => a.name).join(', '),
            albumArt:   track.album?.images?.[0]?.url || '',
            progressMs: state.position || 0,
            durationMs: track.duration_ms || 1,
          });
          setIsPlaying(!state.paused);
          setIsShuffle(!!state.shuffle);
        }
      });

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        if (cancelled) return;
        console.error('[Spotify SDK] Auth error:', message);
        setSdkError('Authentication error — please reconnect Spotify.');
        setSdkReady(false);
      });

      player.addListener('account_error', ({ message }: { message: string }) => {
        if (cancelled) return;
        console.warn('[Spotify SDK] Account error (Free tier):', message);
        setIsPremium(false);   // <-- expose to UI so controls are gracefully disabled
        setSdkError(
          'Spotify Premium is required for in-browser playback. ' +
          'Use the Spotify app to control playback here.'
        );
        setSdkReady(false);
        // Polling fallback continues for non-Premium (tracks what plays on phone/desktop)
      });

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.warn('[Spotify SDK] Playback error:', message);
      });

      playerRef.current = player;
      player.connect();
    });

    return () => {
      cancelled = true;
      if (player) { player.disconnect(); }
      playerRef.current = null;
      setSdkReady(false);
      setDeviceId(null);
    };
  }, [isConnected]);

  // ── Polling fallback (non-Premium / phone playback tracking) ─────────────────
  // Interval: 8s (was 3s — that's 20 req/min per user, hits rate limits fast)
  // 429 handling: exponential backoff up to 30s before resuming normal polling
  const pollBackoffRef = useRef<number>(8000);
  const pollPlayback = useCallback(async () => {
    try {
      const data = await getCurrentPlayback();
      pollBackoffRef.current = 8000; // reset backoff on success
      if (!data || !data.item) { setIsPlaying(false); return; }
      setIsPlaying(data.is_playing);
      setIsShuffle(!!data.shuffle_state);
      setCurrentTrack({
        title:      data.item.name,
        artist:     (data.item.artists || []).map((a: any) => a.name).join(', '),
        albumArt:   data.item.album?.images?.[0]?.url || '',
        progressMs: data.progress_ms || 0,
        durationMs: data.item.duration_ms || 1,
      });
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('rate')) {
        // Back off: double the interval up to 30 seconds
        pollBackoffRef.current = Math.min(pollBackoffRef.current * 2, 30000);
        console.warn(`[Spotify] Rate limited — backing off to ${pollBackoffRef.current / 1000}s`);
      }
      // All other errors: silent (expected when paused/disconnected)
    }
  }, []);


  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollBackoffRef.current = 8000; // reset on fresh start
    pollPlayback();
    // Use a self-rescheduling approach so backoff is respected
    const scheduleNext = () => {
      pollRef.current = window.setTimeout(async () => {
        await pollPlayback();
        if (pollRef.current !== null) scheduleNext();
      }, pollBackoffRef.current) as unknown as number;
    };
    scheduleNext();
  }, [pollPlayback, stopPolling]);


  // Always poll when connected
  useEffect(() => {
    if (!isConnected) {
      stopPolling();
      return;
    }
    startPolling();
    return stopPolling;
  }, [isConnected, startPolling, stopPolling]);

  // ── Controls ────────────────────────────────────────────────────────────────

  const startPlaylist = useCallback(async (playlistId: string) => {
    setCurrentPlaylistId(playlistId);
    if (!deviceId || !sdkReady) {
      console.warn('[Spotify] No SDK device ready — use the Spotify app to play');
      return;
    }
    try {
      await startPlaylistOnDevice(playlistId, deviceId);
    } catch (e) {
      console.warn('[Spotify] startPlaylist error:', e);
    }
  }, [deviceId, sdkReady]);

  const startTrack = useCallback(async (trackUri: string) => {
    if (!deviceId || !sdkReady) {
      console.warn('[Spotify] No SDK device ready — use the Spotify app to play');
      return;
    }
    try {
      await startTrackOnDevice(trackUri, deviceId);
    } catch (e) {
      console.warn('[Spotify] startTrack error:', e);
    }
  }, [deviceId, sdkReady]);

  const togglePlayPause = useCallback(async () => {
    if (playerRef.current && sdkReady) {
      await playerRef.current.togglePlay();
    }
  }, [sdkReady]);

  const skipNext = useCallback(async () => {
    if (playerRef.current && sdkReady) {
      await playerRef.current.nextTrack();
      setTimeout(pollPlayback, 500);
    }
  }, [sdkReady, pollPlayback]);

  const toggleShuffle = useCallback(async () => {
    if (!deviceId && !sdkReady) return;
    const newState = !isShuffle;
    setIsShuffle(newState); // Optimistic UI update
    try {
      const { accessToken } = getStoredTokens();
      await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${newState}${deviceId ? `&device_id=${deviceId}` : ''}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      setTimeout(pollPlayback, 500);
    } catch (e) {
      setIsShuffle(!newState); // Revert on failure
      console.warn('[Spotify] shuffle error:', e);
    }
  }, [isShuffle, deviceId, sdkReady, pollPlayback]);

  const skipPrevious = useCallback(async () => {
    if (playerRef.current && sdkReady) {
      await playerRef.current.previousTrack();
      setTimeout(pollPlayback, 500);
    }
  }, [sdkReady, pollPlayback]);

  const hideFloating = useCallback(() => setShowFloating(false), []);

  return (
    <SpotifyContext.Provider value={{
      isConnected, sdkReady, sdkError, isPremium,
      isPlaying, isShuffle, currentTrack, showFloating,
      currentPlaylistId, setCurrentPlaylistId,
      startPlaylist, startTrack,
      togglePlayPause, toggleShuffle, skipNext, skipPrevious,
      hideFloating, setShowFloating,
      disconnect,
    }}>
      {children}
    </SpotifyContext.Provider>
  );
};
