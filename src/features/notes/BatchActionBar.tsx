import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderPlus, FolderInput, Trash2, X, CheckSquare } from 'lucide-react';

interface BatchActionBarProps {
  visible: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleSelectAll: () => void;
  onBatchMove: () => void;
  onNewFolderWithSelection?: () => void;
  onBatchDelete: () => void;
  onCancel: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  visible,
  selectedCount,
  totalCount,
  onToggleSelectAll,
  onBatchMove,
  onNewFolderWithSelection,
  onBatchDelete,
  onCancel,
}) => {
  if (!visible) return null;

  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <AnimatePresence>
      <motion.div
        className="notes-batch-action-bar"
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Left Section: Count & Select All */}
        <div className="batch-bar-left">
          <motion.div
            key={selectedCount}
            className="batch-count-badge"
            initial={{ scale: 1.15 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.15 }}
          >
            {selectedCount}
          </motion.div>

          <button
            type="button"
            className="batch-select-all-btn"
            onClick={onToggleSelectAll}
            title={isAllSelected ? 'Deselect all items' : 'Select all items'}
          >
            <CheckSquare size={13} className="batch-icon" />
            <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
          </button>
        </div>

        {/* Right Section: Actions */}
        <div className="batch-bar-right">
          {/* New Folder with Selection */}
          {onNewFolderWithSelection && (
            <button
              type="button"
              className="batch-action-btn new-folder"
              disabled={selectedCount === 0}
              onClick={onNewFolderWithSelection}
              title={`Create new folder with ${selectedCount} selected items`}
            >
              <FolderPlus size={14} />
              <span className="batch-btn-text">New Folder</span>
            </button>
          )}

          {/* Move */}
          <button
            type="button"
            className="batch-action-btn move"
            disabled={selectedCount === 0}
            onClick={onBatchMove}
            title={`Move ${selectedCount} selected items`}
          >
            <FolderInput size={14} />
            <span className="batch-btn-text">Move</span>
          </button>

          {/* Delete */}
          <button
            type="button"
            className="batch-action-btn delete"
            disabled={selectedCount === 0}
            onClick={onBatchDelete}
            title={`Delete ${selectedCount} selected items`}
          >
            <Trash2 size={14} />
            <span className="batch-btn-text">Delete</span>
          </button>

          <div className="batch-bar-divider" />

          {/* Cancel / Done */}
          <button
            type="button"
            className="batch-action-btn close"
            onClick={onCancel}
            title="Exit selection mode"
          >
            <X size={15} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
