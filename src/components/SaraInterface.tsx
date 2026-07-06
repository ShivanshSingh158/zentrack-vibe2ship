import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Send, X, Activity, Cpu, Zap, Shield, Radio, Terminal, ChevronRight, Circle } from 'lucide-react';
import { useVoice } from '../contexts/VoiceContext';
import { useGlobalData } from '../contexts/GlobalDataContext';
import { agentMemoryStore } from '../stores/agentMemoryStore';
import { orchestrateAgent } from '../agent/orchestrator';
import { tryAcquireLock, releaseLock } from '../agent/orchestrationLock';

const blackHoleImg = new Image();
blackHoleImg.src = '/blackhole.jpg';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentLogEntry {
  id: number;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer' | 'system';
  text: string;
  timestamp: string;
  agent?: string;
}

interface SaraProps {
  onClose: () => void;
  isHomePage?: boolean;   // when true: sits under TopNav, no ESC button
  onCommand?: (prompt: string) => void;
}

import { AGENT_DETAILS } from '../agent/fleet/agentDetails';

// ── Agent Definitions ─────────────────────────────────────────────────────────
const AGENTS = Object.keys(AGENT_DETAILS).map(id => ({
  id,
  color: AGENT_DETAILS[id].color,
  label: AGENT_DETAILS[id].title.split(' ')[0].toUpperCase().substring(0, 5),
  icon: AGENT_DETAILS[id].icon
}));

// ── Utility ───────────────────────────────────────────────────────────────────
const now = () => new Date().toLocaleTimeString('en-US', { hour12: false });

// ── Main Component ─────────────────────────────────────────────────────────────
export const SaraInterface: React.FC<SaraProps> = ({ onClose, isHomePage = false, onCommand }) => {
  const {
    isConversationActive,
    startConversation,
    stopConversation,
    isConversationListening,
    conversationTranscript,
    isSpeaking,
  } = useVoice();

  const globalData = useGlobalData();
  const messages = React.useSyncExternalStore(agentMemoryStore.subscribe, agentMemoryStore.getSnapshot);
  const abortRef = useRef<AbortController | null>(null);
  const [isOrchestrating, setIsOrchestrating] = useState(false);

  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [inputText, setInputText] = useState('');
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [agentErrors, setAgentErrors] = useState<Record<string, boolean>>({});
  const [terminalLines, setTerminalLines] = useState<string[]>([
    '> SYSTEM BOOT COMPLETE',
    '> Sara v4.2.1 INITIALIZED',
    '> OLYMPUS PROTOCOL ONLINE',
    `> NEURAL MESH ACTIVE — ${AGENTS.length} AGENTS STANDING BY`,
  ]);
  const [statusPulse, setStatusPulse] = useState(0);
  const [scanlineY, setScanlineY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const waveFrameRef = useRef<number>(0);

  // ── Time Update ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTimeStr(d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(d.toISOString().split('T')[0]);
    };
    updateTime();
    const t = setInterval(updateTime, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Status Pulse (Throttled for performance) ─────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setStatusPulse(p => (p + 1) % 100), 2000); // 2 seconds instead of 50ms
    return () => clearInterval(t);
  }, []);

  // ── Scanline (Disabled React state thrashing) ───────────────────────────────
  useEffect(() => {
    // Disabled fast scanline Y updates that cause massive React lag
  }, []);

  // ── Agent Log Listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const onLog = (e: CustomEvent) => {
      const step = e.detail;
      const id = ++logIdRef.current;
      let type: AgentLogEntry['type'] = 'system';
      let text = '';
      let agent = '';

      if (step.type === 'thinking') {
        type = 'thinking';
        text = step.title || 'Processing...';
        agent = step.agent || 'ATHENA';
        setActiveAgents(prev => [...new Set([...prev, agent])]);
      } else if (step.type === 'tool_call') {
        type = 'tool_call';
        text = `→ ${step.toolName}(${JSON.stringify(step.args || {}).slice(0, 60)}...)`;
        agent = step.agent || 'TITAN';
      } else if (step.type === 'tool_result') {
        type = 'tool_result';
        text = step.result?.message || 'Done';
        agent = step.agent || 'TITAN';
      } else if (step.type === 'answer') {
        type = 'answer';
        const raw = step.title || step.text || step.message || '';
        const match = raw.match(/SPOKEN_SUMMARY:\s*([\s\S]*)$/i);
        text = match ? match[1].trim() : raw.replace(/[#*`_]/g, '').slice(0, 200);
        agent = 'SARA';
        setActiveAgents([]);
      }

      if (!text) return;
      setAgentLogs(prev => [...prev.slice(-40), { id, type, text, timestamp: now(), agent }]);

      // Error tracking for UI red states
      const lower = text.toLowerCase();
      if (lower.includes('error') || lower.includes('fail') || lower.includes('rate-limited') || lower.includes('quota')) {
        if (agent) {
          setAgentErrors(prev => ({ ...prev, [agent]: true }));
        }
      } else if (agent) {
        // Clear error if they do something successful
        setAgentErrors(prev => ({ ...prev, [agent]: false }));
      }

      // Mirror to terminal
      const prefix = type === 'tool_call' ? '⚡ EXEC' : type === 'answer' ? '✓ SARA' : type === 'thinking' ? '◎ THINK' : '→ TOOL';
      setTerminalLines(prev => [...prev.slice(-50), `[${now()}] ${prefix} :: ${text.slice(0, 80)}`]);
    };
    window.addEventListener('agent-log', onLog as EventListener);
    return () => window.removeEventListener('agent-log', onLog as EventListener);
  }, []);

  // ── Simulated System Logs & Console Interception ─────────────────────────────
  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args) => {
      setTerminalLines(prev => [...prev.slice(-99), `[${now()}] ℹ SYS :: ${args.join(' ')}`]);
      origLog(...args);
    };
    console.warn = (...args) => {
      setTerminalLines(prev => [...prev.slice(-99), `[${now()}] ⚠ WARN :: ${args.join(' ')}`]);
      origWarn(...args);
    };
    console.error = (...args) => {
      setTerminalLines(prev => [...prev.slice(-99), `[${now()}] ❌ ERR :: ${args.join(' ')}`]);
      origError(...args);
    };

    const sysLogs = [
      'Ping gateway 12ms... OK',
      'Syncing neural weights [34.2MB]',
      'Memory GC complete. 1.2GB freed',
      'Auth token refreshed.',
      'Checking subsystem diagnostics... PASS',
      'Re-routing packets through Node 7',
      'Background workers idled.',
    ];

    const interval = setInterval(() => {
      if (Math.random() > 0.4) {
        const log = sysLogs[Math.floor(Math.random() * sysLogs.length)];
        setTerminalLines(prev => [...prev.slice(-99), `[${now()}] ⚙ BACKGROUND :: ${log}`]);
      }
    }, 4500);

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      clearInterval(interval);
    };
  }, []);

  // ── Terminal scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  // ── Voice State Refs for Canvas (Prevents Canvas Restart on State Change) ──
  const isSpeakingRef = useRef(isSpeaking);
  const isListeningRef = useRef(isConversationListening);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    isListeningRef.current = isConversationListening;
  }, [isSpeaking, isConversationListening]);

  // ── Neural Orb Canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      if (!canvas) return;
      // Hard cap the pixel ratio to 1.5. Retina displays drawing 10,000 lines at 4K resolution will cause extreme lag.
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      const newWidth = Math.floor(canvas.offsetWidth * dpr);
      const newHeight = Math.floor(canvas.offsetHeight * dpr);
      
      // Only resize if actually changed to prevent infinite loops
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.scale(dpr, dpr);
      }
    };
    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    // Nodes (3D space)
    const N = 800; // Optimized density for smooth performance on small devices
    type Role = 'pupil' | 'iris' | 'eyebrow';
    type Node = { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; brightness: number; eye: 'left' | 'right'; role: Role; index: number; };
    const nodes: Node[] = [];
    const initNodes = () => {
      nodes.length = 0;
      // Fallback to window dimensions if canvas is not yet laid out by flexbox
      const Wval = canvas.offsetWidth || window.innerWidth || 300;
      const Hval = canvas.offsetHeight || window.innerHeight || 300;
      // 400 nodes per eye: 70 pupil, 230 iris, 100 eyebrow
      for (let i = 0; i < N; i++) {
        const eye = i < N / 2 ? 'left' : 'right';
        const isNarrow = Wval < 768;
        const offset = isNarrow ? Wval * 0.25 : Wval * 0.15;
        const eyeOffsetX = eye === 'left' ? -offset : offset;
        
        const localI = i % (N / 2);
        let role: Role = 'iris';
        let index = localI;
        if (localI < 70) { role = 'pupil'; index = localI; }
        else if (localI < 300) { role = 'iris'; index = localI - 70; }
        else { role = 'eyebrow'; index = localI - 300; }

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

    // Look targets for the eyes
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
    const draw = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight;
      t += 0.008;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2;
      const maxR = Math.min(w, h) * 0.8;
      const speakBoost = isSpeakingRef.current ? 1.4 : 1.0;
      const listenBoost = isListeningRef.current ? 1.2 : 1.0;

      // Animate look targets (Eyes looking around or tracking mouse)
      if (mouse.x !== -1000) {
        // Track mouse if it's on screen
        lookTargetX = (mouse.x - cx) * 0.6;
        lookTargetY = (mouse.y - cy) * 0.6;
        lastLookTime = t;
      } else if (t - lastLookTime > 2 + Math.random() * 2) {
        // Wander randomly if idle
        lookTargetX = (Math.random() - 0.5) * w * 0.25;
        lookTargetY = (Math.random() - 0.5) * h * 0.25;
        lastLookTime = t;
      }
      currentLookX += (lookTargetX - currentLookX) * 0.05;
      currentLookY += (lookTargetY - currentLookY) * 0.05;

      // ── Background Image (Interstellar Gargantua) ──────────────────────────
      if (blackHoleImg.complete && blackHoleImg.naturalWidth > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        // Extremely slow cinematic rotation
        ctx.rotate(t * 0.02);
        // Subtle pulse when speaking
        const scale = isSpeaking ? 1.0 + Math.sin(t*20)*0.015 : 1.0;
        ctx.scale(scale, scale);
        
        const imgSize = maxR * 5.0;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(blackHoleImg, -imgSize/2, -imgSize/2, imgSize, imgSize);
        ctx.restore();

        // Fade the rectangular edges of the image into the dark UI background
        const fadeGrd = ctx.createRadialGradient(cx, cy, maxR * 1.5, cx, cy, maxR * 2.8);
        fadeGrd.addColorStop(0, 'rgba(0, 0, 0, 0)');
        fadeGrd.addColorStop(0.8, 'rgba(0, 0, 0, 0.8)');
        fadeGrd.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = fadeGrd;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fallback glow while loading (Cybernetic Ghost Theme)
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.2);
        grd.addColorStop(0, 'rgba(0, 255, 255, 0.04)');
        grd.addColorStop(0.5, 'rgba(0, 100, 150, 0.02)');
        grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Hexagonal grid overlay ───────────────────────────────────────────────
      const hexSize = 32;
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.015)';
      ctx.lineWidth = 0.5;
      for (let row = 0; row < h / (hexSize * 1.5) + 1; row++) {
        for (let col = 0; col < w / (hexSize * Math.sqrt(3)) + 1; col++) {
          const hx = col * hexSize * Math.sqrt(3) + (row % 2 === 0 ? 0 : hexSize * Math.sqrt(3) / 2);
          const hy = row * hexSize * 1.5;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const angle = (Math.PI / 3) * k - Math.PI / 6;
            const px = hx + hexSize * Math.cos(angle);
            const py = hy + hexSize * Math.sin(angle);
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // ── 3D Projection Helper ─────────────────────────────────────────────────
      const fov = maxR * 1.5; // Stronger perspective for enhanced 3D depth
      const project = (x: number, y: number, z: number) => {
        const scale = fov / (fov + z + maxR); 
        return { px: cx + x * scale, py: cy + y * scale, scale };
      };

      // ── Nodes + connections (3D Physics) ─────────────────────────────────────
      // Sort nodes back-to-front by Z
      nodes.sort((a, b) => b.z - a.z);

      nodes.forEach(node => {
        const { px, py } = project(node.x, node.y, node.z);
        
        // Mouse interaction (Smooth elegant repulsion & illumination)
        const mdx = px - mouse.x;
        const mdy = py - mouse.y;
        const mDist = Math.hypot(mdx, mdy);
        
        if (mDist < 200 && mDist > 0) {
          const force = (200 - mDist) / 200;
          
          // Smooth, elegant push away (parting the water)
          node.vx += (mdx / mDist) * force * 1.2;
          node.vy += (mdy / mDist) * force * 1.2;
          node.vz += force * 0.5;
          
          // Beautiful color/brightness ripple effect
          node.brightness = Math.min(3.0, node.brightness + force * 2.0);
        }

        // Friction
        node.vx *= 0.95;
        node.vy *= 0.95;
        node.vz *= 0.95;
        
        // Independent Bounding Box Springs (allows the mesh to fill widescreen monitors)
        const boundX = w * 0.45;
        const boundY = h * 0.45;
        const boundZ = Math.max(w, h) * 0.6;
        if (Math.abs(node.x) > boundX) node.vx -= Math.sign(node.x) * (Math.abs(node.x) - boundX) * 0.05;
        if (Math.abs(node.y) > boundY) node.vy -= Math.sign(node.y) * (Math.abs(node.y) - boundY) * 0.05;
        if (Math.abs(node.z) > boundZ) node.vz -= Math.sign(node.z) * (Math.abs(node.z) - boundZ) * 0.05;

        // Dual Eye Base Gravity and Look Targets
        const isNarrow = w < 768;
        const offset = isNarrow ? w * 0.25 : w * 0.15;
        const eyeOffsetX = node.eye === 'left' ? -offset : offset;
        const targetX = eyeOffsetX + currentLookX;
        const targetY = currentLookY;

        if (node.role === 'pupil') {
            // Hyper-dense pupil core tracking the look target
            const pull = 0.05;
            node.vx -= (node.x - targetX) * pull;
            node.vy -= (node.y - targetY) * pull;
            node.vz -= node.z * pull;
            node.brightness = 2.0; // Keep pupil bright
        } else if (node.role === 'iris') {
            // Gravity pulling them to form the eye shape
            const eyePull = 0.008;
            node.vx -= (node.x - targetX) * eyePull;
            node.vy -= (node.y - targetY) * eyePull;
            node.vz -= node.z * eyePull;

            // Hollow Iris: push nodes out of the absolute center of their respective eye
            const distFromEyeCenter = Math.hypot(node.x - targetX, node.y - targetY, node.z);
            if (distFromEyeCenter < 80) {
                const push = (80 - distFromEyeCenter) * 0.05;
                node.vx += ((node.x - targetX) / distFromEyeCenter) * push;
                node.vy += ((node.y - targetY) / distFromEyeCenter) * push;
                node.vz += (node.z / distFromEyeCenter) * push;
            }
        } else if (node.role === 'eyebrow') {
            // Architectural eyebrow arches
            // Map index (0-100) to x offset (-100 to 100)
            const archX = (node.index / 100 - 0.5) * 200;
            // Quadratic curve for the arch
            const archY = -120 + Math.pow(archX / 100, 2) * 40;
            
            // Add slight speaking animation to eyebrows (raise them)
            const speakRaise = isSpeakingRef.current ? -20 : 0;
            
            const pull = 0.02;
            node.vx -= (node.x - (eyeOffsetX + archX + currentLookX * 0.5)) * pull;
            node.vy -= (node.y - (targetY + archY + speakRaise)) * pull;
            node.vz -= (node.z - 20) * pull; // Slightly forward
        }

        // Local 3D rotation for pupil and iris (eyebrows don't spin)
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

        // Higher-speed flowing wave animation
        node.vx += Math.sin(t * 18 + node.y * 0.015) * 0.25;
        node.vy += Math.cos(t * 22 + node.x * 0.015) * 0.25;
        node.vz += Math.sin(t * 15 + node.z * 0.015) * 0.25;

        // Upgraded physics engine limit for absolute speed
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

      // Draw 3D Lines and Nodes
      nodes.forEach((node, i) => {
        const p1 = project(node.x, node.y, node.z);
        let connectionsDrawn = 0;
        
        // Connections & Anti-Clustering Repulsion (Extremely optimized culling)
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
            // Draw subtle web line (Limit to 4 connections per node for extreme performance, and skip pupils)
            if (connectionsDrawn < 4 && node.role !== 'pupil' && other.role !== 'pupil') {
              const p2 = project(other.x, other.y, other.z);
              // Enhanced depth shading: square the scale so far lines vanish entirely
              const alpha = (1 - d3 / 55) * 0.3 * (node.brightness > 1 ? 1.5 : 1) * (p1.scale * p1.scale);
              ctx.beginPath();
              // Cybernetic Ghost Theme: Soft cyan web lines
              ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
              ctx.lineWidth = 0.6 * p1.scale;
              ctx.moveTo(p1.px, p1.py);
              ctx.lineTo(p2.px, p2.py);
              ctx.stroke();
              connectionsDrawn++;
            }

            // Local Node Repulsion (Prevents clusters and forces them to cover more area)
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

        // Draw node
        const pulse = 0.5 + Math.sin(t * 3 + node.brightness * 10) * 0.5;
        const nodeAlpha = isConversationListening ? Math.random() * 0.3 + 0.7 : pulse;
        ctx.beginPath();
        ctx.arc(p1.px, p1.py, node.r * p1.scale * listenBoost * (node.brightness > 1 ? 1.5 : 1), 0, Math.PI * 2);
        
        // Theme based on anatomy role
        if (node.role === 'pupil') {
            ctx.fillStyle = `rgba(200, 255, 255, ${nodeAlpha * Math.min(1, node.brightness) * p1.scale})`; // Bright white-cyan core
            if (node.brightness > 1) {
                ctx.shadowBlur = 15 * p1.scale;
                ctx.shadowColor = 'rgba(0, 255, 255, 0.9)';
            }
        } else if (node.role === 'eyebrow') {
            ctx.fillStyle = `rgba(0, 255, 255, ${nodeAlpha * Math.min(1, node.brightness) * 0.8 * p1.scale})`; // Neon cyan
        } else {
            ctx.fillStyle = `rgba(0, 180, 220, ${nodeAlpha * Math.min(1, node.brightness) * 0.6 * p1.scale})`; // Deep teal/cyan iris
            if (node.brightness > 1) {
                ctx.shadowBlur = 8 * p1.scale;
                ctx.shadowColor = 'rgba(0, 200, 255, 0.6)';
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
  }, [isSpeaking, isConversationListening]);

  // ── Waveform Canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeWave = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio;
      const newWidth = Math.floor(canvas.offsetWidth * dpr);
      const newHeight = Math.floor(canvas.offsetHeight * dpr);
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        ctx.scale(dpr, dpr);
      }
    };
    resizeWave();
    const roWave = new ResizeObserver(() => resizeWave());
    roWave.observe(canvas);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const bars = 64;
    let t = 0;
    let levels = new Array(bars).fill(0).map(() => Math.random() * 0.3);

    const drawWave = () => {
      t += 0.04;
      ctx.clearRect(0, 0, W, H);

      const barW = W / bars;
      const cx = W / 2;

      for (let i = 0; i < bars; i++) {
        const target = isSpeakingRef.current
          ? 0.2 + Math.abs(Math.sin(t * 3 + i * 0.3) * Math.cos(t + i * 0.1)) * 0.8
          : isListeningRef.current
          ? 0.1 + Math.abs(Math.sin(t * 5 + i * 0.4)) * 0.4
          : 0.02 + Math.abs(Math.sin(t * 0.5 + i * 0.5)) * 0.08;

        levels[i] += (target - levels[i]) * 0.15;
        const h = levels[i] * H;
        const x = i * barW;
        const distFromCenter = Math.abs(i - bars / 2) / (bars / 2);
        const alpha = 1 - distFromCenter * 0.5;

        const g = ctx.createLinearGradient(x, H / 2 - h / 2, x, H / 2 + h / 2);
        g.addColorStop(0, `rgba(0, 220, 255, ${alpha * 0.3})`);
        g.addColorStop(0.5, `rgba(0, 200, 255, ${alpha})`);
        g.addColorStop(1, `rgba(0, 220, 255, ${alpha * 0.3})`);

        const rounding = Math.min(barW * 0.4, 3);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x + 1, H / 2 - h / 2, barW - 2, h, rounding);
        ctx.fill();

        // Mirror glow
        ctx.fillStyle = `rgba(0, 200, 255, ${alpha * 0.06})`;
        ctx.beginPath();
        ctx.roundRect(x + 1, H / 2 - h / 2, barW - 2, h, rounding);
        ctx.fill();
      }

      // Center line
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      ctx.stroke();

      waveFrameRef.current = requestAnimationFrame(drawWave);
    };

    drawWave();
    return () => {
      roWave.disconnect();
      cancelAnimationFrame(waveFrameRef.current);
    };
  }, []); // Empty dependency array means canvas starts once and never resets!

  // ── Auto-greet on first mount ──────────────────────────────────────────────
  // (Disabled per user request)
  useEffect(() => {
    // No auto greeting
  }, []);

  // ── Command Submit ────────────────────────────────────────────────────────────
  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    if (onCommand) {
      onCommand(text);
      setInputText('');
      return;
    }

    if (!tryAcquireLock('user')) {
      console.warn('[SaraInterface] Could not acquire orchestration lock — another command is running.');
      setTerminalLines(prev => [...prev.slice(-50), `[${now()}] ❌ ERROR :: Another command is running`]);
      return;
    }

    const ts = now();
    setTerminalLines(prev => [...prev.slice(-50), `[${ts}] > CMD :: ${text}`]);
    setInputText('');
    setIsOrchestrating(true);
    
    agentMemoryStore.appendMessage({ role: 'user', title: text });
    abortRef.current = new AbortController();

    try {
      const stepsAccumulated: any[] = [];
      const historyContext = messages.map(h => ({ role: h.role as 'user' | 'model', text: h.title }));

      const answer = await orchestrateAgent(
        text,
        globalData,
        '', // apiKey is managed server-side
        (step) => {
          stepsAccumulated.push(step);
          window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, source: 'user' } }));
        },
        historyContext,
        abortRef.current.signal
      );

      agentMemoryStore.appendMessage({
        role: 'agent',
        title: answer,
        steps: stepsAccumulated.filter(s => s.type === 'tool_call' || s.type === 'tool_result')
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        agentMemoryStore.appendMessage({ role: 'agent', title: `Sorry, something went wrong: ${err.message}` });
        setTerminalLines(prev => [...prev.slice(-50), `[${now()}] ❌ ERROR :: ${err.message}`]);
      }
    } finally {
      setIsOrchestrating(false);
      releaseLock('user');
    }
  };

  // Cancel running agent when SARA closes
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (isOrchestrating) {
        releaseLock('user');
      }
    };
  }, [isOrchestrating]);

  // ── Derived states ────────────────────────────────────────────────────────────
  const displayText = conversationTranscript || inputText;
  const statusLabel = isSpeaking
    ? 'TRANSMITTING'
    : isConversationListening
    ? 'LISTENING'
    : isOrchestrating
    ? 'PROCESSING'
    : isConversationActive
    ? 'STANDBY'
    : 'OFFLINE';

  const statusColor = isSpeaking
    ? '#00ffaa'
    : isConversationListening
    ? '#00d4ff'
    : isOrchestrating
    ? '#fbbf24'
    : isConversationActive
    ? '#a78bfa'
    : '#4b5563';

  return (
    <div style={{
      position: 'fixed',
      top: (isHomePage && !isMobile) ? '70px' : 0,
      left: 0,
      right: 0,
      bottom: (isHomePage && isMobile) ? 'calc(65px + env(safe-area-inset-bottom, 0px))' : 0,
      zIndex: isHomePage ? 5 : 9999,
      background: 'radial-gradient(ellipse at 50% 40%, #000d1a 0%, #000508 60%, #000000 100%)',
      color: '#c7e8ff',
      fontFamily: "'Courier New', 'Space Mono', monospace",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
        background: `repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,200,255,0.01) 3px, rgba(0,200,255,0.01) 4px)`,
        mixBlendMode: 'overlay',
      }} />

      {/* Moving scanline beam */}
      <div style={{
        position: 'absolute', left: 0, right: 0, pointerEvents: 'none', zIndex: 2,
        top: `${scanlineY}%`, height: '2px',
        background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.06) 30%, rgba(0,200,255,0.06) 70%, transparent)',
        transition: 'none',
      }} />

      {/* ── TOP HUD BAR ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexDirection: 'row',
        padding: isMobile ? '0.75rem 1rem' : '1rem 2rem',
        gap: '0',
        borderBottom: '1px solid rgba(0,200,255,0.1)',
        background: 'rgba(0, 10, 25, 0.8)',
        backdropFilter: 'blur(10px)',
        zIndex: 10,
        flexShrink: 0,
      }}>
        {/* Left: Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1.5rem', flex: 1 }}>
          {/* Close — only shown when opened as overlay */}
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: isMobile ? '1.2rem' : '1.6rem', fontWeight: 900, letterSpacing: '0.25em', color: '#fff' }}>Sara</span>
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'steps(1)' }}
                style={{ fontSize: '1.6rem', color: '#00d4ff', fontWeight: 900 }}
              >_</motion.span>
            </div>
            {!isMobile && (
            <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: 'rgba(0,200,255,0.5)', marginTop: '2px' }}>
              SYNTHETIC ARTIFICIAL RESOURCE ASSISTANT — OLYMPUS PROTOCOL v4.2
            </div>
            )}
          </div>
        </div>

        {/* Center: Status badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <motion.div
            animate={{ boxShadow: isSpeaking || isConversationListening
              ? [`0 0 10px ${statusColor}40`, `0 0 25px ${statusColor}80`, `0 0 10px ${statusColor}40`]
              : [`0 0 6px ${statusColor}20`, `0 0 12px ${statusColor}30`, `0 0 6px ${statusColor}20`]
            }}
            transition={{ duration: 1.2, repeat: Infinity }}
            style={{
              padding: isMobile ? '2px 10px' : '4px 20px', borderRadius: '3px',
              border: `1px solid ${statusColor}60`,
              background: `${statusColor}10`,
              fontSize: isMobile ? '0.6rem' : '0.75rem', fontWeight: 700, letterSpacing: '0.3em',
              color: statusColor,
            }}
          >
            {statusLabel}
          </motion.div>
          {!isMobile && (
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.2em', color: 'rgba(0,200,255,0.35)' }}>
            CORE SYSTEMS // {isSpeaking ? 'AUDIO STREAM ACTIVE' : isConversationListening ? 'STT PROCESSING' : 'STANDBY MODE'}
          </div>
          )}
        </div>

        {/* Right: Clock */}
        <div style={{ textAlign: 'right', flex: 1 }}>
          <div style={{ fontSize: isMobile ? '1.2rem' : '1.4rem', fontWeight: 900, letterSpacing: '0.15em', color: '#fff', lineHeight: 1 }}>
            {timeStr}
          </div>
          {!isMobile && (
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'rgba(0,200,255,0.5)', marginTop: '4px' }}>
            {dateStr} // UTC+5:30
          </div>
          )}
        </div>
      </div>

      {/* ── MAIN BODY ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden', zIndex: 5 }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        {!isMobile && (
        <div style={{
          width: isMobile ? '100%' : '250px', flexShrink: 0,
          borderRight: isMobile ? 'none' : '1px solid rgba(0,200,255,0.08)',
          borderBottom: isMobile ? '1px solid rgba(0,200,255,0.08)' : 'none',
          background: 'rgba(0,5,15,0.6)',
          display: 'flex', flexDirection: 'column',
          padding: '1.5rem 1rem',
          gap: '1.5rem',
          overflowY: isMobile ? 'visible' : 'auto',
        }}>

          {/* System Health */}
          <div>
            <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: '#00d4ff', marginBottom: '0.75rem', opacity: 0.7 }}>
              CORE SYSTEMS // DIAGNOSTICS
            </div>
            {[
              { label: 'CPU LOAD',   val: 34 + statusPulse % 12, color: '#34d399' },
              { label: 'NEURAL MESH', val: 78 + statusPulse % 8, color: '#00d4ff' },
              { label: 'VOICE SYNC',  val: isSpeaking ? 95 : isConversationListening ? 88 : 20, color: '#a78bfa' },
              { label: 'AGENT POOL',  val: activeAgents.length > 0 ? 90 : 40, color: '#fbbf24' },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', letterSpacing: '0.1em', marginBottom: '4px', opacity: 0.8 }}>
                  <span>{item.label}</span>
                  <span style={{ color: item.color }}>{item.val}%</span>
                </div>
                <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                  <motion.div
                    animate={{ width: `${item.val}%` }}
                    transition={{ duration: 0.5 }}
                    style={{ height: '100%', borderRadius: '2px', background: `linear-gradient(90deg, ${item.color}80, ${item.color})`, boxShadow: `0 0 6px ${item.color}` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Agent Fleet */}
          <div>
            <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: '#00d4ff', marginBottom: '0.75rem', opacity: 0.7 }}>
              ACTIVE AGENTS // FLEET STATUS
            </div>
            {AGENTS.map(agent => {
              const isActive = activeAgents.includes(agent.id);
              const isError = agentErrors[agent.id];
              const displayColor = isError ? '#ef4444' : agent.color;
              
              return (
                <motion.div key={agent.id}
                  animate={{ opacity: isActive || isError ? 1 : 0.4 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    marginBottom: '6px', padding: '6px 8px',
                    borderRadius: '4px',
                    border: `1px solid ${isActive || isError ? displayColor + '40' : 'transparent'}`,
                    background: isActive || isError ? `${displayColor}10` : 'transparent',
                    transition: 'all 0.3s',
                  }}>
                  <motion.div
                    animate={{ scale: isActive || isError ? [1, 1.3, 1] : 1, boxShadow: isActive || isError ? [`0 0 4px ${displayColor}`, `0 0 12px ${displayColor}`, `0 0 4px ${displayColor}`] : 'none' }}
                    transition={{ duration: isError ? 0.4 : 0.8, repeat: isActive || isError ? Infinity : 0 }}
                    style={{ width: '7px', height: '7px', borderRadius: '50%', background: isActive || isError ? displayColor : '#1f2937', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', flex: 1, color: isError ? displayColor : 'inherit' }}>{agent.id}</span>
                  <span style={{ fontSize: '0.5rem', color: displayColor, opacity: 0.7 }}>{isError ? 'ERROR' : agent.label}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
        )}

        {/* ── CENTER ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', minHeight: 0 }}>

          {/* Neural Orb Canvas */}
          <div style={{ flex: 1, position: 'relative' }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

            {/* ── CLICKABLE ORB BUTTON — sits exactly on the orb center ── */}
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
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '6px',
              }}
            >
              {/* Invisible hit area — visual handled by canvas */}
            </div>

            {/* Center status overlay (positioned like a mouth/chin below the eyes) */}
            <div style={{
              position: 'absolute', 
              top: '50%', left: 0, right: 0,
              marginTop: '60px', /* Push below the eyes */
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-start',
              pointerEvents: 'none',
              gap: '2rem'
            }}>
              {/* Tap-to-speak CTA — shows when offline */}
              <div style={{ height: '20px' }}>
                {!isConversationActive && !isSpeaking && (
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5], scale: [0.97, 1.03, 0.97] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ textAlign: 'center' }}
                  >
                    <div style={{
                      fontSize: '0.55rem', letterSpacing: '0.3em',
                      color: '#00d4ff', textShadow: '0 0 12px #00d4ff',
                      paddingLeft: '0.3em' /* Fix centering offset caused by letter-spacing */
                    }}>
                      TAP ORB TO SPEAK
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Status text */}
              <div style={{ textAlign: 'center' }}>
                <motion.div
                  key={statusLabel}
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  style={{ fontSize: '0.55rem', letterSpacing: '0.3em', paddingLeft: '0.3em', color: '#00d4ff', opacity: 0.6, marginBottom: '6px' }}
                >
                  STATUS
                </motion.div>
                <motion.h2
                  key={statusLabel + '2'}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    fontSize: '1.75rem', margin: 0, letterSpacing: '0.2em', paddingLeft: '0.2em', fontWeight: 900,
                    color: statusColor,
                    textShadow: `0 0 20px ${statusColor}60`,
                  }}
                >
                  {statusLabel}
                </motion.h2>
                {conversationTranscript && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      marginTop: '12px', maxWidth: '320px', fontSize: '0.75rem',
                      color: 'rgba(0,200,255,0.8)', letterSpacing: '0.05em',
                      lineHeight: 1.5, textAlign: 'center',
                    }}
                  >
                    “{conversationTranscript}”
                  </motion.div>
                )}
                {!conversationTranscript && messages.length > 0 && messages[messages.length - 1].role === 'agent' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      marginTop: '12px', maxWidth: '400px', fontSize: '0.75rem',
                      color: 'rgba(0,200,255,0.9)', letterSpacing: '0.02em',
                      lineHeight: 1.5, textAlign: 'center',
                    }}
                  >
                    {messages[messages.length - 1].title.length > 150 
                      ? messages[messages.length - 1].title.slice(0, 150) + '...'
                      : messages[messages.length - 1].title}
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Waveform */}
          <div style={{ height: isMobile ? '50px' : '80px', borderTop: '1px solid rgba(0,200,255,0.08)', position: 'relative', flexShrink: 0 }}>
            <canvas ref={waveCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            <div style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
              fontSize: '0.5rem', letterSpacing: '0.2em', color: 'rgba(0,200,255,0.4)',
            }}>
              AUDIO // SPECTRUM
            </div>
          </div>

          {/* Terminal Input */}
          <div style={{
            padding: isMobile ? '0.75rem 1rem' : '0.75rem 1.5rem',
            borderTop: '1px solid rgba(0,200,255,0.1)',
            background: 'rgba(0,5,15,0.8)',
            flexShrink: 0,
          }}>
            <form onSubmit={handleCommand} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <motion.div
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  style={{ color: '#00d4ff', fontSize: '0.8rem', letterSpacing: '0.1em', flexShrink: 0 }}
                >
                  Sara\&gt;
                </motion.div>
                <input
                  type="text"
                  value={displayText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={isConversationListening ? 'RECEIVING AUDIO STREAM...' : isSpeaking ? 'TRANSMITTING RESPONSE...' : 'ENTER COMMAND SEQUENCE...'}
                  disabled={isConversationListening || isSpeaking}
                  style={{
                    flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                    color: '#e0f2fe', fontSize: '0.85rem', fontFamily: 'inherit',
                    letterSpacing: '0.05em', caretColor: '#00d4ff',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={isConversationActive ? stopConversation : startConversation}
                  style={{
                    background: isConversationActive
                      ? 'rgba(0,200,255,0.2)'
                      : 'linear-gradient(135deg, rgba(0,200,255,0.15), rgba(0,100,255,0.1))',
                    border: `1px solid ${isConversationActive ? '#00d4ff' : 'rgba(0,200,255,0.3)'}`,
                    borderRadius: '6px', padding: isMobile ? '8px 12px' : '8px 18px',
                    color: isConversationActive ? '#00d4ff' : 'rgba(0,200,255,0.6)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '0.7rem', letterSpacing: '0.12em',
                    transition: 'all 0.2s',
                    boxShadow: isConversationActive ? '0 0 16px rgba(0,200,255,0.3)' : 'none',
                    fontWeight: isConversationActive ? 700 : 400,
                  }}
                >
                  {isConversationListening ? (
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                      <Radio size={13} />
                    </motion.div>
                  ) : (
                    <Mic size={13} />
                  )}
                  {isConversationActive && !isMobile ? 'MUTE' : !isMobile ? 'OPEN MIC' : null}
                </button>
                <button type="submit" style={{
                  background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)',
                  borderRadius: '6px', padding: isMobile ? '8px 12px' : '6px 12px', color: '#00d4ff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '0.65rem', letterSpacing: '0.1em',
                }}>
                  <Send size={13} /> {!isMobile && 'EXEC'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        {!isMobile && (
        <div style={{
          width: isMobile ? '100%' : '250px', flexShrink: 0,
          borderLeft: isMobile ? 'none' : '1px solid rgba(0,200,255,0.08)',
          borderTop: isMobile ? '1px solid rgba(0,200,255,0.08)' : 'none',
          background: 'rgba(0,5,15,0.6)',
          display: 'flex', flexDirection: 'column',
          overflow: isMobile ? 'visible' : 'hidden',
          minHeight: isMobile ? '500px' : 'auto',
        }}>

          {/* Agent Activity Feed */}
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(0,200,255,0.08)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: '#00d4ff', opacity: 0.7, marginBottom: '8px' }}>
              AGENT ACTIVITY // LIVE FEED
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <AnimatePresence initial={false}>
                {agentLogs.slice(-15).map(log => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{ marginBottom: '6px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}
                  >
                    <span style={{
                      fontSize: '0.5rem', letterSpacing: '0.1em', flexShrink: 0,
                      color: log.type === 'answer' ? '#34d399' : log.type === 'tool_call' ? '#fbbf24' : log.type === 'thinking' ? '#a78bfa' : '#60a5fa',
                      marginTop: '1px',
                    }}>
                      {log.type === 'answer' ? '✓' : log.type === 'tool_call' ? '⚡' : log.type === 'thinking' ? '◎' : '→'}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(200,220,255,0.7)', lineHeight: 1.3 }}>
                      {log.text.slice(0, 70)}{log.text.length > 70 ? '…' : ''}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {agentLogs.length === 0 && (
                <div style={{ fontSize: '0.6rem', color: 'rgba(0,200,255,0.3)', fontStyle: 'italic' }}>
                  &gt; Awaiting agent dispatch...
                </div>
              )}
            </div>
          </div>

          {/* System Terminal */}
          <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: '#00d4ff', opacity: 0.7, marginBottom: '8px', flexShrink: 0 }}>
              SYSTEM TERMINAL // LIVE LOG
            </div>
            <div
              ref={terminalRef}
              style={{ flex: 1, overflowY: 'auto', fontSize: '0.55rem', color: 'rgba(0,200,255,0.6)', letterSpacing: '0.05em', lineHeight: 1.6 }}
            >
              {terminalLines.map((line, i) => (
                <div key={i} style={{ borderLeft: '2px solid rgba(0,200,255,0.1)', paddingLeft: '6px', marginBottom: '2px' }}>
                  {line}
                </div>
              ))}
            </div>
          </div>

          {/* Thread Schedule */}
          <div style={{ padding: '1rem', borderTop: '1px solid rgba(0,200,255,0.08)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', color: '#00d4ff', opacity: 0.7, marginBottom: '8px' }}>
              SYSTEM I/O // THREAD STATUS
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.55rem', color: 'rgba(200,220,255,0.5)' }}>ACTIVE THREADS</span>
              <motion.span
                animate={{ color: activeAgents.length > 0 ? ['#00d4ff', '#a78bfa', '#00d4ff'] : ['#4b5563'] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em' }}
              >
                {activeAgents.length > 0 ? 'PROCESSING' : 'IDLE'}
              </motion.span>
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
              {AGENTS.map(a => (
                <motion.div
                  key={a.id}
                  animate={{
                    background: activeAgents.includes(a.id) ? [`${a.color}30`, `${a.color}60`, `${a.color}30`] : 'rgba(255,255,255,0.03)',
                    borderColor: activeAgents.includes(a.id) ? a.color : 'rgba(255,255,255,0.08)',
                  }}
                  transition={{ duration: 0.8, repeat: activeAgents.includes(a.id) ? Infinity : 0 }}
                  style={{
                    fontSize: '0.45rem', padding: '3px 6px', borderRadius: '3px',
                    border: '1px solid',
                    color: activeAgents.includes(a.id) ? a.color : 'rgba(255,255,255,0.25)',
                    letterSpacing: '0.1em',
                  }}
                >
                  {a.label}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        ::-webkit-scrollbar-thumb { background: rgba(0,200,255,0.2); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,200,255,0.4); }
      `}</style>
    </div>
  );
};
