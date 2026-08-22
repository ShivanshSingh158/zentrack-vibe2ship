import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, ArrowUp, Trash2, Copy, Check, FileText,
  RotateCcw, Edit2, AlignLeft, Loader2, X, Plus
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { toast } from 'sonner';

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
  noteTitle?: string;
}

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

export const TypingDots = () => (
  <div className="lp-chatgpt-loading-indicator">
    <span className="dot" />
    <span className="dot" />
    <span className="dot" />
  </div>
);

// ChatGPT-Style Code Block
const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  if (!value || !value.trim()) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lp-chatgpt-code-container">
      <div className="lp-chatgpt-code-header">
        <span className="lp-chatgpt-code-lang">{language || 'code'}</span>
        <button type="button" className="lp-chatgpt-code-copy-btn" onClick={handleCopy}>
          {copied ? <Check size={13} color="#5eda9e" /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
      <pre className="lp-chatgpt-code-pre">
        <code>{value}</code>
      </pre>
    </div>
  );
};

export const NotesAIPanel: React.FC<NotesAIPanelProps> = ({
  showAiPanel,
  setShowAiPanel,
  handleAiAction,
  aiQuestion,
  setAiQuestion,
  isAiLoading,
  chatHistory,
  hasActiveNote,
  onApplyMarkdown,
  noteTitle = 'Note',
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isAiLoading]);

  // Auto-expand textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAiQuestion(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newH = Math.min(140, Math.max(38, textareaRef.current.scrollHeight));
      textareaRef.current.style.height = `${newH}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (aiQuestion.trim() && !isAiLoading) {
        handleAiAction(aiQuestion.trim());
      }
    }
  };

  const handleSendPrompt = (promptText?: string) => {
    const textToSend = promptText || aiQuestion.trim();
    if (!textToSend || isAiLoading) return;
    handleAiAction(textToSend);
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
    }
  };

  const handleCopyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    toast.success('Response copied to clipboard!');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="lp-chatgpt-wrapper" style={{ borderLeft: '1px solid var(--notes-border-subtle)' }}>
      {/* ── Header Bar ── */}
      <div className="lp-chatgpt-header">
        <div className="lp-chatgpt-header-left">
          <div className="lp-chatgpt-avatar-glow">
            <Sparkles size={15} color="#a599ff" />
          </div>
          <div className="lp-chatgpt-title-meta">
            <div className="lp-chatgpt-name">
              ZEN-GPT Writer <span className="lp-chatgpt-model-tag">Gemini 2.5</span>
            </div>
            <div className="lp-chatgpt-topic-tag">📝 {noteTitle}</div>
          </div>
        </div>

        <button
          type="button"
          className="lp-chatgpt-reset-btn"
          onClick={() => setShowAiPanel(false)}
          title="Close AI Assistant"
        >
          <X size={15} />
        </button>
      </div>

      {/* ── Messages Stream ── */}
      <div className="lp-chatgpt-messages" ref={scrollRef}>
        {chatHistory.length === 0 ? (
          /* Welcome Screen */
          <div className="lp-chatgpt-welcome-state">
            <div className="lp-chatgpt-welcome-icon">
              <Sparkles size={26} color="#a599ff" />
            </div>
            <h3 className="lp-chatgpt-welcome-title">How can I assist with this note?</h3>
            <p className="lp-chatgpt-welcome-subtitle">
              Ask anything about your document, format math formulas, or choose a starter action below.
            </p>

            <div className="lp-chatgpt-starter-grid">
              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSendPrompt("Summarize this note into clear bullet points, core concepts, and action items.")}
              >
                <div className="starter-card-title">📝 Summarize Note</div>
                <div className="starter-card-desc">Extract bullet takeaways & key definitions</div>
              </button>

              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSendPrompt("Format all mathematical formulas, fractions, and equations in this note using proper KaTeX LaTeX notation ($...$ and $$...$$).")}
              >
                <div className="starter-card-title">🧮 Format Math LaTeX</div>
                <div className="starter-card-desc">Convert formulas to KaTeX notation</div>
              </button>

              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSendPrompt("Polish this note for grammar, tone, flow, and clarity while preserving all technical details.")}
              >
                <div className="starter-card-title">✨ Polish & Fix Grammar</div>
                <div className="starter-card-desc">Improve prose flow and sentence structure</div>
              </button>

              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSendPrompt("Generate 5 active-recall study flashcards with Questions and Answers based on this note.")}
              >
                <div className="starter-card-title">🧠 Generate Flashcards</div>
                <div className="starter-card-desc">Create active-recall Q&A test cards</div>
              </button>
            </div>
          </div>
        ) : (
          chatHistory.map((m, idx) => {
            const isModel = m.role === 'model';
            const blocks = isModel ? extractMarkdownBlocks(m.text) : [];
            const cleanText = isModel
              ? m.text.replace(/```(?:markdown)?\n/g, '\n').replace(/```/g, '\n')
              : m.text;

            return (
              <div key={idx} className={`lp-chatgpt-msg-row ${m.role}`}>
                {isModel && (
                  <div className="lp-chatgpt-msg-avatar">
                    <Sparkles size={14} color="#a599ff" />
                  </div>
                )}

                <div className={`lp-chatgpt-msg-body ${m.role}`}>
                  {!isModel ? (
                    <div className="lp-chatgpt-user-bubble">{m.text}</div>
                  ) : (
                    <div className="lp-chatgpt-model-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          code({ node, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeString = String(children || '').replace(/\n$/, '');
                            if (!codeString.trim()) return null;
                            const isInline = !match && !codeString.includes('\n');
                            return isInline ? (
                              <code className="lp-chatgpt-inline-code" {...props}>
                                {children}
                              </code>
                            ) : (
                              <CodeBlock
                                language={match ? match[1] : ''}
                                value={codeString}
                              />
                            );
                          },
                        }}
                      >
                        {cleanText}
                      </ReactMarkdown>

                      {/* ChatGPT Action Buttons Footer */}
                      <div className="lp-chatgpt-msg-actions">
                        <button
                          type="button"
                          className="lp-chatgpt-action-btn"
                          onClick={() => handleCopyMessage(m.text, idx)}
                          title="Copy response"
                        >
                          {copiedIndex === idx ? <Check size={13} color="#5eda9e" /> : <Copy size={13} />}
                          <span>{copiedIndex === idx ? 'Copied' : 'Copy'}</span>
                        </button>

                        {hasActiveNote && (
                          <>
                            <button
                              type="button"
                              className="lp-chatgpt-action-btn"
                              onClick={() => {
                                const contentToInsert = blocks.length > 0 ? blocks.join('\n\n') : cleanText;
                                onApplyMarkdown(contentToInsert, 'append');
                                toast.success('Appended to your note!');
                              }}
                              title="Append to Note"
                            >
                              <AlignLeft size={13} />
                              <span>Append to Note</span>
                            </button>

                            <button
                              type="button"
                              className="lp-chatgpt-action-btn"
                              onClick={() => {
                                const contentToInsert = blocks.length > 0 ? blocks.join('\n\n') : cleanText;
                                onApplyMarkdown(contentToInsert, 'replace');
                                toast.success('Replaced note content!');
                              }}
                              title="Replace Note Content"
                            >
                              <Edit2 size={13} />
                              <span>Replace Note</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isAiLoading && (
          <div className="lp-chatgpt-msg-row model">
            <div className="lp-chatgpt-msg-avatar">
              <Sparkles size={14} color="#a599ff" />
            </div>
            <div className="lp-chatgpt-msg-body model">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Typing Capsule ── */}
      <div className="lp-chatgpt-bottom-container">
        {/* Quick Prompts */}
        <div className="lp-chatgpt-prompt-chips">
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSendPrompt("Summarize this note into key takeaways and bullet points.")}
          >
            📝 Summarize
          </button>
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSendPrompt("Format all equations using KaTeX LaTeX notation.")}
          >
            🧮 Math LaTeX
          </button>
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSendPrompt("Fix grammar, flow, and readability.")}
          >
            ✨ Fix Grammar
          </button>
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSendPrompt("Generate 5 Q&A flashcards from this note.")}
          >
            🧠 Flashcards
          </button>
        </div>

        {/* Typing capsule */}
        <div className={`lp-chatgpt-typing-box ${aiQuestion.trim() ? 'has-content' : ''}`}>
          <textarea
            ref={textareaRef}
            className="lp-chatgpt-textarea"
            placeholder="Ask ZEN-GPT to edit, explain, or format... (Shift+Enter for new line)"
            value={aiQuestion}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isAiLoading}
          />

          <button
            type="button"
            className={`lp-chatgpt-send-btn ${aiQuestion.trim() && !isAiLoading ? 'active' : ''}`}
            onClick={() => handleSendPrompt()}
            disabled={!aiQuestion.trim() || isAiLoading}
            title="Send (Enter)"
          >
            {isAiLoading ? <Loader2 size={15} className="lp-spin" /> : <ArrowUp size={16} strokeWidth={2.5} />}
          </button>
        </div>

        <div className="lp-chatgpt-footer-disclaimer">
          ZEN-GPT can make mistakes. Verify important code & facts.
        </div>
      </div>
    </div>
  );
};
