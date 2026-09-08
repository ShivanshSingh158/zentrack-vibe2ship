import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, User, AlertCircle, Copy, Check, Maximize2, Minimize2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { callGeminiProxy, extractGeminiText } from '../../services/gemini/geminiClient';

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
  const [activeLang, setActiveLang] = useState<'original' | 'cpp'>('original');
  const [cppCode, setCppCode] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const lang = codeLang.trim() || 'code';
  const isCpp = ['c++', 'cpp', 'c'].includes(lang.toLowerCase());

  const displayLines = activeLang === 'cpp' && cppCode
    ? cppCode.split('\n')
    : codeLines;
  const displayLang = activeLang === 'cpp' ? 'c++' : lang;

  const handleCopyActive = () => {
    navigator.clipboard.writeText(displayLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwitchToCpp = async () => {
    if (cppCode) { setActiveLang('cpp'); return; }
    setTranslating(true);
    try {
      const result = await callGeminiProxy({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [{ text: `Translate this ${lang} code to C++. Return ONLY the raw C++ code inside a single \`\`\`cpp code block, no explanation:\n\`\`\`${lang}\n${codeLines.join('\n')}\n\`\`\`` }],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      });
      const raw = extractGeminiText(result) || '';
      // Strip markdown fences
      const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      setCppCode(cleaned);
      setActiveLang('cpp');
    } catch {
      toast.error('Failed to translate to C++');
    } finally {
      setTranslating(false);
    }
  };

  const renderContent = (expanded: boolean) => (
    <div style={{
      width: expanded ? '90vw' : '100%',
      maxWidth: expanded ? '1200px' : '100%',
      height: expanded ? '85vh' : 'auto',
      maxHeight: expanded ? '85vh' : '400px',
      margin: expanded ? 'auto' : '0.6rem 0',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid #424242',
      boxShadow: expanded ? '0 24px 80px rgba(0,0,0,0.8)' : '0 4px 12px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      pointerEvents: 'auto',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Header */}
      <div style={{ background: '#2f2f2f', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        {/* Left: macOS dots + Language tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.8rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
          </div>
          {/* Language tabs */}
          <div style={{ display: 'flex', gap: '0.15rem' }}>
            <button
              onClick={() => setActiveLang('original')}
              style={{
                background: activeLang === 'original' ? 'rgba(130,170,255,0.12)' : 'transparent',
                border: 'none',
                borderBottom: activeLang === 'original' ? '2px solid #82aaff' : '2px solid transparent',
                color: activeLang === 'original' ? '#82aaff' : '#7a7a7a',
                cursor: 'pointer',
                fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                padding: '0.45rem 0.6rem', transition: 'all 0.15s',
              }}
            >
              {'</>'} {lang}
            </button>
            {!isCpp && (
              <button
                onClick={handleSwitchToCpp}
                disabled={translating}
                style={{
                  background: activeLang === 'cpp' ? 'rgba(255,157,100,0.12)' : 'transparent',
                  border: 'none',
                  borderBottom: activeLang === 'cpp' ? '2px solid #f07178' : '2px solid transparent',
                  color: activeLang === 'cpp' ? '#f07178' : '#7a7a7a',
                  cursor: translating ? 'wait' : 'pointer',
                  fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '0.45rem 0.6rem', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}
              >
                {translating
                  ? <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #f07178', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} /> C++</>
                  : <>{cppCode ? '' : '⚡ '}C++</>
                }
              </button>
            )}
          </div>
        </div>
        {/* Right: Copy + Expand */}
        <div style={{ display: 'flex', gap: '0.4rem', paddingRight: '0.6rem' }}>
          <button onClick={handleCopyActive} style={{ background: 'transparent', border: 'none', color: copied ? '#10a37f' : '#b4b4b4', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '5px', transition: 'all 0.2s', fontWeight: 600 }}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={() => setIsExpanded(!expanded)} title={expanded ? "Minimize" : "Expand code"} style={{ background: 'transparent', border: 'none', color: '#b4b4b4', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.2rem 0.4rem', borderRadius: '5px', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#b4b4b4'; }}>
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>
      <pre style={{ margin: 0, padding: '1rem 1.2rem', background: '#000000', overflow: 'auto', flex: 1, fontSize: expanded ? '0.85rem' : '0.8rem', lineHeight: 1.65, color: '#ececec', fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace", scrollbarWidth: 'thin', scrollbarColor: '#424242 transparent' }}>
        <code>
          {displayLines.map((line, i) => (
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
            return <strong key={i} style={{ color: '#ffffff', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
          if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**'))
            return <em key={i} style={{ color: '#d4d4d4', fontStyle: 'italic' }}>{part.slice(1, -1)}</em>;
          if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
            return <code key={i} style={{ background: '#303030', color: '#ececec', padding: '0.12rem 0.38rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9em', border: '1px solid #424242' }}>{part.slice(1, -1)}</code>;
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
    if (!trimmed) { result.push(<div key={li} style={{ height: '0.6rem' }} />); return; }

    if (trimmed.startsWith('### ')) { result.push(<div key={li} style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', margin: '1.2rem 0 0.5rem', letterSpacing: '-0.01em', lineHeight: 1.5 }}>{renderInline(trimmed.slice(4), 'h')}</div>); return; }
    if (trimmed.startsWith('## '))  { result.push(<div key={li} style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', margin: '1.4rem 0 0.6rem', letterSpacing: '-0.02em', lineHeight: 1.4 }}>{renderInline(trimmed.slice(3), 'h')}</div>); return; }
    if (trimmed.startsWith('# '))   { result.push(<div key={li} style={{ fontSize: '1.45rem', fontWeight: 700, color: '#ffffff', margin: '1.6rem 0 0.75rem', letterSpacing: '-0.02em', lineHeight: 1.3 }}>{renderInline(trimmed.slice(2), 'h')}</div>); return; }
    if (trimmed === '---') { result.push(<hr key={li} style={{ border: 'none', borderTop: '1px solid #424242', margin: '1rem 0' }} />); return; }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)/);
    if (bulletMatch) {
      result.push(
        <div key={li} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', paddingLeft: '0.2rem', marginBottom: '0.3rem' }}>
          <span style={{ color: '#8e8e8e', flexShrink: 0, marginTop: '0.5rem', fontSize: '0.45rem' }}>●</span>
          <span style={{ lineHeight: 1.75 }}>{renderInline(bulletMatch[1], li)}</span>
        </div>
      );
      return;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      result.push(
        <div key={li} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
          <span style={{ color: '#a3a3a3', flexShrink: 0, fontWeight: 600, fontSize: '1rem', minWidth: '1.3rem', paddingTop: '0rem' }}>{numMatch[1]}.</span>
          <span style={{ lineHeight: 1.75 }}>{renderInline(numMatch[2], li)}</span>
        </div>
      );
      return;
    }

    if (trimmed.startsWith('💡')) {
      result.push(<div key={li} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', marginTop: '0.35rem' }}>{renderInline(trimmed, li)}</div>);
      return;
    }

    result.push(<div key={li} style={{ lineHeight: 1.75, marginBottom: '0.15rem' }}>{renderInline(line, li)}</div>);
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

export const ChatMessageBubble = ({
  msg,
  isLoading,
  onSendMessage,
  videoTitle,
  topicName,
}: {
  msg: ChatMessage;
  isLoading: boolean;
  onSendMessage: (msg: string) => void;
  videoTitle?: string;
  topicName?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportToNotes = async () => {
    if (!auth.currentUser) {
      toast.error('Please sign in to save notes');
      return;
    }
    setSavingNote(true);
    try {
      await addDoc(collection(db, 'storageNodes'), {
        userId: auth.currentUser.uid,
        name: `ZEN-GPT: ${videoTitle || 'Lecture Note'}`,
        content: `# 🤖 ZEN-GPT Lecture Note\n\n**Lecture:** ${videoTitle || 'Lecture'}\n**Topic:** ${topicName || 'Learning'}\n**Date:** ${new Date().toLocaleDateString()}\n\n---\n\n${msg.text.trim()}`,
        type: 'note',
        folderId: null,
        tags: [],
        pinned: false,
        color: '#00c16e',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('📝 Exported to ZenNotes workspace!');
    } catch (e: any) {
      toast.error('Failed to export note: ' + (e?.message || 'Error'));
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.8rem' }}>
      
      {/* AI Header */}
      {msg.role === 'model' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ececec' }}>ZEN-GPT</span>
          </div>

          {!msg.error && msg.text && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                onClick={handleCopy}
                title="Copy response"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: copied ? '#00c16e' : '#a1a1aa',
                  borderRadius: '6px',
                  padding: '3px 7px',
                  fontSize: '0.68rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={handleExportToNotes}
                disabled={savingNote}
                title="Export response to Lecture Notes"
                style={{
                  background: 'rgba(0,193,110,0.1)',
                  border: '1px solid rgba(0,193,110,0.25)',
                  color: '#00c16e',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: savingNote ? 'wait' : 'pointer',
                  opacity: savingNote ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <FileText size={11} />
                <span>{savingNote ? 'Exporting...' : 'Export to Notes'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '0.5rem', alignItems: 'flex-start' }}>
        {/* User Avatar */}
        {msg.role === 'user' && (
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '0.05rem',
            background: '#454545', border: 'none'
          }}>
            {auth.currentUser?.photoURL
              ? <img src={auth.currentUser.photoURL} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : <User size={14} style={{ color: '#fff' }} />}
          </div>
        )}

        {/* Bubble */}
        <div style={{
          maxWidth: msg.role === 'user' ? '86%' : '100%', padding: msg.role === 'user' ? '0.65rem 1rem' : '0 0.1rem',
          borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '0',
          background: msg.role === 'user' ? '#2f2f2f' : 'transparent',
          border: 'none',
          fontSize: '1rem',
          fontFamily: "'Inter','Söhne','ui-sans-serif','system-ui',sans-serif",
          color: msg.error ? '#f87171' : '#ececec',
          lineHeight: 1.75, wordBreak: 'break-word',
          flex: 1
        }}>
          {msg.role === 'model' && !msg.error
            ? (msg.text === ''
              ? <TypingDots />
              : renderMarkdown(msg.text))
            : msg.text}


        </div>
      </div>

      {/* Follow-up chips */}
      {msg.role === 'model' && !msg.error && msg.followUps && msg.followUps.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
          {msg.followUps.map((q, qi) => (
            <button key={qi} onClick={() => onSendMessage(q)} disabled={isLoading}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 500, background: 'transparent', border: '1px solid #424242', color: '#ececec', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.4 : 1, transition: 'all 0.15s', textAlign: 'left', lineHeight: 1.4, letterSpacing: '-0.01em' }}
              onMouseEnter={e => { if (!isLoading) { e.currentTarget.style.background = '#2f2f2f'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
