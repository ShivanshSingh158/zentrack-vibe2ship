import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, Home, X, Check, ChevronRight } from 'lucide-react';
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

  if (!isOpen) return null;

  // Filter out the folder itself being moved and its descendants to prevent circular nesting
  const invalidFolderIds = new Set<string>();
  if (node && node.type === 'folder' && node.id) {
    invalidFolderIds.add(node.id);
    const addDescendants = (parentId: string) => {
      const children = folders.filter(f => f.parentId === parentId);
      children.forEach(c => {
        if (c.id) {
          invalidFolderIds.add(c.id);
          addDescendants(c.id);
        }
      });
    };
    addDescendants(node.id);
  }

  const validFolders = folders.filter(f => f.id && !invalidFolderIds.has(f.id));

  // Build breadcrumb location helper for destination folders
  const getFolderPath = (parentId: string | null): string => {
    if (!parentId) return 'Home';
    const parts: string[] = [];
    let curr: string | null = parentId;
    let depth = 0;
    while (curr && depth < 5) {
      const f = allNodes.find(n => n.id === curr);
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

  const handleConfirm = () => {
    onMove(selectedFolderId);
    onClose();
  };

  const title = batchCount > 0
    ? `Move ${batchCount} Items`
    : `Move "${node?.name || 'Item'}"`;

  return (
    <AnimatePresence>
      <div className="notes-modal-backdrop" onClick={onClose}>
        <motion.div
          className="notes-move-modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="notes-move-modal-header">
            <div className="move-header-info">
              <h3 className="notes-move-modal-title">{title}</h3>
              <p className="notes-move-modal-subtitle">Choose a destination folder</p>
            </div>
            <button type="button" className="notes-modal-close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>

          <div className="notes-move-folder-list">
            {/* Root / Home Option */}
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
              {selectedFolderId === null && <Check size={16} className="move-item-check" />}
            </div>

            {/* Folder Items */}
            {validFolders.map((f) => {
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
                  {isSelected && <Check size={16} className="move-item-check" />}
                </div>
              );
            })}
          </div>

          <div className="notes-move-modal-actions">
            <button type="button" className="notes-modal-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="notes-modal-submit-btn"
              onClick={handleConfirm}
            >
              Move Here
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
