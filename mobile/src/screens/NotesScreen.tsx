/**
 * NotesScreen — ZenTrack Mobile
 *
 * High-performance, fully decoupled Cloud Vault and Notes Manager.
 * Features 0ms optimistic mutations, 150ms debounced search, memoized FlashList rows,
 * and isolated modal render branches for seamless 60/120fps performance.
 */

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  InteractionManager,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';

import { db } from '../services/firebase';
import { useCreativeData } from '../contexts/domains/CreativeContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useTheme } from '../contexts/ThemeContext';
import type { StorageNode } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { uploadFileToCloudinary } from '../services/cloudinary';
import { cacheLocalFile } from '../services/vaultCacheService';
import { safeAdd, safeUpdate, safeDelete } from '../utils/safeWrite';
import { handleSyncError } from '../utils/errorUtils';
import { feedback } from '../utils/haptics';

import EmptyState from '../components/ui/EmptyState';
import VaultDocumentViewer from '../components/Vault/VaultDocumentViewer';
import StorageNodeRow from '../components/Notes/StorageNodeRow';
import NoteEditorModal from '../components/Notes/NoteEditorModal';
import StorageItemActionSheet from '../components/Notes/StorageItemActionSheet';
import NewFolderModal from '../components/Notes/NewFolderModal';
import RenameNodeModal from '../components/Notes/RenameNodeModal';
import MoveNodeModal from '../components/Notes/MoveNodeModal';
import BatchActionBar from '../components/Notes/BatchActionBar';

const FILTER_CATEGORIES = ['All', 'Documents', 'Images', 'Notes'] as const;
type FilterCategory = typeof FILTER_CATEGORIES[number];

export default function NotesScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const {
    storageNodes,
    ensureSubscribed,
    optimisticAddStorageNode,
    optimisticUpdateStorageNode,
    optimisticDeleteStorageNode,
    optimisticBatchDeleteStorageNodes,
  } = useCreativeData();

  const { user } = useCoreData();
  const route = useRoute<any>();

  // Ensure Firestore subscriptions settle off the critical frame
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  // Navigation State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Search & Filter State with 150ms debouncing
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterCategory>('All');
  const [sortMode] = useState<'newest' | 'oldest' | 'az'>('newest');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(rawSearchQuery.trim().toLowerCase());
    }, 150);
    return () => clearTimeout(timer);
  }, [rawSearchQuery]);

  // Selection Mode State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSize, setUploadSize] = useState('0 MB');
  const [uploadFileName, setUploadFileName] = useState('');

  // Modals & Sheets State
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editorNote, setEditorNote] = useState<StorageNode | null | 'new'>(null);
  const [viewerNode, setViewerNode] = useState<StorageNode | null>(null);
  const [actionItem, setActionItem] = useState<StorageNode | null>(null);
  const [renameTarget, setRenameTarget] = useState<StorageNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<StorageNode | null>(null);
  const [isBatchMoving, setIsBatchMoving] = useState(false);

  // Route Param Listener for upload action
  useEffect(() => {
    if (route.params?.openUpload) {
      setShowFabMenu(true);
    }
  }, [route.params?.openUpload, route.params?.timestamp]);

  // Storage Stats Computation
  const storageStats = useMemo(() => {
    let usedBytes = 0;
    for (let i = 0; i < storageNodes.length; i++) {
      usedBytes += storageNodes[i].size || 0;
    }
    const maxBytes = 25 * 1024 * 1024 * 1024; // 25 GB
    const percentage = Math.min(100, (usedBytes / maxBytes) * 100);

    const gb = usedBytes / (1024 * 1024 * 1024);
    const usedText = gb >= 1 ? `${gb.toFixed(1)} GB` : `${(usedBytes / (1024 * 1024)).toFixed(1)} MB`;

    return {
      usedText,
      percentage: `${percentage.toFixed(2)}%`,
      maxText: '25 GB',
    };
  }, [storageNodes]);

  // Filtered and Sorted items in current folder
  const currentItems = useMemo(() => {
    let items = storageNodes.filter(n => (n.parentId ?? null) === currentFolderId);

    if (debouncedSearchQuery) {
      items = items.filter(n => {
        const nameMatch = n.name.toLowerCase().includes(debouncedSearchQuery);
        if (nameMatch) return true;
        return !!n.content && n.content.toLowerCase().includes(debouncedSearchQuery);
      });
    }

    if (filterMode === 'Documents') {
      items = items.filter(n => n.type === 'file' && (n.fileType === 'pdf' || n.fileType === 'docx' || n.fileType === 'other'));
    } else if (filterMode === 'Images') {
      items = items.filter(n => n.type === 'file' && n.fileType === 'image');
    } else if (filterMode === 'Notes') {
      items = items.filter(n => n.type === 'note');
    }

    return items.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;

      if (sortMode === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortMode === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
      return a.name.localeCompare(b.name);
    });
  }, [storageNodes, currentFolderId, debouncedSearchQuery, filterMode, sortMode]);

  // Folders for Move dialog
  const availableMoveFolders = useMemo(() => {
    return storageNodes.filter(n => n.type === 'folder' && n.id !== moveTarget?.id);
  }, [storageNodes, moveTarget?.id]);

  // Breadcrumbs path
  const breadcrumbs = useMemo(() => {
    if (!currentFolderId) return [];
    const nodeMap = new Map<string, StorageNode>();
    for (let i = 0; i < storageNodes.length; i++) {
      const node = storageNodes[i];
      if (node.id) nodeMap.set(node.id, node);
    }

    const crumbs: { id: string | null; name: string }[] = [];
    let curr: string | null | undefined = currentFolderId;
    while (curr) {
      const node = nodeMap.get(curr);
      if (node) {
        crumbs.unshift({ id: node.id!, name: node.name });
        curr = node.parentId;
      } else {
        break;
      }
    }
    crumbs.unshift({ id: null, name: 'Home' });
    return crumbs;
  }, [storageNodes, currentFolderId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCreateFolder = useCallback(async (folderName: string) => {
    if (!user) return;
    const now = Date.now();
    const tempId = `folder_temp_${now}`;

    const folderData: StorageNode = {
      id: tempId,
      userId: user.uid,
      type: 'folder',
      name: folderName,
      parentId: currentFolderId,
      createdAt: now,
      updatedAt: now,
    };

    // 0ms Optimistic UI update
    optimisticAddStorageNode(folderData);
    setShowNewFolder(false);
    feedback.success();

    const firestorePayload = {
      userId: user.uid,
      type: 'folder' as const,
      name: folderName,
      parentId: currentFolderId,
      createdAt: now,
      updatedAt: now,
    };

    safeAdd(
      'storage_nodes',
      firestorePayload,
      () => addDoc(collection(db, 'storage_nodes'), firestorePayload)
    ).catch(handleSyncError);
  }, [user, currentFolderId, optimisticAddStorageNode]);

  const handleFileUpload = useCallback(async () => {
    if (!user) return;
    setShowFabMenu(false);

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
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

      // Pre-cache local file into vault cache
      try {
        await cacheLocalFile(file.uri, uploadRes.url, file.name);
      } catch (cacheErr) {
        console.warn('[NotesScreen] Pre-cache non-fatal warning:', cacheErr);
      }

      const now = Date.now();
      const docPayload: StorageNode = {
        id: `file_temp_${now}`,
        userId: user.uid,
        type: 'file',
        fileType: ftype,
        name: file.name || 'Uploaded Document',
        url: uploadRes.url,
        size: uploadRes.size || file.size || 0,
        parentId: currentFolderId,
        createdAt: now,
        updatedAt: now,
      };

      // 0ms Optimistic UI update
      optimisticAddStorageNode(docPayload);
      feedback.success();

      const firestorePayload = {
        userId: user.uid,
        type: 'file' as const,
        fileType: ftype,
        name: file.name || 'Uploaded Document',
        url: uploadRes.url,
        size: uploadRes.size || file.size || 0,
        parentId: currentFolderId,
        createdAt: now,
        updatedAt: now,
      };

      await safeAdd('storage_nodes', firestorePayload, () =>
        addDoc(collection(db, 'storage_nodes'), firestorePayload)
      );
    } catch (e: any) {
      console.error('[NotesScreen] Upload error:', e);
      Alert.alert('Upload Issue', e?.message || 'There was an error uploading the file.');
    } finally {
      setUploading(false);
    }
  }, [user, currentFolderId, optimisticAddStorageNode]);

  const handlePin = useCallback((item: StorageNode) => {
    const updatedPinned = !item.pinned;
    // 0ms Optimistic UI update
    optimisticUpdateStorageNode(item.id!, { pinned: updatedPinned, updatedAt: Date.now() });

    safeUpdate(
      item.id!,
      'storage_nodes',
      { pinned: updatedPinned, updatedAt: Date.now() },
      () => updateDoc(doc(db, 'storage_nodes', item.id!), { pinned: updatedPinned, updatedAt: Date.now() })
    ).catch(handleSyncError);
  }, [optimisticUpdateStorageNode]);

  const handleDelete = useCallback((item: StorageNode) => {
    Alert.alert('Delete', `Are you sure you want to delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // 0ms Optimistic UI delete
          optimisticDeleteStorageNode(item.id!);
          safeDelete(
            item.id!,
            'storage_nodes',
            () => deleteDoc(doc(db, 'storage_nodes', item.id!))
          ).catch(handleSyncError);
        },
      },
    ]);
  }, [optimisticDeleteStorageNode]);

  const handleSaveRename = useCallback((node: StorageNode, newName: string) => {
    // 0ms Optimistic rename
    optimisticUpdateStorageNode(node.id!, { name: newName, updatedAt: Date.now() });

    safeUpdate(
      node.id!,
      'storage_nodes',
      { name: newName, updatedAt: Date.now() },
      () => updateDoc(doc(db, 'storage_nodes', node.id!), { name: newName, updatedAt: Date.now() })
    ).catch(handleSyncError);
  }, [optimisticUpdateStorageNode]);

  const handleExecuteMove = useCallback((targetFolderId: string | null) => {
    if (isBatchMoving) {
      const idsToMove = Array.from(selectedIds);
      const now = Date.now();
      for (const id of idsToMove) {
        optimisticUpdateStorageNode(id, { parentId: targetFolderId, updatedAt: now });
        safeUpdate(
          id,
          'storage_nodes',
          { parentId: targetFolderId, updatedAt: now },
          () => updateDoc(doc(db, 'storage_nodes', id), { parentId: targetFolderId, updatedAt: now })
        ).catch(handleSyncError);
      }
      setIsBatchMoving(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      feedback.success();
    } else if (moveTarget) {
      const now = Date.now();
      optimisticUpdateStorageNode(moveTarget.id!, { parentId: targetFolderId, updatedAt: now });
      safeUpdate(
        moveTarget.id!,
        'storage_nodes',
        { parentId: targetFolderId, updatedAt: now },
        () => updateDoc(doc(db, 'storage_nodes', moveTarget.id!), { parentId: targetFolderId, updatedAt: now })
      ).catch(handleSyncError);
      setMoveTarget(null);
      feedback.success();
    }
  }, [isBatchMoving, selectedIds, moveTarget, optimisticUpdateStorageNode]);

  // ── Multi-Select Batch Actions ────────────────────────────────────────────

  const handleToggleSelectAll = useCallback(() => {
    if (selectedIds.size === currentItems.length && currentItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      const allIds = new Set(currentItems.map(i => i.id!).filter(Boolean));
      setSelectedIds(allIds);
    }
  }, [selectedIds.size, currentItems]);

  const handleBatchDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;

    Alert.alert(
      'Delete Selected',
      `Are you sure you want to delete ${count} item${count > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const idsToDelete = Array.from(selectedIds);
            // 0ms Optimistic batch delete
            optimisticBatchDeleteStorageNodes(idsToDelete);
            setSelectionMode(false);
            setSelectedIds(new Set());
            feedback.success();

            for (const id of idsToDelete) {
              safeDelete(
                id,
                'storage_nodes',
                () => deleteDoc(doc(db, 'storage_nodes', id))
              ).catch(handleSyncError);
            }
          },
        },
      ]
    );
  }, [selectedIds, optimisticBatchDeleteStorageNodes]);

  const handleBatchMoveOpen = useCallback(() => {
    if (selectedIds.size === 0) return;
    setIsBatchMoving(true);
  }, [selectedIds.size]);

  const handleExitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // ── Row Callbacks ─────────────────────────────────────────────────────────

  const handleRowPress = useCallback((item: StorageNode) => {
    if (selectionMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id!)) next.delete(item.id!);
        else next.add(item.id!);
        return next;
      });
    } else {
      if (item.type === 'folder') setCurrentFolderId(item.id!);
      else if (item.type === 'note') setEditorNote(item);
      else if (item.type === 'file') setViewerNode(item);
    }
  }, [selectionMode]);

  const handleRowLongPress = useCallback((item: StorageNode) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds(new Set([item.id!]));
    }
  }, [selectionMode]);

  const handleRowMenuPress = useCallback((item: StorageNode) => {
    setActionItem(item);
  }, []);

  const renderItem = useCallback(({ item }: any) => {
    const isSelected = selectedIds.has(item.id!);
    return (
      <StorageNodeRow
        item={item}
        isSelected={isSelected}
        isSelectionMode={selectionMode}
        isUploading={uploading && item.id === 'uploading-temp'}
        uploadProgress={uploadProgress}
        uploadSize={uploadSize}
        colors={colors}
        isDark={isDark}
        onPress={handleRowPress}
        onLongPress={handleRowLongPress}
        onMenuPress={handleRowMenuPress}
      />
    );
  }, [
    selectedIds,
    selectionMode,
    uploading,
    uploadProgress,
    uploadSize,
    colors,
    isDark,
    handleRowPress,
    handleRowLongPress,
    handleRowMenuPress,
  ]);

  const keyExtractor = useCallback((item: any) => item.id!, []);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.vaultHeader}>
        {currentFolderId ? (
          <TouchableOpacity
            style={styles.vaultHeaderBtn}
            onPress={() => setCurrentFolderId(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.accentPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
        <Text style={styles.vaultHeaderTitle}>
          {currentFolderId ? breadcrumbs[breadcrumbs.length - 1]?.name || 'Vault' : 'Vault'}
        </Text>
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

      {/* Search & Category Filter Toolbar */}
      <View style={[styles.toolbarWrap, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: isDark ? '#1c1c1e' : '#FFFFFF', borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search files and notes..."
            placeholderTextColor={colors.textMuted}
            value={rawSearchQuery}
            onChangeText={setRawSearchQuery}
          />
          {rawSearchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setRawSearchQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm }}>
          {FILTER_CATEGORIES.map((f) => {
            const isActive = filterMode === f;
            return (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterPill,
                  { backgroundColor: isDark ? (colors.surface2 || '#1C1C1E') : '#FFFFFF', borderColor: colors.border },
                  isActive && { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
                ]}
                onPress={() => {
                  feedback.tap();
                  setFilterMode(f);
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: colors.textSecondary },
                    isActive && { color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold },
                  ]}
                >
                  {f}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Virtualized List */}
      <FlashList
        data={
          uploading
            ? [{ id: 'uploading-temp', name: uploadFileName || 'Uploading...', type: 'file', uploading: true } as any, ...currentItems]
            : currentItems
        }
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title="Empty folder"
            subtitle="Add notes, upload files, or create folders here."
          />
        }
      />

      {/* Multi-Select Floating Action Bar */}
      <BatchActionBar
        visible={selectionMode}
        selectedCount={selectedIds.size}
        totalCount={currentItems.length}
        onToggleSelectAll={handleToggleSelectAll}
        onBatchMove={handleBatchMoveOpen}
        onBatchDelete={handleBatchDelete}
        onCancel={handleExitSelection}
        colors={colors}
        isDark={isDark}
      />

      {/* FAB Button (Hidden during selection mode) */}
      {!selectionMode && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowFabMenu(true)}>
          <Ionicons name="add" size={24} color={isDark ? '#000000' : '#FFFFFF'} />
        </TouchableOpacity>
      )}

      {/* FAB Options Action Sheet */}
      {showFabMenu && (
        <Modal transparent animationType="slide" visible={showFabMenu} onRequestClose={() => setShowFabMenu(false)}>
          <View style={styles.actionSheetOverlay}>
            <Pressable style={{ flex: 1 }} onPress={() => setShowFabMenu(false)} />
            <View style={[styles.actionSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.actionSheetHandle, { backgroundColor: isDark ? colors.border : '#D1D1D6' }]} />

              <TouchableOpacity style={styles.actionSheetItem} onPress={handleFileUpload}>
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' }]}>
                  <Ionicons name="cloud-upload" size={20} color={colors.accentPrimary} />
                </View>
                <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>Upload file</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setShowFabMenu(false);
                  setEditorNote('new');
                }}
              >
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)' }]}>
                  <Ionicons name="document-text" size={20} color={colors.accentPrimary} />
                </View>
                <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>New note</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  setShowFabMenu(false);
                  setShowNewFolder(true);
                }}
              >
                <View style={[styles.actionSheetIcon, { backgroundColor: isDark ? 'rgba(10, 132, 255, 0.15)' : 'rgba(2, 132, 199, 0.10)' }]}>
                  <Ionicons name="folder-outline" size={20} color={isDark ? '#0A84FF' : '#0284C7'} />
                </View>
                <Text style={[styles.actionSheetText, { color: colors.textPrimary }]}>New folder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* New Folder Modal */}
      <NewFolderModal
        visible={showNewFolder}
        onClose={() => setShowNewFolder(false)}
        onCreate={handleCreateFolder}
        colors={colors}
        isDark={isDark}
      />

      {/* Item Action Sheet (3-Dots Menu) */}
      <StorageItemActionSheet
        item={actionItem}
        onClose={() => setActionItem(null)}
        onPin={handlePin}
        onRename={(node) => setRenameTarget(node)}
        onMove={(node) => setMoveTarget(node)}
        onDelete={handleDelete}
        colors={colors}
        isDark={isDark}
      />

      {/* Rename Modal */}
      <RenameNodeModal
        node={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={handleSaveRename}
        colors={colors}
        isDark={isDark}
      />

      {/* Move Modal */}
      <MoveNodeModal
        node={moveTarget}
        batchCount={isBatchMoving ? selectedIds.size : 0}
        folders={availableMoveFolders}
        onClose={() => {
          setMoveTarget(null);
          setIsBatchMoving(false);
        }}
        onMove={handleExecuteMove}
        colors={colors}
        isDark={isDark}
      />

      {/* Note Editor Modal */}
      {editorNote && user && (
        <NoteEditorModal
          note={editorNote === 'new' ? null : editorNote}
          userId={user.uid}
          parentId={currentFolderId}
          onClose={() => setEditorNote(null)}
        />
      )}

      {/* Vault Document Viewer */}
      {viewerNode && (
        <VaultDocumentViewer node={viewerNode} onClose={() => setViewerNode(null)} />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  vaultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
    backgroundColor: colors.background,
  },
  vaultHeaderBtn: { padding: SPACE.sm },
  vaultHeaderTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },

  storageCard: {
    backgroundColor: colors.surface,
    marginHorizontal: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storageCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  storageCardText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
  storageCardSubtext: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textSecondary },
  storageTrack: { height: 4, backgroundColor: isDark ? colors.border : '#E2E1EA', borderRadius: 2, overflow: 'hidden' },
  storageFill: { height: '100%', backgroundColor: colors.accentPrimary, borderRadius: 2 },

  toolbarWrap: {
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.md,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    padding: SPACE.sm,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
  },

  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  filterPillText: { fontFamily: FONT_FAMILY.body, fontSize: 13 },

  list: { padding: SPACE.sm, paddingBottom: 110 },

  fab: {
    position: 'absolute',
    bottom: 84,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    ...SHADOW.md,
  },

  actionSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingBottom: SPACE.xl,
    paddingHorizontal: SPACE.md,
    borderWidth: 1,
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: SPACE.md,
  },
  actionSheetItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACE.md, gap: SPACE.md },
  actionSheetIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionSheetText: { fontFamily: FONT_FAMILY.bold, fontSize: 16 },
});
