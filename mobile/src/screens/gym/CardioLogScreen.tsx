import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { useGymLog, todayStr } from '../../hooks/useGymLog';
import { hapticMedium, hapticSuccess } from '../../utils/haptics';

export default function CardioLogScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const cardioId = route.params?.cardioId;
  const date = route.params?.date || todayStr();

  const { log, updateCardio } = useGymLog(date);
  
  const cardioItem = log?.cardio?.find(c => c.id === cardioId);

  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [calories, setCalories] = useState('');

  useEffect(() => {
    if (cardioItem) {
      setDuration(cardioItem.durationMinutes ? String(cardioItem.durationMinutes) : '');
      setDistance(cardioItem.distanceKm ? String(cardioItem.distanceKm) : '');
      setCalories(cardioItem.calories ? String(cardioItem.calories) : '');
    }
  }, [cardioItem]);

  const handleSave = () => {
    if (!cardioItem || !log) return;
    
    hapticSuccess();
    
    const parsedDuration = parseInt(duration, 10);
    const parsedDistance = parseFloat(distance);
    const parsedCalories = parseInt(calories, 10);
    
    const updated = {
      ...cardioItem,
      durationMinutes: isNaN(parsedDuration) ? undefined : parsedDuration,
      distanceKm: isNaN(parsedDistance) ? undefined : parsedDistance,
      calories: isNaN(parsedCalories) ? undefined : parsedCalories,
      completed: true,
    };
    
    const index = log.cardio?.findIndex(c => c.id === cardioId) ?? -1;
    if (index >= 0) {
      updateCardio(cardioId, updated as any);
    }
    
    navigation.goBack();
  };

  if (!cardioItem) return null;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-down" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Log Cardio</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={['#FF6B6B', '#FF8787']}
              style={styles.iconCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="walk" size={32} color={COLORS.background} />
            </LinearGradient>
            <Text style={styles.title}>{cardioItem.type}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Duration (minutes) *</Text>
              <TextInput
                style={styles.input}
                value={duration}
                onChangeText={setDuration}
                keyboardType="numeric"
                placeholder="e.g. 20"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Distance (km/mi)</Text>
              <TextInput
                style={styles.input}
                value={distance}
                onChangeText={setDistance}
                keyboardType="numeric"
                placeholder="e.g. 5.2"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Calories Burned</Text>
              <TextInput
                style={styles.input}
                value={calories}
                onChangeText={setCalories}
                keyboardType="numeric"
                placeholder="e.g. 250"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <TouchableOpacity 
              style={[styles.saveBtnWrapper, !duration.trim() && { opacity: 0.5 }]}
              disabled={!duration.trim()}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0E' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: SPACE.xs },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: COLORS.textMuted, letterSpacing: 1 },
  
  content: { padding: SPACE.xl, alignItems: 'center' },
  
  iconContainer: { alignItems: 'center', marginBottom: SPACE.xl * 1.5 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.md },
  title: { fontFamily: FONT_FAMILY.bold, fontSize: 24, color: COLORS.textPrimary },
  
  form: { width: '100%', gap: SPACE.lg },
  inputGroup: { gap: SPACE.xs },
  label: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    height: 50,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  
  saveBtnWrapper: { marginTop: SPACE.lg, borderRadius: RADIUS.lg, overflow: 'hidden' },
  saveBtn: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.background },
});
