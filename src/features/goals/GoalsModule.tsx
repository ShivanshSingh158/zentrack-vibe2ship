import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import type { Goal, KeyResult } from '../../types/index';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { Target, Plus, Edit2, Trash2, X, Save, TrendingUp, ChevronUp, Wand2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { autoBreakdownGoal } from '../../services/gemini';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { GoalCard } from './GoalCard';

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

  // Auto-sync engine and edit state unchanged below
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
  // Debounced: waits 4s after the last snapshot change before writing.
  // Throttled: at most once per 10s per goal to prevent write storms.
  useEffect(() => {
    if (isLoading || goals.length === 0) return;

    // Clear any pending debounce
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);

    syncDebounceRef.current = setTimeout(() => {
      const now = Date.now();
      const promises: Promise<void>[] = [];

      goals.forEach(goal => {
        if (goal.status !== 'active' || !goal.id) return;

        // Throttle: skip if synced this goal within last 10 seconds
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
    }, 4000); // 4s debounce

    return () => {
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    };
  }, [goals, extJobs, extTodos, extLearning, extLogs, isLoading]);

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

  const handleUpdateKR = (idx: number, field: keyof KeyResult, value: any) => {
    if (!editingGoal) return;
    const krs = [...editingGoal.keyResults];
    krs[idx] = { ...krs[idx], [field]: value };
    setEditingGoal({ ...editingGoal, keyResults: krs });
  };

  const handleRemoveKR = (idx: number) => {
    if (!editingGoal) return;
    const krs = editingGoal.keyResults.filter((_, i) => i !== idx);
    setEditingGoal({ ...editingGoal, keyResults: krs });
  };

  // Debounced slider logic: update local state on drag, save to firestore on mouseup
  const handleLocalSliderChange = (krId: string, newValue: number) => {
    setLocalKrProgress(prev => ({ ...prev, [krId]: newValue }));
  };

  const commitGoalKRProgress = async (goalId: string, krId: string, finalValue: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    // Check if it's actually different from the current saved value
    const currentKR = goal.keyResults.find((k: any) => k.id === krId);
    if (!currentKR || currentKR.currentValue === finalValue) return;

    const updatedKRs = goal.keyResults.map((kr: any) => {
      if (kr.id === krId) {
        // Append to history
        const newHistory = [...(kr.history || [])];
        // If we want "per day", we could replace the last entry if it's the same day, but let's just append per-update for simplicity, or just append. 
        // Actually, to keep it clean, let's just append. Recharts handles multiple data points well.
        newHistory.push({ timestamp: Date.now(), value: finalValue });
        return { ...kr, currentValue: finalValue, history: newHistory };
      }
      return kr;
    });
    
    try {
      await updateDoc(doc(db, 'goals', goalId), { keyResults: updatedKRs, updatedAt: Date.now() });
      // Remove from local tracking since db updated
      setLocalKrProgress(prev => {
        const copy = { ...prev };
        delete copy[krId];
        return copy;
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to update progress');
    }
  };

  const filteredGoals = useMemo(() => {
    if (showArchived) return goals;
    return goals.filter(g => g.status === 'active');
  }, [goals, showArchived]);

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
      toast.success(`🪄 AI successfully created ${count} tasks for this goal! Check your To-Do list.`);
    } catch (err: any) {
      toast.error('AI Breakdown failed: ' + err.message);
    } finally {
      setIsBreakingDown(prev => ({ ...prev, [goal.id!]: false }));
    }
  };

  if (isLoading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading Goals...</div>;

  return (
    <div className="page-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={28} style={{ color: 'var(--accent-primary)' }} />
            Goals & OKRs
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>Connect your daily tasks to your long-term vision.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show Archived
          </label>
          <button className="btn-primary" onClick={openNewGoal}>
            <Plus size={18} /> New Goal
          </button>
        </div>
      </div>

      {filteredGoals.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <Target size={48} style={{ color: 'var(--border-hover)', marginBottom: '1rem' }} />
          <h3>No goals found</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0.5rem auto 1.5rem auto' }}>
            You haven't set any {showArchived ? '' : 'active '}goals yet. Set a long-term goal and break it down into measurable Milestones.
          </p>
          <button className="btn-primary" onClick={openNewGoal}>
            Create your first Goal
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

      {/* Edit Modal */}
      {isModalOpen && editingGoal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{editingGoal.id ? 'Edit Goal' : 'New Goal'}</h2>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Goal Title</label>
                <input 
                  type="text" 
                  ref={titleInputRef}
                  value={editingGoal.title}
                  onChange={e => setEditingGoal({ ...editingGoal, title: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Description</label>
                <textarea 
                  value={editingGoal.description}
                  onChange={e => setEditingGoal({ ...editingGoal, description: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Deadline</label>
                  <input 
                    type="date" 
                    value={editingGoal.deadline}
                    onChange={e => setEditingGoal({ ...editingGoal, deadline: e.target.value })}
                    style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Status</label>
                  <select 
                    value={editingGoal.status}
                    onChange={e => setEditingGoal({ ...editingGoal, status: e.target.value as any })}
                    style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="abandoned">Abandoned</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Subject / Course (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g., DBMS, Physics" 
                  value={editingGoal.subject || ''}
                  onChange={e => setEditingGoal({ ...editingGoal, subject: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '1rem 0' }} />

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Milestones & Trackers</h3>
                  <button type="button" className="btn-secondary" onClick={handleAddKR} style={{ padding: '0.25rem 0.75rem', fontSize: '0.85rem' }}>
                    <Plus size={14} /> Add Milestone
                  </button>
                </div>
                
                {(editingGoal.keyResults || []).map((kr, idx) => (
                  <div key={kr.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <input 
                        type="text" 
                        placeholder="Milestone Title (e.g. Apply to 50 jobs)" 
                        value={kr.text}
                        onChange={e => handleUpdateKR(idx, 'text', e.target.value)}
                        style={{ flex: 2, padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Target" 
                        value={kr.targetValue}
                        onChange={e => handleUpdateKR(idx, 'targetValue', parseFloat(e.target.value))}
                        style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                      />
                      <input 
                        type="text" 
                        placeholder="Unit" 
                        value={kr.unit}
                        onChange={e => handleUpdateKR(idx, 'unit', e.target.value)}
                        style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)' }}
                      />
                      <button className="btn-icon" onClick={() => handleRemoveKR(idx)} style={{ color: '#ef4444', padding: '0.5rem' }}><Trash2 size={16} /></button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <label style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Auto-Sync Source <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(updates automatically)</span></label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {[
                          { id: 'none', label: 'Manual Slider' },
                          { id: 'job_applications', label: 'Job Apps' },
                          { id: 'interviews', label: 'Interviews' },
                          { id: 'todos_completed', label: 'Completed Tasks' },
                          { id: 'learning_subtasks', label: 'Learning' },
                          { id: 'gym_days', label: 'Gym Days' },
                          { id: 'productive_hours', label: 'Focus Hours' }
                        ].map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleUpdateKR(idx, 'syncType', opt.id)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              borderRadius: '999px',
                              border: '1px solid',
                              borderColor: (kr.syncType || 'none') === opt.id ? 'var(--accent-primary)' : 'var(--border-subtle)',
                              background: (kr.syncType || 'none') === opt.id ? 'rgba(124,58,237,0.1)' : 'var(--bg-base)',
                              color: (kr.syncType || 'none') === opt.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      
                      {kr.syncType && kr.syncType !== 'none' && (kr.syncType === 'todos_completed' || kr.syncType === 'learning_subtasks') && (
                        <input 
                          type="text" 
                          placeholder="Filter keyword (Optional, e.g. 'react')" 
                          value={kr.syncQuery || ''}
                          onChange={e => handleUpdateKR(idx, 'syncQuery', e.target.value)}
                          style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', marginTop: '0.25rem' }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
            
            <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveGoal}><Save size={16} /> Save Goal</button>
            </div>
          </div>
        </div>
      )}

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
