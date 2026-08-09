import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn, FadeOut, withRepeat, withTiming, withSequence, withDelay,
  useSharedValue, useAnimatedStyle, Easing, cancelAnimation
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { startVADRecording, stopAndGetBase64, cancelVoiceRecording, VoiceState } from '../../services/voiceEngine';
import { extractTaskFromAudio } from '../../services/geminiProxy';
import { COLORS, FONT_FAMILY } from '../../theme/tokens';

interface VoiceDictationOverlayProps {
  visible: boolean;
  onClose: () => void;
  onTasksExtracted: (tasks: any[]) => void;
}

// Sub-component: Soundwave Equalizer Bars for voice visualizer
function SoundWaveBars({ active }: { active: boolean }) {
  const bar1 = useSharedValue(10);
  const bar2 = useSharedValue(18);
  const bar3 = useSharedValue(28);
  const bar4 = useSharedValue(42);
  const bar5 = useSharedValue(30);
  const bar6 = useSharedValue(16);
  const bar7 = useSharedValue(10);

  useEffect(() => {
    if (active) {
      bar1.value = withRepeat(withSequence(withTiming(26, { duration: 320 }), withTiming(8, { duration: 320 })), -1, true);
      bar2.value = withDelay(80, withRepeat(withSequence(withTiming(38, { duration: 380 }), withTiming(12, { duration: 380 })), -1, true));
      bar3.value = withDelay(160, withRepeat(withSequence(withTiming(48, { duration: 300 }), withTiming(16, { duration: 300 })), -1, true));
      bar4.value = withDelay(240, withRepeat(withSequence(withTiming(56, { duration: 350 }), withTiming(20, { duration: 350 })), -1, true));
      bar5.value = withDelay(120, withRepeat(withSequence(withTiming(42, { duration: 400 }), withTiming(14, { duration: 400 })), -1, true));
      bar6.value = withDelay(180, withRepeat(withSequence(withTiming(32, { duration: 340 }), withTiming(10, { duration: 340 })), -1, true));
      bar7.value = withDelay(60, withRepeat(withSequence(withTiming(24, { duration: 360 }), withTiming(6, { duration: 360 })), -1, true));
    } else {
      cancelAnimation(bar1);
      cancelAnimation(bar2);
      cancelAnimation(bar3);
      cancelAnimation(bar4);
      cancelAnimation(bar5);
      cancelAnimation(bar6);
      cancelAnimation(bar7);
      bar1.value = withTiming(8);
      bar2.value = withTiming(14);
      bar3.value = withTiming(22);
      bar4.value = withTiming(30);
      bar5.value = withTiming(22);
      bar6.value = withTiming(14);
      bar7.value = withTiming(8);
    }
  }, [active]);

  const style1 = useAnimatedStyle(() => ({ height: bar1.value }));
  const style2 = useAnimatedStyle(() => ({ height: bar2.value }));
  const style3 = useAnimatedStyle(() => ({ height: bar3.value }));
  const style4 = useAnimatedStyle(() => ({ height: bar4.value }));
  const style5 = useAnimatedStyle(() => ({ height: bar5.value }));
  const style6 = useAnimatedStyle(() => ({ height: bar6.value }));
  const style7 = useAnimatedStyle(() => ({ height: bar7.value }));

  return (
    <View style={visualizerStyles.waveContainer}>
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF6961' }, style1]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF453A' }, style2]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#A599FF' }, style3]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF453A' }, style4]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#A599FF' }, style5]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF453A' }, style6]} />
      <Animated.View style={[visualizerStyles.bar, { backgroundColor: '#FF6961' }, style7]} />
    </View>
  );
}

const visualizerStyles = StyleSheet.create({
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 60,
    marginTop: 16,
  },
  bar: {
    width: 5,
    borderRadius: 4,
  },
});

export default function VoiceDictationOverlay({ visible, onClose, onTasksExtracted }: VoiceDictationOverlayProps) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<VoiceState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    if (visible) {
      glowScale.value = withRepeat(
        withTiming(1.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      handleStartRecording();
    } else {
      cancelVoiceRecording();
      setState('idle');
      setErrorMsg('');
    }
  }, [visible]);

  const handleStartRecording = async () => {
    setErrorMsg('');
    await startVADRecording(
      {
        onStateChange: setState,
        onTranscript: () => {}, 
        onError: (err) => setErrorMsg(err),
      },
      () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    );
  };

  const handleStopAndProcess = async () => {
    setState('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const base64 = await stopAndGetBase64();
    if (!base64) {
      setState('idle');
      onClose();
      return;
    }

    try {
      const tasks = await extractTaskFromAudio(base64);
      if (tasks && tasks.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onTasksExtracted(tasks);
        onClose();
      } else {
        setErrorMsg("Couldn't extract any tasks. Please try again.");
        setState('idle');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to process audio.");
      setState('idle');
    }
  };

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: state === 'recording' ? glowOpacity.value : 0.2,
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Ambient Dark Gradient */}
        <LinearGradient
          colors={['#18090C', '#0B0B0E', '#050507']}
          style={StyleSheet.absoluteFillObject}
          locations={[0, 0.4, 1]}
        />

        {/* Top Header Bar */}
        <View style={[styles.topHeader, { paddingTop: insets.top + 12 }]}>
          <View style={styles.badgePill}>
            <Ionicons name="sparkles" size={13} color="#FF6961" />
            <Text style={styles.badgePillText}>ZENTRACK VOICE DICTATION</Text>
          </View>
          
          <TouchableOpacity 
            style={styles.closeBtn} 
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.container}>
          {/* Headline */}
          <View style={styles.titleSection}>
            <Text style={styles.mainTitle}>Talk to create tasks</Text>
            <Text style={styles.subTitle}>
              ZenTrack extracts deadlines, times, and recurrence rules instantly.
            </Text>
          </View>

          {/* Example / Status Card */}
          <View style={styles.cardContainer}>
            <LinearGradient
              colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
              style={styles.glassCard}
            >
              <View style={styles.cardHeaderRow}>
                <Ionicons name="bulb-outline" size={16} color="#A599FF" />
                <Text style={styles.cardHeaderText}>TRY SAYING</Text>
              </View>

              {errorMsg ? (
                <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.errorText}>
                  {errorMsg}
                </Animated.Text>
              ) : (
                <Animated.View entering={FadeIn} exiting={FadeOut}>
                  <Text style={styles.exampleText}>
                    "Follow up on my job <Text style={styles.highlightText}>every day</Text> at <Text style={styles.highlightText}>12:30 AM</Text>"
                  </Text>
                </Animated.View>
              )}
            </LinearGradient>
          </View>

          {/* Sleek Voice Waveform & Mic Container */}
          <View style={styles.orbArea}>
            {state === 'processing' ? (
              <Animated.View entering={FadeIn} style={styles.processingBox}>
                <ActivityIndicator size="large" color="#FF6961" />
                <Text style={styles.statusLabel}>ZenTrack is structuring your task...</Text>
              </Animated.View>
            ) : (
              <View style={styles.listeningContainer}>
                {/* Vibrant Red Mic Orb Button */}
                <LinearGradient
                  colors={['#FF453A', '#B30006']}
                  style={styles.micOrb}
                >
                  <Ionicons name="mic" size={38} color="#FFFFFF" />
                </LinearGradient>

                {/* Animated Equalizer Waveform */}
                <SoundWaveBars active={state === 'recording'} />

                {/* Live Status Indicator */}
                <View style={styles.statusBadge}>
                  <View style={[styles.liveDot, { backgroundColor: state === 'recording' ? '#FF453A' : '#8E8E93' }]} />
                  <Text style={styles.statusText}>
                    {state === 'recording' ? 'Listening...' : 'Tap Mic to Start'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Action Footer */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
            {state === 'recording' && (
              <TouchableOpacity 
                style={styles.doneBtn} 
                onPress={handleStopAndProcess}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#FF453A', '#D70015']}
                  style={styles.doneBtnGradient}
                >
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                  <Text style={styles.doneBtnText}>Done Dictating</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {state === 'idle' && (
              <TouchableOpacity 
                style={styles.retryPill} 
                onPress={handleStartRecording}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
                <Text style={styles.retryPillText}>Restart Dictation</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.25)',
  },
  badgePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#FF6961',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  titleSection: {
    marginTop: 12,
    alignItems: 'center',
  },
  mainTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  subTitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 20,
  },
  cardContainer: {
    marginTop: 20,
  },
  glassCard: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  cardHeaderText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#A599FF',
    letterSpacing: 1,
  },
  exampleText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 17,
    color: '#FFFFFF',
    lineHeight: 26,
  },
  highlightText: {
    color: '#FF6961',
    fontWeight: '700',
  },
  errorText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    color: COLORS.error,
  },
  orbArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  processingBox: {
    alignItems: 'center',
    gap: 16,
  },
  statusLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
  listeningContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  doneBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  doneBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  retryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  retryPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});

