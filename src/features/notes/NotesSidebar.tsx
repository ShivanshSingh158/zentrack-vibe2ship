import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FolderOpen, Star, FileText, Tag, Plus, HardDrive, ChevronRight, ChevronDown, FolderPlus, PanelLeftClose } from 'lucide-react';
import type { StorageNode } from '../../types';

interface NotesSidebarProps {
  nodes: StorageNode[];
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  isPinnedFilterActive: boolean;
  setIsPinnedFilterActive: (active: boolean) => void;
  onNewFolder: () => void;
  onCollapse?: () => void;
}

interface FolderTreeNodeProps {
  folder: StorageNode;
  level: number;
  currentFolderId: string | null;
  expandedFolderIds: Set<string>;
  onToggleExpand: (folderId: string, e: React.MouseEvent) => void;
  onSelectFolder: (folder: StorageNode) => void;
  allFolders: StorageNode[];
  allNodes: StorageNode[];
}

const FolderTreeNode: React.FC<FolderTreeNodeProps> = ({
  folder,
  level,
  currentFolderId,
  expandedFolderIds,
  onToggleExpand,
  onSelectFolder,
  allFolders,
  allNodes,
}) => {
  const subfolders = useMemo(
    () => allFolders.filter(f => f.parentId === folder.id),
    [allFolders, folder.id]
  );
  const hasSubfolders = subfolders.length > 0;
  const isExpanded = expandedFolderIds.has(folder.id!);
  const isSelected = currentFolderId === folder.id;

  const totalCount = allNodes.filter(n => n.parentId === folder.id).length;

  return (
    <div className="folder-tree-node">
      <div
        className={`sidebar-nav-item folder ${isSelected ? 'active' : ''} ${level > 0 ? 'subfolder' : ''}`}
        style={{ paddingLeft: `${0.35 + level * 0.9}rem` }}
        onClick={() => onSelectFolder(folder)}
        title={folder.name}
      >
        {/* Expand / Collapse Chevron */}
        {hasSubfolders ? (
          <button
            type="button"
            className={`folder-expand-btn ${isExpanded ? 'expanded' : ''}`}
            onClick={(e) => onToggleExpand(folder.id!, e)}
            title={isExpanded ? 'Collapse subfolders' : 'Expand subfolders'}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRight size={12} />
            </motion.span>
          </button>
        ) : (
          <span className="folder-expand-spacer" />
        )}

        {/* Folder Icon */}
        {isExpanded && hasSubfolders ? (
          <FolderOpen size={14} className="nav-item-icon folder-icon open" />
        ) : (
          <Folder size={14} className="nav-item-icon folder-icon" />
        )}

        {/* Folder Name */}
        <span className="nav-item-label">{folder.name}</span>

        {/* Item count chip */}
        <span className="nav-item-count" title={`${totalCount} items`}>
          {totalCount}
        </span>
      </div>

      {/* Subfolder list below parent folder when expanded */}
      <AnimatePresence initial={false}>
        {hasSubfolders && isExpanded && (
          <motion.div
            key={`subfolders-${folder.id}`}
            className="folder-subfolders-tree"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {subfolders.map(sub => (
              <FolderTreeNode
                key={sub.id}
                folder={sub}
                level={level + 1}
                currentFolderId={currentFolderId}
                expandedFolderIds={expandedFolderIds}
                onToggleExpand={onToggleExpand}
                onSelectFolder={onSelectFolder}
                allFolders={allFolders}
                allNodes={allNodes}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
  nodes,
  currentFolderId,
  setCurrentFolderId,
  selectedTag,
  setSelectedTag,
  isPinnedFilterActive,
  setIsPinnedFilterActive,
  onNewFolder,
  onCollapse,
}) => {
  const allFolders = useMemo(() => nodes.filter(n => n.type === 'folder'), [nodes]);
  const allDocs = useMemo(() => nodes.filter(n => n.type !== 'folder'), [nodes]);
  const pinnedCount = allDocs.filter(n => n.isPinned).length;

  // Root folders: folders with no parentId OR whose parentId is not found among allFolders
  const rootFolders = useMemo(() => {
    const folderIdSet = new Set(allFolders.map(f => f.id));
    return allFolders.filter(f => !f.parentId || !folderIdSet.has(f.parentId));
  }, [allFolders]);

  // Set of expanded folder IDs
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());

  // Auto-expand ancestors of active folder
  useEffect(() => {
    if (!currentFolderId) return;
    const toExpand: string[] = [];
    let curr = allFolders.find(f => f.id === currentFolderId);
    while (curr && curr.parentId) {
      toExpand.push(curr.parentId);
      curr = allFolders.find(f => f.id === curr!.parentId);
    }
    if (toExpand.length > 0) {
      setExpandedFolderIds(prev => {
        const next = new Set(prev);
        let changed = false;
        toExpand.forEach(id => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [currentFolderId, allFolders]);

  const isDescendantOf = (childId: string | null, parentId: string): boolean => {
    if (!childId) return false;
    let curr = allFolders.find(f => f.id === childId);
    while (curr && curr.parentId) {
      if (curr.parentId === parentId) return true;
      curr = allFolders.find(f => f.id === curr.parentId);
    }
    return false;
  };

  const handleToggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
        if (currentFolderId === folderId || isDescendantOf(currentFolderId, folderId)) {
          setCurrentFolderId(null);
        }
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleSelectFolder = (folder: StorageNode) => {
    setIsPinnedFilterActive(false);
    setSelectedTag(null);

    const hasSubfolders = allFolders.some(f => f.parentId === folder.id);
    const isExpanded = expandedFolderIds.has(folder.id!);
    const isSelected = currentFolderId === folder.id;

    if (hasSubfolders) {
      if (isExpanded) {
        // Folder is currently open -> CLOSE it on click!
        setExpandedFolderIds(prev => {
          const next = new Set(prev);
          next.delete(folder.id!);
          return next;
        });
        // Deselect if it or one of its descendants was active
        if (isSelected || isDescendantOf(currentFolderId, folder.id!)) {
          setCurrentFolderId(null);
        }
      } else {
        // Folder is currently closed -> OPEN it on click and select it!
        setExpandedFolderIds(prev => new Set(prev).add(folder.id!));
        setCurrentFolderId(folder.id!);
      }
    } else {
      // Leaf folder without subfolders: toggle selection
      setCurrentFolderId(isSelected ? null : folder.id!);
    }
  };

  // Compute all tags
  const tagsMap = React.useMemo(() => {
    const map = new Map<string, number>();
    allDocs.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach(t => map.set(t, (map.get(t) || 0) + 1));
      }
      // Also extract #tag from note content
      if (note.content) {
        const matches = note.content.match(/#([a-zA-Z0-9_\-]+)/g);
        if (matches) {
          matches.forEach(m => {
            const clean = m.replace('#', '').toLowerCase();
            map.set(clean, (map.get(clean) || 0) + 1);
          });
        }
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [allDocs]);

  // 25 GB Total Storage Limit
  const TOTAL_STORAGE_BYTES = 25 * 1024 * 1024 * 1024;

  // Compute total storage size
  const totalBytes = React.useMemo(() => {
    return nodes.reduce((acc, n) => acc + (n.size || 0), 0);
  }, [nodes]);

  const storageFormatted = React.useMemo(() => {
    if (totalBytes >= 1024 * 1024 * 1024) {
      return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  }, [totalBytes]);

  const storagePercent = Math.min(100, Math.max(totalBytes > 0 ? 1 : 0, (totalBytes / TOTAL_STORAGE_BYTES) * 100));

  const sidebarRef = React.useRef<HTMLElement>(null);

  // Native non-passive wheel isolation for Vault sidebar mouse wheel scrolling
  React.useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 28;
      else if (e.deltaMode === 2) delta *= el.clientHeight;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;

      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollBy({ top: delta, behavior: 'auto' });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <aside className="notes-left-sidebar" ref={sidebarRef}>
      {/* ── QUICK NAV SHELF ── */}
      <div className="notes-sidebar-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">VAULT</span>
          {onCollapse && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onCollapse}
              title="Collapse Vault Sidebar"
            >
              <PanelLeftClose size={13} />
            </button>
          )}
        </div>
        <div className="sidebar-nav-list">
          {/* All Notes */}
          <button
            type="button"
            className={`sidebar-nav-item ${!isPinnedFilterActive && !selectedTag && currentFolderId === null ? 'active' : ''}`}
            onClick={() => {
              setIsPinnedFilterActive(false);
              setSelectedTag(null);
              setCurrentFolderId(null);
            }}
          >
            <FileText size={14} className="nav-item-icon all" />
            <span className="nav-item-label">All Documents</span>
            <span className="nav-item-count">{allDocs.length}</span>
          </button>

          {/* Pinned Notes */}
          <button
            type="button"
            className={`sidebar-nav-item ${isPinnedFilterActive ? 'active' : ''}`}
            onClick={() => {
              setIsPinnedFilterActive(true);
              setSelectedTag(null);
            }}
          >
            <Star size={14} className="nav-item-icon pinned" />
            <span className="nav-item-label">Pinned Notes</span>
            <span className="nav-item-count">{pinnedCount}</span>
          </button>
        </div>
      </div>

      {/* ── FOLDERS HIERARCHY ── */}
      <div className="notes-sidebar-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">FOLDERS</span>
          <button
            type="button"
            className="sidebar-add-folder-btn"
            onClick={onNewFolder}
            title="Create New Folder"
          >
            <Plus size={13} />
          </button>
        </div>

        <div className="sidebar-nav-list">
          {rootFolders.length === 0 ? (
            <span className="sidebar-empty-hint">No folders yet</span>
          ) : (
            rootFolders.map(folder => (
              <FolderTreeNode
                key={folder.id}
                folder={folder}
                level={0}
                currentFolderId={currentFolderId}
                expandedFolderIds={expandedFolderIds}
                onToggleExpand={handleToggleExpand}
                onSelectFolder={handleSelectFolder}
                allFolders={allFolders}
                allNodes={nodes}
              />
            ))
          )}
        </div>
      </div>

      {/* ── TAG CLOUD ── */}
      {tagsMap.length > 0 && (
        <div className="notes-sidebar-section">
          <span className="sidebar-section-title">TAGS</span>
          <div className="sidebar-tags-cloud">
            {tagsMap.slice(0, 12).map(([tag, count]) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  className={`sidebar-tag-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setIsPinnedFilterActive(false);
                    setSelectedTag(isSelected ? null : tag);
                  }}
                >
                  <span className="tag-hash">#</span>
                  <span>{tag}</span>
                  <span className="tag-count">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── STORAGE GAUGE FOOTER ── */}
      <div className="notes-sidebar-footer" title={`${storageFormatted} of 25 GB used`}>
        <div className="storage-meter-row">
          <HardDrive size={13} className="storage-meter-icon" />
          <span className="storage-text">{storageFormatted} / 25 GB</span>
        </div>
        <div className="storage-progress-bar">
          <div
            className="storage-progress-fill"
            style={{ width: `${storagePercent}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
