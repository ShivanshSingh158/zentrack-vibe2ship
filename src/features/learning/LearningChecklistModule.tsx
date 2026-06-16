import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, ChevronDown, ChevronRight, BookOpen, Trash2, Link as LinkIcon, FileText, Search, MoreVertical, EyeOff, Eye, X, Play, GripVertical, ChevronUp } from 'lucide-react';
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

// Firestore rejects undefined values — strip them before every write
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
import { fetchYouTubePlaylist, extractPlaylistId } from '../../services/youtube';
import { PREDEFINED_ROADMAPS } from '../../data/roadmaps';

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

const MASTERY_LEVELS = {
  not_started: { label: 'Not Started', color: '#6b7280', bg: 'rgba(107,114,128,0.15)', emoji: '⬜' },
  learning: { label: 'Learning', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', emoji: '📖' },
  revising: { label: 'Revising', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', emoji: '🔄' },
  mastered: { label: 'Mastered', color: '#10b981', bg: 'rgba(16,185,129,0.15)', emoji: '✅' },
} as const;

const MASTERY_ORDER: Array<keyof typeof MASTERY_LEVELS> = ['not_started', 'learning', 'revising', 'mastered'];


const SubTaskItem = React.memo(({ subTask, topicId, toggleSubTask, openNotesModal, deleteSubTask, startTimer, onPlayVideo, onCycleMastery }: { subTask: LearningSubTask, topicId: string, toggleSubTask: (topicId: string, subtaskId: string) => void, openNotesModal: (topicId: string, subtaskId: string) => void, deleteSubTask: (topicId: string, subtaskId: string) => void, startTimer: (id: string, text: string) => void, onPlayVideo: (id: string) => void, onCycleMastery: (topicId: string, subtaskId: string) => void }) => {
  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    const ytId = extractYoutubeId(url);
    if (ytId) {
      e.preventDefault();
      onPlayVideo(ytId);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
      <div className={`subtask-item ${subTask.isCompleted ? 'completed' : ''}`}>
        <button 
          className={`todo-checkbox ${subTask.isCompleted ? 'checked' : ''}`}
          onClick={() => toggleSubTask(topicId, subTask.id)}
          role="checkbox"
          aria-checked={subTask.isCompleted}
          aria-label={`Mark subtask ${subTask.isCompleted ? 'incomplete' : 'complete'}`}
        >
          {subTask.isCompleted && <Check size={14} strokeWidth={3} />}
        </button>
        
        <span className="todo-text" style={{ flex: 1 }}>{subTask.text}</span>
        
        {/* Mastery Level Badge */}
        {(() => {
          const level = subTask.masteryLevel || 'not_started';
          const cfg = MASTERY_LEVELS[level];
          return (
            <button
              onClick={() => onCycleMastery(topicId, subTask.id)}
              title={`Mastery: ${cfg.label} (click to cycle)`}
              style={{ padding: '0.15rem 0.4rem', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 600, background: cfg.bg, color: cfg.color, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            >
              {cfg.emoji} {cfg.label}
            </button>
          );
        })()}

        {subTask.revisionCount != null && subTask.revisionCount > 0 && (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }} title={subTask.lastRevisedAt ? `Last revised: ${new Date(subTask.lastRevisedAt).toLocaleDateString()}` : ''}>
            🔄{subTask.revisionCount}
          </span>
        )}
        
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button 
            className="btn-icon hide-on-mobile" 
            onClick={() => startTimer(subTask.id, subTask.text)} 
            title="Start Pomodoro" 
            aria-label="Start Pomodoro Timer"
            style={{ color: 'var(--accent-primary)' }}
          >
            <Play size={14} />
          </button>

          {subTask.url && (
            <a href={subTask.url} onClick={(e) => handleLinkClick(e, subTask.url!)} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', padding: '0.4rem', borderRadius: '4px' }} title="Open Resource" aria-label="Open external resource">
              <LinkIcon size={14} />
            </a>
          )}
          
          {subTask.resources?.map((res, i) => (
            <a key={i} href={res.url} onClick={(e) => handleLinkClick(e, res.url)} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', padding: '0.4rem', borderRadius: '4px' }} title={res.title}>
              {res.type === 'video' ? <Play size={14}/> : <FileText size={14}/>}
            </a>
          ))}
          
          <button 
            className="btn-icon" 
            onClick={() => openNotesModal(topicId, subTask.id)}
            style={{ color: subTask.notes ? 'var(--text-primary)' : 'var(--text-muted)' }}
            title={subTask.notes ? "Edit Notes" : "Add Notes"}
            aria-label={subTask.notes ? "Edit Notes" : "Add Notes"}
          >
            <FileText size={14} />
          </button>
          
          <button className="todo-delete" onClick={() => deleteSubTask(topicId, subTask.id)} aria-label="Delete subtask">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {subTask.timeSpentMs && subTask.timeSpentMs > 0 && (
         <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '2.5rem' }}>
           Time spent: {formatDuration(subTask.timeSpentMs)}
         </div>
      )}
    </div>
  );
});
SubTaskItem.displayName = 'SubTaskItem';

const TopicBody = React.memo(({ topic, expandedCategories, toggleCategory, toggleSubTask, openNotesModal, deleteSubTask, startTimer, handleAddSubTask, newSubtaskText, setNewSubtaskText, onPlayVideo, onCycleMastery }: any) => {
  const categories = useMemo(() => {
    const cats: { [key: string]: LearningSubTask[] } = {};
    (topic.subTasks || []).forEach((st: any) => {
      const cat = st.category || 'General';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(st);
    });
    return cats;
  }, [topic.subTasks]);

  return (
    <div className="topic-card-body">
      <div style={{ marginTop: '1rem', position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid var(--border-subtle)' }}>
        {Object.entries(categories).map(([category, catSubTasks]) => {
          const catKey = `${topic.id}-${category}`;
          const isCatExpanded = expandedCategories[catKey] === true;
          const catProgress = catSubTasks.length > 0 ? (catSubTasks.filter(s => s.isCompleted).length / catSubTasks.length * 100) : 0;
          
          return (
            <div key={category} style={{ marginBottom: '1.5rem', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-21px', top: '5px', width: '12px', height: '12px', borderRadius: '50%', background: catProgress === 100 ? 'var(--accent-primary)' : 'var(--bg-surface-active)', border: '2px solid var(--border-subtle)', zIndex: 1 }} />
              
              <div 
                onClick={() => toggleCategory(topic.id, category)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}
              >
                <h4 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{category}</h4>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({Math.round(catProgress)}%)</span>
                {isCatExpanded ? <ChevronUp size={14} color="var(--text-muted)"/> : <ChevronDown size={14} color="var(--text-muted)"/>}
              </div>
              
              {isCatExpanded && (
                <div style={{ paddingLeft: '1rem' }}>
                  {catSubTasks.map((subTask: any) => (
                    <div key={subTask.id} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '-27px', top: '15px', width: '15px', borderTop: '2px solid var(--border-subtle)' }} />
                      <SubTaskItem
                        subTask={subTask}
                        topicId={topic.id}
                        toggleSubTask={toggleSubTask}
                        openNotesModal={openNotesModal}
                        deleteSubTask={deleteSubTask}
                        startTimer={startTimer}
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
          placeholder="Add a milestone or task..." 
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

export const LearningChecklistModule = () => {
  const [topics, setTopics] = useState<LearningTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});
  const [newSubtaskText, setNewSubtaskText] = useState<{ [key: string]: string }>({});
  
  // Search state with persistence
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('learningSearch') || '');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

  // Modal editing state for notes and urls
  const [editingContext, setEditingContext] = useState<{ type: 'topic' | 'subtask', topicId: string, subtaskId?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; type: 'topic' | 'subtask'; id: string; parentId?: string }>({ isOpen: false, type: 'topic', id: '' });
  const [editUrl, setEditUrl] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [notesPreviewMode, setNotesPreviewMode] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<{ [key: string]: boolean }>({});
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [topicSearchQuery, setTopicSearchQuery] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isImportingYt, setIsImportingYt] = useState(false);
  const [showRoadmapHub, setShowRoadmapHub] = useState(false);
  const [importingRoadmapId, setImportingRoadmapId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { startTimer } = usePomodoroContext();
  const user = auth.currentUser;

  // Search Persistence
  useEffect(() => {
    sessionStorage.setItem('learningSearch', searchQuery);
  }, [searchQuery]);

  // Cmd+K Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Global click listener to close dropdowns without overlay
  useEffect(() => {
    const closeDropdowns = () => setDropdownOpen({});
    window.addEventListener('click', closeDropdowns);
    return () => window.removeEventListener('click', closeDropdowns);
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const q = query(collection(db, 'learning_topics'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const topicsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LearningTopic));
      // Sort by order first, then fallback to createdAt
      topicsData.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return b.createdAt - a.createdAt; 
      });
      setTopics(topicsData);
      setIsLoading(false);
    }, (error) => {
      console.error('Error listening to topics:', error);
      toast.error('Failed to load learning topics');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTopicTitle.trim()) return;

    if (topics.some(t => t.title.toLowerCase() === newTopicTitle.trim().toLowerCase())) {
      toast.error('A topic with this title already exists');
      return;
    }

    const newTopic: Omit<LearningTopic, 'id'> = {
      userId: user.uid,
      title: newTopicTitle.trim(),
      subTasks: [],
      createdAt: Date.now(),
      lastStudiedAt: Date.now(),
      order: topics.length // Add to end
    };

    try {
      const docRef = await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      setNewTopicTitle('');
      setExpandedTopicId(docRef.id);
    } catch (error) {
      console.error('Error adding topic:', error);
      toast.error('Failed to add topic');
    }
  };

  const importSyllabus = async (title: string, dataArray: string[]) => {
    // Legacy generic importer (left intact but unused by Roadmap Hub)
    if (!user) return;
    if (topics.some(t => t.title === title)) {
      toast.error(`"${title}" is already imported.`);
      return;
    }

    const newTopic: Omit<LearningTopic, 'id'> = {
      userId: user.uid,
      title,
      subTasks: dataArray.map(rawText => {
        const parts = rawText.split(' - ');
        const category = parts.length > 1 ? parts[0] : 'General';
        const text = parts.length > 1 ? parts.slice(1).join(' - ') : rawText;
        return {
          id: uniqueId(),
          text,
          category,
          isCompleted: false
        };
      }),
      createdAt: Date.now(),
      lastStudiedAt: Date.now(),
      order: topics.length,
      timeSpentMs: 0
    };
    try {
      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Successfully imported ${title}!`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to import syllabus');
    }
  };

  const importPredefinedRoadmap = async (roadmap: typeof PREDEFINED_ROADMAPS[0]) => {
    if (!user) return;
    if (topics.some(t => t.title === roadmap.title)) {
      toast.error(`"${roadmap.title}" is already imported.`);
      return;
    }

    setImportingRoadmapId(roadmap.id);

    const subTasks: LearningSubTask[] = [];
    roadmap.modules.forEach(mod => {
      mod.items.forEach(item => {
        const task: LearningSubTask = {
          id: uniqueId(),
          text: item.text,
          category: mod.category,
          isCompleted: false,
        };
        if (item.url) {
          task.url = item.url;
        }
        subTasks.push(task);
      });
    });

    const newTopic: Omit<LearningTopic, 'id'> = {
      userId: user.uid,
      title: roadmap.title,
      subTasks,
      createdAt: Date.now(),
      lastStudiedAt: Date.now(),
      order: topics.length,
      timeSpentMs: 0
    };

    try {
      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Successfully imported ${roadmap.title}!`);
      setShowRoadmapHub(false);
    } catch (error) {
      console.error('Roadmap import error:', error);
      toast.error('Failed to import roadmap. Please try again.');
    } finally {
      setImportingRoadmapId(null);
    }
  };

  const handleImportYoutube = async () => {
    if (!user || !youtubeUrl.trim()) return;
    const playlistId = extractPlaylistId(youtubeUrl);
    if (!playlistId) {
      toast.error("Invalid YouTube Playlist URL. Ensure it has a 'list=' parameter.");
      return;
    }

    setIsImportingYt(true);
    try {
      const data = await fetchYouTubePlaylist(playlistId);
      
      if (topics.some(t => t.title === data.title)) {
        toast.error(`Playlist "${data.title}" is already imported.`);
        setIsImportingYt(false);
        return;
      }

      const subTasks: LearningSubTask[] = data.videos.map((v: any) => ({
        id: uniqueId(),
        text: v.title,
        category: 'Videos',
        isCompleted: false,
        url: v.link,
        resources: [{ title: 'Watch Video', url: v.link, type: 'video' as const }]
      }));

      const newTopic: Omit<LearningTopic, 'id'> = {
        userId: user.uid,
        title: data.title,
        subTasks,
        createdAt: Date.now(),
        lastStudiedAt: Date.now(),
        order: topics.length,
        timeSpentMs: 0
      };

      await addDoc(collection(db, 'learning_topics'), sanitize(newTopic));
      toast.success(`Successfully imported ${data.videos.length} videos from ${data.title}!`);
      setYoutubeUrl('');
      setShowRoadmapHub(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch playlist");
    } finally {
      setIsImportingYt(false);
    }
  };

  const handleDeleteTopic = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ isOpen: true, type: 'topic', id });
  };

  const confirmDeleteTopic = async () => {
    try {
      await deleteDoc(doc(db, 'learning_topics', deleteConfirm.id));
      if (expandedTopicId === deleteConfirm.id) setExpandedTopicId(null);
      setDeleteConfirm({ isOpen: false, type: 'topic', id: '' });
    } catch (error) {
      console.error('Error deleting topic:', error);
      toast.error('Failed to delete topic');
    }
  };

  const handleAddSubTask = async (topicId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = newSubtaskText[topicId]?.trim();
    if (!text) return;

    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const newSubTask: LearningSubTask = {
      id: uniqueId(),
      text,
      isCompleted: false
    };

    const updatedSubTasks = [...topic.subTasks, newSubTask];

    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updatedSubTasks), lastStudiedAt: Date.now() });
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updatedSubTasks, lastStudiedAt: Date.now() } : t));
      setNewSubtaskText(prev => ({ ...prev, [topicId]: '' }));
    } catch (error) {
      console.error('Error adding subtask:', error);
      toast.error('Failed to add task to checklist');
    }
  };

  const toggleSubTask = useCallback(async (topicId: string, subTaskId: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    let newStatus = false;
    const updatedSubTasks = topic.subTasks.map(st => {
      if (st.id === subTaskId) {
        newStatus = !st.isCompleted;
        return { ...st, isCompleted: newStatus };
      }
      return st;
    });

    if (newStatus) playPopSound();

    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updatedSubTasks, lastStudiedAt: Date.now() } : t));

    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updatedSubTasks), lastStudiedAt: Date.now() });
    } catch (error) {
      console.error('Error updating subtask:', error);
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
    const updatedSubTasks = topic.subTasks.map(st => {
      if (st.id === subTaskId) {
        const currentLevel = st.masteryLevel || 'not_started';
        const currentIdx = MASTERY_ORDER.indexOf(currentLevel);
        const nextLevel = MASTERY_ORDER[(currentIdx + 1) % MASTERY_ORDER.length];
        const newSt = {
          ...st,
          masteryLevel: nextLevel,
          revisionCount: nextLevel === 'revising' ? (st.revisionCount || 0) + 1 : (st.revisionCount || 0),
        };
        if (nextLevel === 'revising') {
          newSt.lastRevisedAt = Date.now();
        }
        return newSt;
      }
      return st;
    });
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updatedSubTasks } : t));
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updatedSubTasks) });
    } catch (err: any) {
      console.error('cycleMastery error:', err);
      toast.error(err?.message || 'Failed to update mastery');
    }
  }, [topics]);

  const toggleCategory = useCallback((topicId: string, category: string) => {
    const key = `${topicId}-${category}`;
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const confirmDeleteSubTask = async () => {
    const topicId = deleteConfirm.parentId!;
    const subTaskId = deleteConfirm.id;
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;

    const updatedSubTasks = topic.subTasks.filter(st => st.id !== subTaskId);
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updatedSubTasks } : t));

    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updatedSubTasks) });
      setDeleteConfirm({ isOpen: false, type: 'topic', id: '' });
    } catch (error) {
      console.error('Error deleting subtask:', error);
      toast.error('Failed to delete task');
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: topic.subTasks } : t));
    }
  };

  const handleBatchOperation = async (topicId: string, category: string | null, complete: boolean) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    
    if (complete) playPopSound();
    
    const updatedSubTasks = topic.subTasks.map(st => {
      if (!category || st.category === category) return { ...st, isCompleted: complete };
      return st;
    });
    
    setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updatedSubTasks, lastStudiedAt: Date.now() } : t));
    
    try {
      await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updatedSubTasks), lastStudiedAt: Date.now() });
      toast.success(complete ? 'Marked all as complete' : 'Progress reset');
    } catch(err) {
      console.error(err);
      toast.error('Batch update failed');
    }
    setDropdownOpen(prev => ({ ...prev, [`${topicId}-${category}`]: false }));
  };

  const openNotesModal = useCallback((topicId: string, subTaskId?: string) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    
    if (subTaskId) {
      const subTask = topic.subTasks.find(st => st.id === subTaskId);
      setEditUrl(subTask?.url || '');
      setEditNotes(subTask?.notes || '');
      setEditingContext({ type: 'subtask', topicId, subtaskId: subTaskId });
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
      const updatedSubTasks = topic.subTasks.map(st => 
        st.id === subtaskId ? { ...st, url: editUrl, notes: editNotes } : st
      );
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, subTasks: updatedSubTasks } : t));
      try {
        await updateDoc(doc(db, 'learning_topics', topicId), { subTasks: sanitize(updatedSubTasks) });
        toast.success('Notes saved');
      } catch (error) {
        console.error(error);
        toast.error('Failed to save notes');
      }
    } else {
      try {
        await updateDoc(doc(db, 'learning_topics', topicId), { notes: editNotes });
        toast.success('Topic summary saved');
      } catch (error) {
        console.error(error);
        toast.error('Failed to save topic summary');
      }
    }
    setEditingContext(null);
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    // Can only drag if we aren't filtering/searching
    if (searchQuery.trim() !== '' || showIncompleteOnly) return;

    const items = Array.from(topics);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update locally for snappy UX
    setTopics(items);

    // Persist new order to Firestore
    try {
      items.forEach((item, index) => {
        if (item.order !== index) {
          updateDoc(doc(db, 'learning_topics', item.id!), { order: index });
        }
      });
    } catch (error) {
      console.error('Failed to save drag order', error);
      toast.error('Failed to save order');
    }
  };

  const filteredTopics = useMemo(() => {
    return topics.map(topic => {
      if (!searchQuery.trim() && !showIncompleteOnly) return topic;
      
      let isTopicMatch = true;
      let filteredSubTasks = topic.subTasks || [];

      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase();
        isTopicMatch = topic.title.toLowerCase().includes(queryLower);
        filteredSubTasks = filteredSubTasks.filter(st => 
          st.text.toLowerCase().includes(queryLower) || 
          st.category?.toLowerCase().includes(queryLower) ||
          st.notes?.toLowerCase().includes(queryLower)
        );
        if (isTopicMatch && filteredSubTasks.length === 0) {
          filteredSubTasks = topic.subTasks; // If topic matches, show all its tasks
        }
      }

      if (showIncompleteOnly) {
        filteredSubTasks = filteredSubTasks.filter(st => !st.isCompleted);
      }

      if (isTopicMatch || filteredSubTasks.length > 0) {
        return { ...topic, subTasks: filteredSubTasks };
      }
      return null;
    }).filter(Boolean) as LearningTopic[];
  }, [topics, searchQuery, showIncompleteOnly]);

  const isDraggingAllowed = searchQuery.trim() === '' && !showIncompleteOnly;

  return (
    <div className="learning-container">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div className="page-header-info">
          <h1>
            <BookOpen size={24} style={{ color: 'var(--accent-primary)' }} /> Learning Paths
          </h1>
          <p className="subtitle">Master new skills step by step. Track your progress.</p>
        </div>
        
        <div className="page-header-actions">
          <button 
            className="btn-primary" 
            onClick={() => setShowRoadmapHub(true)} 
          >
            <GripVertical size={16} /> Roadmap Hub
          </button>
          
          <button 
            className={`btn-secondary ${showIncompleteOnly ? 'active' : ''}`}
            onClick={() => setShowIncompleteOnly(!showIncompleteOnly)}
            title={showIncompleteOnly ? "Showing incomplete only" : "Show all tasks"}
            style={{ padding: '0.4rem' }}
          >
            {showIncompleteOnly ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          
          <div className="search-input-wrap" style={{ width: '220px' }}>
            <Search size={16} className="search-icon" />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search (Cmd+K)..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="add-topic-form" style={{ flexDirection: 'column' }}>
        <div className="add-topic-inputs" style={{ display: 'flex', gap: '1rem', width: '100%' }}>
          <input 
            type="text" 
            placeholder="New Topic (e.g., System Design, Cloud Architecture...)" 
            value={newTopicTitle}
            onChange={e => setNewTopicTitle(e.target.value)}
            className="todo-input"
          />
          <button onClick={handleAddTopic} className="btn-primary" disabled={!newTopicTitle.trim()}>
            <Plus size={16} /> Create Topic
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Or start with a master syllabus:</span>
          <div className="import-btn-group">
            <button className="import-btn" onClick={() => importSyllabus("Full Stack Development Master Syllabus", syllabusData)}>
              <BookOpen size={14} style={{ color: '#7c3aed' }}/> Full Stack
            </button>
            <button className="import-btn" onClick={() => importSyllabus("Generative AI Master Syllabus", genAiSyllabusData)}>
              <BookOpen size={14} style={{ color: '#a855f7' }}/> GenAI
            </button>
            <button className="import-btn" onClick={() => importSyllabus("Striver A2Z DSA Sheet", dsaSyllabusData)}>
              <BookOpen size={14} style={{ color: '#ec4899' }}/> DSA
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="topics-list" aria-live="polite">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-xl)' }}>
                <div className="skeleton-line medium" />
                <div className="skeleton-line short" />
                <div className="skeleton-line" style={{ height: '6px', marginTop: '0.5rem' }} />
              </div>
            ))}
          </div>
        </div>
      ) : filteredTopics.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          {searchQuery || showIncompleteOnly ? 'No matching topics or tasks found.' : 'No learning topics yet. Create one or import a syllabus to start!'}
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="topics-droppable" isDropDisabled={!isDraggingAllowed}>
            {(provided) => (
              <div 
                className="topics-list" 
                aria-live="polite"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {filteredTopics.map((topic, index) => {
                  const isExpanded = searchQuery.trim() !== '' || expandedTopicId === topic.id;
                  
                  const originalTopic = topics.find(t => t.id === topic.id);
                  const totalCount = (originalTopic?.subTasks || []).length;
                  const completedCount = (originalTopic?.subTasks || []).filter(st => st.isCompleted).length;
                  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

                  const daysSinceLastStudy = topic.lastStudiedAt ? (Date.now() - topic.lastStudiedAt) / (1000 * 60 * 60 * 24) : 0;
                  const needsReview = daysSinceLastStudy > 7 && progress > 0 && progress < 100;

                  return (
                    <Draggable key={topic.id} draggableId={topic.id!} index={index} isDragDisabled={!isDraggingAllowed}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className="topic-card"
                          style={{
                            ...provided.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.9 : 1,
                            boxShadow: snapshot.isDragging ? '0 10px 30px rgba(0,0,0,0.5)' : undefined
                          }}
                        >
                          <div className="topic-card-header" onClick={() => setExpandedTopicId(isExpanded ? null : topic.id!)}>
                            <div className="topic-title-section">
                              <div {...provided.dragHandleProps} style={{ padding: '0.25rem', marginRight: '0.5rem', cursor: isDraggingAllowed ? 'grab' : 'default', color: 'var(--text-muted)' }}>
                                <GripVertical size={16} />
                              </div>
                              <button className="topic-expand-btn" aria-label={isExpanded ? "Collapse topic" : "Expand topic"} aria-expanded={isExpanded} onClick={(e) => { e.stopPropagation(); setExpandedTopicId(isExpanded ? null : topic.id!); }}>
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              </button>
                              <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.25rem' }}>{topic.title}</div>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                               <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                 {completedCount} / {totalCount} completed ({Math.round(progress)}%)
                               </div>
                               {topic.timeSpentMs && topic.timeSpentMs > 0 && (
                                 <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                   <Play size={12}/> Time Spent: {formatDuration(topic.timeSpentMs)}
                                 </div>
                               )}
                            </div>
                            <div className="progress-bar" style={{ marginTop: '0.5rem' }}>
                              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                            </div>
                            </div>
                            </div>
                          
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="topic-actions">
                                <button className="btn-icon" onClick={(e) => { e.stopPropagation(); openNotesModal(topic.id!); }} title="Topic Notes" aria-label="Topic Notes">
                                  <FileText size={16} />
                                </button>
                                <button className="topic-delete-btn" onClick={(e) => handleDeleteTopic(topic.id!, e)} title="Delete Topic" aria-label="Delete Topic">
                                  <Trash2 size={16} />
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
                              onPlayVideo={setPlayingVideoId}
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

      {/* Notes Modal Overlay */}
      {editingContext && (
        <div className="notes-modal-overlay" onClick={() => setEditingContext(null)}>
          <div 
            className="notes-modal-content" 
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notes-modal-title"
          >
            <div className="notes-modal-header">
              <div>
                <h2 id="notes-modal-title" style={{ fontSize: '1.25rem', margin: 0 }}>
                  {editingContext.type === 'topic' ? 'Topic Summary & Notes' : 'Resource Details & Notes'}
                </h2>
                {editingContext.type === 'subtask' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <input 
                      type="url" 
                      value={editUrl} 
                      onChange={e => setEditUrl(e.target.value)} 
                      placeholder="Attach a URL (LeetCode, YouTube, etc.)"
                      aria-label="Resource URL"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '0.5rem 0.75rem', borderRadius: '4px', width: '100%', minWidth: '400px', color: 'var(--text-primary)' }}
                    />
                  </div>
                )}
              </div>
              <button className="btn-icon" onClick={() => setEditingContext(null)} aria-label="Close notes modal"><X size={20} /></button>
            </div>
            
            <div className="notes-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Notes (Markdown supported)</label>
                <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-base)', padding: '0.2rem', borderRadius: 'var(--radius-sm)' }}>
                  <button 
                    onClick={() => setNotesPreviewMode(false)}
                    style={{ padding: '0.3rem 0.8rem', background: !notesPreviewMode ? 'var(--bg-surface)' : 'transparent', color: !notesPreviewMode ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => setNotesPreviewMode(true)}
                    style={{ padding: '0.3rem 0.8rem', background: notesPreviewMode ? 'var(--bg-surface)' : 'transparent', color: notesPreviewMode ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {notesPreviewMode ? (
                <div className="markdown-preview">
                  {editNotes.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editNotes}</ReactMarkdown>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Nothing to preview</span>
                  )}
                </div>
              ) : (
                <textarea 
                  value={editNotes} 
                  onChange={e => setEditNotes(e.target.value)} 
                  placeholder="Write your study notes, code snippets, or thoughts here..."
                  aria-label="Markdown notes editor"
                  style={{ width: '100%', minHeight: '250px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '1rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'monospace', resize: 'vertical' }}
                />
              )}
            </div>

            <div className="notes-modal-footer">
              <button className="btn-secondary" onClick={() => setEditingContext(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveNotes}>Save Notes</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog 
        open={deleteConfirm.isOpen}
        title={deleteConfirm.type === 'topic' ? 'Delete Topic' : 'Delete Subtask'}
        message={`Are you sure you want to delete this ${deleteConfirm.type}? This action cannot be undone.`}
        onConfirm={deleteConfirm.type === 'topic' ? confirmDeleteTopic : confirmDeleteSubTask}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'topic', id: '' })}
      />
      {/* Roadmap Hub Modal */}
      {showRoadmapHub && createPortal(
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', background: 'rgba(9, 9, 11, 0.8)', padding: '1rem' }} onClick={() => setShowRoadmapHub(false)}>
          <div className="modal-content roadmap-modal" onClick={e => e.stopPropagation()} style={{ 
            width: '100%', 
            maxWidth: '650px',
            maxHeight: '88vh',
            overflowY: 'auto',
            background: 'linear-gradient(145deg, rgba(24, 24, 27, 0.95), rgba(9, 9, 11, 0.98))',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: 0,
          }}>
            <div style={{ padding: 'clamp(1rem, 4vw, 1.5rem) clamp(1rem, 4vw, 2rem)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: 600, margin: 0, background: 'linear-gradient(135deg, #fff, #a1a1aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Roadmap Hub</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>Discover and import curated learning paths</p>
              </div>
              <button className="btn-icon" onClick={() => setShowRoadmapHub(false)} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '50%', padding: '0.5rem' }}><X size={18} /></button>
            </div>
            
            <div style={{ padding: 'clamp(1rem, 4vw, 2rem)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}><BookOpen size={16} /></div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)' }}>Official Roadmaps</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {PREDEFINED_ROADMAPS.map(roadmap => (
                    <div key={roadmap.id} className="roadmap-card" style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      background: 'rgba(255, 255, 255, 0.02)', 
                    padding: 'clamp(0.75rem, 2vw, 1.25rem)', 
                      borderRadius: '16px', 
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'; e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)'; }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#e4e4e7', marginBottom: '0.2rem' }}>{roadmap.title}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{roadmap.description}</div>
                      </div>
                      <button className="btn-primary" onClick={() => importPredefinedRoadmap(roadmap)} disabled={importingRoadmapId === roadmap.id} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: '12px', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' }}>
                        {importingRoadmapId === roadmap.id ? 'Importing...' : 'Import'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}><Play size={16} /></div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)' }}>YouTube Playlist</h3>
                </div>
                <div style={{ 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  padding: 'clamp(0.75rem, 2vw, 1.25rem)', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'
                }}>
                  <input 
                    type="url" 
                    placeholder="Paste playlist URL (https://www.youtube.com/playlist?list=...)" 
                    value={youtubeUrl} 
                    onChange={e => setYoutubeUrl(e.target.value)} 
                    style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                  />
                  <button className="btn-primary" onClick={handleImportYoutube} disabled={isImportingYt} style={{ padding: '0.75rem 1.25rem', borderRadius: '12px', background: 'linear-gradient(135deg, #ef4444, #f43f5e)', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)', fontWeight: 500 }}>
                    {isImportingYt ? 'Importing...' : 'Extract'}
                  </button>
                </div>
              </div>
              
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Embedded Video Player Modal — Portal-style: fixed to viewport */}
      {playingVideoId && createPortal(
        <div
          onClick={() => setPlayingVideoId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '90vw',
              maxWidth: '1100px',
              aspectRatio: '16/9',
              background: '#000',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 25px 80px rgba(0,0,0,0.9)',
            }}
          >
            <button
              onClick={() => setPlayingVideoId(null)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.7)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10,
              }}
              aria-label="Close video player"
            >
              <X size={20} />
            </button>
            <iframe
              key={playingVideoId}
              width="100%"
              height="100%"
              src={`https://www.youtube-nocookie.com/embed/${playingVideoId}?autoplay=1&rel=0&modestbranding=1`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              style={{ display: 'block', width: '100%', height: '100%' }}
            ></iframe>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};
