import React from 'react';
import {
  FileText, Image as ImageIcon, Trash2, Edit2, Star, Search,
  X, CheckSquare, Plus, File, FileDown, Clock, ArrowUpDown, PanelLeftClose,
  Folder, ChevronDown, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StorageNode } from '../../types';

interface NotesFeedProps {
  nodes: StorageNode[];
  allNodes?: StorageNode[];
  currentFolderId?: string | null;
  onSelectFolder?: (folderId: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortBy: 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc';
  setSortBy: (s: any) => void;
  isSelectMode: boolean;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  activeNoteId: string | null;
  onSelectNote: (note: StorageNode) => void;
  onSelectFile: (file: StorageNode) => void;
  onTogglePin: (note: StorageNode) => void;
  onRename: (node: StorageNode) => void;
  onDelete: (nodeId: string) => void;
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

const SORT_OPTIONS: { value: 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc'; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name-asc', label: 'Title (A-Z)' },
  { value: 'name-desc', label: 'Title (Z-A)' },
  { value: 'size-desc', label: 'Largest' },
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
  isSelectMode,
  selectedIds,
  setSelectedIds,
  activeNoteId,
  onSelectNote,
  onSelectFile,
  onTogglePin,
  onRename,
  onDelete,
  onCreateNote,
  onCollapse,
}) => {
  const [isSortOpen, setIsSortOpen] = React.useState(false);
  const sortRef = React.useRef<HTMLDivElement>(null);
  const feedRef = React.useRef<HTMLElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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

  // Native non-passive wheel isolation: ensures mouse wheel scroller directly scrolls feed items
  React.useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    const feedEl = feedRef.current;
    if (!scrollEl || !feedEl) return;

    const onWheel = (e: WheelEvent) => {
      // If a popover menu (like sort dropdown) is open and cursor is inside it, let that handle it
      if ((e.target as HTMLElement)?.closest('.feed-sort-popover-menu')) {
        return;
      }

      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 28; // Lines mode (typical Windows mouse wheel step)
      else if (e.deltaMode === 2) delta *= scrollEl.clientHeight; // Pages mode

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

  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Newest';

  const allDocs = nodes.filter(n => n.type !== 'folder');
  const pinnedDocs = allDocs.filter(n => n.isPinned);
  const regularDocs = allDocs.filter(n => !n.isPinned);

  // Subfolders inside currently active folder
  const subfoldersInFolder = React.useMemo(() => {
    if (!currentFolderId || !allNodes.length) return [];
    return allNodes.filter(n => n.type === 'folder' && n.parentId === currentFolderId);
  }, [allNodes, currentFolderId]);

  const renderNoteCard = (node: StorageNode, isPinnedSection = false) => {
    const isNote = node.type === 'note' || !node.type;
    const isPdf = node.fileType === 'pdf';
    const isImg = node.fileType === 'image';
    const isSelected = selectedIds.includes(node.id!);
    const isActive = activeNoteId === node.id;

    // Word count estimate
    const wordCount = isNote && node.content ? node.content.trim().split(/\s+/).filter(Boolean).length : 0;
    const cleanSnippet = isNote && node.content ? node.content.replace(/^#+\s+/gm, '').replace(/[*_`~]/g, '').trim() : '';

    return (
      <div
        key={node.id}
        className={`notes-card-item ${isActive ? 'active-note' : ''} ${isSelected ? 'selected' : ''} ${isPinnedSection ? 'pinned-card' : ''}`}
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
            <div className={`card-type-icon ${isNote ? 'note' : isPdf ? 'pdf' : isImg ? 'image' : 'file'}`}>
              {isNote ? <FileText size={14} /> : isPdf ? <FileDown size={14} /> : isImg ? <ImageIcon size={14} /> : <File size={14} />}
            </div>
            <h4 className="card-title" title={node.name}>{node.name}</h4>
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
                className={`card-action-btn pin ${node.isPinned ? 'pinned' : ''}`}
                onClick={() => onTogglePin(node)}
                title={node.isPinned ? 'Unpin Note' : 'Pin Note'}
              >
                <Star size={11} fill={node.isPinned ? '#ff9f4d' : 'none'} color={node.isPinned ? '#ff9f4d' : '#8e8e93'} />
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
      {/* ── SEARCH & SORT COMMAND BAR ── */}
      <div className="notes-feed-command-bar">
        <div className="feed-search-input-wrap">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="feed-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="search-clear-btn">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="feed-sort-dropdown-wrap" ref={sortRef}>
          <button
            type="button"
            className={`feed-sort-btn ${isSortOpen ? 'active' : ''}`}
            onClick={() => setIsSortOpen(prev => !prev)}
            aria-expanded={isSortOpen}
            aria-haspopup="listbox"
            title="Sort notes"
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
                {SORT_OPTIONS.map(opt => {
                  const isSelected = sortBy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`feed-sort-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSortBy(opt.value);
                        setIsSortOpen(false);
                      }}
                    >
                      <span className="feed-sort-item-label">{opt.label}</span>
                      {isSelected && <Check size={13} className="feed-sort-check-icon" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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
            <h4>No documents found</h4>
            <p>Create a note or upload files to start building your knowledge base.</p>
            <button type="button" onClick={onCreateNote} className="feed-empty-create-btn">
              <Plus size={14} />
              <span>Create Note</span>
            </button>
          </div>
        ) : (
          <>
            {/* PINNED SECTION */}
            {pinnedDocs.length > 0 && !searchQuery && (
              <div className="feed-pinned-section">
                <div className="feed-section-header">
                  <Star size={12} color="#ff9f4d" fill="#ff9f4d" />
                  <span>PINNED</span>
                </div>
                <div className="feed-cards-stack">
                  {pinnedDocs.map(n => renderNoteCard(n, true))}
                </div>
              </div>
            )}

            {/* REGULAR DOCUMENTS SECTION */}
            <div className="feed-regular-section">
              {pinnedDocs.length > 0 && !searchQuery && (
                <div className="feed-section-header">
                  <span>DOCUMENTS</span>
                </div>
              )}
              <div className="feed-cards-stack">
                {(searchQuery ? allDocs : regularDocs).map(n => renderNoteCard(n, false))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
