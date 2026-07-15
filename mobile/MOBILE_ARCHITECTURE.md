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
| `expo-random` | ^14.0.1 | Secure random generation |
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
| `@google/generative-ai` | ^0.24.1 | Gemini SDK — used only if needed by saraAgent |

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
    │   ├── orchestrator.ts               MAIN AI ENTRY: direct callProxy() Gemini loop (no Socket.IO)
    │   └── saraAgent.ts                  processSaraChat() + processGymChat() — direct Gemini via callProxy()
    ├── components/
    │   ├── Academic/
    │   │   └── AddSubjectModal.tsx        (12KB)
    │   ├── AnimatedPressable.tsx          Reusable pressable with micro-animation
    │   ├── Calendar/
    │   │   └── AddEventModal.tsx          (7KB)
    │   ├── Dashboard/
    │   │   ├── SaraBriefingCard.tsx       AI briefing widget on home
    │   │   └── ProactiveNudgeCard.tsx     Amber nudge card
    │   ├── Gym/
    │   │   ├── ExerciseCard.tsx           Set logging, RPE, rest timer (18KB)
    │   │   ├── ZenGymAiModal.tsx          GAINS agent coaching modal (13KB)
    │   │   ├── AddExerciseModal.tsx       (9KB)
    │   │   ├── CardioCard.tsx             (5KB)
    │   │   ├── ExerciseHistoryDrawer.tsx  (4KB)
    │   │   ├── AddCardioModal.tsx         (4KB)
    │   │   └── GymProfileModal.tsx        (3KB)
    │   ├── SARA/
    │   │   ├── SaraBubble.tsx             Bubble types: sara/user/action_card/quick_reply (6KB)
    │   │   ├── VoiceOrb.tsx               Animated orb: idle/listening/speaking states (5KB)
    │   │   ├── ActionConfirmationCard.tsx Confirm/reject proposed action (5KB)
    │   │   ├── VoiceMicButton.tsx         Mic button in chat input bar (2KB)
    │   │   └── StreamingText.tsx          Animated streaming text renderer (2KB)
    │   ├── Tasks/
    │   │   └── TaskRow.tsx                (6KB)
    │   └── ui/
    │       ├── FloatingActionButton.tsx   (1KB)
    │       └── GlassCard.tsx              (1KB)
    ├── config/                            [NEW 2026-07-14] App-wide constants
    │   └── constants.ts                   Endpoints, storage keys, screen names, collection names, limits
    ├── contexts/
    │   └── MobileDataContext.tsx          CRITICAL: 18 Firestore subscriptions + all TypeScript interfaces (16KB)
    ├── data/
    │   └── gymPlan.ts                     Static 6-day PPL gym plan + YouTube exercise IDs (8KB)
    ├── hooks/
    │   ├── useSaraNavigation.ts           Parses [NAVIGATE:X] tokens from agent responses (3KB)
    │   ├── useGymLog.ts                   Gym session state machine (8KB)
    │   └── useProactiveAgent.ts           Conflict detection trigger (<1KB)
    ├── navigation/
    │   ├── AppNavigator.tsx               Root navigator: auth gate, tab/stack setup (15KB)
    │   └── GymStack.tsx                   Nested gym screen stack (1KB)
    ├── screens/
    │   ├── SaraScreen.tsx                 ChatGPT-style AI chat + voice mode (22KB+)
    │   ├── TasksScreen.tsx                Full task manager (50KB)
    │   ├── AttendanceScreen.tsx           Attendance tracker + timetable (44KB)
    │   ├── NotesScreen.tsx                Rich notes + file storage (41KB)
    │   ├── OnboardingScreen.tsx           5-step psychological onboarding (28KB)
    │   ├── GoalsScreen.tsx                (23KB)
    │   ├── CalendarScreen.tsx             (23KB)
    │   ├── HabitsScreen.tsx               (20KB)
    │   ├── SettingsScreen.tsx             (16KB)
    │   ├── JobsScreen.tsx                 (15KB)
    │   ├── AssignmentsScreen.tsx          (14KB)
    │   ├── GradesScreen.tsx               (14KB)
    │   ├── LearningScreen.tsx             (12KB)
    │   ├── AuthScreen.tsx                 (11KB)
    │   ├── AnalyticsScreen.tsx            (10KB)
    │   ├── MoreScreen.tsx                 Module launcher (10KB)
    │   ├── SocialScreen.tsx               (10KB)
    │   ├── DashboardScreen.tsx            Home: briefing, tasks, stats, nudge (9KB)
    │   ├── FocusScreen.tsx                Pomodoro timer (9KB)
    │   ├── GuestDashboard.tsx             (5KB)
    │   ├── LandingScreen.tsx              (4KB)
    │   ├── AuthModal.tsx                  (4KB)
    │   └── gym/
    │       ├── GymHomeScreen.tsx          Today's plan + muscle diagram (21KB)
    │       ├── ActiveLoggingScreen.tsx    Live set-by-set logging (15KB)
    │       ├── GymProgressScreen.tsx      Strength progress charts (11KB)
    │       ├── GymHistoryScreen.tsx       (8KB)
    │       ├── WorkoutSummaryScreen.tsx   Post-workout stats (7KB)
    │       ├── ExerciseDetailScreen.tsx   (7KB)
    │       ├── ExerciseSwapScreen.tsx     (6KB)
    │       └── CardioLogScreen.tsx        (6KB)
    ├── services/
    │   ├── firebase.ts                    Firebase init with AsyncStorage persistence
    │   ├── geminiProxy.ts                 Direct Gemini REST calls with 9-key rotation (CRITICAL)
    │   ├── sarvaProxy.ts                  Sarvam AI TTS via Vercel voice-proxy
    │   ├── voiceEngine.ts                 Mic recording + Gemini audio transcription
    │   ├── notifications.ts               Local scheduled notifications (zero-cost)
    │   ├── xpSystem.ts                    XP/gamification (Skinner variable rewards)
    │   ├── conflictDetector.ts            Schedule conflict detection engine
    │   └── cloudinary.ts                  File upload for Notes storage nodes
    ├── theme/
    │   ├── tokens.ts                      COLORS, RADIUS, SPACE, FONT_FAMILY, SHADOW
    │   ├── animations.ts                  Reanimated animation presets
    │   └── motion.ts                      Timing/easing constants
    ├── types/
    │   └── gym.types.ts                   GymPlanDay, GymExercise TypeScript interfaces
    └── utils/
        └── haptics.ts                     feedback.tap/commit/success/warning
```

---

## 4. File Index — Direct Navigation Table

### Agent & AI (go here first for any Sara issue)
| Purpose | Exact File Path | Key Export |
|---|---|---|
| **Sara mission dispatch (MAIN ENTRY)** | `src/agent/orchestrator.ts` | `orchestrateAgent()` |
| Sara full context + system prompt | `src/agent/orchestrator.ts` | `buildSystemPrompt()` |
| Sign-out cleanup (no-op stub) | `src/agent/orchestrator.ts` | `disconnectSocket()` |
| Sara chat agent (single-turn) | `src/agent/saraAgent.ts` | `processSaraChat()` |
| GYM-GPT coaching | `src/agent/saraAgent.ts` | `processGymChat()` |
| Parse `[[ACTION:{...}]]` from response | `src/agent/saraAgent.ts` | `parseActionFromText()` |
| Direct Gemini REST + key rotation | `src/services/geminiProxy.ts` | `callProxy()` |
| Parse Gemini REST response | `src/services/geminiProxy.ts` | `parseProxyResponse()` |
| Audio transcription | `src/services/geminiProxy.ts` | `transcribeAudioViaProxy()` |
| Quick text prompt | `src/services/geminiProxy.ts` | `callGeminiProxy()` |
| Gym AI coaching | `src/services/geminiProxy.ts` | `askGymCoach()` |
| Sara TTS playback | `src/services/sarvaProxy.ts` | `speakWithSarvam()` |
| Stop Sara speaking | `src/services/sarvaProxy.ts` | `stopSpeech()` |
| Language detection (hi-IN/en-IN) | `src/services/sarvaProxy.ts` | `detectLanguageCode()` |
| Begin mic recording | `src/services/voiceEngine.ts` | `startVoiceRecording()` |
| Stop + transcribe audio | `src/services/voiceEngine.ts` | `stopAndTranscribe()` |
| Cancel recording | `src/services/voiceEngine.ts` | `cancelVoiceRecording()` |

### Data Layer
| Purpose | Exact File Path | Key Export |
|---|---|---|
| **ALL Firestore data (provider)** | `src/contexts/MobileDataContext.tsx` | `MobileDataProvider` |
| Access data in components | `src/contexts/MobileDataContext.tsx` | `useMobileData()` |
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
| Focus (Pomodoro) | `src/screens/FocusScreen.tsx` |
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
| `tasks` | `tasks` | `Task` | title, status, priority('P1'/'P2'/'P3'), date(YYYY-MM-DD), timeSlot, subtasks[], isRecurring, completedAt |
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
| `MobileDataContext.tsx:scheduleTaskReminders` | **MEDIUM** | Fires on every data change with NO debounce — cancels and re-creates 100+ notifications on every Firestore snapshot. Add 2s debounce. |
| `MobileDataContext.tsx` | **MEDIUM** | `waterLogs` and `sleepLogs` have context types and useState but ZERO Firestore subscriptions — always return empty arrays. |
| `voiceEngine.ts` | **MEDIUM** | Transcription fails silently on recordings under ~0.5s — Gemini rejects near-empty audio. |
| `AppNavigator.tsx` | **HIGH** | `OnboardingScreen` renders OUTSIDE all Stack/Tab navigators. Any `useNavigation()` inside OnboardingScreen will throw. Pass navigation callbacks via props only. |
| `GymHomeScreen.tsx` | LOW | Uses static `GYM_PLAN` — now supplemented by `userGymPlan` from Firestore `user_gym_plans` collection. |
| `conflictDetector.ts` | LOW | Simplified placeholder. Web app has a more sophisticated conflict engine. |
| `DashboardScreen.tsx:49-60` | LOW | Streak logic breaks on any day with no tasks AND no gym — penalizes rest days and weekends unfairly. |
| `notifications.ts` | MEDIUM | FCM remote push (for killed-app delivery) needs a dev build — fails in Expo Go SDK 53+. Local scheduling works fine. |

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

---

## 16. Changelog

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
