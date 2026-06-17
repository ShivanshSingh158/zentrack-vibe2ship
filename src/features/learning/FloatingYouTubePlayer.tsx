import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import YouTube from 'react-youtube';
import type { YouTubePlayer, YouTubeEvent } from 'react-youtube';
import { Maximize2, Minimize2, X, Play, Pause, SkipForward, Check } from 'lucide-react';
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
    <div className={`relative w-full h-full bg-black ${isPipMode ? 'pointer-events-none' : ''}`}>
      <YouTube
        videoId={playing.videoId}
        opts={{
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
          },
        }}
        onReady={onReady}
        onStateChange={onStateChange}
        className="w-full h-full"
        iframeClassName="w-full h-full"
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
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="fixed bottom-6 right-6 w-80 bg-zinc-900 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden z-[99999] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-2 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800">
            <div className="flex-1 min-w-0 pr-2">
              <div className="text-xs font-semibold text-zinc-100 truncate">{playing.title}</div>
              <div className="text-[10px] text-zinc-400 truncate">
                {nextInQueue ? `Up Next: ${nextInQueue.title}` : 'Last video'}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button 
                onClick={() => setPipMode(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
                title="Expand"
              >
                <Maximize2 size={14} />
              </button>
              <button 
                onClick={closePlayer}
                className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Video Container */}
          <div className="relative aspect-video w-full group">
            {YouTubeIframe}
            
            {/* Hover overlay for play/pause in PiP */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
              <button 
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105"
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
              </button>
              {nextInQueue && (
                <button 
                  onClick={handleAutoAdvance}
                  className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                  title="Next Video"
                >
                  <SkipForward size={14} />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
