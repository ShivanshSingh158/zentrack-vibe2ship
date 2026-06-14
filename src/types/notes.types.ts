export interface StorageNode {
  id?: string;
  userId: string;
  type: 'folder' | 'file' | 'note';
  name: string;
  parentId: string | null;
  fileType?: 'pdf' | 'docx' | 'image' | 'other';
  size?: number;
  url?: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
}
