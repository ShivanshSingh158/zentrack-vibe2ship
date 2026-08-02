import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useMobileData } from '../contexts/MobileDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import GlassCard from '../components/ui/GlassCard';
import * as Haptics from 'expo-haptics';

export default function WeeklyReviewScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const { weeklyReviews } = useMobileData();

  const latestReview = useMemo(() => {
    if (!weeklyReviews || weeklyReviews.length === 0) return null;
    return [...weeklyReviews].sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [weeklyReviews]);

  return (
    <ExpoLinearGradient colors={['#181036', '#090710', '#050507']} style={s.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.title}>Weekly Review</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {!latestReview ? (
            <View style={s.emptyState}>
              <Ionicons name="sparkles-outline" size={48} color={colors.accentPrimary} />
              <Text style={s.emptyTitle}>No Reviews Yet</Text>
              <Text style={s.emptyDesc}>SARA will conduct your weekly review based on the 4 key progress tracking questions.</Text>
              
              <TouchableOpacity 
                style={[s.interviewBtn, { backgroundColor: colors.accentPrimary, marginTop: SPACE.xl }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  navigation.navigate('SaraModal', {
                    screen: 'Sara',
                    params: {
                      initialPrompt: "It's time for my weekly review! Please interview me one by one on the 4 tracking questions: 1) Could I solve this week's DSA problems without hints? 2) Can I explain this week's dev concept? 3) Did I code for at least 4 days? 4) What is one new thing I understood this week? After we finish, use the createWeeklyReview action to save it."
                    }
                  });
                }}
              >
                <Ionicons name="mic-outline" size={18} color="#fff" />
                <Text style={s.interviewBtnText}>Start Weekly Interview</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={s.reviewHeader}>
                <Ionicons name="calendar-outline" size={20} color={colors.accentPrimary} />
                <Text style={s.dateRange}>
                  {latestReview.weekStart} to {latestReview.weekEnd}
                </Text>
              </View>

              <TouchableOpacity 
                style={[s.interviewBtn, { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1, marginBottom: SPACE.lg }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  navigation.navigate('SaraModal', {
                    screen: 'Sara',
                    params: {
                      initialPrompt: "It's time for my weekly review! Please interview me one by one on the 4 tracking questions: 1) Could I solve this week's DSA problems without hints? 2) Can I explain this week's dev concept? 3) Did I code for at least 4 days? 4) What is one new thing I understood this week? After we finish, use the createWeeklyReview action to save it."
                    }
                  });
                }}
              >
                <Ionicons name="mic-outline" size={18} color={colors.textPrimary} />
                <Text style={[s.interviewBtnText, { color: colors.textPrimary }]}>Start New Interview</Text>
              </TouchableOpacity>

              <GlassCard style={s.card}>
                <View style={s.sectionHeader}>
                  <Ionicons name="trending-up" size={20} color={colors.accentGreen} />
                  <Text style={s.sectionTitle}>What Went Well</Text>
                </View>
                <Text style={s.sectionText}>{latestReview.wentWell}</Text>
              </GlassCard>

              <GlassCard style={s.card}>
                <View style={s.sectionHeader}>
                  <Ionicons name="construct-outline" size={20} color={colors.accentAmber} />
                  <Text style={s.sectionTitle}>Areas to Improve</Text>
                </View>
                <Text style={s.sectionText}>{latestReview.toImprove}</Text>
              </GlassCard>

              <GlassCard style={s.card}>
                <View style={s.sectionHeader}>
                  <Ionicons name="flag-outline" size={20} color={colors.accentBlue} />
                  <Text style={s.sectionTitle}>Next Week's Priorities</Text>
                </View>
                <Text style={s.sectionText}>{latestReview.nextWeekPriorities}</Text>
              </GlassCard>

              <View style={s.gratitudeBox}>
                <Ionicons name="heart" size={16} color={colors.accentPrimary} style={{ marginRight: 6 }} />
                <Text style={s.gratitudeText}>{latestReview.gratitude}</Text>
              </View>
            </>
          )}
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
  title: { fontFamily: FONT_FAMILY.title, fontSize: 20, color: colors.textPrimary },
  content: { paddingHorizontal: SPACE.xl, paddingTop: SPACE.md },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginTop: 16 },
  emptyDesc: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, paddingHorizontal: 32 },

  reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.xl, justifyContent: 'center' },
  dateRange: { fontFamily: FONT_FAMILY.mono, fontSize: 14, color: colors.accentPrimary, marginLeft: 8 },
  
  card: { padding: SPACE.lg, marginBottom: SPACE.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.sm },
  sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginLeft: 8 },
  sectionText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textSecondary, lineHeight: 22 },

  gratitudeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: SPACE.lg, padding: SPACE.md, backgroundColor: `${colors.accentPrimary}10`, borderRadius: RADIUS.lg },
  gratitudeText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: colors.accentPrimary, fontStyle: 'italic' },
  
  interviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: SPACE.md, borderRadius: RADIUS.xl, gap: 8 },
  interviewBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#fff' },
});
