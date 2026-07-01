import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  // We use a displayAgent to delay the swap slightly for a smoother visual transition
  const [displayAgent, setDisplayAgent] = useState<string | null>(activeAgent);

  useEffect(() => {
    if (activeAgent) {
      setDisplayAgent(activeAgent);
    } else {
      const timer = setTimeout(() => setDisplayAgent(null), 500);
      return () => clearTimeout(timer);
    }
  }, [activeAgent]);

  // Orbit Animation State
  const [rotationOffset, setRotationOffset] = useState(0);
  const [isHoveringDock, setIsHoveringDock] = useState(false);

  useEffect(() => {
    if (isHoveringDock) return; // Pause rotation on hover
    let animationFrameId: number;
    const animate = () => {
      setRotationOffset(prev => prev + 0.003); // Speed of rotation
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isHoveringDock]);

  const activeDetails = displayAgent ? AGENT_DETAILS[displayAgent] : null;

  return (
    <div className={`quantum-deck-container ${isExecuting ? 'active-mode' : ''}`}>
      {/* ── Visual Area ── */}
      <AnimatePresence mode="wait">
        {isExecuting && activeDetails ? (
          <motion.div 
            key="active-mode"
            className="quantum-active-projection"
            initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)', transition: { duration: 0.3 } }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="projection-hologram">
              <div className="projection-aura aura-1" />
              <div className="projection-aura aura-2" />
              
              <div className="projection-spark spark-1" />
              <div className="projection-spark spark-2" />
              <div className="projection-spark spark-3" />
              <div className="projection-spark spark-4" />
              <div className="projection-spark spark-5" />
              
              <motion.img 
                src={activeDetails.image} 
                alt={activeDetails.title} 
                className="projection-avatar"
                initial={{ rotate: -90, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 100, delay: 0.2 }}
              />
            </div>
            
            <motion.div 
              className="projection-info"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="projection-title">
                {activeDetails.icon} {activeDetails.title}
              </div>
              <div className="projection-desc">
                {activeDetails.tagline}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div 
            key="idle-mode"
            className="quantum-idle-chamber"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
          >
            <div className="quantum-core-reactor">
              <div className="quantum-reactor-ring ring-1" />
              <div className="quantum-reactor-ring ring-2" />
              <div className="quantum-reactor-ring ring-3" />
              <div className="quantum-reactor-orb" />
            </div>
            <div className="quantum-idle-text">
              <div className="quantum-idle-title">ZENITH FLEET OPERATIONAL</div>
              <div className="quantum-idle-subtitle">Awaiting Dispatch Command</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status Terminal & Pipeline ── */}
      <motion.div 
        className="quantum-status-row"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, staggerChildren: 0.1 }}
      >
        <motion.div 
          className={`terminal-glass ${isExecuting ? 'active-mode' : ''}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="terminal-header">
            <div className="terminal-header-dots">
              <span style={{ background: '#ef4444' }} />
              <span style={{ background: '#f59e0b' }} />
              <span style={{ background: '#22c55e' }} />
            </div>
            SYS_TERMINAL
          </div>
          <div className="terminal-body">
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>&gt;_ </span>
            {agentStatus}
            <span className="terminal-cursor" />
          </div>
        </motion.div>

        <motion.div 
          className="pipeline-bar"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          {pipelineSteps.map(step => (
            <motion.div 
              key={step.id} 
              className={`pipeline-node ${step.status}`}
              layout
            >
              <div className="pipeline-node-dot" />
              {step.name}
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* ── Orbital Agent Dock (Bottom Row) ── */}
      <div 
        className="orbital-dock-container"
        onMouseEnter={() => setIsHoveringDock(true)}
        onMouseLeave={() => setIsHoveringDock(false)}
      >
        <AnimatePresence>
          {Object.entries(AGENT_DETAILS).map(([key, value], index) => {
            const isActive = activeAgent === key;
            const total = Object.keys(AGENT_DETAILS).length;
            // Spread agents evenly around a circle + rotation offset over time
            const angle = (index / total) * (Math.PI * 2) + rotationOffset;
            
            // Ellipse dimensions
            const rx = window.innerWidth < 640 ? 140 : 380; // horizontal radius
            const ry = window.innerWidth < 640 ? 20 : 35;   // vertical radius for 3D tilt
            
            // Elements with sin > 0 are "in front", sin < 0 are "in back"
            const sinVal = Math.sin(angle);
            const cosVal = Math.cos(angle);
            
            // Map zIndex based on depth (front is higher)
            const zBase = Math.round((sinVal + 1) * 15);
            const currentZ = isActive ? 60 : zBase;

            // Scale elements in the back to be smaller for 3D perspective
            const scale = 0.75 + ((sinVal + 1) / 2) * 0.45; // 0.75 in back, 1.2 in front
            
            return (
              <motion.div
                key={key}
                onClick={() => onAgentDockClick(key)}
                className={`orbital-node ${isActive ? 'active' : ''}`}
                animate={{
                  x: cosVal * rx,
                  y: sinVal * ry,
                  scale: isActive ? 1.5 : scale,
                  zIndex: currentZ,
                  opacity: (sinVal + 1.5) / 2.5 // Slightly fade out agents in the back
                }}
                transition={{ type: "tween", ease: "linear", duration: 0 }}
                whileHover={{ scale: 1.6, zIndex: 50, transition: { duration: 0.2 } }}
              >
                <img src={value.image} alt={value.title} />
                <div className="orbital-tooltip">
                  {key} — {value.tagline}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
