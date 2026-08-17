import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { useGymLog, todayStr } from '../../hooks/useGymLog';
import { GymNavigationParamList } from '../../types/gym.types';
import { hapticMedium, hapticSuccess } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";
import { StatusBar } from 'expo-status-bar';

export default function CardioLogScreen() {
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'CardioLog'>>();
  const cardioId = route.params?.cardioId;
  const date = route.params?.date || todayStr();

  const { log, updateCardio } = useGymLog(date);
  
  const cardioItem = log?.cardio?.find(c => c.id === cardioId);

  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [speed, setSpeed] = useState('');
  const [incline, setIncline] = useState('');
  const [calories, setCalories] = useState('');

  useEffect(() => {
    if (cardioItem) {
      setDuration(cardioItem.durationMinutes ? String(cardioItem.durationMinutes) : '');
      setDistance(cardioItem.distanceKm ? String(cardioItem.distanceKm) : '');
      setSpeed(cardioItem.speedKmh ? String(cardioItem.speedKmh) : '');
      setIncline(cardioItem.incline ? String(cardioItem.incline) : '');
      setCalories(cardioItem.calories ? String(cardioItem.calories) : '');
    }
  }, [cardioItem]);

  const handleSave = () => {
    if (!cardioItem || !log) return;
    
    hapticSuccess();
    
    const parsedDuration = parseInt(duration, 10);
    const parsedDistance = parseFloat(distance);
    const parsedSpeed = parseFloat(speed);
    const parsedIncline = parseFloat(incline);
    const parsedCalories = parseInt(calories, 10);
    
    const updated = {
      ...cardioItem,
      durationMinutes: isNaN(parsedDuration) ? undefined : parsedDuration,
      distanceKm: isNaN(parsedDistance) ? undefined : parsedDistance,
      speedKmh: isNaN(parsedSpeed) ? undefined : parsedSpeed,
      incline: isNaN(parsedIncline) ? undefined : parsedIncline,
      calories: isNaN(parsedCalories) ? undefined : parsedCalories,
      completed: true,
    };
    
    const index = log.cardio?.findIndex(c => c.id === cardioId) ?? -1;
    if (index >= 0 && cardioId) {
      updateCardio(cardioId, updated as any);
    }
    
    navigation.goBack();
  };

  if (!cardioItem) return null;

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
                value={duration}
                onChangeText={setDuration}
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
                  value={distance}
                  onChangeText={setDistance}
                  keyboardType="numeric"
                  placeholder="e.g. 5.0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Speed (km/h)</Text>
                <TextInput
                  style={styles.input}
                  value={speed}
                  onChangeText={setSpeed}
                  keyboardType="numeric"
                  placeholder="e.g. 10.5"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Incline (%)</Text>
              <TextInput
                style={styles.input}
                value={incline}
                onChangeText={setIncline}
                keyboardType="numeric"
                placeholder="e.g. 2.0"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Calories Burned (kcal)</Text>
              <TextInput
                style={styles.input}
                value={calories}
                onChangeText={setCalories}
                keyboardType="numeric"
                placeholder="e.g. 250"
                placeholderTextColor={colors.textMuted}
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

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACE.xl,
        paddingTop: Platform.OS === 'ios' ? 10 : 20,
        paddingBottom: SPACE.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      },
      backBtn: { padding: SPACE.xs },
      headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textMuted, letterSpacing: 1 },
      
      content: { padding: SPACE.xl, alignItems: 'center' },
      
      iconContainer: { alignItems: 'center', marginBottom: SPACE.xl * 1.5 },
      iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.md },
      title: { fontFamily: FONT_FAMILY.bold, fontSize: 24, color: colors.textPrimary },
      
      form: { width: '100%', gap: SPACE.lg },
      row: { flexDirection: 'row', gap: SPACE.md },
      inputGroup: { gap: SPACE.xs },
      label: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
      input: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: RADIUS.md,
        paddingHorizontal: SPACE.md,
        height: 50,
        fontFamily: FONT_FAMILY.bold,
        fontSize: 18,
        color: colors.textPrimary,
      },
      
      saveBtnWrapper: { marginTop: SPACE.lg, borderRadius: RADIUS.lg, overflow: 'hidden' },
      saveBtn: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
      saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#ffffff' },
    });
