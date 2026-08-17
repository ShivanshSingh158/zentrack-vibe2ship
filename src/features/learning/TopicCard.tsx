import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Play, Check, Clock, Pin, Plus, Trash2,
  Calendar, Edit3, MoreVertical, Sparkles, BookOpen, ExternalLink, X
} from 'lucide-react';
import type { LearningTopic, LearningSubTask } from '../../types';
import { extractYoutubeId, formatDuration } from './learningHelpers';

interface TopicCardProps {
  topic: LearningTopic;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleSubtask: (topicId: string, subtaskId: string) => void;
  onTogglePin: (topicId: string, subtaskId: string) => void;
  onDeleteSubtask: (topicId: string, subtaskId: string) => void;
  onPlayVideo: (videoId: string, subtaskId: string, topicId: string, subtaskTitle: string) => void;
  onOpenSchedule: (topic: LearningTopic, subtask: LearningSubTask) => void;
  onAddSubtask: (topicId: string, title: string, url?: string, estimatedHours?: number) => void;
  onDeleteTopic: (topicId: string) => void;
  onEditTopicTitle: (topicId: string, newTitle: string) => void;
  onEditSubtaskTitle: (topicId: string, subtaskId: string, newTitle: string) => void;
}

export const TopicCard: React.FC<TopicCardProps> = ({
  topic,
  isExpanded,
  onToggleExpand,
  onToggleSubtask,
  onTogglePin,
  onDeleteSubtask,
  onPlayVideo,
  onOpenSchedule,
  onAddSubtask,
  onDeleteTopic,
  onEditTopicTitle,
  onEditSubtaskTitle,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEstHours, setNewEstHours] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(15);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(topic.title);
  const [showMenu, setShowMenu] = useState(false);

  // Subtask rename state
  const [renamingSubtaskId, setRenamingSubtaskId] = useState<string | null>(null);
  const [subtaskTitleDraft, setSubtaskTitleDraft] = useState('');

  const subTasks = useMemo(() => topic.subTasks || [], [topic.subTasks]);
  const completedCount = subTasks.filter(s => s.isCompleted).length;
  const totalCount = subTasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Ref for the inner lecture list — used for native scroll isolation
  const stackRef = useRef<HTMLDivElement>(null);

  // Native non-passive wheel handler: physically blocks outer page scroll
  // when the inner list can still scroll in the wheel direction.
  // React's synthetic onWheel cannot do this — it is always passive.
  useEffect(() => {
    const el = stackRef.current;
    if (!el || !isExpanded) return;

    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;

      if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
        // Inner list can absorb scroll — prevent outer page from receiving it
        e.preventDefault();
        el.scrollTop += e.deltaY;
      }
      // If at boundary, do nothing — outer scroll happens naturally
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isExpanded]);

  // Calculate remaining estimated hours
  const remainingHoursText = useMemo(() => {
    let totalH = 0;
    subTasks.forEach(s => {
      if (!s.isCompleted && s.estimatedHours && s.estimatedHours > 0) {
        totalH += s.estimatedHours;
      }
    });

    if (totalH > 0) {
      const h = Math.floor(totalH);
      const m = Math.round((totalH - h) * 60);
      if (h > 0 && m > 0) return `${h}h ${m}m left`;
      if (h > 0) return `${h}h left`;
      return `${m}m left`;
    }
    return '';
  }, [subTasks]);

  // Sort subtasks (pinned first, then original order)
  const sortedSubtasks = useMemo(() => {
    const list = [...subTasks];
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
  }, [subTasks]);

  const displayedSubtasks = sortedSubtasks.slice(0, visibleLimit);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const est = newEstHours ? parseFloat(newEstHours) : undefined;
    onAddSubtask(topic.id!, newTitle.trim(), newUrl.trim() || undefined, est);
    setNewTitle('');
    setNewUrl('');
    setNewEstHours('');
    setShowAddForm(false);
  };

  const handleSaveTopicTitle = () => {
    if (editedTitle.trim() && editedTitle !== topic.title) {
      onEditTopicTitle(topic.id!, editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleSaveSubtaskTitle = (subtaskId: string) => {
    if (subtaskTitleDraft.trim()) {
      onEditSubtaskTitle(topic.id!, subtaskId, subtaskTitleDraft.trim());
    }
    setRenamingSubtaskId(null);
  };

  return (
    <div className="lp-topic-card">
      {/* ── Topic Card Header ── */}
      <div className="lp-topic-card-header">
        <div className="lp-topic-header-main" onClick={onToggleExpand}>
          <button type="button" className="lp-expand-chevron-btn" title={isExpanded ? 'Collapse' : 'Expand'}>
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          <div className="lp-topic-title-block">
            {isEditingTitle ? (
              <div className="lp-title-edit-wrap" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  className="lp-topic-title-input"
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveTopicTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  autoFocus
                />
                <button type="button" className="lp-btn-primary-xs" onClick={handleSaveTopicTitle}>
                  Save
                </button>
              </div>
            ) : (
              <h3 className="lp-topic-hero-title">{topic.title}</h3>
            )}

            <div className="lp-topic-meta-row">
              <span className="lp-progress-pct-badge">{progressPct.toFixed(0)}% Completed</span>
              <span className="lp-meta-separator">·</span>
              <span className="lp-tasks-count-badge">
                {completedCount}/{totalCount} Lectures
              </span>
              {remainingHoursText && (
                <>
                  <span className="lp-meta-separator">·</span>
                  <span className="lp-time-left-badge">⏱ {remainingHoursText}</span>
                </>
              )}
            </div>
          </div>

          {/* Circular Progress Ring Mini Badge */}
          <div className="lp-topic-progress-ring-wrap" title={`${progressPct.toFixed(0)}% completed`}>
            <svg className="lp-mini-progress-svg" viewBox="0 0 36 36">
              <circle
                className="lp-progress-bg-circle"
                cx="18"
                cy="18"
                r="15"
                strokeWidth="3"
              />
              <circle
                className="lp-progress-fill-circle"
                cx="18"
                cy="18"
                r="15"
                strokeWidth="3"
                strokeDasharray={`${(progressPct / 100) * 94.2} 94.2`}
              />
            </svg>
            <span className="lp-progress-ring-text">{progressPct.toFixed(0)}%</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="lp-topic-header-actions">
          <button
            type="button"
            className="lp-add-subtask-quick-btn"
            onClick={() => {
              if (!isExpanded) onToggleExpand();
              setShowAddForm(prev => !prev);
            }}
            title="Add Lecture / Task"
          >
            <Plus size={14} />
            <span>Add Lecture</span>
          </button>

          <div className="lp-menu-wrap">
            <button
              type="button"
              className="lp-topic-menu-btn"
              onClick={() => setShowMenu(prev => !prev)}
            >
              <MoreVertical size={16} />
            </button>

            {showMenu && (
              <div className="lp-dropdown-menu" onClick={() => setShowMenu(false)}>
                <button
                  type="button"
                  className="lp-dropdown-item"
                  onClick={() => {
                    setEditedTitle(topic.title);
                    setIsEditingTitle(true);
                  }}
                >
                  <Edit3 size={13} /> Rename Topic
                </button>
                <button
                  type="button"
                  className="lp-dropdown-item danger"
                  onClick={() => onDeleteTopic(topic.id!)}
                >
                  <Trash2 size={13} /> Delete Topic
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Progress Bar Rail ── */}
      <div className="lp-topic-progress-bar">
        <div
          className="lp-topic-progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ── Expandable Body: Subtasks & Lectures ── */}
      {isExpanded && (
        <div className="lp-topic-body">
          {/* Quick Add Subtask Form */}
          {showAddForm && (
            <form className="lp-inline-add-form" onSubmit={handleAddSubmit}>
              <div className="lp-inline-form-row">
                <input
                  type="text"
                  className="lp-text-input flex-2"
                  placeholder="Lecture or task title..."
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  autoFocus
                  required
                />
                <input
                  type="url"
                  className="lp-text-input flex-2"
                  placeholder="YouTube URL (optional)"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                />
                <input
                  type="number"
                  step="0.1"
                  className="lp-text-input flex-1"
                  placeholder="Est. Hours (e.g. 0.5)"
                  value={newEstHours}
                  onChange={e => setNewEstHours(e.target.value)}
                />
                <button type="submit" className="lp-btn-primary-sm">
                  Add
                </button>
                <button
                  type="button"
                  className="lp-btn-cancel-sm"
                  onClick={() => setShowAddForm(false)}
                >
                  <X size={14} />
                </button>
              </div>
            </form>
          )}

          {/* Subtasks List */}
          {subTasks.length === 0 ? (
            <div className="lp-topic-empty-subtasks">
              <p>No lectures in this topic yet.</p>
              <button
                type="button"
                className="lp-btn-secondary-sm"
                onClick={() => setShowAddForm(true)}
              >
                <Plus size={13} /> Add First Lecture
              </button>
            </div>
          ) : (
            <div className="lp-subtasks-stack" ref={stackRef}>
              {displayedSubtasks.map(sub => {
                const videoId = extractYoutubeId(sub.url || '');
                const isRenaming = renamingSubtaskId === sub.id;

                return (
                  <div
                    key={sub.id}
                    className={`lp-subtask-row ${sub.isCompleted ? 'completed' : ''} ${sub.pinned ? 'pinned' : ''}`}
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      className={`lp-subtask-checkbox ${sub.isCompleted ? 'checked' : ''}`}
                      onClick={() => onToggleSubtask(topic.id!, sub.id)}
                      title={sub.isCompleted ? 'Mark uncompleted' : 'Mark completed (+25 XP)'}
                    >
                      {sub.isCompleted && <Check size={12} strokeWidth={3} />}
                    </button>

                    {/* Main Content */}
                    <div className="lp-subtask-content">
                      {isRenaming ? (
                        <div className="lp-subtask-rename-row">
                          <input
                            type="text"
                            className="lp-text-input"
                            value={subtaskTitleDraft}
                            onChange={e => setSubtaskTitleDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveSubtaskTitle(sub.id);
                              if (e.key === 'Escape') setRenamingSubtaskId(null);
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="lp-btn-primary-xs"
                            onClick={() => handleSaveSubtaskTitle(sub.id)}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="lp-subtask-title-row">
                          <span className={`lp-subtask-title ${sub.isCompleted ? 'completed-text' : ''}`}>
                            {sub.title || (sub as any).text}
                          </span>

                          {sub.pinned && (
                            <span className="lp-subtask-pinned-badge" title="Pinned to top">
                              <Pin size={10} /> PINNED
                            </span>
                          )}

                          {videoId && (
                            <span className="lp-video-badge" title="YouTube Lecture">
                              <Play size={10} /> VIDEO
                            </span>
                          )}

                          {sub.estimatedHours && sub.estimatedHours > 0 && (
                            <span className="lp-est-duration-badge">
                              <Clock size={10} /> {sub.estimatedHours}h
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Hover Actions */}
                    <div className="lp-subtask-actions">
                      {/* Play video in Theater */}
                      {videoId && (
                        <button
                          type="button"
                          className="lp-subtask-action-btn play"
                          onClick={() => onPlayVideo(videoId, sub.id, topic.id!, sub.title || (sub as any).text)}
                          title="Open in Lecture Theater"
                        >
                          <Play size={13} />
                          <span>Watch</span>
                        </button>
                      )}

                      {/* Schedule study session */}
                      <button
                        type="button"
                        className="lp-subtask-action-btn"
                        onClick={() => onOpenSchedule(topic, sub)}
                        title="Schedule on Calendar"
                      >
                        <Calendar size={13} />
                      </button>

                      {/* Pin toggle */}
                      <button
                        type="button"
                        className={`lp-subtask-action-btn ${sub.pinned ? 'active-pin' : ''}`}
                        onClick={() => onTogglePin(topic.id!, sub.id)}
                        title={sub.pinned ? 'Unpin lecture' : 'Pin to top'}
                      >
                        <Pin size={13} />
                      </button>

                      {/* Rename */}
                      <button
                        type="button"
                        className="lp-subtask-action-btn"
                        onClick={() => {
                          setSubtaskTitleDraft(sub.title || (sub as any).text);
                          setRenamingSubtaskId(sub.id);
                        }}
                        title="Rename lecture"
                      >
                        <Edit3 size={13} />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        className="lp-subtask-action-btn delete"
                        onClick={() => onDeleteSubtask(topic.id!, sub.id)}
                        title="Delete lecture"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Show more pagination */}
              {subTasks.length > visibleLimit && (
                <button
                  type="button"
                  className="lp-show-more-btn"
                  onClick={() => setVisibleLimit(prev => prev + 30)}
                >
                  Show More (+{Math.min(30, subTasks.length - visibleLimit)} lectures)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
