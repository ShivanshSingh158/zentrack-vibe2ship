# ZenTrack Web — Machine-Navigable Architecture Report

> **MANDATORY FIRST ACTION FOR ALL AI AGENTS**: Before ANY other action on the web app, read this file. This is the single source of truth for the codebase map, data schemas, and custom events. Use the File Index in Section 3 to jump directly to any file without searching.
>
> **UPDATE PROTOCOL**: Any time code changes (new file, new function, moved logic, changed dependency) — update the relevant section of this document in the same session.

---

## 1. Project Overview

- **App**: ZenTrack — AI-powered life OS. Multi-agent productivity system with voice (Sara), autonomous email/calendar/task management, real-time 17-agent fleet (Olympus Protocol).
- **Stack**: React 19 + TypeScript + Vite (PWA) | Firebase Firestore + Auth | Google Gemini API (direct, no backend) | Sarvam AI TTS | Google Workspace APIs (Calendar, Gmail, Drive, Docs, Meet)
- **Styling**: Vanilla CSS + CSS Modules — NO Tailwind. Premium glassmorphism dark-mode. Framer Motion animations.
- **Hosting**: Vercel (serverless functions in `/api/`)
- **Entry**: `src/main.tsx` → `src/App.tsx`
- **Dev**: `npm run dev`
- **Build**: `npm run build` (Vite + PWA plugin, outputs to `dist/`)

### Architecture Philosophy
The web app calls Gemini **directly** through `/api/gemini-proxy` (Vercel serverless). There is **no separate backend server**. All backend logic lives in Vercel Serverless Functions under `/api/`. The legacy Socket.IO/Render `backend/` directory has been permanently deleted (2026-07-21).

---

## 2. Folder Map

```
zentrack-vibe2ship/
├── .agents/
│   ├── SYSTEM_ARCHITECTURE.md         ← THIS FILE (single source of truth)
│   └── DESIGN_SYSTEM_UNIFORMITY.md    ← Universal Design System, Icon & Color Uniformity Spec
├── api/                            Vercel Serverless Functions (server-side only, never bundled)
│   ├── gemini-proxy.js             CRITICAL: Gemini API proxy + Firebase auth + rate limiting + Sarvam TTS
│   ├── gemini-proxy-stream.js      Streaming Gemini proxy variant
│   ├── search.js                   DuckDuckGo + YouTube search
│   ├── transcript.js               YouTube transcript fetcher
│   ├── send-notification.js        FCM push notification sender
│   ├── send-sms.ts                 Twilio SMS sender
│   ├── cron-watchdog.js            System health cron + dead-letter queue
│   ├── daily-briefing.ts           Daily briefing generator
│   └── youtube.js                  YouTube Data API v3 wrapper
├── src/
│   ├── main.tsx                    App bootstrap: BrowserRouter + Sentry + VoiceProvider + App
│   ├── App.tsx                     Root: Firebase auth guard, React Router routes (lazy), global event listeners
│   ├── index.css                   Global CSS design system (tokens, dark mode, glassmorphism)
│   ├── config/                     [NEW] App-wide constants — import from here, never hardcode
│   │   └── constants.ts            Endpoints, model names, rate limits, Firestore collection names
│   ├── agent/                      AI orchestration brain (direct Gemini, no backend)
│   │   ├── orchestrator.ts         MAIN ENTRY POINT: mission cache → fastRouter → classify+supervisor → DAG
│   │   ├── runAgentLoop.ts         Per-agent Gemini think-tool-observe loop (28KB)
│   │   ├── toolExecutor.ts         Central tool dispatcher → domain executors
│   │   ├── toolDeclarations.ts     Gemini function call schemas for ALL tools (47KB)
│   │   ├── orchestrationLock.ts    Global mutex preventing concurrent fleet runs
│   │   ├── core/
│   │   │   ├── DagEngine.ts        DAG task graph — state, runnable tasks, dependency resolution
│   │   │   └── SharedState.ts      Shared memory context for one mission
│   │   ├── fleet/
│   │   │   ├── NewAgents.ts        All 16 agent definitions: system prompts, tool whitelists (~70KB)
│   │   │   └── agentDetails.ts     Visual metadata: title, tagline, color, icon, capabilities
│   │   ├── memory/
│   │   │   └── ContextEngine.ts    Builds user data context string injected into agent prompts
│   │   ├── orchestration/
│   │   │   ├── intentClassifier.ts LLM intent: CHITCHAT / CLARIFICATION_REQUIRED / ACTIONABLE
│   │   │   ├── fastRouter.ts       Zero-latency regex router (~60% of queries bypass LLM)
│   │   │   ├── dagExecutor.ts      Executes DAG: parallel agents, shared state, retry (max 2)
│   │   │   ├── supervisorPrompt.ts System prompt for Supervisor LLM (request → DAG task list)
│   │   │   ├── personalityContext.ts Per-agent behavioral personality string
│   │   │   └── agentPrompts.ts     Per-role agent system prompt overrides
│   │   └── tools/                  14 domain tool executors
│   │       ├── task.executor.ts    Firestore CRUD: tasks, habits, goals, notes
│   │       ├── calendar.executor.ts Google Calendar CRUD
│   │       ├── gmail.executor.ts   Gmail read/send/reply/archive/draft/trash
│   │       ├── drive.executor.ts   Google Drive search, list, trash, open
│   │       ├── meet.executor.ts    Google Meet creation
│   │       ├── content.executor.ts Google Docs create/write/read
│   │       ├── analytics.executor.ts Task/habit/goal analytics
│   │       ├── learning.executor.ts Learning module CRUD
│   │       ├── gym.executor.ts     Gym log CRUD
│   │       ├── notification.executor.ts FCM push, SMS, in-app alerts
│   │       ├── navigation.executor.ts UI navigation via agent-navigate CustomEvent
│   │       ├── web.executor.ts     Web search (DuckDuckGo), YouTube transcript
│   │       ├── system.executor.ts  Google OAuth connect, delete data, approvals
│   │       └── shared.ts           Tool helpers: requestApproval, requireGoogleAuth, ToolResult
│   ├── components/
│   │   ├── SaraInterface.tsx       Main voice orb UI: pulsing orb, terminal feed, controls (~39KB)
│   │   ├── Sidebar.tsx             Desktop navigation sidebar + agent dock
│   │   ├── TopNav.tsx              Top bar: logo, search, Gemini auth badge, settings
│   │   ├── BottomNav.tsx           Mobile bottom navigation tabs
│   │   ├── CommandPalette.tsx      Keyboard command palette (Cmd+K)
│   │   ├── AgentDataStream.tsx     Terminal feed: subscribes to agent-log CustomEvents
│   │   ├── GoogleWorkspaceBanner.tsx Banner prompting Google OAuth when disconnected
│   │   ├── Landing.tsx             Public landing page (unauthenticated)
│   │   ├── Login.tsx               Auth page: Google Sign In + Firebase Auth
│   │   ├── AnimatedPressable.tsx   Reusable pressable with micro-animation
│   │   ├── sara/
│   │   │   ├── AgentCluster.tsx    Visual cluster of agent avatars around Sara orb
│   │   │   └── TerminalFeed.tsx    Terminal-style feed inside Sara interface
│   │   ├── overlays/
│   │   │   ├── FocusModeOverlay.tsx Full-screen focus mode + Pomodoro timer
│   │   │   ├── SecuritySettingsModal.tsx Security/privacy settings panel (~22KB)
│   │   │   ├── OnboardingCarousel.tsx First-time user onboarding flow
│   │   │   ├── DailyBriefingOverlay.tsx Morning AI briefing panel
│   │   │   └── DeveloperMatrix.tsx Dev-only debug panel (network logs, agent state)
│   │   └── ui/
│   │       ├── GeminiAuthModal.tsx Modal for personal Gemini API key/OAuth
│   │       ├── GeminiAuthBadge.tsx Status badge for Gemini auth state
│   │       ├── ConfirmDialog.tsx   Reusable confirm/cancel dialog (open/isOpen, confirmText/confirmLabel)
│   │       ├── DatePicker.tsx      Custom date picker component
│   │       └── OfflineIndicator.tsx Offline status banner
│   ├── contexts/
│   │   ├── GlobalDataContext.tsx   Firestore real-time hub: tasks, habits, goals, calendar, gym, etc.
│   │   ├── VoiceContext.tsx        CRITICAL: Chrome STT + Sarvam TTS + GaplessPlayer + barge-in
│   │   └── PomodoroContext.tsx     Pomodoro timer state machine
│   ├── features/                   Domain modules (lazy-loaded via React.lazy)
│   │   ├── _shared/
│   │   │   ├── FloatingExtraWorks.tsx Cross-feature floating widget
│   │   │   └── VoiceQuickCaptureWidget.tsx Floating voice-to-text quick capture (~22KB)
│   │   ├── dashboard/
│   │   │   ├── HomeDashboard.tsx   Main app screen: agent orchestration entry point (~50KB)
│   │   │   ├── LifeHomeDashboard.tsx Unified life dashboard (streak, daily agenda, active recall, habits, XP)
│   │   │   ├── AgentShutter.tsx    Animated panel revealing agent fleet during missions
│   │   │   ├── MissionReport.tsx   Structured mission report display
│   │   │   ├── VaultOrb.tsx        Animated 3D orb visualization (~20KB)
│   │   │   └── ConflictCard.tsx    Scheduling conflict notification card
│   │   ├── tasks/
│   │   │   ├── TodoListModule.tsx  Full task management UI (~46KB)
│   │   │   ├── TodoCard.tsx        Individual task card with inline edit + completion
│   │   │   └── EditTodoModal.tsx   Task edit modal
│   │   ├── calendar/
│   │   │   ├── CalendarModule.tsx  Calendar with Google Calendar + task overlay (~51KB)
│   │   │   └── EventPopover.tsx    Event detail popover
│   │   ├── notes/
│   │   │   ├── NotesModule.tsx     Note-taking with AI panel + rich editor (~71KB)
│   │   │   ├── NotesEditor.tsx     Rich text editor component
│   │   │   └── NotesAIPanel.tsx    AI suggestions panel for notes
│   │   ├── goals/
│   │   │   ├── GoalsModule.tsx     Goals + OKR tracking
│   │   │   └── GoalCard.tsx        Individual goal card
│   │   ├── gym/
│   │   │   ├── GymModule.tsx       Gym tracking UI
│   │   │   ├── ZenGymAI.tsx        AI gym coaching panel (~51KB)
│   │   │   ├── GymChatUI.tsx       Chat interface for GYM-GPT
│   │   │   ├── GymWorkoutSummary.tsx Post-workout summary view
│   │   │   ├── data/               [MOVED from src/data/]
│   │   │   │   └── gymPlan.ts      Static 6-day PPL gym plan + YouTube exercise IDs
│   │   │   ├── components/         Gym sub-components
│   │   │   └── hooks/
│   │   │       └── useGymLog.ts    Gym session state machine
│   │   ├── habits/
│   │   │   └── HabitsModule.tsx    Habit tracking + streak visualization
│   │   ├── analytics/
│   │   │   └── AnalyticsModule.tsx Charts and productivity stats
│   │   ├── learning/
│   │   │   ├── LearningChecklistModule.tsx Checklist + AI curriculum builder (~76KB, LARGEST)
│   │   │   ├── CurriculumBuilderModal.tsx  AI curriculum generation modal
│   │   │   ├── LectureChatPanel.tsx        Per-lecture AI chat
│   │   │   └── TopicCard.tsx               Learning topic card
│   │   ├── jobs/
│   │   │   ├── JobTracker.tsx      Kanban job application tracker
│   │   │   ├── JobCard.tsx         Job card component
│   │   │   ├── JobModal.tsx        Job detail modal
│   │   │   └── Column.tsx          Kanban column
│   │   ├── academic/
│   │   │   ├── AttendanceModule.tsx   Attendance tracker
│   │   │   ├── AssignmentModule.tsx   Assignment tracker
│   │   │   └── GradeCalculator.tsx    SGPA grade calculator
│   │   ├── integrations/
│   │   │   └── IntegrationsModule.tsx Google Workspace integration settings
│   │   ├── pomodoro/
│   │   │   └── PomodoroStatsPanel.tsx Pomodoro statistics
│   │   ├── review/
│   │   │   └── WeeklyReviewModule.tsx Weekly reflection + review
│   │   └── tools/
│   │       └── ToolsHubModule.tsx  Tools hub (placeholder)
│   ├── hooks/
│   │   ├── useProactiveAgent.ts    Background AI: periodic deadline/habit/risk checks (~41KB)
│   │   ├── useDeadlineWatcher.ts   Watches tasks approaching deadline, fires browser notifs
│   │   ├── useAgentVoice.ts        Integrates agent output with TTS
│   │   └── useClassNotifications.ts Class schedule notification hook
│   ├── services/
│   │   ├── firebase.ts             Firebase client: Auth + Firestore (offline persistence + multi-tab)
│   │   ├── googleCalendar.ts       Google Calendar API: OAuth, event CRUD, token refresh, polling
│   │   ├── googleWorkspace.ts      Gmail, Drive, Docs, Meet, Sheets API wrappers
│   │   ├── MissionCache.ts         LRU cache (10 entries, 30s TTL) for agent mission results
│   │   ├── patternEngine.ts        Behavioral learning: derives UserBehaviorProfile from interactions
│   │   ├── userLearningStore.ts    Singleton wrapper for patternEngine (per-session, per-role directives)
│   │   ├── agentMemoryPersistence.ts Persists 14-day agent interaction log to Firestore
│   │   ├── DataPrefetcher.ts       Pre-fetches user data before agents need it
│   │   ├── conflictDetector.ts     Detects scheduling conflicts (task/calendar overlaps)
│   │   ├── fcm.ts                  Firebase Cloud Messaging push notifications
│   │   ├── userGeminiAuth.ts       User personal Gemini OAuth token management
│   │   ├── localDatabase.ts        IndexedDB wrapper for offline local storage
│   │   ├── youtube.ts              YouTube player/embed utilities
│   │   ├── gemini/
│   │   │   ├── core.ts             CRITICAL: fetch monkey-patch, key rotation, concurrency semaphore
│   │   │   ├── actions.ts          High-level Gemini actions (chat, summarize, generate)
│   │   │   ├── chats.ts            Multi-turn conversation management
│   │   │   ├── voice.ts            Gemini voice-specific helpers
│   │   │   └── geminiClient.ts     Low-level Gemini client wrapper
│   │   ├── geminiLive/
│   │   │   └── GeminiLiveClient.ts WebSocket Gemini Live API (BidiGenerateContent, real-time audio)
│   │   ├── audio/
│   │   │   ├── GaplessPlayer.ts    Web Audio API gapless buffer player (zero gap between TTS sentences)
│   │   │   └── NoiseGate.ts        VAD (Voice Activity Detection) via AudioWorklet
│   │   └── voice/
│   │       ├── sarvam.ts           Sarvam AI TTS: text → base64 audio (500 char limit per call)
│   │       └── sarvamStream.ts     Streaming Sarvam TTS variant
│   ├── stores/
│   │   ├── agentMemoryStore.ts     In-memory reactive store: agent conversation history (max 50)
│   │   ├── apiQuotaStore.ts        Tracks Gemini API quota in memory
│   │   └── missionReportStore.ts   Stores completed mission reports for ReportArchive
│   ├── types/
│   │   ├── domain.ts               Core domain types: Task, CalendarEvent interfaces
│   │   └── gym.types.ts            Gym-specific TypeScript interfaces
│   └── utils/
│       ├── dateUtils.ts            Date helpers: getLocalDateString(date) → YYYY-MM-DD
│       ├── networkLogger.ts        API call logger: logApi(), logWebSocket() for DeveloperMatrix
│       ├── notifications.ts        Browser notification helpers
│       ├── validateInput.ts        Input sanitization utilities
│       ├── sound.ts                UI sound effects
│       └── seedDemoData.ts         Demo data seeder for onboarding
├── server/
│   └── sarvamGateway.js            Local dev Express Sarvam TTS proxy (npm run dev:server)
├── backend/                        ⚠️ LEGACY — NOT used by web app. Render/Socket.IO server (deprecated for web).
│   └── src/                        Kept for reference only. Web uses /api/ serverless functions.
├── mobile/                         React Native (Expo) mobile app — separate project
├── public/
│   └── agents/                     Agent avatar PNGs (ATHENA, ORACLE, HERMES, etc.)
├── .env                            Local dev environment variables
├── .env.example                    Template for required env vars
├── .env.production                 Production environment variables
├── vercel.json                     Vercel routing config + serverless function settings
├── vite.config.ts                  Vite build config (PWA plugin, Sentry, chunk splitting)
├── package.json                    Dependencies
├── tsconfig.app.json               TypeScript config for src/
└── firestore.rules                 Firestore security rules
```

---

## 3. File Index — Direct Navigation Table

### Agent & AI (go here first for any Sara/agent issue)
| Purpose | Exact File Path | Key Export |
|---|---|---|
| **Main agent pipeline entry** | `src/agent/orchestrator.ts` | `orchestrateAgent()` |
| Intent classification (CHITCHAT/ACTIONABLE) | `src/agent/orchestration/intentClassifier.ts` | `classifyIntent()` |
| Zero-latency regex router (60% of queries) | `src/agent/orchestration/fastRouter.ts` | `fastRouter()` |
| DAG task execution (parallel agents) | `src/agent/orchestration/dagExecutor.ts` | `executeDag()` |
| Supervisor LLM prompt builder | `src/agent/orchestration/supervisorPrompt.ts` | `buildSupervisorPrompt()` |
| Per-agent Gemini think-tool-observe loop | `src/agent/runAgentLoop.ts` | `runAgentLoop()` |
| Central tool dispatcher | `src/agent/toolExecutor.ts` | `executeTool()` |
| All Gemini tool schemas (48+ tools) | `src/agent/toolDeclarations.ts` | `TOOL_DECLARATIONS` |
| DAG task graph engine | `src/agent/core/DagEngine.ts` | `DagEngine`, `AgentRole` |
| Shared memory for one mission | `src/agent/core/SharedState.ts` | `createInitialState()` |
| Agent prompt context builder | `src/agent/memory/ContextEngine.ts` | `buildContextMemory()` |
| All 16 agent system prompts | `src/agent/fleet/NewAgents.ts` | `AGENT_CONFIGS` |
| Agent visual metadata | `src/agent/fleet/agentDetails.ts` | `AGENT_DETAILS` |
| Concurrent mission lock | `src/agent/orchestrationLock.ts` | `withOrchestrationLock()` |

### Tools (domain executors)
| Domain | File | Key Export |
|---|---|---|
| Tasks, habits, goals, notes | `src/agent/tools/task.executor.ts` | `executeTaskTools()` |
| Google Calendar CRUD | `src/agent/tools/calendar.executor.ts` | `executeCalendarTools()` |
| Gmail read/send/reply | `src/agent/tools/gmail.executor.ts` | `executeGmailTools()` |
| Google Drive | `src/agent/tools/drive.executor.ts` | `executeDriveTools()` |
| Google Meet | `src/agent/tools/meet.executor.ts` | `executeMeetTools()` |
| Google Docs | `src/agent/tools/content.executor.ts` | `executeContentTools()` |
| Analytics | `src/agent/tools/analytics.executor.ts` | `executeAnalyticsTools()` |
| Learning | `src/agent/tools/learning.executor.ts` | `executeLearningTools()` |
| Gym | `src/agent/tools/gym.executor.ts` | `executeGymTools()` |
| FCM/SMS notifications | `src/agent/tools/notification.executor.ts` | `executeNotificationTools()` |
| UI navigation | `src/agent/tools/navigation.executor.ts` | `executeNavigationTools()` |
| Web search + YouTube | `src/agent/tools/web.executor.ts` | `executeWebTools()` |
| Google OAuth + approvals | `src/agent/tools/system.executor.ts` | `executeSystemTools()` |
| Shared tool helpers | `src/agent/tools/shared.ts` | `requireGoogleAuth()`, `requestApproval()` |

### Services
| Purpose | File | Key Export |
|---|---|---|
| **Gemini API (fetch proxy, key rotation)** | `src/services/gemini/core.ts` | `callWithFallback()`, `SAFETY_SETTINGS` |
| Gemini Live WebSocket (real-time audio) | `src/services/geminiLive/GeminiLiveClient.ts` | `GeminiLiveClient` |
| Firebase Auth + Firestore | `src/services/firebase.ts` | `auth`, `db` |
| Google Calendar API | `src/services/googleCalendar.ts` | `pollGoogleCalendarChanges()`, `signInWithGoogle()` |
| Google Workspace (Gmail/Drive/Docs/Meet) | `src/services/googleWorkspace.ts` | `fetchUnreadEmails()`, `sendEmail()`, etc. |
| Mission result cache (30s TTL) | `src/services/MissionCache.ts` | `missionCache`, `computeDataVersion()` |
| Behavioral learning engine | `src/services/patternEngine.ts` | `deriveUserBehaviorProfile()` |
| Per-session behavior wrapper | `src/services/userLearningStore.ts` | `userLearningStore` singleton |
| 14-day agent memory persistence | `src/services/agentMemoryPersistence.ts` | `loadAgentMemoryContext()` |
| Sarvam TTS (500 char limit per call) | `src/services/voice/sarvam.ts` | `synthesizeSpeechSarvam()` |
| Gapless Web Audio player | `src/services/audio/GaplessPlayer.ts` | `GaplessPlayer` |
| Voice Activity Detection | `src/services/audio/NoiseGate.ts` | `NoiseGate` |

### Contexts
| Purpose | File | Key Export |
|---|---|---|
| Firestore real-time data (12+ collections) | `src/contexts/GlobalDataContext.tsx` | `useGlobalData()`, `GlobalDataProvider` |
| **Voice: STT + TTS + barge-in** | `src/contexts/VoiceContext.tsx` | `useVoice()`, `VoiceProvider` |
| Pomodoro timer state | `src/contexts/PomodoroContext.tsx` | `usePomodoro()` |

### Config & Constants
| Purpose | File |
|---|---|
| App-wide constants (endpoints, limits, collection names) | `src/config/constants.ts` |
| Client env vars | `.env` (VITE_ prefix) |
| Server env vars | Vercel dashboard (no VITE_ prefix) |

### Serverless API (`/api/`)
| Endpoint | File | Notes |
|---|---|---|
| `POST /api/gemini-proxy` | `api/gemini-proxy.js` | **CRITICAL** — validates Firebase ID token, rate-limits, key rotation, Sarvam TTS |
| `POST /api/gemini-proxy` (stream) | `api/gemini-proxy-stream.js` | Streaming variant |
| `GET /api/search` | `api/search.js` | DuckDuckGo + YouTube search |
| `POST /api/send-notification` | `api/send-notification.js` | FCM push |
| `POST /api/send-sms` | `api/send-sms.ts` | Twilio SMS |
| `GET /api/auth/google` | `api/auth/google.ts` | Google OAuth callback |
| `GET /api/auth/refresh` | `api/auth/refresh.ts` | Silent token refresh |
| `GET /api/transcript` | `api/edge-transcript.ts` | YouTube transcript — **Edge runtime** (fast, global) |

### Gym Data (moved 2026-07-14)
| Purpose | File |
|---|---|
| Static 6-day PPL gym plan | `src/features/gym/data/gymPlan.ts` |

> [!IMPORTANT]
> **gymPlan.ts was moved** from `src/data/gymPlan.ts` to `src/features/gym/data/gymPlan.ts` on 2026-07-14. All 6 import sites were updated. If you see an old import path, update it.

---

## 4. Function / Symbol Lookup Table

| Function / Class | File | Description |
|---|---|---|
| `orchestrateAgent()` | `src/agent/orchestrator.ts` | **Main agent pipeline entry** — cache → fastRouter → classify+supervisor → DAG |
| `normalizeAgentRole()` | `src/agent/orchestrator.ts` | Maps aliases (EMAIL→HERMES, CALENDAR→CHRONOS, etc.) |
| `classifyIntent()` | `src/agent/orchestration/intentClassifier.ts` | LLM intent classification |
| `fastRouter()` | `src/agent/orchestration/fastRouter.ts` | Zero-latency regex router |
| `executeDag()` | `src/agent/orchestration/dagExecutor.ts` | Executes parallel DAG of agent tasks |
| `buildSupervisorPrompt()` | `src/agent/orchestration/supervisorPrompt.ts` | Supervisor LLM system prompt |
| `buildPersonalityContext()` | `src/agent/orchestration/personalityContext.ts` | Per-agent behavioral context string |
| `getAgentPromptByRole()` | `src/agent/orchestration/agentPrompts.ts` | Per-role system prompt overrides |
| `runAgentLoop()` | `src/agent/runAgentLoop.ts` | Per-agent Gemini think-tool-observe loop |
| `executeTool()` | `src/agent/toolExecutor.ts` | Routes tool name → domain executor |
| `DagEngine` | `src/agent/core/DagEngine.ts` | DAG task graph class |
| `DagEngine.getRunnableTasks()` | `src/agent/core/DagEngine.ts` | Returns tasks whose dependencies are satisfied |
| `DagEngine.updateTaskStatus()` | `src/agent/core/DagEngine.ts` | Marks task completed / failed |
| `buildContextMemory()` | `src/agent/memory/ContextEngine.ts` | Builds agent prompt context from user data |
| `callWithFallback()` | `src/services/gemini/core.ts` | Gemini call with key rotation on 429 |
| `callWithResearchModel()` | `src/services/gemini/core.ts` | gemini-2.5-flash for deep analysis agents |
| `callWithVoiceModel()` | `src/services/gemini/core.ts` | gemini-2.5-flash-lite for fast voice agents |
| `GaplessPlayer.enqueue()` | `src/services/audio/GaplessPlayer.ts` | Queue base64 audio for gapless playback |
| `GaplessPlayer.flush()` | `src/services/audio/GaplessPlayer.ts` | Instant barge-in audio stop |
| `synthesizeSpeechSarvam()` | `src/services/voice/sarvam.ts` | Sarvam AI TTS → base64 audio |
| `missionCache.get()` | `src/services/MissionCache.ts` | Get cached mission result |
| `missionCache.set()` | `src/services/MissionCache.ts` | Cache mission result (30s TTL) |
| `missionCache.invalidate()` | `src/services/MissionCache.ts` | Clear cache after write operation |
| `computeDataVersion()` | `src/services/MissionCache.ts` | Hash of task/event/note/habit counts |
| `userLearningStore.initialize()` | `src/services/userLearningStore.ts` | Load behavior profile (once per session) |
| `deriveUserBehaviorProfile()` | `src/services/patternEngine.ts` | Compute profile from interaction data |
| `useGlobalData()` | `src/contexts/GlobalDataContext.tsx` | Returns Firestore real-time data |
| `GlobalDataProvider` | `src/contexts/GlobalDataContext.tsx` | Firestore subscriptions provider |
| `safeSnapshot()` | `src/contexts/GlobalDataContext.tsx` | Error-isolated Firestore onSnapshot wrapper |
| `fetchTTSAudio()` | `src/contexts/VoiceContext.tsx` | Sarvam TTS with proxy fallback |
| `VoiceProvider` | `src/contexts/VoiceContext.tsx` | Voice system React context provider |
| `processQueue()` | `src/contexts/VoiceContext.tsx` | Drains TTS audio queue |
| `getAdaptiveSilenceMs()` | `src/contexts/VoiceContext.tsx` | 800ms (≤4 words) or 1200ms (longer) |
| `startConversation()` | `src/contexts/VoiceContext.tsx` | Opens mic + starts voice loop |
| `stopConversation()` | `src/contexts/VoiceContext.tsx` | Closes mic, speaks goodbye, clears idle timer |
| `agentMemoryStore.appendMessage()` | `src/stores/agentMemoryStore.ts` | Add agent message (capped at 50) |
| `pollGoogleCalendarChanges()` | `src/services/googleCalendar.ts` | Polls Google Calendar for changes |
| `forceSilentRefresh()` | `src/services/googleCalendar.ts` | Silent Google OAuth token refresh |
| `getLocalDateString()` | `src/utils/dateUtils.ts` | Returns YYYY-MM-DD in local timezone |
| `logApi()` | `src/utils/networkLogger.ts` | Dev console API call logger |
| `lazyWithRetry()` | `src/App.tsx` | Lazy import with stale-chunk cache-bust + reload |
| `GeminiLiveClient` | `src/services/geminiLive/GeminiLiveClient.ts` | WebSocket Gemini Live API client |

---

## 5. Data Flow / Request Flows

### A. Standard Voice Command (Full Path)
```
User speaks → Chrome SpeechRecognition (VoiceContext.tsx)
  → adaptive silence (800ms short / 1200ms long)
  → sendToAgent(transcript)
  → window.dispatchEvent('agent-shortcut', { instruction })
  → HomeDashboard.tsx picks up event
  → orchestrateAgent(instruction, appContext, apiKey, onStep, history, signal)
    → missionCache.get() ──── cache hit? return instantly
    → fastRouter(instruction) ─ regex match? executeDag(fastDag), skip LLM
    → [PARALLEL] classifyIntent() + Supervisor LLM
        → CHITCHAT? → onStep(answer) → enqueue TTS → speak
        → ACTIONABLE? → taskList from Supervisor
    → executeDag(taskList)
        → DagEngine.getRunnableTasks() → run parallel agents
        → Each: runAgentLoop() → Gemini → executeTool() → Firestore/Google APIs
        → AEGIS synthesizes final answer (or isFinal agent skips AEGIS)
    → result string returned
  → VoiceContext.speakText(result)
  → fetchTTSAudio(chunk) → Sarvam TTS → base64
  → GaplessPlayer.enqueue(base64) → Web Audio API → audio out
  → onSpeakingEnd → mic restarts → loop
```

### B. Task Creation (Fast Path)
```
fastRouter("create a task") → [{ assignedAgent: TITAN, isFinal: true }]
→ executeDag → runAgentLoop(TITAN)
  → Gemini: create_task({ title, date })
  → executeTaskTools("create_task") → addDoc(Firestore, tasks/{id})
  → Firestore onSnapshot in GlobalDataContext → UI re-renders
→ missionCache.invalidate()
→ TITAN answer returned directly (isFinal=true, skips AEGIS, saves ~400ms)
→ Sara speaks confirmation
```

### C. Gemini API Call (Production)
```
Browser: GoogleGenerativeAI(key='proxy_dummy_key')
→ fetch interceptor in core.ts catches generativelanguage.googleapis.com
→ proxy_dummy_key detected → redirect to POST /api/gemini-proxy
→ { Authorization: Bearer <Firebase ID Token> }
→ gemini-proxy.js: verifyIdToken() → rate-limit check (Firestore) → key rotation
→ Forward to Gemini API with GEMINI_KEYS[currentIndex]
→ Response returned as-is to browser
```

### D. Google Calendar OAuth
```
User clicks "Connect Google" → signInWithGoogle() in googleCalendar.ts
→ google.accounts.oauth2.initTokenClient(clientId, scopes)
→ Google popup → user approves
→ access_token stored IN MEMORY only (NOT in localStorage)
→ zen_gcal_has_refresh_token flag set in localStorage
→ GlobalDataContext: pollGoogleCalendarChanges()
→ calendarEvents state updates → all components re-render
```

---

## 6. Environment Variables

### Client-Side (VITE_ prefix — baked into bundle — safe to expose)
| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase project identifier |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_GEMINI_API_KEY` | LOCAL DEV only — never on Vercel |
| `VITE_SARVAM_API_KEY_1` | Sarvam TTS key 1 |
| `VITE_SARVAM_API_KEY_2` | Sarvam TTS key 2 (rotation) |
| `VITE_SARVAM_VOICE_ID` | Voice ID (e.g. ananya) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `VITE_APP_URL` | App base URL |
| `VITE_VAPID_PUBLIC_KEY` | FCM Web Push VAPID key |
| `VITE_SENTRY_DSN` | Sentry error tracking DSN |

### Server-Side (Vercel env vars — NEVER in browser bundle)
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEYS` | Comma-separated pool (up to 10 keys) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK auth (one-line JSON) |
| `ALLOWED_ORIGINS` | CORS whitelist |
| `SARVAM_API_KEY_1..10` | Server-side Sarvam key pool |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `TWILIO_ACCOUNT_SID` | Twilio SMS |
| `TWILIO_AUTH_TOKEN` | Twilio SMS |
| `SENTRY_DSN` | Server-side Sentry |
| `CRON_SECRET` | Cron watchdog auth |

---

## 7. Firestore Database Schema

| Collection | Document Path | Key Fields | Queried By |
|---|---|---|---|
| `tasks` | `tasks/{id}` | userId, title, date, status, priority, completedAt, subtasks[], timeSlot | GlobalDataContext, task.executor.ts |
| `habits` | `habits/{id}` | userId, name, emoji, frequency, streak, archived | GlobalDataContext, task.executor.ts |
| `habitLogs` | `habitLogs/{id}` | userId, habitId, date | GlobalDataContext, task.executor.ts |
| `goals` | `goals/{id}` | userId, title, status, progress, keyResults[], deadline | GlobalDataContext, task.executor.ts |
| `notes` | `notes/{id}` | userId, title, content, tags[], createdAt | GlobalDataContext, task.executor.ts |
| `gym_logs` | `gym_logs/{id}` | userId, date, exercises[], cardio[] | GlobalDataContext, gym.executor.ts |
| `jobs` | `jobs/{id}` | userId, company, role, status, stage | GlobalDataContext |
| `learningTopics` | `learningTopics/{id}` | userId, title, lectures[], progress | GlobalDataContext, learning.executor.ts |
| `attendance_subjects` | `attendance_subjects/{id}` | userId, name, classesAttended, classesTotal, schedule | GlobalDataContext |
| `assignments` | `assignments/{id}` | userId, title, dueDate, subjectName, status | GlobalDataContext |
| `pomodoro_sessions` | `pomodoro_sessions/{id}` | userId, startTime, duration, taskId | GlobalDataContext |
| `calendar_events` | `calendar_events/{id}` | userId, title, date, startTime, endTime, type | GlobalDataContext (custom events only — Google Calendar events come from API) |
| `user_profiles` | `user_profiles/{uid}` | behaviorProfile{} | patternEngine.ts, userLearningStore.ts |
| `agent_memory` | `agent_memory/{uid}` | interaction log entries (14-day rolling) | agentMemoryPersistence.ts |
| `rate_limits` | `rate_limits/{uid}` | count, windowStart | api/gemini-proxy.js |
| `system/sessionControl` | `system/sessionControl` | activeSessionKey | App.tsx (SessionEnforcer — remote forced logout) |

> [!IMPORTANT]
> **Calendar events are NOT from Firestore.** They come from `pollGoogleCalendarChanges()` in `googleCalendar.ts`. Adding a Firestore subscription for calendar events = duplicate data. Use the existing `calendarEvents` state from `useGlobalData()`.

---

## 8. CustomEvent Bus (window events)

| Event Name | Dispatched By | Consumed By | Payload |
|---|---|---|---|
| `agent-log` | `orchestrator.ts`, all executors | `AgentDataStream.tsx`, `SaraInterface.tsx` | `{ type: 'thinking'\|'tool'\|'answer', title: string }` |
| `agent-shortcut` | `VoiceContext.tsx` | `HomeDashboard.tsx` | `{ instruction: string }` |
| `agent-navigate` | `navigation.executor.ts` | `App.tsx` (AgentNavigator) | `{ route: string }` |
| `agent-speak` | Tool executors | `VoiceContext.tsx` | `{ text: string }` |
| `agent-stop-conversation-command` | Idle timer (30s), user action | `VoiceContext.tsx` | `{}` |
| `show-mission-report` | User explicit action only | `HomeDashboard.tsx` | `{ report: MissionReport }` |
| `gym-log-updated` | `gym.executor.ts` | `GymModule.tsx` | `{}` |

> [!IMPORTANT]
> `show-mission-report` must ONLY be dispatched by explicit user action (e.g., "View Report" button). Never dispatch it automatically at the end of a mission. See AGENTS.md Rule: No Automatic Mission Report Popups.

---

## 9. Agent Fleet — 17 Agents

| Role | Name | Specialty | Tools |
|---|---|---|---|
| ATHENA | Supervisor | DAG orchestration — routes requests to specialist agents | None (LLM only) |
| ORACLE | Daily Brief | Task/habit/goal synthesis, daily planning | get_tasks, get_habits, get_goals |
| ENIGMA | Analysis | Deep productivity analytics, pattern detection | get_tasks, analytics tools |
| HERMES | Email | Gmail read/send/reply/archive/draft | Gmail tools, Google Calendar |
| CHRONOS | Calendar | Google Calendar CRUD, scheduling, conflict detection | Calendar tools |
| MEET | Meetings | Google Meet creation, meeting prep | Meet tools, Calendar |
| ARCHIVE | Drive | Google Drive search, list, open, trash | Drive tools |
| SCRIBE | Documents | Google Docs create/write/read | Docs tools |
| HEPHAESTUS | Code | Script generation, automation | Code tools, Drive |
| AEGIS | Synthesis | Final answer synthesis, QA, summarization | All read tools |
| ATLAS | Planning | Strategic planning, goal breakdown | Task tools, Goals |
| ARGUS | Risk | Monitoring, conflict detection, alerts | Task tools, Calendar |
| SPECTRE | Ghost | Pattern detection, anomaly detection | Analytics tools |
| TITAN | Executor | Task/habit/note CRUD actions | Task tools |
| NAVIGATOR | Navigation | UI navigation, YouTube embed | Navigation tools |
| MERCURY | Quick Response | Fast chitchat, quick answers | None (LLM only) |
| GAINS | Gym | Fitness coaching, workout planning | Gym tools |

---

## 10. Known Hotspots & Active Rules

| File | Risk | Rule / Issue |
|---|---|---|
| `api/gemini-proxy.js` | **CRITICAL** | Must forward `tools` AND `toolConfig`. Omitting silently breaks ALL agent tool calls in production. |
| `src/contexts/VoiceContext.tsx` | **HIGH** | TTS chunked at 500 chars (Sarvam limit). Timing between mic/TTS/barge-in is fragile. 30s idle timer must call `stopConversation()`. |
| `src/services/gemini/core.ts` | **HIGH** | Fetch monkey-patch must run before any Gemini SDK usage. Key rotation affects all agents. NEVER modify without explicit permission. |
| `src/services/audio/GaplessPlayer.ts` | **MEDIUM** | `pendingSourceCount` must decrement on every `onended` or `onSpeakingEnd` fires early. `isPumping` must reset in `flush()` or barge-in breaks. |
| `src/contexts/GlobalDataContext.tsx` | **MEDIUM** | Calendar events NOT from Firestore. Adding Firestore calendar subscription = duplicate data. |
| `src/agent/orchestrator.ts` | **MEDIUM** | `missionCache.invalidate()` must be called after EVERY write tool. Missing it = stale reads for 30s. |
| `src/features/dashboard/HomeDashboard.tsx` | **MEDIUM** | `appContext` assembled here. Missing a field = agents receive stale/incomplete data. |
| `src/services/googleCalendar.ts` | **MEDIUM** | `_oauthRefreshLock` prevents parallel refresh races. Remove it = 401 cascades on concurrent agents. |
| `show-mission-report` event | **RULE** | Never dispatch automatically. Only from explicit user action. |
| `AnimatePresence` in root | **RULE** | Never use disjoint early `return` for top-level phase transitions. Use `AnimatePresence mode="wait"`. |

---

## 11. Naming & Pattern Conventions

### File Naming
| Pattern | Convention | Example |
|---|---|---|
| React components | `PascalCase.tsx` | `HomeDashboard.tsx` |
| Services / utilities | `camelCase.ts` | `googleCalendar.ts` |
| Tool executors | `domain.executor.ts` | `task.executor.ts` |
| Feature modules | `FeatureNameModule.tsx` | `TodoListModule.tsx` |
| Type files | `domain.ts` or `domain.types.ts` | `gym.types.ts` |
| Config files | `camelCase.ts` in `config/` | `constants.ts` |

### Where New Code Lives
| Task | Location |
|---|---|
| New agent tool (schema) | `src/agent/toolDeclarations.ts` |
| New agent tool (impl) | `src/agent/tools/domain.executor.ts` |
| Tool access control | `AGENT_TOOL_WHITELIST` in `src/agent/runAgentLoop.ts` |
| New feature page | `src/features/newFeature/FeatureNameModule.tsx` + lazy import + route in `App.tsx` |
| New Firestore collection | `onSnapshot` in `GlobalDataContext.tsx` + type in `src/types/` |
| New context provider | `src/contexts/NewContext.tsx` — wrap in `main.tsx` or `App.tsx` |
| New API endpoint | `api/endpoint-name.js` + add to `vercel.json` routes |
| New Google Workspace API | `src/services/googleWorkspace.ts` |
| New agent role | `AgentRole` type in `DagEngine.ts` + `AGENT_DETAILS` in `agentDetails.ts` + config in `NewAgents.ts` |
| App-wide constants | `src/config/constants.ts` |

---

## 12. Changelog

### 2026-08-23 — Gemini Model Dual-Tier Support: 3.7 Flash & 2.5 Flash
- **UPDATED** `src/config/constants.ts` & `mobile/src/config/constants.ts` — Added `AVAILABLE_GEMINI_MODELS` registry containing `gemini-3.7-flash` (Hybrid Thinking) and `gemini-2.5-flash` (Fast & Balanced), setting `gemini-3.7-flash` as default.
- **UPDATED** `src/services/gemini/core.ts` & `src/services/gemini/chats.ts` — Enhanced model priority pipelines and added `preferredModel` overrides to `startGymAIChat` and `startGymAIOAuthChat`.
- **ADDED** Model Switcher in `src/features/gym/ZenGymAI.tsx` — Real-time model toggle dropdown in the ZEN-GPT Gym header with `localStorage` persistence.
- **ADDED** Model Switcher in `src/features/learning/ZenGptTutorPane.tsx` & `src/features/learning/LectureChatPanel.tsx` — Dynamic model switcher dropdown in the Learning Module's ZEN-GPT AI Tutor pane and theater modal.

### 2026-08-15 — Exercise Swap: Cross-Day Template Matching & PPL Shorts Library
- **UPDATED** `src/features/gym/components/AddExerciseModal.tsx` — Enhanced the routine template picker with a dynamic day selector (`Mon` through `Sat`), allowing users to browse and import exercises across all workout days in the routine (e.g. browsing Monday's Long Tricep exercises when editing a Thursday workout).
- **OVERHAULED** Mobile `ExerciseSwapScreen.tsx` — Full integration of template exercises across all days with origin badges, biomechanical AI recommendations, and unified search.
- **COMPLETED** `mobile/src/data/gymPlan.ts` & `mobile/src/services/exerciseVideoResolver.ts` — Verified YouTube Shorts (< 120s) form video library across all 6 days of the PPL Split (**Monday to Saturday, 55 total exercises**). Tapping any exercise video guide opens high-yield, concise video tutorials.

### 2026-08-09 — Server Cleanup + Mobile TTS Fix
- **DELETED** `server/routes/daily-briefing.ts` — was explicitly a dead scaffold, zero callers, marked "NOT currently wired" in its own file header.
- **DELETED** `server/routes/cron-guardian.js` — duplicated `cron-watchdog.js` logic (proactive AI nudge). Was also calling Gemini using `EXPO_PUBLIC_GEMINI_API_KEY` directly (a key already exposed in the APK — doubly wrong). Cron-watchdog covers all the same bases.
- **DELETED** `server/routes/transcript.js` (Node.js version) — superseded by `api/edge-transcript.ts` which runs on Vercel Edge Network (global, ~50ms, zero cold start). Added `/api/transcript` rewrite in `vercel.json` pointing to the edge handler so existing callers (e.g. `LectureChatPanel.tsx`) work unchanged.
- **SIMPLIFIED** `mobile/src/services/sarvamProxy.ts` — the `voice-proxy` Vercel route was never deployed to production. Mobile TTS was always falling back to `expo-speech`. Removed the broken network call, `expo-av`, `expo-file-system`, and `firebase/auth` imports from this file. Mobile Sara now speaks via device TTS directly (zero latency, zero network cost).
- Removed all 3 dead routes from `api/index.ts` imports and mount calls.

- **DELETED** root-level one-off scripts: `fix_blur.cjs`, `patch_modals.js`, `replace_models.js`, `replace_models2.cjs`, `revert_blur.cjs`, `update_app_json.cjs`
- **DELETED** `temp_notifs.txt` (56KB plaintext dump — temp file violating no-scratch-in-project rule)
- **DELETED** `Dockerfile` and `cloudbuild.yaml` (unused — app is on Vercel, not Docker/GCP)
- **DELETED** `ARCHITECTURE.md` root-level duplicate (single source of truth is `.agents/SYSTEM_ARCHITECTURE.md`)
- **DELETED** `scratch/` directory (`scratch/update_dashboard_layout.cjs` — one-off script violating workspace rules)
- **DELETED** `scripts/` directory (`fix_imports.cjs`, `split_tools.cjs` — one-off refactor scripts)
- **DELETED** `project-apex/` directory (empty)
- **DELETED** `backend/` directory (entire) — confirmed dead: legacy Socket.IO/Render server, never used by web or mobile
- **DELETED** `api/auth/` directory (empty placeholder)
- **DELETED** `src/data/brutalQuotes.ts` — 24KB quotes file with zero import references in the codebase
- **KEPT** `src/data/roadmaps.ts` — imported by `LearningChecklistModule.tsx`
- **TypeScript check**: `npx tsc --noEmit` passes with zero errors after all deletions

### 2026-07-14 — Codebase Restructure + Architecture Rewrite
- **DELETED** root junk files: `diff_appnav.txt` (7.3MB), `test-browser.js`, `test-ddg.js`, `test-lite.js`, `madge-output.json`
- **DELETED** empty `src/features/agent/` folder (orphaned)
- **MOVED** `src/data/gymPlan.ts` → `src/features/gym/data/gymPlan.ts`. Updated all 6 import sites: `GymModule.tsx`, `useGymLog.ts`, `WeeklyGymInsights.tsx`, `ExerciseCard.tsx`, `AddExerciseModal.tsx`, `GlobalDataContext.tsx`
- **ADDED** `src/config/constants.ts` — central constants (endpoints, model names, collection names, rate limits)
- **UPDATED** this architecture document — complete rewrite for accuracy

### 2026-07-14 — Web Orchestrator Fix (Critical)
- **FIXED** `src/agent/orchestrator.ts` — restored full 270-line direct-Gemini pipeline. Had been replaced by a 55-line Socket.IO stub pointing to an offline Render backend, causing "Failed to connect to backend engine: xhr poll error" on every agent call.
- **REMOVED** `socket.io-client` from `package.json` (web)

### 2026-07-14 — Tab Visibility Spam Removed
- **REMOVED** ARCH-001 tab visibility `visibilitychange` listener from `src/services/gemini/core.ts` that spammed "Tab was hidden for Xs. Timer drift may have slowed agents." into the terminal on every tab switch. The actual `visibilityAwareSleep` drift-compensation is unaffected.

### 2026-07-09 — Proxy Bug Fixes
- **FIXED** `api/gemini-proxy-stream.js` — was missing `tools` and `toolConfig` forwarding (silently broke all streaming agent tool calls)
- **FIXED** `api/gemini-proxy.js` (TTS) — server-side Sarvam was hardcoded to `hi-IN` + `pace:1.1`. Now auto-detects language + `pace:1.0`
