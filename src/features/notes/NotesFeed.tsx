import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileText, Image as ImageIcon, Trash2, Edit2, Star, Search,
  X, CheckSquare, Plus, File, FileDown, Clock, ArrowUpDown, PanelLeftClose,
  Folder, ChevronDown, Check, FolderInput, CheckCircle2, ChevronRight,
  ArrowDown, ArrowUp, HardDrive, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StorageNode } from '../../types';
import { CategoryFilterTabs, type FilterCategory } from './CategoryFilterTabs';
import { BatchActionBar } from './BatchActionBar';
import { MoveNodeModal } from './MoveNodeModal';

export type SortMode =
  | 'newest'
  | 'oldest'
  | 'az'
  | 'za'
  | 'size_desc'
  | 'size_asc'
  | 'modified';

interface NotesFeedProps {
  nodes: StorageNode[];
  allNodes?: StorageNode[];
  currentFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortBy: SortMode;
  setSortBy: (s: SortMode) => void;
  activeCategory: FilterCategory;
  setActiveCategory: (cat: FilterCategory) => void;
  categoryCounts: Record<FilterCategory, number>;
  isSelectMode: boolean;
  setIsSelectMode: (mode: boolean) => void;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  activeNoteId: string | null;
  onSelectNote: (note: StorageNode) => void;
  onSelectFile: (file: StorageNode) => void;
  onTogglePin: (note: StorageNode) => void;
  onRename: (node: StorageNode) => void;
  onDelete: (nodeId: string) => void;
  onBatchDelete: () => void;
  onMoveNode: (node: StorageNode, targetFolderId: string | null) => void;
  onBatchMove: (targetFolderId: string | null) => void;
  onCreateFolderWithSelection?: () => void;
  onCreateNote: () => void;
  onCollapse?: () => void;
}

function formatDate(ts?: number) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

interface SortOptionConfig {
  value: SortMode;
  label: string;
  section?: string;
  icon?: React.ReactNode;
}

const SORT_OPTIONS: SortOptionConfig[] = [
  { value: 'newest', label: 'Date Added (Newest)', icon: <Clock size={13} /> },
  { value: 'oldest', label: 'Date Added (Oldest)', icon: <Calendar size={13} /> },
  { value: 'az', label: 'Name (A → Z)', section: 'alpha', icon: <ArrowDown size={13} /> },
  { value: 'za', label: 'Name (Z → A)', icon: <ArrowUp size={13} /> },
  { value: 'size_desc', label: 'Size (Largest First)', section: 'size', icon: <HardDrive size={13} /> },
  { value: 'size_asc', label: 'Size (Smallest First)', icon: <HardDrive size={13} /> },
];

export const NotesFeed: React.FC<NotesFeedProps> = ({
  nodes,
  allNodes = [],
  currentFolderId = null,
  onSelectFolder,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  activeCategory,
  setActiveCategory,
  categoryCounts,
  isSelectMode,
  setIsSelectMode,
  selectedIds,
  setSelectedIds,
  activeNoteId,
  onSelectNote,
  onSelectFile,
  onTogglePin,
  onRename,
  onDelete,
  onBatchDelete,
  onMoveNode,
  onBatchMove,
  onCreateFolderWithSelection,
  onCreateNote,
  onCollapse,
}) => {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [moveModalState, setMoveModalState] = useState<{
    isOpen: boolean;
    node: StorageNode | null;
    isBatch: boolean;
  }>({
    isOpen: false,
    node: null,
    isBatch: false,
  });

  const sortRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Close sort menu on click outside or escape
  useEffect(() => {
    if (!isSortOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setIsSortOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSortOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSortOpen]);

  // Native non-passive wheel isolation for smooth scroll
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    const feedEl = feedRef.current;
    if (!scrollEl || !feedEl) return;

    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement)?.closest('.feed-sort-popover-menu')) {
        return;
      }
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 28;
      else if (e.deltaMode === 2) delta *= scrollEl.clientHeight;

      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;

      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        e.preventDefault();
        scrollEl.scrollBy({ top: delta, behavior: 'auto' });
      }
    };

    feedEl.addEventListener('wheel', onWheel, { passive: false });
    return () => feedEl.removeEventListener('wheel', onWheel);
  }, []);

  const currentSortLabel = useMemo(() => {
    const opt = SORT_OPTIONS.find(o => o.value === sortBy);
    if (!opt) return 'Newest';
    if (sortBy === 'newest') return 'Newest';
    if (sortBy === 'oldest') return 'Oldest';
    if (sortBy === 'az') return 'A → Z';
    if (sortBy === 'za') return 'Z → A';
    if (sortBy === 'size_desc') return 'Largest';
    if (sortBy === 'size_asc') return 'Smallest';
    return opt.label;
  }, [sortBy]);

  // Fast folder name lookup map for breadcrumbs
  const folderNameMap = useMemo(() => {
    const map = new Map<string, { name: string; parentId: string | null }>();
    allNodes.forEach(n => {
      if (n.id && n.type === 'folder') {
        map.set(n.id, { name: n.name, parentId: n.parentId ?? null });
      }
    });
    return map;
  }, [allNodes]);

  // Breadcrumbs navigation path (when inside a folder)
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

  // Pinned vs Regular docs
  const allDocs = nodes.filter(n => n.type !== 'folder');
  const isPinnedNode = (n: StorageNode) => n.isPinned === true || (n as any).pinned === true;
  const pinnedDocs = allDocs.filter(n => isPinnedNode(n));
  const regularDocs = allDocs.filter(n => !isPinnedNode(n));

  // Subfolders inside currently active folder
  const subfoldersInFolder = useMemo(() => {
    if (!currentFolderId || !allNodes.length) return [];
    return allNodes.filter(n => n.type === 'folder' && n.parentId === currentFolderId);
  }, [allNodes, currentFolderId]);

  // All folders for Move modal
  const availableMoveFolders = useMemo(() => {
    return allNodes.filter(n => n.type === 'folder');
  }, [allNodes]);

  // Batch actions
  const handleToggleSelectAll = () => {
    if (selectedIds.length === allDocs.length && allDocs.length > 0) {
      setSelectedIds([]);
    } else {
      const allIds = allDocs.map(d => d.id!).filter(Boolean);
      setSelectedIds(allIds);
    }
  };

  const handleOpenMoveSingle = (node: StorageNode) => {
    setMoveModalState({ isOpen: true, node, isBatch: false });
  };

  const handleOpenMoveBatch = () => {
    if (selectedIds.length === 0) return;
    setMoveModalState({ isOpen: true, node: null, isBatch: true });
  };

  const handleExecuteMove = (targetFolderId: string | null) => {
    if (moveModalState.isBatch) {
      onBatchMove(targetFolderId);
      setIsSelectMode(false);
      setSelectedIds([]);
    } else if (moveModalState.node) {
      onMoveNode(moveModalState.node, targetFolderId);
    }
    setMoveModalState({ isOpen: false, node: null, isBatch: false });
  };

  const renderNoteCard = (node: StorageNode, isPinnedSection = false) => {
    const isNote = node.type === 'note' || !node.type;
    const isPdf = node.fileType === 'pdf';
    const isImg = node.fileType === 'image';
    const isSelected = selectedIds.includes(node.id!);
    const isActive = activeNoteId === node.id;

    const wordCount = isNote && node.content ? node.content.trim().split(/\s+/).filter(Boolean).length : 0;
    const cleanSnippet = isNote && node.content ? node.content.replace(/^#+\s+/gm, '').replace(/[*_`~]/g, '').trim() : '';

    return (
      <div
        key={node.id}
        className={`notes-card-item ${isActive ? 'active-note' : ''} ${isSelected ? 'selected' : ''} ${isPinnedSection ? 'pinned-card' : ''} ${isSelectMode ? 'selection-mode' : ''}`}
        onClick={() => {
          if (isSelectMode) {
            setSelectedIds(prev => isSelected ? prev.filter(i => i !== node.id) : [...prev, node.id!]);
          } else if (isNote) {
            onSelectNote(node);
          } else {
            onSelectFile(node);
          }
        }}
      >
        <div className="card-top-row">
          <div className="card-type-and-title">
            {/* Multi-Select Checkbox */}
            {isSelectMode ? (
              <div
                className={`card-select-checkbox ${isSelected ? 'checked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIds(prev => isSelected ? prev.filter(i => i !== node.id) : [...prev, node.id!]);
                }}
              >
                {isSelected ? <CheckCircle2 size={16} /> : <div className="checkbox-empty-box" />}
              </div>
            ) : (
              <div className={`card-type-icon ${isNote ? 'note' : isPdf ? 'pdf' : isImg ? 'image' : 'file'}`}>
                {isNote ? <FileText size={14} /> : isPdf ? <FileDown size={14} /> : isImg ? <ImageIcon size={14} /> : <File size={14} />}
              </div>
            )}

            <div className="card-title-and-path">
              <h4 className="card-title" title={node.name}>{node.name}</h4>
              {/* Breadcrumb path shown in global search */}
              {node.locationPath && (
                <span className="card-location-badge" title={`Folder: ${node.locationPath}`}>
                  <Folder size={10} />
                  <span>{node.locationPath}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {isNote && cleanSnippet && (
          <p className="card-snippet-text">{cleanSnippet}</p>
        )}

        <div className="card-footer-meta">
          <span className="card-meta-left card-meta-badge">
            {isNote
              ? `${wordCount.toLocaleString()} words`
              : (formatSize(node.size) || (isPdf ? 'PDF' : isImg ? 'Image' : 'File'))
            }
          </span>

          <div className="card-footer-right">
            <div className="card-action-cluster" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className={`card-action-btn pin ${isPinnedNode(node) ? 'pinned' : ''}`}
                onClick={() => onTogglePin(node)}
                title={isPinnedNode(node) ? 'Unpin Note' : 'Pin Note'}
              >
                <Star size={11} fill={isPinnedNode(node) ? '#ff9f4d' : 'none'} color={isPinnedNode(node) ? '#ff9f4d' : '#8e8e93'} />
              </button>
              <button
                type="button"
                className="card-action-btn move"
                onClick={() => handleOpenMoveSingle(node)}
                title="Move to Folder"
              >
                <FolderInput size={11} />
              </button>
              <button
                type="button"
                className="card-action-btn edit"
                onClick={() => onRename(node)}
                title="Rename Note"
              >
                <Edit2 size={11} />
              </button>
              <button
                type="button"
                className="card-action-btn delete"
                onClick={() => onDelete(node.id!)}
                title="Delete Note"
              >
                <Trash2 size={11} />
              </button>
            </div>

            <span className="card-meta-right card-meta-date" title={node.updatedAt || node.createdAt ? new Date(node.updatedAt || node.createdAt).toLocaleString() : ''}>
              <Clock size={11} className="meta-clock-icon" />
              <span>{formatDate(node.updatedAt || node.createdAt)}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="notes-center-feed" ref={feedRef}>
      {/* ── BREADCRUMB TRAIL (when inside a folder and not searching) ── */}
      {breadcrumbs.length > 1 && !searchQuery && (
        <div className="feed-breadcrumbs-bar">
          <div className="breadcrumbs-scroll-wrap">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id || 'root'}>
                  {idx > 0 && <ChevronRight size={11} className="breadcrumb-separator" />}
                  <button
                    type="button"
                    className={`breadcrumb-pill ${isLast ? 'active' : ''}`}
                    disabled={isLast}
                    onClick={() => onSelectFolder?.(crumb.id)}
                    title={crumb.name}
                  >
                    <span>{crumb.name}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SEARCH & SORT COMMAND BAR ── */}
      <div className="notes-feed-command-bar">
        {/* In Select Mode: show Cancel / Count / Done */}
        {isSelectMode ? (
          <div className="feed-select-mode-header">
            <button
              type="button"
              className="feed-select-cancel-btn"
              onClick={() => {
                setIsSelectMode(false);
                setSelectedIds([]);
              }}
            >
              Cancel
            </button>
            <span className="feed-select-count-title">
              {selectedIds.length > 0 ? `${selectedIds.length} Selected` : 'Select Items'}
            </span>
            <button
              type="button"
              className="feed-select-done-btn"
              onClick={() => {
                setIsSelectMode(false);
                setSelectedIds([]);
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Search Input */}
            <div className="feed-search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="feed-search-input"
                placeholder={currentFolderId ? "Search in folder..." : "Search entire vault..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="search-clear-btn" title="Clear search">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Sort Popover Dropdown */}
            <div className="feed-sort-dropdown-wrap" ref={sortRef}>
              <button
                type="button"
                className={`feed-sort-btn ${isSortOpen ? 'active' : ''}`}
                onClick={() => setIsSortOpen(prev => !prev)}
                aria-expanded={isSortOpen}
                aria-haspopup="listbox"
                title="Sort options"
              >
                <ArrowUpDown size={12} className="sort-icon" />
                <span className="feed-sort-label">{currentSortLabel}</span>
                <ChevronDown size={12} className={`sort-chevron ${isSortOpen ? 'open' : ''}`} />
              </button>

              <AnimatePresence>
                {isSortOpen && (
                  <motion.div
                    className="feed-sort-popover-menu"
                    role="listbox"
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {SORT_OPTIONS.map((opt, idx) => {
                      const isSelected = sortBy === opt.value;
                      const hasDividerAbove = opt.section && idx > 0;
                      return (
                        <React.Fragment key={opt.value}>
                          {hasDividerAbove && <div className="sort-menu-divider" />}
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`feed-sort-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => {
                              setSortBy(opt.value);
                              setIsSortOpen(false);
                            }}
                          >
                            <span className="feed-sort-item-icon">{opt.icon}</span>
                            <span className="feed-sort-item-label">{opt.label}</span>
                            {isSelected && <Check size={13} className="feed-sort-check-icon" />}
                          </button>
                        </React.Fragment>
                      );
                    })}

                    {/* Select Multiple Option in Dropdown */}
                    <div className="sort-menu-divider" />
                    <button
                      type="button"
                      className="feed-sort-item select-multiple"
                      onClick={() => {
                        setIsSortOpen(false);
                        setIsSelectMode(true);
                      }}
                    >
                      <span className="feed-sort-item-icon"><CheckSquare size={13} /></span>
                      <span className="feed-sort-item-label">Select Multiple</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Direct Multi-Select Toggle Button */}
            <button
              type="button"
              className={`feed-select-mode-trigger ${isSelectMode ? 'active' : ''}`}
              onClick={() => setIsSelectMode(!isSelectMode)}
              title="Toggle multi-select mode"
            >
              <CheckSquare size={13} />
            </button>

            {onCollapse && (
              <button
                type="button"
                className="feed-collapse-btn"
                onClick={onCollapse}
                title="Collapse Notes Feed"
              >
                <PanelLeftClose size={13} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── CATEGORY FILTER TABS (All / Documents / Images / Notes) ── */}
      <div className="feed-category-tabs-container">
        <CategoryFilterTabs
          activeCategory={activeCategory}
          categoryCounts={categoryCounts}
          onSelectCategory={setActiveCategory}
          compact={!!currentFolderId}
        />
      </div>

      {/* ── NOTES SCROLL LIST ── */}
      <div className="notes-feed-scroll-container" ref={scrollContainerRef}>
        {/* Current Folder Subfolders Navigator */}
        {subfoldersInFolder.length > 0 && !searchQuery && (
          <div className="feed-subfolders-strip">
            <div className="feed-subfolders-header">
              <Folder size={12} className="feed-subfolders-header-icon" />
              <span>SUBFOLDERS ({subfoldersInFolder.length})</span>
            </div>
            <div className="feed-subfolders-grid">
              {subfoldersInFolder.map(sf => {
                const sfCount = allNodes?.filter(n => n.parentId === sf.id).length || 0;
                return (
                  <button
                    key={sf.id}
                    type="button"
                    className="feed-subfolder-chip"
                    onClick={() => onSelectFolder?.(sf.id!)}
                    title={`Open folder: ${sf.name}`}
                  >
                    <Folder size={13} className="feed-subfolder-chip-icon" />
                    <span className="feed-subfolder-chip-name">{sf.name}</span>
                    <span className="feed-subfolder-chip-count">{sfCount}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {allDocs.length === 0 ? (
          <div className="feed-empty-state">
            <FileText size={32} color="rgba(165, 153, 255, 0.4)" />
            <h4>{searchQuery ? 'No matching files found' : 'Empty folder'}</h4>
            <p>
              {searchQuery
                ? `No documents matching "${searchQuery}" in this view.`
                : 'Create a note or upload files to start building your knowledge base.'}
            </p>
            {!searchQuery && (
              <button type="button" onClick={onCreateNote} className="feed-empty-create-btn">
                <Plus size={14} />
                <span>Create New Note</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedDocs.length > 0 && (
              <div className="feed-pinned-section">
                <div className="feed-section-header">
                  <Star size={11} fill="#ff9f4d" color="#ff9f4d" />
                  <span>PINNED ({pinnedDocs.length})</span>
                </div>
                <div className="feed-cards-stack">
                  {pinnedDocs.map(node => renderNoteCard(node, true))}
                </div>
              </div>
            )}

            {/* Regular Section */}
            {regularDocs.length > 0 && (
              <div className="feed-regular-section">
                {pinnedDocs.length > 0 && (
                  <div className="feed-section-header">
                    <span>DOCUMENTS ({regularDocs.length})</span>
                  </div>
                )}
                <div className="feed-cards-stack">
                  {regularDocs.map(node => renderNoteCard(node, false))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── FLOATING MULTI-SELECT BATCH ACTION BAR ── */}
      <BatchActionBar
        visible={isSelectMode}
        selectedCount={selectedIds.length}
        totalCount={allDocs.length}
        onToggleSelectAll={handleToggleSelectAll}
        onBatchMove={handleOpenMoveBatch}
        onNewFolderWithSelection={onCreateFolderWithSelection}
        onBatchDelete={onBatchDelete}
        onCancel={() => {
          setIsSelectMode(false);
          setSelectedIds([]);
        }}
      />

      {/* ── MOVE MODAL (Single and Batch) ── */}
      <MoveNodeModal
        isOpen={moveModalState.isOpen}
        node={moveModalState.node}
        batchCount={moveModalState.isBatch ? selectedIds.length : 0}
        folders={availableMoveFolders}
        allNodes={allNodes}
        onClose={() => setMoveModalState({ isOpen: false, node: null, isBatch: false })}
        onMove={handleExecuteMove}
      />
    </section>
  );
};
