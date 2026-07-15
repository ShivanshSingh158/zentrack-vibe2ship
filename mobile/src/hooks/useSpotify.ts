import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { makeRedirectUri, useAuthRequest, ResponseType, exchangeCodeAsync } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In production, ensure this is set in your .env and starts with EXPO_PUBLIC_
const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || "131c7c8b70f143849a4c4809c71ef86f";

const discovery = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string;
  uri: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string;
  isPlaying: boolean;
  shuffleState: boolean;
}

export function useSpotify() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [error, setError] = useState<string | null>(null);

  const redirectUri = makeRedirectUri({
    scheme: 'zentrack',
    path: 'callback',
    preferLocalhost: false,
  });

  // Log this so the user can easily copy it for their Spotify Dashboard
  console.log("=========================================");
  console.log("ADD THIS EXACT URL TO SPOTIFY DASHBOARD:");
  console.log(redirectUri);
  console.log("=========================================");

  const [request, response, promptAsync] = useAuthRequest(
    {
      responseType: ResponseType.Code,
      clientId: CLIENT_ID,
      scopes: [
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'playlist-read-private'
      ],
      usePKCE: true,
      redirectUri,
    },
    discovery
  );

  useEffect(() => {
    // Load cached token
    AsyncStorage.getItem('spotify_access_token').then(token => {
      if (token) setAccessToken(token);
    });
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      if (code && request?.codeVerifier) {
        exchangeCodeAsync({
          clientId: CLIENT_ID,
          code,
          redirectUri: request.redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier,
          }
        }, discovery).then(tokenResponse => {
          setAccessToken(tokenResponse.accessToken);
          AsyncStorage.setItem('spotify_access_token', tokenResponse.accessToken);
        }).catch(err => {
          console.log("Spotify Token exchange failed", err);
          setError("Token exchange failed");
        });
      }
    } else if (response?.type === 'error') {
      setError(response.error?.message || "Failed to authenticate with Spotify");
    }
  }, [response, request]);

  const login = () => {
    promptAsync();
  };

  const logout = async () => {
    setAccessToken(null);
    setCurrentTrack(null);
    await AsyncStorage.removeItem('spotify_access_token');
  };

  const fetchCurrentTrack = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.status === 200) {
        const data = await res.json();
        if (data && data.item) {
          setCurrentTrack({
            id: data.item.id,
            name: data.item.name,
            artist: data.item.artists.map((a: any) => a.name).join(', '),
            albumArt: data.item.album.images[0]?.url,
            isPlaying: data.is_playing,
            shuffleState: data.shuffle_state
          });
        }
      } else if (res.status === 204) {
        // No active playback
        setCurrentTrack(null);
      } else if (res.status === 401) {
        // Token expired
        logout();
      }
    } catch (e) {
      console.log('Spotify fetch error:', e);
    }
  }, [accessToken]);

  const fetchPlaylists = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=10', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.status === 200) {
        const data = await res.json();
        setPlaylists(data.items.map((item: any) => ({
          id: item.id,
          name: item.name,
          imageUrl: item.images?.[0]?.url || '',
          uri: item.uri
        })));
      }
    } catch (e) {
      console.log('Spotify playlists fetch error:', e);
    }
  }, [accessToken]);

  // Poll for current track every 5 seconds if authenticated
  useEffect(() => {
    if (!accessToken) return;
    fetchCurrentTrack();
    fetchPlaylists();
    const interval = setInterval(fetchCurrentTrack, 5000);
    return () => clearInterval(interval);
  }, [accessToken, fetchCurrentTrack, fetchPlaylists]);

  const playPause = async () => {
    if (!accessToken) return;
    const endpoint = currentTrack?.isPlaying 
      ? 'https://api.spotify.com/v1/me/player/pause' 
      : 'https://api.spotify.com/v1/me/player/play';
    
    // Optimistic update
    setCurrentTrack(prev => prev ? { ...prev, isPlaying: !prev.isPlaying } : null);
    
    try {
      await fetch(endpoint, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (e) {
      // Revert on failure
      fetchCurrentTrack();
    }
  };

  const nextTrack = async () => {
    if (!accessToken) return;
    try {
      await fetch('https://api.spotify.com/v1/me/player/next', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setTimeout(fetchCurrentTrack, 1000); // Wait a second for Spotify to update
    } catch (e) {
      console.log('Next track error:', e);
    }
  };

  const previousTrack = async () => {
    if (!accessToken) return;
    try {
      await fetch('https://api.spotify.com/v1/me/player/previous', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setTimeout(fetchCurrentTrack, 1000);
    } catch (e) {
      console.log('Previous track error:', e);
    }
  };

  const toggleShuffle = async () => {
    if (!accessToken || !currentTrack) return;
    const newState = !currentTrack.shuffleState;
    setCurrentTrack(prev => prev ? { ...prev, shuffleState: newState } : null);
    try {
      await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${newState}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (e) {
      console.log('Shuffle error:', e);
      fetchCurrentTrack();
    }
  };

  const playContext = async (contextUri: string) => {
    if (!accessToken) return;
    
    // Instantly show the player UI
    setCurrentTrack({
      name: 'Starting playlist...',
      artist: 'Spotify',
      albumArt: '',
      isPlaying: true,
      shuffleState: false,
    });

    try {
      // 1. Get available devices to ensure we can play
      const devicesRes = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const devicesData = await devicesRes.json();
      const devices = devicesData.devices || [];

      if (devices.length === 0) {
        Alert.alert('No Spotify Device', 'Please open the Spotify app on your phone first so we can connect to it!');
        setCurrentTrack(null);
        return;
      }

      // 2. Find an active device, or fallback to the first available smartphone/device
      const activeDevice = devices.find((d: any) => d.is_active) || devices.find((d: any) => d.type === 'Smartphone') || devices[0];
      const deviceIdParam = activeDevice ? `?device_id=${activeDevice.id}` : '';

      // 3. Play the playlist on that device
      const playRes = await fetch(`https://api.spotify.com/v1/me/player/play${deviceIdParam}`, {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ context_uri: contextUri })
      });

      if (!playRes.ok) {
        // If it still fails, it might be premium restricted or something
        console.log('Spotify play failed:', await playRes.text());
        Alert.alert('Playback Failed', 'Make sure you have Spotify Premium or your device is active.');
        fetchCurrentTrack();
        return;
      }
      
      // Notify user which device it's playing on
      if (activeDevice) {
        Alert.alert('Spotify Playing', `Music started on device: ${activeDevice.name}\n\nIf you don't hear sound, check the volume on that device!`);
      }

      // Fetch the real track faster and multiple times to ensure we catch it when it starts
      setTimeout(fetchCurrentTrack, 800);
      setTimeout(fetchCurrentTrack, 2000);
    } catch (e) {
      console.log('Play context error:', e);
      fetchCurrentTrack();
    }
  };

  return {
    accessToken,
    currentTrack,
    playlists,
    error,
    login,
    logout,
    playPause,
    nextTrack,
    previousTrack,
    toggleShuffle,
    playContext,
  };
}
