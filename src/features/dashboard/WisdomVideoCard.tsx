import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { Play, ChevronDown, SkipForward, Sparkles, X, RefreshCw, Lock, Shuffle } from 'lucide-react';
import YouTube from 'react-youtube';
import type { YouTubePlayer, YouTubeEvent } from 'react-youtube';
import {
  getCurrentWisdomVideo, getNextWisdomVideo, isVideoNew, videosRemaining,
  CATEGORY_LABELS, DYNAMIC_CHANNELS,
} from '../../data/wisdomVideos';
import type { WisdomVideo } from '../../data/wisdomVideos';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { db, auth } from '../../services/firebase';
import { doc, setDoc } from 'firebase/firestore';

// ── CSS ───────────────────────────────────────────────────────────────────────
const WISDOM_STYLES = `
.wisdom-accordion {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 260ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: grid-template-rows;
}
.wisdom-accordion.open {
  grid-template-rows: 1fr;
}
.wisdom-accordion > .wisdom-accordion-inner {
  overflow: hidden;
  min-height: 0;
}
.wisdom-chevron {
  display: flex;
  align-items: center;
  color: rgba(255,255,255,0.3);
  transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
.wisdom-chevron.open {
  transform: rotate(180deg);
}
.wisdom-card {
  background: linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(99,102,241,0.04) 100%);
  border: 1px solid rgba(139,92,246,0.16);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 200ms ease;
  -webkit-tap-highlight-color: transparent;
}
.wisdom-card:has(.wisdom-accordion.open) {
  border-color: rgba(139,92,246,0.28);
}
.wisdom-next-btn {
  transition: background 150ms ease, transform 100ms ease, box-shadow 150ms ease;
}
.wisdom-next-btn:hover {
  background: rgba(139,92,246,0.18) !important;
  transform: scale(1.04);
  box-shadow: 0 0 16px rgba(139,92,246,0.25);
}
.wisdom-next-btn:active {
  transform: scale(0.97);
}
`;

if (typeof document !== 'undefined' && !document.getElementById('wisdom-card-styles')) {
  const el = document.createElement('style');
  el.id = 'wisdom-card-styles';
  el.textContent = WISDOM_STYLES;
  document.head.appendChild(el);
}

// ── Daily watch-time cap ──────────────────────────────────────────────────────
const MAX_WATCH_SECONDS  = 40 * 60; // 40 minutes

const getLocalDateString = (d: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ── Lazy YouTube player ───────────────────────────────────────────────────────
const WisdomPlayer = memo(({ 
  videoId, 
  isOpen, 
  dailyWatchSeconds, 
  onIncrementWatchTime 
}: { 
  videoId: string; 
  isOpen: boolean;
  dailyWatchSeconds: number;
  onIncrementWatchTime: (seconds: number) => number;
}) => {
  const [mounted, setMounted]         = useState(false);
  const playerRef                     = useRef<YouTubePlayer | null>(null);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [limitReached, setLimitReached] = useState(() => dailyWatchSeconds >= MAX_WATCH_SECONDS);
  const currentWatchSecondsRef = useRef(dailyWatchSeconds);

  useEffect(() => {
    currentWatchSecondsRef.current = dailyWatchSeconds;
  }, [dailyWatchSeconds]);

  useEffect(() => {
    if (isOpen) {
      const isReached = currentWatchSecondsRef.current >= MAX_WATCH_SECONDS;
      setLimitReached(isReached);
      if (isReached && playerRef.current) {
        try { playerRef.current.pauseVideo(); } catch {}
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !mounted) {
      const t = setTimeout(() => setMounted(true), 60);
      return () => clearTimeout(t);
    }
    if (!isOpen) {
      if (playerRef.current) { try { playerRef.current.pauseVideo(); } catch {} }
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen, mounted]);

  const onReady = (e: YouTubeEvent<any>) => {
    playerRef.current = e.target;
    try {
      const saved = Number(localStorage.getItem(`wisdom_ts_${videoId}`) || '0');
      if (saved > 5) e.target.seekTo(saved, true);
    } catch {}
  };

  const onStateChange = (e: YouTubeEvent<number>) => {
    if (e.data === 1) setIsPlaying(true);
    if (e.data === 2 || e.data === 0) setIsPlaying(false);
  };

  // Track watch time every 5 s
  useEffect(() => {
    if (!isPlaying || !isOpen || limitReached) return;
    const interval = setInterval(async () => {
      if (!playerRef.current) return;
      try {
        const state = await playerRef.current.getPlayerState();
        if (state === 1) {
          const newTotal = onIncrementWatchTime(5);
          currentWatchSecondsRef.current = newTotal;
          if (newTotal >= MAX_WATCH_SECONDS) {
            setLimitReached(true);
            try { playerRef.current.pauseVideo(); } catch {}
            clearInterval(interval);
          }
        }
        const time = await playerRef.current.getCurrentTime();
        if (time > 3) {
          localStorage.setItem(`wisdom_ts_${videoId}`, String(Math.floor(time)));
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [isPlaying, isOpen, videoId, limitReached, onIncrementWatchTime]);

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      borderRadius: '10px', overflow: 'hidden', background: '#0a0a0f',
    }}>
      {limitReached ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#0a0a0f',
          textAlign: 'center', padding: '1rem', zIndex: 10,
        }}>
          <div style={{ background: 'rgba(139,92,246,0.1)', padding: '0.75rem', borderRadius: '50%', marginBottom: '0.75rem' }}>
            <Lock size={24} style={{ color: '#a78bfa' }} />
          </div>
          <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Daily Limit Reached</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '220px', lineHeight: 1.4 }}>
            You've watched your 40 minutes for today. Time to apply it!
          </div>
        </div>
      ) : mounted ? (
        <YouTube
          videoId={videoId}
          opts={{ playerVars: { autoplay: 1, modestbranding: 1, rel: 0, enablejsapi: 1 } }}
          onReady={onReady}
          onStateChange={onStateChange}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          className="yt-container-full"
          iframeClassName="yt-iframe-full"
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0a0a0f',
        }}>
          <Play size={28} style={{ color: 'rgba(255,255,255,0.12)' }} />
        </div>
      )}
    </div>
  );
});
WisdomPlayer.displayName = 'WisdomPlayer';

// ── Dynamic RSS fetch ─────────────────────────────────────────────────────────
const CACHE_KEY = 'zentrack_wisdom_dynamic_cache';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

function useDynamicWisdomVideos() {
  const [dynamicVideos, setDynamicVideos] = useState<WisdomVideo[]>([]);

  useEffect(() => {
    async function fetchDynamic() {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL) {
            // Ensure Aaron is stripped from cached videos as well
            const filteredCached = (parsed.videos || []).filter((v: any) => !v.title.toLowerCase().includes('aaron'));
            setDynamicVideos(filteredCached);
            return;
          }
        }
        const shuffledChannels = [...DYNAMIC_CHANNELS].sort(() => 0.5 - Math.random()).slice(0, 2);
        let newVideos: WisdomVideo[] = [];
        for (const ch of shuffledChannels) {
          const res  = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`);
          const data = await res.json();
          if (data.status === 'ok' && data.items) {
            const vids = data.items
              .slice(0, 2)
              .filter((item: any) => {
                const title = item.title.toLowerCase();
                return !title.includes('#shorts') && !item.link.includes('shorts') && !title.includes('aaron');
              })
              .map((item: any) => {
                const match = item.link.match(/v=([^&]+)/);
                const vId   = match ? match[1] : item.guid.replace('yt:video:', '');
                return {
                  id: vId, title: item.title, channel: ch.name,
                  durationMin: 'Latest', category: 'latest', tags: [ch.cat, 'new'],
                } as WisdomVideo;
              });
            newVideos.push(...vids);
          }
        }
        if (newVideos.length > 0) {
          newVideos = newVideos.slice(0, 3);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), videos: newVideos }));
          setDynamicVideos(newVideos);
        }
      } catch { /* silent fail */ }
    }
    fetchDynamic();
  }, []);

  return dynamicVideos;
}

// ── Main WisdomVideoCard ──────────────────────────────────────────────────────
export function WisdomVideoCard() {
  const [isOpen, setIsOpen]     = useState(false);
  const [video, setVideo]       = useState<WisdomVideo>(() => getCurrentWisdomVideo(0));
  const [remaining, setRemaining] = useState(() => videosRemaining());
  const dynamicVideos           = useDynamicWisdomVideos();
  const headerRef               = useRef<HTMLDivElement>(null);
  
  const { dailyLogs } = useGlobalData();
  const todayStr = getLocalDateString(new Date());
  const todayLog = dailyLogs.find(l => l.date === todayStr);
  const dailyWatchSeconds = todayLog?.wisdomWatchSeconds || 0;

  const handleIncrementWatchTime = useCallback((seconds: number) => {
    const newTotal = dailyWatchSeconds + seconds;
    const user = auth.currentUser;
    if (user) {
      setDoc(doc(db, 'daily_logs', `${user.uid}_${todayStr}`), { 
        date: todayStr,
        wisdomWatchSeconds: newTotal,
        updatedAt: Date.now()
      }, { merge: true }).catch(console.error);
    }
    return newTotal;
  }, [dailyWatchSeconds, todayStr]);

  // Re-init with dynamic videos once they load
  useEffect(() => {
    if (dynamicVideos.length > 0) {
      setVideo(getCurrentWisdomVideo(0, dynamicVideos));
      setRemaining(videosRemaining(dynamicVideos));
    }
  }, [dynamicVideos]);

  const showNew = isVideoNew();
  const thumbUrl = `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`;

  const handleToggle = useCallback(() => setIsOpen(prev => !prev), []);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const next = getNextWisdomVideo(dynamicVideos);
    setVideo(next);
    setRemaining(videosRemaining(dynamicVideos));
  }, [dynamicVideos]);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
  }, []);

  return (
    <div className="wisdom-card" style={{ marginBottom: '0.5rem' }}>

      {/* ── HEADER ── */}
      <div
        ref={headerRef}
        role="button"
        aria-expanded={isOpen}
        onClick={handleToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 0.9rem', cursor: 'pointer',
          userSelect: 'none', WebkitUserSelect: 'none', minHeight: '68px',
        }}
      >
        {/* Thumbnail */}
        <div style={{
          width: '76px', height: '52px', borderRadius: '8px',
          overflow: 'hidden', flexShrink: 0, background: '#111', position: 'relative',
        }}>
          <img src={thumbUrl} alt={video.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.32)',
          }}>
            <Play size={15} style={{ color: '#fff', fill: '#fff' }} />
          </div>
        </div>

        {/* Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem', flexWrap: 'nowrap' }}>
            <span style={{
              fontSize: '0.62rem', fontWeight: 700, color: '#a78bfa',
              textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {CATEGORY_LABELS[video.category]}
            </span>
            {showNew && (
              <span style={{
                fontSize: '0.58rem', fontWeight: 800, color: '#fff',
                background: 'linear-gradient(135deg,#f59e0b,#ef4444)',
                padding: '0.08rem 0.35rem', borderRadius: '9999px',
                letterSpacing: '0.04em', display: 'flex', alignItems: 'center',
                gap: '0.15rem', flexShrink: 0,
              }}>
                <Sparkles size={8} /> NEW
              </span>
            )}
            {/* Remaining badge */}
            <span style={{
              fontSize: '0.55rem', fontWeight: 700,
              color: 'rgba(167,139,250,0.6)',
              background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.15)',
              padding: '0.06rem 0.32rem', borderRadius: '9999px',
              display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0,
            }}>
              <Shuffle size={7} /> {remaining} left
            </span>
          </div>
          <div style={{
            fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
          }}>
            {video.title}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            {video.channel} · {typeof video.durationMin === 'number'
              ? `${video.durationMin} min`
              : <span style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', color: '#10b981', fontWeight: 600 }}><RefreshCw size={10} /> Auto-fetched</span>}
          </div>
        </div>

        <div className={`wisdom-chevron${isOpen ? ' open' : ''}`} style={{ flexShrink: 0 }}>
          <ChevronDown size={17} />
        </div>
      </div>

      {/* ── EXPANDABLE PLAYER ── */}
      <div className={`wisdom-accordion${isOpen ? ' open' : ''}`}>
        <div className="wisdom-accordion-inner">
          <div style={{ padding: '0 0.9rem 0.9rem' }}>
            <WisdomPlayer 
              videoId={video.id} 
              isOpen={isOpen} 
              dailyWatchSeconds={dailyWatchSeconds}
              onIncrementWatchTime={handleIncrementWatchTime}
            />

            {/* Meta row */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              marginTop: '0.7rem', gap: '0.5rem',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: '0.2rem' }}>
                  {video.title}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {video.channel} · {typeof video.durationMin === 'number'
                    ? `${video.durationMin} min`
                    : <span style={{ color: '#10b981', fontWeight: 600 }}>Recently Uploaded</span>}
                   · {CATEGORY_LABELS[video.category as keyof typeof CATEGORY_LABELS] || video.category.toUpperCase()}
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  {video.tags.slice(0, 3).map(tag => (
                    <span key={tag} style={{
                      fontSize: '0.6rem', padding: '0.08rem 0.35rem',
                      borderRadius: '9999px', background: 'rgba(139,92,246,0.1)',
                      color: '#a78bfa', fontWeight: 600,
                    }}>#{tag}</span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 }}>
                <button
                  className="wisdom-next-btn"
                  onClick={handleNext}
                  title={`Next video (${remaining - 1} remaining before reshuffle)`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.38rem 0.7rem', borderRadius: '8px',
                    border: '1px solid rgba(139,92,246,0.25)',
                    background: 'rgba(139,92,246,0.08)',
                    color: '#a78bfa', cursor: 'pointer',
                    fontSize: '0.73rem', fontWeight: 600, whiteSpace: 'nowrap',
                  }}
                >
                  <SkipForward size={13} />
                  Next
                  {remaining <= 3 && remaining > 1 && (
                    <span style={{
                      background: 'rgba(245,158,11,0.2)',
                      color: '#f59e0b',
                      borderRadius: '99px',
                      padding: '0.04rem 0.3rem',
                      fontSize: '0.58rem',
                      fontWeight: 800,
                    }}>{remaining - 1} left</span>
                  )}
                  {remaining <= 1 && (
                    <span style={{
                      background: 'rgba(139,92,246,0.2)',
                      color: '#c4b5fd',
                      borderRadius: '99px',
                      padding: '0.04rem 0.3rem',
                      fontSize: '0.58rem',
                      fontWeight: 800,
                    }}>🔀 reshuffling</span>
                  )}
                </button>
                <button
                  onClick={handleClose}
                  title="Close"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                    padding: '0.38rem 0.7rem', borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--text-muted)', cursor: 'pointer',
                    fontSize: '0.73rem', fontWeight: 600, whiteSpace: 'nowrap',
                  }}
                >
                  <X size={13} /> Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
