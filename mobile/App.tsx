import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React from 'react';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { OfflineIndicator } from './src/components/OfflineIndicator';
import { requestNotificationPermissions } from './src/services/notifications';

// Expo SDK 53+ removed remote push from Expo Go, but local notifications still work.
// expo-av is deprecated in SDK 54 but still functional until SDK 55.
// These suppress the popup overlays — the Metro terminal still shows them (unavoidable).
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '[expo-av]: Expo AV has been deprecated',
  'expo-notifications` functionality is not fully supported',
  'setLayoutAnimationEnabledExperimental',
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
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#080510', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#cba6f7" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: '#080510' }}>
        <AppNavigator />
        <OfflineIndicator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
