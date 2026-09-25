/**
 * StorageItemActionSheet.tsx — ZenTrack Mobile
 *
 * Lightweight re-export / wrapper around StorageContextMenuModal.
 * Ensures backward compatibility across the codebase while providing the
 * sleek Obsidian Cosmos floating popover menu.
 */

import React from 'react';
import { StorageNode } from '../../contexts/MobileDataContext';
import StorageContextMenuModal from './StorageContextMenuModal';

export interface StorageItemActionSheetProps {
  item: StorageNode | null;
  onClose: () => void;
  onPin: (item: StorageNode) => void;
  onRename: (item: StorageNode) => void;
  onMove: (item: StorageNode) => void;
  onDelete: (item: StorageNode) => void;
  isDark?: boolean;
  colors?: any;
}

export function StorageItemActionSheet({
  item,
  onClose,
  onPin,
  onRename,
  onMove,
  onDelete,
}: StorageItemActionSheetProps) {
  return (
    <StorageContextMenuModal
      visible={!!item}
      item={item}
      onClose={onClose}
      onPin={onPin}
      onRename={onRename}
      onMove={onMove}
      onDelete={onDelete}
    />
  );
}

export default StorageItemActionSheet;
