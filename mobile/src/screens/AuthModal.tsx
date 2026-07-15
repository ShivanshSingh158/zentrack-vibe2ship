import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const navigation = useNavigation<any>();

  const handleDemo = () => {
    onClose();
    navigation.navigate('GuestDashboard');
  };

  const handleSignIn = () => {
    onClose();
    navigation.navigate('Auth');
  };

  return (
    <View style={styles.container}>
      {/* Background Blur */}
      <BlurView experimentalBlurMethod="dimezisBlurView" intensity={30} tint="dark" style={styles.blurBackground} />

      {/* Modal Card */}
      <View style={styles.card}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backArrow}>←</Text>
            <Text style={styles.backText}>Back to Home</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Image 
            source={require('../../assets/logo_white.png')} 
            style={styles.logoImage} 
            resizeMode="contain"
          />
          
          <Text style={styles.subtitle}>
            Enter the flow state. Master your tasks, time, and habits with an intelligent companion.
          </Text>

          <TouchableOpacity style={styles.googleButton} onPress={handleSignIn}>
            <Text style={styles.googleButtonText}>→ Sign in with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.demoButton} onPress={handleDemo}>
            <Text style={styles.demoButtonText}>▷ Try Demo Mode</Text>
          </TouchableOpacity>

          <View style={styles.secureSection}>
            <Text style={styles.secureText}>SECURE GOOGLE AUTHENTICATION</Text>
            <Text style={styles.secureSubtext}>Gmail · Calendar · Drive · Tasks</Text>
          </View>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '90%',
    backgroundColor: '#11100e', // Very dark brown/black
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    padding: 30,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  header: {
    marginBottom: 40,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backArrow: {
    color: '#888',
    fontSize: 16,
    marginRight: 8,
  },
  backText: {
    color: '#888',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  content: {
    alignItems: 'center',
  },
  logoImage: {
    width: 180,
    height: 45,
    marginBottom: 20,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 10,
  },
  googleButton: {
    backgroundColor: '#cca785', // Beige color
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  googleButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Inter_600SemiBold',
  },
  demoButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  demoButtonText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  secureSection: {
    alignItems: 'center',
  },
  secureText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: 'Inter_600SemiBold',
  },
  secureSubtext: {
    color: 'rgba(255, 255, 255, 0.2)',
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  }
});
