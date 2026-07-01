import React from 'react';
import { Sparkles, X, Columns, Eye, AlignLeft, List, MessageSquare, Bot, User, Edit2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const TypingDots = () => (
  <div style={{ padding: '0.4rem 0.6rem' }}>
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ 
          width: '6px', height: '6px', borderRadius: '50%', 
          background: 'var(--accent-primary)', display: 'inline-block', 
          animation: `typingBounce 1.3s ease-in-out ${i * 0.2}s infinite` 
        }} />
      ))}
    </span>
    <style>{`
      @keyframes typingBounce {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-4px); opacity: 1; }
      }
    `}</style>
  </div>
);

export const extractMarkdownBlocks = (text: string) => {
  const regex = /```(?:markdown)?\n([\s\S]*?)(?:```|$)/g;
  let match;
  const blocks: string[] = [];
  while ((match = regex.exec(text)) !== null) {
    if (match[1].trim()) {
      blocks.push(match[1].trim());
    }
  }
  return blocks;
};

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  model?: string;
}

export interface NotesAIPanelProps {
  showAiPanel: boolean;
  isAiExpanded: boolean;
  setShowAiPanel: (show: boolean) => void;
  setIsAiExpanded: (expanded: boolean) => void;
  handleAiAction: (action: string) => void;
  aiQuestion: string;
  setAiQuestion: (question: string) => void;
  isAiLoading: boolean;
  chatHistory: ChatMessage[];
  hasActiveNote: boolean;
  onApplyMarkdown: (content: string, type: 'replace' | 'append') => void;
}

export const NotesAIPanel: React.FC<NotesAIPanelProps> = ({
  showAiPanel, isAiExpanded, setShowAiPanel, setIsAiExpanded,
  handleAiAction, aiQuestion, setAiQuestion, isAiLoading,
  chatHistory, hasActiveNote, onApplyMarkdown
}) => {
  const renderChatMessage = (msg: ChatMessage, idx: number) => {
    const isModel = msg.role === 'model';
    const blocks = isModel ? extractMarkdownBlocks(msg.text) : [];
    
    // Strip markdown code block wrappers so it renders normally
    let displayText = msg.text || '';
    if (isModel) {
      displayText = displayText.replace(/```(?:markdown)?\n/g, '\n').replace(/```/g, '\n');
    }

    return (
      <div key={idx} style={{ marginBottom: '1rem', background: !isModel ? 'var(--bg-surface-hover)' : 'transparent', padding: '0.75rem', borderRadius: '8px' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: !isModel ? 'var(--text-primary)' : 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isModel ? <Sparkles size={14} /> : <User size={14} />}
          {!isModel ? 'You' : 'Zen AI'}
        </div>
        <div className="markdown-body" style={{ fontSize: '0.9rem' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{displayText}</ReactMarkdown>
        </div>
        {isModel && msg.model && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', fontStyle: 'italic', opacity: 0.8 }}>
            Powered by {msg.model.includes('flash') ? '⚡' : '🧠'} {msg.model.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </div>
        )}
        {blocks.length > 0 && hasActiveNote && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Generated Note Actions</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-primary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', gap: '0.4rem' }} onClick={() => onApplyMarkdown(blocks.join('\n\n'), 'replace')}>
                <Edit2 size={14} /> Replace Note
              </button>
              <button className="btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', gap: '0.4rem' }} onClick={() => onApplyMarkdown(blocks.join('\n\n'), 'append')}>
                <AlignLeft size={14} /> Append
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: showAiPanel ? (isAiExpanded ? '40%' : '350px') : '0px', transition: 'width 0.3s ease', background: 'var(--bg-surface)', borderLeft: showAiPanel ? '1px solid var(--border-subtle)' : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, position: 'relative', top: 0, right: 0, bottom: 0, zIndex: 1 }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap' }}>Zen AI Assistant</h3>
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
        <button className="btn-secondary" onClick={() => handleAiAction('summarize')} disabled={isAiLoading} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', padding: '0.75rem', whiteSpace: 'nowrap' }}>
          <AlignLeft size={16} /> Summarize Note
        </button>
        <button className="btn-secondary" onClick={() => handleAiAction('concepts')} disabled={isAiLoading} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', padding: '0.75rem', whiteSpace: 'nowrap' }}>
          <List size={16} /> Extract Key Concepts
        </button>
        <button className="btn-secondary" onClick={() => handleAiAction('flashcards')} disabled={isAiLoading} style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start', padding: '0.75rem', whiteSpace: 'nowrap' }}>
          <Sparkles size={16} /> Generate Flashcards
        </button>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input 
            type="text" 
            value={aiQuestion} 
            onChange={e => setAiQuestion(e.target.value)}
            placeholder="Ask a question..."
            onKeyDown={e => e.key === 'Enter' && handleAiAction('question')}
            style={{ flex: 1, padding: '0.5rem', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button className="btn-primary" onClick={() => handleAiAction('question')} disabled={isAiLoading || !aiQuestion.trim()} style={{ padding: '0.5rem' }}>
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
        {chatHistory.length === 0 && !isAiLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', textAlign: 'center', opacity: 0.6 }}>
            <Sparkles size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <p>Chat with Zen AI to summarize, explain concepts, or rewrite notes for you.</p>
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
  );
};
