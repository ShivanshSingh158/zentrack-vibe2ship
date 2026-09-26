/**
 * ShareToVaultModal.tsx — ZenTrack Mobile
 *
 * System Share Target Modal: When a user shares a PDF, image, or document
 * from WhatsApp, Gallery, Files, Chrome, or any other app directly to ZenTrack,
 * this modal intercepts the share intent and allows them to:
 *   1. Preview file thumbnail, type, and size
 *   2. Rename the file before saving
 *   3. Select destination folder (Root Vault or any existing folder)
 *   4. Create a + New Folder inline on the fly
 *   5. Upload directly to Cloudinary & Vault with local-first offline caching
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useShareIntentContext } from 'expo-share-intent';

import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { useCreativeData } from '../../contexts/domains/CreativeContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import { cacheLocalFile } from '../../services/vaultCacheService';
import { safeAdd } from '../../utils/safeWrite';
import { feedback } from '../../utils/haptics';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import type { StorageNode } from '../../contexts/MobileDataContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ShareToVaultModal() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { colors, isDark } = useTheme();
  const { storageNodes, optimisticAddStorageNode } = useCreativeData();
  const { user } = useCoreData();

  const [visible, setVisible] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [customFileName, setCustomFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState('');

  // Extract shared files from intent
  const sharedFiles = useMemo(() => {
    if (!hasShareIntent || !shareIntent?.files?.length) return [];
    return shareIntent.files;
  }, [hasShareIntent, shareIntent]);

  // Active file being processed (primary or first file)
  const primaryFile = sharedFiles[0] || null;

  useEffect(() => {
    if (hasShareIntent && sharedFiles.length > 0) {
      const initialName = primaryFile?.fileName || `Shared_Doc_${Date.now()}`;
      setCustomFileName(initialName);
      setSelectedFolderId(null);
      setFolderPickerOpen(false);
      setIsCreatingFolder(false);
      setUploading(false);
      setUploadProgress(0);
      setVisible(true);
      feedback.commit();
    } else {
      setVisible(false);
    }
  }, [hasShareIntent, sharedFiles.length]);

  // List of all folders in user's vault
  const rawFolders = useMemo(() => {
    return storageNodes.filter((node) => node.type === 'folder');
  }, [storageNodes]);

  // Hierarchical folder tree with full paths and depth
  const hierarchicalFolders = useMemo(() => {
    const folderMap = new Map<string, StorageNode>();
    for (const f of rawFolders) {
      if (f.id) folderMap.set(f.id, f);
    }

    const childrenMap = new Map<string | null, StorageNode[]>();
    for (const f of rawFolders) {
      const pid = f.parentId && folderMap.has(f.parentId) ? f.parentId : null;
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid)!.push(f);
    }
    for (const list of childrenMap.values()) {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    }

    const result: Array<{
      id: string;
      name: string;
      depth: number;
      path: string;
      subfolderCount: number;
    }> = [];

    const traverse = (node: StorageNode, depth: number, parentPath: string) => {
      const currentPath = `${parentPath} > ${node.name}`;
      const children = childrenMap.get(node.id!) || [];
      result.push({
        id: node.id!,
        name: node.name,
        depth,
        path: currentPath,
        subfolderCount: children.length,
      });
      for (const child of children) {
        traverse(child, depth + 1, currentPath);
      }
    };

    const topFolders = childrenMap.get(null) || [];
    for (const top of topFolders) {
      traverse(top, 1, 'Home');
    }
    return result;
  }, [rawFolders]);

  // Selected folder display name (with full path if subfolder)
  const selectedFolderName = useMemo(() => {
    if (!selectedFolderId) return 'Vault Root (Home)';
    const found = hierarchicalFolders.find((f) => f.id === selectedFolderId);
    return found ? found.name : 'Vault Root (Home)';
  }, [selectedFolderId, hierarchicalFolders]);

  const selectedFolderPath = useMemo(() => {
    if (!selectedFolderId) return 'Default root location';
    const found = hierarchicalFolders.find((f) => f.id === selectedFolderId);
    return found ? found.path : 'Default root location';
  }, [selectedFolderId, hierarchicalFolders]);

  const handleDismiss = useCallback(() => {
    feedback.tap();
    setVisible(false);
    resetShareIntent();
  }, [resetShareIntent]);

  const toggleFolderPicker = useCallback(() => {
    feedback.tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFolderPickerOpen((prev) => !prev);
  }, []);

  const handleToggleCreateFolder = useCallback((open: boolean) => {
    feedback.tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsCreatingFolder(open);
    if (!open) {
      setNewFolderName('');
    }
  }, []);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    feedback.tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedFolderId(folderId);
    setFolderPickerOpen(false);
  }, []);

  // Inline Folder Creation
  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed || !user?.uid) return;

    try {
      feedback.commit();
      const folderId = `folder_${Date.now()}`;
      const now = Date.now();

      const newFolder: StorageNode = {
        id: folderId,
        userId: user.uid,
        type: 'folder',
        name: trimmed,
        parentId: selectedFolderId,
        createdAt: now,
        updatedAt: now,
      };

      optimisticAddStorageNode(newFolder);
      await safeAdd('storage_nodes', newFolder, () =>
        addDoc(collection(db, 'storage_nodes'), newFolder)
      );

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSelectedFolderId(folderId);
      setIsCreatingFolder(false);
      setNewFolderName('');
      feedback.success();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not create folder');
    }
  }, [newFolderName, user, selectedFolderId, optimisticAddStorageNode]);

  // Upload Shared Files to Vault
  const handleUploadToVault = useCallback(async () => {
    if (!primaryFile || !user?.uid) return;

    try {
      setUploading(true);
      setUploadProgress(0.05);
      setUploadStatusText('Preparing file...');
      feedback.commit();

      const totalFiles = sharedFiles.length;
      let uploadedCount = 0;

      for (let i = 0; i < totalFiles; i++) {
        const file = sharedFiles[i];
        const fileName = i === 0 && customFileName.trim() ? customFileName.trim() : (file.fileName || `Shared_Doc_${Date.now()}_${i}`);
        const mime = file.mimeType || 'application/octet-stream';
        const isPdf = mime.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
        const isImg = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
        const ftype: 'pdf' | 'image' | 'other' = isPdf ? 'pdf' : isImg ? 'image' : 'other';

        setUploadStatusText(`Uploading ${i + 1} of ${totalFiles}: ${fileName}`);

        const uploadRes = await uploadFileToCloudinary(
          file.path,
          mime,
          fileName,
          (prog) => {
            const overall = (i + prog) / totalFiles;
            setUploadProgress(overall);
          },
          file.size || undefined
        );

        // Pre-cache local file into vault offline cache
        try {
          await cacheLocalFile(file.path, uploadRes.url, fileName);
        } catch (cacheErr) {
          console.warn('[ShareToVault] Cache warning:', cacheErr);
        }

        const now = Date.now();
        const docId = `share_${now}_${i}`;
        const docPayload: StorageNode = {
          id: docId,
          userId: user.uid,
          type: 'file',
          fileType: ftype,
          name: fileName,
          url: uploadRes.url,
          size: uploadRes.size || file.size || 0,
          parentId: selectedFolderId,
          createdAt: now,
          updatedAt: now,
        };

        optimisticAddStorageNode(docPayload);
        await safeAdd('storage_nodes', docPayload, () =>
          addDoc(collection(db, 'storage_nodes'), docPayload)
        );
        uploadedCount++;
      }

      setUploadProgress(1);
      setUploadStatusText('Saved to Vault!');
      feedback.success();

      setTimeout(() => {
        handleDismiss();
      }, 700);
    } catch (e: any) {
      console.error('[ShareToVault] Upload error:', e);
      Alert.alert('Upload Failed', e?.message || 'Could not save file to ZenTrack Vault.');
      setUploading(false);
      setUploadProgress(0);
      setUploadStatusText('');
    }
  }, [primaryFile, sharedFiles, customFileName, user, selectedFolderId, optimisticAddStorageNode, handleDismiss]);

  if (!visible || !primaryFile) return null;

  const isImage = primaryFile.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(primaryFile.fileName || '');
  const isPdf = primaryFile.mimeType?.includes('pdf') || (primaryFile.fileName || '').toLowerCase().endsWith('.pdf');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleDismiss} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: isDark ? '#0A0A0E' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          {/* iOS Sheet Grab Handle */}
          <View style={styles.sheetHandleContainer}>
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' },
              ]}
            />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <LinearGradient
                colors={isDark ? ['#a599ff', '#7C3AED'] : ['#6C5CE7', '#8274E8']}
                style={styles.vaultBadge}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="cloud-upload" size={19} color="#FFFFFF" />
              </LinearGradient>
              <View>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Save to ZenTrack Vault</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                  {sharedFiles.length > 1 ? `${sharedFiles.length} files selected` : 'Select destination folder'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              onPress={handleDismiss}
              disabled={uploading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={17} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Shared File Preview Card */}
          <View
            style={[
              styles.fileCard,
              {
                backgroundColor: isDark ? '#12111A' : '#F6F5FB',
                borderColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)',
              },
            ]}
          >
            <View style={styles.fileCardPreview}>
              {isImage && primaryFile.path ? (
                <Image source={{ uri: primaryFile.path }} style={styles.imageThumbnail} resizeMode="cover" />
              ) : isPdf ? (
                <View style={[styles.docBadge, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                  <Ionicons name="document-text" size={24} color="#EF4444" />
                </View>
              ) : (
                <View
                  style={[
                    styles.docBadge,
                    { backgroundColor: isDark ? 'rgba(165,153,255,0.14)' : 'rgba(108,92,231,0.10)' },
                  ]}
                >
                  <Ionicons name="document" size={24} color={colors.accentPrimary} />
                </View>
              )}
            </View>

            <View style={styles.fileCardMeta}>
              <View
                style={[
                  styles.fileNameInputWrapper,
                  {
                    backgroundColor: isDark ? '#181724' : '#ECEAF6',
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  },
                ]}
              >
                <TextInput
                  style={[styles.fileNameInput, { color: colors.textPrimary }]}
                  value={customFileName}
                  onChangeText={setCustomFileName}
                  placeholder="File name"
                  placeholderTextColor={colors.textMuted}
                  editable={!uploading}
                  selectTextOnFocus
                />
                <Ionicons name="pencil-outline" size={13} color={colors.textMuted} style={{ marginLeft: 4 }} />
              </View>

              <View style={styles.fileCardSubrow}>
                <View
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: isPdf
                        ? 'rgba(239, 68, 68, 0.12)'
                        : isImage
                        ? 'rgba(16, 185, 129, 0.12)'
                        : isDark
                        ? 'rgba(165, 153, 255, 0.14)'
                        : 'rgba(108, 92, 231, 0.10)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      {
                        color: isPdf
                          ? '#EF4444'
                          : isImage
                          ? '#10B981'
                          : colors.accentPrimary,
                      },
                    ]}
                  >
                    {isPdf ? 'PDF' : isImage ? 'IMAGE' : 'FILE'}
                  </Text>
                </View>
                <Text style={[styles.fileSizeText, { color: colors.textMuted }]}>
                  {formatBytes(primaryFile.size)}
                </Text>
              </View>
            </View>
          </View>

          {/* Destination Folder Selector */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>DESTINATION FOLDER</Text>

          <TouchableOpacity
            style={[
              styles.folderSelector,
              {
                backgroundColor: isDark ? '#12111A' : '#F6F5FB',
                borderColor: folderPickerOpen
                  ? colors.accentPrimary
                  : isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.08)',
              },
            ]}
            onPress={toggleFolderPicker}
            disabled={uploading}
            activeOpacity={0.8}
          >
            <View style={styles.folderSelectorLeft}>
              <View
                style={[
                  styles.folderSelectorIconBadge,
                  {
                    backgroundColor: selectedFolderId
                      ? isDark
                        ? 'rgba(10,132,255,0.15)'
                        : 'rgba(10,132,255,0.10)'
                      : isDark
                      ? 'rgba(165,153,255,0.15)'
                      : 'rgba(108,92,231,0.10)',
                  },
                ]}
              >
                <Ionicons
                  name={selectedFolderId ? 'folder' : 'home'}
                  size={16}
                  color={selectedFolderId ? '#0A84FF' : colors.accentPrimary}
                />
              </View>
              <View style={styles.folderSelectorMeta}>
                <Text style={[styles.folderSelectorName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {selectedFolderName}
                </Text>
                <Text style={[styles.folderSelectorSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {selectedFolderPath}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.chevronCircle,
                {
                  backgroundColor: folderPickerOpen
                    ? isDark
                      ? 'rgba(165,153,255,0.15)'
                      : 'rgba(108,92,231,0.12)'
                    : isDark
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.04)',
                },
              ]}
            >
              <Ionicons
                name={folderPickerOpen ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={folderPickerOpen ? colors.accentPrimary : colors.textMuted}
              />
            </View>
          </TouchableOpacity>

          {/* Dropdown Folder List & Inline Creator */}
          {folderPickerOpen && (
            <View
              style={[
                styles.folderDropdown,
                {
                  backgroundColor: isDark ? '#12111A' : '#F6F5FB',
                  borderColor: isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.16)',
                },
              ]}
            >
              {/* + Create New Folder Button or Active Creator Card */}
              {!isCreatingFolder ? (
                <TouchableOpacity
                  style={[
                    styles.newFolderBtn,
                    {
                      backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.06)',
                      borderColor: isDark ? 'rgba(165,153,255,0.22)' : 'rgba(108,92,231,0.20)',
                    },
                  ]}
                  onPress={() => handleToggleCreateFolder(true)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.newFolderIconCircle,
                      {
                        backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)',
                      },
                    ]}
                  >
                    <Ionicons name="add" size={15} color={colors.accentPrimary} />
                  </View>
                  <Text style={[styles.newFolderText, { color: colors.accentPrimary }]}>Create New Folder</Text>
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.newFolderCard,
                    {
                      backgroundColor: isDark ? '#181726' : '#EDEAF7',
                      borderColor: colors.accentPrimary,
                    },
                  ]}
                >
                  <View style={styles.newFolderInputRow}>
                    <Ionicons name="folder-outline" size={18} color={colors.accentPrimary} style={{ marginRight: 8 }} />
                    <TextInput
                      style={[styles.newFolderInput, { color: colors.textPrimary }]}
                      value={newFolderName}
                      onChangeText={setNewFolderName}
                      placeholder="Enter folder name..."
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleCreateFolder}
                    />
                    {newFolderName.length > 0 && (
                      <TouchableOpacity
                        style={styles.inputClearBtn}
                        onPress={() => setNewFolderName('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close-circle" size={15} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.newFolderActionRow}>
                    <TouchableOpacity
                      style={[
                        styles.folderCancelBtn,
                        { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)' },
                      ]}
                      onPress={() => handleToggleCreateFolder(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.folderCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.folderCreateBtn,
                        { backgroundColor: colors.accentPrimary },
                        !newFolderName.trim() && { opacity: 0.45 },
                      ]}
                      onPress={handleCreateFolder}
                      disabled={!newFolderName.trim()}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="checkmark"
                        size={15}
                        color={isDark ? '#000000' : '#FFFFFF'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.folderCreateText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                        Create
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View
                style={[
                  styles.divider,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                ]}
              />

              {/* Scrollable Folder List */}
              <ScrollView
                style={styles.folderScrollView}
                contentContainerStyle={styles.folderScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
                indicatorStyle={isDark ? 'white' : 'black'}
                keyboardShouldPersistTaps="handled"
              >
                {/* Root Home Option */}
                <TouchableOpacity
                  style={[
                    styles.folderOptionRow,
                    selectedFolderId === null && {
                      backgroundColor: isDark ? 'rgba(165,153,255,0.14)' : 'rgba(108,92,231,0.08)',
                      borderColor: isDark ? 'rgba(165,153,255,0.28)' : 'rgba(108,92,231,0.22)',
                    },
                  ]}
                  onPress={() => handleSelectFolder(null)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.folderIconBadge,
                      {
                        backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.10)',
                      },
                    ]}
                  >
                    <Ionicons name="home" size={16} color={colors.accentPrimary} />
                  </View>
                  <View style={styles.folderTextContainer}>
                    <Text style={[styles.folderOptionText, { color: colors.textPrimary }]}>Vault Root (Home)</Text>
                    <Text style={[styles.folderOptionSubtext, { color: colors.textMuted }]}>
                      Main storage directory
                    </Text>
                  </View>
                  {selectedFolderId === null ? (
                    <View style={[styles.checkCircle, { backgroundColor: colors.accentPrimary }]}>
                      <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                    </View>
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'}
                    />
                  )}
                </TouchableOpacity>

                {/* Hierarchical Subfolders */}
                {hierarchicalFolders.map((f) => {
                  const iconColor = f.depth === 1 ? '#F59E0B' : f.depth === 2 ? '#0A84FF' : '#10B981';
                  const iconBg =
                    f.depth === 1
                      ? isDark ? 'rgba(245,158,11,0.16)' : 'rgba(217,119,6,0.12)'
                      : f.depth === 2
                      ? isDark ? 'rgba(10,132,255,0.15)' : 'rgba(10,132,255,0.10)'
                      : isDark ? 'rgba(16,185,129,0.15)' : 'rgba(5,150,105,0.10)';
                  const indent = Math.min((f.depth - 1) * 18, 54);

                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        styles.folderOptionRow,
                        { paddingLeft: 10 + indent },
                        selectedFolderId === f.id && {
                          backgroundColor: isDark ? 'rgba(10,132,255,0.14)' : 'rgba(10,132,255,0.08)',
                          borderColor: isDark ? 'rgba(10,132,255,0.30)' : 'rgba(10,132,255,0.25)',
                        },
                      ]}
                      onPress={() => handleSelectFolder(f.id)}
                      activeOpacity={0.7}
                    >
                      {f.depth > 1 && (
                        <Ionicons
                          name="return-down-forward"
                          size={13}
                          color={isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.25)'}
                          style={{ marginRight: 2 }}
                        />
                      )}
                      <View style={[styles.folderIconBadge, { backgroundColor: iconBg }]}>
                        <Ionicons name={f.depth === 2 ? 'folder-open' : 'folder'} size={15} color={iconColor} />
                      </View>
                      <View style={styles.folderTextContainer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text
                            style={[
                              styles.folderOptionText,
                              { color: colors.textPrimary },
                              f.depth === 1 && { fontFamily: FONT_FAMILY.bold },
                            ]}
                            numberOfLines={1}
                          >
                            {f.name}
                          </Text>
                          {f.subfolderCount > 0 && (
                            <Text style={{ fontSize: 10, color: colors.textMuted }}>
                              ({f.subfolderCount})
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.folderOptionSubtext, { color: colors.textMuted }]} numberOfLines={1}>
                          {f.path}
                        </Text>
                      </View>
                      {selectedFolderId === f.id ? (
                        <View style={[styles.checkCircle, { backgroundColor: '#0A84FF' }]}>
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        </View>
                      ) : (
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {hierarchicalFolders.length === 0 && (
                  <View style={styles.emptyFolderHint}>
                    <Text style={[styles.emptyFolderText, { color: colors.textMuted }]}>
                      No subfolders created yet. Files will be saved to Vault Root.
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          {/* Upload Progress Indicator */}
          {uploading && (
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                ]}
              >
                <LinearGradient
                  colors={isDark ? ['#a599ff', '#7C3AED'] : ['#6C5CE7', '#8274E8']}
                  style={[
                    styles.progressBar,
                    { width: `${Math.max(4, Math.round(uploadProgress * 100))}%` },
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
              </View>
              <Text style={[styles.progressStatus, { color: colors.textSecondary }]}>
                {uploadStatusText} ({Math.round(uploadProgress * 100)}%)
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.cancelBtn,
                {
                  backgroundColor: isDark ? '#14131C' : '#EDEAF4',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                },
              ]}
              onPress={handleDismiss}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.uploadBtn, uploading && { opacity: 0.7 }]}
              onPress={handleUploadToVault}
              disabled={uploading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isDark ? ['#a599ff', '#7C3AED'] : ['#6C5CE7', '#8274E8']}
                style={styles.uploadBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="cloud-upload" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.uploadBtnText}>
                  {uploading ? 'Saving to Vault...' : 'Save to Vault'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: SPACE.lg,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : SPACE.lg,
    maxHeight: '88%',
  },
  sheetHandleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  sheetHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  vaultBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.base,
    fontFamily: FONT_FAMILY.bold,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: SPACE.md,
    gap: 12,
  },
  fileCardPreview: {
    width: 48,
    height: 48,
    borderRadius: 13,
    overflow: 'hidden',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
  },
  docBadge: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCardMeta: {
    flex: 1,
  },
  fileNameInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    height: 32,
    marginBottom: 5,
  },
  fileNameInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_FAMILY.medium,
    paddingVertical: 0,
  },
  fileCardSubrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typePill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  typePillText: {
    fontSize: 9.5,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.5,
  },
  fileSizeText: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY.regular,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  folderSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: SPACE.sm,
  },
  folderSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  folderSelectorIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderSelectorMeta: {
    flex: 1,
  },
  folderSelectorName: {
    fontSize: 13.5,
    fontFamily: FONT_FAMILY.bold,
  },
  folderSelectorSub: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 1,
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderDropdown: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    maxHeight: 310,
    marginBottom: SPACE.md,
  },
  newFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  newFolderIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newFolderText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
  },
  newFolderCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 10,
    marginBottom: 6,
    gap: 8,
  },
  newFolderInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
  },
  newFolderInput: {
    flex: 1,
    height: 34,
    fontSize: 13,
    fontFamily: FONT_FAMILY.medium,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  inputClearBtn: {
    padding: 4,
  },
  newFolderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  folderCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  folderCancelText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
  },
  folderCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 7,
  },
  folderCreateText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  folderScrollView: {
    maxHeight: 200,
  },
  folderScrollContent: {
    paddingVertical: 2,
    gap: 4,
  },
  folderOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  folderIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderTextContainer: {
    flex: 1,
  },
  folderOptionText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.medium,
  },
  folderOptionSubtext: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 1,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFolderHint: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  emptyFolderText: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY.regular,
    textAlign: 'center',
    lineHeight: 16,
  },
  progressContainer: {
    marginVertical: SPACE.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  progressStatus: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY.regular,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.xs,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
  },
  uploadBtn: {
    flex: 2,
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
  },
  uploadBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtnText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: '#FFFFFF',
  },
});

