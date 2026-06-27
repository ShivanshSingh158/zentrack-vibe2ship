/**
 * MissionReport — Portal overlay that renders the agent's final response.
 *
 * Renders the agent result as rich markdown (with math via KaTeX).
 * Extracts Google Meet and Docs links from the report and surfaces
 * them as clickable action buttons.
 *
 * Uses React.createPortal to render on document.body, above all other UI.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  BrainCircuit, Check, X, Maximize2, Minimize2,
  Video, FileText, Loader2, Send, AlertTriangle, Key, Mic
} from 'lucide-react';
import { signInWithGoogle, isSignedInToGoogle, wasEverConnectedToGoogle } from '../../services/googleCalendar';

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

export function MissionReport() {
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [missionComplete, setMissionComplete] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check support for Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          currentTranscript += event.results[i][0].transcript;
        }
        setCommandInput(prev => {
           // We might want to append if there was existing text, but overwriting is cleaner for dictation
           return currentTranscript; 
        });
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    const handleShow = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.result) {
        setAgentResult(detail.result);
        setMissionComplete(true);
        setIsExecuting(false);
      }
    };
    const handleProactive = (e: Event) => {
      // Sometimes proactive report is stored globally or passed in detail
      const detail = (e as CustomEvent).detail;
      if (detail && detail.report) {
        setAgentResult(detail.report);
      } else {
        // Fallback for proactive event without detail (handled via ref in some places, we assume detail.report is passed now)
        // If not, we rely on the dispatching component to send the report text.
      }
      setMissionComplete(true);
      setIsExecuting(false);
    };
    const handleExec = () => {
      setIsExecuting(true);
      setAgentResult(null);
    };

    window.addEventListener('show-mission-report', handleShow);
    window.addEventListener('show-proactive-report', handleProactive);
    window.addEventListener('agent-executing', handleExec);
    return () => {
      window.removeEventListener('show-mission-report', handleShow);
      window.removeEventListener('show-proactive-report', handleProactive);
      window.removeEventListener('agent-executing', handleExec);
    };
  }, []);

  const onClose = () => setAgentResult(null);

  const onFollowUp = () => {
    if (!commandInput.trim() || isExecuting) return;
    if (isListening && recognitionRef.current) recognitionRef.current.stop();
    window.dispatchEvent(new CustomEvent('agent-shortcut', { detail: { prompt: commandInput } }));
    setCommandInput('');
    setIsExecuting(true);
    setAgentResult(null);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Voice typing is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
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

      <AnimatePresence>
        {agentResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1,    x: '-50%', y: '-50%' }}
            exit={{   opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
            className={`mission-report-overlay ${isExpanded ? 'expanded' : ''}`}
          >
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
                  {agentResult.replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')}
                </ReactMarkdown>
              </div>

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

              {!isSignedInToGoogle() && wasEverConnectedToGoogle() && (
                <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontWeight: 600, marginBottom: '0.75rem' }}>
                    <AlertTriangle size={18} /> Google Workspace Disconnected
                  </div>
                  <p style={{ color: '#e4e4e7', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                    Your session timed out. Click the button below to instantly re-authenticate and allow the agents to resume execution.
                  </p>
                  <button
                    onClick={() => {
                      signInWithGoogle().then(() => {
                        window.location.reload(); // Quick refresh to resume agent fleet
                      }).catch(err => {
                        console.error('Failed to sign in', err);
                        alert('Failed to connect: ' + err.message);
                      });
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.75rem 1.25rem', background: '#ef4444', color: 'white',
                      border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    <Key size={18} /> Re-Connect Google Workspace
                  </button>
                </div>
              )}
            </div>

            <div className="mission-report-footer">
              <input
                type="text"
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onFollowUp(); }}
                disabled={isExecuting}
                placeholder={isListening ? "Listening..." : "Assign a follow-up task..."}
                className="agent-command-input focus:outline-none focus:ring-0"
              />
              <button
                type="button"
                onClick={toggleListening}
                disabled={isExecuting}
                style={{ 
                  background: isListening ? 'rgba(239, 68, 68, 0.2)' : 'transparent', 
                  border: `1px solid ${isListening ? '#ef4444' : 'transparent'}`,
                  color: isListening ? '#ef4444' : '#a1a1aa',
                  borderRadius: '8px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  marginRight: '8px',
                  transition: 'all 0.2s',
                  flexShrink: 0
                }}
                title="Voice Dictation"
              >
                <Mic size={18} />
              </button>
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
