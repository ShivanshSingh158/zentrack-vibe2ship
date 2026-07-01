import { useState, useMemo } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { Plus, Check, Flame, Trophy, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { collection, addDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString } from '../../utils/dateUtils';
import { playPopSound } from '../../utils/sound';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMOJI_OPTIONS = ['💪', '📚', '🧘', '💧', '🏃', '✍️', '🎯', '💤', '🥗', '🚫', '🎵', '🧠', '🌅', '🔥', '⭐'];
const COLOR_OPTIONS = ['#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];

const PARTICLES = Array.from({ length: 30 }).map((_, i) => ({
  id: i,
  angle: Math.random() * Math.PI * 2,
  velocity: 50 + Math.random() * 150,
  size: 4 + Math.random() * 6,
  delay: Math.random() * 0.1,
  rotation: Math.random() * 360,
  rotationSpeed: (Math.random() - 0.5) * 720
}));

const ParticleExplosion = ({ color, x, y }: { color: string, x: number, y: number }) => {
  return (
    <div style={{ position: 'fixed', top: y, left: x, zIndex: 999999, pointerEvents: 'none' }}>
      {PARTICLES.map((p) => {
        const targetX = Math.cos(p.angle) * p.velocity;
        const targetY = Math.sin(p.angle) * p.velocity;
        return (
          <motion.div
            key={p.id}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{ 
              x: targetX, 
              y: targetY, 
              scale: [0, 1, 0], 
              opacity: [1, 1, 0],
              rotate: p.rotation + p.rotationSpeed
            }}
            transition={{ duration: 0.8, ease: "easeOut", delay: p.delay }}
            style={{
              position: 'absolute', width: p.size, height: p.size,
              backgroundColor: color, borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              boxShadow: `0 0 10px ${color}`
            }}
          />
        );
      })}
    </div>
  );
};

function getLast90Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(getLocalDateString(d));
  }
  return days;
}

function getStreak(logs: Set<string>, today: string): { current: number; longest: number } {
  let current = 0;
  let longest = 0;
  let streak = 0;
  const d = new Date(today);

  // Single-pass O(365) — walk backwards from today computing both values together
  for (let i = 0; i < 365; i++) {
    const dateStr = getLocalDateString(d);
    if (logs.has(dateStr)) {
      streak++;
      // Current streak: only contiguous days starting from today (or yesterday if today not yet logged)
      if (i === streak - 1) current = streak;
      longest = Math.max(longest, streak);
    } else {
      if (i === 0) {
        // ✅ BUG FIX: Today not yet logged — DON'T reset to 0 immediately.
        // Check if yesterday is logged (loop will handle i=1).
        // We treat "not logged today yet" as "streak is still alive from yesterday."
        // current stays 0 here — it'll be set to streak value when i=1 fires if yesterday is logged.
        // We do NOT set streak = 0 at i=0.
      } else {
        // A gap day (not today) — break the streak
        if (current === 0 && i === 1 && streak > 0) {
          // Yesterday was logged but today wasn't yet — current streak is from yesterday
          current = streak;
        }
        longest = Math.max(longest, streak);
        streak = 0;
      }
    }
    d.setDate(d.getDate() - 1);
  }
  longest = Math.max(longest, streak);
  return { current, longest };
}

export const HabitsModule = () => {
  const { habits: globalHabits, habitLogs: globalLogs, isLoading } = useGlobalData();
  const user = auth.currentUser;

  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
  const [confettiEvent, setConfettiEvent] = useState<{ x: number, y: number, color: string } | null>(null);

  // New habit form
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('💪');
  const [newColor, setNewColor] = useState('#7c3aed');
  const [newActiveDays, setNewActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const today = getLocalDateString(new Date());
  const last90 = useMemo(() => getLast90Days(), []);

  // Compute active habits
  const habits = useMemo(() => {
    return globalHabits.filter(h => !h.isArchived).sort((a, b) => a.createdAt - b.createdAt);
  }, [globalHabits]);

  // Compute logs for last 90 days
  const logs = useMemo(() => {
    const oldest = last90[last90.length - 1]; // getLast90Days returns [today, yesterday, ... 89 days ago]
    // Wait, last90 returns from oldest to newest! Let's check `getLast90Days`. It pushes from 89 down to 0, so oldest is at index 0.
    const actualOldest = last90[0];
    return globalLogs.filter(l => l.date >= actualOldest);
  }, [globalLogs, last90]);

  // Computed: logs grouped by habitId → Set of dates
  const logsByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    logs.forEach(l => {
      if (!map.has(l.habitId)) map.set(l.habitId, new Set());
      map.get(l.habitId)!.add(l.date);
    });
    return map;
  }, [logs]);

  const handleAddHabit = async () => {
    if (!user || !newName.trim()) return;
    try {
      await addDoc(collection(db, 'habits'), {
        userId: user.uid,
        name: newName.trim(),
        emoji: newEmoji,
        color: newColor,
        activeDays: newActiveDays,
        createdAt: Date.now(),
        isArchived: false,
      });
      toast.success(`${newEmoji} "${newName}" habit added!`);
      setNewName('');
      setNewEmoji('💪');
      setNewColor('#7c3aed');
      setNewActiveDays([0, 1, 2, 3, 4, 5, 6]);
      setShowAddModal(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to add habit');
    }
  };

  const toggleHabitDay = async (habitId: string, date: string, e?: React.MouseEvent) => {
    if (!user) return;
    const existingLog = logs.find(l => l.habitId === habitId && l.date === date);

    if (existingLog) {
      try {
        await deleteDoc(doc(db, 'habit_logs', existingLog.id!));
      } catch (e) {
        console.error(e);
        toast.error('Failed to uncheck habit');
      }
    } else {
      playPopSound();
      try {
        await addDoc(collection(db, 'habit_logs'), {
          userId: user.uid,
          habitId,
          date,
          completed: true,
        });
      } catch (e) {
        console.error(e);
        toast.error('Failed to check habit');
      }

      // Check if this completion hit a 7-day milestone
      if (date === today) {
        const habitLogs = logsByHabit.get(habitId) || new Set<string>();
        const { current } = getStreak(habitLogs, today);
        // 'current' reflects streak BEFORE this check since logsByHabit hasn't updated yet.
        // So new streak = current + 1
        const newStreak = current + 1;
        if (newStreak > 0 && newStreak % 7 === 0 && e) {
          toast.success(`🎉 ${newStreak} Day Streak!`);
          setConfettiEvent({ x: e.clientX, y: e.clientY, color: habits.find(h => h.id === habitId)?.color || '#10b981' });
          setTimeout(() => setConfettiEvent(null), 2000);
        }
      }
    }
  };

  const deleteHabit = async () => {
    try {
      await deleteDoc(doc(db, 'habits', deleteConfirm.id));
      // Also delete all logs for this habit
      const habitLogs = logs.filter(l => l.habitId === deleteConfirm.id);
      const batch = writeBatch(db);
      habitLogs.forEach(l => batch.delete(doc(db, 'habit_logs', l.id!)));
      await batch.commit();
      setDeleteConfirm({ isOpen: false, id: '' });
      toast.success('Habit deleted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete habit');
    }
  };

  // Get weeks for the heatmap header
  const weeks = useMemo(() => {
    const w: string[][] = [];
    let currentWeek: string[] = [];
    last90.forEach((day, i) => {
      const dayOfWeek = new Date(day).getDay();
      if (dayOfWeek === 0 && currentWeek.length > 0) {
        w.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
      if (i === last90.length - 1) w.push(currentWeek);
    });
    return w;
  }, [last90]);

  return (
    <div className="learning-container">
      {confettiEvent && <ParticleExplosion color={confettiEvent.color} x={confettiEvent.x} y={confettiEvent.y} />}
      <div className="page-header">
        <div className="page-header-info">
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: '2rem', fontWeight: 400, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Flame size={24} style={{ color: '#a78bfa' }} /> Habit Tracker
          </h1>
          <p className="subtitle" style={{ color: 'rgba(255,255,255,0.45)' }}>Build consistency. Track streaks. One day at a time.</p>
        </div>
        <div className="page-header-actions">
          <button onClick={() => setShowAddModal(true)} style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa', borderRadius: '0.6rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', transition: 'all 0.2s' }}>
            <Plus size={16} /> New Habit
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-xl)' }}>
              <div className="skeleton-line medium" />
              <div className="skeleton-line" style={{ height: '60px', marginTop: '0.5rem' }} />
            </div>
          ))}
        </div>
      ) : habits.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          No habits yet. Click "New Habit" to start tracking your daily routines!
        </div>
      ) : (
        <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
          <AnimatePresence>
          {habits.map(habit => {
            const habitLogs = logsByHabit.get(habit.id!) || new Set<string>();
            const { current, longest } = getStreak(habitLogs, today);
            const todayDone = habitLogs.has(today);
            const completedLast30 = last90.slice(-30).filter(d => habitLogs.has(d)).length;

            return (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={habit.id} 
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.875rem', overflow: 'visible', marginBottom: '0.45rem' }}
              >
                <div style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{habit.emoji}</span>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', margin: 0, fontWeight: 500 }}>{habit.name}</h3>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Flame size={12} /> {current}
                        </span>
                      </div>
                    </div>
                  </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {completedLast30}/30 days
                          </span>
                        </div>
                      </div>
                  {/* Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {/* Heatmap Grid */}
                    <div style={{ overflowX: 'auto', display: 'flex', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '2px', minWidth: 'fit-content' }}>
                        {weeks.map((week, wi) => (
                          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {week.map(day => {
                              const done = habitLogs.has(day);
                              const isToday = day === today;
                              const dayOfWeek = new Date(day).getDay();
                              const isActive = habit.activeDays.includes(dayOfWeek);
                              return (
                                <div
                                  key={day}
                                  onClick={(e) => isActive && toggleHabitDay(habit.id!, day, e)}
                                  title={`${day}${done ? ' ✓' : ''}`}
                                  style={{
                                    width: '18px', height: '18px',
                                    borderRadius: '4px',
                                    background: !isActive ? 'transparent' : done ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.05)',
                                    opacity: !isActive ? 0 : 1,
                                    cursor: isActive ? 'pointer' : 'default',
                                    border: done ? '1px solid rgba(52,211,153,0.5)' : '1px solid rgba(255,255,255,0.06)',
                                    transition: 'all 0.15s',
                                  }}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button
                        onClick={(e) => toggleHabitDay(habit.id!, today, e)}
                        style={{
                          width: '24px', height: '24px', borderRadius: '4px',
                          background: todayDone ? 'linear-gradient(135deg, #a78bfa, #60a5fa)' : 'rgba(255,255,255,0.03)',
                          border: todayDone ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
                          color: todayDone ? '#fff' : 'transparent',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        title={todayDone ? 'Uncheck today' : 'Check off today'}
                      >
                        <Check size={16} strokeWidth={3} />
                      </button>
                      <button className="btn-icon" onClick={() => setDeleteConfirm({ isOpen: true, id: habit.id! })} style={{ color: 'var(--text-muted)', padding: '0.3rem' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Add Habit Modal */}
      {showAddModal && (
        <div className="notes-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="notes-modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>New Habit</h2>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}><X size={20} /></button>
            </div>
            <div className="notes-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Habit Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g., Morning Workout, Read 30min..."
                  className="todo-input"
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Icon</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} onClick={() => setNewEmoji(e)} style={{
                      width: '36px', height: '36px', fontSize: '1.1rem', borderRadius: 'var(--radius-sm)',
                      border: newEmoji === e ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      background: newEmoji === e ? 'rgba(124,58,237,0.15)' : 'var(--bg-base)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{e}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Color</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)} style={{
                      width: '28px', height: '28px', borderRadius: '50%', background: c,
                      border: newColor === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                      cursor: 'pointer', boxShadow: newColor === c ? `0 0 8px ${c}60` : 'none',
                    }} />
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Active Days</label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {DAY_LABELS.map((label, i) => (
                    <button key={i} onClick={() => setNewActiveDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])} style={{
                      padding: '0.4rem 0.6rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)',
                      background: newActiveDays.includes(i) ? 'var(--accent-primary)' : 'var(--bg-base)',
                      color: newActiveDays.includes(i) ? '#fff' : 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)', cursor: 'pointer',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="notes-modal-footer">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAddHabit} disabled={!newName.trim()}>Create Habit</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm.isOpen}
        title="Delete Habit"
        message="This will permanently delete this habit and all its history. Continue?"
        onConfirm={deleteHabit}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '' })}
      />
    </div>
  );
};
