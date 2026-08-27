import React from 'react';
import { Folder, Star, FileText, Tag, Plus, HardDrive, ChevronRight, ChevronDown, FolderPlus, PanelLeftClose } from 'lucide-react';
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
  const folders = nodes.filter(n => n.type === 'folder');
  const allDocs = nodes.filter(n => n.type !== 'folder');
  const pinnedCount = allDocs.filter(n => n.isPinned).length;

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

  // Compute total storage size
  const totalBytes = React.useMemo(() => {
    return nodes.reduce((acc, n) => acc + (n.size || 0), 0);
  }, [nodes]);

  const storageMb = (totalBytes / (1024 * 1024)).toFixed(1);

  return (
    <aside className="notes-left-sidebar">
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
          {folders.length === 0 ? (
            <span className="sidebar-empty-hint">No folders yet</span>
          ) : (
            folders.map(folder => {
              const childCount = nodes.filter(n => n.parentId === folder.id).length;
              const isSelected = currentFolderId === folder.id;

              return (
                <button
                  key={folder.id}
                  type="button"
                  className={`sidebar-nav-item folder ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setIsPinnedFilterActive(false);
                    setSelectedTag(null);
                    setCurrentFolderId(isSelected ? null : folder.id!);
                  }}
                >
                  <Folder size={14} className="nav-item-icon folder-icon" />
                  <span className="nav-item-label" title={folder.name}>{folder.name}</span>
                  <span className="nav-item-count">{childCount}</span>
                </button>
              );
            })
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
      <div className="notes-sidebar-footer">
        <div className="storage-meter-row">
          <HardDrive size={13} color="#8e8e93" />
          <span className="storage-text">{storageMb} MB used / 500 MB</span>
        </div>
        <div className="storage-progress-bar">
          <div
            className="storage-progress-fill"
            style={{ width: `${Math.min(100, (totalBytes / (500 * 1024 * 1024)) * 100)}%` }}
          />
        </div>
      </div>
    </aside>
  );
};
