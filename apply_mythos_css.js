
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/styles/agent-dashboard.css');

const mythosOverrides = \

/* =========================================================
   MYTHOS PROTOCOL - CYBER-MYTHOS UI OVERRIDES
   ========================================================= */

/* Overhaul the generic dark cards into Ethereal Obsidian Monoliths */
.active-deployment-card, .urgency-matrix, .roi-card, .workspace-card {
  background: linear-gradient(145deg, rgba(15, 15, 20, 0.85), rgba(5, 5, 8, 0.95)) !important;
  border: 1px solid rgba(251, 191, 36, 0.15) !important;
  border-top: 1px solid rgba(251, 191, 36, 0.3) !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), inset 0 0 30px rgba(6, 182, 212, 0.05) !important;
  backdrop-filter: blur(12px) !important;
}

/* Typography for headers */
.card-title {
  color: #fef08a !important;
  text-shadow: 0 0 15px rgba(251, 191, 36, 0.2) !important;
  letter-spacing: 0.02em !important;
}

.section-label {
  color: #fbbf24 !important;
  opacity: 0.9 !important;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.3) !important;
  letter-spacing: 0.2em !important;
}

/* Command Bar */
.command-bar-container {
  background: rgba(5, 5, 10, 0.5) !important;
  border: 1px solid rgba(6, 182, 212, 0.3) !important;
}
.command-bar-container:focus-within {
  border-color: rgba(6, 182, 212, 0.8) !important;
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.25), inset 0 2px 10px rgba(0,0,0,0.5) !important;
}

/* Execute Button -> Ethereal Gold */
.execute-command-btn {
  background: linear-gradient(135deg, #fbbf24, #d97706) !important;
  color: #18181b !important;
  font-weight: 800 !important;
  box-shadow: 0 4px 15px rgba(251, 191, 36, 0.4) !important;
}
.execute-command-btn:hover {
  filter: brightness(1.1) !important;
}

/* Voice Mic Button -> Cyan */
.voice-command-btn {
  color: #22d3ee !important;
}
.voice-command-btn.listening {
  color: #06b6d4 !important;
}

/* Bottom Glow Indicator -> Cyan */
.bottom-indicator {
  background: linear-gradient(90deg, #06b6d4, #22d3ee) !important;
  box-shadow: 0 0 15px rgba(6, 182, 212, 0.6) !important;
}

/* Urgency Matrix Cards */
.urgency-card.immediate {
  border-left: 4px solid #fbbf24 !important;
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.1), transparent) !important;
}
.urgency-card.immediate .immediate-text {
  color: #fef08a !important;
}

/* Tooltips */
.dock-tooltip {
  background: rgba(10, 10, 15, 0.98) !important;
  border: 1px solid rgba(251, 191, 36, 0.3) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(251, 191, 36, 0.15) !important;
}
.tooltip-title {
  letter-spacing: 0.1em !important;
}

/* Quantum Capsule inner chamber - Gold */
.capsule-chamber {
  border: 1px solid rgba(251, 191, 36, 0.2) !important;
}
.quantum-idle-title {
  color: #fef08a !important;
}
\;

fs.appendFileSync(file, '\n' + mythosOverrides, 'utf8');
console.log('Appended Mythos overrides to agent-dashboard.css');

