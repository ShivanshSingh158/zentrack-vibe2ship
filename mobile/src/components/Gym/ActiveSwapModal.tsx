import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, RADIUS, SPACE } from '../../theme/tokens';
import { resolveExerciseTargetMuscle } from '../../utils/gymUtils';

export interface ActiveSwapModalProps {
  visible: boolean;
  exercise: any;
  aiSwapList: any[];
  isAiSwapLoading: boolean;
  colors: any;
  styles?: any;
  onClose: () => void;
  onSelectSwap: (alt: any) => void;
}

interface TierTheme {
  bg: string;
  text: string;
  border: string;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
}

const TIER_CONFIG: Record<string, TierTheme> = {
  'S Tier': {
    bg: 'rgba(255, 215, 0, 0.12)',
    text: '#FFD700',
    border: 'rgba(255, 215, 0, 0.35)',
    iconName: 'trophy',
    label: 'S Tier',
  },
  'A+ Tier': {
    bg: 'rgba(0, 229, 255, 0.12)',
    text: '#00E5FF',
    border: 'rgba(0, 229, 255, 0.35)',
    iconName: 'diamond',
    label: 'A+ Tier',
  },
  'A Tier': {
    bg: 'rgba(94, 218, 158, 0.12)',
    text: '#5eda9e',
    border: 'rgba(94, 218, 158, 0.35)',
    iconName: 'star',
    label: 'A Tier',
  },
  'B Tier': {
    bg: 'rgba(137, 220, 235, 0.12)',
    text: '#89dceb',
    border: 'rgba(137, 220, 235, 0.35)',
    iconName: 'shield',
    label: 'B Tier',
  },
};

export const ActiveSwapModal: React.FC<ActiveSwapModalProps> = React.memo(({
  visible,
  exercise,
  aiSwapList,
  onClose,
  onSelectSwap,
}) => {
  if (!visible || !exercise) return null;

  const { targetMuscle } = resolveExerciseTargetMuscle(exercise.name, exercise.muscle);

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={localStyles.overlay}>
        {/* Backdrop dismiss */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={localStyles.sheetContent}>
          {/* Top Handle */}
          <View style={localStyles.handleContainer}>
            <View style={localStyles.handle} />
          </View>

          {/* Modal Header */}
          <View style={localStyles.header}>
            <View style={localStyles.headerLeft}>
              <View style={localStyles.headerIconBox}>
                <Ionicons name="swap-horizontal" size={20} color="#a599ff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={localStyles.titleRow}>
                  <Text style={localStyles.title}>Exercise Swap</Text>
                  <View style={localStyles.muscleBadge}>
                    <Text style={localStyles.muscleBadgeText}>{targetMuscle}</Text>
                  </View>
                </View>
                <Text style={localStyles.subtitle}>
                  Biomechanical SFR alternatives ranked for optimal stimulus
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={localStyles.closeBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#8e8e93" />
            </TouchableOpacity>
          </View>

          {/* Alternatives Scroll List */}
          <ScrollView
            style={localStyles.listScroll}
            contentContainerStyle={localStyles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {aiSwapList.map((alt: any, idx: number) => {
              const tierTheme = alt.tier && TIER_CONFIG[alt.tier] ? TIER_CONFIG[alt.tier] : null;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    localStyles.card,
                    alt.isFromTemplate && localStyles.cardTemplateBorder,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => onSelectSwap(alt)}
                >
                  {/* Card Top Row: Name + Tier Badge on opposite ends */}
                  <View style={localStyles.cardHeader}>
                    <Text style={localStyles.exerciseName} numberOfLines={2}>
                      {alt.name}
                    </Text>

                    {tierTheme ? (
                      <View
                        style={[
                          localStyles.tierBadge,
                          {
                            backgroundColor: tierTheme.bg,
                            borderColor: tierTheme.border,
                          },
                        ]}
                      >
                        <Text style={[localStyles.tierBadgeText, { color: tierTheme.text }]}>
                          {tierTheme.label}
                        </Text>
                      </View>
                    ) : alt.isFromTemplate ? (
                      <View style={localStyles.templateBadge}>
                        <Ionicons name="calendar-outline" size={10.5} color="#a599ff" />
                        <Text style={localStyles.templateBadgeText}>
                          {alt.dayName || 'Routine'}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Biomechanical Reason Highlight */}
                  {alt.reason ? (
                    <View style={localStyles.reasonContainer}>
                      <Ionicons name="sparkles" size={12} color="#a599ff" style={{ marginTop: 1 }} />
                      <Text style={localStyles.reasonText} numberOfLines={2}>
                        {alt.reason}
                      </Text>
                    </View>
                  ) : null}

                  {/* Card Footer: Sets/Reps/Rest + Action Arrow */}
                  <View style={localStyles.cardFooter}>
                    <View style={localStyles.metaRow}>
                      <View style={localStyles.metaChip}>
                        <Ionicons name="barbell-outline" size={12} color="#8e8e93" />
                        <Text style={localStyles.metaText}>
                          {alt.targetSets} Sets × {alt.targetReps} Reps
                        </Text>
                      </View>

                      <View style={localStyles.metaChip}>
                        <Ionicons name="stopwatch-outline" size={12} color="#8e8e93" />
                        <Text style={localStyles.metaText}>
                          {alt.restTimeSecs}s Rest
                        </Text>
                      </View>
                    </View>

                    <View style={localStyles.actionCircle}>
                      <Ionicons name="chevron-forward" size={14} color="#a599ff" />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const localStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: '#0d0d10',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#1f1f26',
    borderBottomWidth: 0,
    paddingTop: 10,
    paddingHorizontal: SPACE.lg,
    paddingBottom: 36,
    maxHeight: '86%',
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  headerIconBox: {
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(165, 153, 255, 0.25)',
    borderRadius: 12,
    padding: 8,
    marginTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  muscleBadge: {
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    borderColor: 'rgba(165, 153, 255, 0.28)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  muscleBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    color: '#a599ff',
  },
  subtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 11.5,
    color: '#8e8e93',
    marginTop: 3,
  },
  closeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  listScroll: {
    marginTop: 10,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#141418',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardTemplateBorder: {
    borderColor: 'rgba(165, 153, 255, 0.3)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  exerciseName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#ffffff',
    letterSpacing: -0.2,
    flex: 1,
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  tierBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
  templateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(165, 153, 255, 0.25)',
    alignSelf: 'flex-start',
  },
  templateBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#a599ff',
  },
  reasonContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(165, 153, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(165, 153, 255, 0.14)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  reasonText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12,
    color: '#c4bbff',
    flex: 1,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  metaText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 11,
    color: '#8e8e93',
  },
  actionCircle: {
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(165, 153, 255, 0.25)',
  },
});

export default ActiveSwapModal;
