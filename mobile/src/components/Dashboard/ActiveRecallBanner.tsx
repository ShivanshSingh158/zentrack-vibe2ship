import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY } from '../../theme/tokens';
import { Flashcard } from '../../services/flashcardService';

interface ActiveRecallBannerProps {
  dueFlashcards: Flashcard[];
  isBannerDismissed: boolean;
  onPressReview: () => void;
  onDismiss: () => void;
  colors: any;
  isDark: boolean;
}

export const ActiveRecallBanner = memo(function ActiveRecallBanner({
  dueFlashcards,
  isBannerDismissed,
  onPressReview,
  onDismiss,
  colors,
  isDark,
}: ActiveRecallBannerProps) {
  if (dueFlashcards.length === 0 || isBannerDismissed) return null;

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={{ marginTop: 12, marginBottom: 6 }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.3 : 0.06,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        {/* Left Flash Icon */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPressReview();
          }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: colors.accentDim,
            borderWidth: 1,
            borderColor: colors.accentPrimary + '30',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Ionicons name="flash" size={18} color={colors.accentPrimary} />
        </TouchableOpacity>

        {/* Middle Text Column */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={{ flex: 1, minWidth: 0, paddingRight: 6 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPressReview();
          }}
        >
          <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary, fontSize: 13.5, letterSpacing: -0.2 }}>
            3-Min Active Recall
          </Text>
          <Text style={{ color: colors.textTertiary, fontSize: 11.5, fontFamily: FONT_FAMILY.body, marginTop: 2 }} numberOfLines={1}>
            {dueFlashcards.length} flashcard{dueFlashcards.length > 1 ? 's' : ''} scheduled
          </Text>
        </TouchableOpacity>

        {/* Right Action Cluster: Review Button + Close (✕) Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{
              backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPressReview();
            }}
          >
            <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold, fontSize: 12 }}>Review</Text>
            <Ionicons name="chevron-forward" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={onDismiss}
          >
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
});

export default ActiveRecallBanner;
