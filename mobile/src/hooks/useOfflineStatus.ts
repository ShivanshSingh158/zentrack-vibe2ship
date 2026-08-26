/**
 * useOfflineStatus.ts — ZenTrack Mobile
 * Lightweight hook providing live connectivity and offline write queue status.
 */
import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { subscribeToQueueChanges, subscribeToSyncComplete } from '../services/offlineSync';

export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [recentlySynced, setRecentlySynced] = useState(false);

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener(state => {
      setIsOffline(state.isConnected === false);
    });
    NetInfo.fetch().then(state => setIsOffline(state.isConnected === false));

    const unsubQueue = subscribeToQueueChanges(count => {
      setQueueCount(count);
    });

    const unsubSync = subscribeToSyncComplete(count => {
      if (count > 0) {
        setRecentlySynced(true);
        setTimeout(() => setRecentlySynced(false), 2500);
      }
    });

    return () => {
      unsubNet();
      unsubQueue();
      unsubSync();
    };
  }, []);

  return { isOffline, queueCount, recentlySynced };
}
