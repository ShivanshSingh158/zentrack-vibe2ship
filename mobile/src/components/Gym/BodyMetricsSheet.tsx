/**
 * BodyMetricsSheet • ZenTrack Mobile
 *
 * Bodyweight, BMI, body composition, transformation photos & target weight tracker.
 * Modularized with extracted styling tokens and high-performance SVG history charts.
 */
import React, { useMemo, useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  Image, ActivityIndicator, Modal,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { serverTimestamp } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useCoreData } from "../../contexts/domains/CoreDataContext";
import { useWellnessData } from "../../contexts/domains/WellnessContext";
import { useGymProfile } from "../../hooks/useGymProfile";
import { COLLECTION } from "../../config/constants";
import { SPACE } from "../../theme/tokens";
import { useTheme } from "../../contexts/ThemeContext";
import BottomSheet from "../ui/BottomSheet";
import { queueWrite } from "../../services/offlineSync";
import { uploadFileToCloudinary } from "../../services/cloudinary";

// Extracted Subcomponents & Styles
import { makeBodyMetricsStyles } from "./bodyMetricsStyles";
import BodyMetricsHistoryChart, { WeightChartEntry } from "./BodyMetricsHistoryChart";

const WEIGHT_LOGS_KEY = "zentrack_weight_logs_v1";

function classifyBMI(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: "Underweight", color: "#60a5fa" };
  if (bmi < 25) return { label: "Normal", color: "#34d399" };
  if (bmi < 30) return { label: "Overweight", color: "#fb923c" };
  return { label: "Obese", color: "#f87171" };
}

interface WeightEntry {
  id?: string;
  weight: number;
  weightKg?: number;
  date: string;
  photoUrl?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function BodyMetricsSheet({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeBodyMetricsStyles(colors, isDark), [colors, isDark]);
  const { user } = useCoreData();
  const { weightLogs: contextWeightLogs } = useWellnessData();
  const { gymProfile, saveGymProfile } = useGymProfile();

  const [showLogWeight, setShowLogWeight] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [localLogs, setLocalLogs] = useState<WeightEntry[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; date?: string; weight?: number } | null>(null);

  // Load cached local weight logs on mount / visibility
  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(WEIGHT_LOGS_KEY).then(raw => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setLocalLogs(parsed);
          } catch (_) {}
        }
      });
    }
  }, [visible]);

  // Combine context weight logs and local weight logs
  const combinedLogs = useMemo(() => {
    const map = new Map<string, WeightEntry>();
    (contextWeightLogs || []).forEach((l: any) => {
      const w = l.weightKg ?? l.weight;
      if (l.date && w) map.set(l.date, { id: l.id, weight: w, date: l.date, photoUrl: l.photoUrl });
    });
    localLogs.forEach(l => {
      if (l.date && l.weight) map.set(l.date, l);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [contextWeightLogs, localLogs]);

  // Chronological logs (oldest → newest)
  const chronoLogs = useMemo(() => [...combinedLogs].reverse(), [combinedLogs]);

  // Height & Weight sources
  const latestWeight = combinedLogs[0]?.weight ?? gymProfile.weightKg ?? null;
  const heightCm = gymProfile.heightCm ?? (heightInput ? parseFloat(heightInput) : null);

  // BMI Calculation
  const bmi = latestWeight && heightCm && heightCm > 0
    ? Math.round((latestWeight / ((heightCm / 100) ** 2)) * 10) / 10
    : null;
  const bmiClass = bmi ? classifyBMI(bmi) : null;

  // Target weight calculation
  const targetWeight = (gymProfile as any).targetWeightKg ?? null;
  const startWeight = chronoLogs[0]?.weight ?? latestWeight;
  const currentWeight = combinedLogs[0]?.weight ?? latestWeight;
  const weightDelta = (currentWeight && startWeight) ? parseFloat((currentWeight - startWeight).toFixed(1)) : 0;

  const targetProgress = (latestWeight && targetWeight && startWeight && startWeight !== targetWeight)
    ? Math.min(Math.max((latestWeight - startWeight) / (targetWeight - startWeight), 0), 1)
    : null;

  // Recent 8 logs for weight trend chart (oldest → newest)
  const last8: WeightChartEntry[] = useMemo(
    () => combinedLogs.slice(0, 8).reverse().map(l => ({ weight: l.weight, date: l.date })),
    [combinedLogs]
  );

  // Photo Picker
  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      Haptics.selectionAsync();
    }
  };

  // Log weight handler
  const handleLogWeight = async () => {
    const w = parseFloat(weightInput);
    if (!w || w <= 0) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const today = new Date().toISOString().slice(0, 10);
    let uploadedPhotoUrl: string | null = null;

    try {
      if (photoUri) {
        const res = await uploadFileToCloudinary(photoUri, 'image/jpeg', 'photo.jpg', () => {});
        uploadedPhotoUrl = res.url;
      }
    } catch (e) {
      console.error("Photo upload error:", e);
    }

    const newEntry: WeightEntry = { weight: w, date: today, photoUrl: uploadedPhotoUrl };

    // Update local state & AsyncStorage for instant UI rendering
    const updatedLocal = [newEntry, ...localLogs.filter(l => l.date !== today)];
    setLocalLogs(updatedLocal);
    await AsyncStorage.setItem(WEIGHT_LOGS_KEY, JSON.stringify(updatedLocal));

    // Update gym profile height/weight
    const heightVal = heightInput ? parseFloat(heightInput) : gymProfile.heightCm;
    await saveGymProfile({ weightKg: w, heightCm: heightVal || gymProfile.heightCm });

    // Sync to Firestore background queue if logged in
    if (user?.uid) {
      await queueWrite(COLLECTION.WEIGHT_LOGS, "add", {
        userId: user.uid,
        weightKg: w,
        weight: w,
        photoUrl: uploadedPhotoUrl,
        date: today,
        createdAt: serverTimestamp(),
      });
    }

    setSaving(false);
    setWeightInput("");
    setHeightInput("");
    setPhotoUri(null);
    setShowLogWeight(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.md, paddingBottom: 36 }}>
          {/* Header */}
          <View style={s.headerRow}>
            <Text style={s.sheetTitle}>Body Metrics & Physique</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Stats Grid */}
          {combinedLogs.length > 0 && (
            <Animated.View entering={FadeInDown.duration(200)} style={s.statsGrid}>
              <View style={s.statCard}>
                <Text style={s.statLabel}>START</Text>
                <Text style={s.statValue}>{startWeight}</Text>
                <Text style={s.statSubText}>kg</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>CURRENT</Text>
                <Text style={[s.statValue, { color: isDark ? "#FFFFFF" : colors.textPrimary }]}>{currentWeight}</Text>
                <Text style={s.statSubText}>kg</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>CHANGE</Text>
                <Text style={[s.statValue, { color: weightDelta === 0 ? (isDark ? "#ffffff" : colors.textPrimary) : weightDelta > 0 ? "#ff9f4d" : "#5eda9e" }]}>
                  {weightDelta >= 0 ? `+${weightDelta}` : weightDelta}
                </Text>
                <Text style={s.statSubText}>kg</Text>
              </View>
            </Animated.View>
          )}

          {/* BMI Card */}
          {bmi && bmiClass ? (
            <Animated.View entering={FadeInDown.duration(250)} style={[s.bmiCard, { borderColor: bmiClass.color + "44" }]}>
              <View style={s.bmiLeft}>
                <Text style={s.bmiLabel}>BMI</Text>
                <Text style={[s.bmiValue, { color: bmiClass.color }]}>{bmi}</Text>
                <View style={[s.bmiPill, { backgroundColor: bmiClass.color + "22" }]}>
                  <Text style={[s.bmiPillText, { color: bmiClass.color }]}>{bmiClass.label}</Text>
                </View>
              </View>
              <View style={s.bmiRight}>
                <Text style={s.metricRow}><Text style={s.metricLabel}>Weight </Text><Text style={s.metricValue}>{latestWeight} kg</Text></Text>
                <Text style={s.metricRow}><Text style={s.metricLabel}>Height </Text><Text style={s.metricValue}>{heightCm} cm</Text></Text>
                {targetWeight ? <Text style={s.metricRow}><Text style={s.metricLabel}>Target </Text><Text style={s.metricValue}>{targetWeight} kg</Text></Text> : null}
              </View>
            </Animated.View>
          ) : (
            <View style={s.emptyBmiCard}>
              <View style={s.iconBadge}>
                <Ionicons name="accessibility-outline" size={24} color={isDark ? "#FFFFFF" : colors.textPrimary} />
              </View>
              <Text style={s.emptyBmiTitle}>Track Your Body Metrics</Text>
              <Text style={s.emptyBmiText}>
                Log your weight below to view your BMI, body composition, and progress trends.
              </Text>
            </View>
          )}

          {/* Target Weight Progress */}
          {targetProgress !== null && (
            <Animated.View entering={FadeInDown.delay(60).duration(250)} style={s.sectionCard}>
              <Text style={s.sectionTitle}>Target Weight Progress</Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.round(targetProgress * 100)}%` as any }]} />
              </View>
              <View style={s.progressLabels}>
                <Text style={s.progressLabel}>{startWeight} kg</Text>
                <Text style={[s.progressLabel, { color: isDark ? "#FFFFFF" : colors.textPrimary, fontWeight: "700" }]}>{Math.round(targetProgress * 100)}%</Text>
                <Text style={s.progressLabel}>{targetWeight} kg</Text>
              </View>
            </Animated.View>
          )}

          {/* Weight Trend Chart */}
          <BodyMetricsHistoryChart entries={last8} styles={s} colors={colors} isDark={isDark} />

          {/* Log Weight & Photo Check-in Form */}
          {showLogWeight ? (
            <View style={s.logForm}>
              <Text style={s.formTitle}>Log Body Weight & Photo</Text>
              <View style={s.inputRow}>
                <View style={[s.inputGroup, { flex: 1 }]}>
                  <Text style={s.inputLabel}>Weight (kg)</Text>
                  <TextInput
                    style={s.weightInput}
                    placeholder="e.g. 75.0"
                    placeholderTextColor="#71717A"
                    keyboardType="decimal-pad"
                    value={weightInput}
                    onChangeText={setWeightInput}
                    autoFocus
                  />
                </View>

                {!gymProfile.heightCm && (
                  <View style={[s.inputGroup, { flex: 1 }]}>
                    <Text style={s.inputLabel}>Height (cm)</Text>
                    <TextInput
                      style={s.weightInput}
                      placeholder="e.g. 178"
                      placeholderTextColor="#71717A"
                      keyboardType="number-pad"
                      value={heightInput}
                      onChangeText={setHeightInput}
                    />
                  </View>
                )}

                <TouchableOpacity style={s.photoBtn} onPress={handlePickPhoto} activeOpacity={0.8}>
                  <Ionicons name="camera" size={20} color={photoUri ? (isDark ? "#FFFFFF" : colors.textPrimary) : "#A1A1AA"} />
                </TouchableOpacity>
              </View>

              {photoUri && (
                <View style={s.photoPreviewRow}>
                  <TouchableOpacity onPress={() => setSelectedPhoto({ url: photoUri })}>
                    <Image source={{ uri: photoUri }} style={s.photoPreviewThumb} />
                  </TouchableOpacity>
                  <Text style={s.photoAttachedText}>Photo attached (tap to view)</Text>
                  <TouchableOpacity onPress={() => setPhotoUri(null)}>
                    <Ionicons name="close-circle" size={18} color="#71717A" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={s.formActions}>
                <TouchableOpacity style={s.saveFormBtn} onPress={handleLogWeight} disabled={saving || !weightInput}>
                  {saving ? (
                    <ActivityIndicator size="small" color={isDark ? "#000000" : "#ffffff"} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color={isDark ? "#000000" : "#ffffff"} />
                      <Text style={s.saveFormBtnText}>Save Weigh-in</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelFormBtn} onPress={() => { setShowLogWeight(false); setPhotoUri(null); }}>
                  <Ionicons name="close" size={18} color="#A1A1AA" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.logWeightBtn} onPress={() => setShowLogWeight(true)} activeOpacity={0.8}>
              <Ionicons name="scale-outline" size={20} color={isDark ? "#000000" : "#ffffff"} />
              <Text style={s.logWeightBtnText}>Log Today's Weight & Photo</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Full Photo Modal */}
      {selectedPhoto && (
        <Modal visible={true} transparent={true} animationType="fade">
          <View style={s.photoModalOverlay}>
            <TouchableOpacity style={s.closePhotoModalBtn} onPress={() => setSelectedPhoto(null)}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Image source={{ uri: selectedPhoto.url }} style={s.fullPhoto} resizeMode="contain" />
          </View>
        </Modal>
      )}
    </>
  );
}
