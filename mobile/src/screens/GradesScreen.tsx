import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Dimensions, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import type { Semester, SemesterSubject } from '../contexts/MobileDataContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";
import { handleSyncError } from '../utils/errorUtils';
import EmptyState from '../components/ui/EmptyState';
import BottomSheet from '../components/ui/BottomSheet';
import AnimatedPressable from '../components/AnimatedPressable';
import { safeAdd, safeUpdate, safeDelete } from '../utils/safeWrite';

const GRADE_MAP: Record<string, number> = {
  'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C': 6, 'D': 5, 'F': 0
};

const GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  'A+': { bg: 'rgba(165,153,255,0.18)', text: '#A599FF' },
  'A':  { bg: 'rgba(94,218,158,0.18)',  text: '#5EDA9E' },
  'B+': { bg: 'rgba(56,189,248,0.18)',  text: '#38BDF8' },
  'B':  { bg: 'rgba(251,191,36,0.18)',  text: '#FBBF24' },
  'C':  { bg: 'rgba(251,146,60,0.18)',  text: '#FB923C' },
  'D':  { bg: 'rgba(248,113,113,0.18)', text: '#F87171' },
  'F':  { bg: 'rgba(239,68,68,0.22)',   text: '#EF4444' },
};

export default function GradesScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { semesters, semesterSubjects, ensureSubscribed } = useAcademicData();
  const { user } = useCoreData();

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  const [semModalVisible, setSemModalVisible] = useState(false);
  const [subModalVisible, setSubModalVisible] = useState(false);
  const [directModalVisible, setDirectModalVisible] = useState(false);
  
  const [activeSemId, setActiveSemId] = useState<string | null>(null);

  // Sem form
  const [semName, setSemName] = useState('');
  
  // Sub form
  const [subName, setSubName] = useState('');
  const [subCredits, setSubCredits] = useState('4');
  const [subGrade, setSubGrade] = useState('A+');

  // Direct form
  const [directSGPA, setDirectSGPA] = useState('');
  const [directCredits, setDirectCredits] = useState('24');
  
  // Target Calculator
  const [targetCGPA, setTargetCGPA] = useState('9.0');
  const [targetCredits, setTargetCredits] = useState('24');

  const [saving, setSaving] = useState(false);
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());

  const toggleSem = (id: string) => {
    const newSet = new Set(expandedSems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedSems(newSet);
  };

  const calculateSGPA = (semSubs: SemesterSubject[]) => {
    const graded = semSubs.filter(s => s.grade && GRADE_MAP[s.grade] != null);
    if (graded.length === 0) return null;
    let totalCredits = 0, totalPoints = 0;
    graded.forEach(s => {
      const gp = GRADE_MAP[s.grade!];
      totalCredits += s.credits;
      totalPoints  += s.credits * gp;
    });
    return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : null;
  };

  const cgpaData = useMemo(() => {
    let cumCredits = 0, cumPoints = 0;
    const sortedSems = [...semesters].sort((a, b) => a.order - b.order);
    
    return sortedSems.map(sem => {
      const isDirect = sem.sgpa != null && sem.totalCredits != null;
      let sgpa = null;
      let credits = 0;

      if (isDirect) {
        sgpa = sem.sgpa!;
        credits = sem.totalCredits!;
        cumCredits += credits;
        cumPoints += credits * sgpa;
      } else {
        const semSubs = semesterSubjects.filter(s => s.semesterId === sem.id);
        const calc = calculateSGPA(semSubs);
        sgpa = calc ? parseFloat(calc) : null;
        semSubs.forEach(s => {
          if (s.grade && GRADE_MAP[s.grade] != null) {
            cumCredits += s.credits;
            cumPoints  += s.credits * GRADE_MAP[s.grade!];
          }
        });
        credits = semSubs.reduce((acc, sub) => acc + sub.credits, 0);
      }
      const cgpa = cumCredits > 0 ? cumPoints / cumCredits : null;
      return {
        ...sem,
        calcSgpa: sgpa,
        calcCgpa: cgpa ? parseFloat(cgpa.toFixed(2)) : null,
      };
    });
  }, [semesters, semesterSubjects]);

  const currentCGPA = cgpaData.length > 0 ? cgpaData[cgpaData.length - 1].calcCgpa : null;
  const totalCompletedCredits = useMemo(() => {
    return semesters.reduce((acc, sem) => {
      if (sem.totalCredits) return acc + sem.totalCredits;
      const semSubs = semesterSubjects.filter(s => s.semesterId === sem.id);
      return acc + semSubs.reduce((sAcc, sub) => sAcc + sub.credits, 0);
    }, 0);
  }, [semesters, semesterSubjects]);

  const targetNeeded = useMemo(() => {
    if (!currentCGPA || semesters.length < 1) return null;
    const target = parseFloat(targetCGPA);
    if (isNaN(target) || target > 10) return null;
    let totalCredits = 0, totalPoints = 0;
    
    semesters.forEach(sem => {
      if (sem.sgpa != null && sem.totalCredits != null) {
        totalCredits += sem.totalCredits;
        totalPoints += sem.totalCredits * sem.sgpa;
      } else {
        const semSubs = semesterSubjects.filter(s => s.semesterId === sem.id);
        semSubs.forEach(s => {
          if (s.grade && GRADE_MAP[s.grade] != null) {
            totalCredits += s.credits;
            totalPoints  += s.credits * GRADE_MAP[s.grade!];
          }
        });
      }
    });

    const nextCredits = parseInt(targetCredits) || 24;
    if (nextCredits <= 0) return null;
    
    const neededPoints = target * (totalCredits + nextCredits) - totalPoints;
    const neededSGPA = neededPoints / nextCredits;
    
    return { 
      neededSGPA, 
      achievable: neededSGPA <= 10 
    };
  }, [currentCGPA, targetCGPA, targetCredits, semesters, semesterSubjects]);

  const handleAddSem = () => {
    if (!semName.trim() || !user) return;
    
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    const semData = {
      userId: user.uid,
      name: semName.trim(),
      order: semesters.length,
      createdAt: Date.now()
    };
    safeAdd(
      COLLECTION.SEMESTERS,
      semData,
      () => addDoc(collection(db, COLLECTION.SEMESTERS), semData)
    ).catch(handleSyncError);
    
    setSemModalVisible(false);
    setSemName('');
  };

  const handleAddSub = () => {
    if (!subName.trim() || !activeSemId || !user) return;
    
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    const subData = {
      userId: user.uid,
      semesterId: activeSemId,
      name: subName.trim(),
      credits: parseInt(subCredits) || 4,
      grade: subGrade.toUpperCase(),
    };
    safeAdd(
      COLLECTION.SEMESTER_SUBJECTS,
      subData,
      () => addDoc(collection(db, COLLECTION.SEMESTER_SUBJECTS), subData)
    ).catch(handleSyncError);
    
    setSubModalVisible(false);
    setSubName('');
    setSubCredits('4');
    setSubGrade('A+');
  };

  const handleSaveDirect = () => {
    if (!activeSemId || !user) return;
    const sgpaVal = parseFloat(directSGPA);
    const creditsVal = parseInt(directCredits);
    if (isNaN(sgpaVal) || sgpaVal < 0 || sgpaVal > 10) return Alert.alert('Invalid SGPA');
    if (isNaN(creditsVal) || creditsVal <= 0) return Alert.alert('Invalid credits');

    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

    const updateData = {
      sgpa: sgpaVal,
      totalCredits: creditsVal
    };
    safeUpdate(
      activeSemId,
      COLLECTION.SEMESTERS,
      updateData,
      () => updateDoc(doc(db, COLLECTION.SEMESTERS, activeSemId), updateData)
    ).catch(handleSyncError);
    
    setDirectModalVisible(false);
  };

  const handleClearDirect = async (semId: string) => {
    try {
      const clearData = {
        sgpa: null,
        totalCredits: null
      };
      await safeUpdate(
        semId,
        COLLECTION.SEMESTERS,
        clearData,
        () => updateDoc(doc(db, COLLECTION.SEMESTERS, semId), clearData)
      );
    } catch (e) {
      console.error(e);
    }
  };

  const deleteSem = (id: string) => {
    Alert.alert('Delete Semester', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          safeDelete(
            id,
            COLLECTION.SEMESTERS,
            () => deleteDoc(doc(db, COLLECTION.SEMESTERS, id))
          ).catch(handleSyncError);
        }
      }
    ]);
  };

  const deleteSub = (id: string) => {
    Alert.alert('Delete Subject', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          safeDelete(
            id,
            COLLECTION.SEMESTER_SUBJECTS,
            () => deleteDoc(doc(db, COLLECTION.SEMESTER_SUBJECTS, id))
          ).catch(handleSyncError);
        }
      }
    ]);
  };

  const renderChart = () => {
    const screenWidth = Dimensions.get('window').width;
    const cardWidth = screenWidth - 32; // 16px screen padding on left & right
    const chartWidth = cardWidth - 32;  // 16px card internal padding on left & right
    const height = 140;
    const padX = 16;
    const padY = 16;
    const usableWidth = chartWidth - padX * 2;
    const usableHeight = height - padY * 2;
    const points = cgpaData.filter(d => d.calcSgpa !== null);

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.sectionHeading}>Progression</Text>
        <View style={styles.chartBox}>
          {points.length === 0 ? (
            <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontFamily: FONT_FAMILY.body, fontSize: 13 }}>Not enough data to plot.</Text>
            </View>
          ) : (
            <Svg width={chartWidth} height={height}>
              {/* Grid lines */}
              {[0, 5, 10].map(val => (
                <Line
                  key={val}
                  x1={padX}
                  y1={padY + usableHeight - (val/10)*usableHeight}
                  x2={chartWidth - padX}
                  y2={padY + usableHeight - (val/10)*usableHeight}
                  stroke={isDark ? "rgba(255,255,255,0.08)" : colors.border}
                  strokeWidth={1}
                  strokeDasharray="4"
                />
              ))}
              
              {/* SGPA Bars */}
              {points.map((p, i) => {
                const stepX = points.length > 1 ? usableWidth / (points.length - 1) : usableWidth / 2;
                const x = padX + (points.length > 1 ? i * stepX : stepX);
                const barH = usableHeight - (padY + usableHeight - (p.calcSgpa! / 10) * usableHeight - padY);
                return (
                  <Rect
                    key={`bar-${i}`}
                    x={x - 10}
                    y={padY + usableHeight - (p.calcSgpa! / 10) * usableHeight}
                    width={20}
                    height={barH}
                    fill={isDark ? "rgba(255,255,255,0.15)" : "#E2E1EA"}
                    stroke={isDark ? "transparent" : "#D1D0DC"}
                    strokeWidth={isDark ? 0 : 1}
                    rx={4}
                  />
                );
              })}

              {/* CGPA Line */}
              {points.length > 1 && (
                <Svg>
                  {points.map((p, i) => {
                    if (i === 0) return null;
                    const stepX = usableWidth / (points.length - 1);
                    const x1 = padX + (i - 1) * stepX;
                    const y1 = padY + usableHeight - (points[i-1].calcCgpa! / 10) * usableHeight;
                    const x2 = padX + i * stepX;
                    const y2 = padY + usableHeight - (p.calcCgpa! / 10) * usableHeight;
                    return <Line key={`line-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.accentPrimary} strokeWidth={3} />;
                  })}
                </Svg>
              )}

              {/* CGPA Dots */}
              {points.map((p, i) => {
                 const stepX = points.length > 1 ? usableWidth / (points.length - 1) : usableWidth / 2;
                 const x = padX + (points.length > 1 ? i * stepX : stepX);
                 const y = padY + usableHeight - (p.calcCgpa! / 10) * usableHeight;
                 return <Circle key={`dot-${i}`} cx={x} cy={y} r={5} fill={isDark ? "#000" : "#FFFFFF"} stroke={colors.accentPrimary} strokeWidth={2} />;
              })}
            </Svg>
          )}
          <View style={styles.chartLegend}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#E2E1EA', borderRadius: 3 }} />
              <Text style={styles.legendText}>SGPA</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 14, height: 3, backgroundColor: colors.accentPrimary, borderRadius: 2 }} />
              <Text style={styles.legendText}>CGPA</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={{ paddingBottom: 16 }}>
      {/* iOS Top Screen Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.iconCircle}>
            <Ionicons name="calculator" size={20} color={colors.accentPrimary} />
          </View>
          <View>
            <Text style={styles.screenTitle}>Grade Calculator</Text>
            <Text style={styles.screenSubtitle}>Track performance & predict CGPA targets</Text>
          </View>
        </View>
      </View>

      {/* iOS Hero GPA Card */}
      <View style={styles.heroCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>CUMULATIVE GPA</Text>
          <Text style={[styles.heroValue, !currentCGPA && { color: colors.textMuted }]}>
            {currentCGPA ? currentCGPA.toFixed(2) : '--'}
          </Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <View style={styles.heroMiniBadge}>
              <Ionicons name="layers-outline" size={12} color={colors.accentPrimary} />
              <Text style={styles.heroMiniBadgeText}>{semesters.length} {semesters.length === 1 ? 'Term' : 'Terms'}</Text>
            </View>
            <View style={styles.heroMiniBadge}>
              <Ionicons name="ribbon-outline" size={12} color={isDark ? '#5EDA9E' : '#059669'} />
              <Text style={[styles.heroMiniBadgeText, { color: isDark ? '#5EDA9E' : '#059669' }]}>{totalCompletedCredits} Credits</Text>
            </View>
          </View>
        </View>

        <View style={styles.iconCircleLg}>
          <Ionicons name="school" size={26} color={colors.accentPrimary} />
        </View>
      </View>

      {/* iOS What Do I Need Predictor */}
      <View style={styles.targetCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.sectionHeading}>What Do I Need?</Text>
          </View>
          <View style={styles.infoCircle}>
            <Ionicons name="sparkles" size={13} color={colors.accentPrimary} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Target CGPA</Text>
            <TextInput
              style={styles.targetInput}
              value={targetCGPA}
              onChangeText={setTargetCGPA}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Next Credits</Text>
            <TextInput
              style={styles.targetInput}
              value={targetCredits}
              onChangeText={setTargetCredits}
              keyboardType="number-pad"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inputLabel, { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }]}>REQUIRED</Text>
            <View style={[
              styles.targetResultBox,
              targetNeeded && !targetNeeded.achievable && {
                borderColor: isDark ? 'rgba(239,68,68,0.4)' : '#EF4444',
                backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
              },
              targetNeeded && targetNeeded.neededSGPA <= 0 && {
                borderColor: isDark ? 'rgba(94,218,158,0.4)' : '#059669',
                backgroundColor: isDark ? 'rgba(94,218,158,0.12)' : '#ECFDF5',
              }
            ]}>
              <Text style={[
                styles.targetResultValue,
                targetNeeded && !targetNeeded.achievable && { color: '#EF4444', fontSize: 13 },
                targetNeeded && targetNeeded.neededSGPA <= 0 && { color: isDark ? '#5EDA9E' : '#059669', fontSize: 14 }
              ]}>
                {!targetNeeded ? '--' : (
                  targetNeeded.neededSGPA > 10 ? 'Impossible' : 
                  targetNeeded.neededSGPA <= 0 ? 'Achieved!' : 
                  targetNeeded.neededSGPA.toFixed(2)
                )}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Progression Chart */}
      {renderChart()}

      {/* Semesters Group Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 8 }}>
        <Text style={styles.sectionHeading}>Semesters ({cgpaData.length})</Text>
        <TouchableOpacity style={styles.addBtnSmall} onPress={() => setSemModalVisible(true)} activeOpacity={0.7}>
          <Ionicons name="add" size={16} color={isDark ? "#000" : "#FFF"} />
          <Text style={styles.addBtnSmallText}>Add Term</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      
      <FlatList
        ListHeaderComponent={renderHeader()}
        data={cgpaData}
        keyExtractor={s => s.id!}
        contentContainerStyle={styles.list}
        renderItem={({ item: sem }) => {
          const isExpanded = expandedSems.has(sem.id!);
          const semSubs = semesterSubjects.filter(s => s.semesterId === sem.id);
          const isDirect = sem.sgpa != null;

          return (
            <View style={styles.card}>
              <TouchableOpacity 
                style={styles.cardHeader} 
                onPress={() => toggleSem(sem.id!)} 
                onLongPress={() => deleteSem(sem.id!)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <Text style={styles.cardTitle}>{sem.name}</Text>
                    {isDirect && (
                      <View style={styles.quickBadge}>
                        <Text style={styles.quickBadgeText}>QUICK MODE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardSub}>
                    SGPA: <Text style={{ color: colors.textPrimary, fontFamily: FONT_FAMILY.bold }}>{sem.calcSgpa ?? '--'}</Text>  •  CGPA: <Text style={{ color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }}>{sem.calcCgpa ?? '--'}</Text>
                  </Text>
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.sgpaPill}>
                    <Text style={styles.sgpaPillText}>
                      {sem.calcSgpa != null ? sem.calcSgpa.toFixed(2) : '--'}
                    </Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.cardExpanded}>
                  {isDirect ? (
                    <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                      <Text style={{ color: colors.textMuted, marginBottom: 12, fontSize: 13, fontFamily: FONT_FAMILY.body }}>Using Direct SGPA ({sem.sgpa} on {sem.totalCredits} credits)</Text>
                      <TouchableOpacity onPress={() => handleClearDirect(sem.id!)} style={styles.clearDirectBtn}>
                        <Text style={{ color: colors.error, fontFamily: FONT_FAMILY.bold, fontSize: 12 }}>Clear Quick Mode</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      {semSubs.map(sub => {
                        const gradeTheme = GRADE_COLORS[sub.grade?.toUpperCase() || ''] || { bg: 'rgba(255,255,255,0.1)', text: colors.textPrimary };
                        return (
                          <TouchableOpacity key={sub.id} style={styles.subRow} onLongPress={() => deleteSub(sub.id!)} activeOpacity={0.7}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.subTitle}>{sub.name}</Text>
                              <Text style={styles.subCredits}>{sub.credits} Credits  •  {GRADE_MAP[sub.grade?.toUpperCase() || ''] || 0} GP</Text>
                            </View>
                            <View style={[styles.gradeBadge, { backgroundColor: gradeTheme.bg }]}>
                              <Text style={[styles.gradeBadgeText, { color: gradeTheme.text }]}>{sub.grade}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                        <TouchableOpacity 
                          style={styles.addSubBtn}
                          onPress={() => { setActiveSemId(sem.id!); setSubModalVisible(true); }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="add" size={16} color={colors.accentPrimary} />
                          <Text style={styles.addSubText}>Add Subject</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.addSubBtn, styles.directSgpaBtn]}
                          onPress={() => { 
                            setActiveSemId(sem.id!); 
                            setDirectSGPA(sem.calcSgpa?.toString() || '');
                            setDirectCredits(semSubs.reduce((a, b) => a + b.credits, 0).toString());
                            setDirectModalVisible(true); 
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="flash" size={14} color={colors.textMuted} />
                          <Text style={[styles.addSubText, { color: colors.textMuted }]}>Direct SGPA</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title="Clean Slate"
            subtitle="No semesters added yet. Track your academic milestones here."
            action={{
              label: "Add Semester",
              onPress: () => {
                setSemName('');
                setSemModalVisible(true);
              }
            }}
          />
        }
      />

      {/* ── New Semester BottomSheet ── */}
      {semModalVisible && (
        <BottomSheet visible={semModalVisible} onClose={() => setSemModalVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={styles.modalTitle}>New Semester</Text>
            <Text style={styles.modalSub}>Add a new academic term to your calculator.</Text>
            
            <TextInput
              style={styles.input}
              placeholder="E.g., Semester 1, Fall 2026"
              placeholderTextColor={colors.textMuted}
              value={semName}
              onChangeText={setSemName}
              autoFocus
            />
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSemModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddSem} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheet>
      )}

      {/* ── Add Subject BottomSheet ── */}
      {subModalVisible && (
        <BottomSheet visible={subModalVisible} onClose={() => setSubModalVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={styles.modalTitle}>Add Subject</Text>
            <Text style={styles.modalSub}>Enter the course details, credit value, and achieved grade.</Text>
            
            <Text style={styles.modalInputLabel}>Subject Name</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Data Structures & Algorithms"
              placeholderTextColor={colors.textMuted}
              value={subName}
              onChangeText={setSubName}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInputLabel}>Credits</Text>
                <TextInput
                  style={styles.input}
                  placeholder="4"
                  placeholderTextColor={colors.textMuted}
                  value={subCredits}
                  onChangeText={setSubCredits}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInputLabel}>Grade (A+, A, B+, etc.)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="A+"
                  placeholderTextColor={colors.textMuted}
                  value={subGrade}
                  onChangeText={setSubGrade}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSubModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddSub} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Add Subject'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheet>
      )}

      {/* ── Direct SGPA BottomSheet ── */}
      {directModalVisible && (
        <BottomSheet visible={directModalVisible} onClose={() => setDirectModalVisible(false)}>
          <View style={styles.sheetContent}>
            <Text style={styles.modalTitle}>Direct SGPA Mode</Text>
            <Text style={styles.modalSub}>Skip adding individual courses by directly setting your final SGPA and total credits.</Text>
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInputLabel}>Final SGPA</Text>
                <TextInput
                  style={styles.input}
                  placeholder="8.50"
                  placeholderTextColor={colors.textMuted}
                  value={directSGPA}
                  onChangeText={setDirectSGPA}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalInputLabel}>Total Credits</Text>
                <TextInput
                  style={styles.input}
                  placeholder="24"
                  placeholderTextColor={colors.textMuted}
                  value={directCredits}
                  onChangeText={setDirectCredits}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDirectModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDirect} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save SGPA'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheet>
      )}

    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  
  header: { marginBottom: 18, marginTop: 6 },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.08)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  iconCircleLg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.15)',
  },
  screenTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 22, color: colors.textPrimary, letterSpacing: -0.4 },
  screenSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },

  heroCard: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  heroLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, letterSpacing: 1, marginBottom: 4 },
  heroValue: { fontFamily: FONT_FAMILY.bold, fontSize: 36, color: colors.textPrimary, letterSpacing: -0.8 },
  heroMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F4FA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroMiniBadgeText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },

  targetCard: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    padding: 18,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionHeading: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary, fontSize: 16, letterSpacing: -0.2 },
  infoCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  
  inputLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10.5, color: colors.textMuted, marginBottom: 6, textAlign: 'center', letterSpacing: 0.2 },
  targetInput: {
    backgroundColor: isDark ? (colors.surface2 || 'rgba(255,255,255,0.05)') : '#F5F4FA',
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
  },
  
  targetResultBox: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.35)' : 'rgba(108,92,231,0.25)',
  },
  targetResultValue: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.accentPrimary },

  chartContainer: { marginTop: 4 },
  chartBox: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 14 },
  legendText: { fontSize: 11, color: colors.textMuted, fontFamily: FONT_FAMILY.bold },

  addBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    gap: 4
  },
  addBtnSmallText: { fontFamily: FONT_FAMILY.bold, color: isDark ? '#000000' : '#FFFFFF', fontSize: 12 },

  list: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 140 },
  card: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
  cardSub: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textMuted, marginTop: 3 },
  
  sgpaPill: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sgpaPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: colors.accentPrimary,
  },

  quickBadge: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  quickBadgeText: { color: colors.accentPrimary, fontSize: 8, fontFamily: FONT_FAMILY.bold },

  cardExpanded: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : colors.border },
  subTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  subCredits: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  gradeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 12 },

  addSubBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  directSgpaBtn: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F0EFF7',
  },
  addSubText: { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 12 },
  clearDirectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)',
  },

  sheetContent: {
    paddingHorizontal: 4,
    paddingBottom: 24,
  },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary },
  modalSub: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 16 },
  modalInputLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: isDark ? (colors.surface2 || 'rgba(255,255,255,0.05)') : '#F5F4FA',
    borderRadius: RADIUS.md,
    padding: 14,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F4FA',
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
  },
  cancelBtnText: { color: colors.textMuted, fontFamily: FONT_FAMILY.medium, fontSize: 14 },
  saveBtn: {
    flex: 2,
    backgroundColor: colors.accentPrimary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  saveBtnText: { color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold, fontSize: 14 },
});
