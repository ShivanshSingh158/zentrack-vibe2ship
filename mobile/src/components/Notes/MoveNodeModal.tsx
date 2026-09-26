/**
 * MoveNodeModal.tsx — ZenTrack Mobile
 *
 * Hierarchical folder picker modal for moving files, notes, or folders.
 * Features:
 *   1. Full tree hierarchy (Root -> Main Folders -> Subfolders -> Units)
 *   2. Proportional depth indentation with tree guide connectors
 *   3. Explicit breadcrumb path subtitles on EVERY folder (e.g. "Home > Semester 5 > Electrical vehicles")
 *   4. Distinct level-based icon coloring (Purple for Root, Amber for Main, Blue for Subfolders, Emerald for Units)
 *   5. Collapsible/Expandable branches with quick toggle
 *   6. Real-time folder search & path filtering
 *   7. Cycle-safe guard preventing a folder from being moved into itself or its descendants
 *   8. "Current location" badge marking where the item already lives
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StorageNode } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

export interface FolderTreeNode {
  id: string | null; // null for Vault Root (Home)
  name: string;
  parentId: string | null;
  depth: number; // 0 for Root, 1 for Main folder, 2 for Subfolder, 3 for Sub-subfolder...
  path: string; // e.g. "Home > Semester 5 > Electrical vehicles"
  hasChildren: boolean;
  subfolderCount: number;
  isCurrentLocation: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  children: FolderTreeNode[];
}

interface MoveNodeModalProps {
  node: StorageNode | null;
  batchCount?: number;
  selectedIds?: Set<string>;
  folders: StorageNode[];
  currentFolderId?: string | null;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
  colors: any;
  isDark: boolean;
}

export const MoveNodeModal = React.memo(function MoveNodeModal({
  node,
  batchCount = 0,
  selectedIds,
  folders,
  currentFolderId = null,
  onClose,
  onMove,
  colors,
  isDark,
}: MoveNodeModalProps) {
  const isBatch = !node && batchCount > 0;
  if (!node && !isBatch) return null;

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const title = isBatch
    ? `Move ${batchCount} item${batchCount > 1 ? 's' : ''}`
    : `Move "${node?.name}"`;

  // 1. Map of all folders by ID
  const folderMap = useMemo(() => {
    const map = new Map<string, StorageNode>();
    for (const f of folders) {
      if (f.id) map.set(f.id, f);
    }
    return map;
  }, [folders]);

  // 2. Identify the current parent folder of the item being moved
  const currentParentId = useMemo(() => {
    if (node) return node.parentId ?? null;
    return currentFolderId ?? null;
  }, [node, currentFolderId]);

  // 3. Find disabled folder IDs to prevent moving into itself or its descendants (cyclic loops)
  const disabledFolderInfo = useMemo(() => {
    const disabledIds = new Set<string>();
    const reasons = new Map<string, string>();

    const markDisabled = (id: string, isRootTarget: boolean) => {
      disabledIds.add(id);
      reasons.set(id, isRootTarget ? 'Cannot move into itself' : 'Subfolder of item');
      for (const f of folders) {
        if (f.id && f.parentId === id && !disabledIds.has(f.id)) {
          markDisabled(f.id, false);
        }
      }
    };

    if (node && node.type === 'folder' && node.id) {
      markDisabled(node.id, true);
    }

    if (isBatch && selectedIds) {
      for (const id of selectedIds) {
        const item = folderMap.get(id);
        if (item && item.type === 'folder') {
          markDisabled(id, true);
        }
      }
    }

    return { disabledIds, reasons };
  }, [node, isBatch, selectedIds, folders, folderMap]);

  // 4. Build children map (parentId -> child folders)
  const childrenMap = useMemo(() => {
    const map = new Map<string | null, StorageNode[]>();
    for (const f of folders) {
      // If parent does not exist in folderMap, treat as top-level (null)
      const pid = f.parentId && folderMap.has(f.parentId) ? f.parentId : null;
      if (!map.has(pid)) {
        map.set(pid, []);
      }
      map.get(pid)!.push(f);
    }
    // Sort each children list alphabetically
    for (const list of map.values()) {
      list.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );
    }
    return map;
  }, [folders, folderMap]);

  // 5. Construct hierarchical tree (Root -> Main -> Sub -> Sub-sub)
  const treeData = useMemo(() => {
    const buildSubtree = (
      folder: StorageNode,
      depth: number,
      parentPath: string
    ): FolderTreeNode => {
      const currentPath = `${parentPath} > ${folder.name}`;
      const childrenNodes = childrenMap.get(folder.id!) || [];
      const hasChildren = childrenNodes.length > 0;
      const isCurrent = folder.id === currentParentId;
      const isDisabled = disabledFolderInfo.disabledIds.has(folder.id!);

      const children = childrenNodes.map((child) =>
        buildSubtree(child, depth + 1, currentPath)
      );

      return {
        id: folder.id!,
        name: folder.name,
        parentId: folder.parentId ?? null,
        depth,
        path: currentPath,
        hasChildren,
        subfolderCount: childrenNodes.length,
        isCurrentLocation: isCurrent,
        isDisabled,
        disabledReason: disabledFolderInfo.reasons.get(folder.id!),
        children,
      };
    };

    const topLevelFolders = childrenMap.get(null) || [];
    const rootChildren = topLevelFolders.map((f) => buildSubtree(f, 1, 'Home'));

    const rootNode: FolderTreeNode = {
      id: null,
      name: 'Vault Root (Home)',
      parentId: null,
      depth: 0,
      path: 'Vault Root (Home)',
      hasChildren: rootChildren.length > 0,
      subfolderCount: rootChildren.length,
      isCurrentLocation: currentParentId === null,
      isDisabled: false,
      children: rootChildren,
    };

    return rootNode;
  }, [childrenMap, currentParentId, disabledFolderInfo]);

  // 6. Toggle collapse state of a folder branch
  const toggleCollapse = useCallback((id: string) => {
    feedback.tap();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 7. Flatten tree for rendering based on search and collapsed state
  const visibleTreeItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // If searching, return flat matches with their full path displayed
    if (query) {
      const allFlat: FolderTreeNode[] = [];
      const collect = (n: FolderTreeNode) => {
        allFlat.push(n);
        for (const child of n.children) collect(child);
      };
      collect(treeData);

      return allFlat.filter((item) => {
        if (item.id === null) {
          return 'vault root home'.includes(query);
        }
        return (
          item.name.toLowerCase().includes(query) ||
          item.path.toLowerCase().includes(query)
        );
      });
    }

    // Default: Depth-first traversal respecting collapsed states
    const result: FolderTreeNode[] = [];
    const traverse = (node: FolderTreeNode) => {
      result.push(node);
      if (node.id && collapsedIds.has(node.id)) {
        return; // Children hidden
      }
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(treeData);
    return result;
  }, [treeData, collapsedIds, searchQuery]);

  const handleSelectFolder = (folderId: string | null, isCurrentLocation: boolean, isDisabled: boolean) => {
    if (isDisabled || isCurrentLocation) {
      feedback.selectionChange();
      return;
    }
    feedback.commit();
    onMove(folderId);
    onClose();
  };

  const getFolderTheme = (depth: number) => {
    if (depth === 0) {
      return {
        bg: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)',
        color: colors.accentPrimary,
        icon: 'home' as const,
        label: 'Root',
      };
    }
    if (depth === 1) {
      return {
        bg: isDark ? 'rgba(245,158,11,0.16)' : 'rgba(217,119,6,0.12)',
        color: '#F59E0B',
        icon: 'folder' as const,
        label: 'Main Folder',
      };
    }
    if (depth === 2) {
      return {
        bg: isDark ? 'rgba(10,132,255,0.16)' : 'rgba(2,132,199,0.12)',
        color: isDark ? '#0A84FF' : '#0284C7',
        icon: 'folder-open' as const,
        label: 'Subfolder',
      };
    }
    return {
      bg: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(5,150,105,0.12)',
      color: '#10B981',
      icon: 'folder' as const,
      label: 'Subfolder',
    };
  };

  return (
    <Modal visible={!!node || isBatch} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {title}
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                Select destination folder in Vault:
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.closeIconBtn,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
              ]}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search / Filter Input */}
          <View
            style={[
              styles.searchBarWrap,
              {
                backgroundColor: isDark ? '#141418' : '#F4F3F8',
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="search" size={15} color={colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search folder by name or path..."
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && Platform.OS !== 'ios' && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Folder Hierarchy List */}
          <ScrollView
            style={styles.folderList}
            contentContainerStyle={styles.folderListContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {visibleTreeItems.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="folder-open-outline" size={32} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No folder found matching "{searchQuery}"
                </Text>
              </View>
            ) : (
              visibleTreeItems.map((item) => {
                const theme = getFolderTheme(item.depth);
                const isCollapsed = item.id ? collapsedIds.has(item.id) : false;
                const indentPadding = Math.min(item.depth * 20, 68);

                return (
                  <TouchableOpacity
                    key={item.id ?? 'vault_root'}
                    style={[
                      styles.treeRow,
                      {
                        borderBottomColor: colors.border,
                        paddingLeft: SPACE.sm + indentPadding,
                      },
                      item.isCurrentLocation && {
                        backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.04)',
                      },
                      item.isDisabled && styles.rowDisabled,
                    ]}
                    onPress={() => handleSelectFolder(item.id, item.isCurrentLocation, item.isDisabled)}
                    activeOpacity={item.isDisabled || item.isCurrentLocation ? 1 : 0.65}
                  >
                    {/* Tree connector branch icon for subfolders */}
                    {item.depth > 0 && (
                      <View style={styles.treeConnector}>
                        <Ionicons
                          name="return-down-forward"
                          size={13}
                          color={isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.25)'}
                        />
                      </View>
                    )}

                    {/* Expand/Collapse Chevron (if folder has children) */}
                    {item.hasChildren && !searchQuery ? (
                      <TouchableOpacity
                        style={styles.chevronBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          if (item.id) toggleCollapse(item.id);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                          size={14}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.chevronPlaceholder} />
                    )}

                    {/* Folder Icon with Level Coloring */}
                    <View style={[styles.folderIcon, { backgroundColor: theme.bg }]}>
                      <Ionicons name={theme.icon} size={16} color={theme.color} />
                    </View>

                    {/* Folder Metadata: Name + Full Breadcrumb Path */}
                    <View style={styles.metaContainer}>
                      <View style={styles.titleLine}>
                        <Text
                          style={[
                            styles.folderName,
                            { color: colors.textPrimary },
                            item.depth === 1 && styles.mainFolderName,
                            item.isDisabled && { color: colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>

                        {/* Subfolder counter pill */}
                        {item.subfolderCount > 0 && (
                          <View
                            style={[
                              styles.subfolderPill,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
                            ]}
                          >
                            <Text style={[styles.subfolderPillText, { color: colors.textMuted }]}>
                              {item.subfolderCount} sub
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Explicit Breadcrumb Path Subtitle */}
                      <Text
                        style={[
                          styles.pathSubtitle,
                          { color: colors.textMuted },
                          item.depth === 1 && { color: isDark ? '#D1D5DB' : '#4B5563' },
                        ]}
                        numberOfLines={1}
                      >
                        {item.depth === 0 ? 'Root Directory' : item.path}
                      </Text>
                    </View>

                    {/* Status Badges on the Right */}
                    {item.isCurrentLocation ? (
                      <View
                        style={[
                          styles.currentBadge,
                          {
                            backgroundColor: isDark ? 'rgba(165,153,255,0.16)' : 'rgba(108,92,231,0.12)',
                            borderColor: isDark ? 'rgba(165,153,255,0.30)' : 'rgba(108,92,231,0.25)',
                          },
                        ]}
                      >
                        <Ionicons name="checkmark-circle" size={12} color={colors.accentPrimary} />
                        <Text style={[styles.currentBadgeText, { color: colors.accentPrimary }]}>
                          Current
                        </Text>
                      </View>
                    ) : item.isDisabled ? (
                      <View
                        style={[
                          styles.disabledBadge,
                          { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)' },
                        ]}
                      >
                        <Text style={styles.disabledBadgeText}>
                          {item.disabledReason || 'Invalid'}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.actionArrow}>
                        <Ionicons
                          name="arrow-forward-circle-outline"
                          size={18}
                          color={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.20)'}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Cancel Button */}
          <TouchableOpacity
            style={[
              styles.btnCancel,
              { backgroundColor: isDark ? '#141418' : '#ECEBF2' },
            ]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnTextCancel, { color: colors.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: SPACE.md,
  },
  modalSheet: {
    borderRadius: RADIUS.xl,
    padding: SPACE.lg,
    borderWidth: 1,
    maxHeight: '84%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACE.xs,
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: SPACE.sm,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base + 2,
    lineHeight: 22,
  },
  modalSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    marginTop: 2,
  },
  closeIconBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginVertical: SPACE.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_FAMILY.body,
    padding: 0,
  },
  folderList: {
    maxHeight: 360,
    marginTop: SPACE.xs,
    marginBottom: SPACE.xs,
  },
  folderListContent: {
    paddingBottom: 4,
  },
  treeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  rowDisabled: {
    opacity: 0.42,
  },
  treeConnector: {
    marginRight: -4,
    width: 14,
    alignItems: 'center',
  },
  chevronBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronPlaceholder: {
    width: 8,
  },
  folderIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  folderName: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 14,
    flexShrink: 1,
  },
  mainFolderName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14.5,
  },
  subfolderPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  subfolderPillText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.medium,
  },
  pathSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    marginTop: 1,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  currentBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
  },
  disabledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  disabledBadgeText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: '#EF4444',
  },
  actionArrow: {
    paddingLeft: 4,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.xl,
    gap: SPACE.xs,
  },
  emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    textAlign: 'center',
  },
  btnCancel: {
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: SPACE.xs,
  },
  btnTextCancel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
  },
});

export default MoveNodeModal;
