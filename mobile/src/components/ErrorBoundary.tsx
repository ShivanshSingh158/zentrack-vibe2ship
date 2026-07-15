/**
 * ErrorBoundary — ZenTrack Mobile
 *
 * Wraps individual screens so a JS crash only kills that screen,
 * not the entire app. Shows a tasteful "Something went wrong" card
 * with a retry button.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
  screenName?: string;
}
interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] Caught in ${this.props.screenName || 'unknown screen'}:`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="alert-circle-outline" size={36} color="#ff6961" />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            {this.props.screenName ? `The ${this.props.screenName} screen` : 'This screen'} encountered an unexpected error.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorDetail} numberOfLines={4}>
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={16} color="#000000" style={{ marginRight: 6 }} />
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#141416',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    width: '100%',
  },
  iconCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: 'rgba(255,105,97,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#8e8e93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  errorDetail: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#ff6961',
    backgroundColor: 'rgba(255,105,97,0.08)',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginBottom: 16,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#a599ff',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 4,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#000000',
  },
});
