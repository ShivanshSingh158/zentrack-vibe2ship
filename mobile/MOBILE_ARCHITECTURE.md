# ZenTrack Mobile — Unified System Architecture & Machine-Navigable Blueprint

> **CRITICAL DIRECTIVE FOR AI AGENTS & DEVELOPERS**:
> This document is the single, authoritative architectural blueprint for `ZenTrack Mobile`.
> Before modifying or creating any code in the `mobile/` directory, locate the relevant file, hook, component, or service in the sections below to understand its lifecycle, state dependencies, and architectural contracts.

---

## 📑 Quick Navigation Index

- [1. Executive Overview & Core Engineering Pillars](#1-executive-overview--core-engineering-pillars)
- [2. Verified Package Inventory & Runtime Stack](#2-verified-package-inventory--runtime-stack)
- [3. Codebase Topology & Directory Map](#3-codebase-topology--directory-map)
- [4. High-Level Architectural Flow Diagrams](#4-high-level-architectural-flow-diagrams)
- [5. Master Navigation & Screen Catalog (30+ Screens)](#5-master-navigation--screen-catalog-30-screens)
- [6. Domain State Management & Context Pipeline](#6-domain-state-management--context-pipeline)
- [7. SARA AI Engine Subsystem (On-Device Intelligence)](#7-sara-ai-engine-subsystem-on-device-intelligence)
- [8. Services & Infrastructure Catalog](#8-services--infrastructure-catalog)
- [9. Custom Hooks Library & State Machines](#9-custom-hooks-library--state-machines)
- [10. UI Primitives, Component Library & Widgets](#10-ui-primitives-component-library--widgets)
- [11. Utilities & Mathematical Engines](#11-utilities--mathematical-engines)
- [12. Firestore Data Dictionary & Local Storage Registry](#12-firestore-data-dictionary--local-storage-registry)
- [13. The 10 Architectural Golden Rules & Performance Safeguards](#13-the-10-architectural-golden-rules--performance-safeguards)

---

## 1. Executive Overview & Core Engineering Pillars

- **App Name**: ZenTrack Mobile
- **Platform**: React Native (Expo SDK ~54.0.36, Hermes Engine) — iOS & Android
- **Language**: TypeScript ~5.9.2
- **Package Manager**: npm
- **App Entry Point**: [`mobile/index.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/index.ts) ➔ [`mobile/App.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/App.tsx)
- **Dev Command**: `npm start` (executed from `mobile/`, triggers `expo start -c`)
- **Workspace Root**: `zentrack-vibe2ship/mobile/`

### The 5 Architectural Pillars

1. **Direct Gemini AI Engine (Zero Cold Start)**:
   SARA AI runs on-device orchestration via `callProxy()` in [`src/services/geminiProxy.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/geminiProxy.ts) with direct HTTPS calls to Gemini 2.5 Flash using an autonomous 9-key round-robin rotation pool. Zero server cold starts, 1–2 second streaming responses, and 0ms offline regex parsing fallbacks.
2. **WhatsApp-Grade Offline-First Resilience**:
   All Firestore mutations route through `safeWrite()` in [`src/utils/safeWrite.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/safeWrite.ts) backed by an AsyncStorage write queue (`@zentrack_offline_write_queue`) with Last-Write-Wins (LWW) conflict resolution. Data writes optimistically to local memory in <1ms, persists to disk, and synchronizes atomically when connectivity resumes.
3. **0ms Stale-While-Revalidate Manifest Boot**:
   The Consolidated Root Boot Manifest (`loadBootManifest()` in [`src/utils/bootManifest.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/bootManifest.ts)) loads all critical auth, route, layout, and domain caches in a single native C++ `AsyncStorage.multiGet` call on Frame 0.
4. **Domain-Isolated Context Pipeline**:
   State is segmented across 5 domain providers (`CoreDataContext`, `WellnessContext`, `AcademicContext`, `CreativeContext`, `PlannerContext`). A mutation in one domain (e.g., ticking off a gym set) never triggers a re-render in consumers of another domain (e.g., tasks or attendance).
5. **60/120fps UI Thread Animation & Fluid Gesture Physics**:
   All interactive sheets, sliders, and gestures run worklet-driven animations on the native render thread via `react-native-reanimated` and `react-native-gesture-handler`. Keyboard avoidance is GPU-accelerated via `translateY` transforms, avoiding layout thrashing.

---

## 2. Verified Package Inventory & Runtime Stack

### Core Runtime Dependencies (`package.json`)

| Package | Version | Architectural Responsibility |
|---|---|---|
| `expo` | `~54.0.36` | Core Expo Application Framework |
| `react` | `19.1.0` | React UI Runtime |
| `react-native` | `0.81.5` | React Native Core Framework (Hermes Engine) |
| `typescript` | `~5.9.2` | Static Type Checking |
| `firebase` | `^12.15.0` | Firebase Auth Persistence & Firestore Realtime SDK |
| `react-native-reanimated` | `4.1.1` | Worklet-Based Native UI Thread Animations (Pinned Override) |
| `react-native-gesture-handler`| `~2.28.0`| Native Touch & Gesture Orchestration (Pan, Tap, Pinch) |
| `@shopify/flash-list` | `2.0.2` | High-Performance Virtualized Cell-Recycling Lists |
| `@react-native-async-storage/async-storage` | `2.2.0` | High-Speed Persistent Key-Value Disk Storage |
| `react-native-screens` | `~4.16.0` | Native OS Screen Containers (UIViewController / Android Fragment) |
| `react-native-safe-area-context` | `~5.6.0` | Hardware Insets & Notch Geometry Provider |
| `expo-blur` | `~15.0.8` | Hardware-Accelerated Frosted Glass BlurView (iOS / Android) |
| `expo-haptics` | `~15.0.8` | Core Haptic Feedback Synthesizer |
| `expo-notifications` | `~0.32.17` | Local On-Device Notification & Alarm Scheduler |
| `expo-av` | `~16.0.8` | Audio Recording, VAD Metering & Audio Playback |
| `expo-file-system` | `~19.0.23`| Local Document & Avatar Disk Caching Engine |
| `expo-linear-gradient` | `~15.0.8` | Ambient UI Gradient Renderers |
| `@react-native-community/netinfo` | `11.4.1` | Network Connectivity & Offline Detection |
| `@react-native-community/datetimepicker` | `8.4.4` | Native iOS Wheels & Android Dialog Pickers |
| `react-native-svg` | `15.12.1` | Hardware-Accelerated Vector Graphics & Telemetry Rings |
| `react-native-calendars` | `^1.1314.0`| Calendar Engine & Month Pager |
| `xlsx` | `^0.18.5` | Excel Timetable & Attendance Sheet Parser |

---

## 3. Codebase Topology & Directory Map

```
mobile/
├── index.ts                              # Native Entry Point (AppRegistry & Headless Widget Handler)
├── App.tsx                               # Root Application Shell: Fonts, Providers, Manifest Init
├── app.json                              # Expo Manifest, Permissions & Plugin Bindings
├── package.json                          # Pinned Runtime Dependencies & Overrides
├── tsconfig.json                         # Strict TypeScript Settings
├── plugins/
│   └── withAndroidManifestMod.js         # Native Android Manifest Permissions & Flags Modifier
└── src/
    ├── agent/                            # SARA AI Intelligence Subsystem
    │   ├── orchestrator.ts               # SARA Chat Orchestrator (CMG + IRCI + Streaming REST)
    │   ├── intentClassifier.ts           # On-Device IRCI Synchronous Intent Classifier (<5ms)
    │   ├── dagExecutor.ts                # Parallel DAG Task Resolution Engine
    │   └── saraAgent.ts                  # Biomechanics Coach & Action Parser
    ├── components/                       # Shared Domain UI Components
    │   ├── Academic/                     # Timetable, Attendance Cards, Holiday & Bunk Modals
    │   ├── Analytics/                    # Telemetry Gauges, Spline Charts & Heatmap Grids
    │   ├── Calendar/                     # Month Views, Agenda Strips & Event Creators
    │   ├── Dashboard/                    # Life Ring, Agenda Widget, Hydration & Profile Sheets
    │   ├── Gym/                          # Set Loggers, Rest Timers, GYM-GPT AI & Exercise Rows
    │   │   └── Charts/                   # Muscle Donut, Progression Curves & Heatmaps
    │   ├── Habits/                       # Contribution Heatmaps, Streaks & Annual Modals
    │   ├── Learning/                     # YouTube Player, AI Flashcards & Mind Map Canvas
    │   ├── Navigation/                   # Telegram-Style Floating Glass Bottom Navigation Bar
    │   ├── Notes/                        # Markdown Editor, StorageNode Rows & Floating Context Popovers
    │   ├── PlacementHub/                 # LeetCode Scraper, DSA Heatmap & Striver SDE Sheet
    │   ├── SARA/                         # Voice Orb, Dynamic Bubbles & Action Confirmation Cards
    │   ├── Tasks/                        # Task Rows, NLP Task Input, Pomodoro Sheets & Dictation
    │   ├── Vault/                        # Local Offline Document Viewer & Download HUD
    │   └── ui/                           # Primitives: BottomSheet, GlassCard, FAB, EmptyState, UserAvatar
    ├── config/                           # Application Configurations & Policies
    │   ├── constants.ts                  # 18 Firestore Collections, Storage Keys & Route Names
    │   └── saraActionPolicy.ts           # 3-Tier Confidence-Gated Autonomous Action Policy
    ├── contexts/                         # React State Management Pipeline
    │   ├── MobileDataContext.tsx         # Composite Backward-Compatible Facade Hook
    │   ├── ThemeContext.tsx              # Dynamic Theme Engine (Obsidian Cosmos / Frost Quartz)
    │   ├── PortalContext.tsx             # Root Modal Portal Coordinator
    │   ├── PinnedModulesContext.tsx      # Pinned Bottom Tabs State (Isolated from CoreData)
    │   ├── PomodoroContext.tsx           # Monotonic Background Focus Session Engine
    │   └── domains/                      # Domain-Isolated Data Contexts
    │       ├── CoreDataContext.tsx       # Tasks, Habits, HabitLogs, Auth & Optimistic Mutators
    │       ├── WellnessContext.tsx       # GymLogs, UserGymPlans, Water, Sleep & Weight
    │       ├── AcademicContext.tsx       # AttendanceSubjects, Logs, Assignments, Semesters
    │       ├── CreativeContext.tsx       # StorageNodes, Notes, LearningTopics, Jobs
    │       └── PlannerContext.tsx        # CustomEvents, Goals, WeeklyReviews
    ├── data/                             # Static Dictionaries & Routine Templates
    │   ├── brutalQuotes.ts               # Psychological Accountability Quotes Pool
    │   ├── exerciseDatabase.ts           # 361 Canonical Gym Exercises & Muscle Targets
    │   ├── exerciseAliasMap.ts           # 764-Entry Bidirectional Exercise Normalizer
    │   └── gymPlan.ts                    # Master 6-Day PPL & Arnold Split Templates
    ├── hooks/                            # Custom Domain Hooks & State Machines
    │   ├── useGymLog.ts                  # Active Gym Session State Machine & Set Handlers
    │   ├── useGymProfile.ts              # Bodyweight Stats & Gym Configuration
    │   ├── usePlacementData.ts           # LeetCode Public GraphQL Scraper State Machine
    │   ├── useSaraNavigation.ts          # [NAVIGATE:X] Deep Link Token Router
    │   ├── useSaraSurface.ts             # Predictive Surface Injection (PSI) Screen Evaluator
    │   ├── useTabBarBadges.ts            # Dynamic Badge Counter for Tabs
    │   ├── useProactiveAgent.ts          # Background Schedule Conflict Detector
    │   ├── useCachedFirestoreCollection.ts # Stale-While-Revalidate Firestore Hook
    │   ├── useDeferredMemo.ts            # Frame-Deferred Complex Math Calculation Hook
    │   ├── useSafeTimeout.ts             # Memory-Safe Auto-Clearing Timeout Wrapper
    │   └── useWidgetSync.tsx             # Continuous Android Home Screen Widget Synchronizer
    ├── navigation/                       # Navigation Architecture & Navigation Stacks
    │   ├── AppNavigator.tsx              # Root Auth Gate, 0ms Boot Manifest & Tab Stacks
    │   └── GymStack.tsx                  # Dedicated Gym Workout Navigation Stack
    ├── screens/                          # 30+ Application Screens (See Section 5)
    │   ├── attendance/                   # Attendance Week Strips, Hooks & Style Tokens
    │   ├── calendar/                     # Calendar Day/Week/Month Views & Scroll State
    │   ├── dashboard/                    # Dashboard Data Aggregators & Widget Layouts
    │   ├── gym/                          # Active Logging, History, Progress, Swap & Cardio
    │   └── tasks/                        # NewTaskModal, EditTaskModal, Style Tokens & Spawner
    ├── services/                         # External Integrations & Backend Engines
    │   ├── firebase.ts                   # Firebase Client Init & Memory Cache Configuration
    │   ├── geminiProxy.ts                # Direct Gemini REST Client with 9-Key Pool
    │   ├── sarvamProxy.ts                # Sarvam AI Indic Voice TTS Proxy (500-char chunks)
    │   ├── voiceEngine.ts                # Audio Recording & Calibrated -33dB RMS VAD
    │   ├── nativeStt.ts                  # On-Device Offline Speech Recognition Bridge
    │   ├── saraMemory.ts                 # Contextual Memory Graph (CMG) & Behavioral Fingerprint
    │   ├── offlineSync.ts                # Offline Write Queue & NetInfo Reconnection Sync
    │   ├── notifications.ts              # Local Multi-Channel Notification Engine
    │   ├── notificationPools.ts          # Disciplined Notification Copy & Context Pools
    │   ├── xpSystem.ts                   # Gamification XP Engine (Skinner Variable Rewards)
    │   ├── vaultCacheService.ts          # Local-First SHA256 Disk Cache for Cloud Documents
    │   ├── userAvatarService.ts          # Permanent Disk Cache for User Profile Avatars
    │   ├── cloudinary.ts                 # Direct Multipart Media & Document CDN Uploader
    │   ├── ilovepdfCompress.ts           # Multi-Stage PDF Compression Engine
    │   ├── youtubeTranscriptService.ts   # 4-Layer Resilient YouTube Transcript Ingestion
    │   ├── flashcardService.ts           # SuperMemo SM-2 Spaced Repetition Algorithm
    │   ├── progressiveOverload.ts        # Biomechanical Weight & Reps Overload Calculator
    │   ├── weeklyGymAnalysisEngine.ts    # Sunday Gym Analytics & Muscle Distribution Engine
    │   ├── widgetSyncService.ts          # Android Widget Aggregation & Action Executor
    │   └── otaUpdateService.ts           # Background OTA Update Synchronization (expo-updates)
    ├── theme/                            # Design Tokens & UI Motion Specifications
    │   ├── tokens.ts                     # Obsidian Cosmos (Dark) & Frost Quartz (Light) Tokens
    │   ├── animations.ts                 # Reanimated Micro-Interaction Presets
    │   └── motion.ts                     # Timing & Spring Easing Curves
    ├── types/                            # TypeScript Type Definitions
    │   ├── gym.types.ts                  # Sets, Exercises, Plans & History Interfaces
    │   ├── locationReminder.types.ts     # Saved Places & Geofence Interfaces
    │   └── widget.types.ts               # Android Home Screen Widget Interfaces
    ├── utils/                            # Shared Utilities & Math Engines
    │   ├── safeWrite.ts                  # Offline-First Firestore Mutation Wrapper
    │   ├── bootManifest.ts               # Single-Call Native C++ Boot Manifest
    │   ├── dateUtils.ts                  # Todoist-Grade On-Device NLP Engine & Indian Date Math
    │   ├── academicMath.ts               # SGPA, CGPA & Class Bunk Margin Math
    │   ├── gymUtils.ts                   # 1RM Calculation & Muscle Group Resolvers
    │   ├── streakUtils.ts                # Multi-Pillar Streak Engine with Rest Day Immunity
    │   ├── haptics.ts                    # Tactile Vibration Feedback Helpers
    │   ├── exportUtils.ts                # CSV & Excel Spreadsheet Exporters
    │   ├── errorUtils.ts                 # Non-Blocking Transient Error Suppressor
    │   ├── firebaseUtils.ts              # Firestore Deep Payload Sanitizer
    │   ├── ModulePrefetcher.tsx          # Cache-Aware Lazy Screen Background Warmer
    │   └── tabBarScroll.ts               # Horizontal Tab Bar Anchor Coordinator
    └── widgets/                          # Native Android Home Screen Widgets
        ├── TodayAgendaWidget.tsx         # Obsidian Cosmos Home Screen Agenda Widget
        ├── LiveWorkoutWidget.tsx         # Live Gym HUD Widget (3-State Lifecycle)
        └── widgetTaskHandler.tsx         # Headless Background JS Task Handler
```

---

## 4. High-Level Architectural Flow Diagrams

### 4.1. Application Boot & Startup Sequence

```
Native Entry (mobile/index.ts)
     │
     ▼
App.tsx (Root Shell)
     │ ── 1. SplashScreen.preventAutoHideAsync()
     │ ── 2. Load Fonts: Inter (400, 500, 600, 700) & Playfair Display (600)
     │ ── 3. loadBootManifest() [Single C++ multiGet: Auth, User, Theme, Pinned Tabs]
     │
     ▼
Providers Initialization:
GestureHandlerRoot ➔ SafeAreaProvider ➔ ErrorBoundary ➔ ThemeProvider ➔ PortalProvider
     │
     ▼
MobileDataProvider (Mounts 5 Isolated Domain Providers)
     │ ── CoreDataContext   [Tasks, Habits, HabitLogs, Auth]
     │ ── WellnessContext   [GymLogs, Plans, Water, Sleep, Weight]
     │ ── AcademicContext   [Attendance, Logs, Assignments, Semesters]
     │ ── CreativeContext   [StorageNodes, Notes, Learning, Jobs]
     │ ── PlannerContext    [CustomEvents, Goals, WeeklyReviews]
     │
     ▼
AppNavigator (Auth Gate & Two-Phase Warm-Mounting)
     ├── user === null ➔ AuthStack (Landing ➔ Auth ➔ Terms)
     └── user !== null
           ├── Frame 0: Mounts ONLY Home Screen (<16ms initial paint)
           ├── SplashScreen.hideAsync() (Instant visual load)
           └── After 350ms idle: Background warms Pinned Tabs (Tasks, Gym, Calendar, Attendance)
```

### 4.2. SARA AI Intelligence Pipeline

```
User Input (Voice Audio / Text Prompt)
     │
     ▼
[Step 1: Ingestion & Normalization]
  • Voice: Native STT (nativeStt.ts) or -33dB RMS VAD (voiceEngine.ts) ➔ Base64
  • Text: normalizeVoiceTranscript() strips spoken filler, cleans homophones
     │
     ▼
[Step 2: IRCI Synchronous Intent Classification (<5ms on-device)]
  • intentClassifier.ts evaluates keywords & regex with 0 token cost
  • Prunes context payload: Injects ONLY relevant domain records (~400 vs ~4000 tokens)
     │
     ▼
[Step 3: Direct Gemini REST Call (geminiProxy.ts)]
  • HTTPS POST to generativelanguage.googleapis.com (Gemini 2.5 Flash)
  • 9-Key autonomous round-robin rotation on HTTP 429 rate limit
  • Emits streaming reasoning tokens to ReasoningFeed.tsx
     │
     ▼
[Step 4: Action Policy Gateway (saraActionPolicy.ts)]
  ├── Tier 1 (Confidence > 0.95, Low Risk): Auto-executes via safeWrite()
  ├── Tier 2 (Confidence 0.70 - 0.95): Surfaces interactive Action Pill
  └── Tier 3 (Confidence < 0.70 / Destructive): Displays Confirmation Modal
     │
     ▼
[Step 5: Voice Output]
  • If voice mode active: Sarvam Indic TTS (sarvamProxy.ts) plays audio response
  • If [NAVIGATE:X] tag present: useSaraNavigation jumps to target screen
```

### 4.3. Offline-First Mutation & Sync Architecture

```
User Action (Add Task, Complete Habit, Log Gym Set, Mark Attendance)
     │
     ▼
1. Optimistic UI Mutation (<1ms)
   • React state updates immediately with deterministic doc ID
   • UI reflects change on Frame 0 with native haptic confirmation
     │
     ▼
2. L1/L2 Write-Through Cache (Disk)
   • Writes updated entity to AsyncStorage cache immediately
   • Data survives app force-close, phone crash, or battery death
     │
     ▼
3. safeWrite() Execution Router
     ├── Network Online ➔ Direct write to Firestore via setDoc / updateDoc
     └── Network Offline ➔ Enqueues mutation to @zentrack_offline_write_queue
                                │
                                ▼
                         NetInfo Reconnection Event
                         • syncOfflineQueue() drains queue in atomic batches
                         • Resolves with Last-Write-Wins (LWW) conflict strategy
                         • Displays non-intrusive "Synced N items" toast
```

---

## 5. Master Navigation & Screen Catalog (30+ Screens)

### 5.1. Root Navigation Architecture

The application uses React Navigation v7 with a native stack hierarchy:
- **`AppNavigator.tsx`**: Manages auth routing, 0ms manifest hydration, and bottom tab coordination.
- **`TelegramTabBar.tsx`**: Telegram-style floating glass bottom bar with animated active pill and tab scrolling.
- **`GymStack.tsx`**: Dedicated stack for gym sessions, history, exercise swapping, and cardio logs.
- **`MoreStack`**: Card presentation stack for secondary domain screens.

### 5.2. Core Screen Directory

| Screen | Route Name | File Path | Responsibilities & UI Features |
|---|---|---|---|
| **Dashboard** | `Home` | [`src/screens/DashboardScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/DashboardScreen.tsx) | Life Matrix ring, habit streak rings, hydration progress, Voice FAB, daily briefing, Quick Profile Sheet. |
| **Tasks** | `Tasks` | [`src/screens/TasksScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/TasksScreen.tsx) | `@shopify/flash-list` task virtualization, 24h timeline, Eisenhower matrix, swipe day-change, undo toast. |
| **Attendance**| `Attendance` | [`src/screens/AttendanceScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/AttendanceScreen.tsx) | 7-day magnetic week strip, class/lab bunk calculator, timetable grid, danger zone banner, Excel export. |
| **Calendar** | `Calendar` | [`src/screens/CalendarScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/CalendarScreen.tsx) | Interactive month grid, week strip pager, day agenda, schedule conflict markers, 1-tap "Today" alignment. |
| **Habits** | `Habits` | [`src/screens/HabitsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/HabitsScreen.tsx) | 35-day contribution heatmaps, squircle check rings, 365-day annual analytics, 0ms optimistic check-off. |
| **SARA AI** | `Sara`, `SaraModal` | [`src/screens/SaraScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/SaraScreen.tsx) | Deactivated ultra-lightweight stub ensuring maximum performance across all primary screens. |

### 5.3. Specialized Domain Screen Catalog

| Screen | Route Name | File Path | Responsibilities & UI Features |
|---|---|---|---|
| **Notes & Vault** | `Notes` | [`src/screens/NotesScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/NotesScreen.tsx) | ZenNotes Markdown editor, Cloud Vault document tree, PDF compressor, floating 3-dots action popover. |
| **Goals** | `Goals` | [`src/screens/GoalsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/GoalsScreen.tsx) | OKR Goal Tracker, milestone breakdowns, progress completion rings, target deadline markers. |
| **Grades** | `Grades` | [`src/screens/GradesScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/GradesScreen.tsx) | University SGPA/CGPA grade calculation, semester subject credit weighting, target GPA projection. |
| **Learning** | `Learning` | [`src/screens/LearningScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/LearningScreen.tsx) | Synchronized YouTube player, AI tutor chat, VS Code syntax highlighter, interactive mind map. |
| **Placement Hub** | `PlacementHub` | [`src/screens/PlacementHubScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/PlacementHubScreen.tsx) | LeetCode GraphQL scraper, Striver SDE sheet checklist, DSA activity heatmap, Pattern Vault. |
| **Analytics** | `Analytics` | [`src/screens/AnalyticsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/AnalyticsScreen.tsx) | Concentric dual-ring Zen Score, 4-pillar balance tracks, task velocity chart, habit spline area wave. |
| **Wellbeing** | `WellbeingDashboard` | [`src/screens/WellbeingDashboardScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/WellbeingDashboardScreen.tsx) | Sleep stage logs, hydration intervals, physical recovery scores, daily work-life balance insights. |
| **XP Constellation**| `XPConstellation` | [`src/screens/XPConstellationScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/XPConstellationScreen.tsx) | Interactive galaxy map representing 20 mastery tiers, mascot lore codex, kinetic spring physics. |
| **Streak Detail** | `StreakDetail` | [`src/screens/StreakDetailScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/StreakDetailScreen.tsx) | Longest streak records, habit freeze history, continuity milestones, Sunday rest day immunity. |
| **More Launcher** | `More` | [`src/screens/MoreScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/MoreScreen.tsx) | 16-module grid launcher, custom tab-pinning configuration (1–4 selection with reordering). |

### 5.4. Gym Navigation Sub-Stack (`src/screens/gym/`)

| Screen | Route Name | File Path | Responsibilities & UI Features |
|---|---|---|---|
| **Gym Home** | `GymHome` | [`src/screens/gym/GymHomeScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/GymHomeScreen.tsx) | Workout day switcher, master split selector, quick start CTA, GYM-GPT AI floating assistant. |
| **Active Logging** | `ActiveLogging` | [`src/screens/gym/ActiveLoggingScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/ActiveLoggingScreen.tsx) | Live set counter, swipeable set rows, sticky countdown rest timer, progressive overload cues. |
| **Workout Summary**| `WorkoutSummary` | [`src/screens/gym/WorkoutSummaryScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/WorkoutSummaryScreen.tsx) | Volume tonnage, PR achievements, milestone confetti particles, 90-day progression curve chart. |
| **Gym Progress** | `GymProgress` | [`src/screens/gym/GymProgressScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/GymProgressScreen.tsx) | Strength curve analytics, muscle volume donut chart, 1RM estimated max progression. |
| **Gym History** | `GymHistory` | [`src/screens/gym/GymHistoryScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/GymHistoryScreen.tsx) | 91-day activity matrix, historical session list, past exercise set inspection. |
| **Exercise Detail**| `ExerciseDetail` | [`src/screens/gym/ExerciseDetailScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/ExerciseDetailScreen.tsx) | Form demonstration videos, target anatomy breakdown, past personal best records. |
| **Exercise Swap** | `ExerciseSwap` | [`src/screens/gym/ExerciseSwapScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/ExerciseSwapScreen.tsx) | Biomechanical movement substitutions matching exact muscle head with O(1) alias lookup. |
| **Cardio Log** | `CardioLog` | [`src/screens/gym/CardioLogScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/gym/CardioLogScreen.tsx) | Distance, pace, duration, and calorie expenditure logging with clean numeric sanitization. |

### 5.5. Settings, Auth & Onboarding

| Screen | Route Name | File Path | Responsibilities & UI Features |
|---|---|---|---|
| **Settings** | `Settings` | [`src/screens/SettingsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/SettingsScreen.tsx) | Theme mode toggle, biometric authentication, data export/import, cache purge, sign-out. |
| **Notif Settings** | `NotificationsSettings` | [`src/screens/NotificationsSettingsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/NotificationsSettingsScreen.tsx) | Briefing time, reminder intervals, scheduled alarm inspector modal, 1-tap notification diagnostic. |
| **Onboarding** | `Onboarding` | [`src/screens/OnboardingScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/OnboardingScreen.tsx) | 5-step persona setup, archetype selection cards, focus matrix, genesis XP calibration. |
| **Auth** | `Auth` | [`src/screens/AuthScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/AuthScreen.tsx) | Native Google One-Tap & Apple Sign-In with spring touch physics and value props. |
| **Landing** | `Landing` | [`src/screens/LandingScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/LandingScreen.tsx) | Hero welcome screen, editorial feature carousel, 54px spring pill Get Started CTA. |
| **Terms** | `Terms` | [`src/screens/TermsScreen.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/screens/TermsScreen.tsx) | Privacy policy and terms of service with frosted pledge card and native page sheet handle. |

---

## 6. Domain State Management & Context Pipeline

```
MobileDataProvider (Composite Wrapper in App.tsx)
 ├── CoreDataContext      [Tasks, Habits, HabitLogs, Auth State]
 ├── WellnessContext      [GymLogs, UserGymPlans, Water, Sleep, Weight]
 ├── AcademicContext      [AttendanceSubjects, AttendanceLogs, Assignments, Semesters]
 ├── CreativeContext      [StorageNodes, Notes, LearningTopics, Jobs, ContentLogs]
 └── PlannerContext       [CustomEvents, Goals, WeeklyReviews]
```

### Context Isolation Matrix

| Context Provider | Hook | Primary State Entities | Optimistic Mutators & Handlers |
|---|---|---|---|
| [`CoreDataContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/CoreDataContext.tsx) | `useCoreData()` | `user`, `tasks`, `habits`, `habitLogs` | `optimisticAddTask`, `optimisticUpdateTask`, `optimisticDeleteTask`, `optimisticAddHabit`, `optimisticDeleteHabit`, `performSignOut` |
| [`WellnessContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/WellnessContext.tsx) | `useWellnessData()` | `gymLogs`, `userGymPlan`, `waterLogs`, `sleepLogs`, `weightLogs` | `updateMasterPlan`, `applyMasterTemplate`, `addWaterLog`, `addSleepLog`, `addWeightLog` |
| [`AcademicContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/AcademicContext.tsx) | `useAcademicData()` | `attendance`, `attendanceLogs`, `assignments`, `semesters`, `holidays` | `optimisticAddSubject`, `optimisticUpdateSubject`, `optimisticDeleteSubject`, `markAttendance`, `toggleHoliday` |
| [`CreativeContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/CreativeContext.tsx) | `useCreativeData()` | `storageNodes`, `notes`, `learningTopics`, `jobs`, `contentLogs` | `optimisticAddStorageNode`, `optimisticUpdateStorageNode`, `optimisticDeleteStorageNode`, `optimisticBatchDeleteStorageNodes` |
| [`PlannerContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/domains/PlannerContext.tsx) | `usePlannerData()` | `customEvents`, `goals`, `weeklyReviews` | `optimisticAddEvent`, `optimisticUpdateEvent`, `optimisticDeleteEvent`, `optimisticAddGoal`, `optimisticUpdateGoal` |
| [`PinnedModulesContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/PinnedModulesContext.tsx) | `usePinnedModules()` | `pinnedModules` | `setPinnedModules` (Decoupled from CoreData so task ticks never re-render root tabs) |
| [`PomodoroContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/PomodoroContext.tsx) | `usePomodoro()` | `mode`, `secondsLeft`, `isRunning`, `totalSecondsToday` | Monotonic timestamp-based focus session manager with background persistence and zero drift |
| [`ThemeContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/ThemeContext.tsx) | `useTheme()` | `theme`, `isDark`, `colors` | Obsidian Cosmos (Dark) vs Frost Quartz (Light) token manager |
| [`PortalContext`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/contexts/PortalContext.tsx) | `usePortal()` | `portals` | Renders modals and bottom sheets at the root view level above navigation headers |

---

## 7. SARA AI Engine Subsystem (On-Device Intelligence)

### 7.1. Components of the SARA Pipeline

| File Path | Function / Symbol | Operational Contract |
|---|---|---|
| [`src/agent/orchestrator.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/orchestrator.ts) | `orchestrateAgent()` | Orchestrates IRCI classification, memory graph injection, Gemini streaming REST call, and step events. |
| [`src/agent/intentClassifier.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/intentClassifier.ts) | `classifyIntent()`, `buildSelectiveContext()` | Synchronous regex/keyword intent classifier (<5ms). Ranks primary domain and prunes prompt payload by 90%. |
| [`src/agent/dagExecutor.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/dagExecutor.ts) | `executeDag()` | Resolves multi-step agent plans (`[[DAG:[...]]`) in topological order across rotated API keys. |
| [`src/agent/saraAgent.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/agent/saraAgent.ts) | `processGymChat()`, `parseActionFromText()` | Expert biomechanics coach and regex extractor for `[[ACTION:{...}]]` payloads. |
| [`src/config/saraActionPolicy.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/config/saraActionPolicy.ts) | `evaluateActionPolicy()`, `recordActionHistory()` | 3-tier confidence gateway ensuring destructive actions require user confirmation. Logs actions to audit history. |
| [`src/services/saraMemory.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/saraMemory.ts) | `buildMemorySummary()`, `getFingerprint()` | Maintains the Contextual Memory Graph (CMG) and user Behavioral Fingerprint (tone, verbosity, active hours). |

---

## 8. Services & Infrastructure Catalog

| Service Module | Key Exported Functions | Architectural Role |
|---|---|---|
| [`src/services/firebase.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/firebase.ts) | `auth`, `db`, `googleProvider` | Firebase Client Singletons with AsyncStorage auth persistence and memory cache. |
| [`src/services/geminiProxy.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/geminiProxy.ts) | `callProxy()`, `streamProxy()`, `transcribeAudioViaProxy()` | Direct Gemini 2.5 Flash REST client with 9-key pool, exponential backoff, and multimodal audio transcription. |
| [`src/services/sarvamProxy.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/sarvamProxy.ts) | `speakWithSarvam()`, `stopSpeech()`, `detectLanguageCode()` | Indic TTS voice engine splitting text into 500-char chunks for low-latency audio streaming. |
| [`src/services/voiceEngine.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/voiceEngine.ts) | `startVoiceRecording()`, `stopAndTranscribe()`, `isSilenceOrNoise()` | High-precision audio recording with -33dB calibrated VAD and 850ms silence detection. |
| [`src/services/nativeStt.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/nativeStt.ts) | `startNativeStt()`, `stopNativeStt()`, `abortNativeStt()` | On-device speech recognition bridge (`expo-speech-recognition`) with runtime safety guards. |
| [`src/services/offlineSync.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/offlineSync.ts) | `queueWrite()`, `syncOfflineQueue()`, `setupNetworkListener()` | LWW offline queue drainer syncing pending mutations on network restoration. |
| [`src/services/notifications.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/notifications.ts) | `scheduleAllNotifications()`, `scheduleSingleTaskReminder()`, `ensureNotificationChannels()` | Local alarm scheduler with persistent disk fingerprint, holiday suppression, and chunked bridge calls. |
| [`src/services/xpSystem.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/xpSystem.ts) | `awardXP()`, `getXPData()`, `calculateLevel()` | Gamification engine awarding XP via variable ratio schedules across 8 rank titles. |
| [`src/services/vaultCacheService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/vaultCacheService.ts) | `getCachedFilePath()`, `downloadAndCacheFile()`, `isUrlCached()` | SHA256 disk cache for Cloud Vault notes and PDFs in `${FileSystem.documentDirectory}zentrack_vault_cache/`. |
| [`src/services/userAvatarService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/userAvatarService.ts) | `getCachedAvatarUri()`, `cacheUserAvatar()`, `initAvatarCacheOnBoot()` | Permanent disk cache for user profile pictures with synchronous memory map for 0ms Frame 0 paint. |
| [`src/services/cloudinary.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/cloudinary.ts) | `uploadFileToCloudinary()` | Direct multipart media uploader to Cloudinary CDN with live progress callbacks. |
| [`src/services/ilovepdfCompress.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/ilovepdfCompress.ts) | `compressPdfWithILovePDF()` | Multi-stage adaptive PDF compressor via iLovePDF REST API. |
| [`src/services/youtubeTranscriptService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/youtubeTranscriptService.ts)| `fetchYouTubeTranscript()` | 4-layer resilient transcript pipeline (InnerTube, Gemini multimodal, Supadata, audio fallback). |
| [`src/services/flashcardService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/flashcardService.ts) | `calculateSM2()`, `generateFlashcardsFromNote()` | SuperMemo SM-2 spaced repetition scheduler updating ease factors and review intervals. |
| [`src/services/progressiveOverload.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/progressiveOverload.ts) | `calculateNextTarget()`, `recommendWeight()` | RPE and completion-based gym weight and repetition calculator using Brzycki formula. |
| [`src/services/widgetSyncService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/widgetSyncService.ts) | `updateTodayAgendaWidget()`, `updateLiveWorkoutWidget()`, `handleWidgetClickAction()` | Android Widget aggregation, L1 cache synchronization, and headless background action executor. |
| [`src/services/otaUpdateService.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/services/otaUpdateService.ts) | `checkForOTAUpdate()`, `applyOTAUpdate()` | Background over-the-air bundle update synchronization using `expo-updates`. |

---

## 9. Custom Hooks Library & State Machines

| Hook Export | File Path | Signature / Return Type | Purpose & Details |
|---|---|---|---|
| `useGymLog` | [`src/hooks/useGymLog.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useGymLog.ts) | `(overrideDateStr?: string) => GymLogHookState` | Workout session state machine protecting active in-progress sets from Firestore echo overrides. |
| `useGymProfile` | [`src/hooks/useGymProfile.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useGymProfile.ts) | `() => { profile, updateProfile }` | Gym user profile, target split settings, and bodyweight stats persistence. |
| `usePlacementData` | [`src/hooks/usePlacementData.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/usePlacementData.ts) | `() => PlacementHookState` | Placement Hub state machine: LeetCode profile scraper, DSA checkboxes, and Pattern Vault notes. |
| `useSaraNavigation` | [`src/hooks/useSaraNavigation.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useSaraNavigation.ts) | `() => { processAnswerForNavigation }` | Regex parser extracting `[NAVIGATE:ScreenName]` from SARA answers and executing route navigation. |
| `useSaraSurface` | [`src/hooks/useSaraSurface.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useSaraSurface.ts) | `(screenName: string) => { activeBanner, dismissBanner }` | Evaluates per-screen anomaly triggers (e.g. attendance < 75%) and displays HUD banners. |
| `useTabBarBadges` | [`src/hooks/useTabBarBadges.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useTabBarBadges.ts) | `() => Record<string, number>` | Computes active notification badge counts for bottom tabs (pending tasks, at-risk classes, gym). |
| `useProactiveAgent`| [`src/hooks/useProactiveAgent.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useProactiveAgent.ts) | `() => void` | Runs background conflict detection and anomaly checks when app state changes. |
| `useCachedFirestoreCollection` | [`src/hooks/useCachedFirestoreCollection.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useCachedFirestoreCollection.ts) | `<T>(collection, cacheKey, parser) => { data, loading }` | Generic hook providing instant AsyncStorage L1 hydration followed by live Firestore updates. |
| `useDeferredMemo` | [`src/hooks/useDeferredMemo.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useDeferredMemo.ts) | `<T>(factory, deps) => T` | Defers expensive computations to `InteractionManager.runAfterInteractions` to preserve 60/120fps. |
| `useSafeTimeout` | [`src/hooks/useSafeTimeout.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useSafeTimeout.ts) | `() => { setSafeTimeout }` | Memory-safe auto-clearing timeout wrapper preventing leaks on component unmount. |
| `useWidgetSync` | [`src/hooks/useWidgetSync.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/hooks/useWidgetSync.tsx) | `(params) => void` | Synchronizes in-app task and attendance mutations to the Android Home Screen Widget in background. |

---

## 10. UI Primitives, Component Library & Widgets

### 10.1. Core UI Primitives (`src/components/ui/`)

| Component | File Path | Architectural Features |
|---|---|---|
| **`BottomSheet`** | [`src/components/ui/BottomSheet.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/BottomSheet.tsx) | Native `BlurView` frosted backdrop blur, critically damped spring curve (`damping: 32, stiffness: 280, mass: 0.85`), 1:1 direct pan gesture tracking with downward flick dismiss, keyboard auto-dismiss on drag touch, GPU-accelerated `translateY` keyboard lift (eliminating 60–120fps Yoga layout thrashing), and `isClosingRef` double-closing guard for silky-smooth 210ms exit dismissal. |
| **`AnimatedPressable`**| [`src/components/AnimatedPressable.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/AnimatedPressable.tsx) | Universal haptic touch wrapper with UI-thread spring scale compression (`scale: 0.96`), press opacity, and synchronized haptics. |
| **`GlassCard`** | [`src/components/ui/GlassCard.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/GlassCard.tsx) | Frosted glassmorphism container using `expo-blur` with hairline borders and dynamic elevation. |
| **`FloatingActionButton`** | [`src/components/ui/FloatingActionButton.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/FloatingActionButton.tsx) | Reusable action button with ambient glow aura, haptic trigger, and spring compression physics. |
| **`UserAvatar`** | [`src/components/ui/UserAvatar.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/UserAvatar.tsx) | Self-healing avatar rendering from local disk cache (`file://`) for 0ms Frame 0 paint with fallback letter monograms. |
| **`EmptyState`** | [`src/components/ui/EmptyState.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/components/ui/EmptyState.tsx) | Standardized empty placeholder with vector icon, headline, and action button. |

### 10.2. Native Android Home Screen Widgets (`src/widgets/`)

| Widget Module | File Path | Architectural Responsibilities |
|---|---|---|
| **`TodayAgendaWidget`** | [`src/widgets/TodayAgendaWidget.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/widgets/TodayAgendaWidget.tsx) | Android Home Screen widget rendering today's timetable classes and tasks. Balanced item selection (never starves tasks), dedicated Holiday mode, and 1-tap Present/Absent & Task Done/Undone buttons. |
| **`LiveWorkoutWidget`** | [`src/widgets/LiveWorkoutWidget.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/widgets/LiveWorkoutWidget.tsx) | Live Gym HUD Widget with 3-state lifecycle (Idle split preview, Active session HUD with set log button, Completed session summary). |
| **`widgetTaskHandler`** | [`src/widgets/widgetTaskHandler.tsx`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/widgets/widgetTaskHandler.tsx) | Headless background JS task handler registered in `index.ts`. Reconstructs agenda on date-roll using L1 domain caches (`readCoreCacheMulti` & `readAcademicCache`). |

---

## 11. Utilities & Mathematical Engines

| Utility | File Path | Key Functions & Equations |
|---|---|---|
| **`safeWrite`** | [`src/utils/safeWrite.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/safeWrite.ts) | `safeWrite()`, `safeAdd()`, `safeUpdate()`, `safeDelete()`: Universal write router guaranteeing zero data loss via offline queueing. |
| **`bootManifest`** | [`src/utils/bootManifest.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/bootManifest.ts) | `loadBootManifest()`, `getBootManifestSync()`: Loads all startup keys in 1 native C++ call; provides 0.00ms synchronous in-memory lookup. |
| **`dateUtils`** | [`src/utils/dateUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/dateUtils.ts) | `parseNLTask()`, `cleanTaskTitle()`, `formatLocalDateStr()`, `todayStr()`: Todoist-grade NLP parser and IST timezone date assembler. |
| **`academicMath`** | [`src/utils/academicMath.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/academicMath.ts) | `calculateBunkMath()`: Computes safe bunks remaining: $\text{Safe Bunks} = \lfloor \frac{\text{Attended} - \text{Total} \times \text{Target}}{1 - \text{Target}} \rfloor$. |
| **`gymUtils`** | [`src/utils/gymUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/gymUtils.ts) | `calculate1RM()`: Brzycki formula $\text{1RM} = \frac{\text{Weight}}{1.0278 - 0.0278 \times \text{Reps}}$. Canonical muscle mapper. |
| **`streakUtils`** | [`src/utils/streakUtils.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/streakUtils.ts) | `calculateAppStreak()`: Multi-pillar daily activity streak calculation with Sunday rest day immunity. |
| **`haptics`** | [`src/utils/haptics.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/haptics.ts) | `feedback.tap()`, `feedback.commit()`, `feedback.success()`, `feedback.warning()`, `feedback.error()`: Haptic wrappers. |
| **`schemaGuards`** | [`src/utils/schemaGuards.ts`](file:///c:/Users/perso/.gemini/antigravity/scratch/zentrack-vibe2ship/mobile/src/utils/schemaGuards.ts) | Defensive document normalizers injecting fallback defaults for corrupted or legacy Firestore payloads. |

---

## 12. Firestore Data Dictionary & Local Storage Registry

### 12.1. The 18 Firestore Collections

All queries enforce security isolation with `where('userId', '==', uid)`.

| Collection Name | Constant (`COLLECTION`) | TypeScript Type | Key Document Fields |
|---|---|---|---|
| `todos` | `TASKS` | `Task` | `id`, `userId`, `title`, `status`, `priority`, `date`, `timeSlot`, `subtasks`, `isRecurring`, `recurrenceRule`, `isReminder` |
| `habits` | `HABITS` | `Habit` | `id`, `userId`, `name`, `emoji`, `frequency`, `streak`, `longestStreak`, `archived`, `type` |
| `habitLogs` | `HABIT_LOGS` | `HabitLog` | `id`, `userId`, `habitId`, `date`, `count`, `isFreeze` |
| `gym_logs` | `GYM_LOGS` | `GymLog` | `id`, `userId`, `date`, `exercises`, `cardio`, `workoutStartTime`, `workoutDurationMinutes`, `completed`, `dayPlanIndex` |
| `user_gym_plans` | `USER_GYM_PLANS` | `UserGymPlanDoc` | `id`, `userId`, `customDays`, `templateId`, `schedulePattern` |
| `attendance_subjects` | `ATTENDANCE_SUBJECTS` | `AttendanceSubject` | `id`, `userId`, `name`, `classesAttended`, `classesTotal`, `labsAttended`, `labsTotal`, `targetPercentage`, `schedule` |
| `attendance_logs` | `ATTENDANCE_LOGS` | `AttendanceLog` | `id`, `userId`, `subjectId`, `date`, `type`, `action`, `isExtra`, `timestamp` |
| `attendance_holidays` | `ATTENDANCE_HOLIDAYS` | `{ date: string }` | `id`, `userId`, `date` |
| `assignments` | `ASSIGNMENTS` | `Assignment` | `id`, `userId`, `title`, `subjectName`, `dueDate`, `status`, `grade`, `weightage` |
| `semesters` | `SEMESTERS` | `Semester` | `id`, `userId`, `name`, `startDate`, `endDate`, `sgpa`, `totalCredits`, `order` |
| `semester_subjects` | `SEMESTER_SUBJECTS` | `SemesterSubject` | `id`, `userId`, `semesterId`, `name`, `credits`, `gradePoints`, `grade` |
| `calendar_events` | `CALENDAR_EVENTS` | `CustomEvent` | `id`, `userId`, `title`, `date`, `startTime`, `endTime`, `type`, `location`, `description` |
| `goals` | `GOALS` | `Goal` | `id`, `userId`, `title`, `status`, `progress`, `deadline`, `keyResults`, `firstStep` |
| `storage_nodes` | `STORAGE_NODES` | `StorageNode` | `id`, `userId`, `name`, `type`, `parentId`, `url`, `content`, `size`, `tags` |
| `learning_topics` | `LEARNING_TOPICS` | `LearningTopic` | `id`, `userId`, `title`, `subTasks`, `timeSpentMinutes`, `lastStudiedAt` |
| `flashcards` | `FLASHCARDS` | `Flashcard` | `id`, `userId`, `topicId`, `front`, `back`, `interval`, `repetitions`, `easeFactor`, `dueDate` |
| `job_applications` | `JOB_APPLICATIONS` | `JobApplication` | `id`, `userId`, `company`, `role`, `status`, `dateApplied`, `expectedSalary`, `prepChecklist` |
| `weekly_reviews` | `WEEKLY_REVIEWS` | `WeeklyReview` | `id`, `userId`, `weekStart`, `weekEnd`, `wentWell`, `toImprove`, `nextWeekPriorities` |

### 12.2. AsyncStorage Key Registry (`STORAGE_KEYS`)

| Key Constant | Storage Key String | Default Value | Purpose |
|---|---|---|---|
| `PINNED_MODULES` | `@zentrack_pinned_modules` | `['Tasks','Gym','Calendar','Attendance']` | Pinned bottom navigation tab configuration. |
| `DEFAULT_NOTIF_TIME`| `zentrack_default_notif_time` | `'08:00'` | Daily morning briefing notification time. |
| `GYM_NOTIF_TIME` | `zentrack_gym_notif_time` | `'18:00'` | Scheduled gym workout notification time. |
| `XP_DATA` | `zentrack_xp_v1` | `'0'` | Cumulative user gamification XP. |
| `XP_STREAK` | `zentrack_xp_streak` | `'0'` | Consecutive active day streak. |
| `ONBOARDED` | `zentrack_onboarded_v2` | `null` | Flag indicating onboarding questionnaire completion. |
| `THEME` | `@zentrack_theme` | `'dark'` | Active theme preference (`'dark'`, `'light'`). |
| `OFFLINE_QUEUE` | `@zentrack_offline_write_queue` | `[]` | Serialized pending offline Firestore write operations. |
| `BOOT_MANIFEST` | `@zentrack_boot_manifest` | `null` | Pre-warmed atomic cold-boot manifest JSON. |
| `NOTIF_FINGERPRINT` | `@zentrack_notif_fingerprint` | `null` | Hash fingerprint of notification data for 0ms boot verification. |

### 12.3. Android Notification Channels

| Channel ID | Channel Name | Importance | Vibration Pattern | Sound & DND Bypass |
|---|---|---|---|---|
| `default` | ZenTrack Primary | `MAX` | `[0, 250, 250, 250]` | Standard system sound |
| `reminders` | Task & Class Reminders | `HIGH` | `[0, 500, 200, 500]` | Reminder chime |
| `task_urgent_alarm_v1`| Critical Alarms | `MAX` | `[0, 600, 300, 600, 300, 600]`| Heavy urgent alarm sound, bypasses DND |
| `wellness` | Hydration & Recovery | `HIGH` | `[0, 250, 250, 250]` | Soft droplet chime |

---

## 13. The 10 Architectural Golden Rules & Performance Safeguards

### Rule 1: The 0ms Optimistic UI Contract
Every user action (ticking a task, logging a habit, updating attendance) **must update local React state on Frame 0 (<1ms)** and write through to local cache. Never await network responses or Firestore snapshots before updating the UI.

### Rule 2: GPU-Accelerated BottomSheet Keyboard Avoidance
**NEVER animate `paddingBottom`** to avoid the software keyboard in bottom sheets. Modifying `paddingBottom` triggers full Yoga layout re-measurements of every child text, input, and chip 60–120 times per second. **Always use GPU transforms** (`transform: [{ translateY: translateY.value - keyboardShift }]`) with static `paddingBottom`.

### Rule 3: Deferred AutoFocus Timing
In modals and bottom sheets, **never focus inputs on Frame 0 (`autoFocus={visible}`)**. Allow the bottom sheet's critically damped spring to complete its 200ms upward entrance glide first. Then trigger `inputRef.current?.focus()`. This prevents the OS keyboard window from competing with the spring physics engine.

### Rule 4: Graceful Exit Dismissal Lifecycle
**Never unmount a modal directly from parent state on close** (e.g. `{isOpen && <Modal />}`). Modals must manage an `internalVisible` state that plays the full downward exit animation (210ms) and fades the backdrop to 0. The parent `onClose()` unmount callback must only be invoked **after the modal has completely moved off-screen**.

### Rule 5: Virtualization with `@shopify/flash-list` & Stable Memoization
All primary lists must use `@shopify/flash-list` instead of `ScrollView` or `SectionList`. Row callbacks (`onPress`, `onComplete`, `onDelete`) must be permanently frozen using live render-synchronized refs (`useRef`) to guarantee that completing 1 item re-renders only that single row, leaving all other rows frozen.

### Rule 6: Hermes TDZ (Temporal Dead Zone) Style Hoisting
In React Native with Hermes, **always define `const styles = StyleSheet.create({...})` at the top of the file** or outside the component closure. Referencing styles inside child components or memo comparators before declaration causes fatal uncatchable runtime `ReferenceError` crashes.

### Rule 7: Defensive Type Coercion & Schema Guards
Always wrap incoming Firestore dates, numbers, and strings with defensive guards from `schemaGuards.ts`. Assume dates can arrive as ISO strings, local strings, Unix timestamps, or Firestore Timestamp objects. Coerce safely with `String(d || '').slice(0, 10)` and try/catch handlers.

### Rule 8: Offline-First `safeWrite` & Last-Write-Wins (LWW)
Never call raw `setDoc`, `updateDoc`, or `deleteDoc` directly in UI components. Always use `safeWrite()`, `safeAdd()`, `safeUpdate()`, or `safeDelete()`. This guarantees that if the user loses cellular signal or enters airplane mode, writes are automatically queued in AsyncStorage and synced without throwing unhandled promise rejections.

### Rule 9: Timezone Determinism (IST Midnight Immunity)
**Never use `new Date().toISOString().slice(0, 10)`** for local user records. UTC midnight conversions cause date-shift bugs in Indian Standard Time (IST, UTC+5:30). Always use `formatLocalDateStr()`, `todayStr()`, or `getTodayLocalDateStr()` from `dateUtils.ts`.

### Rule 10: Unified Design Tokens & Haptic Primitives
**Never hardcode hex color strings or raw `Haptics.*` calls** in screens and components. Always resolve colors from `useTheme().colors` (supporting Obsidian Cosmos & Frost Quartz) and trigger vibrations via `feedback.tap()`, `feedback.commit()`, and `feedback.success()` from `src/utils/haptics.ts`.
