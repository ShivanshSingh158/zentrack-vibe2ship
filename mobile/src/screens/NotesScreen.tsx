/**
 * NotesScreen — ZenTrack Mobile
 *
 * High-performance, fully decoupled Cloud Vault and Notes Manager.
 * Features 0ms optimistic mutations, 150ms debounced search, memoized FlashList rows,
 * and isolated modal render branches for seamless 60/120fps performance.
 */

import React, { useCallback, useEffect, useState, useMemo, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  InteractionManager,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { FlashList } from '@shopify/flash-list';
import Animated, { SlideInDown, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';

import { db } from '../services/firebase';
import { useCreativeData } from '../contexts/domains/CreativeContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useTheme } from '../contexts/ThemeContext';
import type { StorageNode } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { uploadFileToCloudinary } from '../services/cloudinary';
import { compressPdfWithILovePDF } from '../services/ilovepdfCompress';
import { cacheLocalFile } from '../services/vaultCacheService';
import { safeAdd, safeUpdate, safeDelete, safeWrite } from '../utils/safeWrite';
import { handleSyncError } from '../utils/errorUtils';
import { feedback } from '../utils/haptics';

import EmptyState from '../components/ui/EmptyState';
import AnimatedPressable from '../components/AnimatedPressable';
import StorageNodeRow from '../components/Notes/StorageNodeRow';
import StorageContextMenuModal from '../components/Notes/StorageContextMenuModal';
import CategoryFilterTabs, { FilterCategory } from '../components/Notes/CategoryFilterTabs';
import SpeedDialFab from '../components/Notes/SpeedDialFab';
import NewFolderModal from '../components/Notes/NewFolderModal';
import RenameNodeModal from '../components/Notes/RenameNodeModal';
import MoveNodeModal from '../components/Notes/MoveNodeModal';
import BatchActionBar from '../components/Notes/BatchActionBar';
import SortMenuModal, { SortMode } from '../components/Notes/SortMenuModal';

// ── Lazy-loaded Heavy Modals: Skips parsing ~1,100 LOC until opened ──
const NoteEditorModal = React.lazy(() => import('../components/Notes/NoteEditorModal'));
const VaultDocumentViewer = React.lazy(() => import('../components/Vault/VaultDocumentViewer'));

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
  const [isFolderSearchOpen, setIsFolderSearchOpen] = useState(false);
  const isInsideFolder = !!currentFolderId;

  useEffect(() => {
    setIsFolderSearchOpen(false);
  }, [currentFolderId]);

  // Search & Filter State with 150ms debouncing
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const insets = useSafeAreaInsets();
  const [filterMode, setFilterMode] = useState<FilterCategory>('All');
  // Per-folder sort: key = folderId (null = Home/root). Each folder remembers its own sort.
  const [sortModeMap, setSortModeMap] = useState<Record<string, SortMode>>({});
  const folderKey = currentFolderId ?? '__root__';
  const currentSortMode: SortMode = sortModeMap[folderKey] ?? 'newest';
  const setCurrentSortMode = (mode: SortMode) =>
    setSortModeMap(prev => ({ ...prev, [folderKey]: mode }));
  const [showSortMenu, setShowSortMenu] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(rawSearchQuery.trim().toLowerCase());
    }, 150);
    return () => clearTimeout(timer);
  }, [rawSearchQuery]);

  // Selection Mode State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCreatingFolderWithSelection, setIsCreatingFolderWithSelection] = useState(false);

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSize, setUploadSize] = useState('0 MB');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadStep, setUploadStep] = useState(''); // e.g. 'Compressing PDF...'
  // Instant banner shown the moment a large file is detected (before compression starts)
  const [largePdfBanner, setLargePdfBanner] = useState<{ name: string; sizeMb: string } | null>(null);
  const largePdfBannerTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLargePdfBanner = (name: string, sizeMb: string) => {
    if (largePdfBannerTimer.current) clearTimeout(largePdfBannerTimer.current);
    setLargePdfBanner({ name, sizeMb });
    largePdfBannerTimer.current = setTimeout(() => setLargePdfBanner(null), 4000);
  };
  React.useEffect(() => () => { if (largePdfBannerTimer.current) clearTimeout(largePdfBannerTimer.current); }, []);

  // Modals & Sheets State
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editorNote, setEditorNote] = useState<StorageNode | null | 'new'>(null);
  const [viewerNode, setViewerNode] = useState<StorageNode | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<StorageNode | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<StorageNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<StorageNode | null>(null);
  const [isBatchMoving, setIsBatchMoving] = useState(false);

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

  // Fast folder lookup map for resolving breadcrumbs and location paths
  const folderNameMap = useMemo(() => {
    const map = new Map<string, { name: string; parentId: string | null }>();
    for (let i = 0; i < storageNodes.length; i++) {
      const n = storageNodes[i];
      if (n.id && n.type === 'folder') {
        map.set(n.id, { name: n.name, parentId: n.parentId ?? null });
      }
    }
    return map;
  }, [storageNodes]);

  const getFolderPath = useCallback((parentId: string | null): string => {
    if (!parentId) return 'Home';
    const parts: string[] = [];
    let curr: string | null = parentId;
    let depth = 0;
    while (curr && depth < 5) {
      const folder = folderNameMap.get(curr);
      if (folder) {
        parts.unshift(folder.name);
        curr = folder.parentId;
      } else {
        break;
      }
      depth++;
    }
    return parts.length > 0 ? parts.join(' > ') : 'Home';
  }, [folderNameMap]);

  const isSearching = Boolean(debouncedSearchQuery && debouncedSearchQuery.trim().length > 0);
  const normalizedQuery = useMemo(() => (debouncedSearchQuery || '').trim().toLowerCase(), [debouncedSearchQuery]);

  // Filtered and Sorted items in current folder OR global vault search across whole files
  const currentItems = useMemo(() => {
    let items: StorageNode[];

    if (isSearching) {
      // Global Vault Search: Search across ALL storage nodes in the entire vault
      items = storageNodes.filter(n => {
        const nameMatch = n.name.toLowerCase().includes(normalizedQuery);
        if (nameMatch) return true;
        const contentMatch = !!n.content && n.content.toLowerCase().includes(normalizedQuery);
        if (contentMatch) return true;
        const tagMatch = !!n.tags && n.tags.some(t => t.toLowerCase().includes(normalizedQuery));
        return tagMatch;
      });

      // Annotate items with their folder location path
      items = items.map(n => ({
        ...n,
        locationPath: getFolderPath(n.parentId ?? null),
      }));
    } else {
      // Normal Folder Browsing: Only show items in current folder
      items = storageNodes.filter(n => (n.parentId ?? null) === currentFolderId);
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

      if (isSearching) {
        const aExact = a.name.toLowerCase() === normalizedQuery;
        const bExact = b.name.toLowerCase() === normalizedQuery;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = a.name.toLowerCase().startsWith(normalizedQuery);
        const bStarts = b.name.toLowerCase().startsWith(normalizedQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
      }

      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;

      if (currentSortMode === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
      if (currentSortMode === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
      if (currentSortMode === 'za') return b.name.localeCompare(a.name);
      if (currentSortMode === 'size_desc') return (b.size || 0) - (a.size || 0);
      if (currentSortMode === 'size_asc') return (a.size || 0) - (b.size || 0);
      if (currentSortMode === 'modified') return (b.updatedAt || 0) - (a.updatedAt || 0);
      return a.name.localeCompare(b.name);
    });
  }, [
    storageNodes,
    currentFolderId,
    isSearching,
    normalizedQuery,
    getFolderPath,
    filterMode,
    currentSortMode,
  ]);

  // Dynamic Category Counts for current folder or global search
  const categoryCounts = useMemo<Record<FilterCategory, number>>(() => {
    let all = 0;
    let docs = 0;
    let imgs = 0;
    let nts = 0;

    let targetNodes: StorageNode[];
    if (isSearching) {
      targetNodes = storageNodes.filter(n => {
        const nameMatch = n.name.toLowerCase().includes(normalizedQuery);
        if (nameMatch) return true;
        const contentMatch = !!n.content && n.content.toLowerCase().includes(normalizedQuery);
        if (contentMatch) return true;
        const tagMatch = !!n.tags && n.tags.some(t => t.toLowerCase().includes(normalizedQuery));
        return tagMatch;
      });
    } else {
      targetNodes = storageNodes.filter(n => (n.parentId ?? null) === currentFolderId);
    }

    for (let i = 0; i < targetNodes.length; i++) {
      const n = targetNodes[i];
      all++;
      if (n.type === 'file') {
        if (n.fileType === 'image') imgs++;
        else docs++;
      } else if (n.type === 'note') {
        nts++;
      }
    }
    return {
      All: all,
      Documents: docs,
      Images: imgs,
      Notes: nts,
    };
  }, [storageNodes, currentFolderId, isSearching, normalizedQuery]);

  // Folders for Move dialog (all vault folders so MoveNodeModal can build the complete hierarchical tree)
  const allVaultFolders = useMemo(() => {
    return storageNodes.filter(n => n.type === 'folder');
  }, [storageNodes]);

  // Breadcrumbs path
  const breadcrumbs = useMemo(() => {
    if (!currentFolderId) return [];
    const crumbs: { id: string | null; name: string }[] = [];
    let curr: string | null | undefined = currentFolderId;
    while (curr) {
      const node = folderNameMap.get(curr);
      if (node) {
        crumbs.unshift({ id: curr, name: node.name });
        curr = node.parentId;
      } else {
        break;
      }
    }
    crumbs.unshift({ id: null, name: 'Home' });
    return crumbs;
  }, [folderNameMap, currentFolderId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCreateFolder = useCallback(async (folderName: string) => {
    if (!user) return;
    const now = Date.now();
    const newDocRef = doc(collection(db, 'storage_nodes'));
    const folderId = newDocRef.id;

    const folderData: StorageNode = {
      id: folderId,
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

    const isWithSelection = isCreatingFolderWithSelection;
    setIsCreatingFolderWithSelection(false);

    safeWrite(
      () => setDoc(newDocRef, folderData),
      'storage_nodes',
      'set',
      folderData,
      folderId
    ).catch(handleSyncError);

    // If created with selection, immediately move all selected items into this new folder!
    if (isWithSelection && selectedIds.size > 0) {
      const idsToMove = Array.from(selectedIds);
      for (const id of idsToMove) {
        optimisticUpdateStorageNode(id, { parentId: folderId, updatedAt: now });
        safeUpdate(
          id,
          'storage_nodes',
          { parentId: folderId, updatedAt: now },
          () => updateDoc(doc(db, 'storage_nodes', id), { parentId: folderId, updatedAt: now })
        ).catch(handleSyncError);
      }
      setSelectionMode(false);
      setSelectedIds(new Set());
    }

    feedback.success();
  }, [
    user,
    currentFolderId,
    optimisticAddStorageNode,
    optimisticUpdateStorageNode,
    isCreatingFolderWithSelection,
    selectedIds,
  ]);

  const handleFileUpload = useCallback(async () => {
    if (!user) return;

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      let pickedFiles = res.assets;
      if (pickedFiles.length > 10) {
        Alert.alert(
          'Batch Upload Limit',
          `You selected ${pickedFiles.length} files. Uploading the first 10 files at once.`
        );
        pickedFiles = pickedFiles.slice(0, 10);
      }

      // Guarantee accurate file sizes even on Android content providers where asset.size is null/undefined
      const resolvedFiles = await Promise.all(
        pickedFiles.map(async (file) => {
          let resolvedSize = file.size;
          if (!resolvedSize || resolvedSize <= 0) {
            try {
              const info = await FileSystem.getInfoAsync(file.uri);
              if (info.exists && typeof (info as any).size === 'number') {
                resolvedSize = (info as any).size;
              }
            } catch (sizeErr) {
              console.warn('[NotesScreen] Failed to probe file size:', sizeErr);
            }
          }
          return {
            ...file,
            size: resolvedSize ?? undefined,
          };
        })
      );

      // ── Size thresholds ───────────────────────────────────────────────────────
      const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

      // Large non-PDF files (images/docx) can't be compressed here — block them.
      const largeNonPdf = resolvedFiles.filter(
        f => f.size != null && f.size > CLOUDINARY_MAX_BYTES &&
             !f.mimeType?.includes('pdf') && !f.name?.toLowerCase().endsWith('.pdf')
      );
      if (largeNonPdf.length > 0) {
        const names = largeNonPdf
          .map(f => `  • ${f.name || 'Unknown'} (${f.size ? (f.size / 1024 / 1024).toFixed(1) : '?'} MB)`)
          .join('\n');
        Alert.alert(
          '📁 File Too Large',
          `These files exceed the 10 MB upload limit and cannot be auto-compressed:\n\n${names}\n\nPlease resize the file and try again.`,
          [{ text: 'OK' }]
        );
        pickedFiles = resolvedFiles.filter(
          f => f.size == null || f.size <= CLOUDINARY_MAX_BYTES ||
               f.mimeType?.includes('pdf') || f.name?.toLowerCase().endsWith('.pdf')
        );
        if (pickedFiles.length === 0) return;
      } else {
        pickedFiles = resolvedFiles;
      }
      // ────────────────────────────────────────────────────────────────────

      setUploading(true);
      const total = pickedFiles.length;
      let successCount = 0;
      const failedItems: { name: string; reason: string }[] = [];

      for (let i = 0; i < total; i++) {
        const file = pickedFiles[i];
        const fileNumber = i + 1;

        setUploadProgress(0);
        setUploadStep('');
        setUploadSize((file.size ? (file.size / (1024 * 1024)).toFixed(1) : '1.0') + ' MB');
        setUploadFileName(
          total > 1
            ? `(${fileNumber}/${total}) ${file.name || 'Document'}`
            : (file.name || 'Document')
        );

        const mime = file.mimeType || 'application/octet-stream';
        const isPdf = mime.includes('pdf') || file.name?.toLowerCase().endsWith('.pdf');
        let ftype: 'pdf' | 'docx' | 'image' | 'other' = 'other';
        if (isPdf) ftype = 'pdf';
        else if (mime.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name || '')) ftype = 'image';
        else if (mime.includes('word') || /\.(doc|docx)$/i.test(file.name || '')) ftype = 'docx';

        let compressedTempUri: string | null = null;
        try {
          // ── Auto-compress large PDFs via iLovePDF before uploading ───────────
          let uploadUri  = file.uri;
          let uploadSize = file.size;

          const isLargePdf = isPdf && uploadSize != null && uploadSize > CLOUDINARY_MAX_BYTES;
          if (isLargePdf) {
            // Instant feedback — banner appears before compression even starts
            showLargePdfBanner(
              file.name || 'document.pdf',
              (uploadSize! / 1024 / 1024).toFixed(1)
            );
            setUploadStep('Compressing PDF...');
            try {
              // Stage 1: Recommended compression
              compressedTempUri = await compressPdfWithILovePDF(
                file.uri,
                file.name || 'document.pdf',
                (step) => setUploadStep(step),
                'recommended'
              );
              // Get size of compressed file
              let info = await FileSystem.getInfoAsync(compressedTempUri);
              let currentSize = (info as any).size ?? uploadSize ?? 0;

              // Stage 2: If still > 10 MB, auto-retry with 'extreme' compression
              if (currentSize > CLOUDINARY_MAX_BYTES) {
                console.log(
                  `[NotesScreen] PDF still ${(currentSize / 1024 / 1024).toFixed(1)} MB after recommended compression. Retrying with extreme...`
                );
                setUploadStep('Applying extreme compression...');
                await FileSystem.deleteAsync(compressedTempUri, { idempotent: true }).catch(() => {});

                compressedTempUri = await compressPdfWithILovePDF(
                  file.uri,
                  file.name || 'document.pdf',
                  (step) => setUploadStep(step),
                  'extreme'
                );
                info = await FileSystem.getInfoAsync(compressedTempUri);
                currentSize = (info as any).size ?? currentSize;
              }

              // Check if still exceeding limit after extreme
              if (currentSize > CLOUDINARY_MAX_BYTES) {
                throw new Error(
                  `File is ${(currentSize / 1024 / 1024).toFixed(1)} MB even after extreme compression (Cloudinary limit is 10.0 MB). Please split the PDF into smaller parts.`
                );
              }

              uploadUri  = compressedTempUri;
              uploadSize = currentSize;
              setUploadSize(`${(currentSize / 1024 / 1024).toFixed(1)} MB (compressed)`);
            } catch (compressErr: any) {
              console.warn('[NotesScreen] iLovePDF compression error:', compressErr.message);
              setUploadStep('');
              throw compressErr;
            }
            setUploadStep('');
          } else if (uploadSize != null && uploadSize > CLOUDINARY_MAX_BYTES) {
            throw new Error(
              `File is ${(uploadSize! / 1024 / 1024).toFixed(1)} MB, exceeding Cloudinary's 10.0 MB limit.`
            );
          }
          // ────────────────────────────────────────────────────────────────────

          const uploadRes = await uploadFileToCloudinary(
            uploadUri,
            mime,
            file.name,
            (p) => setUploadProgress(p),
            uploadSize
          );

          // Pre-cache local file into vault cache
          try {
            await cacheLocalFile(file.uri, uploadRes.url, file.name);
          } catch (cacheErr) {
            console.warn('[NotesScreen] Pre-cache non-fatal warning:', cacheErr);
          }

          const now = Date.now();
          const docPayload: StorageNode = {
            id: `file_temp_${now}_${i}`,
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

          // 0ms Optimistic UI update immediately as each file finishes
          optimisticAddStorageNode(docPayload);
          feedback.tap();
          successCount++;

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
        } catch (fileErr: any) {
          console.error(`[NotesScreen] Upload error for ${file.name}:`, fileErr);
          failedItems.push({
            name: file.name || `File ${fileNumber}`,
            reason: fileErr?.message || 'Unknown upload error',
          });
        } finally {
          // Clean up temp compressed file if created
          if (compressedTempUri) {
            FileSystem.deleteAsync(compressedTempUri, { idempotent: true }).catch(() => {});
          }
        }
      }

      if (successCount > 0) {
        feedback.success();
      }

      if (failedItems.length > 0) {
        const failureDetails = failedItems
          .map((item) => `• ${item.name}:\n  ${item.reason}`)
          .join('\n\n');
        Alert.alert(
          'Upload Notice',
          `Successfully uploaded ${successCount} of ${total} files.\n\nFailed:\n${failureDetails}`
        );
      }
    } catch (e: any) {
      console.error('[NotesScreen] Batch upload error:', e);
      Alert.alert('Upload Issue', e?.message || 'There was an error selecting files.');
    } finally {
      setUploading(false);
      setUploadFileName('');
      setUploadProgress(0);
      setUploadStep('');
    }
  }, [user, currentFolderId, optimisticAddStorageNode]);

  // Route Param Listener for upload action
  useEffect(() => {
    if (route.params?.openUpload) {
      handleFileUpload();
    }
  }, [route.params?.openUpload, route.params?.timestamp, handleFileUpload]);

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

  const handleBatchNewFolderOpen = useCallback(() => {
    if (selectedIds.size === 0) return;
    setIsCreatingFolderWithSelection(true);
    setShowNewFolder(true);
  }, [selectedIds.size]);

  const handleExitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setIsCreatingFolderWithSelection(false);
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
      if (item.type === 'folder') {
        setCurrentFolderId(item.id!);
        if (isSearching) {
          setRawSearchQuery('');
        }
      }
      else if (item.type === 'note') setEditorNote(item);
      else if (item.type === 'file') setViewerNode(item);
    }
  }, [selectionMode, isSearching]);

  const handleRowLongPress = useCallback((item: StorageNode, anchor?: { pageX: number; pageY: number }) => {
    if (selectionMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id!)) next.delete(item.id!);
        else next.add(item.id!);
        return next;
      });
    } else {
      feedback.commit();
      setContextMenuAnchor(anchor ? { x: anchor.pageX, y: anchor.pageY } : null);
      setContextMenuNode(item);
    }
  }, [selectionMode]);

  const handleRowMenuPress = useCallback((item: StorageNode, anchor?: { pageX: number; pageY: number }) => {
    feedback.tap();
    setContextMenuAnchor(anchor ? { x: anchor.pageX, y: anchor.pageY } : null);
    setContextMenuNode(item);
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
        uploadSize={uploadStep || uploadSize}
        colors={colors}
        isDark={isDark}
        compact={isInsideFolder}
        onPress={handleRowPress}
        onLongPress={handleRowLongPress}
        onMenuPress={handleRowMenuPress}
        onPin={handlePin}
        onDelete={handleDelete}
      />
    );
  }, [
    selectedIds,
    selectionMode,
    uploading,
    uploadProgress,
    uploadSize,
    uploadStep,
    colors,
    isDark,
    isInsideFolder,
    handleRowPress,
    handleRowLongPress,
    handleRowMenuPress,
    handlePin,
    handleDelete,
  ]);

  const handleBackFolder = useCallback(() => {
    if (isSearching) {
      setRawSearchQuery('');
      return;
    }
    if (breadcrumbs.length > 2) {
      setCurrentFolderId(breadcrumbs[breadcrumbs.length - 2].id);
    } else {
      setCurrentFolderId(null);
    }
  }, [breadcrumbs, isSearching]);

  const keyExtractor = useCallback((item: any) => item.id!, []);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={[styles.vaultHeader, breadcrumbs.length > 1 && !isSearching && { paddingBottom: SPACE.sm }]}>
        <View style={styles.vaultHeaderLeft}>
          {selectionMode ? (
            <AnimatedPressable
              variant="button"
              haptic="light"
              style={styles.vaultHeaderBtn}
              onPress={handleExitSelection}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.vaultHeaderCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </AnimatedPressable>
          ) : currentFolderId || isSearching ? (
            <AnimatedPressable
              variant="button"
              haptic="light"
              style={styles.vaultHeaderBtn}
              onPress={isSearching ? () => setRawSearchQuery('') : handleBackFolder}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.accentPrimary} />
            </AnimatedPressable>
          ) : (
            <View style={{ width: 28 }} />
          )}
        </View>

        <Text style={styles.vaultHeaderTitle} numberOfLines={1}>
          {selectionMode
            ? selectedIds.size > 0
              ? `${selectedIds.size} Selected`
              : 'Select Items'
            : isSearching
            ? 'Vault Search'
            : currentFolderId
            ? breadcrumbs[breadcrumbs.length - 1]?.name || 'Vault'
            : 'Vault'}
        </Text>

        <View style={styles.vaultHeaderRight}>
          {selectionMode ? (
            <AnimatedPressable
              variant="button"
              haptic="light"
              style={styles.vaultHeaderDoneBtn}
              onPress={handleExitSelection}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.vaultHeaderDoneText, { color: colors.accentPrimary }]}>Done</Text>
            </AnimatedPressable>
          ) : (
            <>
              {currentFolderId && !isSearching && (
                <AnimatedPressable
                  variant="button"
                  haptic="light"
                  style={styles.vaultHeaderBtn}
                  onPress={() => {
                    setIsFolderSearchOpen(prev => !prev);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={isFolderSearchOpen ? "close-circle" : "search-outline"}
                    size={20}
                    color={isFolderSearchOpen ? colors.accentPrimary : colors.textSecondary}
                  />
                </AnimatedPressable>
              )}

              {/* Sort Menu Button */}
              <AnimatedPressable
                variant="button"
                haptic="light"
                style={styles.vaultHeaderBtn}
                onPress={() => {
                  setShowSortMenu(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="swap-vertical"
                  size={20}
                  color={currentSortMode !== 'newest' ? colors.accentPrimary : colors.textSecondary}
                />
              </AnimatedPressable>

              {/* Multi-Select Trigger Button */}
              <AnimatedPressable
                variant="button"
                haptic="light"
                style={styles.vaultHeaderBtn}
                onPress={() => {
                  setSelectionMode(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={21}
                  color={colors.textSecondary}
                />
              </AnimatedPressable>
            </>
          )}
        </View>
      </View>

      {/* Breadcrumb Trail (when inside folders and NOT searching) */}
      {breadcrumbs.length > 1 && !isSearching && (
        <View style={styles.breadcrumbBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.breadcrumbContent}
          >
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id || 'root'}>
                  {idx > 0 && (
                    <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                  )}
                  <AnimatedPressable
                    variant="subtle"
                    haptic="selection"
                    disabled={isLast}
                    onPress={() => {
                      setCurrentFolderId(crumb.id);
                    }}
                    style={[styles.crumbPill, isLast && styles.crumbPillActive]}
                  >
                    <Text
                      style={[
                        styles.crumbText,
                        { color: isLast ? colors.accentPrimary : colors.textSecondary },
                        isLast && { fontFamily: FONT_FAMILY.bold },
                      ]}
                      numberOfLines={1}
                    >
                      {crumb.name}
                    </Text>
                  </AnimatedPressable>
                </React.Fragment>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Storage Usage Bar */}
      {!currentFolderId && !isSearching && (
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
      <View
        style={[
          styles.toolbarWrap,
          {
            borderBottomColor: colors.border,
            paddingTop: isInsideFolder && !isFolderSearchOpen ? 2 : 0,
            paddingBottom: isInsideFolder && !isFolderSearchOpen ? 8 : SPACE.md,
          },
        ]}
      >
        {(!isInsideFolder || isFolderSearchOpen) && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[
              styles.searchBox,
              {
                backgroundColor: isDark ? '#1c1c1e' : '#FFFFFF',
                borderColor: colors.border,
                marginBottom: isInsideFolder ? 8 : SPACE.md,
              },
            ]}
          >
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder={isInsideFolder ? "Search in folder..." : "Search files and notes..."}
              placeholderTextColor={colors.textMuted}
              value={rawSearchQuery}
              onChangeText={setRawSearchQuery}
              autoFocus={isFolderSearchOpen}
            />
            {rawSearchQuery.length > 0 && (
              <AnimatedPressable
                variant="subtle"
                haptic="light"
                onPress={() => setRawSearchQuery('')}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </AnimatedPressable>
            )}
          </Animated.View>
        )}

        <CategoryFilterTabs
          activeCategory={filterMode}
          categoryCounts={categoryCounts}
          onSelectCategory={setFilterMode}
          colors={colors}
          isDark={isDark}
          compact={isInsideFolder}
        />
      </View>

      {/* ── Large-file instant banner — slides in the moment a >10 MB PDF is picked ── */}
      {largePdfBanner && (
        <Animated.View
          entering={SlideInDown.springify().damping(18).stiffness(200)}
          exiting={FadeOut.duration(300)}
          style={[styles.largePdfBanner, { backgroundColor: isDark ? '#1A1D2E' : '#EEF2FF' }]}
        >
          <Ionicons name="cloud-upload-outline" size={17} color={colors.accentPrimary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.largePdfBannerTitle, { color: colors.accentPrimary }]}>
              Large file detected ({largePdfBanner.sizeMb} MB) — auto-compressing
            </Text>
            <Text style={[styles.largePdfBannerSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {largePdfBanner.name}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Main Virtualized List */}
      <FlashList
        data={
          uploading
            ? [{ id: 'uploading-temp', name: uploadFileName || 'Uploading...', type: 'file', uploading: true } as any, ...currentItems]
            : currentItems
        }
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingHorizontal: SPACE.md, paddingBottom: selectionMode ? 175 : 120 }}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title={isSearching ? "No matching files" : "Empty folder"}
            subtitle={
              isSearching
                ? `No files or notes found matching "${rawSearchQuery}".`
                : "Add notes, upload files, or create folders here."
            }
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
        onNewFolderWithSelection={handleBatchNewFolderOpen}
        onBatchDelete={handleBatchDelete}
        onCancel={handleExitSelection}
        colors={colors}
        isDark={isDark}
      />

      {/* Speed Dial Floating Action Button */}
      <SpeedDialFab
        visible={!selectionMode}
        onUploadFile={handleFileUpload}
        onNewNote={() => setEditorNote('new')}
        onNewFolder={() => setShowNewFolder(true)}
        colors={colors}
        isDark={isDark}
      />

      {/* Sleek Floating Options Popover Menu */}
      <StorageContextMenuModal
        visible={!!contextMenuNode}
        item={contextMenuNode}
        anchorPosition={contextMenuAnchor}
        onClose={() => {
          setContextMenuNode(null);
          setContextMenuAnchor(null);
        }}
        onPin={handlePin}
        onRename={(node) => setRenameTarget(node)}
        onMove={(node) => setMoveTarget(node)}
        onDelete={handleDelete}
        onSelect={(node) => {
          setSelectionMode(true);
          setSelectedIds(new Set([node.id!]));
        }}
      />

      {/* New Folder Modal */}
      <NewFolderModal
        visible={showNewFolder}
        title={isCreatingFolderWithSelection ? "New Folder with Selection" : "New Folder"}
        subtitle={
          isCreatingFolderWithSelection
            ? `Move ${selectedIds.size} selected item${selectedIds.size > 1 ? 's' : ''} into new folder`
            : undefined
        }
        submitText={isCreatingFolderWithSelection ? "Create & Move" : "Create"}
        onClose={() => {
          setShowNewFolder(false);
          setIsCreatingFolderWithSelection(false);
        }}
        onCreate={handleCreateFolder}
        colors={colors}
        isDark={isDark}
      />

      {/* iOS Sort Menu Modal */}
      <SortMenuModal
        visible={showSortMenu}
        activeSort={currentSortMode}
        onSelectSort={setCurrentSortMode}
        onClose={() => setShowSortMenu(false)}
        onSelectMultiple={() => {
          setShowSortMenu(false);
          setSelectionMode(true);
        }}
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
        selectedIds={selectedIds}
        folders={allVaultFolders}
        currentFolderId={currentFolderId}
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
        <Suspense fallback={null}>
          <NoteEditorModal
            note={editorNote === 'new' ? null : editorNote}
            userId={user.uid}
            parentId={currentFolderId}
            onClose={() => setEditorNote(null)}
          />
        </Suspense>
      )}

      {/* Vault Document Viewer */}
      {viewerNode && (
        <Suspense fallback={null}>
          <VaultDocumentViewer node={viewerNode} onClose={() => setViewerNode(null)} />
        </Suspense>
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
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
    backgroundColor: colors.background,
  },
  vaultHeaderLeft: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  vaultHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  vaultHeaderRight: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  vaultHeaderBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largePdfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACE.md,
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    overflow: 'hidden',
  },
  largePdfBannerTitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  largePdfBannerSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    marginTop: 1,
  },
  vaultHeaderCancelText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
  },
  vaultHeaderDoneBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)',
  },
  vaultHeaderDoneText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
  },

  breadcrumbBar: {
    paddingTop: SPACE.xs,
    paddingBottom: SPACE.md,
  },
  breadcrumbContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    gap: 6,
  },
  crumbPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
  },
  crumbPillActive: {
    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)',
  },
  crumbText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
  },

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
  list: { padding: SPACE.sm, paddingBottom: 110 },
});
