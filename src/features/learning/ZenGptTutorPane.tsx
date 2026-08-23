import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles, ArrowUp, Trash2, Copy, Check, FileText,
  RotateCcw, ThumbsUp, ThumbsDown, Loader2, Code2, HelpCircle,
  CheckCircle2, Maximize2, Minimize2, X, History, Plus, MessageSquare,
  Clock, ChevronRight
} from 'lucide-react';
import { callWithFallback } from '../../services/gemini/core';
import { callGeminiProxy, extractGeminiText } from '../../services/gemini/geminiClient';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { formatSeconds } from '../../services/youtubeTranscriptService';
import { toast } from 'sonner';
import { awardXP } from '../../services/xpSystem';
import { AVAILABLE_GEMINI_MODELS } from '../../config/constants';

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
1. FULL TRANSCRIPT MASTERY: You have full access to the complete lecture transcript from 00:00 to the end. Maintain a deep mental model of the entire video.
2. RICHARD FEYNMAN TECHNIQUE: Explain concepts simply, as if teaching a beginner. Strip away all jargon. Use clear, vivid everyday analogies.
3. CODE = WORKING + EXPLAINED: For any code question provide:
   a) Minimal working code example (< 30 lines)
   b) Line-by-line explanation of key parts
   c) Common beginner mistake
   Always use fenced code blocks with language tags (\`\`\`javascript, \`\`\`cpp, \`\`\`python, etc.).
4. ANALOGIES ARE MANDATORY: Provide a real-world analogy BEFORE technical explanation.
5. CONFUSION DETECTION: If student expresses confusion, break down into smaller steps and provide a new analogy.
6. FOLLOW-UP QUESTIONS: End standard explanations with 2 specific follow-up questions:
   💡 **Ask next:** "Question 1?" · "Question 2?"
7. QUIZ MODE (triggered by "quiz", "test me", "rapid-fire quiz"):
   - Exactly 3 MCQ questions labeled Q1, Q2, Q3 testing understanding across the full lecture.
   - Format each question with clean options on separate lines:
     Q1: [Question text]
     A) [Option A]
     B) [Option B]
     C) [Option C]
     D) [Option D]
   - Do NOT reveal answers initially in the quiz. Wait for student submission.
8. COMPREHENSIVE FULL-LECTURE NOTES MODE (triggered by "summarize for notes", "create notes", "lecture notes", "study notes", "full lecture notes"):
   - YOU MUST SYNTHESIZE THE ENTIRE LECTURE FROM START TO FINISH. Never summarize only a small fragment or single timestamp unless explicitly asked "explain current timestamp".
   - Produce a structured, thorough, master-level study note covering ALL major concepts, milestones, and details taught in the lecture:
     • ## 📌 Lecture Overview & Big-Picture Roadmap
     • ## 🧠 Core Concepts & In-Depth Explanations (Chronological breakdown of key sections with [MM:SS] timestamp references)
     • ## 💻 Code Implementations & Algorithms (Complete runnable code snippets with line-by-line breakdown)
     • ## 💡 Real-World Mental Models & Analogies
     • ## ⚠️ Gotchas, Edge Cases & Common Pitfalls
     • ## 📝 Quick Review Checklist & Summary
   - Ensure the notes are rich, detailed, and comprehensive so the student can master the full 1-hour+ lecture at a glance!

${transcript ? `=== COMPLETE FULL-LENGTH VIDEO TRANSCRIPT (from 00:00 to end) ===\n${transcript}\n=== END TRANSCRIPT ===` : '(No transcript available)'}`;
};

// ── QUIZ PARSER & INTERACTIVE QUIZ CARD COMPONENT ─────────────────────────────
interface QuizOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
}

interface QuizQuestion {
  id: string;
  number: number;
  question: string;
  options: QuizOption[];
}

interface ParsedQuizContent {
  introText: string;
  questions: QuizQuestion[];
  trailingText: string;
  followUps: string[];
}

function parseQuizFromMessage(text: string): ParsedQuizContent | null {
  if (!text) return null;
  // Check if text has question markers Q1/Q2/Question 1 and options A), B)
  if (!/(?:Q[1-9]|Question\s+[1-9])[.:]/i.test(text) || !/\bA\)/i.test(text) || !/\bB\)/i.test(text)) {
    return null;
  }

  // Extract followUps from anywhere in the text first
  let followUps: string[] = [];
  const followUpMatch = text.match(/💡\s*\*?\*?Ask next:\*?\*?\s*(.+)/i);
  if (followUpMatch) {
    const rawF = followUpMatch[1];
    followUps = rawF.split(/[·|]/).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s.length > 3);
  }

  // Strip follow-up line from the quiz parsing string
  const cleanQuizText = text.replace(/💡\s*\*?\*?Ask next:[\s\S]*$/im, '').trim();

  const qRegex = /(?:^|\n)(?:Q(\d+)[:.]|\bQuestion\s+(\d+)[:.])\s*([\s\S]+?)(?=(?:\n(?:Q\d+[:.]|\bQuestion\s+\d+[:.]|\b💡|\n\n---\n)|$))/gi;

  let match;
  let firstQIndex = -1;
  let lastQEnd = -1;
  const questions: QuizQuestion[] = [];

  while ((match = qRegex.exec(cleanQuizText)) !== null) {
    if (firstQIndex === -1) firstQIndex = match.index;
    lastQEnd = match.index + match[0].length;

    const qNum = parseInt(match[1] || match[2] || String(questions.length + 1), 10);
    const rawBody = match[3].trim();

    const firstOptMatch = rawBody.match(/\b[A-D]\)/i);
    if (!firstOptMatch || firstOptMatch.index === undefined) continue;

    const questionText = rawBody.substring(0, firstOptMatch.index).trim();
    const optionsBody = rawBody.substring(firstOptMatch.index);

    const optRegex = /\b([A-D])\)\s*([\s\S]+?)(?=\b[A-D]\)|$)/gi;
    let optMatch;
    const options: QuizOption[] = [];

    while ((optMatch = optRegex.exec(optionsBody)) !== null) {
      let optText = optMatch[2].trim();
      // Remove any lingering follow-up text or trailing markers
      optText = optText.replace(/💡[\s\S]*$/i, '').replace(/Ask next:[\s\S]*$/i, '').trim();

      options.push({
        key: optMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D',
        text: optText,
      });
    }

    if (options.length >= 2) {
      questions.push({
        id: `Q${qNum}`,
        number: qNum,
        question: questionText,
        options,
      });
    }
  }

  if (questions.length === 0) return null;

  const introText = firstQIndex > 0 ? cleanQuizText.substring(0, firstQIndex).trim() : '';
  const trailingText = lastQEnd < cleanQuizText.length ? cleanQuizText.substring(lastQEnd).trim() : '';

  return {
    introText,
    questions,
    trailingText,
    followUps,
  };
}

const InteractiveQuizCard: React.FC<{
  quiz: ParsedQuizContent;
  onSendAnswer: (answerText: string) => void;
}> = ({ quiz, onSendAnswer }) => {
  const [selected, setSelected] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = (qId: string, optKey: 'A' | 'B' | 'C' | 'D') => {
    if (submitted) return;
    setSelected(prev => ({ ...prev, [qId]: optKey }));
  };

  const handleSubmit = () => {
    if (Object.keys(selected).length === 0) return;
    setSubmitted(true);
    const answersText = quiz.questions
      .map(q => `- ${q.id}: ${selected[q.id] || '(No answer selected)'}`)
      .join('\n');

    awardXP('QUIZ_PERFECT').then((res) => {
      toast.success(`🎯 Quiz submitted! +${res.added} XP`);
      if (res.leveledUp) {
        toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
      }
    });

    onSendAnswer(
      `Here are my answers to the quiz:\n${answersText}\n\nPlease evaluate my answers, tell me my score out of ${quiz.questions.length}, and explain the reasoning for each!`
    );
  };

  const answeredCount = Object.keys(selected).length;
  const totalCount = quiz.questions.length;

  return (
    <div className="lp-quiz-container">
      {quiz.introText && (
        <div className="lp-quiz-intro-text">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{quiz.introText}</ReactMarkdown>
        </div>
      )}

      <div className="lp-quiz-questions-stack">
        {quiz.questions.map((q) => (
          <div key={q.id} className="lp-quiz-card">
            <div className="lp-quiz-card-header">
              <div className="lp-quiz-num-badge">
                <span>🎯 Question {q.number} of {totalCount}</span>
              </div>
              <span className="lp-quiz-status-badge">
                {selected[q.id] ? `Selected: ${selected[q.id]}` : 'Click an option'}
              </span>
            </div>

            <div className="lp-quiz-question-title">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, className, children, ...props }) {
                    return (
                      <code className="lp-chatgpt-inline-code" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {q.question}
              </ReactMarkdown>
            </div>

            <div className="lp-quiz-options-grid">
              {q.options.map((opt) => {
                const isSelected = selected[q.id] === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`lp-quiz-option-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(q.id, opt.key)}
                  >
                    <span className="lp-quiz-option-letter">{opt.key}</span>
                    <span className="lp-quiz-option-text">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, className, children, ...props }) {
                            return (
                              <code className="lp-chatgpt-inline-code" {...props}>
                                {children}
                              </code>
                            );
                          },
                          p({ children }) {
                            return <>{children}</>;
                          }
                        }}
                      >
                        {opt.text}
                      </ReactMarkdown>
                    </span>
                    {isSelected && <CheckCircle2 size={16} className="lp-quiz-check-indicator" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Quiz Submit Bar */}
      <div className="lp-quiz-footer-actions">
        <span className="lp-quiz-progress-text">
          {answeredCount === totalCount
            ? `All ${totalCount} questions answered`
            : `${answeredCount} of ${totalCount} selected`}
        </span>

        <button
          type="button"
          className="lp-quiz-submit-btn"
          disabled={answeredCount === 0 || submitted}
          onClick={handleSubmit}
        >
          <img src="/logo_white.png" alt="ZenTrack" style={{ width: 13, height: 13, objectFit: 'contain' }} />
          <span>{submitted ? 'Submitted!' : `Submit Answers (${answeredCount}/${totalCount})`}</span>
        </button>
      </div>

      {quiz.trailingText && (
        <div className="lp-quiz-trailing-text" style={{ marginTop: '0.45rem', fontSize: '0.84rem', color: '#a1a1aa' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{quiz.trailingText}</ReactMarkdown>
        </div>
      )}

      {quiz.followUps.length > 0 && (
        <div className="lp-chatgpt-prompt-chips" style={{ marginTop: '0.45rem' }}>
          {quiz.followUps.map((f, fi) => (
            <button
              key={fi}
              type="button"
              className="lp-chatgpt-chip"
              onClick={() => onSendAnswer(f)}
            >
              💡 {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── VS CODE DARK+ SYNTAX HIGHLIGHTER ──────────────────────────────────────────
const highlightSyntax = (code: string, lang?: string): React.ReactNode[] => {
  const lines = code.split('\n');

  const CONTROL_KEYWORDS = new Set([
    'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'finally',
    'throw', 'async', 'await', 'yield', 'switch', 'case', 'break', 'continue', 'default'
  ]);

  const DECLARATION_KEYWORDS = new Set([
    'const', 'let', 'var', 'function', 'class', 'def', 'import', 'export',
    'from', 'type', 'interface', 'enum', 'new', 'this', 'super', 'typeof',
    'instanceof', 'in', 'of', 'void', 'extends', 'implements', 'as', 'lambda',
    'pass', 'elif', 'with', 'is', 'not', 'and', 'or'
  ]);

  const BUILTIN_OBJECTS = new Set([
    'console', 'document', 'window', 'Math', 'JSON', 'Promise', 'Array',
    'Object', 'String', 'Number', 'Boolean', 'Set', 'Map', 'React', 'process',
    'global', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout', 'setInterval'
  ]);

  const LITERALS = new Set([
    'null', 'undefined', 'true', 'false', 'None', 'True', 'False', 'NaN', 'Infinity', 'nil'
  ]);

  return lines.map((line, lineIdx) => {
    // Regex matching comments, strings, words, and symbols
    const tokenRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:return|if|else|for|while|try|catch|finally|throw|async|await|yield|switch|case|break|continue|default)\b|\b(?:const|let|var|function|class|def|import|export|from|type|interface|enum|new|this|super|typeof|instanceof|in|of|void|extends|implements|as|lambda|pass|elif|with|is|not|and|or)\b|\b(?:console|document|window|Math|JSON|Promise|Array|Object|String|Number|Boolean|Set|Map|React|process|global|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b|\b(?:null|undefined|true|false|None|True|False|NaN|Infinity|nil)\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|[a-zA-Z_$][a-zA-Z0-9_$]*|[^\s\w]+|\s+)/g;

    let match;
    const tokens: React.ReactNode[] = [];

    while ((match = tokenRegex.exec(line)) !== null) {
      const tok = match[0];
      const idx = match.index;

      if (/^(\/\/|\/\*|#)/.test(tok)) {
        // Comments: VS Code Green Italic
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#6a9955', fontStyle: 'italic' }}>
            {tok}
          </span>
        );
      } else if (/^["'`]/.test(tok)) {
        // Strings: VS Code Warm Peach / Orange
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#ce9178' }}>
            {tok}
          </span>
        );
      } else if (CONTROL_KEYWORDS.has(tok)) {
        // Control flow: VS Code Control Purple
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#c586c0', fontWeight: 600 }}>
            {tok}
          </span>
        );
      } else if (DECLARATION_KEYWORDS.has(tok)) {
        // Declarations: VS Code Keyword Blue
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#569cd6', fontWeight: 600 }}>
            {tok}
          </span>
        );
      } else if (BUILTIN_OBJECTS.has(tok)) {
        // Built-ins: VS Code Teal
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#4ec9b0' }}>
            {tok}
          </span>
        );
      } else if (LITERALS.has(tok)) {
        // Literals: VS Code Blue
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#569cd6', fontWeight: 600 }}>
            {tok}
          </span>
        );
      } else if (/^\d/.test(tok)) {
        // Numbers: VS Code Light Green
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#b5cea8' }}>
            {tok}
          </span>
        );
      } else if (line.substring(match.index + tok.length).trim().startsWith('(')) {
        // Function / Method invocation: VS Code Yellow
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#dcdcaa' }}>
            {tok}
          </span>
        );
      } else if (/^[A-Z][a-zA-Z0-9_$]*$/.test(tok)) {
        // Types / Classes: VS Code Teal
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#4ec9b0' }}>
            {tok}
          </span>
        );
      } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(tok)) {
        // Variables: VS Code Light Blue
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#9cdcfe' }}>
            {tok}
          </span>
        );
      } else {
        // Operators & punctuation: VS Code Gray
        tokens.push(
          <span key={`${lineIdx}-${idx}`} style={{ color: '#d4d4d4' }}>
            {tok}
          </span>
        );
      }
    }

    return (
      <div key={lineIdx} style={{ display: 'flex', minHeight: '1.45em', lineHeight: 1.55, width: '100%', minWidth: 0 }}>
        <span
          style={{
            display: 'inline-block',
            width: '28px',
            textAlign: 'right',
            marginRight: '14px',
            color: '#65656e',
            fontSize: '0.72rem',
            userSelect: 'none',
            flexShrink: 0,
            fontFamily: 'inherit',
          }}
        >
          {lineIdx + 1}
        </span>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'pre', overflowWrap: 'normal' }}>
          {tokens.length > 0 ? tokens : ' '}
        </span>
      </div>
    );
  });
};

// VS Code-Style Code Block with Window Controls, Syntax Highlighting, Expand & Copy Button
const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!value || !value.trim()) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Close on Escape key
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  return (
    <>
      <div className="lp-chatgpt-code-container">
        <div className="lp-chatgpt-code-header">
          <div className="lp-vscode-window-dots">
            <span className="dot red" onClick={() => setIsExpanded(false)} />
            <span className="dot yellow" />
            <span className="dot green" onClick={() => setIsExpanded(true)} style={{ cursor: 'pointer' }} title="Expand" />
          </div>
          <span className="lp-chatgpt-code-lang">
            <Code2 size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {language || 'javascript'}
          </span>
          <div className="lp-chatgpt-code-header-actions">
            <button
              type="button"
              className="lp-chatgpt-code-action-btn"
              onClick={() => setIsExpanded(true)}
              title="Expand code on big screen"
            >
              <Maximize2 size={12} />
              <span>Expand</span>
            </button>
            <button
              type="button"
              className="lp-chatgpt-code-action-btn"
              onClick={handleCopy}
              title="Copy code"
            >
              {copied ? <Check size={12} color="#5eda9e" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
        <div className="lp-chatgpt-code-pre">
          {highlightSyntax(value, language)}
        </div>
      </div>

      {/* ── Big Screen Code Modal Viewer ── */}
      {isExpanded && (
        <div className="lp-code-modal-backdrop" onClick={() => setIsExpanded(false)}>
          <div className="lp-code-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="lp-code-modal-header">
              <div className="lp-vscode-window-dots">
                <span className="dot red" onClick={() => setIsExpanded(false)} style={{ cursor: 'pointer' }} title="Close" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="lp-code-modal-title">
                <Code2 size={15} color="#a599ff" />
                <span>{language ? `${language.toUpperCase()} • Code Viewer` : 'Code Viewer'}</span>
              </div>
              <div className="lp-code-modal-actions">
                <button
                  type="button"
                  className="lp-chatgpt-code-action-btn"
                  onClick={handleCopy}
                  title="Copy code"
                >
                  {copied ? <Check size={13} color="#5eda9e" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy code'}</span>
                </button>
                <button
                  type="button"
                  className="lp-code-modal-close-btn"
                  onClick={() => setIsExpanded(false)}
                  title="Close (Esc)"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="lp-code-modal-body">
              {highlightSyntax(value, language)}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export interface ZenGptSession {
  id: string;
  topicTitle: string;
  lectureTitle: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  preview: string;
}

const STORAGE_SESSIONS_KEY = 'zengpt_lecture_sessions_v1';

const getStoredSessions = (): ZenGptSession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredSessions = (sessions: ZenGptSession[]) => {
  try {
    localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(sessions.slice(0, 50)));
  } catch {}
};

const formatRelativeTime = (timestamp: number) => {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const ZenGptTutorPane: React.FC<ZenGptTutorPaneProps> = ({
  topicTitle,
  lectureTitle,
  transcriptText = '',
  getCurrentSecond,
  onInsertNote,
  onSeek,
}) => {
  const [sessions, setSessions] = useState<ZenGptSession[]>(getStoredSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const all = getStoredSessions();
    const lectureSession = all.find(s => s.lectureTitle === lectureTitle);
    return lectureSession ? lectureSession.id : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const all = getStoredSessions();
    const current = all.find(s => s.id === activeSessionId) || all.find(s => s.lectureTitle === lectureTitle);
    return current ? current.messages : [];
  });

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try {
      return localStorage.getItem('zen_preferred_learning_model') || 'gemini-3.7-flash';
    } catch {
      return 'gemini-3.7-flash';
    }
  });

  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'this_lecture' | 'all'>('this_lecture');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    try { localStorage.setItem('zen_preferred_learning_model', newModel); } catch {}
    const modelObj = AVAILABLE_GEMINI_MODELS.find(m => m.id === newModel);
    toast.success(`Active Model: ${modelObj?.label || newModel}`);
  };

  // Auto-sync active conversation to sessions list
  useEffect(() => {
    if (messages.length === 0) return;
    const all = getStoredSessions();
    const firstUser = messages.find(m => m.role === 'user')?.text || 'Lecture Discussion';
    const preview = firstUser.length > 75 ? firstUser.substring(0, 72) + '...' : firstUser;

    const existingIdx = all.findIndex(s => s.id === activeSessionId);
    const updatedSession: ZenGptSession = {
      id: activeSessionId,
      topicTitle,
      lectureTitle,
      createdAt: existingIdx >= 0 ? all[existingIdx].createdAt : Date.now(),
      updatedAt: Date.now(),
      messages,
      preview,
    };

    let updatedList: ZenGptSession[];
    if (existingIdx >= 0) {
      updatedList = [...all];
      updatedList[existingIdx] = updatedSession;
      // Move latest updated to top
      const [moved] = updatedList.splice(existingIdx, 1);
      updatedList.unshift(moved);
    } else {
      updatedList = [updatedSession, ...all];
    }

    setSessions(updatedList);
    saveStoredSessions(updatedList);
  }, [messages, activeSessionId, topicTitle, lectureTitle]);

  // Load chat if lecture title changes
  useEffect(() => {
    const all = getStoredSessions();
    const existing = all.find(s => s.lectureTitle === lectureTitle);
    if (existing) {
      setActiveSessionId(existing.id);
      setMessages(existing.messages);
    } else {
      const newId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setActiveSessionId(newId);
      setMessages([]);
    }
  }, [lectureTitle]);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

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

  const handleNewChat = () => {
    const newId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setActiveSessionId(newId);
    setMessages([]);
    setShowHistory(false);
    toast.success('Started new chat session');
  };

  const handleOpenSession = (sess: ZenGptSession) => {
    setActiveSessionId(sess.id);
    setMessages(sess.messages);
    setShowHistory(false);
    toast.success(`Loaded session (${sess.messages.length} messages)`);
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== sessionId);
    setSessions(updated);
    saveStoredSessions(updated);
    if (activeSessionId === sessionId) {
      handleNewChat();
    }
    toast.info('Chat session deleted');
  };

  const handleClearChat = () => {
    const updated = sessions.filter(s => s.id !== activeSessionId);
    setSessions(updated);
    saveStoredSessions(updated);
    setMessages([]);
    toast.info('Cleared current messages');
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

    // ── Multi-turn History Context ──
    const recentTurns = messages.slice(-10);
    const historyBlock = recentTurns.length > 0
      ? `\n=== CONVERSATION HISTORY IN THIS LECTURE (Last ${recentTurns.length} messages) ===\n` +
        recentTurns.map(m => `${m.role === 'user' ? 'Student' : 'ZEN-GPT'}: ${m.text}`).join('\n\n') +
        `\n=== END CONVERSATION HISTORY ===\n`
      : '';

    const currentSec = getCurrentSecond();
    const isFullLectureRequest = /(?:full|complete|entire|whole|all)\s*(?:lecture|video|notes|summary)|summarize for notes|create notes|lecture notes|study notes|make notes|generate notes/i.test(userText);
    const timestampHeader = isFullLectureRequest
      ? `[CRITICAL DIRECTIVE: Student requested FULL-LECTURE MASTER STUDY NOTES covering the ENTIRE video from start [00:00] to finish. You have the complete transcript above. Synthesize the whole lecture comprehensively across all concepts taught without restricting to a single timestamp.]`
      : `[Student is currently at timestamp ${formatSeconds(currentSec)} in the lecture. You have access to the COMPLETE full-length transcript of the whole video.]`;
    const basePrompt = buildZenGptBasePrompt(lectureTitle, topicTitle, transcriptText);

    const fullPrompt = `${basePrompt}\n\n${historyBlock}\n\n${timestampHeader}\n\nStudent's New Input:\n${userText}`;

    try {
      let responseText = '';
      try {
        responseText = await callWithFallback(async (genAI: any, modelName: string) => {
          const modelToUse = selectedModel || modelName || 'gemini-3.7-flash';
          const model = genAI.getGenerativeModel({ model: modelToUse });
          const res = await model.generateContent(fullPrompt);
          return res.response.text();
        });
      } catch (fallbackErr) {
        console.warn('[ZenGptTutorPane] SDK fallback failed, trying proxy...', fallbackErr);
        const proxyContents: any[] = [];
        recentTurns.forEach(m => {
          proxyContents.push({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.text }]
          });
        });
        proxyContents.push({
          role: 'user',
          parts: [{ text: `${timestampHeader}\n\n${userText}` }]
        });

        const res = await callGeminiProxy({
          model: selectedModel || 'gemini-3.7-flash',
          systemInstruction: { parts: [{ text: basePrompt }] },
          contents: proxyContents
        });
        responseText = extractGeminiText(res);
      }

      if (!responseText) {
        throw new Error('Empty response received from AI tutor.');
      }

      setMessages([...newMsgs, { role: 'model', text: responseText }]);
    } catch (err: any) {
      console.error('[ZenGptTutorPane] Error:', err);
      toast.error('AI Tutor error: ' + (err?.message || 'Failed to generate response'));
      setMessages([
        ...newMsgs,
        {
          role: 'model',
          text: `⚠️ Sorry, I encountered an issue connecting to the tutor service (${err?.message || 'Network error'}). Please try again.`,
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

  const thisLectureSessions = useMemo(() => {
    return sessions.filter(s => s.lectureTitle === lectureTitle);
  }, [sessions, lectureTitle]);

  const filteredSessions = useMemo(() => {
    if (historyFilter === 'this_lecture') {
      return thisLectureSessions;
    }
    return sessions;
  }, [historyFilter, thisLectureSessions, sessions]);

  return (
    <div className="lp-chatgpt-wrapper">
      {/* ── Top ChatGPT Header ── */}
      <div className="lp-chatgpt-header">
        <div className="lp-chatgpt-header-left">
          <div className="lp-chatgpt-avatar-glow">
            <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: 17, height: 17, objectFit: 'contain' }} />
          </div>
          <div className="lp-chatgpt-title-meta">
            <div className="lp-chatgpt-name">
              ZEN-GPT
              <span className="lp-chatgpt-live-pill">
                <span className="lp-live-pulse-dot" />
                AI Tutor
              </span>
            </div>
            <div className="lp-chatgpt-topic-tag" title={lectureTitle}>📚 {lectureTitle}</div>
          </div>
        </div>

        <div className="lp-chatgpt-header-right-actions">
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            title="Select Gemini Model"
            style={{
              padding: '0.2rem 0.4rem',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: '#ececec',
              fontSize: '0.62rem',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {AVAILABLE_GEMINI_MODELS.map(m => (
              <option key={m.id} value={m.id} style={{ background: '#212121', color: '#fff' }}>
                {m.icon} {m.label.replace('Gemini ', '')}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`lp-chatgpt-hdr-btn ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory(prev => !prev)}
            title="View saved chat history for this lecture"
          >
            <History size={13} />
            <span>History</span>
            {thisLectureSessions.length > 0 && (
              <span className="lp-hdr-badge">{thisLectureSessions.length}</span>
            )}
          </button>

          <button
            type="button"
            className="lp-chatgpt-hdr-btn"
            onClick={handleNewChat}
            title="Start a new chat session"
          >
            <Plus size={13} />
            <span>New</span>
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              className="lp-chatgpt-hdr-btn danger"
              onClick={handleClearChat}
              title="Clear current messages"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Slide-Over Chat History Drawer ── */}
      {showHistory && (
        <div className="lp-history-drawer-backdrop" onClick={() => setShowHistory(false)}>
          <div className="lp-history-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lp-history-drawer-header">
              <div className="lp-history-drawer-title">
                <History size={15} color="#a599ff" />
                <span>Lecture Chat History</span>
              </div>
              <button
                type="button"
                className="lp-history-close-btn"
                onClick={() => setShowHistory(false)}
                title="Close history"
              >
                <X size={14} />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="lp-history-tabs">
              <button
                type="button"
                className={`lp-history-tab ${historyFilter === 'this_lecture' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('this_lecture')}
              >
                This Lecture ({thisLectureSessions.length})
              </button>
              <button
                type="button"
                className={`lp-history-tab ${historyFilter === 'all' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('all')}
              >
                All Lectures ({sessions.length})
              </button>
            </div>

            {/* Session List */}
            <div className="lp-history-list">
              {filteredSessions.length === 0 ? (
                <div className="lp-history-empty">
                  <MessageSquare size={26} color="#52525b" />
                  <p>No saved conversations found for this view.</p>
                  <button type="button" className="lp-history-new-btn" onClick={handleNewChat}>
                    <Plus size={13} />
                    <span>Start First Chat</span>
                  </button>
                </div>
              ) : (
                filteredSessions.map((sess) => {
                  const isActive = sess.id === activeSessionId;
                  return (
                    <div
                      key={sess.id}
                      className={`lp-history-card ${isActive ? 'active' : ''}`}
                      onClick={() => handleOpenSession(sess)}
                    >
                      <div className="lp-history-card-top">
                        <span className="lp-history-lecture-badge" title={sess.lectureTitle}>
                          {sess.lectureTitle}
                        </span>
                        <span className="lp-history-time">
                          <Clock size={11} />
                          {formatRelativeTime(sess.updatedAt)}
                        </span>
                      </div>

                      <div className="lp-history-preview">
                        "{sess.preview}"
                      </div>

                      <div className="lp-history-card-footer">
                        <span className="lp-history-count-tag">
                          💬 {sess.messages.length} messages
                        </span>

                        <div className="lp-history-card-actions">
                          {isActive && <span className="lp-history-active-tag">Active</span>}
                          <button
                            type="button"
                            className="lp-history-delete-btn"
                            onClick={(e) => handleDeleteSession(sess.id, e)}
                            title="Delete this conversation"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom New Chat Action */}
            <div className="lp-history-drawer-footer">
              <button type="button" className="lp-history-bottom-new-btn" onClick={handleNewChat}>
                <Plus size={14} />
                <span>Start New Conversation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Messages Stream ── */}
      <div className="lp-chatgpt-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          /* Empty State / Welcome Screen */
          <div className="lp-chatgpt-welcome-state">
            <div className="lp-chatgpt-welcome-icon">
              <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: 34, height: 34, objectFit: 'contain' }} />
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
                onClick={() => handleSend("Generate a comprehensive, end-to-end master study note covering the entire lecture from start to finish. Include chronological concept breakdowns with timestamps, complete working code snippets, edge cases, and key takeaways.")}
              >
                <div className="starter-card-title">📝 Full Lecture Notes</div>
                <div className="starter-card-desc">End-to-end master study guide for the whole video</div>
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
                  <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                </div>
              )}

              <div className={`lp-chatgpt-msg-body ${m.role}`}>
                {m.role === 'user' ? (
                  <div className="lp-chatgpt-user-bubble">{m.text}</div>
                ) : (
                  <div className="lp-chatgpt-model-content">
                    {(() => {
                      const quizData = parseQuizFromMessage(m.text);
                      if (quizData) {
                        return (
                          <InteractiveQuizCard
                            quiz={quizData}
                            onSendAnswer={(ans) => handleSend(ans)}
                          />
                        );
                      }
                      return (
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
                            strong({ children }) {
                              return <strong style={{ color: '#ffffff', fontWeight: 700 }}>{children}</strong>;
                            }
                          }}
                        >
                          {m.text}
                        </ReactMarkdown>
                      );
                    })()}

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
              <img src="/logo_white.png" alt="ZEN-GPT" style={{ width: 16, height: 16, objectFit: 'contain' }} />
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
            onClick={() => handleSend("Generate a comprehensive, end-to-end master study note covering the entire lecture from start to finish. Include chronological concept breakdowns with timestamps, complete working code snippets, edge cases, and key takeaways.")}
          >
            📝 Full Lecture Notes
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
            style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
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
