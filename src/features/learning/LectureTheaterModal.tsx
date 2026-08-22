import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import YouTube from 'react-youtube';
import {
  X, Maximize2, Minimize2, Eye, Gauge, SkipBack, SkipForward,
  CheckCircle2, Sparkles, FileText, Volume2, Clock, ChevronRight
} from 'lucide-react';
import { ZenGptTutorPane } from './ZenGptTutorPane';
import { TranscriptPane } from './TranscriptPane';
import { LectureNotesPane } from './LectureNotesPane';
import { fetchVideoTranscript, transcriptToPlainText, type TranscriptCue } from '../../services/youtubeTranscriptService';
import { SPEEDS, SPEED_KEY, TS_KEY } from './learningHelpers';
import { toast } from 'sonner';

interface LectureTheaterModalProps {
  playing: {
    topicId: string;
    subtaskId: string;
    videoId: string;
    title: string;
    url?: string;
    notes?: string;
    isCompleted?: boolean;
    watchedCount: number;
  };
  total: number;
  idx: number;
  topicName: string;
  onClose: () => void;
  onMinimize: () => void;
  onMarkWatched: (topicId: string, subtaskId: string) => void;
  onNavigate: (delta: number) => void;
  onSaveVideoNote: (topicId: string, subtaskId: string, note: string) => void;
}

type ActiveTab = 'zengpt' | 'transcript' | 'notes';

export const LectureTheaterModal: React.FC<LectureTheaterModalProps> = ({
  playing,
  total,
  idx,
  topicName,
  onClose,
  onMinimize,
  onMarkWatched,
  onNavigate,
  onSaveVideoNote,
}) => {
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;
  const progressPct = total > 0 ? (playing.watchedCount / total) * 100 : 0;

  const [activeTab, setActiveTab] = useState<ActiveTab>('zengpt');
  const [speed, setSpeed] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(SPEED_KEY)) || 1;
    } catch {
      return 1;
    }
  });
  const [focusMode, setFocusMode] = useState(false);
  const playerRef = useRef<any>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const DEFAULT_SPLIT_RATIO = 64; // Optimal 64% Video / 36% AI Companion split

  // Split resize state (persisted to localStorage)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('lp_theater_split_ratio'));
      if (saved && saved >= 35 && saved <= 78) return saved;
    } catch {}
    return DEFAULT_SPLIT_RATIO;
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDownResizer = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - rect.left;
      const newPct = (newWidth / rect.width) * 100;
      const clampedPct = Math.max(35, Math.min(78, newPct));
      setSplitRatio(clampedPct);
      try {
        localStorage.setItem('lp_theater_split_ratio', String(clampedPct));
      } catch {}
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDoubleClickResizer = () => {
    setSplitRatio(DEFAULT_SPLIT_RATIO);
    try {
      localStorage.setItem('lp_theater_split_ratio', String(DEFAULT_SPLIT_RATIO));
    } catch {}
    toast.info('Reset split ratio to default (64% / 36%)');
  };


  // Transcript state
  const [transcriptCues, setTranscriptCues] = useState<TranscriptCue[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [activeCueIndex, setActiveCueIndex] = useState(-1);

  // Load transcript
  const loadTranscript = useCallback(async () => {
    if (!playing.videoId) return;
    setTranscriptLoading(true);
    try {
      const res = await fetchVideoTranscript(playing.videoId, playing.title);
      setTranscriptCues(res.cues);
    } catch {
      setTranscriptCues([]);
    } finally {
      setTranscriptLoading(false);
    }
  }, [playing.videoId, playing.title]);

  useEffect(() => {
    loadTranscript();
  }, [loadTranscript]);

  // Real-time playback tracker to highlight current transcript cue
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const currentSec = await playerRef.current.getCurrentTime();
          if (transcriptCues.length > 0) {
            const matchIdx = transcriptCues.findIndex((c, i) => {
              const nextStart = transcriptCues[i + 1]?.start ?? (c.start + c.duration + 5);
              return currentSec >= c.start && currentSec < nextStart;
            });
            if (matchIdx !== -1 && matchIdx !== activeCueIndex) {
              setActiveCueIndex(matchIdx);
            }
          }
        }
      } catch {}
    }, 500);

    return () => clearInterval(timer);
  }, [transcriptCues, activeCueIndex]);

  const getCurrentSecond = useCallback((): number => {
    try {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        return Math.floor(playerRef.current.getCurrentTime()) || 0;
      }
    } catch {}
    return 0;
  }, []);

  const handleSeek = (seconds: number) => {
    try {
      if (playerRef.current?.seekTo) {
        playerRef.current.seekTo(seconds, true);
        toast.info(`Jumped to ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`);
      }
    } catch {}
  };

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    if (playerRef.current?.setPlaybackRate) {
      playerRef.current.setPlaybackRate(s);
    }
    try {
      localStorage.setItem(SPEED_KEY, String(s));
    } catch {}
  };

  const handleInsertNote = (text: string) => {
    const newNote = (playing.notes ? playing.notes + '\n\n' : '') + text;
    onSaveVideoNote(playing.topicId, playing.subtaskId, newNote);
    setActiveTab('notes');
  };

  const resumeTs = (() => {
    try {
      const s = Number(localStorage.getItem(TS_KEY(playing.videoId)) || '0');
      if (s > 3) {
        const m = Math.floor(s / 60);
        const sec = String(s % 60).padStart(2, '0');
        return `${m}:${sec}`;
      }
    } catch {}
    return null;
  })();

  return createPortal(
    <div
      className={`lp-theater-overlay ${focusMode ? 'focus-mode' : ''}`}
      onClick={() => !focusMode && onMinimize()}
    >
      {/* Top Playlist Progress Rail */}
      <div className="lp-theater-progress-rail">
        <div
          className="lp-theater-progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div
        className="lp-theater-container"
        onClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        {!focusMode && (
          <div className="lp-theater-header">
            <div className="lp-theater-header-left">
              <div className="lp-theater-lecture-badge">
                #{idx + 1} of {total}
              </div>
              <div className="lp-theater-topic-pill" title={topicName}>
                {topicName}
              </div>
              <div className="lp-theater-titles">
                <h2 className="lp-theater-lecture-title" title={playing.title}>{playing.title}</h2>
              </div>
              {resumeTs && (
                <span className="lp-theater-resuming-pill">
                  ⏱ Resuming from {resumeTs}
                </span>
              )}
            </div>

            {/* Header Right Action Controls */}
            <div className="lp-theater-header-actions">
              {/* Playback Speed */}
              <div className="lp-speed-selector">
                <Gauge size={12} color="#8e8e93" />
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`lp-speed-pill ${speed === s ? 'active' : ''}`}
                    onClick={() => handleSpeedChange(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {/* Focus Mode */}
              <button
                type="button"
                className={`lp-theater-icon-btn ${focusMode ? 'active' : ''}`}
                onClick={() => setFocusMode(v => !v)}
                title="Focus Mode (Cinema)"
              >
                <Eye size={15} />
              </button>

              {/* Minimize to PiP */}
              <button
                type="button"
                className="lp-theater-icon-btn"
                onClick={onMinimize}
                title="Minimize player"
              >
                <Minimize2 size={15} />
              </button>

              {/* Close Player */}
              <button
                type="button"
                className="lp-theater-icon-btn close"
                onClick={onClose}
                title="Close Theater"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Main Content: Split Theater Layout */}
        <div
          ref={splitContainerRef}
          className={`lp-theater-split-body ${focusMode ? 'focus' : ''} ${isDragging ? 'is-dragging' : ''}`}
        >
          {/* Left: Video Player Column */}
          <div
            className="lp-theater-video-col"
            style={{
              flex: focusMode ? '1 1 100%' : `0 0 ${splitRatio}%`,
              maxWidth: focusMode ? '100%' : `${splitRatio}%`,
            }}
          >
            <div className="lp-video-player-wrapper">
              <YouTube
                videoId={playing.videoId}
                onReady={(e: any) => {
                  playerRef.current = e.target;
                  e.target.setPlaybackRate(speed);
                }}
                opts={{
                  width: '100%',
                  height: '100%',
                  playerVars: {
                    autoplay: 1,
                    modestbranding: 1,
                    rel: 0,
                    start: Number(localStorage.getItem(TS_KEY(playing.videoId))) || undefined,
                  },
                }}
                onStateChange={(e: any) => {
                  if (e?.target?.getCurrentTime) {
                    const time = Math.floor(e.target.getCurrentTime());
                    if (time > 0) {
                      localStorage.setItem(TS_KEY(playing.videoId), time.toString());
                    }
                  }
                }}
                className="lp-youtube-iframe"
              />
            </div>

            {/* Bottom Lecture Controls */}
            {!focusMode && (
              <div className="lp-theater-bottom-bar">
                <div className="lp-theater-nav-btns">
                  <button
                    type="button"
                    className="lp-nav-pill-btn"
                    onClick={() => onNavigate(-1)}
                    disabled={!hasPrev}
                    title="Previous Lecture"
                  >
                    <SkipBack size={13} />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    className="lp-nav-pill-btn"
                    onClick={() => onNavigate(1)}
                    disabled={!hasNext}
                    title="Next Lecture"
                  >
                    <span>Next</span>
                    <SkipForward size={13} />
                  </button>
                </div>

                <button
                  type="button"
                  className={`lp-mark-complete-btn ${playing.isCompleted ? 'completed' : ''}`}
                  onClick={() => onMarkWatched(playing.topicId, playing.subtaskId)}
                >
                  <CheckCircle2 size={15} />
                  <span>{playing.isCompleted ? 'Completed (+25 XP)' : 'Mark as Completed'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Draggable Resizer Bar */}
          {!focusMode && (
            <div
              className={`lp-theater-resizer ${isDragging ? 'active' : ''}`}
              onMouseDown={handleMouseDownResizer}
              onDoubleClick={handleDoubleClickResizer}
              title="Drag to resize Video & AI Tutor (Double-click to reset 60/40)"
            >
              <div className="lp-resizer-handle" />
            </div>
          )}

          {/* Right: Companion Sidebar (Tabs for ZEN-GPT, Transcript, Notes) */}
          {!focusMode && (
            <div
              className="lp-theater-companion-col"
              style={{
                flex: '1 1 0',
                minWidth: '300px',
              }}
              onWheel={(e) => e.stopPropagation()}
            >
              {/* Tab Selector Bar */}
              <div className="lp-companion-tabs">
                <button
                  type="button"
                  className={`lp-companion-tab ${activeTab === 'zengpt' ? 'active' : ''}`}
                  onClick={() => setActiveTab('zengpt')}
                >
                  <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: 15, height: 15, objectFit: 'contain', opacity: activeTab === 'zengpt' ? 1 : 0.65 }} />
                  <span>ZEN-GPT Tutor</span>
                </button>
                <button
                  type="button"
                  className={`lp-companion-tab ${activeTab === 'transcript' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transcript')}
                >
                  <Volume2 size={14} color={activeTab === 'transcript' ? '#a599ff' : '#8e8e93'} />
                  <span>Transcript {transcriptCues.length > 0 && `(${transcriptCues.length})`}</span>
                </button>
                <button
                  type="button"
                  className={`lp-companion-tab ${activeTab === 'notes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('notes')}
                >
                  <FileText size={14} color={activeTab === 'notes' ? '#a599ff' : '#8e8e93'} />
                  <span>Lecture Notes</span>
                </button>
              </div>

              {/* Active Tab Panel */}
              <div className="lp-companion-tab-content">
                {activeTab === 'zengpt' && (
                  <ZenGptTutorPane
                    topicTitle={topicName}
                    lectureTitle={playing.title}
                    transcriptText={transcriptToPlainText(transcriptCues)}
                    getCurrentSecond={getCurrentSecond}
                    onInsertNote={handleInsertNote}
                    onSeek={handleSeek}
                  />
                )}
                {activeTab === 'transcript' && (
                  <TranscriptPane
                    cues={transcriptCues}
                    loading={transcriptLoading}
                    activeCueIndex={activeCueIndex}
                    onSeek={handleSeek}
                    onRetry={loadTranscript}
                  />
                )}
                {activeTab === 'notes' && (
                  <LectureNotesPane
                    initialNotes={playing.notes || ''}
                    onSaveNotes={(note) => onSaveVideoNote(playing.topicId, playing.subtaskId, note)}
                    getCurrentSecond={getCurrentSecond}
                    onSeek={handleSeek}
                    lectureTitle={playing.title}
                    transcriptText={transcriptToPlainText(transcriptCues)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

