import { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AgentStep } from '../../agent/runAgentLoop';

/* ── Agent roster ── */
const AGENTS = [
  { id: 'TITAN',   label: 'TITAN',   color: '#f5b840', glow: 'rgba(245,184,64,0.9)',  symbol: '♛', orbitR: 0,   speed: 0,  offset: 0 },
  { id: 'ORACLE',  label: 'ORACLE',  color: '#38bdf8', glow: 'rgba(56,189,248,0.9)',  symbol: '◈', orbitR: 88,  speed: 9,  offset: 0 },
  { id: 'ARGUS',   label: 'ARGUS',   color: '#c084fc', glow: 'rgba(192,132,252,0.9)', symbol: '⬡', orbitR: 88,  speed: 11, offset: 120 },
  { id: 'ENIGMA',  label: 'ENIGMA',  color: '#34d399', glow: 'rgba(52,211,153,0.9)',  symbol: '✦', orbitR: 88,  speed: 14, offset: 240 },
  { id: 'SPECTRE', label: 'SPECTRE', color: '#f472b6', glow: 'rgba(244,114,182,0.9)', symbol: '◎', orbitR: 138, speed: 18, offset: 60 },
  { id: 'AEGIS',   label: 'AEGIS',   color: '#fb923c', glow: 'rgba(251,146,60,0.9)',  symbol: '⬟', orbitR: 138, speed: 22, offset: 180 },
  { id: 'CHRONOS', label: 'CHRONOS', color: '#a78bfa', glow: 'rgba(167,139,250,0.9)', symbol: '⌬', orbitR: 138, speed: 28, offset: 300 },
];

/* ── Floating particle ── */
function Particle({ style }: { style: React.CSSProperties }) {
  return (
    <motion.div
      style={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...style }}
      animate={{ opacity: [0, 0.7, 0], y: [0, -50, -100], scale: [0, 1.2, 0] }}
      transition={{ duration: 2.5 + Math.random() * 2, repeat: Infinity, repeatDelay: Math.random() * 5, ease: 'easeOut' }}
    />
  );
}

/* ── One orbiting agent node ── */
function AgentNode({ agent, isActive, cx, cy, angle }: {
  agent: typeof AGENTS[0], isActive: boolean, cx: number, cy: number, angle: number,
}) {
  const rad = angle * (Math.PI / 180);
  const x = cx + agent.orbitR * Math.cos(rad);
  const y = cy + agent.orbitR * Math.sin(rad);
  const SIZE = 40;

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: x - SIZE / 2, top: y - SIZE / 2,
        width: SIZE, height: SIZE,
        pointerEvents: 'none',
        zIndex: 10,
      }}
      animate={{
        y: isActive ? [0, -5, 0, 5, 0] : [0, -2, 0],
        scale: isActive ? [1, 1.12, 1] : 1,
      }}
      transition={{
        y: { duration: isActive ? 1.2 : 4, repeat: Infinity, ease: 'easeInOut' },
        scale: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      {/* Pulse ring */}
      {isActive && (
        <motion.div style={{
          position: 'absolute', inset: -10, borderRadius: '50%',
          border: `1px solid ${agent.color}`,
        }}
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      {/* Chip */}
      <motion.div style={{
        width: SIZE, height: SIZE, borderRadius: 12,
        background: isActive
          ? `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18) 0%, transparent 55%),
             linear-gradient(135deg, ${agent.color}40, ${agent.color}15)`
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${agent.color}${isActive ? 'cc' : '44'}`,
        boxShadow: isActive ? `0 0 28px ${agent.glow}, 0 0 60px ${agent.color}33` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, backdropFilter: 'blur(8px)',
        overflow: 'hidden', position: 'relative',
        transition: 'box-shadow 0.4s, border-color 0.4s',
      }}>
        {isActive && (
          <motion.div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(120deg, transparent 20%, ${agent.color}55 50%, transparent 80%)`,
          }}
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.5, ease: 'easeInOut' }}
          />
        )}
        <span style={{ zIndex: 1, color: isActive ? agent.color : `${agent.color}88` }}>{agent.symbol}</span>
      </motion.div>

      {/* Label below */}
      <div style={{
        position: 'absolute', top: '100%', marginTop: 3, left: '50%', transform: 'translateX(-50%)',
        fontSize: '0.36rem', letterSpacing: '0.14em', fontWeight: 700,
        color: `${agent.color}${isActive ? 'ff' : '66'}`, textTransform: 'uppercase',
        whiteSpace: 'nowrap', fontFamily: 'monospace', transition: 'color 0.3s',
      }}>
        {agent.label}
      </div>
    </motion.div>
  );
}

/* ── Main component ── */
export function AgentVisualization({ isRunning, liveSteps, liveThinkingText }: {
  isRunning: boolean, liveSteps: AgentStep[], liveThinkingText: string,
}) {
  /* Continuous angle state — each agent tracks its own orbit angle */
  const [angles, setAngles] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    AGENTS.forEach(a => { init[a.id] = a.offset; });
    return init;
  });
  const anglesRef = useRef<Record<string, number>>({});
  const rafRef = useRef<number>(0);

  useEffect(() => {
    AGENTS.forEach(a => { anglesRef.current[a.id] = a.offset; });
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      AGENTS.forEach(a => {
        if (a.orbitR > 0) {
          anglesRef.current[a.id] = (anglesRef.current[a.id] + (360 / a.speed) * dt) % 360;
        }
      });
      setAngles({ ...anglesRef.current });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* Which agents are currently active */
  const activeAgents = useMemo(() => {
    const s = new Set<string>();
    if (isRunning) {
      s.add('TITAN');
      liveSteps.forEach(step => {
        const title = (step.title || '').toUpperCase();
        AGENTS.forEach(a => { if (title.includes(a.id)) s.add(a.id); });
      });
    }
    return s;
  }, [isRunning, liveSteps]);

  const toolCalls = liveSteps.filter(s => s.type === 'tool_call');
  const activeToolNames = toolCalls.slice(-3).map(s => (s as any).toolName?.replace(/_/g, ' ') || s.title);
  const cx = 145, cy = 145;

  /* Particles */
  const particles = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    style: {
      left: `${(i * 7) % 95}%`, top: `${(i * 11 + 5) % 85}%`,
      width: 2 + (i % 3), height: 2 + (i % 3),
      background: AGENTS[i % AGENTS.length].color + '99',
      filter: `blur(${1 + i % 2}px)`,
    } as React.CSSProperties,
  })), []);

  return (
    <div className="av-root">
      {/* Scan sweep */}
      <div className="av-scan" />

      {/* Particles */}
      {particles.map((p, i) => (
        <motion.div key={i} style={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...p.style }}
          animate={{ opacity: [0, 0.7, 0], y: [0, -40, -80], scale: [0, 1.2, 0] }}
          transition={{ duration: 2.5 + (i % 3), repeat: Infinity, repeatDelay: i * 0.4, ease: 'easeOut' }}
        />
      ))}

      {/* ── Orbit canvas ── */}
      <div className="av-canvas">
        {/* SVG rings + neural lines */}
        <svg className="av-svg" viewBox="0 0 290 290" overflow="visible">
          {/* Subtle grid */}
          {[40, 65, 90].map(r => (
            <circle key={r} cx={cx} cy={cy} r={r}
              stroke="rgba(56,189,248,0.04)" strokeWidth="0.5" fill="none" />
          ))}

          {/* Inner orbit ring */}
          <motion.circle cx={cx} cy={cy} r={88}
            stroke={isRunning ? 'rgba(56,189,248,0.22)' : 'rgba(56,189,248,0.07)'}
            strokeWidth={isRunning ? 1 : 0.5} strokeDasharray="5 9" fill="none"
            transition={{ duration: 0.6 }}
          />
          {/* Outer orbit ring */}
          <motion.circle cx={cx} cy={cy} r={138}
            stroke={isRunning ? 'rgba(192,132,252,0.18)' : 'rgba(192,132,252,0.05)'}
            strokeWidth={isRunning ? 1 : 0.5} strokeDasharray="3 7" fill="none"
            transition={{ duration: 0.6 }}
          />

          {/* Neural lines from core to active agents */}
          {AGENTS.filter(a => a.orbitR > 0).map(a => {
            const isActive = activeAgents.has(a.id);
            const rad = angles[a.id] * (Math.PI / 180);
            const ax = cx + a.orbitR * Math.cos(rad);
            const ay = cy + a.orbitR * Math.sin(rad);
            return (
              <motion.line key={a.id}
                x1={cx} y1={cy} x2={ax} y2={ay}
                stroke={a.color} strokeWidth="0.6"
                strokeDasharray="3 7"
                initial={{ opacity: 0 }}
                animate={{ opacity: isActive ? [0, 0.65, 0.2] : 0 }}
                transition={{ duration: 1.5, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
              />
            );
          })}

          {/* Pulse from core when running */}
          {isRunning && (
            <motion.circle cx={cx} cy={cy} r={20}
              stroke="#f5b840" strokeWidth="1.5" fill="none"
              initial={{ r: 20, opacity: 0.8 }}
              animate={{ r: [20, 88], opacity: [0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
        </svg>

        {/* Orbiting agent nodes */}
        {AGENTS.filter(a => a.orbitR > 0).map(agent => (
          <AgentNode key={agent.id}
            agent={agent} isActive={activeAgents.has(agent.id)}
            cx={cx} cy={cy} angle={angles[agent.id] || 0}
          />
        ))}

        {/* Central TITAN core */}
        <div className="av-core-wrap">
          {/* Outer spinning conic ring */}
          <motion.div className="av-conic-1"
            animate={{ rotate: 360 }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div className="av-conic-2"
            animate={{ rotate: -360 }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'linear' }}
          />

          {/* Core orb */}
          <motion.div
            className="av-core"
            animate={isRunning
              ? { scale: [1, 1.15, 1], boxShadow: ['0 0 35px rgba(245,184,64,0.7)', '0 0 80px rgba(245,184,64,1)', '0 0 35px rgba(245,184,64,0.7)'] }
              : { scale: [1, 1.06, 1] }
            }
            transition={{ duration: isRunning ? 0.85 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <AnimatePresence mode="wait">
              <motion.span key={isRunning ? 'running' : 'idle'}
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0, rotate: 90 }}
                transition={{ duration: 0.35, type: 'spring', damping: 18 }}
                style={{ fontSize: 22, zIndex: 2, position: 'relative' }}
              >
                {isRunning ? '⚡' : '♛'}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          <div className="av-core-label">
            <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}>
              {isRunning ? 'EXECUTING' : 'TITAN CORE'}
            </motion.span>
          </div>
        </div>
      </div>

      {/* ── Readout strip ── */}
      <div className="av-readout">
        <div className="av-readout-row">
          <span>FLEET</span>
          <motion.span className="av-readout-val"
            style={{ color: isRunning ? '#f5b840' : '#38bdf8' }}
            animate={isRunning ? { opacity: [1, 0.35, 1] } : {}}
            transition={{ duration: 0.65, repeat: Infinity }}
          >
            {isRunning ? '▶ ACTIVE' : '■ STANDBY'}
          </motion.span>
        </div>
        <div className="av-readout-row">
          <span>NODES</span>
          <span className="av-readout-val">{isRunning ? (activeAgents.size || 1) : 0} / {AGENTS.length}</span>
        </div>
        <div className="av-readout-row">
          <span>TOOLS</span>
          <span className="av-readout-val">{toolCalls.length}</span>
        </div>

        {/* Live tool pills */}
        <AnimatePresence mode="popLayout">
          {isRunning && activeToolNames.map((name, i) => (
            <motion.div key={name + i} className="av-tool-pill"
              initial={{ opacity: 0, x: -14, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto', marginTop: '0.3rem' }}
              exit={{ opacity: 0, x: 14, height: 0, marginTop: 0 }}
              transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            >
              <motion.span className="av-tool-dot"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 0.55, repeat: Infinity }}
              />
              <span>{name}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking text */}
        <AnimatePresence>
          {isRunning && liveThinkingText && (
            <motion.div className="av-thinking"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', damping: 22 }}
            >
              <motion.span className="av-thinking-dot"
                animate={{ opacity: [1, 0.15, 1] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <span>{liveThinkingText.length > 36 ? liveThinkingText.slice(0, 36) + '…' : liveThinkingText}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
