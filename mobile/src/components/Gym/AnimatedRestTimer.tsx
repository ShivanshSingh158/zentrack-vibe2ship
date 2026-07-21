import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import Reanimated, { LinearTransition, FadeIn, FadeOut, useSharedValue, useFrameCallback, runOnJS, useAnimatedProps } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";

const AnimatedTextInput = Reanimated.createAnimatedComponent(TextInput);

interface AnimatedRestTimerProps {
  startTime: number;
  durationSecs: number;
  onAdd: () => void;
  onSubtract: () => void;
  onSkip: () => void;
}

export default function AnimatedRestTimer({ 
  startTime,
  durationSecs,
  onAdd, 
  onSubtract, 
  onSkip 
}: AnimatedRestTimerProps) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [isExpanded, setIsExpanded] = useState(false);
  const remaining = useSharedValue(durationSecs);
  const hasFinished = useSharedValue(false);
  
  const toggleExpand = () => {
    hapticLight();
    setIsExpanded(!isExpanded);
  };

  const frameCallback = useFrameCallback((frameInfo) => {
    if (hasFinished.value) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const rem = Math.max(0, durationSecs - elapsed);
    if (rem !== remaining.value) {
      remaining.value = rem;
    }
    if (rem <= 0 && !hasFinished.value) {
      hasFinished.value = true;
      frameCallback.setActive(false); // Fix memory leak: pause callback
      runOnJS(onSkip)();
    }
  });

  const animatedProps = useAnimatedProps(() => {
    const m = Math.floor(remaining.value / 60);
    const s = remaining.value % 60;
    const text = `${m}:${s.toString().padStart(2, '0')}`;
    return {
      text,
      value: text,
    };
  });

  return (
    <Reanimated.View style={styles.wrapper} entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
      <Reanimated.View 
        layout={LinearTransition.springify().damping(20).stiffness(200)}
        style={[styles.container, isExpanded ? styles.expandedContainer : styles.collapsedContainer]}
      >
        
        {!isExpanded ? (
          <TouchableOpacity style={styles.collapsedPill} onPress={toggleExpand} activeOpacity={0.8}>
            <Ionicons name="timer-outline" size={16} color="#a599ff" style={{ marginRight: 6 }} />
            <AnimatedTextInput 
              editable={false} 
              animatedProps={animatedProps} 
              style={styles.collapsedTime} 
            />
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
                <Ionicons name="remove-circle-outline" size={24} color={colors.textMuted} />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.centerPill} onPress={toggleExpand} activeOpacity={0.8}>
                <Text style={styles.label}>RESTING</Text>
                <AnimatedTextInput 
                  editable={false} 
                  animatedProps={animatedProps} 
                  style={styles.time} 
                />
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => { hapticLight(); onAdd(); }} 
                style={styles.btn} 
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              >
                <Ionicons name="add-circle-outline" size={24} color={colors.textPrimary} />
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

const makeStyles = (colors: any) => StyleSheet.create({
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
      },
      collapsedContainer: {
        borderRadius: 30,
      },
      expandedContainer: {
        borderRadius: 24,
        width: '90%',
        minWidth: 320,
      },
      collapsedPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
      },
      collapsedTime: {
        fontFamily: 'Courier',
        fontSize: 16,
        color: '#a599ff',
        fontWeight: 'bold',
        padding: 0,
        margin: 0,
      },
      expandedContent: {
        padding: 16,
        paddingTop: 12,
      },
      dragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignSelf: 'center',
        marginBottom: 16,
      },
      pillLayout: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      btn: {
        padding: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
      },
      centerPill: {
        alignItems: 'center',
        paddingHorizontal: 16,
      },
      label: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#a599ff',
        letterSpacing: 1,
        marginBottom: 4,
      },
      time: {
        fontFamily: 'Courier',
        fontSize: 32,
        color: colors.textPrimary,
        fontWeight: 'bold',
        padding: 0,
        margin: 0,
      },
      divider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 8,
      },
      skipBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(165,153,255,0.15)',
      },
      skipText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#a599ff',
      }
    });
