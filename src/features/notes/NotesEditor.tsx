import React, { useRef, useEffect } from 'react';
import {
  ArrowLeft, AlignLeft, Columns, Eye, Download, Sparkles,
  Bold, Italic, Heading1, Heading2, Heading3, Code, List,
  ListOrdered, CheckSquare, Quote, FileDown, CheckCircle2, Clock
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { StorageNode } from '../../types/index';
import { toast } from 'sonner';

export interface NotesEditorProps {
  activeNote: StorageNode;
  setActiveNote: (note: StorageNode | null) => void;
  saveStatus: 'saved' | 'saving' | 'error';
  viewMode: 'split' | 'edit' | 'preview';
  setViewMode: (mode: 'split' | 'edit' | 'preview') => void;
  handleSaveNote: () => void;
  handleExport: (format: 'md' | 'txt' | 'pdf') => void;
  showAiPanel: boolean;
  setShowAiPanel: (show: boolean) => void;
  onClose: () => void;
}

export const NotesEditor: React.FC<NotesEditorProps> = ({
  activeNote,
  setActiveNote,
  saveStatus,
  viewMode,
  setViewMode,
  handleSaveNote,
  handleExport,
  showAiPanel,
  setShowAiPanel,
  onClose
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Native non-passive wheel scroll isolation for preview pane
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      else if (e.deltaMode === 2) delta *= el.clientHeight;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;
      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollBy({ top: delta, behavior: 'auto' });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewMode]);

  // Native non-passive wheel scroll for editor textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      else if (e.deltaMode === 2) delta *= el.clientHeight;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;
      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollBy({ top: delta, behavior: 'auto' });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewMode]);

  // Helper to wrap or insert text around current selection
  const insertFormatting = (prefix: string, suffix = '', defaultText = '') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = activeNote.content || '';
    const selectedText = currentVal.substring(start, end) || defaultText;

    const replacement = `${prefix}${selectedText}${suffix}`;
    const newVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);

    setActiveNote({ ...activeNote, content: newVal });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const insertTimestamp = () => {
    const now = new Date();
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    insertFormatting(`[${mm}:${ss}] `, '');
    toast.success('Inserted timestamp tag');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      {/* ── Studio Top Bar ── */}
      <div className="notes-studio-topbar">
        <div className="notes-studio-topbar-left">
          <button type="button" className="notes-studio-back-btn" onClick={onClose}>
            <ArrowLeft size={14} /> Back to Vault
          </button>

          <input
            type="text"
            className="notes-studio-title-input"
            value={activeNote.name}
            onChange={e => setActiveNote({ ...activeNote, name: e.target.value })}
            placeholder="Untitled Document..."
          />

          <div className={`notes-studio-save-badge ${saveStatus === 'saving' ? 'saving' : ''}`}>
            {saveStatus === 'saving' ? (
              <>⏱ Saving changes...</>
            ) : (
              <>
                <CheckCircle2 size={12} /> Saved
              </>
            )}
          </div>
        </div>

        {/* Top Bar Right Actions */}
        <div className="notes-studio-topbar-actions">
          {/* View Mode Switcher */}
          <div className="lp-speed-selector" style={{ background: 'var(--notes-bg-surface-elevated)' }}>
            <button
              type="button"
              className={`lp-speed-pill ${viewMode === 'edit' ? 'active' : ''}`}
              onClick={() => setViewMode('edit')}
              title="Edit Only"
            >
              <AlignLeft size={13} />
            </button>
            <button
              type="button"
              className={`lp-speed-pill ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Split View"
            >
              <Columns size={13} />
            </button>
            <button
              type="button"
              className={`lp-speed-pill ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="Preview Only"
            >
              <Eye size={13} />
            </button>
          </div>

          {/* Export PDF */}
          <button
            type="button"
            className="notes-action-pill-btn"
            onClick={() => handleExport('pdf')}
            title="Export as PDF Document"
          >
            <Download size={14} />
            <span>PDF</span>
          </button>

          {/* Export Markdown */}
          <button
            type="button"
            className="notes-action-pill-btn"
            onClick={() => handleExport('md')}
            title="Download Markdown File"
          >
            <FileDown size={14} />
            <span>.MD</span>
          </button>

          {/* AI Tools Toggle */}
          <button
            type="button"
            className={`notes-action-pill-btn ${showAiPanel ? 'active-filter' : ''}`}
            onClick={() => setShowAiPanel(!showAiPanel)}
            title="Toggle ZEN-GPT Note Assistant"
          >
            <Sparkles size={14} color="#a599ff" />
            <span>{showAiPanel ? 'Close AI' : 'AI Assistant'}</span>
          </button>
        </div>
      </div>

      {/* ── Markdown Formatting Toolbar ── */}
      <div className="notes-studio-toolbar">
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('# ', '', 'Heading 1')} title="Heading 1">
          <Heading1 size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('## ', '', 'Heading 2')} title="Heading 2">
          <Heading2 size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('### ', '', 'Heading 3')} title="Heading 3">
          <Heading3 size={14} />
        </button>

        <div className="notes-toolbar-sep" />

        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('**', '**', 'bold text')} title="Bold (Ctrl+B)">
          <Bold size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('*', '*', 'italic text')} title="Italic (Ctrl+I)">
          <Italic size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('`', '`', 'code')} title="Inline Code">
          <Code size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('```javascript\n', '\n```', '// code block')} title="Code Block">
          {'{ }'}
        </button>

        <div className="notes-toolbar-sep" />

        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('$', '$', 'E = mc^2')} title="KaTeX Inline Math ($)">
          $x$
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('$$\n', '\n$$', '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}')} title="KaTeX Math Block ($$)">
          $$
        </button>

        <div className="notes-toolbar-sep" />

        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('- ', '', 'List item')} title="Bullet List">
          <List size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('1. ', '', 'Numbered item')} title="Numbered List">
          <ListOrdered size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('- [ ] ', '', 'Task item')} title="Task Checkbox">
          <CheckSquare size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={() => insertFormatting('> ', '', 'Quote text')} title="Blockquote">
          <Quote size={14} />
        </button>
        <button type="button" className="notes-toolbar-btn" onClick={insertTimestamp} title="Insert Timestamp [MM:SS]">
          <Clock size={14} />
        </button>
      </div>

      {/* ── Studio Body (Editor + Live Preview) ── */}
      <div className="notes-studio-body">
        {/* Editor Pane */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className="notes-studio-editor-pane">
            <textarea
              ref={textareaRef}
              className="notes-editor-textarea"
              value={activeNote.content || ''}
              onChange={e => setActiveNote({ ...activeNote, content: e.target.value })}
              placeholder="Start writing notes in Markdown & LaTeX Math... (Use AI Assistant on right for summaries and math formatting)"
            />
          </div>
        )}

        {/* Live KaTeX + Markdown Preview Pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="notes-studio-preview-pane" ref={previewRef}>
            <div className="notes-markdown-body">
              {activeNote.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {activeNote.content}
                </ReactMarkdown>
              ) : (
                <div style={{ color: 'var(--notes-text-tertiary)', fontStyle: 'italic', padding: '1rem 0' }}>
                  Live formatted Markdown and KaTeX math equations will render here as you type...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hidden fully-rendered markdown container for PDF Export */}
        <div style={{ display: 'none' }}>
          <div id="hidden-pdf-export-content" className="notes-markdown-body" style={{ padding: '20px', background: '#ffffff', color: '#000000' }}>
            <h1 style={{ borderBottom: '2px solid #333', paddingBottom: '8px' }}>{activeNote.name}</h1>
            {activeNote.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {activeNote.content}
              </ReactMarkdown>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
