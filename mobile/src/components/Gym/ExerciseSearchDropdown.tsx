import React, { useState, useEffect, useCallback, memo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator } from 'react-native';
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
  onTriggerAiSearch?: () => void;
  searchQuery?: string;
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
  onTriggerAiSearch,
  searchQuery,
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

  const queryTrimmed = (searchQuery || '').trim();
  const hasQuery = queryTrimmed.length > 0;
  const hasSuggestions = suggestions.length > 0;

  if (!showDropdown || (!hasQuery && !hasSuggestions && !aiLoading && !aiSuggestion)) {
    return null;
  }

  const visibleItems = suggestions.slice(0, displayCount);

  return (
    <View style={styles.dropdown}>
      {/* 1. Suggestions List */}
      {hasSuggestions && (
        <ScrollView
          style={{ maxHeight: 260 }}
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

          {/* Subtle CTA at bottom of list if user wants AI variation */}
          {onTriggerAiSearch && hasQuery && queryTrimmed.length >= 2 && !aiLoading && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: 'rgba(165,153,255,0.04)',
              }}
              onPress={onTriggerAiSearch}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles" size={13} color="#a599ff" />
              <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11.5, color: '#a599ff' }}>
                Can't find your exercise? Identify with AI ✨
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* 2. AI loading shimmer (Only when no local suggestions) */}
      {!hasSuggestions && aiLoading && (
        <View style={styles.aiLoadingRow}>
          <ActivityIndicator size="small" color={colors.accentPrimary} style={{ marginRight: 6 }} />
          <Text style={styles.aiLoadingText}>
            AI is identifying "{queryTrimmed}"...
          </Text>
        </View>
      )}

      {/* 3. AI suggestion card (Only when no local suggestions) */}
      {!hasSuggestions && !aiLoading && aiSuggestion && (
        <TouchableOpacity
          style={styles.aiSuggestionRow}
          onPress={() => onSelectAiSuggestion(aiSuggestion)}
          activeOpacity={0.7}
        >
          <View style={styles.aiSuggestionLeft}>
            <Ionicons name="sparkles" size={18} color={colors.accentPrimary} />
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

      {/* 4. No matches found & not loading & no AI card yet: Show direct CTA to search with AI */}
      {!hasSuggestions && !aiLoading && !aiSuggestion && hasQuery && queryTrimmed.length >= 2 && (
        <View style={{ padding: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12.5, color: colors.textTertiary, marginBottom: 10, textAlign: 'center' }}>
            No match for "{queryTrimmed}" in local database
          </Text>
          {onTriggerAiSearch && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'rgba(165,153,255,0.14)',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(165,153,255,0.4)',
              }}
              onPress={onTriggerAiSearch}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles" size={14} color="#a599ff" />
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#a599ff' }}>
                Identify with AI ✨
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

export default ExerciseSearchDropdown;
