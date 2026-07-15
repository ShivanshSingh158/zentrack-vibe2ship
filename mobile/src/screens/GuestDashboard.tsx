import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import VoiceOrb from '../components/SARA/VoiceOrb';

const ORB_COLORS = ['#4ade80', '#3b82f6', '#ec4899', '#f59e0b', '#a855f7'];

export default function GuestDashboard() {
  const navigation = useNavigation<any>();
  const [orbColor, setOrbColor] = useState(ORB_COLORS[0]);
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<string[]>(['[SYS] S.A.R.A GUEST INSTANCE ALLOCATED.', '[SYS] Select your AI aesthetic below.']);
  const [isWorking, setIsWorking] = useState(false);
  const [hasUsedFreeQuery, setHasUsedFreeQuery] = useState(false);

  const handleSend = () => {
    if (!input.trim() || isWorking) return;

    if (hasUsedFreeQuery) {
      // LOSS AVERSION TRIGGER
      navigation.navigate('Auth', { orbColor });
      return;
    }
    
    setLogs(prev => [...prev, `> ${input}`]);
    setIsWorking(true);
    
    setTimeout(() => {
      setLogs(prev => [...prev, '[S.A.R.A] Initial analysis complete. To save this configuration and unlock continuous access, you must secure your instance.']);
      setIsWorking(false);
      setHasUsedFreeQuery(true);
    }, 1500);
    
    setInput('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>S.A.R.A</Text>
        <Text style={styles.headerSubtitle}>GUEST PROTOCOL</Text>
      </View>

      <ScrollView style={styles.terminal} contentContainerStyle={{ paddingBottom: 20 }}>
        <VoiceOrb size="large" isActive={isWorking} />
        
        {logs.map((log, index) => (
          <Text key={index} style={[styles.terminalText, { color: orbColor }]}>{log}</Text>
        ))}
        {isWorking && <Text style={[styles.terminalTextBlink, { color: orbColor }]}>_</Text>}
      </ScrollView>

      {/* IKEA EFFECT: Customization */}
      <View style={styles.customizationPanel}>
        <Text style={styles.customizationTitle}>CALIBRATE AI AURA</Text>
        <View style={styles.colorPicker}>
          {ORB_COLORS.map(color => (
            <TouchableOpacity 
              key={color} 
              style={[
                styles.colorSwab, 
                { backgroundColor: color, borderWidth: orbColor === color ? 2 : 0, borderColor: '#fff' }
              ]} 
              onPress={() => setOrbColor(color)}
            />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={hasUsedFreeQuery ? "Secure instance to continue..." : "Ask your first question..."}
          placeholderTextColor="#666"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>{hasUsedFreeQuery ? 'SECURE' : 'EXECUTE'}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 4,
  },
  terminal: {
    flex: 1,
    padding: 20,
    backgroundColor: '#050505',
  },
  terminalText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    marginBottom: 8,
  },
  terminalTextBlink: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    opacity: 0.8,
  },
  customizationPanel: {
    padding: 15,
    backgroundColor: '#111',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  customizationTitle: {
    color: '#666',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 10,
  },
  colorPicker: {
    flexDirection: 'row',
    gap: 15,
  },
  colorSwab: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: '#0a0a0a',
  },
  input: {
    flex: 1,
    color: '#fff',
    backgroundColor: '#000',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sendButton: {
    backgroundColor: '#FF6B00',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 10,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
