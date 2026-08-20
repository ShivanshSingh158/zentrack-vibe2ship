import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import type { StorageNode } from '../../types/index';
import {
  Folder, FileText, Image as ImageIcon, Trash2, X, ChevronRight,
  Upload, ArrowLeft, MoreVertical, Edit2, Move, Search, Sparkles,
  Download, AlignLeft, Columns, Eye, Loader2, Plus, File, Check,
  FolderPlus, CheckSquare, Square, RefreshCw, FileDown, Pin, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import html2pdf from 'html2pdf.js';
import { startNoteAIChat } from '../../services/gemini';
import { NotesEditor } from './NotesEditor';
import { NotesAIPanel, extractMarkdownBlocks, type ChatMessage } from './NotesAIPanel';

export const NotesModule = () => {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [nodes, setNodes] = useState<StorageNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Search & Sort States
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc'>('newest');

  // Drag & Drop State
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dragTargetFolderId, setDragTargetFolderId] = useState<string | null>(null);

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

  // Context Menu & Move States
  const [contextMenuNode, setContextMenuNode] = useState<StorageNode | null>(null);
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; node: StorageNode | null; newName: string }>({ isOpen: false, node: null, newName: '' });
  const [moveModal, setMoveModal] = useState<{ isOpen: boolean; node: StorageNode | null }>({ isOpen: false, node: null });

  // Note Editor State
  const [activeNote, setActiveNote] = useState<StorageNode | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const activeNoteRef = useRef<StorageNode | null>(null);

  // Note Enhancements State
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const noteAiSession = useRef<any>(null);

  // File Viewer State
  const [viewingFile, setViewingFile] = useState<StorageNode | null>(null);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  // Lock main body scroll when in studio editor or file viewer
  useEffect(() => {
    if (activeNote || viewingFile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeNote, viewingFile]);

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
          const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as StorageNode[];
          setNodes(data);
          setIsLoading(false);
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

  // Filtering and Sorting
  const filteredNodes = useMemo(() => {
    let result = nodes;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.name.toLowerCase().includes(q) ||
        (n.type === 'note' && n.content?.toLowerCase().includes(q))
      );
    } else {
      result = result.filter(n => n.parentId === currentFolderId);
    }

    result.sort((a, b) => {
      if (sortBy === 'newest') return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
      if (sortBy === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'size-desc') return (b.size || 0) - (a.size || 0);
      return 0;
    });

    return result;
  }, [nodes, currentFolderId, searchQuery, sortBy]);

  // Clear selections when folder changes or search changes
  useEffect(() => {
    setSelectedIds([]);
    setIsSelectMode(false);
  }, [currentFolderId, searchQuery]);

  const folders = filteredNodes.filter(n => n.type === 'folder');
  const files = filteredNodes.filter(n => n.type !== 'folder');

  // Breadcrumbs
  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string }[] = [];
    let curr = currentFolderId;
    while (curr) {
      const node = nodes.find(n => n.id === curr);
      if (node) {
        crumbs.unshift({ id: node.id!, name: node.name });
        curr = node.parentId;
      } else {
        break;
      }
    }
    crumbs.unshift({ id: null, name: 'My Storage' });
    return crumbs;
  };

  // Create Folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await addDoc(collection(db, 'storage_nodes'), {
        userId: auth.currentUser!.uid,
        type: 'folder',
        name: newFolderName.trim(),
        parentId: currentFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setNewFolderModal(false);
      setNewFolderName('');
      toast.success("Folder created");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create folder");
    }
  };

  // Create New Note
  const handleCreateNote = async () => {
    try {
      const newNoteData = {
        userId: auth.currentUser!.uid,
        type: 'note' as const,
        name: 'Untitled Note',
        content: '# New Note\n\nStart writing here...',
        parentId: currentFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'storage_nodes'), newNoteData);
      const createdNote: StorageNode = { id: docRef.id, ...newNoteData };
      setActiveNote(createdNote);
      setChatHistory([]);
      setShowAiPanel(false);
      toast.success("Note created");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create note");
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
          updatedAt: Date.now()
        });
        setSaveStatus('saved');
      } catch (err) {
        console.error("Auto-save failed:", err);
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

    setIsUploading(true);
    try {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];
        setUploadProgress(Math.round(((i + 1) / uploadedFiles.length) * 100));

        let fileType: 'pdf' | 'docx' | 'image' | 'file' = 'file';
        if (file.type.includes('pdf')) fileType = 'pdf';
        else if (file.type.includes('word') || file.name.endsWith('.docx')) fileType = 'docx';
        else if (file.type.startsWith('image/')) fileType = 'image';

        const secureUrl = await uploadFileToCloudinary(file);

        await addDoc(collection(db, 'storage_nodes'), {
          userId: auth.currentUser!.uid,
          type: 'file',
          fileType,
          name: file.name,
          url: secureUrl,
          size: file.size,
          mimeType: file.type,
          parentId: currentFolderId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      toast.success("Files uploaded successfully");
    } catch (err) {
      console.error(err);
      toast.error("File upload failed");
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
      console.error("AI Note Chat Error:", err);
      setChatHistory(prev => [...prev, {
        role: 'model',
        text: "⚠️ I encountered an error communicating with Gemini. Please verify your connection or try again."
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
      const element = document.createElement("a");
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
        toast.error("Export failed: Render element not found");
        return;
      }
      const opt = {
        margin: [15, 15],
        filename: `${activeNote.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      toast.loading("Generating PDF...", { id: 'pdf-toast' });
      html2pdf().from(element).set(opt).save().then(() => {
        toast.success("PDF Downloaded", { id: 'pdf-toast' });
      }).catch((e: any) => {
        console.error(e);
        toast.error("PDF generation failed", { id: 'pdf-toast' });
      });
    }
  };

  // Delete Node (Single)
  const handleDeleteNode = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'storage_nodes', id));
      toast.success("Item deleted");
      setDeleteConfirm({ isOpen: false, id: '' });
      if (activeNote?.id === id) setActiveNote(null);
      if (viewingFile?.id === id) setViewingFile(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete item");
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) {
        await deleteDoc(doc(db, 'storage_nodes', id));
      }
      toast.success(`Deleted ${selectedIds.length} items`);
      setSelectedIds([]);
      setIsSelectMode(false);
      setBulkDeleteConfirm(false);
    } catch (err) {
      console.error(err);
      toast.error("Bulk delete failed");
    }
  };

  // Rename Node
  const handleRenameNode = async () => {
    if (!renameModal.node || !renameModal.newName.trim()) return;
    try {
      await updateDoc(doc(db, 'storage_nodes', renameModal.node.id!), {
        name: renameModal.newName.trim(),
        updatedAt: Date.now()
      });
      toast.success("Renamed successfully");
      setRenameModal({ isOpen: false, node: null, newName: '' });
    } catch (err) {
      console.error(err);
      toast.error("Failed to rename");
    }
  };

  // Format Helper
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="notes-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="notes-header-bar">
        <div className="notes-header-left">
          <h1 className="notes-hero-title">Notes Vault</h1>
          <span className="notes-stats-subtitle">
            {folders.length} {folders.length === 1 ? 'folder' : 'folders'} · {files.length} {files.length === 1 ? 'document' : 'documents'}
          </span>
        </div>

        <div className="notes-header-actions">
          {/* New Folder */}
          <button
            type="button"
            className="notes-action-pill-btn folder-pill"
            onClick={() => setNewFolderModal(true)}
          >
            <FolderPlus size={14} color="#fad7a1" />
            <span>New Folder</span>
          </button>

          {/* Upload File */}
          <label className="notes-action-pill-btn upload-pill" style={{ cursor: 'pointer' }}>
            <Upload size={14} color="#38bdf8" />
            <span>{isUploading ? `Uploading ${uploadProgress || ''}%` : 'Upload File'}</span>
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>

          {/* Select Mode */}
          <button
            type="button"
            className={`notes-action-pill-btn ${isSelectMode ? 'active-filter' : ''}`}
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              setSelectedIds([]);
            }}
          >
            <CheckSquare size={14} />
            <span>{isSelectMode ? 'Cancel Selection' : 'Select'}</span>
          </button>

          {/* Sort Selector */}
          <select
            className="notes-action-pill-btn notes-sort-select"
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name-asc">Sort: A to Z</option>
            <option value="name-desc">Sort: Z to A</option>
            <option value="size-desc">Sort: Size</option>
          </select>

          {/* Primary CTA: + New Note */}
          <button
            type="button"
            className="notes-primary-add-btn"
            onClick={handleCreateNote}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* ── SEARCH & BREADCRUMBS NAVIGATION ROW ── */}
      <div className="notes-nav-row">
        {/* Search */}
        <div className="notes-search-bar">
          <Search size={15} color="var(--notes-text-tertiary)" />
          <input
            type="text"
            className="notes-search-input"
            placeholder="Search all notes, tags, Markdown text, or uploaded files..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--notes-text-tertiary)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Breadcrumb Path */}
        {!searchQuery && (
          <div className="notes-breadcrumbs">
            {getBreadcrumbs().map((crumb, idx, arr) => (
              <React.Fragment key={crumb.id || 'root'}>
                <button
                  type="button"
                  className={`notes-crumb-btn ${idx === arr.length - 1 ? 'active' : ''}`}
                  onClick={() => setCurrentFolderId(crumb.id)}
                >
                  {idx === 0 ? <Folder size={13} /> : null}
                  <span>{crumb.name}</span>
                </button>
                {idx < arr.length - 1 && <span className="notes-crumb-sep">/</span>}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── BULK ACTION TOOLBAR ── */}
      {isSelectMode && (
        <div className="notes-bulk-bar">
          <div className="notes-bulk-info">
            <CheckSquare size={16} />
            <span>{selectedIds.length} item(s) selected</span>
          </div>

          <div className="notes-bulk-actions">
            <button
              type="button"
              className="notes-bulk-btn"
              onClick={() => {
                if (selectedIds.length === filteredNodes.length) {
                  setSelectedIds([]);
                } else {
                  setSelectedIds(filteredNodes.map(n => n.id!));
                }
              }}
            >
              {selectedIds.length === filteredNodes.length ? 'Deselect All' : 'Select All'}
            </button>

            {selectedIds.length > 0 && (
              <button
                type="button"
                className="notes-bulk-btn danger"
                onClick={() => setBulkDeleteConfirm(true)}
              >
                <Trash2 size={13} />
                <span>Delete Selected</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── FOLDERS SHELF ── */}
      {folders.length > 0 && !searchQuery && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div className="notes-section-title">Folders</div>
          <div className="notes-folders-grid">
            {folders.map(folder => {
              const childCount = nodes.filter(n => n.parentId === folder.id).length;
              const isSelected = selectedIds.includes(folder.id!);

              return (
                <div
                  key={folder.id}
                  className={`notes-folder-card ${dragTargetFolderId === folder.id ? 'drag-over' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedIds(prev => isSelected ? prev.filter(i => i !== folder.id) : [...prev, folder.id!]);
                    } else {
                      setCurrentFolderId(folder.id!);
                    }
                  }}
                >
                  <div className="notes-folder-left">
                    <div className="notes-folder-icon-box">
                      <Folder size={17} />
                    </div>
                    <div className="notes-folder-meta">
                      <span className="notes-folder-name" title={folder.name}>{folder.name}</span>
                      <span className="notes-folder-count">{childCount} {childCount === 1 ? 'item' : 'items'}</span>
                    </div>
                  </div>

                  {!isSelectMode && (
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ opacity: 0.6 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameModal({ isOpen: true, node: folder, newName: folder.name });
                      }}
                      title="Folder Options"
                    >
                      <MoreVertical size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── NOTES & DOCUMENTS GRID ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div className="notes-section-title">
          {searchQuery ? `Search Results (${files.length})` : 'Documents & Notes'}
        </div>

        {isLoading ? (
          <div className="notes-empty-state">
            <Loader2 size={24} className="lp-spin" color="var(--notes-accent-purple)" />
            <span>Loading your vault...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="notes-empty-state">
            <div className="notes-empty-icon">
              <FileText size={28} />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>No documents found</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--notes-text-tertiary)', maxWidth: 360, margin: 0 }}>
              {searchQuery ? 'No notes matched your search filter.' : 'Create a new Markdown note or upload files to organize your study materials.'}
            </p>
            <button
              type="button"
              className="notes-primary-add-btn"
              onClick={handleCreateNote}
              style={{ marginTop: '0.5rem' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Create Note</span>
            </button>
          </div>
        ) : (
          <div className="notes-nodes-grid">
            {files.map(node => {
              const isNote = node.type === 'note';
              const isPdf = node.fileType === 'pdf';
              const isDocx = node.fileType === 'docx';
              const isImg = node.fileType === 'image';
              const isSelected = selectedIds.includes(node.id!);

              // Word count estimate for note
              const wordCount = isNote && node.content ? node.content.trim().split(/\s+/).length : 0;
              const cleanSnippet = isNote && node.content ? node.content.replace(/^#+\s+/gm, '').trim() : '';

              return (
                <div
                  key={node.id}
                  className={`notes-node-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedIds(prev => isSelected ? prev.filter(i => i !== node.id) : [...prev, node.id!]);
                    } else if (isNote) {
                      setActiveNote(node);
                      noteAiSession.current = null;
                      setChatHistory([]);
                      setShowAiPanel(false);
                    } else {
                      setViewingFile(node);
                    }
                  }}
                >
                  {/* Top Bar with Icon & Actions */}
                  <div className="notes-node-card-top">
                    <div className={`notes-node-type-icon ${isNote ? 'note' : isPdf ? 'pdf' : isDocx ? 'docx' : isImg ? 'image' : 'note'}`}>
                      {isNote ? <FileText size={17} /> : isPdf ? <FileDown size={17} /> : isImg ? <ImageIcon size={17} /> : <File size={17} />}
                    </div>

                    {!isSelectMode && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: 26, height: 26, opacity: 0.6 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameModal({ isOpen: true, node, newName: node.name });
                          }}
                          title="Rename"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          style={{ width: 26, height: 26, opacity: 0.6 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ isOpen: true, id: node.id! });
                          }}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="notes-node-card-content">
                    <h4 className="notes-node-title">{node.name}</h4>
                    {isNote && cleanSnippet && (
                      <p className="notes-node-snippet">{cleanSnippet}</p>
                    )}
                  </div>

                  {/* Footer Meta */}
                  <div className="notes-node-card-bottom">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {isNote ? (
                        <span className="notes-node-tag-badge">Markdown · {wordCount} words</span>
                      ) : (
                        <span className="notes-node-size-badge">{formatSize(node.size)}</span>
                      )}
                    </div>

                    <span>{formatDate(node.updatedAt || node.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── FULLSCREEN 3-PANE NOTE STUDIO ── */}
      {activeNote && (
        <div className="notes-studio-overlay">
          <div style={{ display: 'flex', flex: 1, height: '100%', overflow: 'hidden' }}>
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

            {/* ChatGPT-Style Note AI Companion */}
            {showAiPanel && (
              <div className="notes-studio-ai-pane">
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
                  noteTitle={activeNote.name}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DOCUMENT & FILE VIEWER MODAL ── */}
      {viewingFile && (
        <div className="notes-modal-overlay" onClick={() => setViewingFile(null)}>
          <div
            className="notes-modal-content"
            style={{ maxWidth: '90vw', height: '88vh', padding: '1rem' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="notes-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <FileText size={18} color="var(--notes-accent-purple)" />
                <h3 className="notes-modal-title">{viewingFile.name}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {viewingFile.url && (
                  <>
                    <a
                      href={viewingFile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="notes-action-pill-btn"
                      title="Open in new browser tab"
                    >
                      <ExternalLink size={13} />
                      <span>Open in Tab</span>
                    </a>
                    <a
                      href={viewingFile.url}
                      target="_blank"
                      rel="noreferrer"
                      className="notes-action-pill-btn"
                      download
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </a>
                  </>
                )}
                <button
                  type="button"
                  className="notes-modal-close-btn"
                  onClick={() => setViewingFile(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, background: '#09090b', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {viewingFile.fileType === 'image' ? (
                <img
                  src={viewingFile.url}
                  alt={viewingFile.name}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <iframe
                  src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(viewingFile.url || '')}`}
                  title={viewingFile.name}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE FOLDER MODAL ── */}
      {newFolderModal && (
        <div className="notes-modal-overlay" onClick={() => setNewFolderModal(false)}>
          <div className="notes-modal-content" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">Create New Folder</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setNewFolderModal(false)}>
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              className="notes-search-bar notes-search-input"
              style={{ width: '100%', borderRadius: 10, padding: '0.65rem 0.85rem' }}
              placeholder="Folder Name (e.g. Distributed Systems)..."
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              autoFocus
            />

            <div className="notes-modal-footer">
              <button type="button" className="notes-action-pill-btn" onClick={() => setNewFolderModal(false)}>
                Cancel
              </button>
              <button type="button" className="notes-primary-add-btn" onClick={handleCreateFolder}>
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RENAME MODAL ── */}
      {renameModal.isOpen && (
        <div className="notes-modal-overlay" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}>
          <div className="notes-modal-content" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">Rename Item</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}>
                <X size={18} />
              </button>
            </div>

            <input
              type="text"
              className="notes-search-bar notes-search-input"
              style={{ width: '100%', borderRadius: 10, padding: '0.65rem 0.85rem' }}
              value={renameModal.newName}
              onChange={e => setRenameModal({ ...renameModal, newName: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleRenameNode()}
              autoFocus
            />

            <div className="notes-modal-footer">
              <button type="button" className="notes-action-pill-btn" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}>
                Cancel
              </button>
              <button type="button" className="notes-primary-add-btn" onClick={handleRenameNode}>
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE MODALS ── */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Item"
        message="Are you sure you want to delete this document from your vault? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={() => handleDeleteNode(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '' })}
      />

      <ConfirmDialog
        isOpen={bulkDeleteConfirm}
        title="Delete Selected Items"
        message={`Are you sure you want to delete ${selectedIds.length} selected items?`}
        confirmText="Delete All"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
    </div>
  );
};
