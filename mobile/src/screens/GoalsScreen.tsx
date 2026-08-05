/**
 * GoalsScreen — ZenTrack Mobile
 *
 * Psychological Frameworks Implemented:
 * - SMART Goals + CBT (4-step Wizard)
 * - Implementation Intentions (First step / action planning)
 * - Circular Completion Bias (Circular progress arc)
 * - OKR Key Results (Sub-tasks that roll up to main progress)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView
} from 'react-native';
import BottomSheet from '../components/ui/BottomSheet';
import Reanimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';

import { useMobileData, Goal, GoalKeyResult } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { animateFadeInUp, triggerLayoutAnimation } from '../theme/animations';
import { db } from '../services/firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { awardXP } from '../services/xpSystem';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";
import { handleSyncError } from '../utils/errorUtils';


const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function getStatusColors(colors: any): Record<string, string> {
  return {
    active: colors.accentPrimary,
    completed: colors.accentGreen,
    paused: colors.accentAmber,
    cancelled: colors.error,
  };
}

// ─── Circular Progress Arc Component ──────────────────────────────────────────

function CircularArc({ progress, size = 60, strokeWidth = 6, color }: {
  progress: number; size?: number; strokeWidth?: number; color?: string;
}) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
    const resolvedColor = color ?? colors.accentPrimary;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const fillPct = Math.min(Math.max(progress, 0), 100);
  
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: fillPct,
      tension: 40,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [fillPct]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={colors.surface2} strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={resolvedColor} strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          originX={size / 2} originY={size / 2}
          rotation="-90"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary }}>
          {Math.round(fillPct)}%
        </Text>
      </View>
    </View>
  );
}

// ─── Goal Card Component ──────────────────────────────────────────────────────

function GoalCard({ item, onComplete, onDelete, onUpdateKR }: {
  item: Goal;
  onComplete: (id: string, currentStatus: string) => void;
  onDelete: (id: string, title: string) => void;
  onUpdateKR: (goalId: string, krs: GoalKeyResult[]) => void;
}) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [expanded, setExpanded] = useState(false);
  const [newKRTitle, setNewKRTitle] = useState('');
  const isCompleted = item.status === 'completed';
  const statusColor = getStatusColors(colors)[item.status] || colors.accentPrimary;

  // Calculate actual progress based on KRs if they exist, otherwise fallback to item.progress
  const calcProgress = () => {
    if (isCompleted) return 100;
    if (item.keyResults && item.keyResults.length > 0) {
      const done = item.keyResults.filter(k => k.completed).length;
      return Math.round((done / item.keyResults.length) * 100);
    }
    return item.progress || 0;
  };

  const currentProgress = calcProgress();

  const toggleKR = (krId: string) => {
    if (!item.keyResults) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = item.keyResults.map(kr => 
      kr.id === krId ? { ...kr, completed: !kr.completed } : kr
    );
    triggerLayoutAnimation();
    onUpdateKR(item.id, updated);
  };

  const addKR = () => {
    if (!newKRTitle.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updated = [...(item.keyResults || []), { id: Date.now().toString(), title: newKRTitle.trim(), completed: false }];
    setNewKRTitle('');
    triggerLayoutAnimation();
    onUpdateKR(item.id, updated);
  };

  return (
    <View style={[styles.card, isCompleted && styles.cardDone]}>
      <TouchableOpacity 
        style={styles.cardHeaderRow} 
        onPress={() => { triggerLayoutAnimation(); setExpanded(!expanded); }}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeaderLeft}>
          <CircularArc progress={currentProgress} size={50} color={statusColor} />
          <View style={{ flex: 1, marginLeft: SPACE.md }}>
            <Text style={[styles.cardTitle, isCompleted && styles.cardTitleDone]}>{item.title}</Text>
            {item.deadline && (
              <Text style={styles.deadlineText}>Target: {item.deadline}</Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.menuBtn} onPress={() => onDelete(item.id, item.title)}>
           <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.expandedContent}>
          {item.description ? (
            <Text style={styles.goalDesc}>{item.description}</Text>
          ) : null}

          {/* Key Results */}
          <View style={styles.krSection}>
            <Text style={styles.krHeader}>KEY RESULTS</Text>
            {item.keyResults && item.keyResults.map(kr => (
              <TouchableOpacity 
                key={kr.id} 
                style={styles.krRow}
                onPress={() => toggleKR(kr.id)}
              >
                <View style={[styles.krCheck, kr.completed && { backgroundColor: statusColor, borderColor: statusColor }]}>
                  {kr.completed && <Ionicons name="checkmark" size={12} color={colors.background} />}
                </View>
                <Text style={[styles.krText, kr.completed && styles.krTextDone]}>{kr.title}</Text>
              </TouchableOpacity>
            ))}
            
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACE.sm }}>
               <TextInput
                 style={{ flex: 1, backgroundColor: colors.surface2, color: colors.textPrimary, padding: SPACE.sm, borderRadius: RADIUS.md, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}
                 placeholder="Add key result..."
                 placeholderTextColor={colors.textMuted}
                 value={newKRTitle}
                 onChangeText={setNewKRTitle}
                 onSubmitEditing={addKR}
               />
               <TouchableOpacity onPress={addKR} style={{ padding: SPACE.sm, marginLeft: SPACE.xs }}>
                 <Ionicons name="add-circle" size={24} color={newKRTitle.trim() ? colors.accentPrimary : colors.textMuted} />
               </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.completeGoalBtn, isCompleted && { backgroundColor: colors.surface2, borderColor: colors.border }]}
            onPress={() => onComplete(item.id, item.status)}
          >
            <Ionicons name={isCompleted ? "refresh-outline" : "trophy-outline"} size={16} color={isCompleted ? colors.textMuted : colors.background} />
            <Text style={[styles.completeGoalText, isCompleted && { color: colors.textMuted }]}>
              {isCompleted ? 'Mark as Active' : 'Complete Goal'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GoalsScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { goals, user } = useMobileData();
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-10)).current;

  // Wizard State
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Goal Data
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const [showPicker, setShowPicker] = useState(false);
  const [firstStep, setFirstStep] = useState('');
  const [metric, setMetric] = useState('');
  
  // Slide animation for wizard
  const slideAnim = useSharedValue(0);
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideAnim.value }]
  }));

  useEffect(() => { animateFadeInUp(headerFade, headerSlide, 0).start(); }, []);

  const openWizard = () => {
    setTitle('');
    setDeadline(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    setFirstStep('');
    setMetric('');
    setWizardStep(1);
    setShowWizard(true);
  };

  const nextStep = () => {
    if (wizardStep < 4) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      slideAnim.value = withSequence(
        withTiming(-50, { duration: 150 }),
        withTiming(50, { duration: 0 }),
        withTiming(0, { duration: 250 })
      );
      setWizardStep(s => s + 1);
    } else {
      handleSaveGoal();
    }
  };

  const handleSaveGoal = () => {
    if (!title.trim() || !user) return;
    
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    const keyResults: GoalKeyResult[] = [];
    if (firstStep.trim()) {
      keyResults.push({ id: 'kr1_' + Date.now(), title: firstStep.trim(), completed: false });
    }
    if (metric.trim()) {
      keyResults.push({ id: 'kr2_' + Date.now(), title: `Measure: ${metric.trim()}`, completed: false });
    }
    keyResults.push({ id: 'kr3_' + Date.now(), title: `Complete final milestone`, completed: false });

    setTimeout(() => {
      addDoc(collection(db, COLLECTION.GOALS), {
        userId: user.uid,
        title: title.trim(),
        status: 'active',
        progress: 0,
        deadline: deadline.toISOString().split('T')[0],
        firstStep: firstStep.trim(),
        successMetric: metric.trim(),
        keyResults,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }).catch(handleSyncError);
    }, 150);

    setShowWizard(false);
  };

  const handleComplete = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'active' : 'completed';
    if (newStatus === 'completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await awardXP('GOAL_MILESTONE');
    }
    await updateDoc(doc(db, COLLECTION.GOALS, id), {
      status: newStatus,
      progress: newStatus === 'completed' ? 100 : 0,
      updatedAt: Date.now(),
    }).catch(handleSyncError);
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete Goal', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteDoc(doc(db, COLLECTION.GOALS, id)).catch(handleSyncError),
      },
    ]);
  };

  const handleUpdateKR = async (goalId: string, krs: GoalKeyResult[]) => {
    const done = krs.filter(k => k.completed).length;
    const progress = Math.round((done / krs.length) * 100);
    
    if (progress === 100) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    await updateDoc(doc(db, COLLECTION.GOALS, goalId), {
      keyResults: krs,
      progress,
      updatedAt: Date.now(),
    }).catch(handleSyncError);
  };

  const activeGoals = goals.filter(g => g.status !== 'completed');
  const completedGoals = goals.filter(g => g.status === 'completed');

  // ─── Render Wizard Steps ───
  const renderWizardStep = () => {
    switch (wizardStep) {
      case 1:
        return (
          <View style={styles.wizardContent}>
            <Text style={styles.wizardLabel}>STEP 1 OF 4</Text>
            <Text style={styles.wizardTitle}>What does winning look like?</Text>
            <Text style={styles.wizardSub}>Focus on the outcome, not the process.</Text>
            <TextInput
              style={styles.wizardInput}
              placeholder="e.g., Run a 5k without stopping"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              autoFocus
              multiline
            />
          </View>
        );
      case 2:
        const weeksOut = Math.round((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7));
        return (
          <View style={styles.wizardContent}>
            <Text style={styles.wizardLabel}>STEP 2 OF 4</Text>
            <Text style={styles.wizardTitle}>By when?</Text>
            <Text style={styles.wizardSub}>
              {weeksOut > 0 ? `That is exactly ${weeksOut} weeks from now.` : "Setting a date makes it real."}
            </Text>
            
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowPicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={colors.accentPrimary} />
              <Text style={styles.datePickerText}>{deadline.toISOString().split('T')[0]}</Text>
            </TouchableOpacity>

            {showPicker && (
              <DateTimePicker
                value={deadline}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setShowPicker(Platform.OS === 'ios');
                  if (selectedDate) setDeadline(selectedDate);
                }}
              />
            )}
          </View>
        );
      case 3:
        return (
          <View style={styles.wizardContent}>
            <Text style={styles.wizardLabel}>STEP 3 OF 4</Text>
            <Text style={styles.wizardTitle}>What's the first step you could take in 5 minutes?</Text>
            <Text style={styles.wizardSub}>Break the friction of starting.</Text>
            <TextInput
              style={styles.wizardInput}
              placeholder="e.g., Buy running shoes online"
              placeholderTextColor={colors.textMuted}
              value={firstStep}
              onChangeText={setFirstStep}
              autoFocus
              multiline
            />
          </View>
        );
      case 4:
        return (
          <View style={styles.wizardContent}>
            <Text style={styles.wizardLabel}>STEP 4 OF 4</Text>
            <Text style={styles.wizardTitle}>How will you know you succeeded?</Text>
            <Text style={styles.wizardSub}>What is the exact metric?</Text>
            <TextInput
              style={styles.wizardInput}
              placeholder="e.g., Timing app says 30 mins"
              placeholderTextColor={colors.textMuted}
              value={metric}
              onChangeText={setMetric}
              autoFocus
              multiline
            />
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <View>
          <Text style={styles.title}>Goals</Text>
          <Text style={styles.subtitle}>{activeGoals.length} active · {completedGoals.length} completed</Text>
        </View>
        <TouchableOpacity style={styles.fab} onPress={openWizard}>
          <Ionicons name="add" size={22} color="#080510" />
        </TouchableOpacity>
      </Animated.View>

      <FlashList
        data={goals}
        keyExtractor={item => item.id}

        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }: any) => (
          <GoalCard 
            item={item} 
            onComplete={handleComplete} 
            onDelete={handleDelete} 
            onUpdateKR={handleUpdateKR}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{fontSize: 48, marginBottom: 10}}>⛰️</Text>
            <Text style={styles.emptyText}>No goals yet.{'\n'}Define your summit.</Text>
          </View>
        }
      />

      {/* SMART Goal Wizard Modal */}
      <BottomSheet visible={showWizard} onClose={() => setShowWizard(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalSheet}>
            
            <View style={styles.wizardTop}>
              <TouchableOpacity onPress={() => setShowWizard(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.wizardProgress}>
                {[1,2,3,4].map(s => (
                  <View key={s} style={[styles.wizardDot, wizardStep >= s && { backgroundColor: colors.accentPrimary }]} />
                ))}
              </View>
            </View>

            <Reanimated.View style={[{ flex: 1 }, slideStyle]}>
              {renderWizardStep()}
            </Reanimated.View>

            <TouchableOpacity
              style={[styles.wizardNextBtn, (wizardStep === 1 && !title.trim()) && { opacity: 0.4 }]}
              onPress={nextStep}
              disabled={wizardStep === 1 && !title.trim()}
            >
              <Text style={styles.wizardNextText}>{wizardStep === 4 ? 'Lock In Goal ⚡' : 'Continue →'}</Text>
            </TouchableOpacity>

          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SPACE.xl,
        paddingBottom: SPACE.lg,
      },
      title: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xxl, color: colors.textPrimary },
      subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginTop: 4 },
      fab: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: colors.accentPrimary, 
        alignItems: 'center', justifyContent: 'center',
        ...SHADOW.accent(),
      },
      list: { padding: SPACE.xl, paddingTop: SPACE.xs, paddingBottom: 120 },
      
      // Card
      card: {
        backgroundColor: colors.surface,
        borderRadius: RADIUS.xl, 
        marginBottom: SPACE.md,
        borderWidth: 1, borderColor: colors.borderHover,
        overflow: 'hidden',
      },
      cardDone: { opacity: 0.6, borderColor: colors.border },
      cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SPACE.lg,
      },
      cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
      },
      cardTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.lg, color: colors.textPrimary, marginBottom: 2 },
      cardTitleDone: { textDecorationLine: 'line-through', color: colors.textMuted },
      deadlineText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs, color: colors.textMuted },
      menuBtn: { padding: SPACE.sm },
      
      // Expanded Content
      expandedContent: {
        padding: SPACE.lg,
        paddingTop: 0,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface2 + '40',
      },
      goalDesc: {
        fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary,
        lineHeight: 20, marginTop: SPACE.md, marginBottom: SPACE.md,
      },
      
      // Key Results
      krSection: { marginTop: SPACE.md },
      krHeader: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textMuted, letterSpacing: 1, marginBottom: SPACE.sm },
      krRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.sm },
      krCheck: {
        width: 20, height: 20, borderRadius: 10,
        borderWidth: 1.5, borderColor: colors.borderHover,
        alignItems: 'center', justifyContent: 'center',
      },
      krText: { flex: 1, fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: colors.textPrimary },
      krTextDone: { textDecorationLine: 'line-through', color: colors.textMuted },
      
      completeGoalBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
        backgroundColor: colors.accentPrimary,
        paddingVertical: SPACE.md, borderRadius: RADIUS.lg,
        marginTop: SPACE.xl,
      },
      completeGoalText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.background },

      // Empty State
      emptyState: { alignItems: 'center', marginTop: 100, gap: SPACE.md },
      emptyText: {
        fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md,
        color: colors.textMuted, textAlign: 'center', lineHeight: 22,
      },

      // Wizard Modal
      modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.85)' },
      modalSheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32,
        height: '75%', padding: SPACE.xl,
        borderTopWidth: 1, borderTopColor: colors.borderHover,
      },
      wizardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xl },
      wizardProgress: { flexDirection: 'row', gap: SPACE.sm },
      wizardDot: { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.surface2 },
      
      wizardContent: { flex: 1, paddingVertical: SPACE.md },
      wizardLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.accentPrimary, letterSpacing: 2, marginBottom: SPACE.xs },
      wizardTitle: { fontFamily: FONT_FAMILY.title, fontSize: 32, color: colors.textPrimary, lineHeight: 38, marginBottom: SPACE.sm },
      wizardSub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: colors.textMuted, marginBottom: SPACE.xl },
      
      wizardInput: {
        fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.lg, color: colors.textPrimary,
        borderBottomWidth: 2, borderBottomColor: colors.borderHover,
        paddingVertical: SPACE.sm,
      },
      
      datePickerBtn: {
        flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
        backgroundColor: colors.surface2, padding: SPACE.lg, borderRadius: RADIUS.lg,
        alignSelf: 'flex-start',
      },
      datePickerText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: colors.textPrimary },

      wizardNextBtn: {
        backgroundColor: colors.accentPrimary, borderRadius: RADIUS.full,
        paddingVertical: 18, alignItems: 'center',
        marginBottom: SPACE.xl, ...SHADOW.accent(),
      },
      wizardNextText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.background },
    });
