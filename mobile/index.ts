// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG PROFILER — REMOVE AFTER DIAGNOSIS
// Starts Hermes sampling profiler at absolute earliest JS boot (before React),
// stops it 8 seconds later. Boot timing markers log to adb logcat.
// ═══════════════════════════════════════════════════════════════════════════════
const BOOT_T0 = Date.now();
(global as any).__BOOT_T0 = BOOT_T0;
console.log(`[BOOT-DIAG] index.ts JS entry at t=0 (epoch=${BOOT_T0})`);

const _hermes = (global as any).HermesInternal;
if (_hermes?.enableSamplingProfiler) {
  _hermes.enableSamplingProfiler();
  console.log(`[BOOT-DIAG] Hermes sampling profiler ENABLED at dt=${Date.now() - BOOT_T0}ms`);

  setTimeout(() => {
    try {
      if (_hermes?.disableSamplingProfiler) {
        _hermes.disableSamplingProfiler();
        console.log(`[BOOT-DIAG] Hermes sampling profiler DISABLED at dt=${Date.now() - BOOT_T0}ms`);
        console.log(`[BOOT-DIAG] Profile saved to app cache dir. Pull with: adb shell "ls /data/user/0/com.shiv157.zentrack/cache/*.cpuprofile"`);
      }
    } catch (err) {
      console.error(`[BOOT-DIAG] Profiler stop error:`, err);
    }
  }, 8000);
} else {
  console.warn(`[BOOT-DIAG] HermesInternal.enableSamplingProfiler NOT available on this engine`);
}
// ═══════════════════════════════════════════════════════════════════════════════

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
