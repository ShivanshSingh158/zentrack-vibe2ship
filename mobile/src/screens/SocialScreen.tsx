/**
 * SocialScreen — ZenTrack Mobile
 *
 * Psychological Frameworks Implemented:
 * - Social Identity Theory (Identity badges on share cards)
 * - Social Proof (Shareable milestones)
 * - Accountability Dyads (No feeds, just partners)
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Image, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { animateFadeInUp } from '../theme/animations';
import { useMobileData } from '../contexts/MobileDataContext';

// ─── Mock Data for Accountability Partners ───
const PARTNERS = [
  { id: '1', name: 'Sarah J.', avatar: 'SJ', status: 'Completed 14 tasks this week', lastActive: '2h ago' },
  { id: '2', name: 'Alex M.', avatar: 'AM', status: 'On a 5-day habit streak', lastActive: '5m ago' },
];

export default function SocialScreen() {
  const { user, tasks, habits } = useMobileData();
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-10)).current;
  const viewShotRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { 
    animateFadeInUp(headerFade, headerSlide, 0).start(); 
  }, []);

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const maxStreak = habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);

  const handleShare = async () => {
    if (!viewShotRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    
    try {
      const uri = await viewShotRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          dialogTitle: 'Share your milestone',
          mimeType: 'image/png',
        });
      }
    } catch (e) {
      console.error('Error sharing', e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <Text style={styles.title}>Accountability</Text>
        <Text style={styles.subtitle}>Progress is better shared.</Text>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* ─── Share Card Generator ─── */}
        <Text style={styles.sectionLabel}>YOUR MILESTONES</Text>
        
        <View style={styles.cardContainer}>
          <Text style={styles.shareInstruction}>
            Generate a beautiful milestone card for Instagram Stories or WhatsApp.
          </Text>
          
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} disabled={sharing}>
            {sharing ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <>
                <Ionicons name="share-outline" size={20} color={COLORS.background} />
                <Text style={styles.shareBtnText}>Share to Socials</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ─── Accountability Dyads ─── */}
        <Text style={[styles.sectionLabel, { marginTop: SPACE.xxl }]}>YOUR PARTNERS (2/3)</Text>
        
        {PARTNERS.map((partner) => (
          <View key={partner.id} style={styles.partnerCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{partner.avatar}</Text>
            </View>
            <View style={styles.partnerInfo}>
              <View style={styles.partnerHeader}>
                <Text style={styles.partnerName}>{partner.name}</Text>
                <Text style={styles.partnerTime}>{partner.lastActive}</Text>
              </View>
              <Text style={styles.partnerStatus}>{partner.status}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addPartnerBtn}>
          <Ionicons name="add" size={20} color={COLORS.textPrimary} />
          <Text style={styles.addPartnerText}>Invite Partner</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* 
        The actual View to be captured. 
        It is rendered off-screen (absolute, left: -10000) so the user doesn't see it directly on the layout,
        but react-native-view-shot can still capture its rendered layout.
      */}
      <View style={{ position: 'absolute', top: -10000, left: -10000 }}>
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
          <View style={styles.shareableCard}>
            {/* Dark gradient approximation via background color and overlapping circles */}
            <View style={styles.shareBackground} />
            <View style={styles.shareOrb1} />
            <View style={styles.shareOrb2} />
            
            <View style={styles.shareContent}>
              <Text style={styles.shareUser}>{user?.displayName || 'Operator'}</Text>
              <Text style={styles.shareIdentity}>HIGH ACHIEVER (Top 12%)</Text>
              
              <View style={styles.shareStatBox}>
                <Text style={styles.shareStatNum}>{completedTasks}</Text>
                <Text style={styles.shareStatLabel}>Tasks Completed</Text>
              </View>

              <View style={styles.shareStatBox}>
                <Text style={styles.shareStatNum}>{maxStreak} 🔥</Text>
                <Text style={styles.shareStatLabel}>Max Habit Streak</Text>
              </View>

              <Text style={styles.shareFooter}>Built with ZenTrack OS</Text>
            </View>
          </View>
        </ViewShot>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACE.xl, paddingBottom: SPACE.md },
  title: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xxl, color: COLORS.textPrimary },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: 4 },
  scrollContent: { padding: SPACE.xl, paddingBottom: 100 },

  sectionLabel: {
    fontFamily: FONT_FAMILY.bold, fontSize: 10,
    color: COLORS.textMuted, letterSpacing: 2,
    marginBottom: SPACE.md, marginLeft: 4,
  },

  cardContainer: {
    backgroundColor: COLORS.surface,
    padding: SPACE.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.borderHover,
    ...SHADOW.sm,
  },
  shareInstruction: {
    fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary, lineHeight: 22,
    marginBottom: SPACE.xl,
  },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    backgroundColor: COLORS.accentPrimary,
    paddingVertical: SPACE.md, borderRadius: RADIUS.lg,
    ...SHADOW.accent(),
  },
  shareBtnText: {
    fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm,
    color: COLORS.background,
  },

  partnerCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    backgroundColor: COLORS.surface,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACE.sm,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: COLORS.textPrimary },
  partnerInfo: { flex: 1 },
  partnerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  partnerName: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: COLORS.textPrimary },
  partnerTime: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: COLORS.textMuted },
  partnerStatus: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.accentGreen },

  addPartnerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    borderWidth: 1, borderColor: COLORS.borderHover, borderStyle: 'dashed',
    paddingVertical: SPACE.md, borderRadius: RADIUS.lg,
    marginTop: SPACE.sm,
  },
  addPartnerText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: COLORS.textPrimary },

  // ─── Shareable Card Layout (Off-screen) ───
  shareableCard: {
    width: 1080 / 3, // Target 1080x1920 IG Story aspect ratio, scaled down for RN rendering
    height: 1920 / 3,
    backgroundColor: '#080510',
    overflow: 'hidden',
    position: 'relative',
  },
  shareBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#080510',
  },
  shareOrb1: {
    position: 'absolute', top: -100, left: -100,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: COLORS.accentPrimary,
    opacity: 0.15,
  },
  shareOrb2: {
    position: 'absolute', bottom: -150, right: -50,
    width: 400, height: 400, borderRadius: 200,
    backgroundColor: COLORS.accentGreen,
    opacity: 0.1,
  },
  shareContent: {
    flex: 1, padding: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  shareUser: { fontFamily: FONT_FAMILY.title, fontSize: 24, color: '#FFFFFF', marginBottom: 4 },
  shareIdentity: { 
    fontFamily: FONT_FAMILY.bold, fontSize: 12, 
    color: COLORS.accentPrimary, letterSpacing: 2,
    marginBottom: 60 
  },
  shareStatBox: {
    alignItems: 'center', marginBottom: 40,
  },
  shareStatNum: { fontFamily: FONT_FAMILY.title, fontSize: 64, color: '#FFFFFF' },
  shareStatLabel: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: '#A0A0A0', letterSpacing: 1 },
  shareFooter: {
    position: 'absolute', bottom: 32,
    fontFamily: FONT_FAMILY.medium, fontSize: 12,
    color: '#606060', letterSpacing: 1,
  }
});
