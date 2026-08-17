import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import { useMobileData } from '../contexts/MobileDataContext';
import { FONT_FAMILY, SPACE, RADIUS } from '../theme/tokens';
import GlassCard from '../components/ui/GlassCard';
import { callProxy, parseProxyResponse } from '../services/geminiProxy';
import * as Haptics from 'expo-haptics';

export default function StudyRoomScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  
  const roomCode = route.params?.roomCode;
  const { user } = useMobileData();

  const [room, setRoom] = useState<any>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!roomCode) return;
    const roomRef = doc(db, COLLECTION.STUDY_ROOMS, roomCode);
    const unsub = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        setRoom({ id: docSnap.id, ...docSnap.data() });
      } else {
        // Room doesn't exist, we should probably handle this better
        setRoom(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [roomCode]);

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || !room || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const msg = {
      id: Date.now().toString(),
      userId: user.uid,
      userName: user.email?.split('@')[0] || 'User',
      text: chatMessage.trim(),
      timestamp: Date.now(),
      isSara: false,
    };

    setChatMessage('');
    
    // Add user message
    const roomRef = doc(db, COLLECTION.STUDY_ROOMS, roomCode);
    await updateDoc(roomRef, {
      messages: arrayUnion(msg)
    });

    // Ask SARA for a response if they tagged her, or randomly (simulate study buddy)
    if (msg.text.toLowerCase().includes('sara') || msg.text.includes('?')) {
      try {
        const prompt = `You are SARA, a study buddy AI in a shared study room. 
        A student just said: "${msg.text}". 
        Give a short, helpful, and motivating 1-2 sentence response.`;
        
        const res = await callProxy({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        if (res && res.text) {
          await updateDoc(roomRef, {
            messages: arrayUnion({
              id: Date.now().toString() + '_sara',
              userId: 'sara',
              userName: 'SARA',
              text: res.text,
              timestamp: Date.now(),
              isSara: true,
            })
          });
        }
      } catch (e) {
        console.warn('SARA chat failed in room', e);
      }
    }
  };

  const toggleTask = async (taskId: string, currentStatus: boolean) => {
    if (!room) return;
    Haptics.selectionAsync();
    
    // We update the whole tasks array for simplicity in this MVP
    const updatedTasks = room.tasks.map((t: any) => 
      t.id === taskId ? { ...t, completed: !currentStatus } : t
    );

    await updateDoc(doc(db, COLLECTION.STUDY_ROOMS, roomCode), {
      tasks: updatedTasks
    });
  };

  if (loading) {
    return (
      <ExpoLinearGradient colors={['#181036', '#090710', '#050507']} style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textPrimary }}>Loading Room...</Text>
      </ExpoLinearGradient>
    );
  }

  if (!room) {
    return (
      <ExpoLinearGradient colors={['#181036', '#090710', '#050507']} style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textPrimary }}>Room not found!</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={{ color: colors.accentPrimary }}>Go Back</Text>
        </TouchableOpacity>
      </ExpoLinearGradient>
    );
  }

  return (
    <ExpoLinearGradient colors={['#181036', '#090710', '#050507']} style={s.root}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.headerTitle}>Study Room</Text>
            <Text style={s.headerCode}>Code: {roomCode}</Text>
          </View>
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="people" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView 
            style={s.content} 
            showsVerticalScrollIndicator={false}
            ref={scrollViewRef}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            
            {/* Shared Task List */}
            <GlassCard style={s.card}>
              <View style={s.cardHeader}>
                <Ionicons name="list" size={18} color={colors.accentPrimary} />
                <Text style={s.cardTitle}>Shared Tasks</Text>
              </View>
              {room.tasks && room.tasks.length > 0 ? (
                room.tasks.map((t: any) => (
                  <TouchableOpacity key={t.id} style={s.taskRow} onPress={() => toggleTask(t.id, t.completed)}>
                    <Ionicons name={t.completed ? "checkmark-circle" : "ellipse-outline"} size={22} color={t.completed ? colors.accentGreen : colors.textMuted} />
                    <Text style={[s.taskTitle, t.completed && s.taskTitleCompleted]}>{t.title}</Text>
                    <Text style={s.taskAssignee}>{t.assigneeName}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={s.emptyText}>No shared tasks yet.</Text>
              )}
            </GlassCard>

            {/* Chat Area */}
            <View style={s.chatHeader}>
              <Ionicons name="chatbubbles" size={18} color={colors.accentSecondary} />
              <Text style={s.chatTitle}>Room Chat</Text>
            </View>

            <View style={s.chatList}>
              {room.messages && room.messages.map((m: any) => {
                const isMe = m.userId === user?.uid;
                const isSara = m.isSara;
                return (
                  <View key={m.id} style={[s.msgBubble, isMe ? s.msgMe : isSara ? s.msgSara : s.msgOther]}>
                    {!isMe && <Text style={s.msgName}>{m.userName}</Text>}
                    <Text style={[s.msgText, isMe && s.msgTextMe]}>{m.text}</Text>
                  </View>
                );
              })}
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Chat Input */}
          <View style={s.chatInputContainer}>
            <TextInput
              style={s.chatInput}
              placeholder="Message room or ask SARA..."
              placeholderTextColor={colors.textMuted}
              value={chatMessage}
              onChangeText={setChatMessage}
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity style={s.sendBtn} onPress={handleSendMessage}>
              <Ionicons name="send" size={18} color={isDark ? '#000000' : '#ffffff'} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ExpoLinearGradient>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl, paddingTop: SPACE.md, paddingBottom: SPACE.lg,
  },
  headerTitle: { fontFamily: FONT_FAMILY.title, fontSize: 18, color: colors.textPrimary },
  headerCode: { fontFamily: FONT_FAMILY.mono, fontSize: 12, color: colors.accentPrimary, marginTop: 2 },
  content: { flex: 1, paddingHorizontal: SPACE.xl },
  
  card: { padding: SPACE.lg, marginBottom: SPACE.xl },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md, gap: 8 },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
  
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  taskTitle: { flex: 1, fontFamily: FONT_FAMILY.medium, fontSize: 14, color: colors.textPrimary, marginLeft: SPACE.sm },
  taskTitleCompleted: { color: colors.textMuted, textDecorationLine: 'line-through' },
  taskAssignee: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textSecondary, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted, fontStyle: 'italic' },

  chatHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md, gap: 8 },
  chatTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
  chatList: { gap: SPACE.md },
  
  msgBubble: { padding: SPACE.md, borderRadius: RADIUS.lg, maxWidth: '85%' },
  msgMe: { alignSelf: 'flex-end', backgroundColor: colors.accentPrimary, borderBottomRightRadius: 4 },
  msgOther: { alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderBottomLeftRadius: 4 },
  msgSara: { alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.08)', borderBottomLeftRadius: 4, borderColor: colors.accentPrimary, borderWidth: 1 },
  msgName: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textSecondary, marginBottom: 4 },
  msgText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  msgTextMe: { color: isDark ? '#000000' : '#ffffff' },

  chatInputContainer: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  chatInput: {
    flex: 1, backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#F5F4FA', borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.lg, paddingVertical: 12,
    fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
});
