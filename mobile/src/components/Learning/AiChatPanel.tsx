/**
 * AiChatPanel.tsx - Extracted AI Chat Panel for LearningVideoPlayer
 *
 * Only mounted when aiChatVisible === true. Fully unmounts when closed,
 * freeing the Markdown renderer, code runner, ScrollView, and all event refs.
 */
import React, { useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Keyboard, Animated, ActivityIndicator, LayoutAnimation, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VsCodeSyntaxHighlighter from './VsCodeSyntaxHighlighter';
import InlineCodeRunner, { isRunnable } from './InlineCodeRunner';

interface AiChatPanelProps {
  aiHistory: { role: string; text: string }[];
  aiInput: string;
  setAiInput: (v: string) => void;
  aiLoading: boolean;
  sendAiMessage: (overrideText?: string) => void;
  generateQuiz: () => void;
  generatingCards: boolean;
  isChatFullScreen: boolean;
  setIsChatFullScreen: (v: boolean) => void;
  keyboardHeight: Animated.Value;
  isKeyboardVisible: boolean;
  selectedModel: string;
  onToggleModel?: () => void;
  resetChatHistory?: () => void;
  onOpenHistory: () => void;
  onExportResponseToNotes: (text: string) => void;
  onGenerateFlashcardsFromText: (text: string) => void;
  onGenerateFlashcards: () => void;
}

export default function AiChatPanel({
  aiHistory, aiInput, setAiInput, aiLoading, sendAiMessage, generateQuiz,
  generatingCards, isChatFullScreen, setIsChatFullScreen, keyboardHeight,
  isKeyboardVisible, selectedModel, onToggleModel, resetChatHistory,
  onOpenHistory, onExportResponseToNotes, onGenerateFlashcardsFromText, onGenerateFlashcards,
}: AiChatPanelProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const mdStylesModel = useMemo(() => makeMdStylesModel(colors, isDark), [colors, isDark]);
  const chatScrollRef = useRef<ScrollView>(null);

  const markdownRules = useMemo(() => ({
    fence: (node: any) => {
      const language = (node.sourceInfo || 'code').trim();
      const codeContent = (node.content || '').replace(/\n$/, '');
      if (isRunnable(language)) {
        return <InlineCodeRunner key={node.key} code={codeContent} language={language} nodeKey={node.key} />;
      }
      return (
        <View key={node.key} style={s.codeBoxContainer}>
          <View style={s.codeBoxHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#388bfd' }} />
              <Text style={s.codeBoxLang}>{language}</Text>
            </View>
            <TouchableOpacity style={s.codeCopyBtn} onPress={() => Clipboard.setStringAsync(codeContent)}>
              <Ionicons name="copy-outline" size={12} color="#858585" />
              <Text style={s.codeCopyText}>Copy</Text>
            </TouchableOpacity>
          </View>
          <VsCodeSyntaxHighlighter code={codeContent} language={language} showLineNumbers={true} />
        </View>
      );
    },
    code_block: (node: any) => {
      const codeContent = (node.content || '').replace(/\n$/, '');
      return (
        <View key={node.key} style={s.codeBoxContainer}>
          <VsCodeSyntaxHighlighter code={codeContent} showLineNumbers={false} />
        </View>
      );
    },
  }), [s]);

  const sanitize = (raw: string): string => {
    if (!raw) return '';
    return raw
      .replace(/\u2261\u0192\u00c6\u00ed/g, '\u{1F4A1}')
      .replace(/\u252c\u2556|\u252c\u2555|\u252c\u2500|\u252c/g, '\u00b7')
      .replace(/\u0393\u00e5\u00c6/g, '\u2192')
      .replace(/(^|\n|\s)\u00a9\s*/g, '$1C) ')
      .replace(/(^|\n|\s)\(([a-zA-Z])\)\s*/g, (_m: string, p1: string, p2: string) => `${p1}${p2.toUpperCase()}) `);
  };

  return (
    <View style={[s.aiPanel, isChatFullScreen && {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 100, backgroundColor: colors.background
    }]}>
      {isChatFullScreen && (
        <View style={{ paddingTop: Math.max(insets.top, 20), paddingBottom: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', zIndex: 110, position: 'absolute', top: 0, left: 0, right: 0 }}>
          <TouchableOpacity
            style={{ position: 'absolute', left: 20, top: Math.max(insets.top, 20), backgroundColor: isDark ? '#18181b' : colors.surface, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
            onPress={onOpenHistory}
          >
            <Ionicons name="time-outline" size={16} color={colors.accentPrimary} />
          </TouchableOpacity>
          {resetChatHistory && (
            <TouchableOpacity
              style={{ position: 'absolute', left: 62, top: Math.max(insets.top, 20), backgroundColor: isDark ? '#18181b' : colors.surface, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => Alert.alert('Clear Lecture Chat?', 'This will clear your conversation history for this lecture and start fresh.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: resetChatHistory }
              ])}
            >
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#18181b' : colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? '#22c55e' : '#059669' }} />
            <Text style={{ color: colors.textPrimary, fontSize: 12, fontFamily: FONT_FAMILY.bold, letterSpacing: 0.2 }}>ZEN-GPT</Text>
            {onToggleModel && (
              <TouchableOpacity onPress={onToggleModel} style={{ marginLeft: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 10, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
                  {selectedModel === 'gemini-3.7-flash' ? '👑 3.7' : '⚡ 2.5'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={{ position: 'absolute', right: 20, top: Math.max(insets.top, 20), backgroundColor: isDark ? '#18181b' : colors.surface, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setIsChatFullScreen(false); }}
          >
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        ref={chatScrollRef}
        onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: isChatFullScreen ? Math.max(insets.top, 20) + 60 : 12, paddingBottom: Math.max(140, insets.bottom + 120), gap: 20 }}
      >
        {aiHistory.map((item, i) => (
          <View key={i} style={[s.chatBubble, item.role === 'model' ? s.chatBubbleModel : s.chatBubbleUser]}>
            {item.role === 'model' ? (
              <View style={s.assistantContainer}>
                <View style={s.assistantHeader}>
                  <View style={s.assistantAvatar}>
                    <Ionicons name="sparkles" size={11} color={isDark ? '#00c16e' : '#059669'} />
                  </View>
                  <Text style={s.assistantName}>ZEN-GPT</Text>
                  <TouchableOpacity style={{ marginLeft: 6, padding: 4 }} onPress={() => Clipboard.setStringAsync(item.text)}>
                    <Ionicons name="copy-outline" size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ marginLeft: 6, paddingVertical: 2, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isDark ? 'rgba(0,193,110,0.12)' : 'rgba(5,150,105,0.10)', borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(0,193,110,0.25)' : 'rgba(5,150,105,0.25)' }}
                    onPress={() => onExportResponseToNotes(item.text)}
                  >
                    <Ionicons name="document-text-outline" size={11} color={isDark ? '#00c16e' : '#059669'} />
                    <Text style={{ color: isDark ? '#00c16e' : '#059669', fontSize: 10.5, fontFamily: FONT_FAMILY.bold }}>+ Notes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ marginLeft: 6, paddingVertical: 2, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.25)' }}
                    onPress={() => onGenerateFlashcardsFromText(item.text)}
                  >
                    <Ionicons name="flash-outline" size={11} color={colors.accentPrimary} />
                    <Text style={{ color: colors.accentPrimary, fontSize: 10.5, fontFamily: FONT_FAMILY.bold }}>+ Flashcards</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.markdownWrapper}>
                  <Markdown rules={markdownRules} style={mdStylesModel}>{sanitize(item.text)}</Markdown>
                </View>
              </View>
            ) : (
              <View style={s.userBubble}>
                <Text style={s.userBubbleText}>{item.text}</Text>
              </View>
            )}
          </View>
        ))}
        {aiLoading && (
          <View style={[s.chatBubble, s.chatBubbleModel]}>
            <View style={s.assistantHeader}>
              <View style={s.assistantAvatar}>
                <Ionicons name="sparkles" size={11} color={isDark ? '#00c16e' : '#059669'} />
              </View>
              <Text style={s.assistantName}>ZEN-GPT</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingLeft: 4 }}>
              <ActivityIndicator size="small" color={isDark ? '#00c16e' : '#059669'} />
              <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: FONT_FAMILY.body, fontStyle: 'italic' }}>Generating response...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <Animated.View style={[s.aiInputRow, { bottom: keyboardHeight, paddingBottom: isKeyboardVisible ? 8 : Math.max(16, insets.bottom) }]}>
        {!aiHistory.some(m => m.role === 'user') && (
          <View style={s.aiSuggestionsRow}>
            <TouchableOpacity style={s.chatgptPill} onPress={generateQuiz} activeOpacity={0.7}>
              <Ionicons name="sparkles" size={13} color={colors.accentPrimary} />
              <Text style={s.chatgptPillText}>Quiz Me</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.chatgptPill, generatingCards && { opacity: 0.6 }]} onPress={onGenerateFlashcards} disabled={generatingCards} activeOpacity={0.7}>
              <Ionicons name="flash" size={12} color={isDark ? '#00c16e' : '#059669'} />
              <Text style={[s.chatgptPillText, { color: isDark ? '#00c16e' : '#059669' }]}>
                {generatingCards ? 'Creating...' : '+ Flashcards'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={s.aiInputCapsule}>
          <TextInput
            style={s.aiInput}
            placeholder="Ask ZEN-GPT anything..."
            placeholderTextColor={colors.textMuted}
            value={aiInput}
            onChangeText={setAiInput}
            onSubmitEditing={() => { Keyboard.dismiss(); sendAiMessage(); }}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.aiSendBtn, (!aiInput.trim() || aiLoading) && s.aiSendBtnDisabled]}
            onPress={() => { Keyboard.dismiss(); sendAiMessage(); }}
            disabled={aiLoading || !aiInput.trim()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={18} color={isDark ? '#000000' : '#FFFFFF'} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  aiPanel: { flex: 1, backgroundColor: colors.background },
  chatBubble: { marginBottom: 18, width: '100%' },
  chatBubbleModel: { alignSelf: 'stretch', width: '100%' },
  chatBubbleUser: { alignItems: 'flex-end', width: '100%' },
  assistantContainer: { width: '100%' },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  assistantAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: isDark ? 'rgba(0,193,110,0.15)' : 'rgba(5,150,105,0.12)', alignItems: 'center', justifyContent: 'center' },
  assistantName: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: isDark ? '#a1a1aa' : colors.accentPrimary, letterSpacing: 0.3 },
  markdownWrapper: { width: '100%' },
  userBubble: { backgroundColor: isDark ? '#27272a' : colors.accentPrimary, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 16, paddingVertical: 10, maxWidth: '85%' },
  userBubbleText: { fontFamily: FONT_FAMILY.body, fontSize: 15, color: '#ffffff', lineHeight: 22 },
  aiInputRow: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8, backgroundColor: 'transparent' },
  aiSuggestionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, marginBottom: 8 },
  chatgptPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isDark ? 'rgba(28,28,30,0.75)' : '#FFFFFF', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  chatgptPillText: { color: isDark ? '#e4e4e7' : colors.accentPrimary, fontSize: 12, fontFamily: FONT_FAMILY.medium, letterSpacing: 0.1 },
  aiInputCapsule: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#18181b' : '#FFFFFF', borderRadius: 26, borderWidth: 1, borderColor: colors.border, paddingLeft: 16, paddingRight: 6, minHeight: 48 },
  aiInput: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 14.5, color: colors.textPrimary, maxHeight: 100, paddingVertical: 10 },
  aiSendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: isDark ? '#ffffff' : colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },
  aiSendBtnDisabled: { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(108,92,231,0.2)', opacity: 0.5 },
  codeBoxContainer: { backgroundColor: isDark ? '#1e1e1e' : '#F8F7FC', borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginVertical: 8, overflow: 'hidden' },
  codeBoxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isDark ? '#252526' : '#ECEBF2', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  codeBoxLang: { color: colors.textSecondary, fontSize: 11, fontFamily: FONT_FAMILY.bold, textTransform: 'uppercase' },
  codeCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2 },
  codeCopyText: { color: colors.textSecondary, fontSize: 11, fontFamily: FONT_FAMILY.bold },
});

const makeMdStylesModel = (colors: any, isDark: boolean) => StyleSheet.create({
  body: { color: isDark ? '#ececec' : '#1C1C1E', fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 24, letterSpacing: 0.15 },
  heading1: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 12, marginBottom: 6, lineHeight: 24 },
  heading2: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 10, marginBottom: 4, lineHeight: 22 },
  heading3: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 8, marginBottom: 4, lineHeight: 20 },
  strong: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  em: { color: isDark ? '#e5e5ea' : '#3A3A3C', fontStyle: 'italic' },
  bullet_list_icon: { color: isDark ? '#00c16e' : '#059669', fontSize: 14, marginTop: 3, marginRight: 8 },
  ordered_list_icon: { color: isDark ? '#00c16e' : '#059669', fontSize: 14, marginTop: 3, marginRight: 8 },
  code_inline: { color: isDark ? '#00c16e' : '#059669', backgroundColor: 'transparent', fontFamily: 'Inter_600SemiBold', fontSize: 14.5 },
  code_block: { color: isDark ? '#f2f2f7' : '#1C1C1E', backgroundColor: isDark ? '#141416' : '#F8F7FC', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: colors.border, fontSize: 13.5 },
  fence: { color: isDark ? '#f2f2f7' : '#1C1C1E', backgroundColor: isDark ? '#141416' : '#F8F7FC', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: colors.border, fontSize: 13.5 },
  pre: { backgroundColor: isDark ? '#141416' : '#F8F7FC', borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginVertical: 6 },
  blockquote: { backgroundColor: isDark ? 'rgba(0,193,110,0.08)' : 'rgba(5,150,105,0.08)', borderColor: isDark ? '#00c16e' : '#059669', borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, borderRadius: 4 },
  table: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, backgroundColor: isDark ? '#141416' : '#F8F7FC', marginVertical: 8 },
  tr: { borderColor: colors.border, borderBottomWidth: 1, flexDirection: 'row' },
  th: { backgroundColor: isDark ? '#1c1c1e' : '#ECEBF2', color: isDark ? '#00c16e' : '#059669', padding: 8, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  td: { padding: 8, color: colors.textPrimary, fontSize: 13 },
  paragraph: { marginTop: 0, marginBottom: 8 },
});
