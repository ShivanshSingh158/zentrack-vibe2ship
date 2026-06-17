import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Check, ChevronDown, ChevronRight, BookOpen, Trash2,
  FileText, Search, X, Play, GripVertical, ChevronUp,
  Eye, EyeOff, SkipForward, SkipBack, Bell, Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { LearningTopic, LearningSubTask } from '../../types/index';
import { syllabusData } from '../../data/syllabusData';
import { genAiSyllabusData } from '../../data/genAiSyllabusData';
import { dsaSyllabusData } from '../../data/dsaSyllabusData';
import { playPopSound } from '../../utils/sound';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
import { PREDEFINED_ROADMAPS } from '../../data/roadmaps';

// ── Helpers ───────────────────────────────────────────────────────────────────

const sanitize = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, sanitize(v)])
    );
  }
  return obj;
};

const uniqueId = () => crypto.randomUUID();

const extractYoutubeId = (url: string) => {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
};

const formatDuration = (ms: number) => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MASTERY_LEVELS = {
  not_started: { label: 'Not Started', color: '#6b7280', bg: 'rgba(107,114,128,0.15)', emoji: '⬜' },
  learning:    { label: 'Learning',    color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  emoji: '📖' },
  revising:    { label: 'Revising',    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  emoji: '🔄' },
  mastered:    { label: 'Mastered',    color: '#10b981', bg: 'rgba(16,185,129,0.15)',  emoji: '✅' },
} as const;
const MASTERY_ORDER: Array<keyof typeof MASTERY_LEVELS> = ['not_started', 'learning', 'revising', 'mastered'];

const CW_KEY = 'learning_continue_watching';
const EXPANDED_KEY = 'learning_expanded_topic';

// ── Progress bar color by completion ─────────────────────────────────────────
const progressColor = (pct: number) => {
  if (pct === 100) return '#10b981';
  if (pct >= 75)   return '#3b82f6';
  if (pct >= 25)   return '#f59e0b';
  return '#ef4444';
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface PlayingVideo {
  videoId: string;
  subtaskId: string;
  topicId: string;
  title: string;
  allVideos: Array<{ videoId: string; subtaskId: string; title: string }>;
  currentIndex: number;
}

// ── VideoPlayerModal ──────────────────────────────────────────────────────────
const VideoPlayerModal = React.memo(({
  playing, onClose, onMarkWatched, onNavigate,
}: {
  playing: PlayingVideo;
  onClose: () => void;
  onMarkWatched: (topicId: string, subtaskId: string) => void;
  onNavigate: (delta: number) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const total = playing.allVideos.length;
  const idx   = playing.currentIndex;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;

  // ── Auto screen-rotate on fullscreen (mobile) ─────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      if (document.fullscreenElement) {
        screen.orientation?.lock?.('landscape').catch(() => {});
      } else {
        screen.orientation?.unlock?.();
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      screen.orientation?.unlock?.();
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'n') hasNext && onNavigate(1);
      if (e.key === 'ArrowLeft'  || e.key === 'p') hasPrev && onNavigate(-1);
      if (e.key === 'Enter') onMarkWatched(playing.topicId, playing.subtaskId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [playing, hasNext, hasPrev, onClose, onMarkWatched, onNavigate]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '0.75rem',
      }}
    >
      {/* Player container */}
      <div
        ref={containerRef}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '1100px',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}
      >
        {/* ── Top bar: title + close ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.15rem' }}>
              Video {idx + 1} of {total}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {playing.title}
            </div>
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: '36px', height: '36px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 150ms ease' }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Video iframe ── */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.9)' }}>
          <iframe
            key={playing.videoId}
            width="100%" height="100%"
            src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={playing.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        </div>

        {/* ── Controls bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Prev */}
          <button
            onClick={() => onNavigate(-1)}
            disabled={!hasPrev}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.55rem 0.9rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: hasPrev ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', color: hasPrev ? '#fff' : 'rgba(255,255,255,0.2)', cursor: hasPrev ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 600, transition: 'background 150ms ease' }}
          >
            <SkipBack size={14} /> Prev
          </button>

          {/* Mark Watched */}
          <button
            onClick={() => { onMarkWatched(playing.topicId, playing.subtaskId); hasNext && onNavigate(1); }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, transition: 'opacity 150ms ease', minHeight: '44px' }}
          >
            <Check size={15} strokeWidth={2.5} /> Mark Watched{hasNext ? ' & Next' : ''}
          </button>

          {/* Next */}
          <button
            onClick={() => onNavigate(1)}
            disabled={!hasNext}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.55rem 0.9rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: hasNext ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', color: hasNext ? '#fff' : 'rgba(255,255,255,0.2)', cursor: hasNext ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 600, transition: 'background 150ms ease' }}
          >
            Next <SkipForward size={14} />
          </button>
        </div>

        {/* Keyboard hint */}
        <div style={{ textAlign: 'center', fontSize: '0.62rem', color: 'rgba(255,255,255,0.22)' }}>
          ← → navigate · Enter mark watched · Esc close
        </div>
      </div>
    </div>,
    document.body
  );
});
VideoPlayerModal.displayName = 'VideoPlayerModal';

// ── SubTaskItem ───────────────────────────────────────────────────────────────
const SubTaskItem = React.memo(({
  subTask, topicId, toggleSubTask, openNotesModal, deleteSubTask, onPlayVideo, onCycleMastery,
}: {
  subTask: LearningSubTask;
  topicId: string;
  toggleSubTask: (topicId: string, subtaskId: string) => void;
  openNotesModal: (topicId: string, subtaskId: string) => void;
  deleteSubTask: (topicId: string, subtaskId: string) => void;
  onPlayVideo: (videoId: string, subtaskId: string, topicId: string) => void;
  onCycleMastery: (topicId: string, subtaskId: string) => void;
}) => {
  // Detect video
  const videoId = useMemo(() => {
    if (subTask.url) return extractYoutubeId(subTask.url);
    if (subTask.resources) {
      for (const r of subTask.resources) {
        const id = extractYoutubeId(r.url);
        if (id) return id;
      }
    }
    return null;
  }, [subTask.url, subTask.resources]);

  const level = subTask.masteryLevel || 'not_started';
  const cfg   = MASTERY_LEVELS[level];
  const showMastery = level !== 'not_started'; // ✅ FIXED: don't show on untouched items
  const showRevisionCount = (subTask.revisionCount ?? 0) >= 1; // ✅ FIXED: only show when ≥1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.4rem' }}>
      <div className={`subtask-item ${subTask.isCompleted ? 'completed' : ''}`}>
        {/* Checkbox */}
        <button
          className={`todo-checkbox ${subTask.isCompleted ? 'checked' : ''}`}
          onClick={() => toggleSubTask(topicId, subTask.id)}
          role="checkbox"
          aria-checked={subTask.isCompleted}
          aria-label={`Mark ${subTask.isCompleted ? 'incomplete' : 'complete'}`}
        >
          {subTask.isCompleted && <Check size={14} strokeWidth={3} />}
        </button>

        {/* Title */}
        <span className="todo-text" style={{ flex: 1 }}>{subTask.text}</span>

        {/* Mastery badge — only when used */}
        {showMastery && (
          <button
            onClick={() => onCycleMastery(topicId, subTask.id)}
            title={`Mastery: ${cfg.label}`}
            style={{ padding: '0.12rem 0.38rem', borderRadius: '9999px', fontSize: '0.62rem', fontWeight: 600, background: cfg.bg, color: cfg.color, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}
          >
            {cfg.emoji} {cfg.label}
          </button>
        )}

        {/* Revision count — only when ≥1 */}
        {showRevisionCount && (
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            🔄{subTask.revisionCount}
          </span>
        )}

        <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
          {/* ── Single red ▶ Watch button for YouTube videos (replaces dual icons) ── */}
          {videoId && (
            <button
              onClick={() => onPlayVideo(videoId, subTask.id, topicId)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.25rem 0.55rem', borderRadius: '7px',
                background: subTask.isCompleted ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.35)',
                color: subTask.isCompleted ? 'rgba(239,68,68,0.5)' : '#ef4444',
                cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700,
                transition: 'background 150ms ease',
                minHeight: '30px', flexShrink: 0,
              }}
              title="Watch video"
            >
              <Play size={11} fill="currentColor" /> Watch
            </button>
          )}

          {/* Notes button */}
          <button
            className="btn-icon"
            onClick={() => openNotesModal(topicId, subTask.id)}
            style={{ color: subTask.notes ? 'var(--text-primary)' : 'var(--text-muted)' }}
            title={subTask.notes ? 'Edit Notes' : 'Add Notes'}
          >
            <FileText size={13} />
          </button>

          {/* Delete */}
          <button className="todo-delete" onClick={() => deleteSubTask(topicId, subTask.id)} aria-label="Delete subtask">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {subTask.timeSpentMs && subTask.timeSpentMs > 0 && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '2.5rem' }}>
          Time: {formatDuration(subTask.timeSpentMs)}
        </div>
      )}
    </div>
  );
});
SubTaskItem.displayName = 'SubTaskItem';

// ── TopicBody ─────────────────────────────────────────────────────────────────
const TopicBody = React.memo(({
  topic, expandedCategories, toggleCategory, toggleSubTask, openNotesModal,
  deleteSubTask, handleAddSubTask, newSubtaskText, setNewSubtaskText, onPlayVideo, onCycleMastery,
}: any) => {
  const categories = useMemo(() => {
    const cats: { [key: string]: LearningSubTask[] } = {};
    (topic.subTasks || []).forEach((st: any) => {
      const cat = st.category || 'General';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(st);
    });
    return cats;
  }, [topic.subTasks]);

  const categoryKeys = Object.keys(categories);
  const isSingleCategory = categoryKeys.length === 1;

  return (
    <div className="topic-card-body">
      <div style={{ marginTop: '1rem', position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid var(--border-subtle)' }}>
        {categoryKeys.map(category => {
          const catKey = `${topic.id}-${category}`;
          // ✅ FIXED: Auto-expand if only one category (e.g. YouTube playlists)
          const isCatExpanded = isSingleCategory || expandedCategories[catKey] === true;
          const catSubTasks = categories[category];
          const catProgress = catSubTasks.length > 0 ? (catSubTasks.filter((s: any) => s.isCompleted).length / catSubTasks.length * 100) : 0;

          return (
            <div key={category} style={{ marginBottom: '1.5rem', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-21px', top: '5px', width: '12px', height: '12px', borderRadius: '50%', background: catProgress === 100 ? 'var(--accent-primary)' : 'var(--bg-surface-active)', border: '2px solid var(--border-subtle)', zIndex: 1 }} />

              {/* Category header — hide toggle if single category */}
              {!isSingleCategory && (
                <div
                  onClick={() => toggleCategory(topic.id, category)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}
                >
                  <h4 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{category}</h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({Math.round(catProgress)}%)</span>
                  {isCatExpanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                </div>
              )}

              {isCatExpanded && (
                <div style={{ paddingLeft: isSingleCategory ? 0 : '1rem' }}>
                  {catSubTasks.map((subTask: any) => (
                    <div key={subTask.id} style={{ position: 'relative' }}>
                      {!isSingleCategory && (
                        <div style={{ position: 'absolute', left: '-27px', top: '15px', width: '15px', borderTop: '2px solid var(--border-subtle)' }} />
                      )}
                      <SubTaskItem
                        subTask={subTask}
                        topicId={topic.id}
                        toggleSubTask={toggleSubTask}
                        openNotesModal={openNotesModal}
                        deleteSubTask={deleteSubTask}
                        onPlayVideo={onPlayVideo}
                        onCycleMastery={onCycleMastery}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form onSubmit={(e) => handleAddSubTask(topic.id, e)} className="add-subtask-form" style={{ marginTop: '1rem' }}>
        <input
          type="text"
          placeholder="Add a task or milestone..."
          value={newSubtaskText[topic.id] || ''}
          onChange={e => setNewSubtaskText((prev: any) => ({ ...prev, [topic.id]: e.target.value }))}
          className="subtask-input"
        />
        <button type="submit" className="btn-secondary btn-small" disabled={!newSubtaskText[topic.id]?.trim()}>
          Add Task
        </button>
      </form>
    </div>
  );
});
TopicBody.displayName = 'TopicBody';

// ── Main Module ───────────────────────────────────────────────────────────────
export const LearningChecklistModule = () => {
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTopicTitle, setNewTopicTitle] = useState('');

  // ✅ FIXED: Persist expanded topic to localStorage
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
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; type: 'topic' | 'subtask'; id: string; parentId?: string }>({ isOpen: false, type: 'topic', id: '' });
  const [editUrl, setEditUrl] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [notesPreviewMode, setNotesPreviewMode] = useState(false);
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isImportingYt, setIsImportingYt] = useState(false);
  const [showRoadmapHub, setShowRoadmapHub] = useState(false);
  const [importingRoadmapId, setImportingRoadmapId] = useState<string | null>(null);

  // ✅ NEW: Rich playing state with navigation context
  const [playingVideo, setPlayingVideo] = useState<PlayingVideo | null>(null);

  // ✅ NEW: Continue Watching persistence
  const [continueWatching, setContinueWatching] = useState<{ topicId: string; subtaskId: string; videoId: string; title: string; topicTitle: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem(CW_KEY) || 'null'); } catch { return null; }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { startTimer } = usePomodoroContext();
  const user = auth.currentUser;

  // Search persistence
  useEffect(() => { sessionStorage.setItem('learningSearch', searchQuery); }, [searchQuery]);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Firestore listener
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const q = query(collection(db, 'learning_topics'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LearningTopic));
      data.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return b.createdAt - a.createdAt;
      });
      setTopics(data);
      setIsLoading(false);
    }, err => {
      console.error(err);
      toast.error('Failed to load learning topics');
      setIsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ✅ NEW: Open video with full context for navigation
  const handlePlayVideo = useCallback((videoId: string, subtaskId: string, topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    // Build ordered list of all video subtasks in this topic
    const allVideos: PlayingVideo['allVideos'] = [];
    topic.subTasks.forEach(st => {
      let vid: string | null = null;
      if (st.url) vid = extractYoutubeId(st.url);
      if (!vid && st.resources) {
        for (const r of st.resources) { const id = extractYoutubeId(r.url); if (id) { vid = id; break; } }
      }
      if (vid) allVideos.push({ videoId: vid, subtaskId: st.id, title: st.text });
    });

    const currentIndex = allVideos.findIndex(v => v.subtaskId === subtaskId);
    const video = allVideos[currentIndex];

    const pv: PlayingVideo = {
      videoId,
      subtaskId,
      topicId,
      title: video?.title || '',
      allVideos,
      currentIndex: Math.max(0, currentIndex),
    };
    setPlayingVideo(pv);

    // Save continue watching
    const cw = { topicId, subtaskId, videoId, title: video?.title || '', topicTitle: topic.title };
    setContinueWatching(cw);
    try { localStorage.setItem(CW_KEY, JSON.stringify(cw)); } catch {}
  }, [topics]);

  // Navigate within the player
  const handlePlayerNavigate = useCallback((delta: number) => {
    setPlayingVideo(prev => {
      if (!prev) return null;
      const next = prev.currentIndex + delta;
      if (next < 0 || next >= prev.allVideos.length) return prev;
      const v = prev.allVideos[next];
      return { ...prev, videoId: v.videoId, subtaskId: v.subtaskId, title: v.title, currentIndex: next };
    });
  }, []);

  // Mark watched (toggle subtask + update continue watching)
  const handleMarkWatched = useCallback(async (topicId: string, subtaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const st = topic.subTasks.find(s => s.id === subtaskId);
    if (!st || st.isCompleted) return; // already done

    const updatedSubTasks = topic.subTasks.map(s =>
      s.id === subtaskId ? { ...s, isCompleted: true } : s
    );
    playPopSound();
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updatedSubTasks, lastStudiedAt: Date.now() } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updatedSubTasks), lastStudiedAt: Date.now() });
    } catch (err) {
      console.error(err);
      toast.error('Failed to mark watched');
    }
  }, [topics]);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTopicTitle.trim()) return;
    if (topics.some(t => t.title.toLowerCase() === newTopicTitle.trim().toLowerCase())) {
      toast.error('A topic with this title already exists'); return;
    }
    const newTopic: Omit<LearningTopic, 'id'> = {
      userId: user.uid, title: newTopicTitle.trim(), subTasks: [],
      createdAt: Date.now(), lastStudiedAt: Date.now(), order: topics.length,
    };
    try {
      const ref = await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      setNewTopicTitle('');
      setAndPersistExpanded(ref.id);
    } catch { toast.error('Failed to add topic'); }
  };

  const importPredefinedRoadmap = async (roadmap: typeof PREDEFINED_ROADMAPS[0]) => {
    if (!user) return;
    if (topics.some(t => t.title === roadmap.title)) { toast.error(`"${roadmap.title}" already imported.`); return; }
    setImportingRoadmapId(roadmap.id);
    const subTasks: LearningSubTask[] = [];
    roadmap.modules.forEach(mod => {
      mod.items.forEach(item => {
        const task: LearningSubTask = { id: uniqueId(), text: item.text, category: mod.category, isCompleted: false };
        if (item.url) task.url = item.url;
        subTasks.push(task);
      });
    });
    const newTopic: Omit<LearningTopic, 'id'> = {
      userId: user.uid, title: roadmap.title, subTasks,
      createdAt: Date.now(), lastStudiedAt: Date.now(), order: topics.length, timeSpentMs: 0,
    };
    try {
      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Imported ${roadmap.title}!`);
      setShowRoadmapHub(false);
    } catch { toast.error('Failed to import roadmap'); }
    finally { setImportingRoadmapId(null); }
  };

  const handleImportYoutube = async () => {
    if (!user || !youtubeUrl.trim()) return;
    const playlistId = extractPlaylistId(youtubeUrl);
    if (!playlistId) { toast.error("Invalid YouTube Playlist URL. Ensure it has a 'list=' parameter."); return; }
    setIsImportingYt(true);
    try {
      const data = await fetchYouTubePlaylist(playlistId);
      if (topics.some(t => t.title === data.title)) {
        toast.error(`"${data.title}" already imported.`); setIsImportingYt(false); return;
      }
      const subTasks: LearningSubTask[] = data.videos.map((v: any) => ({
        id: uniqueId(), text: v.title, category: 'Videos', isCompleted: false,
        url: v.link, resources: [{ title: 'Watch Video', url: v.link, type: 'video' as const }],
      }));
      const newTopic: Omit<LearningTopic, 'id'> = {
        userId: user.uid, title: data.title, subTasks,
        createdAt: Date.now(), lastStudiedAt: Date.now(), order: topics.length, timeSpentMs: 0,
      };
      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Imported ${data.videos.length} videos from "${data.title}"!`);
      setYoutubeUrl('');
      setShowRoadmapHub(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch playlist');
    } finally { setIsImportingYt(false); }
  };

  const handleDeleteTopic = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ isOpen: true, type: 'topic', id });
  };

  const confirmDeleteTopic = async () => {
    try {
      await deleteDoc(doc(db, 'learning_topics', deleteConfirm.id));
      if (expandedTopicId === deleteConfirm.id) setAndPersistExpanded(null);
      setDeleteConfirm({ isOpen: false, type: 'topic', id: '' });
    } catch { toast.error('Failed to delete topic'); }
  };

  const handleAddSubTask = async (topicId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = newSubtaskText[topicId]?.trim();
    if (!text) return;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const newST: LearningSubTask = { id: uniqueId(), text, isCompleted: false };
    const updated = [...topic.subTasks, newST];
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated), lastStudiedAt: Date.now() });
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
      setNewSubtaskText(prev => ({ ...prev, [topicId]: '' }));
    } catch { toast.error('Failed to add task'); }
  };

  const toggleSubTask = useCallback(async (topicId: string, subTaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    let newStatus = false;
    const updated = topic.subTasks.map(st => {
      if (st.id === subTaskId) { newStatus = !st.isCompleted; return { ...st, isCompleted: newStatus }; }
      return st;
    });
    if (newStatus) playPopSound();
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated, lastStudiedAt: Date.now() } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated), lastStudiedAt: Date.now() });
    } catch {
      toast.error('Failed to update task');
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: topic.subTasks } : t));
    }
  }, [topics]);

  const deleteSubTask = useCallback((topicId: string, subTaskId: string) => {
    setDeleteConfirm({ isOpen: true, type: 'subtask', id: subTaskId, parentId: topicId });
  }, []);

  const cycleMastery = useCallback(async (topicId: string, subTaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.map(st => {
      if (st.id !== subTaskId) return st;
      const cur = st.masteryLevel || 'not_started';
      const next = MASTERY_ORDER[(MASTERY_ORDER.indexOf(cur) + 1) % MASTERY_ORDER.length];
      return {
        ...st, masteryLevel: next,
        revisionCount: next === 'revising' ? (st.revisionCount || 0) + 1 : st.revisionCount || 0,
        ...(next === 'revising' ? { lastRevisedAt: Date.now() } : {}),
      };
    });
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) }); }
    catch { toast.error('Failed to update mastery'); }
  }, [topics]);

  const toggleCategory = useCallback((topicId: string, category: string) => {
    setExpandedCategories(prev => ({ ...prev, [`${topicId}-${category}`]: !prev[`${topicId}-${category}`] }));
  }, []);

  const confirmDeleteSubTask = async () => {
    const topicId = deleteConfirm.parentId!;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.filter(st => st.id !== deleteConfirm.id);
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) });
      setDeleteConfirm({ isOpen: false, type: 'topic', id: '' });
    } catch {
      toast.error('Failed to delete task');
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: topic.subTasks } : t));
    }
  };

  const openNotesModal = useCallback((topicId: string, subtaskId?: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (subtaskId) {
      const st = topic.subTasks.find(s => s.id === subtaskId);
      setEditUrl(st?.url || '');
      setEditNotes(st?.notes || '');
      setEditingContext({ type: 'subtask', topicId, subtaskId });
    } else {
      setEditUrl('');
      setEditNotes(topic.notes || '');
      setEditingContext({ type: 'topic', topicId });
    }
    setNotesPreviewMode(false);
  }, [topics]);

  const saveNotes = async () => {
    if (!editingContext) return;
    const { type, topicId, subtaskId } = editingContext;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (type === 'subtask' && subtaskId) {
      const updated = topic.subTasks.map(st => st.id === subtaskId ? { ...st, url: editUrl, notes: editNotes } : st);
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
      try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) }); toast.success('Saved'); }
      catch { toast.error('Failed to save'); }
    } else {
      try { await updateDoc(doc(db, 'learning_topics', topicId), { notes: editNotes }); toast.success('Saved'); }
      catch { toast.error('Failed to save'); }
    }
    setEditingContext(null);
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    if (searchQuery.trim() !== '' || showIncompleteOnly) return;
    const items = Array.from(topics);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setTopics(items);
    try { items.forEach((item, i) => { if (item.order !== i) updateDoc(doc(db, 'learning_topics', item.id!), { order: i }); }); }
    catch { toast.error('Failed to save order'); }
  };

  const filteredTopics = useMemo(() => {
    return topics.map(topic => {
      if (!searchQuery.trim() && !showIncompleteOnly) return topic;
      let isTopicMatch = true;
      let filtered = topic.subTasks || [];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        isTopicMatch = topic.title.toLowerCase().includes(q);
        filtered = filtered.filter(st =>
          st.text.toLowerCase().includes(q) || st.category?.toLowerCase().includes(q) || st.notes?.toLowerCase().includes(q)
        );
        if (isTopicMatch && filtered.length === 0) filtered = topic.subTasks;
      }
      if (showIncompleteOnly) filtered = filtered.filter(st => !st.isCompleted);
      if (isTopicMatch || filtered.length > 0) return { ...topic, subTasks: filtered };
      return null;
    }).filter(Boolean) as LearningTopic[];
  }, [topics, searchQuery, showIncompleteOnly]);

  const isDraggingAllowed = searchQuery.trim() === '' && !showIncompleteOnly;

  // Validate continue watching still exists
  const validCW = useMemo(() => {
    if (!continueWatching) return null;
    const topic = topics.find(t => t.id === continueWatching.topicId);
    if (!topic) return null;
    const st = topic.subTasks.find(s => s.id === continueWatching.subtaskId);
    if (!st) return null;
    return continueWatching;
  }, [continueWatching, topics]);

  return (
    <div className="learning-container">
      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div className="page-header-info">
          <h1><BookOpen size={24} style={{ color: 'var(--accent-primary)' }} /> Learning Paths</h1>
          <p className="subtitle">Master new skills step by step.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => setShowRoadmapHub(true)}>
            <Plus size={16} /> Import
          </button>
          <button
            className={`btn-secondary ${showIncompleteOnly ? 'active' : ''}`}
            onClick={() => setShowIncompleteOnly(v => !v)}
            title={showIncompleteOnly ? 'Show all' : 'Incomplete only'}
            style={{ padding: '0.4rem' }}
          >
            {showIncompleteOnly ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <div className="search-input-wrap" style={{ width: '200px' }}>
            <Search size={16} className="search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search (⌘K)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ✅ NEW: Continue Watching card */}
      {validCW && !playingVideo && (
        <div style={{
          padding: '0.85rem 1rem', borderRadius: '14px', marginBottom: '1.25rem',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))',
          border: '1px solid rgba(239,68,68,0.25)',
          display: 'flex', alignItems: 'center', gap: '0.85rem',
        }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Play size={16} fill="#fff" color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Continue Watching · {validCW.topicTitle}
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {validCW.title}
            </div>
          </div>
          <button
            onClick={() => handlePlayVideo(validCW.videoId, validCW.subtaskId, validCW.topicId)}
            style={{ padding: '0.5rem 1rem', borderRadius: '10px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Play size={13} fill="#fff" /> Resume
          </button>
          <button
            onClick={() => { setContinueWatching(null); try { localStorage.removeItem(CW_KEY); } catch {} }}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Add topic form ── */}
      <div className="add-topic-form" style={{ flexDirection: 'column', marginBottom: '1.5rem' }}>
        <div className="add-topic-inputs" style={{ display: 'flex', gap: '1rem', width: '100%' }}>
          <input
            type="text"
            placeholder="New Topic (e.g., System Design, React Advanced...)"
            value={newTopicTitle}
            onChange={e => setNewTopicTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTopic(e)}
            className="todo-input"
          />
          <button onClick={handleAddTopic} className="btn-primary" disabled={!newTopicTitle.trim()}>
            <Plus size={16} /> Create
          </button>
        </div>
        {/* ✅ REMOVED: old 3 syllabus buttons (Full Stack / GenAI / DSA) */}
      </div>

      {/* ── Topic list ── */}
      {isLoading ? (
        <div className="topics-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-xl)' }}>
              <div className="skeleton-line medium" />
              <div className="skeleton-line short" />
              <div className="skeleton-line" style={{ height: '6px', marginTop: '0.5rem' }} />
            </div>
          ))}
        </div>
      ) : filteredTopics.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          {searchQuery || showIncompleteOnly ? 'No matching topics found.' : 'No learning topics yet. Create one or import from Roadmap Hub!'}
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="topics" isDropDisabled={!isDraggingAllowed}>
            {provided => (
              <div className="topics-list" {...provided.droppableProps} ref={provided.innerRef}>
                {filteredTopics.map((topic, index) => {
                  const isExpanded = searchQuery.trim() !== '' || expandedTopicId === topic.id;
                  const orig = topics.find(t => t.id === topic.id);
                  const total = (orig?.subTasks || []).length;
                  const done  = (orig?.subTasks || []).filter(st => st.isCompleted).length;
                  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
                  const daysSince = topic.lastStudiedAt ? (Date.now() - topic.lastStudiedAt) / (1000 * 60 * 60 * 24) : 0;
                  const needsReview = daysSince > 7 && progress > 0 && progress < 100;

                  return (
                    <Draggable key={topic.id} draggableId={topic.id!} index={index} isDragDisabled={!isDraggingAllowed}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          className="topic-card"
                          style={{ ...prov.draggableProps.style, opacity: snap.isDragging ? 0.9 : 1, boxShadow: snap.isDragging ? '0 10px 30px rgba(0,0,0,0.5)' : undefined }}
                        >
                          <div className="topic-card-header" onClick={() => setAndPersistExpanded(isExpanded ? null : topic.id!)}>
                            <div className="topic-title-section">
                              <div {...prov.dragHandleProps} style={{ padding: '0.25rem', marginRight: '0.35rem', cursor: isDraggingAllowed ? 'grab' : 'default', color: 'var(--text-muted)' }}>
                                <GripVertical size={15} />
                              </div>
                              <button
                                className="topic-expand-btn"
                                onClick={e => { e.stopPropagation(); setAndPersistExpanded(isExpanded ? null : topic.id!); }}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              </button>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{topic.title}</div>
                                  {/* ✅ NEW: Needs Review badge */}
                                  {needsReview && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '0.1rem 0.4rem', borderRadius: '9999px', border: '1px solid rgba(245,158,11,0.25)' }}>
                                      <Bell size={9} /> Review needed
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.1rem' }}>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {done}/{total} · {progress}%
                                    {topic.timeSpentMs && topic.timeSpentMs > 0 ? ` · ${formatDuration(topic.timeSpentMs)}` : ''}
                                  </div>
                                </div>
                                {/* ✅ NEW: Color-coded progress bar */}
                                <div className="progress-bar" style={{ marginTop: '0.4rem' }}>
                                  <div
                                    className="progress-fill"
                                    style={{ width: `${progress}%`, background: progressColor(progress), transition: 'width 400ms ease, background 400ms ease' }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} className="topic-actions">
                              <button className="btn-icon" onClick={e => { e.stopPropagation(); openNotesModal(topic.id!); }} title="Topic Notes">
                                <FileText size={15} />
                              </button>
                              <button className="topic-delete-btn" onClick={e => handleDeleteTopic(topic.id!, e)} title="Delete">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <TopicBody
                              topic={topic}
                              expandedCategories={expandedCategories}
                              toggleCategory={toggleCategory}
                              toggleSubTask={toggleSubTask}
                              openNotesModal={openNotesModal}
                              deleteSubTask={deleteSubTask}
                              startTimer={startTimer}
                              handleAddSubTask={handleAddSubTask}
                              newSubtaskText={newSubtaskText}
                              setNewSubtaskText={setNewSubtaskText}
                              onPlayVideo={handlePlayVideo}
                              onCycleMastery={cycleMastery}
                            />
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* ── Notes Modal ── */}
      {editingContext && (
        <div className="notes-modal-overlay" onClick={() => setEditingContext(null)}>
          <div className="notes-modal-content" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="notes-modal-header">
              <div>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>
                  {editingContext.type === 'topic' ? 'Topic Summary & Notes' : 'Resource Notes'}
                </h2>
                {editingContext.type === 'subtask' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <input
                      type="url"
                      value={editUrl}
                      onChange={e => setEditUrl(e.target.value)}
                      placeholder="Attach a URL (YouTube, LeetCode...)"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '0.5rem 0.75rem', borderRadius: '6px', width: '100%', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>
              <button className="btn-icon" onClick={() => setEditingContext(null)}><X size={18} /></button>
            </div>
            <div className="notes-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Notes (Markdown)</label>
                <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-base)', padding: '0.2rem', borderRadius: 'var(--radius-sm)' }}>
                  <button onClick={() => setNotesPreviewMode(false)} style={{ padding: '0.25rem 0.7rem', background: !notesPreviewMode ? 'var(--bg-surface)' : 'transparent', color: !notesPreviewMode ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}>Edit</button>
                  <button onClick={() => setNotesPreviewMode(true)} style={{ padding: '0.25rem 0.7rem', background: notesPreviewMode ? 'var(--bg-surface)' : 'transparent', color: notesPreviewMode ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}>Preview</button>
                </div>
              </div>
              {notesPreviewMode ? (
                <div className="markdown-preview">
                  {editNotes.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{editNotes}</ReactMarkdown> : <span style={{ color: 'var(--text-muted)' }}>Nothing to preview</span>}
                </div>
              ) : (
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Write notes, code snippets, thoughts..."
                  style={{ width: '100%', minHeight: '220px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
                />
              )}
            </div>
            <div className="notes-modal-footer">
              <button className="btn-secondary" onClick={() => setEditingContext(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveNotes}>Save</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.isOpen}
        title={deleteConfirm.type === 'topic' ? 'Delete Topic' : 'Delete Task'}
        message={`Delete this ${deleteConfirm.type}? This cannot be undone.`}
        onConfirm={deleteConfirm.type === 'topic' ? confirmDeleteTopic : confirmDeleteSubTask}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'topic', id: '' })}
      />

      {/* ── Roadmap Hub Modal ── */}
      {showRoadmapHub && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', background: 'rgba(9,9,11,0.85)', padding: '1rem' }}
          onClick={() => setShowRoadmapHub(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '640px', maxHeight: '88vh', overflowY: 'auto', background: 'linear-gradient(145deg, rgba(24,24,27,0.97), rgba(9,9,11,0.99))', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: 0 }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 600, margin: 0, background: 'linear-gradient(135deg,#fff,#a1a1aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Import Learning Path</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>Roadmaps or YouTube playlists</p>
              </div>
              <button className="btn-icon" onClick={() => setShowRoadmapHub(false)} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '50%', padding: '0.5rem' }}><X size={16} /></button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* YouTube import */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}><Play size={14} /></div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>YouTube Playlist</h3>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <input
                    type="url"
                    placeholder="https://youtube.com/playlist?list=..."
                    value={youtubeUrl}
                    onChange={e => setYoutubeUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleImportYoutube()}
                    style={{ flex: 1, minWidth: '200px', padding: '0.7rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none' }}
                  />
                  <button
                    className="btn-primary"
                    onClick={handleImportYoutube}
                    disabled={isImportingYt || !youtubeUrl.trim()}
                    style={{ padding: '0.7rem 1.2rem', borderRadius: '10px', background: 'linear-gradient(135deg,#ef4444,#f43f5e)', boxShadow: '0 4px 15px rgba(239,68,68,0.3)', fontWeight: 600 }}
                  >
                    {isImportingYt ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>

              {/* Official roadmaps */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}><BookOpen size={14} /></div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Curated Roadmaps</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {PREDEFINED_ROADMAPS.map(roadmap => (
                    <div key={roadmap.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.9rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#e4e4e7' }}>{roadmap.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{roadmap.description}</div>
                      </div>
                      <button
                        className="btn-primary"
                        onClick={() => importPredefinedRoadmap(roadmap)}
                        disabled={importingRoadmapId === roadmap.id}
                        style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', borderRadius: '10px', background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', flexShrink: 0, marginLeft: '0.75rem' }}
                      >
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

      {/* ── Video Player Modal ── */}
      {playingVideo && (
        <VideoPlayerModal
          playing={playingVideo}
          onClose={() => setPlayingVideo(null)}
          onMarkWatched={handleMarkWatched}
          onNavigate={handlePlayerNavigate}
        />
      )}
    </div>
  );
};
