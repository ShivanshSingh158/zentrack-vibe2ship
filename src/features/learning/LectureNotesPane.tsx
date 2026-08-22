import React, { useState, useEffect, useRef } from 'react';
import {
  Clock, Printer, Copy, Check, Bold, Italic, Heading2,
  List, Sigma, Sparkles, HelpCircle, Loader2
} from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { formatSeconds } from '../../services/youtubeTranscriptService';
import { callWithFallback } from '../../services/gemini/core';
import { toast } from 'sonner';

interface LectureNotesPaneProps {
  initialNotes: string;
  onSaveNotes: (notes: string) => void;
  getCurrentSecond: () => number;
  onSeek: (seconds: number) => void;
  lectureTitle: string;
  transcriptText?: string;
}

export const LectureNotesPane: React.FC<LectureNotesPaneProps> = ({
  initialNotes,
  onSaveNotes,
  getCurrentSecond,
  onSeek,
  lectureTitle,
  transcriptText = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChangeRef = useRef(false);

  // SVG for timestamp icon inside pill
  const clockSvg = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

  // Helper to convert legacy text/markdown into rich HTML on initial load
  const convertToInitialHtml = (rawText: string) => {
    if (!rawText) return '';
    if (/<[a-z][\s\S]*>/i.test(rawText)) {
      return rawText;
    }
    return rawText
      .replace(/\*\*\[(\d{1,2}:\d{2})\]\*\*/g, (_, time) => {
        const parts = time.split(':');
        const s = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        return `<span class="lp-inline-ts-pill" contenteditable="false" data-seconds="${s}">${clockSvg}${time}</span>&nbsp;`;
      })
      .replace(/\[(\d{1,2}:\d{2})\]/g, (_, time) => {
        const parts = time.split(':');
        const s = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        return `<span class="lp-inline-ts-pill" contenteditable="false" data-seconds="${s}">${clockSvg}${time}</span>&nbsp;`;
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && !isInternalChangeRef.current) {
      editorRef.current.innerHTML = convertToInitialHtml(initialNotes || '');
    }
    isInternalChangeRef.current = false;
  }, [initialNotes]);

  const saveTimerRef = useRef<any>(null);

  const handleContentChange = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    isInternalChangeRef.current = true;

    clearTimeout(saveTimerRef.current);
    setSaving(true);
    saveTimerRef.current = setTimeout(() => {
      onSaveNotes(html);
      setSaving(false);
    }, 800);
  };

  // Helper to insert HTML fragment at cursor inside contenteditable
  const insertHtmlAtCursor = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const el = document.createElement('div');
      el.innerHTML = html;
      const frag = document.createDocumentFragment();
      let node: Node | null = null;
      let lastNode: Node | null = null;
      while ((node = el.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      editor.innerHTML += html;
    }
    handleContentChange();
  };

  // Timestamp insertion as clickable pill
  const handleInsertTimestamp = () => {
    const sec = getCurrentSecond();
    const formatted = formatSeconds(sec);
    const pillHtml = `<span class="lp-inline-ts-pill" contenteditable="false" data-seconds="${sec}">${clockSvg}${formatted}</span>&nbsp;`;
    insertHtmlAtCursor(pillHtml);
    toast.success(`Inserted timestamp [${formatted}]`);
  };

  // LaTeX Math Insertion
  const handleInsertMath = () => {
    const formula = prompt('Enter LaTeX math formula (e.g. E = mc^2, \\sum_{i=1}^n x_i, \\int f(x)dx):', 'E = mc^2');
    if (!formula) return;
    try {
      const rendered = katex.renderToString(formula, { throwOnError: false, displayMode: false });
      const mathHtml = `<span class="lp-math-pill" contenteditable="false" data-latex="${formula.replace(/"/g, '&quot;')}">${rendered}</span>&nbsp;`;
      insertHtmlAtCursor(mathHtml);
      toast.success('Inserted LaTeX formula');
    } catch {
      insertHtmlAtCursor(`<strong>$${formula}$</strong>&nbsp;`);
    }
  };

  // Toolbar Formatting
  const applyCommand = (command: string, value: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleContentChange();
  };

  // Click handler on timestamp pills inside editor
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const tsBtn = target.closest('.lp-inline-ts-pill');
    if (tsBtn) {
      e.preventDefault();
      const seconds = Number(tsBtn.getAttribute('data-seconds'));
      if (!isNaN(seconds)) {
        onSeek(seconds);
        toast.success(`Jumped video to ${tsBtn.textContent?.trim()}`);
      }
    }
  };

  const handleGenerateAiNotes = async () => {
    if (!transcriptText || transcriptText.length < 20) {
      toast.error('No lecture transcript available to generate notes.');
      return;
    }
    setGeneratingNotes(true);
    toast.info('Generating complete full-lecture study notes...');

    const prompt = `You are a world-class educational note-taker and instructor.
Lecture Title: "${lectureTitle}"

Create a THOROUGH, END-TO-END MASTER STUDY NOTE synthesized across the entire lecture from start to finish.
Do NOT summarize only a single snippet. Cover every concept, algorithm, formula, code example, and nuance taught in the video.

Format with clean, rich HTML elements:
<h2>📌 Lecture Overview</h2>
<p>Big picture roadmap and core objectives of the lecture.</p>

<h2>🧠 Core Concepts & Chronological Deep-Dive</h2>
<p>Breakdown of key sections taught in order with approximate [MM:SS] timestamp references.</p>

<h2>💻 Code Implementations & Algorithms</h2>
<pre><code>// Complete code snippet with explanation</code></pre>

<h2>💡 Real-World Mental Models & Analogies</h2>
<p>Intuitive breakdown explaining the concepts simply.</p>

<h2>⚠️ Gotchas & Common Pitfalls</h2>
<ul><li>Key edge cases to watch out for</li></ul>

<h2>📝 Master Review Checklist</h2>
<ul><li>Core takeaways and summary points</li></ul>

=== FULL-LENGTH VIDEO TRANSCRIPT ===
${transcriptText}
=== END TRANSCRIPT ===

Return ONLY the raw HTML body without wrapping in markdown code fences (\`\`\`html).`;

    try {
      const htmlResponse = await callWithFallback(async (genAI: any, modelName: string) => {
        const model = genAI.getGenerativeModel({ model: modelName || 'gemini-2.5-flash' });
        const res = await model.generateContent(prompt);
        return res.response.text();
      });

      const cleanHtml = (htmlResponse || '')
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      if (editorRef.current && cleanHtml) {
        editorRef.current.innerHTML = cleanHtml;
        handleContentChange();
        toast.success('Full-lecture master notes generated successfully!');
      }
    } catch (e: any) {
      console.error('[LectureNotesPane] Generate AI Notes failed:', e);
      toast.error('Failed to generate full notes: ' + (e?.message || 'Network error'));
    } finally {
      setGeneratingNotes(false);
    }
  };

  const handleCopy = () => {
    if (!editorRef.current) return;
    const plain = editorRef.current.innerText;
    navigator.clipboard.writeText(plain);
    setCopied(true);
    toast.success('Notes copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    if (!editorRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${lectureTitle} - Study Notes</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 2.5rem; color: #111; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            h1 { color: #4338ca; border-bottom: 2px solid #e0e7ff; padding-bottom: 0.5rem; }
            h2, h3 { color: #1f2937; margin-top: 1.5rem; }
            strong { font-weight: 700; color: #111827; }
            .lp-inline-ts-pill { display: inline-block; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.85em; margin: 0 3px; }
            .katex { font-size: 1.1em; }
          </style>
        </head>
        <body>
          <h1>${lectureTitle}</h1>
          <p><em>ZenTrack Study Notes</em></p>
          <hr />
          <div>${editorRef.current.innerHTML}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="lp-notes-pane">
      {/* ── Single Top Action & Formatting Bar ── */}
      <div className="lp-notes-top-bar">
        <div className="lp-notes-status">
          <span className="lp-notes-dot" />
          <span className="lp-notes-status-text">
            {saving ? 'Saving...' : 'Auto-saved'}
          </span>
        </div>

        {/* Rich Formatting Actions */}
        <div className="lp-notes-toolbar-group">
          <button
            type="button"
            className="lp-toolbar-btn"
            onClick={() => applyCommand('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            className="lp-toolbar-btn"
            onClick={() => applyCommand('italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            className="lp-toolbar-btn"
            onClick={() => applyCommand('formatBlock', '<h2>')}
            title="Heading"
          >
            <Heading2 size={13} />
          </button>
          <button
            type="button"
            className="lp-toolbar-btn"
            onClick={() => applyCommand('insertUnorderedList')}
            title="Bullet List"
          >
            <List size={13} />
          </button>

          <div className="lp-toolbar-divider" />

          {/* LaTeX Math Formula */}
          <button
            type="button"
            className="lp-toolbar-btn math"
            onClick={handleInsertMath}
            title="Insert LaTeX Math Formula"
          >
            <Sigma size={13} />
            <span>LaTeX</span>
          </button>
        </div>

        <div className="lp-notes-actions">
          {transcriptText && (
            <button
              type="button"
              className="lp-stamp-ts-btn"
              onClick={handleGenerateAiNotes}
              disabled={generatingNotes}
              title="Generate comprehensive master study notes for this full lecture with AI"
              style={{ background: 'rgba(94, 218, 158, 0.15)', borderColor: 'rgba(94, 218, 158, 0.35)', color: '#5eda9e' }}
            >
              {generatingNotes ? <Loader2 size={12} className="lp-spin" /> : <Sparkles size={12} />}
              <span>{generatingNotes ? 'Generating...' : '✨ Full AI Notes'}</span>
            </button>
          )}

          <button
            type="button"
            className="lp-stamp-ts-btn"
            onClick={handleInsertTimestamp}
            title="Stamp current video time"
          >
            <Clock size={12} />
            <span>+ Timestamp</span>
          </button>

          <button
            type="button"
            className="lp-notes-icon-btn"
            onClick={handleCopy}
            title="Copy notes"
          >
            {copied ? <Check size={14} color="#5eda9e" /> : <Copy size={14} />}
          </button>

          <button
            type="button"
            className="lp-notes-icon-btn"
            onClick={handlePrint}
            title="Print / Export PDF"
          >
            <Printer size={14} />
          </button>
        </div>
      </div>

      {/* ── Single Unified Rich Document Editor ── */}
      <div className="lp-notes-body-wrap">
        <div
          ref={editorRef}
          className="lp-notes-rich-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={handleContentChange}
          onClick={handleEditorClick}
          data-placeholder="Type notes directly here... Click '+ Timestamp' to insert interactive timestamps or 'LaTeX' for math equations."
        />
      </div>
    </div>
  );
};
