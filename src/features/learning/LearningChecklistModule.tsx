import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Check, ChevronDown, ChevronRight, BookOpen, Trash2,
  FileText, Search, X, Play, GripVertical,
  Eye, EyeOff, SkipForward, SkipBack, Bell, Edit3,
  ListPlus, Link as LinkIcon, Loader, Gauge, Minimize2, MessageSquare,
} from 'lucide-react';
import { LectureChatPanel } from './LectureChatPanel';
import { toast } from 'sonner';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { LearningTopic, LearningSubTask } from '../../types/index';
import { playPopSound } from '../../utils/sound';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CurriculumBuilderModal } from './CurriculumBuilderModal';
import { PREDEFINED_ROADMAPS } from '../../data/roadmaps';
import { TopicBody } from './TopicCard';
import {
  CW_KEY, EXPANDED_KEY, SPEED_KEY, SPEEDS, TS_KEY, UNDO_DELAY,
  progressColor, extractYoutubeId, formatDuration,
  sanitize, uniqueId, extractPlaylistId, fetchYouTubePlaylist
} from './learningHelpers';

// ── VideoPlayerModal ──────────────────────────────────────────────────────────

const VideoPlayerModal = React.memo(({ playing, total, idx, onClose, onMinimize, onMarkWatched, onNavigate, onSaveVideoNote, topicName, completedTopicNames, totalProgress }: {
  playing: any;
  total: number;
  idx: number;
  onClose: () => void;
  onMinimize: () => void;
  onMarkWatched: (topicId: string, subtaskId: string) => void;
  onNavigate: (delta: number) => void;
  onSaveVideoNote: (topicId: string, subtaskId: string, note: string) => void;
  topicName: string;
  completedTopicNames?: string[];
  totalProgress?: { completed: number; total: number };
}) => {
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;
  const progressPct = total > 0 ? ((playing.watchedCount) / total) * 100 : 0;

  const [speed, setSpeed] = useState<number>(() => {
    try { return Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { return 1; }
  });
  const [showNotes, setShowNotes] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatAutoTrigger, setChatAutoTrigger] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [noteText, setNoteText] = useState('');

  const handleTriggerQuiz = useCallback(() => {
    onMarkWatched(playing.topicId, playing.subtaskId);
    setShowChat(true);
    setShowNotes(false);
    setChatAutoTrigger("I just finished watching this video. Generate a 3-question rapid-fire quiz to test my knowledge on the core concepts. Label the questions Q1, Q2, and Q3. Do NOT reveal the answers yet.");
  }, [onMarkWatched, playing.topicId, playing.subtaskId]);

  useEffect(() => {
    // ✅ FIX: Add opt-out via localStorage + guard for short videos (< 15 min)
    const checkinEnabled = localStorage.getItem('zen_video_checkin_enabled') !== 'false';
    const videoDurationMin = playing.videoDurationSeconds ? playing.videoDurationSeconds / 60 : 999;
    if (!checkinEnabled || videoDurationMin < 15) return; // skip check-in for short videos

    // 5-minute proactive check-in
    const timer = setTimeout(() => {
      setShowChat(true);
      setShowNotes(false);
      setChatAutoTrigger("I'm a few minutes into this video. Give me a brief proactive check-in summary of what we've covered so far and ask if I have any questions.");
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [playing.videoId]);

  // Load existing note for this video
  useEffect(() => {
    // We'll pass current note via playing in a future improvement; for now load from parent
    setNoteText('');
  }, [playing.subtaskId]);

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    try { localStorage.setItem(SPEED_KEY, String(s)); } catch {}
  };

  // ── Study time tracker ────────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => {
      if (document.fullscreenElement) screen.orientation?.lock?.('landscape').catch(() => {});
      else screen.orientation?.unlock?.();
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      screen.orientation?.unlock?.();
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if the user is typing in chat or notes
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape' && !showNotes && !showChat) onClose();
      if ((e.key === 'ArrowRight' || e.key === 'n') && hasNext && !showNotes && !showChat) onNavigate(1);
      if ((e.key === 'ArrowLeft'  || e.key === 'p') && hasPrev && !showNotes && !showChat) onNavigate(-1);
      if (e.key === 'Enter' && !showNotes && !showChat) handleTriggerQuiz();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [playing, hasNext, hasPrev, onClose, onMarkWatched, onNavigate, showNotes, showChat]);

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
    <div onClick={() => !focusMode && onMinimize()} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: focusMode ? '#000' : 'rgba(0,0,0,0.96)', backdropFilter: focusMode ? 'none' : 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: focusMode ? '0' : '0.75rem', transition: 'all 0.3s' }}>
      {/* Playlist progress rail — always at very top */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '3px', background: 'rgba(255,255,255,0.08)', zIndex: 100000 }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', transition: 'width 0.5s ease', borderRadius: '0 2px 2px 0' }} />
      </div>

      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: (showChat || showNotes) && !focusMode ? '1450px' : '1100px', display: 'flex', flexDirection: 'column', gap: focusMode ? '0' : '0.75rem', height: focusMode ? '100vh' : 'auto', transition: 'all 0.3s' }}>
        {/* Header */}
        {!focusMode && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, background: 'rgba(255,255,255,0.07)', padding: '0.1rem 0.45rem', borderRadius: '99px', flexShrink: 0 }}>#{idx + 1} of {total}</span>
              {resumeTs && <span style={{ fontSize: '0.58rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '0.1rem 0.4rem', borderRadius: '99px', flexShrink: 0 }}>⏱ Resuming from {resumeTs}</span>}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.15rem' }}>{playing.title}</div>
          </div>
          {/* Speed controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.3rem 0.5rem', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
            <Gauge size={12} color="rgba(255,255,255,0.4)" />
            {SPEEDS.map(s => (
              <button key={s} onClick={() => handleSpeedChange(s)}
                style={{ padding: '0.18rem 0.4rem', borderRadius: '6px', border: 'none', background: speed === s ? '#3b82f6' : 'transparent', color: speed === s ? '#fff' : 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, transition: 'all 150ms ease' }}>
                {s}×
              </button>
            ))}
          </div>
            <button onClick={() => setFocusMode(v => !v)}
              title="Focus Mode"
              style={{ flexShrink: 0, background: focusMode ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)', border: `1px solid ${focusMode ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.15)'}`, borderRadius: '8px', width: '36px', height: '36px', color: focusMode ? '#818cf8' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Eye size={15} />
            </button>
            {/* Notes toggle */}
            <button onClick={() => { setShowNotes(v => !v); setShowChat(false); }}
              title="Video notes"
              style={{ flexShrink: 0, background: showNotes ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)', border: `1px solid ${showNotes ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.15)'}`, borderRadius: '8px', width: '36px', height: '36px', color: showNotes ? '#818cf8' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={15} />
            </button>
            {/* AI Chat toggle */}
            <button onClick={() => { setShowChat(v => !v); setShowNotes(false); }}
              title="Ask Gemini AI about this lecture"
              style={{ flexShrink: 0, background: showChat ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.08)', border: `1px solid ${showChat ? 'rgba(168,85,247,0.7)' : 'rgba(255,255,255,0.15)'}`, borderRadius: '8px', width: '36px', height: '36px', color: showChat ? '#c4b5fd' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <MessageSquare size={15} />
              {showChat && <span style={{ position: 'absolute', top: '4px', right: '4px', width: '6px', height: '6px', borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 6px rgba(168,85,247,0.8)' }} />}
            </button>
            <button onClick={onMinimize} title="Minimize to PiP" style={{ flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', width: '36px', height: '36px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Minimize2 size={16} />
            </button>
            <button onClick={onClose} title="Close Player" style={{ flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: '36px', height: '36px', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Player + optional notes panel side by side on wide screens */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flex: focusMode ? 1 : 'none' }}>
          <div 
            style={{ 
              flex: 1, position: 'relative', aspectRatio: focusMode ? 'auto' : '16/9', height: focusMode ? '100%' : 'auto', 
              background: '#000', borderRadius: focusMode ? '0' : '12px', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.9)', minWidth: 0, transition: 'all 0.3s' 
            }}>
            <iframe
              src={`https://www.youtube.com/embed/${playing.videoId}?autoplay=1&rel=0&modestbranding=1`}
              title={playing.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          </div>
          {/* Gemini AI chat sidebar */}
          {showChat && (
            <LectureChatPanel
              videoId={playing.videoId}
              videoTitle={playing.title}
              topicName={topicName}
              onClose={() => setShowChat(false)}
              isFullscreen={focusMode}
              progressPct={Math.round(progressPct)}
              completedTopics={completedTopicNames}
              totalProgress={totalProgress}
              autoTriggerMessage={chatAutoTrigger}
              onAutoTriggerComplete={() => setChatAutoTrigger(null)}
            />
          )}
          {/* In-video notes panel */}
          {showNotes && (
            <div style={{ width: focusMode ? '320px' : '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', height: focusMode ? '100%' : 'auto', maxHeight: focusMode ? '100%' : '280px', background: focusMode ? 'rgba(255,255,255,0.03)' : 'transparent', padding: focusMode ? '1.5rem 1rem' : '0', borderRadius: focusMode ? '12px' : '0', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '0.68rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📝 Video Notes</div>
                {focusMode && (
                  <button onClick={() => setShowNotes(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <textarea
                autoFocus
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder={`e.g. 12:30 - key concept\n24:00 - revisit this`}
                style={{ flex: 1, minHeight: focusMode ? 'auto' : '200px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '0.65rem', color: '#e4e4e7', fontSize: '0.8rem', resize: 'none', outline: 'none', lineHeight: 1.5 }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={async () => {
                  const min = 0;
                  const sec = "00";
                  setNoteText(prev => prev + (prev && !prev.endsWith('\n') ? '\n' : '') + `[${min}:${sec}] `);
                }} title="Insert current timestamp" style={{ padding: '0.45rem 0.6rem', borderRadius: '7px', border: '1px solid rgba(99,102,241,0.5)', background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  ⏱ Time
                </button>
                <button onClick={() => { onSaveVideoNote(playing.topicId, playing.subtaskId, noteText); toast.success('Notes saved'); }}
                  style={{ flex: 1, padding: '0.45rem', borderRadius: '7px', border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                  Save Notes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        {!focusMode && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={() => onNavigate(-1)} disabled={!hasPrev}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.55rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: hasPrev ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', color: hasPrev ? '#fff' : 'rgba(255,255,255,0.2)', cursor: hasPrev ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 600 }}>
                <SkipBack size={14} /> Prev
              </button>
              <button onClick={() => { if(hasNext) { onMarkWatched(playing.topicId, playing.subtaskId); onNavigate(1); } else { handleTriggerQuiz(); } }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, minHeight: '44px' }}>
                <Check size={15} strokeWidth={2.5} /> Mark Watched{hasNext ? ' & Next' : ' & Quiz'}
              </button>
              <button onClick={() => onNavigate(1)} disabled={!hasNext}
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.55rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: hasNext ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', color: hasNext ? '#fff' : 'rgba(255,255,255,0.2)', cursor: hasNext ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 600 }}>
                Next <SkipForward size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>← → navigate · Enter mark watched · Esc close</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)' }}>{playing.watchedCount}/{total} watched · {Math.round(progressPct)}%</div>
            </div>
          </>
        )}
        
        {/* Escape overlay for Focus Mode */}
        {focusMode && (
          <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000000, opacity: 0, transition: 'opacity 0.3s', display: 'flex', gap: '0.5rem' }} className="hover:opacity-100">
             {!showNotes && !showChat && (
               <button onClick={() => { setShowNotes(true); setShowChat(false); }} style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', padding: '0.5rem 1rem', borderRadius: '8px', color: '#fff', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                 <FileText size={15} /> Notes
               </button>
             )}
             {!showChat && !showNotes && (
               <button onClick={() => { setShowChat(true); setShowNotes(false); }} style={{ background: 'rgba(168,85,247,0.2)', backdropFilter: 'blur(4px)', padding: '0.5rem 1rem', borderRadius: '8px', color: '#c4b5fd', fontWeight: 'bold', border: '1px solid rgba(168,85,247,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                 <MessageSquare size={15} /> AI Chat
               </button>
             )}
             <button onClick={() => setFocusMode(false)} style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)', padding: '0.5rem 1rem', borderRadius: '8px', color: '#fff', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}>
               Exit Focus Mode
             </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});
VideoPlayerModal.displayName = 'VideoPlayerModal';



// ── Main Module ───────────────────────────────────────────────────────────────

export const LearningChecklistModule = () => {
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [showCurriculumBuilder, setShowCurriculumBuilder] = useState(false);

  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(() => {
    try { return localStorage.getItem(EXPANDED_KEY) || null; } catch { return null; }
  });
  const setAndPersistExpanded = useCallback((id: string | null) => {
    setExpandedTopicId(id);
    try { id ? localStorage.setItem(EXPANDED_KEY, id) : localStorage.removeItem(EXPANDED_KEY); } catch {}
  }, []);

  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});
  const [newSubtaskText, setNewSubtaskText] = useState<{ [key: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('learningSearch') || '');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [editingContext, setEditingContext] = useState<{ type: 'topic' | 'subtask'; topicId: string; subtaskId?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
  const [editNotes, setEditNotes] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isImportingYt, setIsImportingYt] = useState(false);
  const [showRoadmapHub, setShowRoadmapHub] = useState(false);
  const [importingRoadmapId, setImportingRoadmapId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<any>(null);
  const [isPipMode, setIsPipMode] = useState(false);
  const [continueWatching, setContinueWatching] = useState<{ topicId: string; subtaskId: string; videoId: string; title: string; topicTitle: string; timestamp?: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(CW_KEY) || 'null'); } catch { return null; }
  });
  // Undo delete queue: { topicId, subtask, timer }
  const undoQueueRef = useRef<{ topicId: string; subtask: LearningSubTask; timerId: number } | null>(null);

  // ── Custom Playlist Editor State ──────────────────────────────────────────
  const [editModeTopics, setEditModeTopics] = useState<Set<string>>(new Set());
  const [addVideoState, setAddVideoState] = useState<any>(null);
  const [mergePanelState, setMergePanelState] = useState<any>(null);
  const [renamingSubtask, setRenamingSubtask] = useState<{ topicId: string; subtaskId: string; title: string } | null>(null);
  const [bulkDeleteState, setBulkDeleteState] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const user = auth.currentUser;

  useEffect(() => { sessionStorage.setItem('learningSearch', searchQuery); }, [searchQuery]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchInputRef.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const q = query(collection(db, 'learning_topics'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningTopic));
      data.sort((a, b) => a.order !== undefined && b.order !== undefined ? a.order - b.order : b.createdAt - a.createdAt);
      setTopics(data);
      setIsLoading(false);
      // Clear continueWatching if the referenced playlist was deleted
      setContinueWatching(prev => {
        if (!prev) return null;
        const stillExists = data.some(t => t.id === prev.topicId);
        if (!stillExists) { try { localStorage.removeItem(CW_KEY); } catch {} return null; }
        return prev;
      });
    }, err => { console.error(err); toast.error('Failed to load topics'); setIsLoading(false); });
    return () => unsub();
  }, [user]);

  // ── Agent-triggered lecture opening ───────────────────────────────────────
  // Listens for 'agent-open-lecture' events dispatched by the AgentNavigator
  // in App.tsx when the user asks the AI to "open lecture X".
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        topicTitle?: string;
        lectureTitle?: string;
      };
      if (!detail) return;

      // Find the matching topic (fuzzy match on title)
      const lowerTopic = (detail.topicTitle || '').toLowerCase();
      const lowerLecture = (detail.lectureTitle || '').toLowerCase();

      // Find best matching topic
      let targetTopic = topics.find(t =>
        lowerTopic && t.title?.toLowerCase().includes(lowerTopic)
      ) || (lowerTopic ? null : topics[0]);

      if (!targetTopic && lowerLecture) {
        // Search all topics for the lecture
        targetTopic = topics.find(t =>
          t.subTasks?.some(st => (st.text || st.title || '').toLowerCase().includes(lowerLecture))
        );
      }

      if (!targetTopic) {
        toast.info(`Couldn't find topic "${detail.topicTitle || detail.lectureTitle}". Try searching manually.`);
        return;
      }

      // Expand the topic
      setAndPersistExpanded(targetTopic.id!);

      if (lowerLecture) {
        // Find matching lecture within the topic
        const matchingSubtask = targetTopic.subTasks?.find(st =>
          (st.text || st.title || '').toLowerCase().includes(lowerLecture)
        );

        if (matchingSubtask) {
          // Delay slightly so topic expands first
          setTimeout(() => {
            const videoId = matchingSubtask.url
              ? extractYoutubeId(matchingSubtask.url)
              : matchingSubtask.resources?.map((r: any) => extractYoutubeId(r.url)).find(Boolean);

            if (videoId) {
              handlePlayVideo(videoId, matchingSubtask.id, targetTopic!.id!);
              toast.success(`🎬 Opening: "${matchingSubtask.text || matchingSubtask.title}"`);
            } else {
              toast.info(`Found lecture but no video URL. Topic expanded.`);
            }
          }, 300);
        } else {
          toast.info(`Topic found. Couldn't find lecture "${detail.lectureTitle}" — topic expanded for you.`);
        }
      } else {
        toast.success(`📚 Opened topic: "${targetTopic.title}"`);
      }
    };

    window.addEventListener('agent-open-lecture', handler);
    return () => window.removeEventListener('agent-open-lecture', handler);
  }, [topics, handlePlayVideo]);


  // ── Video Handlers ────────────────────────────────────────────────────────

  const handlePlayVideo = useCallback((videoId: string, subtaskId: string, topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const videos = topic.subTasks
      .map(st => {
        const id = st.url ? extractYoutubeId(st.url) : st.resources?.map(r => extractYoutubeId(r.url)).find(Boolean);
        return id ? { videoId: id, subtaskId: st.id, topicId, title: st.text } : null;
      })
      .filter(Boolean) as Array<{ videoId: string; subtaskId: string; topicId: string; title: string }>;

    const indexInPlaylist = Math.max(0, videos.findIndex(v => v.subtaskId === subtaskId));
    const watchedCount = topic.subTasks.filter(st => st.status === 'completed').length;
    const current = videos[indexInPlaylist] || { videoId, subtaskId, topicId, title: 'Lecture' };
    const nextPlaying = {
      ...current,
      watchedCount,
      totalCount: videos.length || 1,
      indexInPlaylist
    };

    setPlaying(nextPlaying);
    setIsPipMode(false);

    const bookmark = { topicId, subtaskId, videoId, title: current.title, topicTitle: topic.title };
    setContinueWatching(bookmark);
    try { localStorage.setItem(CW_KEY, JSON.stringify(bookmark)); } catch {}
  }, [topics]);

  const handleResumePlaylist = useCallback((topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const firstVideo = topic.subTasks.find(st => {
      if (st.status === 'completed') return false;
      if (st.url && extractYoutubeId(st.url)) return true;
      return st.resources?.some(r => extractYoutubeId(r.url));
    });

    if (!firstVideo) {
      toast.info('No unwatched videos in this topic.');
      return;
    }

    const videoId = firstVideo.url ? extractYoutubeId(firstVideo.url) : firstVideo.resources?.map(r => extractYoutubeId(r.url)).find(Boolean);
    if (videoId) handlePlayVideo(videoId, firstVideo.id, topicId);
  }, [handlePlayVideo, topics]);

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setIsPipMode(false);
  }, []);

  const handlePlayerNavigate = useCallback((delta: number) => {
    if (!playing) return;
    const topic = topics.find(t => t.id === playing.topicId);
    if (!topic) return;

    const videos = topic.subTasks
      .map(st => {
        const id = st.url ? extractYoutubeId(st.url) : st.resources?.map(r => extractYoutubeId(r.url)).find(Boolean);
        return id ? { videoId: id, subtaskId: st.id, topicId: topic.id!, title: st.text } : null;
      })
      .filter(Boolean) as Array<{ videoId: string; subtaskId: string; topicId: string; title: string }>;

    const nextIndex = playing.indexInPlaylist + delta;
    if (nextIndex < 0 || nextIndex >= videos.length) return;
    const next = videos[nextIndex];
    setPlaying({
      ...next,
      watchedCount: topic.subTasks.filter(st => st.status === 'completed').length,
      totalCount: videos.length,
      indexInPlaylist: nextIndex
    });
  }, [playing, topics]);

  const handleMarkWatched = useCallback(async (topicId: string, subtaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const st = topic.subTasks.find(s => s.id === subtaskId);
    if (!st || st.status === 'completed') return;
    const updated = topic.subTasks.map(s => s.id === subtaskId ? { ...s, status: 'completed' } : s);
    playPopSound();
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated), lastStudiedAt: Date.now() }); }
    catch { toast.error('Failed to mark watched'); }
  }, [topics]);

  // ── Mark doubt (flag lecture for review) ────────────────────────────────
  // ── Study time tracker: called by VideoPlayerModal on close ─────────────
  // ── Save video note from player modal ────────────────────────────────────
  const handleSaveVideoNote = useCallback(async (topicId: string, subtaskId: string, note: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.map(st => st.id === subtaskId ? { ...st, notes: note } : st);
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) }); } catch {}
  }, [topics]);

  // ── Pin / Unpin subtask ──────────────────────────────────────────────────
  const handleTogglePin = useCallback(async (topicId: string, subtaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.map(st => st.id === subtaskId ? { ...st, pinned: !st.pinned, pinnedAt: !st.pinned ? Date.now() : undefined } : st);
    // Move pinned to top
    const pinned = updated.filter(s => s.pinned).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
    const unpinned = updated.filter(s => !s.pinned);
    const sorted = [...pinned, ...unpinned];
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: sorted } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(sorted) }); } catch {}
  }, [topics]);

  // ── Custom Playlist Handlers ──────────────────────────────────────────────

  const toggleEditMode = useCallback((topicId: string) => {
    setEditModeTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
        if (mergePanelState?.topicId === topicId) setMergePanelState(null);
        if (addVideoState?.topicId === topicId) setAddVideoState(null);
        setRenamingSubtask(null);
        // Clear bulk selections for this topic when exiting edit mode
        setBulkDeleteState(prevBulk => {
          const topicSubTaskIds = new Set(topics.find(t => t.id === topicId)?.subTasks.map(s => s.id) || []);
          const next = new Set(prevBulk);
          topicSubTaskIds.forEach(id => next.delete(id));
          return next;
        });
      } else {
        next.add(topicId);
      }
      return next;
    });
  }, [mergePanelState, addVideoState, topics]);

  const handleSubTaskReorder = useCallback(async (topicId: string, fromIndex: number, toIndex: number) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (fromIndex === toIndex) return;
    const items = Array.from(topic.subTasks);
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: items } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(items) }); }
    catch { toast.error('Failed to save order'); }
  }, [topics]);

  const handleAddSingleVideo = useCallback(async (topicId: string, url: string, customTitle?: string) => {
    const videoId = extractYoutubeId(url);
    if (!videoId) { toast.error('Invalid YouTube URL'); return; }
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (topic.subTasks.some(st => st.url === url || (st.url && extractYoutubeId(st.url) === videoId))) {
      toast.error('Video already in this playlist'); return;
    }
    let title = customTitle?.trim() || '';
    if (!title) {
      title = await fetchVideoTitle(url);
      if (!title) title = `Video (${videoId})`;
    }
    const newST: LearningSubTask = {
      id: uniqueId(), title: title, category: 'Videos', status: 'pending',
      url, resources: [{ title: 'Watch Video', url, type: 'video' }],
    };
    const updated = [...topic.subTasks, newST];
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) });
      toast.success(`"${title}" added!`);
      setAddVideoState(null);
    } catch { toast.error('Failed to add video'); }
  }, [topics]);

  const handleFetchMergePlaylist = useCallback(async () => {
    if (!mergePanelState?.url.trim()) return;
    const playlistId = extractPlaylistId(mergePanelState.url);
    if (!playlistId) { toast.error('Invalid playlist URL'); return; }
    setMergePanelState((prev: any) => prev ? { ...prev, loading: true } : null);
    // Animated loading messages so users know it's working (not broken)
    const loadingMsgs = ['Connecting to YouTube…', 'Fetching playlist pages…', 'Extracting videos…', 'Almost done…'];
    let msgIdx = 0;
    setMergePanelState((prev: any) => prev ? { ...prev, _loadingMsg: loadingMsgs[0] } : null);
    const msgInterval = window.setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, loadingMsgs.length - 1);
      setMergePanelState((prev: any) => prev ? { ...prev, _loadingMsg: loadingMsgs[msgIdx] } : null);
    }, 2500);
    try {
      const data = await fetchYouTubePlaylist(playlistId);
      clearInterval(msgInterval);
      const topic = topics.find(t => t.id === mergePanelState.topicId);
      const existingVideoIds = new Set(
        (topic?.subTasks || []).map(st => st.url ? extractYoutubeId(st.url) : null).filter(Boolean)
      );
      const total = data.videos.length;
      const videos: MergeVideo[] = data.videos
        .filter((v: any) => !existingVideoIds.has(extractYoutubeId(v.link)))
        .map((v: any) => ({ id: uniqueId(), title: v.title, url: v.link }));
      const selected = new Set(videos.map((v: MergeVideo) => v.id));
      setMergePanelState((prev: any) => prev ? { ...prev, videos, selected, loading: false, _total: total, _loadingMsg: undefined } : null);
      if (videos.length === 0) toast.info('All videos from this playlist are already in the topic!');
      else toast.success(`Found ${videos.length} new video${videos.length !== 1 ? 's' : ''}!`);
    } catch (err: any) {
      clearInterval(msgInterval);
      toast.error(err.message || 'Failed to fetch playlist');
      setMergePanelState((prev: any) => prev ? { ...prev, loading: false, _loadingMsg: undefined } : null);
    }
  }, [mergePanelState, topics]);

  const handleMergeSelected = useCallback(async () => {
    if (!mergePanelState) return;
    const { topicId, videos, selected } = mergePanelState;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const toAdd: LearningSubTask[] = (videos as MergeVideo[])
      .filter(v => selected.has(v.id))
      .map(v => ({ id: uniqueId(), title: v.title, category: 'Videos', status: 'pending', url: v.url, resources: [{ title: 'Watch Video', url: v.url, type: 'video' }] }));
    if (toAdd.length === 0) { toast.error('Select at least one video'); return; }
    const updated = [...topic.subTasks, ...toAdd];
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) });
      toast.success(`Added ${toAdd.length} video${toAdd.length > 1 ? 's' : ''} to your playlist!`);
      setMergePanelState(null);
    } catch { toast.error('Failed to merge videos'); }
  }, [topics, mergePanelState]);

  const handleStartRename = useCallback((topicId: string, subtaskId: string, title: string) => {
    setRenamingSubtask({ topicId, subtaskId, title });
  }, []);

  const handleSaveRename = useCallback(async (newTitle: string) => {
    if (!renamingSubtask || !newTitle.trim()) { setRenamingSubtask(null); return; }
    const { topicId, subtaskId } = renamingSubtask;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.map(st => st.id === subtaskId ? { ...st, title: newTitle.trim() } : st);
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) });
      toast.success('Renamed');
    } catch { toast.error('Failed to rename'); }
    setRenamingSubtask(null);
  }, [topics, renamingSubtask]);

  const toggleBulkDelete = useCallback((subTaskId: string) => {
    setBulkDeleteState(prev => {
      const next = new Set(prev);
      next.has(subTaskId) ? next.delete(subTaskId) : next.add(subTaskId);
      return next;
    });
  }, []);

  const instantDeleteSubTask = useCallback((topicId: string, subTaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const subtask = topic.subTasks.find(st => st.id === subTaskId);
    if (!subtask) return;
    // Optimistic remove
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: t.subTasks.filter(st => st.id !== subTaskId) } : t));
    // Cancel any pending undo first
    if (undoQueueRef.current) {
      clearTimeout(undoQueueRef.current.timerId);
      // Commit previous pending delete
      const prev = undoQueueRef.current;
      updateDoc(doc(db, 'learning_topics', prev.topicId), {
        subTasks: sanitize(topics.find(t => t.id === prev.topicId)?.subTasks.filter(st => st.id !== prev.subtask.id) || []),
      }).catch(() => {});
    }
    // Show undo toast
    const toastId = toast(
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ flex: 1, fontSize: '0.85rem' }}>🗑 <strong>{subtask.text.slice(0, 30)}{subtask.text.length > 30 ? '…' : ''}</strong> deleted</span>
        <button
          onClick={() => {
            // Undo: re-insert
            clearTimeout(undoQueueRef.current?.timerId);
            undoQueueRef.current = null;
            setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: [...t.subTasks, subtask] } : t));
            toast.dismiss(toastId);
            toast.success('Undo successful!');
          }}
          style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}
        >Undo</button>
      </div>,
      { duration: UNDO_DELAY, id: `del-${subTaskId}` }
    );
    // Commit to Firestore after undo window
    const timerId = window.setTimeout(async () => {
      undoQueueRef.current = null;
      const currentTopic = topics.find(t => t.id === topicId);
      const finalList = (currentTopic?.subTasks || []).filter(st => st.id !== subTaskId);
      try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(finalList) }); }
      catch { toast.error('Failed to delete'); }
    }, UNDO_DELAY + 100);
    undoQueueRef.current = { topicId, subtask, timerId };
  }, [topics]);

  const handleBulkDelete = useCallback(async (topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.filter(st => !bulkDeleteState.has(st.id));
    if (updated.length === topic.subTasks.length) return;
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) });
      setBulkDeleteState(prev => {
        const next = new Set(prev);
        topic.subTasks.forEach(st => next.delete(st.id));
        return next;
      });
      toast.success('Deleted selected videos');
    }
    catch { toast.error('Failed to bulk delete'); }
  }, [topics, bulkDeleteState]);



  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTopicTitle.trim()) return;
    if (topics.some(t => t.title.toLowerCase() === newTopicTitle.trim().toLowerCase())) { toast.error('Topic already exists'); return; }
    const newTopic: Omit<LearningTopic, 'id'> = { userId: user.uid, title: newTopicTitle.trim(), subTasks: [], createdAt: Date.now(), lastStudiedAt: Date.now(), order: topics.length };
    // Optimistic update
    const tempId = uniqueId();
    setTopics(prev => [...prev, { ...newTopic, id: tempId }]);
    setNewTopicTitle('');
    try {
      const ref = await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      setAndPersistExpanded(ref.id);
    }
    catch { toast.error('Failed to add topic'); setTopics(prev => prev.filter(t => t.id !== tempId)); }
  };

  const importPredefinedRoadmap = async (roadmap: typeof PREDEFINED_ROADMAPS[0]) => {
    if (!user) return;
    if (topics.some(t => t.title === roadmap.title)) { toast.error(`"${roadmap.title}" already imported.`); return; }
    setImportingRoadmapId(roadmap.id);
    const subTasks: LearningSubTask[] = [];
    roadmap.modules.forEach(mod => mod.items.forEach(item => {
      const task: LearningSubTask = { id: uniqueId(), title: item.text, category: mod.category, status: 'pending' };
      if (item.url) task.url = item.url;
      subTasks.push(task);
    }));
    const newTopic: Omit<LearningTopic, 'id'> = { userId: user.uid, title: roadmap.title, subTasks, createdAt: Date.now(), lastStudiedAt: Date.now(), order: topics.length, timeSpentMs: 0 };
    try { await addDoc(collection(db, 'learning_topics'), sanitize(newTopic)); toast.success(`Imported!`); setShowRoadmapHub(false); }
    catch { toast.error('Failed to import'); }
    finally { setImportingRoadmapId(null); }
  };

  const handleImportYoutube = async () => {
    if (!user || !youtubeUrl.trim()) return;
    const playlistId = extractPlaylistId(youtubeUrl);
    if (!playlistId) { toast.error("Invalid YouTube Playlist URL"); return; }
    setIsImportingYt(true);
    try {
      const data = await fetchYouTubePlaylist(playlistId);
      if (topics.some(t => t.title === data.title)) { toast.error(`"${data.title}" already imported.`); return; }
      const subTasks: LearningSubTask[] = data.videos.map((v: any) => ({ id: uniqueId(), title: v.title, category: 'Videos', status: 'pending', url: v.link, resources: [{ title: 'Watch Video', url: v.link, type: 'video' }] }));
      const newTopic: Omit<LearningTopic, 'id'> = { userId: user.uid, title: data.title, subTasks, createdAt: Date.now(), lastStudiedAt: Date.now(), order: topics.length, timeSpentMs: 0 };
      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Imported ${data.videos.length} videos!`);
      setYoutubeUrl(''); setShowRoadmapHub(false);
    } catch (err: any) { toast.error(err.message || 'Failed to fetch playlist'); }
    finally { setIsImportingYt(false); }
  };

  const handleDeleteTopic = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setDeleteConfirm({ isOpen: true, id }); };
  const confirmDeleteTopic = async () => {
    try { await deleteDoc(doc(db, 'learning_topics', deleteConfirm.id)); if (expandedTopicId === deleteConfirm.id) setAndPersistExpanded(null); setDeleteConfirm({ isOpen: false, id: '' }); }
    catch { toast.error('Failed to delete topic'); }
  };

  const handlePublishCurriculum = async (draftTopics: any[]) => {
    if (!user) return;
    try {
      let currentOrder = topics.length;
      for (const draft of draftTopics) {
        const subTasks: LearningSubTask[] = draft.videos.map((v: any) => {
          const isYt = v.url.includes('youtube.com') || v.url.includes('youtu.be');
          return {
            id: uniqueId(),
            title: v.title,
            category: isYt ? 'Videos' : 'Reading',
            status: 'pending',
            url: v.url,
            resources: [{ title: isYt ? 'Watch Video' : 'Read Article', url: v.url, type: isYt ? 'video' : 'article' }]
          };
        });
        
        const newTopic: Omit<LearningTopic, 'id'> = {
          userId: user.uid,
          title: draft.title,
          subTasks,
          createdAt: Date.now(),
          lastStudiedAt: Date.now(),
          order: currentOrder++,
          timeSpentMs: 0
        };
        await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      }
      toast.success(`Published ${draftTopics.length} new topics successfully!`);
      setShowCurriculumBuilder(false);
    } catch (err) {
      toast.error('Failed to publish curriculum');
    }
  };

  const handleAddSubTask = async (topicId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = newSubtaskText[topicId]?.trim();
    if (!text) return;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const newST: LearningSubTask = { id: uniqueId(), text, status: 'pending' };
    const updated = [...topic.subTasks, newST];
    // Optimistic
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    setNewSubtaskText(prev => ({ ...prev, [topicId]: '' }));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated), lastStudiedAt: Date.now() }); }
    catch { toast.error('Failed to add task'); setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: topic.subTasks } : t)); }
  };

  const toggleSubTask = useCallback(async (topicId: string, subTaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    let newStatus = false;
    const updated = topic.subTasks.map(st => { if (st.id === subTaskId) { newStatus = st.status !== 'completed'; return { ...st, isCompleted: newStatus }; } return st; });
    if (newStatus) playPopSound();
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated), lastStudiedAt: Date.now() }); }
    catch { toast.error('Failed to update'); setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: topic.subTasks } : t)); }
  }, [topics]);

  // Subtask deletion is always instant (no confirm dialog needed)
  const deleteSubTask = instantDeleteSubTask;

  const toggleCategory = useCallback((topicId: string, category: string) => {
    setExpandedCategories(prev => ({ ...prev, [`${topicId}-${category}`]: !prev[`${topicId}-${category}`] }));
  }, []);

  const openNotesModal = useCallback((topicId: string, subtaskId?: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (subtaskId) {
      const st = topic.subTasks.find(s => s.id === subtaskId);
      // Always reinitialize editNotes from current data to prevent state leak
      setEditNotes(st?.notes || '');
      setEditingContext({ type: 'subtask', topicId, subtaskId });
    } else {
      setEditNotes(topic.notes || '');
      setEditingContext({ type: 'topic', topicId });
    }
  }, [topics]);

  const saveNotes = async () => {
    if (!editingContext) return;
    const { type, topicId, subtaskId } = editingContext;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (type === 'subtask' && subtaskId) {
      const updated = topic.subTasks.map(st => st.id === subtaskId ? { ...st, notes: editNotes } : st);
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
      try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) }); toast.success('Saved'); }
      catch { toast.error('Failed to save'); }
    } else {
      try { await updateDoc(doc(db, 'learning_topics', topicId), { notes: editNotes }); toast.success('Saved'); }
      catch { toast.error('Failed to save'); }
    }
    setEditingContext(null);
  };

  const filteredTopics = useMemo(() => {
    return topics.map(topic => {
      if (!searchQuery.trim() && !showIncompleteOnly) return topic;
      let isTopicMatch = true;
      let filtered = topic.subTasks || [];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        isTopicMatch = topic.title.toLowerCase().includes(q);
        filtered = filtered.filter(st => st.text.toLowerCase().includes(q) || st.category?.toLowerCase().includes(q) || st.notes?.toLowerCase().includes(q));
        if (isTopicMatch && filtered.length === 0) filtered = topic.subTasks;
      }
      if (showIncompleteOnly) filtered = filtered.filter(st => st.status !== 'completed');
      if (isTopicMatch || filtered.length > 0) return { ...topic, subTasks: filtered };
      return null;
    }).filter(Boolean) as LearningTopic[];
  }, [topics, searchQuery, showIncompleteOnly]);



  // Fix: Only show Continue Watching if the video is not already completed
  const validCW = useMemo(() => {
    if (!continueWatching) return null;
    const topic = topics.find(t => t.id === continueWatching.topicId);
    if (!topic) return null;
    const st = topic.subTasks.find(s => s.id === continueWatching.subtaskId);
    if (!st || st.status === 'completed') return null; // Don't show if already watched
    return continueWatching;
  }, [continueWatching, topics]);

  return (
    <div className="learning-container">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div className="page-header-info">
          <h1><BookOpen size={22} style={{ color: 'var(--accent-primary)' }} /> Learning Paths</h1>
          <p className="subtitle">Build your own curriculum from any YouTube playlist.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary hide-on-mobile" onClick={() => setShowCurriculumBuilder(true)} style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', border: 'none', boxShadow: '0 4px 15px rgba(99,102,241,0.3)' }}><BookOpen size={15} /> Curriculum Builder</button>
          <button className="btn-secondary" onClick={() => setShowRoadmapHub(true)}><Plus size={15} /> Quick Import</button>
          <button className={`btn-secondary ${showIncompleteOnly ? 'active' : ''}`} onClick={() => setShowIncompleteOnly(v => !v)} style={{ padding: '0.4rem' }} title={showIncompleteOnly ? 'Show all' : 'Incomplete only'}>
            {showIncompleteOnly ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
          <div className="search-input-wrap" style={{ width: '190px', position: 'relative' }}>
            <Search size={15} className="search-icon" />
            <input ref={searchInputRef} type="text" placeholder="Search (⌘K)..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '0.1rem' }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Continue Watching */}
      {validCW && !playing && (
        <div style={{ padding: '0.8rem 1rem', borderRadius: '14px', marginBottom: '1.25rem', background: 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.05))', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Play size={15} fill="#fff" color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Continue · {validCW.topicTitle}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{validCW.title}</div>
              {(() => {
                try {
                  const s = Number(localStorage.getItem(TS_KEY(validCW.videoId)) || '0');
                  if (s > 5) {
                    const m = Math.floor(s / 60);
                    const sec = String(s % 60).padStart(2, '0');
                    return <span style={{ fontSize: '0.62rem', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '0.08rem 0.4rem', borderRadius: '5px', flexShrink: 0 }}>⏱ {m}:{sec}</span>;
                  }
                } catch {}
                return null;
              })()}
            </div>
          </div>
          <button onClick={() => handlePlayVideo(validCW.videoId, validCW.subtaskId, validCW.topicId)}
            style={{ padding: '0.48rem 0.9rem', borderRadius: '9px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.28rem' }}>
            <Play size={12} fill="#fff" /> Resume
          </button>
          <button onClick={() => { setContinueWatching(null); try { localStorage.removeItem(CW_KEY); } catch {} }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Add topic */}
      <div className="add-topic-form" style={{ flexDirection: 'column', marginBottom: '1.5rem' }}>
        <div className="add-topic-inputs" style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
          <input type="text" placeholder="New topic (e.g. System Design, React 19...)" value={newTopicTitle} onChange={e => setNewTopicTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTopic(e)} className="todo-input" />
          <button onClick={handleAddTopic} className="btn-primary" disabled={!newTopicTitle.trim()}><Plus size={15} /> Create</button>
        </div>
      </div>

      {/* Topic List */}
      {isLoading ? (
        <div className="topics-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-xl)' }}>
              <div className="skeleton-line medium" /><div className="skeleton-line short" />
              <div className="skeleton-line" style={{ height: '6px', marginTop: '0.5rem' }} />
            </div>
          ))}
        </div>
      ) : filteredTopics.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          {searchQuery || showIncompleteOnly ? 'No matching topics.' : 'No topics yet — import a YouTube playlist or create one!'}
        </div>
      ) : (
        <div className="topics-list">
          {filteredTopics.map((topic) => {
            const isExpanded = searchQuery.trim() !== '' || expandedTopicId === topic.id;
            const orig = topics.find(t => t.id === topic.id);
            const total = (orig?.subTasks || []).length;
            const done = (orig?.subTasks || []).filter(st => st.status === 'completed').length;
            const progress = total === 0 ? 0 : Math.round((done / total) * 100);
            const daysSince = topic.lastStudiedAt ? (Date.now() - topic.lastStudiedAt) / 86400000 : 0;
            const needsReview = daysSince > 14 && progress >= 50 && progress < 100;
            const isEditMode = editModeTopics.has(topic.id!);
            const hasUnwatchedVideos = (orig?.subTasks || []).some(st => {
              if (st.status === 'completed') return false;
              if (st.url && extractYoutubeId(st.url)) return true;
              return (st.resources || []).some(r => extractYoutubeId(r.url));
            });

            return (
              <div key={topic.id} className="topic-card">
                <div className="topic-card-header" onClick={() => setAndPersistExpanded(isExpanded ? null : topic.id!)}>
                  <div className="topic-title-section">
                    <button className="topic-expand-btn" onClick={e => { e.stopPropagation(); setAndPersistExpanded(isExpanded ? null : topic.id!); }} aria-expanded={isExpanded}>
                      {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{topic.title}</div>
                        {needsReview && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.18rem', fontSize: '0.58rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '0.08rem 0.38rem', borderRadius: '99px', border: '1px solid rgba(245,158,11,0.22)' }}>
                            <Bell size={8} /> Review
                          </span>
                        )}
                        {isEditMode && (
                          <span style={{ fontSize: '0.58rem', color: '#60a5fa', background: 'rgba(59,130,246,0.1)', padding: '0.08rem 0.38rem', borderRadius: '99px', border: '1px solid rgba(59,130,246,0.2)' }}>✏️ Editing</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        {done}/{total} · {progress}%{topic.timeSpentMs && topic.timeSpentMs > 0 ? ` · ${formatDuration(topic.timeSpentMs)}` : ''}
                      </div>
                      <div className="progress-bar" style={{ marginTop: '0.38rem' }}>
                        <div className="progress-fill" style={{ width: `${progress}%`, background: progressColor(progress), transition: 'width 400ms ease, background 400ms ease' }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} className="topic-actions" onClick={e => e.stopPropagation()}>
                    {hasUnwatchedVideos && !isEditMode && (
                      <button
                        onClick={e => { e.stopPropagation(); if (!isExpanded) setAndPersistExpanded(topic.id!); handleResumePlaylist(topic.id!); }}
                        title="Resume playlist"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.28rem 0.55rem', borderRadius: '7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600 }}>
                        <Play size={10} fill="currentColor" /> Resume
                      </button>
                    )}
                    <button
                      onClick={() => { if (!isExpanded) setAndPersistExpanded(topic.id!); toggleEditMode(topic.id!); }}
                      title={isEditMode ? 'Exit Edit Mode' : 'Edit Playlist'}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.28rem 0.55rem', borderRadius: '7px', background: isEditMode ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isEditMode ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.1)'}`, color: isEditMode ? '#60a5fa' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600 }}>
                      <Edit3 size={11} /> {isEditMode ? 'Done' : 'Edit'}
                    </button>
                    <button className="btn-icon" onClick={() => openNotesModal(topic.id!)} title="Notes"><FileText size={14} /></button>
                    <button className="topic-delete-btn" onClick={e => handleDeleteTopic(topic.id!, e)}><Trash2 size={14} /></button>
                  </div>
                </div>

                <div style={{ display: isExpanded ? 'block' : 'none', overflow: 'hidden' }}>
                  {isExpanded && (
                    <TopicBody
                      topic={topic}
                      expandedCategories={expandedCategories}
                      toggleCategory={toggleCategory}
                      toggleSubTask={toggleSubTask}
                      openNotesModal={openNotesModal}
                      deleteSubTask={deleteSubTask}
                      handleAddSubTask={handleAddSubTask}
                      newSubtaskText={newSubtaskText}
                      setNewSubtaskText={setNewSubtaskText}
                      onPlayVideo={handlePlayVideo}
                      isEditMode={isEditMode}
                      onToggleEdit={() => toggleEditMode(topic.id!)}
                      addVideoState={addVideoState}
                      setAddVideoState={setAddVideoState}
                      onAddSingleVideo={handleAddSingleVideo}
                      mergePanelState={mergePanelState}
                      setMergePanelState={setMergePanelState}
                      onFetchMerge={handleFetchMergePlaylist}
                      onMergeSelected={handleMergeSelected}
                      renamingSubtask={renamingSubtask}
                      onStartRename={handleStartRename}
                      onSaveRename={handleSaveRename}
                      onCancelRename={() => setRenamingSubtask(null)}
                      instantDeleteSubTask={instantDeleteSubTask}
                      bulkDeleteState={bulkDeleteState}
                      toggleBulkDelete={toggleBulkDelete}
                      handleBulkDelete={handleBulkDelete}
                      onSubTaskReorder={handleSubTaskReorder}
                      onTogglePin={handleTogglePin}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notes Modal — lightweight plain textarea */}
      {editingContext && (
        <div className="notes-modal-overlay" onClick={() => setEditingContext(null)}>
          <div className="notes-modal-content" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="notes-modal-header">
              <div>
                <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{editingContext.type === 'topic' ? 'Topic Notes' : 'Video Notes'}</h2>
              </div>
              <button className="btn-icon" onClick={() => setEditingContext(null)}><X size={17} /></button>
            </div>
            <div className="notes-modal-body">
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                {editingContext.type === 'topic' ? 'Notes (Markdown supported)' : 'Quick notes — timestamps, key concepts'}
              </label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)}
                placeholder={editingContext.type === 'topic' ? 'Write notes, code snippets...' : 'e.g. 12:30 - important concept, 24:00 - demo'}
                style={{ width: '100%', minHeight: '180px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: editingContext.type === 'topic' ? 'monospace' : 'inherit', resize: 'vertical', boxSizing: 'border-box', fontSize: '0.9rem' }} />
            </div>
            <div className="notes-modal-footer">
              <button className="btn-secondary" onClick={() => setEditingContext(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveNotes}>Save</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={deleteConfirm.isOpen} title="Delete Topic" message="Delete this topic and all its videos? This cannot be undone."
        onConfirm={confirmDeleteTopic}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '' })} />

      {/* Curriculum Builder Modal */}
      {showCurriculumBuilder && (
        <CurriculumBuilderModal 
          onClose={() => setShowCurriculumBuilder(false)}
          onPublish={handlePublishCurriculum}
        />
      )}

      {/* Roadmap Hub */}
      {showRoadmapHub && createPortal(
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', background: 'rgba(9,9,11,0.85)', padding: '1rem' }} onClick={() => setShowRoadmapHub(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '620px', maxHeight: '88vh', overflowY: 'auto', background: 'linear-gradient(145deg,rgba(24,24,27,0.97),rgba(9,9,11,0.99))', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: 0 }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 600, margin: 0, background: 'linear-gradient(135deg,#fff,#a1a1aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Import Learning Path</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.1rem' }}>YouTube playlists or curated roadmaps</p>
              </div>
              <button className="btn-icon" onClick={() => setShowRoadmapHub(false)} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '50%', padding: '0.45rem' }}><X size={15} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* YouTube import */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}><Play size={13} /></div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>YouTube Playlist</h3>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.9rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <input type="url" placeholder="https://youtube.com/playlist?list=..." value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleImportYoutube()}
                    style={{ flex: 1, minWidth: '180px', padding: '0.65rem 0.9rem', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
                  <button className="btn-primary" onClick={handleImportYoutube} disabled={isImportingYt || !youtubeUrl.trim()}
                    style={{ padding: '0.65rem 1.1rem', borderRadius: '9px', background: 'linear-gradient(135deg,#ef4444,#f43f5e)', fontWeight: 600 }}>
                    {isImportingYt ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
              {/* Roadmaps */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}><BookOpen size={13} /></div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Curated Roadmaps</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {PREDEFINED_ROADMAPS.map(roadmap => (
                    <div key={roadmap.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.85rem 1rem', borderRadius: '11px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#e4e4e7' }}>{roadmap.title}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{roadmap.description}</div>
                      </div>
                      <button className="btn-primary" onClick={() => importPredefinedRoadmap(roadmap)} disabled={importingRoadmapId === roadmap.id}
                        style={{ padding: '0.42rem 0.85rem', fontSize: '0.8rem', borderRadius: '9px', background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', flexShrink: 0, marginLeft: '0.75rem' }}>
                        {importingRoadmapId === roadmap.id ? '...' : 'Import'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Video Player */}
      {playing && !isPipMode && (() => {
        // Compute completed topic names and overall progress for AI context
        const completedTopicNames = topics
          .filter(t => t.subTasks.every(s => s.status === 'completed'))
          .map(t => t.title)
          .slice(-5);
        const totalCompleted = topics.reduce((acc, t) => acc + t.subTasks.filter(s => s.status === 'completed').length, 0);
        const totalVideos = topics.reduce((acc, t) => acc + t.subTasks.length, 0);
        return (
          <VideoPlayerModal
            playing={playing}
            total={playing.totalCount}
            idx={playing.indexInPlaylist}
            onClose={closePlayer}
            onMinimize={() => setIsPipMode(true)}
            onMarkWatched={handleMarkWatched}
            onNavigate={handlePlayerNavigate}
            onSaveVideoNote={handleSaveVideoNote}
            topicName={topics.find(t => t.id === playing.topicId)?.title || ''}
            completedTopicNames={completedTopicNames}
            totalProgress={{ completed: totalCompleted, total: totalVideos }}
          />
        );
      })()}
    </div>
  );
};
