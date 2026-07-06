/**
 * VaultOrb — Cinematic AI Agent Visualization
 *
 * Layers (back to front):
 *  1. Ambient deep-space radial glow
 *  2. Canvas — animated neural-network nodes + data-stream arcs
 *  3. Hexagonal HUD rings (CSS, rotating independently)
 *  4. Scanning beam sweep
 *  5. Dense particle sphere (CSS 3D preserve-3d)
 *  6. Inner core orb with chromatic-aberration glow
 *  7. Agent status readout strip
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

interface VaultOrbProps {
  isExecuting: boolean;
  isListening?: boolean;
  playbackVolume?: number;
  onClick?: () => void;
}

// ── Neural-network canvas ─────────────────────────────────────────────────────
interface NNode { x: number; y: number; vx: number; vy: number; r: number; pulse: number; }
interface NEdge { a: number; b: number; strength: number; }

function NeuralCanvas({ isExecuting, isListening, size = 600 }: {
  isExecuting: boolean; isListening?: boolean; size?: number;
}) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const nodesRef    = useRef<NNode[]>([]);
  const edgesRef    = useRef<NEdge[]>([]);
  const rafRef      = useRef<number>(0);
  const execRef     = useRef(isExecuting);
  const listenRef   = useRef(isListening);

  useEffect(() => { execRef.current   = isExecuting; }, [isExecuting]);
  useEffect(() => { listenRef.current  = isListening; }, [isListening]);

  // Initialise nodes once
  useEffect(() => {
    const N = 38;
    const nodes: NNode[] = Array.from({ length: N }, () => ({
      x: (0.15 + Math.random() * 0.7) * size,
      y: (0.15 + Math.random() * 0.7) * size,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 2 + Math.random() * 3,
      pulse: Math.random() * Math.PI * 2,
    }));

    const edges: NEdge[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < size * 0.3) {
          edges.push({ a: i, b: j, strength: 1 - d / (size * 0.3) });
        }
      }
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [size]);

  // Animation loop — runs once, reads live state via refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    const activeColor  = '#00f0ff';
    const listenColor  = '#ff00aa';
    const idleColor    = '#a78bfa';

    const draw = () => {
      const isExec   = execRef.current;
      const isListen = listenRef.current;

      ctx.clearRect(0, 0, size, size);
      t += 0.012;

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const speed = isExec ? 2.2 : isListen ? 1.6 : 0.8;
      const nodeCol = isListen ? listenColor : isExec ? activeColor : idleColor;

      // Move nodes
      nodes.forEach(n => {
        n.pulse += 0.04;
        n.x += n.vx * speed;
        n.y += n.vy * speed;
        // Bounce off inner circle boundary
        const cx = size / 2, cy = size / 2;
        const dx = n.x - cx, dy = n.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = size * 0.42;
        if (dist > maxR) {
          const nx = dx / dist, ny = dy / dist;
          n.vx -= nx * 0.08;
          n.vy -= ny * 0.08;
          n.x = cx + nx * maxR;
          n.y = cy + ny * maxR;
        }
      });

      // Draw edges (data streams)
      edges.forEach(e => {
        const a = nodes[e.a], b = nodes[e.b];
        const alpha = e.strength * (isExecuting ? 0.55 : 0.18);
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `${nodeCol}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`);
        grad.addColorStop(0.5, `${nodeCol}${Math.round(alpha * 1.8 * 255).toString(16).padStart(2,'0')}`);
        grad.addColorStop(1, `${nodeCol}${Math.round(alpha * 255).toString(16).padStart(2,'0')}`);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = isExecuting ? 1.2 : 0.6;
        ctx.stroke();

        // Animated data packet travelling along the edge
        if (isExec || isListen) {
          const p = (t * 0.7 + e.a * 0.3) % 1;
          const px = a.x + (b.x - a.x) * p;
          const py = a.y + (b.y - a.y) * p;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = nodeCol;
          ctx.shadowBlur = 10;
          ctx.shadowColor = nodeCol;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // Draw nodes
      nodes.forEach((n, i) => {
        const pulse = 0.5 + 0.5 * Math.sin(n.pulse + (isExec ? 0.15 * i : 0));
        const nodeR = n.r * (1 + pulse * (isExec ? 0.8 : 0.3));
        
        ctx.beginPath();
        ctx.arc(n.x, n.y, nodeR, 0, Math.PI * 2);
        ctx.fillStyle = nodeCol;
        ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.shadowBlur = isExec ? 18 : 8;
        ctx.shadowColor = nodeCol;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Outer ring for active nodes
        if ((isExec || isListen) && pulse > 0.7) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, nodeR + 4, 0, Math.PI * 2);
          ctx.strokeStyle = `${nodeCol}44`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // Scanning arcs radiating from centre when executing
      if (isExec) {
        for (let s = 0; s < 3; s++) {
          const angle = (t * 0.8 + (s * Math.PI * 2) / 3) % (Math.PI * 2);
          const r1 = size * 0.08, r2 = size * 0.43;
          const scanGrad = ctx.createRadialGradient(size/2, size/2, r1, size/2, size/2, r2);
          scanGrad.addColorStop(0, `${activeColor}00`);
          scanGrad.addColorStop(0.6, `${activeColor}14`);
          scanGrad.addColorStop(1, `${activeColor}00`);
          ctx.save();
          ctx.translate(size/2, size/2);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r2, -0.35, 0.35);
          ctx.closePath();
          ctx.fillStyle = scanGrad;
          ctx.fill();
          ctx.restore();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [size]); // deps: only size — state read via refs

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 1 }}
    />
  );
}

// ── Hexagonal HUD ring (SVG) ─────────────────────────────────────────────────
function HexRing({ r, rotate, speed, color, dash, clockwise = true }: {
  r: number; rotate: number; speed: number; color: string; dash?: string; clockwise?: boolean;
}) {
  const pts = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (i * 60 - 90) * Math.PI / 180;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  }, [r]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + 'Z';

  return (
    <motion.g
      animate={{ rotate: clockwise ? [rotate, rotate + 360] : [rotate, rotate - 360] }}
      transition={{ duration: speed, repeat: Infinity, ease: 'linear' }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeDasharray={dash || 'none'}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </motion.g>
  );
}

// ── Agent status ticker ───────────────────────────────────────────────────────
const IDLE_LINES   = ['NEURAL PATHWAYS: MAPPED', 'AWAITING DIRECTIVE...', 'QUANTUM CORE: STABLE', 'PATTERN RECOGNITION: PRIMED'];
const ACTIVE_LINES = ['PARSING INTENT...', 'SPAWNING AGENT FLEET', 'QUERYING DATASTREAMS', 'CROSS-REFERENCING INTEL', 'EXECUTING TOOL CHAIN', 'SYNTHESISING RESULTS'];
const LISTEN_LINES = ['VOICE STREAM: OPEN', 'STT ACTIVE', 'PHONEME PARSING...', 'INTENT EXTRACTION: LIVE'];

// ── Main component ────────────────────────────────────────────────────────────
export function VaultOrb({ isExecuting, isListening, playbackVolume = 0, onClick }: VaultOrbProps) {

  const { particles, rings } = useMemo(() => {
    const N = 280;
    const ps = Array.from({ length: N }, (_, i) => {
      const phi   = Math.acos(1 - 2 * (i + 0.5) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        id: i,
        ry: theta * (180 / Math.PI),
        rx: phi * (180 / Math.PI) - 90,
        z: 70 + Math.pow(Math.random(), 2) * 130,
        size: Math.random() * 2 + 0.8,
        opacity: Math.random() * 0.55 + 0.25,
      };
    });

    // HUD hex rings
    const rs = [
      { r: 148, rotate: 0,   speed: 22, color: 'rgba(167,139,250,0.35)', dash: '8 4',  cw: true  },
      { r: 190, rotate: 30,  speed: 38, color: 'rgba(0,240,255,0.20)',   dash: '4 12', cw: false },
      { r: 230, rotate: 15,  speed: 55, color: 'rgba(167,139,250,0.12)', dash: '2 8',  cw: true  },
      { r: 265, rotate: -20, speed: 70, color: 'rgba(0,240,255,0.09)',   dash: '6 6',  cw: false },
    ];

    return { particles: ps, rings: rs };
  }, []);

  // ── Ticker ────────────────────────────────────────────────────────────────
  const [tickerLine, setTickerLine] = React.useState(0);
  const lines = isListening ? LISTEN_LINES : isExecuting ? ACTIVE_LINES : IDLE_LINES;
  useEffect(() => {
    const interval = setInterval(() => {
      setTickerLine(l => (l + 1) % lines.length);
    }, isExecuting ? 1400 : 3000);
    return () => clearInterval(interval);
  }, [isExecuting, isListening, lines.length]);

  // ── Colour palette derived from state ─────────────────────────────────────
  const primaryCol  = isListening ? '#ff00aa' : isExecuting ? '#00f0ff' : '#a78bfa';
  const secondaryCol = isExecuting ? '#a78bfa' : '#00f0ff';
  const coreGlow = playbackVolume > 0
    ? `0 0 ${60 + playbackVolume}px ${primaryCol}, 0 0 ${120 + playbackVolume * 2}px ${primaryCol}44, inset 0 0 30px ${primaryCol}66`
    : isExecuting
    ? `0 0 70px ${primaryCol}, 0 0 140px ${primaryCol}55, inset 0 0 25px ${primaryCol}44`
    : isListening
    ? `0 0 55px ${primaryCol}, 0 0 110px ${primaryCol}44, inset 0 0 20px ${primaryCol}33`
    : `0 0 40px #a78bfa44, 0 0 80px #a78bfa22, inset 0 0 15px #a78bfa22`;

  const particleCol = isListening ? '#ff00aa' : isExecuting ? '#00f0ff' : '#a78bfa';

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {/* ── 1. Deep ambient glow ──────────────────────────────────────────── */}
      <motion.div
        animate={{
          opacity: [0.25, isExecuting ? 0.65 : isListening ? 0.55 : 0.35, 0.25],
          scale:   [1, 1.08, 1],
        }}
        transition={{ repeat: Infinity, duration: isExecuting ? 2 : 5, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          width: 520, height: 520,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${primaryCol}18 0%, transparent 70%)`,
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {/* ── 2. Neural-network canvas ──────────────────────────────────────── */}
      <NeuralCanvas isExecuting={isExecuting} isListening={isListening} size={560} />

      {/* ── 3. SVG HUD hex rings ──────────────────────────────────────────── */}
      <svg
        width="560" height="560"
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', overflow: 'visible', zIndex: 2, pointerEvents: 'none' }}
        viewBox="-280 -280 560 560"
      >
        {rings.map((r, i) => (
          <HexRing key={i} r={r.r} rotate={r.rotate} speed={isExecuting ? r.speed * 0.45 : r.speed} color={isExecuting ? r.color.replace('167,139,250', '0,240,255') : r.color} dash={r.dash} clockwise={r.cw} />
        ))}

        {/* Tick marks around outer ring */}
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const r0 = 272, r1 = i % 5 === 0 ? 260 : 268;
          return (
            <line
              key={i}
              x1={Math.cos(a) * r0} y1={Math.sin(a) * r0}
              x2={Math.cos(a) * r1} y2={Math.sin(a) * r1}
              stroke={isExecuting ? 'rgba(0,240,255,0.35)' : 'rgba(167,139,250,0.2)'}
              strokeWidth={i % 5 === 0 ? 1.5 : 0.8}
            />
          );
        })}

        {/* Cardinal compass labels */}
        {[['N', 0, -285], ['E', 285, 0], ['S', 0, 285], ['W', -285, 0]].map(([lbl, x, y]) => (
          <text
            key={String(lbl)}
            x={Number(x)} y={Number(y)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" letterSpacing="2"
            fill={isExecuting ? 'rgba(0,240,255,0.6)' : 'rgba(167,139,250,0.4)'}
            fontFamily="'Share Tech Mono', monospace"
          >
            {lbl}
          </text>
        ))}
      </svg>

      {/* ── 4. Scanning beam (visible when executing/listening) ───────────── */}
      {(isExecuting || isListening) && (
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: isListening ? 2.5 : 3.5, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            width: 300, height: 300,
            borderRadius: '50%',
            background: `conic-gradient(from 0deg, transparent 0%, ${primaryCol}22 10%, transparent 30%)`,
            zIndex: 3,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ── 5. Particle sphere (CSS 3D) ───────────────────────────────────── */}
      <motion.div
        animate={{ y: [-10, 10, -10] }}
        transition={{ repeat: Infinity, ease: 'easeInOut', duration: 7 }}
        style={{ position: 'absolute', width: 0, height: 0, zIndex: 4, transformStyle: 'preserve-3d', perspective: '1000px' }}
      >
        <motion.div
          animate={{ rotateY: [0, 360], rotateX: [8, 22, 8] }}
          transition={{
            rotateY: { repeat: Infinity, ease: 'linear', duration: isExecuting ? 18 : 55 },
            rotateX: { repeat: Infinity, ease: 'easeInOut', duration: 22 },
          }}
          style={{ position: 'absolute', width: 0, height: 0, transformStyle: 'preserve-3d' }}
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              style={{
                position: 'absolute',
                top: -p.size / 2, left: -p.size / 2,
                width: p.size, height: p.size,
                background: particleCol,
                borderRadius: '50%',
                transform: `rotateY(${p.ry}deg) rotateX(${p.rx}deg) translateZ(${p.z}px)`,
                opacity: p.opacity,
                boxShadow: `0 0 ${p.size * 4}px ${particleCol}`,
                transition: 'background 0.4s, box-shadow 0.4s',
              }}
              animate={(isExecuting || isListening) ? {
                opacity: [p.opacity, 1, p.opacity],
                scale: isListening ? [1, 2.2, 1] : [1, 1.8, 1],
              } : {}}
              transition={{ repeat: Infinity, duration: 1.2 + Math.random() * 1.5, delay: Math.random() * 1.5 }}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* ── 6. Inner core orb ─────────────────────────────────────────────── */}
      <motion.div
        animate={{ scale: 1 + (playbackVolume / 300) }}
        transition={{ type: 'spring', stiffness: 280, damping: 18 }}
        style={{
          position: 'absolute',
          width: 96, height: 96,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, #1e1e2e 0%, #08080f 65%, #000 100%)`,
          boxShadow: coreGlow,
          border: `1.5px solid ${primaryCol}55`,
          zIndex: 6,
          transition: 'box-shadow 0.12s ease-out, border-color 0.3s ease',
        }}
      >
        {/* Inner glint */}
        <div style={{
          position: 'absolute', top: '18%', left: '22%',
          width: '28%', height: '18%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${primaryCol}55, transparent 70%)`,
          filter: 'blur(3px)',
        }} />
      </motion.div>

      {/* ── 7. Agent status readout ───────────────────────────────────────── */}
      <motion.div
        key={tickerLine}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'absolute',
          bottom: '-52px',
          width: '340px',
          textAlign: 'center',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '0.62rem',
          letterSpacing: '0.2em',
          color: isListening ? '#ff00aa' : isExecuting ? '#00f0ff' : 'rgba(167,139,250,0.6)',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          zIndex: 7,
          textShadow: `0 0 12px ${primaryCol}`,
        }}
      >
        {lines[tickerLine % lines.length]}
      </motion.div>

      {/* ── 8. Corner telemetry read-outs (visible when active) ───────────── */}
      {(isExecuting || isListening) && (
        <>
          {[
            { label: 'RPM',  value: isExecuting ? `${Math.floor(Math.random()*50+30)}%` : '—', top: '-110px', left: '-140px' },
            { label: 'FLUX', value: isExecuting ? `${(Math.random()*9+0.5).toFixed(1)}V` : '—', top: '-110px', right: '-140px' },
            { label: 'LOAD', value: isExecuting ? `${Math.floor(Math.random()*40+55)}%` : '—', bottom: '-110px', left: '-140px' },
            { label: 'SYNC', value: isListening ? 'LIVE' : isExecuting ? 'OK' : '—', bottom: '-110px', right: '-140px' },
          ].map((t) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                position: 'absolute',
                ...(t.top    ? { top:    t.top }    : {}),
                ...(t.bottom ? { bottom: t.bottom } : {}),
                ...(t.left   ? { left:   t.left }   : {}),
                ...(t.right  ? { right:  t.right }  : {}),
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: '0.58rem',
                letterSpacing: '0.15em',
                color: primaryCol,
                textShadow: `0 0 8px ${primaryCol}`,
                pointerEvents: 'none',
                zIndex: 8,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.35)', display: 'block' }}>{t.label}</span>
              <span>{t.value}</span>
            </motion.div>
          ))}
        </>
      )}
    </div>
  );
}
