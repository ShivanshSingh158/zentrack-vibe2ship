import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Radio, Send, X } from 'lucide-react';
import { useVoice } from '../contexts/VoiceContext';
import { useGlobalData } from '../contexts/GlobalDataContext';
import { agentMemoryStore } from '../stores/agentMemoryStore';
import { AGENT_DETAILS } from '../agent/fleet/agentDetails';
import { useSaraOrchestration } from './sara/hooks/useSaraOrchestration';
import { AgentCluster } from './sara/AgentCluster';
import { TerminalFeed } from './sara/TerminalFeed';
import { dataPrefetcher } from '../services/DataPrefetcher'; // OPT-7
import { ParticleFlowBackground } from './ui/ParticleFlowBackground';

const blackHoleImg = new Image();
blackHoleImg.src = '/blackhole.jpg';

interface SaraProps {
  onClose: () => void;
  isHomePage?: boolean;
  onCommand?: (prompt: string) => void;
}

const AGENTS = Object.keys(AGENT_DETAILS).map(id => ({
  id,
  color: AGENT_DETAILS[id].color,
  label: AGENT_DETAILS[id].title.split(' ')[0].toUpperCase().substring(0, 5),
  icon: AGENT_DETAILS[id].icon,
  title: AGENT_DETAILS[id].title,
  description: AGENT_DETAILS[id].description
}));

export const SaraInterface: React.FC<SaraProps> = ({ onClose, isHomePage = false, onCommand }) => {
  const {
    isConversationActive,
    startConversation,
    stopConversation,
    isConversationListening,
    conversationTranscript,
    isSpeaking,
    isLiveMode,
  } = useVoice();

  const globalData = useGlobalData();
  const messages = React.useSyncExternalStore(agentMemoryStore.subscribe, agentMemoryStore.getSnapshot);
  
  const {
    isOrchestrating,
    agentLogs,
    activeAgents,
    agentErrors,
    terminalLines,
    submitCommand
  } = useSaraOrchestration(globalData, messages, AGENTS);

  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [inputText, setInputText] = useState('');
  const [statusPulse, setStatusPulse] = useState(0);
  const [scanlineY, setScanlineY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  // OPT-7: Start background data pre-fetcher on mount, update when context changes
  useEffect(() => {
    dataPrefetcher.start(globalData);
    return () => dataPrefetcher.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dataPrefetcher.update(globalData);
  }, [globalData]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const waveFrameRef = useRef<number>(0);

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTimeStr(d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      
      const day = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit' });
      const month = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' }).toUpperCase();
      const year = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' });
      
      setDateStr(`${day} ${month} ${year}`);
    };
    updateTime();
    const t = setInterval(updateTime, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setStatusPulse(p => (p + 1) % 100), 2000);
    return () => clearInterval(t);
  }, []);

  const isSpeakingRef = useRef(isSpeaking);
  const isListeningRef = useRef(isConversationListening);
  const isConversationActiveRef = useRef(isConversationActive);
  // Keep all refs in sync — no deps needed on the canvas effect
  isSpeakingRef.current = isSpeaking;
  isListeningRef.current = isConversationListening;
  isConversationActiveRef.current = isConversationActive;

  // ── Neural Orb Canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      const newWidth = Math.floor(canvas.offsetWidth * dpr);
      const newHeight = Math.floor(canvas.offsetHeight * dpr);
      
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.scale(dpr, dpr);
      }
    };
    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const N = 800; // Increased for a denser, more realistic eye
    type Role = 'pupil' | 'iris' | 'eyebrow';
    type Node = { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; brightness: number; eye: 'left' | 'right'; role: Role; index: number; };
    const nodes: Node[] = [];
    const initNodes = () => {
      nodes.length = 0;
      const Wval = canvas.offsetWidth || window.innerWidth || 300;
      const Hval = canvas.offsetHeight || window.innerHeight || 300;
      for (let i = 0; i < N; i++) {
        const eye = i < N / 2 ? 'left' : 'right';
        const isNarrow = Wval < 768;
        const offset = isNarrow ? Wval * 0.15 : Wval * 0.08; // Reduced distance
        const eyeOffsetX = eye === 'left' ? -offset : offset;
        
        const localI = i % (N / 2);
        let role: Role = 'iris';
        let index = localI;
        if (localI < 60) { role = 'pupil'; index = localI; }
        else if (localI < 280) { role = 'iris'; index = localI - 60; }
        else { role = 'eyebrow'; index = localI - 280; }

        nodes.push({
          x: eyeOffsetX + (Math.random() - 0.5) * Wval * 0.2,
          y: (Math.random() - 0.5) * Hval * 0.2,
          z: (Math.random() - 0.5) * Math.max(Wval, Hval) * 0.2,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          vz: (Math.random() - 0.5) * 0.4,
          r: role === 'pupil' ? Math.random() * 2.5 + 2.0 : Math.random() * 2.0 + 1.2,
          brightness: role === 'pupil' ? 1.0 : Math.random(),
          eye,
          role,
          index
        });
      }
    };
    initNodes();

    let lookTargetX = 0;
    let lookTargetY = 0;
    let currentLookX = 0;
    let currentLookY = 0;
    let lastLookTime = 0;

    const mouse = { x: -1000, y: -1000 };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    let t = 0;
    
    // Performance: Offscreen canvas for the static hex grid
    const bgCanvas = document.createElement('canvas');
    let bgRenderedW = 0;
    let bgRenderedH = 0;

    const draw = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      t += 0.008;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * 1.3;
      const speakBoost = isSpeakingRef.current ? 1.4 : 1.0;
      const listenBoost = isConversationActiveRef.current ? 1.2 : 1.0;

      if (mouse.x !== -1000) {
        lookTargetX = (mouse.x - cx) * 0.6;
        lookTargetY = (mouse.y - cy) * 0.6;
        lastLookTime = t;
      } else {
        lookTargetX = 0;
        lookTargetY = 0;
        lastLookTime = t;
      }
      currentLookX += (lookTargetX - currentLookX) * 0.05;
      currentLookY += (lookTargetY - currentLookY) * 0.05;

      // Canvas background removed for GPU performance. Background is now handled by CSS.

      // Canvas background removed for GPU performance. Background is now handled by CSS.
      // Performance: Draw pre-rendered hex grid removed for minimalist redesign.

      const fov = maxR * 1.5;
      const project = (x: number, y: number, z: number) => {
        const scale = fov / (fov + z + maxR); 
        return { px: cx + x * scale, py: cy + y * scale, scale };
      };

      nodes.forEach(node => {
        const { px, py } = project(node.x, node.y, node.z);
        
        const mdx = px - mouse.x;
        const mdy = py - mouse.y;
        const mDist = Math.hypot(mdx, mdy);
        
        if (mDist < 200 && mDist > 0) {
          const force = (200 - mDist) / 200;
          node.vx += (mdx / mDist) * force * 1.2;
          node.vy += (mdy / mDist) * force * 1.2;
          node.vz += force * 0.5;
          node.brightness = Math.min(3.0, node.brightness + force * 2.0);
        }

        node.vx *= 0.95;
        node.vy *= 0.95;
        node.vz *= 0.95;
        
        const boundX = w * 0.45;
        const boundY = h * 0.45;
        const boundZ = Math.max(w, h) * 0.6;
        if (Math.abs(node.x) > boundX) node.vx -= Math.sign(node.x) * (Math.abs(node.x) - boundX) * 0.05;
        if (Math.abs(node.y) > boundY) node.vy -= Math.sign(node.y) * (Math.abs(node.y) - boundY) * 0.05;
        if (Math.abs(node.z) > boundZ) node.vz -= Math.sign(node.z) * (Math.abs(node.z) - boundZ) * 0.05;

        const isNarrow = w < 768;
        const offset = isNarrow ? w * 0.15 : w * 0.08;
        const eyeOffsetX = node.eye === 'left' ? -offset : offset;
        const targetX = eyeOffsetX + currentLookX;
        const targetY = currentLookY;

        if (node.role === 'pupil') {
            const pull = 0.05;
            node.vx -= (node.x - targetX) * pull;
            node.vy -= (node.y - targetY) * pull;
            node.vz -= node.z * pull;
            node.brightness = 2.0;
        } else if (node.role === 'iris') {
            const eyePull = 0.008;
            node.vx -= (node.x - targetX) * eyePull;
            node.vy -= (node.y - targetY) * eyePull;
            node.vz -= node.z * eyePull;

            const distFromEyeCenter = Math.hypot(node.x - targetX, node.y - targetY, node.z);
            if (distFromEyeCenter < 80) {
                const push = (80 - distFromEyeCenter) * 0.05;
                node.vx += ((node.x - targetX) / distFromEyeCenter) * push;
                node.vy += ((node.y - targetY) / distFromEyeCenter) * push;
                node.vz += (node.z / distFromEyeCenter) * push;
            }
        } else if (node.role === 'eyebrow') {
            const archX = (node.index / 100 - 0.5) * 200;
            const archY = -120 + Math.pow(archX / 100, 2) * 40;
            const speakRaise = isSpeakingRef.current ? -20 : 0;
            
            const pull = 0.02;
            node.vx -= (node.x - (eyeOffsetX + archX + currentLookX * 0.5)) * pull;
            node.vy -= (node.y - (targetY + archY + speakRaise)) * pull;
            node.vz -= (node.z - 20) * pull;
        }

        if (node.role !== 'eyebrow') {
            const localX = node.x - targetX;
            const rotSpeed = 0.005;
            const cosR = Math.cos(rotSpeed);
            const sinR = Math.sin(rotSpeed);
            const nx = localX * cosR - node.z * sinR;
            const nz = localX * sinR + node.z * cosR;
            node.x = nx + targetX;
            node.z = nz;
        }

        node.vx += Math.sin(t * 18 + node.y * 0.015) * 0.25;
        node.vy += Math.cos(t * 22 + node.x * 0.015) * 0.25;
        node.vz += Math.sin(t * 15 + node.z * 0.015) * 0.25;

        const speed = Math.hypot(node.vx, node.vy, node.vz);
        if (speed > 25) {
            node.vx = (node.vx / speed) * 25;
            node.vy = (node.vy / speed) * 25;
            node.vz = (node.vz / speed) * 25;
        }

        node.x += node.vx * speakBoost;
        node.y += node.vy * speakBoost;
        node.z += node.vz * speakBoost;
        
        if (node.brightness > 1) node.brightness -= 0.03;
        else node.brightness = Math.min(1, node.brightness + (Math.random() - 0.5) * 0.05);
      });

      nodes.forEach((node, i) => {
        const p1 = project(node.x, node.y, node.z);
        let connectionsDrawn = 0;
        
        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const dx = node.x - other.x;
          if (Math.abs(dx) > 55) continue;
          const dy = node.y - other.y;
          if (Math.abs(dy) > 55) continue;
          const dz = node.z - other.z;
          if (Math.abs(dz) > 55) continue;

          const d3 = Math.hypot(dx, dy, dz);
          
          if (d3 < 55) {
            if (connectionsDrawn < 4 && node.role !== 'pupil' && other.role !== 'pupil') {
              const p2 = project(other.x, other.y, other.z);
              const alpha = (1 - d3 / 55) * 0.3 * (node.brightness > 1 ? 1.5 : 1) * (p1.scale * p1.scale);
              ctx.beginPath();
              ctx.strokeStyle = `rgba(196, 149, 106, ${alpha})`;
              ctx.lineWidth = 0.6 * p1.scale;
              ctx.moveTo(p1.px, p1.py);
              ctx.lineTo(p2.px, p2.py);
              ctx.stroke();
              connectionsDrawn++;
            }

            if (d3 < 30 && d3 > 0) {
              const repel = (30 - d3) * 0.02;
              node.vx += (dx / d3) * repel;
              node.vy += (dy / d3) * repel;
              node.vz += (dz / d3) * repel;
              other.vx -= (dx / d3) * repel;
              other.vy -= (dy / d3) * repel;
              other.vz -= (dz / d3) * repel;
            }
          }
        }

        const pulse = 0.5 + Math.sin(t * 3 + node.brightness * 10) * 0.5;
        const nodeAlpha = isConversationActiveRef.current ? Math.random() * 0.3 + 0.7 : pulse;
        ctx.beginPath();
        ctx.arc(p1.px, p1.py, node.r * p1.scale * listenBoost * (node.brightness > 1 ? 1.5 : 1), 0, Math.PI * 2);
        
        if (node.role === 'pupil') {
            ctx.fillStyle = `rgba(220, 215, 255, ${nodeAlpha * Math.min(1, node.brightness) * p1.scale})`; 
            if (node.brightness > 1) {
                ctx.shadowBlur = 15 * p1.scale;
                ctx.shadowColor = 'rgba(165, 153, 255, 0.9)';
            }
        } else if (node.role === 'eyebrow') {
            ctx.fillStyle = `rgba(165, 153, 255, ${nodeAlpha * Math.min(1, node.brightness) * 0.8 * p1.scale})`; 
        } else {
            ctx.fillStyle = `rgba(184, 175, 255, ${nodeAlpha * Math.min(1, node.brightness) * 0.6 * p1.scale})`; 
            if (node.brightness > 1) {
                ctx.shadowBlur = 8 * p1.scale;
                ctx.shadowColor = 'rgba(165, 153, 255, 0.6)';
            }
        }

        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      ro.disconnect();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally empty: state is read via refs

  // ── Waveform Canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = canvas.offsetWidth;
    let h = canvas.offsetHeight;

    const resizeWave = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      const newWidth = Math.floor(w * dpr);
      const newHeight = Math.floor(h * dpr);
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.scale(dpr, dpr);
      }
    };
    resizeWave();
    const roWave = new ResizeObserver(() => resizeWave());
    roWave.observe(canvas);

    let t = 0;
    let levels: number[] = [];

    const drawWave = () => {
      t += 0.04;
      ctx.clearRect(0, 0, w, h);

      const targetBars = Math.max(32, Math.floor(w / 12));
      const bars = targetBars % 2 === 0 ? targetBars : targetBars + 1;
      
      if (levels.length !== bars) {
        if (levels.length < bars) {
           levels.push(...new Array(bars - levels.length).fill(0).map(() => Math.random() * 0.3));
        } else {
           levels = levels.slice(0, bars);
        }
      }

      const barW = w / bars;

      for (let i = 0; i < bars; i++) {
        const target = isSpeakingRef.current
          ? 0.2 + Math.abs(Math.sin(t * 3 + i * 0.3) * Math.cos(t + i * 0.1)) * 0.8
          : isListeningRef.current
          ? 0.1 + Math.abs(Math.sin(t * 5 + i * 0.4)) * 0.4
          : 0.02 + Math.abs(Math.sin(t * 0.5 + i * 0.5)) * 0.08;

        levels[i] += (target - levels[i]) * 0.15;
        const barHeight = levels[i] * h;
        const x = i * barW;
        const distFromCenter = Math.abs(i - bars / 2) / (bars / 2);
        const alpha = 1 - distFromCenter * 0.5;

        const g = ctx.createLinearGradient(x, h / 2 - barHeight / 2, x, h / 2 + barHeight / 2);
        g.addColorStop(0, `rgba(165, 153, 255, ${alpha * 0.3})`);
        g.addColorStop(0.5, `rgba(165, 153, 255, ${alpha})`);
        g.addColorStop(1, `rgba(165, 153, 255, ${alpha * 0.3})`);

        const rounding = Math.min(barW * 0.4, 3);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x + 1, h / 2 - barHeight / 2, barW - 2, barHeight, rounding);
        ctx.fill();

        ctx.fillStyle = `rgba(165, 153, 255, ${alpha * 0.06})`;
        ctx.beginPath();
        ctx.roundRect(x + 1, h / 2 - barHeight / 2, barW - 2, barHeight, rounding);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(165, 153, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
      ctx.stroke();

      waveFrameRef.current = requestAnimationFrame(drawWave);
    };

    drawWave();
    return () => {
      roWave.disconnect();
      cancelAnimationFrame(waveFrameRef.current);
    };
  }, []);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onCommand && inputText.trim()) {
      onCommand(inputText.trim());
      setInputText('');
      return;
    }
    submitCommand(inputText);
    setInputText('');
  };

  const displayText = conversationTranscript || inputText;
  const isActuallyListening = isConversationActive && !!conversationTranscript;

  const statusLabel = isSpeaking
    ? 'TRANSMITTING'
    : isOrchestrating
    ? 'PROCESSING'
    : isConversationListening
    ? 'LISTENING'
    : 'STANDBY';

  // Shows which voice engine is active
  const modeLabel = isLiveMode ? '⚡ LIVE' : isConversationActive ? '◉ STD' : '';

  const statusColor = isSpeaking
    ? '#5eda9e'
    : isOrchestrating
    ? '#ff9f4d'
    : isConversationListening
    ? '#a599ff'
    : '#636366';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: isHomePage ? 5 : 9999,
      background: 'transparent',
      color: '#f2f2f7',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* ── TOP HUD BAR (FLOATING PILL) ─────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)',
        maxWidth: '1200px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexDirection: 'row',
        padding: isMobile ? '0.5rem 1rem' : '0.6rem 2rem',
        gap: '1rem',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '32px',
        background: 'rgba(20, 20, 22, 0.55)',
        backdropFilter: 'saturate(180%) blur(32px)',
        WebkitBackdropFilter: 'saturate(180%) blur(32px)',
        zIndex: 20,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1.5rem', flex: 1 }}>
          {!isHomePage && (
            <button onClick={onClose} style={{
              background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)',
              borderRadius: '6px', padding: '6px 10px', color: '#f87171', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem',
              letterSpacing: '0.1em', transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,60,60,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,60,60,0.1)')}
            >
              <X size={12} /> ESC
            </button>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <img src="/logo_white.png" alt="ZenTrack Logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
              <span style={{ fontSize: isMobile ? '1.5rem' : '1.75rem', fontWeight: 400, letterSpacing: '0.02em', color: '#fff', fontFamily: 'var(--font-display, sans-serif)' }}>ZenTrack</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          {/* Status badge — Sleek realtime indicator (no bulky boxes) */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              fontSize: isMobile ? '0.65rem' : '0.8rem', fontWeight: 700, letterSpacing: '0.25em',
              color: statusColor,
              transition: 'color 0.3s ease',
            }}
          >
            {/* Realtime blinking dot indicator */}
            <motion.div
               animate={{ opacity: [1, 0.2, 1] }}
               transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
               style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor, boxShadow: `0 0 10px ${statusColor}` }}
            />
            
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={statusLabel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'inline-block', textShadow: `0 0 12px ${statusColor}80` }}
              >
                {statusLabel}
              </motion.span>
            </AnimatePresence>
            
            {modeLabel && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em',
                color: isLiveMode ? '#00ff88' : '#fbbf24',
                opacity: 0.9,
                marginLeft: '4px'
              }}>
                [{modeLabel}]
              </span>
            )}
          </div>
          {!isMobile && (
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.05em', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
              Status: {isLiveMode ? 'Gemini Live Active' : isSpeaking ? 'Audio Stream Active' : isConversationListening ? 'Processing Audio' : 'Standby'}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flex: 1 }}>
          <div style={{ fontSize: isMobile ? '1.2rem' : '1.4rem', fontWeight: 600, letterSpacing: '0.02em', color: '#fff', lineHeight: 1 }}>
            {timeStr}
          </div>
          {!isMobile && (
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.02em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px', fontWeight: 500 }}>
            {dateStr}
          </div>
          )}
        </div>
      </div>

      {/* ── MAIN BODY ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 5, position: 'relative', paddingTop: '100px' }}>
        
        {/* ── GLOBAL BACKGROUNDS (SPAN FULL WIDTH) ──────────────────────── */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <ParticleFlowBackground 
            speedMultiplier={isSpeaking ? 3 : (isConversationActive ? 1.5 : 0.5)} 
            opacity={0.15} 
          />
          
          <motion.div 
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '150vh',
              height: '150vh',
              minWidth: '1000px',
              minHeight: '1000px',
              maxWidth: '2500px',
              maxHeight: '2500px',
              x: '-50%',
              y: '-50%',
              backgroundImage: 'url(/blackhole.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.15,
              mixBlendMode: 'screen'
            }}
            animate={{ rotate: 360 }}
            transition={{
              repeat: Infinity,
              ease: 'linear',
              duration: isSpeaking ? 60 : (isConversationActive ? 100 : 200)
            }}
          />
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'auto' }} />
        </div>
        
        {/* ── PANELS CONTAINER ────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden', zIndex: 1, position: 'relative', pointerEvents: 'none' }}>
        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        {!isMobile && (
        <div 
          className="hide-scrollbar"
          data-lenis-prevent="true"
          style={{
          width: isMobile ? '100%' : '300px', flexShrink: 0,
          background: 'transparent',
          borderRight: 'none',
          display: 'flex', flexDirection: 'column',
          padding: '1rem 1.5rem',
          gap: '2rem',
          overflowY: isMobile ? 'visible' : 'auto',
          overscrollBehavior: 'contain',
          zIndex: 10,
          pointerEvents: 'auto'
        }}>
          <AgentCluster 
            AGENTS={AGENTS} 
            activeAgents={activeAgents} 
            agentErrors={agentErrors}
            isSpeaking={isSpeaking}
            isConversationListening={isConversationListening}
            statusPulse={statusPulse}
            globalData={globalData}
          />
        </div>
        )}

        {/* ── CENTER ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minHeight: 0, pointerEvents: 'none' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {/* Contextual Orchestration Hologram */}
            <AnimatePresence>
              {isOrchestrating && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  transition={{ duration: 1 }}
                  style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '500px', height: '500px',
                    pointerEvents: 'none',
                    zIndex: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {/* Outer spinning dashed ring */}
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                    style={{ width: '100%', height: '100%', position: 'absolute', border: '1px dashed rgba(165,153,255,0.15)', borderRadius: '50%' }}
                  />
                  {/* Inner reverse-spinning agent node ring */}
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                    style={{ width: '75%', height: '75%', position: 'absolute', border: '1px solid rgba(165,153,255,0.06)', borderRadius: '50%' }}
                  >
                    {activeAgents.map((id, i) => {
                      const agent = AGENTS.find(a => a.id === id);
                      if (!agent) return null;
                      const angle = (i / activeAgents.length) * Math.PI * 2;
                      const x = Math.cos(angle) * 50 + 50; 
                      const y = Math.sin(angle) * 50 + 50;
                      return (
                        <div key={id} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
                          <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }} style={{ width: '8px', height: '8px', borderRadius: '50%', background: agent.color, boxShadow: `0 0 15px ${agent.color}` }} />
                          <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.45rem', color: agent.color, fontFamily: "'JetBrains Mono', monospace", opacity: 0.6 }}>
                            {agent.title.split(' ')[0]}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div
              onClick={isConversationActive ? stopConversation : startConversation}
              style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '110px', height: '110px',
                borderRadius: '50%',
                cursor: 'pointer',
                zIndex: 10,
                pointerEvents: 'auto',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '6px',
              }}
            >
            </div>

            <div style={{
              position: 'absolute', 
              top: '25%', left: 0, right: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-start',
              pointerEvents: 'none',
              gap: '2rem'
            }}>
              <div style={{ height: '20px' }}>
                {!isConversationActive && messages.length <= 1 && !isSpeaking && (
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5], y: [0, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ textAlign: 'center' }}
                  >
                    <div style={{
                      fontSize: '0.65rem', letterSpacing: '0.2em',
                      color: 'rgba(165,153,255,0.80)', textShadow: '0 0 15px rgba(165,153,255,0.5)',
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                    }}>
                      CLICK ME TO ACTIVATE
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            <div style={{
              position: 'absolute', 
              top: '50%', left: 0, right: 0,
              marginTop: '60px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-start',
              pointerEvents: 'none',
              gap: '2rem'
            }}>
              <div style={{ textAlign: 'center' }}>

                {conversationTranscript && conversationTranscript !== 'WORKING...' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      marginTop: '20px', maxWidth: '600px', fontSize: '1.1rem',
                      fontFamily: "'Inter', sans-serif",
                      color: 'rgba(165,153,255,0.90)', letterSpacing: '0.01em',
                      lineHeight: 1.6, textAlign: 'center', fontWeight: 500,
                      textShadow: '0 0 10px rgba(165,153,255,0.25)'
                    }}
                  >
                    "{conversationTranscript}"
                  </motion.div>
                )}
                {!conversationTranscript && !isOrchestrating && activeAgents.length === 0 && messages.length > 0 && messages[messages.length - 1].role === 'agent' && (() => {
                  // Extract SPOKEN_SUMMARY only; otherwise strip markdown and take first clean block
                  const lastMsg = messages[messages.length - 1];
                  const raw: string = lastMsg.title || '';
                  const hasSteps = !!(lastMsg.steps && lastMsg.steps.length > 0);
                  
                  const isInitialGreeting = messages.length <= 1 && !hasSteps;
                  
                  // Hide the initial greeting when the orb starts working
                  if (isInitialGreeting && isConversationActive) return null;

                  const summaryMatch = raw.match(/SPOKEN_SUMMARY[:\s*]*([^*]+)/i);
                  let display = summaryMatch?.[1]?.trim() || '';
                  if (!display) {
                    display = raw
                      .replace(/#{1,6}\s*/g, '')
                      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
                      .replace(/`[^`]*`/g, '')
                      .replace(/^[-*•]\s+/gm, '')
                      .replace(/^\d+\.\s+/gm, '')
                      .replace(/SPOKEN_SUMMARY[:\s]*/gi, '')
                      .replace(/\(Raw logs omitted.*?\)/gi, '')
                      .replace(/\*\*MERCURY FINDINGS[^*]*\*\*/gi, '')
                      .replace(/\\n/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim();
                    if (display.length > 220) display = display.slice(0, 217) + '...';
                  }
                  if (!display) return null;
                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => hasSteps ? window.dispatchEvent(new CustomEvent('show-mission-report')) : null}
                      style={{
                        marginTop: '24px', maxWidth: '680px', fontSize: '1.1rem',
                        fontFamily: "'Inter', sans-serif",
                        color: 'rgba(255,255,255,0.90)', letterSpacing: '0.01em',
                        lineHeight: 1.7, textAlign: 'center', fontWeight: 400,
                        cursor: hasSteps ? 'pointer' : 'default',
                        padding: isInitialGreeting ? 0 : '0.9rem 1.5rem',
                        borderRadius: isInitialGreeting ? 0 : '14px',
                        border: isInitialGreeting ? 'none' : '1px solid rgba(165,153,255,0.08)',
                        background: isInitialGreeting ? 'transparent' : 'rgba(165,153,255,0.04)',
                        backdropFilter: isInitialGreeting ? 'none' : 'blur(6px)',
                        pointerEvents: 'auto',
                      }}
                      whileHover={hasSteps ? { background: 'rgba(165,153,255,0.08)', borderColor: 'rgba(165,153,255,0.20)' } as any : undefined}
                    >
                      {display}
                      {hasSteps && (
                        <div style={{ fontSize: '0.55rem', color: 'rgba(165,153,255,0.45)', marginTop: '0.6rem', letterSpacing: '0.2em', fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                          TAP TO VIEW FULL REPORT
                        </div>
                      )}
                    </motion.div>
                  );
                })()}
              </div>

            </div>
          </div>

          {/* Audio Spectrum Removed */}
          {/* Input Box moved to global footer */}
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        {!isMobile && (
        <div 
          className="hide-scrollbar"
          data-lenis-prevent="true"
          style={{
          width: isMobile ? '100%' : '300px', flexShrink: 0,
          background: 'transparent',
          borderLeft: 'none',
          display: 'flex', flexDirection: 'column',
          overflow: isMobile ? 'visible' : 'hidden',
          overflowY: isMobile ? 'visible' : 'auto',
          overscrollBehavior: 'contain',
          minHeight: isMobile ? '500px' : 'auto',
          padding: '1rem 1.5rem',
          gap: '2rem',
          zIndex: 10,
          pointerEvents: 'auto'
        }}>
          <TerminalFeed 
            agentLogs={agentLogs}
            terminalLines={terminalLines}
            activeAgents={activeAgents}
            AGENTS={AGENTS}
          />
        </div>
        )}
        </div> {/* ── END PANELS CONTAINER ── */}

        {/* ── FLOATING GLOBAL COMMAND BAR ──────────────────────────────── */}
        <div style={{
          position: 'absolute',
          bottom: isMobile ? '120px' : '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)',
          maxWidth: '800px',
          background: 'rgba(20, 20, 22, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '32px',
          backdropFilter: 'saturate(180%) blur(32px)',
          WebkitBackdropFilter: 'saturate(180%) blur(32px)',
          padding: '8px 12px 8px 24px',
          display: 'flex', alignItems: 'center',
          zIndex: 20,
          boxShadow: '0 16px 32px rgba(0,0,0,0.4)',
          pointerEvents: 'auto'
        }}>

          <form onSubmit={handleCommand} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%', gap: '1rem', height: '100%' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} style={{ width: '6px', height: '12px', background: '#a599ff', borderRadius: '3px' }} />
                <span style={{ color: '#a599ff', fontSize: '0.85rem', fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: '0.02em' }}>
                  Sys.Input
                </span>
              </div>
              
              <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }} />

              <input
                type="text"
                value={displayText}
                onChange={e => setInputText(e.target.value)}
                placeholder={isConversationListening ? 'Receiving audio stream...' : isSpeaking ? 'Transmitting response...' : 'Enter command sequence...'}
                disabled={isConversationListening || isSpeaking}
                style={{
                  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                  color: '#fff', fontSize: '1.05rem', fontFamily: "'Inter', sans-serif",
                  letterSpacing: '0.01em', caretColor: '#a599ff', height: '100%'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexShrink: 0 }}>
              <button
                type="button"
                onClick={isConversationActive ? stopConversation : startConversation}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: isConversationActive ? '#5eda9e' : '#a599ff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '0.75rem', fontFamily: "'Inter', sans-serif", letterSpacing: '0.10em',
                  transition: 'all 0.2s', fontWeight: 700,
                  textShadow: isConversationActive ? '0 0 10px rgba(94,218,158,0.5)' : '0 0 10px rgba(165,153,255,0.4)'
                }}
              >
                {isConversationListening ? (
                  <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                    <Radio size={16} />
                  </motion.div>
                ) : (
                  <Mic size={16} />
                )}
                {isConversationActive && !isMobile ? 'MUTE' : !isMobile ? 'OPEN MIC' : null}
              </button>

              <button type="submit" style={{
                background: '#a599ff', 
                border: 'none',
                borderRadius: '24px',
                padding: '10px 24px', 
                color: '#000000',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '0.85rem', fontFamily: "'Inter', sans-serif", letterSpacing: '0.05em', fontWeight: 600,
                transition: 'all 0.2s',
              }}>
                <Send size={16} /> {!isMobile && 'EXECUTE'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes statusGlowPulse {
          0%, 100% { box-shadow: 0 0 6px currentColor; }
          50% { box-shadow: 0 0 18px currentColor, 0 0 30px currentColor; }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
        ::-webkit-scrollbar-thumb { background: rgba(165,153,255,0.22); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(165,153,255,0.42); }
      `}</style>
    </div>
  );
};
