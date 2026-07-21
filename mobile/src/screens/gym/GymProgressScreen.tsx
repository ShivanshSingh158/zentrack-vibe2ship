import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform, Animated, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop, Path, G } from 'react-native-svg';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useMobileData } from '../../contexts/MobileDataContext';
import { getOverloadSuggestion } from '../../services/progressiveOverload';
import { calculateExerciseMaxWeight, calculateEstimated1RM } from '../../utils/gymUtils';
import { GymExerciseLog, GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from "../../contexts/ThemeContext";
import * as ImagePicker from 'expo-image-picker';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import BeforeAfterSlider from '../../components/Gym/BeforeAfterSlider';

const { width } = Dimensions.get('window');

export default function GymProgressScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'GymProgress'>>();
  const { gymLogs, weightLogs, user } = useMobileData();

  // Tabs
  const [activeTab, setActiveTab] = useState<'strength' | 'physique'>('strength');

  // Physique state
  const [weightInput, setWeightInput] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Animations
  const animHeader = useRef(new Animated.Value(0)).current;
  const animChart = useRef(new Animated.Value(0)).current;
  const animStats = useRef(new Animated.Value(0)).current;
  const animPie = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(animHeader, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(animChart, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animStats, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animPie, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  // 1. Get all unique exercises logged by user
  const uniqueExercises = useMemo(() => {
    const exMap = new Map<string, string>();
    gymLogs.forEach(log => {
      log.exercises?.forEach(ex => {
        if (!exMap.has(ex.exerciseId)) {
          exMap.set(ex.exerciseId, ex.name);
        }
      });
    });
    return Array.from(exMap.entries()).map(([id, name]) => ({ id, name }));
  }, [gymLogs]);

  const [selectedExId, setSelectedExId] = useState<string | null>(
    uniqueExercises.length > 0 ? uniqueExercises[0].id : null
  );

  // 2. Compute stats and chart data for selected exercise
  const { chartData, maxWeight, monthlyImprovement, totalSessions, plateauMessage } = useMemo(() => {
    if (!selectedExId) return { chartData: [], maxWeight: 0, monthlyImprovement: 0, totalSessions: 0, plateauMessage: null };

    let sessionsWithEx = gymLogs
      .map(log => {
        const ex = log.exercises?.find(e => e.exerciseId === selectedExId);
        if (!ex) return null;
        
        const maxWeightForSession = calculateEstimated1RM(ex as any);
        if (maxWeightForSession === 0) return null;
        return {
          date: new Date(log.date),
          maxWeight: maxWeightForSession,
          log
        };
      })
      .filter(Boolean) as { date: Date, maxWeight: number, log: any }[];

    sessionsWithEx = sessionsWithEx.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totalSessions = sessionsWithEx.length;
    let maxWeight = 0;
    
    // Improvement calc
    const now = new Date();
    let currentMonthMax = 0;
    let lastMonthMax = 0;

    sessionsWithEx.forEach(s => {
      if (s.maxWeight > maxWeight) maxWeight = s.maxWeight;
      
      const isCurrentMonth = s.date.getMonth() === now.getMonth() && s.date.getFullYear() === now.getFullYear();
      const isLastMonth = (now.getMonth() === 0 && s.date.getMonth() === 11 && s.date.getFullYear() === now.getFullYear() - 1) 
                       || (s.date.getMonth() === now.getMonth() - 1 && s.date.getFullYear() === now.getFullYear());

      if (isCurrentMonth && s.maxWeight > currentMonthMax) currentMonthMax = s.maxWeight;
      if (isLastMonth && s.maxWeight > lastMonthMax) lastMonthMax = s.maxWeight;
    });

    const monthlyImprovement = lastMonthMax > 0 ? currentMonthMax - lastMonthMax : 0;

    let plateauMessage = null;
    if (sessionsWithEx.length >= 3) {
      const recent = sessionsWithEx.slice(-3);
      const first = recent[0].maxWeight;
      const last = recent[2].maxWeight;
      if (first > 0 && Math.abs(last - first) / first <= 0.05) {
        plateauMessage = `⚠️ SARA Insight: Your 1RM has been stuck around ${Math.round(last)}kg for 3 sessions. Drop the weight by 10% next time and increase reps to break the plateau.`;
      }
    }

    return { chartData: sessionsWithEx, maxWeight, monthlyImprovement, totalSessions, plateauMessage };
  }, [gymLogs, selectedExId]);

  // 3. SVG Chart calculations
  const CHART_HEIGHT = 200;
  const CHART_WIDTH = width - SPACE.xl * 2;
  const PADDING = 20;

  const points = useMemo(() => {
    if (chartData.length === 0) return '';
    if (chartData.length === 1) {
      return `${PADDING},${CHART_HEIGHT / 2}`;
    }

    const minWeight = Math.min(...chartData.map(d => d.maxWeight));
    const weightRange = maxWeight - minWeight || 1; // avoid div by 0

    return chartData.map((d, i) => {
      const x = PADDING + (i / (chartData.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - ((d.maxWeight - minWeight) / weightRange) * (CHART_HEIGHT - PADDING * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [chartData, maxWeight, CHART_WIDTH]);

  const chartCoords = useMemo(() => {
     if (chartData.length === 0) return [];
     if (chartData.length === 1) return [{ x: PADDING, y: CHART_HEIGHT / 2, data: chartData[0] }];
     const minWeight = Math.min(...chartData.map(d => d.maxWeight));
     const weightRange = maxWeight - minWeight || 1;
     return chartData.map((d, i) => {
        return {
          x: PADDING + (i / (chartData.length - 1)) * (CHART_WIDTH - PADDING * 2),
          y: CHART_HEIGHT - PADDING - ((d.maxWeight - minWeight) / weightRange) * (CHART_HEIGHT - PADDING * 2),
          data: d
        };
     });
  }, [chartData, maxWeight, CHART_WIDTH]);

  const smoothPath = useMemo(() => {
    if (chartCoords.length === 0) return '';
    if (chartCoords.length === 1) return `M ${chartCoords[0].x},${chartCoords[0].y}`;
    let path = `M ${chartCoords[0].x},${chartCoords[0].y}`;
    for (let i = 0; i < chartCoords.length - 1; i++) {
      const xMid = (chartCoords[i].x + chartCoords[i + 1].x) / 2;
      path += ` C ${xMid},${chartCoords[i].y} ${xMid},${chartCoords[i+1].y} ${chartCoords[i+1].x},${chartCoords[i+1].y}`;
    }
    return path;
  }, [chartCoords]);

  // Physique Logic
  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleLogWeight = async () => {
    if (!weightInput || !user) return;
    setIsUploading(true);
    try {
      let url = null;
      if (photoUri) {
        const res = await uploadFileToCloudinary(photoUri, 'image/jpeg', 'photo.jpg', (progress) => console.log(progress));
        url = res.url;
      }
      await addDoc(collection(db, 'weight_logs'), {
        userId: user.uid,
        weightKg: parseFloat(weightInput),
        photoUrl: url,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      });
      setWeightInput('');
      setPhotoUri(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
    }
  };

  const sortedWeightLogs = useMemo(() => {
    return [...weightLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [weightLogs]);

  const beforePhoto = sortedWeightLogs.find(l => l.photoUrl)?.photoUrl;
  const afterPhoto = [...sortedWeightLogs].reverse().find(l => l.photoUrl)?.photoUrl;

  const bodyWeightPoints = useMemo(() => {
    if (sortedWeightLogs.length === 0) return '';
    if (sortedWeightLogs.length === 1) return `${PADDING},${CHART_HEIGHT / 2}`;

    const maxW = Math.max(...sortedWeightLogs.map(w => w.weightKg));
    const minW = Math.min(...sortedWeightLogs.map(w => w.weightKg));
    const weightRange = maxW - minW || 1;

    return sortedWeightLogs.map((d, i) => {
      const x = PADDING + (i / (sortedWeightLogs.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - ((d.weightKg - minW) / weightRange) * (CHART_HEIGHT - PADDING * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [sortedWeightLogs, CHART_WIDTH]);

  // 4. Pie Chart Data
  const volumeData = useMemo(() => {
    const vMap = new Map<string, { name: string, volume: number }>();
    gymLogs.forEach(log => {
      log.exercises?.forEach(ex => {
        let vol = 0;
        ex.setsLog.filter((s: any) => s.completed && s.weight && s.reps).forEach((s: any) => {
          vol += (s.weight * s.reps);
        });
        if (vol > 0) {
          const existing = vMap.get(ex.exerciseId) || { name: ex.name, volume: 0 };
          vMap.set(ex.exerciseId, { name: ex.name, volume: existing.volume + vol });
        }
      });
    });
    
    let sorted = Array.from(vMap.values()).sort((a, b) => b.volume - a.volume);
    
    if (sorted.length > 4) {
      const top4 = sorted.slice(0, 4);
      const others = sorted.slice(4).reduce((sum, item) => sum + item.volume, 0);
      top4.push({ name: 'Other', volume: others });
      return top4;
    }
    return sorted;
  }, [gymLogs]);

  const PIE_SIZE = 220;
  const PIE_RADIUS = 90;
  const PIE_INNER_RADIUS = 50;
  
  const pieSlices = useMemo(() => {
    const total = volumeData.reduce((s, d) => s + d.volume, 0);
    if (total === 0) return [];
    let currentAngle = -Math.PI / 2; // Start from top
    return volumeData.map((d, i) => {
      const sliceAngle = (d.volume / total) * Math.PI * 2;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle += sliceAngle;
      
      const x1 = PIE_SIZE/2 + Math.cos(startAngle) * PIE_RADIUS;
      const y1 = PIE_SIZE/2 + Math.sin(startAngle) * PIE_RADIUS;
      const x2 = PIE_SIZE/2 + Math.cos(endAngle) * PIE_RADIUS;
      const y2 = PIE_SIZE/2 + Math.sin(endAngle) * PIE_RADIUS;
      
      const ix1 = PIE_SIZE/2 + Math.cos(startAngle) * PIE_INNER_RADIUS;
      const iy1 = PIE_SIZE/2 + Math.sin(startAngle) * PIE_INNER_RADIUS;
      const ix2 = PIE_SIZE/2 + Math.cos(endAngle) * PIE_INNER_RADIUS;
      const iy2 = PIE_SIZE/2 + Math.sin(endAngle) * PIE_INNER_RADIUS;
  
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      
      const path = `
        M ${x1} ${y1}
        A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${x2} ${y2}
        L ${ix2} ${iy2}
        A ${PIE_INNER_RADIUS} ${PIE_INNER_RADIUS} 0 ${largeArc} 0 ${ix1} ${iy1}
        Z
      `;
      
      return { ...d, path, color: ['#C490FF', '#7C3AED', '#4C1D95', '#F59E0B', '#34C759'][i % 5], percent: ((d.volume / total) * 100).toFixed(0) };
    });
  }, [volumeData]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: animHeader, transform: [{ translateY: animHeader.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress</Text>
        <View style={{ width: 24 }} />
      </Animated.View>

        {/* Custom Tabs */}
        <View style={{ flexDirection: 'row', marginHorizontal: SPACE.md, marginTop: SPACE.lg, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.md, padding: 4 }}>
          <TouchableOpacity 
            style={[{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm }, activeTab === 'strength' && { backgroundColor: colors.accentPrimary }]}
            onPress={() => setActiveTab('strength')}
          >
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: activeTab === 'strength' ? '#000' : colors.textPrimary }}>Strength</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm }, activeTab === 'physique' && { backgroundColor: colors.accentPrimary }]}
            onPress={() => setActiveTab('physique')}
          >
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: activeTab === 'physique' ? '#000' : colors.textPrimary }}>Physique</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
        {activeTab === 'strength' ? (
          <>
            {/* Filter */}
            <View style={styles.pickerContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
                {uniqueExercises.map(ex => (
                  <TouchableOpacity 
                    key={ex.id} 
                    style={[styles.pill, selectedExId === ex.id && styles.pillActive]}
                    onPress={() => setSelectedExId(ex.id)}
                  >
                    <Text style={[styles.pillText, selectedExId === ex.id && styles.pillTextActive]}>{ex.name}</Text>
                  </TouchableOpacity>
                ))}
                {uniqueExercises.length === 0 && (
                  <Text style={styles.emptyText}>No exercises logged yet.</Text>
                )}
              </ScrollView>
            </View>

            {/* Chart */}
            {selectedExId && chartData.length > 0 ? (
              <Animated.View style={[styles.chartCard, { opacity: animChart, transform: [{ translateY: animChart.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
                <Text style={styles.chartTitle}>Estimated 1-Rep Max (1RM)</Text>
                <View style={styles.svgContainer}>
                  <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                    <Defs>
                      <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#C490FF" stopOpacity="0.4" />
                        <Stop offset="1" stopColor="#C490FF" stopOpacity="0.0" />
                      </LinearGradient>
                    </Defs>
                    
                    {/* Grid Lines */}
                    <Path d={`M 0 ${PADDING} L ${CHART_WIDTH} ${PADDING}`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                    <Path d={`M 0 ${CHART_HEIGHT / 2} L ${CHART_WIDTH} ${CHART_HEIGHT / 2}`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                    <Path d={`M 0 ${CHART_HEIGHT - PADDING} L ${CHART_WIDTH} ${CHART_HEIGHT - PADDING}`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                    
                    {/* Y-Axis Labels (Approximate min, mid, max) */}
                    <Text style={[styles.axisLabel, { position: 'absolute', top: PADDING - 8, right: 0 }]}>{maxWeight}</Text>
                    <Text style={[styles.axisLabel, { position: 'absolute', top: CHART_HEIGHT - PADDING - 8, right: 0 }]}>{Math.min(...chartData.map(d => d.maxWeight))}</Text>
                    
                    {chartData.length > 1 && (
                      <Path 
                        d={`${smoothPath} L ${CHART_WIDTH - PADDING},${CHART_HEIGHT} L ${PADDING},${CHART_HEIGHT} Z`} 
                        fill="url(#grad)" 
                      />
                    )}
                    <Path
                      d={smoothPath}
                      fill="none"
                      stroke="#C490FF"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {chartCoords.map((pt, idx) => (
                      <Circle 
                        key={idx} 
                        cx={pt.x} 
                        cy={pt.y} 
                        r={5} 
                        fill="#1C1C1E" 
                        stroke="#C490FF" 
                        strokeWidth="2.5" 
                        onPress={() => {
                          navigation.navigate('WorkoutSummary', { date: pt.data.log.date, readOnly: true });
                        }}
                      />
                    ))}
                  </Svg>
                </View>
              </Animated.View>
            ) : (
               <Animated.View style={[styles.chartCard, { alignItems: 'center', justifyContent: 'center', height: 250 }, { opacity: animChart, transform: [{ translateY: animChart.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
                 <Ionicons name="bar-chart-outline" size={48} color={colors.textMuted} />
                 <Text style={styles.emptyText}>Not enough data to graph.</Text>
               </Animated.View>
            )}

            {/* Plateau Banner */}
            {plateauMessage && (
              <Animated.View style={[styles.plateauBanner, { opacity: animStats, transform: [{ translateY: animStats.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
                <Ionicons name="warning" size={20} color="#FFD60A" style={{ marginTop: 2 }} />
                <Text style={styles.plateauText}>{plateauMessage}</Text>
              </Animated.View>
            )}

            {/* Stats Row */}
            {selectedExId && (
              <Animated.View style={[styles.statsRow, { opacity: animStats, transform: [{ translateY: animStats.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Best 1RM</Text>
                  <Text style={styles.statValue}>{maxWeight > 0 ? `${maxWeight}kg` : '-'}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Monthly Imp.</Text>
                  <Text style={[styles.statValue, { color: monthlyImprovement > 0 ? '#34C759' : (monthlyImprovement < 0 ? '#FF3B30' : colors.textPrimary) }]}>
                    {monthlyImprovement > 0 ? '+' : ''}{monthlyImprovement}kg
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Sessions</Text>
                  <Text style={styles.statValue}>{totalSessions}</Text>
                </View>
              </Animated.View>
            )}

            {/* Volume Pie Chart */}
            {pieSlices.length > 0 && (
              <Animated.View style={[styles.pieCard, { opacity: animPie, transform: [{ translateY: animPie.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
                <Text style={styles.chartTitle}>Total Volume Breakdown</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Svg width={PIE_SIZE} height={PIE_SIZE}>
                    {pieSlices.map((slice, idx) => (
                      <Path key={idx} d={slice.path} fill={slice.color} stroke={colors.surface} strokeWidth={2} />
                    ))}
                  </Svg>
                  
                  <View style={styles.legendContainer}>
                    {pieSlices.map((slice, idx) => (
                      <View key={idx} style={styles.legendRow}>
                        <View style={[styles.legendColor, { backgroundColor: slice.color }]} />
                        <View>
                          <Text style={styles.legendName} numberOfLines={1}>{slice.name}</Text>
                          <Text style={styles.legendPercent}>{slice.percent}%</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </Animated.View>
            )}
          </>
        ) : (
          <View style={{ padding: SPACE.md }}>
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: SPACE.lg }}>Log Body Weight</Text>
            
            <View style={{ flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.md }}>
              <TextInput 
                style={[styles.input, { flex: 1 }]}
                placeholder="Weight in kg"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                value={weightInput}
                onChangeText={setWeightInput}
              />
              <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto}>
                <Ionicons name="camera-outline" size={24} color={photoUri ? colors.accentPrimary : colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.logBtn, isUploading && { opacity: 0.6 }]} onPress={handleLogWeight} disabled={isUploading}>
                <Text style={styles.logBtnText}>{isUploading ? "..." : "Log"}</Text>
              </TouchableOpacity>
            </View>

            {sortedWeightLogs.length > 0 && (
              <View style={[styles.chartCard, { marginTop: SPACE.xl }]}>
                <Text style={styles.chartTitle}>Weight Trend</Text>
                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                  <Polyline
                    points={bodyWeightPoints}
                    fill="none"
                    stroke={colors.accentPrimary}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            )}

            {beforePhoto && afterPhoto && beforePhoto !== afterPhoto && (
              <View style={{ marginTop: SPACE.xl }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: SPACE.md }}>Before & After</Text>
                <View style={{ alignItems: 'center', marginTop: SPACE.md }}>
                  <BeforeAfterSlider beforeImage={beforePhoto} afterImage={afterPhoto} />
                </View>
              </View>
            )}
          </View>
        )}
        </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.xl, paddingTop: Platform.OS === 'ios' ? 10 : 20, paddingBottom: SPACE.md },
      backBtn: { padding: SPACE.xs },
      headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary },
      
      pickerContainer: { paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
      pickerScroll: { paddingHorizontal: SPACE.xl, gap: SPACE.sm },
      pill: { paddingHorizontal: SPACE.md, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
      pillActive: { backgroundColor: '#C490FF', borderColor: '#C490FF' },
      pillText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      pillTextActive: { color: colors.background },
      
      content: { paddingBottom: 150 },
      
      chartCard: { backgroundColor: 'rgba(28, 28, 30, 0.7)', borderRadius: RADIUS.xl, padding: SPACE.lg, marginBottom: SPACE.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', ...SHADOW.md },
      chartTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginBottom: SPACE.lg },
      svgContainer: { alignItems: 'center' },
      axisLabel: { fontFamily: FONT_FAMILY.mono, fontSize: 10, color: colors.textMuted },
      
      statsRow: { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.xl, paddingHorizontal: SPACE.xl },
      statBox: { flex: 1, backgroundColor: 'rgba(28, 28, 30, 0.7)', borderRadius: RADIUS.lg, padding: SPACE.lg, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', ...SHADOW.sm },
      
      plateauBanner: { flexDirection: 'row', backgroundColor: 'rgba(255, 214, 10, 0.1)', padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.xl, borderWidth: 1, borderColor: 'rgba(255, 214, 10, 0.3)', gap: SPACE.sm, marginHorizontal: SPACE.xl },
      plateauText: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#FFD60A', lineHeight: 18 },

      statLabel: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
      statValue: { fontFamily: FONT_FAMILY.bold, fontSize: 22, color: colors.textPrimary },
      
      pieCard: { backgroundColor: 'rgba(28, 28, 30, 0.7)', borderRadius: RADIUS.xl, padding: SPACE.lg, marginBottom: SPACE.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', ...SHADOW.md, marginHorizontal: SPACE.xl },
      legendContainer: { flex: 1, paddingLeft: SPACE.md, gap: SPACE.md },
      legendRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
      legendColor: { width: 12, height: 12, borderRadius: 6 },
      legendName: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textPrimary },
      legendPercent: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textMuted },

      emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: SPACE.md,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
  },
  photoBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.md,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtn: {
    backgroundColor: colors.accentPrimary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnText: {
    color: '#000',
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  },
    });
