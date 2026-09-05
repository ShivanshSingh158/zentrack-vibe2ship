import React from 'react';
import {
  FileText, Image as ImageIcon, Trash2, Edit2, Star, Search,
  X, CheckSquare, Plus, File, FileDown, Clock, ArrowUpDown, PanelLeftClose
} from 'lucide-react';
import type { StorageNode } from '../../types';

interface NotesFeedProps {
  nodes: StorageNode[];
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

export const NotesFeed: React.FC<NotesFeedProps> = ({
  nodes,
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
  const allDocs = nodes.filter(n => n.type !== 'folder');
  const pinnedDocs = allDocs.filter(n => n.isPinned);
  const regularDocs = allDocs.filter(n => !n.isPinned);

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

          <div className="card-action-cluster" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={`card-action-btn pin ${node.isPinned ? 'pinned' : ''}`}
              onClick={() => onTogglePin(node)}
              title={node.isPinned ? 'Unpin Note' : 'Pin Note'}
            >
              <Star size={12} fill={node.isPinned ? '#ff9f4d' : 'none'} color={node.isPinned ? '#ff9f4d' : '#8e8e93'} />
            </button>
            <button
              type="button"
              className="card-action-btn edit"
              onClick={() => onRename(node)}
              title="Rename Note"
            >
              <Edit2 size={12} />
            </button>
            <button
              type="button"
              className="card-action-btn delete"
              onClick={() => onDelete(node.id!)}
              title="Delete Note"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {isNote && cleanSnippet && (
          <p className="card-snippet-text">{cleanSnippet}</p>
        )}

        <div className="card-footer-meta">
          <span className="card-meta-left">
            {isNote ? `${wordCount} words` : formatSize(node.size)}
          </span>
          <span className="card-meta-right">
            <Clock size={10} />
            {formatDate(node.updatedAt || node.createdAt)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <section className="notes-center-feed">
      {/* ── SEARCH & SORT COMMAND BAR ── */}
      <div className="notes-feed-command-bar">
        <div className="feed-search-input-wrap">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="feed-search-input"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="search-clear-btn">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="feed-sort-dropdown-wrap">
          <ArrowUpDown size={12} className="sort-icon" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="feed-sort-select"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name-asc">Title (A-Z)</option>
            <option value="name-desc">Title (Z-A)</option>
            <option value="size-desc">Largest</option>
          </select>
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
      <div className="notes-feed-scroll-container">
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
