export interface StorageNode {
  id?: string;
  userId: string;
  type: 'folder' | 'file' | 'note';
  name: string;
  parentId: string | null;
  fileType?: 'pdf' | 'docx' | 'image' | 'other' | 'file';
  size?: number;
  url?: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  // Sync fields written by mobile app; must exist on web for cross-platform sync
  isPinned?: boolean;    // web field name (web writes/reads this)
  pinned?: boolean;      // mobile field name (mobile writes 'pinned', not 'isPinned')
  tags?: string[];
  mimeType?: string;
  locationPath?: string; // breadcrumb string built by mobile e.g. 'Home / Semester 5'
}
