import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Home, X, Check, FolderInput, Search } from 'lucide-react';
import type { StorageNode } from '../../types';

interface MoveNodeModalProps {
  isOpen: boolean;
  node?: StorageNode | null;
  batchCount?: number;
  folders: StorageNode[];
  allNodes?: StorageNode[];
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
}

export const MoveNodeModal: React.FC<MoveNodeModalProps> = ({
  isOpen,
  node,
  batchCount = 0,
  folders,
  allNodes = [],
  onClose,
  onMove,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderSearch, setFolderSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Isolate wheel event on folder list to guarantee mousewheel scrolling
  useEffect(() => {
    const el = listRef.current;
    if (!el || !isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
      // Enable direct scrolling of the folder list with mousewheel
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

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isOpen]);

  // Filter out the folder itself being moved and its descendants to prevent circular nesting
  const invalidFolderIds = useMemo(() => {
    const set = new Set<string>();
    if (node && node.type === 'folder' && node.id) {
      set.add(node.id);
      const addDescendants = (parentId: string) => {
        const children = folders.filter(f => f.parentId === parentId);
        children.forEach(c => {
          if (c.id) {
            set.add(c.id);
            addDescendants(c.id);
          }
        });
      };
      addDescendants(node.id);
    }
    return set;
  }, [node, folders]);

  const validFolders = useMemo(() => {
    return folders.filter(f => f.id && !invalidFolderIds.has(f.id));
  }, [folders, invalidFolderIds]);

  // Build breadcrumb location helper for destination folders
  const getFolderPath = useMemo(() => {
    const nodeMap = new Map<string, { name: string; parentId: string | null }>();
    allNodes.forEach(n => {
      if (n.id) nodeMap.set(n.id, { name: n.name, parentId: n.parentId ?? null });
    });

    return (parentId: string | null): string => {
      if (!parentId) return 'Home';
      const parts: string[] = [];
      let curr: string | null = parentId;
      let depth = 0;
      while (curr && depth < 5) {
        const f = nodeMap.get(curr);
        if (f) {
          parts.unshift(f.name);
          curr = f.parentId;
        } else {
          break;
        }
        depth++;
      }
      return parts.length > 0 ? parts.join(' > ') : 'Home';
    };
  }, [allNodes]);

  // Search filter for folders
  const filteredFolders = useMemo(() => {
    const query = folderSearch.trim().toLowerCase();
    if (!query) return validFolders;
    return validFolders.filter(f => {
      const nameMatch = f.name.toLowerCase().includes(query);
      const pathMatch = getFolderPath(f.parentId).toLowerCase().includes(query);
      return nameMatch || pathMatch;
    });
  }, [validFolders, folderSearch, getFolderPath]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onMove(selectedFolderId);
    onClose();
  };

  const title = batchCount > 0
    ? `Move ${batchCount} Items`
    : `Move "${node?.name || 'Document'}"`;

  const modalContent = (
    <AnimatePresence>
      <div className="notes-modal-backdrop" onClick={onClose}>
        <motion.div
          className="notes-modal-card notes-move-modal-card"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Header */}
          <div className="notes-modal-header">
            <div className="notes-modal-title-group">
              <div className="notes-modal-icon-badge move-badge">
                <FolderInput size={20} />
              </div>
              <div className="move-title-text-wrap">
                <h3 className="notes-modal-title" title={title}>{title}</h3>
                <p className="notes-modal-subtitle">Choose a destination folder in your Vault</p>
              </div>
            </div>
            <button
              type="button"
              className="notes-modal-close-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={17} />
            </button>
          </div>

          {/* Search bar inside Move Modal */}
          {validFolders.length > 3 && (
            <div className="move-search-wrap">
              <Search size={14} className="move-search-icon" />
              <input
                type="text"
                className="move-search-input"
                placeholder="Search folders..."
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
              />
              {folderSearch && (
                <button
                  type="button"
                  onClick={() => setFolderSearch('')}
                  className="move-search-clear-btn"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* Folder List Scroll Area */}
          <div
            className="notes-move-folder-list"
            ref={listRef}
            onWheel={(e) => e.stopPropagation()}
          >
            {/* Root / Home Option */}
            {(!folderSearch || 'home root vault'.includes(folderSearch.toLowerCase())) && (
              <div
                className={`notes-move-folder-item ${selectedFolderId === null ? 'selected' : ''}`}
                onClick={() => setSelectedFolderId(null)}
              >
                <div className="move-item-icon-box root">
                  <Home size={16} />
                </div>
                <div className="move-item-details">
                  <span className="move-item-name">Home (Root Vault)</span>
                  <span className="move-item-path">Top level directory</span>
                </div>
                {selectedFolderId === null && (
                  <div className="move-item-check-pill">
                    <Check size={14} />
                  </div>
                )}
              </div>
            )}

            {/* Folder Items */}
            {filteredFolders.map((f) => {
              const isSelected = selectedFolderId === f.id;
              const location = getFolderPath(f.parentId);
              return (
                <div
                  key={f.id}
                  className={`notes-move-folder-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedFolderId(f.id!)}
                >
                  <div className="move-item-icon-box folder">
                    <Folder size={16} />
                  </div>
                  <div className="move-item-details">
                    <span className="move-item-name">{f.name}</span>
                    <span className="move-item-path">{location}</span>
                  </div>
                  {isSelected && (
                    <div className="move-item-check-pill">
                      <Check size={14} />
                    </div>
                  )}
                </div>
              );
            })}

            {filteredFolders.length === 0 && folderSearch && (
              <div className="move-empty-search">
                <Folder size={24} className="move-empty-icon" />
                <p>No folders match "{folderSearch}"</p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="notes-modal-footer">
            <button
              type="button"
              className="notes-btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="notes-btn-confirm"
              onClick={handleConfirm}
            >
              <FolderInput size={15} />
              <span>Move Here</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
