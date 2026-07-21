import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, SPACE, RADIUS } from '../theme/tokens';
import GlassCard from '../components/ui/GlassCard';
import * as Haptics from 'expo-haptics';

export default function GoalDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const goal = route.params?.goal;

  const [milestones, setMilestones] = useState<any[]>([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!goal) return;
    const q = query(collection(db, COLLECTION.GOALS, goal.id, 'milestones'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [goal]);

  const handleAddMilestone = async () => {
    if (!newMilestoneTitle.trim() || !goal) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addDoc(collection(db, COLLECTION.GOALS, goal.id, 'milestones'), {
      title: newMilestoneTitle.trim(),
      completed: false,
      createdAt: serverTimestamp(),
    });
    setNewMilestoneTitle('');
    
    // Update goal updatedAt to reset stalled detection
    await updateDoc(doc(db, COLLECTION.GOALS, goal.id), {
      updatedAt: Date.now()
    });
  };

  const toggleMilestone = async (m: any) => {
    Haptics.selectionAsync();
    await updateDoc(doc(db, COLLECTION.GOALS, goal.id, 'milestones', m.id), {
      completed: !m.completed,
      completedAt: !m.completed ? serverTimestamp() : null
    });
    await updateDoc(doc(db, COLLECTION.GOALS, goal.id), {
      updatedAt: Date.now()
    });
  };

  if (!goal) return null;

  return (
    <ExpoLinearGradient colors={['#181036', '#090710', '#050507']} style={s.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{goal.title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <GlassCard style={s.card}>
            <Text style={s.goalTitle}>{goal.title}</Text>
            {goal.description && <Text style={s.goalDesc}>{goal.description}</Text>}
            <View style={s.progressRow}>
              <View style={s.progressBarBg}>
                <View style={[s.progressBarFill, { width: `${goal.progress || 0}%` }]} />
              </View>
              <Text style={s.progressText}>{goal.progress || 0}%</Text>
            </View>
          </GlassCard>

          <Text style={s.sectionTitle}>Milestone Timeline</Text>
          
          <View style={s.timeline}>
            {milestones.map((m, i) => (
              <View key={m.id} style={s.timelineItem}>
                <View style={s.timelineLine} />
                <TouchableOpacity onPress={() => toggleMilestone(m)} style={[s.timelineDot, m.completed && s.timelineDotCompleted]}>
                  {m.completed && <Ionicons name="checkmark" size={12} color={colors.background} />}
                </TouchableOpacity>
                <View style={s.timelineContent}>
                  <Text style={[s.milestoneTitle, m.completed && s.milestoneTitleCompleted]}>{m.title}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={s.addMilestoneRow}>
            <TextInput
              style={s.input}
              placeholder="Add new milestone..."
              placeholderTextColor={colors.textMuted}
              value={newMilestoneTitle}
              onChangeText={setNewMilestoneTitle}
              onSubmitEditing={handleAddMilestone}
              returnKeyType="done"
            />
            <TouchableOpacity style={s.addBtn} onPress={handleAddMilestone}>
              <Ionicons name="add" size={20} color={colors.background} />
            </TouchableOpacity>
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </ExpoLinearGradient>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl, paddingTop: SPACE.md, paddingBottom: SPACE.lg,
  },
  headerTitle: { fontFamily: FONT_FAMILY.title, fontSize: 18, color: colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.md },
  
  card: { padding: SPACE.lg, marginBottom: SPACE.xl },
  goalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 22, color: colors.textPrimary, marginBottom: SPACE.xs },
  goalDesc: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textSecondary, marginBottom: SPACE.md },
  
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md },
  progressBarBg: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: colors.accentPrimary },
  progressText: { fontFamily: FONT_FAMILY.mono, fontSize: 12, color: colors.accentPrimary, marginLeft: SPACE.md },

  sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: SPACE.lg },
  
  timeline: { marginLeft: SPACE.md, marginBottom: SPACE.xl },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACE.lg, position: 'relative' },
  timelineLine: { position: 'absolute', left: 11, top: 24, bottom: -24, width: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  timelineDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.accentPrimary, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', marginRight: SPACE.md },
  timelineDotCompleted: { backgroundColor: colors.accentPrimary },
  timelineContent: { flex: 1, justifyContent: 'center', paddingTop: 2 },
  milestoneTitle: { fontFamily: FONT_FAMILY.medium, fontSize: 16, color: colors.textPrimary },
  milestoneTitleCompleted: { color: colors.textMuted, textDecorationLine: 'line-through' },

  addMilestoneRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, fontFamily: FONT_FAMILY.body, color: colors.textPrimary, fontSize: 14 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },
});
