# ZenTrack — Machine-Navigable Architecture Report

> **UPDATE PROTOCOL**: Any time code changes (new file, new function, moved logic, changed dependency) — update the relevant section of this report in the same commit/session.
> **AI AGENT RULE**: Read this file FIRST before any `grep_search` or `list_dir`. Go directly to the file/function using the index below.

---

## 1. Project Overview

- **App**: AI-powered life OS — multi-agent productivity system with voice (Sara), autonomous email/calendar/task management, real-time agent fleet (Olympus Protocol)
- **Stack**: React 19 + TypeScript + Vite (PWA) | Firebase Firestore + Auth | Google Gemini API | Sarvam AI TTS | Google Workspace APIs (Calendar, Gmail, Drive, Docs, Meet)
- **Styling**: Vanilla CSS + CSS Modules — NO Tailwind. Premium glassmorphism dark-mode. Framer Motion animations.
- **Hosting**: Vercel (serverless functions in /api)
- **Entry**: `src/main.tsx` (bootstrap) → `src/App.tsx` (routing/auth)
- **Dev**: `npm run dev`

---

## 2. Folder Map

```
/api/                     — Vercel Serverless Functions (server-side, never bundled to client)
/api/auth/                — Google OAuth handlers (callback + silent token refresh)
/server/                  — Local dev Express gateway (Sarvam TTS proxy, npm run dev:server)
/src/main.tsx             — App entry: BrowserRouter + Sentry + VoiceProvider + App
/src/App.tsx              — Root: Firebase auth guard, React Router routes (lazy), global CustomEvent listeners
/src/index.css            — Global CSS design system (CSS tokens, dark mode, glassmorphism)
/src/agent/               — AI orchestration brain
/src/agent/core/          — DagEngine.ts + SharedState.ts (task graph primitives)
/src/agent/fleet/         — Agent defs: NewAgents.ts (~70KB) + agentDetails.ts (visual metadata)
/src/agent/memory/        — ContextEngine.ts (builds user data context for agent prompts)
/src/agent/orchestration/ — intentClassifier, fastRouter, dagExecutor, supervisorPrompt, personalityContext, agentPrompts
/src/agent/tools/         — 14 domain tool executors + shared.ts
/src/components/          — Reusable UI (shell nav, Sara orb, overlays)
/src/components/overlays/ — Full-screen panels (FocusMode, Onboarding, Security, DailyBriefing, DeveloperMatrix)
/src/components/sara/     — Sara orb sub-components (AgentCluster, TerminalFeed)
/src/components/ui/       — Small atoms (ConfirmDialog, DatePicker, GeminiAuthModal/Badge, OfflineIndicator)
/src/contexts/            — React Context providers (GlobalData, Voice, Pomodoro)
/src/features/            — Domain page modules (one folder per feature, lazy-loaded)
/src/features/_shared/    — Cross-feature widgets (FloatingExtraWorks, VoiceQuickCaptureWidget)
/src/features/academic/   — Attendance, Assignment, GradeCalculator modules
/src/features/agent/      — [EMPTY — AgentVisualization, ApiKeyManager deleted; orphaned files removed 2026-07-09]
/src/features/analytics/  — AnalyticsModule (charts, stats)
/src/features/calendar/   — CalendarModule + EventPopover
/src/features/dashboard/  — HomeDashboard, AgentShutter, MissionReport, VaultOrb, ConflictCard, etc.
/src/features/goals/      — GoalsModule + GoalCard
/src/features/gym/        — GymModule, ZenGymAI, GymChatUI, GymWorkoutSummary
/src/features/habits/     — HabitsModule
/src/features/integrations/ — IntegrationsModule
/src/features/jobs/       — JobTracker (Kanban), JobCard, JobModal, Column
/src/features/learning/   — LearningChecklistModule (~76KB, LARGEST file), CurriculumBuilderModal, LectureChatPanel, TopicCard
/src/features/notes/      — NotesModule (~71KB), NotesEditor, NotesAIPanel
/src/features/pomodoro/   — PomodoroStatsPanel
/src/features/review/     — WeeklyReviewModule
/src/features/tasks/      — TodoListModule (~46KB), TodoCard, EditTodoModal
/src/features/tools/      — ToolsHubModule (placeholder)
/src/hooks/               — Custom React hooks (useProactiveAgent, useDeadlineWatcher, useAgentVoice, etc.)
/src/services/            — External API integrations + singleton services
/src/services/audio/      — GaplessPlayer.ts (Web Audio API) + NoiseGate.ts (VAD)
/src/services/gemini/     — core.ts (fetch interceptor + key rotation), actions, chats, voice, geminiClient
/src/services/geminiLive/ — GeminiLiveClient.ts (WebSocket real-time voice)
/src/services/voice/      — sarvam.ts (TTS API) + sarvamStream.ts
/src/stores/              — In-memory reactive stores: agentMemoryStore, apiQuotaStore, missionReportStore
/src/types/               — TypeScript domain types (domain.ts, *.types.ts)
/src/utils/               — Helpers: dateUtils, networkLogger, notifications, validateInput, sound, seedDemoData
/src/data/                — Static data (gymPlan.ts)
/public/                  — Static assets (/public/agents/ — agent avatar PNGs)
```

---

## 3. File Index

### src/main.tsx
Purpose: App bootstrap — BrowserRouter + Sentry init + ErrorBoundary + VoiceProvider + App
Key: Sentry.init line 10, createRoot line 26
Imports: App, VoiceProvider, ErrorBoundary, UpdatePrompt

### src/App.tsx
Purpose: Root component — Firebase auth guard, React Router routes, lazy-loaded modules, global event listeners
Exports: default App
Key functions:
- lazyWithRetry(import, name) — line 171 — lazy import with stale-chunk cache-bust + reload
- AgentNavigator — line 66 — listens for agent-navigate CustomEvent, calls useNavigate()
- SessionEnforcer — line 131 — Firestore system/sessionControl watcher (remote forced logout)
- ClassNotificationRunner — line 45 — mounts useClassNotifications inside GlobalDataProvider
Routes (all lazy): / → HomeDashboard, /tasks, /calendar, /notes, /goals, /analytics, /gym, /jobs, /habits, /learning, /integrations, /review, /attendance, /assignments, /grades

### src/agent/orchestrator.ts
Purpose: MAIN AGENT PIPELINE — mission cache → fastRouter → parallel classify+supervisor → DAG execution
Exports: orchestrateAgent(instruction, appContext, apiKey, onStep, history?, signal?): Promise<string>
Key functions:
- orchestrateAgent() — line 40 — MAIN ENTRY POINT called by HomeDashboard
- normalizeAgentRole(role) — line 20 — maps aliases (EMAIL→HERMES, CALENDAR→CHRONOS, etc.)
Imports: callWithFallback, missionCache, buildSupervisorPrompt, fastRouter, classifyIntent, executeDag
Imported by: HomeDashboard.tsx (via agent-shortcut CustomEvent)

### src/agent/orchestration/intentClassifier.ts
Purpose: LLM intent classification — CHITCHAT / CLARIFICATION_REQUIRED / ACTIONABLE
Exports: classifyIntent(instruction, historyContext, onStep, safeDispatch): Promise<{intent,response}|null>
- classifyIntent() — line 3 — Gemini Flash call; returns null on error (treated as ACTIONABLE)

### src/agent/orchestration/fastRouter.ts
Purpose: Zero-latency regex router — pre-built DAG without LLM call (~60% of queries)
Exports: fastRouter(instruction): DagTask[] | null
- fastRouter() — line 3 — returns null if no match; sends to LLM pipeline
Key patterns: navigation→NAVIGATOR, email reads→HERMES, task reads→ORACLE, calendar→CHRONOS, creates→TITAN, scripts→HEPHAESTUS

### src/agent/orchestration/dagExecutor.ts
Purpose: Executes DAG of agent tasks — parallel agents, shared state, retry (max 2)
Exports: executeDag(taskList, instruction, appContext, apiKey, onStep, safeDispatch, signal?, historyContext?): Promise<string>
Key functions:
- executeDag() — line 10 — creates DagEngine, runs runAgentLoop per task, returns AEGIS/isFinal result
- buildSafeContext() — line 25 — truncated context string (<=8000 chars) from completed task results
- getCachedContext() — line 49 — memoizes context string per completed-task count

### src/agent/orchestration/supervisorPrompt.ts
Purpose: System prompt for Supervisor LLM (maps request → DAG task list)
Exports: buildSupervisorPrompt(personaHint: string): string

### src/agent/orchestration/personalityContext.ts
Purpose: Per-agent behavioral personality context string
Exports: buildPersonalityContext(role, appContext, agentMemory): string

### src/agent/orchestration/agentPrompts.ts
Purpose: Per-role agent system prompt overrides
Exports: getAgentPromptByRole(role: AgentRole): string | null

### src/agent/runAgentLoop.ts
Purpose: Per-agent Gemini loop — think → tool call → observe → repeat (up to MAX_ITERATIONS)
Exports: runAgentLoop(agentRole, systemPrompt, context, appContext, apiKey, onStep, tools, signal?)
Key:
- runAgentLoop() — line ~60 — iterative Gemini call; stops on text-only response or MAX_ITERATIONS
- AGENT_TOOL_WHITELIST — per-agent tool access control (strips unauthorized tools before Gemini call)
- AGENT_SYSTEM — line 56 — fallback system prompt
Model tiers: Research (ORACLE,HERMES,CHRONOS) → callWithResearchModel; Voice (NAVIGATOR,AEGIS) → callWithVoiceModel

### src/agent/toolExecutor.ts
Purpose: Central tool dispatcher — routes toolName to domain executor
Exports: executeTool(toolName, args, appContext, signal?, depth?): Promise<ToolResult>, requestApproval
- executeTool() — line 23 — sequential fallthrough: task→calendar→gmail→drive→meet→notification→analytics→learning→content→system→navigation→web→gym

### src/agent/toolDeclarations.ts
Purpose: Gemini function call schemas for ALL agent tools (~48KB)
Exports: TOOL_DECLARATIONS: FunctionDeclaration[], TOOL_NAMES: string[]

### src/agent/core/DagEngine.ts
Purpose: DAG task graph — tracks state, computes runnable tasks, dependency resolution
Exports: class DagEngine, interface DagTask, type AgentRole
Key methods:
- addTask(task) — line 25
- getRunnableTasks() — line 29 — cascades failures, returns ready tasks
- updateTaskStatus(id, status, result?) — line 89
- isComplete() — line 97
- getPendingTasks() — line 109
AgentRoles: ORACLE|SCRIBE|ENIGMA|HERMES|CHRONOS|ARCHIVE|HEPHAESTUS|AEGIS|MEET|ATLAS|ARGUS|SPECTRE|TITAN|NAVIGATOR|MERCURY|GAINS

### src/agent/core/SharedState.ts
Purpose: Shared memory context for one mission — prevents duplicate API calls
Exports: createInitialState(prompt), interface SharedMemoryContext
Fields: originalPrompt, completedTasks[], errors[], dataContext{}

### src/agent/memory/ContextEngine.ts
Purpose: Builds user data context string injected into each agent's prompt
Exports: buildContextMemory(tasks, calendarEvents, appContext?, agentMemoryContext?): string
- buildContextMemory() — line 7 — aggregates tasks, habits, goals, academic, gym, jobs, learning, peak hours

### src/agent/fleet/NewAgents.ts
Purpose: All 16 agent definitions — system prompts, tool whitelists, model configs (~70KB)
Exports: AGENT_CONFIGS: Record<AgentRole, AgentConfig>

### src/agent/fleet/agentDetails.ts
Purpose: Visual metadata for agent UI (title, tagline, color, icon, capabilities)
Exports: AGENT_DETAILS: Record<string, AgentDetail>, interface AgentDetail
Agents: ATHENA, MERCURY, GAINS, ORACLE, SCRIBE, ENIGMA, HERMES, CHRONOS, ARCHIVE, HEPHAESTUS, AEGIS, ATLAS, ARGUS, SPECTRE, TITAN, NAVIGATOR, MEET

### src/agent/orchestrationLock.ts
Purpose: Global mutex preventing concurrent agent fleet runs
Exports: orchestrationLock, withOrchestrationLock(fn)

### src/agent/tools/task.executor.ts
Purpose: Firestore CRUD for tasks, habits, goals, notes + Google Calendar sync
Exports: executeTaskTools(toolName, args, appContext, signal?, depth?): Promise<ToolResult|null>
- executeTaskTools() — line 36
Tools: get_tasks, create_task, update_task, delete_task, complete_task, create_habit, log_habit, create_goal, create_note, get_notes, get_habits, get_goals

### src/agent/tools/calendar.executor.ts
Purpose: Google Calendar CRUD
Exports: executeCalendarTools()
Tools: get_calendar_events, create_calendar_event, delete_calendar_event, update_calendar_event, find_free_slots

### src/agent/tools/gmail.executor.ts
Purpose: Gmail read/send/reply/archive/draft/trash
Exports: executeGmailTools()
Tools: read_gmail, send_email, reply_to_email, archive_email, trash_email, create_draft_email, get_email_thread

### src/agent/tools/system.executor.ts
Purpose: Cross-cutting tools — Google OAuth connect, delete app data, approvals
Exports: executeSystemTools() — line 36
Tools: connect_google_workspace, delete_internal_app_data, request_user_approval, get_user_profile

### src/agent/tools/navigation.executor.ts
Purpose: UI navigation via agent-navigate CustomEvent; YouTube embed
Exports: executeNavigationTools()
Tools: navigate_to, open_youtube_video, get_app_context

### src/agent/tools/analytics.executor.ts
Purpose: Task/habit/goal analytics from appContext + Firestore
Exports: executeAnalyticsTools()

### src/agent/tools/learning.executor.ts
Purpose: Learning module CRUD (topics, lectures, notes, curriculum)
Exports: executeLearningTools()

### src/agent/tools/gym.executor.ts
Purpose: Gym log CRUD; dispatches gym-log-updated CustomEvent after writes
Exports: executeGymTools()

### src/agent/tools/content.executor.ts
Purpose: Google Docs create/write/read, script generation
Exports: executeContentTools()

### src/agent/tools/drive.executor.ts
Purpose: Google Drive search, list, trash, open, PDF links
Exports: executeDriveTools()

### src/agent/tools/meet.executor.ts
Purpose: Google Meet creation
Exports: executeMeetTools()

### src/agent/tools/notification.executor.ts
Purpose: FCM push notifications, SMS (Twilio proxy), in-app alerts
Exports: executeNotificationTools()

### src/agent/tools/web.executor.ts
Purpose: Web search (DuckDuckGo via /api/search), YouTube transcript
Exports: executeWebTools()

### src/agent/tools/shared.ts
Purpose: Shared tool helpers
Exports: requestApproval(message, appContext), requireGoogleAuth(appContext), interface ToolResult

### src/contexts/VoiceContext.tsx
Purpose: CRITICAL — Hybrid voice: Chrome STT loop + Sarvam TTS + GaplessPlayer + barge-in
Exports: VoiceProvider, useVoice()
Key functions:
- fetchTTSAudio(text) — line 89 — Sarvam direct → proxy fallback (/api/gemini-proxy?action=tts)
- VoiceProvider — line 126 — manages isMuted, isSpeaking, isConversationActive, TTS queue
- processQueue() — line 190 — drains TTS queue via player.enqueue(base64)
- getAdaptiveSilenceMs(text) — line 78 — 800ms (<=4 words) or 1200ms (longer)
- startConversation() / stopConversation() — controls active mic loop
HOTSPOT: TTS chunks capped at 500 chars (Sarvam API limit). DO NOT change without checking Sarvam docs.

### src/contexts/GlobalDataContext.tsx
Purpose: Firestore real-time data hub — tasks, habits, goals, notes, calendar, gym, jobs, etc.
Exports: GlobalDataProvider, useGlobalData()
Key functions:
- useGlobalData() — line 45 — throws if used outside provider
- safeSnapshot(q, setter, label) — line 53 — error-isolated onSnapshot wrapper
- GlobalDataProvider — line 76 — subscribes to 12+ Firestore collections
Collections: tasks, habits, habitLogs, goals, notes, gym_logs, jobs, learningTopics, attendance_subjects, assignments, pomodoro_sessions
HOTSPOT: Calendar events NOT from Firestore — from pollGoogleCalendarChanges(). Adding Firestore calendar subscription = duplicate data.

### src/contexts/PomodoroContext.tsx
Purpose: Pomodoro timer state machine
Exports: PomodoroProvider, usePomodoro()

### src/services/gemini/core.ts
Purpose: CRITICAL — Gemini client with fetch monkey-patch (proxy/OAuth routing), multi-key rotation, concurrency semaphore, model tiers
Exports: callWithFallback, callWithFallbackUnthrottled, callWithVoiceModel, callWithResearchModel, SAFETY_SETTINGS, runModelHealthCheck
Architecture:
- Fetch monkey-patch line 61: intercepts generativelanguage.googleapis.com; oauth_dummy_key→OAuth Bearer, proxy_dummy_key→/api/gemini-proxy
- MAX_CONCURRENT_API_CALLS = 8 semaphore prevents thundering-herd rate limits
- Multi-key rotation: retry with next key on 429
Models: Research=gemini-2.5-flash, Voice=gemini-2.5-flash-lite-preview-06-17
HOTSPOT: NEVER modify key rotation logic without explicit permission.

### src/services/gemini/actions.ts
Purpose: High-level Gemini actions (chat, summarize, generate)

### src/services/gemini/chats.ts
Purpose: Multi-turn conversation management with Gemini

### src/services/gemini/voice.ts
Purpose: Gemini voice-specific helpers (fast-path conversational responses)

### src/services/gemini/geminiClient.ts
Purpose: Low-level Gemini client wrapper
Exports: createGeminiClient(key)

### src/services/geminiLive/GeminiLiveClient.ts
Purpose: WebSocket client for Gemini Live API (BidiGenerateContent) — real-time audio streaming
Exports: class GeminiLiveClient
Methods: connect(), sendAudio(pcm: Int16Array), disconnect()
Protocol: WebSocket → setup msg → stream 16kHz int16 PCM → receive text/tool-call
Model: gemini-2.0-flash-exp

### src/services/audio/GaplessPlayer.ts
Purpose: Web Audio API gapless buffer player — zero gap between TTS sentences
Exports: class GaplessPlayer
Methods:
- init() — line 46 — create AudioContext (must be after user gesture)
- enqueue(base64) — line 59 — decode + schedule AudioBufferSourceNode
- flush() — instant barge-in stop; resets isPumping
Callbacks: onSpeakingStart, onSpeakingEnd
HOTSPOT: pendingSourceCount prevents false onSpeakingEnd between consecutive sentences.

### src/services/audio/NoiseGate.ts
Purpose: VAD (Voice Activity Detection) via AudioWorklet
Exports: class NoiseGate

### src/services/voice/sarvam.ts
Purpose: Sarvam AI TTS — text to base64 audio
Exports: synthesizeSpeechSarvam({ text, voiceId? }): Promise<string>
HOTSPOT: 500 char limit per call. Key rotation via VITE_SARVAM_API_KEY_1 and VITE_SARVAM_API_KEY_2.

### src/services/voice/sarvamStream.ts
Purpose: Streaming Sarvam TTS variant

### src/services/firebase.ts
Purpose: Firebase client init — Auth + Firestore with offline persistence + multi-tab sync
Exports: auth, db, googleProvider
Persistence: persistentLocalCache + persistentMultipleTabManager (IndexedDB)

### src/services/googleCalendar.ts
Purpose: Google Calendar API — OAuth init, event CRUD, token refresh, polling
Exports: initGoogleCalendar(), isSignedInToGoogle(), signInWithGoogle(), signOutGoogle(), getTokenTimeRemaining(), forceSilentRefresh(), pollGoogleCalendarChanges(), addEventToGoogleCalendar(), deleteGoogleCalendarEvent(), listCalendarEventsOnDate()
HOTSPOT: access_token stored IN MEMORY only (not localStorage). _oauthRefreshLock prevents parallel refresh races.

### src/services/googleWorkspace.ts
Purpose: Google Workspace API (Gmail, Drive, Docs, Meet, Sheets)
Exports: fetchUnreadEmails(), fetchEmailThread(), sendEmail(), replyToEmail(), archiveEmail(), trashEmail(), createGoogleDoc(), writeToGoogleDoc(), readGoogleDoc(), searchGoogleDrive(), trashDriveFile(), listDriveFiles(), openDriveFile(), getFilePdfLink(), createGoogleMeet(), createDraftEmail(), listCalendarEventsOnDate(), updateCalendarEvent()

### src/services/MissionCache.ts
Purpose: LRU cache (10 entries, 30s TTL) for agent mission results
Exports: missionCache, computeDataVersion(appContext)
Methods: get(query, dataVersion), set(query, dataVersion, result), invalidate()
Cache key: normalized_query::t{tasks}c{events}n{notes}h{habits}

### src/services/patternEngine.ts
Purpose: Behavioral learning engine — derives UserBehaviorProfile; stored in Firestore user_profiles/{uid}
Exports: deriveUserBehaviorProfile(), loadBehaviorProfile(), saveBehaviorProfile(), getBehavioralDirective(), formatProfileForAgent(), UserBehaviorProfile, UserPersona
Profile fields: actualPeakHours, avgCompletionRatio, snoozePatternTopics, userPersona, rescheduleRate, etc.

### src/services/userLearningStore.ts
Purpose: Singleton wrapper for patternEngine — initialize once, per-role behavioral directives
Exports: userLearningStore singleton
Methods:
- initialize(appContext) — line 58 — loads profile from Firestore (once, cached)
- getAgentContext(role) — returns behavioral directive string for a specific agent role
- getProfile() — returns current UserBehaviorProfile
- recordCompletion(task) — micro-learning event on task complete

### src/services/agentMemoryPersistence.ts
Purpose: Persists 14-day agent interaction log to Firestore for cross-session memory
Exports: loadAgentMemoryContext(), recordApprovalGrant(), recordApprovalRejection(), recordApprovalTimeout(), recordEmailSent(), recordGhostTaskCreated()

### src/services/DataPrefetcher.ts
Purpose: Pre-fetches user data before agents need it
Exports: DataPrefetcher class/helpers

### src/services/conflictDetector.ts
Purpose: Detects scheduling conflicts (task/calendar overlaps, overloaded days)
Exports: conflict detection functions

### src/services/fcm.ts
Purpose: Firebase Cloud Messaging push notifications
Exports: sendPushNotification(userId, title, body, data?)

### src/services/userGeminiAuth.ts
Purpose: User personal Gemini OAuth token management
Exports: getActiveGeminiKey(), setAuthExpired(), loadUserGeminiKey()

### src/services/localDatabase.ts
Purpose: IndexedDB wrapper for offline local storage

### src/services/youtube.ts
Purpose: YouTube player/embed utilities

### src/stores/agentMemoryStore.ts
Purpose: In-memory reactive store for agent conversation history (capped at 50 messages)
Exports: agentMemoryStore singleton, interface AgentMessage
Methods: getSnapshot(), subscribe(listener), appendMessage(msg) — line 35, clear()

### src/stores/apiQuotaStore.ts
Purpose: Tracks Gemini API quota in memory
Exports: apiQuotaStore singleton

### src/stores/missionReportStore.ts
Purpose: Stores completed mission reports for ReportArchive
Exports: missionReportStore singleton

### src/components/SaraInterface.tsx
Purpose: Main voice orb UI — pulsing orb, agent terminal feed, conversation controls (~39KB)
Exports: SaraInterface

### src/components/Sidebar.tsx
Purpose: Desktop navigation sidebar with route links + agent dock
Exports: Sidebar

### src/components/TopNav.tsx
Purpose: Top navigation bar — logo, search, Gemini auth badge, settings
Exports: TopNav

### src/components/BottomNav.tsx
Purpose: Mobile bottom navigation tabs
Exports: BottomNav

### src/components/CommandPalette.tsx
Purpose: Keyboard command palette (Cmd+K)
Exports: CommandPalette

### src/components/AgentDataStream.tsx
Purpose: Terminal-like feed for live agent thoughts (subscribes to agent-log CustomEvents)
Exports: AgentDataStream

### src/components/GoogleWorkspaceBanner.tsx
Purpose: Top banner prompting Google OAuth connection when disconnected
Exports: GoogleWorkspaceBanner

### src/components/Landing.tsx
Purpose: Public landing page (unauthenticated)
Exports: Landing

### src/components/Login.tsx
Purpose: Auth page — Google Sign In + Firebase Auth
Exports: Login

### src/components/overlays/FocusModeOverlay.tsx
Purpose: Full-screen focus mode + Pomodoro timer
Exports: FocusModeOverlay

### src/components/overlays/SecuritySettingsModal.tsx
Purpose: Security/privacy settings panel (~22KB)
Exports: SecuritySettingsModal

### src/components/overlays/OnboardingCarousel.tsx
Purpose: First-time user onboarding flow
Exports: OnboardingCarousel

### src/components/overlays/DailyBriefingOverlay.tsx
Purpose: Morning AI briefing panel
Exports: DailyBriefingOverlay

### src/components/overlays/DeveloperMatrix.tsx
Purpose: Dev-only debug panel (network logs, agent state)
Exports: DeveloperMatrix

### src/components/sara/AgentCluster.tsx
Purpose: Visual cluster of agent avatars around the Sara orb
Exports: AgentCluster

### src/components/sara/TerminalFeed.tsx
Purpose: Terminal-style feed inside Sara interface
Exports: TerminalFeed

### src/components/ui/GeminiAuthModal.tsx
Purpose: Modal for personal Gemini API key/OAuth connection
Exports: GeminiAuthModal

### src/components/ui/GeminiAuthBadge.tsx
Purpose: Status badge for personal Gemini auth state
Exports: GeminiAuthBadge

### src/features/dashboard/HomeDashboard.tsx
Purpose: Main app screen — orchestrates agent on agent-shortcut, renders task/habit overview, AgentShutter
Exports: HomeDashboard
HOTSPOT: orchestrateAgent() called here. appContext assembled from useGlobalData(). Missing field = agents get stale data.

### src/features/dashboard/VaultOrb.tsx
Purpose: Animated 3D orb visualization (~20KB)
Exports: VaultOrb

### src/features/dashboard/AgentShutter.tsx
Purpose: Animated panel revealing agent fleet during missions
Exports: AgentShutter

### src/features/dashboard/MissionReport.tsx
Purpose: Structured mission report display
Exports: MissionReport

### src/features/tasks/TodoListModule.tsx
Purpose: Full task management UI — create/filter/sort/complete (~46KB)
Exports: TodoListModule

### src/features/tasks/TodoCard.tsx
Purpose: Individual task card with inline edit and completion
Exports: TodoCard

### src/features/calendar/CalendarModule.tsx
Purpose: Calendar with Google Calendar events + task overlay (~51KB)
Exports: CalendarModule

### src/features/notes/NotesModule.tsx
Purpose: Note-taking with AI panel + rich editor (~71KB)
Exports: NotesModule

### src/features/gym/ZenGymAI.tsx
Purpose: AI gym coaching panel (~51KB)
Exports: ZenGymAI

### src/features/learning/LearningChecklistModule.tsx
Purpose: Learning checklist with lectures + AI curriculum builder (~76KB, LARGEST file)
Exports: LearningChecklistModule

### src/features/_shared/VoiceQuickCaptureWidget.tsx
Purpose: Floating voice-to-text quick capture (~22KB)
Exports: VoiceQuickCaptureWidget

### src/hooks/useProactiveAgent.ts
Purpose: Background proactive agent — periodic AI checks for deadlines/habits/risks (~41KB)
Exports: useProactiveAgent()

### src/hooks/useDeadlineWatcher.ts
Purpose: Watches tasks approaching deadline; fires browser notifications
Exports: useDeadlineWatcher()

### src/hooks/useAgentVoice.ts
Purpose: Hook integrating agent output with voice TTS
Exports: useAgentVoice()

### api/gemini-proxy.js
Purpose: CRITICAL — Vercel serverless Gemini proxy: validates Firebase ID token, rate-limits (100 req/min/user), key rotation, forwards to Gemini API. Also handles Sarvam TTS (?action=tts).
HOTSPOT: Must forward tools AND toolConfig. Omitting silently breaks ALL agent tool calls in production.
Required env: GEMINI_API_KEYS, FIREBASE_SERVICE_ACCOUNT_JSON, ALLOWED_ORIGINS

### api/gemini-proxy-stream.js
Purpose: Streaming Gemini proxy variant for real-time token display in terminal

### api/search.js
Purpose: Web search — DuckDuckGo (GET ?q=) and YouTube (GET ?q=&type=youtube)
Env: INNERTUBE_KEY or YOUTUBE_API_KEY

### api/transcript.js
Purpose: YouTube transcript fetcher — requires Firebase ID token
Route: GET /api/transcript?videoId=xxx

### api/auth/google.ts
Purpose: Google OAuth callback handler

### api/auth/refresh.ts
Purpose: Silent Google OAuth token refresh endpoint

### api/send-notification.js
Purpose: Server-side FCM push notification sender

### api/send-sms.ts
Purpose: Twilio SMS sender

### api/cron-watchdog.js
Purpose: Scheduled cron — system health + dead-letter queue processing (~21KB)

### api/daily-briefing.ts
Purpose: Generates and sends daily briefing

### api/youtube.js
Purpose: YouTube Data API v3 serverless wrapper

### server/sarvamGateway.js
Purpose: Local dev Express Sarvam TTS proxy (replaces Vercel proxy on localhost)
Run: npm run dev:server

### src/types/domain.ts
Purpose: Core domain types — Task, CalendarEvent interfaces

### src/utils/dateUtils.ts
Purpose: Date helpers
Exports: getLocalDateString(date: Date): string — returns YYYY-MM-DD in local timezone

### src/utils/networkLogger.ts
Purpose: API call logger for dev console / DeveloperMatrix
Exports: logApi(method, url, body, status), logWebSocket(event, data)

---

## 4. Function/Symbol Lookup Table

| Function/Class | File | Line | Description |
|---|---|---|---|
| orchestrateAgent | src/agent/orchestrator.ts | 40 | Main agent pipeline entry point |
| classifyIntent | src/agent/orchestration/intentClassifier.ts | 3 | LLM intent classification (CHITCHAT/CLARIFICATION/ACTIONABLE) |
| fastRouter | src/agent/orchestration/fastRouter.ts | 3 | Zero-latency regex router bypassing LLM |
| executeDag | src/agent/orchestration/dagExecutor.ts | 10 | Executes DAG of agent tasks |
| buildSupervisorPrompt | src/agent/orchestration/supervisorPrompt.ts | 1 | Supervisor LLM system prompt builder |
| runAgentLoop | src/agent/runAgentLoop.ts | ~60 | Per-agent Gemini think-tool-observe loop |
| executeTool | src/agent/toolExecutor.ts | 23 | Routes tool name to domain executor |
| DagEngine | src/agent/core/DagEngine.ts | 17 | DAG task graph class |
| DagEngine.getRunnableTasks | src/agent/core/DagEngine.ts | 29 | Returns ready-to-run tasks |
| DagEngine.updateTaskStatus | src/agent/core/DagEngine.ts | 89 | Marks task completed/failed |
| buildContextMemory | src/agent/memory/ContextEngine.ts | 7 | Builds agent prompt context from user data |
| fetchTTSAudio | src/contexts/VoiceContext.tsx | 89 | Calls Sarvam TTS with proxy fallback |
| VoiceProvider | src/contexts/VoiceContext.tsx | 126 | Voice system React context provider |
| getAdaptiveSilenceMs | src/contexts/VoiceContext.tsx | 78 | Adaptive silence window (800ms vs 1200ms) |
| processQueue | src/contexts/VoiceContext.tsx | 190 | Drains TTS audio queue |
| useGlobalData | src/contexts/GlobalDataContext.tsx | 45 | Returns Firestore real-time data |
| GlobalDataProvider | src/contexts/GlobalDataContext.tsx | 76 | Firestore subscriptions provider |
| safeSnapshot | src/contexts/GlobalDataContext.tsx | 53 | Error-isolated Firestore onSnapshot wrapper |
| callWithFallback | src/services/gemini/core.ts | ~200 | Gemini call with key rotation on 429 |
| callWithResearchModel | src/services/gemini/core.ts | ~250 | gemini-2.5-flash for deep analysis |
| callWithVoiceModel | src/services/gemini/core.ts | ~260 | gemini-2.5-flash-lite for fast voice |
| GaplessPlayer.enqueue | src/services/audio/GaplessPlayer.ts | 59 | Queue base64 audio for gapless playback |
| GaplessPlayer.flush | src/services/audio/GaplessPlayer.ts | ~130 | Instant barge-in audio stop |
| GaplessPlayer.init | src/services/audio/GaplessPlayer.ts | 46 | Create AudioContext (after user gesture) |
| synthesizeSpeechSarvam | src/services/voice/sarvam.ts | 1 | Sarvam AI TTS to base64 audio |
| missionCache.get | src/services/MissionCache.ts | 46 | Get cached mission result |
| missionCache.set | src/services/MissionCache.ts | 66 | Cache mission result (30s TTL) |
| missionCache.invalidate | src/services/MissionCache.ts | 83 | Clear cache after write operation |
| computeDataVersion | src/services/MissionCache.ts | 99 | Hash of task/event/note/habit counts |
| userLearningStore.initialize | src/services/userLearningStore.ts | 58 | Load behavior profile (once per session) |
| deriveUserBehaviorProfile | src/services/patternEngine.ts | ~100 | Compute profile from interaction data |
| agentMemoryStore.appendMessage | src/stores/agentMemoryStore.ts | 35 | Add agent message (capped at 50) |
| forceSilentRefresh | src/services/googleCalendar.ts | ~150 | Silent Google OAuth token refresh |
| pollGoogleCalendarChanges | src/services/googleCalendar.ts | ~200 | Polls Google Calendar for changes |
| getLocalDateString | src/utils/dateUtils.ts | 1 | Returns YYYY-MM-DD in local timezone |
| logApi | src/utils/networkLogger.ts | 1 | Dev console API call logger |
| normalizeAgentRole | src/agent/orchestrator.ts | 20 | Maps role aliases to canonical AgentRole |
| AGENT_DETAILS | src/agent/fleet/agentDetails.ts | 19 | Visual metadata for all 16 agents |
| executeTaskTools | src/agent/tools/task.executor.ts | 36 | Firestore CRUD for tasks/habits/goals |
| executeGmailTools | src/agent/tools/gmail.executor.ts | ~35 | Gmail read/write/send |
| executeSystemTools | src/agent/tools/system.executor.ts | 36 | Cross-cutting system tools |
| executeNavigationTools | src/agent/tools/navigation.executor.ts | ~35 | UI navigation via CustomEvent |
| lazyWithRetry | src/App.tsx | 171 | Lazy import with stale-chunk reload |
| GeminiLiveClient | src/services/geminiLive/GeminiLiveClient.ts | ~60 | WebSocket Gemini Live API client |

---

## 5. Data Flow / Request Flows

### A. Standard Voice Command (Full Path)
```
User speaks -> Chrome SpeechRecognition (VoiceContext.tsx)
  -> adaptive silence (800ms short / 1200ms long)
  -> sendToAgent(transcript)
  -> window.dispatchEvent('agent-shortcut', { instruction })
  -> HomeDashboard.tsx picks up event
  -> orchestrateAgent(instruction, appContext, apiKey, onStep, history, signal)
    -> missionCache.get() -- hit? return cached result instantly
    -> fastRouter(instruction) -- regex match? executeDag(fastDag) skip LLM
    -> [PARALLEL] classifyIntent() + Supervisor LLM
      -> CHITCHAT? -> onStep(answer) -> enqueue TTS -> speak
      -> ACTIONABLE? -> taskList from Supervisor
    -> executeDag(taskList)
      -> DagEngine.getRunnableTasks() -> run parallel agents
      -> Each: runAgentLoop() -> Gemini -> executeTool() -> Firestore/Google APIs
      -> AEGIS synthesizes final answer (or isFinal agent skips AEGIS)
    -> result string returned
  -> VoiceContext.speakText(result)
  -> fetchTTSAudio(chunk) -> Sarvam TTS -> base64
  -> GaplessPlayer.enqueue(base64) -> Web Audio API -> audio out
  -> onSpeakingEnd -> mic restarts -> loop
```

### B. Task Creation
```
fastRouter "create a task" -> [{ TITAN, isFinal: true }]
-> executeDag -> runAgentLoop(TITAN)
  -> Gemini: create_task({ title: "...", date: "tomorrow" })
  -> executeTaskTools("create_task") -> addDoc(Firestore, tasks/{userId})
  -> Firestore onSnapshot in GlobalDataContext -> UI re-renders
-> missionCache.invalidate()
-> TITAN answer returned directly (isFinal=true, skips AEGIS, saves ~400ms)
-> Sara speaks confirmation
```

### C. Email Read
```
fastRouter "check my emails" -> [{ HERMES, isFinal: true }]
-> runAgentLoop(HERMES)
  -> Gemini: read_gmail({ query: "is:unread", maxResults: 15 })
  -> executeGmailTools -> fetchUnreadEmails() -> Gmail API (OAuth token)
-> HERMES synthesizes summary directly (isFinal=true)
-> Sara speaks priority summary
```

### D. Gemini API Call (Production)
```
Browser: GoogleGenerativeAI(key='proxy_dummy_key')
-> fetch interceptor in core.ts catches generativelanguage.googleapis.com
-> proxy_dummy_key detected -> redirect to POST /api/gemini-proxy
-> { Authorization: Bearer <Firebase ID Token> }
-> gemini-proxy.js: verifyIdToken() -> rate-limit check (Firestore) -> key rotation
-> Forward to Gemini API with GEMINI_KEYS[currentIndex]
-> Response returned as-is to browser
```

### E. Google Calendar OAuth
```
User clicks Connect Google -> signInWithGoogle() in googleCalendar.ts
-> google.accounts.oauth2.initTokenClient(clientId, scopes)
-> Google popup -> user approves
-> access_token stored IN MEMORY only (not localStorage)
-> zen_gcal_has_refresh_token flag set in localStorage
-> GlobalDataContext: pollGoogleCalendarChanges()
-> calendarEvents state updates -> all components re-render
```

---

## 6. Config & Environment

### Client-Side (VITE_ prefix -- safe to expose)
| Variable | File | Purpose |
|---|---|---|
| VITE_FIREBASE_API_KEY | src/services/firebase.ts | Firebase project identifier |
| VITE_FIREBASE_AUTH_DOMAIN | src/services/firebase.ts | Firebase auth domain |
| VITE_FIREBASE_PROJECT_ID | src/services/firebase.ts | Firestore project ID |
| VITE_FIREBASE_STORAGE_BUCKET | src/services/firebase.ts | Storage bucket |
| VITE_FIREBASE_MESSAGING_SENDER_ID | src/services/firebase.ts | FCM sender ID |
| VITE_FIREBASE_APP_ID | src/services/firebase.ts | Firebase app ID |
| VITE_GEMINI_API_KEY | src/services/gemini/core.ts | LOCAL DEV only -- never on Vercel |
| VITE_SARVAM_API_KEY_1 | src/services/voice/sarvam.ts | Sarvam TTS key 1 |
| VITE_SARVAM_API_KEY_2 | src/services/voice/sarvam.ts | Sarvam TTS key 2 (rotation) |
| VITE_SARVAM_VOICE_ID | src/services/voice/sarvam.ts | Voice ID (e.g. ananya) |
| VITE_GOOGLE_CLIENT_ID | src/services/googleCalendar.ts | Google OAuth client ID |
| VITE_APP_URL | Various | App base URL |
| VITE_VAPID_PUBLIC_KEY | src/services/fcm.ts | FCM Web Push VAPID key |
| VITE_SENTRY_DSN | src/main.tsx | Sentry error tracking DSN |

### Server-Side (Vercel env vars -- NEVER in browser bundle)
| Variable | File | Purpose |
|---|---|---|
| GEMINI_API_KEYS | api/gemini-proxy.js | Comma-separated pool (up to 10 keys) |
| FIREBASE_SERVICE_ACCOUNT_JSON | api/gemini-proxy.js + all api/ routes | Firebase Admin SDK auth |
| ALLOWED_ORIGINS | All api/ routes | CORS whitelist |
| SARVAM_API_KEY_1..10 | api/gemini-proxy.js | Server-side Sarvam key pool |
| YOUTUBE_API_KEY | api/search.js | YouTube Data API v3 |
| TWILIO_ACCOUNT_SID | api/send-sms.ts | Twilio SMS |
| TWILIO_AUTH_TOKEN | api/send-sms.ts | Twilio SMS |
| SENTRY_DSN | api/gemini-proxy.js | Server-side Sentry |

---

## 7. Database / Schema Map (Firestore)

| Collection | Path | Key Fields | Queried By |
|---|---|---|---|
| tasks | tasks/{id} | userId, title, date, status, priority, completedAt | GlobalDataContext, task.executor.ts |
| habits | habits/{id} | userId, name, emoji, frequency | GlobalDataContext, task.executor.ts |
| habitLogs | habitLogs/{id} | userId, habitId, date | GlobalDataContext, task.executor.ts |
| goals | goals/{id} | userId, title, status, keyResults[] | GlobalDataContext, task.executor.ts |
| notes | notes/{id} | userId, title, content, tags | GlobalDataContext, task.executor.ts |
| gym_logs | gym_logs/{id} | userId, date, exercises[] | GlobalDataContext, gym.executor.ts |
| jobs | jobs/{id} | userId, company, role, status, stage | GlobalDataContext |
| learningTopics | learningTopics/{id} | userId, title, lectures[], progress | GlobalDataContext, learning.executor.ts |
| attendance_subjects | attendance_subjects/{id} | userId, name, attended, total | GlobalDataContext |
| assignments | assignments/{id} | userId, title, dueDate, subject | GlobalDataContext |
| pomodoro_sessions | pomodoro_sessions/{id} | userId, startTime, duration, taskId | GlobalDataContext |
| user_profiles | user_profiles/{uid} | behaviorProfile{} | patternEngine.ts, userLearningStore.ts |
| agent_memory | agent_memory/{uid} | interaction log entries (14-day) | agentMemoryPersistence.ts |
| system/sessionControl | system/sessionControl | activeSessionKey | App.tsx (SessionEnforcer) |
| rate_limits | rate_limits/{uid} | count, windowStart | api/gemini-proxy.js |

---

## 8. Known Hotspots / Common Bug Areas

| File | Risk | Why |
|---|---|---|
| api/gemini-proxy.js | HIGH | Must forward tools + toolConfig. Omitting silently breaks ALL agent tool calls in production. |
| src/contexts/VoiceContext.tsx | HIGH | TTS chunked at 500 chars (Sarvam limit). Timing between mic/TTS/barge-in is fragile. |
| src/services/gemini/core.ts | HIGH | Fetch monkey-patch must execute before any Gemini SDK usage. Key rotation affects all agents simultaneously. NEVER modify without permission. |
| src/services/audio/GaplessPlayer.ts | MEDIUM | pendingSourceCount must decrement on every onended or onSpeakingEnd fires early. isPumping must reset in flush() or barge-in breaks. |
| src/contexts/GlobalDataContext.tsx | MEDIUM | Calendar events NOT from Firestore -- from pollGoogleCalendarChanges(). Adding Firestore calendar subscription = duplicate data. |
| src/agent/orchestrator.ts | MEDIUM | missionCache.invalidate() must be called after EVERY write tool. Missing it = stale reads. |
| src/features/dashboard/HomeDashboard.tsx | MEDIUM | orchestrateAgent() called here. appContext assembled from useGlobalData(). Missing a field = agents receive stale/incomplete data. |
| src/services/googleCalendar.ts | MEDIUM | _oauthRefreshLock prevents parallel refresh races. Remove it = 401 cascades on concurrent agents. |
| src/agent/core/DagEngine.ts | LOW | AEGIS runs even with failed deps (by design -- synthesizes partial results). Non-AEGIS agents also run with failed deps. Changing this breaks parallelism. |
| src/agent/runAgentLoop.ts | LOW | AGENT_TOOL_WHITELIST must be updated for every new tool + every agent role permission change. |
| api/gemini-proxy-stream.js | HIGH | **BUG FIXED 2026-07-09**: Was missing `tools` and `toolConfig` forwarding — silently degraded all streaming agent calls to text-only mode. Now parity with gemini-proxy.js. |
| api/gemini-proxy.js (TTS) | MEDIUM | Server-side Sarvam TTS was hardcoded to `hi-IN` + `pace:1.1`. **FIXED 2026-07-09**: now auto-detects Devanagari ratio (>15% → hi-IN, else en-IN) + `pace:1.0`. Matches client sarvam.ts. |

---

## 9. Naming & Pattern Conventions

### File naming
- React components: PascalCase.tsx
- Services/utilities: camelCase.ts
- Tool executors: domain.executor.ts
- Feature modules: FeatureNameModule.tsx
- Type files: domain.types.ts or domain.ts

### Where new code lives
| Task | Location |
|---|---|
| New agent tool | src/agent/toolDeclarations.ts (schema) + src/agent/tools/domain.executor.ts (impl) + AGENT_TOOL_WHITELIST in runAgentLoop.ts |
| New feature page | src/features/newFeature/FeatureNameModule.tsx + lazy import + route in App.tsx |
| New Firestore collection | onSnapshot in GlobalDataContext.tsx + type in src/types/ |
| New context provider | src/contexts/NewContext.tsx -- wrap in main.tsx or App.tsx |
| New API endpoint | api/endpoint-name.js + add to vercel.json routes |
| New Google Workspace API | src/services/googleWorkspace.ts |
| New agent role | AgentRole type in DagEngine.ts + AGENT_DETAILS in agentDetails.ts + config in NewAgents.ts |

### CustomEvent Bus (window events)
| Event | Dispatcher | Listener |
|---|---|---|
| agent-log | orchestrator.ts, all executors | AgentDataStream.tsx, SaraInterface.tsx |
| agent-shortcut | VoiceContext.tsx | HomeDashboard.tsx |
| agent-navigate | navigation.executor.ts | App.tsx (AgentNavigator) |
| agent-speak | tool executors | VoiceContext.tsx |
| agent-reopen-mic-conversational | GaplessPlayer.onSpeakingEnd | VoiceContext.tsx |
| agent-open-lecture | App.tsx (AgentNavigator) | LearningChecklistModule.tsx |
| agent-gym-subview | App.tsx (AgentNavigator) | GymModule.tsx |
| gym-log-updated | gym.executor.ts | GymModule.tsx |

### State management
- Global real-time data: GlobalDataContext (Firestore onSnapshot)
- In-session stores: agentMemoryStore, apiQuotaStore, missionReportStore (reactive class singletons)
- Local component state: useState + useRef
- Cross-session persistence: Firestore + localStorage for fast reads

---

## 10. Update Protocol

MANDATORY: When you add, remove, move, or significantly change a function or file, update this document before finishing the task.

Sections to update:
- Section 3 (File Index) -- for file changes
- Section 4 (Lookup Table) -- for function/class changes
- Section 5 (Data Flows) -- if the flow changes
- Section 2 (Folder Map) -- if a new folder is created
- Section 7 (Database Map) -- if a new Firestore collection is added

---

## 11. Changelog

### Session: Voice + Agent Memory Overhaul (2026-07-08)

#### src/services/voice/sarvam.ts
- **ADDED** `detectLanguageCode(text)` — auto-detects `en-IN` vs `hi-IN` using Devanagari Unicode ratio (>15% = hi-IN). Fixes English responses being pronounced with Hindi phonemes.
- **CHANGED** `target_language_code`: now dynamic via `detectLanguageCode()` (was hardcoded `hi-IN`)
- **CHANGED** `pace`: `1.05` → `1.0` (prevents audio clipping on some hardware)
- **ADDED** 8-second `AbortController` timeout on every Sarvam fetch — prevents TTS queue from freezing forever on slow API responses

#### src/services/audio/GaplessPlayer.ts
- **ADDED** `ctx.resume()` guard at top of `enqueue()` — browser autoplay policy can suspend AudioContext after inactivity, causing audio to decode silently or play at wrong speed

#### src/contexts/VoiceContext.tsx
- **ADDED** `conversationHistoryRef` (line ~147) — tracks last 10 turns `{role: 'user'|'model', text: string}` across the voice session
- **FIXED** Adaptive silence timer: `getAdaptiveSilenceMs()` was defined but never called — silence timer now uses it (`≤4 words → 800ms`, `5+ words → 1200ms`). Was always using fixed `1200ms`.
- **CHANGED** Mic reopen delay: `300ms` → `150ms` after TTS ends (faster conversational loop)
- **IMPROVED** Markdown stripping in `onAgentLog`: comprehensive regex chain replacing `###`, `**bold**`, `*italic*`, `[link](url)`, bullet/numbered lists, `__underline__` (old: single char replace that left most markdown intact)
- **ADDED** User turn pushed to `conversationHistoryRef` in `sendToAgent()`
- **ADDED** Model turn pushed to `conversationHistoryRef` when `step.type === 'answer'` in `onAgentLog()`
- **FIXED** `agent-shortcut` event now carries `{ prompt, history }` (was `{ prompt }` only) — history reaches orchestrateAgent for multi-turn memory
- **ADDED** `conversationHistoryRef.current = []` in `stopConversation()` — prevents stale context from Session A leaking into Session B

#### src/features/dashboard/HomeDashboard.tsx
- **FIXED** `onShortcut` handler: now reads `{ prompt, history }` from event (was only `{ prompt }`)
- **CHANGED** `handleExecuteCommand(overridePrompt?)` → `handleExecuteCommand(overridePrompt?, voiceHistory?)` — accepts and prefers live voice history over agentMemoryStore history
- **FIXED** `orchestrateAgent` now receives real voice conversation history instead of always `[]`

#### src/agent/orchestration/intentClassifier.ts
- **REWRITTEN** System prompt — history-aware classification. Critical new rule: if CONVERSATION HISTORY shows Sara asked a question and CURRENT REQUEST answers it → always ACTIONABLE (fixes "check mails" → "which type?" → "just unread" infinite loop)
- **CHANGED** Prompt format: explicit `CONVERSATION HISTORY: ...` block before `CURRENT REQUEST:`

#### src/agent/orchestrator.ts
- **CHANGED** `historyContext` format: `[USER]: ...` / `[SARA]: ...` labels (was `[USER]: ...` / `[MODEL]: ...`)

#### src/agent/orchestration/supervisorPrompt.ts
- **ADDED** `## VOICE OUTPUT RULES — MANDATORY FOR ALL AGENTS` section — instructs ALL delegated agents to end responses with `SPOKEN_SUMMARY:` block containing plain conversational English

#### src/agent/orchestration/agentPrompts.ts
- **ADDED** `VOICE_SPEECH_RULES` constant — voice output rules appended to every agent's system prompt at the `getAgentPromptByRole()` return site. Covers all 16 agents without editing NewAgents.ts.

---

### Session: Hardcore Agent Fleet Retraining (2026-07-08)

#### api/search.js — v2.0 Complete Rewrite
- **ADDED** `INDIA_CITY_FEEDS` — 14 Indian cities each with Google News RSS feed (chandigarh, delhi, mumbai, bangalore, etc.)
- **ADDED** `TOPIC_RSS_FEEDS` — 15 curated RSS feeds by topic (tech, AI, sports, cricket, market, etc.)
- **ADDED** `parseRss(xml, limit)` helper — unified RSS/Atom parser
- **ADDED** Source 1: City-specific Google News RSS — highest priority for city queries
- **ADDED** Source 3: `news.google.com/rss/search` — works for ANY topic without API key. Most reliable fallback.
- **CHANGED** Source chain: City RSS → DDG → Google News RSS → Topic RSS → Legacy India RSS → Bing

#### src/agent/fleet/NewAgents.ts — MERCURY + GAINS Full Retrain
- **REWRITTEN** `WEB_SYSTEM` (MERCURY): Multi-query strategy, 8 proactive patterns, structured MERCURY INTELLIGENCE REPORT output, city news routing, anti-hallucination with retry
- **REWRITTEN** `GYM_SYSTEM` (GAINS): Calls `query_internal_app_data("todayGym")` FIRST, 5 proactive patterns, workout brief table format, overtraining check

#### src/agent/orchestration/supervisorPrompt.ts — Major Upgrade
- **ADDED** PATTERN A: Gym schedule → NAVIGATOR + GAINS + AEGIS chain
- **ADDED** PATTERN B: News/city → MERCURY + AEGIS chain
- **ADDED** PATTERN C/D: Web research / App+Web combo chains
- **ADDED** 3 CRITICAL footer rules: MERCURY for news/search, gym → NAVIGATOR+GAINS+AEGIS

#### src/agent/orchestration/dagExecutor.ts — Cross-Agent History Injection
- **ADDED** `buildPriorAgentIntelligence(engine, currentAgentRole)` — injects `## 🧠 PRIOR AGENT INTELLIGENCE` block into every downstream agent's prompt (structured: agent, summary, key findings)
- **ADDED** Voice narration phrases for MERCURY, GAINS, NAVIGATOR, TITAN, ATLAS, ENIGMA, ARGUS, SPECTRE
- **REMOVED** Phantom agent phrases (NEXUS, SENTINEL, EMBER, FLUX, AXIOM, COUNT)

#### src/agent/orchestration/intentClassifier.ts — CHITCHAT Fix
- **ADDED** `DEFINITIVE CHITCHAT LIST` (greetings/small talk only) + `ALWAYS ACTIONABLE` list (news/search/gym/app data — never chitchat)
- **ADDED** Explicit: city/news/current events = ACTIONABLE (fixes Chandigarh news being chitchat)

#### src/agent/orchestration/fastRouter.ts — Pattern Expansion
- **ADDED** Gym schedule fast-route: NAVIGATOR + GAINS + AEGIS 3-agent DAG
- **ADDED** City news fast-route: MERCURY + AEGIS (14 Indian cities)
- **ADDED** General news, web search, research/URL fast-routes → MERCURY
- **CHANGED** Word-count guard: exempts research/news queries from 20-word limit

#### src/agent/runAgentLoop.ts — Whitelist Updates
- **ADDED** `query_internal_app_data` to GAINS whitelist (reads todayGym plan)
- **REMOVED** `delegate_task` from MERCURY (MERCURY searches directly)

---

### Session: Audit Remediation (2026-07-08)

#### Deleted Files
- `public/sun.png` (932 KB) — unreferenced
- `public/burning-sun.png` (888 KB) — unreferenced
- `public/jarvis-hud.png` (884 KB) — unreferenced
- `public/moon-hq.png` (826 KB) — unreferenced
- `public/earth-hq.png` (863 KB) — unreferenced
- `public/logo_transparent.png` (258 KB) — unreferenced
- `src/data/wisdomVideos.ts` (15.6 KB) — orphaned, zero imports

**Total reclaimed: ~4.7 MB from CDN bandwidth per deployment. PWA precache: 148 entries → 142 entries.**

> NOTE: `public/ambient.webm` (67 MB) and `public/bg-video.mp4` (13.5 MB) still need CDN migration. Not done — requires CDN config setup.

#### src/agent/tools/system.executor.ts — BUG-001 Fix
- **FIXED** `execute_system_task` case: no longer unconditionally fetches `http://localhost:8000/chat` in production
- **ADDED** Production guard: returns user-friendly error if `VITE_JARVIS_URL` not set and `import.meta.env.PROD` is true
- **ADDED** `VITE_JARVIS_URL` env var support — set this in Vercel dashboard to point at a deployed JARVIS instance

#### src/agent/toolDeclarations.ts — 4.4 Fix
- **REMOVED** duplicate `schedule_google_meet` tool declaration (was identical to `create_google_meet`)
- Executor alias in `meet.executor.ts` preserved — `schedule_google_meet` still works if a model picks it

#### src/features/learning/LearningChecklistModule.tsx — BUG-002 Partial Fix
- **FIXED** `handleSaveVideoNote` Firestore catch: now logs `console.error` (was silent)
- **FIXED** `handleTogglePin` Firestore catch: now logs `console.error` (was silent)

---

## 12. Known Technical Debt (Deliberately Deferred)

These items are known issues from the July 2026 audit. They are tracked here to prevent future agents from being surprised:

| Issue | Severity | Why Deferred |
|---|---|---|
| `ambient.webm` (67 MB) + `bg-video.mp4` (13.5 MB) in `public/` | High | Requires CDN setup; architectural decision |
| Component decomposition (NotesModule 1498L, LearningChecklistModule 1312L, etc.) | Medium | Requires full UI regression testing; high breakage risk |
| CSS class conflicts (`.btn-primary`, `.card`, `.glass-card` in multiple files) | Medium | Requires visual regression testing |
| 471 `any` casts across 35 files | Medium | Requires full domain type knowledge; tactical improvement |
| BUG-006: `auto_reschedule` approval gate returns before user confirms | Medium | Complex state machine; needs dedicated fix session |
| BUG-007: Accountability partner email in voice-only sessions | Medium | Needs voice-safe confirmation UX pattern |
| `GeminiLiveClient.ts` — WebSocket errors silent in production | Low | No Sentry integration for WS; needs SDK setup |
| `console.log` in 24 production files | Low | Needs structured logging layer |
| `runAgentLoop.ts` deprecated `apiKey` parameter (12+ call sites) | Low | Safe to remove; just cleanup work |
| `src/features/agent/` directory | Low | Now empty — 3 orphaned files deleted. Safe to delete the folder itself via git. |
| `Sidebar.tsx` (29KB) | Low | Not imported in App.tsx. CSS references exist in styles. Safe to delete but confirm visually first. |

> If you are an AI agent reading this: do NOT attempt to fix the component decomposition items or CSS conflicts without explicit user approval. These are large-scale refactors, not quick fixes.

---

## 15. Changelog — Session: Architecture Hardening ARCH-001..005 (2026-07-09)

### ARCH-001 — `src/services/gemini/core.ts` + `src/agent/orchestration/dagExecutor.ts` (HIGH — Background Tab Timer Throttling)
- **ADDED** `visibilityAwareSleep(ms, signal)` — uses `performance.now()` to detect Chrome tab-throttling drift. If a `sleep(200ms)` wakes 2000ms later (drift > 1500ms), emits an `agent-log` warning and returns without double-waiting.
- **ADDED** `visibilitychange` listener at module scope — when the tab is shown again after >5s hidden, emits an `agent-log` informational notice ("Tab was hidden for Xs").
- **ADDED** Tab-backgrounded guard in `executeDag()` — if `document.hidden` at DAG start, emits an immediate warning to the terminal feed.
- **WHY**: Chrome throttles `setTimeout` in background tabs to ~1Hz. Agents waiting in the semaphore queue or cooldown wait could stall for 60s instead of 200ms when tab is hidden.

### ARCH-002 — `src/agent/tools/shared.ts` + `src/agent/runAgentLoop.ts` (MEDIUM — Typed Tool Results)
- **ADDED** `truncated?: boolean` field to `ToolResult` type.
- **ADDED** `safeToolResultString(toolName, result)` — serializes tool output with explicit `TOOL_RESULT: ... END_TOOL_RESULT` delimiters. Caps `data` at 6000 chars, sets `DATA_TRUNCATED: true` if exceeded.
- **CHANGED** `runAgentLoop.ts` function response parts: now uses `safeToolResultString()` instead of raw `{ result: result.data, message: result.message }`. Agents receive a structured, always-parseable block.
- **WHY**: Large tool results (e.g. 200 emails) could be truncated mid-JSON by the SDK, giving agents a broken string they couldn't parse from their own conversation history.

### ARCH-003 — `src/services/gemini/core.ts` (HIGH — Dead Key Circuit Breaker)
- **ADDED** `_keyConsecutiveFailures: Map<string, number>` — tracks consecutive non-429, non-auth failures per key.
- **ADDED** `_deadKeys: Set<string>` — permanently excluded keys until app restart.
- **ADDED** `recordKeyFailure(token)` — increments counter; marks DEAD after 3 consecutive failures. Emits console.warn + `agent-log` on DEAD.
- **ADDED** `resetKeyFailures(token)` — called on every successful request to reset the counter.
- **ADDED** `getDeadKeys()` — exported diagnostic helper for settings UI.
- **CHANGED** `isKeyAvailable()` — now checks `_deadKeys` first before cooldown/RPM checks.
- **CHANGED** `_callWithFallbackInner` catch block — 503/overload now calls `recordKeyFailure()`; unknown errors call `recordKeyFailure()` and rotate to next key instead of immediately throwing.
- **WHY**: A key returning consistent HTTP 500 errors stayed in the pool and added 1-2s retry penalty on every mission.

### ARCH-004 — `src/agent/orchestrator.ts` (HIGH — Immutable appContext Guard)
- **ADDED** `const frozenContext = Object.freeze({ ...appContext })` at top of `orchestrateAgent()` — shallow clone + freeze before dispatch to all downstream agents.
- **CHANGED** All `appContext` references inside `orchestrateAgent()` → `frozenContext` (executeDag, missionCache, userLearningStore.initialize).
- **WHY**: appContext was passed by mutable reference through the entire agent pipeline. Any tool executor could write `appContext.tasks = []` and corrupt state for all downstream agents with no error.

### ARCH-005 — `src/agent/orchestrator.ts` (HIGH — Google Token Pre-flight Check)
- **ADDED** `GOOGLE_AUTH_AGENTS = new Set(['HERMES','CHRONOS','MEET','ARCHIVE','SCRIBE'])` — agents requiring Google OAuth.
- **ADDED** Pre-flight check in both fast-route path and supervisor DAG path: if any task uses a Google-auth agent, `requireGoogleAuth()` is called once before any agent is dispatched.
- **CHANGED** Early return on auth failure — returns user-friendly "Please connect Google Workspace" message immediately without firing any Gemini API calls.
- **WHY**: Each Google-auth agent was independently calling `requireGoogleAuth()` on first tool use. An expired token caused 3-4 agent Gemini startup calls before the user was told to reconnect.

*TypeScript check after all fixes: `npx tsc --noEmit` → 0 errors.*

---

## 13. Changelog — Session: Cleanup + API Bug Fixes (2026-07-09)

### BUG FIX — api/gemini-proxy-stream.js (CRITICAL)
- **FIXED** `tools` and `toolConfig` were NOT being destructured from `req.body` and NOT being forwarded to Gemini.
- **IMPACT**: All streaming Gemini calls (used by `LectureChatPanel.tsx` and any future streaming feature) were silently running in text-only mode — agents could never call any tool function through the streaming endpoint.
- **FIX**: Added `tools` and `toolConfig` to destructuring (lines 152-153) and added forwarding conditionals (lines 171-172). Now identical to `gemini-proxy.js` behavior.

### BUG FIX — api/gemini-proxy.js (Sarvam TTS, MEDIUM)
- **FIXED** Server-side TTS proxy was hardcoded to `target_language_code: 'hi-IN'` and `pace: 1.1`.
- **IMPACT**: English responses spoken via server proxy were pronounced with Hindi phonemes.
- **FIX**: Added Devanagari ratio detection (>15% → `hi-IN`, else `en-IN`). Pace set to `1.0`. Now matches client-side `sarvam.ts` behavior.

### BUG FIX — src/features/academic/AttendanceModule.tsx (UI Scrolling)
- **FIXED** Timetable and History modals could not be scrolled independently from the page background.
- **FIXED** Delete, Export CSV, and Reset Semester buttons did not respond because modal overlays had z-index 100, but ConfirmDialog had z-index 9999 — modal backdrop was intercepting clicks on the buttons inside.
- **FIX 1**: Wrapped both modals in `createPortal(…, document.body)` — moves them out of the page's scroll/stacking context entirely.
- **FIX 2**: Raised modal z-index to 99999. Raised ConfirmDialog z-index to 999999.
- **FIX 3**: Added `onWheel={e => e.stopPropagation()}` on modal backdrop to completely trap scroll.

### BUG FIX — src/styles/mobile.css (Content Cutoff)
- **FIXED** Content on Attendance, Assignments, Goals, and other pages was hidden behind the bottom navigation dock.
- **FIX**: Added `padding-bottom: 120px` to `.page-pad` globally; `100px` in mobile breakpoints. All page modules now scroll fully clear of the dock.

### BUG FIX — src/features/learning/TopicCard.tsx + LearningChecklistModule.tsx (Checkbox Sync)
- **FIXED** Learning subtask checkboxes played a sound but did not visually check.
- **ROOT CAUSE**: Data model had two competing completion fields: boolean `isCompleted` and string `status === 'completed'`. The UI was reading one but the toggle was only writing the other.
- **FIX**: `toggleSubTask` now writes BOTH fields simultaneously. UI rendering checks `isCompleted || status === 'completed'` for backward compatibility with existing Firestore records.

### DELETED FILES (Orphaned — zero callers)
| File | Size | Reason |
|---|---|---|
| `src/features/agent/AgentVisualization.tsx` | 13.4 KB | Not imported anywhere in the codebase |
| `src/features/agent/ApiKeyManager.tsx` | 8.5 KB | Not imported anywhere in the codebase |
| `src/features/agent/ZenAgentPanel.css` | 23.5 KB | Only referenced by the two deleted files above |

**Total reclaimed: ~45 KB from bundle.**

### COMPONENTS WITH ACTIVE CALLERS (NOT deleted — confirmed in use)
| Component | Caller |
|---|---|
| `SolarSystemLoader.tsx` | `App.tsx` — used in `DataReadyGate` and initial solar loader |
| `BackgroundEffects.tsx` | `App.tsx` — renders behind app shell |
| `BottomHeader.tsx` | `App.tsx` — global bottom navigation dock |
| `FloatingDock.tsx` | `BottomHeader.tsx` |
| `MobileAppDrawer.tsx` | `BottomNav.tsx` |
| `LandingAnimations.tsx` | `Landing.tsx` + `OnboardingCarousel.tsx` |
| `Sidebar.tsx` | **NOT in App.tsx** — only CSS references. Flagged as technical debt. |

---

## 4. Event Bus (CustomEvents)
Your app heavily relies on an event-driven architecture (`window.dispatchEvent`) for decoupled UI updates.
- `agent-log`: `{ type: 'thinking' | 'tool' | 'result', title: string, streaming?: boolean, source?: 'user' }` — Streams text/progress to `TerminalFeed` and `AgentDataStream`.
- `zen-focus-lock`: `{ active: boolean, until: string, taskName: string }` — Triggers the `FocusLockOverlay` panel.
- `agent-approval-request`: `{ toolName: string, summary: string, id: string }` — Shows the 3.5s non-blocking undo toast in `AgentApprovalToastListener`.
- `agent-navigate`: `{ route: string }` — Handled by `AgentNavigator` in `App.tsx` to change routes.
- `show-mission-report`: `{ report: string, type?: string }` — Opens the full-screen `MissionReport` overlay.
- `show-agent-history`: `undefined` — Opens the `AgentHistoryPanel` slide-out.
- `conflicts-detected`: `{ conflicts: any[] }` — Updates the `ConflictCard` dashboard widget.
- `gym-log-updated`: `undefined` — Forces a re-render/refetch in `GymModule`.
- `zen-snooze-intervention`: `{ taskId, taskTitle, snoozeCount, options }` — Opens procrastination intervention modal.

---

## 5. Core Data Schemas (The "Big 3")
These are the shapes of the most frequently mutated Firestore documents. Do not guess their fields.

**Task (Firestore `todos`)**
- `id`: string
- `title` / `text`: string
- `status`: 'pending' | 'running' | 'completed' | 'failed'
- `date`: string (YYYY-MM-DD format)
- `priority`: 'low' | 'medium' | 'high'
- `snoozeCount` (optional): number
- `estimatedMinutes` (optional): number

**Agent Action Log (Firestore `agent_actions/{uid}/logs`)**
- `toolName`: string
- `args`: object (sanitized)
- `result`: `{ success: boolean, message: string }`
- `timestamp`: number (unix ms)
- `sessionId`: string

**User Behavior Profile (Firestore `user_profiles`)**
- `userPersona`: string
- `actualPeakHours`: `{ start: number, end: number }[]`
- `avgCompletionRatio`: number
- `rescheduleRate`: number

---

## 6. Execution Critical Paths
How logic flows through the system.

**Agent Execution Pipeline:**
1. UI fires `agent-shortcut` CustomEvent (or user speaks).
2. `HomeDashboard` calls `orchestrateAgent(prompt)`.
3. `orchestrateAgent` checks `fastRouter` for regex match (skip LLM).
4. If no regex match, calls `classifyIntent` (is it chitchat?).
5. If actionable, calls Supervisor LLM to build a `DagTask[]` list.
6. Calls `executeDag(tasks)`.
7. `executeDag` runs `runAgentLoop()` in parallel for ready tasks.
8. `runAgentLoop` iteratively loops Gemini → `toolExecutor` → Gemini.
9. Final `AEGIS` synthesis agent runs and returns final markdown string.

**Voice Pipeline:**
1. Microphone → `VoiceContext` (Chrome SpeechRecognition STT).
2. Text routed to `orchestrateAgent`.
3. Agent emits text chunks via `agent-log`.
4. `runAgentLoop` completes.
5. Final text passed to `GaplessPlayer` and `sarvam.ts` (TTS Base64).
6. Audio plays automatically.

---

## 7. Architecture Rules: Where does it go?
When adding new functionality, follow this placement rubric strictly:
- **New UI Page:** Add to `/src/features/[domain]/`. It must be lazy-loaded in `App.tsx`.
- **New Agent Tool:** Add to `/src/agent/tools/[domain].executor.ts` and register in `toolExecutor.ts` and `toolDeclarations.ts`.
- **New Global State:** DO NOT use Redux. If it maps to a database collection, add it to `GlobalDataContext.tsx`. If it's UI state (like panic mode), use local component state or a lightweight zustand/Context store in `/src/stores/`.
- **New Server Logic (Rate limiting, API proxies, Webhooks):** Add to `/api/` as a Vercel serverless function. NEVER put secret keys in the client bundle.

---

## 8. State Authority
- **Firestore is the Source of Truth:** Do not hold local React state arrays for tasks, habits, goals, etc. Write directly to Firestore via `services/` (or agent tools) and let `GlobalDataContext` stream the real-time snapshot down to the UI automatically.
- **Google Calendar is the Exception:** Calendar events are NOT stored in Firestore to prevent duplication and drift. They are fetched live via `pollGoogleCalendarChanges()` in `GlobalDataContext`. Do not attempt to sync calendar events to Firestore.

---

## 9. Changelog — Session: 17 Bug Fixes (Agentic System Audit) 2026-07-09

### BUG-001 — `VoiceContext.tsx` (CRITICAL — ReferenceError crash)
- **ROOT CAUSE**: `speakWithBrowserTTS()` was called in the TTS queue processor fallback but the function was intentionally removed earlier (OS voice was too ugly). The call site was not cleaned up.
- **IMPACT**: When Sarvam AND proxy both fail, the entire TTS pipeline crashes with `ReferenceError: speakWithBrowserTTS is not defined`.
- **FIX**: Replaced the call with a `console.warn` + silent skip. Text still renders visually in the UI.

### BUG-002 — `runAgentLoop.ts` (CRITICAL — AEGIS always uses wrong model)
- **ROOT CAUSE**: Line 212 referenced `messages.length` but `messages` does not exist in this scope. The conversation array is named `contents`.
- **IMPACT**: The `agentRole === 'AEGIS' && messages.length > 5` check ALWAYS threw `ReferenceError`, causing AEGIS to always fall through to `callWithVoiceModel` (flash-lite) instead of `callWithResearchModel` for deep missions.
- **FIX**: Changed `messages.length` → `contents.length`.

### BUG-003 — `dagExecutor.ts` (CRITICAL — infinite API retry)
- **ROOT CAUSE**: `let _agentRetryCount = 0` was declared *inside* `executeTask()`. The outer while loop re-calls `executeTask` for the same task after a 429 retry. Each call reset the counter to 0, so `MAX_AGENT_RETRIES = 2` was never enforced.
- **IMPACT**: A rate-limited agent could retry indefinitely, burning API quota.
- **FIX**: Moved retry tracking to `taskRetryCountMap = new Map<string, number>()` in the outer scope. On retry, `taskRetryCountMap.set(task.id, _agentRetryCount)` persists the count. Next call reads it with `taskRetryCountMap.get(task.id) ?? 0`.

### BUG-004 — `system.executor.ts` (CRITICAL — Google auth tool broken)
- **ROOT CAUSE**: `isSignedInToGoogle()` and `forceSilentRefresh()` were used in `connect_google_workspace` case but never imported. They ARE imported in `shared.ts` but not re-exported to executor files.
- **IMPACT**: Every call to `connect_google_workspace` threw `ReferenceError` — the entire Google Workspace connection flow was broken.
- **FIX**: Added `import { isSignedInToGoogle, forceSilentRefresh } from '../../services/googleCalendar';` to `system.executor.ts`.

### BUG-005 — `MissionCache.ts` (CRITICAL — stale answers after task completion)
- **ROOT CAUSE**: `computeDataVersion` only tracked item counts (`t${tasks}c${events}n${notes}h${habits}`). Completing a task doesn't change the count — only `task.status`. Cache served stale answers for 30s.
- **FIX**: Version string now includes: completed task count (`x${completedTasks}`), last task's `updatedAt.seconds` (`u${lastTaskUpdate}`), and goals count (`g${goals}`). Cache now invalidates immediately after any task state change.

### BUG-006 — `agentPrompts.ts` + `runAgentLoop.ts` (HIGH — PROMETHEUS hallucination machine)
- **ROOT CAUSE**: `PROMETHEUS` appeared in `dagExecutor.ts` narration dictionary (implying it was a planned agent) but had no entry in `AGENT_TOOL_WHITELIST` and no case in `getAgentPromptByRole()`. If assigned, it received ALL 40+ tools and fell through to `QA_SYSTEM` (AEGIS's synthesis prompt).
- **FIX**: Added `PROMETHEUS` to `AGENT_TOOL_WHITELIST` with a restricted strategic planning tool set. Added `case 'PROMETHEUS': return PLANNER_SYSTEM;` in `agentPrompts.ts`.

### BUG-007 — `shared.ts` (Note: already auto-approves)
- **STATUS**: Upon investigation, `requestApproval` in `shared.ts` returns `Promise.resolve(true)` always (user previously requested all confirmations be auto-approved). BUG-007 is therefore N/A in the current build.

### BUG-008 — `system.executor.ts` (HIGH — SSR ReferenceError)
- **ROOT CAUSE**: `window.dispatchEvent(...)` called in `panic_mode` and `focus_lock` cases without `typeof window !== 'undefined'` guard. All other dispatches in the codebase have this guard.
- **FIX**: Wrapped both dispatch calls in `if (typeof window !== 'undefined')` guards.

### BUG-009 — `fastRouter.ts` (HIGH — international news not routed)
- **ROOT CAUSE**: `cityPattern` regex only matched a hardcoded list of 13 Indian cities. Queries like "what's happening in London" or "Paris news today" failed the pattern → hit the 20-word guard → returned null → fell to expensive full LLM path.
- **FIX**: Added generic location detection using `text.match(/\b(in|at|from)\s+([a-z][a-z\s]{2,20})/i)`. Any "news|happening|going on|latest" query combined with a location now fast-routes to MERCURY → AEGIS.

### BUG-010 — `orchestrator.ts` (MEDIUM — JSON corruption from history)
- **ROOT CAUSE**: Conversation history was concatenated raw into the supervisor prompt string. User messages containing backticks, curly braces, or double quotes would corrupt the `responseMimeType="application/json"` structured output parsing.
- **FIX**: Added `safeHistoryContext` sanitization — replaces `{`, `}`, `"`, `` ` `` with safe equivalents before embedding in the prompt.

### BUG-011 — `dagExecutor.ts` (MEDIUM — AEGIS stale refresh crashes silently)
- **ROOT CAUSE**: Stale context refresh did `executeTask({ ...searchTask, id: searchTask.id + '_refresh' })`. This new ID was never added to `engine.tasks`, so `engine.updateTaskStatus('oracle_1_refresh', ...)` threw. `contextBuiltAt` was still updated, hiding the failure.
- **FIX**: Replaced the `executeTask` approach with a direct `runAgentLoop()` call for ORACLE refresh. The result is stored back via `engine.updateTaskStatus(oracleTask.id, ...)` using the ORIGINAL task ID. Wrapped in try/catch — failure is now non-fatal (logged, not thrown).

### BUG-012 — `api/transcript.js` (MEDIUM — wrong timestamps)
- **ROOT CAUSE**: `item.offset / 1000` assumed milliseconds. Some versions of `youtube-transcript` return seconds. If seconds, timestamps would all show near 0.
- **FIX**: Auto-detects unit: if `firstOffset > 10000`, treats as milliseconds (divides by 1000). Otherwise treats as seconds (floor only). Falls back to ms-assumption for safety.

### BUG-013 — `VoiceContext.tsx` (MEDIUM — double-tap)
- **STATUS**: Already guarded. `startConversation` has `if (isConvActiveRef.current) return;` at line 799 preventing double-start. BUG-013 is N/A.

### BUG-014 — `dagExecutor.ts` (MEDIUM — 80-char instruction truncation)
- **ROOT CAUSE**: `buildPriorAgentIntelligence` truncated task instructions at 80 chars in the intelligence context passed to AEGIS and downstream agents.
- **FIX**: Changed truncation to 200 chars. Also conditionalized the `...` suffix — only appended if the instruction actually exceeds 200 chars.

### BUG-015 — `runAgentLoop.ts` (MEDIUM — notes cache stale after create)
- **ROOT CAUSE**: Cache invalidation logic checked tool names for `task`, `calendar`, `gmail`. `create_note` and `write_google_doc` were not covered — so `search_notes` would return stale (pre-creation) results in the same mission.
- **FIX**: Added invalidation for `create_note` and `write_google_doc` — clears all `search_notes:*` and `get_notes:*` cache entries.

### BUG-016 — `intentClassifier.ts` (MEDIUM — wrong model tier)
- **ROOT CAUSE**: `callWithFallbackUnthrottled` (full Flash model) was used for intent classification — a simple 3-way JSON classification task. This costs 3-5x more tokens and competes with the supervisor call for the same Gemini key pool, potentially causing both to 429 simultaneously.
- **FIX**: Changed to `callWithVoiceModel` (flash-lite). Same classification quality, fraction of the cost.

### BUG-017 — `runAgentLoop.ts` + `agentPrompts.ts` (LOW — SPOKEN_SUMMARY double-emit)
- **ROOT CAUSE**: `VOICE_SPEECH_RULES` is appended to every agent prompt via `getAgentPromptByRole()`. The `effectiveSystem` suffix in `runAgentLoop.ts` also had a `CRITICAL FINAL OUTPUT RULE: ...SPOKEN_SUMMARY:...` directive. AEGIS received the instruction twice.
- **IMPACT**: AEGIS sometimes emitted two `SPOKEN_SUMMARY:` blocks. The TTS pipeline extracts the FIRST match — if the LLM put the better summary in the second block, the wrong content was spoken.
- **FIX**: Removed `CRITICAL FINAL OUTPUT RULE` from the `effectiveSystem` suffix in `runAgentLoop.ts`. SPOKEN_SUMMARY instruction is now authoritative only in agent system prompts via `VOICE_SPEECH_RULES`.

### PERF-003 — `dagExecutor.ts` (MEDIUM — object recreation in hot loop)
- **ROOT CAUSE**: `AGENT_START_PHRASES` dictionary (100+ lines) was re-declared inside the `while (!engine.isComplete())` loop body, creating a new object on every iteration. Similarly, `dispatchAgentVoice` was a new closure every iteration.
- **FIX**: Both `AGENT_START_PHRASES` and `dispatchAgentVoice` moved to module scope, declared once before the loop.

---

*TypeScript check after all fixes: `npx tsc --noEmit` → 0 errors.*

