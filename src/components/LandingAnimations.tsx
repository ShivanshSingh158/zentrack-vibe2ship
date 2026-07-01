import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Calendar, HardDrive, FileText, CheckSquare, MonitorPlay,
  BrainCircuit, CheckCircle2, Circle, Flame, AlertCircle, BookOpen
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════════════
   SHARED DATA
══════════════════════════════════════════════════════════════════════════════ */

const G_SERVICES = [
  { name: 'Calendar', Icon: Calendar,    color: '#4285F4', x: 200, y: 50,  count: '8 events'  },
  { name: 'Docs',     Icon: FileText,    color: '#34A853', x: 330, y: 118, count: '6 docs'    },
  { name: 'Drive',    Icon: HardDrive,   color: '#FBBC04', x: 330, y: 262, count: '14 files'  },
  { name: 'YouTube',  Icon: MonitorPlay,  color: '#FF0000', x: 200, y: 330, count: '4 videos'  },
  { name: 'Tasks',    Icon: CheckSquare, color: '#1a73e8', x: 70,  y: 262, count: '31 tasks'  },
  { name: 'Gmail',    Icon: Mail,        color: '#EA4335', x: 70,  y: 118, count: '23 emails' },
];
const CX = 200, CY = 190;

/* ══════════════════════════════════════════════════════════════════════════════
   1. PROACTIVE AGENT ANIMATION  –  trigger chain timeline
══════════════════════════════════════════════════════════════════════════════ */

const TRIGGER_EVENTS = [
  { time: '09:14', service: 'Gmail',    Icon: Mail,        color: '#EA4335', event: '"Meeting request from Sarah Chen"',       ai: 'High Priority · Action Required'     },
  { time: '09:14', service: 'AI Agent', Icon: BrainCircuit,color: '#a78bfa', event: 'Analysing intent, urgency & context',     ai: 'Confidence: 97% · Routing now'        },
  { time: '09:15', service: 'Calendar', Icon: Calendar,    color: '#4285F4', event: 'Focus block reserved for prep',            ai: '10:00 – 12:00 · Notifications muted'  },
  { time: '09:15', service: 'Tasks',    Icon: CheckSquare, color: '#1a73e8', event: '"Prepare slides for product meeting"',     ai: '🔴 P1 · Due 12:00pm · AI-assigned'   },
  { time: '09:16', service: 'Docs',     Icon: FileText,    color: '#34A853', event: 'Meeting agenda auto-generated',            ai: 'Ready for your review'               },
];

export const ProactiveAgentAnimation: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    TRIGGER_EVENTS.forEach((_, i) => timers.push(setTimeout(() => setCount(i + 1), i * 950 + 200)));
    timers.push(setTimeout(() => setCount(0), TRIGGER_EVENTS.length * 950 + 2600));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Header */}
      <div className="liquid-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BrainCircuit size={14} color="#a78bfa" />
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Proactive Trigger Chain</span>
        </div>
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '2px 10px', borderRadius: 999, border: '1px solid rgba(52,211,153,0.2)' }}>
          <Circle size={5} fill="#34d399" color="#34d399" /> LIVE
        </motion.div>
      </div>

      {/* Event chain */}
      <div className="liquid-glass" style={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.08)', padding: '1rem', minHeight: 270 }}>
        <AnimatePresence>
          {TRIGGER_EVENTS.slice(0, count).map((ev, i) => {
            const { Icon } = ev;
            const isCurrent = i === count - 1;
            return (
              <motion.div key={i}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'flex', gap: '0.65rem', paddingBottom: '0.75rem', position: 'relative' }}
              >
                {i < TRIGGER_EVENTS.length - 1 && <div style={{ position: 'absolute', left: 15, top: 32, bottom: 0, width: 1, background: 'rgba(255,255,255,0.06)' }} />}
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${ev.color}1a`, border: `1.5px solid ${ev.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                  <Icon size={14} color={ev.color} />
                </div>
                <div style={{ flex: 1, paddingTop: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 2 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: ev.color }}>{ev.service}</span>
                    <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)' }}>{ev.time}</span>
                    {isCurrent && (
                      <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }}
                        style={{ fontSize: '0.58rem', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', padding: '1px 6px', borderRadius: 999 }}>processing…</motion.span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>{ev.event}</div>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{ev.ai}</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {count === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 230, gap: '0.5rem' }}>
            <motion.div animate={{ opacity: [0.2, 0.7, 0.2] }} transition={{ duration: 2, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#a78bfa' }} />
            <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.18)' }}>Watching for triggers…</span>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {[{ v: '12', l: 'Triggered Today', c: '#a78bfa' }, { v: '2.4h', l: 'Time Saved', c: '#60a5fa' }, { v: '31', l: 'Actions Taken', c: '#34d399' }].map((m, i) => (
          <div key={i} className="liquid-glass" style={{ flex: 1, borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.07)', padding: '0.65rem 0.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: m.c, fontFamily: 'monospace', lineHeight: 1 }}>{m.v}</div>
            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{m.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   2. GOOGLE WORKSPACE INTEGRATION  –  hub + spoke SVG with traveling dots
══════════════════════════════════════════════════════════════════════════════ */

export const WorkspaceIntegrationAnimation: React.FC = () => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % G_SERVICES.length), 1300);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Status bar */}
      <div className="liquid-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Google Workspace · Live Sync</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', color: '#4285F4' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid #4285F4', borderTopColor: 'transparent' }} />
          Syncing
        </div>
      </div>

      {/* Hub */}
      <div className="liquid-glass" style={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative', width: '100%', aspectRatio: '400/390' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '30px 30px' }} />

        {/* SVG: lines + traveling dots */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 400 390" preserveAspectRatio="xMidYMid meet">
          {G_SERVICES.map((s, i) => {
            const isActive = i === active;
            return (
              <g key={i}>
                <motion.line x1={s.x} y1={s.y} x2={CX} y2={CY}
                  stroke={s.color} strokeWidth={isActive ? 1.5 : 0.7} strokeDasharray="5 4"
                  animate={{ opacity: isActive ? [0.3, 0.85, 0.3] : 0.12 }}
                  transition={{ duration: 1.5, repeat: Infinity }} />
                {isActive && (
                  <motion.circle r={4} fill={s.color}
                    animate={{ cx: [s.x, CX], cy: [s.y, CY], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 1.0, ease: 'easeInOut', repeat: Infinity }} />
                )}
              </g>
            );
          })}
          <motion.circle cx={CX} cy={CY} r={42} fill="none" stroke="rgba(167,139,250,0.15)" strokeWidth={1.5}
            animate={{ r: [40, 48, 40] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
          <circle cx={CX} cy={CY} r={42} fill="rgba(167,139,250,0.06)" />
        </svg>

        {/* Service bubbles */}
        {G_SERVICES.map((s, i) => {
          const { Icon } = s;
          const isActive = i === active;
          return (
            <div key={i} style={{ position: 'absolute', left: `${(s.x / 400) * 100}%`, top: `${(s.y / 390) * 100}%`, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, zIndex: 2 }}>
              <motion.div
                animate={{ boxShadow: isActive ? [`0 0 0px ${s.color}00`, `0 0 22px ${s.color}55`, `0 0 0px ${s.color}00`] : '0 0 0px transparent' }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ width: 46, height: 46, borderRadius: '50%', background: `${s.color}1a`, border: `1.5px solid ${s.color}${isActive ? '80' : '30'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={s.color} />
              </motion.div>
              <span style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{s.name}</span>
              <AnimatePresence>
                {isActive && (
                  <motion.span key="count" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    style={{ fontSize: '0.5rem', color: s.color, background: `${s.color}18`, padding: '1px 5px', borderRadius: 999 }}>
                    {s.count}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Center */}
        <div style={{ position: 'absolute', left: `${(CX / 400) * 100}%`, top: `${(CY / 390) * 100}%`, transform: 'translate(-50%, -50%)', zIndex: 3 }}>
          <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="liquid-glass"
            style={{ width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(255,255,255,0.2)', boxShadow: '0 0 32px rgba(167,139,250,0.25)' }}>
            <img src="/logo_white.png" alt="ZenTrack" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          </motion.div>
        </div>
      </div>

      {/* Service mini-badges */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {G_SERVICES.map((s, i) => {
          const { Icon } = s;
          return (
            <div key={i} className="liquid-glass" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.65rem', borderRadius: 999, border: `1px solid ${s.color}25` }}>
              <Icon size={11} color={s.color} />
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)' }}>{s.name}</span>
              <span style={{ fontSize: '0.58rem', color: s.color }}>{s.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   3. SMART TASKS ANIMATION  –  AI kanban + priority scoring
══════════════════════════════════════════════════════════════════════════════ */

const COLUMNS = [
  { label: 'AI Inbox', color: '#a78bfa', tasks: [
    { title: 'Prepare Q3 slides', from: 'Gmail',    priority: 'P1', score: 94 },
    { title: 'Review PRD doc',    from: 'Docs',     priority: 'P2', score: 71 },
  ]},
  { label: 'In Progress', color: '#60a5fa', tasks: [
    { title: 'Team standup prep',    from: 'Calendar', priority: 'P1', score: 88 },
    { title: 'Update habit tracker', from: 'Tasks',    priority: 'P3', score: 42 },
  ]},
  { label: 'Done Today', color: '#34d399', tasks: [
    { title: 'Morning email triage', from: 'Gmail',    priority: 'P2', score: 65 },
    { title: 'Block focus time',     from: 'Calendar', priority: 'P1', score: 91 },
  ]},
];
const PRIORITY_COLORS: Record<string, string> = { P1: '#ef4444', P2: '#f59e0b', P3: '#22c55e' };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SOURCE_ICONS: Record<string, any> = { Gmail: Mail, Calendar, Docs: FileText, Tasks: CheckSquare };
const SOURCE_COLORS: Record<string, string> = { Gmail: '#EA4335', Calendar: '#4285F4', Docs: '#34A853', Tasks: '#1a73e8' };

export const SmartTasksAnimation: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const on = setInterval(() => {
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 2200);
    }, 4500);
    return () => clearInterval(on);
  }, []);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <AnimatePresence>
        {showBanner && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 1rem', borderRadius: '0.75rem', background: 'rgba(234,67,53,0.1)', border: '1px solid rgba(234,67,53,0.25)' }}>
            <Mail size={14} color="#EA4335" />
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', flex: 1 }}>
              Gmail → AI creating: <strong style={{ color: 'white' }}>"Review investor update draft"</strong>
            </span>
            <span style={{ fontSize: '0.62rem', color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '1px 8px', borderRadius: 999, flexShrink: 0 }}>🔴 P1</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', gap: '0.55rem' }}>
        {COLUMNS.map((col, ci) => (
          <div key={ci} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${col.color}22` }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</span>
            </div>
            {col.tasks.map((task, ti) => {
              const SrcIcon = SOURCE_ICONS[task.from] || Mail;
              const pColor = PRIORITY_COLORS[task.priority] || '#fff';
              return (
                <motion.div key={ti}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (ci * 2 + ti) * 0.06 }}
                  whileHover={{ scale: 1.02 }}
                  className="liquid-glass"
                  style={{ borderRadius: '0.65rem', border: '1px solid rgba(255,255,255,0.08)', padding: '0.65rem 0.7rem' }}>
                  <div style={{ fontSize: '0.71rem', color: 'rgba(255,255,255,0.85)', marginBottom: '0.45rem', lineHeight: 1.35 }}>{task.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <SrcIcon size={10} color={SOURCE_COLORS[task.from]} />
                      <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.28)' }}>{task.from}</span>
                    </div>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: pColor, background: `${pColor}18`, padding: '1px 5px', borderRadius: 999 }}>{task.priority}</span>
                  </div>
                  <div style={{ marginTop: '0.4rem', height: 2, borderRadius: 999, background: 'rgba(255,255,255,0.05)' }}>
                    <motion.div style={{ height: '100%', borderRadius: 999, background: pColor }}
                      initial={{ width: 0 }} animate={{ width: `${task.score}%` }}
                      transition={{ duration: 0.85, delay: (ci * 2 + ti) * 0.08 + 0.2 }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   4. FLOW STATE ANIMATION  –  breathing circle + habit grid + life saver
══════════════════════════════════════════════════════════════════════════════ */

const HABITS = [
  { name: 'Deep Work',    emoji: '🧠', streak: 12, week: [1,1,1,1,1,0,1], color: '#a78bfa' },
  { name: 'Morning Run',  emoji: '🏃', streak: 7,  week: [1,1,0,1,1,1,1], color: '#60a5fa' },
  { name: 'Reading',      emoji: '📚', streak: 21, week: [1,1,1,1,1,1,1], color: '#34d399' },
  { name: 'Meditation',   emoji: '🧘', streak: 5,  week: [0,1,1,1,1,0,1], color: '#f9a8d4' },
];

export const FlowStateAnimation: React.FC = () => {
  const [seconds, setSeconds] = useState(47 * 60 + 22);
  const [lifeSaver, setLifeSaver] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => setLifeSaver(true), 4500);
    const t2 = setTimeout(() => setLifeSaver(false), 9000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const R = 38;
  const CIRC = 2 * Math.PI * R;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <AnimatePresence>
        {lifeSaver && (
          <motion.div initial={{ opacity: 0, y: -10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.7rem 1rem', borderRadius: '0.75rem', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle size={16} color="#ef4444" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>⚡ Life Saver Activated</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Deadline in 3h · AI auto-reorganised your day → 0 conflicts</div>
            </div>
            <CheckCircle2 size={14} color="#34d399" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Focus timer */}
      <div className="liquid-glass" style={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.08)', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 90 90">
            <circle cx={45} cy={45} r={R} fill="none" stroke="rgba(167,139,250,0.1)" strokeWidth={3.5} />
            <motion.circle cx={45} cy={45} r={R} fill="none" stroke="#a78bfa" strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              animate={{ strokeDashoffset: [0, -CIRC * 0.35, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
          </svg>
          <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.18) 0%, transparent 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.2 }}>FLOW<br/>MODE</span>
          </motion.div>
        </div>
        <div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Deep Work Session</div>
          <div style={{ fontFamily: 'monospace', fontSize: '2.6rem', fontWeight: 700, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>{mm}:{ss}</div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>🔕 Notifications muted · 📅 Calendar blocked</div>
        </div>
      </div>

      {/* Habit grid */}
      <div className="liquid-glass" style={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.08)', padding: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Habit Tracker · This Week</span>
          <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>Mon → Sun</span>
        </div>
        {HABITS.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: i < HABITS.length - 1 ? '0.45rem' : 0 }}>
            <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>{h.emoji}</span>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', width: 78, flexShrink: 0 }}>{h.name}</span>
            <div style={{ display: 'flex', gap: '0.18rem', flex: 1 }}>
              {h.week.map((done, d) => (
                <motion.div key={d}
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.04 + d * 0.025 }}
                  style={{ flex: 1, height: 16, borderRadius: 4, background: done ? `${h.color}60` : 'rgba(255,255,255,0.05)', border: `1px solid ${done ? h.color + '45' : 'rgba(255,255,255,0.05)'}` }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <Flame size={10} color="#f59e0b" />
              <span style={{ fontSize: '0.6rem', color: '#f59e0b', fontFamily: 'monospace' }}>{h.streak}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   5. LEARNING ANIMATION  –  module cards + progress ring + YouTube
══════════════════════════════════════════════════════════════════════════════ */

const MODULES = [
  { title: 'TypeScript Mastery',     icon: '⚡', progress: 68, time: '14 min left', color: '#60a5fa', tag: 'Dev'      },
  { title: 'Morning Routine Ritual', icon: '🌅', progress: 85, time: '6 min left',  color: '#f9a8d4', tag: 'Wellness' },
  { title: 'Deep Work Principles',   icon: '🧠', progress: 41, time: '22 min left', color: '#a78bfa', tag: 'Mindset'  },
];

export const LearningAnimation: React.FC = () => {
  const [goalPct] = useState(63);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Daily goal ring */}
      <div className="liquid-glass" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1rem', borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ position: 'relative', width: 50, height: 50, flexShrink: 0 }}>
          <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 50 50">
            <circle cx={25} cy={25} r={21} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={4.5} />
            <motion.circle cx={25} cy={25} r={21} fill="none" stroke="#34d399" strokeWidth={4.5}
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 21}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 21 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 21 * (1 - goalPct / 100) }}
              transition={{ duration: 1.3, ease: 'easeOut', delay: 0.4 }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#34d399' }}>{goalPct}%</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>Today's Learning Goal</div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>19 / 30 min · AI-paced & spaced repetition</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <MonitorPlay size={14} color="#FF0000" />
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>YouTube</span>
        </div>
      </div>

      {/* Module cards */}
      {MODULES.map((m, i) => (
        <motion.div key={i} className="liquid-glass"
          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ scale: 1.01 }}
          style={{ borderRadius: '0.875rem', border: '1px solid rgba(255,255,255,0.08)', padding: '0.875rem 1rem', cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{ width: 42, height: 42, borderRadius: '0.65rem', background: `${m.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
              {m.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.88)', fontWeight: 500 }}>{m.title}</span>
                <span style={{ fontSize: '0.54rem', color: m.color, background: `${m.color}18`, padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>{m.tag}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <motion.div style={{ height: '100%', borderRadius: 999, background: m.color }}
                    initial={{ width: 0 }} animate={{ width: `${m.progress}%` }}
                    transition={{ duration: 0.9, delay: i * 0.12 + 0.35 }} />
                </div>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{m.progress}%</span>
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)', marginTop: 3 }}>{m.time}</div>
            </div>
            <motion.div whileHover={{ scale: 1.12 }}
              style={{ width: 30, height: 30, borderRadius: '50%', background: `${m.color}18`, border: `1px solid ${m.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
              <BookOpen size={13} color={m.color} />
            </motion.div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════════
   6. CONSOLE & ANALYTICS ANIMATION  –  terminal + live metrics
══════════════════════════════════════════════════════════════════════════════ */

const CONSOLE_LINES = [
  { prefix: '$',  text: 'zentrack agent --watch --proactive',           color: 'rgba(255,255,255,0.5)', delay: 0    },
  { prefix: '✓',  text: 'Watching: Gmail (23), Calendar (8), Tasks (31)', color: '#34d399',            delay: 650  },
  { prefix: '$',  text: 'zentrack plan --today --ai-optimise',          color: 'rgba(255,255,255,0.5)', delay: 1500 },
  { prefix: '✓',  text: 'Day plan: 8 tasks · 3 focus blocks · 0 conflicts', color: '#34d399',          delay: 2200 },
  { prefix: '$',  text: 'zentrack habit --streak-check',                color: 'rgba(255,255,255,0.5)', delay: 3100 },
  { prefix: '⚡', text: 'Risk: Morning Run streak (7) — miss today?',   color: '#f59e0b',              delay: 3850 },
  { prefix: '$',  text: 'zentrack schedule --run 18:00 --protect',      color: 'rgba(255,255,255,0.5)', delay: 4700 },
  { prefix: '✓',  text: '18:00 blocked · Reminder set · Streak saved ✓', color: '#34d399',             delay: 5450 },
];

const ANALYTICS = [
  { label: 'Tasks Automated', value: '47', delta: '+8 today',     color: '#a78bfa' },
  { label: 'Focus Hours',     value: '6.2h', delta: '+1.4h avg',  color: '#60a5fa' },
  { label: 'Habit Score',     value: '94%', delta: '↑3% this wk', color: '#34d399' },
  { label: 'Emails Triaged',  value: '23', delta: '0 manual',     color: '#f9a8d4' },
];

export const ConsoleAnalyticsAnimation: React.FC = () => {
  const [shownLines, setShownLines] = useState<number[]>([]);
  const [typingIdx, setTypingIdx] = useState(0);
  const [typedChars, setTypedChars] = useState(0);

  useEffect(() => {
    setShownLines([]); setTypingIdx(0); setTypedChars(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    CONSOLE_LINES.forEach((l, i) => timers.push(setTimeout(() => { setTypingIdx(i); setTypedChars(0); }, l.delay)));
    timers.push(setTimeout(() => { setShownLines([]); setTypingIdx(0); setTypedChars(0); }, CONSOLE_LINES[CONSOLE_LINES.length - 1].delay + 3000));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const cur = CONSOLE_LINES[typingIdx];
    if (!cur) return;
    if (typedChars >= cur.text.length) { setShownLines(p => p.includes(typingIdx) ? p : [...p, typingIdx]); return; }
    const t = setTimeout(() => setTypedChars(c => c + 1), 20);
    return () => clearTimeout(t);
  }, [typingIdx, typedChars]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {/* Analytics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {ANALYTICS.map((m, i) => (
          <motion.div key={i} className="liquid-glass"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            style={{ borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: m.color, fontFamily: 'monospace', lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.38)', margin: '0.25rem 0 0.15rem' }}>{m.label}</div>
            <div style={{ fontSize: '0.58rem', color: m.color, opacity: 0.7 }}>{m.delta}</div>
          </motion.div>
        ))}
      </div>

      {/* Terminal chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 0.2rem' }}>
        {['#ef4444', '#f59e0b', '#22c55e'].map((c, i) => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.6 }} />)}
        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.22)', flex: 1, textAlign: 'center' }}>zentrack — agent terminal</span>
      </div>

      {/* Terminal body */}
      <div className="liquid-glass" style={{ borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.55)', padding: '1rem', fontFamily: 'monospace', minHeight: 190 }}>
        <AnimatePresence mode="popLayout">
          {CONSOLE_LINES.map((l, i) => {
            if (!shownLines.includes(i) && i !== typingIdx) return null;
            const isCurrent = i === typingIdx && !shownLines.includes(i);
            return (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.74rem', lineHeight: 1.6 }}>
                <span style={{ color: l.prefix === '✓' ? '#34d399' : l.prefix === '⚡' ? '#f59e0b' : 'rgba(255,255,255,0.28)', flexShrink: 0 }}>{l.prefix}</span>
                <span style={{ color: l.color }}>
                  {isCurrent ? l.text.slice(0, typedChars) : l.text}
                  {isCurrent && (
                    <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}
                      style={{ display: 'inline-block', width: 6, height: 13, background: 'rgba(255,255,255,0.75)', marginLeft: 2, verticalAlign: 'middle' }} />
                  )}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
