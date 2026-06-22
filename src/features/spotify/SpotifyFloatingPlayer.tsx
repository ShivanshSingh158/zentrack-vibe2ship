import { useState, useEffect, useCallback } from 'react';
import {
  Music2, ChevronDown, ChevronUp,
  Play, Pause, SkipBack, SkipForward, Shuffle, ListMusic,
  X, RefreshCw, LogIn, Volume2, Wifi, WifiOff, ExternalLink, Lock, Search
} from 'lucide-react';
import { useSpotify } from '../../contexts/SpotifyContext';
import {
  SPOTIFY_CONFIGURED,
  getSpotifyAuthUrl,
  getStoredTokens,
  fetchUserPlaylists,
  CURATED_PLAYLISTS,
  searchSpotifyTracks,
  fetchSpotifyQueue,
} from '../../services/spotify';

function getRedirectUri() {
  return `${window.location.origin}/spotify-callback`;
}

type Playlist = {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  tracks?: { total: number };
  desc?: string;
};

export const SpotifyFloatingPlayer = () => {
  const {
    isConnected, sdkReady, sdkError, isPremium,
    currentPlaylistId, setCurrentPlaylistId, startPlaylist, startTrack,
    isPlaying, isShuffle, currentTrack,
    showFloating, hideFloating, setShowFloating,
    togglePlayPause, toggleShuffle, skipNext, skipPrevious,
  } = useSpotify();

  // True when controls can actually do something
  const canControl = sdkReady && isPremium;

  const [expanded, setExpanded] = useState(false);
  const [playlistTab, setPlaylistTab] = useState<'curated' | 'mine' | 'search' | 'queue'>('curated');
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [queueTracks, setQueueTracks] = useState<any[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 600;

  const loadPlaylists = useCallback(async () => {
    if (!isConnected) return;
    setIsLoadingPlaylists(true);
    try { setUserPlaylists(await fetchUserPlaylists()); }
    catch { /* curated fallback */ }
    finally { setIsLoadingPlaylists(false); }
  }, [isConnected]);

  useEffect(() => { loadPlaylists(); }, [loadPlaylists]);

  const loadQueue = useCallback(async () => {
    if (!isConnected) return;
    setIsQueueLoading(true);
    console.log('[Zentrack Spotify] loadQueue called');
    try {
      const data = await fetchSpotifyQueue();
      console.log('[Zentrack Spotify] fetchSpotifyQueue response:', data);
      if (data && data.queue) {
        console.log('[Zentrack Spotify] setting queue tracks:', data.queue.map((t: any) => ({ name: t.name, uri: t.uri })));
        setQueueTracks(data.queue);
      } else {
        console.warn('[Zentrack Spotify] queue API returned empty/null data');
      }
    } catch (err) {
      console.error('[Zentrack Spotify] loadQueue failed:', err);
    } finally {
      setIsQueueLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (playlistTab === 'queue' && expanded) {
      loadQueue();
    }
  }, [playlistTab, expanded, loadQueue, currentTrack?.title]); // Refresh when track changes

  useEffect(() => {
    if (playlistTab !== 'search' || !searchQuery.trim() || !isConnected) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const results = await searchSpotifyTracks(searchQuery);
        setSearchResults(results);
      } catch (err: any) {
        console.error('Spotify search failed:', err);
        setSearchError(err.message || 'Search failed');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, playlistTab, isConnected]);
  if (isMobile || !SPOTIFY_CONFIGURED) return null;

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected) {
    const { accessToken } = getStoredTokens();
    if (!accessToken) return (
      <button id="spotify-floating-player-connect" onClick={() => { window.location.href = getSpotifyAuthUrl(getRedirectUri()); }}
        style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 9990, background: 'rgba(12,12,16,0.95)', border: '1px solid rgba(29,185,84,0.4)', borderRadius: '50px', padding: '0.55rem 1rem', color: '#1db954', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', backdropFilter: 'blur(16px)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
        <LogIn size={14} /> Connect Spotify
      </button>
    );
    return null;
  }

  // ── Hidden pill ───────────────────────────────────────────────────────────
  if (!showFloating) return (
    <button id="spotify-floating-player-open" onClick={() => setShowFloating(true)}
      style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 9990, background: 'rgba(12,12,16,0.95)', border: '1px solid rgba(29,185,84,0.4)', borderRadius: '50px', padding: '0.55rem 1rem', color: '#1db954', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', backdropFilter: 'blur(16px)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
      <Music2 size={14} /> Open Player
    </button>
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  const allPlaylists: Playlist[] = [
    ...CURATED_PLAYLISTS.map(p => ({ ...p, images: undefined, tracks: undefined })),
    ...userPlaylists,
  ];
  const selectedPlaylist = allPlaylists.find(p => p.id === currentPlaylistId) || allPlaylists[0];
  const displayPlaylists: Playlist[] = playlistTab === 'curated'
    ? CURATED_PLAYLISTS.map(p => ({ ...p, images: undefined, tracks: undefined }))
    : userPlaylists.length > 0 ? userPlaylists : CURATED_PLAYLISTS.map(p => ({ ...p, images: undefined, tracks: undefined }));


  const progress = currentTrack
    ? Math.min(100, (currentTrack.progressMs / currentTrack.durationMs) * 100) : 0;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const handlePickPlaylist = async (p: Playlist) => {
    setCurrentPlaylistId(p.id);
    if (sdkReady) {
      setStarting(true);
      try { await startPlaylist(p.id); }
      catch { /* handled inside context */ }
      finally { setStarting(false); }
    }
  };

  return (
    <>
      <div id="spotify-floating-player" onWheel={(e) => e.stopPropagation()} style={{
        position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 9990,
        width: 'clamp(300px, 90vw, 340px)',
        background: 'rgba(10,10,14,0.98)',
        backdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid rgba(29,185,84,0.3)',
        borderRadius: '20px', overflow: 'hidden',
        boxShadow: '0 25px 70px rgba(0,0,0,0.65), 0 0 40px rgba(29,185,84,0.07)',
        animation: 'slideUpFade 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* ── Expanded: Playlist Picker ── */}
        {expanded && (
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {/* SDK status banner */}
            <div style={{ padding: '0.45rem 0.85rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {sdkReady
                ? <><Wifi size={11} style={{ color: '#1db954' }} /><span style={{ fontSize: '0.67rem', color: '#1db954', fontWeight: 600 }}>Zentrack Player ready — click a playlist to play instantly</span></>
                : sdkError
                  ? <><WifiOff size={11} style={{ color: '#f59e0b' }} /><span style={{ fontSize: '0.67rem', color: '#f59e0b', lineHeight: 1.4 }}>{sdkError}</span></>
                  : <><div className="sp-spin" style={{ width: '9px', height: '9px', borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.15)', borderTopColor: '#1db954' }} /><span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.35)' }}>Initialising player...</span></>
              }
            </div>

            {/* Tabs */}
            <div style={{ padding: '0.5rem 0.85rem 0.35rem', display: 'flex', gap: '0.4rem', background: 'rgba(255,255,255,0.02)', overflowX: 'auto' }}>
              {(['curated', 'mine', 'search', 'queue'] as const).map(tab => (
                <button key={tab} onClick={() => setPlaylistTab(tab)} style={{
                  flex: 1, padding: '0.32rem 0.3rem', borderRadius: '8px', border: 'none',
                  background: playlistTab === tab ? 'rgba(30,215,96,0.15)' : 'transparent',
                  color: playlistTab === tab ? '#1db954' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer', fontSize: '0.74rem',
                  fontWeight: playlistTab === tab ? 700 : 400, transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}>
                  {tab === 'curated' ? '🎯 Picks' : tab === 'mine' ? '🎵 Mine' : tab === 'search' ? '🔍 Search' : '📋 Queue'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {playlistTab === 'search' ? (
              <div style={{ padding: '0 0.6rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.4rem 0.6rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Search size={14} style={{ color: 'rgba(255,255,255,0.4)', marginRight: '0.5rem', flexShrink: 0 }} />
                  <input 
                    type="text" 
                    placeholder="Search songs..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', outline: 'none', width: '100%' }}
                  />
                  {isSearching && <div className="sp-spin" style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#1db954', flexShrink: 0 }} />}
                </div>
                <div style={{ maxHeight: '140px', overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {searchResults.map((track: any) => (
                    <button key={track.id}
                      onClick={async () => {
                        setStarting(true);
                        try { await startTrack(track.uri); } catch {}
                        finally { setStarting(false); }
                      }}
                      disabled={starting}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.55rem',
                        padding: '0.4rem 0.55rem', borderRadius: '8px', border: 'none', width: '100%',
                        background: 'transparent', cursor: starting ? 'wait' : 'pointer', textAlign: 'left', transition: 'all 0.12s',
                      }}
                    >
                      {track.album?.images?.[0]?.url ? (
                        <img src={track.album.images[0].url} alt="" style={{ width: '30px', height: '30px', borderRadius: '5px', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: '30px', height: '30px', borderRadius: '5px', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {track.name}
                        </div>
                        <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {track.artists?.map((a: any) => a.name).join(', ')}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!searchQuery.trim() && !isSearching && (
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', padding: '1rem 0' }}>Search for a track to play</div>
                  )}
                  {searchError && (
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#ef4444', padding: '1rem 0' }}>Error: {searchError}</div>
                  )}
                  {searchQuery.trim() && !isSearching && !searchError && searchResults.length === 0 && (
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', padding: '1rem 0' }}>No tracks found for "{searchQuery}"</div>
                  )}
                </div>
              </div>
            ) : playlistTab === 'queue' ? (
              <div style={{ maxHeight: '180px', overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 0.6rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {isQueueLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' }}>
                    <RefreshCw size={13} className="animate-spin" /> Loading queue...
                  </div>
                ) : queueTracks.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', padding: '1rem 0' }}>Queue is empty</div>
                ) : queueTracks.map((track: any, i: number) => (
                  <div key={(track.id || track.uri) + i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.55rem',
                      padding: '0.4rem 0.55rem', borderRadius: '8px', width: '100%',
                      background: 'transparent', textAlign: 'left',
                    }}
                  >
                    {track.album?.images?.[0]?.url ? (
                      <img src={track.album.images[0].url} alt="" style={{ width: '30px', height: '30px', borderRadius: '5px', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '30px', height: '30px', borderRadius: '5px', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.name}
                      </div>
                      <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.artists?.map((a: any) => a.name).join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ maxHeight: '180px', overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 0.6rem 0.6rem' }}>
                {isLoadingPlaylists && playlistTab === 'mine'
                  ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' }}>
                      <RefreshCw size={13} className="animate-spin" /> Loading playlists...
                    </div>
                  : displayPlaylists.map(p => {
                      const isActive = selectedPlaylist.id === p.id;
                      return (
                        <button key={p.id}
                          onClick={() => handlePickPlaylist(p)}
                          disabled={starting}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.55rem',
                            padding: '0.4rem 0.55rem', borderRadius: '8px', border: 'none', width: '100%',
                            background: isActive ? 'rgba(30,215,96,0.14)' : 'transparent',
                            borderLeft: `2px solid ${isActive ? '#1db954' : 'transparent'}`,
                            cursor: starting ? 'wait' : 'pointer', textAlign: 'left', transition: 'all 0.12s',
                            opacity: starting && !isActive ? 0.5 : 1,
                          }}>
                          {p.images?.[0]?.url
                            ? <img src={p.images[0].url} alt="" style={{ width: '30px', height: '30px', borderRadius: '5px', objectFit: 'cover', flexShrink: 0 }} />
                            : <span style={{ fontSize: '1.2rem', width: '30px', textAlign: 'center', flexShrink: 0 }}>{p.name.split(' ')[0]}</span>
                          }
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isActive ? '#1db954' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.images ? p.name : p.name.slice(3)}
                            </div>
                            {(p.desc || p.tracks) && (
                              <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.3)' }}>
                                {p.desc || `${p.tracks?.total ?? '?'} tracks`}
                              </div>
                            )}
                          </div>
                          {isActive && (starting
                            ? <div className="sp-spin" style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid rgba(29,185,84,0.3)', borderTopColor: '#1db954', flexShrink: 0 }} />
                            : <span style={{ color: '#1db954', fontSize: '0.75rem', flexShrink: 0 }}>▶</span>
                          )}
                        </button>
                      );
                    })
                }
              </div>
            )}
          </div>
        )}

        {/* ── Mini Controls Bar ── */}
        <div style={{ padding: '0.7rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.68rem', color: '#1db954', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Music2 size={11} />
              <span>Spotify</span>
              {isPlaying && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1db954', animation: 'spPulse 1.5s infinite' }} />}
            </div>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Hide picker' : 'Pick playlist'} style={{ background: expanded ? 'rgba(29,185,84,0.18)' : 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: expanded ? '#1db954' : 'rgba(255,255,255,0.5)', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>
              <button onClick={hideFloating} title="Hide" style={{ background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Track info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            {currentTrack?.albumArt
              ? <img src={currentTrack.albumArt} alt="album" style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 3px 12px rgba(0,0,0,0.4)' }} />
              : <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(29,185,84,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Volume2 size={18} style={{ color: '#1db954' }} />
                </div>
            }
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                {currentTrack?.title || (sdkReady ? 'Pick a playlist ↑ to play' : selectedPlaylist.name?.replace(/^[^\w\u0900-\u097F]+/, '') || 'Connecting...')}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.15rem' }}>
                {currentTrack?.artist || (sdkReady ? 'Click ↑ → choose playlist → plays instantly' : sdkError ? 'Use Spotify app to play' : 'Initialising player...')}
              </div>
            </div>
          </div>

          {/* Progress */}
          {currentTrack && (
            <div>
              <div style={{ height: '2px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#1db954,#1ed760)', borderRadius: '2px', transition: 'width 1s linear' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem', fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>
                <span>{fmt(currentTrack.progressMs)}</span>
                <span>{fmt(currentTrack.durationMs)}</span>
              </div>
            </div>
          )}

          {/* Premium banner for Free users */}
          {!isPremium && (
            <div style={{
              margin: '0 0 0.5rem',
              padding: '0.5rem 0.75rem',
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#fbbf24', fontWeight: 600 }}>
                <Lock size={11} /> Spotify Premium required for browser playback
              </div>
              <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                Zentrack is still tracking what plays on your Spotify app.
              </div>
              <a
                href="https://open.spotify.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem',
                  background: '#1db954', color: '#000', fontWeight: 700,
                  textDecoration: 'none', width: 'fit-content',
                }}
              >
                <ExternalLink size={11} /> Open Spotify App
              </a>
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <button onClick={toggleShuffle} title={canControl ? (isShuffle ? 'Disable Shuffle' : 'Enable Shuffle') : 'Requires Spotify Premium'} disabled={!canControl}
              style={{ background: 'none', border: 'none', cursor: canControl ? 'pointer' : 'not-allowed', color: canControl ? (isShuffle ? '#1db954' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.4rem', borderRadius: '50%', transition: 'all 0.15s', filter: isShuffle ? 'drop-shadow(0 0 6px rgba(29,185,84,0.7))' : 'none', position: 'relative' }}
              onMouseEnter={e => { if (canControl) { e.currentTarget.style.color = isShuffle ? '#1ed760' : '#fff'; e.currentTarget.style.transform = 'scale(1.1)'; } }}
              onMouseLeave={e => { e.currentTarget.style.color = canControl ? (isShuffle ? '#1db954' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}>
              <Shuffle size={16} />
              {isShuffle && <div style={{ position: 'absolute', bottom: '0px', width: '4px', height: '4px', borderRadius: '50%', background: '#1db954' }} />}
            </button>

            <button onClick={skipPrevious} title={canControl ? 'Previous' : 'Requires Spotify Premium'} disabled={!canControl}
              style={{ background: 'none', border: 'none', cursor: canControl ? 'pointer' : 'not-allowed', color: canControl ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', padding: '0.4rem', borderRadius: '50%', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (canControl) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'scale(1.1)'; } }}
              onMouseLeave={e => { e.currentTarget.style.color = canControl ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}>
              <SkipBack size={20} fill="currentColor" />
            </button>

            <button onClick={togglePlayPause} title={canControl ? (isPlaying ? 'Pause' : 'Play') : 'Requires Spotify Premium'} disabled={!canControl}
              style={{ width: '40px', height: '40px', borderRadius: '50%', background: canControl ? '#1db954' : 'rgba(255,255,255,0.1)', border: 'none', cursor: canControl ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: canControl ? '#000' : 'rgba(255,255,255,0.2)', boxShadow: canControl ? '0 3px 16px rgba(29,185,84,0.45)' : 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (canControl) e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              {!canControl ? <Lock size={15} /> : isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
            </button>

            <button onClick={skipNext} title={canControl ? 'Next' : 'Requires Spotify Premium'} disabled={!canControl}
              style={{ background: 'none', border: 'none', cursor: canControl ? 'pointer' : 'not-allowed', color: canControl ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', padding: '0.4rem', borderRadius: '50%', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (canControl) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'scale(1.1)'; } }}
              onMouseLeave={e => { e.currentTarget.style.color = canControl ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}>
              <SkipForward size={20} fill="currentColor" />
            </button>

            <button onClick={() => { setPlaylistTab('queue'); setExpanded(true); }} title="View Queue"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: playlistTab === 'queue' && expanded ? '#1db954' : 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', padding: '0.4rem', borderRadius: '50%', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = playlistTab === 'queue' && expanded ? '#1ed760' : '#fff'; e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = playlistTab === 'queue' && expanded ? '#1db954' : 'rgba(255,255,255,0.45)'; e.currentTarget.style.transform = 'scale(1)'; }}>
              <ListMusic size={16} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes spSpin { to { transform: rotate(360deg); } }
        .sp-spin { animation: spSpin 0.8s linear infinite; }
        #spotify-floating-player ::-webkit-scrollbar { width: 3px; }
        #spotify-floating-player ::-webkit-scrollbar-thumb { background: rgba(29,185,84,0.3); border-radius: 99px; }
        @media (max-width: 600px) {
          #spotify-floating-player { bottom: 0 !important; right: 0 !important; left: 0 !important; width: 100% !important; border-radius: 18px 18px 0 0 !important; }
        }
      `}</style>
    </>
  );
};
