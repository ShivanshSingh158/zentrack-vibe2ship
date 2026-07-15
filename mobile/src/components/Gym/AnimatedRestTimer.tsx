import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Animated } from 'react-native';
import Reanimated, { LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme/tokens';
import { hapticLight, hapticMedium } from '../../utils/haptics';

interface AnimatedRestTimerProps {
  remainingSeconds: number;
  initialSeconds: number;
  onAdd: () => void;
  onSubtract: () => void;
  onSkip: () => void;
}

export default function AnimatedRestTimer({ 
  remainingSeconds, 
  onAdd, 
  onSubtract, 
  onSkip 
}: AnimatedRestTimerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const toggleExpand = () => {
    hapticLight();
    setIsExpanded(!isExpanded);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Reanimated.View style={styles.wrapper} entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
      <Reanimated.View 
        layout={LinearTransition.springify().damping(20).stiffness(200)}
        style={[styles.container, isExpanded ? styles.expandedContainer : styles.collapsedContainer]}
      >
        
        {!isExpanded ? (
          <TouchableOpacity style={styles.collapsedPill} onPress={toggleExpand} activeOpacity={0.8}>
            <Ionicons name="timer-outline" size={16} color="#a599ff" style={{ marginRight: 6 }} />
            <Text style={styles.collapsedTime}>{formatTime(remainingSeconds)}</Text>
          </TouchableOpacity>
        ) : (
          <Reanimated.View entering={FadeIn.duration(200).delay(100)} exiting={FadeOut.duration(100)} style={styles.expandedContent}>
            <View style={styles.dragHandle} />
            
            <View style={styles.pillLayout}>
              <TouchableOpacity 
                onPress={() => { hapticLight(); onSubtract(); }} 
                style={styles.btn} 
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              >
                <Ionicons name="remove-circle-outline" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.centerPill} onPress={toggleExpand} activeOpacity={0.8}>
                <Text style={styles.label}>RESTING</Text>
                <Text style={styles.time}>{formatTime(remainingSeconds)}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => { hapticLight(); onAdd(); }} 
                style={styles.btn} 
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              >
                <Ionicons name="add-circle-outline" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity 
                style={styles.skipBtn} 
                onPress={() => { hapticMedium(); onSkip(); }} 
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </Reanimated.View>
        )}
      </Reanimated.View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    zIndex: 9999,
  },
  container: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedContainer: {
    borderRadius: 30,
    width: 100,
    height: 40,
  },
  expandedContainer: {
    borderRadius: 30,
    minWidth: 220,
  },
  collapsedPill: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedTime: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  expandedContent: {
    width: '100%',
    alignItems: 'center',
  },
  dragHandle: {
    width: 32,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 8,
    marginBottom: -4,
  },
  pillLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  centerPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 1,
    color: '#a599ff',
    marginBottom: 2,
  },
  time: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: COLORS.textPrimary,
  },
  btn: {
    padding: 4,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 8,
  },
  skipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
  },
  skipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: COLORS.textMuted,
  }
});
