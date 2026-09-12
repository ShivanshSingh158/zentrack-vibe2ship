import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import type { Goal, KeyResult } from '../../types/index';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  Target,
  Plus,
  Trash2,
  X,
  Save,
  TrendingUp,
  ListChecks,
  Award,
} from 'lucide-react';
import { toast } from 'sonner';
import { autoBreakdownGoal } from '../../services/gemini';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { GoalCard } from './GoalCard';
import { awardXP } from '../../services/xpSystem';

export const GoalsModule = () => {
  // All external data comes from GlobalDataContext — zero additional Firestore listeners.
  const {
    goals: globalGoals,
    jobs: extJobs,
    tasks: extTodos,
    learningTopics: extLearning,
    dailyLogs: extLogs,
    isLoading,
  } = useGlobalData();

  const goals = useMemo(() => {
    const sorted = [...globalGoals];
    sorted.sort((a, b) => b.createdAt - a.createdAt);
    return sorted;
  }, [globalGoals]);

  const [showArchived, setShowArchived] = useState(false);
  // Edit state
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Local KR slider state for debouncing
  const [localKrProgress, setLocalKrProgress] = useState<{ [krId: string]: number }>({});
  
  // Expanded charts state
  const [expandedCharts, setExpandedCharts] = useState<{ [goalId: string]: boolean }>({});
  
  // AI Breakdown state
  const [isBreakingDown, setIsBreakingDown] = useState<{ [goalId: string]: boolean }>({});

  // Debounce timer for auto-sync (prevents Firestore write storms)
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last sync timestamps per goal — throttle to max once per 10s per goal
  const lastSyncRef = useRef<{ [goalId: string]: number }>({});

  // Keyboard trap for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Auto-focus Title on open
  useEffect(() => {
    if (isModalOpen && titleInputRef.current) {
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isModalOpen]);

  // ── Auto-Sync Engine ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || goals.length === 0) return;

    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);

    syncDebounceRef.current = setTimeout(() => {
      const now = Date.now();
      const promises: Promise<void>[] = [];

      goals.forEach(goal => {
        if (goal.status !== 'active' || !goal.id) return;

        const lastSync = lastSyncRef.current[goal.id] || 0;
        if (now - lastSync < 10_000) return;

        let goalNeedsUpdate = false;
        const updatedKRs = (goal.keyResults || []).map((kr: any) => {
          if (!kr.syncType || kr.syncType === 'none') return kr;

          let computedValue = kr.currentValue;

          if (kr.syncType === 'job_applications') {
            computedValue = extJobs.length;
          } else if (kr.syncType === 'interviews') {
            computedValue = extJobs.filter(j => j.status === 'interviewing' || j.status === 'offer').length;
          } else if (kr.syncType === 'todos_completed') {
            computedValue = extTodos.filter(t => t.status === 'completed' && (!kr.syncQuery || (t.text && t.text.toLowerCase().includes(kr.syncQuery.toLowerCase())))).length;
          } else if (kr.syncType === 'learning_subtasks') {
            computedValue = extLearning.reduce((acc, topic) => acc + (topic.subTasks || []).filter((s: any) => s.status === 'completed' && (!kr.syncQuery || (s.text && s.text.toLowerCase().includes(kr.syncQuery.toLowerCase())))).length, 0);
          } else if (kr.syncType === 'gym_days') {
            computedValue = extLogs.filter(l => l.gymNotes && typeof l.gymNotes === 'string' && l.gymNotes.trim().length > 0).length;
          } else if (kr.syncType === 'productive_hours') {
            computedValue = Math.round(extLogs.reduce((acc, log) => acc + (parseFloat(log.productiveHours) || 0), 0) * 10) / 10;
          }

          if (computedValue !== kr.currentValue) {
            goalNeedsUpdate = true;
            const newHistory = [...(kr.history || [])];
            if (newHistory.length === 0 || newHistory[newHistory.length - 1].value !== computedValue) {
              newHistory.push({ timestamp: now, value: computedValue });
              if (newHistory.length > 100) newHistory.splice(0, newHistory.length - 100);
            }
            return { ...kr, currentValue: computedValue, history: newHistory };
          }
          return kr;
        });

        if (goalNeedsUpdate) {
          lastSyncRef.current[goal.id!] = now;
          promises.push(
            updateDoc(doc(db, 'goals', goal.id!), { keyResults: updatedKRs, updatedAt: now })
          );
        }
      });

      if (promises.length > 0) {
        Promise.all(promises).catch(err => console.error('Goals auto-sync error', err));
      }
    }, 4000);

    return () => {
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [goals, extJobs, extLearning, isLoading]);

  const openNewGoal = () => {
    setEditingGoal({
      userId: auth.currentUser?.uid || '',
      title: '',
      description: '',
      deadline: getLocalDateString(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)), // 90 days from now
      status: 'active',
      keyResults: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setIsModalOpen(true);
  };

  const handleSaveGoal = async () => {
    if (!editingGoal || !editingGoal.title.trim()) {
      toast.error('Title is required');
      return;
    }
    
    try {
      const goalData = { ...editingGoal, updatedAt: Date.now() };
      
      if (goalData.id) {
        // Update
        const { id, ...data } = goalData;
        await updateDoc(doc(db, 'goals', id), data);
        toast.success('Goal updated successfully!');
      } else {
        // Create
        await addDoc(collection(db, 'goals'), goalData);
        toast.success('Goal created successfully!');
      }
      setIsModalOpen(false);
      setEditingGoal(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save goal');
    }
  };

  const handleDeleteGoal = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDeleteGoal = async () => {
    try {
      await deleteDoc(doc(db, 'goals', deleteConfirm.id));
      toast.success('Goal deleted');
      setDeleteConfirm({ isOpen: false, id: '' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete goal');
    }
  };

  const handleAddKR = () => {
    if (!editingGoal) return;
    const newKR: KeyResult = {
      id: Date.now().toString(),
      title: '',
      targetValue: 100,
      currentValue: 0,
      unit: '%',
      history: [{ timestamp: Date.now(), value: 0 }],
      syncType: 'none',
      syncQuery: ''
    };
    setEditingGoal({ ...editingGoal, keyResults: [...editingGoal.keyResults, newKR] });
  };

  const handleUpdateKR = (idx: number, field: keyof KeyResult | 'text', value: any) => {
    if (!editingGoal) return;
    const krs = [...editingGoal.keyResults];
    if (field === 'title' || field === 'text') {
      krs[idx] = { ...krs[idx], title: value, text: value } as any;
    } else {
      krs[idx] = { ...krs[idx], [field]: value };
    }
    setEditingGoal({ ...editingGoal, keyResults: krs });
  };

  const handleRemoveKR = (idx: number) => {
    if (!editingGoal) return;
    const krs = editingGoal.keyResults.filter((_, i) => i !== idx);
    setEditingGoal({ ...editingGoal, keyResults: krs });
  };

  const handleLocalSliderChange = (krId: string, newValue: number) => {
    setLocalKrProgress(prev => ({ ...prev, [krId]: newValue }));
  };

  const commitGoalKRProgress = async (goalId: string, krId: string, finalValue: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    const currentKR = goal.keyResults.find((k: any) => k.id === krId);
    if (!currentKR || currentKR.currentValue === finalValue) return;

    const updatedKRs = goal.keyResults.map((kr: any) => {
      if (kr.id === krId) {
        const newHistory = [...(kr.history || [])];
        newHistory.push({ timestamp: Date.now(), value: finalValue });
        if (newHistory.length > 100) newHistory.splice(0, newHistory.length - 100);
        return { ...kr, currentValue: finalValue, history: newHistory };
      }
      return kr;
    });
    
    try {
      await updateDoc(doc(db, 'goals', goalId), { keyResults: updatedKRs, updatedAt: Date.now() });
      setLocalKrProgress(prev => {
        const copy = { ...prev };
        delete copy[krId];
        return copy;
      });

      const target = currentKR.targetValue || 100;
      if (finalValue >= target && currentKR.currentValue < target) {
        awardXP('GOAL_MILESTONE').then((res) => {
          toast.success(`🎯 Key Result Achieved: "${currentKR.title || (currentKR as any).text}"! +${res.added} XP 🏆`);
          if (res.leveledUp) {
            toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
          }
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update progress');
    }
  };

  const filteredGoals = useMemo(() => {
    if (showArchived) return goals;
    return goals.filter(g => g.status === 'active');
  }, [goals, showArchived]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const active = goals.filter(g => g.status === 'active');
    const totalGoals = active.length;
    
    let totalKRs = 0;
    let completedKRs = 0;
    let sumProgress = 0;

    active.forEach(g => {
      const krs = g.keyResults || [];
      totalKRs += krs.length;
      if (krs.length > 0) {
        let gSum = 0;
        krs.forEach(k => {
          const val = localKrProgress[k.id] !== undefined ? localKrProgress[k.id] : (k.currentValue || 0);
          const tgt = k.targetValue || 1;
          if (val >= tgt) completedKRs++;
          gSum += Math.min(val / tgt, 1);
        });
        sumProgress += (gSum / krs.length);
      }
    });

    const avgProgress = totalGoals > 0 ? Math.round((sumProgress / totalGoals) * 100) : 0;

    return {
      activeCount: totalGoals,
      avgProgress,
      totalMilestones: totalKRs,
      completedMilestones: completedKRs,
    };
  }, [goals, localKrProgress]);

  const handleAIBreakdown = async (goal: Goal) => {
    setIsBreakingDown(prev => ({ ...prev, [goal.id!]: true }));
    toast.info(`AI is analyzing "${goal.title}"...`);
    try {
      const res = await autoBreakdownGoal(goal.title, goal.description || '');
      if (!res.subtasks || res.subtasks.length === 0) {
        toast.info('No subtasks generated.');
        return;
      }
      
      let count = 0;
      for (const t of res.subtasks) {
        const d = new Date();
        d.setDate(d.getDate() + (t.daysFromNow || 0));
        await addDoc(collection(db, 'todos'), {
          userId: auth.currentUser?.uid,
          title: t.text,
          priority: t.priority || 'medium',
          date: getLocalDateString(d),
          createdAt: Date.now(),
          status: 'pending',
          isOverdue: false,
          goalId: goal.id
        });
        count++;
      }
      toast.success(`🪄 AI successfully created ${count} tasks for this goal! Check your Inbox.`);
    } catch (err: any) {
      toast.error('AI Breakdown failed: ' + err.message);
    } finally {
      setIsBreakingDown(prev => ({ ...prev, [goal.id!]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="goals-page">
        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading Goals & OKRs...
        </div>
      </div>
    );
  }

  return (
    <div className="goals-page">
      {/* ── Page Header ── */}
      <div className="goals-header">
        <div className="goals-header-left">
          <div className="goals-header-icon-wrap">
            <Target size={22} strokeWidth={2.2} />
          </div>
          <div className="goals-header-titles">
            <h1>Goals & OKRs</h1>
            <p>Connect high-impact life vision with daily tasks and measurable milestones.</p>
          </div>
        </div>
        <div className="goals-header-actions">
          <label className="goals-archive-label">
            <input
              type="checkbox"
              className="goals-archive-checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
            />
            <span>Show Archived</span>
          </label>
          <button type="button" className="goals-new-btn" onClick={openNewGoal}>
            <Plus size={16} strokeWidth={2.5} />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* ── Metrics Summary Bar ── */}
      <div className="goals-metrics-bar">
        <div className="goals-metric-card">
          <div className="goals-metric-icon" style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
            <Target size={18} />
          </div>
          <div className="goals-metric-info">
            <span className="goals-metric-value">{metrics.activeCount}</span>
            <span className="goals-metric-label">Active Goals</span>
          </div>
        </div>

        <div className="goals-metric-card">
          <div className="goals-metric-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
            <TrendingUp size={18} />
          </div>
          <div className="goals-metric-info">
            <span className="goals-metric-value">{metrics.avgProgress}%</span>
            <span className="goals-metric-label">Avg Progress</span>
          </div>
        </div>

        <div className="goals-metric-card">
          <div className="goals-metric-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
            <ListChecks size={18} />
          </div>
          <div className="goals-metric-info">
            <span className="goals-metric-value">{metrics.totalMilestones}</span>
            <span className="goals-metric-label">Key Milestones</span>
          </div>
        </div>

        <div className="goals-metric-card">
          <div className="goals-metric-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}>
            <Award size={18} />
          </div>
          <div className="goals-metric-info">
            <span className="goals-metric-value">{metrics.completedMilestones}</span>
            <span className="goals-metric-label">Targets Achieved</span>
          </div>
        </div>
      </div>

      {/* ── Goals List or Empty State ── */}
      {filteredGoals.length === 0 ? (
        <div className="goals-empty-state">
          <Target size={44} className="goals-empty-icon" style={{ color: 'var(--text-muted)' }} />
          <h3 className="goals-empty-title">No goals found</h3>
          <p className="goals-empty-desc">
            You haven't set any {showArchived ? '' : 'active '}goals yet. Set a long-term vision and break it down into measurable milestones.
          </p>
          <button type="button" className="goals-new-btn" onClick={openNewGoal} style={{ margin: '0 auto' }}>
            <Plus size={16} strokeWidth={2.5} />
            <span>Create your first Goal</span>
          </button>
        </div>
      ) : (
        <div className="goals-list">
          {filteredGoals.map((goal: Goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              localKrProgress={localKrProgress}
              isExpanded={expandedCharts[goal.id!] || false}
              toggleExpanded={() => setExpandedCharts(p => ({ ...p, [goal.id!]: !p[goal.id!] }))}
              isBreakingDown={isBreakingDown[goal.id!] || false}
              handleAIBreakdown={handleAIBreakdown}
              onEdit={(g) => { setEditingGoal(g); setIsModalOpen(true); }}
              onDelete={handleDeleteGoal}
              handleLocalSliderChange={handleLocalSliderChange}
              commitGoalKRProgress={commitGoalKRProgress}
            />
          ))}
        </div>
      )}

      {/* ── Edit / Create Goal Modal ── */}
      {isModalOpen && editingGoal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div
            style={{
              width: '100%',
              maxWidth: '600px',
              background: 'var(--bg-surface, #ffffff)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle, #edeae6)',
              overflow: 'hidden',
              boxShadow: '0 20px 48px -10px rgba(0,0,0,0.2)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border-subtle, #edeae6)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary, #202020)', margin: 0 }}>
                {editingGoal.id ? 'Edit Goal' : 'New Goal'}
              </h2>
              <button
                type="button"
                className="goal-action-btn"
                onClick={() => setIsModalOpen(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '72vh', overflowY: 'auto' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '0.35rem' }}>
                  Goal Title
                </label>
                <input 
                  type="text" 
                  ref={titleInputRef}
                  value={editingGoal.title}
                  onChange={e => setEditingGoal({ ...editingGoal, title: e.target.value })}
                  placeholder="e.g. Master React Native & Ship App"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-base, #faf8f6)',
                    border: '1px solid var(--border-subtle, #edeae6)',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #202020)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '0.35rem' }}>
                  Description
                </label>
                <textarea 
                  value={editingGoal.description}
                  onChange={e => setEditingGoal({ ...editingGoal, description: e.target.value })}
                  placeholder="What is the strategic outcome and milestone vision?"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-base, #faf8f6)',
                    border: '1px solid var(--border-subtle, #edeae6)',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #202020)',
                    fontSize: '0.9rem',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '0.35rem' }}>
                    Target Deadline
                  </label>
                  <input 
                    type="date" 
                    value={editingGoal.deadline}
                    onChange={e => setEditingGoal({ ...editingGoal, deadline: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      background: 'var(--bg-base, #faf8f6)',
                      border: '1px solid var(--border-subtle, #edeae6)',
                      borderRadius: '6px',
                      color: 'var(--text-primary, #202020)',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '0.35rem' }}>
                    Status
                  </label>
                  <select 
                    value={editingGoal.status}
                    onChange={e => setEditingGoal({ ...editingGoal, status: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      background: 'var(--bg-base, #faf8f6)',
                      border: '1px solid var(--border-subtle, #edeae6)',
                      borderRadius: '6px',
                      color: 'var(--text-primary, #202020)',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="abandoned">Abandoned</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: '0.35rem' }}>
                  Subject / Category (Optional)
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Engineering, Fitness, Career" 
                  value={editingGoal.subject || ''}
                  onChange={e => setEditingGoal({ ...editingGoal, subject: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--bg-base, #faf8f6)',
                    border: '1px solid var(--border-subtle, #edeae6)',
                    borderRadius: '6px',
                    color: 'var(--text-primary, #202020)',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle, #edeae6)', margin: '0.5rem 0' }} />

              {/* Milestones Builder */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary, #202020)', margin: 0 }}>
                    Milestones & Trackers
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddKR}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle, #edeae6)',
                      color: 'var(--zen-purple, #7c3aed)',
                      borderRadius: '6px',
                      padding: '0.3rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <Plus size={13} strokeWidth={2.5} /> Add Milestone
                  </button>
                </div>
                
                {(editingGoal.keyResults || []).map((kr, idx) => (
                  <div
                    key={kr.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                      marginBottom: '0.85rem',
                      background: 'var(--bg-base, #faf8f6)',
                      padding: '0.85rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle, #edeae6)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        placeholder="Milestone Title (e.g. Apply to 50 jobs)" 
                        value={kr.title || (kr as any).text || ''}
                        onChange={e => handleUpdateKR(idx, 'title', e.target.value)}
                        style={{
                          flex: 2,
                          padding: '0.5rem 0.65rem',
                          background: 'var(--bg-surface, #ffffff)',
                          border: '1px solid var(--border-subtle, #edeae6)',
                          borderRadius: '5px',
                          color: 'var(--text-primary, #202020)',
                          fontSize: '0.85rem',
                        }}
                      />
                      <input 
                        type="number" 
                        placeholder="Target" 
                        value={kr.targetValue}
                        onChange={e => handleUpdateKR(idx, 'targetValue', parseFloat(e.target.value))}
                        style={{
                          width: '75px',
                          padding: '0.5rem 0.65rem',
                          background: 'var(--bg-surface, #ffffff)',
                          border: '1px solid var(--border-subtle, #edeae6)',
                          borderRadius: '5px',
                          color: 'var(--text-primary, #202020)',
                          fontSize: '0.85rem',
                        }}
                      />
                      <input 
                        type="text" 
                        placeholder="Unit" 
                        value={kr.unit}
                        onChange={e => handleUpdateKR(idx, 'unit', e.target.value)}
                        style={{
                          width: '65px',
                          padding: '0.5rem 0.65rem',
                          background: 'var(--bg-surface, #ffffff)',
                          border: '1px solid var(--border-subtle, #edeae6)',
                          borderRadius: '5px',
                          color: 'var(--text-primary, #202020)',
                          fontSize: '0.85rem',
                        }}
                      />
                      <button
                        type="button"
                        className="goal-action-btn delete-btn"
                        onClick={() => handleRemoveKR(idx)}
                        title="Delete Milestone"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.2rem' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #475569)', fontWeight: 600 }}>
                        Auto-Sync Source <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #78716c)', fontWeight: 400 }}>(auto-computed from app data)</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {[
                          { id: 'none', label: 'Manual' },
                          { id: 'job_applications', label: 'Job Apps' },
                          { id: 'interviews', label: 'Interviews' },
                          { id: 'todos_completed', label: 'Tasks' },
                          { id: 'learning_subtasks', label: 'Learning' },
                          { id: 'gym_days', label: 'Gym' },
                          { id: 'productive_hours', label: 'Hours' }
                        ].map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleUpdateKR(idx, 'syncType', opt.id)}
                            style={{
                              padding: '0.25rem 0.65rem',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              borderRadius: '999px',
                              border: '1px solid',
                              borderColor: (kr.syncType || 'none') === opt.id ? 'var(--zen-purple, #7c3aed)' : 'var(--border-subtle, #edeae6)',
                              background: (kr.syncType || 'none') === opt.id ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                              color: (kr.syncType || 'none') === opt.id ? 'var(--zen-purple, #7c3aed)' : 'var(--text-secondary, #475569)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      
                      {kr.syncType && kr.syncType !== 'none' && (kr.syncType === 'todos_completed' || kr.syncType === 'learning_subtasks') && (
                        <input 
                          type="text" 
                          placeholder="Filter keyword (e.g. 'React' or 'DSA')" 
                          value={kr.syncQuery || ''}
                          onChange={e => handleUpdateKR(idx, 'syncQuery', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.45rem 0.65rem',
                            fontSize: '0.82rem',
                            background: 'var(--bg-surface, #ffffff)',
                            border: '1px solid var(--border-subtle, #edeae6)',
                            borderRadius: '5px',
                            color: 'var(--text-primary, #202020)',
                            marginTop: '0.2rem',
                            boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
            
            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-subtle, #edeae6)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                background: 'var(--bg-base, #faf8f6)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle, #edeae6)',
                  color: 'var(--text-secondary, #475569)',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGoal}
                style={{
                  background: '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1.15rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 1px 3px rgba(124, 58, 237, 0.3)',
                }}
              >
                <Save size={15} />
                <span>Save Goal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog 
        open={deleteConfirm.isOpen}
        title="Delete Goal"
        message="Are you sure you want to delete this goal? All milestones and progress will be lost."
        onConfirm={confirmDeleteGoal}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '' })}
      />
    </div>
  );
};
