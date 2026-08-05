import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, Alert, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData, Semester, SemesterSubject } from '../contexts/MobileDataContext';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";
import { handleSyncError } from '../utils/errorUtils';


const GRADE_MAP: Record<string, number> = {
  'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C': 6, 'D': 5, 'F': 0
};

export default function GradesScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { semesters, semesterSubjects, user } = useMobileData();

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
                <Line key={val} x1={padX} y1={padY + usableHeight - (val/10)*usableHeight} x2={width - 40 - padX} y2={padY + usableHeight - (val/10)*usableHeight} stroke="#2c2c2e" strokeWidth={1} strokeDasharray="4" />
              ))}
              
              {/* SGPA Bars */}
              {points.map((p, i) => {
                const stepX = points.length > 1 ? usableWidth / (points.length - 1) : usableWidth / 2;
                const x = padX + (points.length > 1 ? i * stepX : stepX);
                const barH = usableHeight - (padY + usableHeight - (p.calcSgpa! / 10) * usableHeight - padY);
                return (
                  <Rect key={`bar-${i}`} x={x - 10} y={padY + usableHeight - (p.calcSgpa! / 10) * usableHeight} width={20} height={barH} fill="#3a3a3c" rx={4} />
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
                    return <Line key={`line-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a599ff" strokeWidth={3} />;
                  })}
                </Svg>
              )}

              {/* CGPA Dots */}
              {points.map((p, i) => {
                 const stepX = points.length > 1 ? usableWidth / (points.length - 1) : usableWidth / 2;
                 const x = padX + (points.length > 1 ? i * stepX : stepX);
                 const y = padY + usableHeight - (p.calcCgpa! / 10) * usableHeight;
                 return <Circle key={`dot-${i}`} cx={x} cy={y} r={5} fill="#000" stroke="#a599ff" strokeWidth={2} />;
              })}
            </Svg>
          )}
          <View style={styles.chartLegend}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, backgroundColor: '#3a3a3c', borderRadius: 2 }} />
              <Text style={styles.legendText}>SGPA</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 2, backgroundColor: '#a599ff' }} />
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
            <Ionicons name="calculator" size={18} color="#a599ff" />
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
          <Text style={[styles.heroValue, !currentCGPA && { color: '#636366' }]}>{currentCGPA || '--'}</Text>
        </View>
        <View style={styles.iconCircleLg}>
          <Ionicons name="school" size={20} color="#a599ff" />
        </View>
      </View>

      <View style={styles.targetCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={styles.sectionHeading}>What do I need?</Text>
          <View style={styles.infoCircle}>
            <Ionicons name="information" size={14} color="#8e8e93" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Target CGPA</Text>
            <TextInput style={styles.targetInput} value={targetCGPA} onChangeText={setTargetCGPA} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Next credits</Text>
            <TextInput style={styles.targetInput} value={targetCredits} onChangeText={setTargetCredits} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inputLabel, { color: '#a599ff', textAlign: 'center', fontFamily: FONT_FAMILY.bold }]}>NEEDED</Text>
            <View style={[styles.targetResultBox, targetNeeded && !targetNeeded.achievable && { borderColor: 'rgba(255,105,97,0.3)', backgroundColor: 'rgba(255,105,97,0.1)' }]}>
              <Text style={[styles.targetResultValue, targetNeeded && !targetNeeded.achievable && { color: '#ff6961', fontSize: 13 }, targetNeeded && targetNeeded.neededSGPA <= 0 && { color: '#5eda9e', fontSize: 14 }]}>
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
          <Ionicons name="add" size={16} color="#000" />
          <Text style={styles.addBtnSmallText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      
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
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#8e8e93" />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.cardExpanded}>
                  {isDirect ? (
                    <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                      <Text style={{ color: '#8e8e93', marginBottom: 12, fontSize: 13, fontFamily: FONT_FAMILY.body }}>Using Direct SGPA ({sem.sgpa} on {sem.totalCredits} credits)</Text>
                      <TouchableOpacity onPress={() => handleClearDirect(sem.id!)} style={styles.clearDirectBtn}>
                        <Text style={{ color: '#ff6961', fontFamily: FONT_FAMILY.bold, fontSize: 12 }}>Clear Quick Mode</Text>
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
                          <Ionicons name="add" size={16} color="#a599ff" />
                          <Text style={styles.addSubText}>Add Subject</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.addSubBtn, { backgroundColor: '#1c1c1e' }]}
                          onPress={() => { 
                            setActiveSemId(sem.id!); 
                            setDirectSGPA(sem.calcSgpa?.toString() || '');
                            setDirectCredits(semSubs.reduce((a, b) => a + b.credits, 0).toString());
                            setDirectModalVisible(true); 
                          }}
                        >
                          <Ionicons name="flash" size={14} color="#8e8e93" />
                          <Text style={[styles.addSubText, { color: '#8e8e93' }]}>Direct SGPA</Text>
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
          <View style={styles.empty}>
            <Ionicons name="document-text" size={32} color="#2c2c2e" />
            <Text style={styles.emptyText}>No semesters added yet</Text>
          </View>
        }
      />

      {/* Semester Modal */}
      <Modal visible={semModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Semester</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Fall 2026"
              placeholderTextColor="#8e8e93"
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

      {/* Subject Modal */}
      <Modal visible={subModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Subject</Text>
            
            <Text style={styles.inputLabel}>Subject Name</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Physics 101"
              placeholderTextColor="#8e8e93"
              value={subName}
              onChangeText={setSubName}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Credits</Text>
                <TextInput
                  style={styles.input}
                  placeholder="4"
                  placeholderTextColor="#8e8e93"
                  value={subCredits}
                  onChangeText={setSubCredits}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Grade</Text>
                <TextInput
                  style={styles.input}
                  placeholder="A+"
                  placeholderTextColor="#8e8e93"
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

      {/* Direct SGPA Modal */}
      <Modal visible={directModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Direct SGPA Mode</Text>
            <Text style={{ color: '#8e8e93', fontSize: 13, fontFamily: FONT_FAMILY.body, marginBottom: 20 }}>Skip adding subjects individually. Just enter the final SGPA and total credits.</Text>
            
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Final SGPA</Text>
                <TextInput
                  style={styles.input}
                  placeholder="8.5"
                  placeholderTextColor="#8e8e93"
                  value={directSGPA}
                  onChangeText={setDirectSGPA}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Total Credits</Text>
                <TextInput
                  style={styles.input}
                  placeholder="24"
                  placeholderTextColor="#8e8e93"
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

    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: '#000000' },
      
      header: { marginBottom: 24, marginTop: 8 },
      iconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(165,153,255,0.12)', justifyContent: 'center', alignItems: 'center' },
      iconCircleLg: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(165,153,255,0.12)', justifyContent: 'center', alignItems: 'center' },
      screenTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#ffffff' },
      screenSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#8e8e93' },

      heroCard: { backgroundColor: '#141415', borderRadius: 20, padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
      heroLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10.5, color: '#8e8e93', letterSpacing: 1, marginBottom: 4 },
      heroValue: { fontFamily: FONT_FAMILY.bold, fontSize: 32, color: '#ffffff' },

      targetCard: { backgroundColor: '#141415', padding: 20, borderRadius: 16, marginBottom: 24 },
      sectionHeading: { fontFamily: FONT_FAMILY.bold, color: '#f2f2f7', fontSize: 15 },
      infoCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#1c1c1e', justifyContent: 'center', alignItems: 'center' },
      
      inputLabel: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: '#8e8e93', marginBottom: 8 },
      targetInput: { backgroundColor: '#1c1c1e', height: 48, borderRadius: 10, paddingHorizontal: 16, color: '#f2f2f7', fontFamily: FONT_FAMILY.bold, fontSize: 20 },
      
      targetResultBox: { backgroundColor: 'rgba(165,153,255,0.1)', borderRadius: 10, height: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)' },
      targetResultValue: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#a599ff' },

      chartContainer: { marginTop: 8 },
      chartBox: { backgroundColor: '#141415', borderRadius: 16, padding: 16, marginTop: 16 },
      chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
      legendText: { fontSize: 10, color: '#8e8e93', fontFamily: FONT_FAMILY.bold },

      addBtnSmall: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#a599ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 4 },
      addBtnSmallText: { fontFamily: FONT_FAMILY.bold, color: '#000', fontSize: 12 },

      list: { paddingHorizontal: 20, paddingBottom: 100 },
      card: { backgroundColor: '#141415', borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
      cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
      cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#f2f2f7' },
      cardSub: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#8e8e93', marginTop: 2 },
      
      quickBadge: { backgroundColor: 'rgba(165,153,255,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
      quickBadgeText: { color: '#a599ff', fontSize: 8, fontFamily: FONT_FAMILY.bold },

      cardExpanded: { padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#1c1c1d' },
      subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1c1c1d' },
      subTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#f2f2f7' },
      subCredits: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: '#8e8e93', marginTop: 2 },
      gradeBadge: { backgroundColor: '#1c1c1d', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
      gradeBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#a599ff' },
      
      addSubBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: 'rgba(165,153,255,0.12)', borderRadius: 10 },
      addSubText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#a599ff' },
      clearDirectBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#ff6961' },

      empty: { padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
      emptyText: { fontFamily: FONT_FAMILY.body, color: '#636366', fontSize: 13, marginTop: 12 },

      modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      modalCard: { backgroundColor: '#141415', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
      modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#ffffff', marginBottom: 20 },
      modalInputLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: '#8e8e93', letterSpacing: 1, marginBottom: 8 },
      input: { backgroundColor: '#1c1c1d', borderRadius: 10, padding: 16, color: '#ffffff', fontFamily: FONT_FAMILY.bold, fontSize: 14 },
      
      modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
      cancelBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#1c1c1d' },
      cancelBtnText: { fontFamily: FONT_FAMILY.bold, color: '#ffffff', fontSize: 14 },
      saveBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#a599ff' },
      saveBtnText: { fontFamily: FONT_FAMILY.bold, color: '#000000', fontSize: 14 },
    });
