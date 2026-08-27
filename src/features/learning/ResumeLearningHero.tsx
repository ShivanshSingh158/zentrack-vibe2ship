import React from 'react';
import { Play, Calendar, Star, Clock, Sparkles, BookOpen, CheckCircle2 } from 'lucide-react';
import type { LearningTopic, LearningSubTask } from '../../types';
import { extractYoutubeId, formatDuration } from './learningHelpers';

interface ResumeLearningHeroProps {
  topics: LearningTopic[];
  onPlayVideo: (videoId: string, subtaskId: string, topicId: string, subtaskTitle: string) => void;
  onOpenSchedule: (topic: LearningTopic, subtask: LearningSubTask) => void;
  onToggleExpand: (topicId: string) => void;
}

export const ResumeLearningHero: React.FC<ResumeLearningHeroProps> = ({
  topics,
  onPlayVideo,
  onOpenSchedule,
  onToggleExpand,
}) => {
  // Find the highest priority next lecture to resume:
  // 1. Pinned uncompleted subtask in most recently studied topic
  // 2. First uncompleted subtask in most recently studied topic
  // 3. First uncompleted subtask across any topic
  const resumeTarget = React.useMemo(() => {
    // Sort topics by lastStudiedAt desc, then order
    const sortedTopics = [...topics].sort((a, b) => {
      const aTime = a.lastStudiedAt || a.createdAt || 0;
      const bTime = b.lastStudiedAt || b.createdAt || 0;
      return bTime - aTime;
    });

    for (const topic of sortedTopics) {
      const subtasks = topic.subTasks || [];
      const pinnedUncompleted = subtasks.find(s => s.pinned && !s.isCompleted);
      if (pinnedUncompleted) {
        return { topic, subtask: pinnedUncompleted };
      }
    }

    for (const topic of sortedTopics) {
      const subtasks = topic.subTasks || [];
      const firstUncompleted = subtasks.find(s => !s.isCompleted);
      if (firstUncompleted) {
        return { topic, subtask: firstUncompleted };
      }
    }

    return null;
  }, [topics]);

  if (!resumeTarget) return null;

  const { topic, subtask } = resumeTarget;
  const videoId = extractYoutubeId(subtask.url || '');
  const completedCount = (topic.subTasks || []).filter(s => s.isCompleted).length;
  const totalCount = (topic.subTasks || []).length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="resume-hero-banner">
      <div className="resume-hero-glow-backdrop" />
      
      <div className="resume-hero-left">
        <div
          className="resume-play-orb"
          onClick={() => {
            if (videoId) {
              onPlayVideo(videoId, subtask.id, topic.id!, subtask.title);
            } else {
              onToggleExpand(topic.id!);
            }
          }}
          title="Resume Lecture"
        >
          <Play size={18} fill="#000000" color="#000000" />
        </div>

        <div className="resume-hero-info">
          <div className="resume-hero-tags">
            <span className="resume-tag-badge topic-name">
              <BookOpen size={11} />
              <span>{topic.title}</span>
            </span>
            <span className="resume-tag-badge progress-badge">
              {pct}% Completed ({completedCount}/{totalCount})
            </span>
            {subtask.pinned && (
              <span className="resume-tag-badge pinned-badge">
                <Star size={10} fill="#ff9f4d" color="#ff9f4d" />
                <span>Pinned</span>
              </span>
            )}
          </div>

          <h3 className="resume-lecture-title" title={subtask.title}>
            {subtask.title}
          </h3>

          <div className="resume-lecture-meta">
            {subtask.estimatedHours && subtask.estimatedHours > 0 && (
              <span className="resume-meta-chip">
                <Clock size={11} />
                <span>{subtask.estimatedHours >= 1 ? `${subtask.estimatedHours}h` : `${Math.round(subtask.estimatedHours * 60)}m`} est.</span>
              </span>
            )}
            {subtask.url && (
              <span className="resume-meta-chip video-chip">
                <Play size={10} fill="currentColor" />
                <span>YouTube Lecture</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="resume-hero-right">
        <button
          type="button"
          className="resume-schedule-btn"
          onClick={() => onOpenSchedule(topic, subtask)}
          title="Schedule study session on calendar"
        >
          <Calendar size={13} />
          <span>Schedule</span>
        </button>

        <button
          type="button"
          className="resume-primary-cta-btn"
          onClick={() => {
            if (videoId) {
              onPlayVideo(videoId, subtask.id, topic.id!, subtask.title);
            } else {
              onToggleExpand(topic.id!);
            }
          }}
        >
          <Play size={14} fill="#000000" color="#000000" />
          <span>Resume Lecture</span>
        </button>
      </div>
    </div>
  );
};
