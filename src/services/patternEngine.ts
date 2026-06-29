/**
 * patternEngine.ts — Behavioral Learning Engine
 *
 * Derives a rich UserBehaviorProfile from the user's real interaction data.
 * Stored in Firestore user_profiles/{uid} for cross-device sync.
 * Cached in localStorage for instant read on every agent call.
 *
 * Profile fields:
 *   Core scheduling:
 *   - actualPeakHours        — hours with most task completions (real, not assumed)
 *   - morningStartTime       — earliest hour they consistently begin tasks
 *   - eveningCutoffTime      — latest hour they consistently complete tasks
 *   - preferredTaskBatchSize — how many tasks they finish in one sitting (median run)
 *   - lowActivityDays        — day-of-week with <20% completion rate
 *
 *   Quality + accuracy:
 *   - avgCompletionRatio     — actual_time / estimated_time (1.0 = on time, 1.5 = slow)
 *   - taskEstimationAccuracy — per-category mapping: { "coding": 1.8, "email": 0.9 }
 *   - rescheduleRate         — % of tasks that get snoozed/rescheduled (anxiety signal)
 *
 *   Avoidance + patterns:
 *   - snoozePatternTopics    — most-snoozed task keywords
 *   - avoidanceCategories    — categories with highest snooze rate
 *   - habitStreakPatterns     — { habitName: longestStreak, avgConsistency: 0-1 }
 *
 *   Communication:
 *   - emailResponseTimeMinutes — avg time from email received → task/action taken
 *
 *   Persona:
 *   - userPersona            — auto-detected: 'student'|'office_worker'|'entrepreneur'|'general'
 *   - avgDailyCompletedCount — baseline for daily load planning
 */

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserPersona = 'student' | 'office_worker' | 'entrepreneur' | 'general';

export interface HabitStreakData {
  name: string;
  longestStreak: number;
  avgConsistency: number; // 0.0 to 1.0
  lastCompleted: string | null;
}

export interface UserBehaviorProfile {
  // Core scheduling
  actualPeakHours: number[];
  morningStartTime: number;        // e.g. 8 for 8am
  eveningCutoffTime: number;       // e.g. 23 for 11pm
  preferredTaskBatchSize: number;  // median tasks per sitting
  lowActivityDays: number[];       // 0=Sun … 6=Sat

  // Accuracy
  avgCompletionRatio: number;
  taskEstimationAccuracy: Record<string, number>; // { "coding": 1.8, "email": 0.9 }
  rescheduleRate: number;          // 0.0 to 1.0

  // Avoidance
  snoozePatternTopics: string[];
  avoidanceCategories: string[];

  // Habits
  habitStreakPatterns: HabitStreakData[];

  // Communication
  emailResponseTimeMinutes: number;

  // Identity
  userPersona: UserPersona;
  avgDailyCompletedCount: number;
  derivedAt: string;
}

const LS_KEY = 'zen_behavior_profile';

const DEFAULT_PROFILE: UserBehaviorProfile = {
  actualPeakHours: [9, 10, 14, 15],
  morningStartTime: 9,
  eveningCutoffTime: 22,
  preferredTaskBatchSize: 3,
  lowActivityDays: [],
  avgCompletionRatio: 1.0,
  taskEstimationAccuracy: {},
  rescheduleRate: 0.2,
  snoozePatternTopics: [],
  avoidanceCategories: [],
  habitStreakPatterns: [],
  emailResponseTimeMinutes: 60,
  userPersona: 'general',
  avgDailyCompletedCount: 5,
  derivedAt: new Date().toISOString(),
};

// ── Persona Detection ─────────────────────────────────────────────────────────

const detectPersona = (appContext: any): UserPersona => {
  const attendanceSubjects: any[] = appContext?.attendanceSubjects || [];
  const lectureData: any[] = appContext?.lectureData || appContext?.lectures || [];
  const jobs: any[] = appContext?.jobs || [];
  const calendarEvents: any[] = appContext?.calendarEvents || [];
  const pomodoroSessions: any[] = appContext?.pomodoroSessions || [];

  // Student: tracks attendance or lectures, or heavy pomodoro usage
  const isStudent =
    attendanceSubjects.length > 0 ||
    lectureData.length > 0 ||
    pomodoroSessions.length > 15;

  if (isStudent) return 'student';

  // Entrepreneur: calendar-heavy + high email volume + lots of meetings
  const meetingEvents = calendarEvents.filter((e: any) =>
    /(meet|call|sync|standup|1:1|debrief|interview|client)/i.test(e.summary || '')
  );
  const isEntrepreneur =
    meetingEvents.length > 5 && jobs.filter((j: any) => j.status === 'interviewing').length === 0;

  if (isEntrepreneur) return 'entrepreneur';

  // Office worker: job applications + calendar + structured tasks
  const isOfficeWorker = jobs.length > 0 || calendarEvents.length > 3;
  if (isOfficeWorker) return 'office_worker';

  return 'general';
};

// ── Main Derivation ───────────────────────────────────────────────────────────

export const deriveUserBehaviorProfile = (appContext: any): UserBehaviorProfile => {
  const tasks: any[] = appContext?.tasks || [];
  const habits: any[] = appContext?.habits || [];
  const habitLogs: any[] = appContext?.habitLogs || [];
  const completed = tasks.filter((t: any) => t.status === 'completed');

  if (completed.length < 5) {
    // Not enough data — detect persona but keep defaults for the rest
    return { ...DEFAULT_PROFILE, userPersona: detectPersona(appContext), derivedAt: new Date().toISOString() };
  }

  // ── Peak productivity hours ─────────────────────────────────────────────
  const hourCounts: Record<number, number> = {};
  const completionHours: number[] = [];
  completed.forEach((t: any) => {
    const ts = t.completedAt || t.updatedAt;
    if (ts) {
      const hr = new Date(typeof ts === 'number' ? ts : (ts.toMillis?.() ?? ts)).getHours();
      hourCounts[hr] = (hourCounts[hr] || 0) + 1;
      completionHours.push(hr);
    }
  });
  const sortedHours = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([h]) => parseInt(h));
  const actualPeakHours = sortedHours.slice(0, 4).length > 0 ? sortedHours.slice(0, 4) : [9, 14];

  // ── Morning start + evening cutoff ─────────────────────────────────────
  const morningStartTime = completionHours.length > 0
    ? Math.min(...completionHours.filter(h => h >= 5 && h <= 13))
    : 9;
  const eveningCutoffTime = completionHours.length > 0
    ? Math.max(...completionHours.filter(h => h >= 16 && h <= 23))
    : 22;

  // ── Preferred task batch size ───────────────────────────────────────────
  // Group completions by date+hour to find typical "sitting" sizes
  const sittings: Record<string, number> = {};
  completed.forEach((t: any) => {
    const ts = t.completedAt || t.updatedAt;
    if (ts) {
      const d = new Date(typeof ts === 'number' ? ts : (ts.toMillis?.() ?? ts));
      const key = `${d.toISOString().split('T')[0]}_${Math.floor(d.getHours() / 2)}`; // 2h windows
      sittings[key] = (sittings[key] || 0) + 1;
    }
  });
  const sittingCounts = Object.values(sittings).sort((a, b) => a - b);
  const preferredTaskBatchSize = sittingCounts.length > 0
    ? sittingCounts[Math.floor(sittingCounts.length / 2)] // median
    : 3;

  // ── Low activity days ───────────────────────────────────────────────────
  const dayCompletions: Record<number, number> = {};
  const dayTotal: Record<number, number> = {};
  tasks.forEach((t: any) => {
    if (!t.date) return;
    const dow = new Date(t.date + 'T12:00:00').getDay();
    dayTotal[dow] = (dayTotal[dow] || 0) + 1;
    if (t.status === 'completed') dayCompletions[dow] = (dayCompletions[dow] || 0) + 1;
  });
  const lowActivityDays = Object.entries(dayTotal)
    .filter(([dow, total]) => {
      const completions = dayCompletions[parseInt(dow)] || 0;
      return total >= 3 && (completions / total) < 0.2;
    })
    .map(([dow]) => parseInt(dow));

  // ── Avg completion ratio ────────────────────────────────────────────────
  const withEstimates = completed.filter((t: any) => t.estimatedMinutes && t.actualMinutes);
  let avgCompletionRatio = 1.0;
  if (withEstimates.length >= 3) {
    const ratios = withEstimates.map((t: any) => t.actualMinutes / t.estimatedMinutes);
    avgCompletionRatio = parseFloat((ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2));
  }

  // ── Per-category estimation accuracy ───────────────────────────────────
  const taskEstimationAccuracy: Record<string, number> = {};
  const categoryRatios: Record<string, number[]> = {};
  withEstimates.forEach((t: any) => {
    const cat = (t.category || t.type || 'general').toLowerCase();
    if (!categoryRatios[cat]) categoryRatios[cat] = [];
    categoryRatios[cat].push(t.actualMinutes / t.estimatedMinutes);
  });
  Object.entries(categoryRatios).forEach(([cat, ratios]) => {
    if (ratios.length >= 2) {
      taskEstimationAccuracy[cat] = parseFloat((ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(2));
    }
  });

  // ── Reschedule rate ─────────────────────────────────────────────────────
  const rescheduled = tasks.filter((t: any) => (t.snoozeCount || 0) > 0 || t.rescheduled);
  const rescheduleRate = tasks.length > 0
    ? parseFloat((rescheduled.length / tasks.length).toFixed(2))
    : 0.2;

  // ── Snooze pattern topics ───────────────────────────────────────────────
  const highSnoozeTasks = tasks.filter((t: any) => (t.snoozeCount || 0) >= 2);
  const topicWordCounts: Record<string, number> = {};
  const categorySnooze: Record<string, number> = {};
  highSnoozeTasks.forEach((t: any) => {
    const words = (t.title || t.text || '').toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !['task', 'todo', 'this', 'that', 'with', 'from', 'have', 'make'].includes(w));
    words.forEach((w: string) => { topicWordCounts[w] = (topicWordCounts[w] || 0) + 1; });
    const cat = (t.category || 'general').toLowerCase();
    categorySnooze[cat] = (categorySnooze[cat] || 0) + 1;
  });
  const snoozePatternTopics = Object.entries(topicWordCounts)
    .sort(([, a], [, b]) => b - a).slice(0, 6).map(([w]) => w);
  const avoidanceCategories = Object.entries(categorySnooze)
    .sort(([, a], [, b]) => b - a).slice(0, 3).map(([c]) => c);

  // ── Habit streak patterns ───────────────────────────────────────────────
  const habitStreakPatterns: HabitStreakData[] = habits.slice(0, 8).map((h: any) => {
    const logs = habitLogs
      .filter((l: any) => l.habitId === h.id)
      .map((l: any) => l.date)
      .sort();
    let maxStreak = 0, curStreak = 0;
    let prevDate: Date | null = null;
    logs.forEach((dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00');
      if (prevDate) {
        const diff = (d.getTime() - prevDate.getTime()) / 86400000;
        if (diff === 1) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
        else curStreak = 1;
      } else {
        curStreak = 1;
      }
      prevDate = d;
    });
    const avgConsistency = logs.length > 0
      ? parseFloat((logs.length / Math.max(1, Math.ceil((Date.now() - new Date(logs[0] + 'T12:00:00').getTime()) / 86400000))).toFixed(2))
      : 0;
    return {
      name: h.name,
      longestStreak: maxStreak,
      avgConsistency: Math.min(1, avgConsistency),
      lastCompleted: logs[logs.length - 1] || null,
    };
  });

  // ── Email response time (approximate from task patterns) ────────────────
  // Look for tasks with "email" or "reply" in title that have completedAt data
  const emailTasks = completed.filter((t: any) =>
    /email|reply|respond|gmail|message/i.test(t.title || t.text || '')
  );
  let emailResponseTimeMinutes = 60;
  if (emailTasks.length >= 2 && emailTasks[0].createdAt && emailTasks[0].completedAt) {
    const times = emailTasks.map((t: any) => {
      const created = typeof t.createdAt === 'number' ? t.createdAt : (t.createdAt?.toMillis?.() ?? Date.now());
      const done    = typeof t.completedAt === 'number' ? t.completedAt : (t.completedAt?.toMillis?.() ?? Date.now());
      return Math.round((done - created) / 60000);
    }).filter(m => m > 0 && m < 1440); // ignore <0 or >24h
    if (times.length > 0) {
      emailResponseTimeMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    }
  }

  // ── Avg daily completed ─────────────────────────────────────────────────
  const completedByDay: Record<string, number> = {};
  completed.forEach((t: any) => {
    if (!t.date) return;
    completedByDay[t.date] = (completedByDay[t.date] || 0) + 1;
  });
  const dayCounts = Object.values(completedByDay);
  const avgDailyCompletedCount = dayCounts.length > 0
    ? parseFloat((dayCounts.reduce((a, b) => a + b, 0) / dayCounts.length).toFixed(1))
    : 5;

  return {
    actualPeakHours,
    morningStartTime: isFinite(morningStartTime) ? morningStartTime : 9,
    eveningCutoffTime: isFinite(eveningCutoffTime) ? eveningCutoffTime : 22,
    preferredTaskBatchSize: Math.max(1, Math.min(10, preferredTaskBatchSize)),
    lowActivityDays,
    avgCompletionRatio,
    taskEstimationAccuracy,
    rescheduleRate,
    snoozePatternTopics,
    avoidanceCategories,
    habitStreakPatterns,
    emailResponseTimeMinutes,
    userPersona: detectPersona(appContext),
    avgDailyCompletedCount,
    derivedAt: new Date().toISOString(),
  };
};

// ── Persistence ───────────────────────────────────────────────────────────────

export const saveBehaviorProfile = async (profile: UserBehaviorProfile): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    // Firestore (cross-device truth)
    await setDoc(
      doc(db, 'user_profiles', user.uid),
      { behaviorProfile: profile, updatedAt: serverTimestamp() },
      { merge: true }
    );
    // localStorage (instant read cache)
    localStorage.setItem(LS_KEY, JSON.stringify({ uid: user.uid, profile, savedAt: Date.now() }));
  } catch (err) {
    console.warn('[PatternEngine] Save failed (non-blocking):', err);
  }
};

export const loadBehaviorProfile = async (): Promise<UserBehaviorProfile> => {
  const user = auth.currentUser;
  if (!user) return DEFAULT_PROFILE;

  // 1. Try localStorage first (instant, offline)
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached.uid === user.uid && Date.now() - cached.savedAt < 3600_000) {
        // Fresh within 1h — use cache
        return cached.profile as UserBehaviorProfile;
      }
    }
  } catch { /* ignore */ }

  // 2. Fall back to Firestore
  try {
    const snap = await getDoc(doc(db, 'user_profiles', user.uid));
    if (snap.exists() && snap.data()?.behaviorProfile) {
      const profile = snap.data()!.behaviorProfile as UserBehaviorProfile;
      // Warm the cache
      localStorage.setItem(LS_KEY, JSON.stringify({ uid: user.uid, profile, savedAt: Date.now() }));
      return profile;
    }
  } catch { /* ignore */ }

  return DEFAULT_PROFILE;
};

// ── Context Formatters (per-agent role) ──────────────────────────────────────

export const formatProfileForAgent = (profile: UserBehaviorProfile): string => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const peakStr = profile.actualPeakHours
    .map(h => `${h}:00${h < 12 ? 'am' : 'pm'}`).join(', ');
  const lowDaysStr = profile.lowActivityDays.map(d => dayNames[d]).join(', ') || 'none';
  const lines = [
    '[USER BEHAVIOR PROFILE — Learned from real completion data]',
    `Persona: ${profile.userPersona.toUpperCase()}`,
    `Peak productivity hours: ${peakStr}`,
    `Work window: ${profile.morningStartTime}:00–${profile.eveningCutoffTime}:00`,
    `Preferred batch size: ${profile.preferredTaskBatchSize} tasks/sitting`,
    `Avg completion ratio: ${profile.avgCompletionRatio}x estimated time` +
      (profile.avgCompletionRatio > 1.2 ? ' (runs over — add buffer)' : ''),
    `Reschedule rate: ${Math.round(profile.rescheduleRate * 100)}%` +
      (profile.rescheduleRate > 0.35 ? ' (high — user struggles with back-to-back slots)' : ''),
    `Low activity days: ${lowDaysStr}${profile.lowActivityDays.length > 0 ? ' (schedule lighter)' : ''}`,
    `Avg tasks completed/day: ${profile.avgDailyCompletedCount}`,
    profile.snoozePatternTopics.length > 0
      ? `Frequently avoided topics: ${profile.snoozePatternTopics.join(', ')} (user procrastinates these)`
      : '',
    profile.avoidanceCategories.length > 0
      ? `Avoidance categories: ${profile.avoidanceCategories.join(', ')}`
      : '',
    `Email response time: ${profile.emailResponseTimeMinutes}min avg`,
  ].filter(Boolean);
  return lines.join('\n') + '\n';
};

/** Per-role compact behavioral directive injected as prefix to every agent instruction */
export const getBehavioralDirective = (profile: UserBehaviorProfile, role: string): string => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const peaks = profile.actualPeakHours.map(h => `${h}:00`).join(', ');
  const lowDays = profile.lowActivityDays.map(d => dayNames[d]).join(', ') || 'none';
  const buffer = profile.avgCompletionRatio > 1.0
    ? `${Math.round((profile.avgCompletionRatio - 1) * 100)}%` : 'none';
  const persona = profile.userPersona;

  const personaRules: Record<string, string> = {
    student:       'STUDENT persona: prioritize lecture/exam deadlines above all. Respect class schedules. Bunk tracking matters. Tone = honest, direct, peer-to-coach.',
    office_worker: 'OFFICE WORKER persona: respect meeting-heavy calendars. EOD/EOW deadlines are firm. Tone = professional, action-items first.',
    entrepreneur:  'ENTREPRENEUR persona: focus on high-leverage tasks. Batch communications. Protect deep work windows. Tone = direct, confident, minimal.',
    general:       'GENERAL persona: balanced approach. Prefer clear, friendly language. No jargon.',
  };

  switch (role) {
    case 'CHRONOS':
      return `[BEHAVIORAL DIRECTIVE — CHRONOS]
${personaRules[persona]}
Peak hours to prefer: ${peaks}. Work window: ${profile.morningStartTime}:00–${profile.eveningCutoffTime}:00.
Low activity days (schedule lighter): ${lowDays}.
Time buffer to add for this user: ${buffer} (actual/estimated ratio=${profile.avgCompletionRatio}x).
Preferred batch: ${profile.preferredTaskBatchSize} tasks per block. Reschedule rate: ${Math.round(profile.rescheduleRate * 100)}%.
RULE: Never book back-to-back${profile.rescheduleRate > 0.35 ? ' — user has high reschedule rate and needs breathing room' : ''}.
RULE: Always prefer peak hours ${peaks} for high-priority tasks.

`;

    case 'ARGUS':
      return `[BEHAVIORAL DIRECTIVE — ARGUS]
${personaRules[persona]}
Risk thresholds calibrated to this user:
  - CRITICAL threshold: ${persona === 'student' ? 'Any assignment/exam overdue' : 'High-priority overdue >4h'}.
  - HIGH threshold: Due today, not started, no free slot in peak hours ${peaks}.
  - Reschedule rate ${Math.round(profile.rescheduleRate * 100)}%: ${profile.rescheduleRate > 0.35 ? 'User struggles — be gentle but firm in alerts.' : 'User is reliable — alerts only when genuinely at risk.'}.
  - Avoidance topics (extra monitoring): ${profile.snoozePatternTopics.slice(0, 3).join(', ') || 'none'}.
RULE: Always name the specific task and deadline in notifications. Never send generic alerts.

`;

    case 'HERMES':
      return `[BEHAVIORAL DIRECTIVE — HERMES]
${personaRules[persona]}
Email response avg: ${profile.emailResponseTimeMinutes}min. 
${persona === 'student' ? 'For professors/teachers: apologetic, honest, specific. Never generic.' : ''}
${persona === 'office_worker' ? 'For managers/clients: concise, solution-focused, never emotional.' : ''}
${persona === 'entrepreneur' ? 'For partners/investors: direct, action-oriented, time-respecting.' : ''}
Avoidance topics (be careful when raising these): ${profile.snoozePatternTopics.slice(0, 3).join(', ') || 'none'}.
RULE: Draft must include specific task/project name. Never write placeholder text like "[Task Name]".
RULE: Always read the thread first before replying — use get_email_thread.

`;

    case 'ORACLE':
    case 'AEGIS':
      return `[BEHAVIORAL DIRECTIVE — ${role}]
${personaRules[persona]}
User profile: peaks at ${peaks}, works ${profile.morningStartTime}:00–${profile.eveningCutoffTime}:00.
Snooze patterns: ${profile.snoozePatternTopics.slice(0, 4).join(', ') || 'none'} — watch these topics carefully.
Estimation buffer: ${profile.avgCompletionRatio}x. Reschedule rate: ${Math.round(profile.rescheduleRate * 100)}%.
Habit consistency: ${profile.habitStreakPatterns.slice(0, 3).map(h => `${h.name} (${Math.round(h.avgConsistency * 100)}%)`).join(', ') || 'no habit data'}.
${role === 'AEGIS' ? `Report tone: ${persona === 'student' ? 'coach-like, encouraging, specific to student life' : persona === 'office_worker' ? 'executive summary, action-items first, numbers-driven' : persona === 'entrepreneur' ? 'high-signal, no fluff, what matters most' : 'friendly, clear, specific'}.` : ''}

`;

    case 'ATLAS':
      return `[BEHAVIORAL DIRECTIVE — ATLAS]
${personaRules[persona]}
Break projects into batches of ${profile.preferredTaskBatchSize} tasks max per day.
Schedule milestones in peak hours: ${peaks}.
Add ${buffer} buffer to all time estimates for this user.
Avoid scheduling heavy tasks on: ${lowDays}.

`;

    case 'ENIGMA':
      return `[BEHAVIORAL DIRECTIVE — ENIGMA]
${personaRules[persona]}
Baseline: user completes ${profile.avgDailyCompletedCount} tasks/day.
Completion ratio: ${profile.avgCompletionRatio}x — factor into velocity calculations.
Reschedule rate: ${Math.round(profile.rescheduleRate * 100)}% — factor into completion probability.
Peak productivity: ${peaks}.

`;

    default:
      return `[USER PERSONA: ${profile.userPersona.toUpperCase()} | Peak hours: ${peaks} | Buffer: ${buffer}]\n`;
  }
};

/**
 * Run the full PatternEngine pipeline:
 * derive → save → return formatted context string
 * Call this weekly from useProactiveAgent
 */
export const runPatternEngine = async (appContext: any): Promise<string> => {
  const profile = deriveUserBehaviorProfile(appContext);
  await saveBehaviorProfile(profile);
  return formatProfileForAgent(profile);
};
