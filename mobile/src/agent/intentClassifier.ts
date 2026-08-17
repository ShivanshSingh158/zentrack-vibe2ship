/**
 * intentClassifier.ts — ZenTrack Mobile SARA Engine v2
 *
 * Capability 2 — Intent-Ranked Context Injection (IRCI)
 *
 * A pure on-device intent classifier that runs BEFORE the main Gemini call.
 * Takes the user's message + optional behavioral fingerprint and returns a
 * ranked IntentProfile in < 5ms (zero API calls — keyword matching + heuristics).
 *
 * The IntentProfile is used by buildSelectiveContext() to inject ONLY the
 * relevant Firestore data domains — ~400 tokens instead of ~4000 tokens.
 *
 * Design principles:
 *   - Zero network calls — entirely synchronous keyword matching
 *   - Falls back to full context when confidence < 0.4 or urgency is 3
 *   - The fallback is intentional: for complex queries, full context is safer
 */

import { BehavioralFingerprint } from '../services/saraMemory';

// AppContext mirrors orchestrator.AppContext — defined here to avoid circular imports
// If you update AppContext in orchestrator.ts, update this too.
export interface AppContext {
  tasks?: any[];
  habits?: any[];
  habitLogs?: any[];
  notes?: any[];
  goals?: any[];
  gymLogs?: any[];
  attendance?: any[];
  assignments?: any[];
  customEvents?: any[];
  learningTopics?: any[];
  jobs?: any[];
  weeklyReviews?: any[];
  waterLogs?: any[];
  sleepLogs?: any[];
  googleAccessToken?: string;
  userId?: string;
  memorySummary?: string;
  notifSettingsSummary?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataDomain =
  | 'tasks'
  | 'habits'
  | 'goals'
  | 'calendar'
  | 'gym'
  | 'attendance'
  | 'grades'
  | 'assignments'
  | 'notes'
  | 'jobs'
  | 'finance'
  | 'wellbeing'
  | 'learning'
  | 'settings';

export interface IntentProfile {
  primaryDomains: DataDomain[];    // Top 1-3 relevant domains
  temporalScope: 'today' | 'week' | 'month' | 'unspecified';
  actionType: 'read' | 'write' | 'analyze' | 'plan';
  urgencyLevel: 1 | 2 | 3;        // 1=casual, 2=moderate, 3=urgent
  confidence: number;              // 0-1
  selectiveMode: boolean;          // true = inject only primaryDomains, false = full context
}

// ─── Keyword maps ─────────────────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<DataDomain, string[]> = {
  tasks: [
    'task', 'todo', 'to-do', 'work', 'complete', 'finish', 'done', 'pending',
    'deadline', 'due', 'overdue', 'backlog', 'priority', 'p1', 'p2', 'p3',
    'create task', 'add task', 'delete task', 'mark done', 'mark complete',
    'what do i have', 'what\'s due', 'what is due',
  ],
  habits: [
    'habit', 'streak', 'daily', 'log habit', 'consistency', 'track habit',
    'morning routine', 'routine', 'exercise streak', 'water', 'meditation',
    'habit done', 'mark habit', 'check habit', 'reading habit',
  ],
  goals: [
    'goal', 'objective', 'okr', 'target', 'milestone', 'aim', 'aspiration',
    'long term', 'monthly goal', 'quarterly', 'progress', 'achieve',
  ],
  calendar: [
    'calendar', 'event', 'schedule', 'appointment', 'meeting', 'class',
    'remind', 'when', 'what time', 'exam time', 'add event', 'free time',
    'slot', 'block time', 'today\'s events',
  ],
  gym: [
    'gym', 'workout', 'exercise', 'lift', 'run', 'cardio', 'push', 'pull',
    'legs', 'chest', 'back', 'shoulders', 'arms', 'sets', 'reps', 'weights',
    'bench', 'squat', 'deadlift', 'ppl', 'training session', 'log workout',
    'gym day', 'gym session', 'physical', 'fitness',
  ],
  attendance: [
    'attendance', 'attend', 'class', 'lecture', 'bunk', 'absent', 'present',
    'percentage', 'detain', 'eligib', 'subject attendance', 'how many classes',
    'missed class', 'mark present', 'mark absent',
  ],
  grades: [
    'grade', 'sgpa', 'cgpa', 'marks', 'score', 'gpa', 'semester', 'result',
    'subject grade', 'credits', 'how did i do', 'academic performance',
  ],
  assignments: [
    'assignment', 'submission', 'submit', 'homework', 'project', 'report',
    'pending assignment', 'due assignment', 'what\'s due', 'assignment due',
  ],
  notes: [
    'note', 'notes', 'write', 'save note', 'create note', 'jot down',
    'document', 'notebook', 'draft', 'memo', 'capture',
  ],
  jobs: [
    'job', 'internship', 'interview', 'resume', 'application', 'career',
    'apply', 'offer', 'rejection', 'hr round', 'placement', 'company',
    'job search', 'job status',
  ],
  finance: [
    'money', 'finance', 'budget', 'expense', 'spend', 'savings', 'cost',
  ],
  wellbeing: [
    'sleep', 'water', 'tired', 'rest', 'mood', 'stress', 'health', 'wellness',
    'mental', 'burnout', 'energy level', 'feel',
  ],
  learning: [
    'learn', 'learning', 'topic', 'lecture', 'study', 'course', 'module',
    'curriculum', 'roadmap', 'syllabus', 'revision', 'concept',
  ],
  settings: [
    'notification', 'notifications', 'notify', 'quiet hours', 'briefing',
    'briefing time', 'task buffer', 'reminder time', 'setting', 'settings',
    'turn off', 'turn on', 'mute', 'nudge', 'alert', 'streak risk',
  ],
};

const TEMPORAL_KEYWORDS = {
  today: ['today', 'tonight', 'now', 'this morning', 'this evening', 'right now', 'current', 'currently'],
  week: ['this week', 'week', 'weekly', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'weekend'],
  month: ['this month', 'monthly', 'month', 'semester', 'quarterly'],
};

const WRITE_KEYWORDS = [
  'create', 'add', 'set', 'log', 'mark', 'delete', 'remove', 'update', 'complete',
  'reschedule', 'move', 'change', 'edit', 'new', 'make', 'schedule',
];

const ANALYZE_KEYWORDS = [
  'analyze', 'analysis', 'how am i doing', 'trend', 'pattern', 'compare',
  'performance', 'stats', 'insight', 'review', 'summary',
];

const PLAN_KEYWORDS = [
  'plan', 'planning', 'strategy', 'organize', 'structure', 'prepare', 'roadmap',
  'prioritize', 'what should', 'help me with my day',
];

const URGENT_KEYWORDS = [
  'urgent', 'asap', 'immediately', 'right now', 'emergency', 'critical',
  'important', 'must', 'need to now', 'deadline today',
];

// ─── Core Classifier ──────────────────────────────────────────────────────────

/**
 * Classify the intent of a user message.
 * Runs in < 5ms — purely synchronous keyword matching + fingerprint heuristics.
 * Never makes any API call.
 */
export function classifyIntent(
  message: string,
  fingerprint?: BehavioralFingerprint | null
): IntentProfile {
  const lower = message.toLowerCase();

  // ── Domain scoring ────────────────────────────────────────────────────────
  const domainScores: Partial<Record<DataDomain, number>> = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [DataDomain, string[]][]) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        // Exact phrase match gets full score, word match gets partial
        score += kw.includes(' ') ? 2 : 1;
      }
    }
    if (score > 0) domainScores[domain] = score;
  }

  // Boost domains matching fingerprint patterns
  if (fingerprint) {
    if (fingerprint.upcomingDeadlineStress) {
      domainScores['assignments'] = (domainScores['assignments'] || 0) + 1;
      domainScores['calendar'] = (domainScores['calendar'] || 0) + 1;
    }
    if (fingerprint.consistentGymDays.length > 0) {
      domainScores['gym'] = (domainScores['gym'] || 0) + 0.5;
    }
    if (fingerprint.subjectsAtRisk.length > 0 && lower.includes('attendance')) {
      domainScores['attendance'] = (domainScores['attendance'] || 0) + 2;
    }
  }

  // Sort by score descending, take top 3
  const sorted = (Object.entries(domainScores) as [DataDomain, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([d]) => d);

  const primaryDomains: DataDomain[] = sorted.length > 0 ? sorted : ['tasks'];
  const totalScore = Object.values(domainScores).reduce((s, v) => s + v, 0);

  // ── Temporal scope ────────────────────────────────────────────────────────
  let temporalScope: IntentProfile['temporalScope'] = 'unspecified';
  if (TEMPORAL_KEYWORDS.today.some(kw => lower.includes(kw))) temporalScope = 'today';
  else if (TEMPORAL_KEYWORDS.week.some(kw => lower.includes(kw))) temporalScope = 'week';
  else if (TEMPORAL_KEYWORDS.month.some(kw => lower.includes(kw))) temporalScope = 'month';

  // ── Action type ───────────────────────────────────────────────────────────
  let actionType: IntentProfile['actionType'] = 'read';
  if (WRITE_KEYWORDS.some(kw => lower.includes(kw))) actionType = 'write';
  else if (ANALYZE_KEYWORDS.some(kw => lower.includes(kw))) actionType = 'analyze';
  else if (PLAN_KEYWORDS.some(kw => lower.includes(kw))) actionType = 'plan';

  // ── Urgency ───────────────────────────────────────────────────────────────
  let urgencyLevel: 1 | 2 | 3 = 1;
  if (URGENT_KEYWORDS.some(kw => lower.includes(kw))) urgencyLevel = 3;
  else if (actionType === 'write' || temporalScope === 'today') urgencyLevel = 2;

  // ── Confidence ────────────────────────────────────────────────────────────
  // High confidence = clear domain match + clear action + short message
  const hasStrongDomain = totalScore >= 3;
  const hasClearAction = actionType !== 'read';
  const isShortMessage = message.length < 80;
  const confidence = hasStrongDomain
    ? isShortMessage ? 0.9 : 0.75
    : hasClearAction ? 0.6
    : 0.35;

  // Selective mode: use reduced context when confident AND urgency < 3
  // For complex/ambiguous queries (confidence < 0.4) → fall back to full context
  const selectiveMode = confidence >= 0.4 && urgencyLevel < 3 && primaryDomains.length > 0;

  return {
    primaryDomains,
    temporalScope,
    actionType,
    urgencyLevel,
    confidence,
    selectiveMode,
  };
}

// ─── buildSelectiveContext ────────────────────────────────────────────────────

/**
 * Build a compact context string with ONLY the relevant data domains.
 * This replaces the full buildSystemPrompt() data dump.
 * Typical output: ~400 tokens vs ~4000 tokens for the full dump.
 */
export function buildSelectiveContext(
  ctx: AppContext,
  profile: IntentProfile
): string {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const domains = new Set(profile.primaryDomains);
  const lines: string[] = [];

  // Always inject today's date + temporal scope
  lines.push(`TODAY: ${todayISO} | SCOPE: ${profile.temporalScope} | ACTION: ${profile.actionType}`);

  if (domains.has('tasks')) {
    const pending = (ctx.tasks || []).filter(t => t.status !== 'completed').slice(0, 20).map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      date: t.date,
      timeSlot: t.timeSlot,
      subtasks: t.subtasks?.map((s: any) => ({ id: s.id, title: s.title, completed: s.completed })),
    }));
    const completedToday = (ctx.tasks || []).filter(
      t => t.status === 'completed' && t.completedAt?.startsWith?.(todayISO)
    ).slice(0, 5).map(t => ({ id: t.id, title: t.title }));
    lines.push(`\n📋 TASKS (${pending.length} pending):\n${JSON.stringify(pending)}`);
    if (completedToday.length) lines.push(`DONE TODAY: ${JSON.stringify(completedToday)}`);
  }

  if (domains.has('habits')) {
    const habits = (ctx.habits || []).slice(0, 15).map(h => ({
      id: h.id, name: h.name, streak: h.streak,
      doneToday: (ctx.habitLogs || []).some(l => l.habitId === h.id && l.date === todayISO),
    }));
    lines.push(`\n✅ HABITS:\n${JSON.stringify(habits)}`);
  }

  if (domains.has('goals')) {
    const goals = (ctx.goals || []).filter(g => g.status === 'active').slice(0, 8).map(g => ({
      id: g.id, title: g.title, progress: g.progress,
    }));
    lines.push(`\n🎯 ACTIVE GOALS:\n${JSON.stringify(goals)}`);
  }

  if (domains.has('calendar')) {
    const events = (ctx.customEvents || [])
      .filter(e => e.date >= todayISO).slice(0, 10)
      .map(e => ({ title: e.title, date: e.date, type: e.type, time: e.startTime }));
    lines.push(`\n📅 UPCOMING EVENTS:\n${JSON.stringify(events)}`);
  }

  if (domains.has('gym')) {
    const recent = (ctx.gymLogs || []).slice(-7).map(g => ({
      date: g.date, exercises: g.exercises?.length, cardio: g.cardio?.length,
    }));
    lines.push(`\n💪 GYM LOGS (last 7):\n${JSON.stringify(recent)}`);
  }

  if (domains.has('attendance')) {
    const subjects = (ctx.attendance || []).slice(0, 15).map(s => ({
      id: s.id, name: s.name,
      pct: s.classesTotal > 0 ? Math.round((s.classesAttended / s.classesTotal) * 100) : 0,
      attended: s.classesAttended, total: s.classesTotal,
    }));
    lines.push(`\n📚 ATTENDANCE:\n${JSON.stringify(subjects)}`);
  }

  if (domains.has('assignments')) {
    const pending = (ctx.assignments || [])
      .filter(a => a.status !== 'submitted' && a.status !== 'graded').slice(0, 10)
      .map(a => ({ id: a.id, title: a.title, subject: a.subjectName, due: a.dueDate }));
    lines.push(`\n📌 PENDING ASSIGNMENTS:\n${JSON.stringify(pending)}`);
  }

  if (domains.has('notes')) {
    const notes = (ctx.notes || []).slice(0, 6).map(n => ({
      id: n.id, title: n.title, preview: n.content?.slice(0, 80),
    }));
    lines.push(`\n📝 NOTES:\n${JSON.stringify(notes)}`);
  }

  if (domains.has('jobs')) {
    const jobs = (ctx.jobs || []).slice(0, 8).map(j => ({
      company: j.company, role: j.role, status: j.status,
    }));
    lines.push(`\n💼 JOBS:\n${JSON.stringify(jobs)}`);
  }

  if (domains.has('learning')) {
    const topics = (ctx.learningTopics || []).slice(0, 6).map(t => ({
      id: t.id, title: t.title, tasks: t.subTasks?.length,
    }));
    lines.push(`\n🧠 LEARNING:\n${JSON.stringify(topics)}`);
  }

  if (domains.has('settings') || ctx.notifSettingsSummary) {
    if (ctx.notifSettingsSummary) lines.push(`\n${ctx.notifSettingsSummary}`);
  }

  return lines.join('\n');
}

// ─── Helper: Domain → short label for reasoning feed ─────────────────────────

export function domainToReasoningLabel(domain: DataDomain): string {
  const map: Record<DataDomain, string> = {
    tasks: '📋 Reading your tasks...',
    habits: '🔥 Checking habit streaks...',
    goals: '🎯 Reviewing your goals...',
    calendar: '📅 Checking your calendar...',
    gym: '💪 Loading gym data...',
    attendance: '📚 Checking attendance records...',
    grades: '📊 Reading your grades...',
    assignments: '📌 Scanning pending assignments...',
    notes: '📝 Reading your notes...',
    jobs: '💼 Loading job applications...',
    finance: '💰 Checking financial data...',
    wellbeing: '❤️ Checking wellbeing logs...',
    learning: '🧠 Loading learning topics...',
    settings: '⚙️ Reading notification settings...',
  };
  return map[domain] || `📂 Loading ${domain} data...`;
}
