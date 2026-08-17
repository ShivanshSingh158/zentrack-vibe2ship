# ZenTrack Mobile — Machine-Navigable Architecture Report

> **MANDATORY FIRST ACTION FOR ALL AI AGENTS**: Before ANY other action on the mobile app, read this file. This is the single source of truth. Use the File Index in Section 4 to jump directly to any file without searching the codebase.
>
> **KEYWORD TRIGGERS**: Any mention of "mobile app", "Expo", "React Native", "Sara on mobile", "mobile notification", "mobile screen", "mobile agent" → read this file first.
>
> **UPDATE PROTOCOL**: Any time code changes — update the relevant section of this document in the same session.

---

## 1. Project Overview

- **App Name**: ZenTrack Mobile
- **Platform**: React Native (Expo SDK 54) — iOS + Android
- **Language**: TypeScript ~5.9.2
- **Package Manager**: npm
- **Entry Point**: `mobile/index.ts` → `mobile/App.tsx`
- **Dev Command**: `npm start` (from `mobile/` directory, runs `expo start -c`)
- **Full workspace path**: `zentrack-vibe2ship/mobile/`

### Architecture Philosophy
The mobile app calls Gemini **directly** using `callProxy()` in `geminiProxy.ts` — no Socket.IO, no Render backend. Sara's full agent pipeline runs on-device logic with direct Gemini REST API calls using a 9-key rotation pool. This gives **zero cold start, ~1-2 second responses**.

```
Sara Chat → orchestrateAgent() → callProxy() → Gemini REST API (direct, 9-key rotation)
                                               ↕
                                        Firestore (direct)
```

### Key URLs
```
https://myzentrack.vercel.app           ← Gemini proxy + Voice proxy (Vercel serverless)
https://generativelanguage.googleapis.com  ← Direct Gemini API (primary path)
```

---

## 2. Exact Package Versions (package.json)

### Runtime Dependencies
| Package | Version | Purpose |
|---|---|---|
| `expo` | ^54.0.0 | Core Expo SDK |
| `react` | 19.1.0 | React library |
| `react-native` | 0.81.5 | React Native runtime |
| `typescript` | ~5.9.2 | TypeScript compiler |
| `expo-status-bar` | ~3.0.9 | Status bar control |
| `expo-font` | ~14.0.12 | Font loading (Inter + Playfair Display) |
| `expo-blur` | ~15.0.8 | BlurView (frosted glass tab bar) |
| `expo-haptics` | ~15.0.8 | Haptic feedback |
| `expo-linear-gradient` | ~15.0.8 | Gradient backgrounds (onboarding) |
| `expo-av` | ~16.0.8 | Audio recording + WAV playback (Sara voice) |
| `expo-speech` | ~14.0.8 | Device TTS fallback when Sarvam fails |
| `expo-file-system` | ~19.0.23 | Read/write audio files, temp WAV |
| `expo-notifications` | ~0.32.17 | Local scheduled push notifications |
| `expo-local-authentication` | ~17.0.8 | Biometric/face ID lock |
| `expo-document-picker` | ~14.0.8 | File picker (Notes uploads) |
| `expo-sharing` | ~14.0.8 | Share workout summaries |
| `expo-crypto` | ~15.0.9 | Cryptographic utilities |
| `expo-web-browser` | ~15.0.11 | In-app browser (OAuth flows) |
| `expo-auth-session` | ~7.0.11 | OAuth session management |
| `expo-apple-authentication` | ~8.0.8 | Apple Sign In (iOS only) |
| `@expo/vector-icons` | ^15.0.3 | Ionicons icon set |
| `@expo-google-fonts/inter` | ^0.4.2 | Inter font family (Regular/Medium/SemiBold) |
| `@expo-google-fonts/playfair-display` | ^0.4.2 | Playfair Display SemiBold (editorial headings) |
| `firebase` | ^12.15.0 | Firebase client SDK (Auth + Firestore) |
| `@react-native-async-storage/async-storage` | 2.2.0 | Persistent key-value store |
| `@react-native-community/datetimepicker` | 8.4.4 | Native date/time pickers |
| `@react-navigation/native` | ^7.3.8 | Navigation core |
| `@react-navigation/native-stack` | ^7.17.10 | Stack navigator |
| `@react-navigation/bottom-tabs` | ^7.18.8 | Bottom tab navigator |
| `@react-navigation/drawer` | ^7.12.8 | Drawer navigator |
| `react-native-screens` | ~4.16.0 | Native screen containers |
| `react-native-safe-area-context` | ~5.6.0 | Safe area insets (notch/home bar) |
| `react-native-gesture-handler` | ~2.28.0 | Gesture recognition |
| `react-native-reanimated` | 4.1.1 | Animation engine (Worklets-based) — **pinned** |
| `react-native-worklets` | ^0.5.1 | Reanimated worklets runtime — **pinned** |
| `react-native-svg` | 15.12.1 | SVG rendering (charts, progress rings) |
| `react-native-calendars` | ^1.1314.0 | Calendar grid component |
| `react-native-markdown-display` | ^7.0.2 | Markdown renderer (Sara responses) |
| `react-native-webview` | 13.15.0 | WebView (YouTube exercise demos) |
| `react-native-youtube-iframe` | ^2.4.1 | YouTube player wrapper |
| `react-native-confetti-cannon` | ^1.5.2 | Confetti (workout completion) |
| `react-native-view-shot` | 4.0.3 | Screenshot capture (share workout) |

> [!IMPORTANT]
> `socket.io-client` has been **removed** (2026-07-14). The mobile app no longer connects to a Socket.IO backend. All AI calls go through `callProxy()` in `geminiProxy.ts`.

### Dev Dependencies
| Package | Version |
|---|---|
| `@types/react` | ~19.1.10 |
| `babel-preset-expo` | ~54.0.10 |
| `typescript` | ~5.9.2 |

### Version Overrides (pinned to prevent peer conflicts)
```json
"overrides": {
  "react-native-reanimated": "4.1.1",
  "react-native-worklets": "0.5.1"
}
```

---

## 3. Folder Map

```
mobile/
├── index.ts                              App entry: AppRegistry.registerComponent
├── App.tsx                               Root: useFonts (Inter+Playfair), wraps AppNavigator
├── app.json                              Expo config (bundle ID, permissions, build plugins)
├── package.json                          All dependencies (see Section 2)
├── tsconfig.json                         TypeScript configuration
├── .env                                  Environment variables
├── plugins/
│   └── withAndroidManifestMod.js         Custom Expo plugin (Android manifest patches)
└── src/
    ├── agent/
    │   ├── orchestrator.ts               SARA ENGINE v2: CMG+IRCI+BFE+Cap4+Cap6 wired (direct callProxy)
    │   ├── intentClassifier.ts           IRCI: on-device intent + selective context (<5ms, 0 API calls)
    │   ├── dagExecutor.ts                DAG executor for multi-node parallel tasks (uses webScraper)
    │   └── saraAgent.ts                  processGymChat() — GYM-GPT elite coach (100+ books, S-Tier biomechanics)
    ├── components/
    │   ├── Academic/
    │   │   └── AddSubjectModal.tsx        (12KB)
    │   ├── AnimatedPressable.tsx          Reusable pressable with micro-animation
    │   ├── Calendar/
    │   │   └── AddEventModal.tsx          (7KB)
    │   ├── Dashboard/
    │   │   └── QuickCaptureSheet.tsx      Slide-up quick capture (Task/Note/Habit tabs, NL date parser)
    │   ├── Gym/
    │   │   ├── ExerciseCard.tsx           Set logging, RPE, rest timer (18KB)
    │   │   ├── ZenGymAiModal.tsx          Full-screen ChatGPT OLED black modal with persistent Chat History drawer
    │   │   ├── ZenGymAiFab.tsx            Luxury floating action button for ZenGym AI (GYM-GPT)
    │   │   ├── GymAiIcon.tsx              High-precision vector SVG emblem with metallic plates & AI sparkles
    │   │   ├── AddExerciseModal.tsx       Exercise search + add modal
    │   │   ├── AddCardioModal.tsx         Cardio session add modal
    │   │   ├── LogCardioModal.tsx         Cardio log entry modal
    │   │   ├── CardioCard.tsx             Cardio session display card
    │   │   ├── ExerciseHistoryDrawer.tsx  Per-exercise history drawer
    │   │   ├── GymNotificationModal.tsx   Gym reminder notification settings
    │   │   ├── GymProfileModal.tsx        User gym profile modal
    │   │   ├── AnimatedRestTimer.tsx      Rest timer between sets (animated)
    │   │   └── BeforeAfterSlider.tsx      Progress photo before/after slider
    │   ├── SARA/
    │   │   ├── SaraBubble.tsx             Bubble types: sara/user/action_card/quick_reply
    │   │   ├── VoiceOrb.tsx               Animated orb: idle/listening/speaking states
    │   │   ├── ActionConfirmationCard.tsx Confirm/reject proposed action (Tier 3)
    │   │   ├── VoiceMicButton.tsx         Mic button in chat input bar
    │   │   ├── StreamingText.tsx          Animated streaming text renderer
    │   │   ├── ReasoningFeed.tsx          [v2 Cap4] Live reasoning steps feed during thinking
    │   │   ├── SaraHUDBanner.tsx          [v2 Cap5] PSI dismissable surface banner (per-screen)
    │   │   ├── SaraHUDToast.tsx           [v2 Cap3] Tier-1 auto-execute passive toast
    │   │   └── InlineActionPill.tsx       [v2 Cap3] Tier-2 inline quick-confirm pill
    │   ├── Learning/
    │   │   ├── LearningTopicCard.tsx      Draggable topic card + subtask list renderer
    │   │   ├── LearningVideoPlayer.tsx    YouTube player + controls + AI chat + notes panel
    │   │   └── LearningModals.tsx         Add Topic / Add Subtask / Roadmap import modals
    │   ├── Notes/                         Reserved for future NotesScreen splits
    │   ├── Tasks/
    │   │   ├── TaskRow.tsx                Task list row with swipe actions
    │   │   ├── TimelineView.tsx           24-hour timeline rendering of tasks
    │   │   ├── MatrixView.tsx             Eisenhower Matrix 4-quadrant rendering
    │   │   ├── RecurrencePickerModal.tsx  Modal for configuring custom task recurrence
    │   │   └── Modals/                    Reserved for future TasksScreen modal extraction
    │   └── ui/
    │       ├── FloatingActionButton.tsx   Reusable FAB component
    │       └── GlassCard.tsx              Glassmorphism card wrapper
    ├── config/
    │   ├── constants.ts                   Endpoints, storage keys, screen names, collection names, limits
    │   └── saraActionPolicy.ts            [v2 Cap3] 3-tier action gateway (Tier1/2/3 routing table)
    ├── contexts/
    │   ├── MobileDataContext.tsx          Root data provider: composes all domain contexts + shared utils
    │   ├── ThemeContext.tsx                Dark/light theme toggle (useTheme)
    │   ├── PortalContext.tsx               Modal portal system
    │   └── domains/                       Domain-split data contexts (each manages its Firestore subscriptions)
    │       ├── CoreDataContext.tsx         Tasks, habits, habitLogs, notes, goals (with write-lock guards)
    │       ├── AcademicContext.tsx         Attendance, assignments, semesters, subjects
    │       ├── WellnessContext.tsx         Gym logs, user gym plans, water logs, sleep logs
    │       ├── PlannerContext.tsx          Calendar events, weekly reviews
    │       └── CreativeContext.tsx         Storage nodes (Notes file system), job applications, learning topics
    ├── data/
    │   └── gymPlan.ts                     Static 6-day PPL gym plan + YouTube exercise IDs
    ├── hooks/
    │   ├── useSaraNavigation.ts           Parses [NAVIGATE:X] tokens from agent responses
    │   ├── useSaraSurface.ts              [v2 Cap5] PSI hook: per-screen banners, 60s cooldown, cached
    │   ├── useGymLog.ts                   Gym session state machine (set logging, swap, persistence)
    │   └── useProactiveAgent.ts           Conflict detection trigger
    ├── navigation/
    │   ├── AppNavigator.tsx               Root navigator: auth gate, tab/stack + GlobalSaraButton
    │   └── GymStack.tsx                   Nested gym screen stack
    ├── screens/
    │   ├── SaraScreen.tsx                 ChatGPT-style AI chat + voice mode (63KB — LARGEST)
    │   ├── TasksScreen.tsx                Full task manager (72KB)
    │   ├── NotesScreen.tsx                Rich notes + AI + PDF export + file storage (59KB)
    │   ├── AttendanceScreen.tsx           Attendance tracker + timetable (45KB)
    │   ├── CalendarScreen.tsx             Calendar grid + events (49KB)
    │   ├── AnalyticsScreen.tsx            Productivity charts + XP stats (48KB)
    │   ├── OnboardingScreen.tsx           5-step psychological onboarding (22KB)
    │   ├── GoalsScreen.tsx                OKR goal tracking (24KB)
    │   ├── GradesScreen.tsx               SGPA grade calculator (29KB)
    │   ├── HabitsScreen.tsx               Habit tracking + streaks (22KB)
    │   ├── SettingsScreen.tsx             App settings + notifications (25KB)
    │   ├── NotificationsSettingsScreen.tsx Notification preferences (26KB)
    │   ├── JobsScreen.tsx                 Kanban job tracker (15KB)
    │   ├── AssignmentsScreen.tsx          Assignment tracker (14KB)
    │   ├── LearningScreen.tsx             Thin orchestrator (heavy logic in components/Learning/)
    │   ├── SocialScreen.tsx               Social module (18KB)
    │   ├── MoreScreen.tsx                 Module launcher (17KB)
    │   ├── DashboardScreen.tsx            Home: briefing, tasks, stats, nudge (35KB)
    │   ├── AuthScreen.tsx                 Sign in (Google + Apple on iOS) (10KB)
    │   ├── GuestDashboard.tsx             Guest mode landing (5KB)
    │   ├── LandingScreen.tsx              Unauthenticated landing (4KB)
    │   ├── StudyRoomScreen.tsx            Collaborative study room (11KB)
    │   ├── WeeklyReviewScreen.tsx         Weekly reflection + review (5KB)
    │   ├── GoalDetailScreen.tsx           Goal detail + key results (7KB)
    │   ├── StreakDetailScreen.tsx         Habit streak detail (7KB)
    │   └── gym/
    │       ├── GymHomeScreen.tsx          Today's plan + muscle diagram (21KB)
    │       ├── ActiveLoggingScreen.tsx    Live set-by-set logging (15KB)
    │       ├── GymProgressScreen.tsx      Strength progress charts (11KB)
    │       ├── GymHistoryScreen.tsx       Workout history (8KB)
    │       ├── WorkoutSummaryScreen.tsx   Post-workout stats + share (7KB)
    │       ├── ExerciseDetailScreen.tsx   Exercise info + history (7KB)
    │       ├── ExerciseSwapScreen.tsx     Exercise swap with permanent override (6KB)
    │       └── CardioLogScreen.tsx        Cardio session logging (6KB)
    ├── services/
    │   ├── firebase.ts                    Firebase init with AsyncStorage persistence + Firestore persistentLocalCache()
    │   ├── geminiProxy.ts                 CRITICAL: Direct Gemini REST + 9-key rotation + transcription
    │   ├── sarvamProxy.ts                 Sarvam AI TTS via Vercel voice-proxy (500-char chunk limit)
    │   ├── voiceEngine.ts                 VAD (startVADRecording) + manual (startVoiceRecording)
    │   ├── saraMemory.ts                  CMG + BFE: AsyncStorage memory graph + behavioral fingerprint
    │   ├── notifications.ts               Local scheduled notifications (zero-cost, 6 categories)
    │   ├── xpSystem.ts                    XP/gamification (Skinner variable rewards, 8 levels)
    │   ├── conflictDetector.ts            Schedule conflict detection engine
    │   ├── cloudinary.ts                  File upload for Notes storage nodes
    │   ├── backgroundTasks.ts             Expo TaskManager background task registration
    │   ├── backgroundProactiveAgent.ts    Background AI proactive check (registered in App.tsx)
    │   ├── webScraper.ts                  Web search via DuckDuckGo (used by dagExecutor)
    │   ├── offlineSync.ts                 OFFLINE WRITE QUEUE: queueWrite(), syncOfflineQueue(), setupNetworkListener(), subscribeToQueueChanges()
    │   └── progressiveOverload.ts         Progressive overload calculator for gym coaching
    ├── theme/
    │   ├── tokens.ts                      COLORS, RADIUS, SPACE, FONT_FAMILY, SHADOW (design system)
    │   ├── animations.ts                  Reanimated animation presets
    │   └── motion.ts                      Timing/easing constants
    ├── types/
    │   └── gym.types.ts                   GymPlanDay, GymExercise TypeScript interfaces
    └── utils/
        ├── haptics.ts                     feedback.tap/commit/success/warning
        ├── coreCache.ts                   AsyncStorage cache for tasks/habits/habitLogs (stale-while-revalidate boot)
        └── domainCache.ts                 AsyncStorage cache for ALL 4 domain contexts — Wellness/Academic/Planner/Creative
```

## 3a. SARA Engine v2 — Capability Map (2026-07-19)

> All 7 capabilities are now live. Zero external dependencies added. Full TypeScript type check passes.

| Cap | Name | File | Key Mechanism |
|---|---|---|---|
| **1** | Contextual Memory Graph (CMG) | `src/services/saraMemory.ts` | `extractAndStore()` async after every response, AsyncStorage JSON graph |
| **2** | Intent-Ranked Context Injection (IRCI) | `src/agent/intentClassifier.ts` | `classifyIntent()` + `buildSelectiveContext()` — 0 API calls, <5ms |
| **3** | Confidence-Gated Actions | `src/config/saraActionPolicy.ts` + `SaraHUDToast.tsx` + `InlineActionPill.tsx` | `getActionTier()` routes to Tier1/2/3 in SaraScreen |
| **4** | Streaming Reasoning Transparency | `src/components/SARA/ReasoningFeed.tsx` | `reasoning_step` step type in `orchestrateAgent()` onStep |
| **5** | Predictive Surface Injection (PSI) | `src/hooks/useSaraSurface.ts` + `SaraHUDBanner.tsx` | 60s cooldown, per-screen, dismiss tracked in AsyncStorage |
| **6** | Dual-Stream Voice (VAD + sentence TTS) | `src/services/voiceEngine.ts` | `startVADRecording()` with RMS polling + `voice_sentence_ready` step |
| **7** | Behavioral Fingerprint Engine (BFE) | `src/services/saraMemory.ts` | `updateFingerprint()` on every action, adapts tone/quotes/module order |

### Integration Points
- **orchestrator.ts**: CMG (Cap1), IRCI (Cap2), Cap4 reasoning steps, Cap6 voice sentence streaming, Cap7 fingerprint update
- **SaraScreen.tsx**: Cap3 3-tier gateway, Cap4 ReasoningFeed render, Cap6 VAD, Cap6 voice_sentence_ready → speakWithSarvam (`sarvamProxy.ts`)
- **DashboardScreen.tsx**: Cap5 SaraHUDBanner, Cap7 BFE-powered daily quote
- **AttendanceScreen.tsx**: Cap5 SaraHUDBanner (at-risk subject detection)
- **MoreScreen.tsx**: Cap7 BFE module reordering in Quick Access row

---

## 4. File Index — Direct Navigation Table

### Agent & AI (go here first for any Sara issue)
| Purpose | Exact File Path | Key Export |
|---|---|---|
| **Sara mission dispatch (MAIN ENTRY)** | `src/agent/orchestrator.ts` | `orchestrateAgent()` |
| **IRCI intent classifier** | `src/agent/intentClassifier.ts` | `classifyIntent()`, `buildSelectiveContext()` |
| Sara full context + system prompt | `src/agent/orchestrator.ts` | `buildSystemPrompt()` |
| Sign-out cleanup (no-op stub) | `src/agent/orchestrator.ts` | `disconnectSocket()` |
| GYM-GPT coaching | `src/agent/saraAgent.ts` | `processGymChat()` |
| Parse `[[ACTION:{...}]]` from response | `src/agent/saraAgent.ts` | `parseActionFromText()` |
| DAG parallel task executor | `src/agent/dagExecutor.ts` | `executeDag()` |
| Direct Gemini REST + key rotation | `src/services/geminiProxy.ts` | `callProxy()` |
| Parse Gemini REST response | `src/services/geminiProxy.ts` | `parseProxyResponse()` |
| Audio transcription | `src/services/geminiProxy.ts` | `transcribeAudioViaProxy()` |
| Quick text prompt | `src/services/geminiProxy.ts` | `callGeminiProxy()` |
| Gym AI coaching | `src/services/geminiProxy.ts` | `askGymCoach()` |
| Sara TTS playback | `src/services/sarvamProxy.ts` | `speakWithSarvam()` |
| Stop Sara speaking | `src/services/sarvamProxy.ts` | `stopSpeech()` |
| Language detection (hi-IN/en-IN) | `src/services/sarvamProxy.ts` | `detectLanguageCode()` |
| Begin mic recording | `src/services/voiceEngine.ts` | `startVoiceRecording()` |
| Stop + transcribe audio | `src/services/voiceEngine.ts` | `stopAndTranscribe()` |
| Cancel recording | `src/services/voiceEngine.ts` | `cancelVoiceRecording()` |

### Data Layer
| Purpose | Exact File Path | Key Export |
|---|---|---|
| **ALL Firestore data (provider)** | `src/contexts/MobileDataContext.tsx` | `MobileDataProvider` |
| Access data in components | `src/contexts/MobileDataContext.tsx` | `useMobileData()` |
| **Theme (dark/light)** | `src/contexts/ThemeContext.tsx` | `useTheme()`, `ThemeProvider` |
| Firebase init | `src/services/firebase.ts` | `auth`, `db`, `googleProvider` |
| Rebuild notification schedule | `src/services/notifications.ts` | `scheduleTaskReminders()` |
| Setup notification channels | `src/services/notifications.ts` | `requestNotificationPermissions()` |
| Award XP (variable reward) | `src/services/xpSystem.ts` | `awardXP()` |
| Get current XP/level | `src/services/xpSystem.ts` | `getXPData()` |
| Detect schedule conflicts | `src/services/conflictDetector.ts` | `detectConflicts()` |
| Upload file to Cloudinary | `src/services/cloudinary.ts` | `uploadFileToCloudinary()` |
| Static gym plan data | `src/data/gymPlan.ts` | `GYM_PLAN`, `WEEKDAY_TO_PLAN` |

### Config & Constants
| Purpose | Exact File Path | Key Export |
|---|---|---|
| **All app constants (NEW)** | `src/config/constants.ts` | `COLLECTION`, `SCREENS`, `STORAGE_KEYS`, `XP_LEVELS`, etc. |

### Navigation
| Purpose | Exact File Path | Key Symbol |
|---|---|---|
| Root navigator (auth gate) | `src/navigation/AppNavigator.tsx` | `AppNavigator` |
| Bottom tab navigator | `src/navigation/AppNavigator.tsx` | `MainTabNavigator` |
| Floating Sara orb button | `src/navigation/AppNavigator.tsx` | `GlobalSaraButton` |
| Gym stack | `src/navigation/GymStack.tsx` | `GymStack` |
| Parse `[NAVIGATE:X]` | `src/hooks/useSaraNavigation.ts` | `useSaraNavigation()` |
| Extract route from text | `src/hooks/useSaraNavigation.ts` | `extractNavigateToken()` |
| Gym session state machine | `src/hooks/useGymLog.ts` | `useGymLog()` |
| Conflict detection trigger | `src/hooks/useProactiveAgent.ts` | `useProactiveAgent()` |

### Theme & Utils
| Purpose | Exact File Path | Key Export |
|---|---|---|
| Color palette | `src/theme/tokens.ts` | `COLORS` |
| Spacing scale | `src/theme/tokens.ts` | `SPACE` |
| Border radius | `src/theme/tokens.ts` | `RADIUS` |
| Font families | `src/theme/tokens.ts` | `FONT_FAMILY` |
| Font sizes | `src/theme/tokens.ts` | `FONT_SIZE` |
| Shadow presets | `src/theme/tokens.ts` | `SHADOW` |
| Haptic feedback wrapper | `src/utils/haptics.ts` | `feedback` (tap/commit/success/warning) |

### Screens — Direct Paths
| Screen | File Path |
|---|---|
| Sara Chat + Voice | `src/screens/SaraScreen.tsx` |
| Dashboard (Home) | `src/screens/DashboardScreen.tsx` |
| Tasks | `src/screens/TasksScreen.tsx` |
| Calendar | `src/screens/CalendarScreen.tsx` |
| Habits | `src/screens/HabitsScreen.tsx` |
| Notes + File Storage | `src/screens/NotesScreen.tsx` |
| Goals + OKRs | `src/screens/GoalsScreen.tsx` |
| Attendance Tracker | `src/screens/AttendanceScreen.tsx` |
| Assignments | `src/screens/AssignmentsScreen.tsx` |
| Grades / SGPA | `src/screens/GradesScreen.tsx` |
| Learning Topics | `src/screens/LearningScreen.tsx` |
| Jobs (Kanban) | `src/screens/JobsScreen.tsx` |
| Analytics | `src/screens/AnalyticsScreen.tsx` |
| Focus (Pomodoro) | **REMOVED** (2026-07-15) — module deleted, data in Firestore kept |
| More (module launcher) | `src/screens/MoreScreen.tsx` |
| Settings | `src/screens/SettingsScreen.tsx` |
| Social | `src/screens/SocialScreen.tsx` |
| Auth / Sign In | `src/screens/AuthScreen.tsx` |
| Onboarding | `src/screens/OnboardingScreen.tsx` |
| Landing (guest) | `src/screens/LandingScreen.tsx` |
| Gym Home | `src/screens/gym/GymHomeScreen.tsx` |
| Active Workout | `src/screens/gym/ActiveLoggingScreen.tsx` |
| Workout Summary | `src/screens/gym/WorkoutSummaryScreen.tsx` |
| Gym Progress | `src/screens/gym/GymProgressScreen.tsx` |
| Gym History | `src/screens/gym/GymHistoryScreen.tsx` |
| Exercise Detail | `src/screens/gym/ExerciseDetailScreen.tsx` |
| Exercise Swap | `src/screens/gym/ExerciseSwapScreen.tsx` |
| Cardio Log | `src/screens/gym/CardioLogScreen.tsx` |

---

## 5. Navigation Architecture

```
AppNavigator (handles onAuthStateChanged)
├── loading=true  → SplashLoader (pulsing animated logo)
├── user=null     → Stack.Navigator
│   ├── Landing
│   ├── GuestDashboard
│   └── Auth
├── user + NOT onboarded → OnboardingScreen (OUTSIDE all navigators — no useNavigation() allowed)
└── user + onboarded  → MobileDataProvider → RootNavigatorWithSara
    ├── Stack.Navigator
    │   ├── MainTabs (BottomTabNavigator)
    │   │   ├── Home         → DashboardScreen
    │   │   ├── [pinnedModules - from AsyncStorage '@zentrack_pinned_modules']
    │   │   │    default:  Tasks | Sara | Calendar
    │   │   │    all opts: Tasks Sara Calendar Habits Gym Attendance Analytics Goals Notes Social Assignments Grades Learning Jobs
    │   │   └── More         → MoreScreen
    │   ├── MoreStack (card presentation) → NestedScreens (has back-button header)
    │   │   ├── Habits / Gym (GymStack) / Attendance / Analytics
    │   │   ├── Goals / Notes / Settings / Social / Focus
    │   │   ├── Tasks / Sara / Calendar
    │   │   └── Assignments / Grades / Learning / Jobs
    │   └── SaraModal (modal presentation) → SaraScreen
    └── GlobalSaraButton (position:absolute)
        hidden when: Gym GymHome ActiveLogging WorkoutSummary GymProgress GymHistory ExerciseDetail CardioLog ExerciseSwap SaraModal Sara
        → press navigates to 'SaraModal'
```

### GymStack
```
GymStack.Navigator (default screen: GymHome)
├── GymHome → GymHomeScreen
├── ActiveLogging → ActiveLoggingScreen
├── WorkoutSummary → WorkoutSummaryScreen
├── GymProgress → GymProgressScreen
├── GymHistory → GymHistoryScreen
├── ExerciseDetail → ExerciseDetailScreen
├── CardioLog → CardioLogScreen
└── ExerciseSwap → ExerciseSwapScreen
```

---

## 6. Sara AI System — Full Data Flow

### A. Text Chat Flow (Updated 2026-07-14 — Direct Gemini, no Socket.IO)
```
SaraScreen → sendMessage(instruction)
  → orchestrateAgent(instruction, appContext, onStep, history)
      (src/agent/orchestrator.ts)
      → buildSystemPrompt(appContext) — rich context: tasks, habits, goals, calendar, etc.
      → callProxy({ model, contents, systemInstruction }) [src/services/geminiProxy.ts]
          → fetch() → generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash
          → 9-key rotation on 429
      → parseProxyResponse(data) → text | [[ACTION:{...}]]
      → if [[ACTION:{...}]]: onStep({ type: 'proposed_action', action, title })
      → else: onStep({ type: 'answer', title })
  → SaraScreen receives step:
      → 'thinking': update bubble text with "🧠 Sara is thinking..."
      → 'proposed_action': show ActionConfirmationCard → user confirms → Firestore write
      → 'answer': render final text in SaraBubble
  → processAnswerForNavigation(result) [useSaraNavigation]
      → extracts [NAVIGATE:X] token → navigates screen
  → speakWithSarvam(cleanText)
```

### B. Voice Recording → Transcription Flow
```
VoiceMicButton tapped → startVoiceRecording(callbacks) [voiceEngine.ts]
  → Audio.requestPermissionsAsync()
  → Audio.setAudioModeAsync({ allowsRecordingIOS:true, playsInSilentModeIOS:true })
  → Audio.Recording.createAsync(HIGH_QUALITY) → _recording

User speaks...

User taps stop → stopAndTranscribe(callbacks) [voiceEngine.ts]
  → _recording.stopAndUnloadAsync() → audioUri (WAV file on device)
  → FileSystem.readAsStringAsync(audioUri, Base64) → base64Audio
  → FileSystem.deleteAsync(audioUri) — cleanup temp file
  → transcribeAudioViaProxy(base64Audio) [geminiProxy.ts]
      → callProxy({ model: 'gemini-2.5-flash', contents: [audio inline_data] })
      → returns transcript string
  → callbacks.onTranscript(transcript)
  → sendMessage(transcript) → [Text Chat Flow above]
```

### C. Sara TTS Playback Flow
```
speakWithSarvam(rawText) [sarvaProxy.ts]
  → stopSpeech() — kill any current playback
  → stripMarkdown(rawText) — strip ##, **, [], etc.
  → detectLanguageCode(text) — Devanagari ratio >15% → 'hi-IN', else 'en-IN'
  → auth.currentUser.getIdToken() → idToken
  → POST https://myzentrack.vercel.app/api/voice-proxy
    { text, target_language_code, pace:1.0 }
    Authorization: Bearer <idToken>
  → response: { audios: [base64WAV] }
  → FileSystem.writeAsStringAsync(tmpUri, base64, Base64)
  → Audio.setAudioModeAsync({ playsInSilentModeIOS:true })
  → Audio.Sound.createAsync({ uri:tmpUri }) → sound
  → sound.playAsync()
  → playbackStatusUpdate → didJustFinish: cleanup + onDone()

  [FALLBACK if Sarvam proxy fails]:
  → expo-speech device TTS speaks text
```

### D. Action Confirmation Flow (Write Operations)
```
Sara response contains [[ACTION:{"type":"createTask","title":"...","dueDate":"..."}]]
  → orchestrateAgent onStep({ type:'proposed_action', action, title })
  → SaraScreen: isAction=true → builds result with type:'function_call'
  → ActionConfirmationCard shown with confirm/reject buttons
  → User confirms → Firestore write (addDoc/updateDoc/deleteDoc)
  → Haptics.notificationAsync(Success)
  → ActionCard subtitle updated to "✓ Done"
```

### E. [NAVIGATE:X] Token Resolution
```
useSaraNavigation.processAnswerForNavigation(answer)
  → extractNavigateToken(answer) → routeToken (e.g. 'gym')
  → ROUTE_MAP[routeToken] → { stack: 'MoreStack', screen: 'Gym' }
  → navigation.navigate('MoreStack', { screen: 'Gym' })
```

| Navigate Token | Stack | Screen |
|---|---|---|
| `[NAVIGATE:Gym]` | MoreStack | Gym |
| `[NAVIGATE:Tasks]` | MoreStack | Tasks |
| `[NAVIGATE:Habits]` | MoreStack | Habits |
| `[NAVIGATE:Calendar]` | MoreStack | Calendar |
| `[NAVIGATE:Goals]` | MoreStack | Goals |
| `[NAVIGATE:Notes]` | MoreStack | Notes |
| `[NAVIGATE:Analytics]` | MoreStack | Analytics |
| `[NAVIGATE:Attendance]` | MoreStack | Attendance |
| `[NAVIGATE:Focus]` | MoreStack | Focus |
| `[NAVIGATE:Settings]` | MoreStack | Settings |
| `[NAVIGATE:GymProgress]` | MoreStack | Gym (GymProgress nested) |
| `[NAVIGATE:GymHistory]` | MoreStack | Gym (GymHistory nested) |

---

## 7. Firestore Data Model (18 Collections)

All in `MobileDataContext.tsx`. All queries: `where('userId', '==', uid)`.

| Collection (Firestore) | State var | TypeScript Interface | Key Fields |
|---|---|---|---|
| `tasks` | `tasks` | `Task` | title, status, priority('P1'/'P2'/'P3'), date(YYYY-MM-DD), timeSlot, subtasks[], isRecurring, recurrenceRule{}, recurringSourceId, completedAt |
| `habits` | `habits`/`allHabits` | `Habit` | name, emoji, frequency, streak, archived |
| `habitLogs` | `habitLogs` | `HabitLog` | habitId, date |
| `notes` | `notes` | `Note` | title, content, tags[], createdAt |
| `storage_nodes` | `storageNodes` | `StorageNode` | type('folder'/'file'/'note'), name, parentId, url, content, size |
| `goals` | `goals` | `Goal` | title, status, progress(0-100), deadline, keyResults[], firstStep |
| `calendar_events` | `customEvents` | `CustomEvent` | title, date, type('todo'/'exam'/'gcal'/etc.), startTime, endTime |
| `gym_logs` | `gymLogs` | `GymLog` | date, exercises[], cardio[] |
| `attendance_subjects` | `attendance` | `AttendanceSubject` | name, classesAttended, classesTotal, schedule{dayName:[timeSlots]} |
| `assignments` | `assignments` | `Assignment` | title, subjectName, dueDate, status, grade, weightage |
| `semesters` | `semesters` | `Semester` | name, startDate, endDate, sgpa, totalCredits, order |
| `semester_subjects` | `semesterSubjects` | `SemesterSubject` | semesterId, name, credits, gradePoints, grade |
| `learning_topics` | `learningTopics` | `LearningTopic` | title, subTasks[], timeSpentMinutes |
| `job_applications` | `jobs` | `JobApplication` | company, role, status('wishlist'/'applied'/'interviewing'/'offer'/'rejected') |
| `weekly_reviews` | `weeklyReviews` | `WeeklyReview` | weekStart, weekEnd, wentWell, toImprove, nextWeekPriorities |
| `water_logs` | `waterLogs` | `WaterLog` | date, amountMl _(future — subscriptions not yet active)_ |
| `sleep_logs` | `sleepLogs` | `SleepLog` | date, hours _(future — subscriptions not yet active)_ |
| `user_gym_plans` | via `gymLogs` | — | Custom gym plans per user (supplements static gymPlan.ts) |

**All TypeScript interfaces defined in**: `src/contexts/MobileDataContext.tsx` (lines 10–247)

### Computed Context Values
- `pendingTaskCount` = `tasks.filter(t => t.status==='pending').length`
- `todayHabits` = active habits capped at 5
- `pinnedModules` = from `AsyncStorage('@zentrack_pinned_modules')`, default `['Tasks','Sara','Calendar']`
- Auto-trigger: `scheduleTaskReminders(tasks, customEvents, gymLogs, attendance)` on every data change

---

## 8. Notification System (Local, Zero-Cost)

- **Library**: `expo-notifications ~0.32.17`
- **Cost**: Free — 100% on-device scheduling, no server
- **Expo Go support**: Local scheduling works. FCM remote push needs a dev build (SDK 53+)

### Android Channels
| Channel ID | Name | Importance | Vibration Pattern |
|---|---|---|---|
| `default` | ZenTrack | MAX | `[0, 250, 250, 250]` |
| `reminders` | Task Reminders | HIGH | `[0, 500, 200, 500]` |

### Notification Schedule Logic (`scheduleTaskReminders()`)
Called every time `tasks`, `customEvents`, `gymLogs`, or `attendance` changes.

| Data Source | Title | Timing | Channel |
|---|---|---|---|
| Task with `timeSlot` | `Mission Window 🎯` | 60min before task | `reminders` |
| Task with `timeSlot` | `T-15 Minutes ⚡` | 15min before task | `reminders` |
| Task without `timeSlot` | `Daily Briefing 📋` | User's preferred time (AsyncStorage `zentrack_default_notif_time`, default `08:00`) | `default` |
| Calendar event with `startTime` | `Incoming Comm 📅` | 60min before event | `default` |
| Gym day + not yet logged | `Physical Momentum 🏋️` | 6:00 PM daily | `default` |
| Class day (from `schedule`) | `Academic Protocol 📚` | 8:00 AM daily | `default` |

---

## 9. Environment Variables (`mobile/.env`)

### Public (EXPO_PUBLIC_ prefix — baked into bundle)
| Variable | Value / Purpose |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase API key |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | `job-tracker-6b672.firebaseapp.com` |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `job-tracker-6b672` |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `job-tracker-6b672.firebasestorage.app` |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `336719988763` |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Full app ID string |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` | Analytics ID |
| `EXPO_PUBLIC_FIREBASE_VAPID_KEY` | FCM VAPID key |
| `EXPO_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID` | Google OAuth client ID |
| `EXPO_PUBLIC_GEMINI_API_KEY` | Comma-separated Gemini keys (9 keys, direct API rotation) |
| `EXPO_PUBLIC_GEMINI_LIVE_KEY` | Single key for Gemini Live API WebSocket |
| `EXPO_PUBLIC_SARVAM_API_KEY_1/2/3` | Sarvam TTS keys (client-side fallback) |
| `EXPO_PUBLIC_SARVAM_VOICE_ID` | Voice ID (e.g. `Shubh`) |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | `drc8jwyjf` |
| `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | `aoaogtkw` |

### Private (no prefix — server-only, NEVER in bundle)
| Variable | Purpose |
|---|---|
| `INNERTUBE_KEY` | YouTube InnerTube API key |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Admin SDK JSON (one line) |
| `CRON_SECRET` | Cron watchdog authentication |
| `SARVAM_API_KEY_1/2/3` | Server-side Sarvam keys (Vercel proxy) |

---

## 10. Design System — "Obsidian Cosmos" Theme

File: `src/theme/tokens.ts`

### Color Palette
| Token | Hex | Psychological Purpose |
|---|---|---|
| `background` | `#000000` | True black — OLED-friendly, infinite depth |
| `surface` | `#1c1c1e` | Primary card surface |
| `surface2` | `#141416` | Secondary/nested card |
| `surfaceRaised` | `#2c2c2e` | Modal surfaces |
| `border` | `#2c2c2e` | Hairline dividers |
| `borderGlow` | `rgba(165,153,255,0.40)` | Focus ring |
| `textPrimary` | `#ffffff` | Headings, key numbers |
| `textSecondary` | `#f2f2f7` | Body text |
| `textMuted` | `#8e8e93` | Labels, subtitles |
| `textTertiary` | `#636366` | Timestamps, least important |
| `accentPrimary` | `#a599ff` | Sara's color — interactive elements |
| `accentGreen` | `#5eda9e` | Completed, present, success |
| `accentAmber` | `#ff9f4d` | At-risk, warnings, urgency |
| `accentBlue` | `#89dceb` | Calendar, schedule items |
| `error` | `#ff6961` | Absent, overdue, below threshold |
| `priorityHigh` | `#ff6961` | P1 tasks |
| `priorityMed` | `#ff9f4d` | P2 tasks |
| `priorityLow` | `#5eda9e` | P3 tasks |

### Typography
| Token | Font | Use Case |
|---|---|---|
| `FONT_FAMILY.title` | `PlayfairDisplay_600SemiBold` | Hero text, editorial headings |
| `FONT_FAMILY.body` | `Inter_400Regular` | Body text, labels, lists |
| `FONT_FAMILY.medium` | `Inter_500Medium` | Subheadings, emphasis |
| `FONT_FAMILY.bold` | `Inter_600SemiBold` | CTAs, stats, key numbers |

### Scale
- **Font Sizes**: `xs=10, sm=12, md=14, base=15, lg=17, xl=20, xxl=26, hero=40`
- **Spacing** (8px grid): `xs=4, sm=8, md=12, lg=16, xl=20, xxl=28, xxxl=40`
- **Border Radius**: `sm=4, md=8, lg=12, xl=16, xxl=24, full=999`

---

## 11. XP / Gamification System (`src/services/xpSystem.ts`)

| Event | XP | Type |
|---|---|---|
| Task complete | 25–50 | Variable (random) |
| Habit logged | 15 | Fixed |
| 7-day habit streak | +75 | Milestone bonus |
| 30-day habit streak | +300 | Milestone bonus |
| Goal milestone | 200 | Fixed |
| Perfect day | 500 | Fixed |
| Gym session | 40–60 | Variable |
| Onboarding complete | 100 | One-time |
| Surprise bonus | 50–200 extra | 10% random trigger |

### Level Thresholds
`0→Initiate | 500→Operator | 1500→Commander | 3500→Strategist | 7000→Vanguard | 13000→Architect | 22000→Legend | 35000→Mythic`

---

## 12. AsyncStorage Keys Reference

| Key | Default | Purpose |
|---|---|---|
| `@zentrack_pinned_modules` | `['Tasks','Sara','Calendar']` | Bottom tab module configuration |
| `zentrack_default_notif_time` | `'08:00'` | User's preferred daily notification time (HH:MM) |
| `zentrack_gym_notif_time` | `'18:00'` | Gym reminder time |
| `zentrack_xp_v1` | `'0'` | Total accumulated XP |
| `zentrack_xp_streak` | `'0'` | Daily streak count |
| `zentrack_onboarded_v2` | `null` | Onboarding flag (`'true'` = onboarded) |
| `google_workspace_token` | `null` | Google OAuth access token |
| `@zentrack_theme` | `'dark'` | User's theme preference (`'dark'` \| `'light'`) |

> All keys are also available as constants in `src/config/constants.ts → STORAGE_KEYS`.

---

## 13. Gym Plan Data (`src/data/gymPlan.ts`)

Static 6-day PPL program. `WEEKDAY_TO_PLAN` maps `new Date().getDay()` (0=Sun) to plan `dayIndex`.

| dayIndex | Day | Name | Focus |
|---|---|---|---|
| 1 | Mon | Chest & Back A | Upper chest shelf + lat width |
| 2 | Tue | Shoulders & Arms A | Anterior delt + arm mass |
| 3 | Wed | Legs A | Quad dominance + hamstrings |
| 4 | Thu | Chest & Back B | Mid chest + upper back |
| 5 | Fri | Shoulders & Arms B | Lateral delt + arm detail |
| 6 | Sat | Legs B | Hip dominance + calves |
| 7 | Sun | Rest | Active recovery |

Each exercise: `{ id, name, targetSets, targetReps, muscle, videoId (YouTube ID) }`

---

## 14. Known Hotspots & Active Bugs

| File | Severity | Issue |
|---|---|---|
| `sarvaProxy.ts` | **HIGH** | 500-char chunk limit NOT yet implemented on mobile (web app chunks correctly). Long Sara responses silently fail TTS. Add chunking before `speakWithSarvam()`. |
| `MobileDataContext.tsx:scheduleTaskReminders` | **MEDIUM** | Fires on every data change with 3s debounce (previously no debounce — fixed 2026-07-14). |
| `MobileDataContext.tsx` | ~~MEDIUM~~ **FIXED 2026-07-23** | `waterLogs` and `sleepLogs` now have active Firestore subscriptions in `WellnessContext`. |
| `voiceEngine.ts` | **MEDIUM** | Transcription fails silently on recordings under ~0.5s — Gemini rejects near-empty audio. |
| `AppNavigator.tsx` | **HIGH** | `OnboardingScreen` renders OUTSIDE all Stack/Tab navigators. Any `useNavigation()` inside OnboardingScreen will throw. Pass navigation callbacks via props only. |
| `conflictDetector.ts` | LOW | Simplified placeholder. Web app has a more sophisticated conflict engine. |
| `DashboardScreen.tsx:49-60` | LOW | Streak logic breaks on any day with no tasks AND no gym — penalizes rest days and weekends unfairly. |
| `notifications.ts` | MEDIUM | FCM remote push (for killed-app delivery) needs a dev build — fails in Expo Go SDK 53+. Local scheduling works fine. |
| `notifications.ts` | ~~HIGH~~ **FIXED 2026-07-23** | Water/sleep reminders had no UI controls (keys never written) → always silently skipped. Fixed: `NotificationsSettingsScreen` now has a WELLNESS REMINDERS section. Export `clearScheduleCache()` added so pref changes always force a full reschedule past the fingerprint cache. `GymNotificationModal` now calls `onSaved` callback for immediate reschedule after save. |

---

## 15. Code Conventions

### Design Rules
- Import colors from `COLORS` — never hardcode hex values
- Import spacing from `SPACE` — never hardcode pixel values
- Use `FONT_FAMILY` keys — never hardcode font names
- Use `feedback.tap/commit/success/warning` from `haptics.ts` — never call `Haptics.*` directly
- Access Firestore data via `useMobileData()` — never query Firestore directly inside components
- Never call `useNavigation()` inside `OnboardingScreen` — it renders outside all navigators
- Import constants from `src/config/constants.ts` — never hardcode URLs, keys, or screen names

### Where New Code Goes
| Task | Location |
|---|---|
| New screen | `src/screens/NewScreen.tsx` + register in `AppNavigator.tsx:NestedScreens` |
| New tab screen | Also add to `MainTabNavigator` component map |
| New reusable component | `src/components/Domain/ComponentName.tsx` |
| New Firestore collection | Interface in `MobileDataContext.tsx` + new `onSnapshot` subscription |
| New agent tool (mobile) | Handled entirely in `src/agent/orchestrator.ts` system prompt + SaraScreen.tsx action handler |
| New local notification type | `src/services/notifications.ts` → inside `scheduleTaskReminders()` |
| New design token | `src/theme/tokens.ts` |
| New AsyncStorage key | `src/config/constants.ts → STORAGE_KEYS` + add to Section 12 of this doc |
| New XP event | `src/services/xpSystem.ts → XP_SOURCES` + call `awardXP()` at event site |
| New screen name constant | `src/config/constants.ts → SCREENS` |

### 2026-08-17 — Tasks Module TimelineView Light/Dark Overhaul & Schedule Sync
- **UPDATED** `src/components/Tasks/TimelineView.tsx` — Complete overhaul of the 24-hour timeline rendering engine:
  1. **Dual-Theme Support (Frost Quartz & Obsidian Cosmos)**: Dynamic palette for tasks (P1/High: Crimson `#DC2626` / Coral `#FF6961`, P2/Medium: Amber `#D97706` / `#FF9F4D`, P3/Low: Royal Amethyst `#6C5CE7` / Lavender `#A599FF`, Done: Emerald `#059669` / `#5EDA9E`, Missed: Red `#DC2626` / `#FF6961`), Academic Classes (Soft Purple/Blue `#6C5CE7` / `#89DCEB`), Academic Labs (Deep Sky Blue `#0284C7` / Gold `#FAD7A1`), and Gym Sessions (Emerald `#059669` / `#5EDA9E`).
  2. **Academic & Gym Schedule Parsing**: Fixed `START_HOUR` dynamic calculation to inspect both classes and labs across single-time and range formats (`"10:00 AM - 11:00 AM"`, `"10:00 - 11:00"`). Fixed default gym workout rendering for scheduled days fallback (`18:00 - 19:30`).
  3. **Live Time Indicator**: Added real-time dot and horizontal indicator line on "Today" matching `CalendarDayView`.
  4. **Interactive Navigation**: Tapping gym blocks opens Gym module (`MoreStack → Gym`) and tapping class blocks opens Attendance module (`MoreStack → Attendance`).
  5. **Hatch Pattern**: Dynamic SVG hatch overlays for done, past, and missed events adapted for light and dark contrast.
- **UPDATED** `src/screens/TasksScreen.tsx` — Wired `useAcademicData()` and `useWellnessData()` to pass `attendance`, `attendanceLogs`, `gymLogs`, `userGymPlan`, and `isDark` directly to `TimelineView`.
- **VERIFIED** — TypeScript type checker clean with 0 errors (`npx tsc --noEmit` exited with code 0).

### 2026-08-16 — Streak Detail & Wellbeing Dashboard Light Mode Implementation
- **UPDATED** `src/screens/WellbeingDashboardScreen.tsx` — Dynamic Frost Quartz palette: pure `#FFFFFF` quartz cards with `#E2E1EA` borders in light mode, `#F4F3F8` canvas, high-contrast `#1C1C1E` numbers and labels, theme-aware cyan/blue SVG line and area gradients, clean `#F0EFF7` inset AI insight box with dynamic amethyst sparkle icon. Dark mode BlurView glass card is 100% untouched.
- **UPDATED** `src/screens/StreakDetailScreen.tsx` — Full light mode conversion: `#F4F3F8` canvas, `#FFFFFF` pure quartz cards, dynamic `#1C1C1E` streak day counts, amber flame orb glow, `#E2E1EA` milestone progress track, high-contrast Overview 2x2 grid, Apple Watch style milestone achievement medals, semantic Activity breakdown cards (Amber, Sky Blue, Emerald, Amethyst), and theme-aware Apple Health activity history calendar.
- **VERIFIED** — Clean TypeScript compilation with 0 errors (`npx tsc --noEmit` exits with 0).

### 2026-08-16 — Tasks Screen & Subcomponents Light Mode Implementation
- **UPDATED** `src/screens/tasks/tasksStyles.ts` — Implemented `makeTasksStyles(colors, isDark)` dynamically rendering Frost Quartz surfaces (#F4F3F8 canvas, #FFFFFF card surfaces, #F8F7FC recessed subtask insets, #E2E1EA borders, #6C5CE7 royal amethyst accent, #DC2626 overdue banners, #D97706 priority badges, #059669 completion green). Dark mode is 100% untouched.
- **UPDATED** `src/screens/TasksScreen.tsx` — Dynamic root view, header action icons, progress ring SVG track & fill, overdue alert banner, NLP quick input container, segmented control filters, and floating bulk action bar.
- **UPDATED** `src/components/Tasks/TaskRow.tsx` — Replaced hardcoded black rows with dynamic `colors.surface`, theme-aware checkbox border/fill, dynamic tag pills, subtask progress bar, and nested subtask accordion items.
- **UPDATED** `src/components/Tasks/TaskDateStrip.tsx` — Full light/dark support with dynamic capsule items, day text, date number, today indicator dot, and active day highlight.
- **UPDATED** `src/components/Tasks/NLPTaskInput.tsx` — Dynamic natural language token chips using translucent light tints with high-contrast text in light mode, dynamic mic state styling.
- **UPDATED** `src/components/Tasks/RecurrencePickerModal.tsx`, `BulkRescheduleSheet.tsx`, `TaskTimeLogSheet.tsx`, `TaskTemplatesSheet.tsx`, `NewTaskModal.tsx`, `EditTaskModal.tsx` — Converted all task sheets and modals to use dynamic theme tokens and `makeStyles(colors, isDark)`.
- **VERIFIED** — Zero compile errors (`npx tsc --noEmit` exits with 0).

### 2026-08-16 — Home Screen & Core Design System Light Mode Implementation
- **IMPLEMENTED** `src/theme/tokens.ts` — Updated `LIGHT_COLORS` with the complete Frost Quartz palette (#F4F3F8 canvas, #FFFFFF pure quartz cards, #F0EFF7 soft inset surface, #E2E1EA titanium lavender border, #1C1C1E Apple charcoal text, #6C5CE7 royal amethyst accent, #059669 emerald green, #D97706 golden amber, #0284C7 sky blue, #DC2626 crimson red). Dark mode palette (`DARK_COLORS`) 100% untouched.
- **UPDATED** `src/navigation/AppNavigator.tsx` — Dynamic root canvas background (#F4F3F8) and `RootNavigatorWithSara` container matching active theme.
- **UPDATED** `src/screens/dashboard/dashboardStyles.ts` & `DashboardScreen.tsx` — Full theme awareness: speed dial floating action buttons use `colors.surface`, `colors.border`, `colors.accentPrimary`, and `colors.accentBlue`; avatar dropdown menu uses dynamic borders and high-contrast close button; Flashcard Recall Due Widget updated to pure `colors.surface`, `colors.border`, and dynamic action CTAs; streak pill uses `colors.accentAmberDim` and `colors.accentAmber`.
- **UPDATED** `src/components/Dashboard/UnifiedLifeWidget.tsx` — Dynamic card background (`colors.surface` in light mode), SVG donut track ring (`#EAE9F2` in light mode), center score text (`colors.textPrimary`), vertical divider (`colors.border`), and metric rows (Momentum in `colors.accentGreen`, Hydration in `colors.accentBlue`, Classes in `colors.accentAmber`).
- **UPDATED** `src/components/Dashboard/AgendaWidget.tsx` — Replaced hardcoded orange with `colors.accentAmber`; empty state button text and icons use dynamic theme colors.
- **UPDATED** `src/components/Navigation/TelegramTabBar.tsx` — Tab badges styled with dynamic `colors.error` and `isDark ? 'rgba(25, 25, 28, 1)' : '#ffffff'` borders.
- **UPDATED** `src/components/Dashboard/QuickCaptureSheet.tsx` & `WaterLogSheet.tsx` — Fully dynamic sheets, drag handles, input containers, quick add bottle chips, and CTA buttons.

### 2026-08-12 — WorkoutSummaryScreen Redesign (Minimalist & Structured)
- **REDESIGNED** `src/screens/gym/WorkoutSummaryScreen.tsx` — Replaced the loud glowing purple elements, oversized trophy icon, and unformatted chart container with a subtle, high-end minimalist design:
  1. **Minimalist Top Hero** — Clean checkmark-circle indicator in a dark glass frame (`colors.textPrimary` + subtle hairline border), elegant title & subtitle.
  2. **Quick Session Metrics Grid** — 4-column summary grid showing Exercises count, Sets Done, Volume (kg), and Best Lift.
  3. **Session Breakdown Card** — Structured list of completed exercises with set badges & max weight logged today.
  4. **Structured 90-Day Progression** — Minimalist pill chips for exercise selection (no neon glow), compact 2-option Segmented Control (`Est. 1RM` | `Total Volume`), and clean translucent chart styling with a compact empty state card when data points are sparse.
  5. **Minimalist Primary Action** — Clean primary "Done" button with dark/light neutral contrast, haptic feedback, zero loud glowing purple borders.

### 2026-07-26 — AddExerciseModal v2: Search-as-you-type + Auto-fill
- **REWRITTEN** `src/components/Gym/AddExerciseModal.tsx` — Completely replaced the old UX (full plan-day list dumped upfront) with a search-driven experience:
  1. **No upfront list** — input field is focused immediately, no exercise dump visible.
  2. **Search-as-you-type** — builds a `EXERCISE_CATALOGUE` (100+ exercises) by deduplicating `GYM_PLAN` + `EXERCISE_ALTERNATIVES` entries at module load time. As the user types, a compact inline `FlatList` dropdown appears (max 5 rows, scrollable) filtered by substring match.
  3. **Auto-fill on tap** — tapping any suggestion populates sets, reps, rest timer, muscle group, and videoId from the catalogue entry's metadata.
  4. **Last-session pre-load** — after a suggestion is selected, `gymLogs` is scanned (newest-first) to find the last completed session for that `exerciseId`/name; the found `setsLog` is fed into the new exercise's `setsLog` as default weight/reps values AND stored in `lastSessionSets`.
  5. **Compact layout** — sets/reps/rest are now a single 3-column row. YouTube link field moved to bottom. Muscle pills unchanged. "Save to Master Split" toggle preserved.

### 2026-07-26 — Sunday Weekly Gym Report
- **ADDED** `src/components/Gym/WeeklyGymReport.tsx` — New component shown on Sundays (rest day). Displays: global session/sets/volume stats with week-over-week delta badges; a 7-column daily volume bar chart (Mon–Sun); muscle-group donut rings (SVG, colour-coded by `MUSCLE_COLORS` map); a sets-by-muscle bar breakdown; an "untrained muscles" amber warning card with chips; and a vs-last-week comparison table. Pure computed stats from existing `gymLogs` Firestore data — zero new API calls.
- **MODIFIED** `src/screens/gym/GymHomeScreen.tsx` — Imported `WeeklyGymReport`. Added `isSundaySelected` memo using LOCAL date components (avoids UTC midnight → wrong day bug in IST). Conditionally renders `<WeeklyGymReport>` on Sunday in place of the normal START WORKOUT UI.
- **FIXED** `src/hooks/useGymLog.ts` — Removed both hardcoded Treadmill cardio insertions (lines 214–226, 265–275). Cardio now starts empty; users add it explicitly via AddCardioModal.
- **FIXED** `src/components/Gym/AddCardioModal.tsx` — Updated title from "Add Extra Cardio" → "Add Cardio" and replaced "Treadmill is always included" hint with a generic prompt.

### 2026-07-26 — AttendanceScreen Scroll Fix
- **FIXED** `src/screens/AttendanceScreen.tsx` — Eliminated the "sidebar" effect during scroll. Root cause: semester overview, warning banner, week strip, and section header were rendered as fixed siblings above a `flex:1` `FlatList`, causing the content above to appear as a static block while only the list scrolled — making the UI feel broken and split. Fix: moved all those elements into `ListHeaderComponent` so the entire screen scrolls as one unified flow. Added `showsVerticalScrollIndicator={false}` to hide the native Android scroll indicator bar on the right edge. Increased `paddingBottom` from 100→120 to clear the floating tab bar.

### 2026-07-22 — Section 5 UI Improvements & Fixes
- **OPTIMIZED** `src/screens/TasksScreen.tsx` — AnimatedSectionList performance: added `extraData={useMemo(() => ({ isBulkEdit, selectedTaskIds }), [...])}` to prevent full re-renders on unrelated state changes; added `getItemLayout` for 72px rows to allow scroll position prediction; set `removeClippedSubviews={false}` to eliminate "blank scroll" flash on fast flings; wired the existing memoized `renderItem` callback instead of an inline closure.
- **FIXED** `src/screens/DashboardScreen.tsx` — WaterRing hardcoded colors: replaced `#0A84FF` (iOS system blue, outside Obsidian Cosmos palette) and `#5E5CE6` (outside palette) with `colors.accentBlue` (#89dceb — semantically water = blue, completed state) and `colors.accentPrimary` (#a599ff — in-progress state). Fixes high-contrast clash in light mode.
- **FIXED** `src/components/SARA/ReasoningFeed.tsx` — Added `ScrollView` import and `scrollRef`. Wrapped the step map in a `maxHeight: 180` constrained `View + ScrollView` with `onContentSizeChange → scrollToEnd({ animated: true })`. Prevents ReasoningFeed from pushing the input bar off-screen on iPhone SE / budget Android when 5+ reasoning steps accumulate.
- **ADDED** `src/screens/gym/GymHomeScreen.tsx` — Dynamic muscle heatmap replacing the static placeholder. Uses `react-native-svg` `Path` + `Ellipse` elements for 12 muscle groups (Chest, Back, Shoulders, Biceps, Triceps, Abs, Forearms, Traps, Glutes, Quads, Hamstrings, Calves). Color intensity maps weekly session counts: 0→`COLORS.surface2`, 1→`accentPrimary` at 25%, 2→60%, 3+→full. Computed via `useMemo` from `gymLogs` (current week Mon–Sun, completed sets only). Renders above the workout banner with a 4-item legend.

### 2026-07-25 — Recurring Task Permanent Delete Fix
- **FIXED** `src/screens/TasksScreen.tsx:handleDelete` — Two bugs in the recurring task deletion dialog:
  1. **"All future instances"** was using `data.date > task.date` (strictly greater), so the clicked task's date was never included in the batch delete — it only deleted the one doc individually then skipped that date in the batch. Changed to `>= task.date` so the selected day AND all future dates are cleaned up together in a single batch commit.
  2. **Group matching** was using `data.title === task.title` which is fragile (matches any recurring task with the same title). Now uses `data.recurringSourceId === task.recurringSourceId` when `recurringSourceId` is present (all tasks created post-implementation), with title+isRecurring as a fallback for older docs.
  3. Removed the redundant separate `deleteDoc(task.id)` before the batch — the current task is now included in the batch via the `>= task.date` predicate, reducing Firestore round-trips by 1.

### 2026-07-24 — SARA Engine v2 Upgrade: Bulk Actions, Session Memory, App Scan, About Modal
- **UPGRADED** `src/agent/orchestrator.ts` — `buildActionRules()`: rewrote the DAG trigger from a soft suggestion to a hard rule. Any request with **2+ items, a number word, multiple dates, or list words ("each", "all", "both")** now mandates a `[[DAG:...]]` block instead of individual `[[ACTION:...]]` blocks. Added day-sequence date map (today→day5), typed DAG node reference, and 7 concrete bulk examples Gemini can pattern-match against.
- **ADDED** `src/agent/orchestrator.ts` — `buildSessionAwareness(history)`: scans the last 12 history turns (6 pairs), extracts confirmed `[[ACTION:...]]` and `[[DAG:...]]` blocks, and injects a "What I did this session" block into every system prompt. Sara now remembers created tasks, logged habits, marked attendance, etc. from earlier in the same conversation.

### 2026-07-24 — Tasks Module Complete Overhaul
- **FIXED** `src/screens/TasksScreen.tsx` — Delete button inside EditTaskModal is now properly aligned to the far right next to the title input, improving layout and touch targets.
- **FIXED** `src/screens/TasksScreen.tsx` — Implemented proper daily recurrence. Added a `useEffect` that auto-spawns daily clones of `isRecurring` tasks for `today`, using `recurringSourceId` as a deduplication key to prevent duplicates. Client-side only, no backend cron needed.
- **ADDED** `src/contexts/MobileDataContext.tsx` — Extended the Task schema with `recurrenceRule?: RecurrenceRule` and `recurringSourceId?: string` to support flexible custom recurrences.
- **ADDED** `src/components/Tasks/RecurrencePickerModal.tsx` — A full-featured bottom sheet to configure task repeat settings (Once, Daily, Weekly, Monthly, Custom) with day-of-week and end-date selectors. Integrated into NewTaskModal and EditTaskModal, replacing the simple "Once/Daily" toggle.
- **ADDED** `src/components/Tasks/MatrixView.tsx` — Implemented a 4-quadrant Eisenhower Matrix view, separating tasks by Urgent vs. Important axes. Added a 3-way toggle in the TasksScreen header (`list` → `timeline` → `matrix`).
- **ADDED** `src/agent/orchestrator.ts` — `buildProactiveScan(ctx)`: runs a full cross-module analysis on every orchestrator call. Surfaces overdue tasks, habits not yet logged, at-risk/critical attendance subjects, assignments due in 3 days, upcoming exams, no gym session today, stalled goals, and active job applications as a "PROACTIVE SCAN" block injected before the action rules.
- **REFACTORED** `src/agent/orchestrator.ts` — `buildSystemPrompt()`: split into a cached `basePrompt` (data-fingerprint TTL) and a freshly-computed `dynamicSuffix` (session awareness + proactive scan injected before action rules on every call). Both `buildSelectiveSystemPrompt()` and fallback `buildSystemPrompt()` paths now receive `history[]` parameter for session awareness.
- **REDESIGNED** `src/screens/SaraScreen.tsx` — About Sara modal: complete rewrite from 3 generic paragraphs to a rich multi-section layout with: "What I can do right now" (7 capability rows with color-tinted icon badges), "Intelligence Architecture" (all 7 SARA Engine v2 capabilities), "Ecosystem reach" (12-module chip grid), "Coming next" (5-item future roadmap), and "Sara's current view of your world" (live stat strip with task/habit/goal/gym-log counts). Card now uses a purple glow border + `aboutOrbBadge` with accent shadow instead of plain gray.


- **RENAMED** `src/services/sarvaProxy.ts` → `src/services/sarvamProxy.ts` — fixed the typo in the filename. Updated import in `SaraScreen.tsx`. All references in this doc updated.
- **DELETED** `mobile/src/hooks/useSpotify.ts` — Spotify integration hook (9.4KB), not an active feature
- **DELETED** `mobile/src/components/Gym/SpotifyMiniPlayer.tsx` — Spotify mini player component dependent on deleted hook
- **DELETED** `mobile/bundle.js` — compiled bundle artifact (should never be in source control)
- **UPDATED** folder map: added all previously undocumented files (`dagExecutor.ts`, `GoalDetailScreen.tsx`, `StreakDetailScreen.tsx`, `StudyRoomScreen.tsx`, `WeeklyReviewScreen.tsx`, `NotificationsSettingsScreen.tsx`, all gym sub-components, all services)
- **UPDATED** contexts section: documented the `domains/` split (5 sub-contexts: Core, Academic, Wellness, Planner, Creative)
- **UPDATED** screens list: corrected all file sizes to match actual disk sizes; sorted by size descending for quick reference
- **UPDATED** file index: removed `processSaraChat` entry (no longer called from any screen after orchestrateAgent swap), added `dagExecutor.ts` entry
- **TypeScript check**: `npx tsc --noEmit` passes with zero errors after all changes

### 2026-07-14 — Direct Gemini Orchestrator (Critical Architecture Change)
- **REPLACED** `src/agent/orchestrator.ts` — removed all Socket.IO code. The mobile app no longer connects to a Render backend via WebSocket. Sara now calls `callProxy()` (direct Gemini REST) with a full system prompt containing all app context. Same `orchestrateAgent(instruction, appContext, onStep, history)` signature preserved — all callers unchanged.
- **UPDATED** `src/screens/SaraScreen.tsx` — swapped `processSaraChat` → `orchestrateAgent`. Thinking steps now stream into Sara bubble. All Firestore write handlers (task/habit/attendance/note/calendar) unchanged.
- **REMOVED** `socket.io-client` from `mobile/package.json`
- **ADDED** `disconnectSocket()` no-op stub in `orchestrator.ts` for API compatibility with sign-out callers.


### 2026-07-14 — Constants Config File Added
- **ADDED** `src/config/constants.ts` — central source of truth for all mobile constants: API endpoints, storage keys, screen names, Firestore collection names, data limits, XP levels.

### 2026-07-13 — CRITICAL FREEZE FIX + AI Overhaul
- **FIXED** `geminiProxy.ts` — removed `global.fetch` monkey-patch that was corrupting React Native's networking layer. Replaced with direct HTTP REST calls.
- **FIXED** `saraAgent.ts` — complete rewrite. Added 7 full-CRUD tools via `[[ACTION:{...}]]` pattern.
- **FIXED** `SaraScreen.tsx` — Sara now writes tasks to `collection(db, 'tasks')` and notes to `collection(db, 'notes')` with proper `userId` field.
- **FIXED** `SaraScreen.tsx:330` — 30-second idle timer now calls `closeVoiceMode()` instead of empty callback.

### 2026-07-13 — Security & Proxy Architecture
- **ADDED** `geminiProxy.ts` — `callProxy()` with direct Gemini REST + 9-key round-robin rotation.
- **ADDED** `geminiProxy.ts:getGeminiProxyClient()` — centralized client factory.

### 2026-07-12 — Initial Architecture Document
- Full codebase audit. Document created from scratch.

### 2026-07-12 — Bug Fixes
- **FIXED** `voiceEngine.ts` — `stopAndTranscribe()` now sends real base64 audio to Gemini. Old code returned hardcoded string `"This is a simulated transcript"`.
- **FIXED** `notifications.ts` — wrapped in try/catch to prevent SDK 53 FCM crash in Expo Go.
- **FIXED** `AppNavigator.tsx:GlobalSaraButton` — Added try/catch + null safety to `useNavigationState` selector.

### 2026-07-15 — Critical Gym Data Persistence Fix
- **FIXED** `src/hooks/useGymLog.ts:saveLog()` — was writing to Firestore collection `'gymLogs'` (ghost collection). `MobileDataContext` subscribes to `'gym_logs'`. All workout data was written but never read back — appeared deleted on app restart. Corrected to `'gym_logs'`.
- **FIXED** `src/hooks/useGymLog.ts:makeSwapPermanent()` — was writing permanent exercise swaps to `'gymPlans'`. `MobileDataContext` subscribes to `'user_gym_plans'`. Corrected to `'user_gym_plans'`.
- **FIXED** `src/services/offlineSync.ts:syncOfflineLogs()` — same `'gymLogs'` → `'gym_logs'` mismatch in the offline queue drain path.

### 2026-07-17 — Habit Flicker Fix + Dashboard Navigation + Notes AI Overhaul
- **FIXED** `src/contexts/domains/CoreDataContext.tsx` — Habit card flickering: added `habitWriteLockRef`/`habitLogWriteLockRef` write-lock (2s) so Firestore snapshots don't overwrite in-flight optimistic updates.
- **FIXED** `src/screens/HabitsScreen.tsx` — Added `estimatedItemSize={160}` + `extraData={todayLogs}` to FlashList; memoized `todayLogs`.
- **ADDED** `src/screens/DashboardScreen.tsx` — HABITS ring now navigates to `MoreStack → Habits` on tap with haptic feedback.
- **FIXED** `src/screens/NotesScreen.tsx` — Preview white-box bug: `markdownStyles` now explicitly overrides ALL node types the `react-native-markdown-display` library uses (`body`, `paragraph`, `fence`, `pre`, `code_block`, `code_inline`, `blockquote`, `bullet_list`, `ordered_list`, `list_item`, etc.) with dark backgrounds (`transparent` or `#1a1a2e` for code). No white areas possible.
- **FIXED** `src/screens/NotesScreen.tsx` — PDF export: replaced simple regex replace with a proper line-by-line parser that handles code fences correctly, escapes HTML, and produces a polished Inter-font document with proper footer.
- **OVERHAULED** `src/screens/NotesScreen.tsx:handleAiSubmit` — Sara's AI system prompt completely rewritten: ultra-personalized, expert-level, no markdown symbols (*, ##, ===), uses NUMBERED SECTIONS + CAPITALISED SUBHEADINGS + complete prose. Added 6 contextual quick-action buttons (Deep Summary, Action Items, Polish, Expand, Explain, Study Guide).

### 2026-07-16 — Complete Gym Module Bug Fix Sprint
- **FIXED** `src/screens/gym/ActiveLoggingScreen.tsx` — TextInput flickering: was using `defaultValue` (uncontrolled), which reset the cursor every time `saveLog` triggered `setLog`. Replaced with controlled `value` + per-set local `setInputs` state. Inputs only sync to log state on `onBlur` or on "Log Set" press.
- **FIXED** `src/hooks/useGymLog.ts` — Duplicate exercises on edit: `updateExercise` was looking up exercise by `exercise.id` which is an optional field never assigned, so `findIndex` returned `-1`. `splice(-1)` mutated the last element, making it appear as a duplicate. Fixed by using array index directly + guard for out-of-bounds.
- **FIXED** `src/hooks/useGymLog.ts` — Exercises disappearing on back navigation: `useEffect` re-ran on every Firestore `gymLogs` snapshot. If the live document had a different `id` format, it fell through to the `else` branch and replaced local state with a fresh template. Fixed with a `hasInitialised` ref — Firestore initialises the log once; after that, local state is authoritative.
- **FIXED** `src/screens/gym/ActiveLoggingScreen.tsx` — Last session data not showing: `lastTimeData` only checked *completed* sets. New sessions have no completed sets yet, so the banner was always empty. Now reads `lastSessionSets` pre-filled by the hook (from previous workout) and shows it immediately.
- **FIXED** `src/screens/gym/ActiveLoggingScreen.tsx` — No way to uncheck a completed set: checkmark was one-way. Added `handleToggleSetComplete` — tapping a completed set's checkmark now reverts it to incomplete.
- **FIXED** `src/hooks/useGymLog.ts` — All mutators (updateSet, toggleSetComplete, deleteExercise, addSet, removeSet, addCardio, updateCardio, swapExercise, startWorkout, endWorkout, resumeWorkout, startRestTimer, clearRestTimer, updateRestTimerDuration) rewritten to use `setLog(prev => ...)` functional updates + call `saveLog` inside — decouples UI from async Firestore write.
- **FIXED** `src/screens/gym/ActiveLoggingScreen.tsx` — realExerciseIndex now derived by name+exerciseId match against `log.exercises` (unfiltered), so skipped exercises don't corrupt the index passed to `updateExercise`.

### 2026-07-18 — Gym Module: 5 Root-Cause Exercise Loading Bugs Fixed
- **FIXED** `src/hooks/useGymLog.ts:todayStr()` — replaced `toISOString().slice(0,10)` (UTC) with local date component assembly. In IST (UTC+5:30), `toISOString()` returns the previous calendar date before 5:30 AM.
- **FIXED** `src/hooks/useGymLog.ts:dateStrOffset()` — same UTC→local fix. `new Date(fromStr)` on an ISO date string parses as UTC midnight; replaced with `new Date(y, m-1, d)`.
- **FIXED** `src/hooks/useGymLog.ts:planDayIndexForDate()` — `new Date(dateStr).getDay()` returns UTC day-of-week. In IST, every date mapped to the previous day's plan. Primary cause of "wrong exercises shown" and "Sunday shows Saturday's legs instead of rest day". Fixed with local-component parse.
- **FIXED** `src/hooks/useGymLog.ts` — `updatedAt` staleness guard type mismatch: Firestore `updatedAt` is a `Timestamp` object (`.toMillis()`), local `updatedAt` is `Date.now()` (number). `Timestamp <= number` is always `false`, so the guard never fired and every snapshot overwrote local state. Fixed by normalizing both sides to milliseconds.
- **FIXED** `src/hooks/useGymLog.ts` — `hasInitialised` ref was assigned but never read as a guard. Any Firestore snapshot finding 0 results for today replaced the in-progress workout with a blank template. Added `if (hasInitialised.current) return;` guard to `else if (gymLogsReady)` branch.
- **FIXED** `src/hooks/useGymLog.ts` — `hasInitialised.current` never reset when `dateStr` changes. Switching dates got stuck because the guard blocked exercise initialization for the new day. Added `hasInitialised.current = false` to the dateStr-change effect.

### 2026-08-03 — AppNavigator Heartbeat Listener + DateTimePicker Flicker Fix

- **ROOT CAUSE (grey screen + kill→Home)**: The `SESSION_ALIVE_KEY` heartbeat was fully documented in comments and architecture docs but the `AppState` listener was **never implemented**. `sessionAlive` was always `null` → every boot indistinguishable from a cold kill.
- **FIXED** `src/navigation/AppNavigator.tsx` — Added `AppState.addEventListener('change', handleAppStateChange)` inside the boot `useEffect`. On `'active'`: writes `SESSION_ALIVE_KEY='1'` + calls `forceUpdate(n=>n+1)` to nudge React's reconciler awake on screen unlock (eliminates grey frames). On `'background'`/`'inactive'`: deletes `SESSION_ALIVE_KEY` so a subsequent OS kill is detectable. Also writes initial heartbeat on cold boot. Cleanup: `appStateSub.remove()` alongside `unsubAuth()`.
- **FIXED** `src/navigation/AppNavigator.tsx` — Added `[, forceUpdate] = useState(0)` counter state incremented on every `'active'` AppState transition. This is the anti-grey-frame reconciler paint trigger.
- **FIXED** `src/screens/TasksScreen.tsx` — All 4 `DateTimePicker` `onChange` handlers (`onStartTimeChange`/`onEndTimeChange` in `NewTaskModal`; `onStartChange`/`onEndChange` in `EditTaskModalComponent`) now check `event.type` before committing. Android: `'set'` → close + commit; `'dismissed'` → close only; `'change'` (scroll tick) → no-op. iOS: inline spinner, live update. Eliminates flicker caused by committing state on scroll ticks.

### 2026-08-01 — Notification System Full Audit & Bug Fix Sprint

- **FIXED** `src/services/notifications.ts` — **BUG-N1**: Post-class and post-lab "Log attendance" reminders now skip scheduling if the user already marked present/absent/cancelled for that session. Previously fired regardless, even mid-class.
- **FIXED** `src/contexts/MobileDataContext.tsx` — **BUG-N2 (root cause of N1)**: `attendanceLogs` was never passed to `scheduleAllNotifications()`. Now passed and added to the dependency array so logging attendance triggers a reschedule that removes the stale reminder.
- **FIXED** `src/services/notifications.ts` — **BUG-N4**: Sleep morning reminder now checks **yesterday's** sleep log, not today's. Previously always fired even if user logged sleep last night.
- **FIXED** `src/services/notifications.ts` — **BUG-N5**: Gym reminders now respect `userGymPlan.customDays` before falling back to the static PPL template.
- **FIXED** `src/contexts/MobileDataContext.tsx` — Passes `userGymPlan` to `scheduleAllNotifications()` for BUG-N5.
- **FIXED** `src/services/notifications.ts` — **BUG-N6**: Attendance warning now fires at user's configured `defaultTime` instead of hardcoded 9 AM.
- **FIXED** `src/services/notifications.ts` — **BUG-N7**: Habit reminders now have personalised body text based on streak length (30+/7+/1+/0 days).
- **FIXED** `src/services/notifications.ts` — **BUG-N8**: Morning brief "missed gym yesterday" check now uses local date (not `.toISOString()` UTC) — fixes IST midnight off-by-one.
- **FIXED** `src/services/notifications.ts` — **BUG-N3**: Water reminders now check daily water total. If 2000ml goal is already met, all today's reminders are skipped. Shows remaining goal in body text.
- **IMPROVED** `src/services/notifications.ts` — Attendance warning body now shows exact classes needed to recover above 75%.
- **IMPROVED** `src/services/notifications.ts` — Morning brief appends worst-performing attendance subject name and percentage.
- **IMPROVED** `src/services/notifications.ts` — Gym reminder title includes workout name + exercise count.
- **IMPROVED** `src/services/notifications.ts` — Water reminders extended to 3-day coverage, start hour moved to 8 AM, fixed base-date mutation bug.
- **IMPROVED** `src/services/notifications.ts` — Background fetch now queries `attendance_logs` so BUG-N1 fix works even when app is killed.
- **MODIFIED** `src/services/notifications.ts:ScheduleParams` — Added `attendanceLogs?: AttendanceLog[]` and `userGymPlan?: UserGymPlanDoc | null`.
- **MODIFIED** `src/services/notifications.ts:_buildFingerprint()` — Added `attendanceLogs.length` so attendance log changes bypass the fingerprint cache.
- **REMOVED** `src/services/gymInsightEngine.ts`, `src/components/Gym/WorkoutInsightCard.tsx`, `src/screens/gym/home/useGymInsight.ts` — Completely deleted intrusive pre-workout modal blocker and engine so workouts start immediately with 0 delay.
- **CONSOLIDATED** `src/components/Gym/WorkoutTimer.tsx` & `src/features/gym/components/LiveTimer.tsx` — Eliminated duplicate inline timers across Mobile and Web (`useWorkoutTimer.ts` removed).
- **CLEANED** `src/screens/DashboardScreen.tsx` & `src/components/Dashboard/UnifiedLifeWidget.tsx` — Purged orphan `contentLogs` state/props; consolidated water storage on `zentrack_water_goal_ml` with automatic migration; streamlined header by merging layout configuration into the interactive Avatar menu.

### 2026-08-15 — Learning Module & Deep Work Gamification Sprint
- **ADDED** `src/services/youtubeTranscriptService.ts` — High-speed timedtext JSON3 parser + Gemini fallback transcript extraction with millisecond timestamps.
- **ADDED** `src/services/flashcardService.ts` — SuperMemo SM-2 spaced repetition algorithm with Gemini active recall flashcard generation and Firestore sync (`COLLECTION.FLASHCARDS`).
- **ADDED** `src/components/Learning/FlashcardReviewModal.tsx` — 3D Flippable card deck review modal with grading buttons (`Again`, `Hard`, `Good`, `Easy`) and completion XP rewards.
- **ADDED** `src/components/Learning/LearningVideoPlayer.tsx` — Interactive synchronized transcript drawer with real-time video seeking, keyword search, and 1-tap `+ Flashcards` creation chips.
- **OVERHAULED** `src/components/Learning/LearningTopicCard.tsx` — Replaced native `Alert.alert` with a ZenTrack OLED Dark Bottom Sheet Modal for study slot scheduling (supports tap-to-dismiss on empty background space and top close button).
- **INTEGRATED** `src/services/xpSystem.ts` & `src/screens/LearningScreen.tsx` — Added Learning XP sources: `+25 XP` per completed lecture chapter (`LECTURE_COMPLETE`), `+50 XP` for 3/3 score on lecture quiz (`QUIZ_PERFECT`), and `+10 XP` for daily flashcard review (`FLASHCARD_REVIEW`).
- **FIXED** `src/screens/tasks/taskConstants.ts` & `src/screens/tasks/EditTaskModal.tsx` — Resolved `Cannot read property 'toString' of undefined` crash when editing tasks created with named time slots (e.g. `evening`, `morning`). `formatTimeDisplay` and `EditTaskModal` now safely handle named slots, 24-hour ranges, and non-colon formatted strings without error.
- **IMPROVED** `src/components/Learning/LearningModals.tsx:handleImportAiSyllabus` — S.A.R.A AI Syllabus generator now imports the complete curriculum as **1 unified topic card** with all sequential module checkpoints grouped under that single roadmap, eliminating duplicate fragmented cards.
- **ADDED** `server/routes/youtube-transcript.js` — 4-Layer Resilient YouTube Transcript Backend: Layer 1 InnerTube Android PlayerResponse + TimedText (~150ms), Layer 2 Gemini 2.5 Flash native multimodal URL ingestion (no captions required), Layer 3 Supadata.ai edge API cloud proxy (SUPADATA_API_KEY optional), Layer 4 Gemini deep audio analysis fallback. Returns `{ cues[], source, latencyMs, layers_tried }`. Registered at `GET /api/youtube/transcript?videoId=xxx`.
- **UPGRADED** `src/services/youtubeTranscriptService.ts` — Now calls backend 4-layer pipeline first. Returns `TranscriptResult { cues, source, latencyMs, layersTried }` instead of bare array. Falls back to client-side InnerTube then Gemini `callProxy` if backend unreachable. Exports `transcriptToPlainText(cues, maxChars)` helper for ZEN-GPT context ingestion.
- **UPDATED** `src/components/Learning/LearningVideoPlayer.tsx` — Consumes `TranscriptResult` type, logs transcript source and latency to console for debugging.
- **ADDED** `src/components/Learning/LearningVideoPlayer.tsx:handleExportResponseToNotes` & `src/features/learning/ChatMessage.tsx` — 1-Tap **"Export to Notes"** / **"+ Notes"** buttons on every ZEN-GPT assistant response. Instantly appends the AI explanation formatted with video playback timestamps (`[MM:SS]`) into the student's lecture notes draft, with 1-click cloud sync to ZenNotes workspace (`COLLECTION.STORAGE_NODES`).
- **PERSISTED** `src/screens/LearningScreen.tsx` — Lecture chat conversations (`@lecture_chat_${sub.id}`), transcripts (`@lecture_transcript_${vidId}`), and notes (`@lecture_notes_${sub.id}`) are now fully cached and restored per lecture. Re-opening any lecture restores the full ZEN-GPT conversation history and notes draft without re-scraping. Added a 1-tap "Clear Chat" (`resetChatHistory`) option in both standard and fullscreen views.
- **VERIFIED** 4-Layer Transcript Pipeline on Expo Go — Operates 100% in Expo Go via standard HTTP `fetch` to `https://zentrackworld.vercel.app/api/youtube/transcript` (0 custom native modules needed).
- **REDESIGNED** `src/components/Learning/LearningVideoPlayer.tsx` — Made the overall chat container (`aiPanel`), input row (`aiInputRow`), and suggestion chips (`Quiz Me` & `+ Flashcards`) transparent, while keeping **only the message input field capsule (`aiInputCapsule`) solid and opaque (`#18181b`)**, ensuring clean readable text input with a floating glass aesthetic. Streamlined assistant message bubbles to keep compact `[+ Notes]` and `[+ Flashcards]` action chips solely in the top header. Removed redundant Focus Mode (`scan-outline`) and PiP (`copy-outline`) buttons from the player controls header.
- **FIXED** `src/screens/LearningScreen.tsx` & `src/components/Learning/LearningVideoPlayer.tsx` — Purged CP437 corrupted character artifacts (`≡ƒÆí`, `┬╖`, `ΓåÆ`) from system prompt. Added `sanitizeMarkdownText` to prevent markdown typographer from converting quiz option `(C)` into the copyright symbol `©` and cleanly normalize all MCQ options to `A)`, `B)`, `C)`, `D)`.
- **REPLACED** `src/screens/LearningScreen.tsx` — Removed 300+ lines of dead legacy on-device HTML/TimedText scrapers and migrated `openVideo` to directly consume the 4-layer resilient pipeline from `src/services/youtubeTranscriptService.ts`, preventing "Scraper V3 Failed" timeout errors.
- **ADDED** `src/components/Learning/VsCodeSyntaxHighlighter.tsx` & `LearningVideoPlayer.tsx` — Built authentic **VS Code Dark+ Syntax Highlighting** for all code blocks in ZEN-GPT tutor chat. Colorizes keywords (`#569cd6`), control flow (`#c586c0`), types (`#4ec9b0`), strings & preprocessors (`#ce9178` / `#c586c0`), comments (`#6a9955` italic), numbers (`#b5cea8`), functions (`#dcdcaa`), and variables (`#9cdcfe`) with line numbers and copy action.
- **UPDATED** `LearningVideoPlayer.tsx` & `LearningScreen.tsx` — Suggestion pills (`Quiz Me` & `+ Flashcards`) now automatically auto-hide as soon as the student asks their first question in chat. Chat history is preserved with dual-layer storage: offline in `AsyncStorage` (`@lecture_chat_${sub.id}`) and synchronized to Firestore cloud (`lectureChats/${userId}/videos/${sub.id}`). Clear chat deletes both local and remote chat history cleanly.
- **ADDED** `src/components/Learning/LectureChatHistoryModal.tsx` & `LearningVideoPlayer.tsx` — Added a **"Chat History"** button (`time-outline`) right beside the Delete button in both standard and fullscreen player modes. Tapping it opens a sleek bottom sheet showing all past lecture conversations, message counts, latest snippets, search filtering, and 1-tap switching between lectures. Capped total chat sessions to the **latest 5**, automatically pruning older sessions from storage. Fixed header text overflow using `flexShrink: 1` and right padding so topic titles truncate cleanly with `...` without colliding into the delete icon.
- **REWRITTEN** `src/components/ui/BottomSheet.tsx` — Replaced spring physics with instant fluid 180ms cubic deceleration (0 bounce). Added Android hardware back button handler (`BackHandler`), immediate keyboard dismissal, touch-outside handling, and 140ms quick exit.
- **UPGRADED** `src/contexts/domains/WellnessContext.tsx:applyMasterTemplate` & `src/hooks/useGymLog.ts` — Made workout template importing 100% robust when overriding existing AI or custom plans. Correctly maps all 7 days for every schedule pattern (e.g. Tuesday–Sunday with Monday Rest, Monday–Saturday with Sunday Rest, Mid-Week Rest, and Weekday-only splits). Automatically preserves earlier completed workouts (e.g., Monday & Tuesday logged sessions remain untouched) when importing mid-week from Wednesday onwards, aligning Wednesday–Saturday/Sunday for the current week, while establishing the full 7-day recurring split for all future weeks.
- **UPDATED** `src/screens/dashboard/useDashboardData.ts` & `src/components/Dashboard/DashboardLayoutSheet.tsx` — Made the Quick Capture input widget **hidden by default (`{ id: 'capture', hidden: true }`)** for all users and new sessions, giving the home dashboard the clean streamlined look with zero clutter. Added a 1-time layout migration so existing local storage automatically updates to hide quick capture while allowing users to re-enable it anytime from Customize Layout.

### 2026-08-15 — Exercise Swap: Template Exercises & Database Integration
- **OVERHAULED** `src/screens/gym/ExerciseSwapScreen.tsx` — When swapping any exercise (e.g. Thursday Long Tricep), the screen now automatically scans all days in the workout template (`GYM_PLAN_PPL`, `GYM_PLAN_ARNOLD`, user `customDays`), matching by exact sub-muscle (e.g. `Long Tricep` → Monday's `Overhead Cable Extension (rope)`) and parent muscle category (`Triceps`).
  1. **"From Workout Template" Section**: Prominently renders matching template exercises with origin day badges (e.g. `Monday (Push A)`, `Friday (Shoulders & Arms)`), sets, reps, rest times, and video indicators.
  2. **"S.A.R.A AI Biomechanical Swaps" Section**: Live AI analysis + instant 0ms fallback displaying curated database alternatives tailored to movement mechanics.
  3. **"All Exercises" Tab**: Unified catalog combining template exercises (badged) + entire exercise database with filter chips (`All`, `In Template`, `[Target Muscle]`, `[Muscle Category]`) and fast multi-attribute search.
  4. **Master Split Update**: Tapping to swap updates the active session log and prompts to optionally save permanently to the master routine.
- **UPDATED** `src/screens/gym/ActiveLoggingScreen.tsx` — Tapping the `SWAP` button on any active exercise card now navigates directly to `ExerciseSwapScreen`.
- **UPDATED** `src/screens/gym/GymHomeScreen.tsx` — Added a **"Swap Exercise..."** option to the exercise context menu (ellipsis button) on the main gym screen.
- **UPDATED** `src/features/gym/components/AddExerciseModal.tsx` (Web) — Added routine day selection so web users can browse and select exercises across all template days (e.g. selecting Monday exercises when on Thursday).
- **CURATED & INTEGRATED** `src/data/gymPlan.ts` & `src/services/exerciseVideoResolver.ts` — Complete verified YouTube Shorts (< 120s) form guide video library for all 6 days of the PPL Split (**Monday to Saturday, 55 total exercises**). Tapping any exercise form video in ZenTrack opens high-yield, verified Shorts with concise biomechanical tutorials from TylerPath, Hazzytrainer, DeltaBolic, Gerardi Performance, and Davis Diley.

### 2026-08-16 — Attendance Screen & Academic Modals Light Mode Implementation
- **UPDATED** `src/screens/attendance/attendanceStyles.ts` — Refactored `makeStyles(colors, isDark = true)` providing dynamic styling for both *Obsidian Cosmos* (OLED Dark Mode) and *Frost Quartz* (Light Mode). Styled overview card (`#FFFFFF` background, `#E2E1EA` border), warning banner (`#FEF2F2` background, `#F87171` border in light), week strip, subject cards, log rows (`#F5F4FA` in light), session status buttons (Present `#059669` / `#ECFDF5`, Absent `#DC2626` / `#FEF2F2`, Cancelled `#636366` / `#F5F4FA`), history modal, and extra class logging bottom sheet.
- **UPDATED** `src/screens/AttendanceScreen.tsx` — Integrated `isDark` and `getThemeProgressColor` mapped dynamically to `colors.priorityLow` (`#059669` light / `#5eda9e` dark), `colors.priorityMed` (`#D97706` light / `#ff9f4d` dark), and `colors.priorityHigh` (`#DC2626` light / `#ff6961` dark). All headers, progress tracks, subject cards, and interactive modal dialogs adapt instantly to theme switching.
- **UPDATED** `src/screens/attendance/HorizontalWeekStrip.tsx` — Converted week selector with dynamic active day text (`#FFFFFF` in light / `#000000` in dark), today outline indicator (`rgba(108, 92, 231, 0.12)` background, `rgba(108, 92, 231, 0.35)` border), and high-contrast weekday numbers.
- **UPDATED** `src/components/Academic/TimetableModal.tsx` — Dynamic timetable list with `#FFFFFF` subject cards, `#F5F4FA` metric chips, `#6C5CE7` add button, emerald green CSV export button, and crimson reset button.
- **UPDATED** `src/components/Academic/AddSubjectModal.tsx` — Full light/dark support with high-contrast inputs, segmented baseline mode selector, dynamic `#F8F7FC` calibration card with live safe/risk indicators, and schedule day cards.
- **UPDATED** `src/components/Academic/ClassNotifSettingsModal.tsx` — Dynamic subject alert configuration with theme-aware cards, chip toggles, lab notification sections, and save button.
- **VERIFIED** — Dual theme ready across all attendance submodules and modal dialogs.

### 2026-08-16 — Grades & GPA Calculator Screen Light Mode Implementation
- **UPDATED** `src/screens/GradesScreen.tsx` — Full dual-theme (*Obsidian Cosmos* & *Frost Quartz*) implementation:
  1. **Dynamic Theme Foundation**: Integrated `useTheme()` with `makeStyles(colors, isDark)` and native `<StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />`.
  2. **Hero & Target Predictor Cards**: Pure `#FFFFFF` card surfaces with `#E2E1EA` borders in light mode, `#1C1C1E` bold inputs, `#F0EFF7` recessed numeric fields, and dynamic Needed SGPA result box with semantic alert states (Emerald Green for achieved, Crimson Red for impossible, Royal Amethyst for standard target).
  3. **SVG Progression Graph**: Dynamic SVG reference grid lines (`#E2E1EA`), SGPA semester bars (`#E2E1EA` with `#D1D0DC` border), and royal amethyst CGPA trajectory line with crisp circular data nodes.
  4. **Semester Accordion & Subject Chips**: High-contrast semester headers, `#F0EFF7` letter grade badges, `#6C5CE7` Add Subject button, and dynamic Direct SGPA quick mode controls.
  5. **Dialog Modals**: Elevated `#FFFFFF` dialog surfaces for New Semester, Add Subject, and Direct SGPA modals with titanium lavender input styling and royal amethyst save CTA.
- **VERIFIED** — Clean TypeScript compilation with 0 errors.

### 2026-08-16 — More Screen (Launcher) & Telegram Tab Bar Light Mode Implementation
- **UPDATED** `src/screens/MoreScreen.tsx` — Dynamic frosted bottom sheet adapting between Obsidian Cosmos (`BlurView tint="dark"`, `rgba(28,28,30,0.4)`) and Frost Quartz (`BlurView tint="light"`, `#FFFFFF` with `#E2E1EA` border). Integrated dynamic module semantic color mappings (`#059669` Tasks, `#D97706` Habits/Notes/Gym, `#DC2626` Calendar, `#6C5CE7` Attendance/Grades, `#0284C7` Assignments/Learning/Analytics). Styled `#F0EFF7` Edit Nav pill, `#FFFFFF` pure quartz elevated squircles, and Royal Amethyst checkmark badges.
- **UPDATED** `src/components/Navigation/TelegramTabBar.tsx` — Floating capsule styled with dynamic `#E2E1EA` border and soft shadow in light mode, precision animated sliding dot indicator with `#6C5CE7` accent glow, and dynamic unread notification badges.
- **VERIFIED** — Clean TypeScript compilation with 0 errors.

### 2026-08-16 — Assignments Module & BottomSheet Dual-Theme Implementation
- **UPDATED** `src/components/ui/BottomSheet.tsx` — Converted `BottomSheet` to dynamic theme tokens. Replaced hardcoded dark background (`#0c0c0e`), border, and handle bar with dynamic theme support (`#FFFFFF` in Frost Quartz Light Mode, `#121214` in Obsidian Cosmos Dark Mode, `#E2E1EA` border in Light, and dynamic drag handle).
- **UPDATED** `src/screens/AssignmentsScreen.tsx` — Complete dual-theme (*Obsidian Cosmos* & *Frost Quartz*) implementation:
  1. **Dynamic Theme Foundation**: Integrated `useTheme()` with `makeStyles(colors, isDark)` and native `<StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />`.
  2. **Filter Bar & Segmented Chips**: `#FFFFFF` quartz capsules with `#E2E1EA` borders and `#636366` subtext in light mode, transitioning to Royal Amethyst (`#6C5CE7`) when active.
  3. **Assignment Cards & Status Squircles**: Elevated `#FFFFFF` card surfaces with soft drop shadows, dynamic status badges (Not Started `#64748B`, In Progress `#D97706`, Submitted `#0284C7`, Graded `#059669`), and semantic urgency calculations (Overdue Crimson `#DC2626`, Due Today Amber `#D97706`, Safe Emerald `#059669`).
  4. **BottomSheet Modal & Form**: Removed nested `modalOverlay` / `modalCard` double nesting. Direct `#F0EFF7` recessed input boxes, `#E2E1EA` hairline borders, dynamic date picker button, status selector chips with high-contrast text, and Royal Amethyst save CTA.
- **VERIFIED** — Clean TypeScript compilation with 0 errors.





