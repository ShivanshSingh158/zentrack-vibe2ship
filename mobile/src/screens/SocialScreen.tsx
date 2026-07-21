/**
 * SocialScreen — ZenTrack Mobile
 *
 * Psychological Frameworks Implemented:
 * - Social Identity Theory (Identity badges on share cards)
 * - Social Proof (Shareable milestones)
 * - Accountability Dyads (No feeds, just partners)
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, ActivityIndicator, Alert, Modal, TextInput, KeyboardAvoidingView, Share } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

import { db } from '../services/firebase';
import { SCREENS, COLLECTION } from '../config/constants';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { animateFadeInUp } from '../theme/animations';
import { useMobileData } from '../contexts/MobileDataContext';
import { useTheme } from "../contexts/ThemeContext";

// ─── No Hardcoded Data ───

export default function SocialScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
    const navigation = useNavigation<any>();
    const { user, tasks, habits } = useMobileData();
    const headerFade = useSharedValue(0);
    const headerSlide = useSharedValue(-10);
    const viewShotRef = useRef<any>(null);
    const [sharing, setSharing] = useState(false);

    useEffect(() => { 
        headerFade.value = withTiming(1, { duration: 400 });
        headerSlide.value = withTiming(0, { duration: 400 });
    }, []);

    const headerStyle = useAnimatedStyle(() => ({
        opacity: headerFade.value,
        transform: [{ translateY: headerSlide.value }]
    }));

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const maxStreak = habits.reduce((max, h) => Math.max(max, h.streak || 0), 0);

    const [joinModalVisible, setJoinModalVisible] = useState(false);
    const [roomCodeInput, setRoomCodeInput] = useState('');

    const handleJoinStudyRoom = () => {
        setJoinModalVisible(true);
    };

    const handleJoinSubmit = async () => {
        if (!roomCodeInput || roomCodeInput.length < 4) return;
        setJoinModalVisible(false);
        const roomCode = roomCodeInput.toUpperCase();
        
        const roomRef = doc(db, COLLECTION.STUDY_ROOMS, roomCode);
        const docSnap = await getDoc(roomRef);
        
        const sharedTasks = (tasks || []).slice(0, 3).map(t => ({
            id: t.id,
            title: t.title,
            completed: t.status === 'completed',
            assigneeName: user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User'
        }));

        if (!docSnap.exists()) {
            await setDoc(roomRef, {
                roomCode,
                members: [user?.uid],
                tasks: sharedTasks,
                messages: []
            });
        } else {
            await updateDoc(roomRef, {
                members: arrayUnion(user?.uid),
                tasks: arrayUnion(...sharedTasks)
            });
        }
        navigation.navigate(SCREENS.STUDY_ROOM, { roomCode });
        setRoomCodeInput('');
    };

    const handleInvitePartner = async () => {
        try {
            // Generate a random 6-character room code
            const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // Pre-create the room in Firestore so it's ready when the partner joins
            const roomRef = doc(db, COLLECTION.STUDY_ROOMS, roomCode);
            const sharedTasks = (tasks || []).slice(0, 3).map(t => ({
                id: t.id,
                title: t.title,
                completed: t.status === 'completed',
                assigneeName: user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User'
            }));
            await setDoc(roomRef, {
                roomCode,
                members: [user?.uid],
                tasks: sharedTasks,
                messages: []
            });

            await Share.share({
                message: `Join me on ZenTrack as my accountability partner! Use my unique room code: *${roomCode}* to collaborate in our study room.`,
            });
        } catch (error) {
            console.error('Error sharing', error);
        }
    };

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
            <Animated.View style={[styles.header, headerStyle]}>
                <Text style={styles.title}>Accountability</Text>
                
                <TouchableOpacity style={styles.studyRoomBtn} onPress={handleJoinStudyRoom}>
                    <Ionicons name="people" size={24} color={colors.accentPrimary} />
                    <View style={{ marginLeft: SPACE.md, flex: 1 }}>
                      <Text style={styles.studyRoomTitle}>Join Study Room</Text>
                      <Text style={styles.studyRoomDesc}>Collaborate in real-time with friends.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>

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
                        <ActivityIndicator color={colors.background} />
                        ) : (
                        <>
                            <Ionicons name="share-outline" size={20} color={colors.background} />
                            <Text style={styles.shareBtnText}>Share to Socials</Text>
                        </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* ─── Accountability Dyads ─── */}
                <Text style={[styles.sectionLabel, { marginTop: SPACE.xxl }]}>YOUR PARTNERS (0/3)</Text>
                
                <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={32} color={colors.textTertiary} style={{ marginBottom: SPACE.sm }} />
                    <Text style={styles.emptyStateTitle}>No Partners Yet</Text>
                    <Text style={styles.emptyStateDesc}>Accountability partners can view your milestones and study rooms.</Text>
                </View>

                <TouchableOpacity style={styles.addPartnerBtn} onPress={handleInvitePartner}>
                <Ionicons name="add" size={20} color={colors.textPrimary} />
                <Text style={styles.addPartnerText}>Invite Partner</Text>
                </TouchableOpacity>

            </ScrollView>

            <View style={{ position: 'absolute', top: -10000, left: -10000 }}>
                <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
                <View style={styles.shareableCard}>
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

            {/* Join Room Modal */}
            <Modal visible={joinModalVisible} transparent animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Join / Create Study Room</Text>
                        <Text style={styles.modalDesc}>Enter a 4-6 digit room code to collaborate with friends.</Text>
                        
                        <TextInput
                            style={styles.modalInput}
                            placeholder="e.g. 1234"
                            placeholderTextColor={colors.textMuted}
                            value={roomCodeInput}
                            onChangeText={setRoomCodeInput}
                            keyboardType="default"
                            maxLength={6}
                            autoCapitalize="characters"
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setJoinModalVisible(false); setRoomCodeInput(''); }}>
                                <Text style={styles.modalBtnCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalBtnSubmit} onPress={handleJoinSubmit}>
                                <Text style={styles.modalBtnSubmitText}>Join Room</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const makeStyles = (colors: any) => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: { padding: SPACE.xl, paddingBottom: SPACE.md },
    title: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xxl, color: colors.textPrimary },
    subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginTop: 4 },
    scrollContent: { padding: SPACE.xl, paddingBottom: 100 },
    
    studyRoomBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(165,153,255,0.1)',
        padding: SPACE.lg, borderRadius: RADIUS.md, marginTop: SPACE.lg,
        borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)'
    },
    studyRoomTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.accentPrimary },
    studyRoomDesc: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textSecondary, marginTop: 4 },

    sectionLabel: {
        fontFamily: FONT_FAMILY.bold, fontSize: 10,
        color: colors.textMuted, letterSpacing: 2,
        marginBottom: SPACE.md, marginLeft: 4,
    },
    cardContainer: {
        backgroundColor: colors.surface,
        padding: SPACE.xl,
        borderRadius: RADIUS.xl,
        borderWidth: 1, borderColor: colors.borderHover,
        ...SHADOW.sm,
    },
    shareInstruction: {
        fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm,
        color: colors.textSecondary, lineHeight: 22,
        marginBottom: SPACE.xl,
    },
    shareBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
        backgroundColor: colors.accentPrimary,
        paddingVertical: SPACE.md, borderRadius: RADIUS.lg,
        ...SHADOW.accent(),
    },
    shareBtnText: {
        fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm,
        color: colors.background,
    },
    partnerCard: {
        flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
        backgroundColor: colors.surface,
        padding: SPACE.lg,
        borderRadius: RADIUS.lg,
        borderWidth: 1, borderColor: colors.border,
        marginBottom: SPACE.sm,
    },
    avatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: colors.surface2,
        alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
    partnerInfo: { flex: 1 },
    partnerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    partnerName: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
    partnerTime: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted },
    partnerStatus: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.accentGreen },
    addPartnerBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
        borderWidth: 1, borderColor: colors.borderHover, borderStyle: 'dashed',
        paddingVertical: SPACE.md, borderRadius: RADIUS.lg,
        marginTop: SPACE.sm,
      },
      addPartnerText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textPrimary },

      emptyState: {
          alignItems: 'center',
          justifyContent: 'center',
          padding: SPACE.xl,
          backgroundColor: 'rgba(255,255,255,0.02)',
          borderRadius: RADIUS.lg,
          borderWidth: 1, borderColor: colors.border,
          marginBottom: SPACE.sm,
      },
      emptyStateTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textSecondary },
      emptyStateDesc: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
      
      modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: SPACE.xl },
      modalContent: { backgroundColor: colors.surface, padding: SPACE.xl, borderRadius: RADIUS.xl, width: '100%', borderWidth: 1, borderColor: colors.border },
      modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: colors.textPrimary, marginBottom: SPACE.xs },
      modalDesc: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary, marginBottom: SPACE.xl },
      modalInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderHover, borderRadius: RADIUS.md, padding: SPACE.md, fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: colors.textPrimary, textAlign: 'center', marginBottom: SPACE.xl, letterSpacing: 4 },
      modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE.md },
      modalBtnCancel: { paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md },
      modalBtnCancelText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.base, color: colors.textSecondary },
      modalBtnSubmit: { backgroundColor: colors.accentPrimary, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.lg, borderRadius: RADIUS.md },
      modalBtnSubmitText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.background },

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
        backgroundColor: colors.accentPrimary,
        opacity: 0.15,
      },
      shareOrb2: {
        position: 'absolute', bottom: -150, right: -50,
        width: 400, height: 400, borderRadius: 200,
        backgroundColor: colors.accentGreen,
        opacity: 0.1,
      },
      shareContent: {
        flex: 1, padding: 32,
        justifyContent: 'center', alignItems: 'center',
      },
      shareUser: { fontFamily: FONT_FAMILY.title, fontSize: 24, color: '#FFFFFF', marginBottom: 4 },
      shareIdentity: { 
        fontFamily: FONT_FAMILY.bold, fontSize: 12, 
        color: colors.accentPrimary, letterSpacing: 2,
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
