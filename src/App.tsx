import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from 'sonner';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { onSnapshot, doc, setDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { runModelHealthCheck } from './services/gemini/core';
import Lenis from 'lenis';

// ─── Always-on components (tiny, needed immediately) ───────────────────────
import { Login } from './components/Login';
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
        
        // Key mismatch: forced logout triggered remotely.
        // Clear the local key BEFORE signing out so the next login
        // doesn't skip future remote wipe triggers.
        if (data.activeSessionKey && currentLocalKey !== data.activeSessionKey) {
          localStorage.removeItem('global_session_key');
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

// ─── Lazily-loaded page modules (~1.9 MB → ~300 KB initial bundle) ─────────
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

// ─── Animated Routes ──────────────────────────────────────────────────────────
const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    // mode='sync' means incoming and outgoing pages animate simultaneously
    // — this is what makes iOS feel instant (not waiting for old page to exit first)
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

function App() {
  const [user, setUser]               = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [showFab,   setShowFab]   = useState(false);
  const [showDeveloperMatrix, setShowDeveloperMatrix] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

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

        // ✅ Run startup model health check to exclude deprecated preview models
        runModelHealthCheck().catch(err => console.error("Model health check failed:", err));

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
    <ErrorBoundary name="GlobalProviders">
    <GlobalDataProvider>
    <PomodoroProvider>
      <UpdatePrompt />
      <Toaster theme="dark" position="top-right" />
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

      {/* ── Zen Agent SpeedDial FAB ─────────────────────────────────── */}
      {/* 4 quick-action petals + main chat panel                         */}
      {/* Petal actions dispatch 'agent-shortcut' event picked up by      */}
      {/* HomeDashboard to fire handleExecuteCommand with a preset prompt */}
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
              window.dispatchEvent(new CustomEvent('agent-shortcut', {
                detail: { prompt: 'LEVEL_4 EMERGENCY: Run a full risk assessment. Call ARGUS to score all overdue and high-priority tasks, check my calendar for time conflicts, send me a notification with the top 3 critical items, and give me a complete risk report.' }
              }));
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
              window.dispatchEvent(new CustomEvent('agent-shortcut', {
                detail: { prompt: 'GHOST DEADLINE DISCOVERY: Scan my Gmail inbox for any hidden deadlines, commitments, or tasks I may have missed. Look for phrases like "by Friday", "due date", "ASAP", "please submit", "can you send". Create a ZenTrack task for each ghost deadline you find.' }
              }));
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
              window.dispatchEvent(new CustomEvent('agent-shortcut', {
                detail: { prompt: 'INBOX ZERO ROUTINE: Read all my unread emails and messages. Summarize the important ones into actionable ZenTrack tasks with priorities. Draft replies for the urgent ones and archive the junk.' }
              }));
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
              window.dispatchEvent(new CustomEvent('agent-shortcut', {
                detail: { prompt: 'SCHEDULE OPTIMIZER: Review my calendar and my high-priority ZenTrack tasks. Suggest exactly when I should work on each task today to maximize my productivity, and identify any overlapping meeting conflicts.' }
              }));
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
              window.dispatchEvent(new CustomEvent('agent-shortcut', {
                detail: { prompt: 'DEEP FOCUS PROTOCOL: Enable focus mode immediately. Hide all non-essential notifications, start a 60-minute Pomodoro timer, and pull up my highest priority task so I can start working on it right now.' }
              }));
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
              window.dispatchEvent(new CustomEvent('agent-shortcut', {
                detail: { prompt: 'MORNING BRIEFING: Give me a comprehensive overview of today. Summarize my key goals, list any pending deadlines I need to worry about, and prepare me for the day ahead.' }
              }));
              setShowFab(false);
            },
          }
        ];

        return (
          <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 900 }}>
            {/* Petal buttons — fan out above the main button */}
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
                  {/* Label */}
                  <motion.span
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 + 0.1 }}
                    style={{
                      background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
                      padding: '0.3rem 0.65rem', fontSize: '0.78rem', fontWeight: 600,
                      color: '#e4e4e7', whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}
                  >
                    {p.label}
                  </motion.span>
                  {/* Button */}
                  <button
                    onClick={p.action}
                    style={{
                      width: 46, height: 46, borderRadius: '50%', border: 'none',
                      background: p.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                      boxShadow: `0 6px 20px ${p.shadow}`,
                    }}
                  >
                    {p.icon}
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Main FAB */}
            <motion.button
              onClick={() => setShowFab(f => !f)}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              animate={{ rotate: showFab ? 135 : 0, scale: showAgent ? 0 : 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                position: 'relative', zIndex: 1,
                background: showFab
                  ? 'linear-gradient(135deg,#374151,#1f2937)'
                  : 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                border: 'none', borderRadius: '50%', width: 56, height: 56,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: showFab
                  ? '0 8px 32px rgba(0,0,0,0.4)'
                  : '0 8px 32px rgba(139,92,246,0.45)',
                cursor: 'pointer', transition: 'background 0.3s ease, box-shadow 0.3s ease',
              }}
              aria-label={showFab ? 'Close agent menu' : 'Open Zen Agent'}
            >
              <Bot size={26} />
            </motion.button>
          </div>
        );
      })()}

      <AnimatePresence>
        {showAgent && <ZenAgentPanel onClose={() => setShowAgent(false)} />}
      </AnimatePresence>


      {/* Greeting Toast removed per user request */}

      <BackgroundEffects />
      <div className="app-container flex-col">
        <TopNav />
        <GoogleWorkspaceBanner />
        <div className="main-content full-width">
          {/* Suspense wraps ALL lazy routes — PageLoader shown during chunk download */}
          <Suspense fallback={<PageLoader />}>
            <AnimatedRoutes />
          </Suspense>
        </div>
      </div>
    </PomodoroProvider>
    </GlobalDataProvider>
    </ErrorBoundary>
  );
}

export default App;
