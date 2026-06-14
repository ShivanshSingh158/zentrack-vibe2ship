# Zentrack — Personal Life OS

A calm, AI-powered productivity dashboard for tracking everything that matters — tasks, habits, gym, jobs, learning, and more.

Built with React + TypeScript + Firebase. Designed to feel like an iOS app on both desktop and mobile.

---

## What's Inside

| Module | Route | Description |
|--------|-------|-------------|
| Dashboard | `/home` | Daily overview, timebox schedule, quick stats |
| Tasks | `/todo` | Kanban-style to-do list with voice capture |
| Habits | `/habits` | Daily habit tracker with streaks |
| Calendar | `/calendar` | Event planning and daily view |
| Gym | `/gym` | Workout logging with AI coach (ZenGymAI) |
| Job Tracker | `/jobs` | Kanban board for job applications |
| Goals | `/goals` | Long-term goal setting and tracking |
| Learning | `/learning` | Curriculum checklists and progress |
| Notes | `/notes` | Rich note-taking with cloud storage |
| Analytics | `/analytics` | Charts across all modules |
| Attendance | `/attendance` | College attendance tracking |
| Assignments | `/assignments` | Assignment deadlines and status |
| Tools | `/tools` | Interview prep, GPA calculator, Spotify player |
| Weekly Review | Built into Dashboard | AI-guided weekly reflection wizard |

---

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Routing**: React Router v6 (lazy-loaded routes)
- **Animations**: Framer Motion + CSS keyframes
- **Styling**: Vanilla CSS with design tokens (`vars.css`)
- **Database**: Firebase Firestore (real-time sync)
- **Auth**: Firebase Authentication (Google Sign-In)
- **AI**: Google Gemini API (multi-key rotation with fallback)
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Media**: Cloudinary (image uploads)
- **Music**: Spotify Web API
- **Deployment**: Vercel (with serverless API routes in `/api`)
- **PWA**: Vite PWA plugin with auto-update service worker

---

## Project Structure

```
src/
├── App.tsx              # Router, providers, auth logic
├── main.tsx             # Entry point
├── index.css            # Global styles (imports all CSS modules)
│
├── styles/              # Design system
│   ├── vars.css         # Design tokens (colors, radii, fonts, animations)
│   ├── layout.css       # App shell (sidebar, nav, main-content)
│   ├── animations.css   # Keyframe definitions
│   ├── todo.css         # Kanban board styles
│   ├── learning.css     # Learning module styles
│   └── mobile.css       # Responsive overrides + iOS smoothness
│
├── components/          # Shared UI components
│   ├── ui/              # Pure UI atoms
│   │   ├── SkeletonCard.tsx
│   │   ├── ConfirmDialog.tsx
│   │   └── CustomTimeSelect.tsx
│   ├── overlays/        # Full-screen overlay components
│   │   ├── FocusModeOverlay.tsx
│   │   ├── DailyBriefingOverlay.tsx
│   │   └── OnboardingCarousel.tsx
│   ├── Sidebar.tsx      # Nav (desktop sidebar + mobile bottom bar)
│   ├── Login.tsx        # Auth screen
│   ├── CommandPalette.tsx
│   ├── ErrorBoundary.tsx
│   ├── UpdatePrompt.tsx
│   └── UpdateFlashcard.tsx
│
├── contexts/            # React context providers
│   ├── GlobalDataContext.tsx   # All Firestore real-time listeners
│   ├── PomodoroContext.tsx     # Pomodoro timer state
│   └── SpotifyContext.tsx      # Spotify playback state
│
├── services/            # External integrations
│   ├── firebase.ts      # Firebase app init + exports
│   ├── gemini.ts        # Gemini AI — chat, JSON parsing, key rotation
│   ├── fcm.ts           # FCM push notification registration
│   ├── spotify.ts       # Spotify OAuth + player API
│   ├── youtube.ts       # YouTube search API
│   └── cloudinary.ts    # Image upload helper
│
├── hooks/               # Custom React hooks
│   └── useSubjects.ts   # Academic subjects hook
│
├── utils/               # Pure utility functions
│   ├── dateUtils.ts
│   ├── notifications.ts
│   └── sound.ts
│
├── types/               # TypeScript type definitions
│   ├── index.ts         # Re-exports all types
│   └── *.types.ts       # Per-feature type files
│
├── data/                # Static / seed data
│   ├── gymPlan.ts
│   ├── syllabusData.ts
│   ├── dsaSyllabusData.ts
│   ├── genAiSyllabusData.ts
│   └── roadmaps.ts
│
└── features/            # Page modules (one folder = one route)
    ├── _shared/         # Components used across multiple features
    │   └── FloatingExtraWorks.tsx
    ├── dashboard/       HomeDashboard + TimeboxTimeline
    ├── tasks/           TodoListModule + GlobalQuickAdd + VoiceCapture
    ├── habits/          HabitsModule
    ├── calendar/        CalendarModule
    ├── gym/             GymModule + ZenGymAI
    ├── jobs/            JobTracker (Kanban)
    ├── goals/           GoalsModule
    ├── notes/           NotesModule
    ├── learning/        LearningChecklistModule
    ├── analytics/       AnalyticsModule
    ├── academic/        AttendanceModule + AssignmentModule + GradeCalculator
    ├── tools/           ToolsHubModule + InterviewPrepModule
    ├── review/          WeeklyReviewModule + AIWeeklyReviewWizard
    └── spotify/         SpotifyPlayer + SpotifyFloatingPlayer + Callback
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

Set up environment variables in `.env` (copy `.env` and fill in your keys):
- `VITE_FIREBASE_*` — Firebase project config
- `VITE_GEMINI_API_KEY_*` — Gemini AI keys (up to 5 for rotation)
- `VITE_CLOUDINARY_*` — Cloudinary upload config
- `VITE_SPOTIFY_CLIENT_ID` — Spotify app client ID

---

## Design Philosophy

- **Mobile-first smoothness** — feels like an iOS app: 60fps scrolling, no tap delay, GPU-composited nav
- **Calm aesthetics** — dark aurora theme, no harsh whites or reds
- **Resilient by default** — all AI calls retry with backoff; all Firestore reads have Array.isArray guards
- **Instant navigation** — all modules lazy-loaded; route transitions run in sync (not wait mode)
