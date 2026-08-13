import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE } from '../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';

interface TermsScreenProps {
  visible: boolean;
  onClose: () => void;
}

export default function TermsScreen({ visible, onClose }: TermsScreenProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Terms of Service</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <Text style={styles.lastUpdated}>Last Updated: August 2026</Text>

          <Text style={styles.welcomeText}>
            Welcome to ZenTrack. By using our application, you agree to these terms. We believe in complete transparency, zero noise, and strict privacy.
          </Text>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="lock-closed" size={20} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>1. Data Privacy & Security</Text>
            </View>
            <Text style={styles.paragraph}>
              Your data is strictly private. We utilize industry-leading security practices through Google, Apple, and Firebase to ensure your information is encrypted and secure. We do not sell your personal data to third parties. Your habits, tasks, and fitness logs belong entirely to you.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="planet" size={20} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>2. S.A.R.A & AI Acceptable Use</Text>
            </View>
            <Text style={styles.paragraph}>
              S.A.R.A (Synthesized Artificial Reality Assistant) is designed to orchestrate your routines. By interacting with our AI features, you agree that inputs (including voice transcripts and task descriptions) may be processed by our language models to generate insights and automate your workflows. Do not submit sensitive personal identifiable information (PII) or confidential corporate data into the AI prompts.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="fitness" size={20} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>3. Health & Wellness Disclaimer</Text>
            </View>
            <Text style={styles.paragraph}>
              ZenTrack provides tools for tracking fitness, diets, and habits. However, we are not a medical provider. The AI-generated gym routines, dietary macro suggestions, and general wellness insights are for informational purposes only. Always consult with a qualified healthcare professional before beginning any new fitness or diet regimen.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="document-text" size={20} color={colors.accentPrimary} />
              <Text style={styles.sectionTitle}>4. User Conduct</Text>
            </View>
            <Text style={styles.paragraph}>
              You agree to use ZenTrack only for its intended purpose—improving your daily routines. Any attempt to reverse engineer the application, abuse the API, or interfere with the experience of other users will result in immediate account termination.
            </Text>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
        
        {/* Bottom Fade Gradient (optional for aesthetics) */}
        <LinearGradient
          colors={['rgba(5,5,5,0)', 'rgba(5,5,5,1)']}
          style={styles.bottomGradient}
          pointerEvents="none"
        />
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(5,5,5,0.95)',
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 8,
    marginRight: -8,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  lastUpdated: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  welcomeText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 24,
    marginBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
    marginLeft: 10,
  },
  paragraph: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 24,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
});
