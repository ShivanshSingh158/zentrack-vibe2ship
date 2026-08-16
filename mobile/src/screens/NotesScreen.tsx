/**
 * NotesScreen — ZenTrack Mobile
 * Full Cloud File Manager: Folders, Notes (with Markdown & AI panel UI), and Files (PDF/DOCX viewers via WebView).
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  TextInput, Modal, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, Alert, ActivityIndicator, Image
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

const UploadProgressRing = ({ progress }: { progress: number }) => {
  const radius = 12;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Svg height="32" width="32" viewBox="0 0 32 32">
        <Circle stroke="#2c2c2e" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx="16" cy="16" />
        <Circle
          stroke="#a599ff"
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

// ─── Document Viewer Modal ──────────────────────────────────────────────────
function DocumentViewer({ node, onClose }: { node: StorageNode | null, onClose: () => void }) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  if (!node) return null;
  const isImage = node.fileType === 'image';
  const url = node.url || '';

  // Google Docs viewer works best for docx/pdf
  const viewerUrl = (node.fileType === 'pdf' || node.fileType === 'docx')
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
    : url;

  return (
    <Modal visible={!!node} animationType="slide" transparent>
      <View style={styles.viewerOverlay}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={onClose} style={styles.detailBack}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>{node.name}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {isImage ? (
              <Image source={{ uri: url }} style={{ flex: 1, resizeMode: 'contain' }} />
            ) : (
              <WebView
                source={{ uri: viewerUrl }}
                style={{ flex: 1 }}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.webviewLoader}>
                    <ActivityIndicator size="large" color={colors.accentPrimary} />
                  </View>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── Note Editor + AI Panel ────────────────────────────────────────────────
function NoteEditorModal({ note, userId, parentId, onClose }: {
  note: StorageNode | null; // null if creating new
  userId: string;
  parentId: string | null;
  onClose: () => void;
}) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [title, setTitle] = useState(note?.name || '');
  const [content, setContent] = useState(note?.content || '');
  const [tagsInput, setTagsInput] = useState(note?.tags ? note.tags.join(', ') : '');
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
      setTagsInput(note.tags ? note.tags.join(', ') : '');
    } else {
      setTitle('');
      setContent('');
      setTagsInput('');
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
    
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    setTimeout(() => {
      if (isNew) {
        const parsedTags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t);

        addDoc(collection(db, 'storage_nodes'), {

          userId,
          tags: parsedTags,
          type: 'note',
          name: title.trim(),
          content: content.trim(),
          parentId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }).catch(handleSyncError);
      } else {
        const parsedTags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t);

        updateDoc(doc(db, 'storage_nodes', note.id!), {

          name: title.trim(),
          tags: parsedTags,
          content: content.trim(),
          updatedAt: Date.now(),
        }).catch(handleSyncError);
      }
    }, 150);
    
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
            {saving ? <ActivityIndicator size="small" color="#C490FF" /> : <Ionicons name="checkmark" size={24} color="#C490FF" />}
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
              <Ionicons name="download-outline" size={16} color="#C490FF" />
              <Text style={styles.aiToggleText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAi(!showAi)} style={[styles.aiToggleBtn, showAi && styles.aiToggleBtnActive]}>
              <Image source={require('../../assets/images/sara-running.png')} style={{ width: 16, height: 16 }} resizeMode="contain" />
              <Text style={[styles.aiToggleText, showAi && { color: '#fff' }]}>AI</Text>
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1, flexDirection: 'row' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Main Area */}
          <View style={{ flex: 1 }}>
            {viewMode === 'edit' ? (
              <>
                <View style={{ flexDirection: 'row', backgroundColor: colors.surface, paddingHorizontal: SPACE.md, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border, gap: 16 }}>
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
                <Markdown style={makeMarkdownStyles(colors)}>{content || '*Nothing to preview.*'}</Markdown>
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
                  <View key={idx} style={[{ padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '90%' }, msg.role === 'user' ? { alignSelf: 'flex-end', backgroundColor: '#333' } : { alignSelf: 'flex-start', backgroundColor: 'rgba(196,144,255,0.1)' }]}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 18 }}>{msg.text}</Text>
                    {msg.role === 'model' && (
                      <TouchableOpacity
                        style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8, backgroundColor: 'rgba(196,144,255,0.2)', borderRadius: 6 }}
                        onPress={() => setContent(prev => (prev ? prev + '\n\n' : '') + msg.text)}
                      >
                        <Ionicons name="arrow-down-circle-outline" size={14} color="#C490FF" />
                        <Text style={{ fontSize: 11, color: '#C490FF', fontWeight: 'bold' }}>Insert to Note</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {aiLoading && (
                  <View style={{ padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '90%', alignSelf: 'flex-start', backgroundColor: 'rgba(196,144,255,0.1)' }}>
                    <ActivityIndicator size="small" color="#C490FF" />
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
                  <Ionicons name="send" size={16} color="#fff" />
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
    const styles = makeStyles(colors);
  const { storageNodes } = useCreativeData();
  const { user } = useCoreData();
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
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'All' | 'Documents' | 'Images' | 'Notes'>('All');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Storage Stats
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    storageNodes.forEach(n => {
      if (n.tags && Array.isArray(n.tags)) {
        n.tags.forEach(t => {
          if (t && typeof t === 'string' && t.trim().length > 0 && t.length <= 20 && !t.includes('|')) {
            tags.add(t.trim());
          }
        });
      }
    });
    return Array.from(tags).sort();
  }, [storageNodes]);

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

    if (selectedTag) {
      items = items.filter(n => n.tags && n.tags.includes(selectedTag));
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
        copyToCacheDirectory: true
      });

      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];

      setUploading(true);
      setUploadProgress(0);
      setUploadSize((file.size ? (file.size / (1024 * 1024)).toFixed(1) : '1.0') + ' MB');
      setUploadFileName(file.name);
      const mime = file.mimeType || 'application/octet-stream';
      let ftype: 'pdf' | 'docx' | 'image' | 'other' = 'other';
      if (mime.includes('pdf')) ftype = 'pdf';
      else if (mime.includes('image')) ftype = 'image';
      else if (mime.includes('word')) ftype = 'docx';

      const uploadRes = await uploadFileToCloudinary(file.uri, mime, file.name, (p) => setUploadProgress(p));

      await addDoc(collection(db, 'storage_nodes'), {
        userId: user.uid,
        type: 'file',
        fileType: ftype,
        name: file.name,
        url: uploadRes.url,
        size: uploadRes.size,
        parentId: currentFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      } catch (e) {
      console.error(e);
      Alert.alert('Upload Failed', 'There was an error uploading the file.');
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
        onPress: () => deleteDoc(doc(db, 'storage_nodes', id)).catch(handleSyncError)
      }
    ]);
  };

  const executeRename = async () => {
    if (!renameNode || !renameValue.trim()) return;
    try {
      await updateDoc(doc(db, 'storage_nodes', renameNode.id!), { name: renameValue.trim(), updatedAt: Date.now() });
      setRenameNode(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to rename item.');
    }
  };

  const executeMove = async (targetFolderId: string | null) => {
    if (!moveNode) return;
    try {
      await updateDoc(doc(db, 'storage_nodes', moveNode.id!), { parentId: targetFolderId, updatedAt: Date.now() });
      setMoveNode(null);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to move item.');
    }
  };

  const getIcon = (type: string, ftype?: string) => {
    let bgColor = 'rgba(142, 142, 147, 0.15)';
    let color = '#8E8E93';
    let iconName: any = 'document';

    if (type === 'folder') {
      bgColor = 'rgba(10, 132, 255, 0.15)';
      color = '#0A84FF';
      iconName = 'folder';
    } else if (type === 'note') {
      bgColor = 'rgba(165, 153, 255, 0.15)'; // matching #a599ff
      color = '#a599ff';
      iconName = 'document-text';
    } else if (ftype === 'pdf') {
      bgColor = 'rgba(255, 105, 97, 0.15)';
      color = '#ff6961';
      iconName = 'document';
    } else if (ftype === 'image') {
      bgColor = 'rgba(142, 142, 147, 0.15)';
      color = '#8E8E93';
      iconName = 'image';
    } else if (ftype === 'docx') {
      bgColor = 'rgba(10, 132, 255, 0.15)';
      color = '#0A84FF';
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
        <TouchableOpacity style={styles.vaultHeaderBtn} onPress={() => { if (currentFolderId) setCurrentFolderId(null); }}>
          <Ionicons name="chevron-back" size={24} color="#a599ff" />
        </TouchableOpacity>
        <Text style={styles.vaultHeaderTitle}>{currentFolderId ? breadcrumbs[breadcrumbs.length - 1]?.name || 'Vault' : 'Vault'}</Text>
        <TouchableOpacity style={styles.vaultHeaderMenuBtn} onPress={() => { /* overflow menu */ }}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
        </TouchableOpacity>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1c1e', borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, marginBottom: SPACE.md }}>
          <Ionicons name="search" size={16} color="#636366" />
          <TextInput
            style={{ flex: 1, padding: SPACE.sm, color: colors.textPrimary, fontFamily: FONT_FAMILY.body }}
            placeholder="Search files"
            placeholderTextColor="#636366"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Tag Filter Pills */}
        {allTags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm, marginBottom: SPACE.md }}>
            {allTags.map((t) => {
              const isActive = selectedTag === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setSelectedTag(isActive ? null : t)}
                >
                  <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>#{t}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Filter Pills */}
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
                <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}><Ionicons name="cloud-upload" size={20} color="#a599ff" /></View>
                <Text style={styles.actionSheetText}>Upload file</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setShowFabMenu(false); /* trigger camera */ }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}><Ionicons name="scan" size={20} color="#a599ff" /></View>
                <Text style={styles.actionSheetText}>Scan document</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setShowFabMenu(false); setEditorNote('new'); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}><Ionicons name="document-text" size={20} color="#a599ff" /></View>
                <Text style={styles.actionSheetText}>New note</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setShowFabMenu(false); setShowNewFolder(true); }}>
                <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}><Ionicons name="folder-outline" size={20} color="#a599ff" /></View>
                <Text style={styles.actionSheetText}>New folder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowFabMenu(true)}>
        <Ionicons name="add" size={24} color="#000" />
      </TouchableOpacity>

      {/* New Folder Modal */}
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

      {/* Item Action Menu */}
      <Modal visible={!!menuItem} transparent animationType="slide">
        <View style={styles.actionSheetOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setMenuItem(null)} />
          <View style={styles.actionSheet}>
            <View style={styles.actionSheetHandle} />

            <TouchableOpacity style={styles.actionSheetItem} onPress={() => { handlePin(menuItem!.id!, !!menuItem!.pinned); setMenuItem(null); }}>
              <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}><Ionicons name={menuItem?.pinned ? "pin-outline" : "pin"} size={20} color="#a599ff" /></View>
              <Text style={styles.actionSheetText}>{menuItem?.pinned ? "Unpin" : "Pin"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setRenameValue(menuItem!.name); setRenameNode(menuItem); setMenuItem(null); }}>
              <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}><Ionicons name="pencil" size={20} color="#a599ff" /></View>
              <Text style={styles.actionSheetText}>Rename</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionSheetItem} onPress={() => { setMoveNode(menuItem); setMenuItem(null); }}>
              <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}><Ionicons name="move" size={20} color="#a599ff" /></View>
              <Text style={styles.actionSheetText}>Move To...</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionSheetItem} onPress={() => { handleDelete(menuItem!.id!, menuItem!.name); setMenuItem(null); }}>
              <View style={[styles.actionSheetIcon, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}><Ionicons name="trash" size={20} color="#ef4444" /></View>
              <Text style={[styles.actionSheetText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rename Modal */}
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

      {/* Move To Modal */}
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
                  <Ionicons name="folder" size={20} color="#0A84FF" />
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

      {/* Editor & Viewer Modals */}
      {editorNote && user && (
        <NoteEditorModal
          note={editorNote === 'new' ? null : editorNote}
          userId={user.uid}
          parentId={currentFolderId}
          onClose={() => setEditorNote(null)}
        />
      )}
      <DocumentViewer node={viewerNode} onClose={() => setViewerNode(null)} />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      vaultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm, paddingBottom: SPACE.md },
      vaultHeaderBtn: { padding: SPACE.sm },
      vaultHeaderTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#fff' },
      vaultHeaderMenuBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1c1c1e', alignItems: 'center', justifyContent: 'center' },

      storageCard: { backgroundColor: '#141416', marginHorizontal: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.lg, marginBottom: SPACE.md },
      storageCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
      storageCardText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#fff' },
      storageCardSubtext: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#636366' },
      storageTrack: { height: 4, backgroundColor: '#2c2c2e', borderRadius: 2, overflow: 'hidden' },
      storageFill: { height: '100%', backgroundColor: '#a599ff', borderRadius: 2 },

      filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: '#1c1c1e' },
      filterPillActive: { backgroundColor: '#a599ff' },
      filterPillText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#8e8e93' },
      filterPillTextActive: { color: '#000', fontFamily: FONT_FAMILY.bold },

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

      actionSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      actionSheet: { backgroundColor: '#141416', borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, paddingBottom: SPACE.xl, paddingHorizontal: SPACE.md },
      actionSheetHandle: { width: 40, height: 4, backgroundColor: '#2c2c2e', borderRadius: 2, alignSelf: 'center', marginVertical: SPACE.md },
      actionSheetItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md, gap: SPACE.md },
      actionSheetIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
      actionSheetText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#fff' },

      fab: {
        position: 'absolute', bottom: 100, right: SPACE.xl,
        width: 48, height: 48, borderRadius: 24, backgroundColor: '#a599ff',
        alignItems: 'center', justifyContent: 'center', zIndex: 20,
        ...SHADOW.md
      },

      modalBg: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: SPACE.xl },
      modalSheet: { backgroundColor: colors.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md },
      modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: colors.textPrimary },
      input: { backgroundColor: colors.surface2, borderRadius: RADIUS.md, padding: SPACE.md, fontFamily: FONT_FAMILY.body, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
      btn: { flex: 1, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
      btnCancel: { backgroundColor: colors.surface2 },
      btnPrimary: { backgroundColor: '#0A84FF' },
      btnTextCancel: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary },
      btnTextPrimary: { fontFamily: FONT_FAMILY.bold, color: '#fff' },

      menuRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.md, gap: SPACE.md, borderBottomWidth: 1, borderBottomColor: colors.border },
      menuRowText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
      moveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md, gap: SPACE.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
      moveRowText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: colors.textPrimary },

      // Editor
      editorRoot: { flex: 1, backgroundColor: colors.background },
      editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderColor: colors.border },
      editorBtn: { padding: SPACE.sm },
      editorTabs: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: RADIUS.md, padding: 4 },
      tabBtn: { paddingHorizontal: SPACE.lg, paddingVertical: 6, borderRadius: RADIUS.sm },
      tabBtnActive: { backgroundColor: colors.surface },
      tabText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      tabTextActive: { color: colors.textPrimary },
      editorToolbar: { flexDirection: 'row', padding: SPACE.md, borderBottomWidth: 1, borderColor: colors.border, alignItems: 'center', gap: SPACE.md },
      editorTitleInput: { flex: 1, fontFamily: FONT_FAMILY.title, fontSize: 24, color: colors.textPrimary },
      aiToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#C490FF' },
      aiToggleBtnActive: { backgroundColor: '#C490FF' },
      aiToggleText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: '#C490FF' },
      editorTextArea: { flex: 1, padding: SPACE.xl, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: colors.textPrimary },
      markdownPreview: { flex: 1, padding: SPACE.xl },

      // AI Panel
      aiPanel: { width: 300, borderLeftWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderTopLeftRadius: RADIUS.lg },
      aiPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderBottomWidth: 1, borderColor: colors.border },
      aiPanelTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary },
      aiChatArea: { flex: 1 },
      aiMsgSystem: { backgroundColor: colors.surface2, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm },
      aiMsgTextSystem: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      aiQuickBtn: { backgroundColor: 'rgba(196,144,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: 'rgba(196,144,255,0.3)' },
      aiQuickBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: '#C490FF' },
      aiInputArea: { flexDirection: 'row', padding: SPACE.md, borderTopWidth: 1, borderColor: colors.border, gap: SPACE.sm },
      aiInput: { flex: 1, backgroundColor: colors.background, borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: 8, color: colors.textPrimary, fontFamily: FONT_FAMILY.body },
      aiSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C490FF', alignItems: 'center', justifyContent: 'center' },

      // Viewer
      viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' },
      detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.md, backgroundColor: '#000' },
      detailBack: { padding: SPACE.sm },
      detailHeaderTitle: { flex: 1, textAlign: 'center', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: '#fff' },
      webviewLoader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }
    });


const makeMarkdownStyles = (colors: any) => ({
  // Core text — always dark on dark background
  body:             { color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: 16, lineHeight: 26, backgroundColor: 'transparent' },
  paragraph:        { color: colors.textPrimary, marginBottom: 12, backgroundColor: 'transparent' },

  // Headings
  heading1:         { color: colors.textPrimary, fontFamily: FONT_FAMILY.title, fontSize: 24, marginTop: 24, marginBottom: 10, backgroundColor: 'transparent' },
  heading2:         { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 20, marginTop: 18, marginBottom: 8, backgroundColor: 'transparent' },
  heading3:         { color: colors.textSecondary, fontFamily: FONT_FAMILY.bold, fontSize: 17, marginTop: 14, marginBottom: 6, backgroundColor: 'transparent' },

  // Code — CRITICAL: override the library's default white background
  code_inline:      { backgroundColor: 'rgba(165,153,255,0.15)', fontFamily: 'monospace', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: '#FF9F0A', fontSize: 14 },
  code_block:       { backgroundColor: '#1a1a2e', fontFamily: 'monospace', padding: 16, borderRadius: 10, color: '#e2e2e2', fontSize: 13, lineHeight: 20, marginVertical: 10 },
  fence:            { backgroundColor: '#1a1a2e', fontFamily: 'monospace', padding: 16, borderRadius: 10, color: '#e2e2e2', fontSize: 13, lineHeight: 20, marginVertical: 10 },
  // The library wraps fence/code_block in a <pre>-like container — override it too
  pre:              { backgroundColor: '#1a1a2e', borderRadius: 10, marginVertical: 10, padding: 0 },

  // Blockquote
  blockquote:       { backgroundColor: 'rgba(165,153,255,0.08)', borderLeftWidth: 3, borderLeftColor: colors.accentPrimary, paddingLeft: 14, paddingVertical: 8, marginVertical: 10, borderRadius: 4 },
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
  table:            { backgroundColor: colors.surface, borderRadius: 8, marginVertical: 10 },
  th:               { backgroundColor: colors.surface2, padding: 8, color: colors.textPrimary, fontFamily: FONT_FAMILY.bold },
  td:               { backgroundColor: 'transparent', padding: 8, color: colors.textSecondary, borderBottomColor: colors.border, borderBottomWidth: 1 },

  // Strong / Em
  strong:           { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold },
  em:               { color: colors.textSecondary, fontStyle: 'italic' as const },

  // Image
  image:            { borderRadius: 8, marginVertical: 10 },

  // Horizontal rule
  hr:               { backgroundColor: colors.border, height: 1, marginVertical: 14 },
});

