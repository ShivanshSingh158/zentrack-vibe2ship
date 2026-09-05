import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import type { StorageNode } from '../../types/index';
import {
  Folder, FileText, Trash2, X, Plus, FolderPlus,
  HardDrive, ExternalLink, Sparkles, Upload, Download,
  PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, Columns, LayoutGrid,
  Loader2, RotateCw, RotateCcw
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

  // File Viewer State
  const [viewingFile, setViewingFile] = useState<StorageNode | null>(null);
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [pdfRotation, setPdfRotation] = useState<number>(0);
  const fileBodyRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (viewingFile) {
      setIsIframeLoading(true);
      setPdfRotation(0);
    }
  }, [viewingFile?.id, viewingFile?.url]);

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

    // Filter by tag
    if (selectedTag) {
      const tagLower = selectedTag.toLowerCase();
      result = result.filter(n =>
        (n.tags && n.tags.includes(selectedTag)) ||
        (n.content && n.content.toLowerCase().includes(`#${tagLower}`))
      );
    } else if (isPinnedFilterActive) {
      result = result.filter(n => n.isPinned);
    } else if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.name.toLowerCase().includes(q) ||
        (n.type === 'note' && n.content?.toLowerCase().includes(q))
      );
    } else if (currentFolderId !== null) {
      result = result.filter(n => n.parentId === currentFolderId);
    }

    result.sort((a, b) => {
      if (sortBy === 'newest') return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      if (sortBy === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'size-desc') return (b.size || 0) - (a.size || 0);
      return 0;
    });

    return result;
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
        parentId: currentFolderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setNewFolderName('');
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
      const newPinState = !note.isPinned;
      await updateDoc(doc(db, 'storage_nodes', note.id), {
        isPinned: newPinState,
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
                {isSidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
                <span>Vault</span>
              </button>

              <button
                type="button"
                className={`notes-panel-toggle-btn ${isFeedOpen ? 'active' : ''}`}
                onClick={() => setIsFeedOpen(prev => !prev)}
                title={isFeedOpen ? 'Collapse Feed (Left)' : 'Show Notes Feed'}
              >
                <Columns size={14} />
                <span>Feed</span>
              </button>

              {(!isSidebarOpen || !isFeedOpen) && (
                <button
                  type="button"
                  className="notes-panel-toggle-btn reset"
                  onClick={() => {
                    setIsSidebarOpen(true);
                    setIsFeedOpen(true);
                  }}
                  title="Restore All 3 Panels"
                >
                  <LayoutGrid size={14} />
                  <span>Restore View</span>
                </button>
              )}
            </div>
          </div>

          <span className="notes-stats-subtitle">
            {nodes.filter(n => n.type === 'note' || !n.type).length} Documents • {nodes.filter(n => n.type === 'folder').length} Folders
          </span>
        </div>

        <div className="notes-header-actions">
          {/* File Upload Hidden Input */}
          <label className="notes-action-pill-btn upload-pill">
            <Upload size={13} color="#a599ff" />
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
          >
            <FolderPlus size={14} color="#fad7a1" />
            <span>New Folder</span>
          </button>

          {/* Primary + New Note */}
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

      {/* ── 3-PANE POWER KNOWLEDGE WORKSPACE ── */}
      <div className="notes-power-workspace">
        {/* 1. LEFT SIDEBAR: Folders, Tags, Pinned, Storage Gauge */}
        {isSidebarOpen && (
          <NotesSidebar
            nodes={nodes}
            currentFolderId={currentFolderId}
            setCurrentFolderId={setCurrentFolderId}
            selectedTag={selectedTag}
            setSelectedTag={setSelectedTag}
            isPinnedFilterActive={isPinnedFilterActive}
            setIsPinnedFilterActive={setIsPinnedFilterActive}
            onNewFolder={() => setNewFolderModal(true)}
            onCollapse={() => setIsSidebarOpen(false)}
          />
        )}

        {/* 2. CENTER FEED: Craft Docs Notes Feed */}
        {isFeedOpen && (
          <NotesFeed
            nodes={filteredNodes}
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
            }}
            onTogglePin={handleTogglePin}
            onRename={(node) => setRenameModal({ isOpen: true, node, newName: node.name })}
            onDelete={(id) => setDeleteConfirm({ isOpen: true, id })}
            onCreateNote={handleCreateNote}
            onCollapse={() => setIsFeedOpen(false)}
          />
        )}

        {/* 3. RIGHT / MAIN STUDIO: Markdown Editor, File Viewer, or AI Drawer */}
        <div className="notes-studio-container">
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

                  {/* Zen Focus / Collapse Both Left Panes Toggle */}
                  <button
                    type="button"
                    className="notes-file-action-btn"
                    onClick={() => {
                      if (isSidebarOpen || isFeedOpen) {
                        setIsSidebarOpen(false);
                        setIsFeedOpen(false);
                      } else {
                        setIsSidebarOpen(true);
                        setIsFeedOpen(true);
                      }
                    }}
                    title={(!isSidebarOpen && !isFeedOpen) ? 'Show Left Panels' : 'Full Width PDF (Collapse Left Panels)'}
                  >
                    {(!isSidebarOpen && !isFeedOpen) ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    <span>{(!isSidebarOpen && !isFeedOpen) ? 'Show Panels' : 'Zen Focus'}</span>
                  </button>

                  {viewingFile.url && (
                    <>
                      <a
                        href={viewingFile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="notes-file-action-btn"
                        title="Open in new tab"
                      >
                        <ExternalLink size={13} />
                        <span>Open Link</span>
                      </a>
                      <a
                        href={viewingFile.url}
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
                    onClick={() => setViewingFile(null)}
                    className="btn-icon"
                    title="Close"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="notes-studio-file-body" ref={fileBodyRef} style={{ position: 'relative', overflow: 'hidden' }}>
                {viewingFile.url && (viewingFile.fileType === 'pdf' || viewingFile.mimeType?.includes('pdf') || viewingFile.url?.toLowerCase().endsWith('.pdf') || viewingFile.name?.toLowerCase().endsWith('.pdf') || viewingFile.fileType === 'docx' || viewingFile.name?.toLowerCase().match(/\.(docx?|pptx?|xlsx?)$/i)) ? (
                  <>
                    {isIframeLoading && (
                      <div className="notes-preview-loading-overlay">
                        <Loader2 size={24} className="animate-spin" color="#dba87e" />
                        <span>Loading document preview...</span>
                      </div>
                    )}
                    <div
                      className="notes-rotatable-wrapper"
                      style={
                        (pdfRotation === 90 || pdfRotation === 270) && containerDims.width > 0 && containerDims.height > 0
                          ? {
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              width: `${containerDims.height}px`,
                              height: `${containerDims.width}px`,
                              transform: `translate(-50%, -50%) rotate(${pdfRotation}deg)`,
                              transformOrigin: 'center center',
                              maxWidth: 'none',
                              maxHeight: 'none',
                            }
                          : pdfRotation === 180
                          ? {
                              width: '100%',
                              height: '100%',
                              transform: 'rotate(180deg)',
                              transformOrigin: 'center center',
                            }
                          : {
                              width: '100%',
                              height: '100%',
                              transform: 'none',
                            }
                      }
                    >
                      <iframe
                        src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(viewingFile.url)}`}
                        title={viewingFile.name}
                        className="notes-preview-iframe"
                        onLoad={() => setIsIframeLoading(false)}
                        allow="autoplay"
                      />
                    </div>
                  </>
                ) : viewingFile.url && (viewingFile.fileType === 'image' || viewingFile.mimeType?.startsWith('image/') || viewingFile.url?.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)$/i) || viewingFile.name?.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) ? (
                  <div
                    className="notes-rotatable-wrapper notes-preview-img-container"
                    style={
                      (pdfRotation === 90 || pdfRotation === 270) && containerDims.width > 0 && containerDims.height > 0
                        ? {
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: `${containerDims.height}px`,
                            height: `${containerDims.width}px`,
                            transform: `translate(-50%, -50%) rotate(${pdfRotation}deg)`,
                            transformOrigin: 'center center',
                            maxWidth: 'none',
                            maxHeight: 'none',
                          }
                        : pdfRotation === 180
                        ? {
                            width: '100%',
                            height: '100%',
                            transform: 'rotate(180deg)',
                            transformOrigin: 'center center',
                          }
                        : {
                            width: '100%',
                            height: '100%',
                            transform: 'none',
                          }
                    }
                  >
                    <img
                      src={viewingFile.url}
                      alt={viewingFile.name}
                      className="notes-preview-img"
                    />
                  </div>
                ) : (
                  <div className="notes-preview-generic-box">
                    <FileText size={48} color="#dba87e" />
                    <h4>{viewingFile.name}</h4>
                    <p>Document preview is not available in browser. Use the download or open link button above.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="notes-studio-empty-state">
              <div className="studio-empty-icon-ring">
                <FileText size={36} color="#a599ff" />
              </div>
              <h3>Select a Document or Create a New Note</h3>
              <p>Pick a note from the feed or click "+ New Note" to start writing with Markdown and KaTeX math support.</p>
              <button
                type="button"
                className="notes-primary-add-btn"
                onClick={handleCreateNote}
                style={{ marginTop: '0.5rem' }}
              >
                <Plus size={14} />
                <span>Create New Note</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}
      {/* New Folder Modal */}
      {newFolderModal && (
        <div className="notes-modal-backdrop" onClick={() => setNewFolderModal(false)}>
          <div className="notes-modal-card" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <span className="notes-modal-title">Create Folder</span>
              <button type="button" onClick={() => setNewFolderModal(false)} className="btn-icon">
                <X size={15} />
              </button>
            </div>
            <div className="notes-modal-body">
              <input
                type="text"
                className="notes-modal-input"
                placeholder="Folder name (e.g. Algorithms, Physics...)"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            <div className="notes-modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setNewFolderModal(false)}>Cancel</button>
              <button type="button" className="btn-confirm" onClick={handleCreateFolder}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal.isOpen && (
        <div className="notes-modal-backdrop" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}>
          <div className="notes-modal-card" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <span className="notes-modal-title">Rename</span>
              <button type="button" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })} className="btn-icon">
                <X size={15} />
              </button>
            </div>
            <div className="notes-modal-body">
              <input
                type="text"
                className="notes-modal-input"
                value={renameModal.newName}
                onChange={e => setRenameModal(prev => ({ ...prev, newName: e.target.value }))}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleRenameNode()}
              />
            </div>
            <div className="notes-modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}>Cancel</button>
              <button type="button" className="btn-confirm" onClick={handleRenameNode}>Save</button>
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
