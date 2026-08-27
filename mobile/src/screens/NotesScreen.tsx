/**
 * NotesScreen — ZenTrack Mobile
 * Full Cloud File Manager: Folders, Notes (with Markdown & AI panel UI), and Files (PDF/DOCX viewers via WebView).
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  TextInput, Modal, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Alert, ActivityIndicator, Image, InteractionManager
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useCreativeData } from '../contexts/domains/CreativeContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import type { StorageNode } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { uploadFileToCloudinary } from '../services/cloudinary';
import * as DocumentPicker from 'expo-document-picker';
import Markdown from 'react-native-markdown-display';
import { WebView } from 'react-native-webview';
import { callGeminiProxy } from '../services/geminiProxy';
import Svg, { Circle } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from "../contexts/ThemeContext";
import { timeAgo } from '../utils/dateUtils';
import { handleSyncError } from '../utils/errorUtils';
import EmptyState from '../components/ui/EmptyState';
import { safeAdd, safeUpdate, safeDelete } from '../utils/safeWrite';
import { feedback } from '../utils/haptics';
import VaultDocumentViewer from '../components/Vault/VaultDocumentViewer';
import { cacheLocalFile } from '../services/vaultCacheService';

const UploadProgressRing = ({ progress }: { progress: number }) => {
  const { colors, isDark } = useTheme();
  const radius = 12;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Svg height="32" width="32" viewBox="0 0 32 32">
        <Circle stroke={isDark ? "#2c2c2e" : "#E2E1EA"} fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx="16" cy="16" />
        <Circle
          stroke={colors.accentPrimary}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius} cx="16" cy="16"
          strokeLinecap="round"
          transform="rotate(-90 16 16)"
        />
      </Svg>
    </View>
  );
};

// ─── Note Editor + AI Panel ────────────────────────────────────────────────
function NoteEditorModal({ note, userId, parentId, onClose }: {
  note: StorageNode | null; // null if creating new
  userId: string;
  parentId: string | null;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const mdStyles = useMemo(() => makeMarkdownStyles(colors, isDark), [colors, isDark]);
  const [title, setTitle] = useState(note?.name || '');
  const [content, setContent] = useState(note?.content || '');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showAi, setShowAi] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const [selection, setSelection] = useState({ start: 0, end: 0 });

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

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please provide a title for the note.');
      return;
    }
    
    feedback.commit();
    
    if (isNew) {
      const noteData = {
        userId,
        tags: [],
        type: 'note',
        name: title.trim(),
        content: content.trim(),
        parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      safeAdd(
        'storage_nodes',
        noteData,
        () => addDoc(collection(db, 'storage_nodes'), noteData)
      ).catch(handleSyncError);
    } else {
      const updateData = {
        name: title.trim(),
        tags: [],
        content: content.trim(),
        updatedAt: Date.now(),
      };
      safeUpdate(
        note.id!,
        'storage_nodes',
        updateData,
        () => updateDoc(doc(db, 'storage_nodes', note.id!), updateData)
      ).catch(handleSyncError);
    }
    
    onClose();
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const start = selection.start;
    const end = selection.end;
    const selectedText = content.substring(start, end);
    const newText = content.substring(0, start) + prefix + selectedText + suffix + content.substring(end);
    setContent(newText);
  };

  const handleAiSubmit = async (prompt?: string) => {
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
          maxOutputTokens: 32768,   // Gemini 2.5 Flash maximum — no artificial truncation
          temperature: 0.75,        // High enough for rich, creative prose; precise enough for accuracy
        }
      );
      setChatHistory(prev => [...prev, { role: 'model', text }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please try again.' }]);
    }
    setAiLoading(false);
  };

  const handleExportPdf = async () => {
    try {
      // Full content converter: strips markdown symbols, formats as clean structured HTML
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
  };

  if (note === undefined && !isNew) return null; // Avoid render if closed

  return (
    <Modal visible={true} animationType="slide">
      <SafeAreaView style={styles.editorRoot}>
        {/* Header */}
        <View style={styles.editorHeader}>
          <TouchableOpacity onPress={onClose} style={styles.editorBtn}>
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
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.editorBtn}>
            {saving ? <ActivityIndicator size="small" color={colors.accentPrimary} /> : <Ionicons name="checkmark" size={24} color={colors.accentPrimary} />}
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
            <TouchableOpacity onPress={() => setShowAi(!showAi)} style={[styles.aiToggleBtn, showAi && styles.aiToggleBtnActive]}>
              <Image source={require('../../assets/images/sara-running.png')} style={{ width: 16, height: 16 }} resizeMode="contain" />
              <Text style={[styles.aiToggleText, showAi && { color: isDark ? '#000000' : '#FFFFFF' }]}>AI</Text>
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1, flexDirection: 'row' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Main Area */}
          <View style={{ flex: 1 }}>
            {viewMode === 'edit' ? (
              <>
                <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#141416' : '#F8F7FC', paddingHorizontal: SPACE.md, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border, gap: 16 }}>
                  <TouchableOpacity onPress={() => insertMarkdown('**', '**')}><Text style={{ color: colors.textPrimary, fontWeight: 'bold', fontSize: 16 }}>B</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('*', '*')}><Text style={{ color: colors.textPrimary, fontStyle: 'italic', fontSize: 16 }}>I</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('### ')}><Ionicons name="text-outline" size={18} color={colors.textPrimary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('- ')}><Ionicons name="list" size={18} color={colors.textPrimary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('```\n', '\n```')}><Ionicons name="code-slash" size={18} color={colors.textPrimary} /></TouchableOpacity>
                </View>
                <TextInput
                  style={styles.editorTextArea}
                  placeholder="Start writing (Markdown supported)..."
                  placeholderTextColor={colors.textMuted}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                  onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
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
                <Image source={require('../../assets/images/sara-idle.png')} style={{ width: 16, height: 16 }} resizeMode="contain" />
                <Text style={styles.aiPanelTitle}>Sara</Text>
              </View>
              <ScrollView style={styles.aiChatArea} contentContainerStyle={{ padding: SPACE.sm }}>
                <View style={styles.aiMsgSystem}>
                  <Text style={styles.aiMsgTextSystem}>I can help you write, summarize, explain, expand, rewrite, or extract insights from this note. What do you need?</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>

                    {[{ label: '📚 Study Guide', prompt: 'Convert these notes into a structured study guide with headers and key definitions.' },
                      { label: '❓ Practice Questions', prompt: 'Generate 10 exam-style questions from this content with answers.' },
                      { label: '🧠 Mind Map', prompt: 'Create a hierarchical mind map outline from this content.' },
                      { label: '📝 Summary Card', prompt: 'Create a 5-bullet flashcard summary of the key points.' },
                      { label: '🔍 Gap Analysis', prompt: 'What important topics from this subject might be missing from these notes?' },
                      { label: '🗣️ ELI5', prompt: 'Explain this content in the simplest possible language for a beginner.' }
                    ].map(action => (
                      <TouchableOpacity key={action.label} style={styles.aiQuickBtn} onPress={() => handleAiSubmit(action.prompt)}>
                        <Text style={styles.aiQuickBtnText}>{action.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {chatHistory.map((msg, idx) => (
                  <View key={idx} style={[{ padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '90%' }, msg.role === 'user' ? { alignSelf: 'flex-end', backgroundColor: isDark ? '#27272A' : colors.accentPrimary } : { alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(165,153,255,0.10)' : 'rgba(108,92,231,0.08)' }]}>
                    <Text style={{ color: msg.role === 'user' ? '#ffffff' : colors.textPrimary, fontSize: 13, lineHeight: 18 }}>{msg.text}</Text>
                    {msg.role === 'model' && (
                      <TouchableOpacity
                        style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: isDark ? 'rgba(165,153,255,0.20)' : 'rgba(108,92,231,0.15)', borderRadius: 6 }}
                        onPress={() => setContent(prev => (prev ? prev + '\n\n' : '') + msg.text)}
                      >
                        <Ionicons name="arrow-down-circle-outline" size={14} color={colors.accentPrimary} />
                        <Text style={{ fontSize: 11, color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }}>Insert to Note</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {aiLoading && (
                  <View style={{ padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '90%', alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(165,153,255,0.10)' : 'rgba(108,92,231,0.08)' }}>
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
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function NotesScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { storageNodes, ensureSubscribed } = useCreativeData();
  const { user } = useCoreData();

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [showFabMenu, setShowFabMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSize, setUploadSize] = useState('0 MB');
  const [uploadFileName, setUploadFileName] = useState('');

  // Modals
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editorNote, setEditorNote] = useState<StorageNode | null | 'new'>(null);
  const [viewerNode, setViewerNode] = useState<StorageNode | null>(null);

  // Action Menu
  const [menuItem, setMenuItem] = useState<StorageNode | null>(null);
  const [renameNode, setRenameNode] = useState<StorageNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveNode, setMoveNode] = useState<StorageNode | null>(null);

  // New states for the requested features
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'All' | 'Documents' | 'Images' | 'Notes'>('All');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const storageStats = useMemo(() => {
    const usedBytes = storageNodes.reduce((acc, node) => acc + (node.size || 0), 0);
    const maxBytes = 25 * 1024 * 1024 * 1024; // 25 GB
    const percentage = Math.min(100, (usedBytes / maxBytes) * 100);

    let usedText = '';
    const gb = usedBytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      usedText = gb.toFixed(1) + ' GB';
    } else {
      const mb = usedBytes / (1024 * 1024);
      usedText = mb.toFixed(1) + ' MB';
    }

    return {
      usedText,
      percentage: percentage.toFixed(2) + '%',
      maxText: '25 GB'
    };
  }, [storageNodes]);

  // Filter items in current folder
  const currentItems = useMemo(() => {
    let items = storageNodes.filter(n => (n.parentId ?? null) === currentFolderId);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      // "Search all files..." implies global search within the storage
      items = items.filter(n => n.name.toLowerCase().includes(q) || (n.content && n.content.toLowerCase().includes(q)));
    }

    if (filterMode === 'Documents') {
      items = items.filter(n => n.type === 'file' && (n.fileType === 'pdf' || n.fileType === 'docx' || n.fileType === 'other'));
    } else if (filterMode === 'Images') {
      items = items.filter(n => n.type === 'file' && n.fileType === 'image');
    } else if (filterMode === 'Notes') {
      items = items.filter(n => n.type === 'note');
    }

    return items.sort((a, b) => {
      // Pinned first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Folders next
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;

      if (sortMode === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortMode === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
      return a.name.localeCompare(b.name);
    });
  }, [storageNodes, currentFolderId, searchQuery, sortMode, filterMode]);

  // Breadcrumbs — O(1) indexed Map lookup
  const breadcrumbs = useMemo(() => {
    const nodeMap = new Map<string, StorageNode>();
    for (const n of storageNodes) {
      if (n.id) nodeMap.set(n.id, n);
    }
    const crumbs: { id: string | null; name: string }[] = [];
    let curr = currentFolderId;
    while (curr) {
      const node = nodeMap.get(curr);
      if (node) {
        crumbs.unshift({ id: node.id!, name: node.name });
        curr = node.parentId;
      } else {
        break;
      }
    }
    // Only add Home if we are inside a folder
    if (currentFolderId) {
      crumbs.unshift({ id: null, name: 'Home' });
    }
    return crumbs;
  }, [storageNodes, currentFolderId]);

  // Handlers
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    try {
      await addDoc(collection(db, 'storage_nodes'), {
        userId: user.uid,
        type: 'folder',
        name: newFolderName.trim(),
        parentId: currentFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setNewFolderName('');
      setShowNewFolder(false);
      setShowFabMenu(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to create folder');
    }
  };

  const handleFileUpload = async () => {
    if (!user) return;
    setShowFabMenu(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];

      setUploading(true);
      setUploadProgress(0);
      setUploadSize((file.size ? (file.size / (1024 * 1024)).toFixed(1) : '1.0') + ' MB');
      setUploadFileName(file.name || 'Document');
      const mime = file.mimeType || 'application/octet-stream';
      let ftype: 'pdf' | 'docx' | 'image' | 'other' = 'other';
      if (mime.includes('pdf') || file.name?.toLowerCase().endsWith('.pdf')) ftype = 'pdf';
      else if (mime.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '')) ftype = 'image';
      else if (mime.includes('word') || /\.(doc|docx)$/i.test(file.name || '')) ftype = 'docx';

      const uploadRes = await uploadFileToCloudinary(file.uri, mime, file.name, (p) => setUploadProgress(p));

      // ⚡ Pre-cache local file into vault cache (safe fallback if copy fails)
      try {
        await cacheLocalFile(file.uri, uploadRes.url, file.name);
      } catch (cacheErr) {
        console.warn('[NotesScreen] Pre-cache non-fatal warning:', cacheErr);
      }

      const docPayload = {
        userId: user.uid,
        type: 'file' as const,
        fileType: ftype,
        name: file.name || 'Uploaded Document',
        url: uploadRes.url,
        size: uploadRes.size || file.size || 0,
        parentId: currentFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await safeAdd('storage_nodes', docPayload, () =>
        addDoc(collection(db, 'storage_nodes'), docPayload)
      );

      feedback.success();
    } catch (e: any) {
      console.error('[NotesScreen] Upload error:', e);
      Alert.alert('Upload Issue', e?.message || 'There was an error uploading the file.');
    } finally {
      setUploading(false);
    }
  };

  const handlePin = async (id: string, isPinned: boolean) => {
    try {
      await updateDoc(doc(db, 'storage_nodes', id), { pinned: !isPinned, updatedAt: Date.now() });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update pin status.');
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          safeDelete(
            id,
            'storage_nodes',
            () => deleteDoc(doc(db, 'storage_nodes', id))
          ).catch(handleSyncError);
        }
      }
    ]);
  };

  const executeRename = async () => {
    if (!renameNode || !renameValue.trim()) return;
    try {
      const updateData = { name: renameValue.trim(), updatedAt: Date.now() };
      await safeUpdate(
        renameNode.id!,
        'storage_nodes',
        updateData,
        () => updateDoc(doc(db, 'storage_nodes', renameNode.id!), updateData)
      );
      setRenameNode(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to rename item.');
    }
  };

  const executeMove = async (targetFolderId: string | null) => {
    if (!moveNode) return;
    try {
      const updateData = { parentId: targetFolderId, updatedAt: Date.now() };
      await safeUpdate(
        moveNode.id!,
        'storage_nodes',
        updateData,
        () => updateDoc(doc(db, 'storage_nodes', moveNode.id!), updateData)
      );
      setMoveNode(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to move item.');
    }
  };

  const getIcon = (type: string, ftype?: string) => {
    let bgColor = isDark ? 'rgba(142, 142, 147, 0.15)' : 'rgba(142, 142, 147, 0.10)';
    let color = isDark ? '#8E8E93' : '#636366';
    let iconName: any = 'document';

    if (type === 'folder') {
      bgColor = isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)';
      color = isDark ? '#0A84FF' : '#0284C7';
      iconName = 'folder';
    } else if (type === 'note') {
      bgColor = isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)';
      color = isDark ? '#a599ff' : '#6C5CE7';
      iconName = 'document-text';
    } else if (ftype === 'pdf') {
      bgColor = isDark ? 'rgba(255, 105, 97, 0.15)' : 'rgba(220, 38, 38, 0.10)';
      color = isDark ? '#ff6961' : '#DC2626';
      iconName = 'document';
    } else if (ftype === 'image') {
      bgColor = isDark ? 'rgba(94, 218, 158, 0.15)' : 'rgba(5, 150, 105, 0.10)';
      color = isDark ? '#5EDA9E' : '#059669';
      iconName = 'image';
    } else if (ftype === 'docx') {
      bgColor = isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)';
      color = isDark ? '#0A84FF' : '#0284C7';
      iconName = 'document';
    }

    return (
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={iconName} size={24} color={color} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.vaultHeader}>
        {currentFolderId ? (
          <TouchableOpacity style={styles.vaultHeaderBtn} onPress={() => setCurrentFolderId(null)}>
            <Ionicons name="chevron-back" size={24} color={colors.accentPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
        <Text style={styles.vaultHeaderTitle}>{currentFolderId ? breadcrumbs[breadcrumbs.length - 1]?.name || 'Vault' : 'Vault'}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Storage Usage Bar */}
      {!currentFolderId && (
        <View style={styles.storageCard}>
          <View style={styles.storageCardHeader}>
            <Text style={styles.storageCardText}>{storageStats.usedText} used</Text>
            <Text style={styles.storageCardSubtext}>of {storageStats.maxText}</Text>
          </View>
          <View style={styles.storageTrack}>
            <View style={[styles.storageFill, { width: storageStats.percentage as any }]} />
          </View>
        </View>
      )}

      {/* Toolbar / Actions */}
      <View style={{ paddingHorizontal: SPACE.md, paddingBottom: SPACE.md, borderBottomWidth: 1, borderColor: colors.border }}>
        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1c1c1e' : '#FFFFFF', borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, marginBottom: SPACE.md, borderWidth: 1, borderColor: colors.border }}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={{ flex: 1, padding: SPACE.sm, color: colors.textPrimary, fontFamily: FONT_FAMILY.body }}
            placeholder="Search files"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Category Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
          {['All', 'Documents', 'Images', 'Notes'].map((f) => {
            const isActive = filterMode === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setFilterMode(f as any)}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main List */}
      <FlashList
        data={uploading ? [{ id: 'uploading-temp', name: uploadFileName || 'Uploading...', type: 'file', uploading: true } as any, ...currentItems] : currentItems}
        keyExtractor={item => item.id!}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title="Empty folder"
            subtitle="Add notes, upload files, or create folders here."
          />
        }
        renderItem={({ item }: any) => {
          const isSelected = selectedIds.has(item.id!);
          return (
            <TouchableOpacity
              style={[styles.listItem, isSelected && { borderColor: '#0A84FF', backgroundColor: 'rgba(10,132,255,0.1)' }]}
              onPress={() => {
                if (item.uploading) return;
                if (selectionMode) {
                  const newSet = new Set(selectedIds);
                  if (newSet.has(item.id!)) newSet.delete(item.id!);
                  else newSet.add(item.id!);
                  setSelectedIds(newSet);
                } else {
                  if (item.type === 'folder') setCurrentFolderId(item.id!);
                  else if (item.type === 'note') setEditorNote(item);
                  else if (item.type === 'file') setViewerNode(item);
                }
              }}
              onLongPress={() => {
                if (!selectionMode && !item.uploading) {
                  setSelectionMode(true);
                  setSelectedIds(new Set([item.id!]));
                }
              }}
            >
              {item.uploading ? (
                <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <UploadProgressRing progress={uploadProgress} />
                </View>
              ) : getIcon(item.type, item.fileType)}
              <View style={{ flex: 1, paddingRight: SPACE.md, marginLeft: SPACE.md }}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.pinned && <Ionicons name="pin" size={12} color={colors.textPrimary} />}{' '}
                  {item.name}
                </Text>
                {item.type === 'file' && (
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                    {item.uploading ? `${uploadSize}, uploading, ${uploadProgress}%` : (item.size ? (item.size / (1024*1024)).toFixed(1) + ' MB' : 'Unknown size')}
                  </Text>
                )}
                {item.type === 'note' && (
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                    Note, {timeAgo(item.updatedAt || item.createdAt)}
                  </Text>
                )}
              </View>
              {selectionMode ? (
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isSelected ? '#0A84FF' : colors.border, backgroundColor: isSelected ? '#0A84FF' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              ) : (
                !item.uploading && (
                  <TouchableOpacity onPress={() => setMenuItem(item)} style={{ padding: SPACE.sm }}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                )
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Action Sheet (FAB Overlay) */}
      {showFabMenu && (
        <Modal transparent animationType="slide" visible={showFabMenu} onRequestClose={() => setShowFabMenu(false)}>
          <View style={styles.actionSheetOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setShowFabMenu(false)} />
            <View style={styles.actionSheet}>
              <View style={styles.actionSheetHandle} />

              <TouchableOpacity style={styles.actionSheetItem} onPress={handleFileUpload}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' }]}><Ionicons name="cloud-upload" size={20} color={colors.accentPrimary} /></View>
                <Text style={styles.actionSheetText}>Upload file</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setShowFabMenu(false); /* trigger camera */ }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' }]}><Ionicons name="scan" size={20} color={colors.accentPrimary} /></View>
                <Text style={styles.actionSheetText}>Scan document</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setShowFabMenu(false); setEditorNote('new'); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' }]}><Ionicons name="document-text" size={20} color={colors.accentPrimary} /></View>
                <Text style={styles.actionSheetText}>New note</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setShowFabMenu(false); setShowNewFolder(true); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)' }]}><Ionicons name="folder-outline" size={20} color={isDark ? '#0A84FF' : '#0284C7'} /></View>
                <Text style={styles.actionSheetText}>New folder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowFabMenu(true)}>
        <Ionicons name="add" size={24} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>

      {/* New Folder Modal */}
      {showNewFolder && (
        <Modal visible={showNewFolder} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>New Folder</Text>
              <TextInput
                style={styles.input}
                placeholder="Folder Name"
                placeholderTextColor={colors.textMuted}
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm }}>
                <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setShowNewFolder(false)}>
                  <Text style={styles.btnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleCreateFolder}>
                  <Text style={styles.btnTextPrimary}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Item Action Menu */}
      {!!menuItem && (
        <Modal visible={!!menuItem} transparent animationType="slide">
          <View style={styles.actionSheetOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setMenuItem(null)} />
            <View style={styles.actionSheet}>
              <View style={styles.actionSheetHandle} />

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { handlePin(menuItem!.id!, !!menuItem!.pinned); setMenuItem(null); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' }]}><Ionicons name={menuItem?.pinned ? "pin-outline" : "pin"} size={20} color={colors.accentPrimary} /></View>
                <Text style={styles.actionSheetText}>{menuItem?.pinned ? "Unpin" : "Pin"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setRenameValue(menuItem!.name); setRenameNode(menuItem); setMenuItem(null); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' }]}><Ionicons name="pencil" size={20} color={colors.accentPrimary} /></View>
                <Text style={styles.actionSheetText}>Rename</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setMoveNode(menuItem); setMenuItem(null); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)' }]}><Ionicons name="move" size={20} color={isDark ? '#0A84FF' : '#0284C7'} /></View>
                <Text style={styles.actionSheetText}>Move To...</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { handleDelete(menuItem!.id!, menuItem!.name); setMenuItem(null); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.10)' }]}><Ionicons name="trash" size={20} color={isDark ? '#ef4444' : '#DC2626'} /></View>
                <Text style={[styles.actionSheetText, { color: isDark ? '#ef4444' : '#DC2626' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Rename Modal */}
      {!!renameNode && (
        <Modal visible={!!renameNode} transparent animationType="fade">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>Rename Item</Text>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor={colors.textMuted}
                value={renameValue}
                onChangeText={setRenameValue}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm }}>
                <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setRenameNode(null)}>
                  <Text style={styles.btnTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={executeRename}>
                  <Text style={styles.btnTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Move To Modal */}
      {!!moveNode && (
        <Modal visible={!!moveNode} transparent animationType="fade">
          <View style={styles.modalBg}>
            <View style={[styles.modalSheet, { maxHeight: '80%' }]}>
              <Text style={styles.modalTitle}>Move "{moveNode?.name}"</Text>
              <ScrollView style={{ maxHeight: 300, marginVertical: SPACE.md }}>
                <TouchableOpacity style={styles.moveRow} onPress={() => executeMove(null)}>
                  <Ionicons name="home" size={20} color={colors.textPrimary} />
                  <Text style={styles.moveRowText}>Home (Root)</Text>
                </TouchableOpacity>
                {storageNodes.filter(n => n.type === 'folder' && n.id !== moveNode?.id).map(f => (
                  <TouchableOpacity key={f.id} style={styles.moveRow} onPress={() => executeMove(f.id!)}>
                    <Ionicons name="folder" size={20} color={isDark ? '#0A84FF' : '#0284C7'} />
                    <Text style={styles.moveRowText}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setMoveNode(null)}>
                <Text style={styles.btnTextCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Editor & Viewer Modals */}
      {editorNote && user && (
        <NoteEditorModal
          note={editorNote === 'new' ? null : editorNote}
          userId={user.uid}
          parentId={currentFolderId}
          onClose={() => setEditorNote(null)}
        />
      )}
      {viewerNode && (
        <VaultDocumentViewer node={viewerNode} onClose={() => setViewerNode(null)} />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  vaultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.md, backgroundColor: colors.background },
  vaultHeaderBtn: { padding: SPACE.sm },
  vaultHeaderTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },

  storageCard: { backgroundColor: colors.surface, marginHorizontal: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.lg, marginBottom: SPACE.md, borderWidth: 1, borderColor: colors.border },
  storageCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  storageCardText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  storageCardSubtext: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textSecondary },
  storageTrack: { height: 4, backgroundColor: isDark ? colors.border : '#E2E1EA', borderRadius: 2, overflow: 'hidden' },
  storageFill: { height: '100%', backgroundColor: colors.accentPrimary, borderRadius: 2 },

  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: isDark ? (colors.surface2 || '#1C1C1E') : '#FFFFFF', borderWidth: 1, borderColor: colors.border },
  filterPillActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  filterPillText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textSecondary },
  filterPillTextActive: { color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold },

  list: { padding: SPACE.sm, paddingBottom: 100 },
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: SPACE.xs, marginHorizontal: SPACE.xs, backgroundColor: colors.surface,
    borderRadius: RADIUS.lg, padding: SPACE.md,
    borderWidth: 1, borderColor: colors.border,
    ...SHADOW.sm,
  },
  itemTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary, marginLeft: SPACE.md, flex: 1 },

  emptyState: { alignItems: 'center', marginTop: 100, gap: SPACE.md },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textMuted },

  actionSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: colors.surface, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, paddingBottom: SPACE.xl, paddingHorizontal: SPACE.md, borderWidth: 1, borderColor: colors.border },
  actionSheetHandle: { width: 40, height: 4, backgroundColor: isDark ? colors.border : '#D1D1D6', borderRadius: 2, alignSelf: 'center', marginVertical: SPACE.md },
  actionSheetItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md, gap: SPACE.md },
  actionSheetIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionSheetText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },

  fab: {
    position: 'absolute', bottom: 84, right: 16,
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentPrimary,
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
    ...SHADOW.md
  },

  modalBg: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: SPACE.xl },
  modalSheet: { backgroundColor: colors.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: colors.textPrimary },
  input: { backgroundColor: isDark ? '#000000' : '#F5F4FA', borderRadius: RADIUS.md, padding: SPACE.md, fontFamily: FONT_FAMILY.body, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  btn: { flex: 1, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  btnCancel: { backgroundColor: isDark ? '#08080A' : '#ECEBF2' },
  btnPrimary: { backgroundColor: colors.accentPrimary },
  btnTextCancel: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary },
  btnTextPrimary: { fontFamily: FONT_FAMILY.bold, color: isDark ? '#000000' : '#FFFFFF' },

  menuRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.md, gap: SPACE.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuRowText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
  moveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md, gap: SPACE.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  moveRowText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: colors.textPrimary },

  // Editor
  editorRoot: { flex: 1, backgroundColor: colors.background },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  editorBtn: { padding: SPACE.sm },
  editorTabs: { flexDirection: 'row', backgroundColor: isDark ? '#08080A' : '#EAE9F2', borderRadius: RADIUS.md, padding: 4 },
  tabBtn: { paddingHorizontal: SPACE.lg, paddingVertical: 6, borderRadius: RADIUS.sm },
  tabBtnActive: { backgroundColor: isDark ? '#1A1A1E' : '#FFFFFF' },
  tabText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },
  editorToolbar: { flexDirection: 'row', padding: SPACE.md, borderBottomWidth: 1, borderColor: colors.border, alignItems: 'center', gap: SPACE.md, backgroundColor: colors.surface },
  editorTitleInput: { flex: 1, fontFamily: FONT_FAMILY.title, fontSize: 24, color: colors.textPrimary },
  aiToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)', backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)' },
  aiToggleBtnActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  aiToggleText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.accentPrimary },
  editorTextArea: { flex: 1, padding: SPACE.xl, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: colors.textPrimary, backgroundColor: isDark ? '#000000' : '#FFFFFF' },
  markdownPreview: { flex: 1, padding: SPACE.xl, backgroundColor: isDark ? '#000000' : '#FFFFFF' },

  // AI Panel
  aiPanel: { width: 300, borderLeftWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderTopLeftRadius: RADIUS.lg },
  aiPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  aiPanelTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
  aiChatArea: { flex: 1 },
  aiMsgSystem: { backgroundColor: isDark ? '#08080A' : '#F8F7FC', padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, borderWidth: 1, borderColor: colors.border },
  aiMsgTextSystem: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary },
  aiQuickBtn: { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)' },
  aiQuickBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentPrimary },
  aiInputArea: { flexDirection: 'row', padding: SPACE.md, borderTopWidth: 1, borderColor: colors.border, gap: SPACE.sm, backgroundColor: colors.surface },
  aiInput: { flex: 1, backgroundColor: isDark ? '#000000' : '#F5F4FA', borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: 8, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, borderWidth: 1, borderColor: colors.border },
  aiSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },

  // Viewer
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.md, backgroundColor: isDark ? '#000000' : colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailBack: { padding: SPACE.sm },
  detailHeaderTitle: { flex: 1, textAlign: 'center', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
  webviewLoader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }
});


const makeMarkdownStyles = (colors: any, isDark: boolean = true) => ({
  // Core text
  body:             { color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: 16, lineHeight: 26, backgroundColor: 'transparent' },
  paragraph:        { color: colors.textPrimary, marginBottom: 12, backgroundColor: 'transparent' },

  // Headings
  heading1:         { color: colors.textPrimary, fontFamily: FONT_FAMILY.title, fontSize: 24, marginTop: 24, marginBottom: 10, backgroundColor: 'transparent' },
  heading2:         { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 20, marginTop: 18, marginBottom: 8, backgroundColor: 'transparent' },
  heading3:         { color: isDark ? '#E5E5EA' : '#3A3A3C', fontFamily: FONT_FAMILY.bold, fontSize: 17, marginTop: 14, marginBottom: 6, backgroundColor: 'transparent' },

  // Code
  code_inline:      { backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : '#F0EFF7', fontFamily: 'monospace', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: isDark ? '#FF9F4D' : '#D97706', fontSize: 14 },
  code_block:       { backgroundColor: isDark ? '#08080A' : '#F8F7FC', fontFamily: 'monospace', padding: 16, borderRadius: 10, color: colors.textPrimary, fontSize: 13, lineHeight: 20, marginVertical: 10, borderWidth: 1, borderColor: colors.border },
  fence:            { backgroundColor: isDark ? '#08080A' : '#F8F7FC', fontFamily: 'monospace', padding: 16, borderRadius: 10, color: colors.textPrimary, fontSize: 13, lineHeight: 20, marginVertical: 10, borderWidth: 1, borderColor: colors.border },
  pre:              { backgroundColor: isDark ? '#08080A' : '#F8F7FC', borderRadius: 10, marginVertical: 10, padding: 0, borderLeftWidth: 4, borderLeftColor: colors.accentPrimary },

  // Blockquote
  blockquote:       { backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.08)', borderLeftWidth: 4, borderLeftColor: colors.accentPrimary, paddingLeft: 14, paddingVertical: 8, marginVertical: 10, borderRadius: 4 },
  blockquote_text:  { color: colors.textSecondary, fontStyle: 'italic' as const, fontFamily: FONT_FAMILY.body },

  // Lists
  bullet_list:      { marginVertical: 6, backgroundColor: 'transparent' },
  ordered_list:     { marginVertical: 6, backgroundColor: 'transparent' },
  list_item:        { color: colors.textPrimary, marginBottom: 6, backgroundColor: 'transparent' },
  bullet_list_icon: { color: colors.accentPrimary, fontSize: 14, marginTop: 6 },
  ordered_list_icon:{ color: colors.accentPrimary, fontSize: 14, marginTop: 6 },

  // Links
  link:             { color: colors.accentPrimary, textDecorationLine: 'underline' as const },

  // Tables (if any)
  table:            { backgroundColor: colors.surface, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: colors.border },
  th:               { backgroundColor: isDark ? '#08080A' : '#ECEBF2', padding: 8, color: colors.textPrimary, fontFamily: FONT_FAMILY.bold },
  td:               { backgroundColor: 'transparent', padding: 8, color: colors.textSecondary, borderBottomColor: colors.border, borderBottomWidth: 1 },

  // Strong / Em
  strong:           { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold },
  em:               { color: colors.textSecondary, fontStyle: 'italic' as const },

  // Image
  image:            { borderRadius: 8, marginVertical: 10 },

  // Horizontal rule
  hr:               { backgroundColor: colors.border, height: 1, marginVertical: 14 },
});

