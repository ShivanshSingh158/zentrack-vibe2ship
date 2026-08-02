/**
 * PlacementHubScreen.tsx — ZenTrack Minimalist Placement Hub
 *
 * A unified, strictly block-based dashboard.
 * Instead of tabs, this automatically parses the current active block
 * and presents ONLY the DSA, Dev, and Project tasks relevant to today.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { formatDateObjShort } from '../utils/dateUtils';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../theme/tokens';
import { usePlacementData, PlacementConfig, CustomSkill, ProjectMilestone, RoadmapPhase } from '../hooks/usePlacementData';
import { feedback } from '../utils/haptics';
import DSALogger from '../components/PlacementHub/DSALogger';
import PanicModal from '../components/PlacementHub/PanicModal';
import PatternVaultModal from '../components/PlacementHub/PatternVaultModal';
import SundayReflectionModal from '../components/PlacementHub/SundayReflectionModal';
import { fetchRecentSubmissions } from '../services/leetcode';
import { navigationRef } from '../navigation/AppNavigator';

// ─── Configuration Sheet ────────────────────────────────────────────────────────

function ConfigSheet({ visible, onClose, config, onSave, onReset }: {
  visible: boolean;
  onClose: () => void;
  config: PlacementConfig;
  onSave: (newConfig: Partial<PlacementConfig>) => void;
  onReset?: () => void;
}) {
  const { colors } = useTheme();
  const [startDate, setStartDate] = useState(config.startDate);
  
  const handleSave = () => {
    onSave({ startDate });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrapper}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Hub Configuration</Text>
          
          <View style={{ gap: SPACE.lg }}>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ROADMAP START DATE</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface2 }]}
                value={startDate} onChangeText={setStartDate}
                placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted}
              />
              <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs }}>
                <TouchableOpacity 
                  onPress={() => {
                    const d = new Date(startDate || '2026-07-22');
                    d.setDate(d.getDate() - 1);
                    setStartDate(d.toISOString().slice(0, 10));
                  }}
                  style={{ backgroundColor: colors.surface2, borderRadius: RADIUS.md, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textSecondary }}>-1 Day</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    const d = new Date(startDate || '2026-07-22');
                    d.setDate(d.getDate() + 1);
                    setStartDate(d.toISOString().slice(0, 10));
                  }}
                  style={{ backgroundColor: colors.surface2, borderRadius: RADIUS.md, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.accentPrimary }}>+1 Day Shift</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ marginTop: SPACE.lg, gap: SPACE.md }}>
              <TouchableOpacity onPress={handleSave} style={[styles.saveBtn, { backgroundColor: colors.accentPrimary }]}>
                <Text style={{ color: '#fff', fontFamily: FONT_FAMILY.bold }}>Save Configuration</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onReset} style={[styles.saveBtn, { backgroundColor: 'transparent', borderColor: '#ef4444', borderWidth: 1 }]}>
                <Text style={{ color: '#ef4444', fontFamily: FONT_FAMILY.bold }}>Reset to Roadmap Defaults</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Minimalist Task Checkbox ────────────────────────────────────────────────

function TaskCheckbox({ label, done, onToggle, color }: { label: string; done: boolean; onToggle: () => void; color: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.taskRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.checkbox, done && { backgroundColor: color, borderColor: color }, !done && { borderColor: colors.textMuted }]}>
        {done && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={[styles.taskLabel, { color: done ? colors.textMuted : colors.textPrimary, textDecorationLine: done ? 'line-through' : 'none' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Projects Modal ─────────────────────────────────────────────────────────

function ProjectsModal({ visible, onClose, milestones, toggleMilestone }: { 
  visible: boolean; onClose: () => void; milestones: any[]; toggleMilestone: (pId: string, tId: string, done: boolean) => void; 
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View style={[styles.modalWrapper, { backgroundColor: colors.background, marginTop: 100, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, flex: 1 }]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Project Pipeline</Text>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: SPACE.xl }}>
          {milestones.map(proj => (
            <View key={proj.id} style={[styles.skillGroup, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: SPACE.lg }]}>
              <Text style={[styles.skillTitle, { color: colors.textPrimary, fontSize: FONT_SIZE.lg }]}>{proj.name}</Text>
              {proj.tasks.map((task: any) => (
                <TaskCheckbox
                  key={task.id}
                  label={task.title}
                  done={task.done}
                  color="#10b981" // Green for projects
                  onToggle={() => {
                    feedback.tap();
                    toggleMilestone(proj.id, task.id, !task.done);
                  }}
                />
              ))}
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}


// ─── Full Roadmap Modal ────────────────────────────────────────────────────────

function FullRoadmapModal({ visible, onClose, phases, startDate }: { visible: boolean; onClose: () => void; phases: RoadmapPhase[]; startDate: string }) {
  const { colors } = useTheme();
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);

  const formatShortDate = (date: Date) => {
    return formatDateObjShort(date);
  };

  const getPhaseDateRange = (phaseIndex: number) => {
    let daysBefore = 0;
    for (let j = 0; j < phaseIndex; j++) {
      daysBefore += phases[j].durationDays;
    }
    const start = new Date(startDate);
    start.setDate(start.getDate() + daysBefore);
    
    const end = new Date(start);
    end.setDate(end.getDate() + phases[phaseIndex].durationDays - 1);
    
    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <View style={[styles.sheetOverlay, { paddingTop: 60 }]}>
        <View style={[styles.modalWrapper, { backgroundColor: colors.background, flex: 1, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Full Roadmap</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: SPACE.xl }}>
            {phases.map((p, i) => {
              const isExpanded = expandedPhaseId === p.id;
              return (
                <View key={p.id} style={{ marginBottom: SPACE.lg, flexDirection: 'row' }}>
                  <View style={{ width: 40, alignItems: 'center' }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 10, fontFamily: FONT_FAMILY.bold }}>{i + 1}</Text>
                    </View>
                    {i !== phases.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: colors.border, marginTop: -4, marginBottom: -4 }} />}
                  </View>
                  
                  <TouchableOpacity 
                    activeOpacity={0.7}
                    onPress={() => setExpandedPhaseId(isExpanded ? null : p.id)}
                    style={[styles.skillGroup, { backgroundColor: colors.surface, borderColor: isExpanded ? colors.accentPrimary : colors.border, flex: 1, marginBottom: 0 }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.sm }}>
                      <Text style={[styles.skillTitle, { color: colors.textPrimary, marginBottom: 0, flex: 1 }]}>{p.name}</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={[styles.phaseBadge, { backgroundColor: `${colors.accentPrimary}20`, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 4 }]}>
                          <Text style={[styles.phaseBadgeText, { color: colors.accentPrimary }]}>{p.durationDays} days</Text>
                        </View>
                        <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 10, color: colors.textMuted }}>{getPhaseDateRange(i)}</Text>
                      </View>
                    </View>
                    <Text style={[styles.phaseDesc, { color: colors.textSecondary }]}>{p.description}</Text>
                    
                    {isExpanded && p.devSyllabus && p.devSyllabus.length > 0 && (
                      <View style={{ marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary, marginBottom: SPACE.md, textTransform: 'uppercase', letterSpacing: 0.5 }}>Syllabus & Timeline</Text>
                        {p.devSyllabus.map((section, idx) => (
                          <View key={idx} style={{ marginBottom: SPACE.md }}>
                            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary }}>{section.title}</Text>
                            {section.subtitle && (
                              <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.accentPrimary, marginBottom: 4 }}>{section.subtitle}</Text>
                            )}
                            <View style={{ marginTop: 4 }}>
                              {section.items.map((item, itemIdx) => (
                                <View key={itemIdx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textSecondary, marginTop: 7, marginRight: 8 }} />
                                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>{item}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={{ height: 100 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── DSALogger Modal ────────────────────────────────────────────────────────

function DSALoggerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <View style={[styles.sheetOverlay, { paddingTop: 60 }]}>
        <View style={[styles.modalWrapper, { backgroundColor: colors.background, flex: 1, borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary, marginBottom: 0 }]}>LeetCode & DSA Log</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, paddingHorizontal: SPACE.md }}>
            <DSALogger />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PlacementHubScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  const { 
    config, currentPhaseInfo, skillRatings, milestones,
    updateConfig, resetToDefaults, toggleSkillSubtopic, toggleMilestone,
    dsaToday, dsaThisWeek
  } = usePlacementData();
  
  const [showConfig, setShowConfig] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [showDSALogger, setShowDSALogger] = useState(false);
  const [showPanic, setShowPanic] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showSunday, setShowSunday] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const [completedDailyMission, setCompletedDailyMission] = useState<Record<string, boolean>>({});

  const toggleMissionTask = (key: string) => {
    feedback.success();
    setCompletedDailyMission(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleShiftRoadmap = useCallback((days: number) => {
    try {
      const currentStart = new Date(config.startDate || '2026-07-22');
      currentStart.setDate(currentStart.getDate() + days);
      const newStartDate = currentStart.toISOString().slice(0, 10);
      updateConfig({ startDate: newStartDate }).catch(() => {});
      feedback.success();
    } catch (err) {
      console.error('Failed to shift roadmap date:', err);
    }
  }, [config.startDate, updateConfig]);

  // LeetCode sync for "Today" and "This Week" counts
  const [lcDsaToday, setLcDsaToday] = useState(0);
  const [lcDsaThisWeek, setLcDsaThisWeek] = useState(0);

  useEffect(() => {
    if (config.leetCodeUsername) {
      fetchRecentSubmissions(config.leetCodeUsername, 50).then(submissions => {
        if (!submissions) return;
        let t = 0, w = 0;
        const now = new Date();
        const todayStr = now.toDateString();
        // get start of week (Sunday)
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0,0,0,0);

        submissions.forEach((sub: any) => {
          const d = new Date(parseInt(sub.timestamp) * 1000);
          if (d.toDateString() === todayStr) t++;
          if (d >= weekStart) w++;
        });
        
        setLcDsaToday(t);
        setLcDsaThisWeek(w);
      });
    } else {
      setLcDsaToday(0);
      setLcDsaThisWeek(0);
    }
  }, [config.leetCodeUsername]);

  const displayDsaToday = Math.max(dsaToday, lcDsaToday);
  const displayDsaThisWeek = Math.max(dsaThisWeek, lcDsaThisWeek);

  // Derive Phase matching name to filter skills
  const currentBlockName = currentPhaseInfo.phase?.name || '';
  // The block identifier to match in skill names, e.g., "(Block A)"
  const blockMatchStr = currentBlockName.match(/(Block [A-H]|Pre-Season|Buffer [1-2]|Winter surge)/i)?.[0] || '';

  // Extract skills belonging to this block, grouped by DSA vs Dev
  const { dsaSkills, devSkills } = useMemo(() => {
    let dsa: { categoryId: string; skill: CustomSkill }[] = [];
    let dev: { categoryId: string; skill: CustomSkill }[] = [];
    
    if (blockMatchStr) {
      skillRatings.forEach(cat => {
        cat.skills.forEach(skill => {
          if (skill.name.toLowerCase().includes(blockMatchStr.toLowerCase())) {
            if (cat.id === 'cat_dsa') dsa.push({ categoryId: cat.id, skill });
            else if (cat.id === 'cat_dev') dev.push({ categoryId: cat.id, skill });
          }
        });
      });
    }
    return { dsaSkills: dsa, devSkills: dev };
  }, [skillRatings, blockMatchStr]);

  const p = currentPhaseInfo.phase;
  const pct = p ? (currentPhaseInfo.dayInPhase / p.durationDays) * 100 : 100;
  
  const dsaWeeklyPct = Math.min((displayDsaThisWeek / config.weeklyDSATarget) * 100, 100);

  // Mode detection: Weekday vs Weekend vs Rest/Buffer
  const isWeekend = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 || day === 6;
  }, []);

  const isBufferOrRest = useMemo(() => {
    const name = (p?.name || '').toLowerCase();
    return name.includes('buffer') || name.includes('rest') || name.includes('mid-sem');
  }, [p?.name]);

  // Mode Accent Color
  const themeAccent = isBufferOrRest ? '#10b981' : isWeekend ? '#f59e0b' : colors.accentPrimary;
  const modeLabel = isBufferOrRest ? 'BUFFER & RECOVERY BLOCK ☕' : isWeekend ? 'WEEKEND SURGE MODE 🔥' : 'WEEKDAY FOCUS MODE ⚡';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.md }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Placement Hub</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
          <TouchableOpacity 
            onPress={() => setShowPanic(true)} 
            style={[styles.headerBadge, { backgroundColor: '#ef444418', borderColor: '#ef444430', borderWidth: 1 }]}
          >
            <Ionicons name="heart-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowConfig(true)} style={[styles.headerBadge, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="settings-outline" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
      >
        
        {/* Zone 1: Dynamic Daily Mission Control Card */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={[styles.phaseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            
            {/* Top mode indicator */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
              <View style={[styles.phaseBadge, { backgroundColor: `${themeAccent}18`, borderColor: `${themeAccent}30`, borderWidth: 1 }]}>
                <Text style={[styles.phaseBadgeText, { color: themeAccent }]}>
                  {modeLabel}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowRoadmap(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: themeAccent }}>
                  Day {currentPhaseInfo.dayInPhase}/{p?.durationDays || 0}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={themeAccent} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.phaseTitle, { color: colors.textPrimary, fontSize: 18, marginBottom: 2 }]}>
              {isBufferOrRest ? 'Consolidation & Mental Recovery' : isWeekend ? 'Project & Mock Contest Sprint' : "Today's Execution Target"}
            </Text>
            <Text style={[styles.phaseDesc, { color: colors.textMuted, fontSize: FONT_SIZE.xs, marginBottom: SPACE.md }]}>
              {p?.name || 'Roadmap Progress'} • {isLightMode ? '⚡ Light Mode (50% Load)' : isWeekend ? '5h Project + 4h DSA' : '3h DSA + 2h Dev'}
            </Text>

            {/* Daily Mission Checkbox List */}
            <View style={{ gap: SPACE.xs, marginVertical: SPACE.xs }}>
              
              {/* Mission Item 1: DSA */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => toggleMissionTask('dsa_today')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.xl, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}
              >
                <Ionicons
                  name={completedDailyMission['dsa_today'] ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={completedDailyMission['dsa_today'] ? themeAccent : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: completedDailyMission['dsa_today'] ? colors.textMuted : colors.textPrimary, textDecorationLine: completedDailyMission['dsa_today'] ? 'line-through' : 'none' }}>
                    {isWeekend ? '4h DSA: Mock Contest & Hard Problems' : isLightMode ? '1.5h DSA Focus (1-2 Mediums)' : '3h DSA Focus (Problem Solving)'}
                  </Text>
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted, marginTop: 2 }}>
                    {dsaSkills[0]?.skill.name ? `Topic: ${dsaSkills[0].skill.name.replace(/\s*\(.*?\)\s*/g, '')}` : 'Core Data Structures'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Mission Item 2: Dev / Project */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => toggleMissionTask('dev_today')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.xl, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}
              >
                <Ionicons
                  name={completedDailyMission['dev_today'] ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={completedDailyMission['dev_today'] ? themeAccent : colors.textMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: completedDailyMission['dev_today'] ? colors.textMuted : colors.textPrimary, textDecorationLine: completedDailyMission['dev_today'] ? 'line-through' : 'none' }}>
                    {isWeekend ? '5h Dev: Full Stack Project Build' : isLightMode ? '1h Dev Focus (Concept Review)' : '2h Dev Focus (Core Concepts)'}
                  </Text>
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted, marginTop: 2 }}>
                    {devSkills[0]?.skill.name ? `Topic: ${devSkills[0].skill.name.replace(/\s*\(.*?\)\s*/g, '')}` : 'Fullstack Roadmap Target'}
                  </Text>
                </View>
              </TouchableOpacity>

            </View>

            {/* Quick Actions */}
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md }}>
              <TouchableOpacity
                onPress={() => {
                  feedback.success();
                  setShowDSALogger(true);
                }}
                style={{ flex: 1, backgroundColor: `${themeAccent}18`, borderWidth: 1, borderColor: `${themeAccent}35`, paddingVertical: 10, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Ionicons name="stats-chart" size={15} color={themeAccent} />
                <Text style={{ color: themeAccent, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs }}>LeetCode & Log</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => setShowRoadmap(true)}
                style={{ backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: SPACE.md, paddingVertical: 10, borderRadius: RADIUS.xl, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Ionicons name="map-outline" size={15} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs }}>Roadmap</Text>
              </TouchableOpacity>
            </View>

          </View>
        </Animated.View>
        
        {/* Zone 2: Weekly Target Overview */}
        <Animated.View entering={FadeInDown.delay(50).duration(400)} style={{ marginTop: SPACE.lg, flexDirection: 'row', gap: SPACE.md }}>
          <TouchableOpacity activeOpacity={0.7} style={{ flex: 1 }} onPress={() => setShowDSALogger(true)}>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
               <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>THIS WEEK (DSA)</Text>
               <Text style={[styles.statVal, { color: colors.textPrimary }]}>{displayDsaThisWeek} <Text style={{ fontSize: FONT_SIZE.md, color: colors.textMuted }}>/ {config.weeklyDSATarget}</Text></Text>
               <View style={[styles.track, { backgroundColor: colors.border, marginTop: 8 }]}>
                 <View style={[styles.fill, { backgroundColor: '#3b82f6', width: `${dsaWeeklyPct}%` as any }]} />
               </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={{ flex: 1 }} onPress={() => setShowDSALogger(true)}>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
               <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>TODAY</Text>
               <Text style={[styles.statVal, { color: colors.textPrimary }]}>{displayDsaToday} <Text style={{ fontSize: FONT_SIZE.md, color: colors.textMuted }}>problems</Text></Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Consistency & Memory Engines (Pattern Vault & Sunday Debrief) */}
        <Animated.View entering={FadeInDown.delay(75).duration(400)} style={{ marginTop: SPACE.lg, flexDirection: 'row', gap: SPACE.md }}>
          <TouchableOpacity 
            activeOpacity={0.8} 
            style={{ flex: 1 }} 
            onPress={() => {
              feedback.success();
              setShowVault(true);
            }}
          >
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: '#a599ff35', borderWidth: 1 }]}>
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                 <Ionicons name="sparkles" size={14} color="#a599ff" />
                 <Text style={[styles.fieldLabel, { color: '#a599ff', marginBottom: 0 }]}>PATTERN VAULT</Text>
               </View>
               <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textPrimary, marginTop: 2 }}>
                 Active Recall
               </Text>
               <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                 Spaced Flashcards
               </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            activeOpacity={0.8} 
            style={{ flex: 1 }} 
            onPress={() => {
              feedback.success();
              setShowSunday(true);
            }}
          >
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: '#10b98135', borderWidth: 1 }]}>
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                 <Ionicons name="calendar-outline" size={14} color="#10b981" />
                 <Text style={[styles.fieldLabel, { color: '#10b981', marginBottom: 0 }]}>SUNDAY DEBRIEF</Text>
               </View>
               <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textPrimary, marginTop: 2 }}>
                 4-Question Review
               </Text>
               <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
                 Weekly Check-in
               </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Zone 3: Active Project Card */}
        {milestones && milestones.length > 0 && (
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={{ marginTop: SPACE.lg }}>
            <View style={[styles.phaseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: SPACE.sm }}>
                  <Ionicons name="code-slash-outline" size={18} color="#8b5cf6" />
                  <Text numberOfLines={1} style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textPrimary, flex: 1 }}>
                    Active Project: {milestones[0]?.name || 'Portfolio App'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowProjects(true)}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: '#8b5cf6' }}>View All</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textSecondary }}>
                Next milestone: {milestones[0]?.tasks?.[0]?.title || 'Setup & Architecture'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Zone 4: Tomorrow's Horizon Preview */}
        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={{ marginTop: SPACE.lg }}>
          <View style={{ padding: SPACE.lg, borderRadius: RADIUS.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="sparkles-outline" size={14} color={colors.accentPrimary} />
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, letterSpacing: 1.5, color: colors.textMuted, textTransform: 'uppercase' }}>
                Tomorrow's Horizon
              </Text>
            </View>
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textPrimary }}>
              {dsaSkills[1]?.skill.name ? dsaSkills[1].skill.name.replace(/\s*\(.*?\)\s*/g, '') : 'Advanced DSA Concepts'}
            </Text>
            <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted, marginTop: 4 }}>
              Get ready for your next study block tomorrow. No pressure today!
            </Text>
          </View>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
      
      <ProjectsModal 
        visible={showProjects} 
        onClose={() => setShowProjects(false)} 
        milestones={milestones}
        toggleMilestone={toggleMilestone}
      />

      <FullRoadmapModal
        visible={showRoadmap}
        onClose={() => setShowRoadmap(false)}
        phases={config.phases}
        startDate={config.startDate}
      />

      <DSALoggerModal 
        visible={showDSALogger} 
        onClose={() => setShowDSALogger(false)} 
      />

      <PatternVaultModal
        visible={showVault}
        onClose={() => setShowVault(false)}
      />

      <SundayReflectionModal
        visible={showSunday}
        onClose={() => setShowSunday(false)}
      />

      <PanicModal
        visible={showPanic}
        onClose={() => setShowPanic(false)}
        onShiftRoadmap={handleShiftRoadmap}
        onTakeBufferDay={() => {
          setIsLightMode(true);
        }}
        onLightSession={() => {
          setIsLightMode(true);
        }}
        onTalkToSara={() => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('MoreStack', { screen: 'SaraModal' });
          }
        }}
      />

      <ConfigSheet
        visible={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onSave={newConfig => updateConfig(newConfig).catch(() => {})}
        onReset={async () => {
          await resetToDefaults();
          setShowConfig(false);
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.sm, paddingBottom: SPACE.md,
  },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl },
  headerBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: SPACE.sm, paddingTop: SPACE.md },
  
  // Phase Card
  phaseCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.xl },
  phaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.lg },
  phaseLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, letterSpacing: 1.5, marginBottom: 4 },
  phaseTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl },
  phaseBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.lg },
  phaseBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 2 },
  fill: { height: '100%', borderRadius: 4 },
  phaseDesc: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  
  // Stat Card
  statCard: { flex: 1, padding: SPACE.lg, borderRadius: RADIUS.xl, borderWidth: 1 },
  statVal: { fontFamily: FONT_FAMILY.bold, fontSize: 22, marginTop: 4 },

  // Sections
  sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, marginBottom: SPACE.md },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, fontStyle: 'italic' },
  
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.xl },
  miniBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 11 },
  
  categoryHeader: { fontFamily: FONT_FAMILY.bold, fontSize: 11, letterSpacing: 1, marginBottom: SPACE.sm, marginTop: SPACE.md },
  
  skillGroup: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, marginBottom: SPACE.md },
  skillTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, marginBottom: SPACE.md },
  taskList: { gap: SPACE.sm },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskLabel: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, flex: 1 },

  // Sheet / Modal
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetWrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACE.xl, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACE.lg },
  sheetTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl, marginBottom: SPACE.lg },
  fieldLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, letterSpacing: 1, marginBottom: SPACE.xs },
  input: { borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm },
  saveBtn: { borderRadius: RADIUS.xl, padding: SPACE.md, alignItems: 'center' },
  
  modalWrapper: { shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.xl, paddingBottom: SPACE.md },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
