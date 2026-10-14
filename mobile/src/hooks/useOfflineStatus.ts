import { useState, useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { subscribeToQueueChanges, subscribeToSyncComplete } from '../services/offlineSync';

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [recentlySynced, setRecentlySynced] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    const unsubNet = NetInfo.addEventListener(state => {
      if (mounted) setIsOffline(state.isConnected === false);
    });
    NetInfo.fetch().then(state => {
      if (mounted) setIsOffline(state.isConnected === false);
    }).catch(() => {});

    const unsubQueue = subscribeToQueueChanges(count => {
      if (mounted) setQueueCount(count);
    });

    const unsubSync = subscribeToSyncComplete(count => {
      if (count > 0 && mounted) {
        setRecentlySynced(true);
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => {
          syncTimerRef.current = null;
          if (mounted) setRecentlySynced(false);
        }, 2500);
      }
    });

    return () => {
      mounted = false;
      unsubNet();
      unsubQueue();
      unsubSync();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  return { isOffline, queueCount, recentlySynced };
}
