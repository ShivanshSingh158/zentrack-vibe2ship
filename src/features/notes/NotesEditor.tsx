import React from 'react';
import { ArrowLeft, AlignLeft, Columns, Eye, Download, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { StorageNode } from '../../types/index';

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
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '1rem', alignItems: 'center', background: 'var(--bg-surface)' }}>
        <button className="btn-icon" onClick={onClose}><ArrowLeft size={18} /></button>
        <input 
          type="text" 
          value={activeNote.name} 
          onChange={e => setActiveNote({ ...activeNote, name: e.target.value })}
          placeholder="Note Title..."
          style={{ flex: 1, fontFamily: "'Instrument Serif', serif", fontSize: '1.8rem', fontWeight: 400, color: 'white', background: 'transparent', border: 'none', outline: 'none', width: '100%' }}
        />
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Error'}
        </div>
        
        {/* View Mode Toggles */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setViewMode('edit')} className="btn-icon" style={viewMode === 'edit' ? { background: 'rgba(167, 139, 250, 0.15)', borderColor: 'rgba(167, 139, 250, 0.4)', color: '#a78bfa' } : {}} title="Edit"><AlignLeft size={16} /></button>
          <button onClick={() => setViewMode('split')} className="btn-icon" style={viewMode === 'split' ? { background: 'rgba(167, 139, 250, 0.15)', borderColor: 'rgba(167, 139, 250, 0.4)', color: '#a78bfa' } : {}} title="Split"><Columns size={16} /></button>
          <button onClick={() => setViewMode('preview')} className="btn-icon" style={viewMode === 'preview' ? { background: 'rgba(167, 139, 250, 0.15)', borderColor: 'rgba(167, 139, 250, 0.4)', color: '#a78bfa' } : {}} title="Preview"><Eye size={16} /></button>
        </div>

        {/* Export */}
        <button onClick={() => handleExport('pdf')} className="btn-secondary" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <Download size={16} /> Export PDF
        </button>

        {/* AI Tools Toggle */}
        <button 
          onClick={() => setShowAiPanel(!showAiPanel)}
          className="btn-primary" 
          style={{ padding: '0.5rem 0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: showAiPanel ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : 'var(--bg-surface)', color: showAiPanel ? '#fff' : 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }}
        >
          <Sparkles size={16} /> {showAiPanel ? 'Close AI' : 'AI Tools'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Editor Pane */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <textarea 
            value={activeNote.content || ''}
            onChange={e => setActiveNote({ ...activeNote, content: e.target.value })}
            placeholder="Start typing your note (Markdown supported)..."
            style={{ flex: 1, padding: '1.5rem', background: 'transparent', border: 'none', borderRight: viewMode === 'split' ? '1px solid rgba(255,255,255,0.08)' : 'none', color: 'rgba(255,255,255,0.75)', outline: 'none', resize: 'none', fontFamily: "'Inter', sans-serif", fontSize: '0.92rem', lineHeight: 1.75 }}
          />
        )}

        {/* Preview Pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: 'var(--bg-surface)' }}>
            <div className="markdown-body">
              {activeNote.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{activeNote.content}</ReactMarkdown>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.7 }}>Preview will appear here...</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
