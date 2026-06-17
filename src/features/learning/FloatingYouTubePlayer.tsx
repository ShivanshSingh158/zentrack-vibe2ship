import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import YouTube from 'react-youtube';
import type { YouTubePlayer, YouTubeEvent } from 'react-youtube';
import { X, Maximize2, Play, Pause, SkipForward } from 'lucide-react';
import { useYouTube } from '../../contexts/YouTubeContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { motion, AnimatePresence } from 'framer-motion';

export const FloatingYouTubePlayer: React.FC = () => {
  const { 
    playing, isPipMode, queue, portalNode,
    setPipMode, closePlayer, setPlayerInstance, playVideo
  } = useYouTube();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const playerRef = useRef<YouTubePlayer | null>(null);

  // Sync isPlaying state
  const onStateChange = (e: YouTubeEvent<number>) => {
    // 1 = playing, 2 = paused, 0 = ended
    if (e.data === 1) setIsPlaying(true);
    if (e.data === 2) setIsPlaying(false);
    
    // Auto-advance
    if (e.data === 0 && playing) {
      handleAutoAdvance();
    }
  };

  const handleAutoAdvance = () => {
    if (!playing) return;
    
    // Mark current as complete in Firebase directly
    try {
      const topicRef = doc(db, 'learning_topics', playing.topicId);
      getDoc(topicRef).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          const subtasks = data.subTasks || [];
          const updated = subtasks.map((st: { id: string, isCompleted: boolean }) => st.id === playing.subtaskId ? { ...st, isCompleted: true } : st);
          updateDoc(topicRef, { subTasks: updated }).catch(() => {});
        }
      }).catch(() => {});
    } catch {}

    // Find next in queue
    const nextIdx = playing.indexInPlaylist + 1;
    if (nextIdx < queue.length) {
      const nextItem = queue[nextIdx];
      playVideo({
        ...playing,
        videoId: nextItem.videoId,
        title: nextItem.title,
        subtaskId: nextItem.subtaskId,
        topicId: nextItem.topicId,
        indexInPlaylist: nextIdx,
      }, queue);
    } else {
      closePlayer(); // Queue ended
    }
  };

  const onReady = (e: YouTubeEvent<any>) => {
    playerRef.current = e.target;
    setPlayerInstance(e.target);
    
    // Resume from local storage if available
    if (playing) {
      try {
        const saved = Number(localStorage.getItem(`yt_ts_${playing.videoId}`) || '0');
        if (saved > 5) {
          e.target.seekTo(saved, true);
        }
      } catch {}
    }
  };

  // Poll timestamp to save
  useEffect(() => {
    if (!playing || !isPlaying) return;
    const interval = setInterval(async () => {
      if (playerRef.current) {
        const time = await playerRef.current.getCurrentTime();
        if (time > 3) {
          localStorage.setItem(`yt_ts_${playing.videoId}`, String(Math.floor(time)));
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [playing, isPlaying]);

  if (!playing) return null;

  const togglePlay = () => {
    if (isPlaying) playerRef.current?.pauseVideo();
    else playerRef.current?.playVideo();
  };

  const nextInQueue = playing.indexInPlaylist < queue.length - 1 ? queue[playing.indexInPlaylist + 1] : null;

  // The actual YouTube iframe
  const YouTubeIframe = (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', backgroundColor: '#000', pointerEvents: isPipMode ? 'none' : 'auto' }}>
      <YouTube
        videoId={playing.videoId}
        opts={{
          playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
          },
        }}
        onReady={onReady}
        onStateChange={onStateChange}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        className="yt-container-full"
        iframeClassName="yt-iframe-full"
      />
    </div>
  );

  // If NOT in PiP mode and we have a portal node from the Modal, teleport the iframe there
  if (!isPipMode && portalNode) {
    return ReactDOM.createPortal(YouTubeIframe, portalNode);
  }

  // PiP Floating Mode UI
  return (
    <AnimatePresence>
      {isPipMode && (
        <motion.div
          drag
          dragMomentum={false}
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
          style={{ 
            position: 'fixed', bottom: '1.5rem', right: '1.5rem', width: '320px', 
            zIndex: 99999, borderRadius: '14px', overflow: 'hidden', 
            boxShadow: '0 25px 70px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.12)',
            background: '#000',
            cursor: 'grab'
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Video Container */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', backgroundColor: '#000' }}>
            {YouTubeIframe}
            
            {/* Top right controls overlay */}
            <div style={{ 
              position: 'absolute', top: '0.5rem', right: '0.5rem', 
              display: 'flex', gap: '0.4rem', zIndex: 10,
              opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s ease',
            }}>
              <button 
                onClick={() => setPipMode(false)}
                title="Expand"
                style={{
                  background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff', padding: '0.35rem', borderRadius: '8px', cursor: 'pointer',
                  backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.85)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.65)'}
              >
                <Maximize2 size={13} />
              </button>
              <button 
                onClick={closePlayer}
                title="Close"
                style={{
                  background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff', padding: '0.35rem', borderRadius: '8px', cursor: 'pointer',
                  backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.85)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.65)'}
              >
                <X size={14} />
              </button>
            </div>
            
            {/* Hover overlay for play/pause in PiP */}
            <div style={{ 
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', 
              opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
              pointerEvents: isHovered ? 'auto' : 'none'
            }}>
              <button 
                onClick={togglePlay}
                style={{ 
                  width: '44px', height: '44px', borderRadius: '50%', background: '#4f46e5',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                  transition: 'transform 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '2px' }} />}
              </button>
              {nextInQueue && (
                <button 
                  onClick={handleAutoAdvance}
                  title="Next Video"
                  style={{ 
                    width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(39,39,42,0.85)',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', backdropFilter: 'blur(4px)',
                    transition: 'transform 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <SkipForward size={16} fill="currentColor" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
