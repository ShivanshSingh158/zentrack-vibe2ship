import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles, ArrowUp, Trash2, Copy, Check, FileText,
  RotateCcw, ThumbsUp, ThumbsDown, Loader2, Code2, HelpCircle
} from 'lucide-react';
import { callWithFallback } from '../../services/gemini/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatSeconds } from '../../services/youtubeTranscriptService';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface ZenGptTutorPaneProps {
  topicTitle: string;
  lectureTitle: string;
  transcriptText?: string;
  getCurrentSecond: () => number;
  onInsertNote?: (text: string) => void;
  onSeek?: (seconds: number) => void;
}

const buildZenGptBasePrompt = (videoTitle: string, topicName: string, transcript: string): string => {
  return `You are ZEN-GPT — a world-class expert educator and AI tutor embedded inside ZenTrack.
The student is studying: 📺 "${videoTitle}" — 📚 Topic: "${topicName}"

== THE 8 LAWS OF ZEN TUTORING (NEVER BREAK) ==
1. RICHARD FEYNMAN TECHNIQUE: Explain concepts simply, as if teaching a beginner. Strip away all jargon. Use clear, vivid everyday analogies.
2. CODE = WORKING + EXPLAINED: For any code question provide:
   a) Minimal working code example (< 30 lines)
   b) Line-by-line explanation of key parts
   c) Common beginner mistake
   Always use fenced code blocks with language tags (\`\`\`javascript, \`\`\`python, etc.).
3. ANALOGIES ARE MANDATORY: Provide a real-world analogy BEFORE technical explanation.
4. CONFUSION DETECTION: If student expresses confusion, break down into smaller steps and provide a new analogy.
5. CROSS-TOPIC CONNECTIONS: Link concepts to core programming or engineering fundamentals.
6. FOLLOW-UP QUESTIONS: End every response with 2 specific follow-up questions:
   💡 **Ask next:** "Question 1?" · "Question 2?"
7. QUIZ MODE (triggered by "quiz", "test me", "rapid-fire quiz"):
   - Exactly 3 MCQ questions labeled Q1, Q2, Q3.
   - Format: A) ... B) ... C) ... D) ...
   - Do NOT reveal answers initially.
8. NOTES MODE (triggered by "summarize for notes", "save note"):
   - Structured ## Title, Key Concepts, Code, Gotchas.

${transcript ? `=== VIDEO TRANSCRIPT (with timestamps) ===\n${transcript}\n=== END TRANSCRIPT ===` : '(No transcript available)'}`;
};

// ChatGPT-Style Code Block with Header & Copy Button
const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

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

export const ZenGptTutorPane: React.FC<ZenGptTutorPaneProps> = ({
  topicTitle,
  lectureTitle,
  transcriptText = '',
  getCurrentSecond,
  onInsertNote,
  onSeek,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Native non-passive wheel isolation — prevents outer theater/page scroll
  // while the chat message stream can still scroll internally.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;
      if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollTop += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Auto-expand textarea height as user types
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(160, Math.max(42, textareaRef.current.scrollHeight));
      textareaRef.current.style.height = `${newHeight}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async (overridePrompt?: string) => {
    const userText = overridePrompt || input.trim();
    if (!userText || loading) return;

    if (!overridePrompt) {
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '42px';
      }
    }

    const newMsgs: Message[] = [...messages, { role: 'user', text: userText }];
    setMessages(newMsgs);
    setLoading(true);

    const currentSec = getCurrentSecond();
    const timestampHeader = `[Student is currently at ${formatSeconds(currentSec)} in the lecture]`;
    const basePrompt = buildZenGptBasePrompt(lectureTitle, topicTitle, transcriptText);

    const fullPrompt = `${basePrompt}\n\n${timestampHeader}\n\nStudent Question:\n${userText}`;

    try {
      const responseText = await callWithFallback(async (model) => {
        const res = await model.generateContent(fullPrompt);
        return res.response.text();
      });

      setMessages([...newMsgs, { role: 'model', text: responseText }]);
    } catch (err: any) {
      toast.error('AI Tutor error: ' + (err?.message || 'Failed to generate response'));
      setMessages([
        ...newMsgs,
        {
          role: 'model',
          text: `⚠️ Sorry, I encountered an issue connecting to the tutor service. Please check your network or try again in a moment.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    toast.success('Response copied to clipboard!');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleRegenerateLast = () => {
    if (messages.length < 2) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      handleSend(lastUserMsg.text);
    }
  };

  return (
    <div className="lp-chatgpt-wrapper">
      {/* ── Top ChatGPT Header ── */}
      <div className="lp-chatgpt-header">
        <div className="lp-chatgpt-header-left">
          <div className="lp-chatgpt-avatar-glow">
            <Sparkles size={15} color="#5eda9e" />
          </div>
          <div className="lp-chatgpt-title-meta">
            <div className="lp-chatgpt-name">ZEN-GPT <span className="lp-chatgpt-model-tag">Gemini 2.5</span></div>
            <div className="lp-chatgpt-topic-tag">📚 {lectureTitle}</div>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            className="lp-chatgpt-reset-btn"
            onClick={() => setMessages([])}
            title="Start new chat"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* ── Messages Stream ── */}
      <div className="lp-chatgpt-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          /* Empty State / Welcome Screen */
          <div className="lp-chatgpt-welcome-state">
            <div className="lp-chatgpt-welcome-icon">
              <Sparkles size={28} color="#5eda9e" />
            </div>
            <h3 className="lp-chatgpt-welcome-title">How can I help with this lecture?</h3>
            <p className="lp-chatgpt-welcome-subtitle">
              Ask anything, generate a rapid-fire quiz, or click any quick starter below.
            </p>

            <div className="lp-chatgpt-starter-grid">
              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSend("Generate a 3-question rapid-fire quiz on this lecture. Label questions Q1, Q2, Q3. Do NOT reveal the answers until I respond.")}
              >
                <div className="starter-card-title">🎯 Rapid-Fire Quiz</div>
                <div className="starter-card-desc">Test your understanding with 3 smart MCQs</div>
              </button>

              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSend("Explain what the instructor is explaining right now using the Richard Feynman technique and a simple everyday analogy.")}
              >
                <div className="starter-card-title">💡 Explain Current Part</div>
                <div className="starter-card-desc">Feynman breakdown of the active timestamp</div>
              </button>

              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSend("Create a structured summary of the key takeaways from this lecture formatted for study notes.")}
              >
                <div className="starter-card-title">📝 Summarize for Notes</div>
                <div className="starter-card-desc">Extract bullet points, definitions & formulas</div>
              </button>

              <button
                type="button"
                className="lp-chatgpt-starter-card"
                onClick={() => handleSend("Show a minimal working code example illustrating the main topic taught in this video, along with a line-by-line explanation.")}
              >
                <div className="starter-card-title">💻 Code Example</div>
                <div className="starter-card-desc">Minimal working snippet with breakdown</div>
              </button>
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`lp-chatgpt-msg-row ${m.role}`}>
              {m.role === 'model' && (
                <div className="lp-chatgpt-msg-avatar">
                  <Sparkles size={14} color="#5eda9e" />
                </div>
              )}

              <div className={`lp-chatgpt-msg-body ${m.role}`}>
                {m.role === 'user' ? (
                  <div className="lp-chatgpt-user-bubble">{m.text}</div>
                ) : (
                  <div className="lp-chatgpt-model-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ node, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const isInline = !match && !String(children).includes('\n');
                          return isInline ? (
                            <code className="lp-chatgpt-inline-code" {...props}>
                              {children}
                            </code>
                          ) : (
                            <CodeBlock
                              language={match ? match[1] : ''}
                              value={String(children).replace(/\n$/, '')}
                            />
                          );
                        },
                      }}
                    >
                      {m.text}
                    </ReactMarkdown>

                    {/* ChatGPT Action Buttons Footer */}
                    <div className="lp-chatgpt-msg-actions">
                      <button
                        type="button"
                        className="lp-chatgpt-action-btn"
                        onClick={() => handleCopyMessage(m.text, i)}
                        title="Copy response"
                      >
                        {copiedIndex === i ? <Check size={13} color="#5eda9e" /> : <Copy size={13} />}
                        <span>{copiedIndex === i ? 'Copied' : 'Copy'}</span>
                      </button>

                      {onInsertNote && (
                        <button
                          type="button"
                          className="lp-chatgpt-action-btn"
                          onClick={() => {
                            onInsertNote(m.text);
                            toast.success('Added explanation to your Lecture Notes!');
                          }}
                          title="Save to Notes"
                        >
                          <FileText size={13} />
                          <span>Add to Notes</span>
                        </button>
                      )}

                      {i === messages.length - 1 && (
                        <button
                          type="button"
                          className="lp-chatgpt-action-btn"
                          onClick={handleRegenerateLast}
                          title="Regenerate response"
                        >
                          <RotateCcw size={13} />
                          <span>Regenerate</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="lp-chatgpt-msg-row model">
            <div className="lp-chatgpt-msg-avatar">
              <Sparkles size={14} color="#a599ff" />
            </div>
            <div className="lp-chatgpt-msg-body model">
              <div className="lp-chatgpt-loading-indicator">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Typing & Prompt Container ── */}
      <div className="lp-chatgpt-bottom-container">
        {/* Quick Prompts Carousel */}
        <div className="lp-chatgpt-prompt-chips">
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSend("Generate a 3-question rapid-fire quiz on this lecture. Label questions Q1, Q2, Q3. Do NOT reveal the answers until I respond.")}
          >
            🎯 Quiz Me
          </button>
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSend("Explain what the instructor is talking about right now using the Richard Feynman technique and a simple real-world analogy.")}
          >
            💡 Explain Current Part
          </button>
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSend("Create a structured summary of the key takeaways from this lecture formatted for study notes.")}
          >
            📝 Summarize for Notes
          </button>
          <button
            type="button"
            className="lp-chatgpt-chip"
            onClick={() => handleSend("Show a minimal working code example illustrating the main topic taught in this video, along with a line-by-line explanation.")}
          >
            💻 Code Example
          </button>
        </div>

        {/* ChatGPT Style Floating Typing Capsule */}
        <div className={`lp-chatgpt-typing-box ${input.trim() ? 'has-content' : ''}`}>
          <textarea
            ref={textareaRef}
            className="lp-chatgpt-textarea"
            placeholder="Ask ZEN-GPT about this lecture... (Shift+Enter for new line)"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />

          <button
            type="button"
            className={`lp-chatgpt-send-btn ${input.trim() && !loading ? 'active' : ''}`}
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            title="Send message (Enter)"
          >
            {loading ? <Loader2 size={16} className="lp-spin" /> : <ArrowUp size={17} strokeWidth={2.5} />}
          </button>
        </div>

        <div className="lp-chatgpt-footer-disclaimer">
          ZEN-GPT can make mistakes. Verify important code & facts.
        </div>
      </div>
    </div>
  );
};
