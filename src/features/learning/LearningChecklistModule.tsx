import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Sparkles, BookOpen, Link as LinkIcon, Eye, EyeOff,
  GraduationCap, RefreshCw, X, CheckCircle2, LayoutGrid, List
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { LearningTopic, LearningSubTask } from '../../types';
import { TopicCard } from './TopicCard';
import { LectureTheaterModal } from './LectureTheaterModal';
import { ScheduleStudyModal } from './ScheduleStudyModal';
import { PlaylistImportModal } from './PlaylistImportModal';
import { PredefinedRoadmapsModal } from './PredefinedRoadmapsModal';
import { CurriculumBuilderModal } from './CurriculumBuilderModal';
import { playPopSound } from '../../utils/sound';
import { toast } from 'sonner';
import { uniqueId } from './learningHelpers';

export function LearningChecklistModule() {
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('zentrack_learning_view_mode') as 'grid' | 'list') || 'grid';
  });

  const handleSetViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('zentrack_learning_view_mode', mode);
  };


  // Modal states
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');

  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showRoadmapsModal, setShowRoadmapsModal] = useState(false);
  const [showCurriculumBuilder, setShowCurriculumBuilder] = useState(false);

  // Active Schedule modal
  const [schedulingData, setSchedulingData] = useState<{ topic: LearningTopic; subtask: LearningSubTask } | null>(null);

  // Active Lecture Theater state
  const [theaterPlaying, setTheaterPlaying] = useState<{
    topicId: string;
    subtaskId: string;
    videoId: string;
    title: string;
    url?: string;
    notes?: string;
    isCompleted?: boolean;
    watchedCount: number;
  } | null>(null);

  // Firestore listener
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'learning_topics'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: LearningTopic[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loaded.push({
            id: docSnap.id,
            userId: data.userId,
            title: data.title || 'Untitled Topic',
            description: data.description || '',
            notes: data.notes || '',
            subTasks: data.subTasks || [],
            createdAt: data.createdAt || Date.now(),
            order: data.order ?? 0,
            lastStudiedAt: data.lastStudiedAt,
            timeSpentMinutes: data.timeSpentMinutes,
          });
        });

        // Sort by order or createdAt
        loaded.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setTopics(loaded);
        setLoading(false);

        // Auto-expand first topic if none expanded
        if (loaded.length > 0 && expandedTopics.size === 0) {
          setExpandedTopics(new Set([loaded[0].id!]));
        }
      },
      (err) => {
        console.error('Learning topics error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Listen for agent-open-lecture custom event
  useEffect(() => {
    const handler = (e: any) => {
      const { topicTitle, lectureTitle } = e.detail || {};
      if (!topicTitle && !lectureTitle) return;

      const matchedTopic = topics.find(
        t => t.title.toLowerCase().includes((topicTitle || '').toLowerCase())
      );
      if (matchedTopic) {
        setExpandedTopics(prev => new Set([...prev, matchedTopic.id!]));
        if (lectureTitle) {
          const matchedSub = matchedTopic.subTasks?.find(s =>
            (s.title || (s as any).text || '').toLowerCase().includes(lectureTitle.toLowerCase())
          );
          if (matchedSub && matchedSub.url) {
            const vidId = matchedSub.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1];
            if (vidId) {
              setTheaterPlaying({
                topicId: matchedTopic.id!,
                subtaskId: matchedSub.id,
                videoId: vidId,
                title: matchedSub.title,
                url: matchedSub.url,
                notes: matchedSub.notes,
                isCompleted: matchedSub.isCompleted,
                watchedCount: matchedTopic.subTasks.filter(s => s.isCompleted).length,
              });
            }
          }
        }
      }
    };

    window.addEventListener('agent-open-lecture', handler);
    return () => window.removeEventListener('agent-open-lecture', handler);
  }, [topics]);

  // Expand / Collapse toggles
  const handleToggleExpand = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  // Subtask completed toggle
  const handleToggleSubtask = async (topicId: string, subtaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const sub = topic.subTasks?.find(s => s.id === subtaskId);
    const willComplete = !sub?.isCompleted;

    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, isCompleted: willComplete } : s
    );

    try {
      await updateDoc(doc(db, 'learning_topics', topicId), {
        subTasks: updatedSubtasks,
        lastStudiedAt: Date.now(),
      });

      if (willComplete) {
        playPopSound();
        toast.success(`🎉 Completed "${sub?.title}"! (+25 XP)`);
      }
    } catch (err: any) {
      toast.error('Failed to update task: ' + err.message);
    }
  };

  // Pin subtask toggle
  const handleTogglePin = async (topicId: string, subtaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, pinned: !s.pinned, pinnedAt: !s.pinned ? Date.now() : undefined } : s
    );

    try {
      await updateDoc(doc(db, 'learning_topics', topicId), {
        subTasks: updatedSubtasks,
      });
    } catch (err: any) {
      toast.error('Failed to pin task: ' + err.message);
    }
  };

  // Delete subtask
  const handleDeleteSubtask = async (topicId: string, subtaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const updatedSubtasks = (topic.subTasks || []).filter(s => s.id !== subtaskId);
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), {
        subTasks: updatedSubtasks,
      });
      toast.success('Lecture removed');
    } catch (err: any) {
      toast.error('Failed to delete task: ' + err.message);
    }
  };

  // Add subtask to topic
  const handleAddSubtask = async (topicId: string, title: string, url?: string, estimatedHours?: number) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const newSub: LearningSubTask = {
      id: uniqueId(),
      title,
      url,
      isCompleted: false,
      estimatedHours,
      timeSpentMinutes: 0,
    };

    const updatedSubtasks = [...(topic.subTasks || []), newSub];
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), {
        subTasks: updatedSubtasks,
      });
      toast.success(`Added "${title}"`);
    } catch (err: any) {
      toast.error('Failed to add lecture: ' + err.message);
    }
  };

  // Edit topic title
  const handleEditTopicTitle = async (topicId: string, newTitle: string) => {
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), {
        title: newTitle,
      });
      toast.success('Topic renamed');
    } catch (err: any) {
      toast.error('Failed to rename topic');
    }
  };

  // Edit subtask title
  const handleEditSubtaskTitle = async (topicId: string, subtaskId: string, newTitle: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, title: newTitle } : s
    );

    try {
      await updateDoc(doc(db, 'learning_topics', topicId), {
        subTasks: updatedSubtasks,
      });
      toast.success('Lecture renamed');
    } catch (err: any) {
      toast.error('Failed to rename lecture');
    }
  };

  // Delete entire topic
  const handleDeleteTopic = async (topicId: string) => {
    if (!window.confirm('Are you sure you want to delete this entire learning topic?')) return;
    try {
      await deleteDoc(doc(db, 'learning_topics', topicId));
      toast.success('Topic deleted');
    } catch (err: any) {
      toast.error('Failed to delete topic');
    }
  };

  // Create new topic
  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
      const newDoc = await addDoc(collection(db, 'learning_topics'), {
        userId: user.uid,
        title: newTopicTitle.trim(),
        description: newTopicDesc.trim(),
        subTasks: [],
        createdAt: Date.now(),
        order: topics.length,
      });

      setExpandedTopics(prev => new Set([...prev, newDoc.id]));
      setNewTopicTitle('');
      setNewTopicDesc('');
      setShowAddTopicModal(false);
      toast.success('🎉 Created new learning topic!');
    } catch (err: any) {
      toast.error('Failed to create topic: ' + err.message);
    }
  };

  // Import Playlist handler
  const handleImportPlaylist = async (title: string, lectures: { title: string; url: string }[]) => {
    const user = auth.currentUser;
    if (!user) return;

    const subTasks: LearningSubTask[] = lectures.map(l => ({
      id: uniqueId(),
      title: l.title,
      url: l.url,
      isCompleted: false,
      timeSpentMinutes: 0,
    }));

    const newDoc = await addDoc(collection(db, 'learning_topics'), {
      userId: user.uid,
      title,
      description: `Imported playlist with ${lectures.length} lectures`,
      subTasks,
      createdAt: Date.now(),
      order: topics.length,
    });

    setExpandedTopics(prev => new Set([...prev, newDoc.id]));
  };

  // Import Predefined Roadmap handler
  const handleImportRoadmap = async (title: string, lectures: { title: string; url: string; category?: string }[]) => {
    const user = auth.currentUser;
    if (!user) return;

    const subTasks: LearningSubTask[] = lectures.map(l => ({
      id: uniqueId(),
      title: l.title,
      url: l.url,
      category: l.category,
      isCompleted: false,
      timeSpentMinutes: 0,
    }));

    const newDoc = await addDoc(collection(db, 'learning_topics'), {
      userId: user.uid,
      title,
      description: `Curated learning path (${lectures.length} steps)`,
      subTasks,
      createdAt: Date.now(),
      order: topics.length,
    });

    setExpandedTopics(prev => new Set([...prev, newDoc.id]));
  };

  // Publish from Curriculum Builder modal
  const handlePublishCurriculum = async (drafts: any[]) => {
    const user = auth.currentUser;
    if (!user || drafts.length === 0) return;

    const batch = writeBatch(db);
    let orderIndex = topics.length;

    drafts.forEach(d => {
      const newRef = doc(collection(db, 'learning_topics'));
      const subTasks: LearningSubTask[] = (d.videos || []).map((v: any) => ({
        id: uniqueId(),
        title: v.title,
        url: v.url,
        isCompleted: false,
        timeSpentMinutes: 0,
      }));

      batch.set(newRef, {
        userId: user.uid,
        title: d.title,
        description: 'AI Generated Curriculum Module',
        subTasks,
        createdAt: Date.now(),
        order: orderIndex++,
      });
    });

    await batch.commit();
    setShowCurriculumBuilder(false);
    toast.success(`🎉 Published ${drafts.length} topics to your Learning path!`);
  };

  // Play video in Theater
  const handlePlayVideo = (videoId: string, subtaskId: string, topicId: string, subtaskTitle: string) => {
    const topic = topics.find(t => t.id === topicId);
    const sub = topic?.subTasks?.find(s => s.id === subtaskId);

    setTheaterPlaying({
      topicId,
      subtaskId,
      videoId,
      title: subtaskTitle,
      url: sub?.url,
      notes: sub?.notes,
      isCompleted: sub?.isCompleted,
      watchedCount: topic?.subTasks?.filter(s => s.isCompleted).length || 0,
    });
  };

  // Save Video Note from Theater
  const handleSaveVideoNote = async (topicId: string, subtaskId: string, note: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const updatedSubtasks = (topic.subTasks || []).map(s =>
      s.id === subtaskId ? { ...s, notes: note } : s
    );

    try {
      await updateDoc(doc(db, 'learning_topics', topicId), {
        subTasks: updatedSubtasks,
      });
      if (theaterPlaying && theaterPlaying.subtaskId === subtaskId) {
        setTheaterPlaying(prev => (prev ? { ...prev, notes: note } : null));
      }
    } catch (err: any) {
      console.error('Save note error:', err);
    }
  };

  // Navigate video in Theater
  const handleTheaterNavigate = (delta: number) => {
    if (!theaterPlaying) return;
    const topic = topics.find(t => t.id === theaterPlaying.topicId);
    if (!topic || !topic.subTasks) return;

    const currentIndex = topic.subTasks.findIndex(s => s.id === theaterPlaying.subtaskId);
    const nextIndex = currentIndex + delta;
    if (nextIndex >= 0 && nextIndex < topic.subTasks.length) {
      const nextSub = topic.subTasks[nextIndex];
      const vidId = nextSub.url?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/)?.[1];
      if (vidId) {
        setTheaterPlaying({
          topicId: topic.id!,
          subtaskId: nextSub.id,
          videoId: vidId,
          title: nextSub.title,
          url: nextSub.url,
          notes: nextSub.notes,
          isCompleted: nextSub.isCompleted,
          watchedCount: topic.subTasks.filter(s => s.isCompleted).length,
        });
      }
    }
  };

  // Filtering topics and subtasks
  const filteredTopics = useMemo(() => {
    return topics
      .map(topic => {
        let matchingSubs = topic.subTasks || [];

        if (hideCompleted) {
          matchingSubs = matchingSubs.filter(s => !s.isCompleted);
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const topicMatches = topic.title.toLowerCase().includes(q);
          if (!topicMatches) {
            matchingSubs = matchingSubs.filter(s => (s.title || (s as any).text || '').toLowerCase().includes(q));
            if (matchingSubs.length === 0) return null;
          }
        }

        return {
          ...topic,
          subTasks: matchingSubs,
        };
      })
      .filter(Boolean) as LearningTopic[];
  }, [topics, searchQuery, hideCompleted]);

  // Compute total stats
  const totalStats = useMemo(() => {
    let completed = 0;
    let total = 0;
    topics.forEach(t => {
      (t.subTasks || []).forEach(s => {
        total++;
        if (s.isCompleted) completed++;
      });
    });
    const pct = total > 0 ? (completed / total) * 100 : 0;
    return { completed, total, pct };
  }, [topics]);

  return (
    <div className="learning-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="learning-header-bar">
        <div className="learning-header-left">
          <h1 className="learning-hero-title">Learning Checklist</h1>
          <span className="learning-stats-subtitle">
            {topics.length} Topics · {totalStats.completed}/{totalStats.total} Lectures ({totalStats.pct.toFixed(0)}%)
          </span>
        </div>

        {/* Header Action Pills */}
        <div className="learning-header-actions">
          <button
            type="button"
            className="learning-action-pill-btn ai-curriculum-pill"
            onClick={() => setShowCurriculumBuilder(true)}
            title="AI Multi-Module Curriculum Generator"
          >
            <Sparkles size={14} color="#5eda9e" />
            <span>AI Curriculum</span>
          </button>

          <button
            type="button"
            className="learning-action-pill-btn roadmaps-pill"
            onClick={() => setShowRoadmapsModal(true)}
            title="Predefined Engineering Roadmaps"
          >
            <BookOpen size={14} color="#38bdf8" />
            <span>Roadmaps</span>
          </button>

          <button
            type="button"
            className="learning-action-pill-btn playlist-pill"
            onClick={() => setShowPlaylistModal(true)}
            title="Import YouTube Playlist"
          >
            <LinkIcon size={14} color="#a599ff" />
            <span>Import Playlist</span>
          </button>

          <button
            type="button"
            className={`learning-action-pill-btn ${hideCompleted ? 'active-filter' : ''}`}
            onClick={() => setHideCompleted(prev => !prev)}
            title={hideCompleted ? 'Show completed lectures' : 'Hide completed lectures'}
          >
            {hideCompleted ? <EyeOff size={14} color="#5eda9e" /> : <Eye size={14} />}
            <span>{hideCompleted ? 'Hidden' : 'Hide Completed'}</span>
          </button>

          <button
            type="button"
            className="learning-primary-add-btn"
            onClick={() => setShowAddTopicModal(true)}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New Topic</span>
          </button>
        </div>
      </div>

      {/* ── SEARCH & FILTER ROW ── */}
      <div className="learning-filter-row">
        <div className="learning-search-bar">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="learning-search-input"
            placeholder="Search learning topics, courses, or specific lecture titles..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="search-clear-btn" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="learning-view-mode-toggle">
          <button
            type="button"
            className={`learning-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => handleSetViewMode('grid')}
            title="Grid View (Cards)"
          >
            <LayoutGrid size={14} />
            <span>Cards</span>
          </button>
          <button
            type="button"
            className={`learning-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => handleSetViewMode('list')}
            title="List View (Compact)"
          >
            <List size={14} />
            <span>List</span>
          </button>
        </div>
      </div>

      {/* ── TOPICS STACK ── */}
      <div className={`learning-topics-container ${viewMode === 'grid' ? 'grid-view' : 'list-view'}`}>
        {loading ? (
          <div className="learning-loading-state">
            <RefreshCw size={24} className="lp-spin" color="#a599ff" />
            <p>Loading your learning path...</p>
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="learning-empty-state">
            <div className="empty-icon-wrap">
              <GraduationCap size={36} color="#a599ff" />
            </div>
            <h3 className="empty-title">
              {searchQuery ? 'No matching lectures found' : 'Your Learning Path is Empty'}
            </h3>
            <p className="empty-desc">
              {searchQuery
                ? `No topics match "${searchQuery}". Try a different keyword.`
                : 'Create your first topic or import an industry standard roadmap below.'}
            </p>
            <div className="empty-action-row">
              <button
                type="button"
                className="learning-primary-add-btn"
                onClick={() => setShowAddTopicModal(true)}
              >
                <Plus size={15} /> Create Topic
              </button>
              <button
                type="button"
                className="learning-action-pill-btn"
                onClick={() => setShowRoadmapsModal(true)}
              >
                <BookOpen size={14} color="#a599ff" /> Browse Roadmaps
              </button>
              <button
                type="button"
                className="learning-action-pill-btn"
                onClick={() => setShowPlaylistModal(true)}
              >
                <LinkIcon size={14} color="#a599ff" /> Import YouTube Course
              </button>
            </div>
          </div>
        ) : (
          filteredTopics.map((topic, idx) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              index={idx}
              viewMode={viewMode}
              isExpanded={expandedTopics.has(topic.id!)}
              onToggleExpand={() => handleToggleExpand(topic.id!)}
              onToggleSubtask={handleToggleSubtask}
              onTogglePin={handleTogglePin}
              onDeleteSubtask={handleDeleteSubtask}
              onPlayVideo={handlePlayVideo}
              onOpenSchedule={(top, sub) => setSchedulingData({ topic: top, subtask: sub })}
              onAddSubtask={handleAddSubtask}
              onDeleteTopic={handleDeleteTopic}
              onEditTopicTitle={handleEditTopicTitle}
              onEditSubtaskTitle={handleEditSubtaskTitle}
            />
          ))
        )}
      </div>

      {/* ── MODALS ── */}

      {/* 1. Add New Topic Modal */}
      {showAddTopicModal && (
        <div className="lp-modal-overlay" onClick={() => setShowAddTopicModal(false)}>
          <div className="lp-modal-content" onClick={e => e.stopPropagation()}>
            <div className="lp-modal-header">
              <div className="lp-modal-header-left">
                <div className="lp-modal-icon-badge">
                  <GraduationCap size={18} color="#a599ff" />
                </div>
                <div>
                  <h3 className="lp-modal-title">Create Learning Topic</h3>
                  <p className="lp-modal-subtitle">Add a new course or subject to your checklist</p>
                </div>
              </div>
              <button type="button" className="lp-modal-close-btn" onClick={() => setShowAddTopicModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTopic}>
              <div className="lp-input-group">
                <label className="lp-input-label">Topic / Course Title *</label>
                <input
                  type="text"
                  className="lp-text-input"
                  placeholder="e.g. Distributed Systems in Go"
                  value={newTopicTitle}
                  onChange={e => setNewTopicTitle(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="lp-input-group">
                <label className="lp-input-label">Description (Optional)</label>
                <textarea
                  className="lp-textarea-input"
                  placeholder="Goal, target deadline, syllabus notes..."
                  value={newTopicDesc}
                  onChange={e => setNewTopicDesc(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="lp-modal-footer">
                <button type="button" className="lp-btn-cancel" onClick={() => setShowAddTopicModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="lp-btn-primary" disabled={!newTopicTitle.trim()}>
                  Create Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. YouTube Playlist Import Modal */}
      {showPlaylistModal && (
        <PlaylistImportModal
          onImport={handleImportPlaylist}
          onClose={() => setShowPlaylistModal(false)}
        />
      )}

      {/* 3. Predefined Roadmaps Modal */}
      {showRoadmapsModal && (
        <PredefinedRoadmapsModal
          onImportRoadmap={handleImportRoadmap}
          onClose={() => setShowRoadmapsModal(false)}
        />
      )}

      {/* 4. Curriculum Builder Modal */}
      {showCurriculumBuilder && (
        <CurriculumBuilderModal
          onClose={() => setShowCurriculumBuilder(false)}
          onPublish={handlePublishCurriculum}
        />
      )}

      {/* 5. Schedule Study Modal */}
      {schedulingData && (
        <ScheduleStudyModal
          topic={schedulingData.topic}
          subtask={schedulingData.subtask}
          onClose={() => setSchedulingData(null)}
        />
      )}

      {/* 6. Lecture Theater Modal (Video + ZEN-GPT + Transcript + Notes) */}
      {theaterPlaying && (
        <LectureTheaterModal
          playing={theaterPlaying}
          total={topics.find(t => t.id === theaterPlaying.topicId)?.subTasks?.length || 1}
          idx={
            topics
              .find(t => t.id === theaterPlaying.topicId)
              ?.subTasks?.findIndex(s => s.id === theaterPlaying.subtaskId) ?? 0
          }
          topicName={topics.find(t => t.id === theaterPlaying.topicId)?.title || 'Course'}
          onClose={() => setTheaterPlaying(null)}
          onMinimize={() => setTheaterPlaying(null)}
          onMarkWatched={handleToggleSubtask}
          onNavigate={handleTheaterNavigate}
          onSaveVideoNote={handleSaveVideoNote}
        />
      )}
    </div>
  );
}

export default LearningChecklistModule;