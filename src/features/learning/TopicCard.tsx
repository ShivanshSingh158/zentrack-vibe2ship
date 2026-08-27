import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Play, Check, Clock, Pin, Plus, Trash2,
  Calendar, Edit3, MoreVertical, Sparkles, BookOpen, ExternalLink, X,
  GraduationCap, Layers, ArrowRight, Star
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
  viewMode?: 'grid' | 'list';
  index?: number;
}

const THEME_PALETTES = [
  {
    name: 'emerald',
    accent: '#5eda9e',
    badgeBg: 'rgba(94, 218, 158, 0.12)',
    badgeText: '#5eda9e',
    glow: 'rgba(94, 218, 158, 0.18)',
    border: 'rgba(94, 218, 158, 0.25)',
    grad: 'linear-gradient(90deg, #5eda9e, #38bdf8)',
  },
  {
    name: 'purple',
    accent: '#a599ff',
    badgeBg: 'rgba(165, 153, 255, 0.12)',
    badgeText: '#a599ff',
    glow: 'rgba(165, 153, 255, 0.18)',
    border: 'rgba(165, 153, 255, 0.25)',
    grad: 'linear-gradient(90deg, #a599ff, #f43f5e)',
  },
  {
    name: 'cyan',
    accent: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.12)',
    badgeText: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.18)',
    border: 'rgba(56, 189, 248, 0.25)',
    grad: 'linear-gradient(90deg, #38bdf8, #818cf8)',
  },
  {
    name: 'amber',
    accent: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.12)',
    badgeText: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.18)',
    border: 'rgba(245, 158, 11, 0.25)',
    grad: 'linear-gradient(90deg, #f59e0b, #ef4444)',
  },
  {
    name: 'rose',
    accent: '#f43f5e',
    badgeBg: 'rgba(244, 63, 94, 0.12)',
    badgeText: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.18)',
    border: 'rgba(244, 63, 94, 0.25)',
    grad: 'linear-gradient(90deg, #f43f5e, #a855f7)',
  },
];

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
  viewMode = 'grid',
  index = 0,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEstHours, setNewEstHours] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(25);
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

  // Theme palette based on index
  const theme = useMemo(() => {
    return THEME_PALETTES[index % THEME_PALETTES.length];
  }, [index]);

  // Next uncompleted lecture
  const nextUncompletedSubtask = useMemo(() => {
    return subTasks.find(s => !s.isCompleted);
  }, [subTasks]);

  const nextVideoId = useMemo(() => {
    if (!nextUncompletedSubtask?.url) return null;
    return extractYoutubeId(nextUncompletedSubtask.url);
  }, [nextUncompletedSubtask]);

  // Ref for the inner lecture list — used for native scroll isolation
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stackRef.current;
    if (!el || !isExpanded) return;

    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;

      if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollTop += e.deltaY;
      }
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

  const isGrid = viewMode === 'grid';

  return (
    <div
      className={`lp-topic-card ${isGrid ? 'lp-grid-card' : 'lp-list-card'} ${isExpanded ? 'expanded' : ''}`}
      style={{
        ['--lp-accent-color' as any]: theme.accent,
        ['--lp-accent-glow' as any]: theme.glow,
        ['--lp-accent-border' as any]: theme.border,
        ['--lp-accent-grad' as any]: theme.grad,
      }}
    >
      {/* ── Topic Card Header ── */}
      <div className="lp-topic-card-header">
        {/* Title and Action/Chevron Row */}
        <div className="lp-card-title-row">
          <div className="lp-topic-title-container">
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
              <h3
                className="lp-topic-hero-title"
                title={topic.title}
                onClick={onToggleExpand}
              >
                {topic.title}
              </h3>
            )}
          </div>

          <div className="lp-card-header-actions">
            <button
              type="button"
              className="lp-card-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
                setEditedTitle(topic.title);
              }}
              title="Edit Title"
            >
              <Edit3 size={13} />
            </button>

            <button
              type="button"
              className="lp-card-icon-btn delete"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete "${topic.title}" and all its lectures?`)) {
                  onDeleteTopic(topic.id!);
                }
              }}
              title="Delete Topic"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Course Progress & Metadata Row */}
        <div className="lp-card-meta-line" onClick={onToggleExpand}>
          <span className="lp-meta-pct" style={{ color: theme.accent }}>
            {Math.round(progressPct)}% completed
          </span>
          <span className="lp-meta-separator">·</span>
          <span className="lp-meta-count">
            {completedCount}/{totalCount} lectures
          </span>
          {remainingHoursText && (
            <span className="lp-meta-time">, {remainingHoursText}</span>
          )}
        </div>

        {/* Subtle Progress Bar */}
        <div className="lp-card-progress-track" onClick={onToggleExpand}>
          <div
            className="lp-card-progress-bar"
            style={{ width: `${progressPct}%`, background: theme.accent }}
          />
        </div>

        {/* Clean Action CTA Row: Resume / Start Learning + Add Lecture */}
        <div className="lp-card-footer-actions">
          <button
            type="button"
            className="lp-card-resume-btn"
            style={{ background: theme.accent }}
            onClick={(e) => {
              e.stopPropagation();
              if (nextUncompletedSubtask) {
                if (nextVideoId) {
                  onPlayVideo(nextVideoId, nextUncompletedSubtask.id, topic.id!, nextUncompletedSubtask.title);
                } else {
                  if (!isExpanded) onToggleExpand();
                }
              } else {
                if (!isExpanded) onToggleExpand();
              }
            }}
          >
            <Play size={13} fill="#000000" color="#000000" />
            <span>{progressPct === 0 ? 'Start Learning' : progressPct === 100 ? 'Review' : 'Resume'}</span>
          </button>

          <div className="lp-footer-right-actions">
            <button
              type="button"
              className="lp-card-expand-toggle-btn"
              onClick={onToggleExpand}
            >
              <span>{isExpanded ? 'Hide' : `${totalCount} lectures`}</span>
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            <button
              type="button"
              className="lp-add-lecture-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (!isExpanded) onToggleExpand();
                setShowAddForm(prev => !prev);
              }}
              title="Add Lecture"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
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
                  placeholder="Lecture title..."
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
                  placeholder="Est. Hours"
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
              {displayedSubtasks.map((sub, idx) => {
                const videoId = extractYoutubeId(sub.url || '');
                const isRenaming = renamingSubtaskId === sub.id;
                const lectureTitle = sub.title || (sub as any).text || (sub as any).name || (sub as any).label || 'Lecture';

                return (
                  <div
                    key={sub.id}
                    className={`lp-lecture-row ${sub.isCompleted ? 'completed' : ''} ${sub.pinned ? 'pinned' : ''}`}
                  >
                    {/* Left: Index + Checkbox + Single Line Title */}
                    <div className="lp-row-left">
                      <span className="lp-row-index">{idx + 1}.</span>

                      <button
                        type="button"
                        className={`lp-row-checkbox ${sub.isCompleted ? 'checked' : ''}`}
                        onClick={() => onToggleSubtask(topic.id!, sub.id)}
                        title={sub.isCompleted ? 'Mark uncompleted' : 'Mark completed (+25 XP)'}
                      >
                        {sub.isCompleted && <Check size={10} strokeWidth={3.5} />}
                      </button>

                      {isRenaming ? (
                        <div className="lp-row-rename-box" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            className="lp-row-rename-input"
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
                        <span
                          className={`lp-row-title ${sub.isCompleted ? 'completed-text' : ''}`}
                          title={lectureTitle}
                          onClick={() => {
                            if (videoId) {
                              onPlayVideo(videoId, sub.id, topic.id!, lectureTitle);
                            } else {
                              onToggleSubtask(topic.id!, sub.id);
                            }
                          }}
                        >
                          {lectureTitle}
                        </span>
                      )}
                    </div>

                    {/* Right: Badges + Hover Actions */}
                    <div className="lp-row-right">
                      {/* Video Play Button Pill */}
                      {videoId && (
                        <button
                          type="button"
                          className="lp-row-video-pill"
                          onClick={() => onPlayVideo(videoId, sub.id, topic.id!, lectureTitle)}
                          title="Watch in Lecture Theater"
                        >
                          <Play size={9} fill="currentColor" />
                          <span>Video</span>
                        </button>
                      )}

                      {/* Duration Chip */}
                      {sub.estimatedHours && sub.estimatedHours > 0 && (
                        <span className="lp-row-duration-chip">
                          <Clock size={10} />
                          <span>
                            {sub.estimatedHours >= 1
                              ? `${sub.estimatedHours}h`
                              : `${Math.round(sub.estimatedHours * 60)}m`}
                          </span>
                        </span>
                      )}

                      {/* Hover Action Cluster */}
                      <div className="lp-row-actions">
                        <button
                          type="button"
                          className={`lp-row-action-btn pin ${sub.pinned ? 'is-pinned' : ''}`}
                          onClick={() => onTogglePin(topic.id!, sub.id)}
                          title={sub.pinned ? 'Unpin Lecture' : 'Pin Lecture'}
                        >
                          <Star size={11} fill={sub.pinned ? '#ff9f4d' : 'none'} color={sub.pinned ? '#ff9f4d' : '#8e8e93'} />
                        </button>

                        <button
                          type="button"
                          className="lp-row-action-btn schedule"
                          onClick={() => onOpenSchedule(topic, sub)}
                          title="Schedule to Calendar"
                        >
                          <Calendar size={11} />
                        </button>

                        <button
                          type="button"
                          className="lp-row-action-btn edit"
                          onClick={() => {
                            setRenamingSubtaskId(sub.id);
                            setSubtaskTitleDraft(lectureTitle);
                          }}
                          title="Rename Lecture"
                        >
                          <Edit3 size={11} />
                        </button>

                        <button
                          type="button"
                          className="lp-row-action-btn delete"
                          onClick={() => onDeleteSubtask(topic.id!, sub.id)}
                          title="Delete Lecture"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Show more lectures if limit reached */}
              {sortedSubtasks.length > visibleLimit && (
                <button
                  type="button"
                  className="lp-show-more-btn"
                  onClick={() => setVisibleLimit(prev => prev + 25)}
                >
                  Show more ({sortedSubtasks.length - visibleLimit} remaining)...
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
