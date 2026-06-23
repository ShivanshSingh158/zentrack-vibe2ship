# Zentrack — The Last-Minute Life Saver
> AI-powered productivity guardian that watches your deadlines, schedules your time, and acts before you realize you need it.

## Live Demo
**Link:** [Insert Demo Link Here]
**Demo Login:** `demo@zentrack.com` / `demo123`

## The Problem We Solve
Students and professionals constantly face decision fatigue and burnout, leading to missed deadlines and skipped habits. Traditional task apps only *record* what you need to do—Zentrack acts as a proactive guardian that intercepts bad habits and auto-corrects your schedule before failure happens.

## How Zen AI Acts Autonomously
Zentrack employs a background intelligent agent loop.
\`\`\`
User Data (Firestore) → Zen Agent (Gemini) → Tool Calls → Proactive Action → Notification (FCM)
\`\`\`

## Google Technologies Used
- **Gemini API**: Deep integration using Function Calling, Streaming, and Multi-key rotation/fallback. Models: `gemini-3.1-pro`, `gemini-3.5-flash`.
- **Firebase**: Authentication, Firestore (real-time sync), and Cloud Messaging (FCM) for push notifications.
- **Google Calendar API**: Bidirectional OAuth sync for smart time-blocking.
- **Google AI Studio**: Prompt testing and deployment.

## Key Features
1. **Crisis Triage Mode (War Room)**: Extreme prioritization for the next 6 hours.
2. **Proactive Push Notifications**: 8am Daily Briefings and 9pm Accountability Checks.
3. **Auto-Schedule with Calendar Blocking**: Energy-aware scheduling that protects your deep-work hours.
4. **Zero-Friction Quick Capture**: Paste raw text, emails, or syllabus snippets and let the AI parse the deadlines.
5. **OKR Auto-Sync Engine**: Breaking down massive goals into daily micro-habits.

## How to Run Locally

1. Clone the repository
2. Run `npm install`
3. Create a `.env.local` file at the root with your credentials:
   ```env
   VITE_FIREBASE_API_KEY=your_key
   VITE_FIREBASE_AUTH_DOMAIN=your_domain
   VITE_FIREBASE_PROJECT_ID=your_id
   VITE_GEMINI_API_KEY=your_gemini_key
   ```
4. Run `npm run dev`
5. Open `http://localhost:5173`
