import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
// import { uploadFileToCloudinary } from '../../services/cloudinary';
import type { StorageNode } from '../../types/index';
import { Folder, File as FileIcon, FileText, Image as ImageIcon, Trash2, X, ChevronRight, ChevronDown, Upload, ArrowLeft, MoreVertical, Edit2, Move, Search, HardDrive, Sparkles, List, MessageSquare, Download, AlignLeft, Columns, Eye, Loader2, User, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import html2pdf from 'html2pdf.js';
import { startNoteAIChat } from '../../services/gemini';
// import { extractTextFromPdf, extractTextFromDocx } from '../../services/documentParser';
import { NotesEditor } from './NotesEditor';
import { NotesAIPanel } from './NotesAIPanel';

export const NotesModule = () => {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [nodes, setNodes] = useState<StorageNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  // Search & Sort States
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest'|'oldest'|'name-asc'|'name-desc'|'size-desc'>('newest');

  // Drag & Drop State
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  // Bulk Select State
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Modals & Viewer States
  const [isUploading, setIsUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string }>({ isOpen: false, id: '' });
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Context Menu States
  const [contextMenuNode, setContextMenuNode] = useState<StorageNode | null>(null);
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; node: StorageNode | null; newName: string }>({ isOpen: false, node: null, newName: '' });
  const [moveModal, setMoveModal] = useState<{ isOpen: boolean; node: StorageNode | null }>({ isOpen: false, node: null });
  
  // Note Editor State
  const [activeNote, setActiveNote] = useState<StorageNode | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved'|'saving'|'error'>('saved');
  const activeNoteRef = useRef<StorageNode | null>(null);

  // Note Enhancements State
  const [viewMode, setViewMode] = useState<'split'|'edit'|'preview'>('split');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'model', title: string, model?: string}[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const noteAiSession = useRef<any>(null);

  // File Viewer State
  const [viewingFile, setViewingFile] = useState<StorageNode | null>(null);
  const [documentText, setDocumentText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    activeNoteRef.current = activeNote;
  }, [activeNote]);

  // Lock main body scroll when in full-screen editor or viewer
  useEffect(() => {
    if (activeNote || viewingFile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    if (showAiPanel) {
      document.body.classList.add('ai-panel-open');
    } else {
      document.body.classList.remove('ai-panel-open');
    }

    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('ai-panel-open');
    };
  }, [activeNote, viewingFile, showAiPanel]);

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
        console.error("Failed to fetch user admin status", err);
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
  const filteredNodes = React.useMemo(() => {
    let result = nodes;
    
    // If searching globally, ignore current folder logic
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => 
        n.name.toLowerCase().includes(q) || 
        (n.type === 'note' && n.content?.toLowerCase().includes(q))
      );
    } else {
      // Otherwise, show only current directory
      result = result.filter(n => n.parentId === currentFolderId);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt - a.createdAt;
      if (sortBy === 'oldest') return a.createdAt - b.createdAt;
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

  const getParentPath = (parentId: string | null) => {
    if (!parentId) return 'My Storage';
    const crumbs = [];
    let curr: string | null | undefined = parentId;
    while (curr) {
      const node = nodes.find(n => n.id === curr);
      if (node) {
        crumbs.unshift(node.name);
        curr = node.parentId;
      } else {
        break;
      }
    }
    crumbs.unshift('My Storage');
    return crumbs.join(' / ');
  };

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

  const handleNewNote = () => {
    const newNote: StorageNode = {
      userId: auth.currentUser!.uid,
      type: 'note',
      name: '',
      content: '',
      parentId: currentFolderId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setActiveNote(newNote);
  };

  const handleSaveNote = useCallback(async (silent = false) => {
    const noteToSave = activeNoteRef.current;
    if (!noteToSave) return;
    
    setSaveStatus('saving');
    try {
      const noteData = { ...noteToSave, updatedAt: Date.now() };
      if (noteData.id) {
        const { id, ...data } = noteData;
        await updateDoc(doc(db, 'storage_nodes', id), data);
        setSaveStatus('saved');
        if (!silent) toast.success('Saved');
      } else {
        if (!noteData.name.trim() && !noteData.content?.trim()) {
          setSaveStatus('saved');
          return;
        }
        const dRef = await addDoc(collection(db, 'storage_nodes'), {
           ...noteData,
           name: noteData.name || 'Untitled Note'
        });
        const savedNote = { ...noteData, id: dRef.id };
        setActiveNote(savedNote);
        setSaveStatus('saved');
        if (!silent) toast.success('Note created');
      }
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
      if (!silent) toast.error('Failed to save note');
    }
  }, []);

  useEffect(() => {
    if (!activeNote) return;
    const isNewAndEmpty = !activeNote.id && !activeNote.name.trim() && !activeNote.content?.trim();
    if (isNewAndEmpty) return;

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      handleSaveNote(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeNote?.content, activeNote?.name, handleSaveNote]);


  const handleExport = (format: 'md' | 'txt' | 'pdf') => {
    if (!activeNote?.content) {
      toast.error('Note is empty.');
      return;
    }

    if (format === 'pdf') {
      const element = document.createElement('div');
      element.innerHTML = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h1 style="border-bottom: 1px solid #ccc; padding-bottom: 10px;">${activeNote.name || 'Note'}</h1>
          <div class="markdown-body" style="color: #000;">
            ${document.querySelector('.markdown-body')?.innerHTML || activeNote.content}
          </div>
        </div>
      `;
      const opt = {
        margin:       0.5,
        filename:     `${activeNote.name || 'note'}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' as const }
      };
      toast.success('Generating PDF...');
      html2pdf().set(opt).from(element).save();
      return;
    }

    const content = format === 'md' ? activeNote.content : activeNote.content.replace(/[#_*~`]/g, '');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNote.name || 'note'}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    noteAiSession.current = null;
    setChatHistory([]);
  }, [activeNote?.id, viewingFile?.id]);

  const sendChatMessage = async (prompt: string) => {
    if (!prompt.trim()) return;
    
    if (!noteAiSession.current) {
      const contentToAnalyze = activeNote?.content || documentText || '';
      const title = activeNote?.name || viewingFile?.name || '';
      noteAiSession.current = startNoteAIChat(title, contentToAnalyze);
    }
    
    setChatHistory(prev => [...prev, { role: 'user', title: prompt }]);
    setIsAiLoading(true);
    setAiQuestion('');
    
    try {
      let fullText = '';
      const result = await noteAiSession.current.sendMessageStream(prompt, (chunk: string) => {
        fullText = chunk;
        setChatHistory(prev => {
          const newHistory = [...prev];
          if (newHistory[newHistory.length - 1]?.role === 'model') {
            newHistory[newHistory.length - 1].text = fullText;
          } else {
            newHistory.push({ role: 'model', title: fullText });
          }
          return newHistory;
        });
      });
      
      setChatHistory(prev => {
        const newHistory = [...prev];
        if (newHistory[newHistory.length - 1]?.role === 'model') {
          newHistory[newHistory.length - 1].model = result.model;
        }
        return newHistory;
      });
    } catch (err: any) {
      toast.error(err.message || 'AI request failed');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiAction = (action: 'summarize' | 'concepts' | 'flashcards' | 'question') => {
    if (action === 'question') {
      if (!aiQuestion.trim()) { toast.error('Please enter a question.'); return; }
      sendChatMessage(aiQuestion);
    } else if (action === 'summarize') {
      sendChatMessage('Summarize this document into a concise paragraph followed by 3 key bullet points.');
    } else if (action === 'concepts') {
      sendChatMessage('Extract the core concepts, definitions, and important formulas/facts from this document and present them as a clean Markdown list.');
    } else if (action === 'flashcards') {
      sendChatMessage('Generate 5-7 high-yield flashcards (Question & Answer format) based on this document. Format them as bold Q: and A: pairs.');
    }
  };

  const handleAnalyzeDocument = async () => {
    if (!viewingFile || !viewingFile.url) return;
    setShowAiPanel(true);
    if (documentText) return; // Already extracted
    
    setIsExtracting(true);
    setChatHistory([]);
    try {
      let text = '';
      if (viewingFile.fileType === 'pdf') {
        // text = await extractTextFromPdf(viewingFile.url);
        text = "PDF extraction unavailable.";
      } else if (viewingFile.fileType === 'docx') {
        // text = await extractTextFromDocx(viewingFile.url);
        text = "DOCX extraction unavailable.";
      }
      
      if (!text) throw new Error('No text found in document');
      setDocumentText(text);
      toast.success('Document extracted. Ready for AI analysis!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to extract text from document');
      setShowAiPanel(false);
    } finally {
      setIsExtracting(false);
    }
  };

  const closeFileViewer = () => {
    setViewingFile(null);
    setShowAiPanel(false);
    setDocumentText('');
    setChatHistory([]);
    noteAiSession.current = null;
  };

  const handleApplyMarkdown = (markdown: string, mode: 'replace' | 'append') => {
    if (!activeNote) return;
    if (mode === 'replace') {
      setActiveNote({ ...activeNote, content: markdown });
      toast.success('Note content replaced.');
    } else {
      const newContent = (activeNote.content || '') + '\n\n' + markdown;
      setActiveNote({ ...activeNote, content: newContent });
      toast.success('Appended to note.');
    }
  };


  const processFileUpload = async (file: File) => {
    // 50MB limit
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 50MB.');
      return;
    }

    setIsUploading(true);
    const loadingToast = toast.loading(`Uploading ${file.name}...`);

    try {
      // Use Cloudinary for fast, reliable uploads (no Firebase Storage rules needed)
      const result = await Promise.race([
        // uploadFileToCloudinary(file),
        Promise.resolve({ secure_url: "dummy_url", bytes: file.size, public_id: "dummy_id" }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Upload timed out after 2 minutes. Please try again with a smaller file or check your connection.')), 120000)
        ),
      ]);

      const format = file.name.split('.').pop()?.toLowerCase() || '';
      let fileType: 'pdf' | 'docx' | 'image' | 'other' = 'other';
      if (format === 'pdf' || file.type === 'application/pdf') fileType = 'pdf';
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(format) || file.type.startsWith('image/')) fileType = 'image';
      else if (format === 'docx' || file.name.endsWith('.docx')) fileType = 'docx';

      await addDoc(collection(db, 'storage_nodes'), {
        userId: auth.currentUser!.uid,
        type: 'file',
        name: file.name,
        parentId: currentFolderId,
        fileType,
        size: result.size,
        url: result.url,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      toast.success(`${file.name} uploaded successfully!`, { id: loadingToast });
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.message || 'Failed to upload file', { id: loadingToast });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFileUpload(file);
    }
    if (e.target) e.target.value = ''; // reset
  };

  // Drag and Drop Handlers
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDraggingOver(false);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processFileUpload(file);
    }
  };

  const handleRename = async () => {
    if (!renameModal.node || !renameModal.newName.trim()) return;
    try {
      await updateDoc(doc(db, 'storage_nodes', renameModal.node.id!), { 
        name: renameModal.newName.trim(), 
        updatedAt: Date.now() 
      });
      toast.success('Renamed successfully');
      setRenameModal({ isOpen: false, node: null, newName: '' });
      setContextMenuNode(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to rename');
    }
  };

  const handleMove = async (targetFolderId: string | null) => {
    if (!moveModal.node) return;
    try {
      await updateDoc(doc(db, 'storage_nodes', moveModal.node.id!), { 
        parentId: targetFolderId, 
        updatedAt: Date.now() 
      });
      toast.success('Moved successfully');
      setMoveModal({ isOpen: false, node: null });
      setContextMenuNode(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to move item');
    }
  };

  const confirmDeleteNode = async () => {
    try {
      await deleteDoc(doc(db, 'storage_nodes', deleteConfirm.id));
      if (activeNote?.id === deleteConfirm.id) setActiveNote(null);
      if (viewingFile?.id === deleteConfirm.id) setViewingFile(null);
      toast.success('Deleted');
      setDeleteConfirm({ isOpen: false, id: '' });
      setContextMenuNode(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete');
    }
  };

  const confirmBulkDelete = async () => {
    try {
      const promises = selectedIds.map(id => deleteDoc(doc(db, 'storage_nodes', id)));
      await Promise.all(promises);
      toast.success(`${selectedIds.length} items deleted`);
      setSelectedIds([]);
      setIsSelectMode(false);
      setBulkDeleteConfirm(false);
      if (activeNote && selectedIds.includes(activeNote.id!)) setActiveNote(null);
      if (viewingFile && selectedIds.includes(viewingFile.id!)) setViewingFile(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete items');
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 KB';
    const mb = bytes / (1024 * 1024);
    const gb = mb / 1024;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const CLOUDINARY_LIMIT_BYTES = 25 * 1024 * 1024 * 1024; // 25 GB free tier
  const totalUsedBytes = React.useMemo(() => {
    return nodes.reduce((sum, node) => sum + (node.size || 0), 0);
  }, [nodes]);
  const usedPercent = Math.min(100, Math.max(0, (totalUsedBytes / CLOUDINARY_LIMIT_BYTES) * 100));

  const getFileIcon = (node: StorageNode) => {
    if (node.type === 'folder') return <Folder size={32} style={{ color: '#fbbf24' }} />;
    if (node.type === 'note') return <FileText size={32} style={{ color: '#7c3aed' }} />;
    if (node.fileType === 'pdf') return <FileText size={32} style={{ color: '#ef4444' }} />;
    if (node.fileType === 'docx') return <FileText size={32} style={{ color: '#3b82f6' }} />;
    if (node.fileType === 'image') return <ImageIcon size={32} style={{ color: '#10b981' }} />;
    return <FileIcon size={32} style={{ color: 'var(--text-muted)' }} />;
  };

  if (isLoading) return <div style={{ padding: '2rem' }}>Loading Storage...</div>;

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem', textAlign: 'center', background: 'var(--bg-base)' }}>
        <div style={{ background: 'var(--bg-surface)', padding: '3rem', borderRadius: 'var(--radius-lg)', border: '1px solid #fbbf24', boxShadow: '0 10px 40px rgba(251, 191, 36, 0.15)', maxWidth: '500px' }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '1rem', borderRadius: '50%' }}>
              <HardDrive size={48} style={{ color: '#fbbf24' }} />
            </div>
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '1rem', color: '#fbbf24' }}>Premium Storage</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '2rem' }}>
            This feature is only for admin as it costs premium. It solves your one-way storage place for notes, personal documents, and access from anywhere.
          </p>
          <button className="btn-primary" style={{ background: '#fbbf24', color: '#000', fontWeight: 600, border: 'none', padding: '0.75rem 2rem' }} disabled>
            Locked
          </button>
        </div>
      </div>
    );
  }

  // Render Note Editor
  if (activeNote) {
    return (
      <div 
        data-lenis-prevent="true"
        style={{ 
        flex: 1, 
        display: 'flex', 
        overflow: 'hidden', 
        ...(isAiExpanded ? {
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--bg-base)'
        } : {
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          background: 'var(--bg-base)'
        })
      }}>
        <NotesEditor 
          activeNote={activeNote}
          setActiveNote={setActiveNote}
          saveStatus={saveStatus}
          viewMode={viewMode}
          setViewMode={setViewMode}
          handleSaveNote={handleSaveNote}
          handleExport={handleExport}
          showAiPanel={showAiPanel}
          setShowAiPanel={setShowAiPanel}
          onClose={() => { handleSaveNote(); setActiveNote(null); setShowAiPanel(false); }}
        />
        <NotesAIPanel 
          showAiPanel={showAiPanel}
          isAiExpanded={isAiExpanded}
          setShowAiPanel={setShowAiPanel}
          setIsAiExpanded={setIsAiExpanded}
          handleAiAction={handleAiAction}
          aiQuestion={aiQuestion}
          setAiQuestion={setAiQuestion}
          isAiLoading={isAiLoading}
          chatHistory={chatHistory as any}
          hasActiveNote={!!activeNote}
          onApplyMarkdown={handleApplyMarkdown}
        />
      </div>
    );
  }

  // Render File Viewer Modal
  if (viewingFile) {
    return (
      <div 
        data-lenis-prevent="true"
        style={{ 
        display: 'flex', 
        height: '100%', 
        overflow: 'hidden',
        ...(isAiExpanded ? {
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--bg-base)'
        } : {
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          background: 'var(--bg-base)'
        })
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', transition: 'all 0.3s' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button className="btn-icon" onClick={closeFileViewer}><ArrowLeft size={18} /></button>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{viewingFile.name}</h2>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <a href={viewingFile.url} target="_blank" rel="noreferrer" className="btn-secondary" style={{ textDecoration: 'none' }}>Download Original</a>
              {(viewingFile.fileType === 'pdf' || viewingFile.fileType === 'docx') && (
                <button 
                  onClick={() => {
                    if (showAiPanel) {
                      setShowAiPanel(false);
                    } else {
                      handleAnalyzeDocument();
                    }
                  }}
                  className="btn-primary" 
                  style={{ padding: '0.5rem 0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: showAiPanel ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : 'var(--bg-surface)', color: showAiPanel ? '#fff' : 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}
                >
                  <Sparkles size={16} /> {showAiPanel ? 'Close AI' : 'Analyze Document'}
                </button>
              )}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', padding: '1rem', background: 'var(--bg-base)' }}>
            {viewingFile.fileType === 'image' && (
              <img src={viewingFile.url} alt={viewingFile.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
            )}
            {viewingFile.fileType === 'pdf' && (
              <iframe data-lenis-prevent="true" src={viewingFile.url} width="100%" height="100%" style={{ border: 'none', borderRadius: '8px', background: 'white', pointerEvents: 'auto' }} title={viewingFile.name} />
            )}
            {viewingFile.fileType === 'docx' && (
              <iframe 
                data-lenis-prevent="true"
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(viewingFile.url!)}&embedded=true`} 
                width="100%" 
                height="100%" 
                style={{ border: 'none', borderRadius: '8px', background: 'white', pointerEvents: 'auto' }} 
                title={viewingFile.name} 
              />
            )}
            {viewingFile.fileType === 'other' && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <FileIcon size={64} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
                <p>No preview available for this file type.</p>
                <a href={viewingFile.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline', marginTop: '1rem', display: 'inline-block' }}>Download File</a>
              </div>
            )}
          </div>
        </div>

        {/* AI Panel for File Viewer */}
        <div style={{ width: showAiPanel ? (isAiExpanded ? '40%' : '350px') : '0px', transition: 'width 0.3s ease', background: 'var(--bg-surface)', borderLeft: showAiPanel ? '1px solid var(--border-subtle)' : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, position: 'relative', top: 0, right: 0, bottom: 0, zIndex: 1 }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} style={{ color: 'var(--accent-primary)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap' }}>Document AI</h3>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-icon" onClick={() => setIsAiExpanded(!isAiExpanded)} title={isAiExpanded ? "Collapse" : "Expand"}>
                {isAiExpanded ? <Columns size={16} /> : <Eye size={16} />}
              </button>
              <button className="btn-icon" onClick={() => { setShowAiPanel(false); setIsAiExpanded(false); }}>
                <X size={16} />
              </button>
            </div>
          </div>
          
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <button className="btn-secondary" onClick={() => handleAiAction('summarize')} disabled={isAiLoading || isExtracting} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', padding: '0.75rem', whiteSpace: 'nowrap' }}>
              <AlignLeft size={16} /> Summarize Document
            </button>
            <button className="btn-secondary" onClick={() => handleAiAction('concepts')} disabled={isAiLoading || isExtracting} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', padding: '0.75rem', whiteSpace: 'nowrap' }}>
              <List size={16} /> Extract Key Concepts
            </button>
            <button className="btn-secondary" onClick={() => handleAiAction('flashcards')} disabled={isAiLoading || isExtracting} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', padding: '0.75rem', whiteSpace: 'nowrap' }}>
              <Sparkles size={16} /> Generate Flashcards
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input 
                type="text" 
                value={aiQuestion} 
                onChange={e => setAiQuestion(e.target.value)}
                placeholder="Ask about this document..."
                onKeyDown={e => e.key === 'Enter' && handleAiAction('question')}
                style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
              />
              <button className="btn-primary" onClick={() => handleAiAction('question')} disabled={isAiLoading || isExtracting || !aiQuestion.trim()} style={{ padding: '0.5rem' }}>
                <MessageSquare size={16} />
              </button>
            </div>
          </div>

          <div 
            data-lenis-prevent="true" 
            onWheel={(e) => e.stopPropagation()}
            style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
            className="ai-chat-scroll"
          >
            {isExtracting ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', gap: '1rem', textAlign: 'center' }}>
                <Loader2 size={24} className="animate-spin" />
                <span>Extracting text from {viewingFile.fileType?.toUpperCase() || 'DOCUMENT'}...<br/><small style={{opacity:0.7}}>(This may take a moment for large files)</small></span>
              </div>
            ) : chatHistory.length === 0 && !isAiLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', textAlign: 'center', opacity: 0.6 }}>
                <Sparkles size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>Use AI to summarize, extract concepts, or generate flashcards directly from this document.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {chatHistory.map((msg, idx) => renderChatMessage(msg, idx))}
                {isAiLoading && (
                  <div style={{ 
                    display: 'flex', flexDirection: 'column', 
                    alignItems: 'flex-start', 
                    marginBottom: '1.25rem', padding: '0 0.5rem',
                    animation: 'fadeIn 0.3s ease-out'
                  }}>
                    <div style={{ 
                      display: 'flex', alignItems: 'center', gap: '0.5rem', 
                      marginBottom: '0.35rem', 
                      color: 'var(--accent-primary)', 
                      fontSize: '0.85rem', fontWeight: 600,
                    }}>
                      <Bot size={14} /> Zen AI
                    </div>
                    <div className="markdown-body chat-markdown" style={{ 
                      background: 'transparent',
                      padding: '0 0.5rem',
                      borderRadius: '0',
                      maxWidth: '90%'
                    }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Helper to render Context Menu
  const renderContextMenu = () => {
    if (!contextMenuNode) return null;
    return (
      <div 
        className="context-menu" 
        onClick={(e) => e.stopPropagation()} 
        onMouseLeave={() => setContextMenuNode(null)}
        style={{ position: 'absolute', right: '10px', top: '40px', backgroundColor: '#111827', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '0.5rem', zIndex: 9999, boxShadow: '0 10px 40px rgba(0,0,0,0.8)', minWidth: '150px' }}
      >
        <button className="menu-btn" onClick={() => { setRenameModal({ isOpen: true, node: contextMenuNode, newName: contextMenuNode.name }); setContextMenuNode(null); }}>
          <Edit2 size={14} /> Rename
        </button>
        <button className="menu-btn" onClick={() => { setMoveModal({ isOpen: true, node: contextMenuNode }); setContextMenuNode(null); }}>
          <Move size={14} /> Move To...
        </button>
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '0.25rem 0' }} />
        <button className="menu-btn text-danger" onClick={() => { setDeleteConfirm({ isOpen: true, id: contextMenuNode.id! }); setContextMenuNode(null); }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    );
  };

  // Helper to render Move Folder Tree
  const renderMoveTree = (parentId: string | null, depth: number = 0) => {
    const children = nodes.filter(n => n.type === 'folder' && n.parentId === parentId);
    if (children.length === 0) return null;
    return children.map(folder => {
      // Don't allow moving a folder into itself or its own children
      if (folder.id === moveModal.node?.id) return null;
      return (
        <div key={folder.id}>
          <button 
            className="menu-btn" 
            style={{ paddingLeft: `${depth * 1.5 + 1}rem`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={() => handleMove(folder.id!)}
          >
            <Folder size={14} style={{ color: '#fbbf24' }} /> {folder.name}
          </button>
          {renderMoveTree(folder.id!, depth + 1)}
        </div>
      );
    });
  };

  // Main Drive UI
  return (
    <div 
      style={{ padding: '2rem', height: '100%', overflowY: 'auto', position: 'relative' }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDraggingOver && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(99, 102, 241, 0.1)', border: '4px dashed var(--accent-primary)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '1rem', margin: '1rem', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-surface)', padding: '2rem 4rem', borderRadius: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <Upload size={48} style={{ color: 'var(--accent-primary)' }} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Drop files here to upload</h2>
            <p style={{ color: 'var(--text-muted)' }}>They will be instantly uploaded to {getBreadcrumbs()[getBreadcrumbs().length - 1].name}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="storage-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
          {searchQuery ? (
            <span style={{ color: 'var(--text-primary)' }}>Search Results</span>
          ) : (
            getBreadcrumbs().map((crumb, idx, arr) => (
              <React.Fragment key={crumb.id || 'root'}>
                <button 
                  onClick={() => setCurrentFolderId(crumb.id)}
                  style={{ background: 'none', border: 'none', color: idx === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 'inherit', fontWeight: 'inherit', padding: 0 }}
                >
                  {crumb.name}
                </button>
                {idx < arr.length - 1 && <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
              </React.Fragment>
            ))
          )}
        </div>
        
        <div className="storage-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'nowrap', overflow: 'visible' }}>
          {isSelectMode ? (
            <>
              <button className="storage-action-btn" onClick={() => { setIsSelectMode(false); setSelectedIds([]); }}>
                Cancel Selection
              </button>
              {selectedIds.length > 0 && (
                <button className="storage-action-btn" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }} onClick={() => setBulkDeleteConfirm(true)}>
                  <Trash2 size={16} /> Delete Selected ({selectedIds.length})
                </button>
              )}
            </>
          ) : (
            <button className="storage-action-btn" onClick={() => setIsSelectMode(true)}>
              Select Items
            </button>
          )}

          <div style={{ position: 'relative' }} className="storage-search-container">
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search all files..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '0.5rem 1rem 0.5rem 2.25rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.9rem', width: '200px' }}
            />
            {searchQuery && (
              <X size={14} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSearchQuery('')} />
            )}
          </div>
          
          <div className="dropdown-container" style={{ position: 'relative', flexShrink: 0 }}>
            <div 
              className="storage-sort-select"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}
            >
              <span>
                {sortBy === 'newest' ? 'Newest First' : 
                 sortBy === 'oldest' ? 'Oldest First' : 
                 sortBy === 'name-asc' ? 'Name (A-Z)' : 
                 sortBy === 'name-desc' ? 'Name (Z-A)' : 
                 'Largest Size'}
              </span>
              <ChevronDown size={14} />
            </div>
            <div className="dropdown-menu" style={{ display: 'none', position: 'absolute', top: '100%', right: 0, width: '100%', minWidth: '150px', paddingTop: '0.5rem', zIndex: 100 }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                {['newest', 'oldest', 'name-asc', 'name-desc', 'size-desc'].map(val => (
                  <div 
                    key={val}
                    onClick={() => setSortBy(val)}
                    className="menu-btn"
                    style={{ color: sortBy === val ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                  >
                    {val === 'newest' ? 'Newest First' : 
                     val === 'oldest' ? 'Oldest First' : 
                     val === 'name-asc' ? 'Name (A-Z)' : 
                     val === 'name-desc' ? 'Name (Z-A)' : 
                     'Largest Size'}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button className="storage-action-btn" onClick={() => { setNewFolderName(''); setNewFolderModal(true); }}>
            <Folder size={16} /> New Folder
          </button>
          <button className="storage-action-btn" onClick={handleNewNote}>
            <FileText size={16} /> New Note
          </button>
          <label className={`storage-action-btn storage-upload-btn ${isUploading ? 'disabled' : ''}`} style={{ cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload File'}
            <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.gif" />
          </label>
        </div>
      </div>

      {/* Grid View */}
      {filteredNodes.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Folder size={48} style={{ color: 'var(--border-hover)', marginBottom: '1rem' }} />
          <h3>{searchQuery ? 'No matching files found' : 'This folder is empty'}</h3>
          {!searchQuery && (
            <>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Create a new folder, add a markdown note, or drag and drop files here.</p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-secondary" onClick={() => { setNewFolderName(''); setNewFolderModal(true); }}>
                  <Folder size={16} /> New Subfolder
                </button>
                <label className={`btn-primary ${isUploading ? 'disabled' : ''}`} style={{ cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload File Here'}
                  <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.gif" />
                </label>
              </div>
            </>
          )}
        </div>
      ) : (
        <div onClick={() => setContextMenuNode(null)}>
          {folders.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Folders</h4>
              <div className="storage-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {folders.map(folder => (
                  <div 
                    key={folder.id} 
                    className="storage-node"
                    onClick={() => {
                      if (isSelectMode) {
                        if (selectedIds.includes(folder.id!)) setSelectedIds(selectedIds.filter(id => id !== folder.id));
                        else setSelectedIds([...selectedIds, folder.id!]);
                      } else {
                        setCurrentFolderId(folder.id!);
                      }
                    }}
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', transition: 'border-color 0.2s', position: 'relative' }}
                  >
                    {isSelectMode && (
                      <input 
                        type="checkbox" 
                        className="storage-checkbox" 
                        onClick={(e) => e.stopPropagation()} 
                        checked={selectedIds.includes(folder.id!)} 
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds([...selectedIds, folder.id!]);
                          else setSelectedIds(selectedIds.filter(id => id !== folder.id));
                        }} 
                      />
                    )}
                    <Folder size={24} style={{ color: '#fbbf24', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.95rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{folder.name}</span>
                    <button 
                      className="more-btn btn-icon" 
                      onClick={(e) => { e.stopPropagation(); setContextMenuNode(folder); }} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {contextMenuNode?.id === folder.id && renderContextMenu()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Files & Notes</h4>
              <div className="storage-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                {files.map(file => (
                  <div 
                    key={file.id} 
                    className="storage-node file-card"
                    onClick={() => {
                      if (isSelectMode) {
                        if (selectedIds.includes(file.id!)) setSelectedIds(selectedIds.filter(id => id !== file.id));
                        else setSelectedIds([...selectedIds, file.id!]);
                      } else {
                        file.type === 'note' ? setActiveNote(file) : setViewingFile(file);
                      }
                    }}
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', overflow: 'visible', position: 'relative' }}
                  >
                    {isSelectMode && (
                      <input 
                        type="checkbox" 
                        className="storage-checkbox" 
                        onClick={(e) => e.stopPropagation()} 
                        checked={selectedIds.includes(file.id!)} 
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds([...selectedIds, file.id!]);
                          else setSelectedIds(selectedIds.filter(id => id !== file.id));
                        }} 
                        style={{ position: 'absolute', left: '0.5rem', top: '0.5rem', zIndex: 10 }}
                      />
                    )}
                    <div style={{ height: '120px', background: 'var(--bg-base)', display: 'flex', justifyContent: 'center', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)' }}>
                      {getFileIcon(file)}
                    </div>
                    <div style={{ padding: '0.75rem' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.25rem' }}>{file.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {searchQuery ? getParentPath(file.parentId) : file.type === 'note' ? 'Markdown Note' : formatSize(file.size)}
                      </div>
                    </div>
                    <button 
                      className="more-btn btn-icon" 
                      onClick={(e) => { e.stopPropagation(); setContextMenuNode(file); }} 
                      style={{ position: 'absolute', right: '0.5rem', top: '0.5rem', background: 'var(--bg-surface)', borderRadius: '50%', padding: '0.4rem', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {contextMenuNode?.id === file.id && renderContextMenu()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Styles for this module */}
      <style>{`
        .storage-node:hover { border-color: var(--accent-primary) !important; }
        .more-btn { opacity: 0.5; transition: opacity 0.2s, color 0.2s, background 0.2s; }
        .storage-node:hover .more-btn { opacity: 1; }
        .more-btn:hover { color: var(--text-primary) !important; background: var(--bg-base) !important; }
        .menu-btn { width: 100%; text-align: left; padding: 0.5rem 0.75rem; background: none; border: none; color: var(--text-secondary); cursor: pointer; border-radius: 4px; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
        .menu-btn:hover { background: var(--bg-base); color: var(--text-primary); }
        .menu-btn.text-danger:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .storage-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent-primary); }
        .dropdown-container:hover .dropdown-menu { display: block !important; }

        .storage-action-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--text-secondary);
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .storage-action-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: var(--text-primary);
        }
        .storage-upload-btn {
          background: rgba(124, 58, 237, 0.15) !important;
          color: #a78bfa !important;
          border: 1px solid rgba(124, 58, 237, 0.3) !important;
        }
        .storage-upload-btn:hover {
          background: rgba(124, 58, 237, 0.25) !important;
          color: #ddd6fe !important;
          border-color: rgba(124, 58, 237, 0.5) !important;
        }
        .storage-search-container input, .storage-sort-select {
          padding: 0.5rem 1rem !important;
          font-size: 0.85rem !important;
          border-radius: var(--radius-md) !important;
          background: rgba(255, 255, 255, 0.03) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          color: var(--text-primary) !important;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .storage-sort-select {
          width: auto !important;
          min-width: 120px;
        }

        /* Custom Scrollbar for AI Chat */
        .ai-chat-scroll {
          /* Fallback for Firefox */
          scrollbar-width: thin;
          scrollbar-color: rgba(130, 170, 255, 0.15) transparent;
          overscroll-behavior: contain;
        }
        .ai-chat-scroll::-webkit-scrollbar { width: 6px; }
        .ai-chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .ai-chat-scroll::-webkit-scrollbar-thumb { background: rgba(130, 170, 255, 0.15); border-radius: 10px; }
        .ai-chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(130, 170, 255, 0.3); }

        /* Desktop Only Spacious Button Styles */
        @media (min-width: 768px) {
          .storage-actions { gap: 1rem !important; }


          .storage-search-container input {
            padding-left: 2.5rem !important;
          }
          .storage-search-container input:focus, .storage-sort-select:focus {
            background: rgba(255, 255, 255, 0.06) !important;
            border-color: rgba(255, 255, 255, 0.2) !important;
            outline: none;
          }
        }
      `}</style>

      {/* Storage Usage Indicator */}
      <div className="hide-on-mobile" style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 50, minWidth: '250px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><HardDrive size={14} /> Storage Usage</span>
          <span style={{ color: 'var(--text-muted)' }}>{formatSize(totalUsedBytes)} / 25 GB</span>
        </div>
        <div style={{ height: '6px', background: 'var(--bg-base)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.25rem' }}>
          <div style={{ height: '100%', width: `${usedPercent}%`, background: usedPercent > 90 ? '#ef4444' : 'var(--accent-primary)', transition: 'width 0.3s' }}></div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          {usedPercent.toFixed(1)}% used (Cloudinary Free Tier)
        </div>
      </div>

      {/* Rename Modal */}
      {renameModal.isOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRenameModal({ isOpen: false, node: null, newName: '' }); }}>
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Rename Item</h2>
              <button className="btn-icon" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}><X size={20} /></button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <input 
                type="text" 
                value={renameModal.newName}
                onChange={e => setRenameModal({ ...renameModal, newName: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                autoFocus
                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)', marginBottom: '1rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button className="btn-secondary" onClick={() => setRenameModal({ isOpen: false, node: null, newName: '' })}>Cancel</button>
                <button className="btn-primary" onClick={handleRename} disabled={!renameModal.newName.trim()}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {moveModal.isOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setMoveModal({ isOpen: false, node: null }); }}>
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Move Item To...</h2>
              <button className="btn-icon" onClick={() => setMoveModal({ isOpen: false, node: null })}><X size={20} /></button>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
              <button 
                className="menu-btn" 
                style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', background: moveModal.node?.parentId === null ? 'var(--bg-base)' : 'transparent' }}
                onClick={() => handleMove(null)}
              >
                <Folder size={16} /> My Storage (Root)
              </button>
              {renderMoveTree(null, 1)}
            </div>
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
               <button className="btn-secondary" onClick={() => setMoveModal({ isOpen: false, node: null })}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setNewFolderModal(false); }}>
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Create New Folder</h2>
              <button className="btn-icon" onClick={() => setNewFolderModal(false)}><X size={20} /></button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <input 
                type="text" 
                placeholder="Folder Name" 
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                autoFocus
                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: 'var(--text-primary)', marginBottom: '1rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button className="btn-secondary" onClick={() => setNewFolderModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog 
        open={deleteConfirm.isOpen}
        title="Delete Item"
        message="Are you sure you want to delete this? If it's a folder, all contents inside will be orphaned or deleted."
        onConfirm={confirmDeleteNode}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '' })}
      />

      <ConfirmDialog 
        open={bulkDeleteConfirm}
        title="Delete Selected Items"
        message={`Are you sure you want to delete ${selectedIds.length} item(s)? Folders will be deleted along with their internal references.`}
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
    </div>
  );
};
