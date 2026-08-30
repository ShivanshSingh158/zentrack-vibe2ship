import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveMuscleColor } from '../../utils/gymUtils';
import { AIExerciseInfo } from '../../services/geminiProxy';
import { FONT_FAMILY } from '../../theme/tokens';

export interface ExerciseCatalogEntry {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  targetReps: string;
  aliases?: string[];
  restTimeSecs: number;
  videoId: string;
  tier?: 'S Tier' | 'A+ Tier' | 'A Tier' | 'B Tier' | 'C Tier';
}

export interface ExerciseSearchDropdownProps {
  showDropdown: boolean;
  suggestions: ExerciseCatalogEntry[];
  aiLoading: boolean;
  aiSuggestion: AIExerciseInfo | null;
  onSelectSuggestion: (entry: ExerciseCatalogEntry) => void;
  onSelectAiSuggestion: (ai: AIExerciseInfo) => void;
  colors: any;
  styles: any;
}

const TIER_PILL_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  'S Tier': { bg: 'rgba(255, 215, 0, 0.14)', text: '#FFD700', border: 'rgba(255, 215, 0, 0.35)' },
  'A+ Tier': { bg: 'rgba(0, 229, 255, 0.14)', text: '#00E5FF', border: 'rgba(0, 229, 255, 0.35)' },
  'A Tier': { bg: 'rgba(94, 218, 158, 0.14)', text: '#5eda9e', border: 'rgba(94, 218, 158, 0.35)' },
  'B Tier': { bg: 'rgba(137, 220, 235, 0.14)', text: '#89dceb', border: 'rgba(137, 220, 235, 0.35)' },
  'C Tier': { bg: 'rgba(142, 142, 147, 0.12)', text: '#8e8e93', border: 'rgba(142, 142, 147, 0.25)' },
};

// Memoized single row for 0ms rendering & maximum frame rate
const SuggestionRow = memo(({
  item,
  index,
  onPress,
  colors,
  styles,
}: {
  item: ExerciseCatalogEntry;
  index: number;
  onPress: (item: ExerciseCatalogEntry) => void;
  colors: any;
  styles: any;
}) => {
  const muscleColor =
    item.muscle && item.muscle !== 'None'
      ? resolveMuscleColor(item.muscle)
      : colors.textTertiary;
  const tierTheme = item.tier && TIER_PILL_CONFIG[item.tier] ? TIER_PILL_CONFIG[item.tier] : null;

  return (
    <TouchableOpacity
      style={[
        styles.suggestionRow,
        index !== 0 && styles.suggestionBorder,
        { paddingVertical: 10 },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={styles.suggestionName} numberOfLines={1}>
            {item.name}
          </Text>

          {tierTheme && (
            <View
              style={{
                backgroundColor: tierTheme.bg,
                borderColor: tierTheme.border,
                borderWidth: 1,
                borderRadius: 6,
                paddingHorizontal: 5,
                paddingVertical: 1.5,
              }}
            >
              <Text
                style={{
                  fontFamily: FONT_FAMILY.bold,
                  fontSize: 9.5,
                  color: tierTheme.text,
                }}
              >
                {item.tier}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.suggestionMeta, { color: muscleColor, marginTop: 3 }]}>
          {item.muscle}
        </Text>
      </View>

      <View style={styles.suggestionRight}>
        <Text style={styles.suggestionSets}>
          {item.targetSets}x {item.targetReps}
        </Text>
        <Ionicons name="return-down-back-outline" size={14} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
});

export const ExerciseSearchDropdown: React.FC<ExerciseSearchDropdownProps> = React.memo(({
  showDropdown,
  suggestions,
  aiLoading,
  aiSuggestion,
  onSelectSuggestion,
  onSelectAiSuggestion,
  colors,
  styles,
}) => {
  const [displayCount, setDisplayCount] = useState(14);

  // Reset to initial chunk whenever suggestions change (e.g. chip click or search input)
  useEffect(() => {
    setDisplayCount(14);
  }, [suggestions]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 100;
    if (isCloseToBottom && displayCount < suggestions.length) {
      setDisplayCount(prev => Math.min(prev + 14, suggestions.length));
    }
  }, [displayCount, suggestions.length]);

  if (!showDropdown || (suggestions.length === 0 && !aiLoading && !aiSuggestion)) {
    return null;
  }

  const visibleItems = suggestions.slice(0, displayCount);

  return (
    <View style={styles.dropdown}>
      {/* Catalogue suggestions: Progressive windowed ScrollView for instant 0ms mount */}
      {suggestions.length > 0 && (
        <ScrollView
          style={{ maxHeight: 310 }}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        >
          {visibleItems.map((item, index) => (
            <SuggestionRow
              key={`${item.id || item.name}_${index}`}
              item={item}
              index={index}
              onPress={onSelectSuggestion}
              colors={colors}
              styles={styles}
            />
          ))}
        </ScrollView>
      )}

      {/* AI loading shimmer */}
      {aiLoading && suggestions.length === 0 && (
        <View style={styles.aiLoadingRow}>
          <Ionicons name="sparkles-outline" size={16} color={colors.accentPrimary} />
          <Text style={styles.aiLoadingText}>AI is identifying exercise...</Text>
        </View>
      )}

      {/* AI suggestion */}
      {!aiLoading && aiSuggestion && suggestions.length === 0 && (
        <TouchableOpacity
          style={styles.aiSuggestionRow}
          onPress={() => onSelectAiSuggestion(aiSuggestion)}
          activeOpacity={0.7}
        >
          <View style={styles.aiSuggestionLeft}>
            <Ionicons name="sparkles-outline" size={18} color={colors.accentPrimary} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.aiSuggestionName} numberOfLines={1}>
                  {aiSuggestion.canonicalName}
                </Text>
                <View style={styles.aiBadge}>
                  <Text style={styles.aiBadgeText}>AI</Text>
                </View>
              </View>
              <Text
                style={[
                  styles.suggestionMeta,
                  { color: resolveMuscleColor(aiSuggestion.muscle) },
                ]}
              >
                {aiSuggestion.muscle} · {aiSuggestion.targetSets}x {aiSuggestion.targetReps} ·{' '}
                {aiSuggestion.restTimeSecs}s rest
              </Text>
            </View>
          </View>
          <Ionicons name="return-down-back-outline" size={14} color={colors.accentPrimary} />
        </TouchableOpacity>
      )}
    </View>
  );
});

export default ExerciseSearchDropdown;
