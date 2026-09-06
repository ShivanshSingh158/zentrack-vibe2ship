/**
 * NoteEditorModal.tsx — ZenTrack Mobile
 *
 * High-performance, isolated Markdown note editor with AI co-writing partner (Sara) and PDF exporter.
 * Ref-based cursor selection tracking eliminates typing latency and cursor-move re-render loops.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';

import { db } from '../../services/firebase';
import type { StorageNode } from '../../contexts/MobileDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useCreativeData } from '../../contexts/domains/CreativeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { callGeminiProxy } from '../../services/geminiProxy';
import { safeAdd, safeUpdate } from '../../utils/safeWrite';
import { handleSyncError } from '../../utils/errorUtils';
import { feedback } from '../../utils/haptics';

interface NoteEditorModalProps {
  note: StorageNode | null; // null if creating new
  userId: string;
  parentId: string | null;
  onClose: () => void;
}

const AI_QUICK_ACTIONS = [
  { label: '📚 Study Guide', prompt: 'Convert these notes into a structured study guide with headers and key definitions.' },
  { label: '❓ Practice Questions', prompt: 'Generate 10 exam-style questions from this content with answers.' },
  { label: '🧠 Mind Map', prompt: 'Create a hierarchical mind map outline from this content.' },
  { label: '📝 Summary Card', prompt: 'Create a 5-bullet flashcard summary of the key points.' },
  { label: '🔍 Gap Analysis', prompt: 'What important topics from this subject might be missing from these notes?' },
  { label: '🗣️ ELI5', prompt: 'Explain this content in the simplest possible language for a beginner.' },
];

export const NoteEditorModal = React.memo(function NoteEditorModal({
  note,
  userId,
  parentId,
  onClose,
}: NoteEditorModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const mdStyles = useMemo(() => makeMarkdownStyles(colors, isDark), [colors, isDark]);

  const { optimisticAddStorageNode, optimisticUpdateStorageNode } = useCreativeData();

  const [title, setTitle] = useState(note?.name || '');
  const [content, setContent] = useState(note?.content || '');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showAi, setShowAi] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Use a ref for selection instead of state to prevent re-renders on every cursor tap
  const selectionRef = useRef({ start: 0, end: 0 });

  const isNew = !note;

  useEffect(() => {
    if (note) {
      setTitle(note.name);
      setContent(note.content || '');
    } else {
      setTitle('');
      setContent('');
    }
    setViewMode('edit');
    setShowAi(false);
    setChatHistory([]);
  }, [note]);

  const handleSave = useCallback(() => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please provide a title for the note.');
      return;
    }

    feedback.commit();
    setSaving(true);

    const now = Date.now();

    if (isNew) {
      const tempId = `note_temp_${now}`;
      const noteData: StorageNode = {
        id: tempId,
        userId,
        tags: [],
        type: 'note',
        name: title.trim(),
        content: content.trim(),
        parentId,
        createdAt: now,
        updatedAt: now,
      };

      // 0ms Optimistic UI update
      optimisticAddStorageNode(noteData);

      const firestorePayload = {
        userId,
        tags: [],
        type: 'note',
        name: title.trim(),
        content: content.trim(),
        parentId,
        createdAt: now,
        updatedAt: now,
      };

      safeAdd(
        'storage_nodes',
        firestorePayload,
        () => addDoc(collection(db, 'storage_nodes'), firestorePayload)
      ).catch(handleSyncError);
    } else {
      // 0ms Optimistic update
      optimisticUpdateStorageNode(note.id!, {
        name: title.trim(),
        content: content.trim(),
        updatedAt: now,
      });

      const updateData = {
        name: title.trim(),
        tags: note.tags || [],
        content: content.trim(),
        updatedAt: now,
      };

      safeUpdate(
        note.id!,
        'storage_nodes',
        updateData,
        () => updateDoc(doc(db, 'storage_nodes', note.id!), updateData)
      ).catch(handleSyncError);
    }

    setSaving(false);
    onClose();
  }, [title, content, isNew, note, userId, parentId, optimisticAddStorageNode, optimisticUpdateStorageNode, onClose]);

  const insertMarkdown = useCallback((prefix: string, suffix: string = '') => {
    const { start, end } = selectionRef.current;
    setContent(prev => {
      const selectedText = prev.substring(start, end);
      return prev.substring(0, start) + prefix + selectedText + suffix + prev.substring(end);
    });
  }, []);

  const handleAiSubmit = useCallback(async (prompt?: string) => {
    const userPrompt = prompt || aiInput.trim();
    if (!userPrompt) return;

    setAiInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userPrompt }]);
    setAiLoading(true);

    try {
      const noteCtx = content ? `The current note content is:\n\n${content}\n\n` : 'The note is currently empty.';

      const ctx = `You are Sara — ZenTrack's deeply personalised AI writing partner operating inside the user's private note vault.

YOUR PERSONALITY:
— You are precise, insightful, and genuinely engaged with the user's knowledge and goals.
— You treat every request as if you're a world-class expert on the subject being discussed.
— You write like a knowledgeable mentor who values the user's time.

CRITICAL FORMATTING RULES (non-negotiable):
1. NEVER use markdown symbols: no *, no **, no #, no ##, no ===, no ---, no backtick fences.
2. Structure your response using NUMBERED SECTIONS and CAPITALISED SUBHEADINGS only.
3. Use line breaks and indentation (spaces) to show hierarchy — not markdown.
4. Bold important terms by writing them in ALL CAPS sparingly — not with asterisks.
5. Always write in complete, detailed sentences — never bullet dumps.
6. If listing items, write them as: "1. First item explanation...", "2. Second item..."
7. Every response must be thorough, accurate, and contain genuine depth — not surface-level.
8. If asked to write, draft, or expand — produce a FULL, polished version, not a skeleton.
9. Speak directly to the user. Be personal. Reference their note content when relevant.
10. End each response with a concise "NEXT STEPS" or "KEY TAKEAWAY" section.

CURRENT NOTE CONTEXT:
${noteCtx}

Remember: Your output will be inserted directly into a note. Zero markdown symbols. Pure structured prose.`;

      const text = await callGeminiProxy(
        [{ parts: [{ text: `${ctx}\n\nUser request: ${userPrompt}` }] }],
        {
          maxOutputTokens: 32768,
          temperature: 0.75,
        }
      );
      setChatHistory(prev => [...prev, { role: 'model', text }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please try again.' }]);
    }
    setAiLoading(false);
  }, [aiInput, content]);

  const handleExportPdf = useCallback(async () => {
    try {
      const escapeHtml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const formatContent = (raw: string) => {
        const lines = raw.split('\n');
        let html = '';
        let inCodeBlock = false;
        let codeBuffer = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('```')) {
            if (!inCodeBlock) { inCodeBlock = true; codeBuffer = ''; continue; }
            html += `<pre><code>${escapeHtml(codeBuffer.trim())}</code></pre>\n`;
            inCodeBlock = false; codeBuffer = '';
            continue;
          }
          if (inCodeBlock) { codeBuffer += line + '\n'; continue; }

          const escaped = escapeHtml(line);
          const processed = escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');

          if (/^### /.test(line)) html += `<h3>${processed.replace(/^### /, '')}</h3>\n`;
          else if (/^## /.test(line)) html += `<h2>${processed.replace(/^## /, '')}</h2>\n`;
          else if (/^# /.test(line)) html += `<h1>${processed.replace(/^# /, '')}</h1>\n`;
          else if (/^- /.test(line)) html += `<li>${processed.replace(/^- /, '')}</li>\n`;
          else if (/^\d+\. /.test(line)) html += `<li>${processed.replace(/^\d+\.\s/, '')}</li>\n`;
          else if (line.trim() === '') html += '<br>';
          else html += `<p>${processed}</p>\n`;
        }
        return html;
      };

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                padding: 40px 48px;
                color: #1c1c1e;
                font-size: 15px;
                line-height: 1.75;
                background: #ffffff;
              }
              .doc-title {
                font-size: 30px;
                font-weight: 700;
                color: #000;
                border-bottom: 2px solid #e5e5ea;
                padding-bottom: 16px;
                margin-bottom: 28px;
              }
              h1 { font-size: 24px; font-weight: 700; color: #000; margin: 28px 0 12px; }
              h2 { font-size: 20px; font-weight: 600; color: #1c1c1e; margin: 22px 0 10px; }
              h3 { font-size: 17px; font-weight: 600; color: #3a3a3c; margin: 18px 0 8px; }
              p  { margin-bottom: 14px; color: #1c1c1e; }
              li { margin-left: 24px; margin-bottom: 8px; color: #1c1c1e; }
              strong { font-weight: 700; }
              em { font-style: italic; }
              code {
                background: #f2f2f7;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'Menlo', 'Courier New', monospace;
                font-size: 13px;
                color: #c0392b;
              }
              pre {
                background: #f2f2f7;
                border-left: 4px solid #a599ff;
                padding: 16px 20px;
                border-radius: 8px;
                margin: 18px 0;
                overflow-x: auto;
              }
              pre code {
                background: none;
                padding: 0;
                color: #1c1c1e;
                font-size: 13px;
                line-height: 1.6;
              }
              blockquote {
                border-left: 4px solid #a599ff;
                padding-left: 18px;
                color: #636366;
                font-style: italic;
                margin: 16px 0;
              }
              .footer {
                margin-top: 48px;
                padding-top: 16px;
                border-top: 1px solid #e5e5ea;
                font-size: 11px;
                color: #8e8e93;
              }
            </style>
          </head>
          <body>
            <div class="doc-title">${escapeHtml(title || 'Untitled Note')}</div>
            <div class="note-body">${formatContent(content)}</div>
            <div class="footer">Exported from ZenTrack Notes &nbsp;&bull;&nbsp; ${((d) => { const dd = String(d.getDate()).padStart(2,'0'); const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]; return dd + ' ' + mo + ' ' + d.getFullYear(); })(new Date())}</div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to generate PDF');
    }
  }, [title, content]);

  return (
    <Modal visible={true} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.editorRoot}>
        {/* Header */}
        <View style={styles.editorHeader}>
          <TouchableOpacity onPress={onClose} style={styles.editorBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.editorTabs}>
            <TouchableOpacity onPress={() => setViewMode('edit')} style={[styles.tabBtn, viewMode === 'edit' && styles.tabBtnActive]}>
              <Text style={[styles.tabText, viewMode === 'edit' && styles.tabTextActive]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setViewMode('preview')} style={[styles.tabBtn, viewMode === 'preview' && styles.tabBtnActive]}>
              <Text style={[styles.tabText, viewMode === 'preview' && styles.tabTextActive]}>Preview</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.editorBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.accentPrimary} />
            ) : (
              <Ionicons name="checkmark" size={24} color={colors.accentPrimary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Toolbar */}
        <View style={styles.editorToolbar}>
          <TextInput
            style={styles.editorTitleInput}
            placeholder="Note Title..."
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={handleExportPdf} style={styles.aiToggleBtn}>
              <Ionicons name="download-outline" size={16} color={colors.accentPrimary} />
              <Text style={styles.aiToggleText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowAi(!showAi)}
              style={[styles.aiToggleBtn, showAi && styles.aiToggleBtnActive]}
            >
              <Image source={require('../../../assets/images/sara-running.png')} style={{ width: 16, height: 16 }} resizeMode="contain" />
              <Text style={[styles.aiToggleText, showAi && { color: isDark ? '#000000' : '#FFFFFF' }]}>AI</Text>
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1, flexDirection: 'row' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Main Area */}
          <View style={{ flex: 1 }}>
            {viewMode === 'edit' ? (
              <>
                <View style={[styles.markdownBar, { backgroundColor: isDark ? '#141416' : '#F8F7FC', borderColor: colors.border }]}>
                  <TouchableOpacity onPress={() => insertMarkdown('**', '**')}>
                    <Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 16 }}>B</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('*', '*')}>
                    <Text style={{ color: colors.textPrimary, fontStyle: 'italic', fontSize: 16 }}>I</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('### ')}>
                    <Ionicons name="text-outline" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('- ')}>
                    <Ionicons name="list" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('```\n', '\n```')}>
                    <Ionicons name="code-slash" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.editorTextArea}
                  placeholder="Start writing (Markdown supported)..."
                  placeholderTextColor={colors.textMuted}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                  onSelectionChange={(e) => {
                    selectionRef.current = e.nativeEvent.selection;
                  }}
                />
              </>
            ) : (
              <ScrollView style={styles.markdownPreview}>
                <Markdown style={mdStyles}>{content || '*Nothing to preview.*'}</Markdown>
              </ScrollView>
            )}
          </View>

          {/* AI Panel */}
          {showAi && (
            <View style={styles.aiPanel}>
              <View style={styles.aiPanelHeader}>
                <Image source={require('../../../assets/images/sara-idle.png')} style={{ width: 16, height: 16 }} resizeMode="contain" />
                <Text style={styles.aiPanelTitle}>Sara</Text>
              </View>
              <ScrollView style={styles.aiChatArea} contentContainerStyle={{ padding: SPACE.sm }}>
                <View style={styles.aiMsgSystem}>
                  <Text style={styles.aiMsgTextSystem}>
                    I can help you write, summarize, explain, expand, rewrite, or extract insights from this note. What do you need?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {AI_QUICK_ACTIONS.map(action => (
                      <TouchableOpacity
                        key={action.label}
                        style={styles.aiQuickBtn}
                        onPress={() => handleAiSubmit(action.prompt)}
                      >
                        <Text style={styles.aiQuickBtnText}>{action.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {chatHistory.map((msg, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.chatBubble,
                      msg.role === 'user'
                        ? { alignSelf: 'flex-end', backgroundColor: isDark ? '#27272A' : colors.accentPrimary }
                        : { alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(165,153,255,0.10)' : 'rgba(108,92,231,0.08)' },
                    ]}
                  >
                    <Text style={{ color: msg.role === 'user' ? '#ffffff' : colors.textPrimary, fontSize: 13, lineHeight: 18 }}>
                      {msg.text}
                    </Text>
                    {msg.role === 'model' && (
                      <TouchableOpacity
                        style={styles.insertBtn}
                        onPress={() => setContent(prev => (prev ? prev + '\n\n' : '') + msg.text)}
                      >
                        <Ionicons name="arrow-down-circle-outline" size={14} color={colors.accentPrimary} />
                        <Text style={{ fontSize: 11, color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }}>Insert to Note</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {aiLoading && (
                  <View style={[styles.chatBubble, { alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(165,153,255,0.10)' : 'rgba(108,92,231,0.08)' }]}>
                    <ActivityIndicator size="small" color={colors.accentPrimary} />
                  </View>
                )}
              </ScrollView>
              <View style={styles.aiInputArea}>
                <TextInput
                  style={styles.aiInput}
                  placeholder="Ask AI..."
                  placeholderTextColor={colors.textMuted}
                  value={aiInput}
                  onChangeText={setAiInput}
                  onSubmitEditing={() => handleAiSubmit()}
                />
                <TouchableOpacity style={styles.aiSendBtn} onPress={() => handleAiSubmit()}>
                  <Ionicons name="send" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
});

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  editorRoot: { flex: 1, backgroundColor: colors.background },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editorBtn: { padding: SPACE.sm },
  editorTabs: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#08080A' : '#EAE9F2',
    borderRadius: RADIUS.md,
    padding: 4,
  },
  tabBtn: { paddingHorizontal: SPACE.lg, paddingVertical: 6, borderRadius: RADIUS.sm },
  tabBtnActive: { backgroundColor: isDark ? '#1A1A1E' : '#FFFFFF' },
  tabText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },
  editorToolbar: {
    flexDirection: 'row',
    padding: SPACE.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: SPACE.md,
    backgroundColor: colors.surface,
  },
  editorTitleInput: { flex: 1, fontFamily: FONT_FAMILY.title, fontSize: 22, color: colors.textPrimary },
  aiToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)',
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)',
  },
  aiToggleBtnActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  aiToggleText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.accentPrimary },
  markdownBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 16,
  },
  editorTextArea: {
    flex: 1,
    padding: SPACE.xl,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
  },
  markdownPreview: { flex: 1, padding: SPACE.xl, backgroundColor: isDark ? '#000000' : '#FFFFFF' },
  aiPanel: {
    width: 300,
    borderLeftWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderTopLeftRadius: RADIUS.lg,
  },
  aiPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    padding: SPACE.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  aiPanelTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
  aiChatArea: { flex: 1 },
  aiMsgSystem: {
    backgroundColor: isDark ? '#08080A' : '#F8F7FC',
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiMsgTextSystem: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary },
  aiQuickBtn: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)',
  },
  aiQuickBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentPrimary },
  chatBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: '90%',
  },
  insertBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: isDark ? 'rgba(165,153,255,0.20)' : 'rgba(108,92,231,0.15)',
    borderRadius: 6,
  },
  aiInputArea: {
    flexDirection: 'row',
    padding: SPACE.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: SPACE.sm,
    backgroundColor: colors.surface,
  },
  aiInput: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : '#F5F4FA',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
    borderWidth: 1,
    borderColor: colors.border,
  },
  aiSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const makeMarkdownStyles = (colors: any, isDark: boolean = true) => ({
  body:             { color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: 16, lineHeight: 26, backgroundColor: 'transparent' },
  paragraph:        { color: colors.textPrimary, marginBottom: 12, backgroundColor: 'transparent' },
  heading1:         { color: colors.textPrimary, fontFamily: FONT_FAMILY.title, fontSize: 24, marginTop: 24, marginBottom: 10, backgroundColor: 'transparent' },
  heading2:         { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 20, marginTop: 18, marginBottom: 8, backgroundColor: 'transparent' },
  heading3:         { color: isDark ? '#E5E5EA' : '#3A3A3C', fontFamily: FONT_FAMILY.bold, fontSize: 17, marginTop: 14, marginBottom: 6, backgroundColor: 'transparent' },
  code_inline:      { backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : '#F0EFF7', fontFamily: 'monospace', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: isDark ? '#FF9F4D' : '#D97706', fontSize: 14 },
  code_block:       { backgroundColor: isDark ? '#08080A' : '#F8F7FC', fontFamily: 'monospace', padding: 16, borderRadius: 10, color: colors.textPrimary, fontSize: 13, lineHeight: 20, marginVertical: 10, borderWidth: 1, borderColor: colors.border },
  fence:            { backgroundColor: isDark ? '#08080A' : '#F8F7FC', fontFamily: 'monospace', padding: 16, borderRadius: 10, color: colors.textPrimary, fontSize: 13, lineHeight: 20, marginVertical: 10, borderWidth: 1, borderColor: colors.border },
  pre:              { backgroundColor: isDark ? '#08080A' : '#F8F7FC', borderRadius: 10, marginVertical: 10, padding: 0, borderLeftWidth: 4, borderLeftColor: colors.accentPrimary },
  blockquote:       { backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.08)', borderLeftWidth: 4, borderLeftColor: colors.accentPrimary, paddingLeft: 14, paddingVertical: 8, marginVertical: 10, borderRadius: 4 },
  blockquote_text:  { color: colors.textSecondary, fontStyle: 'italic' as const, fontFamily: FONT_FAMILY.body },
  bullet_list:      { marginVertical: 6, backgroundColor: 'transparent' },
  ordered_list:     { marginVertical: 6, backgroundColor: 'transparent' },
  list_item:        { color: colors.textPrimary, marginBottom: 6, backgroundColor: 'transparent' },
  bullet_list_icon: { color: colors.accentPrimary, fontSize: 14, marginTop: 6 },
  ordered_list_icon:{ color: colors.accentPrimary, fontSize: 14, marginTop: 6 },
  link:             { color: colors.accentPrimary, textDecorationLine: 'underline' as const },
  table:            { backgroundColor: colors.surface, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: colors.border },
  th:               { backgroundColor: isDark ? '#08080A' : '#ECEBF2', padding: 8, color: colors.textPrimary, fontFamily: FONT_FAMILY.bold },
  td:               { backgroundColor: 'transparent', padding: 8, color: colors.textSecondary, borderBottomColor: colors.border, borderBottomWidth: 1 },
  strong:           { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold },
  em:               { color: colors.textSecondary, fontStyle: 'italic' as const },
  image:            { borderRadius: 8, marginVertical: 10 },
  hr:               { backgroundColor: colors.border, height: 1, marginVertical: 14 },
});

export default NoteEditorModal;
