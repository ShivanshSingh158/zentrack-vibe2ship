import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React from 'react';
import { View, ActivityIndicator, LogBox, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator, { SplashLoader } from './src/navigation/AppNavigator';
import { OfflineIndicator } from './src/components/OfflineIndicator';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions, registerBackgroundNotificationFetch } from './src/services/notifications';
import * as SplashScreen from 'expo-splash-screen';
import NetInfo from '@react-native-community/netinfo';
import { setupNetworkListener, syncOfflineQueue } from './src/services/offlineSync';
import { PortalProvider } from './src/contexts/PortalContext';
import { registerBackgroundProactiveAgent } from './src/services/backgroundProactiveAgent';
import { registerWeeklyReviewTask } from './src/services/backgroundTasks';
import { UpdateBanner } from './src/components/UpdateBanner';
import { ThemeProvider } from './src/contexts/ThemeContext';

// Keep the native splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

// Expo SDK 53+ removed remote push from Expo Go, but local notifications still work.
// expo-av is deprecated in SDK 54 but still functional until SDK 55.
// These suppress the popup overlays — the Metro terminal still shows them (unavoidable).
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '[expo-av]: Expo AV has been deprecated',
  'expo-notifications` functionality is not fully supported',
  'setLayoutAnimationEnabledExperimental',
  'Could not reach Cloud Firestore backend', // Safe to ignore — Firebase falls back to offline cache automatically
]);


export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
  });

  React.useEffect(() => {
    requestNotificationPermissions();
    registerBackgroundNotificationFetch();
    registerBackgroundProactiveAgent();
    registerWeeklyReviewTask();
  }, []);

  // Drain any gym logs queued while offline as soon as connectivity is restored.
  // Previously syncOfflineLogs() was never called — causing silent data loss.
  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        syncOfflineQueue().catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-clear AI conversations when app is backgrounded/closed
  // This ensures Sara and Gym AI always start fresh every session
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        AsyncStorage.multiRemove([
          'sara_chat_history',
          'sara_memory_summary',
          'gym_chat_history',
          'gym_memory_summary',
        ]).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    if (fontsLoaded) {
      // Hide the native splash screen, revealing the app (which will immediately show the Quote loader)
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Show SplashLoader (animated quote) while fonts are loading — eliminates the
  // ~300ms black screen that was previously shown with `return null`.
  // Fonts load invisibly in background; user sees something beautiful immediately.
  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider style={{ flex: 1, backgroundColor: '#080510' }}>
          <SplashLoader />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: '#080510' }}>
        <ThemeProvider>
          <PortalProvider>
            <AppNavigator />
            <OfflineIndicator />
            <UpdateBanner />
          </PortalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
