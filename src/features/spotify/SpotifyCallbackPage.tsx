import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { exchangeCodeForTokens, fetchSpotifyProfile } from '../../services/spotify';

function getRedirectUri() {
  return `${window.location.origin}/spotify-callback`;
}

export const SpotifyCallbackPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      toast.error('Spotify connection was cancelled or failed.');
      navigate('/tools', { replace: true });
      return;
    }

    if (!code) {
      toast.error('No authorization code received from Spotify.');
      navigate('/tools', { replace: true });
      return;
    }

    const doExchange = async () => {
      try {
        await exchangeCodeForTokens(code, getRedirectUri());
        await fetchSpotifyProfile();
        // Notify SpotifyContext immediately — same SPA session, focus won't fire
        window.dispatchEvent(new Event('spotify-connected'));
        toast.success('Spotify connected! 🎵');
      } catch (err) {
        console.error(err);
        toast.error('Failed to connect Spotify. Please try again.');
      } finally {
        navigate('/tools', { replace: true });
      }
    };

    doExchange();
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      gap: '1.5rem',
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #1db954, #1ed760)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2rem',
        boxShadow: '0 0 40px rgba(29, 185, 84, 0.4)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        🎵
      </div>
      <p style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>
        Connecting Spotify...
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Exchanging tokens, please wait.
      </p>
    </div>
  );
};
