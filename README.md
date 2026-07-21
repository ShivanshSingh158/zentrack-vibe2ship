<div align="center">

# 🧘 ZenTrack

### *The AI-Powered Life OS That Acts Before You Realize You Need It*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-zentrack--vibe2ship.vercel.app-6366f1?style=for-the-badge&logo=vercel)](https://zentrack-vibe2ship.vercel.app)
[![Built with Gemini](https://img.shields.io/badge/Powered%20by-Gemini%202.5-4285F4?style=for-the-badge&logo=google)](https://ai.google.dev)
[![Firebase](https://img.shields.io/badge/Backend-Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)

</div>

---

## 🎯 What is ZenTrack?

ZenTrack is not a to-do app. It is an **autonomous AI life-operating system** built for students and professionals who are always one missed deadline away from chaos.

While traditional productivity apps silently record your failures, ZenTrack's multi-agent AI fleet **intercepts** problems before they happen — rescheduling your calendar, drafting your apology emails, blocking focus time, and talking to you in real-time voice.

> **"I don't just remind you. I act."** — *Sara, your Synthetic Artificial Resource Assistant*

---

## ✨ Core Features

| Feature | Description |
|---|---|
| 🤖 **12-Agent AI Fleet** | Specialized agents for every domain: email, calendar, tasks, analytics, learning, gym, and more |
| 🎙️ **Real-Time Voice Interface** | Conversational voice-first UI powered by Browser STT + Sarvam TTS. Talk to Sara naturally |
| 📧 **Gmail Intelligence** | Reads, drafts, replies to emails autonomously. Detects angry manager emails before you do |
| 📅 **Calendar Auto-Repair** | Detects overdue tasks and rebuilds your day automatically with energy-aware scheduling |
| 📊 **Proactive Briefings** | 8am daily briefings and 9pm accountability checks sent as push notifications (FCM) |
| 🚨 **Crisis Triage Mode** | "War Room" — extreme prioritization for the next 6 hours when everything is on fire |
| 📝 **Smart Zero-Friction Capture** | Paste raw text, emails, or a syllabus — AI parses deadlines and creates structured tasks |
| 🎯 **OKR Auto-Sync** | Breaks down massive goals into daily micro-habits automatically |
| 🧠 **Behavioral Learning** | Learns your approval/rejection patterns over time to get smarter with every mission |
| 📚 **Learning Tracker** | YouTube lecture integration, bunk calculator, study schedule planner |
| 💪 **Gym Tracker** | AI-powered workout logging with progressive overload suggestions |

---

## 🏗️ Architecture

ZenTrack is a **multi-agent AI system** built on a Directed Acyclic Graph (DAG) orchestration engine.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ZenTrack Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User (Voice / Text Input)                                     │
│        │                                                        │
│        ▼                                                        │
│   VoiceContext ──────► HomeDashboard.handleExecuteCommand       │
│   (Browser STT +        │                                       │
│    Sarvam TTS)          ▼                                       │
│                   ┌─ orchestrator.ts ─────────────────────┐    │
│                   │   Intent Classifier (Gemini Flash)     │    │
│                   │         │                              │    │
│                   │    Fast Router ──► Simple tasks        │    │
│                   │         │          (no LLM needed)     │    │
│                   │    DAG Engine                          │    │
│                   │         │                              │    │
│                   │   ┌─────┴──────────────────────────┐  │    │
│                   │   │     Agent Fleet (parallel)      │  │    │
│                   │   │  ORACLE  HERMES  CHRONOS ARGUS  │  │    │
│                   │   │  TITAN   ATLAS   ENIGMA  AEGIS  │  │    │
│                   │   │  NAVIGATOR SCRIBE ARCHIVE MEET  │  │    │
│                   │   └─────────────────────────────────┘  │    │
│                   │         │                              │    │
│                   │   runAgentLoop.ts (per agent)          │    │
│                   │         │                              │    │
│                   └─────────┼──────────────────────────────┘    │
│                             │                                   │
│                        toolExecutor.ts                          │
│                   ┌─────────┴───────────────────┐              │
│                   │      Tool Execution          │              │
│                   │  Gmail │ Calendar │ Drive    │              │
│                   │  Tasks │ Firestore│ YouTube  │              │
│                   └─────────────────────────────┘              │
│                             │                                   │
│                   ┌─────────┴───────────────────┐              │
│                   │      External Services       │              │
│                   │  Gemini API (via Proxy)      │              │
│                   │  Google Workspace APIs       │              │
│                   │  Firebase / Firestore        │              │
│                   │  Sarvam TTS                  │              │
│                   └─────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🤖 The Agent Fleet

ZenTrack operates a **12-agent AI fleet**, each specialized for a specific domain. Agents run in parallel, coordinated by a DAG engine that resolves dependencies and prevents redundant API calls.

| Agent | Code Name | Role |
|---|---|---|
| 🔮 **Oracle** | `ORACLE` | Intelligence gathering — reads tasks, emails, calendar for other agents |
| 📬 **Hermes** | `HERMES` | Email maestro — reads, drafts, sends, replies, archives Gmail |
| 🕐 **Chronos** | `CHRONOS` | Calendar master — schedules, blocks, reschedules, creates meetings |
| ⚔️ **Titan** | `TITAN` | Executor — creates tasks, notes, goals, triggers panic mode |
| 🛡️ **Aegis** | `AEGIS` | Final synthesizer — generates the user-facing spoken summary |
| 📡 **Argus** | `ARGUS` | Monitor — detects conflicts, fires reminders, auto-reschedules |
| 🗂️ **Archive** | `ARCHIVE` | Drive manager — searches, reads, creates Google Docs |
| ✍️ **Scribe** | `SCRIBE` | Writer — creates docs, writes notes, generates content |
| 📊 **Enigma** | `ENIGMA` | Analytics — weekly reviews, productivity analysis, pattern detection |
| 🎯 **Atlas** | `ATLAS` | Goal planner — breaks down OKRs into tasks and study schedules |
| 🧭 **Navigator** | `NAVIGATOR` | In-app navigation — routes user to the right module instantly |
| 🔬 **Spectre** | `SPECTRE` | Ghost task detector — finds recurring missed deadlines |

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **React** | 19 | UI framework |
| **TypeScript** | 6 | Type safety across the entire codebase |
| **Vite** | 8 | Build tool with PWA support |
| **Framer Motion** | 12 | Animations and micro-interactions |
| **React Router** | 7 | Client-side routing |
| **Recharts** | 3 | Analytics visualizations |
| **Lucide React** | Latest | Icon system |
| **Sonner** | 2 | Toast notifications |

### Backend & Infra
| Technology | Version | Purpose |
|---|---|---|
| **Firebase Auth** | 12 | Authentication (Google OAuth) |
| **Cloud Firestore** | 12 | Real-time database with offline persistence |
| **Firebase Cloud Messaging** | 12 | Push notifications |
| **Vercel** | Serverless | Hosting + API route deployment |
| **Sentry** | 10 | Error monitoring |

### AI & Voice
| Technology | Purpose |
|---|---|
| **Google Gemini 2.5 Flash** | Primary AI model for all agents (research + voice tier) |
| **Google Gemini 2.5 Flash Lite** | Voice-tier fast responses (NAVIGATOR, AEGIS, TITAN) |
| **`@google/generative-ai` SDK** | Direct Gemini API client |
| **Sarvam AI TTS** | Indian-English text-to-speech for Sara's voice |
| **Browser SpeechRecognition API** | STT on production (Chrome/Edge) |
| **Sarvam WebSocket Gateway** | Full-duplex STT on localhost (development) |

### Google Workspace Integration
| API | Purpose |
|---|---|
| **Gmail API** | Read, send, reply, archive, draft emails |
| **Google Calendar API** | Create events, blocks, auto-reschedule |
| **Google Drive API** | Search files, read documents |
| **Google Docs API** | Create and write documents |
| **Google Meet API** | Create video meeting links |

---

## 📁 Project Structure

```
zentrack/
├── api/                          # Vercel serverless API routes
│   ├── gemini-proxy.js           # 🔑 Secure Gemini API proxy (holds keys server-side)
│   ├── gemini-proxy-stream.js    # Streaming variant of the proxy
│   ├── send-notification.js      # FCM push notification sender
│   ├── youtube-search.js         # YouTube search endpoint
│   ├── transcript.js             # YouTube transcript fetcher
│   ├── cron-watchdog.js          # Scheduled background agent runner
│   ├── daily-briefing.ts         # 8am daily briefing generator
│   └── auth/                     # Authentication handlers
│
├── src/
│   ├── agent/                    # 🤖 Core AI agentic system
│   │   ├── orchestrator.ts       # Master DAG orchestrator + intent classifier
│   │   ├── runAgentLoop.ts       # Per-agent Gemini conversation loop
│   │   ├── toolExecutor.ts       # All tool implementations (Gmail, Calendar, etc.)
│   │   ├── toolDeclarations.ts   # Gemini function call schemas
│   │   ├── orchestrationLock.ts  # Mutex to prevent concurrent mission conflicts
│   │   ├── core/
│   │   │   ├── DagEngine.ts      # Directed Acyclic Graph execution engine
│   │   │   └── SharedState.ts    # Cross-agent shared memory within a mission
│   │   ├── fleet/
│   │   │   ├── NewAgents.ts      # System prompts for all 12 agents
│   │   │   └── agentDetails.ts   # Agent metadata (name, icon, color, description)
│   │   └── memory/
│   │       └── ContextEngine.ts  # Builds personalized context from user history
│   │
│   ├── components/               # Reusable UI components
│   │   ├── SaraInterface.tsx     # 🎙️ Main Sara AI console UI
│   │   ├── TopNav.tsx            # Navigation bar
│   │   ├── Sidebar.tsx           # Side navigation
│   │   ├── ErrorBoundary.tsx     # Global React error boundary
│   │   ├── GoogleWorkspaceBanner.tsx  # OAuth connection prompt
│   │   └── Landing.tsx           # Public landing page
│   │
│   ├── contexts/                 # React Context providers
│   │   ├── VoiceContext.tsx      # 🎤 Voice conversation state + TTS queue
│   │   ├── GlobalDataContext.tsx # User data (tasks, habits, calendar) sync
│   │   └── PomodoroContext.tsx   # Focus timer state
│   │
│   ├── features/                 # Feature modules (domain-driven)
│   │   ├── dashboard/            # Home dashboard + agent command center
│   │   ├── tasks/                # Task management
│   │   ├── calendar/             # Calendar view + events
│   │   ├── habits/               # Daily habit tracker
│   │   ├── goals/                # OKR goal system
│   │   ├── notes/                # Note-taking
│   │   ├── learning/             # YouTube lecture tracker
│   │   ├── gym/                  # Workout tracker + AI coach
│   │   ├── analytics/            # Productivity analytics
│   │   ├── academic/             # Attendance + assignment tracker
│   │   ├── jobs/                 # Job application tracker
│   │   ├── pomodoro/             # Focus sessions
│   │   └── review/               # Weekly review module
│   │
│   ├── services/                 # External service integrations
│   │   ├── firebase.ts           # Firebase app + Firestore init
│   │   ├── googleCalendar.ts     # Google Calendar OAuth + API
│   │   ├── googleWorkspace.ts    # Gmail, Drive, Docs, Meet APIs
│   │   ├── agentMemoryPersistence.ts  # Agent approval/rejection history
│   │   ├── userLearningStore.ts  # User behavioral pattern store
│   │   ├── patternEngine.ts      # Habit/task pattern analysis
│   │   ├── conflictDetector.ts   # Calendar conflict detection
│   │   ├── fcm.ts                # Push notification service
│   │   ├── gemini/
│   │   │   └── core.ts           # Gemini key rotation, proxy routing, semaphore
│   │   └── voice/
│   │       └── sarvamStream.ts   # Sarvam STT gateway + Browser STT fallback
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useAgentVoice.ts      # Mic input + silence detection
│   │   ├── useProactiveAgent.ts  # Background agent polling
│   │   └── useDeadlineWatcher.ts # Deadline proximity detector
│   │
│   ├── types/                    # TypeScript type definitions
│   │   ├── domain.ts             # Core domain types (Task, CalendarEvent, etc.)
│   │   └── *.types.ts            # Feature-specific types
│   │
│   ├── utils/                    # Utility functions
│   ├── stores/                   # Zustand-like stores
│   └── data/                     # Static data (quotes, prompts)
│
├── public/                       # Static assets
├── vercel.json                   # Vercel routing + function config
├── firebase.json                 # Firebase hosting config
├── vite.config.ts                # Vite + PWA + Sentry build config
└── firestore.rules               # Firestore security rules
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Google account** (for OAuth and workspace features)
- A **Firebase project** ([create one free](https://console.firebase.google.com))
- A **Google Gemini API key** ([get one free](https://aistudio.google.com))

### 1. Clone & Install

```bash
git clone https://github.com/ShivanshSingh158/zentrack-vibe2ship.git
cd zentrack-vibe2ship
npm install
```

### 2. Environment Setup

Create `.env.local` at the project root:

```env
# ── Firebase (client-side — safe to expose via VITE_) ──────────────────────────
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# ── Gemini AI (for local dev — on production, keys live server-side in Vercel) ──
VITE_GEMINI_API_KEY=your_gemini_api_key

# ── Sarvam TTS Voice ───────────────────────────────────────────────────────────
VITE_SARVAM_API_KEY_1=your_sarvam_key
VITE_SARVAM_VOICE_ID=ananya  # Indian English voice

# ── Google OAuth (for Calendar, Gmail, Drive) ─────────────────────────────────
VITE_GOOGLE_CLIENT_ID=your_oauth_client_id.apps.googleusercontent.com
```

### 3. Run Locally

```bash
# Frontend only (recommended for most development)
npm run dev

# Frontend + Sarvam voice gateway (for full voice experience on localhost)
npm run dev:server   # starts ws://localhost:3001 gateway
npm run dev          # in another terminal
```

### 4. Open the App

```
http://localhost:5173
```

---

## 🔐 Security Architecture

ZenTrack is designed with security-first principles:

```
┌─────────────────────────────────────────────────────────────┐
│                  API Key Security Model                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Browser                    Vercel Edge                     │
│  ┌─────────────┐            ┌────────────────────────────┐  │
│  │             │  Firebase  │                            │  │
│  │  ZenTrack   │─ ID Token ─▶  /api/gemini-proxy         │  │
│  │  React App  │            │  - Verifies Firebase token │  │
│  │             │            │  - Rate limits (100/min)   │  │
│  │  No API keys│            │  - Rotates through 10 keys │  │
│  │  in bundle  │            │  - Returns Gemini response │  │
│  └─────────────┘            └────────────────────────────┘  │
│                                                             │
│  ✅ Gemini keys NEVER exposed in browser bundle             │
│  ✅ Firebase apiKey is a public identifier (safe to expose) │
│  ✅ Google OAuth tokens stored in memory only               │
│  ✅ Per-user rate limiting prevents abuse                   │
└─────────────────────────────────────────────────────────────┘
```

---

## ☁️ Deployment (Vercel)

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ShivanshSingh158/zentrack-vibe2ship)

### Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod
```

### Required Vercel Environment Variables

Set these in your Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Description | Required |
|---|---|---|
| `GEMINI_API_KEYS` | Comma-separated Gemini API keys (e.g. `key1,key2,key3`) | ✅ |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK service account JSON (stringified) | ✅ |
| `VITE_FIREBASE_API_KEY` | Firebase client API key | ✅ |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | ✅ |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | ✅ |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | ✅ |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID | ✅ |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | ✅ |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | ✅ |
| `VITE_SARVAM_API_KEY_1` | Sarvam TTS API key | ✅ |
| `VITE_SARVAM_VOICE_ID` | Sarvam voice ID (e.g. `ananya`) | ✅ |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | ✅ |
| `SENTRY_DSN` | Sentry error monitoring DSN | ⬜ |

---

## 🎙️ Voice Architecture

Sara's voice system has two layers:

### Conversational Voice Loop (VoiceContext)
```
User speaks → Browser SpeechRecognition → VoiceContext.sendToAgent()
                                                    │
                                          agent-shortcut CustomEvent
                                                    │
                                          HomeDashboard.handleExecuteCommand()
                                                    │
                                          orchestrateAgent() → agent fleet
                                                    │
                                          SPOKEN_SUMMARY extracted from response
                                                    │
                                          Sarvam TTS API → playback audio
                                                    │
                                          Mic restarts → waiting for next command
```

### Command Input (useAgentVoice + SarvamAudioStreamer)
```
localhost: Browser mic → Sarvam WebSocket Gateway (ws://localhost:3001)
                         → real-time STT → command input field

production: Browser SpeechRecognition API (Chrome/Edge native)
            → command input field (no server needed)
```

---

## 🧪 Development Notes

### Adding a New Agent

1. Add the agent's system prompt to `src/agent/fleet/NewAgents.ts`
2. Add agent metadata to `src/agent/fleet/agentDetails.ts`
3. Add the agent role to the `AgentRole` union type in `src/agent/core/DagEngine.ts`
4. Add a tool whitelist entry in `runAgentLoop.ts` → `AGENT_TOOL_WHITELIST`
5. Add delegation patterns to `orchestrator.ts` → `buildSupervisorPrompt()`

### Adding a New Tool

1. Add the Gemini function declaration to `src/agent/toolDeclarations.ts`
2. Add the execution handler in `src/agent/toolExecutor.ts` (in the `switch` block)
3. Add the tool name to the relevant agent's whitelist in `runAgentLoop.ts`
4. Add to `READ_ONLY_TOOLS` if it's a read operation (for caching)

### Model Configuration

The agent fleet uses a two-tier model strategy:

| Tier | Models | Used By |
|---|---|---|
| **Research Tier** | `gemini-2.5-flash` | ORACLE, HERMES, CHRONOS, ENIGMA, SPECTRE, ARCHIVE |
| **Voice Tier** | `gemini-2.5-flash` | NAVIGATOR, AEGIS, TITAN, ATLAS, ARGUS |

---

## 📊 Performance

| Metric | Value |
|---|---|
| First Contentful Paint | < 1.5s |
| Offline support | ✅ (PWA + Firestore local persistence) |
| Max concurrent AI agents | 8 (semaphore-controlled) |
| Agent timeout (NAVIGATOR) | 20s |
| Agent timeout (HERMES/ORACLE) | 60s |
| API key rotation | Round-robin across 10 keys |
| Per-user rate limit | 100 Gemini requests/minute |

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, branch strategy, and PR guidelines.

---

## 📄 License

MIT License — see [LICENSE](./LICENSE) for details.

---

<div align="center">

Built with ❤️ by **Shivansh Singh**

*"Stop recording your failures. Start preventing them."*

</div>
