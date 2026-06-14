import { useCallback, useEffect, useState } from 'react';
import { Music2, LogIn, LogOut, AlertCircle, ExternalLink, ChevronDown } from 'lucide-react';
import {
  SPOTIFY_CONFIGURED,
  getSpotifyAuthUrl,
  getStoredTokens,
  clearSpotifyTokens,
} from '../../services/spotify';
import { useSpotify } from '../../contexts/SpotifyContext';

function getRedirectUri() {
  return `${window.location.origin}/spotify-callback`;
}


export const SpotifyPlayer = () => {
  const { isConnected, currentTrack, isPlaying, disconnect, setCurrentPlaylistId, setShowFloating } = useSpotify();
  const [profile, setProfile] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const checkConnection = useCallback(() => {
    const { accessToken, profile: storedProfile } = getStoredTokens();
    if (accessToken) setProfile(storedProfile);
    else setProfile(null);
  }, []);

  useEffect(() => {
    checkConnection();
    window.addEventListener('focus', checkConnection);
    return () => window.removeEventListener('focus', checkConnection);
  }, [checkConnection]);

  const handleConnect = () => {
    setIsConnecting(true);
    window.location.href = getSpotifyAuthUrl(getRedirectUri());
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    // Let the UI show 'Disconnecting...'
    await new Promise(r => setTimeout(r, 400));
    disconnect();
    setProfile(null);
    setIsDisconnecting(false);
    // Notify context — same-page disconnect doesn't trigger focus
    window.dispatchEvent(new Event('spotify-disconnected'));
  };

  // ─── Not configured ──────────────────────────────────────────────────────────
  if (!SPOTIFY_CONFIGURED) {
    return (
      <div style={{ background: 'linear-gradient(135deg,rgba(30,215,96,0.06),rgba(30,215,96,0.02))', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(30,215,96,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1db954' }}>
            <Music2 size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Spotify Player</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Focus music + your playlists</p>
          </div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '1rem', display: 'flex', gap: '0.75rem' }}>
          <AlertCircle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.1rem' }} />
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: '#f59e0b' }}>Setup Required</strong><br />
            Add <code style={{ background: 'rgba(255,255,255,0.07)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>VITE_SPOTIFY_CLIENT_ID</code> to your .env and Vercel env vars.
          </div>
        </div>
        <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.65rem 1rem' }}>
          <ExternalLink size={14} /> Open Spotify Developer Dashboard
        </a>
      </div>
    );
  }

  // ─── Not connected ───────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div style={{ background: 'linear-gradient(135deg,rgba(30,215,96,0.08),rgba(30,215,96,0.02))', border: '1px solid rgba(30,215,96,0.25)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(30,215,96,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1db954' }}>
            <Music2 size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Spotify Player</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Connect once — control from the mini player (bottom-right)</p>
          </div>
        </div>
        <button onClick={handleConnect} disabled={isConnecting} style={{ width: '100%', padding: '0.9rem', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg,#1db954,#1ed760)', color: '#000', fontSize: '0.95rem', fontWeight: 700, cursor: isConnecting ? 'not-allowed' : 'pointer', opacity: isConnecting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', boxShadow: '0 4px 20px rgba(29,185,84,0.35)' }}>
          {isConnecting ? (
            <>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #000', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
              Connecting...
            </>
          ) : (
            <>
              <LogIn size={18} /> Connect Spotify
            </>
          )}
        </button>
      </div>
    );
  }

  // ─── Connected — show status + quick open ───────────────────────────────────
  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(30,215,96,0.06),rgba(30,215,96,0.01))', border: '1px solid rgba(30,215,96,0.2)', borderRadius: '16px', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(30,215,96,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1db954', flexShrink: 0 }}>
          <Music2 size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Spotify Player</h3>
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
              {profile.images?.[0]?.url && <img src={profile.images[0].url} alt="avatar" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />}
              <span style={{ fontSize: '0.73rem', color: '#1db954', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name || profile.id}</span>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1db954', animation: 'pulse 2s infinite', flexShrink: 0 }} />
            </div>
          )}
        </div>
        <button onClick={handleDisconnect} disabled={isDisconnecting} style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.07)', color: '#ef4444', cursor: isDisconnecting ? 'not-allowed' : 'pointer', opacity: isDisconnecting ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 500, flexShrink: 0 }}>
          {isDisconnecting ? (
            <>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #ef4444', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
              Disconnecting...
            </>
          ) : (
            <>
              <LogOut size={12} /> Disconnect
            </>
          )}
        </button>
      </div>

      {/* Currently playing */}
      {currentTrack ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: '10px', background: 'rgba(29,185,84,0.07)', border: '1px solid rgba(29,185,84,0.15)' }}>
          {currentTrack.albumArt && (
            <img src={currentTrack.albumArt} alt="album" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.title}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.artist}</div>
          </div>
          {isPlaying && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1db954', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />}
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', padding: '0.5rem 0', textAlign: 'center' }}>
          Nothing playing yet
        </div>
      )}

      {/* Open mini player CTA */}
      <button
        onClick={() => setShowFloating(true)}
        style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', border: '1px solid rgba(29,185,84,0.25)', background: 'rgba(29,185,84,0.08)', color: '#1db954', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
      >
        <Music2 size={14} /> Open Player &amp; Choose Playlist
        <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
      </button>
    </div>
  );
};
