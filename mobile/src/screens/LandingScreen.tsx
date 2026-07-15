import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';

export default function LandingScreen() {
  const navigation = useNavigation<any>();
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
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.mainContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerBrandText}>ZENTRACK</Text>
          <Text style={styles.stepText}>01 / life OS</Text>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroTitleItalic}>Quietly</Text>
            <Text style={styles.heroTitleBold}>orchestrated.</Text>

            <Text style={styles.heroSubtitle}>
              Tasks, time, and habits, handled{'\n'}
              alongside you. No dashboards to{'\n'}
              manage. No noise.
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  mainContent: {
    flex: 1,
    paddingTop: 32,
    paddingHorizontal: 32,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 24,
  },
  headerBrandText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 4,
  },
  stepText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    marginTop: -40,
  },
  heroTextContainer: {
    justifyContent: 'center',
  },
  heroTitleItalic: {
    color: '#a599ff',
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 52,
    lineHeight: 58,
  },
  heroTitleBold: {
    color: '#ffffff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -1,
    marginBottom: 32,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 26,
    paddingRight: 20,
  },
  footer: {
    width: '100%',
  },
  footerLine: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 20,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  ctaButton: {
    paddingVertical: 8,
    paddingLeft: 20,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  ctaArrow: {
    color: '#a599ff',
  }
});
