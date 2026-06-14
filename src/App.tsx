import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from 'sonner';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { onSnapshot, doc, setDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import Lenis from 'lenis';

// ─── Always-on components (tiny, needed immediately) ───────────────────────
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { UpdatePrompt } from './components/UpdatePrompt';
import { UpdateFlashcard } from './components/UpdateFlashcard';
import { OnboardingCarousel } from './components/overlays/OnboardingCarousel';
import { DailyBriefingOverlay } from './components/overlays/DailyBriefingOverlay';
import { PomodoroProvider } from './contexts/PomodoroContext';
import { SpotifyProvider } from './contexts/SpotifyContext';
import { GlobalDataProvider } from './contexts/GlobalDataContext';
import { GlobalQuickAdd } from './features/tasks/GlobalQuickAdd';
import { VoiceQuickCaptureWidget } from './features/tasks/VoiceQuickCaptureWidget';
import { FocusModeOverlay } from './components/overlays/FocusModeOverlay';
import { SpotifyFloatingPlayer } from './features/spotify/SpotifyFloatingPlayer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FloatingExtraWorks } from './features/_shared/FloatingExtraWorks';
import { SkeletonCard } from './components/ui/SkeletonCard';

const SessionEnforcer = () => {
  useEffect(() => {
    if (!auth.currentUser) return;
    
    const unsub = onSnapshot(doc(db, 'system', 'sessionControl'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const currentLocalKey = localStorage.getItem('global_session_key');
        
        // If DB has an active key and our local key doesn't match, force logout
        if (data.activeSessionKey && currentLocalKey !== data.activeSessionKey) {
           console.log("Global logout triggered. Setting local key to:", data.activeSessionKey);
           localStorage.setItem('global_session_key', data.activeSessionKey);
           signOut(auth);
        }
      } else {
        // Init the document if it doesn't exist
        setDoc(doc(db, 'system', 'sessionControl'), { activeSessionKey: 'v1' });
        localStorage.setItem('global_session_key', 'v1');
      }
    });
    return () => unsub();
  }, []);
  return null;
};

const CHUNK_ERR_RE = /failed to fetch|loading chunk|dynamically imported module|unexpected token/i;

const lazyWithRetry = (componentImport: () => Promise<any>, name: string) => {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error: any) {
      const errMsg = (error?.message || error?.toString() || '');
      const isChunkError = CHUNK_ERR_RE.test(errMsg);

      if (isChunkError) {
        // Check if we ALREADY reloaded for this chunk in the last 8 seconds
        // If yes, don't reload again — prevents infinite loop
        const reloadKey = `chunk_reload_${name}`;
        const lastReload = parseInt(localStorage.getItem(reloadKey) || '0', 10);
        if (Date.now() - lastReload < 8000) {
          // We already tried reloading for this chunk — give up and show error
          throw new Error(`Module "${name}" failed to load after reload. Please close and reopen the app.`);
        }

        console.warn(`[lazyWithRetry] Stale chunk for "${name}", reloading…`);
        localStorage.setItem(reloadKey, Date.now().toString());

        try {
          // Clear all caches so stale chunks are gone
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(c => caches.delete(c)));
          // Only unregister SW if we're NOT in the middle of an intentional update
          const swUpdatedAt = parseInt(localStorage.getItem('zen_sw_updated_at') || '0', 10);
          const justUpdated = (Date.now() - swUpdatedAt) < 30_000;
          if (!justUpdated) {
            const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
            await Promise.all(regs.map(r => r.unregister()));
          }
        } catch (_) { /* ignore */ }

        window.location.reload();
        return new Promise(() => {}); // suspend while reloading
      }

      // Non-chunk error — 60-second cooldown before retrying
      const retryKey = 'retry-' + name;
      const retryTime = parseInt(localStorage.getItem(retryKey) || '0', 10);
      if (Date.now() - retryTime > 60000) {
        localStorage.setItem(retryKey, Date.now().toString());
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }
  });
};

// ─── Lazily-loaded page modules (~1.9 MB → ~300 KB initial bundle) ─────────
const HomeDashboard = lazyWithRetry(() => import('./features/dashboard/HomeDashboard').then(m => ({ default: m.HomeDashboard })), 'HomeDashboard');
const JobTracker = lazyWithRetry(() => import('./features/jobs/JobTracker').then(m => ({ default: m.JobTracker })), 'JobTracker');
const TodoListModule = lazyWithRetry(() => import('./features/tasks/TodoListModule').then(m => ({ default: m.TodoListModule })), 'TodoListModule');
const LearningChecklistModule = lazyWithRetry(() => import('./features/learning/LearningChecklistModule').then(m => ({ default: m.LearningChecklistModule })), 'LearningChecklistModule');
const GoalsModule = lazyWithRetry(() => import('./features/goals/GoalsModule').then(m => ({ default: m.GoalsModule })), 'GoalsModule');
const NotesModule = lazyWithRetry(() => import('./features/notes/NotesModule').then(m => ({ default: m.NotesModule })), 'NotesModule');
const CalendarModule = lazyWithRetry(() => import('./features/calendar/CalendarModule').then(m => ({ default: m.CalendarModule })), 'CalendarModule');
const HabitsModule = lazyWithRetry(() => import('./features/habits/HabitsModule').then(m => ({ default: m.HabitsModule })), 'HabitsModule');
const AnalyticsModule = lazyWithRetry(() => import('./features/analytics/AnalyticsModule').then(m => ({ default: m.AnalyticsModule })), 'AnalyticsModule');
const AttendanceModule = lazyWithRetry(() => import('./features/academic/AttendanceModule').then(m => ({ default: m.AttendanceModule })), 'AttendanceModule');
const AssignmentModule = lazyWithRetry(() => import('./features/academic/AssignmentModule').then(m => ({ default: m.AssignmentModule })), 'AssignmentModule');
const ToolsHubModule = lazyWithRetry(() => import('./features/tools/ToolsHubModule').then(m => ({ default: m.ToolsHubModule })), 'ToolsHubModule');
const SpotifyCallbackPage = lazyWithRetry(() => import('./features/spotify/SpotifyCallbackPage').then(m => ({ default: m.SpotifyCallbackPage })), 'SpotifyCallbackPage');
const GymModule = lazyWithRetry(() => import('./features/gym/GymModule').then(m => ({ default: m.GymModule })), 'GymModule');

// ─── Page loading skeleton (replaces spinner — feels like content is loading, not waiting) ──
const PageLoader = () => (
  <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <SkeletonCard height="120px" />
    <SkeletonCard height="180px" />
    <SkeletonCard height="80px" />
  </div>
);

// ─── Page Transition Wrapper ──────────────────────────────────────────────────
const isMobileDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const PageTransition = ({ children }: { children: React.ReactNode }) => {
  const mobile = isMobileDevice();
  return (
    <motion.div
      initial={{ opacity: 0, y: mobile ? 8 : 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: mobile ? -8 : -15 }}
      transition={{ duration: mobile ? 0.18 : 0.3, ease: 'easeOut' }}
      style={{ width: '100%', minHeight: '100%' }}
    >
      {children}
    </motion.div>
  );
};

// ─── Animated Routes ──────────────────────────────────────────────────────────
const AnimatedRoutes = ({ user }: { user: User }) => {
  const location = useLocation();
  return (
    // mode='sync' means incoming and outgoing pages animate simultaneously
    // — this is what makes iOS feel instant (not waiting for old page to exit first)
    <AnimatePresence mode="sync">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home"        element={<PageTransition><ErrorBoundary name="Dashboard"><HomeDashboard /></ErrorBoundary></PageTransition>} />
        <Route path="/todo"        element={<PageTransition><ErrorBoundary name="Tasks"><TodoListModule /></ErrorBoundary></PageTransition>} />
        <Route path="/learning"    element={<PageTransition><ErrorBoundary name="Learning"><LearningChecklistModule /></ErrorBoundary></PageTransition>} />
        <Route path="/jobs"        element={<PageTransition><ErrorBoundary name="Job Tracker"><JobTracker user={user} /></ErrorBoundary></PageTransition>} />
        <Route path="/goals"       element={<PageTransition><ErrorBoundary name="Goals"><GoalsModule /></ErrorBoundary></PageTransition>} />
        <Route path="/notes"       element={<PageTransition><ErrorBoundary name="Notes"><NotesModule /></ErrorBoundary></PageTransition>} />
        <Route path="/calendar"    element={<PageTransition><ErrorBoundary name="Calendar"><CalendarModule /></ErrorBoundary></PageTransition>} />
        <Route path="/habits"      element={<PageTransition><ErrorBoundary name="Habits"><HabitsModule /></ErrorBoundary></PageTransition>} />
        <Route path="/attendance"  element={<PageTransition><ErrorBoundary name="Attendance"><AttendanceModule /></ErrorBoundary></PageTransition>} />
        <Route path="/assignments" element={<PageTransition><ErrorBoundary name="Assignments"><AssignmentModule /></ErrorBoundary></PageTransition>} />
        <Route path="/analytics"   element={<PageTransition><ErrorBoundary name="Analytics"><AnalyticsModule /></ErrorBoundary></PageTransition>} />
        <Route path="/tools"       element={<PageTransition><ErrorBoundary name="Tools Hub"><ToolsHubModule user={user} /></ErrorBoundary></PageTransition>} />
        <Route path="/gym"         element={<PageTransition><ErrorBoundary name="Gym"><GymModule /></ErrorBoundary></PageTransition>} />
        <Route path="/spotify-callback" element={<SpotifyCallbackPage />} />
        <Route path="*"            element={<Navigate to="/todo" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

function App() {
  const [user, setUser]               = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showGreeting, setShowGreeting]   = useState(false);
  const [greeting, setGreeting]           = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Use a ref to track previous user so we never add it to the effect dep array
  // (adding it caused multiple auth subscriptions on each login/logout cycle).
  const prevUserRef = useRef<User | null>(null);

  useEffect(() => {
    // Skip Lenis on touch/mobile — native iOS scroll is already buttery smooth
    // and Lenis interferes with touch events, causing jank during tab switching
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;

    const lenis = new Lenis();

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // Show greeting only on fresh login (null → logged-in transition)
      if (currentUser && !prevUserRef.current) {

        // Register for FCM push notifications (Option B — Firebase Cloud Messaging)
        import('./services/fcm').then(({ registerFCMToken, onForegroundMessage }) => {
          registerFCMToken();
          // Handle messages when the tab IS open (FCM SW only fires when tab is closed)
          onForegroundMessage(({ title, body }) => {
            import('sonner').then(({ toast }) => toast(body, { description: title }));
          });
        });

        // Show onboarding flashcards only on the VERY FIRST login for this user
        const onboardingKey = `zen_onboarding_done_${currentUser.uid}`;
        if (!localStorage.getItem(onboardingKey)) {
          setShowOnboarding(true);
        }

        // Ensure user document exists in Firestore so admin can find them by email/uid
        import('firebase/firestore').then(({ doc, getDoc, setDoc }) => {
          const userRef = doc(db, 'users', currentUser.uid);
          getDoc(userRef).then((docSnap) => {
            if (!docSnap.exists()) {
              setDoc(userRef, {
                userId: currentUser.uid,
                email: currentUser.email,
                displayName: currentUser.displayName,
                photoURL: currentUser.photoURL,
                createdAt: Date.now(),
              }, { merge: true }).catch(err => console.error("Failed to create user doc:", err));
            }
          }).catch(err => console.error("Failed to fetch user doc:", err));
        });
      }

      prevUserRef.current = currentUser;
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
    // Empty dep array — this effect runs once and the stable firebase listener
    // handles all subsequent auth state changes via prevUserRef.
  }, []);

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-primary)', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading Zentrack...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <UpdatePrompt />
        <Toaster theme="dark" position="top-right" />
        <Login />
      </>
    );
  }

  return (
    <GlobalDataProvider>
    <SpotifyProvider>
    <PomodoroProvider>
      <UpdatePrompt />
      <UpdateFlashcard />
      <Toaster theme="dark" position="top-right" />
      <CommandPalette />
      <GlobalQuickAdd />
      <VoiceQuickCaptureWidget />
      <FocusModeOverlay />
      <DailyBriefingOverlay />
      <FloatingExtraWorks />
      <SessionEnforcer />

      {/* Onboarding Carousel */}
      {showOnboarding && (
        <OnboardingCarousel userId={user.uid} onComplete={() => setShowOnboarding(false)} />
      )}

      {/* Greeting Toast removed per user request */}

      <div className="app-container">
        <Sidebar user={user} onLogout={() => signOut(auth)} />
        <div className="main-content">
          {/* Suspense wraps ALL lazy routes — PageLoader shown during chunk download */}
          <Suspense fallback={<PageLoader />}>
            <AnimatedRoutes user={user} />
          </Suspense>
        </div>
      </div>
      <SpotifyFloatingPlayer />
    </PomodoroProvider>
    </SpotifyProvider>
    </GlobalDataProvider>
  );
}

export default App;
