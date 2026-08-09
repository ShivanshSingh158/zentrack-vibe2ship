/**
 * ErrorBoundary GÇö ZenTrack Mobile (Production Grade)
 *
 * ARCHITECTURE: This component is the last line of defence against JS crashes.
 * It is designed to NEVER let a crash propagate to the root and blank/grey the app.
 *
 * Three tiers of protection:
 *   1. Screen-level: Wraps individual screens GÇö crash kills only that screen.
 *      The rest of the app (tab bar, other screens) stays fully alive.
 *   2. Navigator-level: Wraps Tab/Stack navigators GÇö catches crashes in
 *      navigation structure itself.
 *   3. Root-level: Wraps the entire app GÇö absolute last resort.
 *
 * On error, renders a dark recovery card that matches the app's Obsidian Cosmos
 * design GÇö never a white screen, never a grey screen, never a crash dialog.
 * User can tap "Try again" to reset the boundary and re-render the screen.
 *
 * Production behaviour:
 *   - Logs full error + component stack to console (pick up with Logcat / Metro)
 *   - Dev mode: shows error message inline for debugging
 *   - Prod mode: shows only the friendly recovery card
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props {
  children: React.ReactNode;
  /** Human-readable name shown in the recovery card and logs */
  screenName?: string;
  /**
   * Optional callback fired when the error boundary catches an error.
   * Use this to send crash reports to your analytics/crash reporting service.
   */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  retryCount: number;
  isRestarting?: boolean;
}

// GöÇGöÇGöÇ Constants GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
// These are hardcoded (not from ThemeContext) because:
// - ErrorBoundary must render even if ThemeContext crashed
// - ThemeContext being a parent of ErrorBoundary would be circular
const BG        = '#000000';
const SURFACE   = '#141416';
const BORDER    = '#2c2c2e';
const ACCENT    = '#a599ff';
const RED       = '#ff6961';
const WHITE     = '#ffffff';
const MUTED     = '#8e8e93';

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  // GöÇGöÇ Error capture GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Capture full component stack GÇö available in Logcat on Android
    console.error(
      `\nGòöGòÉGòÉ [ErrorBoundary] Crash caught in: ${this.props.screenName ?? 'unknown'} GòÉGòÉGòù\n` +
      `Error: ${error.message}\n` +
      `Stack: ${error.stack ?? 'N/A'}\n` +
      `Component stack: ${info.componentStack ?? 'N/A'}\n` +
      `GòÜGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGò¥\n`
    );

    // Store errorInfo for dev display
    this.setState({ errorInfo: info });

    // Fire optional external crash reporter
    try {
      this.props.onError?.(error, info);
    } catch {
      // Never let the reporter crash the boundary itself
    }

    // GöÇGöÇ Auto-Restart Failsafe GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
    // The user prefers the app to automatically reboot rather than showing a
    // crash screen. We do this in production, but use a timestamp guard to 
    // prevent an infinite crash-loop if the error is persistent on boot.
    if (!__DEV__) {
      this.setState({ isRestarting: true });
      setTimeout(async () => {
        try {
          const lastCrashStr = await AsyncStorage.getItem('@zentrack_last_crash');
          const lastCrash = lastCrashStr ? parseInt(lastCrashStr, 10) : 0;
          
          if (Date.now() - lastCrash > 10000) {
            await AsyncStorage.setItem('@zentrack_last_crash', String(Date.now()));
            
            // Failsafe: if Updates.reloadAsync() hangs (e.g. in Expo Go / Dev Clients),
            // we timeout after 1.5s and fallback to the recovery card!
            await Promise.race([
              Updates.reloadAsync(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
            ]);
            return;
          }
        } catch { }
        
        // If we reach here, it means we are in a crash loop OR reloadAsync failed/hung.
        // Revert to showing the recovery card.
        this.setState({ isRestarting: false });
      }, 0);
    }
  }

  // GöÇGöÇ Recovery GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  handleRetry = () => {
    this.setState(prev => ({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: prev.retryCount + 1,
    }));
  };

  // GöÇGöÇ Render GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  render() {
    if (!this.state.hasError) {
      // Key changes on retry GÇö forces a full unmount/remount of children,
      // which clears any stale state that caused the original crash.
      return (
        <React.Fragment key={`eb-${this.state.retryCount}`}>
          {this.props.children}
        </React.Fragment>
      );
    }

    if (this.state.isRestarting) {
      // Show nothing but a clean background while the app reboots seamlessly
      return <View style={styles.root} />;
    }

    const { screenName } = this.props;
    const { error, errorInfo, retryCount } = this.state;
    const screenLabel = screenName ?? 'This screen';

    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="warning-outline" size={38} color={RED} />
          </View>

          {/* Title */}
          <Text style={styles.title}>Something went wrong</Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {screenLabel} ran into an unexpected error.{'\n'}
            Your data is safe. Tap below to recover.
          </Text>

          {/* Dev-only error detail */}
          {__DEV__ && error && (
            <View style={styles.devCard}>
              <Text style={styles.devLabel}>DEV GÇö Error detail</Text>
              <Text style={styles.devError} selectable>
                {error.message}
              </Text>
              {errorInfo?.componentStack && (
                <Text style={styles.devStack} selectable numberOfLines={8}>
                  {errorInfo.componentStack.trim()}
                </Text>
              )}
            </View>
          )}

          {/* Retry count hint */}
          {retryCount > 0 && (
            <Text style={styles.retryHint}>
              Retry attempt {retryCount}
            </Text>
          )}

          {/* Primary CTA GÇö retry */}
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={this.handleRetry}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={16} color={BG} style={{ marginRight: 6 }} />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>

          {/* If retrying hasn't worked, suggest restarting */}
          {retryCount >= 2 && (
            <Text style={styles.restartHint}>
              Still broken? Force-close and reopen the app.
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }
}

// GöÇGöÇGöÇ Styles GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
// All colours are hardcoded (never from ThemeContext) GÇö see comment above.
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,    // #000000 GÇö matches windowBackground. NO grey. EVER.
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,105,97,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,105,97,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: WHITE,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  devCard: {
    width: '100%',
    backgroundColor: 'rgba(255,105,97,0.07)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,105,97,0.20)',
    padding: 14,
    marginBottom: 20,
    gap: 6,
  },
  devLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: RED,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  devError: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: RED,
    lineHeight: 18,
  },
  devStack: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: MUTED,
    lineHeight: 16,
    marginTop: 4,
  },
  retryHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    marginBottom: 12,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: BG,
  },
  restartHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});
