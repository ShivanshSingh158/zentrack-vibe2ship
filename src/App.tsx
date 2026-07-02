import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from 'sonner';
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { onSnapshot, doc, setDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { runModelHealthCheck } from './services/gemini/core';
import Lenis from 'lenis';

// â”€â”€â”€ Always-on components (tiny, needed immediately) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { Login } from './components/Login';
import { Landing } from './components/Landing';
import { TopNav } from './components/TopNav';
import { BackgroundEffects } from './components/BackgroundEffects';
import { UpdatePrompt } from './components/UpdatePrompt';
import { DeveloperMatrix } from './components/overlays/DeveloperMatrix';
import { SecuritySettingsModal } from './components/overlays/SecuritySettingsModal';
import { OnboardingCarousel } from './components/overlays/OnboardingCarousel';
import { DailyBriefingOverlay } from './components/overlays/DailyBriefingOverlay';
import { PomodoroProvider } from './contexts/PomodoroContext';
import { GlobalDataProvider } from './contexts/GlobalDataContext';
import { FocusModeOverlay } from './components/overlays/FocusModeOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SkeletonCard } from './components/ui/SkeletonCard';
import { OfflineIndicator } from './components/ui/OfflineIndicator';
import { useClassNotifications } from './hooks/useClassNotifications';
import { useGlobalData } from './contexts/GlobalDataContext';
import { FloatingExtraWorks, VoiceQuickCaptureWidget } from './features/_shared';
import { ZenAgentPanel } from './features/agent/ZenAgentPanel';
import { MissionReport } from './features/dashboard/MissionReport';
import { ReportArchive } from './features/dashboard/ReportArchive';
import { Bot, ShieldAlert, Ghost, Code2, MessageSquare, Mail, Calendar, Target, Sun, Zap } from 'lucide-react';
import { AgentTerminal } from './components/AgentTerminal';
import { useDeadlineWatcher } from './hooks/useDeadlineWatcher';
import { GoogleWorkspaceBanner } from './components/GoogleWorkspaceBanner';
import { BottomNav } from './components/BottomNav';


import { useContextReminders } from './hooks/useContextReminders';

/** Mounts inside GlobalDataProvider so it can access attendanceSubjects */
const ClassNotificationRunner = () => {
  const { attendanceSubjects } = useGlobalData();
  useClassNotifications(attendanceSubjects);
  return null;
};

const ContextRemindersRunner = () => {
  useContextReminders();
  return null;
};

const DeadlineWatcherRunner = () => {
  useDeadlineWatcher();
  return null;
};

/**
 * AgentNavigator â€” listens for 'agent-navigate' events dispatched by toolExecutor
 * and uses React Router's useNavigate to change the route.
 * Also dispatches 'agent-open-lecture' for the Learning module to open a specific lecture.
 */
const AgentNavigator = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        route: string;
        subView?: string;
        lectureTopicTitle?: string;
        lectureTitle?: string;
        day?: string;
      };

      if (!detail?.route) return;

      // Navigate to the route
      navigate(detail.route);

      // For learning module: fire a secondary event so LearningChecklistModule
      // can find and play the specific lecture
      if (detail.route === '/learning' && (detail.lectureTitle || detail.lectureTopicTitle)) {
        // Small delay to let the component mount after navigation
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('agent-open-lecture', {
            detail: {
              topicTitle: detail.lectureTopicTitle,
              lectureTitle: detail.lectureTitle,
            }
          }));
        }, 600);
      }

      // For gym module: fire sub-view event
      if (detail.route === '/gym' && detail.subView) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('agent-gym-subview', {
            detail: { subView: detail.subView, day: detail.day }
          }));
        }, 400);
      }
    };

    window.addEventListener('agent-navigate', handler);
    
    const shortcutHandler = (e: Event) => {
      const currentPath = window.location.pathname;
      if (currentPath !== '/' && currentPath !== '/home') {
        // We are not on the dashboard. Route back to dashboard and re-trigger.
        navigate('/');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: (e as CustomEvent).detail }));
        }, 400);
      }
    };
    window.addEventListener('agent-shortcut', shortcutHandler);

    return () => {
      window.removeEventListener('agent-navigate', handler);
      window.removeEventListener('agent-shortcut', shortcutHandler);
    };
  }, [navigate]);

  return null;
};

const SessionEnforcer = () => {
  useEffect(() => {
    if (!auth.currentUser) return;

    const unsub = onSnapshot(doc(db, 'system', 'sessionControl'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const currentLocalKey = localStorage.getItem('global_session_key');

        // âœ… U3 FIX: The old code signed out whenever currentLocalKey !== activeSessionKey.
        // This force-logged-out ALL incognito users and new-device users because their
        // localStorage is empty (null) and the remote key is 'v1' â€” null !== 'v1' is true.
        //
        // NEW RULE:
        //   null   â†’ first visit on this browser/device â†’ sync the key locally, stay logged in
        //   stale  â†’ admin-triggered remote wipe â†’ force logout (the ONLY intended use case)
        if (data.activeSessionKey) {
          if (currentLocalKey === null) {
            // First visit: absorb the remote key, don't sign out
            localStorage.setItem('global_session_key', data.activeSessionKey);
          } else if (currentLocalKey !== data.activeSessionKey) {
            // Genuine remote wipe: local key is non-null but stale
            localStorage.removeItem('global_session_key');
            signOut(auth);
          }
        }
      } else {
        // Init the document if it doesn't exist (first-ever admin setup)
        setDoc(doc(db, 'system', 'sessionControl'), { activeSessionKey: 'v1' });
        localStorage.setItem('global_session_key', 'v1');
      }
    });
    return () => unsub();
  }, []);
  return null;
};


const CHUNK_ERR_RE = /failed to fetch|loading chunk|dynamically imported module|unexpected token/i;

const lazyWithRetry = (componentImport: () => Promise<{ default: React.ComponentType<object> }>, name: string) => {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error: unknown) {
      const errMsg = ((error as { message?: string })?.message || String(error) || '');
      const isChunkError = CHUNK_ERR_RE.test(errMsg);

      if (isChunkError) {
        // Check if we ALREADY reloaded for this chunk in the last 8 seconds
        // If yes, don't reload again â€” prevents infinite loop
        const reloadKey = `chunk_reload_${name}`;
        const lastReload = parseInt(localStorage.getItem(reloadKey) || '0', 10);
        if (Date.now() - lastReload < 8000) {
          // We already tried reloading for this chunk â€” give up and show error
          throw new Error(`Module "${name}" failed to load after reload. Please close and reopen the app.`, { cause: error });
        }

        console.warn(`[lazyWithRetry] Stale chunk for "${name}", reloadingâ€¦`);
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
        } catch { /* ignore */ }

        window.location.reload();
        return new Promise(() => {}); // suspend while reloading
      }

      // Non-chunk error â€” 60-second cooldown before retrying
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

// â”€â”€â”€ Lazily-loaded page modules (~1.9 MB â†’ ~300 KB initial bundle) â”€â”€â”€â”€â”€â”€â”€â”€â”€
const HomeDashboard = lazyWithRetry(() => import('./features/dashboard/HomeDashboard').then(m => ({ default: m.HomeDashboard })), 'HomeDashboard');
const TodoListModule = lazyWithRetry(() => import('./features/tasks/TodoListModule').then(m => ({ default: m.TodoListModule })), 'TodoListModule');
const CalendarModule = lazyWithRetry(() => import('./features/calendar').then(m => ({ default: m.CalendarModule })), 'CalendarModule');
const NotesModule = lazyWithRetry(() => import('./features/notes').then(m => ({ default: m.NotesModule })), 'NotesModule');
const GoalsModule = lazyWithRetry(() => import('./features/goals').then(m => ({ default: m.GoalsModule })), 'GoalsModule');
const AnalyticsModule = lazyWithRetry(() => import('./features/analytics/AnalyticsModule').then(m => ({ default: m.AnalyticsModule })), 'AnalyticsModule');
const GymModule = lazyWithRetry(() => import('./features/gym').then(m => ({ default: m.GymModule })), 'GymModule');
const JobTracker = lazyWithRetry(() => import('./features/jobs/JobTracker').then(m => ({ default: m.JobTracker })), 'JobTracker');
const HabitsModule = lazyWithRetry(() => import('./features/habits/HabitsModule').then(m => ({ default: m.HabitsModule })), 'HabitsModule');
const LearningChecklistModule = lazyWithRetry(() => import('./features/learning/LearningChecklistModule').then(m => ({ default: m.LearningChecklistModule })), 'LearningChecklistModule');
const ToolsHubModule = lazyWithRetry(() => import('./features/tools/ToolsHubModule').then(m => ({ default: m.ToolsHubModule })), 'ToolsHubModule');
const IntegrationsModule = lazyWithRetry(() => import('./features/integrations/IntegrationsModule').then(m => ({ default: m.IntegrationsModule })), 'IntegrationsModule');
const WeeklyReviewModule = lazyWithRetry(() => import('./features/review/WeeklyReviewModule').then(m => ({ default: m.WeeklyReviewModule })), 'WeeklyReviewModule');
const AttendanceModule = lazyWithRetry(() => import('./features/academic/AttendanceModule').then(m => ({ default: m.AttendanceModule })), 'AttendanceModule');
const AssignmentModule = lazyWithRetry(() => import('./features/academic/AssignmentModule').then(m => ({ default: m.AssignmentModule })), 'AssignmentModule');
const GradeCalculatorModule = lazyWithRetry(() => import('./features/academic/GradeCalculatorModule').then(m => ({ default: m.GradeCalculatorModule })), 'GradeCalculatorModule');

// â”€â”€â”€ Page loading skeleton (replaces spinner â€” feels like content is loading, not waiting) â”€â”€
const PageLoader = () => (
  <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <SkeletonCard height="120px" />
    <SkeletonCard height="180px" />
    <SkeletonCard height="80px" />
  </div>
);

// â”€â”€â”€ Page Transition Wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const isMobileDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const PageTransition = ({ children }: { children: React.ReactNode }) => {
  const mobile = isMobileDevice();
  return (
    <motion.div
      className="page-enter"
      initial={{ opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
      transition={{ duration: mobile ? 0.25 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}
    >
      {children}
    </motion.div>
  );
};

// â”€â”€â”€ Animated Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    // mode='sync' means incoming and outgoing pages animate simultaneously
    // â€” this is what makes iOS feel instant (not waiting for old page to exit first)
    <AnimatePresence mode="sync">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home"        element={<PageTransition><ErrorBoundary name="Dashboard"><HomeDashboard /></ErrorBoundary></PageTransition>} />
        <Route path="/tasks"       element={<PageTransition><ErrorBoundary name="Tasks"><Suspense fallback={<PageLoader />}><TodoListModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/calendar"    element={<PageTransition><ErrorBoundary name="Calendar"><Suspense fallback={<PageLoader />}><CalendarModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/notes"       element={<PageTransition><ErrorBoundary name="Notes"><Suspense fallback={<PageLoader />}><NotesModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/goals"       element={<PageTransition><ErrorBoundary name="Goals"><Suspense fallback={<PageLoader />}><GoalsModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/analytics"   element={<PageTransition><ErrorBoundary name="Analytics"><Suspense fallback={<PageLoader />}><AnalyticsModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/gym"         element={<PageTransition><ErrorBoundary name="Gym"><Suspense fallback={<PageLoader />}><GymModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/jobs"        element={<PageTransition><ErrorBoundary name="Jobs"><Suspense fallback={<PageLoader />}><JobTracker /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/habits"      element={<PageTransition><ErrorBoundary name="Habits"><Suspense fallback={<PageLoader />}><HabitsModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/learning"    element={<PageTransition><ErrorBoundary name="Learning"><Suspense fallback={<PageLoader />}><LearningChecklistModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/tools"       element={<PageTransition><ErrorBoundary name="Tools"><Suspense fallback={<PageLoader />}><ToolsHubModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/integrations" element={<PageTransition><ErrorBoundary name="Integrations"><Suspense fallback={<PageLoader />}><IntegrationsModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/review"      element={<PageTransition><ErrorBoundary name="Review"><Suspense fallback={<PageLoader />}><WeeklyReviewModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/attendance"  element={<PageTransition><ErrorBoundary name="Attendance"><Suspense fallback={<PageLoader />}><AttendanceModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/assignments" element={<PageTransition><ErrorBoundary name="Assignments"><Suspense fallback={<PageLoader />}><AssignmentModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/grades"      element={<PageTransition><ErrorBoundary name="Grades"><Suspense fallback={<PageLoader />}><GradeCalculatorModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="*"            element={<Navigate to="/home" replace />} />
      </Routes>
    </AnimatePresence>
  );
};

// âœ… U1 FIX: DataReadyGate â€” shows a premium loading overlay while GlobalDataContext
// is hydrating from Firestore (0-3s after auth resolves). Prevents the "skeleton soup"
// where every lazy-loaded module renders simultaneously with its own loading skeleton
// while also making its own Firestore calls â€” creating a fragmented loading experience.
// This gate renders ONCE at the top level, so all routes get clean data on first paint.
const DataReadyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading } = useGlobalData();
  if (!isLoading) return <>{children}</>;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.15)' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#8b5cf6', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#3b82f6', animation: 'spin 1.2s linear infinite reverse' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
          <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>Syncing your data...</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>Loading tasks, habits and calendar</p>
        </div>
      </div>
    </div>
  );
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser]               = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // â”€â”€ Auth Phase State Machine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // 'initializing'    â†’ App just loaded, Firebase is checking stored session
  // 'unauthenticated' â†’ No user. Landing page is shown.
  // 'authenticating'  â†’ Popup opened OR redirect in progress. Loading overlay shown.
  // 'authenticated'   â†’ User logged in. App is fully shown.
  //
  // Using a single phase state instead of multiple booleans eliminates the 3-branch
  // return() pattern which caused React to fully unmount/remount the tree on each
  // auth state change â€” the root cause of the visible flash and screen collision.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Listen for Login.tsx button click â†’ immediately switch to 'authenticating'
  // phase so the loading overlay covers the landing page BEFORE the popup opens.
  // This is what eliminates the 1-2 second flash of the landing page during popup auth.
  // Also listen for cancellation/error â†’ revert to 'unauthenticated' gracefully.
  useEffect(() => {
    const handleAuthStarting  = () => setAuthPhase('authenticating');
    const handleAuthCancelled = () => setAuthPhase('unauthenticated');
    window.addEventListener('zen-auth-starting',  handleAuthStarting);
    window.addEventListener('zen-auth-cancelled', handleAuthCancelled);
    return () => {
      window.removeEventListener('zen-auth-starting',  handleAuthStarting);
      window.removeEventListener('zen-auth-cancelled', handleAuthCancelled);
    };
  }, []);

  type AuthPhase = 'initializing' | 'unauthenticated' | 'authenticating' | 'authenticated';
  const [authPhase, setAuthPhase] = useState<AuthPhase>(
    // Start as 'authenticating' if mid-redirect so loading overlay shows immediately
    localStorage.getItem('zen_is_redirecting') === '1' ? 'authenticating' : 'initializing'
  );
  const [showLogin, setShowLogin]     = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showFab,   setShowFab]   = useState(false);
  // âœ… U2 FIX: Track panel closing animation state.
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [showDeveloperMatrix, setShowDeveloperMatrix] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);


  // Use a ref to track previous user so we never add it to the effect dep array
  // (adding it caused multiple auth subscriptions on each login/logout cycle).
  const prevUserRef = useRef<User | null>(null);

  // Listen for Login.tsx button click â†’ immediately switch to 'authenticating'
  // phase so the loading overlay covers the landing page BEFORE the popup opens.
  // This is what eliminates the 1-2 second flash of the landing page during popup auth.
  useEffect(() => {
    const handleAuthStarting = () => setAuthPhase('authenticating');
    window.addEventListener('zen-auth-starting', handleAuthStarting);
    return () => window.removeEventListener('zen-auth-starting', handleAuthStarting);
  }, []);

  useEffect(() => {
    const handleToggleAgent = () => {
      setShowAgent(prev => !prev);
      if (!showAgent) {
        setShowFab(false); // Hide FAB when opening agent
      }
    };
    
    window.addEventListener('toggle-zen-agent', handleToggleAgent);
    return () => window.removeEventListener('toggle-zen-agent', handleToggleAgent);
  }, [showAgent]);

  useEffect(() => {
    // Skip Lenis on touch/mobile â€” native iOS scroll is already buttery smooth
    // and Lenis interferes with touch events, causing jank during tab switching
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;
    const lenis = new Lenis();
    function raf(time: number) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    return () => { lenis.destroy(); };
  }, []);

  useEffect(() => {
    let unsubscribeAuth: (() => void) | null = null;

    // â”€â”€â”€ SMART AUTH INITIALIZATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // POPUP auth  â†’ set up onAuthStateChanged IMMEDIATELY. Firebase resolves the
    //               auth state from local storage in <100ms â€” zero landing-page flash.
    //
    // REDIRECT auth â†’ must call getRedirectResult() FIRST. Without it, Firebase fires
    //                 onAuthStateChanged with null before it processes the redirect
    //                 tokens, causing the user to get stuck on the login page.
    //
    // We distinguish the two using the `zen_is_redirecting` localStorage flag that
    //  Login.tsx sets right before calling signInWithRedirect().
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const isReturningFromRedirect = localStorage.getItem('zen_is_redirecting') === '1';

    const setupAuthListener = () => {
      unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
        // â”€â”€ Side effects on fresh login (null â†’ user transition) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (currentUser && !prevUserRef.current) {
          runModelHealthCheck().catch(err => console.error('Model health check failed:', err));

          import('./services/fcm').then(({ registerFCMToken, onForegroundMessage }) => {
            registerFCMToken();
            onForegroundMessage(({ title, body }) => {
              import('sonner').then(({ toast }) => toast(body, { description: title }));
            });
          });

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
                  hasOnboarded: false
                }, { merge: true }).catch(err => console.error('Failed to create user doc:', err));
                
                if (!localStorage.getItem(`zen_onboarding_done_${currentUser.uid}`)) {
                  setShowOnboarding(true);
                }
              } else {
                const data = docSnap.data();
                if (data.hasOnboarded) {
                  localStorage.setItem(`zen_onboarding_done_${currentUser.uid}`, 'true');
                  setShowOnboarding(false);
                } else if (!localStorage.getItem(`zen_onboarding_done_${currentUser.uid}`)) {
                  setShowOnboarding(true);
                }
              }
            }).catch(err => console.error('Failed to fetch user doc:', err));
          });
        }

        if (currentUser) {
          localStorage.setItem('zen_is_logged_in', '1');
        } else {
          localStorage.removeItem('zen_is_logged_in');
        }

        prevUserRef.current = currentUser;
        setUser(currentUser);
        setAuthLoading(false);
        // â”€â”€ Update authPhase based on resolved auth state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Small timeout lets the loading overlay render one frame before switching,
        // preventing a janky 1-frame flicker of the wrong state.
        setAuthPhase(currentUser ? 'authenticated' : 'unauthenticated');
      });
    };

    if (isReturningFromRedirect) {
      // REDIRECT PATH: wait for redirect tokens to be processed first
      getRedirectResult(auth)
        .then((result) => {
          if (result) console.log('[Auth] Redirect sign-in successful:', result.user.email);
        })
        .catch((err) => {
          console.error('[Auth] getRedirectResult error:', err.code, err.message);
          if (err.code === 'auth/unauthorized-domain') {
            import('sonner').then(({ toast }) =>
              toast.error('Domain not authorized. Add this domain in Firebase Console â†’ Authentication â†’ Settings.', { duration: 15000 })
            );
          }
        })
        .finally(() => {
          localStorage.removeItem('zen_is_redirecting');
          setupAuthListener(); // â† only now is auth state settled
        });
    } else {
      // POPUP / EXISTING SESSION PATH: listener fires in <100ms â€” no flash
      setupAuthListener();
    }

    return () => { unsubscribeAuth?.(); };
  }, []);


  // Developer Matrix Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowDeveloperMatrix(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (authLoading) {
    const isProbablyLoggedIn = localStorage.getItem('zen_is_logged_in') === '1';
    const isProtectedRoute = !['/', '/landing', '/login'].includes(window.location.pathname);

    if (isProbablyLoggedIn || isProtectedRoute) {
      return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ position: 'relative', width: 56, height: 56 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.15)' }} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#8b5cf6', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#3b82f6', animation: 'spin 1.2s linear infinite reverse' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>Loading Zentrack...</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>Authenticating...</p>
          </div>
        </div>
      </div>
    );
    }
  }

  // â”€â”€ SINGLE UNIFIED RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // All auth phase transitions are controlled here by a single AnimatePresence.
  // This guarantees: one phase exits fully BEFORE the next one enters.
  // No more 3 disconnected return() branches = no flash, no collision.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const toasterProps = {
    position: 'top-right' as const,
    toastOptions: {
      style: {
        background: 'rgba(10, 25, 40, 0.92)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '0.875rem',
        color: 'white',
        fontFamily: "'Inter', sans-serif",
        fontSize: '0.85rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      },
      classNames: { success: 'toast-success', error: 'toast-error', warning: 'toast-warning' },
    },
  };

  // Shared smooth transition config
  const phaseTransition = { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] };

  // Landing page is always mounted as the base layer.
  // It only becomes visible when the overlay on top (app or loading) fades out.
  const isLogin = authPhase === 'unauthenticated' && (showLogin || location.pathname === '/login');

  if (authPhase === 'authenticated' && user) {
    return (
      <ErrorBoundary name="GlobalProviders">
      <GlobalDataProvider>
      <PomodoroProvider>
        <DataReadyGate>

        <Toaster {...toasterProps} />
        <OfflineIndicator />
        <ClassNotificationRunner />
        <ContextRemindersRunner />
        <DeadlineWatcherRunner />
        <AgentNavigator />
        <FocusModeOverlay />
        <DailyBriefingOverlay />
        <FloatingExtraWorks />
        <VoiceQuickCaptureWidget />
        <AgentTerminal />
        <MissionReport />
        <ReportArchive />
        <SessionEnforcer />

        {/* Developer Matrix Overlay */}
        <AnimatePresence>
          {showDeveloperMatrix && <DeveloperMatrix onClose={() => setShowDeveloperMatrix(false)} />}
          {showSecurityModal && <SecuritySettingsModal onClose={() => setShowSecurityModal(false)} />}
        </AnimatePresence>

        {/* Onboarding Carousel */}
        {showOnboarding && (
          <ErrorBoundary name="Onboarding">
            <OnboardingCarousel userId={user.uid} onComplete={() => setShowOnboarding(false)} />
          </ErrorBoundary>
        )}

        {/* Zen Agent SpeedDial FAB */}
        {(() => {
          const petals = [
            {
              id: 'chat',
              label: 'Chat',
              icon: <MessageSquare size={16} />,
              color: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
              shadow: 'rgba(139,92,246,0.5)',
              action: () => { setShowAgent(true); setShowFab(false); },
            },
            {
              id: 'risk',
              label: 'Risk Scan',
              icon: <ShieldAlert size={16} />,
              color: 'linear-gradient(135deg,#ef4444,#f97316)',
              shadow: 'rgba(239,68,68,0.5)',
              action: () => {
                window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "ARGUS_RISK_SCAN: Call get_tasks('all') then score all overdue and high-priority tasks by risk level (CRITICAL/HIGH/MEDIUM). Send a send_notification with the top 3 critical items listed clearly. Be concise." } }));
                setShowFab(false);
              },
            },
            {
              id: 'ghost',
              label: 'Ghost Scan',
              icon: <Ghost size={16} />,
              color: 'linear-gradient(135deg,#06b6d4,#0891b2)',
              shadow: 'rgba(6,182,212,0.5)',
              action: () => {
                window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "SPECTRE_GHOST_SCAN: Scan my Gmail inbox for hidden deadlines and commitments (phrases like 'by Friday', 'due date', 'ASAP', 'please submit', 'can you send'). Create a ZenTrack task for each untracked commitment you find. Report how many ghost tasks were created." } }));
                setShowFab(false);
              },
            },
            {
              id: 'inbox',
              label: 'Inbox Zero',
              icon: <Mail size={16} />,
              color: 'linear-gradient(135deg,#eab308,#ca8a04)',
              shadow: 'rgba(234,179,8,0.5)',
              action: () => {
                window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "HERMES_INBOX_ZERO: Read my 10 most recent unread emails. For each one: (1) summarize in one line, (2) flag if it needs a task created. Create tasks for any actionable emails. Then list the summaries. Keep total response under 300 words." } }));
                setShowFab(false);
              },
            },
            {
              id: 'schedule',
              label: 'Auto-Schedule',
              icon: <Calendar size={16} />,
              color: 'linear-gradient(135deg,#10b981,#059669)',
              shadow: 'rgba(16,185,129,0.5)',
              action: () => {
                window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "CHRONOS_SCHEDULE_OPTIMIZER: Call get_tasks('today') to get today's pending tasks and get_free_calendar_slots() to find available time blocks. Block calendar time for the top 3 priority tasks in the best available slots. Report what was scheduled." } }));
                setShowFab(false);
              },
            },
            {
              id: 'focus',
              label: 'Deep Focus',
              icon: <Target size={16} />,
              color: 'linear-gradient(135deg,#f43f5e,#e11d48)',
              shadow: 'rgba(244,63,94,0.5)',
              action: () => {
                window.dispatchEvent(new CustomEvent('zen-tool-direct', { detail: { tool: 'focus_lock', args: { durationHours: 1 } } }));
                setShowFab(false);
              },
            },
            {
              id: 'briefing',
              label: 'Daily Briefing',
              icon: <Sun size={16} />,
              color: 'linear-gradient(135deg,#f59e0b,#d97706)',
              shadow: 'rgba(245,158,11,0.5)',
              action: () => {
                window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: "ORACLE_DAILY_BRIEF: Call get_tasks('dashboard') for today's agenda. Output a clean morning brief: ðŸ“… TODAY (top 3 tasks by priority) | âš ï¸ OVERDUE (count) | ðŸ’¡ ONE THING to start with. Max 150 words. Be direct and energizing." } }));
                setShowFab(false);
              },
            },
          ];

          return (
            <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 900 }}>
              <AnimatePresence>
                {showFab && petals.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, scale: 0.6, y: 0 }}
                    animate={{ opacity: 1, scale: 1, y: -(72 + i * 60) }}
                    exit={{ opacity: 0, scale: 0.6, y: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28, delay: i * 0.05 }}
                    style={{ position: 'absolute', bottom: 0, right: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}
                  >
                    <motion.span
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 + 0.1 }}
                      style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', fontWeight: 600, color: '#e4e4e7', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
                    >
                      {p.label}
                    </motion.span>
                    <button
                      onClick={p.action}
                      style={{ width: 46, height: 46, borderRadius: '50%', border: 'none', background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: `0 6px 20px ${p.shadow}` }}
                    >
                      {p.icon}
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              <motion.button
                onClick={() => setShowFab(f => !f)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                animate={{ rotate: showFab ? 135 : 0, scale: (showAgent || isPanelClosing) ? 0 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                style={{ position: 'relative', zIndex: 1, background: showFab ? 'linear-gradient(135deg,#374151,#1f2937)' : 'linear-gradient(135deg,#8b5cf6,#3b82f6)', border: 'none', borderRadius: '50%', width: 56, height: 56, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: showFab ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(139,92,246,0.45)', cursor: 'pointer', transition: 'background 0.3s ease, box-shadow 0.3s ease' }}
                aria-label={showFab ? 'Close agent menu' : 'Open Zen Agent'}
              >
                <Bot size={26} />
              </motion.button>
            </div>
          );
        })()}

        <AnimatePresence onExitComplete={() => { setIsPanelClosing(false); }}>
          {showAgent && (
            <ZenAgentPanel
              onClose={() => {
                setIsPanelClosing(true);
                setShowAgent(false);
              }}
            />
          )}
        </AnimatePresence>

        {/* â”€â”€ Smooth auth entry animation â€” the whole app fades in from below â”€â”€ */}
        <motion.div
          key="app-shell"
          initial={{ opacity: 0, scale: 0.99, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.99, filter: 'blur(4px)' }}
          transition={phaseTransition}
          style={{ position: 'contents' }}
        />

        <BackgroundEffects />
        <div className="app-container flex-col">
          <TopNav />
          <div className="hide-on-mobile"><GoogleWorkspaceBanner /></div>
          <div className="main-content full-width">
            <Suspense fallback={<PageLoader />}>
              <AnimatedRoutes />
            </Suspense>
          </div>
        </div>
        <BottomNav />
        </DataReadyGate>
      </PomodoroProvider>
      </GlobalDataProvider>
      </ErrorBoundary>
    );
  }

  // â”€â”€ UNAUTHENTICATED / INITIALIZING / AUTHENTICATING PHASES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Landing page is always rendered. A full-screen overlay sits on top:
  //   - 'initializing'    â†’ dark overlay (app is checking stored session)
  //   - 'authenticating'  â†’ dark overlay with spinner (popup in progress)
  //   - 'unauthenticated' â†’ overlay is gone; Landing is fully visible
  return (
    <>
      <Toaster {...toasterProps} />

      {/* Landing always mounted â€” prevents video/background from reloading */}
      <Landing onTryNow={() => {
        setShowLogin(true);
        navigate('/login', { replace: true });
      }} />

      {/* Login overlay â€” slides in over landing */}
      <AnimatePresence mode="wait">
        {isLogin && (
          <Login
            onBack={() => {
              setShowLogin(false);
              navigate('/', { replace: true });
            }}
          />
        )}
      </AnimatePresence>

      {/* Phase overlay: covers landing during init and popup auth */}
      <AnimatePresence>
        {(authPhase === 'initializing' || authPhase === 'authenticating') && (
          <motion.div
            key="auth-loading-overlay"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 200,
              background: '#030d1a',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.5rem',
            }}
          >
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              <img src="/logo_white.png" alt="ZenTrack" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'white', letterSpacing: '0.02em' }}>ZenTrack</span>
            </motion.div>

            {/* Spinner */}
            <div style={{ position: 'relative', width: 48, height: 48 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.15)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#8b5cf6', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#3b82f6', animation: 'spin 1.2s linear infinite reverse' }} />
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontFamily: 'var(--font-sans)' }}
            >
              {authPhase === 'authenticating' ? 'Signing you in...' : 'Loading ZenTrack...'}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


export default App;

