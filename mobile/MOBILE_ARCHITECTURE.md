# ZenTrack Mobile — Machine-Navigable Architecture Report

> **MANDATORY FIRST ACTION FOR ALL AI AGENTS**: Before ANY other action on the mobile codebase, read this file. This is the single source of truth. Use the Function & File Encyclopedia in Section 4 to jump directly to any function, hook, component, or service without searching or scanning the codebase.
>
> **KEYWORD TRIGGERS**: Any mention of "mobile app", "Expo", "React Native", "Sara on mobile", "mobile notification", "mobile screen", "mobile agent", "orchestrator.ts (mobile)" → read this file first.
>
> **UPDATE PROTOCOL**: Any time mobile code changes — update the relevant section of this document in the same session.

---

## 1. Executive Overview & Core Principles

- **App Name**: ZenTrack Mobile
- **Platform**: React Native (Expo SDK ~54.0.36, Hermes Engine) — iOS + Android
- **Language**: TypeScript ~5.9.2
- **Package Manager**: npm
- **Entry Point**: `mobile/index.ts` → `mobile/App.tsx`
- **Dev Command**: `npm start` (from `mobile/` directory, runs `expo start -c`)
- **Full Workspace Path**: `zentrack-vibe2ship/mobile/`

### Architectural Pillars
1. **Direct Gemini AI Engine (Zero Cold Start)**: SARA AI runs on-device orchestration via `callProxy()` in `src/services/geminiProxy.ts` with direct Gemini REST API calls using an autonomous 9-key round-robin rotation pool. Zero server cold starts, 1–2 second streaming responses.
2. **WhatsApp-Grade Offline-First Resilience**: All Firestore writes route through `safeWrite()` and an AsyncStorage-backed write queue (`@zentrack_offline_write_queue`) with Last-Write-Wins (LWW) conflict resolution. Data is never lost offline, survives app force-kills, and syncs atomically on reconnect.
3. **0ms Stale-While-Revalidate Boot**: Consolidated Root Boot Manifest (`loadBootManifest()`) loads all critical auth, route, layout, and domain caches in a single native C++ bridge call.
4. **Domain-Isolated Context Pipeline**: Root data is split across 5 domain providers (`CoreDataContext`, `WellnessContext`, `AcademicContext`, `CreativeContext`, `PlannerContext`). Snapshot updates re-render only the affected domain consumers.
5. **Self-Healing Background Auth**: Proactive Firestore channel reconnection (`firestore_force_reconnect`), fatal auth error routing, and an 8-second dead-session recovery window ensure seamless background recovery without silent data drops.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ZenTrack Mobile Runtime                         │
├────────────────────────────────────────────────────────────────────────┤
│  App Entry (index.ts → App.tsx)                                        │
│   ├── Fonts & Splash Screen Guard (preventAutoHideAsync)               │
│   ├── Root Providers: GestureHandler → SafeArea → ErrorBoundary        │
│   │   └── ThemeProvider (Dark/Light) → PortalProvider                  │
│   │       └── MobileDataProvider (5 Domain Providers)                  │
│   │           └── AppNavigator (Auth Gate + 0ms Boot Manifest)         │
├────────────────────────────────────────────────────────────────────────┤
│  SARA Engine v2                                                        │
│   Intent Classifier → Orchestrator → 9-Key Gemini Proxy → Action Gate  │
├────────────────────────────────────────────────────────────────────────┤
│  Data Layer                                                            │
│   AsyncStorage L1/L2 Cache ◄── safeWrite() ──► Firestore (18 Colls)    │
│                                     │                                  │
│                               Offline Queue                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Verified Package Versions (`package.json`)

### Core & Runtime Dependencies
| Package | Version | Purpose |
|---|---|---|
| `expo` | `~54.0.36` | Core Expo Framework |
| `react` | `19.1.0` | React Library |
| `react-native` | `0.81.5` | React Native Framework |
| `typescript` | `~5.9.2` | TypeScript Compiler |
| `firebase` | `^12.15.0` | Firebase Client SDK (Auth + Firestore) |
| `@react-native-async-storage/async-storage` | `2.2.0` | Persistent Key-Value Storage |
| `@react-native-community/netinfo` | `11.4.1` | Network Status & Offline Detection |
| `@react-native-community/datetimepicker` | `8.4.4` | Native Date & Time Pickers |
| `@react-native-google-signin/google-signin` | `^16.1.2` | Native Google Authentication |
| `@shopify/flash-list` | `2.0.2` | High-Performance Virtualized Lists |
| `react-native-reanimated` | `4.1.1` | Worklet-Based UI Thread Animations (Pinned) |
| `react-native-worklets` | `^0.5.1` | Reanimated Runtime Engine (Pinned) |
| `react-native-gesture-handler` | `~2.28.0` | Gesture Recognition & Native Touch |
| `react-native-screens` | `~4.16.0` | Native Screen Containers |
| `react-native-safe-area-context` | `~5.6.0` | Device Notch & Inset Handler |
| `react-native-svg` | `15.12.1` | Vector Graphics & Chart Renders |
| `expo-notifications` | `~0.32.17` | Local & Push Notification Scheduling |
| `expo-av` | `~16.0.8` | Audio Recording & Audio Playback |
| `expo-speech` | `~14.0.8` | Native Device Text-to-Speech Fallback |
| `expo-file-system` | `~19.0.23` | Local Audio/Document File IO |
| `expo-haptics` | `~15.0.8` | Tactical Haptic Feedback |
| `expo-blur` | `~15.0.8` | Frosted Glass BlurView |
| `expo-linear-gradient` | `~15.0.8` | UI Gradient Layers |
| `expo-local-authentication` | `~17.0.8` | Biometric FaceID/Fingerprint Auth |
| `expo-document-picker` | `~14.0.8` | File & PDF Selection |
| `expo-print` | `~15.0.8` | HTML to PDF Generation |
| `expo-sharing` | `~14.0.8` | Native OS Share Sheet |
| `expo-crypto` | `~15.0.9` | Cryptographic Utilities & UUIDs |
| `expo-web-browser` | `~15.0.11` | In-App Browser Modals |
| `expo-auth-session` | `~7.0.11` | OAuth Session Coordinator |
| `expo-apple-authentication` | `~8.0.8` | Apple Sign-In (iOS) |
| `expo-font` | `~14.0.12` | Custom Typography Loader |
| `@expo-google-fonts/inter` | `^0.4.2` | Inter Font Family (400, 500, 600, 700) |
| `@expo-google-fonts/playfair-display` | `^0.4.2` | Playfair Display Font (600) |
| `react-native-calendars` | `^1.1314.0` | Calendar Grid Engine |
| `react-native-markdown-display` | `^7.0.2` | Markdown Renderer for AI Chat |
| `react-native-webview` | `13.15.0` | Embedded Web Content & Demos |
| `react-native-youtube-iframe` | `^2.4.1` | YouTube Video Player Bridge |
| `react-native-confetti-cannon` | `^1.5.2` | Milestone Confetti Particle Emitter |
| `react-native-view-shot` | `4.0.3` | View Snapshot Image Capture |
| `react-native-syntax-highlighter` | `^2.1.0` | Code Block Syntax Formatter |
| `xlsx` | `^0.18.5` | Excel Timetable & Attendance Parser |

### Version Overrides (in `package.json`)
```json
"overrides": {
  "react-native-reanimated": "4.1.1",
  "react-native-worklets": "0.5.1"
}
```

---

## 3. Directory & Folder Map

```
mobile/
├── index.ts                              # AppRegistry Entry Point
├── App.tsx                               # Root App: Fonts, Providers, Splash, Sync setup
├── app.json                              # Expo Application Config & Permissions
├── package.json                          # Pinned Runtime & Dev Dependencies
├── tsconfig.json                         # TypeScript Project Settings
├── .env                                  # Environment Secrets & Public API Keys
├── plugins/
│   └── withAndroidManifestMod.js         # Custom Expo Config Plugin (Android Manifest)
└── src/
    ├── agent/                            # SARA AI Engine v2 Pipeline
    │   ├── orchestrator.ts               # SARA Orchestrator (CMG+IRCI+BFE+Cap4+Cap6)
    │   ├── intentClassifier.ts           # IRCI: Intent Ranking & Context Pruning (<5ms)
    │   ├── dagExecutor.ts                # Parallel DAG Task Executor
    │   └── saraAgent.ts                  # GYM-GPT Coach & Action Parser
    ├── components/                       # Domain Component Library
    │   ├── Academic/                     # Attendance, Timetable & Predictor Modals
    │   ├── Analytics/                    # Academic & Productivity Predictors
    │   ├── Calendar/                     # Event Modal, Week Pager & Agenda Strips
    │   ├── Dashboard/                    # Life Ring, Agenda, Vitality, QuickCapture Sheets
    │   ├── Gym/                          # Set Loggers, Rest Timers, GYM-GPT FAB/Modal, Heatmaps
    │   │   └── Charts/                   # Muscle Donut, Consistency, Volume & PR Charts
    │   ├── Habits/                       # Habit Reminder & Streak Modals
    │   ├── Learning/                     # Video Player, Flashcards, VSCode Highlighting, MindMaps
    │   ├── Navigation/                   # Telegram-Style Floating Glass Tab Bar
    │   ├── PlacementHub/                 # LeetCode Tracker, DSA Heatmap, Pattern Vault, Panic Modal
    │   ├── SARA/                         # Voice Orb, Bubbles, Action Confirmation, Reasoning Feed
    │   ├── Tasks/                        # Task Rows, Timeline, Matrix, Kanban, Pomodoro Sheets
    │   ├── ui/                           # BottomSheet, FloatingActionButton, GlassCard, EmptyState
    │   ├── AnimatedPressable.tsx         # Haptic-Enabled Animated Touch Wrapper
    │   ├── ErrorBoundary.tsx             # Crash Guard with Auto-Recovery & Diagnostic Log
    │   ├── NotificationPreferencesComponent.tsx # In-App Notification Configuration
    │   ├── OfflineIndicator.tsx          # Real-Time Sync Status Toast & Pending Counter
    │   ├── UniversalCalendarModal.tsx    # Global Multi-Mode Date Picker
    │   └── UpdateBanner.tsx              # OTA Bundle Update Notification Bar
    ├── config/
    │   ├── constants.ts                  # Endpoints, Collections, Storage Keys, Screen Names
    │   └── saraActionPolicy.ts           # 3-Tier Confidence-Gated Autonomous Action Gateway
    ├── contexts/
    │   ├── MobileDataContext.tsx         # Backward-Compatible Facade Provider & Unified Hook
    │   ├── ThemeContext.tsx              # Dynamic Theme Engine (Obsidian Cosmos / Frost Quartz)
    │   ├── PortalContext.tsx             # Root Modal Portal Coordinator
    │   └── domains/                      # Domain-Split Data Contexts
    │       ├── CoreDataContext.tsx       # Tasks, Habits, HabitLogs, Auth, Optimistic Handlers
    │       ├── WellnessContext.tsx       # GymLogs, UserGymPlan, Water, Sleep, Weight Logs
    │       ├── AcademicContext.tsx       # Attendance, AttendanceLogs, Assignments, Semesters
    │       ├── CreativeContext.tsx       # StorageNodes, Notes, LearningTopics, JobApplications
    │       └── PlannerContext.tsx        # CustomEvents, Goals, WeeklyReviews
    ├── data/
    │   ├── brutalQuotes.ts               # SARA Psychological Motivation Quotes Pool
    │   ├── exerciseDatabase.ts           # 100+ Exercise Catalogue, Muscle Mapping & YouTube IDs
    │   └── gymPlan.ts                    # Master 6-Day PPL & Arnold Split Templates
    ├── hooks/
    │   ├── useGymLog.ts                  # Live Gym Workout Session State Machine
    │   ├── useGymProfile.ts              # Gym Profile & Weight Stats Hook
    │   ├── usePlacementData.ts           # LeetCode & DSA Placement Hub State Machine
    │   ├── useSaraNavigation.ts          # [NAVIGATE:X] Token Parser & Route Navigator
    │   ├── useSaraSurface.ts             # Predictive Surface Injection (PSI) Screen Hook
    │   ├── useTabBarBadges.ts            # Dynamic Badge Counter for Tabs (Tasks, Attendance, Gym)
    │   ├── useProactiveAgent.ts          # Conflict Detection Engine Trigger
    │   ├── useCachedFirestoreCollection.ts # Generic Stale-While-Revalidate Firestore Hook
    │   ├── useDeferredMemo.ts            # Frame-Deferred Complex Computation Hook
    │   └── useSafeTimeout.ts             # Memory-Safe Auto-Clearing Timeout Hook
    ├── navigation/
    │   ├── AppNavigator.tsx              # Root Auth Gate, 0ms Manifest Boot, Tabs, Modal Stacks
    │   └── GymStack.tsx                  # Dedicated Gym Workout Navigation Stack
    ├── screens/
    │   ├── SaraScreen.tsx                # ChatGPT-Style AI Workspace & Voice Orb Console
    │   ├── DashboardScreen.tsx           # Home Dashboard: Life Matrix, Daily Briefing, Widgets
    │   ├── TasksScreen.tsx               # Task Manager: List, 24h Timeline, Eisenhower Matrix
    │   ├── AttendanceScreen.tsx          # Attendance Tracker, Bunk Calculator, Timetable View
    │   ├── CalendarScreen.tsx            # Multi-View Calendar (Month, Week, Day, Agenda)
    │   ├── HabitsScreen.tsx              # Habit Tracker, Streaks, Daily Check-Ins
    │   ├── NotesScreen.tsx               # Markdown Notes, AI Co-Writer, PDF Exporter, Storage
    │   ├── GoalsScreen.tsx               # OKR Goal Tracker & Milestone Breakdown
    │   ├── GradesScreen.tsx              # SGPA/CGPA University Grade Calculator
    │   ├── LearningScreen.tsx            # Video Lecture Player, Flashcards, AI Tutor, MindMap
    │   ├── PlacementHubScreen.tsx        # LeetCode Tracker, DSA Sheet, Mock Prep, Panic Mode
    │   ├── AnalyticsScreen.tsx           # Productivity Graphs, Discipline Score, XP Radar
    │   ├── WellbeingDashboardScreen.tsx  # Sleep, Hydration, Recovery & Work-Life Balance
    │   ├── XPConstellationScreen.tsx     # Gamification Constellation Map & Tier Badges
    │   ├── StreakDetailScreen.tsx        # Deep Streak Analytics & Habit Continuity
    │   ├── ContentLibraryScreen.tsx      # Books, Podcasts & Reading List Manager
    │   ├── StudyRoomScreen.tsx           # Virtual Study Room & Live Pomodoro Sessions
    │   ├── WeeklyReviewScreen.tsx        # Weekly Retrospective & Goal Alignment Engine
    │   ├── AgentHistoryScreen.tsx        # SARA Autonomous Action Audit Log
    │   ├── MoreScreen.tsx                # Extended Module Launcher Grid
    │   ├── SettingsScreen.tsx            # App Preferences, Theme, Data Export, Biometrics
    │   ├── NotificationsSettingsScreen.tsx # Multi-Channel Notification Scheduling Controls
    │   ├── OnboardingScreen.tsx          # 5-Step Psychological Persona Setup
    │   ├── AuthScreen.tsx                # Google & Apple One-Tap Sign In
    │   ├── GuestDashboard.tsx            # Unauthenticated Offline Preview Mode
    │   ├── LandingScreen.tsx             # Welcome Landing Screen
    │   ├── TermsScreen.tsx               # Privacy Policy & Terms of Service
    │   ├── attendance/                   # Attendance Helper Hooks, Styles & Week Strip
    │   ├── calendar/                     # Calendar Views, Event Sheets & State Hooks
    │   ├── dashboard/                    # Dashboard Data Aggregate Hook & Widget Layouts
    │   ├── gym/                          # Gym Screens: ActiveLogging, History, Progress, Swap
    │   └── tasks/                        # Task Modals, Recurring Engine, Task Style Tokens
    ├── services/
    │   ├── firebase.ts                   # Firebase Init, Auth Persistence, Memory Cache
    │   ├── geminiProxy.ts                # Direct Gemini REST API Client with 9-Key Pool
    │   ├── sarvamProxy.ts                # Sarvam AI Indic Voice TTS Proxy (500-char chunking)
    │   ├── voiceEngine.ts                # Audio Recording, VAD Silence Detection & Base64 Encoder
    │   ├── saraMemory.ts                 # Contextual Memory Graph (CMG) & Behavioral Fingerprint
    │   ├── offlineSync.ts                # Offline Write Queue, LWW Resolution & NetInfo Sync
    │   ├── notifications.ts              # Local Multi-Channel Notification Scheduler
    │   ├── xpSystem.ts                   # Gamification XP Engine (Skinner Variable Rewards)
    │   ├── conflictDetector.ts           # Calendar vs Task Schedule Conflict Engine
    │   ├── cloudinary.ts                 # Secure File & Media Cloudinary Uploader
    │   ├── youtubeTranscriptService.ts   # 4-Layer Resilient YouTube Transcript Ingestion
    │   ├── flashcardService.ts           # SuperMemo SM-2 Spaced Repetition Algorithm
    │   ├── exerciseVideoResolver.ts      # YouTube Exercise Demo Resolver
    │   ├── progressiveOverload.ts        # Dynamic Gym Progressive Overload Calculator
    │   ├── weeklyGymAnalysisEngine.ts    # Sunday Deep Gym Analytics & Volume Engine
    │   ├── leetcode.ts                   # LeetCode Public GraphQL Profile Scraper
    │   ├── agentHistory.ts               # SARA Action History Persistence
    │   ├── backgroundTasks.ts            # Expo TaskManager Background Tasks
    │   ├── backgroundProactiveAgent.ts   # Background AI Proactive Anomaly Check
    │   └── webScraper.ts                 # DuckDuckGo AI Web Search Provider
    ├── theme/
    │   ├── tokens.ts                     # Obsidian Cosmos (Dark) & Frost Quartz (Light) Palettes
    │   ├── animations.ts                 # Reanimated Micro-Interaction Presets
    │   └── motion.ts                     # Timing & Spring Easing Curves
    ├── types/
    │   └── gym.types.ts                  # Gym Sets, Exercises, Plans & History TypeScript Interfaces
    └── utils/
        ├── safeWrite.ts                  # Resilient Offline-First Firestore Write Wrapper
        ├── bootManifest.ts               # Atomic Cold Boot Manifest (0ms Bridge Access)
        ├── coreCache.ts                  # Core Domain AsyncStorage Stale-While-Revalidate Cache
        ├── domainCache.ts                # Wellness/Academic/Planner/Creative AsyncStorage Caches
        ├── schemaGuards.ts               # Safe Schema Normalizers & Fallback Parsers
        ├── ModulePrefetcher.tsx          # Cache-Aware Lazy Screen Background Warmer
        ├── haptics.ts                    # Tactile Haptic Vibration Feedback Helpers
        ├── errorUtils.ts                 # Non-Blocking Transient Error Logger
        ├── dateUtils.ts                  # Timezone-Aware Local Date Calculation Engine
        ├── streakUtils.ts                # Habit & Activity Streak Calculation Engine
        ├── academicMath.ts               # SGPA, CGPA & Attendance Projection Math
        ├── exportUtils.ts                # Excel & CSV Report Exporter
        ├── gymUtils.ts                   # 1RM Calculation & Volume Metrics Formatter
        ├── firebaseUtils.ts              # Firebase Helper Utilities
        └── tabBarScroll.ts               # Tab Bar Auto-Scroll on Navigation
```

---

## 4. Master File & Function Encyclopedia

Use this section to look up the exact functions, hooks, classes, and exported constants inside any file.

### 4.1. Top-Level Core Files
| File Path | Key Exports & Functions | Description & Responsibilities |
|---|---|---|
| [`mobile/index.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/index.ts) | `AppRegistry.registerComponent('main', () => App)` | Native entry point. Boots React Native runtime. |
| [`mobile/App.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/App.tsx) | `default App()` | Root UI Component. Loads fonts (Inter 400/500/600/700, Playfair 600), calls `SplashScreen.preventAutoHideAsync()`, mounts `ThemeProvider` → `PortalProvider` → `MobileDataProvider` → `AppNavigator` + `OfflineIndicator`. Registers notification & background proactive listeners. |
| [`mobile/plugins/withAndroidManifestMod.js`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/plugins/withAndroidManifestMod.js) | `module.exports = withAndroidManifestMod` | Expo config plugin injecting custom permissions, vibration flags, and windowSoftInputMode into `AndroidManifest.xml`. |

### 4.2. Agent AI Subsystem (`src/agent/`)
| File Path | Function / Symbol | Signature / Type | Description & Purpose |
|---|---|---|---|
| [`src/agent/orchestrator.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/orchestrator.ts) | `orchestrateAgent` | `(instruction: string, appContext: AppContext, onStep: (step: any) => void, history?: any[], isVoiceMode?: boolean) => Promise<string>` | Main entry point for SARA chat missions. Coordinates IRCI intent classification, selective context pruning, direct Gemini REST call, and streaming step emissions (`thinking`, `reasoning_step`, `proposed_action`, `answer`). |
| | `buildSystemPrompt` | `(appContext: AppContext, toneDirective?: string, responseStyle?: string, memorySummary?: string, personaContext?: string) => string` | Assembles full contextual system prompt including tasks, habits, goals, attendance, calendar, and SARA persona rules. |
| | `buildSelectiveSystemPrompt` | `(selectedContext: Record<string, any>, toneDirective?: string, responseStyle?: string, memorySummary?: string, personaContext?: string) => string` | Assembles high-speed selective prompt containing ONLY domains classified by IRCI. |
| | `generateInitialGreeting` | `(appContext: AppContext) => Promise<string>` | Generates a 1-sentence personalized blunt session opener without pleasantries based on user's highest critical risk signal. |
| | `disconnectSocket` | `() => void` | Backwards-compatibility no-op stub for sign-out callers. |
| [`src/agent/intentClassifier.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/intentClassifier.ts) | `classifyIntent` | `(message: string, fingerprint?: BehavioralFingerprint \| null) => IntentProfile` | Pure on-device synchronous keyword/regex intent classifier (<5ms, 0 tokens). Returns ranked `primaryDomain`, `confidence`, and `urgency`. |
| | `buildSelectiveContext` | `(profile: IntentProfile, appContext: AppContext) => Record<string, any>` | Extracts ONLY the data records matching ranked domains, reducing Gemini payload from ~4000 to ~400 tokens. |
| | `domainToReasoningLabel` | `(domain: DataDomain) => string` | Returns human-friendly reasoning step label (e.g. `'Checking task commitments...'`, `'Analyzing gym workout logs...'`). |
| [`src/agent/dagExecutor.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/dagExecutor.ts) | `executeDag` | `(nodes: DagNode[], context: any, onProgress: (nodeId: string, status: string) => void) => Promise<DagResult[]>` | Topologically resolves and runs task graphs in parallel batches using rotated Gemini API keys and web scraping. |
| [`src/agent/saraAgent.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/saraAgent.ts) | `processGymChat` | `(instruction: string, gymContext: any, history?: any[]) => Promise<{ text: string, action?: any }>` | GYM-GPT expert biomechanics coach. Emits customized exercise substitutions, progressive overload plans, and set guidance. |
| | `parseActionFromText` | `(text: string) => SaraAction \| null` | Regex parser extracting `[[ACTION:{...}]]` JSON blocks from model responses for UI confirmation cards. |
| | `compressMemoryToSummary` | `(history: any[]) => Promise<string>` | Summarizes conversation histories (>20 messages) into a concise ≤200-word memory graph update. |
| | `compressGymMemoryToSummary`| `(history: any[]) => Promise<string>` | Summarizes workout coaching chats into persistent long-term lifting preferences. |

### 4.3. Configuration & Action Policy (`src/config/`)
| File Path | Function / Export | Signature / Type | Description & Purpose |
|---|---|---|---|
| [`src/config/constants.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/config/constants.ts) | `APP_NAME`, `APP_VERSION`, `GEMINI_PROXY_URL`, `VOICE_PROXY_URL`, `COLLECTION`, `STORAGE_KEYS`, `SCREENS` | Constants | Central app-wide constants: API endpoints, 18 Firestore collection names, AsyncStorage storage keys, and screen route identifiers. |
| [`src/config/saraActionPolicy.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/config/saraActionPolicy.ts) | `evaluateActionPolicy` | `(action: any, rawConfidence?: number) => ActionExecutionProposal` | 3-tier action gateway: Tier 1 (auto-execute, conf > 0.95), Tier 2 (inline pill, conf 0.70–0.95), Tier 3 (confirmation card). |
| | `getActionTier` | `(actionType: string, confidence: number) => ActionTier` | Evaluates action risk level against confidence score. |
| | `recordActionHistory` | `(action: any, executed: boolean, undoFn?: () => void) => Promise<void>` | Appends action proposal to `@sara_action_history_v1` local audit log. |
| | `getActionHistory` | `() => Promise<any[]>` | Returns recent action history for review in AgentHistoryScreen. |

### 4.4. Contexts & Data Layer (`src/contexts/` & `src/contexts/domains/`)
| File Path | Function / Hook | Signature / Type | Description & Purpose |
|---|---|---|---|
| [`src/contexts/MobileDataContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/MobileDataContext.tsx) | `MobileDataProvider` | `React.FC<{ children: React.ReactNode }>` | Root composite data provider wrapping all 5 domain providers. Runs debounced 3.5s notification scheduler. |
| | `useMobileData` | `() => MobileDataContextType` | Universal hook providing backward-compatible access to all 18 Firestore collection datasets and mutators. |
| [`src/contexts/ThemeContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/ThemeContext.tsx) | `ThemeProvider` | `React.FC<{ children: React.ReactNode }>` | Theme state provider managing Obsidian Cosmos (dark) vs Frost Quartz (light). |
| | `useTheme` | `() => { theme: ThemeMode, isDark: boolean, colors: ColorTokens, setTheme: (m: ThemeMode) => void }` | Hook providing active color tokens, dark mode boolean, and theme switcher. |
| [`src/contexts/PortalContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/PortalContext.tsx) | `PortalProvider`, `Portal`, `PortalHost` | Components | Root modal portal coordinator rendering floating sheets at the root view hierarchy. |
| [`src/contexts/domains/CoreDataContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/CoreDataContext.tsx) | `CoreDataProvider` | `React.FC<{ children: React.ReactNode }>` | Manages auth, tasks, habits, and habit logs. Listens for `firestore_force_reconnect` to auto-restart listeners on foreground. |
| | `useCoreData` | `() => CoreDataContextType` | Hook returning `user`, `tasks`, `habits`, `habitLogs`, `optimisticAddTask`, `optimisticUpdateTask`, `optimisticDeleteTask`, etc. |
| | `performSignOut` | `() => Promise<void>` | Explicit user sign-out: signs out of Firebase Auth, clears optimistic boot tokens, wipes offline write queue, and purges all domain caches. |
| [`src/contexts/domains/WellnessContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/WellnessContext.tsx) | `WellnessProvider` | `React.FC<{ children: React.ReactNode, user: any }>` | Demand-based subscriptions for `gym_logs`, `user_gym_plans`, `water_logs`, `sleep_logs`, and `weight_logs`. |
| | `useWellnessData` | `() => WellnessContextType` | Hook returning `gymLogs`, `userGymPlan`, `waterLogs`, `sleepLogs`, `updateMasterPlan`, `applyMasterTemplate`, etc. |
| [`src/contexts/domains/AcademicContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/AcademicContext.tsx) | `AcademicProvider` | `React.FC<{ children: React.ReactNode, user: any }>` | Subscriptions for `attendance_subjects`, `attendance_logs`, `assignments`, `semesters`, `semester_subjects`, `attendance_holidays`. |
| | `useAcademicData` | `() => AcademicContextType` | Hook returning `attendance`, `attendanceLogs`, `assignments`, `semesters`, `semesterSubjects`, `optimisticAddSubject`, etc. |
| [`src/contexts/domains/CreativeContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/CreativeContext.tsx) | `CreativeProvider` | `React.FC<{ children: React.ReactNode, user: any }>` | Subscriptions for `storage_nodes`, `learning_topics`, `job_applications`, `content_logs`. Derives `notes` from storage nodes. |
| | `useCreativeData` | `() => CreativeContextType` | Hook returning `storageNodes`, `notes`, `learningTopics`, `jobs`, `contentLogs`, `ensureSubscribed`. |
| [`src/contexts/domains/PlannerContext.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/PlannerContext.tsx) | `PlannerProvider` | `React.FC<{ children: React.ReactNode, user: any }>` | Subscriptions for `calendar_events`, `goals`, `weekly_reviews`. |
| | `usePlannerData` | `() => PlannerContextType` | Hook returning `customEvents`, `goals`, `weeklyReviews`, `optimisticAddEvent`, `optimisticUpdateEvent`, `optimisticAddGoal`. |

### 4.5. Services & Backend Engines (`src/services/`)
| File Path | Function / Export | Signature / Type | Description & Purpose |
|---|---|---|---|
| [`src/services/firebase.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/firebase.ts) | `auth`, `db`, `googleProvider` | Firebase Client Singletons | Initializes Firebase with AsyncStorage auth persistence and memory local cache. |
| [`src/services/geminiProxy.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/geminiProxy.ts) | `callProxy` | `(payload: GeminiProxyPayload) => Promise<any>` | Direct Gemini REST client with 9-key round-robin rotation pool and exponential 429 backoff. |
| | `streamProxy` | `(payload: GeminiProxyPayload, onChunk: (text: string) => void) => Promise<string>` | Streams server-sent event tokens from Gemini 2.5 Flash. |
| | `transcribeAudioViaProxy` | `(base64Audio: string) => Promise<string>` | Sends Base64 audio directly to Gemini 2.5 Flash for high-accuracy multimodal transcription. |
| | `parseProxyResponse` | `(data: any) => { text: string, isAction: boolean, action?: any }` | Parses candidate text and extracts action payloads. |
| | `callGeminiProxy` | `(prompt: string, systemInstruction?: string) => Promise<string>` | High-level quick prompt runner. |
| | `askGymCoach` | `(userQuery: string, gymContext: any) => Promise<string>` | Specialized prompt runner for GYM-GPT coaching. |
| [`src/services/sarvamProxy.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/sarvamProxy.ts) | `speakWithSarvam` | `(text: string, onDone?: () => void, options?: SarvamOptions) => Promise<void>` | Sarvam AI Indic TTS voice player. Splits long text into 500-char chunks and plays audio through `expo-av`. |
| | `stopSpeech` | `() => Promise<void>` | Immediately halts active TTS audio playback and unloads sound objects. |
| | `detectLanguageCode` | `(text: string) => 'hi-IN' \| 'en-IN'` | Returns `hi-IN` if Devanagari character density > 15%, else `en-IN`. |
| | `stripMarkdown` | `(text: string) => string` | Cleans bold, headers, links, and markdown syntax before feeding text to TTS. |
| [`src/services/voiceEngine.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/voiceEngine.ts) | `startVoiceRecording` | `(callbacks: VoiceRecordingCallbacks) => Promise<void>` | Requests audio permissions, configures iOS/Android audio modes, and begins recording. |
| | `stopAndTranscribe` | `(callbacks: VoiceRecordingCallbacks) => Promise<void>` | Stops audio recording, converts temporary WAV file to Base64, and transcribes via Gemini. |
| | `startVADRecording` | `(callbacks: VADRecordingCallbacks) => Promise<void>` | Starts continuous Voice Activity Detection (VAD) using polling RMS power metering. |
| | `cancelVoiceRecording` | `() => Promise<void>` | Cancels recording without triggering transcription callbacks and removes temp files. |
| [`src/services/saraMemory.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/saraMemory.ts) | `buildMemorySummary` | `(userId: string) => Promise<string>` | Reads Contextual Memory Graph (CMG) from AsyncStorage and formats facts into system prompt text. |
| | `extractAndStore` | `(userId: string, userMsg: string, saraMsg: string) => Promise<void>` | Background fact extractor analyzing conversation turns and updating memory graph entities. |
| | `getFingerprint` | `(userId: string) => Promise<BehavioralFingerprint>` | Returns user's Behavioral Fingerprint (tone, verbosity, active hours, primary goals). |
| | `updateFingerprint` | `(userId: string, actionType: string) => Promise<void>` | Adapts user fingerprint weights on every completed action or interaction. |
| | `getSaraToneDirective` | `(fingerprint: BehavioralFingerprint) => string` | Computes tailored psychological persona instructions for SARA prompt. |
| [`src/services/offlineSync.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/offlineSync.ts) | `queueWrite` | `(collection: string, operation: 'add'\|'update'\|'delete'\|'set', data: any, docId?: string) => Promise<void>` | Enqueues a Firestore write operation in AsyncStorage with LWW timestamp and coalesces rapid updates. |
| | `syncOfflineQueue` | `() => Promise<{ synced: number, errors: number }>` | Drains all queued offline writes to Firestore using atomic batches and emits sync progress. |
| | `setupNetworkListener` | `() => () => void` | Attaches NetInfo state listener to automatically trigger `syncOfflineQueue()` when transitioning online. |
| | `subscribeToQueueChanges` | `(cb: (count: number) => void) => () => void` | Registers listener for offline queue count updates (used by `OfflineIndicator.tsx`). |
| | `subscribeToSyncComplete` | `(cb: (count: number) => void) => () => void` | Registers listener for successful sync completion toasts. |
| | `getQueueCount` | `() => Promise<number>` | Returns count of pending offline writes. |
| | `clearOfflineQueue` | `() => Promise<void>` | Wipes offline queue on sign-out. |
| [`src/services/notifications.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/notifications.ts) | `scheduleAllNotifications` | `(params: ScheduleParams) => Promise<void>` | Evaluates user data fingerprint and rebuilds all local scheduled notifications across both Android channels. |
| | `requestNotificationPermissions`| `() => Promise<boolean>` | Configures Android channels (`default`, `reminders`) and requests OS permissions. |
| | `registerBackgroundNotificationFetch`| `() => Promise<void>` | Registers background TaskManager worker to verify notifications when app is suspended. |
| | `clearScheduleCache` | `() => void` | Bypasses fingerprint cache to force immediate full notification rescheduling. |
| [`src/services/xpSystem.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/xpSystem.ts) | `awardXP` | `(source: XPSource, customAmount?: number) => Promise<{ newXP: number, levelUp: boolean, newLevel: XPLevel }>` | Awards XP using Skinner variable ratio schedule, checks rank thresholds, and plays milestone haptics. |
| | `getXPData` | `() => Promise<{ xp: number, streak: number, level: XPLevel, progressPct: number }>` | Returns current user XP, rank level, and streak statistics. |
| | `calculateLevel` | `(xp: number) => XPLevel` | Maps numeric XP to 1 of 8 rank titles (`Initiate` to `Mythic`). |
| [`src/services/conflictDetector.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/conflictDetector.ts) | `detectConflicts` | `(tasks: Task[], events: CustomEvent[], timetable: AttendanceSubject[]) => ScheduleConflict[]` | Scans for timeSlot overlaps between calendar events, academic classes, and scheduled tasks. |
| [`src/services/cloudinary.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/cloudinary.ts) | `uploadFileToCloudinary` | `(uri: string, type: 'image'\|'pdf'\|'raw') => Promise<string>` | Uploads local files/photos to Cloudinary CDN and returns secure URL. |
| [`src/services/youtubeTranscriptService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/youtubeTranscriptService.ts) | `fetchYouTubeTranscript` | `(videoId: string) => Promise<TranscriptResult>` | 4-layer resilient transcript pipeline (InnerTube, Gemini multimodal, Supadata API, Audio fallback). |
| | `transcriptToPlainText` | `(cues: TranscriptCue[], maxChars?: number) => string` | Formats transcript cues into timestamped `[MM:SS]` text blocks for AI ingestion. |
| [`src/services/flashcardService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/flashcardService.ts) | `calculateSM2` | `(card: Flashcard, grade: 0\|1\|2\|3\|4\|5) => Flashcard` | SuperMemo SM-2 algorithm: updates ease factor, interval days, and repetition counts. |
| | `generateFlashcardsFromNote` | `(noteContent: string) => Promise<Flashcard[]>` | Prompts Gemini to parse markdown notes and output structured Q&A flashcard pairs. |
| [`src/services/exerciseVideoResolver.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/exerciseVideoResolver.ts) | `resolveExerciseVideoId` | `(exerciseName: string) => string \| null` | Maps exercise names to verified high-definition YouTube execution video IDs. |
| [`src/services/progressiveOverload.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/progressiveOverload.ts) | `calculateNextTarget` | `(exerciseId: string, history: GymSet[]) => OverloadRecommendation` | Computes recommended weight & reps for next session based on RPE and completion rates. |
| | `recommendWeight` | `(current1RM: number, targetReps: number, rpe: number) => number` | Formulates lifting weight target using Brzycki formula and RPE exertion curve. |
| [`src/services/weeklyGymAnalysisEngine.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/weeklyGymAnalysisEngine.ts) | `generateWeeklyGymSummary` | `(gymLogs: GymLog[], userGymPlan: UserGymPlanDoc) => WeeklyGymReportData` | Aggregates 7-day volume totals, muscle group set distributions, and week-over-week deltas. |
| | `calculateVolumeByMuscle` | `(gymLogs: GymLog[]) => Record<string, number>` | Sums weight × reps per anatomical muscle group. |
| [`src/services/leetcode.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/leetcode.ts) | `fetchLeetCodeProfile` | `(username: string) => Promise<LeetCodeStats \| null>` | Queries LeetCode GraphQL public endpoint for solved counts and contest rating. |
| [`src/services/agentHistory.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/agentHistory.ts) | `recordAgentAction` | `(action: AgentActionRecord) => Promise<void>` | Appends SARA autonomous action records to local audit log. |
| | `getAgentHistory` | `() => Promise<AgentActionRecord[]>` | Returns recent action logs for `AgentHistoryScreen.tsx`. |
| [`src/services/backgroundTasks.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/backgroundTasks.ts) | `registerWeeklyReviewTask` | `() => Promise<void>` | Registers Expo TaskManager task for Sunday review reminder notifications. |
| [`src/services/backgroundProactiveAgent.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/backgroundProactiveAgent.ts) | `registerBackgroundProactiveAgent` | `() => Promise<void>` | Background task evaluating critical academic and task risks when app is suspended. |
| [`src/services/webScraper.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/webScraper.ts) | `executeWebSearch` | `(query: string) => Promise<string>` | DuckDuckGo search integration for SARA DAG queries. |

### 4.6. Navigation Layer (`src/navigation/`)
| File Path | Component / Function | Purpose & Implementation Details |
|---|---|---|
| [`src/navigation/AppNavigator.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/navigation/AppNavigator.tsx) | `AppNavigator` | Root navigator managing auth gate (`onAuthStateChanged`), 0ms manifest boot (`loadBootManifest`), `isAuthFatalError` handler, 8-second dead session recovery window, `MainTabs` with dynamic Telegram tab bar, and `MoreStack` card transitions. |
| | `navigationRef` | Exported `NavigationContainerRef` for imperative deep linking from notification handlers in `App.tsx`. |
| [`src/navigation/GymStack.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/navigation/GymStack.tsx) | `GymStack` | Dedicated workout stack: `GymHome` → `ActiveLogging` → `WorkoutSummary`, `GymProgress`, `GymHistory`, `ExerciseDetail`, `ExerciseSwap`, `CardioLog`. |

### 4.7. Screens & View Controllers (`src/screens/`)
| File Path | Screen Component | Route Name | Key Screen Responsibilities |
|---|---|---|---|
| [`src/screens/DashboardScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/DashboardScreen.tsx) | `DashboardScreen` | `Home` | Main Dashboard: Life Matrix ring, daily tasks briefing, habit streak rings, hydration logger, and quick speed-dial sheet. |
| [`src/screens/SaraScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/SaraScreen.tsx) | `SaraScreen` | `Sara`, `SaraModal` | ChatGPT OLED workspace: Voice Orb, real-time reasoning feed, 3-tier action confirmation cards, and memory summary drawer. |
| [`src/screens/TasksScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/TasksScreen.tsx) | `TasksScreen` | `Tasks` | Task Command Center: List view with swipe actions, 24-hour timeline view, Eisenhower 4-quadrant matrix, and Pomodoro focus sheet. |
| [`src/screens/AttendanceScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/AttendanceScreen.tsx) | `AttendanceScreen` | `Attendance` | Attendance Tracker: subject card list, bunk prediction calculator, danger zone banner, timetable grid, and Excel import/export. |
| [`src/screens/CalendarScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/CalendarScreen.tsx) | `CalendarScreen` | `Calendar` | Calendar Hub: interactive month view, week strip pager, day agenda, event creator, and conflict markers. |
| [`src/screens/HabitsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/HabitsScreen.tsx) | `HabitsScreen` | `Habits` | Habit Tracker: daily check-in pills, numerical counter buttons, streak freeze manager, and streak detail charts. |
| [`src/screens/NotesScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/NotesScreen.tsx) | `NotesScreen` | `Notes` | ZenNotes: Markdown editor, hierarchical file/folder storage nodes, AI co-writer assistance, and PDF document exporter. |
| [`src/screens/GoalsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/GoalsScreen.tsx) | `GoalsScreen` | `Goals` | OKR Goal Tracker: goal cards, milestone breakdown, and progress completion progress rings. |
| [`src/screens/GradesScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/GradesScreen.tsx) | `GradesScreen` | `Grades` | SGPA/CGPA University Grade Calculator with semester subject credit breakdown. |
| [`src/screens/LearningScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/LearningScreen.tsx) | `LearningScreen` | `Learning` | Learning Hub: synchronized YouTube video player, AI tutor chat, VS Code syntax highlighter, interactive mind map, and flashcard deck. |
| [`src/screens/PlacementHubScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/PlacementHubScreen.tsx) | `PlacementHubScreen` | `PlacementHub` | Placement Prep: LeetCode profile scraper, Striver SDE sheet checklist, DSA activity heatmap, Pattern Vault, and Panic Mode sheet. |
| [`src/screens/AnalyticsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/AnalyticsScreen.tsx) | `AnalyticsScreen` | `Analytics` | Analytics Hub: Discipline score gauge, task completion ratios, XP radar charts, and academic performance graphs. |
| [`src/screens/WellbeingDashboardScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/WellbeingDashboardScreen.tsx) | `WellbeingDashboardScreen` | `WellbeingDashboard` | Wellbeing: sleep stage analysis, daily hydration metrics, recovery scores, and work-life balance insights. |
| [`src/screens/XPConstellationScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/XPConstellationScreen.tsx) | `XPConstellationScreen` | `XPConstellation` | Gamification Constellation: visual galaxy nodes representing unlocked milestones, rank tiers, and badge achievements. |
| [`src/screens/StreakDetailScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/StreakDetailScreen.tsx) | `StreakDetailScreen` | `StreakDetail` | Streak Analytics: habit consistency calendar, longest streak records, freeze history, and milestone progress. |
| [`src/screens/ContentLibraryScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/ContentLibraryScreen.tsx) | `ContentLibraryScreen` | `ContentLibrary` | Reading List: books, articles, and podcasts with progress sliders and completion dates. |
| [`src/screens/StudyRoomScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/StudyRoomScreen.tsx) | `StudyRoomScreen` | `StudyRoom` | Virtual Study Room: Pomodoro timer, ambient background noise, and study session loggers. |
| [`src/screens/WeeklyReviewScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/WeeklyReviewScreen.tsx) | `WeeklyReviewScreen` | `WeeklyReview` | Sunday Review: retrospective questions (Went well, To improve, Priorities) and goal alignment. |
| [`src/screens/AgentHistoryScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/AgentHistoryScreen.tsx) | `AgentHistoryScreen` | `AgentHistory` | SARA Audit Log: list of all executed actions with undo buttons and execution timestamps. |
| [`src/screens/MoreScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/MoreScreen.tsx) | `MoreScreen` | `More` | Module Launcher: 16-module icon grid with tab pinning configuration controls. |
| [`src/screens/SettingsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/SettingsScreen.tsx) | `SettingsScreen` | `Settings` | Settings: theme switcher, biometric lock toggle, data export/import, and sign-out button. |
| [`src/screens/NotificationsSettingsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/NotificationsSettingsScreen.tsx) | `NotificationsSettingsScreen` | `NotificationsSettings` | Notification Preferences: mission windows, briefings, class reminders, and hydration interval controls. |
| [`src/screens/OnboardingScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/OnboardingScreen.tsx) | `OnboardingScreen` | `Onboarding` | 5-step psychological onboarding: persona selection, goals, academic baseline, and SARA setup. |
| [`src/screens/AuthScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/AuthScreen.tsx) | `AuthScreen` | `Auth` | Sign In: Google One-Tap and Apple Authentication buttons. |
| [`src/screens/GuestDashboard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/GuestDashboard.tsx) | `GuestDashboard` | `GuestDashboard` | Offline Sample Preview: sample dashboard data for unauthenticated evaluation. |
| [`src/screens/LandingScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/LandingScreen.tsx) | `LandingScreen` | `Landing` | Welcome Hero: feature carousel and Get Started CTA. |
| [`src/screens/TermsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/TermsScreen.tsx) | `TermsScreen` | `Terms` | Legal: Privacy policy, data safety, and terms of service. |
| [`src/screens/gym/GymHomeScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/GymHomeScreen.tsx) | `GymHomeScreen` | `GymHome` | Gym Launcher: today's workout split, muscle heatmap, GYM-GPT FAB, and Sunday weekly summary. |
| [`src/screens/gym/ActiveLoggingScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/ActiveLoggingScreen.tsx) | `ActiveLoggingScreen` | `ActiveLogging` | Workout Execution: set logging, rep/weight trackers, animated rest timer, and RPE inputs. |
| [`src/screens/gym/WorkoutSummaryScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/WorkoutSummaryScreen.tsx) | `WorkoutSummaryScreen` | `WorkoutSummary` | Workout Summary: volume stats, PR badges, confetti cannon, and view-shot shareable card. |
| [`src/screens/gym/GymProgressScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/GymProgressScreen.tsx) | `GymProgressScreen` | `GymProgress` | Strength analytics: estimated 1RM progression charts, volume trend lines, and muscle distribution donuts. |
| [`src/screens/gym/GymHistoryScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/GymHistoryScreen.tsx) | `GymHistoryScreen` | `GymHistory` | Workout calendar & history logs with search filtering and set breakdowns. |
| [`src/screens/gym/ExerciseDetailScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/ExerciseDetailScreen.tsx) | `ExerciseDetailScreen` | `ExerciseDetail` | Exercise Reference: YouTube technique demos, 1RM history, and personal records. |
| [`src/screens/gym/ExerciseSwapScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/ExerciseSwapScreen.tsx) | `ExerciseSwapScreen` | `ExerciseSwap` | Equipment & muscle-based exercise substitution with permanent master split override. |
| [`src/screens/gym/CardioLogScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/CardioLogScreen.tsx) | `CardioLogScreen` | `CardioLog` | Cardio session logger: distance, duration, pace, incline, and calories burned. |

### 4.8. Screen Sub-Modules & Style Factories
| File Path | Function / Export | Purpose & Responsibilities |
|---|---|---|
| [`src/screens/tasks/useTasksFirestore.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/tasks/useTasksFirestore.ts) | `addTask`, `completeTask`, `uncompleteTask`, `updateTask`, `deleteTask`, `saveTimeLog`, `bulkCompleteTasks`, `bulkRescheduleTasks`, `bulkDeleteTasks` | Firestore mutation coordinator for tasks routing through `safeWrite()`. |
| [`src/screens/tasks/useTasksData.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/tasks/useTasksData.ts) | `useTasksData()` | Tasks filtering, sorting, tab selection (`all`, `today`, `upcoming`), and tag grouping hook. |
| [`src/screens/tasks/useRecurringSpawn.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/tasks/useRecurringSpawn.ts) | `useRecurringSpawn(tasks, optimisticAddTask)` | Client-side daily task recurrence spawner preventing duplicate clones for `today`. |
| [`src/screens/tasks/NewTaskModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/tasks/NewTaskModal.tsx) | `NewTaskModal` | Slide-up modal for task creation with NLP natural language parsing chips. |
| [`src/screens/tasks/EditTaskModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/tasks/EditTaskModal.tsx) | `EditTaskModal` | Modal for updating task title, priority, subtasks, recurrence, and dates. |
| [`src/screens/tasks/taskConstants.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/tasks/taskConstants.ts) | `TASK_PRIORITY_COLORS`, `TASK_FILTERS` | Constants for task priorities and filtering modes. |
| [`src/screens/tasks/tasksStyles.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/tasks/tasksStyles.ts) | `makeTasksStyles(colors, isDark)` | Dynamic style factory for tasks screens across Obsidian Cosmos & Frost Quartz themes. |
| [`src/screens/dashboard/useDashboardData.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/dashboard/useDashboardData.ts) | `useDashboardData()` | Aggregates discipline metrics, life score, upcoming events, and hydration progress for Home. |
| [`src/screens/dashboard/useXPLevel.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/dashboard/useXPLevel.ts) | `useXPLevel()` | Hook returning current rank level title, badge icon, and next tier threshold. |
| [`src/screens/dashboard/dashboardStyles.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/dashboard/dashboardStyles.ts) | `makeDashboardStyles(colors, isDark)` | Dynamic theme style generator for Dashboard. |
| [`src/screens/attendance/useAttendanceFirestore.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/attendance/useAttendanceFirestore.ts) | `markAttendance`, `undoAttendance`, `addSubject`, `updateSubject`, `deleteSubject`, `addHoliday` | Firestore mutator for attendance subjects and logs with offline queueing. |
| [`src/screens/attendance/useAttendanceData.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/attendance/useAttendanceData.ts) | `useAttendanceData()` | Computes overall percentage, bunk safety margins, and at-risk subject lists. |
| [`src/screens/attendance/useAttendanceExport.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/attendance/useAttendanceExport.ts) | `exportAttendanceExcel`, `importAttendanceExcel` | Parses and generates university attendance Excel `.xlsx` spreadsheets. |
| [`src/screens/attendance/HorizontalWeekStrip.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/attendance/HorizontalWeekStrip.tsx) | `HorizontalWeekStrip` | Interactive Monday–Saturday horizontal date selection strip. |
| [`src/screens/attendance/attendanceConstants.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/attendance/attendanceConstants.ts) | `ATTENDANCE_STATUS_COLORS` | Constants for Present, Absent, and Cancelled attendance statuses. |
| [`src/screens/attendance/attendanceStyles.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/attendance/attendanceStyles.ts) | `makeAttendanceStyles(colors, isDark)` | Dynamic style factory for Attendance screen. |
| [`src/screens/calendar/useCalendarData.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/useCalendarData.ts) | `useCalendarData()` | Aggregates tasks, timetable classes, and custom events into unified calendar matrix. |
| [`src/screens/calendar/CalendarDayView.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/CalendarDayView.tsx) | `CalendarDayView` | 24-hour day schedule view with live real-time indicator line. |
| [`src/screens/calendar/CalendarWeekView.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/CalendarWeekView.tsx) | `CalendarWeekView` | 7-day multi-column calendar view. |
| [`src/screens/calendar/CalendarAgendaView.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/CalendarAgendaView.tsx) | `CalendarAgendaView` | Chronological agenda list view of upcoming schedule items. |
| [`src/screens/calendar/CalendarGymModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/CalendarGymModal.tsx) | `CalendarGymModal` | Modal displaying gym workout logs scheduled on a calendar day. |
| [`src/screens/calendar/EventDetailSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/EventDetailSheet.tsx) | `EventDetailSheet` | Bottom sheet displaying event time, location, description, and delete button. |
| [`src/screens/calendar/calendarStyles.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/calendarStyles.ts) | `makeCalendarStyles(colors, isDark)` | Dynamic style generator for Calendar views. |
| [`src/screens/calendar/calendarUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/calendar/calendarUtils.ts) | `formatCalendarDayHeader`, `getMarkedDatesMap` | Calendar helper utilities. |
| [`src/screens/gym/home/useGymModals.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/home/useGymModals.ts) | `useGymModals()` | Modal visibility state coordinator for GymHome. |
| [`src/screens/gym/home/gymHomeStyles.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/home/gymHomeStyles.ts) | `makeGymHomeStyles(colors, isDark)` | Dynamic theme styling for Gym Home. |

### 4.9. Component Library (`src/components/`)
| Subfolder / File | Exported Component | Key Functionality & Props |
|---|---|---|
| [`src/components/Navigation/TelegramTabBar.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Navigation/TelegramTabBar.tsx) | `TelegramTabBar` | Floating frosted glass bottom tab bar with dynamic badge pills and haptic animations. |
| [`src/components/OfflineIndicator.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/OfflineIndicator.tsx) | `OfflineIndicator` | Real-time amber "Offline" pill and green "Synced N items" toast. |
| [`src/components/AnimatedPressable.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/AnimatedPressable.tsx) | `AnimatedPressable` | High-performance touch wrapper with scale micro-animations and haptic feedback. |
| [`src/components/ErrorBoundary.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ErrorBoundary.tsx) | `ErrorBoundary` | React component crash guard with stack trace diagnostics and "Try Again" recovery. |
| [`src/components/NotificationPreferencesComponent.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/NotificationPreferencesComponent.tsx) | `NotificationPreferencesComponent` | Reusable notification preferences form with time pickers and channel toggles. |
| [`src/components/UniversalCalendarModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/UniversalCalendarModal.tsx) | `UniversalCalendarModal` | Global modal date picker supporting single date and date range selection. |
| [`src/components/UpdateBanner.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/UpdateBanner.tsx) | `UpdateBanner` | In-app notification banner for OTA Expo Updates bundle downloads. |
| **Academic Components** (`src/components/Academic/`) | | |
| [`src/components/Academic/AddSubjectModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Academic/AddSubjectModal.tsx) | `AddSubjectModal` | Modal for creating academic subjects with weekly schedule time slots and target percentages. |
| [`src/components/Academic/ClassNotifSettingsModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Academic/ClassNotifSettingsModal.tsx) | `ClassNotifSettingsModal` | Per-subject class alert notification timing configurator (15m before, post-class). |
| [`src/components/Academic/TimetableModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Academic/TimetableModal.tsx) | `TimetableModal` | Full weekly timetable grid display (Monday to Saturday). |
| [`src/components/Academic/AcademicPredictorCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Academic/AcademicPredictorCard.tsx) | `AcademicPredictorCard` | Predictive card showing projected end-of-semester attendance based on current bunk rate. |
| **Analytics Components** (`src/components/Analytics/`) | | |
| [`src/components/Analytics/AcademicPredictorCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Analytics/AcademicPredictorCard.tsx) | `AcademicPredictorCard` | Grade and attendance risk forecasting card for Analytics screen. |
| **Calendar Components** (`src/components/Calendar/`) | | |
| [`src/components/Calendar/AddEventModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Calendar/AddEventModal.tsx) | `AddEventModal` | Slide-up modal for creating custom calendar events with location, type, and start/end times. |
| [`src/components/Calendar/CalendarWeekStripPager.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Calendar/CalendarWeekStripPager.tsx) | `CalendarWeekStripPager` | Horizontal swipeable week pager with day selection indicators. |
| **Dashboard Components** (`src/components/Dashboard/`) | | |
| [`src/components/Dashboard/UnifiedLifeWidget.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/UnifiedLifeWidget.tsx) | `UnifiedLifeWidget` | SVG donut score ring displaying overall life discipline score (0–100). |
| [`src/components/Dashboard/AgendaWidget.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/AgendaWidget.tsx) | `AgendaWidget` | Today's timeline schedule card on Home dashboard. |
| [`src/components/Dashboard/QuickCaptureSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/QuickCaptureSheet.tsx) | `QuickCaptureSheet` | 1-tap capture bottom sheet for Tasks, Notes, and Habits with NLP parser. |
| [`src/components/Dashboard/WaterLogSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/WaterLogSheet.tsx) | `WaterLogSheet` | Hydration logging bottom sheet (+250ml, +500ml quick chips). |
| [`src/components/Dashboard/SleepLogSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/SleepLogSheet.tsx) | `SleepLogSheet` | Sleep duration & quality (1–5 stars) logging sheet. |
| [`src/components/Dashboard/VitalityGaugeCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/VitalityGaugeCard.tsx) | `VitalityGaugeCard` | Recovery and hydration vitality metric card. |
| [`src/components/Dashboard/DashboardLayoutSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/DashboardLayoutSheet.tsx) | `DashboardLayoutSheet` | Drag-and-drop widget reordering sheet for customizing Dashboard layout. |
| [`src/components/Dashboard/DashboardRings.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Dashboard/DashboardRings.tsx) | `DashboardRings` | Multi-ring Apple Watch style activity rings for tasks, habits, and gym. |
| **Tasks Components** (`src/components/Tasks/`) | | |
| [`src/components/Tasks/TaskRow.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/TaskRow.tsx) | `TaskRow` | Reusable swipeable task row with checkbox, priority badge, and subtasks accordion. |
| [`src/components/Tasks/TimelineView.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/TimelineView.tsx) | `TimelineView` | 24-hour visual block timeline mapping tasks, academic classes, and gym workouts. |
| [`src/components/Tasks/MatrixView.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/MatrixView.tsx) | `MatrixView` | Eisenhower Matrix (Do First, Schedule, Delegate, Don't Do) 4-quadrant layout. |
| [`src/components/Tasks/KanbanView.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/KanbanView.tsx) | `KanbanView` | Drag-and-drop Kanban board with Pending, In Progress, and Done columns. |
| [`src/components/Tasks/PomodoroSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/PomodoroSheet.tsx) | `PomodoroSheet` | Animated SVG progress ring Pomodoro focus timer with task linker. |
| [`src/components/Tasks/NLPTaskInput.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/NLPTaskInput.tsx) | `NLPTaskInput` | Natural language text input field with live parsing token chips. |
| [`src/components/Tasks/RecurrencePickerModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/RecurrencePickerModal.tsx) | `RecurrencePickerModal` | Custom repeat rule configurator (Daily, Weekly, Monthly, Custom intervals). |
| [`src/components/Tasks/TaskDateStrip.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/TaskDateStrip.tsx) | `TaskDateStrip` | Horizontal calendar date pill picker for filtering tasks by date. |
| [`src/components/Tasks/BulkRescheduleSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/BulkRescheduleSheet.tsx) | `BulkRescheduleSheet` | Bulk action bottom sheet for rescheduling multiple selected tasks at once. |
| [`src/components/Tasks/TaskTemplatesSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/TaskTemplatesSheet.tsx) | `TaskTemplatesSheet` | Predefined routine task templates (Morning routine, Exam prep, Workout setup). |
| [`src/components/Tasks/TaskTimeLogSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/TaskTimeLogSheet.tsx) | `TaskTimeLogSheet` | Post-completion time logging sheet capturing actual minutes spent on a task. |
| [`src/components/Tasks/TimeSpentSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/TimeSpentSheet.tsx) | `TimeSpentSheet` | Time tracking analytics sheet. |
| [`src/components/Tasks/VoiceDictationOverlay.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Tasks/VoiceDictationOverlay.tsx) | `VoiceDictationOverlay` | Full-screen voice dictation overlay converting spoken tasks to NLP tokens. |
| **Gym Components** (`src/components/Gym/` & `Charts/`) | | |
| [`src/components/Gym/ZenGymAiModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/ZenGymAiModal.tsx) | `ZenGymAiModal` | Full-screen GYM-GPT AI coach modal with persistent workout chat history. |
| [`src/components/Gym/ZenGymAiFab.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/ZenGymAiFab.tsx) | `ZenGymAiFab` | Luxury floating action button with metallic plates & AI sparkles. |
| [`src/components/Gym/GymAiIcon.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/GymAiIcon.tsx) | `GymAiIcon` | High-precision vector SVG emblem with metallic weight plates & sparkles. |
| [`src/components/Gym/AddExerciseModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/AddExerciseModal.tsx) | `AddExerciseModal` | Search-as-you-type modal auto-filling sets, reps, videoId, and last session weights. |
| [`src/components/Gym/AnimatedRestTimer.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/AnimatedRestTimer.tsx) | `AnimatedRestTimer` | Countdown rest timer with audio beep and background push alerts. |
| [`src/components/Gym/WeeklyGymReport.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/WeeklyGymReport.tsx) | `WeeklyGymReport` | Sunday recovery card: volume totals, muscle donuts, and untrained muscle warnings. |
| [`src/components/Gym/BodyMetricsSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/BodyMetricsSheet.tsx) | `BodyMetricsSheet` | Bodyweight, body fat %, and progress photo logging sheet. |
| [`src/components/Gym/BeforeAfterSlider.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/BeforeAfterSlider.tsx) | `BeforeAfterSlider` | Interactive touch comparison slider for transformation photos. |
| [`src/components/Gym/ExerciseList.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/ExerciseList.tsx) | `ExerciseList` | Virtualized exercise card list in active workout session. |
| [`src/components/Gym/ExerciseHistoryDrawer.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/ExerciseHistoryDrawer.tsx) | `ExerciseHistoryDrawer` | Slide-out drawer displaying past historical sets for an individual exercise. |
| [`src/components/Gym/GymProfileModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/GymProfileModal.tsx) | `GymProfileModal` | User fitness profile: height, weight, lifting experience, and primary goal. |
| [`src/components/Gym/GymScheduleSettingsModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/GymScheduleSettingsModal.tsx) | `GymScheduleSettingsModal` | Custom 7-day schedule pattern editor (e.g. Tue–Sun with Mon Rest). |
| [`src/components/Gym/GymTemplateModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/GymTemplateModal.tsx) | `GymTemplateModal` | Workout routine template importer (PPL, Arnold Split, Upper/Lower, Full Body). |
| [`src/components/Gym/AddCardioModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/AddCardioModal.tsx) | `AddCardioModal` | Modal for adding cardio exercises (Treadmill, Cycle, Stairmaster). |
| [`src/components/Gym/LogCardioModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/LogCardioModal.tsx) | `LogCardioModal` | Cardio session metric logger (distance, duration, calories, incline). |
| [`src/components/Gym/CardioSection.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/CardioSection.tsx) | `CardioSection` | Cardio block container inside ActiveLoggingScreen. |
| [`src/components/Gym/PRHallOfFameSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/PRHallOfFameSheet.tsx) | `PRHallOfFameSheet` | Personal Records Hall of Fame displaying all-time best lifts per exercise. |
| [`src/components/Gym/SwapRoutineModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/SwapRoutineModal.tsx) | `SwapRoutineModal` | Modal for switching between PPL and Arnold Split routines. |
| [`src/components/Gym/WorkoutBanner.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/WorkoutBanner.tsx) | `WorkoutBanner` | Today's workout split summary hero banner on GymHome. |
| [`src/components/Gym/WorkoutTimer.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/WorkoutTimer.tsx) | `WorkoutTimer` | Elapsed workout duration stopwatch component. |
| [`src/components/Gym/Charts/ConsistencyHeatmap.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/Charts/ConsistencyHeatmap.tsx) | `ConsistencyHeatmap` | 52-week GitHub-style workout consistency heatmap grid. |
| [`src/components/Gym/Charts/StrengthProgressionChart.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/Charts/StrengthProgressionChart.tsx) | `StrengthProgressionChart` | Estimated 1RM strength curve chart over 30/60/90 days. |
| [`src/components/Gym/Charts/MuscleDonutChart.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/Charts/MuscleDonutChart.tsx) | `MuscleDonutChart` | SVG donut chart showing set volume breakdown by muscle group. |
| [`src/components/Gym/Charts/MuscleDistributionChart.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/Charts/MuscleDistributionChart.tsx) | `MuscleDistributionChart` | Horizontal bar chart of sets performed per muscle group. |
| [`src/components/Gym/Charts/VolumeBarChart.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/Charts/VolumeBarChart.tsx) | `VolumeBarChart` | 7-day daily volume comparison bar chart. |
| [`src/components/Gym/Charts/VolumeTrendLine.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/Charts/VolumeTrendLine.tsx) | `VolumeTrendLine` | Line chart displaying total lifting tonnage progression. |
| [`src/components/Gym/Charts/PRFeed.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Gym/Charts/PRFeed.tsx) | `PRFeed` | Feed of recent Personal Record achievements. |
| **Habits Components** (`src/components/Habits/`) | | |
| [`src/components/Habits/HabitReminderModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Habits/HabitReminderModal.tsx) | `HabitReminderModal` | Modal for configuring daily habit notification reminder times. |
| **Learning Components** (`src/components/Learning/`) | | |
| [`src/components/Learning/LearningVideoPlayer.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/LearningVideoPlayer.tsx) | `LearningVideoPlayer` | YouTube iframe player with synchronized interactive transcript drawer and AI chat. |
| [`src/components/Learning/FlashcardReviewModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/FlashcardReviewModal.tsx) | `FlashcardReviewModal` | 3D flippable card deck with SM-2 grading buttons (Again, Hard, Good, Easy). |
| [`src/components/Learning/VsCodeSyntaxHighlighter.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/VsCodeSyntaxHighlighter.tsx) | `VsCodeSyntaxHighlighter` | VS Code Dark+ syntax highlighter with line numbers and 1-tap copy. |
| [`src/components/Learning/LearningTopicCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/LearningTopicCard.tsx) | `LearningTopicCard` | Course curriculum topic card with video checkpoints and progress rings. |
| [`src/components/Learning/LearningModals.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/LearningModals.tsx) | `AddTopicModal`, `ImportSyllabusModal` | Modals for creating learning topics and importing AI syllabuses. |
| [`src/components/Learning/LectureChatHistoryModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/LectureChatHistoryModal.tsx) | `LectureChatHistoryModal` | Drawer displaying past lecture AI conversation sessions with 1-tap switching. |
| [`src/components/Learning/LectureMindMap.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/LectureMindMap.tsx) | `LectureMindMap` | Interactive SVG mind map visualizing hierarchical lecture concepts. |
| [`src/components/Learning/InlineCodeRunner.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/Learning/InlineCodeRunner.tsx) | `InlineCodeRunner` | Code snippet sandbox runner with syntax highlighting. |
| **Placement Hub Components** (`src/components/PlacementHub/`) | | |
| [`src/components/PlacementHub/LeetCodeTracker.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/PlacementHub/LeetCodeTracker.tsx) | `LeetCodeTracker` | LeetCode user stat card with live problem breakdown and rating trends. |
| [`src/components/PlacementHub/DSAHeatmap.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/PlacementHub/DSAHeatmap.tsx) | `DSAHeatmap` | Coding activity heatmap displaying daily submission intensity. |
| [`src/components/PlacementHub/DSALogger.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/PlacementHub/DSALogger.tsx) | `DSALogger` | Sheet for logging solved algorithmic problem notes and approaches. |
| [`src/components/PlacementHub/PanicModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/PlacementHub/PanicModal.tsx) | `PanicModal` | High-yield emergency interview formula sheet & algorithm cheatsheet. |
| [`src/components/PlacementHub/PatternVaultModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/PlacementHub/PatternVaultModal.tsx) | `PatternVaultModal` | 14 core coding patterns vault (Two Pointers, Sliding Window, Top K, etc.). |
| [`src/components/PlacementHub/BlockCalendar.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/PlacementHub/BlockCalendar.tsx) | `BlockCalendar` | Block time schedule grid for placement interview rounds. |
| [`src/components/PlacementHub/SundayReflectionModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/PlacementHub/SundayReflectionModal.tsx) | `SundayReflectionModal` | Weekly career reflection & job application review modal. |
| **SARA Components** (`src/components/SARA/`) | | |
| [`src/components/SARA/VoiceOrb.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/VoiceOrb.tsx) | `VoiceOrb` | Animated fluid canvas orb displaying idle, listening, thinking, and speaking states. |
| [`src/components/SARA/VoiceMicButton.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/VoiceMicButton.tsx) | `VoiceMicButton` | Mic icon button with animated soundwave ripple in chat input bar. |
| [`src/components/SARA/ReasoningFeed.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/ReasoningFeed.tsx) | `ReasoningFeed` | Live step-by-step thinking drawer showing SARA's internal decisions during inference. |
| [`src/components/SARA/SaraBubble.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/SaraBubble.tsx) | `SaraBubble` | AI chat bubble with Markdown rendering, code highlighting, and action cards. |
| [`src/components/SARA/ActionConfirmationCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/ActionConfirmationCard.tsx) | `ActionConfirmationCard` | Tier 3 action confirmation card with Confirm / Dismiss controls. |
| [`src/components/SARA/BatchActionCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/BatchActionCard.tsx) | `BatchActionCard` | Card confirming multiple sequential actions (DAG batch execution). |
| [`src/components/SARA/InlineActionPill.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/InlineActionPill.tsx) | `InlineActionPill` | Tier 2 lightweight action pill embedded inside chat text. |
| [`src/components/SARA/SaraHUDBanner.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/SaraHUDBanner.tsx) | `SaraHUDBanner` | Predictive Surface Injection (PSI) top banner on screens with critical alerts. |
| [`src/components/SARA/SaraHUDToast.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/SaraHUDToast.tsx) | `SaraHUDToast` | Ambient notification toast for completed background actions. |
| [`src/components/SARA/StreamingText.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/SARA/StreamingText.tsx) | `StreamingText` | Smooth token-by-token typewriter text animator for streaming responses. |
| **UI Primitives** (`src/components/ui/`) | | |
| [`src/components/ui/BottomSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/BottomSheet.tsx) | `BottomSheet` | Ultra-fast 180ms cubic-bezier bottom sheet modal wrapper with drag-to-dismiss. |
| [`src/components/ui/FloatingActionButton.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/FloatingActionButton.tsx) | `FloatingActionButton` | Reusable floating action button with icon and glow effects. |
| [`src/components/ui/GlassCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/GlassCard.tsx) | `GlassCard` | Frosted glassmorphism card wrapper using `expo-blur`. |
| [`src/components/ui/EmptyState.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/EmptyState.tsx) | `EmptyState` | Consistent placeholder component for empty lists with icon, title, and CTA button. |
| [`src/components/ui/FadeModal.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/FadeModal.tsx) | `FadeModal` | Alpha-fading modal backdrop container with centered content dialog. |
| [`src/components/ui/IOSScrollView.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/IOSScrollView.tsx) | `IOSScrollView` | ScrollView wrapper with bounce physics and content insets. |

### 4.10. Custom Hooks (`src/hooks/`)
| File Path | Hook Export | Signature / Return Type | Purpose & Details |
|---|---|---|---|
| [`src/hooks/useGymLog.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useGymLog.ts) | `useGymLog` | `(overrideDateStr?: string) => GymLogHookState` | Workout session state machine. Exports `log`, `updateSet`, `toggleSetComplete`, `addSet`, `removeSet`, `addExercise`, `deleteExercise`, `swapExercise`, `startWorkout`, `endWorkout`, `startRestTimer`, `prMap`. |
| | `todayStr` | `() => string` | Returns local `YYYY-MM-DD` date string (eliminates UTC midnight bugs in IST). |
| | `dateStrOffset` | `(offsetDays: number, fromStr?: string) => string` | Adds/subtracts days relative to a local date string. |
| | `planDayIndexForDate` | `(dateStr: string) => number` | Maps a date to 1 of 7 day indexes in the master split. |
| [`src/hooks/useGymProfile.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useGymProfile.ts) | `useGymProfile` | `() => { profile: GymProfile, updateProfile: (p: Partial<GymProfile>) => Promise<void> }` | Manages user gym profile and body stats persistence. |
| [`src/hooks/usePlacementData.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/usePlacementData.ts) | `usePlacementData` | `() => PlacementHookState` | Placement Hub state machine: LeetCode profile scraper, DSA problem checkboxes, Pattern Vault notes, and mock interview logs. |
| [`src/hooks/useSaraNavigation.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useSaraNavigation.ts) | `useSaraNavigation` | `() => { processAnswerForNavigation: (text: string) => void }` | Regex extractor searching for `[NAVIGATE:ScreenName]` in SARA responses and executing React Navigation transitions. |
| [`src/hooks/useSaraSurface.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useSaraSurface.ts) | `useSaraSurface` | `(screenName: string, options?: any) => { activeBanner: any, dismissBanner: () => void }` | **Capability 5 (PSI)**: Evaluates per-screen anomaly triggers (e.g. attendance < 75%) and displays non-intrusive HUD banners with 60s cooldowns. |
| [`src/hooks/useTabBarBadges.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useTabBarBadges.ts) | `useTabBarBadges` | `() => Record<string, number>` | Computes active notification badge counts for bottom tab navigation icons (pending tasks, at-risk classes, gym workouts). |
| [`src/hooks/useProactiveAgent.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useProactiveAgent.ts) | `useProactiveAgent` | `() => void` | Runs background conflict detection and anomaly checks when app state changes. |
| [`src/hooks/useCachedFirestoreCollection.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useCachedFirestoreCollection.ts) | `useCachedFirestoreCollection` | `<T>(collection: string, cacheKey: string, parser: (d: any) => T) => { data: T[], loading: boolean }` | Generic hook providing instant AsyncStorage stale-while-revalidate cache hydration followed by live Firestore updates. |
| [`src/hooks/useDeferredMemo.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useDeferredMemo.ts) | `useDeferredMemo` | `<T>(factory: () => T, deps: any[]) => T` | Defers expensive computations to `InteractionManager.runAfterInteractions` to preserve 60/120fps UI animations. |
| [`src/hooks/useSafeTimeout.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useSafeTimeout.ts) | `useSafeTimeout` | `() => { setSafeTimeout: (fn: () => void, ms: number) => void }` | Memory-safe timeout wrapper automatically clearing pending handles on component unmount. |

### 4.11. Utilities & Algorithmic Engines (`src/utils/`)
| File Path | Exported Function | Signature / Type | Description & Purpose |
|---|---|---|---|
| [`src/utils/safeWrite.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/safeWrite.ts) | `safeWrite` | `(firestoreFn: () => Promise<any>, collection: string, op: 'add'\|'update'\|'delete'\|'set', data: any, docId?: string) => Promise<any>` | Universal write router: executes Firestore writes directly when online, falls back to AsyncStorage queue when offline without throwing exceptions. |
| | `safeAdd`, `safeUpdate`, `safeDelete` | Convenience Wrappers | Shorthand helper functions for document mutations. |
| [`src/utils/bootManifest.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/bootManifest.ts) | `loadBootManifest` | `() => Promise<BootManifest>` | Fetches all cold-start storage keys in 1 atomic native C++ `AsyncStorage.multiGet` call, saving ~50ms on cold boot. |
| | `getBootManifestSync` | `() => BootManifest \| null` | 0.00ms synchronous in-memory L1 cache lookup. |
| | `updateL1Cache` | `<K extends keyof BootManifest>(key: K, value: BootManifest[K]) => void` | Updates in-memory L1 cache on write operations to maintain instant consistency. |
| | `clearBootManifest` | `() => void` | Wipes boot cache on user sign-out. |
| [`src/utils/coreCache.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/coreCache.ts) | `readCoreCacheMulti` | `() => Promise<{ tasks: Task[], habits: Habit[], habitLogs: HabitLog[] }>` | Reads tasks, habits, and habit logs from AsyncStorage. |
| | `writeCoreCacheMulti` | `(partial: { tasks?: Task[], habits?: Habit[], habitLogs?: HabitLog[] }) => Promise<void>` | Writes tasks, habits, and habit logs to AsyncStorage cache. |
| | `clearCoreCache` | `() => Promise<void>` | Clears core data cache on logout. |
| [`src/utils/domainCache.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/domainCache.ts) | `readWellnessCache`, `writeWellnessCache` | Async Functions | AsyncStorage caching for Gym, Water, Sleep, and Weight logs. |
| | `readAcademicCache`, `writeAcademicCache` | Async Functions | AsyncStorage caching for Attendance, Timetable, and Assignments. |
| | `readCreativeCache`, `writeCreativeCache` | Async Functions | AsyncStorage caching for Storage Nodes, Learning Topics, and Jobs. |
| | `readPlannerCache`, `writePlannerCache` | Async Functions | AsyncStorage caching for Calendar Events, Goals, and Reviews. |
| | `clearAllDomainCaches` | `() => Promise<void>` | Wipes all 4 domain storage caches on logout. |
| [`src/utils/schemaGuards.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/schemaGuards.ts) | `parseTask`, `parseHabit`, `parseHabitLog`, `parseGymLog`, `parseAttendanceSubject`, `parseAssignment`, `parseStorageNode`, `parseGoal`, `parseCustomEvent`, `parseLearningTopic` | `(data: any, id: string) => ValidatedDocumentType` | Strict defensive schema parsers injecting fallback defaults for corrupted or legacy Firestore documents. |
| | `sanitizeString`, `sanitizeNumber`, `sanitizeEnum`, `sanitizeDateStr` | Normalizer Functions | Clamps numerical ranges, handles Unicode surrogate pairs (emojis), and validates enums. |
| [`src/utils/ModulePrefetcher.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/ModulePrefetcher.tsx) | `cacheAwareLazy` | `(id: string, importer: () => Promise<any>) => React.ComponentType<any>` | Creates lazy component wrapper that renders synchronously on frame 1 once cached in memory. |
| | `startPrefetching` | `(pinnedModules?: string[]) => void` | Background-loads tab screen JS bundles in staggered 35ms frames after interaction settles. |
| | `preloadNow` | `(id: string) => Promise<void>` | Immediately imports a specific screen module into memory. |
| [`src/utils/haptics.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/haptics.ts) | `feedback.tap`, `feedback.commit`, `feedback.success`, `feedback.warning`, `feedback.error` | Helper Functions | Standardized tactile vibration wrappers using `expo-haptics`. |
| [`src/utils/dateUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/dateUtils.ts) | `parseNaturalLanguageTask` | `(text: string) => ParsedTaskNLPResult` | Industry-leading natural language date/time/recurrence/priority parser with live token highlighting spans. |
| | `formatDateLong`, `formatDateShort`, `formatDateWithDay`, `formatDateFull`, `formatDateNumeric` | Formatters | Day-first date formatting helpers (`DD-MM-YYYY` Indian convention). |
| | `formatLocalDateStr`, `getTodayLocalDateStr` | `(d?: Date) => string` | Local timezone date string assembler preventing UTC midnight date shifts. |
| | `timeAgo` | `(dateInput: any) => string` | Converts timestamps to relative time strings (`"2h ago"`, `"yesterday"`). |
| [`src/utils/streakUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/streakUtils.ts) | `calculateAppStreak` | `(tasks, gymLogs, habitLogs, learningTopics) => number` | Computes global user streak with Sunday rest day immunity. |
| | `calculateLongestAppStreak` | `(tasks, gymLogs, habitLogs, learningTopics) => number` | Computes all-time longest streak record. |
| | `calculateHabitStreak` | `(habitLogs, habitId) => { streak: number, longestStreak: number }` | Computes individual habit streak count and freeze continuity. |
| [`src/utils/academicMath.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/academicMath.ts) | `calculateBunkMath` | `(attended: number, total: number, targetPct?: number) => BunkMathResult` | Calculates exact number of classes user can safely bunk or must attend consecutively to maintain target %. |
| [`src/utils/gymUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/gymUtils.ts) | `calculate1RM` | `(weight: number, reps: number) => number` | Calculates Estimated 1-Rep Max using Brzycki formula. |
| | `calculateVolume` | `(sets: GymSet[]) => number` | Sums weight × reps for completed workout sets. |
| | `toCanonicalMuscle` | `(raw: string) => string` | Maps micro-target muscle strings to 1 of 12 canonical muscle groups. |
| [`src/utils/exportUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/exportUtils.ts) | `exportToCSV`, `exportToExcel` | File Exporters | Generates downloadable CSV and Excel spreadsheets using `xlsx` and `expo-sharing`. |
| [`src/utils/errorUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/errorUtils.ts) | `handleSyncError` | `(err: any) => void` | Non-blocking error handler suppressing transient network timeouts in console. |
| [`src/utils/firebaseUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/firebaseUtils.ts) | `deepSanitize` | `(obj: any) => any` | Recursively strips `undefined` keys to prevent Firestore write crashes. |
| [`src/utils/tabBarScroll.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/tabBarScroll.ts) | `scrollToActiveTab` | `(scrollViewRef: any, tabIndex: number) => void` | Centers the active tab button in the horizontal Telegram tab bar. |

### 4.12. Theme, Design Tokens & Animation Presets (`src/theme/`)
| File Path | Exported Symbol | Type / Structure | Description & Purpose |
|---|---|---|---|
| [`src/theme/tokens.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/theme/tokens.ts) | `DARK_COLORS`, `LIGHT_COLORS` | `ColorTokens` | Comprehensive color palettes for Obsidian Cosmos (dark) and Frost Quartz (light). |
| | `FONT_FAMILY` | `Record<string, string>` | Typography font families (`title`, `body`, `medium`, `bold`). |
| | `SPACE`, `RADIUS`, `FONT_SIZE`, `SHADOW` | Tokens | Standardized 8px spacing scale, border radii, font sizes, and elevation presets. |
| [`src/theme/animations.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/theme/animations.ts) | `CARD_PRESS_ANIMATION`, `SPRING_PRESETS` | Reanimated Presets | UI thread worklet spring and timing animation configurations. |
| [`src/theme/motion.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/theme/motion.ts) | `DURATION`, `EASING` | Motion Constants | Standardized animation transition durations and cubic easing curves. |

### 4.13. Static Data & Templates (`src/data/`)
| File Path | Exported Constant | Structure / Description |
|---|---|---|
| [`src/data/gymPlan.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/data/gymPlan.ts) | `GYM_PLAN`, `GYM_PLAN_PPL`, `GYM_PLAN_ARNOLD`, `WEEKDAY_TO_PLAN` | Master 6-day Push/Pull/Legs and Arnold Split routine templates with target sets/reps and YouTube demo IDs. |
| [`src/data/exerciseDatabase.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/data/exerciseDatabase.ts) | `EXERCISE_CATALOGUE`, `EXERCISE_ALTERNATIVES` | Comprehensive 100+ exercise library with anatomical muscle mappings and equipment requirements. |
| [`src/data/brutalQuotes.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/data/brutalQuotes.ts) | `BRUTAL_QUOTES` | Curated psychological discipline and accountability quotes pool used by SARA on Dashboard. |

### 4.14. TypeScript Type Definitions (`src/types/`)
| File Path | Key TypeScript Interfaces | Description & Data Structures |
|---|---|---|
| [`src/types/gym.types.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/types/gym.types.ts) | `GymExercise`, `GymPlanDay`, `GymSet`, `GymDayLog`, `GymCardioLog`, `UserGymPlanDoc` | Complete typed interfaces for workout plans, exercise logs, set entries, cardio logs, and custom user splits. |

---

## 5. Navigation & Screen Graph

```
AppNavigator (Auth Gate & Boot Coordinator)
├── State: appReady === false ──► Splash Background (0ms native window paint)
├── State: user === null
│   └── Stack.Navigator (animation: 'fade')
│       ├── Landing          ──► LandingScreen (Welcome Hero)
│       ├── GuestDashboard   ──► GuestDashboard (Offline Sample Preview)
│       ├── Auth             ──► AuthScreen (Google / Apple One-Tap)
│       └── Terms            ──► TermsScreen (Privacy & Terms)
├── State: user !== null && !onboarded
│   └── OnboardingStack
│       └── Onboarding       ──► OnboardingScreen (5-Step Psychological Persona Setup)
└── State: user !== null && onboarded
    └── RootNavigatorWithSara
        ├── Stack.Navigator (Root Stack)
        │   ├── MainTabs (BottomTabNavigator via TelegramTabBar)
        │   │   ├── Home             ──► DashboardScreen
        │   │   ├── [Pinned Tab 1]   ──► TasksScreen (default)
        │   │   ├── [Pinned Tab 2]   ──► GymStack (default)
        │   │   ├── [Pinned Tab 3]   ──► CalendarScreen (default)
        │   │   ├── [Pinned Tab 4]   ──► AttendanceScreen (default)
        │   │   └── More             ──► MoreScreen (Module Launcher)
        │   └── MoreStack (Group: card presentation, slide_from_right)
        │       ├── Settings               ──► SettingsScreen
        │       ├── NotificationsSettings  ──► NotificationsSettingsScreen
        │       ├── Habits                 ──► HabitsScreen
        │       ├── Notes                  ──► NotesScreen
        │       ├── Goals                  ──► GoalsScreen
        │       ├── Grades                 ──► GradesScreen
        │       ├── Learning               ──► LearningScreen
        │       ├── PlacementHub           ──► PlacementHubScreen
        │       ├── Analytics              ──► AnalyticsScreen
        │       ├── WellbeingDashboard     ──► WellbeingDashboardScreen
        │       ├── XPConstellation        ──► XPConstellationScreen
        │       ├── ContentLibrary         ──► ContentLibraryScreen
        │       ├── StreakDetail           ──► StreakDetailScreen
        │       ├── StudyRoom              ──► StudyRoomScreen
        │       ├── WeeklyReview           ──► WeeklyReviewScreen
        │       └── AgentHistory           ──► AgentHistoryScreen
        ├── GlobalSaraButton (Floating Action Orb on Home/Tasks/Analytics)
        └── SaraScreen (transparentModal overlay on orb tap)
```

---

## 6. SARA AI Engine v2 — Full Data Flow

```
User Voice / Text Input
         │
         ▼
[1] Intent-Ranked Context Injection (IRCI — intentClassifier.ts)
    • Synchronous on-device regex classification (<5ms)
    • Ranks domains (tasks, gym, attendance, calendar, goals)
    • Injects ONLY relevant domain records (~400 tokens vs ~4,000 tokens)
         │
         ▼
[2] Contextual Memory Graph (CMG) & Behavioral Fingerprint (BFE — saraMemory.ts)
    • Injects long-term facts, preferences, stress level, and customized tone directive
         │
         ▼
[3] Direct Gemini REST API (geminiProxy.ts)
    • Direct HTTPS call to generativelanguage.googleapis.com (gemini-2.5-flash)
    • Autonomous 9-key round-robin rotation on 429 rate limits
    • Live streaming reasoning steps emitted to ReasoningFeed.tsx
         │
         ▼
[4] Output Parsing & Action Policy Gateway (saraActionPolicy.ts)
    ┌─────────────────────────────────────────────────────────────┐
    │ Case A: Standard Conversational Answer                      │
    │   • Clean text rendered in SaraBubble.tsx                   │
    │   • Spoken aloud via Sarvam Indic TTS (sarvamProxy.ts)      │
    │   • Extracts [NAVIGATE:X] token for automatic screen jumps  │
    ├─────────────────────────────────────────────────────────────┤
    │ Case B: Autonomous Action ([[ACTION:{...}]])                │
    │   • Tier 1 (Confidence > 0.95, Reversible): Auto-execute    │
    │   • Tier 2 (Confidence 0.70-0.95): Inline Action Pill      │
    │   • Tier 3 (Confidence < 0.70 / Destructive): Confirm Card  │
    │   • Approved writes route through safeWrite() to Firestore │
    ├─────────────────────────────────────────────────────────────┤
    │ Case C: Bulk / Multi-Step Intent ([[DAG:[...]]])            │
    │   • Parsed into Directed Acyclic Graph (dagExecutor.ts)     │
    │   • Parallel node execution across multiple rotated keys    │
    └─────────────────────────────────────────────────────────────┘
```

---

## 7. Data Layer & 18 Firestore Collections

All document operations enforce `where('userId', '==', uid)` queries.

| Collection Name (`COLLECTION`) | State Variable | TS Interface | Description & Primary Fields |
|---|---|---|---|
| `todos` (`TASKS`) | `tasks` | `Task` | Tasks & missions (`title`, `status`, `priority`, `date`, `timeSlot`, `subtasks`, `isRecurring`, `recurrenceRule`, `recurringSourceId`, `completedAt`). |
| `habits` | `habits`, `allHabits` | `Habit` | Daily/weekly habits (`name`, `emoji`, `frequency`, `streak`, `longestStreak`, `archived`, `type`). |
| `habitLogs` | `habitLogs` | `HabitLog` | Daily habit completion log (`habitId`, `date`, `count`, `isFreeze`). |
| `gym_logs` | `gymLogs` | `GymLog` | Gym sessions (`date`, `exercises`, `cardio`, `workoutStartTime`, `workoutDurationMinutes`, `completed`, `dayPlanIndex`). |
| `user_gym_plans` | `userGymPlan` | `UserGymPlanDoc` | Custom 7-day workout split & exercise overrides (`customDays`, `templateId`, `schedulePattern`). |
| `attendance_subjects` | `attendance` | `AttendanceSubject` | University courses (`name`, `classesAttended`, `classesTotal`, `labsAttended`, `labsTotal`, `targetPercentage`, `schedule`). |
| `attendance_logs` | `attendanceLogs` | `AttendanceLog` | Class-by-class attendance history (`subjectId`, `date`, `type`, `action`, `isExtra`, `timestamp`). |
| `attendance_holidays` | `holidays` | `string[]` | Scheduled college holidays (`date`). |
| `assignments` | `assignments` | `Assignment` | Academic homework & submissions (`title`, `subjectName`, `dueDate`, `status`, `grade`, `weightage`). |
| `semesters` | `semesters` | `Semester` | Academic semester terms (`name`, `startDate`, `endDate`, `sgpa`, `totalCredits`, `order`). |
| `semester_subjects` | `semesterSubjects` | `SemesterSubject` | Subjects enrolled in semester (`semesterId`, `name`, `credits`, `gradePoints`, `grade`). |
| `calendar_events` | `customEvents` | `CustomEvent` | Calendar schedule (`title`, `date`, `startTime`, `endTime`, `type`, `location`, `description`). |
| `goals` | `goals` | `Goal` | OKR Goals (`title`, `status`, `progress`, `deadline`, `keyResults`, `firstStep`). |
| `storage_nodes` | `storageNodes` | `StorageNode` | Filesystem & ZenNotes (`name`, `type`, `parentId`, `url`, `content`, `size`, `tags`). |
| `learning_topics` | `learningTopics` | `LearningTopic` | Curriculums & Video lectures (`title`, `subTasks`, `timeSpentMinutes`, `lastStudiedAt`). |
| `flashcards` | `flashcards` | `Flashcard` | SM-2 spaced repetition cards (`topicId`, `front`, `back`, `interval`, `repetitions`, `easeFactor`, `dueDate`). |
| `job_applications` | `jobs` | `JobApplication` | Career Kanban (`company`, `role`, `status`, `dateApplied`, `expectedSalary`, `prepChecklist`). |
| `weekly_reviews` | `weeklyReviews` | `WeeklyReview` | Sunday retrospective reviews (`weekStart`, `weekEnd`, `wentWell`, `toImprove`, `nextWeekPriorities`). |
| `water_logs` | `waterLogs` | `WaterLog` | Daily hydration entries (`date`, `amountMl`). |
| `sleep_logs` | `sleepLogs` | `SleepLog` | Sleep tracking entries (`date`, `hours`, `quality`, `bedTime`, `wakeTime`). |
| `weight_logs` | `weightLogs` | `WeightLog` | Bodyweight entries (`date`, `weightKg`, `photoUrl`). |
| `content_logs` | `contentLogs` | `ContentLog` | Reading list items (`title`, `contentType`, `status`, `progressPercentage`). |
| `pomodoro_sessions` | — | `PomodoroSession` | Completed focus intervals (`taskId`, `durationMinutes`, `mode`, `completedAt`). |
| `user_profiles` | — | `UserProfile` | User device profile (`pushToken`, `displayName`, `email`). |

---

## 8. Offline-First & Data Loss Prevention Architecture

ZenTrack Mobile guarantees zero data loss and immediate visual feedback using an asynchronous, non-blocking offline pipeline.

```
UI Interaction (User edits task, logs gym set, marks attendance)
         │
         ▼
[1] Optimistic UI State Update (Local React State)
    • Local state updates in < 1ms — zero loading spinner or freeze.
         │
         ▼
[2] L1/L2 Cache Write-Through (AsyncStorage)
    • Updates `readCoreCacheMulti()` / `domainCache` immediately.
    • Survives immediate app kill or phone crash.
         │
         ▼
[3] safeWrite() Execution Router (safeWrite.ts)
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼ Online                                                        ▼ Offline
Direct Firestore Write                                  Queue Write (offlineSync.ts)
• Calls setDoc / updateDoc / addDoc                     • Writes to `@zentrack_offline_write_queue`
• If network drops mid-request ──► Catches error ──────► • Coalesces rapid updates to same doc
                                                        • Broadcasts queue count to OfflineIndicator
                                                                    │
                                                                    ▼
                                                        NetInfo Reconnection Event
                                                        • NetInfo detects network active
                                                        • syncOfflineQueue() drains queue in batch
                                                        • Shows green "Synced N items" toast
```

---

## 9. Notification Engine & Schedule Matrix

- **Driver**: `expo-notifications ~0.32.17` (Local On-Device Engine — $0.00 cloud cost).
- **Trigger Strategy**: Debounced evaluation (`scheduleAllNotifications()`) in `MobileDataContext.tsx` fires 3.5s after data settles.

### Android Channels
| Channel ID | Channel Name | Importance | Vibration Pattern |
|---|---|---|---|
| `default` | ZenTrack Primary | `MAX` | `[0, 250, 250, 250]` |
| `reminders` | Task & Class Reminders | `HIGH` | `[0, 500, 200, 500]` |

### Schedule Decision Matrix
| Event Trigger | Timing | Title Pattern | Channel |
|---|---|---|---|
| Task with `timeSlot` | 60 min before | `Mission Window 🎯` | `reminders` |
| Task with `timeSlot` | 15 min before | `T-15 Minutes ⚡` | `reminders` |
| Daily Tasks Pending | Configured time (default `08:00`) | `Daily Briefing 📋` | `default` |
| Calendar Event with `startTime` | 60 min before | `Incoming Comm 📅` | `default` |
| Scheduled Gym Day (Not Logged) | Configured time (default `18:00`) | `Physical Momentum 🏋️` | `default` |
| Scheduled Class / Lab Day | 15 min before class | `Academic Protocol 📚` | `reminders` |
| Attendance Under Target (<75%) | Configured briefing time | `Attendance Danger Zone ⚠️` | `default` |
| Hydration Reminder | Every 2.5h (8 AM – 8 PM) | `Hydration Check 💧` | `default` |

---

## 10. Design System & Theme Tokens

File: `src/theme/tokens.ts` (Dynamic theme via `useTheme()`)

### Dual Color Palette
| Token Name | Obsidian Cosmos (Dark) | Frost Quartz (Light) | Semantic Purpose |
|---|---|---|---|
| `background` | `#000000` | `#F4F3F8` | True OLED black / Frosted quartz canvas |
| `surface` | `#1c1c1e` | `#FFFFFF` | Primary card container surface |
| `surface2` | `#141416` | `#F0EFF7` | Secondary / nested container |
| `surfaceRaised`| `#2c2c2e` | `#FFFFFF` | Elevated bottom sheets and modals |
| `border` | `#2c2c2e` | `#E2E1EA` | Hairline dividers and borders |
| `borderGlow` | `rgba(165,153,255,0.40)` | `rgba(108,92,231,0.25)` | Active focus ring |
| `textPrimary` | `#ffffff` | `#1C1C1E` | Headings, hero stats, primary labels |
| `textSecondary`| `#f2f2f7` | `#48484A` | Body prose and descriptions |
| `textMuted` | `#8e8e93` | `#8E8E93` | Subtitles, timestamps, placeholders |
| `accentPrimary`| `#a599ff` | `#6C5CE7` | SARA interactive accent / Purple glow |
| `accentGreen` | `#5eda9e` | `#059669` | Success, completed tasks, present |
| `accentAmber` | `#ff9f4d` | `#D97706` | Warning, pending, at-risk attendance |
| `accentBlue` | `#89dceb` | `#0284C7` | Calendar, schedule, hydration |
| `error` | `#ff6961` | `#DC2626` | Destructive, overdue, absent, P1 high |

### Typography (`FONT_FAMILY`)
- `FONT_FAMILY.title`: `PlayfairDisplay_600SemiBold` (Hero editorial titles)
- `FONT_FAMILY.body`: `Inter_400Regular` (Prose, descriptions, inputs)
- `FONT_FAMILY.medium`: `Inter_500Medium` (Card headers, chip labels)
- `FONT_FAMILY.bold`: `Inter_600SemiBold` (CTAs, metric numbers, badges)

---

## 11. Gamification & XP System

File: `src/services/xpSystem.ts`

### Reward Allocation Matrix
| User Action | Base XP | Bonus / Multiplier |
|---|---|---|
| Task Completed | 25–50 XP | Variable Skinner reward |
| Habit Completed | 15 XP | Fixed |
| 7-Day Habit Streak | +75 XP | Milestone badge |
| 30-Day Habit Streak | +300 XP | Milestone badge |
| Gym Workout Completed | 40–60 XP | Scaled by workout volume |
| Lecture Completed | +25 XP | Fixed |
| Flashcard Deck Reviewed | +10 XP | Fixed |
| Lecture Quiz 3/3 Perfect | +50 XP | Achievement bonus |
| Goal Key Result Achieved | +200 XP | Fixed |
| Perfect Day (All Tasks + Habits + Gym) | +500 XP | Daily completion bonus |
| Onboarding Finished | +100 XP | One-time bootstrap |
| Surprise Dopamine Bonus | +50–200 XP | 10% random probability |

### Rank Thresholds
`Initiate (0 XP) ➔ Operator (500) ➔ Commander (1,500) ➔ Strategist (3,500) ➔ Vanguard (7,000) ➔ Architect (13,000) ➔ Legend (22,000) ➔ Mythic (35,000+ XP)`

---

## 12. AsyncStorage Registry

All storage keys must be imported from `src/config/constants.ts → STORAGE_KEYS`.

| Key Constant | Storage Key String | Default Value | Purpose |
|---|---|---|---|
| `PINNED_MODULES` | `@zentrack_pinned_modules` | `['Tasks','Gym','Calendar','Attendance']` | Pinned bottom navigation tab configuration. |
| `DEFAULT_NOTIF_TIME` | `zentrack_default_notif_time` | `'08:00'` | User's preferred daily morning brief notification time. |
| `GYM_NOTIF_TIME` | `zentrack_gym_notif_time` | `'18:00'` | User's preferred gym reminder notification time. |
| `XP_DATA` | `zentrack_xp_v1` | `'0'` | Total user XP accumulated. |
| `XP_STREAK` | `zentrack_xp_streak` | `'0'` | Consecutive active user day streak. |
| `ONBOARDED` | `zentrack_onboarded_v2` | `null` | Flag indicating onboarding questionnaire completion. |
| `GOOGLE_TOKEN` | `google_workspace_token` | `null` | Google OAuth workspace access token. |
| `THEME` | `@zentrack_theme` | `'dark'` | Theme preference (`'dark'`, `'light'`, `'system'`). |
| `SARA_CMG` | `@sara_cmg_v1` | `null` | SARA Contextual Memory Graph JSON. |
| `SARA_FINGERPRINT` | `@sara_fingerprint_v1` | `null` | SARA Behavioral Fingerprint JSON. |
| `SARA_SURFACE_LAST`| `@sara_surface_last_v1` | `{}` | PSI injection timestamps per screen (JSON). |
| `DASHBOARD_LAYOUT` | `@zentrack_dashboard_layout` | `null` | User-configured Dashboard widget arrangement. |
| `OFFLINE_QUEUE` | `@zentrack_offline_write_queue` | `[]` | Pending offline Firestore write operations. |
| `OPTIMISTIC_USER` | `@zentrack_optimistic_user` | `null` | Cached user profile for 0ms offline boot. |

---

## 13. Security, Biometrics & Auth State Machine

### Authentication Lifecycle & Self-Healing
1. **0ms Optimistic Boot**: `AppNavigator` reads `@zentrack_optimistic_user` during `loadBootManifest()`. If found, boots into the main interface immediately without waiting for network.
2. **Foreground Token Handshake**: On `AppState: active`, `AppNavigator` triggers `auth.currentUser.getIdToken(true)`.
   - If token refresh succeeds: broadcasts `DeviceEventEmitter('firestore_force_reconnect')` to wake dead listeners.
   - If fatal error (`FATAL_AUTH_CODES` like `invalid_grant`, `auth/user-disabled`, `auth/id-token-revoked`): calls `performSignOut()` and redirects to `AuthScreen`.
3. **8-Second Dead Session Recovery Window**: When Firebase `onAuthStateChanged(null)` fires:
   - If user explicitly logged out: wipes storage immediately.
   - If user was logged in: initiates an 8-second timer. If Firebase restores the user (standard token rotation blip), the timer is cancelled. If `auth.currentUser` remains null after 8s, executes `performSignOut()` and returns to `AuthScreen`.
4. **Biometric Security Gate**: `expo-local-authentication` secures app resume when biometrics are enabled in Settings.

---

## 14. Developer Hotspots & Active Conventions

### Critical Code Conventions
1. **Design System Adherence**: Always import colors from `useTheme().colors` — NEVER hardcode hex values.
2. **Touch Feedback**: Always use `feedback.tap()`, `feedback.commit()`, `feedback.success()` from `src/utils/haptics.ts` — NEVER call `Haptics.*` directly.
3. **Data Access Standard**: Access domain data via `useMobileData()` or dedicated domain hooks (`useCoreData`, `useWellnessData`, `useAcademicData`, `useCreativeData`, `usePlannerData`) — NEVER query Firestore directly inside UI components.
4. **Resilient Writes**: Route data mutations through `safeWrite()`, `safeAdd()`, `safeUpdate()`, `safeDelete()` or domain optimistic functions.
5. **No Navigation in Onboarding**: `OnboardingScreen` renders outside navigation containers — pass navigation callbacks via props only.
6. **Timezone Correctness**: Use `dateUtils.ts` (`todayStr()`) instead of `.toISOString().slice(0,10)` to prevent UTC midnight date shift bugs in Indian Standard Time (IST).
