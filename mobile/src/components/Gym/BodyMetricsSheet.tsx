import React, { useMemo, useState, useEffect } from "react";
import { formatDateShort } from '../../utils/dateUtils';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Image, ActivityIndicator, Alert, Modal,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Polyline, Circle, Line, Path, Defs, LinearGradient, Stop, Text as SvgText, G } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { serverTimestamp, collection, addDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCoreData } from "../../contexts/domains/CoreDataContext";
import { useWellnessData } from "../../contexts/domains/WellnessContext";
import { useGymProfile } from "../../hooks/useGymProfile";
import { COLLECTION } from "../../config/constants";
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from "../../theme/tokens";
import { useTheme } from "../../contexts/ThemeContext";
import BottomSheet from "../ui/BottomSheet";
import { queueWrite } from "../../services/offlineSync";
import { uploadFileToCloudinary } from "../../services/cloudinary";
import { db } from "../../services/firebase";
import BeforeAfterSlider from "./BeforeAfterSlider";

const WEIGHT_LOGS_KEY = "zentrack_weight_logs_v1";

function classifyBMI(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: "Underweight", color: "#60a5fa" };
  if (bmi < 25)   return { label: "Normal",      color: "#34d399" };
  if (bmi < 30)   return { label: "Overweight",  color: "#fb923c" };
  return               { label: "Obese",         color: "#f87171" };
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
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { user } = useCoreData();
  const { weightLogs: contextWeightLogs } = useWellnessData();
  const { gymProfile, saveGymProfile } = useGymProfile();
  
  const [showLogWeight, setShowLogWeight] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [localLogs, setLocalLogs] = useState<WeightEntry[]>([]);

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
  const chronoLogs = useMemo(() => {
    return [...combinedLogs].reverse();
  }, [combinedLogs]);

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
  const last8 = useMemo(() => combinedLogs.slice(0, 8).reverse(), [combinedLogs]);

  // Photos for Before/After comparison
  const beforePhoto = chronoLogs.find(l => l.photoUrl)?.photoUrl;
  const afterPhoto = combinedLogs.find(l => l.photoUrl)?.photoUrl;

  // ── Photo Picker ──────────────────────────────────────────────────────────
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

  // ── Log weight handler ───────────────────────────────────────────────────
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

  // ── SVG weight chart ─────────────────────────────────────────────────────
  const CHART_W = 320;
  const CHART_H = 110;
  const chartPoints = useMemo(() => {
    if (last8.length < 2) return null;
    const weights = last8.map(l => l.weight).filter(w => w > 0);
    if (weights.length < 2) return null;
    const minW = Math.min(...weights) - 0.5;
    const maxW = Math.max(...weights) + 0.5;
    const range = maxW - minW || 1;
    return last8.map((entry, i) => {
      const x = 20 + (i / (last8.length - 1)) * (CHART_W - 40);
      const y = CHART_H - (((entry.weight - minW) / range) * (CHART_H - 28) + 14);
      return { x, y, weight: entry.weight, date: entry.date };
    });
  }, [last8]);

  const polylinePoints = chartPoints?.map(p => `${p.x},${p.y}`).join(" ") ?? "";

  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; date?: string; weight?: number } | null>(null);

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.md, paddingBottom: 36 }}>
          {/* Title */}
          <View style={s.headerRow}>
            <Text style={s.sheetTitle}>Body Metrics & Physique</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Start / Current / Change Stats Grid ────────────────────────── */}
          {combinedLogs.length > 0 && (
            <Animated.View entering={FadeInDown.duration(200)} style={s.statsGrid}>
              <View style={s.statCard}>
                <Text style={s.statLabel}>START</Text>
                <Text style={s.statValue}>{startWeight}</Text>
                <Text style={s.statSubText}>kg</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>CURRENT</Text>
                <Text style={[s.statValue, { color: "#FFFFFF" }]}>{currentWeight}</Text>
                <Text style={s.statSubText}>kg</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>CHANGE</Text>
                <Text style={[s.statValue, { color: weightDelta === 0 ? "#ffffff" : weightDelta > 0 ? "#ff9f4d" : "#5eda9e" }]}>
                  {weightDelta >= 0 ? `+${weightDelta}` : weightDelta}
                </Text>
                <Text style={s.statSubText}>kg</Text>
              </View>
            </Animated.View>
          )}

          {/* ── BMI Card ─────────────────────────────────────────────────── */}
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
                <Text style={s.metricRow}><Text style={s.metricLabel}>Weight  </Text><Text style={s.metricValue}>{latestWeight} kg</Text></Text>
                <Text style={s.metricRow}><Text style={s.metricLabel}>Height  </Text><Text style={s.metricValue}>{heightCm} cm</Text></Text>
                {targetWeight ? <Text style={s.metricRow}><Text style={s.metricLabel}>Target  </Text><Text style={s.metricValue}>{targetWeight} kg</Text></Text> : null}
              </View>
            </Animated.View>
          ) : (
            <View style={s.emptyBmiCard}>
              <View style={s.iconBadge}>
                <Ionicons name="accessibility-outline" size={24} color="#FFFFFF" />
              </View>
              <Text style={s.emptyBmiTitle}>Track Your Body Metrics</Text>
              <Text style={s.emptyBmiText}>
                Log your weight below to view your BMI, body composition, and progress trends.
              </Text>
            </View>
          )}

          {/* ── Target Weight Progress ────────────────────────────────────── */}
          {targetProgress !== null && (
            <Animated.View entering={FadeInDown.delay(60).duration(250)} style={s.sectionCard}>
              <Text style={s.sectionTitle}>Target Weight Progress</Text>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.round(targetProgress * 100)}%` as any }]} />
              </View>
              <View style={s.progressLabels}>
                <Text style={s.progressLabel}>{startWeight} kg</Text>
                <Text style={[s.progressLabel, { color: "#FFFFFF", fontWeight: "700" }]}>{Math.round(targetProgress * 100)}%</Text>
                <Text style={s.progressLabel}>{targetWeight} kg</Text>
              </View>
            </Animated.View>
          )}

          {/* ── Weight Trend Chart ────────────────────────────────────────── */}
          {chartPoints && chartPoints.length >= 2 ? (
            <Animated.View entering={FadeInDown.delay(100).duration(250)} style={s.sectionCard}>
              <View style={s.cardHeaderRow}>
                <Text style={s.sectionTitle}>Weight Trend</Text>
                <Text style={s.badgeText}>{last8[last8.length - 1]?.weight} kg</Text>
              </View>
              <View style={s.chartContainer}>
                <Svg width={CHART_W} height={CHART_H}>
                  <Defs>
                    <LinearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.25" />
                      <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                    </LinearGradient>
                  </Defs>
                  {[0.25, 0.5, 0.75].map(f => (
                    <Line
                      key={f}
                      x1={0} y1={CHART_H * (1 - f)} x2={CHART_W} y2={CHART_H * (1 - f)}
                      stroke="#27272A" strokeWidth={0.8}
                    />
                  ))}
                  <Polyline
                    points={polylinePoints}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {chartPoints.map((p, i) => (
                    <React.Fragment key={i}>
                      <Circle cx={p.x} cy={p.y} r={4} fill="#000000" stroke="#FFFFFF" strokeWidth={2} />
                      {i === chartPoints.length - 1 && (
                        <SvgText x={p.x} y={p.y - 8} fontSize={10} fill="#FFFFFF" textAnchor="middle" fontWeight="700">
                          {p.weight}kg
                        </SvgText>
                      )}
                    </React.Fragment>
                  ))}
                </Svg>
              </View>
              <Text style={[s.metricLabel, { textAlign: "center", marginTop: 4, fontSize: 11 }]}>
                {last8.length} entries recorded ({formatDateShort(last8[0]?.date ?? '')} → {formatDateShort(last8[last8.length - 1]?.date ?? '')})
              </Text>
            </Animated.View>
          ) : null}

          {/* ── Log Weight & Photo Check-in Form ──────────────────────────── */}
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

                {/* Camera Photo Picker */}
                <TouchableOpacity style={s.photoBtn} onPress={handlePickPhoto} activeOpacity={0.8}>
                  <Ionicons name="camera" size={20} color={photoUri ? "#FFFFFF" : "#A1A1AA"} />
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
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#000000" />
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
              <Ionicons name="scale-outline" size={20} color="#000000" />
              <Text style={s.logWeightBtnText}>Log Today's Weight & Photo</Text>
            </TouchableOpacity>
          )}

          {/* ── Entry History List ────────────────────────────────────────── */}
          {combinedLogs.length > 0 && (
            <View style={s.sectionCard}>
              <Text style={s.sectionTitle}>Entry History</Text>
              {combinedLogs.slice(0, 10).map((entry, idx) => (
                <View key={idx} style={[s.historyRow, idx > 0 && s.historyRowBorder]}>
                  <View style={s.historyDateCol}>
                    <Text style={s.historyDate}>{formatDateShort(entry.date)}</Text>
                    <Text style={s.historyYear}>{entry.date.slice(0, 4)}</Text>
                  </View>
                  <View style={s.historyWeightCol}>
                    <Text style={s.historyWeight}>{entry.weight}</Text>
                    <Text style={s.historyWeightUnit}>kg</Text>
                  </View>
                  {entry.photoUrl ? (
                    <TouchableOpacity onPress={() => setSelectedPhoto({ url: entry.photoUrl!, date: entry.date, weight: entry.weight })} activeOpacity={0.8}>
                      <Image source={{ uri: entry.photoUrl }} style={s.historyThumb} />
                    </TouchableOpacity>
                  ) : (
                    <View style={s.historyThumbEmpty}>
                      <Ionicons name="image-outline" size={16} color="#3F3F46" />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── Before / After Photo Comparison Slider ────────────────────── */}
          {beforePhoto && afterPhoto && beforePhoto !== afterPhoto && (
            <View style={s.sectionCard}>
              <Text style={s.sectionTitle}>Physique Comparison</Text>
              <View style={{ alignItems: 'center', marginTop: SPACE.xs }}>
                <BeforeAfterSlider beforeImage={beforePhoto} afterImage={afterPhoto} />
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheet>

      {/* ── Full-Screen Photo Viewer Modal ────────────────────────────── */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={s.fullPhotoOverlay}>
          <TouchableOpacity style={s.fullPhotoCloseBtn} onPress={() => setSelectedPhoto(null)} activeOpacity={0.8}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {selectedPhoto && (
            <View style={s.fullPhotoContainer}>
              <Image source={{ uri: selectedPhoto.url }} style={s.fullPhotoImage} resizeMode="contain" />
              {(selectedPhoto.date || selectedPhoto.weight) && (
                <View style={s.fullPhotoCaption}>
                  <Text style={s.fullPhotoCaptionText}>
                    {selectedPhoto.weight ? `${selectedPhoto.weight} kg` : ''} {selectedPhoto.date ? `• ${selectedPhoto.date}` : ''}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  sheetTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? '#1c1c1f' : '#E2E1EA', alignItems: "center", justifyContent: "center" },

  // Stats Grid
  statsGrid: { flexDirection: "row", gap: SPACE.sm },
  statCard: { flex: 1, backgroundColor: isDark ? '#000000' : '#F5F4FA', borderRadius: RADIUS.lg, padding: SPACE.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.5 },
  statValue: { fontFamily: FONT_FAMILY.bold, fontSize: 22, color: colors.textPrimary, marginTop: 2 },
  statSubText: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted },

  bmiCard: {
    flexDirection: "row",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACE.lg,
    gap: SPACE.lg,
    backgroundColor: isDark ? '#000000' : '#F5F4FA',
    alignItems: "center",
  },
  bmiLeft: { alignItems: "center", gap: SPACE.xs, minWidth: 80 },
  bmiLabel: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: colors.textTertiary },
  bmiValue: { fontFamily: FONT_FAMILY.bold, fontSize: 36 },
  bmiPill: { paddingHorizontal: SPACE.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  bmiPillText: { fontFamily: FONT_FAMILY.bold, fontSize: 11 },
  bmiRight: { flex: 1, gap: 6 },
  emptyBmiCard: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: SPACE.xl,
    backgroundColor: isDark ? '#000000' : '#F5F4FA',
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.xs,
  },
  iconBadge: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: isDark ? '#1c1c1f' : '#E2E1EA',
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  emptyBmiTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
  emptyBmiText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  metricRow: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm },
  metricLabel: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: colors.textTertiary },
  metricValue: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textPrimary },
  
  sectionCard: { backgroundColor: isDark ? '#000000' : '#F5F4FA', borderRadius: RADIUS.xl, padding: SPACE.lg, borderWidth: 1, borderColor: colors.border, gap: SPACE.sm },
  sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary, backgroundColor: isDark ? '#1c1c1f' : '#E2E1EA', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },

  progressTrack: { height: 8, backgroundColor: isDark ? '#1c1c1f' : '#E2E1EA', borderRadius: RADIUS.full, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary, borderRadius: RADIUS.full },
  progressLabels: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted },
  chartContainer: { alignItems: "center", marginTop: 4 },

  logWeightBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACE.md,
  },
  logWeightBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: isDark ? '#000000' : '#FFFFFF' },
  
  logForm: { gap: SPACE.md, backgroundColor: isDark ? '#000000' : '#F5F4FA', padding: SPACE.lg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border },
  formTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  inputRow: { flexDirection: "row", gap: SPACE.sm, alignItems: "flex-end" },
  inputGroup: { gap: 4 },
  inputLabel: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textTertiary },
  weightInput: {
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  photoBtn: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: isDark ? '#27272A' : '#E2E1EA', alignItems: "center", justifyContent: "center" },
  photoPreviewRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, backgroundColor: isDark ? '#000000' : '#FFFFFF', padding: SPACE.xs, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border },
  photoPreviewThumb: { width: 36, height: 36, borderRadius: RADIUS.sm },
  photoAttachedText: { flex: 1, fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textPrimary },

  formActions: { flexDirection: "row", gap: SPACE.sm, alignItems: "center" },
  saveFormBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACE.xs, paddingVertical: SPACE.md, borderRadius: RADIUS.lg, backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary },
  saveFormBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: isDark ? '#000000' : '#FFFFFF' },
  cancelFormBtn: { width: 44, height: 44, borderRadius: RADIUS.lg, backgroundColor: isDark ? '#27272A' : '#E2E1EA', alignItems: "center", justifyContent: "center" },

  // History List
  historyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  historyRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  historyDateCol: {},
  historyDate: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  historyYear: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted },
  historyWeightCol: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  historyWeight: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary },
  historyWeightUnit: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },
  historyThumb: { width: 40, height: 40, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: colors.border },
  historyThumbEmpty: { width: 40, height: 40, borderRadius: RADIUS.sm, backgroundColor: isDark ? '#18181B' : '#E2E1EA', alignItems: "center", justifyContent: "center" },

  // Full Photo Viewer Modal
  fullPhotoOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)", justifyContent: "center", alignItems: "center" },
  fullPhotoCloseBtn: { position: "absolute", top: 48, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? '#27272A' : '#E2E1EA', alignItems: "center", justifyContent: "center" },
  fullPhotoContainer: { width: "100%", height: "80%", alignItems: "center", justifyContent: "center" },
  fullPhotoImage: { width: "92%", height: "88%" },
  fullPhotoCaption: { marginTop: 12, backgroundColor: isDark ? '#18181B' : '#E2E1EA', paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: colors.border },
  fullPhotoCaptionText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary },
});

