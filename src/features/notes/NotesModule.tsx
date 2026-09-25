import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import type { StorageNode } from '../../types/index';
import {
  Folder, FileText, Trash2, X, Plus, FolderPlus,
  HardDrive, ExternalLink, Sparkles, Upload, Download,
  PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, Columns, LayoutGrid,
  Loader2, RotateCw, RotateCcw, Edit2, ZoomIn, ZoomOut, MousePointerClick,
  Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import html2pdf from 'html2pdf.js';
import { startNoteAIChat } from '../../services/gemini';
import { NotesSidebar } from './NotesSidebar';
import { NotesFeed } from './NotesFeed';
import { NotesEditor } from './NotesEditor';
import { NotesAIPanel, type ChatMessage } from './NotesAIPanel';
import '../../styles/notes.css';

export const NotesModule = () => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [nodes, setNodes] = useState<StorageNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Pane Collapsibility States (Collapsible Left)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFeedOpen, setIsFeedOpen] = useState(true);

  // Filters & Tags
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc'>('newest');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isPinnedFilterActive, setIsPinnedFilterActive] = useState(false);

  // Bulk Select State
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Modals & Viewer States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; node: StorageNode | null; newName: string }>({ isOpen: false, node: null, newName: '' });

  // Note Editor State
  const [activeNote, setActiveNote] = useState<StorageNode | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const activeNoteRef = useRef<StorageNode | null>(null);

  // Note Enhancements & AI
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const noteAiSession = useRef<any>(null);

  // File Viewer State & Smooth Zoom / Pan Engine
  const [viewingFile, setViewingFile] = useState<StorageNode | null>(null);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [pdfRotation, setPdfRotation] = useState<number>(0);
  const [pdfScale, setPdfScale] = useState<number>(1);
  const [pdfPan, setPdfPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);
  const [isZoomMode, setIsZoomMode] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragPanStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const fileBodyRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (viewingFile) {
      setIsIframeLoading(true);
      setIsImageLoading(true);
      setImageError(false);
      setPdfRotation(0);
      setPdfScale(1);
      setPdfPan({ x: 0, y: 0 });
      setIsDraggingPan(false);
      setIsZoomMode(false);
    }
  }, [viewingFile?.id, viewingFile?.url]);

  const activeViewingFileUrl = useMemo(() => {
    if (!viewingFile?.url) return '';
    if (typeof viewingFile.url === 'string') {
      return viewingFile.url === '[object Object]' ? '' : viewingFile.url;
    }
    if (typeof viewingFile.url === 'object') {
      return (viewingFile.url as any).url || (viewingFile.url as any).secure_url || '';
    }
    return '';
  }, [viewingFile?.url]);

  const isPdfOrOfficeDoc = useMemo(() => {
    if (!viewingFile) return false;
    const name = viewingFile.name?.toLowerCase() || '';
    const url = activeViewingFileUrl.toLowerCase();
    return viewingFile.fileType === 'pdf' ||
      viewingFile.mimeType?.includes('pdf') ||
      url.endsWith('.pdf') ||
      name.endsWith('.pdf') ||
      viewingFile.fileType === 'docx' ||
      /\.(docx?|pptx?|xlsx?)$/i.test(name);
  }, [viewingFile, activeViewingFileUrl]);

  const isImageDoc = useMemo(() => {
    if (!viewingFile) return false;
    const name = viewingFile.name?.toLowerCase() || '';
    const url = activeViewingFileUrl.toLowerCase();
    return viewingFile.fileType === 'image' ||
      viewingFile.mimeType?.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|svg|bmp|ico)$/i.test(url) ||
      /\.(jpg|jpeg|png|webp|gif|svg|bmp|ico)$/i.test(name);
  }, [viewingFile, activeViewingFileUrl]);

  // Track Ctrl/Cmd key state to pass mousewheel events directly through cross-origin iframes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlHeld(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Native non-passive wheel listener: Scales strictly the document canvas and prevents Chrome tab-level zoom
  useEffect(() => {
    const el = fileBodyRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || isZoomMode) {
        e.preventDefault();
        e.stopPropagation();

        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
        setPdfScale(prev => {
          const next = Math.round(Math.min(4.0, Math.max(0.5, prev * zoomFactor)) * 100) / 100;
          if (next === 1) {
            setPdfPan({ x: 0, y: 0 });
          }
          return next;
        });
      } else if (pdfScale > 1) {
        // When zoomed in, rolling scroll wheel naturally pans the document
        e.preventDefault();
        e.stopPropagation();
        setPdfPan(prev => ({
          x: prev.x - (e.shiftKey ? e.deltaY : e.deltaX),
          y: prev.y - (e.shiftKey ? 0 : e.deltaY),
        }));
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [isZoomMode, pdfScale]);

  // Mouse drag-to-pan handlers (active when zoomed in or in Zoom Mode)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (pdfScale > 1 || isZoomMode || isCtrlHeld || e.button === 1) {
      e.preventDefault();
      setIsDraggingPan(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragPanStartRef.current = { x: pdfPan.x, y: pdfPan.y };
    }
  };

  useEffect(() => {
    if (!isDraggingPan) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPdfPan({
        x: dragPanStartRef.current.x + dx,
        y: dragPanStartRef.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDraggingPan(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPan]);

  const handleDoubleClick = () => {
    if (pdfScale !== 1 || pdfPan.x !== 0 || pdfPan.y !== 0) {
      setPdfScale(1);
      setPdfPan({ x: 0, y: 0 });
    } else {
      setPdfScale(1.5);
    }
  };

  const getTransformStyle = () => {
    const isRotated90or270 = pdfRotation === 90 || pdfRotation === 270;
    const isInteracting = isDraggingPan;

    if (isRotated90or270 && containerDims.width > 0 && containerDims.height > 0) {
      return {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        width: `${containerDims.height}px`,
        height: `${containerDims.width}px`,
        transform: `translate(calc(-50% + ${pdfPan.x}px), calc(-50% + ${pdfPan.y}px)) rotate(${pdfRotation}deg) scale(${pdfScale})`,
        transformOrigin: 'center center',
        maxWidth: 'none',
        maxHeight: 'none',
        transition: isInteracting ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: (pdfScale > 1 || isZoomMode) ? (isDraggingPan ? 'grabbing' : 'grab') : 'default',
      };
    }

    return {
      width: '100%',
      height: '100%',
      transform: `translate(${pdfPan.x}px, ${pdfPan.y}px) ${pdfRotation !== 0 ? `rotate(${pdfRotation}deg)` : ''} scale(${pdfScale})`,
      transformOrigin: 'center center',
      transition: isInteracting ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      cursor: (pdfScale > 1 || isZoomMode) ? (isDraggingPan ? 'grabbing' : 'grab') : 'default',
    };
  };

  useEffect(() => {
    if (!fileBodyRef.current) return;
    const updateDims = () => {
      if (fileBodyRef.current) {
        setContainerDims({
          width: fileBodyRef.current.clientWidth,
          height: fileBodyRef.current.clientHeight,
        });
      }
    };
    updateDims();
    const ro = new ResizeObserver(updateDims);
    ro.observe(fileBodyRef.current);
    return () => ro.disconnect();
  }, [viewingFile?.id]);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  // Load Storage Nodes from Firestore
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    setIsLoading(true);

    let unsubscribe: () => void;

    const checkAdminStatus = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().isAdmin === true) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        setIsAdmin(false);
      } finally {
        const q = query(collection(db, 'storage_nodes'), where('userId', '==', user.uid));
        unsubscribe = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(d => {
            const raw = d.data();
            let rawUrl = raw.url;
            if (rawUrl && typeof rawUrl === 'object') {
              const extracted = (rawUrl as any).url || (rawUrl as any).secure_url || '';
              if (extracted) {
                // Auto-heal corrupted Firestore node saved as { url, size }
                updateDoc(doc(db, 'storage_nodes', d.id), { url: extracted }).catch(() => {});
                rawUrl = extracted;
              }
            } else if (rawUrl === '[object Object]') {
              rawUrl = '';
            }
            return { id: d.id, ...raw, url: rawUrl } as StorageNode;
          });
          setNodes(data);
          setIsLoading(false);

          // Auto-open target document from Dashboard or external navigation
          const targetFileId = (location.state as any)?.openFileId || localStorage.getItem('zen_open_file_id');
          if (targetFileId) {
            localStorage.removeItem('zen_open_file_id');
            const targetNode = data.find(n => n.id === targetFileId);
            if (targetNode) {
              if (targetNode.type === 'file') {
                setViewingFile(targetNode);
                setActiveNote(null);
                setIsSidebarOpen(false);
                try {
                  localStorage.setItem('zen_last_visited_doc', JSON.stringify({
                    id: targetNode.id,
                    name: targetNode.name,
                    fileType: targetNode.fileType || (targetNode.name?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'),
                    url: targetNode.url,
                    size: targetNode.size,
                    updatedAt: Date.now()
                  }));
                } catch {}
              } else if (targetNode.type === 'note') {
                setActiveNote(targetNode);
                setViewingFile(null);
              }
            }
          }
        }, (error) => {
          console.error('Error listening to storage:', error);
          toast.error('Failed to load storage');
          setIsLoading(false);
        });
      }
    };

    checkAdminStatus();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Lock body scroll and enable true full-screen workspace fit
  useEffect(() => {
    document.body.classList.add('notes-fullscreen-active');
    return () => {
      document.body.classList.remove('notes-fullscreen-active');
    };
  }, []);

  // -- Filtering and Sorting --------------------------------------------------
  const filteredNodes = useMemo(() => {
    const isInsideFolder = currentFolderId !== null;
    let result = nodes;

    if (selectedTag) {
      const tagLower = selectedTag.toLowerCase();
      result = result
        .filter(n => n.type !== 'folder')
        .filter(n =>
          (n.tags && n.tags.some(t => t.toLowerCase() === tagLower)) ||
          (n.content && n.content.toLowerCase().includes('#' + tagLower))
        );
    } else if (isPinnedFilterActive) {
      // web writes 'isPinned', mobile writes 'pinned' - check both
      result = result
        .filter(n => n.type !== 'folder')
        .filter(n => n.isPinned === true || (n as any).pinned === true);
    } else if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result
        .filter(n => n.type !== 'folder')
        .filter(n =>
          n.name.toLowerCase().includes(q) ||
          (n.type === 'note' && n.content?.toLowerCase().includes(q))
        );
    } else if (isInsideFolder) {
      result = result.filter(n => n.parentId === currentFolderId);
      const sortFn = (a: StorageNode, b: StorageNode): number => {
        if (sortBy === 'newest')    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        if (sortBy === 'oldest')    return (a.createdAt || 0) - (b.createdAt || 0);
        if (sortBy === 'name-asc')  return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        if (sortBy === 'size-desc') return (b.size || 0) - (a.size || 0);
        return 0;
      };
      const subFolders = result.filter(n => n.type === 'folder').sort(sortFn);
      const docs       = result.filter(n => n.type !== 'folder').sort(sortFn);
      return [...subFolders, ...docs];
    } else {
      result = result.filter(n => n.type !== 'folder');
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'newest')    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      if (sortBy === 'oldest')    return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortBy === 'name-asc')  return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'size-desc') return (b.size || 0) - (a.size || 0);
      return 0;
    });
  }, [nodes, searchQuery, sortBy, currentFolderId, selectedTag, isPinnedFilterActive]);

  // Create New Note
  const handleCreateNote = async () => {
    try {
      const newNoteData = {
        userId: auth.currentUser!.uid,
        type: 'note' as const,
        name: 'Untitled Note',
        content: '# New Note\n\nStart writing your thoughts, equations, or lecture notes here...\n',
        parentId: currentFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPinned: false,
      };
      const docRef = await addDoc(collection(db, 'storage_nodes'), newNoteData);
      const createdNote: StorageNode = { id: docRef.id, ...newNoteData };
      setActiveNote(createdNote);
      setChatHistory([]);
      setShowAiPanel(false);
      toast.success('Note created');
    } catch (err) {
      console.error(err);
      toast.error('Failed to create note');
    }
  };

  // Create New Folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await addDoc(collection(db, 'storage_nodes'), {
        userId: auth.currentUser!.uid,
        type: 'folder',
        name: newFolderName.trim(),
        parentId: newFolderParentId || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setNewFolderName('');
      setNewFolderParentId(null);
      setNewFolderModal(false);
      toast.success('Folder created');
    } catch (err) {
      console.error(err);
      toast.error('Failed to create folder');
    }
  };

  // Toggle Note Pin
  const handleTogglePin = async (note: StorageNode) => {
    if (!note.id) return;
    try {
      const currentPinState = note.isPinned === true || (note as any).pinned === true;
      const newPinState = !currentPinState;
      await updateDoc(doc(db, 'storage_nodes', note.id), {
        isPinned: newPinState, // web field
        pinned:   newPinState, // mobile field — write both for cross-platform sync
        updatedAt: Date.now(),
      });
      toast.success(newPinState ? 'Note pinned to top' : 'Note unpinned');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update pin');
    }
  };

  // Debounced Auto-Save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!activeNote || !activeNote.id) return;
    setSaveStatus('saving');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const noteRef = doc(db, 'storage_nodes', activeNote.id!);
        await updateDoc(noteRef, {
          name: activeNote.name,
          content: activeNote.content || '',
          updatedAt: Date.now(),
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('error');
      }
    }, 800);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [activeNote?.content, activeNote?.name]);

  // File Upload via Cloudinary
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    let filesToUpload = Array.from(uploadedFiles);
    if (filesToUpload.length > 10) {
      toast(`Selected ${filesToUpload.length} files. Uploading the first 10 files at once.`);
      filesToUpload = filesToUpload.slice(0, 10);
    }

    setIsUploading(true);
    try {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100));

        let fileType: 'pdf' | 'docx' | 'image' | 'file' = 'file';
        if (file.type.includes('pdf')) fileType = 'pdf';
        else if (file.type.includes('word') || file.name.endsWith('.docx')) fileType = 'docx';
        else if (file.type.startsWith('image/')) fileType = 'image';

        const uploadRes = await uploadFileToCloudinary(file);
        const resolvedUrl = typeof uploadRes === 'object' && uploadRes !== null && 'url' in uploadRes ? (uploadRes as any).url : String(uploadRes || '');
        const resolvedSize = typeof uploadRes === 'object' && uploadRes !== null && 'size' in uploadRes ? (uploadRes as any).size : file.size;

        await addDoc(collection(db, 'storage_nodes'), {
          userId: auth.currentUser!.uid,
          type: 'file',
          fileType,
          name: file.name,
          url: resolvedUrl,
          size: resolvedSize,
          mimeType: file.type,
          parentId: currentFolderId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      toast.success('Files uploaded successfully');
    } catch (err) {
      console.error(err);
      toast.error('File upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      e.target.value = '';
    }
  };

  // AI Chat Handlers for Notes Studio
  const handleAiAction = async (promptText: string) => {
    if (!promptText.trim() || isAiLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: promptText };
    setChatHistory(prev => [...prev, userMsg]);
    setIsAiLoading(true);
    setAiQuestion('');

    try {
      if (!noteAiSession.current) {
        const initialContext = `Note Title: "${activeNote?.name || 'Untitled'}"\n\nNote Content:\n${activeNote?.content || '(empty)'}`;
        noteAiSession.current = await startNoteAIChat(initialContext);
      }

      const result = await noteAiSession.current.sendMessage(promptText);
      const responseText = result.response.text();

      setChatHistory(prev => [...prev, { role: 'model', text: responseText, model: 'gemini-2.5-flash' }]);
    } catch (err) {
      console.error('AI Note Chat Error:', err);
      setChatHistory(prev => [...prev, {
        role: 'model',
        text: '⚠️ Error communicating with Gemini. Please try again.',
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyMarkdown = (content: string, type: 'replace' | 'append') => {
    if (!activeNote) return;
    if (type === 'replace') {
      setActiveNote({ ...activeNote, content });
    } else {
      const newContent = (activeNote.content || '') + '\n\n' + content;
      setActiveNote({ ...activeNote, content: newContent });
    }
  };

  // Export Note as PDF or Markdown
  const handleExport = (format: 'md' | 'txt' | 'pdf') => {
    if (!activeNote) return;

    if (format === 'md' || format === 'txt') {
      const element = document.createElement('a');
      const file = new Blob([activeNote.content || ''], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `${activeNote.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${format}`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success(`Exported as .${format.toUpperCase()}`);
    } else if (format === 'pdf') {
      const element = document.getElementById('hidden-pdf-export-content');
      if (!element) {
        toast.error('Export failed: Render element not found');
        return;
      }
      const opt = {
        margin: [15, 15],
        filename: `${activeNote.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      };
      toast.loading('Generating PDF...', { id: 'pdf-toast' });
      html2pdf().from(element).set(opt).save().then(() => {
        toast.success('PDF Downloaded', { id: 'pdf-toast' });
      }).catch((e: any) => {
        console.error(e);
        toast.error('PDF generation failed', { id: 'pdf-toast' });
      });
    }
  };

  // Delete Node (Single)
  const handleDeleteNode = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'storage_nodes', id));
      toast.success('Item deleted');
      setDeleteConfirm({ isOpen: false, id: '' });
      if (activeNote?.id === id) setActiveNote(null);
      if (viewingFile?.id === id) setViewingFile(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete item');
    }
  };

  // Rename Node
  const handleRenameNode = async () => {
    if (!renameModal.node || !renameModal.newName.trim()) return;
    try {
      await updateDoc(doc(db, 'storage_nodes', renameModal.node.id!), {
        name: renameModal.newName.trim(),
        updatedAt: Date.now(),
      });
      toast.success('Renamed successfully');
      setRenameModal({ isOpen: false, node: null, newName: '' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to rename');
    }
  };

  return (
    <div className="notes-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="notes-header-bar">
        <div className="notes-header-left">
          <div className="notes-title-group">
            <h1 className="notes-hero-title">Notes & Studio</h1>
            
            {/* Panel Collapse / Expand Controls */}
            <div className="notes-panel-toggle-group">
              <button
                type="button"
                className={`notes-panel-toggle-btn ${isSidebarOpen ? 'active' : ''}`}
                onClick={() => setIsSidebarOpen(prev => !prev)}
                title={isSidebarOpen ? 'Collapse Vault (Left)' : 'Show Vault Sidebar'}
              >
                {isSidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
                <span>Vault</span>
              </button>

              <button
                type="button"
                className={`notes-panel-toggle-btn ${isFeedOpen ? 'active' : ''}`}
                onClick={() => setIsFeedOpen(prev => !prev)}
                title={isFeedOpen ? 'Collapse Feed (Left)' : 'Show Notes Feed'}
              >
                <Columns size={13} />
                <span>Feed</span>
              </button>

              <AnimatePresence>
                {(!isSidebarOpen || !isFeedOpen) && (
                  <motion.button
                    type="button"
                    className="notes-panel-toggle-btn reset"
                    onClick={() => {
                      setIsSidebarOpen(true);
                      setIsFeedOpen(true);
                    }}
                    title="Restore All 3 Panels"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.15 }}
                  >
                    <LayoutGrid size={13} className="notes-restore-icon" />
                    <span>Restore View</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          <span className="notes-stats-subtitle">
            {nodes.filter(n => n.type === 'note' || !n.type).length} Documents • {nodes.filter(n => n.type === 'folder').length} Folders
          </span>
        </div>

        <div className="notes-header-actions">
          {/* File Upload Hidden Input */}
          <label className="notes-action-pill-btn upload-pill" title="Upload files">
            <Upload size={13} className="notes-action-icon" />
            <span>Upload File</span>
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
          </label>

          {/* New Folder */}
          <button
            type="button"
            className="notes-action-pill-btn folder-pill"
            onClick={() => setNewFolderModal(true)}
            title="Create new folder"
          >
            <FolderPlus size={14} className="notes-action-icon" />
            <span>New Folder</span>
          </button>

          {/* Primary + New Note */}
          <button
            type="button"
            className="notes-primary-add-btn"
            onClick={handleCreateNote}
            title="Create new note"
          >
            <Plus size={14} strokeWidth={2.2} className="notes-primary-icon" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* ── 3-PANE POWER KNOWLEDGE WORKSPACE ── */}
      <div className="notes-power-workspace">
        {/* 1. LEFT SIDEBAR: Folders, Tags, Pinned, Storage Gauge */}
        <AnimatePresence initial={false}>
          {isSidebarOpen ? (
            <motion.div
              key="notes-sidebar-pane"
              className="notes-sidebar-motion-pane"
              initial={{ width: 0, opacity: 0, marginRight: 0 }}
              animate={{ width: 220, opacity: 1, marginRight: '0.65rem' }}
              exit={{ width: 0, opacity: 0, marginRight: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden', height: '100%', flexShrink: 0 }}
            >
              <NotesSidebar
                nodes={nodes}
                currentFolderId={currentFolderId}
                setCurrentFolderId={setCurrentFolderId}
                selectedTag={selectedTag}
                setSelectedTag={setSelectedTag}
                isPinnedFilterActive={isPinnedFilterActive}
                setIsPinnedFilterActive={setIsPinnedFilterActive}
                onNewFolder={() => {
                  setNewFolderName('');
                  setNewFolderParentId(currentFolderId);
                  setNewFolderModal(true);
                }}
                onCollapse={() => setIsSidebarOpen(false)}
              />
            </motion.div>
          ) : (
            <motion.button
              key="notes-sidebar-rail"
              type="button"
              className="notes-collapsed-rail-btn"
              initial={{ width: 0, opacity: 0, marginRight: 0 }}
              animate={{ width: 32, opacity: 1, marginRight: '0.65rem' }}
              exit={{ width: 0, opacity: 0, marginRight: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setIsSidebarOpen(true)}
              title="Expand Vault (Left Sidebar)"
              aria-label="Expand Vault"
            >
              <PanelLeftOpen size={14} className="rail-icon" />
              <span className="rail-label">VAULT</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* 2. CENTER FEED: Craft Docs Notes Feed */}
        <AnimatePresence initial={false}>
          {isFeedOpen ? (
            <motion.div
              key="notes-feed-pane"
              className="notes-feed-motion-pane"
              initial={{ width: 0, opacity: 0, marginRight: 0 }}
              animate={{ width: 285, opacity: 1, marginRight: '0.65rem' }}
              exit={{ width: 0, opacity: 0, marginRight: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden', height: '100%', flexShrink: 0 }}
            >
              <NotesFeed
                nodes={filteredNodes}
                allNodes={nodes}
                currentFolderId={currentFolderId}
                onSelectFolder={(folderId) => setCurrentFolderId(folderId)}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortBy={sortBy}
                setSortBy={setSortBy}
                isSelectMode={isSelectMode}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                activeNoteId={activeNote?.id || viewingFile?.id || null}
                onSelectNote={(note) => {
                  setActiveNote(note);
                  setViewingFile(null);
                  noteAiSession.current = null;
                  setChatHistory([]);
                  setShowAiPanel(false);
                }}
                onSelectFile={(file) => {
                  setViewingFile(file);
                  setActiveNote(null);
                  setIsSidebarOpen(false);
                  try {
                    localStorage.setItem('zen_last_visited_doc', JSON.stringify({
                      id: file.id,
                      name: file.name,
                      fileType: file.fileType || (file.name?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'),
                      url: file.url,
                      size: file.size,
                      updatedAt: Date.now()
                    }));
                  } catch {}
                }}
                onTogglePin={handleTogglePin}
                onRename={(node) => setRenameModal({ isOpen: true, node, newName: node.name })}
                onDelete={(id) => setDeleteConfirm({ isOpen: true, id })}
                onCreateNote={handleCreateNote}
                onCollapse={() => setIsFeedOpen(false)}
              />
            </motion.div>
          ) : (
            <motion.button
              key="notes-feed-rail"
              type="button"
              className="notes-collapsed-rail-btn"
              initial={{ width: 0, opacity: 0, marginRight: 0 }}
              animate={{ width: 32, opacity: 1, marginRight: '0.65rem' }}
              exit={{ width: 0, opacity: 0, marginRight: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setIsFeedOpen(true)}
              title="Expand Notes Feed"
              aria-label="Expand Notes Feed"
            >
              <Columns size={14} className="rail-icon" />
              <span className="rail-label">FEED</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* 3. RIGHT / MAIN STUDIO: Markdown Editor, File Viewer, or AI Drawer */}
        <motion.div
          className="notes-studio-container"
          layout
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {activeNote ? (
            <div className="notes-studio-split-layout">
              <div className="notes-studio-editor-main">
                <NotesEditor
                  activeNote={activeNote}
                  setActiveNote={setActiveNote}
                  saveStatus={saveStatus}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  handleSaveNote={() => {}}
                  handleExport={handleExport}
                  showAiPanel={showAiPanel}
                  setShowAiPanel={setShowAiPanel}
                  onClose={() => setActiveNote(null)}
                />
              </div>

              {showAiPanel && (
                <div className="notes-studio-ai-side">
                  <NotesAIPanel
                    showAiPanel={showAiPanel}
                    isAiExpanded={isAiExpanded}
                    setShowAiPanel={setShowAiPanel}
                    setIsAiExpanded={setIsAiExpanded}
                    handleAiAction={handleAiAction}
                    aiQuestion={aiQuestion}
                    setAiQuestion={setAiQuestion}
                    isAiLoading={isAiLoading}
                    chatHistory={chatHistory}
                    hasActiveNote={!!activeNote}
                    onApplyMarkdown={handleApplyMarkdown}
                    noteTitle={activeNote?.name}
                  />
                </div>
              )}
            </div>
          ) : viewingFile ? (
            <div className="notes-studio-file-view">
              <div className="notes-studio-file-header">
                <div className="studio-file-header-left">
                  <FileText size={16} color="#a599ff" />
                  <span className="studio-file-name" title={viewingFile.name}>{viewingFile.name}</span>
                  {viewingFile.size && (
                    <span className="studio-file-size-chip">
                      {viewingFile.size < 1024 * 1024
                        ? `${(viewingFile.size / 1024).toFixed(0)} KB`
                        : `${(viewingFile.size / (1024 * 1024)).toFixed(1)} MB`}
                    </span>
                  )}
                </div>
                <div className="studio-file-header-actions">
                  {/* Zoom Controls */}
                  <div className="notes-zoom-controls" title="Zoom document preview">
                    <button
                      type="button"
                      className="notes-file-action-btn notes-zoom-btn"
                      onClick={() => setPdfScale(prev => Math.max(0.5, Math.round((prev - 0.15) * 100) / 100))}
                      title="Zoom Out (or Ctrl + Scroll Down)"
                      aria-label="Zoom Out"
                      disabled={pdfScale <= 0.5}
                    >
                      <ZoomOut size={13} />
                    </button>
                    <button
                      type="button"
                      className={`notes-file-action-btn notes-zoom-btn ${pdfScale !== 1 ? 'active-zoom' : ''}`}
                      onClick={() => {
                        setPdfScale(1);
                        setPdfPan({ x: 0, y: 0 });
                      }}
                      title="Reset Zoom to 100%"
                    >
                      <span>{Math.round(pdfScale * 100)}%</span>
                    </button>
                    <button
                      type="button"
                      className="notes-file-action-btn notes-zoom-btn"
                      onClick={() => setPdfScale(prev => Math.min(4.0, Math.round((prev + 0.15) * 100) / 100))}
                      title="Zoom In (or Ctrl + Scroll Up)"
                      aria-label="Zoom In"
                      disabled={pdfScale >= 4.0}
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      type="button"
                      className={`notes-file-action-btn notes-zoom-mode-btn ${isZoomMode ? 'active-zoom-mode' : ''}`}
                      onClick={() => setIsZoomMode(prev => !prev)}
                      title={isZoomMode ? 'Mouse Zoom active (Scroll to zoom, drag to pan). Click to toggle off.' : 'Enable Direct Mouse Zoom (Scroll wheel zooms document directly)'}
                    >
                      <MousePointerClick size={13} />
                      <span>{isZoomMode ? 'Mouse Zoom: ON' : 'Mouse Zoom'}</span>
                    </button>
                    {(pdfScale !== 1 || pdfPan.x !== 0 || pdfPan.y !== 0) && (
                      <button
                        type="button"
                        className="notes-file-action-btn notes-rotate-reset-btn"
                        onClick={() => {
                          setPdfScale(1);
                          setPdfPan({ x: 0, y: 0 });
                        }}
                        title="Reset zoom & position"
                      >
                        <span>Reset Zoom</span>
                      </button>
                    )}
                  </div>

                  {/* Rotation Controls */}
                  <div className="notes-rotate-controls" title="Rotate document orientation">
                    <button
                      type="button"
                      className="notes-file-action-btn notes-rotate-btn"
                      onClick={() => setPdfRotation(prev => (prev - 90 + 360) % 360)}
                      title="Rotate 90° Counter-Clockwise"
                      aria-label="Rotate Counter-Clockwise"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      type="button"
                      className={`notes-file-action-btn notes-rotate-btn ${pdfRotation !== 0 ? 'active-rotation' : ''}`}
                      onClick={() => setPdfRotation(prev => (prev + 90) % 360)}
                      title="Rotate 90° Clockwise"
                      aria-label="Rotate Clockwise"
                    >
                      <RotateCw size={13} />
                      <span>{pdfRotation !== 0 ? `${pdfRotation}°` : 'Rotate'}</span>
                    </button>
                    {pdfRotation !== 0 && (
                      <button
                        type="button"
                        className="notes-file-action-btn notes-rotate-reset-btn"
                        onClick={() => setPdfRotation(0)}
                        title="Reset rotation to 0°"
                      >
                        <span>Reset</span>
                      </button>
                    )}
                  </div>

                  {/* Zen Focus / Full Width PDF Toggle */}
                  <button
                    type="button"
                    className={`notes-file-action-btn ${(!isSidebarOpen && !isFeedOpen) ? 'active' : ''}`}
                    onClick={() => {
                      if (isSidebarOpen || isFeedOpen) {
                        setIsSidebarOpen(false);
                        setIsFeedOpen(false);
                      } else {
                        setIsSidebarOpen(false);
                        setIsFeedOpen(true);
                      }
                    }}
                    title={(!isSidebarOpen && !isFeedOpen) ? 'Show Notes List' : 'Full Width PDF (Maximum Space)'}
                  >
                    {(!isSidebarOpen && !isFeedOpen) ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    <span>{(!isSidebarOpen && !isFeedOpen) ? 'Show Feed' : 'Full Width'}</span>
                  </button>

                  {activeViewingFileUrl && (
                    <>
                      <a
                        href={activeViewingFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="notes-file-action-btn"
                        title="Open in new tab"
                      >
                        <ExternalLink size={13} />
                        <span>Open</span>
                      </a>
                      <a
                        href={activeViewingFileUrl}
                        download={viewingFile.name}
                        className="notes-file-action-btn primary"
                        title="Download File"
                      >
                        <Download size={13} />
                        <span>Download</span>
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setViewingFile(null);
                      setIsSidebarOpen(true);
                      setIsFeedOpen(true);
                    }}
                    className="notes-file-action-btn close-btn"
                    title="Close Document Viewer"
                  >
                    <X size={14} />
                    <span>Close</span>
                  </button>
                </div>
              </div>

              <div
                className="notes-studio-file-body"
                ref={fileBodyRef}
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  userSelect: (pdfScale > 1 || isZoomMode) ? 'none' : 'auto',
                }}
                onMouseDown={handleMouseDown}
                onDoubleClick={handleDoubleClick}
              >
                {/* Drag Pan Invisible Overlay to prevent iframe capturing mouse events */}
                {isDraggingPan && (
                  <div
                    className="notes-pdf-drag-overlay"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 100,
                      cursor: 'grabbing',
                    }}
                  />
                )}

                {activeViewingFileUrl && isPdfOrOfficeDoc ? (
                  <>
                    {isIframeLoading && (
                      <div className="notes-preview-loading-overlay">
                        <div className="notes-preview-loader-card">
                          <div className="notes-preview-spinner-ring">
                            <Loader2 size={24} className="notes-preview-spinner animate-spin" />
                          </div>
                          <div className="notes-preview-loader-info">
                            <h4 className="notes-preview-loader-title">Loading document preview...</h4>
                            <p className="notes-preview-loader-subtitle">{viewingFile.name}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div
                      className="notes-rotatable-wrapper"
                      style={getTransformStyle()}
                    >
                      <iframe
                        src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(activeViewingFileUrl)}`}
                        title={viewingFile.name}
                        className="notes-preview-iframe"
                        onLoad={() => setIsIframeLoading(false)}
                        allow="autoplay"
                        style={{
                          pointerEvents: (isCtrlHeld || isDraggingPan || isZoomMode || pdfScale > 1) ? 'none' : 'auto',
                        }}
                      />
                    </div>
                  </>
                ) : activeViewingFileUrl && isImageDoc ? (
                  <div
                    className="notes-rotatable-wrapper notes-preview-img-container"
                    style={getTransformStyle()}
                  >
                    {isImageLoading && !imageError && (
                      <div className="notes-preview-loading-overlay">
                        <div className="notes-preview-loader-card">
                          <div className="notes-preview-spinner-ring">
                            <Loader2 size={24} className="notes-preview-spinner animate-spin" />
                          </div>
                          <div className="notes-preview-loader-info">
                            <h4 className="notes-preview-loader-title">Loading image preview...</h4>
                            <p className="notes-preview-loader-subtitle">{viewingFile.name}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {imageError ? (
                      <div className="notes-preview-generic-box">
                        <ImageIcon size={44} color="#f87171" />
                        <h4>Image preview unavailable</h4>
                        <p>Unable to display "{viewingFile.name}". The image URL could not be rendered directly in the canvas.</p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <a
                            href={activeViewingFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="notes-file-action-btn primary"
                          >
                            <ExternalLink size={13} />
                            <span>Open Image in New Tab</span>
                          </a>
                          <button
                            type="button"
                            className="notes-file-action-btn"
                            onClick={() => {
                              setImageError(false);
                              setIsImageLoading(true);
                            }}
                          >
                            <span>Retry</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={activeViewingFileUrl}
                        alt={viewingFile.name}
                        className="notes-preview-img"
                        onLoad={() => setIsImageLoading(false)}
                        onError={() => {
                          setIsImageLoading(false);
                          setImageError(true);
                        }}
                        style={{
                          display: isImageLoading ? 'none' : 'block',
                          pointerEvents: (isCtrlHeld || isDraggingPan || isZoomMode || pdfScale > 1) ? 'none' : 'auto',
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="notes-preview-generic-box">
                    <FileText size={48} color="#dba87e" />
                    <h4>{viewingFile.name}</h4>
                    <p>Document preview is not available in browser. Use the download or open link button above.</p>
                    {activeViewingFileUrl && (
                      <a
                        href={activeViewingFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="notes-file-action-btn primary"
                        style={{ marginTop: '0.5rem' }}
                      >
                        <ExternalLink size={13} />
                        <span>Open Document</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Floating Quick Zoom HUD inside Document Canvas */}
                <div className="notes-floating-zoom-hud">
                  <button
                    type="button"
                    className="notes-hud-btn"
                    onClick={() => setPdfScale(prev => Math.max(0.5, Math.round((prev - 0.15) * 100) / 100))}
                    title="Zoom Out"
                    disabled={pdfScale <= 0.5}
                  >
                    <ZoomOut size={13} />
                  </button>
                  <button
                    type="button"
                    className={`notes-hud-pill ${pdfScale !== 1 ? 'active' : ''}`}
                    onClick={() => {
                      setPdfScale(1);
                      setPdfPan({ x: 0, y: 0 });
                    }}
                    title="Click to reset zoom to 100%"
                  >
                    <span>{Math.round(pdfScale * 100)}%</span>
                  </button>
                  <button
                    type="button"
                    className="notes-hud-btn"
                    onClick={() => setPdfScale(prev => Math.min(4.0, Math.round((prev + 0.15) * 100) / 100))}
                    title="Zoom In"
                    disabled={pdfScale >= 4.0}
                  >
                    <ZoomIn size={13} />
                  </button>
                  <div className="notes-hud-divider" />
                  <button
                    type="button"
                    className={`notes-hud-mode-btn ${isZoomMode ? 'active' : ''}`}
                    onClick={() => setIsZoomMode(prev => !prev)}
                    title={isZoomMode ? 'Mouse Zoom active (Scroll to zoom, drag to pan). Click to switch to normal mode.' : 'Click to enable Mouse Wheel Zoom directly without Ctrl'}
                  >
                    <MousePointerClick size={12} />
                    <span>{isZoomMode ? 'Mouse Zoom ON' : 'Scroll Zoom'}</span>
                  </button>
                  {(pdfScale !== 1 || pdfPan.x !== 0 || pdfPan.y !== 0) && (
                    <button
                      type="button"
                      className="notes-hud-reset-btn"
                      onClick={() => {
                        setPdfScale(1);
                        setPdfPan({ x: 0, y: 0 });
                      }}
                      title="Reset view (100% centered)"
                    >
                      <RotateCcw size={11} />
                      <span>Reset</span>
                    </button>
                  )}
                  {pdfScale > 1 && (
                    <span className="notes-hud-pan-hint">🖐️ Drag to pan</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="notes-studio-empty-state">
              <div className="studio-empty-icon-ring">
                <FileText size={26} strokeWidth={1.8} />
              </div>
              <h3>Select a Document or Create a New Note</h3>
              <p>Pick a note from the feed or click "+ New Note" to start writing with Markdown and KaTeX math support.</p>
              <button
                type="button"
                className="notes-primary-add-btn studio-empty-create-btn"
                onClick={handleCreateNote}
                title="Create a new note"
              >
                <Plus size={14} strokeWidth={2.2} className="notes-primary-icon" />
                <span>Create New Note</span>
              </button>
              <div className="notes-studio-empty-features">
                <span className="notes-empty-feature-pill">✍️ Markdown & LaTeX</span>
                <span className="notes-empty-feature-pill">⚡ Instant Cloud Sync</span>
                <span className="notes-empty-feature-pill">✨ S.A.R.A. AI Copilot</span>
                <span className="notes-empty-feature-pill">📄 PDF & Media Vault</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── MODALS ── */}
      {/* New Folder Modal */}
      {newFolderModal && (
        <div className="notes-modal-backdrop" onClick={() => setNewFolderModal(false)}>
          <div className="notes-modal-card" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <div className="notes-modal-title-group">
                <div className="notes-modal-icon-badge">
                  <FolderPlus size={18} />
                </div>
                <div>
                  <h3 className="notes-modal-title">Create New Folder</h3>
                  <p className="notes-modal-subtitle">Organize your notes, documents, and lecture files</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewFolderModal(false)}
                className="notes-modal-close-btn"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="notes-modal-body">
              <div className="notes-modal-field">
                <label className="notes-modal-label">Folder Name</label>
                <input
                  type="text"
                  className="notes-modal-input"
                  placeholder="e.g. Algorithms, Semester 6, Microprocessors..."
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
              </div>

              <div className="notes-modal-field">
                <label className="notes-modal-label">Location (Parent Folder)</label>
                <select
                  className="notes-modal-select"
                  value={newFolderParentId || ''}
                  onChange={e => setNewFolderParentId(e.target.value || null)}
                >
                  <option value="">🏠 Root Level (Vault)</option>
                  {nodes
                    .filter(n => n.type === 'folder')
                    .map(f => (
                      <option key={f.id} value={f.id}>
                        📁 {f.name}
                      </option>
                    ))}
                </select>
                <span className="notes-modal-hint">
                  {newFolderParentId
                    ? `Will be created as a subfolder inside "${nodes.find(n => n.id === newFolderParentId)?.name || 'selected folder'}".`
                    : 'This folder will appear at the root level of your Vault.'}
                </span>
              </div>
            </div>

            <div className="notes-modal-footer">
              <button
                type="button"
                className="notes-btn-cancel"
                onClick={() => setNewFolderModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="notes-btn-confirm"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                <FolderPlus size={15} />
                <span>Create Folder</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal.isOpen && (
        <div className="notes-modal-backdrop" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}>
          <div className="notes-modal-card" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <div className="notes-modal-title-group">
                <div className="notes-modal-icon-badge">
                  <Edit2 size={18} />
                </div>
                <div>
                  <h3 className="notes-modal-title">Rename {renameModal.node?.type === 'folder' ? 'Folder' : 'Document'}</h3>
                  <p className="notes-modal-subtitle">Enter a new title for this item</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}
                className="notes-modal-close-btn"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="notes-modal-body">
              <div className="notes-modal-field">
                <label className="notes-modal-label">Name</label>
                <input
                  type="text"
                  className="notes-modal-input"
                  value={renameModal.newName}
                  onChange={e => setRenameModal(prev => ({ ...prev, newName: e.target.value }))}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleRenameNode()}
                />
              </div>
            </div>

            <div className="notes-modal-footer">
              <button
                type="button"
                className="notes-btn-cancel"
                onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="notes-btn-confirm"
                onClick={handleRenameNode}
                disabled={!renameModal.newName.trim()}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.isOpen}
        title="Delete Item"
        message="Are you sure you want to permanently delete this item? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => handleDeleteNode(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '' })}
      />
    </div>
  );
};
