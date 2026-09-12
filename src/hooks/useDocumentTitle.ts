import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useGlobalData } from '../contexts/GlobalDataContext';
import { getLocalDateString } from '../utils/dateUtils';

export const ROUTE_TITLES: Record<string, string> = {
  '/home': 'Dashboard',
  '/': 'Dashboard',
  '/tasks': 'Inbox',
  '/todo': 'Inbox',
  '/calendar': 'Calendar',
  '/habits': 'Habits',
  '/analytics': 'Analytics',
  '/notes': 'Notes',
  '/attendance': 'Attendance',
  '/learning': 'Learning',
  '/goals': 'Goals',
  '/jobs': 'Job Tracker',
  '/review': 'Weekly Review',
  '/grades': 'Grade Calculator',
  '/integrations': 'Integrations',
  '/login': 'Log in',
  '/landing': 'ZenTrack — AI-Powered Life OS',
};

/**
 * Computes the formatted document title matching Todoist standards.
 * Format: "<ModuleName> – ZenTrack" or "(<Count>) <ModuleName> – ZenTrack"
 */
export const getDocumentTitle = (
  pathname: string,
  counts?: { todayPending?: number; inboxPending?: number },
  customTitle?: string | null
): string => {
  if (customTitle) {
    return `${customTitle} – ZenTrack`;
  }

  if (pathname === '/landing') {
    return 'ZenTrack — AI-Powered Life OS';
  }

  const baseTitle =
    ROUTE_TITLES[pathname] ||
    (pathname.length > 1
      ? pathname.slice(1).charAt(0).toUpperCase() + pathname.slice(2).replace(/[-_]/g, ' ')
      : 'ZenTrack');

  // Prepend badge count for active Inbox or Dashboard views
  if (pathname === '/home' && counts?.todayPending && counts.todayPending > 0) {
    return `(${counts.todayPending}) ${baseTitle} – ZenTrack`;
  }

  if (pathname === '/tasks' && counts?.inboxPending && counts.inboxPending > 0) {
    return `(${counts.inboxPending}) ${baseTitle} – ZenTrack`;
  }

  return `${baseTitle} – ZenTrack`;
};

/**
 * Hook to dynamically sync document.title with the active route and task state.
 */
export const useDocumentTitleSync = () => {
  const location = useLocation();
  const globalData = useGlobalData();
  const [customTitle, setCustomTitle] = useState<string | null>(null);

  useEffect(() => {
    const handleCustomTitle = (e: Event) => {
      const detail = (e as CustomEvent<{ title?: string | null }>).detail;
      setCustomTitle(detail?.title || null);
    };

    window.addEventListener('zen-set-title', handleCustomTitle);
    return () => {
      window.removeEventListener('zen-set-title', handleCustomTitle);
    };
  }, []);

  // Clear custom title whenever route changes
  useEffect(() => {
    setCustomTitle(null);
  }, [location.pathname]);

  useEffect(() => {
    const todayStr = getLocalDateString(new Date());
    const tasks = globalData?.tasks || [];
    const todayPending = tasks.filter(t => t.date === todayStr && t.status !== 'completed').length;
    const inboxPending = tasks.filter(t => !t.date && t.status !== 'completed').length;

    document.title = getDocumentTitle(location.pathname, { todayPending, inboxPending }, customTitle);
  }, [location.pathname, globalData?.tasks, customTitle]);
};

/**
 * Component mounted inside GlobalDataProvider to keep browser tab title synchronized.
 */
export const DocumentTitleWatcher: React.FC = () => {
  useDocumentTitleSync();
  return null;
};
