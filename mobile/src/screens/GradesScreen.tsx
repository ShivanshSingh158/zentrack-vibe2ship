import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Dimensions, ScrollView, Pressable } from 'react-native';
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


const GRADE_MAP: Record<string, number> = {
  'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C': 6, 'D': 5, 'F': 0
};

export default function GradesScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
  const { semesters, semesterSubjects } = useAcademicData();
  const { user } = useCoreData();

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
    
    setTimeout(() => {
      addDoc(collection(db, COLLECTION.SEMESTERS), {
        userId: user.uid,
        name: semName.trim(),
        order: semesters.length,
        createdAt: Date.now()
      }).catch(handleSyncError);
    }, 150);
    
    setSemModalVisible(false);
    setSemName('');
  };

  const handleAddSub = () => {
    if (!subName.trim() || !activeSemId || !user) return;
    
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    setTimeout(() => {
      addDoc(collection(db, COLLECTION.SEMESTER_SUBJECTS), {
        userId: user.uid,
        semesterId: activeSemId,
        name: subName.trim(),
        credits: parseInt(subCredits) || 4,
        grade: subGrade.toUpperCase(),
      }).catch(handleSyncError);
    }, 150);
    
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

    setTimeout(() => {
      updateDoc(doc(db, COLLECTION.SEMESTERS, activeSemId), {
        sgpa: sgpaVal,
        totalCredits: creditsVal
      }).catch(handleSyncError);
    }, 150);
    
    setDirectModalVisible(false);
  };

  const handleClearDirect = async (semId: string) => {
    try {
      await updateDoc(doc(db, COLLECTION.SEMESTERS, semId), {
        sgpa: null,
        totalCredits: null
      });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteSem = (id: string) => {
    Alert.alert('Delete Semester', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, COLLECTION.SEMESTERS, id)) }
    ]);
  };

  const deleteSub = (id: string) => {
    Alert.alert('Delete Subject', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, COLLECTION.SEMESTER_SUBJECTS, id)) }
    ]);
  };

  const renderChart = () => {
    const width = Dimensions.get('window').width - 40;
    const height = 140;
    const padX = 20;
    const padY = 20;
    const usableWidth = width - padX * 2;
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
            <Svg width={width - 40} height={height}>
              {/* Grid lines */}
              {[0, 5, 10].map(val => (
                <Line
                  key={val}
                  x1={padX}
                  y1={padY + usableHeight - (val/10)*usableHeight}
                  x2={width - 40 - padX}
                  y2={padY + usableHeight - (val/10)*usableHeight}
                  stroke={isDark ? "#2c2c2e" : colors.border}
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
                    fill={isDark ? "#3a3a3c" : "#E2E1EA"}
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
              <View style={{ width: 12, height: 12, backgroundColor: isDark ? '#3a3a3c' : '#E2E1EA', borderRadius: 2, borderWidth: isDark ? 0 : 1, borderColor: '#D1D0DC' }} />
              <Text style={styles.legendText}>SGPA</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 2, backgroundColor: colors.accentPrimary }} />
              <Text style={styles.legendText}>CGPA</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={{ paddingBottom: 16 }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <View style={styles.iconCircle}>
            <Ionicons name="calculator" size={18} color={colors.accentPrimary} />
          </View>
          <View>
            <Text style={styles.screenTitle}>Grade calculator</Text>
            <Text style={styles.screenSubtitle}>Track and predict CGPA</Text>
          </View>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View>
          <Text style={styles.heroLabel}>CUMULATIVE GPA</Text>
          <Text style={[styles.heroValue, !currentCGPA && { color: colors.textMuted }]}>{currentCGPA || '--'}</Text>
        </View>
        <View style={styles.iconCircleLg}>
          <Ionicons name="school" size={20} color={colors.accentPrimary} />
        </View>
      </View>

      <View style={styles.targetCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={styles.sectionHeading}>What do I need?</Text>
          <View style={styles.infoCircle}>
            <Ionicons name="information" size={14} color={colors.textMuted} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
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
            <Text style={styles.inputLabel}>Next credits</Text>
            <TextInput
              style={styles.targetInput}
              value={targetCredits}
              onChangeText={setTargetCredits}
              keyboardType="number-pad"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inputLabel, { color: colors.accentPrimary, textAlign: 'center', fontFamily: FONT_FAMILY.bold }]}>NEEDED</Text>
            <View style={[
              styles.targetResultBox,
              targetNeeded && !targetNeeded.achievable && {
                borderColor: isDark ? 'rgba(255,105,97,0.3)' : '#DC2626',
                backgroundColor: isDark ? 'rgba(255,105,97,0.1)' : '#FEF2F2',
              },
              targetNeeded && targetNeeded.neededSGPA <= 0 && {
                borderColor: isDark ? 'rgba(94,218,158,0.3)' : '#059669',
                backgroundColor: isDark ? 'rgba(94,218,158,0.1)' : '#ECFDF5',
              }
            ]}>
              <Text style={[
                styles.targetResultValue,
                targetNeeded && !targetNeeded.achievable && { color: colors.error, fontSize: 13 },
                targetNeeded && targetNeeded.neededSGPA <= 0 && { color: colors.priorityLow, fontSize: 14 }
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

      {renderChart()}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 8 }}>
        <Text style={styles.sectionHeading}>Semesters</Text>
        <TouchableOpacity style={styles.addBtnSmall} onPress={() => setSemModalVisible(true)}>
          <Ionicons name="add" size={16} color={isDark ? "#000" : "#FFF"} />
          <Text style={styles.addBtnSmallText}>Add</Text>
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
              <TouchableOpacity style={styles.cardHeader} onPress={() => toggleSem(sem.id!)} onLongPress={() => deleteSem(sem.id!)}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={styles.cardTitle}>{sem.name}</Text>
                    {isDirect && <View style={styles.quickBadge}><Text style={styles.quickBadgeText}>QUICK MODE</Text></View>}
                  </View>
                  <Text style={styles.cardSub}>SGPA: {sem.calcSgpa || '--'}  •  CGPA: {sem.calcCgpa || '--'}</Text>
                </View>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
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
                      {semSubs.map(sub => (
                        <TouchableOpacity key={sub.id} style={styles.subRow} onLongPress={() => deleteSub(sub.id!)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subTitle}>{sub.name}</Text>
                            <Text style={styles.subCredits}>{sub.credits} Credits</Text>
                          </View>
                          <View style={styles.gradeBadge}>
                            <Text style={styles.gradeBadgeText}>{sub.grade}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}

                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                        <TouchableOpacity 
                          style={styles.addSubBtn}
                          onPress={() => { setActiveSemId(sem.id!); setSubModalVisible(true); }}
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
            title="Clean slate"
            subtitle="No semesters added yet. Track your academic progress here."
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

      {/* Semester Modal */}
      {semModalVisible && (
        <Modal visible={semModalVisible} transparent animationType="fade" onRequestClose={() => setSemModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSemModalVisible(false)} />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>New Semester</Text>
              <TextInput
                style={styles.input}
                placeholder="E.g., Fall 2026"
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
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Subject Modal */}
      {subModalVisible && (
        <Modal visible={subModalVisible} transparent animationType="fade" onRequestClose={() => setSubModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSubModalVisible(false)} />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add Subject</Text>
              
              <Text style={styles.modalInputLabel}>Subject Name</Text>
              <TextInput
                style={styles.input}
                placeholder="E.g., Physics 101"
                placeholderTextColor={colors.textMuted}
                value={subName}
                onChangeText={setSubName}
              />

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
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
                  <Text style={styles.modalInputLabel}>Grade</Text>
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
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Direct SGPA Modal */}
      {directModalVisible && (
        <Modal visible={directModalVisible} transparent animationType="fade" onRequestClose={() => setDirectModalVisible(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDirectModalVisible(false)} />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Direct SGPA Mode</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: FONT_FAMILY.body, marginBottom: 20 }}>Skip adding subjects individually. Just enter the final SGPA and total credits.</Text>
              
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalInputLabel}>Final SGPA</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="8.5"
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
          </KeyboardAvoidingView>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  
  header: { marginBottom: 24, marginTop: 8 },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  iconCircleLg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  screenTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary },
  screenSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },

  heroCard: {
    backgroundColor: isDark ? '#141415' : '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10.5, color: colors.textMuted, letterSpacing: 1, marginBottom: 4 },
  heroValue: { fontFamily: FONT_FAMILY.bold, fontSize: 32, color: colors.textPrimary },

  targetCard: {
    backgroundColor: isDark ? '#141415' : '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeading: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary, fontSize: 15 },
  infoCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: isDark ? '#1c1c1e' : '#F0EFF7',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E2E1EA',
    justifyContent: 'center',
    alignItems: 'center'
  },
  
  inputLabel: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted, marginBottom: 8 },
  targetInput: {
    backgroundColor: isDark ? '#1c1c1e' : '#F0EFF7',
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    borderWidth: isDark ? 0 : 1,
    borderColor: colors.border,
  },
  
  targetResultBox: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.08)',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.3)' : 'rgba(108,92,231,0.25)',
  },
  targetResultValue: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.accentPrimary },

  chartContainer: { marginTop: 8 },
  chartBox: {
    backgroundColor: isDark ? '#141415' : '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
  legendText: { fontSize: 10, color: colors.textMuted, fontFamily: FONT_FAMILY.bold },

  addBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4
  },
  addBtnSmallText: { fontFamily: FONT_FAMILY.bold, color: isDark ? '#000000' : '#FFFFFF', fontSize: 12 },

  list: { paddingHorizontal: 20, paddingBottom: 100 },
  card: {
    backgroundColor: isDark ? '#141415' : '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  cardSub: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  
  quickBadge: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  quickBadgeText: { color: colors.accentPrimary, fontSize: 8, fontFamily: FONT_FAMILY.bold },

  cardExpanded: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: colors.border },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  subTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary },
  subCredits: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  gradeBadge: {
    backgroundColor: isDark ? '#1c1c1d' : '#F0EFF7',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#E2E1EA',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6
  },
  gradeBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.accentPrimary },
  
  addSubBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : 'rgba(108,92,231,0.2)',
    borderRadius: 10
  },
  directSgpaBtn: {
    backgroundColor: isDark ? '#1c1c1e' : '#F0EFF7',
    borderColor: isDark ? 'transparent' : '#E2E1EA',
  },
  addSubText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.accentPrimary },
  clearDirectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.error
  },

  empty: { padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  emptyText: { fontFamily: FONT_FAMILY.body, color: colors.textMuted, fontSize: 13, marginTop: 12 },

  modalOverlay: { flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: isDark ? (colors.surfaceRaised || '#18181b') : '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 20 },
  modalInputLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#F0EFF7',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14
  },
  
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#E2E1EA',
  },
  cancelBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  saveBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimary
  },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: isDark ? '#000000' : '#FFFFFF' },
});
