import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ScrollView,
  Dimensions,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { GymCardioLog } from '../../types/gym.types';
import { useTheme } from '../../contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

interface Props {
  visible: boolean;
  cardio: GymCardioLog | null;
  onClose: () => void;
  onSave: (updates: Partial<GymCardioLog>) => void;
}

// ── Per-type field matrix ────────────────────────────────────────────────────
type FieldKey =
  | 'durationMinutes'
  | 'distanceKm'
  | 'speedKmh'
  | 'incline'
  | 'calories'
  | 'floors'
  | 'level'
  | 'laps'
  | 'rounds'
  | 'spm'
  | 'pace';

interface FieldConfig {
  key: FieldKey;
  label: string;
  placeholder: string;
  icon: string;
  decimal?: boolean;
  unit: string;
}

const ALL_FIELDS: Record<FieldKey, FieldConfig> = {
  durationMinutes: { key: 'durationMinutes', label: 'Duration', placeholder: 'e.g. 30', icon: 'time-outline', unit: 'min' },
  distanceKm:      { key: 'distanceKm',      label: 'Distance', placeholder: 'e.g. 5.5', icon: 'navigate-outline', decimal: true, unit: 'km' },
  speedKmh:        { key: 'speedKmh',        label: 'Speed',    placeholder: 'e.g. 8.5', icon: 'speedometer-outline', decimal: true, unit: 'km/h' },
  incline:         { key: 'incline',         label: 'Incline',  placeholder: 'e.g. 5', icon: 'trending-up-outline', decimal: true, unit: '%' },
  calories:        { key: 'calories',        label: 'Calories', placeholder: 'e.g. 250', icon: 'flame-outline', unit: 'kcal' },
  floors:          { key: 'floors',          label: 'Floors',   placeholder: 'e.g. 40', icon: 'layers-outline', unit: 'floors' },
  level:           { key: 'level',           label: 'Level',    placeholder: 'e.g. 8', icon: 'options-outline', unit: '/20' },
  laps:            { key: 'laps',            label: 'Laps',     placeholder: 'e.g. 20', icon: 'sync-outline', unit: 'laps' },
  rounds:          { key: 'rounds',          label: 'Rounds',   placeholder: 'e.g. 5', icon: 'infinite-outline', unit: 'rounds' },
  spm:             { key: 'spm',             label: 'Stroke Rate', placeholder: 'e.g. 22', icon: 'boat-outline', unit: 'spm' },
  pace:            { key: 'pace',            label: 'Pace',     placeholder: 'e.g. 5.30', icon: 'walk-outline', decimal: true, unit: 'min/km' },
};

const TYPE_FIELDS: Record<string, FieldKey[]> = {
  'Treadmill':    ['durationMinutes', 'distanceKm', 'speedKmh', 'incline'],
  'Cycling':      ['durationMinutes', 'distanceKm', 'speedKmh', 'calories'],
  'Rowing':       ['durationMinutes', 'distanceKm', 'spm', 'calories'],
  'Stairmaster':  ['durationMinutes', 'floors', 'level', 'calories'],
  'Elliptical':   ['durationMinutes', 'distanceKm', 'level', 'calories'],
  'Outdoor Run':  ['durationMinutes', 'distanceKm', 'pace', 'calories'],
  'Jump Rope':    ['durationMinutes', 'rounds', 'calories'],
  'Swimming':     ['durationMinutes', 'laps', 'distanceKm', 'calories'],
  'Other':        ['durationMinutes', 'calories'],
};

const DEFAULT_FIELDS: FieldKey[] = ['durationMinutes', 'distanceKm', 'calories'];

export function LogCardioModal({ visible, cardio, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(500)).current;
  const keyboardOffset = useRef(new Animated.Value(0)).current;

  // Dynamic field values stored as string map
  const [values, setValues] = useState<Record<string, string>>({});

  const fields: FieldConfig[] = cardio
    ? (TYPE_FIELDS[cardio.type] || DEFAULT_FIELDS).map(k => ALL_FIELDS[k])
    : [];

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration : 160,
        useNativeDriver: true,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvt, (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e.duration : 160,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible && cardio) {
      // Pre-fill from existing cardio log
      const init: Record<string, string> = {};
      (TYPE_FIELDS[cardio.type] || DEFAULT_FIELDS).forEach(key => {
        const v = (cardio as any)[key];
        if (v != null) init[key] = String(v);
      });
      setValues(init);

      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(500);
      keyboardOffset.setValue(0);
    }
  }, [visible, cardio]);

  const handleClose = () => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, {
      toValue: 500,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleSave = () => {
    if (!cardio) return;
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const updates: Partial<GymCardioLog> = { completed: true };
    (TYPE_FIELDS[cardio.type] || DEFAULT_FIELDS).forEach(key => {
      const raw = values[key];
      if (raw && raw.trim()) {
        const num = parseFloat(raw);
        if (!isNaN(num)) (updates as any)[key] = num;
      }
    });

    onSave(updates);
    handleClose();
  };

  if (!cardio) return null;

  const canSave = !!values['durationMinutes']?.trim();

  // Layout: group fields into pairs for side-by-side display
  const fieldPairs: FieldConfig[][] = [];
  for (let i = 0; i < fields.length; i += 2) {
    fieldPairs.push(fields.slice(i, i + 2));
  }

  // Combine slide anim and keyboard offset into a single native-driven translateY
  const combinedTranslateY = Animated.add(
    slideAnim,
    Animated.multiply(keyboardOffset, -1)
  );

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />

        <Animated.View
          style={[
            s.sheet,
            {
              transform: [{ translateY: combinedTranslateY }],
            },
          ]}
        >
          {/* Handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Text style={s.title}>Log {cardio.type}</Text>
              <Text style={s.subtitle}>
                {(TYPE_FIELDS[cardio.type] || DEFAULT_FIELDS)
                  .map(k => ALL_FIELDS[k].unit)
                  .join(' · ')}
              </Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Scrollable Fields */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: SCREEN_H * 0.45 }}
          >
            {fieldPairs.map((pair, pi) => (
              <View key={pi} style={s.row}>
                {pair.map((field, fi) => (
                  <View key={field.key} style={[s.fieldBox, fi === 0 && pair.length > 1 && { marginRight: 10 }]}>
                    <View style={s.fieldHeader}>
                      <View style={s.fieldIconBox}>
                        <Ionicons name={field.icon as any} size={12} color="#a599ff" />
                      </View>
                      <Text style={s.fieldLabel}>{field.label}</Text>
                      <Text style={s.fieldUnit}>{field.unit}</Text>
                    </View>
                    <TextInput
                      style={s.input}
                      placeholder={field.placeholder}
                      placeholderTextColor="#3C3C3E"
                      keyboardType="numeric"
                      value={values[field.key] || ''}
                      onChangeText={v => setValues(prev => ({ ...prev, [field.key]: v }))}
                      returnKeyType="next"
                    />
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>

          {/* Save CTA — always visible, anchored below fields */}
          <TouchableOpacity
            style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={!canSave}
          >
            <Text style={[s.saveBtnText, !canSave && s.saveBtnTextDisabled]}>
              {canSave ? 'Save & Mark Complete' : 'Enter duration to save'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const SCREEN_H = Dimensions.get('window').height;

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    // Use at most 70% of screen so it never clips — enough for 2 rows of cards
    maxHeight: SCREEN_H * 0.72,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: { flex: 1 },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: '#ffffff',
    marginBottom: 1,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: '#636366',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  fieldBox: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 12,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  fieldIconBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: 'rgba(165,153,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#8E8E93',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldUnit: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 9,
    color: '#48484A',
  },
  input: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: '#ffffff',
    padding: 0,
    height: 28,
  },
  saveBtn: {
    backgroundColor: '#a599ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnDisabled: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#ffffff',
  },
  saveBtnTextDisabled: {
    color: '#636366',
  },
});
