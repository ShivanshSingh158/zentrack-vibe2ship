import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  Plus, Check, ChevronDown, ChevronRight, Trash2,
  FileText, X, Play, GripVertical, Edit3,
  ListPlus, Link as LinkIcon, Loader
} from 'lucide-react';
import { ReorderList } from './ReorderList';
import type { LearningSubTask } from '../../types/index';
import { extractYoutubeId, uniqueId, fetchVideoTitle, fetchYouTubePlaylist, extractPlaylistId, sanitize, TS_KEY, UNDO_DELAY } from './learningHelpers';
import { toast } from 'sonner';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

interface MergeVideo { id: string; title: string; url: string; }

// ── SubTaskItem ───────────────────────────────────────────────────────────────

export const SubTaskItem = React.memo(({
  subTask, topicId, isEditMode, onDragStart, lectureIndex,
  toggleSubTask, openNotesModal, deleteSubTask, onPlayVideo, onTogglePin,
  instantDeleteSubTask, bulkDeleteSelected, toggleBulkDelete,
  isRenaming, onStartRename, onSaveRename, onCancelRename,
}: {
  subTask: LearningSubTask; topicId: string; isEditMode?: boolean; lectureIndex?: number;
  onDragStart?: (e: React.PointerEvent) => void;
  toggleSubTask: (t: string, s: string) => void;
  openNotesModal: (t: string, s: string) => void;
  deleteSubTask: (t: string, s: string) => void;
  instantDeleteSubTask: (t: string, s: string) => void;
  onPlayVideo: (videoId: string, subtaskId: string, topicId: string) => void;
  onTogglePin: (topicId: string, subtaskId: string) => void;
  bulkDeleteSelected: Set<string>;
  toggleBulkDelete: (s: string) => void;
  isRenaming?: boolean;
  onStartRename?: (t: string, s: string, title: string) => void;
  onSaveRename?: (newTitle: string) => void;
  onCancelRename?: () => void;
}) => {
  const renameInputRef = useRef<HTMLInputElement>(null);
  const swipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const [swipeReveal, setSwipeReveal] = useState<'right' | 'left' | null>(null);
  const lastTapRef = useRef<number>(0);

  const videoId = useMemo(() => {
    if (subTask.url) { const id = extractYoutubeId(subTask.url); if (id) return id; }
    if (subTask.resources) for (const r of subTask.resources) { const id = extractYoutubeId(r.url); if (id) return id; }
    return null;
  }, [subTask.url, subTask.resources]);

  const isSelected = bulkDeleteSelected.has(subTask.id);

  const handleDoubleClick = useCallback(() => {
    if (!isEditMode) toggleSubTask(topicId, subTask.id);
  }, [isEditMode, toggleSubTask, topicId, subTask.id]);

  const handleTouchEnd = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      handleDoubleClick();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [handleDoubleClick]);

  const handleTouchStart = (e: React.TouchEvent) => {
    swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
    setSwipeReveal(null);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipeRef.current || isEditMode) return;
    const dx = e.touches[0].clientX - swipeRef.current.startX;
    const dy = Math.abs(e.touches[0].clientY - swipeRef.current.startY);
    if (dy > 12) { swipeRef.current = null; return; }
    if (dx > 40) setSwipeReveal('right');
    else if (dx < -40) setSwipeReveal('left');
    else setSwipeReveal(null);
  };
  const handleTouchEndSwipe = () => {
    if (swipeReveal === 'right') { toggleSubTask(topicId, subTask.id); }
    setTimeout(() => setSwipeReveal(null), 400);
  };

  if (isRenaming) {
    return (
      <div className="subtask-item" style={{ alignItems: 'center', gap: '0.4rem' }}>
        {isEditMode && (
          <div onPointerDown={onDragStart} style={{ cursor: 'grab', color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 0.1rem', touchAction: 'none' }}>
            <GripVertical size={13} />
          </div>
        )}
        <input ref={renameInputRef} type="text" defaultValue={subTask.text}
          onKeyDown={e => {
            if (e.key === 'Enter') onSaveRename?.((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') onCancelRename?.();
          }}
          style={{ flex: 1, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '7px', padding: '0.3rem 0.55rem', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
        />
        <button onClick={e => { const inp = (e.currentTarget.previousElementSibling as HTMLInputElement); onSaveRename?.(inp.value); }}
          style={{ background: '#3b82f6', border: 'none', borderRadius: '6px', padding: '0.28rem 0.6rem', color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>Save</button>
        <button onClick={onCancelRename} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}><X size={13} /></button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.35rem', position: 'relative', overflow: 'hidden' }}>
      {swipeReveal === 'right' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', paddingLeft: '1rem', zIndex: 1, pointerEvents: 'none' }}>
          <Check size={18} color="#10b981" strokeWidth={3} />
        </div>
      )}
      {swipeReveal === 'left' && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.18)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '1rem', gap: '0.5rem', zIndex: 1, pointerEvents: 'none' }}>
          <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>Swipe to options</span>
          <Trash2 size={15} color="#ef4444" />
        </div>
      )}
      <div
        className={`subtask-item ${subTask.status === 'completed' ? 'completed' : ''}`}
        style={{ alignItems: 'center', position: 'relative', zIndex: 2 }}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { handleTouchEndSwipe(); handleTouchEnd(); }}
      >
        {isEditMode && (
          <div onPointerDown={onDragStart} style={{ cursor: 'grab', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', padding: '0 0.2rem', flexShrink: 0, touchAction: 'none' }}>
            <GripVertical size={14} />
          </div>
        )}

        {!isEditMode && lectureIndex != null && (
          <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.35rem', borderRadius: '5px', flexShrink: 0, minWidth: '22px', textAlign: 'center' }}>#{lectureIndex + 1}</span>
        )}

        {isEditMode ? (
          <button onClick={() => toggleBulkDelete(subTask.id)}
            style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, border: `2px solid ${isSelected ? '#ef4444' : 'rgba(255,255,255,0.18)'}`, background: isSelected ? '#ef4444' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {isSelected && <Check size={11} color="#fff" strokeWidth={3} />}
          </button>
        ) : (
          <button className={`todo-checkbox ${subTask.status === 'completed' ? 'checked' : ''}`}
            onClick={() => toggleSubTask(topicId, subTask.id)}
            role="checkbox" aria-checked={subTask.status === 'completed'} style={{ flexShrink: 0 }}>
            {subTask.status === 'completed' && <Check size={13} strokeWidth={3} />}
          </button>
        )}

        {videoId && (
          <div style={{ flexShrink: 0, width: '40px', height: '27px', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
            onClick={() => onPlayVideo(videoId, subTask.id, topicId)}>
            <img src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: subTask.status === 'completed' ? 0.35 : 0.85, transition: 'opacity 200ms' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px' }}>
                <Play size={8} fill="white" color="white" />
              </div>
            </div>
          </div>
        )}

        <span className="todo-text" style={{ flex: 1 }}>{subTask.text}</span>

        {(subTask as any).needsReview && !isEditMode && (
          <span title="Flagged for review in AI chat" style={{ fontSize: '0.65rem', flexShrink: 0, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: '99px', padding: '0.05rem 0.32rem', color: '#fbbf24', fontWeight: 700 }}>🚩 review</span>
        )}

        {subTask.pinned && !isEditMode && (
          <span title="Pinned" style={{ fontSize: '0.75rem', flexShrink: 0 }}>⭐</span>
        )}

        {videoId && !isEditMode && subTask.status !== 'completed' && (() => {
          try {
            const s = Number(localStorage.getItem(TS_KEY(videoId)) || '0');
            if (s > 5) {
              const m = Math.floor(s / 60);
              const sec = String(s % 60).padStart(2, '0');
              return <span style={{ fontSize: '0.55rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '0.08rem 0.35rem', borderRadius: '5px', flexShrink: 0, fontWeight: 600 }}>{m}:{sec}</span>;
            }
          } catch {}
          return null;
        })()}

        <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
          {!isEditMode && (
            <>
              {videoId && (
                <button onClick={() => onPlayVideo(videoId, subTask.id, topicId)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.22rem', padding: '0.22rem 0.5rem', borderRadius: '7px', background: subTask.status === 'completed' ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.32)', color: subTask.status === 'completed' ? 'rgba(239,68,68,0.45)' : '#ef4444', cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, minHeight: '28px' }}>
                  <Play size={10} fill="currentColor" /> Watch
                </button>
              )}
              <button onClick={() => onTogglePin(topicId, subTask.id)} title={subTask.pinned ? 'Unpin' : 'Pin'}
                style={{ display: 'flex', alignItems: 'center', padding: '0.2rem', borderRadius: '5px', background: 'none', border: 'none', color: subTask.pinned ? '#f59e0b' : 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '0.75rem' }}>⭐</button>
              <button className="btn-icon" onClick={() => openNotesModal(topicId, subTask.id)}
                style={{ color: subTask.notes ? 'var(--text-primary)' : 'var(--text-muted)' }} title="Notes">
                <FileText size={12} />
              </button>
              <button className="todo-delete" onClick={() => deleteSubTask(topicId, subTask.id)} aria-label="Delete">
                <Trash2 size={12} />
              </button>
            </>
          )}

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

// ── AddVideoPanel ─────────────────────────────────────────────────────────────

export const AddVideoPanel = ({ topicId, onAdd }: any) => {
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
        <div style={{ borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', aspectRatio: '16/9', maxHeight: '120px', position: 'relative' }}>
          <img src={`https://img.youtube.com/vi/${previewId}/mqdefault.jpg`} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={14} fill="white" color="white" />
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

export const MergePanel = ({ state, setState, onFetch, onMerge }: any) => {
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
          {state.loading ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />{state._loadingMsg || '…'}</> : 'Fetch'}
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

          <div
            onWheel={e => e.stopPropagation()}
            style={{
              maxHeight: '400px',
              height: filtered.length > 4 ? '400px' : 'auto',
              overflowY: filtered.length > 4 ? 'scroll' : 'visible',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              paddingRight: filtered.length > 4 ? '4px' : '0',
              touchAction: 'pan-y',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(99,102,241,0.5) rgba(255,255,255,0.05)',
            }}
          >
            {filtered.map((v: MergeVideo) => {
              const isSelected = state.selected?.has(v.id);
              return (
                <div key={v.id} onClick={() => toggleVideo(v.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem', borderRadius: '8px', background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSelected ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', transition: 'background 150ms ease', flexShrink: 0 }}>
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

// ── TopicBody ─────────────────────────────────────────────────────────────────

export const TopicBody = React.memo(({
  topic, expandedCategories, toggleCategory, toggleSubTask, openNotesModal, deleteSubTask,
  handleAddSubTask, newSubtaskText, setNewSubtaskText, onPlayVideo,
  isEditMode, onToggleEdit,
  addVideoState, setAddVideoState, onAddSingleVideo,
  mergePanelState, setMergePanelState, onFetchMerge, onMergeSelected,
  renamingSubtask, onStartRename, onSaveRename, onCancelRename,
  instantDeleteSubTask, bulkDeleteState, toggleBulkDelete, handleBulkDelete,
  onSubTaskReorder, onTogglePin,
}: any) => {
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
      {isEditMode && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', margin: '0 0 0.75rem', borderRadius: '10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 600 }}>✏️ Edit — drag to reorder · click red checkbox to select · ✏ to rename</span>
          <button onClick={onToggleEdit} style={{ fontSize: '0.68rem', color: '#60a5fa', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', padding: '0.2rem 0.55rem', cursor: 'pointer', fontWeight: 600 }}>Done</button>
        </div>
      )}

      {isEditMode ? (
        <ReorderList
          items={flatSubTasks}
          onReorder={(from, to) => onSubTaskReorder(topic.id, from, to)}
          renderItem={(st: LearningSubTask, index: number, _: boolean, startDrag: (e: React.PointerEvent) => void) => (
            <SubTaskItem
              subTask={st} topicId={topic.id}
              isEditMode={true}
              onDragStart={startDrag}
              lectureIndex={index}
              isRenaming={renamingSubtask?.topicId === topic.id && renamingSubtask?.subtaskId === st.id}
              toggleSubTask={toggleSubTask} openNotesModal={openNotesModal}
              deleteSubTask={deleteSubTask} instantDeleteSubTask={instantDeleteSubTask}
              onPlayVideo={onPlayVideo} onTogglePin={onTogglePin}
              bulkDeleteSelected={bulkDeleteState} toggleBulkDelete={toggleBulkDelete}
              onStartRename={onStartRename} onSaveRename={onSaveRename} onCancelRename={onCancelRename}
            />
          )}
        />
      ) : (
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
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{catSubTasks.filter(s => s.status === 'completed').length}/{catSubTasks.length}</span>
                    {isCatExpanded ? <ChevronDown size={12} color="var(--text-muted)" /> : <ChevronRight size={12} color="var(--text-muted)" />}
                  </div>
                )}

                {isCatExpanded && catSubTasks.map((st: LearningSubTask, catIdx: number) => {
                  const globalIdx = flatSubTasks.findIndex((s: LearningSubTask) => s.id === st.id);
                  return (
                    <SubTaskItem key={st.id} subTask={st} topicId={topic.id}
                      lectureIndex={globalIdx >= 0 ? globalIdx : catIdx}
                      toggleSubTask={toggleSubTask} openNotesModal={openNotesModal}
                      deleteSubTask={deleteSubTask} instantDeleteSubTask={instantDeleteSubTask}
                      onPlayVideo={onPlayVideo} onTogglePin={onTogglePin}
                      bulkDeleteSelected={bulkDeleteState} toggleBulkDelete={toggleBulkDelete}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

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
