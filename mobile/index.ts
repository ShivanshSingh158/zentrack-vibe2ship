import { registerRootComponent } from 'expo';
import App from './App';

// ─── Safe Native Module Registration ─────────────────────────────────────────
// react-native-android-widget and expo-task-manager (geofence) are native modules.
// If EAS built the APK from a stale prebuild cache that doesn't include their
// compiled Java/Kotlin code, calling into them crashes the Hermes JS thread
// silently → app freezes on splash screen forever.
// Wrapping in try-catch ensures the app always boots (just without widget/geofence
// features until a --clear-cache rebuild compiles the native classes).


try {
  require('./src/services/geofenceService');
} catch (e: any) {
  console.warn('[Boot] Geofence service registration skipped (native module not linked):', e?.message);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
