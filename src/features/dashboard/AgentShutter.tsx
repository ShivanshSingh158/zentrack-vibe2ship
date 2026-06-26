/**
 * AgentShutter — The Quantum Capsule active-agent visualization.
 *
 * Shows which agent is currently running inside an animated "capsule chamber".
 * When idle, displays the quantum reactor orb with pulsing rings.
 * When an agent is dispatched, the force-field dissolves and the agent avatar
 * slides in with scanning reticles and capability badge strips.
 *
 * Props:
 *  - activeAgent      — key of the currently running agent (e.g. 'ORACLE')
 *  - isExecuting      — whether any orchestration is in progress
 *  - agentStatus      — current status string shown in the HUD terminal
 *  - isExecuting      — controls waveform animation
 *  - pipelineSteps    — current step indicators (Routing → Reasoning → Execution → Verification)
 *  - onAgentDockClick — callback when user clicks an idle agent icon
 */
import { useState, useEffect } from 'react';
import { AGENT_DETAILS } from '../../agent/fleet/agentDetails';
import '../../styles/quantum-deck.css';

interface PipelineStep {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'completed';
}

interface AgentShutterProps {
  activeAgent: string | null;
  isExecuting: boolean;
  agentStatus: string;
  pipelineSteps: PipelineStep[];
  onAgentDockClick: (agentKey: string) => void;
}

export function AgentShutter({
  activeAgent,
  isExecuting,
  agentStatus,
  pipelineSteps,
  onAgentDockClick,
}: AgentShutterProps) {
  // ── Capsule door state machine ──────────────────────────────────────────────
  // Doors close → wait 400ms → swap displayed agent → open doors.
  // This prevents the avatar from swapping mid-animation.
  const [displayAgent, setDisplayAgent] = useState<string | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  // Mechanical "slam" shake when doors finish closing
  useEffect(() => {
    if (doorsOpen) return;
    const shakeTimer = setTimeout(() => {
      setIsShaking(true);
      const clearTimer = setTimeout(() => setIsShaking(false), 400);
      return () => clearTimeout(clearTimer);
    }, 400);
    return () => clearTimeout(shakeTimer);
  }, [doorsOpen]);

  // Swap agent avatar only after doors have closed
  useEffect(() => {
    if (isExecuting && activeAgent) {
      if (activeAgent !== displayAgent) {
        setDoorsOpen(false);
        const swapTimer = setTimeout(() => {
          setDisplayAgent(activeAgent);
          setDoorsOpen(true);
        }, 400);
        return () => clearTimeout(swapTimer);
      } else {
        setDoorsOpen(true);
      }
    } else {
      setDoorsOpen(false);
      const clearTimer = setTimeout(() => setDisplayAgent(null), 400);
      return () => clearTimeout(clearTimer);
    }
  }, [activeAgent, isExecuting, displayAgent]);

  const activeDetails  = activeAgent ? AGENT_DETAILS[activeAgent] : AGENT_DETAILS.ATHENA;
  const displayDetails = displayAgent ? AGENT_DETAILS[displayAgent] : null;

  return (
    <div className="quantum-deck-container">
      {/* ── Capsule chamber ───────────────────────────────────────────────────── */}
      <div
        className={`quantum-capsule ${isShaking ? 'capsule-shudder' : ''} ${isExecuting ? 'capsule-active' : ''}`}
        style={{
          '--agent-color':  displayDetails?.color  ?? 'rgba(167, 139, 250, 0.5)',
          '--agent-shadow': (displayDetails?.secondaryColor ?? '#a855f7') + '40',
        } as React.CSSProperties}
      >
        {/* Flashing "FLEET_ACTIVE" beacon */}
        <div className="capsule-warning-beacon">
          <span className="beacon-dot" />
          <span>FLEET_ACTIVE</span>
        </div>

        <div className="capsule-chamber">
          {displayDetails ? (
            /* Active: agent avatar + metadata */
            <div className="chamber-content">
              <div className="chamber-left">
                <div className="chamber-viewport">
                  <div className="hud-reticle-circle ring-slow" />
                  <div className="hud-reticle-circle ring-fast" />
                  <div className="hud-reticle-corners" />
                  <img src={displayDetails.image} alt={displayDetails.title} className="chamber-avatar hologram-glow" />
                  <div className="hud-overlay-scanner" />
                </div>
              </div>

              <div className="chamber-right">
                <div className="chamber-metrics-header">
                  <div className="chamber-agent-title">
                    <span>{displayDetails.icon}</span>
                    <span>{displayDetails.title}</span>
                  </div>
                  <div className="chamber-agent-tagline">{displayDetails.tagline}</div>
                </div>

                <div className="chamber-description">{displayDetails.description}</div>

                <div className="chamber-depicts-container">
                  <div className="depicts-title">Depicted Capabilities //</div>
                  <div className="depicts-grid">
                    {displayDetails.depicts.map((dep, idx) => (
                      <div key={idx} className="depicts-badge">
                        <span className="depicts-badge-dot" />
                        <span>{dep}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Idle: pulsing reactor orb */
            <div className="quantum-idle-chamber">
              <div className="quantum-core-reactor">
                <div className="quantum-reactor-ring ring-1" />
                <div className="quantum-reactor-ring ring-2" />
                <div className="quantum-reactor-ring ring-3" />
                <div className="quantum-reactor-orb" />
              </div>
              <div className="quantum-idle-text">
                <div className="quantum-idle-title">ZenithOS Operational</div>
                <div className="quantum-idle-subtitle">Chamber locked · Awaiting dispatch command</div>
              </div>
            </div>
          )}
        </div>

        {/* Quantum Stasis Force Field overlay — dissolves when agent is dispatched */}
        <div
          className={`stasis-force-field ${doorsOpen ? 'dissolved' : 'active'} ${isShaking ? 'shield-shockwave' : ''}`}
          style={{
            '--agent-color':  activeDetails.color,
            '--agent-shadow': activeDetails.secondaryColor + '40',
          } as React.CSSProperties}
        >
          <div className="shield-grid" />
          <div className="shield-scanner" />
          <div className="shield-energy-ripples" />
          <div className="shield-corner top-left" />
          <div className="shield-corner top-right" />
          <div className="shield-corner bottom-left" />
          <div className="shield-corner bottom-right" />

          <div className="shield-center-core">
            <div className="core-orbit ring-1" />
            <div className="core-orbit ring-2" />
            <div className="core-orbit ring-3" />
            <div className="core-power-node" />
            <div className="core-lock-status">STASIS // SECURED</div>
          </div>

          <div className="shield-hud-panel panel-left">
            <div className="hud-header">SYS_CONTAINMENT //</div>
            <div className="hud-metric-row"><span className="metric-label">TEMP:</span><span className="metric-val">0.04 K</span></div>
            <div className="hud-metric-row"><span className="metric-label">SHLD:</span><span className="metric-val">100%</span></div>
            <div className="hud-metric-row"><span className="metric-label">PRSS:</span><span className="metric-val">0.00 kPa</span></div>
          </div>

          <div className="shield-hud-panel panel-right">
            <div className="hud-header">QUANTUM_DECK //</div>
            <div className="hud-metric-row"><span className="metric-label">VOLT:</span><span className="metric-val">NOMINAL</span></div>
            <div className="hud-metric-row"><span className="metric-label">SYNC:</span><span className="metric-val">STABLE</span></div>
            <div className="hud-metric-row"><span className="metric-label">GRID:</span><span className="metric-val">SECURE</span></div>
          </div>
        </div>
      </div>

      {/* ── HUD terminal + pipeline ────────────────────────────────────────────── */}
      <div
        className="quantum-monitor-row"
        style={{
          width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem',
          margin: '1rem 0 0.5rem 0',
          '--agent-color':  activeDetails.color,
          '--agent-shadow': activeDetails.secondaryColor + '40',
        } as React.CSSProperties}
      >
        <div className="hud-terminal-console" style={{ width: '100%', minHeight: '60px', margin: 0 }}>
          <span style={{ color: '#71717a' }}>&gt;_ [SYS_PROMPT]:</span> {agentStatus}
          <span className="hud-console-cursor" />
        </div>

        <div className="hud-footer-row" style={{ width: '100%', marginTop: '0.2rem' }}>
          {/* Waveform — pauses when idle */}
          <div className="quantum-waves">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="quantum-wave-bar"
                style={{ animationPlayState: isExecuting ? 'running' : 'paused' }}
              />
            ))}
          </div>

          {/* Pipeline steps */}
          <div className="quantum-pipeline">
            {pipelineSteps.map(step => (
              <div key={step.id} className={`pipeline-step ${step.status}`}>
                <div className="pipeline-indicator" />
                <span>{step.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Agent dock ────────────────────────────────────────────────────────── */}
      <div className="quantum-console-dock">
        {Object.entries(AGENT_DETAILS).map(([key, value]) => {
          const isActive = activeAgent === key;
          return (
            <button
              key={key}
              onClick={() => onAgentDockClick(key)}
              className="quantum-dock-item"
              style={{
                '--hover-color':  value.color,
                '--hover-shadow': value.secondaryColor + '60',
                border:     isActive ? `2px solid ${value.color}` : undefined,
                transform:  isActive ? 'scale(1.2) translateY(-2px)' : undefined,
                boxShadow:  isActive ? `0 0 15px ${value.color}` : undefined,
                zIndex:     isActive ? 10 : undefined,
              } as React.CSSProperties}
            >
              <img
                src={value.image}
                alt={value.title}
                className="quantum-dock-img"
                style={{ filter: isActive || !isExecuting ? 'grayscale(0) opacity(1)' : undefined }}
              />
              <div className="dock-tooltip">
                <div className="tooltip-title" style={{ color: value.color }}>{key}</div>
                <div className="tooltip-desc">{value.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
