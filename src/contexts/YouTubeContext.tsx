import React, { createContext, useContext, useState, useRef, useCallback, ReactNode } from 'react';
import type { YouTubePlayer } from 'react-youtube';

export interface YouTubeVideoData {
  videoId: string;
  title: string;
  topicId: string;
  subtaskId: string;
  watchedCount: number;
  totalCount: number;
  indexInPlaylist: number; // For Up Next
}

export interface YouTubeQueueItem {
  subtaskId: string;
  topicId: string;
  videoId: string;
  title: string;
}

interface YouTubeContextType {
  playing: YouTubeVideoData | null;
  isPipMode: boolean;
  queue: YouTubeQueueItem[];
  playerInstance: YouTubePlayer | null;
  portalNode: HTMLElement | null;
  
  playVideo: (video: YouTubeVideoData, newQueue?: YouTubeQueueItem[]) => void;
  closePlayer: () => void;
  setPipMode: (isPip: boolean) => void;
  setPlayerInstance: (player: YouTubePlayer | null) => void;
  setPortalNode: (node: HTMLElement | null) => void;
  
  // Controls
  seekTo: (seconds: number) => void;
  getCurrentTime: () => Promise<number>;
  
  // Playback events
  onVideoEnded: (() => void) | null;
  setOnVideoEnded: (cb: (() => void) | null) => void;
}

const YouTubeContext = createContext<YouTubeContextType | undefined>(undefined);

export function YouTubeProvider({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState<YouTubeVideoData | null>(null);
  const [isPipMode, setIsPipMode] = useState(false);
  const [queue, setQueue] = useState<YouTubeQueueItem[]>([]);
  const [playerInstance, setPlayerInstance] = useState<YouTubePlayer | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  
  const onVideoEndedRef = useRef<(() => void) | null>(null);

  const playVideo = useCallback((video: YouTubeVideoData, newQueue?: YouTubeQueueItem[]) => {
    setPlaying(video);
    setIsPipMode(false); // Playing a new video always expands the modal initially
    if (newQueue) {
      setQueue(newQueue);
    }
  }, []);

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setIsPipMode(false);
    setQueue([]);
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (playerInstance) {
      playerInstance.seekTo(seconds, true);
    }
  }, [playerInstance]);

  const getCurrentTime = useCallback(async () => {
    if (playerInstance) {
      return await playerInstance.getCurrentTime();
    }
    return 0;
  }, [playerInstance]);

  return (
    <YouTubeContext.Provider
      value={{
        playing,
        isPipMode,
        queue,
        playerInstance,
        portalNode,
        playVideo,
        closePlayer,
        setPipMode: setIsPipMode,
        setPlayerInstance,
        setPortalNode,
        seekTo,
        getCurrentTime,
        onVideoEnded: onVideoEndedRef.current,
        setOnVideoEnded: (cb) => { onVideoEndedRef.current = cb; },
      }}
    >
      {children}
    </YouTubeContext.Provider>
  );
}

export function useYouTube() {
  const context = useContext(YouTubeContext);
  if (context === undefined) {
    throw new Error('useYouTube must be used within a YouTubeProvider');
  }
  return context;
}
