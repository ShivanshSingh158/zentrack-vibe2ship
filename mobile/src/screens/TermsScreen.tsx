import React from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  Platform, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../theme/tokens';

interface TermsScreenProps {
  visible: boolean;
  onClose: () => void;
}

export default function TermsScreen({ visible, onClose }: TermsScreenProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* ── Top Sticky Header ────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Terms of Service & Privacy</Text>
            <Text style={styles.headerSubtitle}>ZenTrack Life OS · Version 2.4.0</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ── Scrollable Comprehensive Legal Body ───────────────────────── */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Metadata Badge Row */}
          <View style={styles.metaRow}>
            <View style={styles.badgePill}>
              <Text style={styles.badgePillText}>LEGAL AGREEMENT</Text>
            </View>
            <Text style={styles.lastUpdated}>EFFECTIVE: AUGUST 2026</Text>
          </View>

          {/* Overview Callout Box */}
          <View style={styles.calloutBox}>
            <Ionicons name="shield-checkmark" size={20} color={colors.accentPrimary} style={{ marginRight: 10, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.calloutTitle}>Our Core Privacy Pledge</Text>
              <Text style={styles.calloutBody}>
                ZenTrack is built on a <Text style={styles.boldText}>100% Local-First Architecture</Text>. Your daily tasks, habit streaks, attendance records, gym weights, and personal vault notes belong strictly to you. We do not sell your personal telemetry or monetize your private life routines.
              </Text>
            </View>
          </View>

          {/* ── SECTION 1 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="document-text" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>1. Agreement to Terms</Text>
            </View>
            <Text style={styles.paragraph}>
              These Terms of Service ("Terms") constitute a legally binding agreement between you ("User", "you", or "your") and ZenTrack Inc. ("ZenTrack", "we", "us", or "our"), governing your access to and use of the ZenTrack mobile application, website, services, and associated offline tools (collectively, the "Platform").
            </Text>
            <Text style={styles.paragraph}>
              By downloading, installing, accessing, or using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms in their entirety, you must immediately cease using and uninstall the Platform.
            </Text>
            <Text style={styles.paragraph}>
              <Text style={styles.boldText}>1.1 Eligibility:</Text> You must be at least 13 years of age (or the applicable age of digital consent in your jurisdiction) to use ZenTrack. If you are under 18, you represent that you have reviewed these Terms with your parent or legal guardian.
            </Text>
          </View>

          {/* ── SECTION 2 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="lock-closed" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>2. Account Registration & Data Security</Text>
            </View>
            <Text style={styles.paragraph}>
              ZenTrack supports multiple authentication models, including Google Sign-In, Apple Authentication, and Anonymous Demo mode. You agree to provide accurate authentication credentials and maintain the confidentiality of your active session.
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• <Text style={styles.boldText}>Device-Level Encryption:</Text> Private notes stored in the ZenTrack Vault are encrypted locally using AES-256 standards before touching local SQLite / AsyncStorage repositories.</Text>
              <Text style={styles.bulletItem}>• <Text style={styles.boldText}>Account Safeguards:</Text> You are solely responsible for maintaining the physical security of your biometric authentication (FaceID / Fingerprint) and PIN lock on your device.</Text>
              <Text style={styles.bulletItem}>• <Text style={styles.boldText}>Breach Notification:</Text> In the improbable event of a synchronized cloud breach, ZenTrack will notify affected users within 72 hours in compliance with global security regulations.</Text>
            </View>
          </View>

          {/* ── SECTION 3 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="sparkles" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>3. S.A.R.A Autonomous AI & Voice Assistant</Text>
            </View>
            <Text style={styles.paragraph}>
              ZenTrack features S.A.R.A (Synthesized Artificial Reality Assistant), an autonomous life intelligence engine designed to process natural language voice inputs, extract task parameters, schedule timetable alerts, and deliver proactive behavioral nudges.
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• <Text style={styles.boldText}>Voice Data Lifecycle:</Text> Voice audio recorded during mic activation is transcribed in real-time. Raw audio streams are never stored permanently on remote servers; only parsed structured actions (e.g. "DSA Lab at 10 AM") are retained on your device.</Text>
              <Text style={styles.bulletItem}>• <Text style={styles.boldText}>AI Non-Reliance:</Text> S.A.R.A provides behavioral assistance and automated workflows. S.A.R.A is not a certified financial advisor, attorney, psychotherapist, or medical practitioner. Critical life decisions must never rely solely on AI-generated outputs.</Text>
              <Text style={styles.bulletItem}>• <Text style={styles.boldText}>Prompt Acceptability:</Text> You agree not to transmit hate speech, harassment, sexually explicit content, or copyrighted third-party material through the S.A.R.A conversation engine.</Text>
            </View>
          </View>

          {/* ── SECTION 4 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="school" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>4. Academic & Timetable Radar Disclaimers</Text>
            </View>
            <Text style={styles.paragraph}>
              ZenTrack offers an automated Attendance Radar and Bunk Calculator designed to assist students in tracking class compliance against institutional percentage thresholds (e.g., 75% or 80% criteria).
            </Text>
            <Text style={styles.paragraph}>
              <Text style={styles.boldText}>4.1 Informational Nature:</Text> The calculated "Safe Bunks", attendance forecasts, and scheduled lecture timings are generated based on user-supplied parameters and schedule imports.
            </Text>
            <Text style={styles.paragraph}>
              <Text style={styles.boldText}>4.2 Institutional Authority:</Text> Your educational institution's official ERP, professor roll calls, and departmental registries remain the sole authoritative record of your academic standing. ZenTrack accepts no liability for disciplinary actions, exam disbarment, or attendance discrepancies arising from user reliance on estimated metrics.
            </Text>
          </View>

          {/* ── SECTION 5 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="barbell" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>5. Fitness, Gym & Wellness Disclaimer</Text>
            </View>
            <Text style={styles.paragraph}>
              The gym workout tracker, 1RM calculators, progressive overload matrices, hydration meters, and dietary suggestions provided by ZenTrack are for educational and personal organization purposes only.
            </Text>
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={18} color="#FF9F4D" style={{ marginRight: 8, marginTop: 2 }} />
              <Text style={styles.warningText}>
                Consult a qualified physician or certified personal trainer before attempting high-intensity weight training or dietary changes. You assume 100% of physical risks associated with exercise routines logged in ZenTrack.
              </Text>
            </View>
          </View>

          {/* ── SECTION 6 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="code-slash" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>6. Intellectual Property & Ownership</Text>
            </View>
            <Text style={styles.paragraph}>
              <Text style={styles.boldText}>6.1 Your Content:</Text> You retain complete, unencumbered ownership of all data, tasks, notes, habits, routines, and telemetry generated by your account on the Platform. ZenTrack claims no intellectual property rights over your personal life logs.
            </Text>
            <Text style={styles.paragraph}>
              <Text style={styles.boldText}>6.2 ZenTrack IP:</Text> The ZenTrack name, brand mark, visual design tokens, custom user interface components, sound design, animations, backend API algorithms, and proprietary machine learning orchestration engines are the exclusive property of ZenTrack Inc. and are protected by international copyright and trademark laws.
            </Text>
          </View>

          {/* ── SECTION 7 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="hand-left" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>7. Prohibited Uses & Community Conduct</Text>
            </View>
            <Text style={styles.paragraph}>You expressly agree not to:</Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>• Reverse engineer, decompile, disassemble, or derive source code from any portion of the ZenTrack binary or web bundle.</Text>
              <Text style={styles.bulletItem}>• Deploy automated scrapers, bots, crawlers, or high-frequency API flooders against ZenTrack cloud services.</Text>
              <Text style={styles.bulletItem}>• Circumvent authentication barriers, tamper with encryption headers, or forge token payloads.</Text>
              <Text style={styles.bulletItem}>• Use ZenTrack to coordinate unlawful, hazardous, or malicious physical activities.</Text>
            </View>
          </View>

          {/* ── SECTION 8 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="cloud-offline" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>8. Service Availability & Modifications</Text>
            </View>
            <Text style={styles.paragraph}>
              ZenTrack is provided on an "AS IS" and "AS AVAILABLE" basis. While our local-first offline architecture allows full platform operation without an active internet connection, cloud backup synchronization and AI transcription services require network connectivity.
            </Text>
            <Text style={styles.paragraph}>
              We reserve the right to deploy updates, alter module configurations, or modify API endpoints at our discretion to enhance system performance, security, and user experience.
            </Text>
          </View>

          {/* ── SECTION 9 ──────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="alert-circle" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>9. Limitation of Liability</Text>
            </View>
            <Text style={styles.paragraph}>
              To the maximum extent permitted by applicable law, in no event shall ZenTrack Inc., its officers, directors, employees, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data corruption, academic penalties, hardware malfunctions, or personal injury resulting from your use of or inability to use the Platform.
            </Text>
          </View>

          {/* ── SECTION 10 ─────────────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="mail" size={18} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>10. Contact Information & Inquiries</Text>
            </View>
            <Text style={styles.paragraph}>
              If you have questions regarding these Terms, privacy practices, data deletion requests under GDPR/CCPA, or security reports, please reach out to our legal team:
            </Text>
            <View style={styles.contactCard}>
              <Text style={styles.contactItem}><Text style={styles.boldText}>Legal Department:</Text> legal@zentrack.app</Text>
              <Text style={styles.contactItem}><Text style={styles.boldText}>Privacy Officer:</Text> privacy@zentrack.app</Text>
              <Text style={styles.contactItem}><Text style={styles.boldText}>Security Desk:</Text> security@zentrack.app</Text>
            </View>
          </View>

          {/* Bottom Acknowledgment Action */}
          <View style={styles.bottomActionBlock}>
            <TouchableOpacity style={styles.agreeBtn} onPress={onClose} activeOpacity={0.88}>
              <Text style={styles.agreeBtnText}>I Understand & Agree</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Bottom Fade Gradient */}
        <LinearGradient
          colors={['rgba(5,5,5,0)', isDark ? 'rgba(5,5,5,0.95)' : 'rgba(255,255,255,0.95)']}
          style={styles.bottomGradient}
          pointerEvents="none"
        />
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#08080C' : '#F9F9FB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 20 : 36,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    backgroundColor: isDark ? 'rgba(8,8,12,0.95)' : 'rgba(249,249,251,0.95)',
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 80,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  badgePill: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  },
  badgePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    color: colors.accentPrimary,
    letterSpacing: 0.8,
  },
  lastUpdated: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  calloutBox: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.05)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.15)',
    padding: 14,
    marginBottom: 28,
  },
  calloutTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13.5,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  calloutBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 18.5,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15.5,
    color: colors.textPrimary,
  },
  paragraph: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.72)',
    lineHeight: 20,
    marginBottom: 10,
  },
  boldText: {
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
  bulletList: {
    marginTop: 4,
    gap: 8,
  },
  bulletItem: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12.5,
    color: isDark ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.70)',
    lineHeight: 19,
    paddingLeft: 4,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(255,159,77,0.08)' : 'rgba(255,159,77,0.06)',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,159,77,0.25)' : 'rgba(255,159,77,0.2)',
    padding: 12,
    marginTop: 6,
  },
  warningText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: isDark ? '#FFB067' : '#D97706',
    lineHeight: 18,
    flex: 1,
  },
  contactCard: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    padding: 14,
    marginTop: 6,
    gap: 6,
  },
  contactItem: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  bottomActionBlock: {
    marginTop: 20,
    alignItems: 'center',
  },
  agreeBtn: {
    backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14.5,
    color: isDark ? '#0A0A0E' : '#FFFFFF',
    letterSpacing: 0.2,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },
});
