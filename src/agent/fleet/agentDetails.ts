/**
 * agentDetails — Visual metadata for each agent in the Olympus Protocol fleet.
 *
 * Used by the HomeDashboard shutter animation and the dock tooltip system
 * to display agent names, taglines, capability badges, and avatar images.
 */

export interface AgentDetail {
  title: string;
  tagline: string;
  color: string;
  secondaryColor: string;
  description: string;
  image: string;
  icon: string;
  depicts: string[];
}

export const AGENT_DETAILS: Record<string, AgentDetail> = {
  ATHENA: {
    title: 'Cognitive Mastermind',
    tagline: 'Orchestrating workflow, task allocation & DAG routing',
    color: '#a78bfa',
    secondaryColor: '#ec4899',
    description: 'Manages agent task routing, parses request syntax, and synthesizes overall execution pipelines.',
    image: '/agents/orchestrator.png',
    icon: '🧠',
    depicts: ['DAG Routing', 'Task Parser', 'Fleet Supervisor'],
  },
  ORACLE: {
    title: 'Neural Recon Sentry',
    tagline: 'Google search, information aggregation & fact verification',
    color: '#fbbf24',
    secondaryColor: '#f97316',
    description: 'Scours the web using Google APIs to gather real-time data, verify facts, and retrieve external documents.',
    image: '/agents/search.png',
    icon: '🔍',
    depicts: ['Google Search API', 'Web Scraping', 'Fact Verification'],
  },
  SCRIBE: {
    title: 'Synthesis Engine',
    tagline: 'Document analysis, markdown compiler & layout architect',
    color: '#06b6d4',
    secondaryColor: '#3b82f6',
    description: 'Generates reports, parses document structures, reads PDF/DOCX contents, and compiles output markdown.',
    image: '/agents/docs.png',
    icon: '📄',
    depicts: ['Markdown Compiler', 'Report Synthesizer', 'Layout Architect'],
  },
  ENIGMA: {
    title: 'Quantum Analytics Unit',
    tagline: 'Data processing, math operations & chart design',
    color: '#34d399',
    secondaryColor: '#10b981',
    description: 'Computes formulas, extracts tables, plots charts, and performs numerical analysis on workspaces.',
    image: '/agents/data.png',
    icon: '📊',
    depicts: ['Math Processor', 'Table Extractor', 'Stats Analyzer'],
  },
  HERMES: {
    title: 'Holographic Comms Terminal',
    tagline: 'Gmail management, mail drafting & reply optimization',
    color: '#f472b6',
    secondaryColor: '#8b5cf6',
    description: 'Accesses Gmail accounts, drafts messages, checks notifications, and formats clean emails.',
    image: '/agents/comms.png',
    icon: '✉️',
    depicts: ['Gmail Inbox', 'Draft Composer', 'Reply Optimizer'],
  },
  CHRONOS: {
    title: 'Chronos Coordinator',
    tagline: 'Calendar orchestration, meeting books & time slot checks',
    color: '#60a5fa',
    secondaryColor: '#6366f1',
    description: 'Queries Google Calendar, books events, resolves schedule conflicts, and notifies deadlines.',
    image: '/agents/scheduler.png',
    icon: '📅',
    depicts: ['Calendar Queries', 'Conflict Solver', 'Event Booking'],
  },
  ARCHIVE: {
    title: 'Aether Storage Sentry',
    tagline: 'Google Drive explorer, folder compiler & file tracker',
    color: '#3b82f6',
    secondaryColor: '#1d4ed8',
    description: 'Navigates and searches Google Drive structures, tracks folders, downloads files, and uploads results.',
    image: '/agents/drive.png',
    icon: '💽',
    depicts: ['Cloud Explorer', 'Folder Compiler', 'File Downloader'],
  },
  HEPHAESTUS: {
    title: 'Nexus Compiler Node',
    tagline: 'Code generation, execution, script builder & debugger',
    color: '#22c55e',
    secondaryColor: '#16a34a',
    description: 'Writes system scripts, debugs codebase structures, executes runtime scripts, and runs checks.',
    image: '/agents/coding.png',
    icon: '💻',
    depicts: ['Compiler Core', 'Code Generator', 'Script Executor'],
  },
  AEGIS: {
    title: 'Sentinel Guard Protocol',
    tagline: 'System code checker, security auditor & log validator',
    color: '#10b981',
    secondaryColor: '#06b6d4',
    description: 'Performs security audits, runs typechecks, validates inputs/outputs, and logs workflow errors.',
    image: '/agents/qa.png',
    icon: '🛡️',
    depicts: ['Security Auditor', 'Typecheck Sentry', 'Log Validator'],
  },
  ATLAS: {
    title: 'Strategic Architect',
    tagline: 'Goal decomposition, milestone mapping & project scaffolding',
    color: '#f59e0b',
    secondaryColor: '#d97706',
    description: 'Breaks complex goals into milestones and actionable tasks. Injects tasks into ZenTrack and blocks calendar time for critical milestones.',
    image: '/agents/planner_v2.png',
    icon: '🗺️',
    depicts: ['Goal Decomposer', 'Milestone Mapper', 'Task Injector'],
  },
  ARGUS: {
    title: 'Risk Sentinel',
    tagline: 'Deadline drift detection, risk scoring & proactive alerts',
    color: '#ef4444',
    secondaryColor: '#dc2626',
    description: 'Continuously assesses task risk, sends proactive alerts, auto-reschedules low-priority items during emergencies, and scans email for deadline changes.',
    image: '/agents/monitor_v2.png',
    icon: '🚨',
    depicts: ['Risk Assessor', 'Alert Dispatcher', 'Auto-Rescheduler'],
  },
  SPECTRE: {
    title: 'Ghost Deadline Finder',
    tagline: 'Hidden commitment discovery, inbox scanning & deadline extraction',
    color: '#8b5cf6',
    secondaryColor: '#7c3aed',
    description: 'Scans emails and calendar descriptions for hidden deadlines never explicitly logged — surfaces ghost tasks before they become missed commitments.',
    image: '/agents/ghost_v2.png',
    icon: '👻',
    depicts: ['Inbox Scanner', 'Deadline Extractor', 'Ghost Task Creator'],
  },
  TITAN: {
    title: 'Hyper Action Engine',
    tagline: 'Cross-system execution, multi-action chaining & delegation hub',
    color: '#22d3ee',
    secondaryColor: '#0891b2',
    description: 'The most action-oriented agent. Chains email, docs, meetings, and tasks in a single autonomous workflow. Delegates recursively to specialist sub-agents.',
    image: '/agents/executor_v2.png',
    icon: '⚡',
    depicts: ['Action Chainer', 'Delegation Hub', 'Workflow Automator'],
  },
};
