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

// ————————————————————————————————————————————————————————
import { Login } from './components/Login';
import { Landing } from './components/Landing';
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
import { FloatingExtraWorks } from './features/_shared';
import { HomeDashboard } from './features/dashboard/HomeDashboard';
import { MissionReport } from './features/dashboard/MissionReport';
import { ReportArchive } from './features/dashboard/ReportArchive';

import { CommandPalette } from './components/CommandPalette';
import { Bot, ShieldAlert, Ghost, Code2, MessageSquare, Mail, Calendar, Target, Sun, Zap } from 'lucide-react';
import { AgentDataStream } from './components/AgentDataStream';
import { useDeadlineWatcher } from './hooks/useDeadlineWatcher';
import { AppLoader } from './components/AppLoader';
import { SaraInterface } from './components/SaraInterface';
import { BottomHeader } from './components/BottomHeader';


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
 * AgentNavigator — listens for 'agent-navigate' events dispatched by toolExecutor
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

        // ✅ U3 FIX: The old code signed out whenever currentLocalKey !== activeSessionKey.
        // This force-logged-out ALL incognito users and new-device users because their
        // localStorage is empty (null) and the remote key is 'v1' — null !== 'v1' is true.
        //
        // NEW RULE:
        //   null   → first visit on this browser/device → sync the key locally, stay logged in
        //   stale  → admin-triggered remote wipe → force logout (the ONLY intended use case)
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
        // If yes, don't reload again — prevents infinite loop
        const reloadKey = `chunk_reload_${name}`;
        const lastReload = parseInt(localStorage.getItem(reloadKey) || '0', 10);
        if (Date.now() - lastReload < 8000) {
          // We already tried reloading for this chunk — give up and show error
          throw new Error(`Module "${name}" failed to load after reload. Please close and reopen the app.`, { cause: error });
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
        } catch { /* ignore */ }

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

// ——— Lazily-loaded page modules (~1.9 MB → ~300 KB initial bundle) —————————————————
const TodoListModule = lazyWithRetry(() => import('./features/tasks/TodoListModule').then(m => ({ default: m.TodoListModule })), 'TodoListModule');
const CalendarModule = lazyWithRetry(() => import('./features/calendar').then(m => ({ default: m.CalendarModule })), 'CalendarModule');
const NotesModule = lazyWithRetry(() => import('./features/notes').then(m => ({ default: m.NotesModule })), 'NotesModule');
const GoalsModule = lazyWithRetry(() => import('./features/goals').then(m => ({ default: m.GoalsModule })), 'GoalsModule');
const AnalyticsModule = lazyWithRetry(() => import('./features/analytics/AnalyticsModule').then(m => ({ default: m.AnalyticsModule })), 'AnalyticsModule');
const GymModule = lazyWithRetry(() => import('./features/gym').then(m => ({ default: m.GymModule })), 'GymModule');
const JobTracker = lazyWithRetry(() => import('./features/jobs/JobTracker').then(m => ({ default: m.JobTracker })), 'JobTracker');
const HabitsModule = lazyWithRetry(() => import('./features/habits/HabitsModule').then(m => ({ default: m.HabitsModule })), 'HabitsModule');
const LearningChecklistModule = lazyWithRetry(() => import('./features/learning/LearningChecklistModule').then(m => ({ default: m.LearningChecklistModule })), 'LearningChecklistModule');

const IntegrationsModule = lazyWithRetry(() => import('./features/integrations/IntegrationsModule').then(m => ({ default: m.IntegrationsModule })), 'IntegrationsModule');
const WeeklyReviewModule = lazyWithRetry(() => import('./features/review/WeeklyReviewModule').then(m => ({ default: m.WeeklyReviewModule })), 'WeeklyReviewModule');
const AttendanceModule = lazyWithRetry(() => import('./features/academic/AttendanceModule').then(m => ({ default: m.AttendanceModule })), 'AttendanceModule');
const AssignmentModule = lazyWithRetry(() => import('./features/academic/AssignmentModule').then(m => ({ default: m.AssignmentModule })), 'AssignmentModule');
const GradeCalculatorModule = lazyWithRetry(() => import('./features/academic/GradeCalculatorModule').then(m => ({ default: m.GradeCalculatorModule })), 'GradeCalculatorModule');

// ——— Page loading skeleton (replaces spinner — feels like content is loading, not waiting) —
// Minimized to prevent a jarring "flash" of 3 giant rectangles when navigating between modules
const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vault-primary)' }}>
    {/* Transparent during fast lazy-loads */}
  </div>
);

// Performance: blur() filter removed — it triggers a full GPU repaint on every
// route change. Pure translateY is GPU-composited (no main-thread paint cost).
// isMobileDevice is memoized at module level — no per-render cost.
const _isMobile = typeof window !== 'undefined'
  ? ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  : false;

const PageTransition = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    className="page-enter"
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -15 }}
    transition={{ duration: _isMobile ? 0.25 : 0.35, ease: [0.22, 1, 0.36, 1] }}
    style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}
  >
    {children}
  </motion.div>
);

// ——— Animated Routes ——————————————————————————————————————————————————————
const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    // mode='wait' ensures the old page fully exits before the new page enters.
    // This completely eliminates the DOM layout stutter/jank caused by both pages existing simultaneously.
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home"        element={<ErrorBoundary name="Dashboard"><HomeDashboard /></ErrorBoundary>} />
        <Route path="/tasks"       element={<PageTransition><ErrorBoundary name="Tasks"><Suspense fallback={<PageLoader />}><TodoListModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/calendar"    element={<PageTransition><ErrorBoundary name="Calendar"><Suspense fallback={<PageLoader />}><CalendarModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/notes"       element={<PageTransition><ErrorBoundary name="Notes"><Suspense fallback={<PageLoader />}><NotesModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/goals"       element={<PageTransition><ErrorBoundary name="Goals"><Suspense fallback={<PageLoader />}><GoalsModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/analytics"   element={<PageTransition><ErrorBoundary name="Analytics"><Suspense fallback={<PageLoader />}><AnalyticsModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/gym"         element={<PageTransition><ErrorBoundary name="Gym"><Suspense fallback={<PageLoader />}><GymModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/jobs"        element={<PageTransition><ErrorBoundary name="Jobs"><Suspense fallback={<PageLoader />}><JobTracker /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/habits"      element={<PageTransition><ErrorBoundary name="Habits"><Suspense fallback={<PageLoader />}><HabitsModule /></Suspense></ErrorBoundary></PageTransition>} />
        <Route path="/learning"    element={<PageTransition><ErrorBoundary name="Learning"><Suspense fallback={<PageLoader />}><LearningChecklistModule /></Suspense></ErrorBoundary></PageTransition>} />

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

// ✅ U1 FIX: DataReadyGate — shows a premium loading overlay while GlobalDataContext
// is hydrating from Firestore (0-3s after auth resolves). Prevents the "skeleton soup"
// where every lazy-loaded module renders simultaneously with its own loading skeleton
// while also making its own Firestore calls — creating a fragmented loading experience.
// This gate renders ONCE at the top level, so all routes get clean data on first paint.
const DataReadyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading } = useGlobalData();
  
  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div key="data-loader" exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: '#030712' }}>
          <AppLoader title="Syncing your data..." subtitle="Loading tasks, habits and calendar" />
        </motion.div>
      ) : (
        <motion.div
          key="data-content"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.8, 0.25, 1] }}
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser]               = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // ——— Auth Phase State Machine ——————————————————————————————————————
  // 'initializing'    → App just loaded, Firebase is checking stored session
  // 'unauthenticated' → No user. Landing page is shown.
  // 'authenticating'  → Popup opened OR redirect in progress. Loading overlay shown.
  // 'authenticated'   → User logged in. App is fully shown.
  //
  // Using a single phase state instead of multiple booleans eliminates the 3-branch
  // return() pattern which caused React to fully unmount/remount the tree on each
  // auth state change — the root cause of the visible flash and screen collision.
  // ———————————————————————————————————————————————————————————————————————————————————
  // Listen for Login.tsx button click → immediately switch to 'authenticating'
  // phase so the loading overlay covers the landing page BEFORE the popup opens.
  // This is what eliminates the 1-2 second flash of the landing page during popup auth.
  // Also listen for cancellation/error → revert to 'unauthenticated' gracefully.
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
  const [showSara, setShowSara] = useState(false);
  // ✅ U2 FIX: Track panel closing animation state.
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [showDeveloperMatrix, setShowDeveloperMatrix] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);


  // Use a ref to track previous user so we never add it to the effect dep array
  // (adding it caused multiple auth subscriptions on each login/logout cycle).
  const prevUserRef = useRef<User | null>(null);

  // Listen for Login.tsx button click → immediately switch to 'authenticating'
  // phase so the loading overlay covers the landing page BEFORE the popup opens.
  // This is what eliminates the 1-2 second flash of the landing page during popup auth.
  useEffect(() => {
    const handleAuthStarting = () => setAuthPhase('authenticating');
    window.addEventListener('zen-auth-starting', handleAuthStarting);
    return () => window.removeEventListener('zen-auth-starting', handleAuthStarting);
  }, []);

  useEffect(() => {
    const handleToggleSara = () => {
      setShowSara(prev => !prev);
    };

    window.addEventListener('toggle-sara', handleToggleSara);
    return () => {
      window.removeEventListener('toggle-sara', handleToggleSara);
    };
  }, []);

  useEffect(() => {
    // Skip Lenis on touch/mobile — native iOS scroll is already buttery smooth
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

    // ——— SMART AUTH INITIALIZATION —————————————————————————————————————————————————
    // POPUP auth  → set up onAuthStateChanged IMMEDIATELY. Firebase resolves the
    //               auth state from local storage in <100ms — zero landing-page flash.
    //
    // REDIRECT auth → must call getRedirectResult() FIRST. Without it, Firebase fires
    //                 onAuthStateChanged with null before it processes the redirect
    //                 tokens, causing the user to get stuck on the login page.
    //
    // We distinguish the two using the `zen_is_redirecting` localStorage flag that
    //  Login.tsx sets right before calling signInWithRedirect().
    // ———————————————————————————————————————————————————————————————————————————————————

    const isReturningFromRedirect = localStorage.getItem('zen_is_redirecting') === '1';

    const setupAuthListener = () => {
      unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
        // ——— Side effects on fresh login (null → user transition) —————————————————
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
        // ——— Update authPhase based on resolved auth state —————————————————
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
              toast.error('Domain not authorized. Add this domain in Firebase Console → Authentication → Settings.', { duration: 15000 })
            );
          }
        })
        .finally(() => {
          localStorage.removeItem('zen_is_redirecting');
          setupAuthListener(); // ← only now is auth state settled
        });
    } else {
      // POPUP / EXISTING SESSION PATH: listener fires in <100ms — no flash
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


  // ——— SINGLE UNIFIED RENDER ——————————————————————————————————————————————————————
  // All auth phase transitions are controlled here by a single AnimatePresence.
  // This guarantees: one phase exits fully BEFORE the next one enters.
  // No more 3 disconnected return() branches = no flash, no collision.
  // ———————————————————————————————————————————————————————————————————————————————————

  const toasterProps = {
    position: 'top-right' as const,
    toastOptions: {
      style: {
        background: 'rgba(8, 20, 35, 0.97)', // Solid-ish — avoids backdrop-filter on mobile
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '0.875rem',
        color: 'white',
        fontFamily: "'Inter', sans-serif",
        fontSize: '0.85rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      },
      classNames: { success: 'toast-success', error: 'toast-error', warning: 'toast-warning' },
    },
  };

  // Shared smooth transition config — pure opacity, no blur/scale (GPU composited only)
  const phaseTransition = { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const };

  // Landing page is always mounted as the base layer.
  // It only becomes visible when the overlay on top (app or loading) fades out.
  const isLogin = authPhase === 'unauthenticated' && (showLogin || location.pathname === '/login');

  const isProbablyLoggedIn = localStorage.getItem('zen_is_logged_in') === '1';
  const isProtectedRoute = !['/', '/landing', '/login'].includes(window.location.pathname);
  const showSolarLoader = authLoading && (isProbablyLoggedIn || isProtectedRoute);

  return (
    <AnimatePresence mode="wait">
      {showSolarLoader ? (
        <motion.div key="solar-loader" exit={{ opacity: 1, transition: { duration: 0 } }} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: '#030712' }}>
          <AppLoader />
        </motion.div>
      ) : authPhase === 'authenticated' && user ? (
        <motion.div 
          key="app-shell" 
          style={{ position: 'contents' }}
        >
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
        {/* ── Global Cinematic Agent HUD ── */}
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

        <AnimatePresence>
          {showSara && (
            <motion.div
              style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <SaraInterface onClose={() => setShowSara(false)} />
            </motion.div>
          )}
        </AnimatePresence>



        <BackgroundEffects />
        <div className="app-container flex-col">
          <div className="main-content full-width">
            <Suspense fallback={<PageLoader />}>
              <AnimatedRoutes />
            </Suspense>
          </div>
        </div>
        <BottomHeader showSara={showSara} onOpenSara={() => setShowSara(true)} />
        </DataReadyGate>
      </PomodoroProvider>
      </GlobalDataProvider>
      </ErrorBoundary>
        </motion.div>
      ) : (
        <motion.div key="unauth-shell" exit={{ opacity: 0, transition: { duration: 0.5 } }}>
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
              <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#a599ff', animation: 'spin 1.2s linear infinite reverse' }} />
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
