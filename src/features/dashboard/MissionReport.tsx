/**
 * MissionReport — Portal overlay that renders the agent's final response.
 *
 * Renders the agent result as rich markdown (with math via KaTeX).
 * Extracts Google Meet and Docs links from the report and surfaces
 * them as clickable action buttons.
 *
 * Uses React.createPortal to render on document.body, above all other UI.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  BrainCircuit, Check, X, Maximize2, Minimize2,
  Video, FileText, Loader2, Send,
} from 'lucide-react';

/** Extract Meet / Docs links from the report text for quick-access buttons */
function parseMissionActions(report: string) {
  if (!report) return { meetLinks: [] as string[], docLinks: [] as string[] };
  const meetLinks = Array.from(new Set(
    report.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/g) ?? []
  ));
  const docLinks = Array.from(new Set(
    report.match(/https:\/\/docs\.google\.com\/[^\s)\]]+/g) ?? []
  ));
  return { meetLinks, docLinks };
}

interface MissionReportProps {
  agentResult: string | null;
  missionComplete: boolean;
  isExecuting: boolean;
  commandInput: string;
  onClose: () => void;
  onCommandChange: (value: string) => void;
  onFollowUp: () => void;
}

export function MissionReport({
  agentResult,
  missionComplete,
  isExecuting,
  commandInput,
  onClose,
  onCommandChange,
  onFollowUp,
}: MissionReportProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {agentResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mission-backdrop"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Report Panel */}
      <AnimatePresence>
        {agentResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1,    x: '-50%', y: '-50%' }}
            exit={{   opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
            className={`mission-report-overlay ${isExpanded ? 'expanded' : ''}`}
          >
            {/* Header */}
            <div className="mission-report-header">
              <div className="mission-report-title">
                <BrainCircuit size={18} style={{ color: '#06b6d4' }} />
                <span>Divine Mandate Report</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  className="mission-report-expand-btn"
                  onClick={() => setIsExpanded(e => !e)}
                  title={isExpanded ? 'Collapse View' : 'Full Screen View'}
                >
                  {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  <span>{isExpanded ? 'Collapse' : 'Full Screen'}</span>
                </button>
                <button className="mission-report-action" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="mission-report-content markdown-body" data-lenis-prevent="true">
              {missionComplete && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    <Check size={20} /> MISSION COMPLETE
                  </div>
                </div>
              )}

              <div style={{ color: '#e4e4e7', fontSize: '0.92rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {agentResult}
                </ReactMarkdown>
              </div>

              {/* Quick-access buttons for Meet/Docs links found in the report */}
              {(() => {
                const { meetLinks, docLinks } = parseMissionActions(agentResult);
                if (meetLinks.length === 0 && docLinks.length === 0) return null;
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    {meetLinks.map(link => (
                      <a key={link} href={link} target="_blank" rel="noopener noreferrer"
                         style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: '#2563eb', color: 'white', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
                        <Video size={16} /> Join Meeting
                      </a>
                    ))}
                    {docLinks.map(link => (
                      <a key={link} href={link} target="_blank" rel="noopener noreferrer"
                         style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
                        <FileText size={16} /> Open Document
                      </a>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Follow-up input */}
            <div className="mission-report-footer">
              <input
                type="text"
                value={commandInput}
                onChange={e => onCommandChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onFollowUp(); }}
                disabled={isExecuting}
                placeholder="Assign a follow-up task..."
                className="agent-command-input focus:outline-none focus:ring-0"
              />
              <button
                className="execute-command-btn"
                onClick={onFollowUp}
                disabled={isExecuting || !commandInput.trim()}
              >
                {isExecuting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
