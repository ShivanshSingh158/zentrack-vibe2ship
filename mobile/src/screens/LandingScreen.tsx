import React, { useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDateWithDay } from '../utils/dateUtils';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY } from '../theme/tokens';

export default function LandingScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
  });

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const today = new Date();
  const dateStr = formatDateWithDay(today.toISOString().slice(0, 10));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.headerBrandText}>ZENTRACK</Text>
            <View style={styles.brandDot} />
          </View>
          <Text style={styles.stepText}>01 / LIFE OS</Text>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroTitleItalic}>Quietly</Text>
            <Text style={styles.heroTitleBold}>orchestrated.</Text>

            <Text style={styles.heroSubtitle}>
              Tasks, time, academics, and habits, handled alongside you. No dashboard clutter. Zero cognitive friction.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <View style={styles.footerContent}>
            <Text style={styles.dateText}>{dateStr}</Text>
            <TouchableOpacity style={styles.ctaButton} onPress={() => navigation.navigate('Auth')} activeOpacity={0.7}>
              <Text style={styles.ctaButtonText}>Enter workspace <Text style={styles.ctaArrow}>→</Text></Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContent: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrandText: {
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 2,
  },
  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accentPrimary,
  },
  stepText: {
    color: colors.textMuted,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    letterSpacing: 1,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    marginTop: -30,
  },
  heroTextContainer: {
    justifyContent: 'center',
  },
  heroTitleItalic: {
    color: colors.accentPrimary,
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 52,
    lineHeight: 58,
  },
  heroTitleBold: {
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -1,
    marginBottom: 24,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 320,
  },
  footer: {
    width: '100%',
  },
  footerLine: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 20,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    color: colors.textMuted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  ctaButton: {
    paddingVertical: 8,
    paddingLeft: 20,
  },
  ctaButtonText: {
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  ctaArrow: {
    color: colors.accentPrimary,
  }
});
