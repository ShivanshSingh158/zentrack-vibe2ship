import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ProactiveNudgeCardProps {
  message: string;
  actionLabel: string;
  onActionPress: () => void;
}

export default function ProactiveNudgeCard({ message, actionLabel, onActionPress }: ProactiveNudgeCardProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onActionPress();
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftGroup}>
        <Ionicons name="warning-outline" size={14} color="#ff9f4d" style={{ marginTop: 1 }} />
        <Text style={styles.messageText}>{message}</Text>
      </View>
      <TouchableOpacity activeOpacity={0.7} onPress={handlePress} hitSlop={{top:10, bottom:10, left:10, right:10}}>
        <Text style={styles.actionText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,159,77,0.1)', 
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20, 
  },
  leftGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  messageText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#ffc999',
    lineHeight: 16,
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#ff9f4d',
  }
});
