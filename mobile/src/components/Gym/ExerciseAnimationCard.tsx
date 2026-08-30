/**
 * ExerciseAnimationCard.tsx — ZenTrack Mobile
 *
 * High-Quality Exercise Form & Looping Animation Card:
 * - Powered by 1,324 exercise dataset with automatic offline disk caching.
 * - Displays instant looping form animations with optimal pixel density & framing.
 * - Full-width edge-to-edge rendering with clean 5px border framing.
 * - Collapsible step-by-step execution cues.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getExerciseMediaUri, ExerciseDefinition } from '../../services/exerciseMediaService';

interface ExerciseAnimationCardProps {
  exerciseName: string;
  onOpenYoutube?: () => void;
  showInstructions?: boolean;
  showBadges?: boolean;
  isEmbedded?: boolean;
  style?: any;
}

export const ExerciseAnimationCard: React.FC<ExerciseAnimationCardProps> = React.memo(({
  exerciseName,
  showInstructions = true,
  showBadges = false,
  isEmbedded = false,
  style,
}) => {
  const { colors, isDark } = useTheme();
  const [media, setMedia] = useState<{
    definition: ExerciseDefinition | null;
    gifUri: string | null;
    imageUri: string | null;
    isOffline: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showCues, setShowCues] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setImageError(false);

    getExerciseMediaUri(exerciseName).then(result => {
      if (isMounted) {
        setMedia(result);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [exerciseName]);

  const def = media?.definition;
  const activeUri = imageError ? (media?.imageUri || media?.gifUri) : (media?.gifUri || media?.imageUri);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isEmbedded ? 'transparent' : isDark ? '#111016' : '#F9FAFB',
          borderColor: isEmbedded ? 'transparent' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          borderWidth: isEmbedded ? 0 : 1,
          marginBottom: isEmbedded ? 0 : 16,
        },
        style,
      ]}
    >
      {/* Optional Top Badges */}
      {showBadges && (
        <View style={[styles.topRow, isEmbedded && { paddingHorizontal: 0, paddingTop: 2, paddingBottom: 8 }]}>
          <View style={styles.badgeRow}>
            {def?.target ? (
              <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.1)' }]}>
                <Text style={[styles.badgeText, { color: isDark ? '#a599ff' : '#6c5ce7' }]}>
                  {def.target.toUpperCase()}
                </Text>
              </View>
            ) : null}
            {def?.equipment ? (
              <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                  {def.equipment}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Main Full-Width Animation Area */}
      <View
        style={[
          styles.animationContainer,
          {
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
          },
        ]}
      >
        {loading ? (
          <View style={styles.loaderCenter}>
            <ActivityIndicator size="small" color={isDark ? '#a599ff' : '#6c5ce7'} />
            <Text style={[styles.loadingText, { color: '#666666' }]}>Loading Animation...</Text>
          </View>
        ) : activeUri ? (
          <Image
            source={{ uri: activeUri }}
            style={styles.gifImage}
            resizeMode="contain"
            fadeDuration={0}
            progressiveRenderingEnabled={true}
            onError={() => {
              if (!imageError && media?.imageUri) {
                setImageError(true);
              }
            }}
          />
        ) : (
          <View style={styles.placeholderCenter}>
            <Ionicons name="barbell-outline" size={32} color="#888888" />
            <Text style={[styles.placeholderText, { color: '#888888' }]}>
              Form demo for {exerciseName}
            </Text>
          </View>
        )}
      </View>

      {/* Collapsible Execution Cues */}
      {showInstructions && def && (def.instruction || (def.steps && def.steps.length > 0)) ? (
        <View style={[styles.instructionsSection, isEmbedded && { paddingHorizontal: 0, paddingBottom: 0, borderTopWidth: 0 }]}>
          <Pressable
            style={[
              styles.cuesToggleBtn,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              },
            ]}
            onPress={() => setShowCues(prev => !prev)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="newspaper-outline" size={13} color={colors.accentPrimary} />
              <Text style={[styles.instructionHeaderTitle, { color: colors.textPrimary }]}>
                Execution Cues {def.steps && def.steps.length > 0 ? `(${def.steps.length} Steps)` : ''}
              </Text>
            </View>
            <Ionicons
              name={showCues ? "chevron-up" : "chevron-down"}
              size={14}
              color={colors.textMuted}
            />
          </Pressable>

          {showCues && (
            <View style={styles.cuesContent}>
              {def.steps && def.steps.length > 0 ? (
                <View style={styles.stepsList}>
                  {def.steps.map((step, index) => (
                    <View key={index} style={styles.stepRow}>
                      <Text style={[styles.stepNumber, { color: colors.accentPrimary }]}>{index + 1}.</Text>
                      <Text style={[styles.stepText, { color: colors.textSecondary }]}>{step}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.instructionParagraph, { color: colors.textSecondary }]}>
                  {def.instruction}
                </Text>
              )}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
});

export default ExerciseAnimationCard;

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    padding: 0,
  },
  topRow: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  animationContainer: {
    width: '100%',
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  loaderCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  placeholderCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  placeholderText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  instructionsSection: {
    paddingTop: 6,
  },
  cuesToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  instructionHeaderTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  cuesContent: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  instructionParagraph: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
  },
  stepsList: {
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  stepNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    lineHeight: 17,
    width: 16,
  },
  stepText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
});
