/**
 * ExerciseDeepDiveModal.tsx — ZenTrack Mobile
 *
 * Single-Exercise Deep-Dive Inspector Modal (Direct OpenGym Architecture)
 * - 3-Way Curve Switcher: Top Set (with effort opacity dots), Est. 1RM, Effort Trend
 * - 5-Session Historical Audit Table
 * - Scientific Rep-Max Breakdown Table (100% 1RM down to 70% 12RM)
 * - All-Time PR Performance Banner
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONT_FAMILY, SPACE, FONT_SIZE } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { hapticLight } from '../../utils/haptics';
import { normalizeExerciseKey } from '../../utils/gymUtils';
import { estimate1RM, calculateRepMaxTable } from '../../services/oneRepMaxEngine';
import { GymDayLog } from '../../types/gym.types';

interface Props {
  visible: boolean;
  exerciseName: string | null;
  gymLogs: GymDayLog[];
  onClose: () => void;
}

type CurveMode = 'top' | '1rm' | 'effort';

export default function ExerciseDeepDiveModal({ visible, exerciseName, gymLogs, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const [curveMode, setCurveMode] = useState<CurveMode>('1rm');

  const targetKey = useMemo(() => normalizeExerciseKey(exerciseName || ''), [exerciseName]);

  // Extract all historical sessions for this exercise (chronological order)
  const historySessions = useMemo(() => {
    if (!targetKey) return [];
    const sessions: any[] = [];
    const sorted = (gymLogs || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    for (const log of sorted) {
      for (const ex of log.exercises || []) {
        if (ex.skipped) continue;
        if (normalizeExerciseKey(ex.name) === targetKey) {
          const completedSets = (ex.setsLog || []).filter(s => s.completed && !s.isWarmup);
          if (completedSets.length > 0) {
            const topWeight = Math.max(0, ...completedSets.map(s => Number(s.weight) || 0));
            const topSet = completedSets.find(s => Number(s.weight) === topWeight) || completedSets[0];
            const maxReps = Number(topSet?.reps) || 0;
            const oneRM = estimate1RM(topWeight, maxReps, 'epley');

            // Compute average RIR
            let rirSum = 0;
            let rirCount = 0;
            for (const s of completedSets) {
              if (s.rir !== undefined && s.rir !== null) {
                rirSum += Number(s.rir);
                rirCount++;
              } else if (s.rpe !== undefined && s.rpe !== null) {
                rirSum += 10 - Number(s.rpe);
                rirCount++;
              }
            }
            const avgRIR = rirCount > 0 ? Math.round((rirSum / rirCount) * 10) / 10 : 2;

            sessions.push({
              date: log.date,
              topWeight,
              maxReps,
              oneRM,
              avgRIR,
              sets: completedSets,
            });
          }
        }
      }
    }
    return sessions;
  }, [gymLogs, targetKey]);

  // All-time best 1RM and Heaviest weight
  const allTimeBest = useMemo(() => {
    let best1RMVal = 0;
    let heaviestWeight = 0;
    let bestDate = '';
    let bestReps = 0;

    for (const s of historySessions) {
      if (s.oneRM > best1RMVal) {
        best1RMVal = s.oneRM;
        bestDate = s.date;
        bestReps = s.maxReps;
        heaviestWeight = s.topWeight;
      }
    }

    return {
      best1RM: best1RMVal,
      heaviestWeight,
      bestDate,
      bestReps,
    };
  }, [historySessions]);

  const repMaxTable = useMemo(() => {
    return calculateRepMaxTable(allTimeBest.best1RM);
  }, [allTimeBest.best1RM]);

  const recent5 = useMemo(() => historySessions.slice(-5).reverse(), [historySessions]);

  // Chart Dimensions & SVG Path Builder
  const chartWidth = Dimensions.get('window').width - 72;
  const chartHeight = 130;

  const chartData = useMemo(() => {
    if (historySessions.length < 2) return null;
    const pts = historySessions.slice(-8); // last 8 points
    const values = pts.map(p =>
      curveMode === 'top' ? p.topWeight : curveMode === '1rm' ? p.oneRM : p.avgRIR
    );
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const padX = 20;
    const padY = 20;
    const innerW = chartWidth - padX * 2;
    const innerH = chartHeight - padY * 2;

    const coordinates = pts.map((p, idx) => {
      const val = curveMode === 'top' ? p.topWeight : curveMode === '1rm' ? p.oneRM : p.avgRIR;
      const x = padX + (idx / (pts.length - 1)) * innerW;
      const y = chartHeight - padY - ((val - minVal) / range) * innerH;
      return { x, y, val, date: p.date.slice(5), rir: p.avgRIR };
    });

    let d = `M ${coordinates[0].x} ${coordinates[0].y}`;
    for (let i = 1; i < coordinates.length; i++) {
      d += ` L ${coordinates[i].x} ${coordinates[i].y}`;
    }

    return { coordinates, pathD: d, minVal, maxVal };
  }, [historySessions, curveMode, chartWidth]);

  if (!visible || !exerciseName) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: isDark ? '#0a0a0d' : colors.surface, borderColor: isDark ? '#1c1c20' : colors.border }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {exerciseName}
              </Text>
              <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                Progression Deep-Dive • {historySessions.length} Logged Sessions
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* PR All-Time Highlight Banner */}
            {allTimeBest.best1RM > 0 && (
              <View style={[styles.prBanner, { backgroundColor: 'rgba(230, 200, 117, 0.1)', borderColor: 'rgba(230, 200, 117, 0.3)' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="trophy" size={14} color="#e6c875" />
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#e6c875' }}>ALL-TIME PEAK</Text>
                </View>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginTop: 4 }}>
                  {allTimeBest.best1RM} kg <Text style={{ fontSize: 13, color: colors.textMuted }}>(Est. 1RM)</Text>
                </Text>
                <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                  From {allTimeBest.heaviestWeight}kg × {allTimeBest.bestReps} reps • {allTimeBest.bestDate}
                </Text>
              </View>
            )}

            {/* 3-Curve Switcher */}
            <View style={[styles.curveSwitcher, { backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.04)' }]}>
              <TouchableOpacity
                onPress={() => { hapticLight(); setCurveMode('1rm'); }}
                style={[styles.switcherBtn, curveMode === '1rm' && styles.switcherBtnActive]}
              >
                <Text style={[styles.switcherText, curveMode === '1rm' && styles.switcherTextActive]}>Est. 1RM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { hapticLight(); setCurveMode('top'); }}
                style={[styles.switcherBtn, curveMode === 'top' && styles.switcherBtnActive]}
              >
                <Text style={[styles.switcherText, curveMode === 'top' && styles.switcherTextActive]}>Top Set</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { hapticLight(); setCurveMode('effort'); }}
                style={[styles.switcherBtn, curveMode === 'effort' && styles.switcherBtnActive]}
              >
                <Text style={[styles.switcherText, curveMode === 'effort' && styles.switcherTextActive]}>Effort (RIR)</Text>
              </TouchableOpacity>
            </View>

            {/* Progression Line Chart */}
            {chartData ? (
              <View style={[styles.chartContainer, { backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                <Svg width={chartWidth} height={chartHeight}>
                  {/* Grid Lines */}
                  <Line x1={20} y1={20} x2={chartWidth - 20} y2={20} stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} strokeDasharray="4 4" />
                  <Line x1={20} y1={chartHeight / 2} x2={chartWidth - 20} y2={chartHeight / 2} stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} strokeDasharray="4 4" />

                  {/* Curve Path */}
                  <Path
                    d={chartData.pathD}
                    fill="none"
                    stroke={curveMode === 'effort' ? '#ff9f4d' : '#a599ff'}
                    strokeWidth={2.5}
                  />

                  {/* Data Points with Effort Opacity */}
                  {chartData.coordinates.map((pt, i) => (
                    <Circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={4}
                      fill={curveMode === 'effort' ? '#ff9f4d' : '#a599ff'}
                      opacity={curveMode === 'top' ? Math.max(0.35, 1 - (pt.rir || 0) / 4) : 1}
                    />
                  ))}
                </Svg>
                <View style={styles.chartXLabels}>
                  {chartData.coordinates.map((pt, i) => (
                    <Text key={i} style={[styles.chartDateText, { color: colors.textTertiary }]}>{pt.date}</Text>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.noChartBox}>
                <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted }}>
                  Log 2+ sessions of this exercise to generate progress trajectory curves.
                </Text>
              </View>
            )}

            {/* Rep-Max Breakdown Table */}
            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Scientific Rep-Max Targets</Text>
            <View style={[styles.tableCard, { backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { color: colors.textTertiary }]}>REPS</Text>
                <Text style={[styles.tableHeaderCell, { color: colors.textTertiary }]}>% 1RM</Text>
                <Text style={[styles.tableHeaderCell, { color: colors.textTertiary, textAlign: 'right' }]}>WEIGHT</Text>
              </View>
              {repMaxTable.map(tier => (
                <View key={tier.reps} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold }]}>{tier.reps} RM</Text>
                  <Text style={[styles.tableCell, { color: colors.textMuted }]}>{tier.percentage}%</Text>
                  <Text style={[styles.tableCell, { color: '#a599ff', fontFamily: FONT_FAMILY.bold, textAlign: 'right' }]}>{tier.weight} kg</Text>
                </View>
              ))}
            </View>

            {/* 5-Session Historical Audit */}
            <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Recent 5 Sessions</Text>
            <View style={styles.sessionList}>
              {recent5.map((sess, idx) => (
                <View key={idx} style={[styles.sessionCard, { backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                  <View style={styles.sessionHeaderRow}>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary }}>{sess.date}</Text>
                    <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11, color: '#a599ff' }}>Peak: {sess.topWeight}kg × {sess.maxReps}</Text>
                  </View>
                  <View style={styles.sessionSetsRow}>
                    {sess.sets.map((s: any, sIdx: number) => (
                      <View key={sIdx} style={[styles.setTag, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
                        <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textSecondary }}>
                          {s.weight}kg × {s.reps}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: SPACE.lg,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
  },
  modalSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  prBanner: {
    padding: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACE.md,
  },
  curveSwitcher: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: SPACE.md,
  },
  switcherBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  switcherBtnActive: {
    backgroundColor: 'rgba(165, 153, 255, 0.2)',
  },
  switcherText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: '#8e8e93',
  },
  switcherTextActive: {
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
  },
  chartContainer: {
    borderRadius: RADIUS.md,
    padding: 10,
    borderWidth: 1,
    marginBottom: SPACE.lg,
  },
  chartXLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 6,
  },
  chartDateText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 9.5,
  },
  noChartBox: {
    padding: 16,
    alignItems: 'center',
    marginBottom: SPACE.lg,
  },
  sectionHeading: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  tableCard: {
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: 1,
    marginBottom: SPACE.lg,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tableHeaderCell: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  tableCell: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    flex: 1,
  },
  sessionList: {
    gap: 8,
  },
  sessionCard: {
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sessionSetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  setTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
