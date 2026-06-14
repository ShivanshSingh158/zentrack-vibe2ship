import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  collection, query, where,
  getDocs, addDoc, updateDoc, doc,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { WeeklyReview } from '../../types/index';
import { AIWeeklyReviewWizard } from '../review/AIWeeklyReviewWizard';
import { getLocalDateString } from '../../utils/dateUtils';

function getWeekBounds(referenceDate: Date): { start: string; end: string; label: string } {
  const d = new Date(referenceDate);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) => getLocalDateString(x);
  const label = `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return { start: fmt(mon), end: fmt(sun), label };
}

/**
 * Fetch week stats using real-time snapshots to always stay in sync.
 * Returns a combined stats object from all relevant Firestore collections.
 */
async function fetchWeekStats(userId: string, start: string, end: string) {
  try {
    const [todoSnap, logSnap, learnSnap, habitLogSnap, habitSnap, goalSnap, gymSnap] = await Promise.allSettled([
      getDocs(query(collection(db, 'todos'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'daily_logs'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'learning_topics'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'habit_logs'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'habits'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'goals'), where('userId', '==', userId), where('status', '==', 'active'))),
      getDocs(query(collection(db, 'gymLogs'), where('userId', '==', userId))),
    ]);

    // Safe extraction — if a collection fails, use empty defaults
    const todos = todoSnap.status === 'fulfilled'
      ? todoSnap.value.docs.map(d => d.data()).filter(t => t.date && t.date >= start && t.date <= end)
      : [];
    const logs = logSnap.status === 'fulfilled'
      ? logSnap.value.docs.map(d => d.data()).filter(l => l.date && l.date >= start && l.date <= end)
      : [];
    const learnDocs = learnSnap.status === 'fulfilled' ? learnSnap.value.docs : [];
    const habitLogs = habitLogSnap.status === 'fulfilled'
      ? habitLogSnap.value.docs.map(d => d.data()).filter((data: any) => data.date && data.date >= start && data.date <= end)
      : [];
    const habits = habitSnap.status === 'fulfilled' ? habitSnap.value.docs : [];
    const goals = goalSnap.status === 'fulfilled' ? goalSnap.value : { size: 0 };
    const gymLogs = gymSnap.status === 'fulfilled'
      ? gymSnap.value.docs.map(d => d.data()).filter((l: any) => l.date && l.date >= start && l.date <= end)
      : [];

    const todosCompleted = todos.filter(t => t.isCompleted).length;
    const todosEstimatedMinutes = todos.filter(t => t.isCompleted).reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
    const productiveHoursFromLogs = logs.reduce((s, l) => s + parseFloat(l.productiveHours || '0'), 0);
    const waterIntakeTotal = logs.reduce((s, l) => s + (l.waterIntakeLiters || 0), 0);
    const productiveHours = productiveHoursFromLogs + todosEstimatedMinutes / 60;

    let learningSubtasksDone = 0, learningSubtasksTotal = 0;
    learnDocs.forEach(d => {
      const st = d.data().subTasks || [];
      learningSubtasksTotal += st.length;
      learningSubtasksDone += st.filter((s: any) => s.isCompleted).length;
    });

    const habitsDone = habitLogs.filter((d: any) => d.completed).length;
    const activeHabitsCount = habits.filter(d => d.data().isArchived !== true).length;
    const habitsAssigned = activeHabitsCount * 7;

    const workoutsCompleted = gymLogs.filter((g: any) => g.exercises && g.exercises.length > 0).length;
    let totalCardioKm = 0;
    gymLogs.forEach((g: any) => {
       if (g.cardio) {
          totalCardioKm += g.cardio.reduce((sum: number, c: any) => sum + (Number(c.distanceKm) || 0), 0);
       }
    });

    return {
      todosCompleted,
      todosTotal: todos.length,
      productiveHours: Math.round(productiveHours * 10) / 10,
      learningSubtasksDone,
      learningSubtasksTotal,
      habitsDone,
      habitsAssigned,
      waterIntakeTotal: Math.round(waterIntakeTotal * 10) / 10,
      goalsActive: 'size' in goals ? goals.size : 0,
      workoutsCompleted,
      cardioKmTotal: Math.round(totalCardioKm * 10) / 10,
    };
  } catch (e) {
    console.error('[WeeklyReview] fetchWeekStats error:', e);
    return {
      todosCompleted: 0, todosTotal: 0, productiveHours: 0,
      learningSubtasksDone: 0, learningSubtasksTotal: 0,
      habitsDone: 0, habitsAssigned: 0, waterIntakeTotal: 0, goalsActive: 0,
      workoutsCompleted: 0, cardioKmTotal: 0,
    };
  }
}

// Extract StatPill out of render to prevent remounting
const StatPill = ({ label, value, emoji }: { label: string; value: number | string; emoji: string }) => (
  <div style={{
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
    padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 150px',
  }}>
    <span style={{ fontSize: '1.3rem' }}>{emoji}</span>
    <div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
    </div>
  </div>
);

export const WeeklyReviewModule = () => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const [wentWell, setWentWell] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [nextWeekPriorities, setNextWeekPriorities] = useState('');
  const [gratitude, setGratitude] = useState('');
  const [aiChatHistory, setAiChatHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<WeeklyReview['stats']>();

  // Stable user uid to prevent effect re-runs
  const userId = auth.currentUser?.uid;
  const isMounted = useRef(true);
  // Debounce timer for stat refresh triggered by live snapshot changes
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refDate = new Date();
  refDate.setDate(refDate.getDate() + weekOffset * 7);
  const week = getWeekBounds(refDate);
  const isCurrentWeek = weekOffset === 0;

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Track online/offline
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Load/reload review + stats whenever week changes ─────────────────────────
  useEffect(() => {
    const run = async () => {
      if (!userId) { setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'weekly_reviews'),
          where('userId', '==', userId),
          where('weekStart', '==', week.start)
        );
        const [snap, autoStats] = await Promise.all([
          getDocs(q),
          fetchWeekStats(userId, week.start, week.end),
        ]);

        if (!isMounted.current) return;

        if (!snap.empty) {
          const data = snap.docs[0].data() as WeeklyReview;
          setReview(data);
          setReviewId(snap.docs[0].id);
          setWentWell(data.wentWell || '');
          setToImprove(data.toImprove || '');
          setNextWeekPriorities(data.nextWeekPriorities || '');
          setGratitude(data.gratitude || '');
          setAiChatHistory(data.aiChatHistory || []);
        } else {
          setReview(null); setReviewId(null);
          setWentWell(''); setToImprove('');
          setNextWeekPriorities(''); setGratitude('');
          setAiChatHistory([]);
        }
        setStats(autoStats);
        setLastSyncedAt(new Date());
      } catch (e) {
        console.error('[WeeklyReview] load error:', e);
        if (isMounted.current) toast.error('Could not load this week\'s data. Please check your connection.');
      }
      if (isMounted.current) setIsLoading(false);
    };

    run();
  }, [userId, week.start, week.end]);

  // ── Live sync: re-fetch stats when ANY relevant collection changes ──────────
  // Debounced so a single write doesn't trigger 7 parallel fetches
  useEffect(() => {
    if (!userId || !isCurrentWeek) return; // Only live-sync current week

    const unsubs: (() => void)[] = [];

    const triggerStatRefresh = () => {
      if (!isMounted.current) return;
      // Cancel any pending refresh — debounce by 600ms
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        if (!isMounted.current) return;
        fetchWeekStats(userId, week.start, week.end).then(freshStats => {
          if (isMounted.current) {
            setStats(freshStats);
            setLastSyncedAt(new Date());
          }
        }).catch(err => console.warn('[WeeklyReview] stat refresh error:', err));
      }, 600);
    };

    // Subscribe to all collections that affect weekly stats
    const collections = ['todos', 'daily_logs', 'habit_logs', 'habits', 'learning_topics', 'goals', 'gymLogs'];
    collections.forEach(col => {
      unsubs.push(onSnapshot(
        query(collection(db, col), where('userId', '==', userId)),
        () => triggerStatRefresh(),
        err => console.warn(`[WeeklyReview] ${col} snapshot error:`, err)
      ));
    });

    return () => {
      unsubs.forEach(u => u());
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, [userId, week.start, week.end, isCurrentWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh on window focus (user switches tab and comes back) ───────────────
  const refreshStats = useCallback(async (silent = false) => {
    if (!userId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const fresh = await fetchWeekStats(userId, week.start, week.end);
      if (isMounted.current) {
        setStats(fresh);
        setLastSyncedAt(new Date());
        if (!silent) toast.success('Stats refreshed!');
      }
    } catch {
      if (!silent) toast.error('Could not refresh stats. Please check your connection.');
    } finally {
      if (isMounted.current) setIsRefreshing(false);
    }
  }, [userId, week.start, week.end, isRefreshing]);

  useEffect(() => {
    const onFocus = () => refreshStats(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshStats]);

  // ── Save handler ─────────────────────────────────────────────────────────────
  const handleSave = async (reviewData: {
    wentWell: string; toImprove: string; nextWeekPriorities: string;
    gratitude: string; aiChatHistory: any[];
  }) => {
    if (!userId) return toast.error('You must be logged in.');
    setIsSaving(true);

    const payload: Partial<WeeklyReview> = {
      userId,
      weekStart: week.start,
      weekEnd: week.end,
      wentWell: reviewData.wentWell || wentWell,
      toImprove: reviewData.toImprove || toImprove,
      nextWeekPriorities: reviewData.nextWeekPriorities || nextWeekPriorities,
      gratitude: reviewData.gratitude || gratitude,
      aiChatHistory: reviewData.aiChatHistory,
      stats,
      createdAt: review?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // Retry up to 2 times on save failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (reviewId) {
          await updateDoc(doc(db, 'weekly_reviews', reviewId), payload);
        } else {
          const ref = await addDoc(collection(db, 'weekly_reviews'), payload);
          if (isMounted.current) setReviewId(ref.id);
        }
        toast.success('✅ Weekly review saved!');
        setIsSaving(false);
        return;
      } catch (e: any) {
        if (attempt < 1) {
          await new Promise(r => setTimeout(r, 1500));
        } else {
          console.error('[WeeklyReview] save error:', e);
          toast.error('Failed to save review. Please try again.');
        }
      }
    }
    setIsSaving(false);
  };

  // Suppress unused isSaving warning (used in button disabled state below if we add it)
  void isSaving;

  return (
    <div className="learning-container">
      <div className="learning-header">
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarCheck size={24} className="logo-icon" /> Weekly Review
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Reflect. Learn. Plan the next week.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Sync status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: isOnline ? '#10b981' : '#ef4444' }}>
            {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{isOnline ? (isCurrentWeek ? 'Live' : 'Synced') : 'Offline'}</span>
            {lastSyncedAt && isOnline && (
              <span style={{ color: 'var(--text-muted)' }}>
                · {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <button
            className="btn-secondary"
            onClick={() => refreshStats(false)}
            disabled={isRefreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Stats'}
          </button>
        </div>
      </div>

      {/* Week Navigator */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)', padding: '0.75rem 1.5rem',
      }}>
        <button className="btn-icon" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft size={20} /></button>
        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '220px', textAlign: 'center' }}>
          {week.label} {isCurrentWeek && <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>(This Week)</span>}
        </span>
        <button className="btn-icon" onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= 0}><ChevronRight size={20} /></button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />)}
        </div>
      ) : (
        <>
          {/* Auto-Generated Live Stats */}
          {stats && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  This Week's Stats {isCurrentWeek && <span style={{ color: '#10b981' }}>· Live</span>}
                </h3>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                <StatPill emoji="✅" label="Tasks Completed" value={`${stats.todosCompleted}/${stats.todosTotal}`} />
                <StatPill emoji="⏱️" label="Productive Hours" value={stats.productiveHours} />
                <StatPill emoji="📚" label="Learning Tasks Done" value={`${stats.learningSubtasksDone}/${stats.learningSubtasksTotal}`} />
                <StatPill emoji="🔥" label="Habit Check-ins" value={`${stats.habitsDone}/${stats.habitsAssigned}`} />
                <StatPill emoji="💧" label="Water Intake (L)" value={stats.waterIntakeTotal} />
                <StatPill emoji="🏋️" label="Workouts" value={stats.workoutsCompleted || 0} />
                <StatPill emoji="🏃" label="Cardio (km)" value={stats.cardioKmTotal || 0} />
                <StatPill emoji="🎯" label="Active Goals" value={stats.goalsActive} />
              </div>
            </div>
          )}

          {/* AI Review Wizard — keyed by week.start so it re-mounts (and starts fresh chat session) on week change */}
          <div style={{ marginTop: '1.5rem' }}>
            <AIWeeklyReviewWizard
              key={week.start}
              userData={{ stats, week: week.label, isCurrentWeek }}
              savedChatHistory={aiChatHistory}
              weekStart={week.start}
              onSave={handleSave}
            />
          </div>
        </>
      )}
    </div>
  );
};
