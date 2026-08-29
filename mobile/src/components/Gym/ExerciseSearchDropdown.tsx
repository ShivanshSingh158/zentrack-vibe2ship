import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveMuscleColor } from '../../utils/gymUtils';
import { AIExerciseInfo } from '../../services/geminiProxy';

export interface ExerciseCatalogEntry {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  targetReps: string;
  aliases?: string[];
  restTimeSecs: number;
  videoId: string;
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
  if (!showDropdown || (suggestions.length === 0 && !aiLoading && !aiSuggestion)) {
    return null;
  }

  return (
    <View style={styles.dropdown}>
      {/* Catalogue suggestions */}
      {suggestions.length > 0 && (
        <View style={{ maxHeight: 240 }}>
          {suggestions.slice(0, 8).map((item, index) => {
            const muscleColor =
              item.muscle && item.muscle !== 'None'
                ? resolveMuscleColor(item.muscle)
                : colors.textTertiary;

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.suggestionRow,
                  index !== 0 && styles.suggestionBorder,
                ]}
                onPress={() => onSelectSuggestion(item)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.suggestionMeta, { color: muscleColor }]}>
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
          })}
        </View>
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
