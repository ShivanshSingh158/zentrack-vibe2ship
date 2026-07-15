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
import { useMobileData, StorageNode } from '../contexts/MobileDataContext';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { uploadFileToCloudinary } from '../services/cloudinary';
import * as DocumentPicker from 'expo-document-picker';
import Markdown from 'react-native-markdown-display';
import { WebView } from 'react-native-webview';
import { callGeminiProxy } from '../services/geminiProxy';
import Svg, { Circle } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
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
                    <ActivityIndicator size="large" color={COLORS.accentPrimary} />
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
        }).catch(console.error);
      } else {
        const parsedTags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t);

        updateDoc(doc(db, 'storage_nodes', note.id!), {

          name: title.trim(),
          tags: parsedTags,
          content: content.trim(),
          updatedAt: Date.now(),
        }).catch(console.error);
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
      const ctx = `You are Sara, ZenTrack's intelligent assistant, operating inside the user's note-taking vault. 
      The current note content is:\n\n---\n${content}\n---\n\n
      The user is asking you for help regarding this note. Be concise, helpful, and format nicely in Markdown.`;

      const text = await callGeminiProxy([{ parts: [{ text: `${ctx}\n\nUser: ${userPrompt}` }] }]);
      setChatHistory(prev => [...prev, { role: 'model', text }]);
    } catch (err) {
      console.error(err);
      setChatHistory(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please try again.' }]);
    }
    setAiLoading(false);
  };

  const handleExportPdf = async () => {
    try {
      // Basic markdown to HTML converter for PDF
      const htmlContent = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1c1c1e; font-size: 16px; line-height: 1.6; }
              h1, h2, h3 { color: #000; margin-top: 24px; margin-bottom: 16px; }
              code { background-color: #f2f2f7; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
              pre { background-color: #f2f2f7; padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 16px; }
              blockquote { border-left: 4px solid #a599ff; padding-left: 16px; color: #636366; margin: 16px 0; font-style: italic; }
              p { margin-bottom: 16px; }
              ul { margin-bottom: 16px; }
              li { margin-bottom: 8px; }
              .title { font-size: 28px; font-weight: bold; border-bottom: 1px solid #e5e5ea; padding-bottom: 16px; margin-bottom: 24px; }
            </style>
          </head>
          <body>
            <div class="title">${title || 'Untitled Note'}</div>
            <div>
              ${content
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // Escape HTML
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
          .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
          .replace(/### (.*?)\n/g, '<h3>$1</h3>\n') // H3
          .replace(/## (.*?)\n/g, '<h2>$1</h2>\n') // H2
          .replace(/# (.*?)\n/g, '<h1>$1</h1>\n') // H1
          .replace(/- (.*?)\n/g, '<li>$1</li>\n') // List items
          .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>') // Code blocks
          .replace(/\n\n/g, '<br><br>')} 
            </div>
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
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
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
            placeholderTextColor={COLORS.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={handleExportPdf} style={styles.aiToggleBtn}>
              <Ionicons name="download-outline" size={16} color="#C490FF" />
              <Text style={styles.aiToggleText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAi(!showAi)} style={[styles.aiToggleBtn, showAi && styles.aiToggleBtnActive]}>
              <Ionicons name="planet" size={16} color={showAi ? "#fff" : "#C490FF"} />
              <Text style={[styles.aiToggleText, showAi && { color: '#fff' }]}>AI</Text>
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1, flexDirection: 'row' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Main Area */}
          <View style={{ flex: 1 }}>
            {viewMode === 'edit' ? (
              <>
                <View style={{ flexDirection: 'row', backgroundColor: COLORS.surface, paddingHorizontal: SPACE.md, paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.border, gap: 16 }}>
                  <TouchableOpacity onPress={() => insertMarkdown('**', '**')}><Text style={{ color: COLORS.textPrimary, fontWeight: 'bold', fontSize: 16 }}>B</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('*', '*')}><Text style={{ color: COLORS.textPrimary, fontStyle: 'italic', fontSize: 16 }}>I</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('### ')}><Ionicons name="text-outline" size={18} color={COLORS.textPrimary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('- ')}><Ionicons name="list" size={18} color={COLORS.textPrimary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => insertMarkdown('```\n', '\n```')}><Ionicons name="code-slash" size={18} color={COLORS.textPrimary} /></TouchableOpacity>
                </View>
                <TextInput
                  style={styles.editorTextArea}
                  placeholder="Start writing (Markdown supported)..."
                  placeholderTextColor={COLORS.textMuted}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                  onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
                />
              </>
            ) : (
              <ScrollView style={styles.markdownPreview}>
                <Markdown style={markdownStyles}>{content || '*Nothing to preview.*'}</Markdown>
              </ScrollView>
            )}
          </View>

          {/* AI Panel */}
          {showAi && (
            <View style={styles.aiPanel}>
              <View style={styles.aiPanelHeader}>
                <Ionicons name="planet" size={16} color="#C490FF" />
                <Text style={styles.aiPanelTitle}>Sara</Text>
              </View>
              <ScrollView style={styles.aiChatArea} contentContainerStyle={{ padding: SPACE.sm }}>
                <View style={styles.aiMsgSystem}>
                  <Text style={styles.aiMsgTextSystem}>I can help you write, summarize, or extract action items from this note. What do you need?</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    <TouchableOpacity style={styles.aiQuickBtn} onPress={() => handleAiSubmit('Summarize this note')}>
                      <Text style={styles.aiQuickBtnText}>Summarize</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aiQuickBtn} onPress={() => handleAiSubmit('Extract action items')}>
                      <Text style={styles.aiQuickBtnText}>Extract Actions</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aiQuickBtn} onPress={() => handleAiSubmit('Rewrite to sound more professional')}>
                      <Text style={styles.aiQuickBtnText}>Make Professional</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {chatHistory.map((msg, idx) => (
                  <View key={idx} style={[{ padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '90%' }, msg.role === 'user' ? { alignSelf: 'flex-end', backgroundColor: '#333' } : { alignSelf: 'flex-start', backgroundColor: 'rgba(196,144,255,0.1)' }]}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: 13, lineHeight: 18 }}>{msg.text}</Text>
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
                  placeholderTextColor={COLORS.textMuted}
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
  const { storageNodes, user } = useMobileData();
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
      if (n.tags) n.tags.forEach(t => tags.add(t));
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
    let items = storageNodes.filter(n => n.parentId === currentFolderId);

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

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string | null; name: string }[] = [];
    let curr = currentFolderId;
    while (curr) {
      const node = storageNodes.find(n => n.id === curr);
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
        onPress: () => deleteDoc(doc(db, 'storage_nodes', id)).catch(console.error)
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
      <View style={{ paddingHorizontal: SPACE.md, paddingBottom: SPACE.md, borderBottomWidth: 1, borderColor: COLORS.border }}>
        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c1c1e', borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, marginBottom: SPACE.md }}>
          <Ionicons name="search" size={16} color="#636366" />
          <TextInput
            style={{ flex: 1, padding: SPACE.sm, color: COLORS.textPrimary, fontFamily: FONT_FAMILY.body }}
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
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>This folder is empty.</Text>
          </View>
        }
        renderItem={({ item }) => {
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
                  {item.pinned && <Ionicons name="pin" size={12} color={COLORS.textPrimary} />}{' '}
                  {item.name}
                </Text>
                {item.type === 'file' && (
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                    {item.uploading ? `${uploadSize}, uploading, ${uploadProgress}%` : (item.size ? (item.size / (1024*1024)).toFixed(1) + ' MB' : 'Unknown size')}
                  </Text>
                )}
                {item.type === 'note' && (
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>Note, 3 days ago</Text>
                )}
              </View>
              {selectionMode ? (
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isSelected ? '#0A84FF' : COLORS.border, backgroundColor: isSelected ? '#0A84FF' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              ) : (
                !item.uploading && (
                  <TouchableOpacity onPress={() => setMenuItem(item)} style={{ padding: SPACE.sm }}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
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
              placeholderTextColor={COLORS.textMuted}
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
              placeholderTextColor={COLORS.textMuted}
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
                <Ionicons name="home" size={20} color={COLORS.textPrimary} />
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
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
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
    marginVertical: SPACE.xs, marginHorizontal: SPACE.xs, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, padding: SPACE.md,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  itemTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: COLORS.textPrimary, marginLeft: SPACE.md, flex: 1 },

  emptyState: { alignItems: 'center', marginTop: 100, gap: SPACE.md },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.textMuted },

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
  modalSheet: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACE.xl, gap: SPACE.md },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: COLORS.textPrimary },
  input: { backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, padding: SPACE.md, fontFamily: FONT_FAMILY.body, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
  btn: { flex: 1, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  btnCancel: { backgroundColor: COLORS.surface2 },
  btnPrimary: { backgroundColor: '#0A84FF' },
  btnTextCancel: { fontFamily: FONT_FAMILY.bold, color: COLORS.textPrimary },
  btnTextPrimary: { fontFamily: FONT_FAMILY.bold, color: '#fff' },

  menuRow: { flexDirection: 'row', alignItems: 'center', padding: SPACE.md, gap: SPACE.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuRowText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: COLORS.textPrimary },
  moveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md, gap: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  moveRowText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: COLORS.textPrimary },

  // Editor
  editorRoot: { flex: 1, backgroundColor: COLORS.background },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderColor: COLORS.border },
  editorBtn: { padding: SPACE.sm },
  editorTabs: { flexDirection: 'row', backgroundColor: COLORS.surface2, borderRadius: RADIUS.md, padding: 4 },
  tabBtn: { paddingHorizontal: SPACE.lg, paddingVertical: 6, borderRadius: RADIUS.sm },
  tabBtnActive: { backgroundColor: COLORS.surface },
  tabText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.textPrimary },
  editorToolbar: { flexDirection: 'row', padding: SPACE.md, borderBottomWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: SPACE.md },
  editorTitleInput: { flex: 1, fontFamily: FONT_FAMILY.title, fontSize: 24, color: COLORS.textPrimary },
  aiToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#C490FF' },
  aiToggleBtnActive: { backgroundColor: '#C490FF' },
  aiToggleText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: '#C490FF' },
  editorTextArea: { flex: 1, padding: SPACE.xl, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.base, color: COLORS.textPrimary },
  markdownPreview: { flex: 1, padding: SPACE.xl },

  // AI Panel
  aiPanel: { width: 300, borderLeftWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.lg },
  aiPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md, borderBottomWidth: 1, borderColor: COLORS.border },
  aiPanelTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: COLORS.textPrimary },
  aiChatArea: { flex: 1 },
  aiMsgSystem: { backgroundColor: COLORS.surface2, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm },
  aiMsgTextSystem: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  aiQuickBtn: { backgroundColor: 'rgba(196,144,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: 'rgba(196,144,255,0.3)' },
  aiQuickBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: '#C490FF' },
  aiInputArea: { flexDirection: 'row', padding: SPACE.md, borderTopWidth: 1, borderColor: COLORS.border, gap: SPACE.sm },
  aiInput: { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.full, paddingHorizontal: SPACE.md, paddingVertical: 8, color: COLORS.textPrimary, fontFamily: FONT_FAMILY.body },
  aiSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C490FF', alignItems: 'center', justifyContent: 'center' },

  // Viewer
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACE.md, backgroundColor: '#000' },
  detailBack: { padding: SPACE.sm },
  detailHeaderTitle: { flex: 1, textAlign: 'center', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: '#fff' },
  webviewLoader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }
});

const markdownStyles = {
  body: { color: COLORS.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: 16, lineHeight: 24 },
  heading1: { color: COLORS.textPrimary, fontFamily: FONT_FAMILY.title, marginTop: 16, marginBottom: 8 },
  heading2: { color: COLORS.textPrimary, fontFamily: FONT_FAMILY.bold, marginTop: 12, marginBottom: 8 },
  link: { color: '#C490FF' },
  code_inline: { backgroundColor: COLORS.surface2, fontFamily: 'monospace', padding: 4, borderRadius: 4, color: '#FF9F0A' },
  code_block: { backgroundColor: COLORS.surface2, fontFamily: 'monospace', padding: 12, borderRadius: 8, color: COLORS.textPrimary },
};
