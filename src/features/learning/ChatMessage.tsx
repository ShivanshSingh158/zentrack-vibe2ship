import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, User, AlertCircle, Copy, Check, Maximize2, Minimize2 } from 'lucide-react';
import { auth } from '../../services/firebase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  ts: number;
  error?: boolean;
  model?: string;
  followUps?: string[];
}

// ── Code syntax highlighting (inline, no external lib) ───────────────────────

const KEYWORD_COLORS: Record<string, string> = {
  const: '#c792ea', let: '#c792ea', var: '#c792ea', function: '#82aaff',
  return: '#c792ea', if: '#c792ea', else: '#c792ea', for: '#c792ea',
  while: '#c792ea', class: '#ffcb6b', import: '#c792ea', export: '#c792ea',
  from: '#c792ea', async: '#c792ea', await: '#c792ea', new: '#c792ea',
  def: '#82aaff', print: '#82aaff', range: '#82aaff', len: '#82aaff',
  int: '#c792ea', void: '#c792ea', include: '#f07178',
  true: '#ff9cac', false: '#ff9cac', null: '#ff9cac', undefined: '#ff9cac',
  this: '#f07178', self: '#f07178',
};

const highlightCode = (code: string): React.ReactNode => {
  const tokens = code.split(/(\b\w+\b|"[^"]*"|'[^']*'|`[^`]*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|\d+\.?\d*)/g);
  return tokens.map((tok, i) => {
    if (/^["'`]/.test(tok)) return <span key={i} style={{ color: '#c3e88d' }}>{tok}</span>;
    if (/^\/\//.test(tok) || /^\/\*/.test(tok)) return <span key={i} style={{ color: '#546e7a', fontStyle: 'italic' }}>{tok}</span>;
    if (/^\d/.test(tok)) return <span key={i} style={{ color: '#f78c6c' }}>{tok}</span>;
    if (KEYWORD_COLORS[tok]) return <span key={i} style={{ color: KEYWORD_COLORS[tok] }}>{tok}</span>;
    return tok;
  });
};

const CodeBlock = ({ codeLang, codeLines }: { codeLang: string; codeLines: string[] }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lang = codeLang.trim() || 'code';

  const renderContent = (expanded: boolean) => (
    <div style={{
      width: expanded ? '90vw' : '100%',
      maxWidth: expanded ? '1200px' : '100%',
      height: expanded ? '85vh' : 'auto',
      maxHeight: expanded ? '85vh' : '400px',
      margin: expanded ? 'auto' : '0.6rem 0',
      borderRadius: '10px',
      overflow: 'hidden',
      border: '1px solid rgba(130,170,255,0.15)',
      boxShadow: expanded ? '0 24px 80px rgba(0,0,0,0.8)' : '0 4px 20px rgba(0,0,0,0.4)',
      display: 'flex',
      flexDirection: 'column',
      pointerEvents: 'auto',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{ background: 'rgba(20,22,35,0.95)', padding: '0.45rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
          </div>
          <span style={{ fontSize: '0.65rem', color: '#546e7a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lang}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={handleCopy} style={{ background: copied ? 'rgba(40,200,64,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${copied ? 'rgba(40,200,64,0.3)' : 'rgba(255,255,255,0.08)'}`, color: copied ? '#28c840' : 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '5px', transition: 'all 0.2s', fontWeight: 600 }}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={() => setIsExpanded(!expanded)} title={expanded ? "Minimize" : "Expand code"} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.2rem 0.4rem', borderRadius: '5px', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}>
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>
      <pre style={{ margin: 0, padding: '1rem 1.2rem', background: 'rgba(12,14,22,0.98)', overflow: 'auto', flex: 1, fontSize: expanded ? '0.85rem' : '0.76rem', lineHeight: 1.65, color: '#a6accd', fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace", scrollbarWidth: 'thin', scrollbarColor: 'rgba(130,170,255,0.2) transparent' }}>
        <code>
          {codeLines.map((line, i) => (
            <span key={i} style={{ display: 'block' }}>{highlightCode(line)}</span>
          ))}
        </code>
      </pre>
    </div>
  );

  return (
    <>
      {!isExpanded && renderContent(false)}
      {isExpanded && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(5, 5, 10, 0.75)', backdropFilter: 'blur(12px)',
          animation: 'fadeIn 0.2s ease-out forwards',
          padding: '2rem'
        }} onClick={() => setIsExpanded(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', height: '100%', display: 'flex' }}>
            {renderContent(true)}
          </div>
        </div>,
        document.body
      )}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
};

// ── Markdown renderer ─────────────────────────────────────────────────────────

const renderMarkdown = (text: string): React.ReactNode => {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let codeLang = '';

  const renderInline = (line: string, key: string | number): React.ReactNode => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
    return (
      <span key={key}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i} style={{ color: '#e8eaf0', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
          if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**'))
            return <em key={i} style={{ color: '#c792ea', fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
          if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
            return <code key={i} style={{ background: 'rgba(130,170,255,0.12)', color: '#82aaff', padding: '0.12rem 0.38rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.8em', border: '1px solid rgba(130,170,255,0.15)' }}>{part.slice(1, -1)}</code>;
          return part;
        })}
      </span>
    );
  };

  lines.forEach((line, li) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      if (!inCode) { inCode = true; codeLang = trimmed.slice(3).trim() || 'code'; codeLines = []; }
      else { inCode = false; result.push(<CodeBlock key={`cb-${li}`} codeLang={codeLang} codeLines={codeLines} />); codeLines = []; codeLang = ''; }
      return;
    }
    if (inCode) { codeLines.push(line); return; }
    if (!trimmed) { result.push(<div key={li} style={{ height: '0.4rem' }} />); return; }

    if (trimmed.startsWith('### ')) { result.push(<div key={li} style={{ fontSize: '0.83rem', fontWeight: 700, color: '#c792ea', margin: '0.6rem 0 0.15rem', letterSpacing: '-0.01em' }}>{renderInline(trimmed.slice(4), 'h')}</div>); return; }
    if (trimmed.startsWith('## '))  { result.push(<div key={li} style={{ fontSize: '0.88rem', fontWeight: 700, color: '#82aaff', margin: '0.7rem 0 0.2rem', letterSpacing: '-0.01em' }}>{renderInline(trimmed.slice(3), 'h')}</div>); return; }
    if (trimmed.startsWith('# '))   { result.push(<div key={li} style={{ fontSize: '0.95rem', fontWeight: 800, color: '#c3e88d', margin: '0.7rem 0 0.25rem', letterSpacing: '-0.02em' }}>{renderInline(trimmed.slice(2), 'h')}</div>); return; }
    if (trimmed === '---') { result.push(<hr key={li} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '0.55rem 0' }} />); return; }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)/);
    if (bulletMatch) {
      result.push(
        <div key={li} style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start', paddingLeft: '0.1rem', marginBottom: '0.1rem' }}>
          <span style={{ color: '#82aaff', flexShrink: 0, marginTop: '0.25rem', fontSize: '0.55rem' }}>●</span>
          <span style={{ lineHeight: 1.6 }}>{renderInline(bulletMatch[1], li)}</span>
        </div>
      );
      return;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      result.push(
        <div key={li} style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start', marginBottom: '0.1rem' }}>
          <span style={{ color: '#82aaff', flexShrink: 0, fontWeight: 700, fontSize: '0.72rem', minWidth: '1.1rem', paddingTop: '0.1rem' }}>{numMatch[1]}.</span>
          <span style={{ lineHeight: 1.6 }}>{renderInline(numMatch[2], li)}</span>
        </div>
      );
      return;
    }

    if (trimmed.startsWith('💡')) {
      result.push(<div key={li} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', marginTop: '0.35rem' }}>{renderInline(trimmed, li)}</div>);
      return;
    }

    result.push(<div key={li} style={{ lineHeight: 1.65 }}>{renderInline(line, li)}</div>);
  });

  return result;
};

// ── TypingDots ────────────────────────────────────────────────────────────────

export const TypingDots = () => (
  <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', paddingLeft: '2px', verticalAlign: 'middle' }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#82aaff', display: 'inline-block', animation: `typingBounce 1.3s ease-in-out ${i * 0.2}s infinite` }} />
    ))}
  </span>
);

// ── ChatMessageBubble ──────────────────────────────────────────────────────────

export const ChatMessageBubble = ({ msg, isLoading, onSendMessage }: { msg: ChatMessage, isLoading: boolean, onSendMessage: (msg: string) => void }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <div style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '0.5rem', alignItems: 'flex-start' }}>
        {/* Avatar */}
        <div style={{
          width: '26px', height: '26px', borderRadius: msg.role === 'user' ? '8px' : '10px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '0.05rem',
          background: msg.role === 'user' ? 'linear-gradient(135deg, #4338ca, #7c3aed)' : msg.error ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))',
          border: msg.role === 'user' ? 'none' : `1px solid ${msg.error ? 'rgba(239,68,68,0.3)' : 'rgba(130,170,255,0.2)'}`,
          boxShadow: msg.role === 'user' ? '0 2px 8px rgba(79,70,229,0.4)' : 'none',
        }}>
          {msg.role === 'user'
            ? (auth.currentUser?.photoURL
              ? <img src={auth.currentUser.photoURL} alt="" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} />
              : <User size={12} style={{ color: '#fff' }} />)
            : msg.error ? <AlertCircle size={12} style={{ color: '#f87171' }} /> : <Bot size={12} style={{ color: '#82aaff' }} />}
        </div>

        {/* Bubble */}
        <div style={{
          maxWidth: '86%', padding: '0.6rem 0.75rem',
          borderRadius: msg.role === 'user' ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          background: msg.role === 'user'
            ? 'linear-gradient(135deg, rgba(67,56,202,0.65) 0%, rgba(124,58,237,0.65) 100%)'
            : msg.error ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
          border: msg.role === 'user'
            ? '1px solid rgba(99,102,241,0.35)'
            : `1px solid ${msg.error ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)'}`,
          backdropFilter: msg.role === 'model' ? 'blur(6px)' : 'none',
          fontSize: '0.8rem',
          color: msg.error ? '#f87171' : msg.role === 'user' ? '#e8eaf0' : '#c8cdd8',
          lineHeight: 1.6, wordBreak: 'break-word',
          boxShadow: msg.role === 'user' ? '0 4px 16px rgba(79,70,229,0.2)' : 'none',
        }}>
          {msg.role === 'model' && !msg.error
            ? (msg.text === ''
              ? <TypingDots />
              : renderMarkdown(msg.text))
            : msg.text}

          {/* Model badge */}
          {msg.role === 'model' && !msg.error && msg.model && msg.text.length > 0 && (
            <div style={{ marginTop: '0.45rem', paddingTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '0.57rem', color: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#c3e88d', display: 'inline-block', flexShrink: 0, boxShadow: '0 0 4px rgba(195,232,141,0.4)' }} />
              Model used — <code style={{ color: 'rgba(130,170,255,0.4)', fontSize: '0.57rem' }}>{msg.model}</code>
            </div>
          )}
        </div>
      </div>

      {/* Follow-up chips */}
      {msg.role === 'model' && !msg.error && msg.followUps && msg.followUps.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', paddingLeft: '2rem' }}>
          {msg.followUps.map((q, qi) => (
            <button key={qi} onClick={() => onSendMessage(q)} disabled={isLoading}
              style={{ padding: '0.24rem 0.58rem', borderRadius: '6px', fontSize: '0.63rem', fontWeight: 500, background: 'rgba(130,170,255,0.05)', border: '1px solid rgba(130,170,255,0.12)', color: 'rgba(165,180,252,0.7)', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.4 : 1, transition: 'all 0.15s', textAlign: 'left', lineHeight: 1.4, letterSpacing: '-0.01em' }}
              onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.background = 'rgba(130,170,255,0.12)'; e.currentTarget.style.color = 'rgba(165,180,252,1)'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(130,170,255,0.05)'; e.currentTarget.style.color = 'rgba(165,180,252,0.7)'; }}>
              ↳ {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
