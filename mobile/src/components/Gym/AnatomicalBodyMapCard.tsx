/**
 * AnatomicalBodyMapCard.tsx — ZenTrack Mobile
 *
 * Full-Featured Dual-View (Front & Back) SVG Anatomical Muscle Heatmap & Recovery Map:
 * - 3 Interactive Modes: [ Muscle balance | Fatigue | Strength ]
 * - High-precision vector paths for all 18 muscle groups + anatomical silhouettes.
 * - Interactive muscle touch selection with detail stats breakdown.
 * - Exponential fatigue recovery decay and strength retention modeling.
 * - Integrated with real workout history & active gym logs.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONT_FAMILY, FONT_SIZE } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { feedback } from '../../utils/haptics';
import { BODY_PATHS, ViewGeometry } from './bodyPaths';
import {
  MUSCLES,
  INERT,
  MUSCLE_NAME,
  MuscleSlug,
  calculateMuscleLoad,
  calculateMuscleLevels,
  calculateMuscleFatigue,
  calculateMacroVolumeLoad,
  calculateMuscleGrowthProgression,
  calculateSymmetryAndBalance,
} from '../../services/muscleRecoveryService';
import { GymDayLog } from '../../types/gym.types';

const MUSCLE_SELECTION_ORDER: MuscleSlug[] = [
  'chest',
  'deltoids',
  'biceps',
  'triceps',
  'upper-back',
  'abs',
  'quadriceps',
  'hamstring',
  'gluteal',
  'calves',
  'trapezius',
  'forearm',
  'lower-back',
  'obliques',
  'adductors',
  'serratus',
  'tibialis',
  'hip-flexors',
];

interface Props {
  gymLogs: GymDayLog[];
  weekAnchorDate?: string;
  bodyGender?: 'male' | 'female';
  variant?: 'analytics' | 'weekly';
  timeWindowDays?: TimeWindow;
  defaultMode?: string;
  style?: any;
}

export type TimeWindow = 7 | 30 | 90 | 365 | 0;

export const AnatomicalBodyMapCard: React.FC<Props> = React.memo(({
  gymLogs,
  weekAnchorDate,
  bodyGender = 'male',
  variant = 'analytics',
  timeWindowDays,
  defaultMode,
  style,
}) => {
  const { colors, isDark } = useTheme();
  const initialMode = defaultMode || (variant === 'weekly' ? 'fatigue' : 'volume');
  const [mode, setMode] = useState<string>(initialMode);
  const [windowDays, setWindowDays] = useState<TimeWindow>(timeWindowDays ?? (variant === 'weekly' ? 7 : 30));
  const [onlyHardSets, setOnlyHardSets] = useState<boolean>(false);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleSlug | null>(null);

  // Sync with external timeWindowDays prop if passed
  React.useEffect(() => {
    if (timeWindowDays !== undefined) {
      setWindowDays(timeWindowDays);
    }
  }, [timeWindowDays]);

  // ── Macro Analytics Models ──────────────────────────────────────────────────
  const volumeModel = useMemo(
    () => calculateMacroVolumeLoad(gymLogs, windowDays as any, weekAnchorDate),
    [gymLogs, windowDays, weekAnchorDate]
  );

  const growthModel = useMemo(
    () => calculateMuscleGrowthProgression(gymLogs, windowDays as any, weekAnchorDate),
    [gymLogs, windowDays, weekAnchorDate]
  );

  const balanceModel = useMemo(
    () => calculateSymmetryAndBalance(gymLogs, windowDays as any, weekAnchorDate),
    [gymLogs, windowDays, weekAnchorDate]
  );

  // ── Weekly Report Models ────────────────────────────────────────────────────
  const weeklyMuscleLoad = useMemo(
    () => calculateMuscleLoad(gymLogs, 7, weekAnchorDate, onlyHardSets),
    [gymLogs, weekAnchorDate, onlyHardSets]
  );

  const weeklyMuscleLevels = useMemo(
    () => calculateMuscleLevels(weeklyMuscleLoad),
    [weeklyMuscleLoad]
  );

  const weeklyFatigue = useMemo(
    () => calculateMuscleFatigue(gymLogs, weekAnchorDate),
    [gymLogs, weekAnchorDate]
  );

  const genderGeometry = BODY_PATHS[bodyGender] || BODY_PATHS.male;

  // ── Color Generators ────────────────────────────────────────────────────────
  const getMuscleFillColor = (slug: MuscleSlug): string => {
    const baseColor = isDark ? '#232128' : '#e4e4e9';

    if (variant === 'weekly') {
      if (mode === 'balance' || mode === 'volume') {
        const level = weeklyMuscleLevels[slug] || 0;
        if (level === 4) return '#5eda9e'; // 🟢 Peak volume / Target Hit
        if (level === 3) return '#89dceb'; // 🔹 Optimal volume
        if (level === 2) return '#a599ff'; // 🟣 Moderate volume
        if (level === 1) return '#6d5fe0'; // 🟣 Base volume
        return baseColor;
      }
      if (mode === 'fatigue') {
        const r = weeklyFatigue[slug];
        const level = r ? r.fatigueLevel : 0;
        if (level === 4) return '#ff4757'; // 🔴 Fatigued
        if (level === 3) return '#ff7f50'; // 🟠 High
        if (level === 2) return '#ffd32a'; // 🟡 Recovering
        if (level === 1) return '#d4ac0d'; // 🟡 Light
        return baseColor; // ⚫ Ready
      }
      if (mode === 'strength') {
        const r = weeklyFatigue[slug];
        const score = r ? r.strengthScore : 0.7;
        if (score >= 0.95) return '#ffd32a';
        if (score >= 0.88) return '#cca00b';
        if (score >= 0.80) return '#a6820a';
        if (score >= 0.73) return '#6b5406';
        return baseColor;
      }
      return baseColor;
    }

    // Long-Term Analytics Variant
    if (mode === 'volume') {
      const v = volumeModel[slug];
      if (!v || v.level === 0) return baseColor;
      if (v.level === 4) return '#5eda9e'; // 🟢 Peak volume Emerald
      if (v.level === 3) return '#89dceb'; // 🔹 High volume Cyan
      if (v.level === 2) return '#a599ff'; // 🟣 Moderate volume Violet
      if (v.level === 1) return '#6d5fe0'; // 🟣 Base volume
      return baseColor;
    }

    if (mode === 'growth') {
      const g = growthModel[slug];
      if (!g || g.status === 'untrained') return baseColor;
      return g.color;
    }

    if (mode === 'balance') {
      const b = balanceModel[slug];
      if (!b || b.status === 'untrained') return baseColor;
      return b.color;
    }

    return baseColor;
  };

  const handleMusclePress = (slug: MuscleSlug) => {
    feedback.tap();
    setSelectedMuscle(prev => (prev === slug ? null : slug));
  };

  // ── Render Single SVG View (Front or Back) ──────────────────────────────────
  const renderBodySvg = (viewGeo: ViewGeometry, label: string) => {
    const inertColor = isDark ? '#18171c' : '#d1d1d6';

    return (
      <View style={styles.bodyViewCol}>
        <Svg viewBox={viewGeo.vb} style={styles.svgCanvas}>
          {/* Inert Silhouette (Head, Neck, Hands, Feet, Knees, Joints) */}
          <G>
            {INERT.map(slug =>
              (viewGeo.p[slug] || []).map((dStr, idx) => (
                <Path
                  key={`inert-${slug}-${idx}`}
                  d={dStr}
                  fill={inertColor}
                />
              ))
            )}
          </G>

          {/* Interactive Muscle Layers with Expanded Hit Boxes */}
          <G>
            {MUSCLES.map(slug => {
              const paths = viewGeo.p[slug] || [];
              if (!paths.length) return null;

              const isSelected = selectedMuscle === slug;
              const fill = getMuscleFillColor(slug);

              return (
                <G
                  key={`muscle-group-${slug}`}
                  onPress={() => handleMusclePress(slug)}
                >
                  {/* Invisible wide stroke hit target */}
                  {paths.map((dStr, idx) => (
                    <Path
                      key={`hit-${slug}-${idx}`}
                      d={dStr}
                      fill="transparent"
                      stroke="transparent"
                      strokeWidth={20}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {/* Visible Muscle Path */}
                  {paths.map((dStr, idx) => (
                    <Path
                      key={`muscle-${slug}-${idx}`}
                      d={dStr}
                      fill={fill}
                      stroke={isSelected ? '#ffffff' : isDark ? '#111016' : '#ffffff'}
                      strokeWidth={isSelected ? 5 : 1.2}
                      strokeLinejoin="round"
                    />
                  ))}
                </G>
              );
            })}
          </G>
        </Svg>
        <Text style={styles.bodyViewLabel}>{label}</Text>
      </View>
    );
  };

  const selectedData = selectedMuscle
    ? {
        name: MUSCLE_NAME[selectedMuscle],
        vol: volumeModel[selectedMuscle],
        growth: growthModel[selectedMuscle],
        balance: balanceModel[selectedMuscle],
        weeklySets: Math.round((weeklyMuscleLoad[selectedMuscle] || 0) * 10) / 10,
        weeklyRecovery: weeklyFatigue[selectedMuscle],
      }
    : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#0d0d10' : '#ffffff',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        },
        style,
      ]}
    >
      {/* ── Segmented Control Tabs (Weekly vs Analytics) ────────────────────── */}
      {variant === 'weekly' ? (
        <View style={styles.segControl}>
          <TouchableOpacity
            style={[styles.segBtn, mode === 'fatigue' && styles.segBtnActive]}
            onPress={() => {
              feedback.tap();
              setMode('fatigue');
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.segBtnText, mode === 'fatigue' && styles.segBtnTextActive]}>
              Fatigue & Rest
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segBtn, mode === 'balance' && styles.segBtnActive]}
            onPress={() => {
              feedback.tap();
              setMode('balance');
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.segBtnText, mode === 'balance' && styles.segBtnTextActive]}>
              Muscle Balance
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segBtn, mode === 'strength' && styles.segBtnActive]}
            onPress={() => {
              feedback.tap();
              setMode('strength');
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.segBtnText, mode === 'strength' && styles.segBtnTextActive]}>
              Strength
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.segControl}>
          <TouchableOpacity
            style={[styles.segBtn, mode === 'volume' && styles.segBtnActive]}
            onPress={() => {
              feedback.tap();
              setMode('volume');
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.segBtnText, mode === 'volume' && styles.segBtnTextActive]}>
              Volume Load
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segBtn, mode === 'growth' && styles.segBtnActive]}
            onPress={() => {
              feedback.tap();
              setMode('growth');
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.segBtnText, mode === 'growth' && styles.segBtnTextActive]}>
              Overload %
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segBtn, mode === 'balance' && styles.segBtnActive]}
            onPress={() => {
              feedback.tap();
              setMode('balance');
            }}
            activeOpacity={0.75}
          >
            <Text style={[styles.segBtnText, mode === 'balance' && styles.segBtnTextActive]}>
              Symmetry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Main Dual-View BodyMap (Front & Back) ────────────────────────────── */}
      <View style={styles.bodyDualContainer}>
        {renderBodySvg(genderGeometry.front, 'FRONT')}
        {renderBodySvg(genderGeometry.back, 'BACK')}
      </View>

      {/* ── Quick Muscle Selector Pills (Instant 0ms Selection) ────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickPillsScroll}
        style={styles.quickPillsWrapper}
      >
        {MUSCLE_SELECTION_ORDER.map(slug => {
          const isSelected = selectedMuscle === slug;
          const dotColor = getMuscleFillColor(slug);
          return (
            <TouchableOpacity
              key={`quick-${slug}`}
              style={[
                styles.quickPill,
                isSelected && styles.quickPillSelected,
              ]}
              onPress={() => handleMusclePress(slug)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickPillDot, { backgroundColor: dotColor }]} />
              <Text
                style={[
                  styles.quickPillText,
                  isSelected && styles.quickPillTextSelected,
                ]}
              >
                {MUSCLE_NAME[slug]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Interactive Muscle Detail Inspector ─────────────────────────────── */}
      {selectedData ? (
        <View style={styles.inspectorCard}>
          <View style={styles.inspectorTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.inspectorDot, { backgroundColor: getMuscleFillColor(selectedMuscle!) }]} />
              <Text style={styles.inspectorTitle}>{selectedData.name}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedMuscle(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color="#8e8e93" />
            </TouchableOpacity>
          </View>

          <View style={styles.inspectorStatsRow}>
            {variant === 'weekly' ? (
              <>
                {mode === 'fatigue' && (
                  <View style={{ gap: 3 }}>
                    <Text style={styles.inspectorStatText}>
                      Status:{' '}
                      <Text
                        style={{
                          fontFamily: FONT_FAMILY.bold,
                          color:
                            selectedData.weeklyRecovery.state === 'fatigued'
                              ? '#ff4757'
                              : selectedData.weeklyRecovery.state === 'recovering'
                              ? '#ffd32a'
                              : '#5eda9e',
                        }}
                      >
                        {selectedData.weeklyRecovery.state === 'fatigued'
                          ? '🔴 Fatigued (Rest Recommended)'
                          : selectedData.weeklyRecovery.state === 'recovering'
                          ? '🟡 Recovering (Active Adaptation)'
                          : '🟢 Ready for Heavy Stimulus'}
                      </Text>
                    </Text>
                    {selectedData.weeklyRecovery.lastTrainedDaysAgo !== null ? (
                      <Text style={styles.inspectorSubText}>
                        Last trained: {selectedData.weeklyRecovery.lastTrainedDaysAgo === 0 ? 'Today' : `${selectedData.weeklyRecovery.lastTrainedDaysAgo} days ago`} ({selectedData.weeklyRecovery.totalSets} sets)
                      </Text>
                    ) : (
                      <Text style={styles.inspectorSubText}>Not trained this week</Text>
                    )}
                  </View>
                )}

                {mode === 'balance' && (
                  <View style={{ gap: 2 }}>
                    <Text style={styles.inspectorStatText}>
                      🎯 Weekly Volume:{' '}
                      <Text style={{ color: '#5eda9e', fontFamily: FONT_FAMILY.bold }}>
                        {selectedData.weeklySets} sets
                      </Text>{' '}
                      <Text style={{ color: getMuscleFillColor(selectedMuscle!), fontFamily: FONT_FAMILY.bold }}>
                        ({weeklyMuscleLevels[selectedMuscle!] === 4
                          ? '🟢 Target Hit (12+ sets)'
                          : weeklyMuscleLevels[selectedMuscle!] === 3
                          ? '🔹 Optimal Volume (8–11 sets)'
                          : weeklyMuscleLevels[selectedMuscle!] === 2
                          ? '🟣 Moderate (4–7 sets)'
                          : weeklyMuscleLevels[selectedMuscle!] === 1
                          ? '🔮 Base (1–3 sets)'
                          : '⚫ Untrained'})
                      </Text>
                    </Text>
                  </View>
                )}

                {mode === 'strength' && (
                  <Text style={styles.inspectorStatText}>
                    ⚡ Retained Capacity:{' '}
                    <Text style={{ color: '#ffd32a', fontFamily: FONT_FAMILY.bold }}>
                      {Math.round(selectedData.weeklyRecovery.strengthScore * 100)}%
                    </Text>
                  </Text>
                )}
              </>
            ) : (
              <>
                {mode === 'volume' && (
                  <Text style={styles.inspectorStatText}>
                    🎯 Volume:{' '}
                    <Text style={{ color: '#5eda9e', fontFamily: FONT_FAMILY.bold }}>
                      {selectedData.vol.sets} sets
                    </Text>{' '}
                    ({selectedData.vol.volumeKg >= 1000 ? `${(selectedData.vol.volumeKg / 1000).toFixed(1)}k` : selectedData.vol.volumeKg} kg ·{' '}
                    <Text style={{ color: '#89dceb', fontFamily: FONT_FAMILY.bold }}>
                      {selectedData.vol.percentage}% of total
                    </Text>)
                  </Text>
                )}

                {mode === 'growth' && (
                  <View style={{ gap: 3 }}>
                    <Text style={styles.inspectorStatText}>
                      📈 Overload Gain:{' '}
                      <Text
                        style={{
                          fontFamily: FONT_FAMILY.bold,
                          color: selectedData.growth.color,
                        }}
                      >
                        {selectedData.growth.gainPct > 0 ? `+${selectedData.growth.gainPct}%` : `${selectedData.growth.gainPct}%`} Load Progression
                      </Text>
                    </Text>
                    {selectedData.growth.bestExercise ? (
                      <Text style={styles.inspectorSubText}>
                        Top Progressing Movement: {selectedData.growth.bestExercise} (+{selectedData.growth.loadDeltaKg}kg)
                      </Text>
                    ) : (
                      <Text style={styles.inspectorSubText}>Initial training baseline established</Text>
                    )}
                  </View>
                )}

                {mode === 'balance' && (
                  <View style={{ gap: 3 }}>
                    <Text style={styles.inspectorStatText}>
                      ⚖️ Symmetry Status:{' '}
                      <Text
                        style={{
                          fontFamily: FONT_FAMILY.bold,
                          color: selectedData.balance.color,
                        }}
                      >
                        {selectedData.balance.status === 'optimal'
                          ? '🟢 Optimal Balance'
                          : selectedData.balance.status === 'dominant'
                          ? '🟠 High Dominance'
                          : selectedData.balance.status === 'lagging'
                          ? '🔴 Lagging Volume'
                          : 'Untrained'}
                      </Text>
                    </Text>
                    <Text style={styles.inspectorSubText}>
                      {selectedData.balance.recommendation}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.tapPromptText}>
          {variant === 'weekly'
            ? mode === 'fatigue'
              ? 'Tap any muscle to inspect recovery status and soreness recency.'
              : mode === 'balance'
              ? 'Tap any muscle to inspect weekly set volume and target adherence.'
              : 'Tap any muscle to inspect retained strength capacity.'
            : mode === 'volume'
            ? 'Tap any muscle to inspect cumulative density and total tonnage.'
            : mode === 'growth'
            ? 'Tap any muscle to inspect progressive overload gains.'
            : 'Tap any muscle to inspect Push/Pull and structural symmetry.'}
        </Text>
      )}

      {/* ── Dynamic Legend Bar (Structured & Responsive) ────────────────────── */}
      <View style={styles.legendRow}>
        {variant === 'weekly' ? (
          <>
            {mode === 'fatigue' && (
              <View style={styles.legendItemsWrap}>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#ff4757' }]} />
                  <Text style={styles.legendLabel}>Fatigued</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#ffd32a' }]} />
                  <Text style={styles.legendLabel}>Recovering</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#232128' }]} />
                  <Text style={styles.legendLabel}>Ready</Text>
                </View>
              </View>
            )}

            {mode === 'balance' && (
              <View style={styles.legendItemsWrap}>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#5eda9e' }]} />
                  <Text style={styles.legendLabel}>12+ Sets (Target)</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#89dceb' }]} />
                  <Text style={styles.legendLabel}>8–11 Sets</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#a599ff' }]} />
                  <Text style={styles.legendLabel}>4–7 Sets</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#6d5fe0' }]} />
                  <Text style={styles.legendLabel}>1–3 Sets</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#232128' }]} />
                  <Text style={styles.legendLabel}>0</Text>
                </View>
              </View>
            )}

            {mode === 'strength' && (
              <View style={styles.legendItemsWrap}>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#ffd32a' }]} />
                  <Text style={styles.legendLabel}>100% Full</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#cca00b' }]} />
                  <Text style={styles.legendLabel}>88%</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#a6820a' }]} />
                  <Text style={styles.legendLabel}>80%</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#232128' }]} />
                  <Text style={styles.legendLabel}>Floor</Text>
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            {mode === 'volume' && (
              <View style={styles.legendItemsWrap}>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#5eda9e' }]} />
                  <Text style={styles.legendLabel}>High Vol</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#89dceb' }]} />
                  <Text style={styles.legendLabel}>Moderate</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#6d5fe0' }]} />
                  <Text style={styles.legendLabel}>Base</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#232128' }]} />
                  <Text style={styles.legendLabel}>Untrained</Text>
                </View>
              </View>
            )}

            {mode === 'growth' && (
              <View style={styles.legendItemsWrap}>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#ffd32a' }]} />
                  <Text style={styles.legendLabel}>🔥 +8%+ Gain</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#5eda9e' }]} />
                  <Text style={styles.legendLabel}>🟢 +3% Steady</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#89dceb' }]} />
                  <Text style={styles.legendLabel}>🔹 Maintained</Text>
                </View>
              </View>
            )}

            {mode === 'balance' && (
              <View style={styles.legendItemsWrap}>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#5eda9e' }]} />
                  <Text style={styles.legendLabel}>🟢 Balanced</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#ff9f4d' }]} />
                  <Text style={styles.legendLabel}>🟠 Dominant</Text>
                </View>
                <View style={styles.legendPill}>
                  <View style={[styles.legendDot, { backgroundColor: '#ff6961' }]} />
                  <Text style={styles.legendLabel}>🔴 Lagging</Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
});

export default AnatomicalBodyMapCard;

const windowWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  segControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segBtnActive: {
    backgroundColor: '#2C2C2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  segBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    color: '#8e8e93',
  },
  segBtnTextActive: {
    color: '#ffffff',
    fontFamily: FONT_FAMILY.bold,
  },
  headerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modeTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  timeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  timeChipActive: {
    backgroundColor: 'rgba(165, 153, 255, 0.2)',
  },
  timeChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#8e8e93',
  },
  timeChipTextActive: {
    color: '#a599ff',
    fontFamily: FONT_FAMILY.bold,
  },
  bodyDualContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  bodyViewCol: {
    alignItems: 'center',
    width: Math.min((windowWidth - 70) / 2, 175),
  },
  svgCanvas: {
    width: '100%',
    height: 255,
  },
  bodyViewLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#8e8e93',
    letterSpacing: 1,
    marginTop: 4,
  },
  quickPillsWrapper: {
    marginVertical: 8,
  },
  quickPillsScroll: {
    paddingHorizontal: 2,
    gap: 6,
    alignItems: 'center',
  },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 5,
  },
  quickPillSelected: {
    backgroundColor: 'rgba(165, 153, 255, 0.22)',
    borderColor: '#a599ff',
  },
  quickPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  quickPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#8e8e93',
  },
  quickPillTextSelected: {
    color: '#ffffff',
    fontFamily: FONT_FAMILY.bold,
  },
  inspectorCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    marginTop: 6,
    marginBottom: 6,
  },
  inspectorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  inspectorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#a599ff',
  },
  inspectorTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#ffffff',
  },
  inspectorStatsRow: {
    paddingLeft: 13,
  },
  inspectorStatText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: '#d1d1d6',
  },
  inspectorSubText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 11.5,
    color: '#8e8e93',
    marginTop: 2,
  },
  tapPromptText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  legendRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  legendItemsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 6,
    columnGap: 8,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  legendLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10.5,
    color: '#8e8e93',
  },
});
