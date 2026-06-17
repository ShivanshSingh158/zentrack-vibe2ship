import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Check, ChevronDown, ChevronRight, BookOpen, Trash2,
  FileText, Search, X, Play, GripVertical,
  Eye, EyeOff, SkipForward, SkipBack, Bell, Edit3, RotateCcw,
  ListPlus, Link as LinkIcon, Loader, Gauge, FastForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { LearningTopic, LearningSubTask } from '../../types/index';
import { playPopSound } from '../../utils/sound';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
import { PREDEFINED_ROADMAPS } from '../../data/roadmaps';

// ── Custom Drag-to-Reorder (Portal-based, zero misalignment) ─────────────────

interface DragState {
  draggingId: string;
  ghostX: number;
  ghostY: number;
  ghostW: number;
  ghostH: number;
  grabOffsetY: number;
  overIndex: number;
  sourceIndex: number;
}

const ReorderList = React.memo(({ items, onReorder, renderItem }: {
  items: any[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: any, index: number, isDragging: boolean, startDrag: (e: React.PointerEvent) => void) => React.ReactNode;
}) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    const el = itemRefs.current[index];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const state: DragState = {
      draggingId: items[index].id,
      ghostX: rect.left,
      ghostY: rect.top,
      ghostW: rect.width,
      ghostH: rect.height,
      grabOffsetY: e.clientY - rect.top,
      overIndex: index,
      sourceIndex: index,
    };
    dragRef.current = state;
    setDrag({ ...state });
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }, [items]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const ghostY = e.clientY - dragRef.current.grabOffsetY;
      const ghostX = dragRef.current.ghostX;

      // Find which index the ghost is hovering over
      let overIndex = dragRef.current.sourceIndex;
      itemRefs.current.forEach((el, i) => {
        if (!el || i === dragRef.current!.sourceIndex) return;
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY > midY && i > dragRef.current!.sourceIndex) overIndex = i;
        if (e.clientY < midY && i < dragRef.current!.sourceIndex) overIndex = i;
      });

      const next = { ...dragRef.current, ghostY, ghostX, overIndex };
      dragRef.current = next;
      setDrag({ ...next });
    };

    const onUp = () => {
      if (dragRef.current) {
        const { sourceIndex, overIndex } = dragRef.current;
        if (sourceIndex !== overIndex) onReorder(sourceIndex, overIndex);
      }
      dragRef.current = null;
      setDrag(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, onReorder]);

  return (
    <>
      <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {items.map((item, index) => {
          const isDraggingThis = drag?.draggingId === item.id;
          // Show drop indicator above or below
          const isOverAbove = drag && !isDraggingThis && drag.overIndex === index && drag.sourceIndex > index;
          const isOverBelow = drag && !isDraggingThis && drag.overIndex === index && drag.sourceIndex < index;

          return (
            <div key={item.id}>
              {isOverAbove && (
                <div style={{ height: '2px', borderRadius: '2px', background: 'linear-gradient(90deg,#3b82f6,#60a5fa)', margin: '2px 0', boxShadow: '0 0 8px rgba(59,130,246,0.6)', transition: 'all 80ms ease' }} />
              )}
              <div
                ref={el => { itemRefs.current[index] = el; }}
                style={{
                  opacity: isDraggingThis ? 0.3 : 1,
                  transition: isDraggingThis ? 'none' : 'opacity 150ms ease',
                  pointerEvents: drag && !isDraggingThis ? 'none' : 'auto',
                }}
              >
                {renderItem(item, index, isDraggingThis, (e: React.PointerEvent) => startDrag(e, index))}
              </div>
              {isOverBelow && (
                <div style={{ height: '2px', borderRadius: '2px', background: 'linear-gradient(90deg,#3b82f6,#60a5fa)', margin: '2px 0', boxShadow: '0 0 8px rgba(59,130,246,0.6)', transition: 'all 80ms ease' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Ghost — rendered at body level via Portal for zero misalignment */}
      {drag && createPortal(
        <div
          style={{
            position: 'fixed',
            left: drag.ghostX,
            top: drag.ghostY,
            width: drag.ghostW,
            height: drag.ghostH,
            pointerEvents: 'none',
            zIndex: 999999,
            background: 'rgba(24,24,27,0.97)',
            border: '1px solid rgba(59,130,246,0.5)',
            borderRadius: '10px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(59,130,246,0.2)',
            transform: 'scale(1.02) rotate(-0.5deg)',
            transformOrigin: 'center top',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 0.5rem',
            overflow: 'hidden',
          }}
        >
          {/* Show a simplified version of the item in the ghost */}
          {(() => {
            const item = items.find(i => i.id === drag.draggingId);
            if (!item) return null;
            const vid = item.url ? item.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1] : null;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', overflow: 'hidden' }}>
                <div style={{ cursor: 'grabbing', color: '#3b82f6', display: 'flex', flexShrink: 0 }}>
                  <GripVertical size={14} />
                </div>
                {vid && (
                  <div style={{ flexShrink: 0, width: '36px', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
                    <img src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
              </div>
            );
          })()}
        </div>,
        document.body
      )}
    </>
  );
});
ReorderList.displayName = 'ReorderList';

// ── Helpers ───────────────────────────────────────────────────────────────────

const sanitize = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, sanitize(v)])
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
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fetchVideoTitle = async (url: string): Promise<string> => {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.title || '';
  } catch {
    return '';
  }
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CW_KEY = 'learning_continue_watching';
const EXPANDED_KEY = 'learning_expanded_topic';
const SPEED_KEY = 'learning_playback_speed';
const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

const progressColor = (pct: number) => {
  if (pct === 100) return '#10b981';
  if (pct >= 75)   return '#3b82f6';
  if (pct >= 25)   return '#f59e0b';
  return '#ef4444';
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayingVideo {
  videoId: string; subtaskId: string; topicId: string; title: string;
  allVideos: Array<{ videoId: string; subtaskId: string; title: string }>;
  currentIndex: number;
}

interface MergeVideo { id: string; title: string; url: string; }

// ── VideoPlayerModal ──────────────────────────────────────────────────────────

const VideoPlayerModal = React.memo(({ playing, onClose, onMarkWatched, onNavigate }: {
  playing: PlayingVideo;
  onClose: () => void;
  onMarkWatched: (topicId: string, subtaskId: string) => void;
  onNavigate: (delta: number) => void;
}) => {
  const total = playing.allVideos.length;
  const idx = playing.currentIndex;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;

  const [speed, setSpeed] = useState<number>(() => {
    try { return Number(localStorage.getItem(SPEED_KEY)) || 1; } catch { return 1; }
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const applySpeed = useCallback((s: number) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [s] }),
        '*'
      );
    } catch {}
  }, []);

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    try { localStorage.setItem(SPEED_KEY, String(s)); } catch {}
    applySpeed(s);
  };

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
      if (e.key === 'Escape') onClose();
      if ((e.key === 'ArrowRight' || e.key === 'n') && hasNext) onNavigate(1);
      if ((e.key === 'ArrowLeft'  || e.key === 'p') && hasPrev) onNavigate(-1);
      if (e.key === 'Enter') onMarkWatched(playing.topicId, playing.subtaskId);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [playing, hasNext, hasPrev, onClose, onMarkWatched, onNavigate]);

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.75rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '1100px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.12rem' }}>Video {idx + 1} of {total}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playing.title}</div>
          </div>
          {/* Speed controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.3rem 0.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Gauge size={12} color="rgba(255,255,255,0.4)" />
            {SPEEDS.map(s => (
              <button key={s} onClick={() => handleSpeedChange(s)}
                style={{ padding: '0.18rem 0.4rem', borderRadius: '6px', border: 'none', background: speed === s ? '#3b82f6' : 'transparent', color: speed === s ? '#fff' : 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, transition: 'all 150ms ease' }}>
                {s}×
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', width: '36px', height: '36px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Player */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.9)' }}>
          <iframe ref={iframeRef} key={playing.videoId} width="100%" height="100%"
            src={`https://www.youtube-nocookie.com/embed/${playing.videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
            title={playing.title} frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen style={{ display: 'block', width: '100%', height: '100%' }}
            onLoad={() => { setTimeout(() => applySpeed(speed), 1500); }} />
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => onNavigate(-1)} disabled={!hasPrev}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.55rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: hasPrev ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', color: hasPrev ? '#fff' : 'rgba(255,255,255,0.2)', cursor: hasPrev ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 600 }}>
            <SkipBack size={14} /> Prev
          </button>
          <button onClick={() => { onMarkWatched(playing.topicId, playing.subtaskId); hasNext && onNavigate(1); }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, minHeight: '44px' }}>
            <Check size={15} strokeWidth={2.5} /> Mark Watched{hasNext ? ' & Next' : ''}
          </button>
          <button onClick={() => onNavigate(1)} disabled={!hasNext}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.55rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: hasNext ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)', color: hasNext ? '#fff' : 'rgba(255,255,255,0.2)', cursor: hasNext ? 'pointer' : 'default', fontSize: '0.82rem', fontWeight: 600 }}>
            Next <SkipForward size={14} />
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>← → navigate · Enter mark watched · Esc close</div>
      </div>
    </div>,
    document.body
  );
});
VideoPlayerModal.displayName = 'VideoPlayerModal';

// ── SubTaskItem ───────────────────────────────────────────────────────────────

const SubTaskItem = React.memo(({
  subTask, topicId, isEditMode, dragHandleProps,
  toggleSubTask, openNotesModal, deleteSubTask, onPlayVideo,
  instantDeleteSubTask, bulkDeleteSelected, toggleBulkDelete,
  isRenaming, onStartRename, onSaveRename, onCancelRename,
}: {
  subTask: LearningSubTask; topicId: string; isEditMode?: boolean;
  onDragStart?: (e: React.PointerEvent) => void;
  toggleSubTask: (t: string, s: string) => void;
  openNotesModal: (t: string, s: string) => void;
  deleteSubTask: (t: string, s: string) => void;
  instantDeleteSubTask: (t: string, s: string) => void;
  onPlayVideo: (videoId: string, subtaskId: string, topicId: string) => void;
  bulkDeleteSelected: Set<string>;
  toggleBulkDelete: (s: string) => void;
  isRenaming?: boolean;
  onStartRename?: (t: string, s: string, title: string) => void;
  onSaveRename?: (newTitle: string) => void;
  onCancelRename?: () => void;
}) => {
  const renameInputRef = useRef<HTMLInputElement>(null);

  const videoId = useMemo(() => {
    if (subTask.url) { const id = extractYoutubeId(subTask.url); if (id) return id; }
    if (subTask.resources) for (const r of subTask.resources) { const id = extractYoutubeId(r.url); if (id) return id; }
    return null;
  }, [subTask.url, subTask.resources]);

  const isSelected = bulkDeleteSelected.has(subTask.id);

  if (isRenaming) {
    return (
      <div className="subtask-item" style={{ alignItems: 'center', gap: '0.4rem' }}>
        {isEditMode && (
          <div
            onPointerDown={onDragStart}
            style={{ cursor: 'grab', color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 0.1rem', touchAction: 'none' }}
          >
            <GripVertical size={13} />
          </div>
        )}
        <input
          ref={renameInputRef}
          type="text"
          defaultValue={subTask.text}
          onKeyDown={e => {
            if (e.key === 'Enter') onSaveRename?.((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') onCancelRename?.();
          }}
          style={{ flex: 1, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '7px', padding: '0.3rem 0.55rem', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
        />
        <button onClick={e => { const inp = (e.currentTarget.previousElementSibling as HTMLInputElement); onSaveRename?.(inp.value); }}
          style={{ background: '#3b82f6', border: 'none', borderRadius: '6px', padding: '0.28rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>Save</button>
        <button onClick={onCancelRename}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}><X size={13} /></button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.35rem' }}>
      <div className={`subtask-item ${subTask.isCompleted ? 'completed' : ''}`} style={{ alignItems: 'center' }}>

        {isEditMode && (
          <div
            onPointerDown={onDragStart}
            style={{ cursor: 'grab', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', padding: '0 0.2rem', flexShrink: 0, touchAction: 'none' }}
          >
            <GripVertical size={14} />
          </div>
        )}

        {/* Bulk-select indicator (edit mode) OR normal checkbox (view mode) */}
        {isEditMode ? (
          <button
            onClick={() => toggleBulkDelete(subTask.id)}
            style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, border: `2px solid ${isSelected ? '#ef4444' : 'rgba(255,255,255,0.18)'}`, background: isSelected ? '#ef4444' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {isSelected && <Check size={11} color="#fff" strokeWidth={3} />}
          </button>
        ) : (
          <button className={`todo-checkbox ${subTask.isCompleted ? 'checked' : ''}`}
            onClick={() => toggleSubTask(topicId, subTask.id)}
            role="checkbox" aria-checked={subTask.isCompleted}
            style={{ flexShrink: 0 }}>
            {subTask.isCompleted && <Check size={13} strokeWidth={3} />}
          </button>
        )}

        {/* Thumbnail (video items only) */}
        {videoId && (
          <div style={{ flexShrink: 0, width: '40px', height: '27px', borderRadius: '4px', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
            onClick={() => onPlayVideo(videoId, subTask.id, topicId)}>
            <img
              src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
              alt=""
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: subTask.isCompleted ? 0.35 : 0.85, transition: 'opacity 200ms' }}
            />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
              <Play size={8} fill="#fff" color="#fff" />
            </div>
          </div>
        )}

        {/* Title */}
        <span className="todo-text" style={{ flex: 1 }}>{subTask.text}</span>

        <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
          {/* Normal mode actions */}
          {!isEditMode && (
            <>
              {videoId && (
                <button onClick={() => onPlayVideo(videoId, subTask.id, topicId)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.22rem', padding: '0.22rem 0.5rem', borderRadius: '7px', background: subTask.isCompleted ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.32)', color: subTask.isCompleted ? 'rgba(239,68,68,0.45)' : '#ef4444', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, minHeight: '28px' }}>
                  <Play size={10} fill="currentColor" /> Watch
                </button>
              )}
              <button className="btn-icon" onClick={() => openNotesModal(topicId, subTask.id)}
                style={{ color: subTask.notes ? 'var(--text-primary)' : 'var(--text-muted)' }} title="Notes">
                <FileText size={12} />
              </button>
              <button className="todo-delete" onClick={() => deleteSubTask(topicId, subTask.id)} aria-label="Delete">
                <Trash2 size={12} />
              </button>
            </>
          )}

          {/* Edit mode actions */}
          {isEditMode && (
            <>
              {videoId && (
                <button onClick={() => onPlayVideo(videoId, subTask.id, topicId)}
                  style={{ display: 'flex', alignItems: 'center', padding: '0.2rem 0.45rem', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444', cursor: 'pointer', minHeight: '28px' }}>
                  <Play size={9} fill="currentColor" />
                </button>
              )}
              <button onClick={() => onStartRename?.(topicId, subTask.id, subTask.text)}
                style={{ display: 'flex', alignItems: 'center', padding: '0.2rem 0.4rem', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', cursor: 'pointer', minHeight: '28px' }}>
                <Edit3 size={11} />
              </button>
              <button onClick={() => instantDeleteSubTask(topicId, subTask.id)}
                style={{ display: 'flex', alignItems: 'center', padding: '0.2rem 0.4rem', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', cursor: 'pointer', minHeight: '28px' }}>
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
SubTaskItem.displayName = 'SubTaskItem';

// ── TopicBody ─────────────────────────────────────────────────────────────────

const TopicBody = React.memo(({
  topic, expandedCategories, toggleCategory, toggleSubTask, openNotesModal, deleteSubTask,
  handleAddSubTask, newSubtaskText, setNewSubtaskText, onPlayVideo,
  isEditMode, onToggleEdit,
  addVideoState, setAddVideoState, onAddSingleVideo,
  mergePanelState, setMergePanelState, onFetchMerge, onMergeSelected,
  renamingSubtask, onStartRename, onSaveRename, onCancelRename,
  instantDeleteSubTask, bulkDeleteState, toggleBulkDelete, handleBulkDelete,
  onSubTaskReorder,
}: any) => {
  // In edit mode, flatten ALL subtasks into one ordered list (no category separators)
  const flatSubTasks: LearningSubTask[] = topic.subTasks || [];

  const categories = useMemo(() => {
    const cats: { [key: string]: LearningSubTask[] } = {};
    flatSubTasks.forEach((st: any) => {
      const cat = st.category || 'General';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(st);
    });
    return cats;
  }, [flatSubTasks]);

  const categoryKeys = Object.keys(categories);
  const isSingleCat = categoryKeys.length === 1;
  const isMyMergePanel = mergePanelState?.topicId === topic.id;
  const isMyAddVideo = addVideoState?.topicId === topic.id;
  const selectedInTopic = flatSubTasks.filter((st: any) => bulkDeleteState.has(st.id)).length;

  return (
    <div className="topic-card-body">
      {/* Edit mode banner */}
      {isEditMode && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', margin: '0 0 0.75rem', borderRadius: '10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 600 }}>✏️ Edit — drag to reorder · click red checkbox to select · ✏ to rename</span>
          <button onClick={onToggleEdit} style={{ fontSize: '0.68rem', color: '#60a5fa', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', padding: '0.2rem 0.55rem', cursor: 'pointer', fontWeight: 600 }}>Done</button>
        </div>
      )}

      {/* ── EDIT MODE: Custom drag-to-reorder flat list ── */}
      {isEditMode ? (
        <ReorderList
          items={flatSubTasks}
          onReorder={(from, to) => onSubTaskReorder(topic.id, from, to)}
          renderItem={(st: LearningSubTask, index: number, isDragging: boolean, startDrag: (e: React.PointerEvent) => void) => (
            <SubTaskItem
              subTask={st} topicId={topic.id}
              isEditMode={true}
              onDragStart={startDrag}
              isRenaming={renamingSubtask?.topicId === topic.id && renamingSubtask?.subtaskId === st.id}
              toggleSubTask={toggleSubTask} openNotesModal={openNotesModal}
              deleteSubTask={deleteSubTask} instantDeleteSubTask={instantDeleteSubTask}
              onPlayVideo={onPlayVideo}
              bulkDeleteSelected={bulkDeleteState} toggleBulkDelete={toggleBulkDelete}
              onStartRename={onStartRename} onSaveRename={onSaveRename} onCancelRename={onCancelRename}
            />
          )}
        />
      ) : (
        /* ── VIEW MODE: Category sections ── */
        <div style={{ position: 'relative', paddingLeft: isSingleCat ? 0 : '1rem', marginTop: '0.5rem' }}>
          {categoryKeys.map(category => {
            const catKey = `${topic.id}-${category}`;
            const isCatExpanded = isSingleCat || expandedCategories[catKey] === true;
            const catSubTasks: LearningSubTask[] = categories[category];

            return (
              <div key={category} style={{ marginBottom: isSingleCat ? 0 : '1.2rem' }}>
                {!isSingleCat && (
                  <div onClick={() => toggleCategory(topic.id, category)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', padding: '0.25rem 0.5rem', borderRadius: '7px', background: 'rgba(255,255,255,0.03)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>{category}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{catSubTasks.filter(s => s.isCompleted).length}/{catSubTasks.length}</span>
                    {isCatExpanded ? <ChevronDown size={12} color="var(--text-muted)" /> : <ChevronRight size={12} color="var(--text-muted)" />}
                  </div>
                )}

                {isCatExpanded && catSubTasks.map((st: LearningSubTask) => (
                  <SubTaskItem key={st.id} subTask={st} topicId={topic.id}
                    toggleSubTask={toggleSubTask} openNotesModal={openNotesModal}
                    deleteSubTask={deleteSubTask} instantDeleteSubTask={instantDeleteSubTask}
                    onPlayVideo={onPlayVideo}
                    bulkDeleteSelected={bulkDeleteState} toggleBulkDelete={toggleBulkDelete}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit Mode Action Bar ── */}
      {isEditMode && (
        <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {selectedInTopic > 0 && (
            <button onClick={() => handleBulkDelete(topic.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.55rem', borderRadius: '10px', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', animation: 'pulse 1.5s infinite' }}>
              <Trash2 size={14} /> Delete Selected ({selectedInTopic})
            </button>
          )}

          <button
            onClick={() => setAddVideoState(isMyAddVideo ? null : { topicId: topic.id, url: '', title: '', fetching: false })}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '10px', border: '1px dashed rgba(239,68,68,0.35)', background: isMyAddVideo ? 'rgba(239,68,68,0.08)' : 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
            <LinkIcon size={14} /> {isMyAddVideo ? 'Cancel' : '+ Add Video URL'}
          </button>

          {isMyAddVideo && (
            <AddVideoPanel state={addVideoState} setState={setAddVideoState} topicId={topic.id} onAdd={onAddSingleVideo} />
          )}

          <button
            onClick={() => setMergePanelState(isMyMergePanel ? null : { topicId: topic.id, url: '', videos: [], selected: new Set(), loading: false })}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '10px', border: '1px dashed rgba(99,102,241,0.35)', background: isMyMergePanel ? 'rgba(99,102,241,0.08)' : 'transparent', color: '#818cf8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
            <ListPlus size={14} /> {isMyMergePanel ? 'Cancel' : '+ Add from Another Playlist'}
          </button>

          {isMyMergePanel && (
            <MergePanel state={mergePanelState} setState={setMergePanelState} topicId={topic.id} onFetch={onFetchMerge} onMerge={onMergeSelected} />
          )}
        </div>
      )}

      {/* Normal add task form */}
      {!isEditMode && (
        <form onSubmit={(e) => handleAddSubTask(topic.id, e)} className="add-subtask-form" style={{ marginTop: '0.85rem' }}>
          <input type="text" placeholder="Add a task or milestone..." value={newSubtaskText[topic.id] || ''}
            onChange={e => setNewSubtaskText((prev: any) => ({ ...prev, [topic.id]: e.target.value }))} className="subtask-input" />
          <button type="submit" className="btn-secondary btn-small" disabled={!newSubtaskText[topic.id]?.trim()}>Add</button>
        </form>
      )}
    </div>
  );
});
TopicBody.displayName = 'TopicBody';

// ── AddVideoPanel ─────────────────────────────────────────────────────────────

const AddVideoPanel = ({ state, setState, topicId, onAdd }: any) => {
  const [localUrl, setLocalUrl] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  const [fetching, setFetching] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const handleUrlChange = async (url: string) => {
    setLocalUrl(url);
    const vid = extractYoutubeId(url);
    setPreviewId(vid);
    if (vid && !localTitle) {
      setFetching(true);
      const title = await fetchVideoTitle(url);
      if (title) setLocalTitle(title);
      setFetching(false);
    }
  };

  return (
    <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📎 Add Video</div>
      <input type="url" placeholder="Paste YouTube video URL..." value={localUrl} onChange={e => handleUrlChange(e.target.value)}
        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
      {previewId && (
        <div style={{ borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', maxHeight: '120px', position: 'relative' }}>
          <img src={`https://img.youtube.com/vi/${previewId}/mqdefault.jpg`} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(239,68,68,0.9)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={14} fill="#fff" color="#fff" />
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        {fetching && <Loader size={13} color="rgba(255,255,255,0.4)" style={{ animation: 'spin 1s linear infinite' }} />}
        <input type="text" placeholder={fetching ? 'Fetching title...' : 'Custom title (optional)'}
          value={localTitle} onChange={e => setLocalTitle(e.target.value)}
          style={{ flex: 1, padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.82rem', outline: 'none' }} />
      </div>
      <button onClick={() => onAdd(topicId, localUrl, localTitle)} disabled={!localUrl.trim()}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.55rem', borderRadius: '8px', border: 'none', background: localUrl.trim() ? '#ef4444' : 'rgba(239,68,68,0.3)', color: '#fff', cursor: localUrl.trim() ? 'pointer' : 'default', fontWeight: 700, fontSize: '0.85rem' }}>
        <Plus size={14} /> Add to Playlist
      </button>
    </div>
  );
};

// ── MergePanel ────────────────────────────────────────────────────────────────

const MergePanel = ({ state, setState, topicId, onFetch, onMerge }: any) => {
  const [searchInMerge, setSearchInMerge] = useState('');

  const filtered = useMemo(() =>
    (state.videos || []).filter((v: MergeVideo) =>
      !searchInMerge.trim() || v.title.toLowerCase().includes(searchInMerge.toLowerCase())
    ), [state.videos, searchInMerge]);

  const selectedCount = state.selected?.size ?? 0;

  const toggleVideo = (id: string) => {
    setState((prev: any) => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, selected: next };
    });
  };

  const toggleAll = (selectAll: boolean) => {
    setState((prev: any) => {
      if (!prev) return prev;
      return { ...prev, selected: selectAll ? new Set(filtered.map((v: MergeVideo) => v.id)) : new Set() };
    });
  };

  return (
    <div style={{ padding: '0.85rem', borderRadius: '12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📥 Merge Playlist</div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input type="url" placeholder="Paste another playlist URL..." value={state.url}
          onChange={e => setState((prev: any) => prev ? { ...prev, url: e.target.value } : prev)}
          onKeyDown={e => e.key === 'Enter' && onFetch()}
          style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: '0.82rem', outline: 'none' }} />
        <button onClick={onFetch} disabled={state.loading || !state.url.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.6rem 0.9rem', borderRadius: '8px', border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
          {state.loading ? <Loader size={13} /> : 'Fetch'}
        </button>
      </div>

      {state.videos?.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
              {state.videos.length} new videos found{state.videos.length !== (state as any)?._total ? ` (${(state as any)?._total - state.videos.length} already in topic)` : ''}
            </span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button onClick={() => toggleAll(true)} style={{ fontSize: '0.68rem', color: '#818cf8', background: 'none', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '5px', padding: '0.18rem 0.5rem', cursor: 'pointer' }}>All</button>
              <button onClick={() => toggleAll(false)} style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', padding: '0.18rem 0.5rem', cursor: 'pointer' }}>None</button>
            </div>
          </div>

          {state.videos.length > 8 && (
            <input type="text" placeholder="Filter videos..." value={searchInMerge}
              onChange={e => setSearchInMerge(e.target.value)}
              style={{ padding: '0.45rem 0.65rem', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          )}

          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingRight: '0.25rem' }}>
            {filtered.map((v: MergeVideo) => {
              const isSelected = state.selected?.has(v.id);
              return (
                <div key={v.id} onClick={() => toggleVideo(v.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem', borderRadius: '8px', background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSelected ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', transition: 'background 150ms ease' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSelected ? '#818cf8' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? '#818cf8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isSelected && <Check size={11} color="#fff" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: isSelected ? '#e4e4e7' : 'rgba(255,255,255,0.55)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{v.title}</span>
                </div>
              );
            })}
          </div>

          <button onClick={onMerge} disabled={selectedCount === 0}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '8px', border: 'none', background: selectedCount > 0 ? 'linear-gradient(135deg,#7c3aed,#8b5cf6)' : 'rgba(99,102,241,0.2)', color: selectedCount > 0 ? '#fff' : 'rgba(255,255,255,0.3)', cursor: selectedCount > 0 ? 'pointer' : 'default', fontWeight: 700, fontSize: '0.88rem' }}>
            <Plus size={14} /> Add {selectedCount > 0 ? `${selectedCount} Video${selectedCount > 1 ? 's' : ''}` : 'Selected Videos'} to Playlist
          </button>
        </>
      )}
    </div>
  );
};

// ── Main Module ───────────────────────────────────────────────────────────────

export const LearningChecklistModule = () => {
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTopicTitle, setNewTopicTitle] = useState('');

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
  const [editNotes, setEditNotes] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isImportingYt, setIsImportingYt] = useState(false);
  const [showRoadmapHub, setShowRoadmapHub] = useState(false);
  const [importingRoadmapId, setImportingRoadmapId] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<PlayingVideo | null>(null);
  const [continueWatching, setContinueWatching] = useState<{ topicId: string; subtaskId: string; videoId: string; title: string; topicTitle: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem(CW_KEY) || 'null'); } catch { return null; }
  });

  // ── Custom Playlist Editor State ──────────────────────────────────────────
  const [editModeTopics, setEditModeTopics] = useState<Set<string>>(new Set());
  const [addVideoState, setAddVideoState] = useState<any>(null);
  const [mergePanelState, setMergePanelState] = useState<any>(null);
  const [renamingSubtask, setRenamingSubtask] = useState<{ topicId: string; subtaskId: string; title: string } | null>(null);
  const [bulkDeleteState, setBulkDeleteState] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { startTimer } = usePomodoroContext();
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
    }, err => { console.error(err); toast.error('Failed to load topics'); setIsLoading(false); });
    return () => unsub();
  }, [user]);

  // ── Video Handlers ────────────────────────────────────────────────────────

  const handlePlayVideo = useCallback((videoId: string, subtaskId: string, topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const allVideos: PlayingVideo['allVideos'] = [];
    topic.subTasks.forEach(st => {
      let vid: string | null = null;
      if (st.url) vid = extractYoutubeId(st.url);
      if (!vid && st.resources) for (const r of st.resources) { const id = extractYoutubeId(r.url); if (id) { vid = id; break; } }
      if (vid) allVideos.push({ videoId: vid, subtaskId: st.id, title: st.text });
    });
    const currentIndex = Math.max(0, allVideos.findIndex(v => v.subtaskId === subtaskId));
    const video = allVideos[currentIndex];
    setPlayingVideo({ videoId, subtaskId, topicId, title: video?.title || '', allVideos, currentIndex });
    const cw = { topicId, subtaskId, videoId, title: video?.title || '', topicTitle: topic.title };
    setContinueWatching(cw);
    try { localStorage.setItem(CW_KEY, JSON.stringify(cw)); } catch {}
  }, [topics]);

  // Jump to first unwatched video in a topic
  const handleResumePlaylist = useCallback((topicId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const firstUnwatched = topic.subTasks.find(st => {
      if (st.isCompleted) return false;
      if (st.url && extractYoutubeId(st.url)) return true;
      if (st.resources) return st.resources.some(r => extractYoutubeId(r.url));
      return false;
    });
    if (!firstUnwatched) { toast.info('All videos watched! 🎉'); return; }
    const vid = firstUnwatched.url ? extractYoutubeId(firstUnwatched.url) :
      firstUnwatched.resources?.map(r => extractYoutubeId(r.url)).find(Boolean);
    if (vid) handlePlayVideo(vid, firstUnwatched.id, topicId);
  }, [topics, handlePlayVideo]);

  const handlePlayerNavigate = useCallback((delta: number) => {
    setPlayingVideo(prev => {
      if (!prev) return null;
      const next = prev.currentIndex + delta;
      if (next < 0 || next >= prev.allVideos.length) return prev;
      const v = prev.allVideos[next];
      return { ...prev, videoId: v.videoId, subtaskId: v.subtaskId, title: v.title, currentIndex: next };
    });
  }, []);

  const handleMarkWatched = useCallback(async (topicId: string, subtaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const st = topic.subTasks.find(s => s.id === subtaskId);
    if (!st || st.isCompleted) return;
    const updated = topic.subTasks.map(s => s.id === subtaskId ? { ...s, isCompleted: true } : s);
    playPopSound();
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated), lastStudiedAt: Date.now() }); }
    catch { toast.error('Failed to mark watched'); }
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

  const handleSubTaskReorder = useCallback(async (topicId: string, result: any) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (result.source.index === result.destination.index) return;
    const items = Array.from(topic.subTasks);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
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
      id: uniqueId(), text: title, category: 'Videos', isCompleted: false,
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
    try {
      const data = await fetchYouTubePlaylist(playlistId);
      const topic = topics.find(t => t.id === mergePanelState.topicId);
      const existingVideoIds = new Set(
        (topic?.subTasks || []).map(st => st.url ? extractYoutubeId(st.url) : null).filter(Boolean)
      );
      const total = data.videos.length;
      const videos: MergeVideo[] = data.videos
        .filter((v: any) => !existingVideoIds.has(extractYoutubeId(v.link)))
        .map((v: any) => ({ id: uniqueId(), title: v.title, url: v.link }));
      const selected = new Set(videos.map((v: MergeVideo) => v.id));
      setMergePanelState((prev: any) => prev ? { ...prev, videos, selected, loading: false, _total: total } : null);
      if (videos.length === 0) toast.info('All videos from this playlist are already in the topic!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch playlist');
      setMergePanelState((prev: any) => prev ? { ...prev, loading: false } : null);
    }
  }, [mergePanelState, topics]);

  const handleMergeSelected = useCallback(async () => {
    if (!mergePanelState) return;
    const { topicId, videos, selected } = mergePanelState;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const toAdd: LearningSubTask[] = (videos as MergeVideo[])
      .filter(v => selected.has(v.id))
      .map(v => ({ id: uniqueId(), text: v.title, category: 'Videos', isCompleted: false, url: v.url, resources: [{ title: 'Watch Video', url: v.url, type: 'video' }] }));
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
    const updated = topic.subTasks.map(st => st.id === subtaskId ? { ...st, text: newTitle.trim() } : st);
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

  const instantDeleteSubTask = useCallback(async (topicId: string, subTaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.filter(st => st.id !== subTaskId);
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) }); }
    catch { toast.error('Failed to delete'); }
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

  // ── Global DragEnd ────────────────────────────────────────────────────────

  const handleGlobalDragEnd = useCallback(async (result: any) => {
    if (!result.destination) return;
    if (result.source.droppableId.startsWith('subtasks-')) {
      const topicId = result.source.droppableId.replace('subtasks-', '');
      await handleSubTaskReorder(topicId, result);
    } else if (result.source.droppableId === 'topics') {
      if (searchQuery.trim() !== '' || showIncompleteOnly) return;
      const items = Array.from(topics);
      const [moved] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, moved);
      setTopics(items);
      try { items.forEach((item, i) => { if (item.order !== i) updateDoc(doc(db, 'learning_topics', item.id!), { order: i }); }); }
      catch { toast.error('Failed to save order'); }
    }
  }, [topics, searchQuery, showIncompleteOnly, handleSubTaskReorder]);

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
      const task: LearningSubTask = { id: uniqueId(), text: item.text, category: mod.category, isCompleted: false };
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
      const subTasks: LearningSubTask[] = data.videos.map((v: any) => ({ id: uniqueId(), text: v.title, category: 'Videos', isCompleted: false, url: v.link, resources: [{ title: 'Watch Video', url: v.link, type: 'video' }] }));
      const newTopic: Omit<LearningTopic, 'id'> = { userId: user.uid, title: data.title, subTasks, createdAt: Date.now(), lastStudiedAt: Date.now(), order: topics.length, timeSpentMs: 0 };
      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Imported ${data.videos.length} videos!`);
      setYoutubeUrl(''); setShowRoadmapHub(false);
    } catch (err: any) { toast.error(err.message || 'Failed to fetch playlist'); }
    finally { setIsImportingYt(false); }
  };

  const handleDeleteTopic = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setDeleteConfirm({ isOpen: true, type: 'topic', id }); };
  const confirmDeleteTopic = async () => {
    try { await deleteDoc(doc(db, 'learning_topics', deleteConfirm.id)); if (expandedTopicId === deleteConfirm.id) setAndPersistExpanded(null); setDeleteConfirm({ isOpen: false, type: 'topic', id: '' }); }
    catch { toast.error('Failed to delete topic'); }
  };

  const handleAddSubTask = async (topicId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = newSubtaskText[topicId]?.trim();
    if (!text) return;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const newST: LearningSubTask = { id: uniqueId(), text, isCompleted: false };
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
    const updated = topic.subTasks.map(st => { if (st.id === subTaskId) { newStatus = !st.isCompleted; return { ...st, isCompleted: newStatus }; } return st; });
    if (newStatus) playPopSound();
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated), lastStudiedAt: Date.now() }); }
    catch { toast.error('Failed to update'); setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: topic.subTasks } : t)); }
  }, [topics]);

  const deleteSubTask = useCallback((topicId: string, subTaskId: string) => {
    setDeleteConfirm({ isOpen: true, type: 'subtask', id: subTaskId, parentId: topicId });
  }, []);

  const toggleCategory = useCallback((topicId: string, category: string) => {
    setExpandedCategories(prev => ({ ...prev, [`${topicId}-${category}`]: !prev[`${topicId}-${category}`] }));
  }, []);

  const confirmDeleteSubTask = async () => {
    const topicId = deleteConfirm.parentId!;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    const updated = topic.subTasks.filter(st => st.id !== deleteConfirm.id);
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updated } : t));
    try { await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updated) }); setDeleteConfirm({ isOpen: false, type: 'topic', id: '' }); }
    catch { toast.error('Failed to delete task'); setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: topic.subTasks } : t)); }
  };

  const openNotesModal = useCallback((topicId: string, subtaskId?: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    if (subtaskId) { const st = topic.subTasks.find(s => s.id === subtaskId); setEditNotes(st?.notes || ''); setEditingContext({ type: 'subtask', topicId, subtaskId }); }
    else { setEditNotes(topic.notes || ''); setEditingContext({ type: 'topic', topicId }); }
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
      if (showIncompleteOnly) filtered = filtered.filter(st => !st.isCompleted);
      if (isTopicMatch || filtered.length > 0) return { ...topic, subTasks: filtered };
      return null;
    }).filter(Boolean) as LearningTopic[];
  }, [topics, searchQuery, showIncompleteOnly]);

  const isDraggingAllowed = searchQuery.trim() === '' && !showIncompleteOnly && editModeTopics.size === 0;

  // Fix: Only show Continue Watching if the video is not already completed
  const validCW = useMemo(() => {
    if (!continueWatching) return null;
    const topic = topics.find(t => t.id === continueWatching.topicId);
    if (!topic) return null;
    const st = topic.subTasks.find(s => s.id === continueWatching.subtaskId);
    if (!st || st.isCompleted) return null; // Don't show if already watched
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
          <button className="btn-primary" onClick={() => setShowRoadmapHub(true)}><Plus size={15} /> Import</button>
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
      {validCW && !playingVideo && (
        <div style={{ padding: '0.8rem 1rem', borderRadius: '14px', marginBottom: '1.25rem', background: 'linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.05))', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Play size={15} fill="#fff" color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Continue · {validCW.topicTitle}</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{validCW.title}</div>
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
        <DragDropContext onDragEnd={handleGlobalDragEnd}>
          <Droppable droppableId="topics" type="TOPIC" isDropDisabled={!isDraggingAllowed}>
            {provided => (
              <div className="topics-list" {...provided.droppableProps} ref={provided.innerRef}>
                {filteredTopics.map((topic, index) => {
                  const isExpanded = searchQuery.trim() !== '' || expandedTopicId === topic.id;
                  const orig = topics.find(t => t.id === topic.id);
                  const total = (orig?.subTasks || []).length;
                  const done = (orig?.subTasks || []).filter(st => st.isCompleted).length;
                  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
                  const daysSince = topic.lastStudiedAt ? (Date.now() - topic.lastStudiedAt) / 86400000 : 0;
                  const needsReview = daysSince > 14 && progress >= 50 && progress < 100;
                  const isEditMode = editModeTopics.has(topic.id!);
                  // Check if any video in this topic is unwatched
                  const hasUnwatchedVideos = (orig?.subTasks || []).some(st => {
                    if (st.isCompleted) return false;
                    if (st.url && extractYoutubeId(st.url)) return true;
                    return (st.resources || []).some(r => extractYoutubeId(r.url));
                  });

                  return (
                    <Draggable key={topic.id} draggableId={topic.id!} index={index} isDragDisabled={!isDraggingAllowed}>
                      {(prov, snap) => (
                        <div ref={prov.innerRef} {...prov.draggableProps} className="topic-card"
                          style={{ ...prov.draggableProps.style, opacity: snap.isDragging ? 0.9 : 1, boxShadow: snap.isDragging ? '0 10px 30px rgba(0,0,0,0.5)' : undefined }}>
                          <div className="topic-card-header" onClick={() => setAndPersistExpanded(isExpanded ? null : topic.id!)}>
                            <div className="topic-title-section">
                              {isDraggingAllowed && (
                                <div {...prov.dragHandleProps} style={{ padding: '0.25rem', marginRight: '0.3rem', cursor: 'grab', color: 'var(--text-muted)' }}>
                                  <GripVertical size={14} />
                                </div>
                              )}
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
                              {/* ▶ Resume Playlist — Jump to next unwatched */}
                              {hasUnwatchedVideos && !isEditMode && (
                                <button
                                  onClick={e => { e.stopPropagation(); if (!isExpanded) setAndPersistExpanded(topic.id!); handleResumePlaylist(topic.id!); }}
                                  title="Resume playlist — jump to next unwatched video"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.28rem 0.55rem', borderRadius: '7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600 }}>
                                  <Play size={10} fill="currentColor" /> Resume
                                </button>
                              )}
                              {/* Edit playlist button */}
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

                          {/* Smooth accordion */}
                          <div style={{
                            display: isExpanded ? 'block' : 'none',
                            overflow: 'hidden',
                          }}>
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
                              />
                            )}
                          </div>
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

      <ConfirmDialog open={deleteConfirm.isOpen} title={deleteConfirm.type === 'topic' ? 'Delete Topic' : 'Delete Video'} message={`Delete this ${deleteConfirm.type}? This cannot be undone.`}
        onConfirm={deleteConfirm.type === 'topic' ? confirmDeleteTopic : confirmDeleteSubTask}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'topic', id: '' })} />

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
      {playingVideo && (
        <VideoPlayerModal playing={playingVideo} onClose={() => setPlayingVideo(null)} onMarkWatched={handleMarkWatched} onNavigate={handlePlayerNavigate} />
      )}
    </div>
  );
};
