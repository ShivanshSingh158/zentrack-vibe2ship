import React, { useState, useEffect } from 'react';
import { Clock, Printer, Copy, Check, Save, Eye, Edit3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatSeconds } from '../../services/youtubeTranscriptService';
import { toast } from 'sonner';

interface LectureNotesPaneProps {
  initialNotes: string;
  onSaveNotes: (notes: string) => void;
  getCurrentSecond: () => number;
  onSeek: (seconds: number) => void;
  lectureTitle: string;
}

export const LectureNotesPane: React.FC<LectureNotesPaneProps> = ({
  initialNotes,
  onSaveNotes,
  getCurrentSecond,
  onSeek,
  lectureTitle,
}) => {
  const [notes, setNotes] = useState(initialNotes || '');
  const [isPreview, setIsPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(initialNotes || '');
  }, [initialNotes]);

  // Debounced auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (notes !== initialNotes) {
        setSaving(true);
        onSaveNotes(notes);
        setTimeout(() => setSaving(false), 600);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [notes, initialNotes, onSaveNotes]);

  const handleInsertTimestamp = () => {
    const sec = getCurrentSecond();
    const formatted = formatSeconds(sec);
    const tag = `\n\n**[${formatted}]** `;
    setNotes(prev => prev + tag);
    toast.success(`Inserted timestamp [${formatted}]`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(notes);
    setCopied(true);
    toast.success('Notes copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${lectureTitle} - Study Notes</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 2rem; color: #111; line-height: 1.6; }
            h1 { color: #4338ca; border-bottom: 2px solid #e0e7ff; padding-bottom: 0.5rem; }
            code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
            pre { background: #1e1e24; color: #fff; padding: 1rem; border-radius: 8px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>${lectureTitle}</h1>
          <p><em>Generated from ZenTrack Learning Hub</em></p>
          <hr />
          <div>${notes.replace(/\n/g, '<br/>')}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Convert markdown with custom timestamp clicker in preview mode
  const renderTimestampLinks = (text: string) => {
    const parts = text.split(/(\[\d{1,2}:\d{2}\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/\[(\d{1,2}):(\d{2})\]/);
      if (match) {
        const m = parseInt(match[1], 10);
        const s = parseInt(match[2], 10);
        const totalSec = m * 60 + s;
        return (
          <button
            key={idx}
            type="button"
            className="lp-inline-ts-pill"
            onClick={() => onSeek(totalSec)}
            title={`Jump video to ${match[1]}:${match[2]}`}
          >
            <Clock size={11} /> {match[1]}:{match[2]}
          </button>
        );
      }
      return part;
    });
  };

  return (
    <div className="lp-notes-pane">
      {/* Top action bar */}
      <div className="lp-notes-top-bar">
        <div className="lp-notes-status">
          <span className="lp-notes-dot" />
          <span className="lp-notes-status-text">
            {saving ? 'Saving...' : 'Auto-saved'}
          </span>
        </div>

        <div className="lp-notes-actions">
          <button
            type="button"
            className="lp-stamp-ts-btn"
            onClick={handleInsertTimestamp}
            title="Stamp current video time"
          >
            <Clock size={13} />
            <span>+ Timestamp</span>
          </button>

          <button
            type="button"
            className="lp-notes-icon-btn"
            onClick={() => setIsPreview(prev => !prev)}
            title={isPreview ? 'Edit Markdown' : 'Preview Note'}
          >
            {isPreview ? <Edit3 size={14} /> : <Eye size={14} />}
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

      {/* Content editor or markdown preview */}
      <div className="lp-notes-body-wrap">
        {isPreview ? (
          <div className="lp-notes-preview-scroll">
            <div className="lp-markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {notes}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <textarea
            className="lp-notes-textarea"
            placeholder="Take study notes here... Type markdown or click '+ Timestamp' to link ideas directly to moments in the lecture."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        )}
      </div>
    </div>
  );
};
