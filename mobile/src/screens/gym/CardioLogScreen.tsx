import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

import { useGymLog, todayStr } from '../../hooks/useGymLog';
import { GymNavigationParamList } from '../../types/gym.types';
import { hapticSuccess } from '../../utils/haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { makeCardioLogStyles } from './cardioLogStyles';

const parseNum = (val: string, isFloat = false): number | undefined => {
  if (!val || !val.trim()) return undefined;
  const num = isFloat ? parseFloat(val) : parseInt(val, 10);
  return isNaN(num) ? undefined : num;
};

export default function CardioLogScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeCardioLogStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'CardioLog'>>();
  const cardioId = route.params?.cardioId;
  const date = route.params?.date || todayStr();

  const { log, updateCardio } = useGymLog(date);
  const cardioItem = log?.cardio?.find(c => c.id === cardioId);

  const [form, setForm] = useState({
    duration: '',
    distance: '',
    speed: '',
    incline: '',
    calories: '',
    floors: '',
    level: '',
    laps: '',
    rounds: '',
    spm: '',
    pace: '',
  });

  const updateField = (field: keyof typeof form, val: string) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  useEffect(() => {
    if (cardioItem) {
      setForm({
        duration: cardioItem.durationMinutes != null ? String(cardioItem.durationMinutes) : '',
        distance: cardioItem.distanceKm != null ? String(cardioItem.distanceKm) : '',
        speed: cardioItem.speedKmh != null ? String(cardioItem.speedKmh) : '',
        incline: cardioItem.incline != null ? String(cardioItem.incline) : '',
        calories: cardioItem.calories != null ? String(cardioItem.calories) : '',
        floors: cardioItem.floors != null ? String(cardioItem.floors) : '',
        level: cardioItem.level != null ? String(cardioItem.level) : '',
        laps: cardioItem.laps != null ? String(cardioItem.laps) : '',
        rounds: cardioItem.rounds != null ? String(cardioItem.rounds) : '',
        spm: cardioItem.spm != null ? String(cardioItem.spm) : '',
        pace: cardioItem.pace != null ? String(cardioItem.pace) : '',
      });
    }
  }, [cardioItem]);

  const handleSave = useCallback(() => {
    if (!cardioItem || !log || !cardioId) return;

    hapticSuccess();

    const updated = {
      ...cardioItem,
      durationMinutes: parseNum(form.duration),
      distanceKm: parseNum(form.distance, true),
      speedKmh: parseNum(form.speed, true),
      incline: parseNum(form.incline, true),
      calories: parseNum(form.calories),
      floors: parseNum(form.floors),
      level: parseNum(form.level),
      laps: parseNum(form.laps),
      rounds: parseNum(form.rounds),
      spm: parseNum(form.spm),
      pace: parseNum(form.pace, true),
      completed: true,
    };

    updateCardio(cardioId, updated as any);
    navigation.goBack();
  }, [cardioItem, log, cardioId, form, updateCardio, navigation]);

  const typeLower = (cardioItem?.type || '').toLowerCase();
  const isStairmaster = typeLower.includes('stair');
  const isElliptical = typeLower.includes('elliptical');
  const isSwim = typeLower.includes('swim');
  const isJumpRope = typeLower.includes('jump') || typeLower.includes('rope');
  const isRowing = typeLower.includes('row');
  const isRunning = typeLower.includes('run') || typeLower.includes('jog');
  const isTreadmill = typeLower.includes('treadmill') || (!isStairmaster && !isSwim && !isJumpRope && !isRowing && !isElliptical);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Cardio</Text>
          <View style={{ width: 40 }} />
        </View>

        {!cardioItem ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.accentPrimary || '#FF6B6B'} />
          </View>
        ) : (

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={['#FF6B6B', '#FF8787']}
              style={styles.iconCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="walk" size={32} color="#ffffff" />
            </LinearGradient>
            <Text style={styles.title}>{cardioItem.type}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Duration (minutes) *</Text>
              <TextInput
                style={styles.input}
                value={form.duration}
                onChangeText={v => updateField('duration', v)}
                keyboardType="numeric"
                placeholder="e.g. 30"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Distance (km)</Text>
                <TextInput
                  style={styles.input}
                  value={form.distance}
                  onChangeText={v => updateField('distance', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 5.0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Speed (km/h)</Text>
                <TextInput
                  style={styles.input}
                  value={form.speed}
                  onChangeText={v => updateField('speed', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 10.5"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            {isTreadmill && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Incline (%)</Text>
                <TextInput
                  style={styles.input}
                  value={form.incline}
                  onChangeText={v => updateField('incline', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 2.0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            {isStairmaster && (
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Floors Climbed</Text>
                  <TextInput
                    style={styles.input}
                    value={form.floors}
                    onChangeText={v => updateField('floors', v)}
                    keyboardType="numeric"
                    placeholder="e.g. 50"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Machine Level</Text>
                  <TextInput
                    style={styles.input}
                    value={form.level}
                    onChangeText={v => updateField('level', v)}
                    keyboardType="numeric"
                    placeholder="e.g. 8"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            )}

            {isElliptical && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Resistance Level</Text>
                <TextInput
                  style={styles.input}
                  value={form.level}
                  onChangeText={v => updateField('level', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 10"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            {isSwim && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Pool Laps</Text>
                <TextInput
                  style={styles.input}
                  value={form.laps}
                  onChangeText={v => updateField('laps', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 20"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            {isJumpRope && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Rounds / Sets</Text>
                <TextInput
                  style={styles.input}
                  value={form.rounds}
                  onChangeText={v => updateField('rounds', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            {isRowing && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Strokes / Min (SPM)</Text>
                <TextInput
                  style={styles.input}
                  value={form.spm}
                  onChangeText={v => updateField('spm', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 24"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            {isRunning && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Pace (min/km)</Text>
                <TextInput
                  style={styles.input}
                  value={form.pace}
                  onChangeText={v => updateField('pace', v)}
                  keyboardType="numeric"
                  placeholder="e.g. 5.3"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Calories Burned (kcal)</Text>
              <TextInput
                style={styles.input}
                value={form.calories}
                onChangeText={v => updateField('calories', v)}
                keyboardType="numeric"
                placeholder="e.g. 250"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveBtnWrapper, !form.duration.trim() && { opacity: 0.5 }]}
              disabled={!form.duration.trim()}
              onPress={handleSave}
            >
              <LinearGradient
                colors={['#FF6B6B', '#FA5252']}
                style={styles.saveBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.saveBtnText}>Save & Complete</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
