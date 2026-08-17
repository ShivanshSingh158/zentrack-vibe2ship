import { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, X, Sparkles, CheckSquare, Dumbbell, GraduationCap, Moon, Ear, Bot } from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { toast } from 'sonner';
import { missionReportStore } from '../../stores/missionReportStore';
import { db, auth } from '../../services/firebase';
import { collection, addDoc, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { orchestrateAgent } from '../../agent/orchestrator';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { agentMemoryStore } from '../../stores/agentMemoryStore';

import { isSilenceOrNoise } from '../../utils/dateUtils';

interface VoiceQuickCaptureWidgetProps {
  inline?: boolean;
}

export const VoiceQuickCaptureWidget = ({ inline = false }: VoiceQuickCaptureWidgetProps = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [supported, setSupported] = useState(true);
  const [showRadialMenu, setShowRadialMenu] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controls = useAnimation();
  
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => localStorage.getItem('zen_wake_word_enabled') === 'true');
  const wakeWordRef = useRef<any>(null);
  const wakeWordStateRef = useRef({ enabled: wakeWordEnabled, listening: isListening, processing: isProcessing });

  useEffect(() => {
    wakeWordStateRef.current = { enabled: wakeWordEnabled, listening: isListening, processing: isProcessing };
    localStorage.setItem('zen_wake_word_enabled', wakeWordEnabled.toString());
  }, [wakeWordEnabled, isListening, isProcessing]);
  
  const location = useLocation();
  const navigate = useNavigate();
  const globalData = useGlobalData();

  // Determine context-aware theme colors
  let baseColor = '#c084fc'; // Default light purple
  let glowColor = '#a855f7'; // Default strong purple
  let gradientColors = '#a855f7, #ec4899, #f97316';
  
  if (location.pathname.startsWith('/todo')) {
    baseColor = '#b8afff'; glowColor = '#a599ff';
    gradientColors = '#a599ff, #b8afff, #93c5fd';
  } else if (location.pathname.startsWith('/attendance')) {
    baseColor = '#34d399'; glowColor = '#10b981';
    gradientColors = '#10b981, #34d399, #6ee7b7';
  } else if (location.pathname.startsWith('/log')) {
    baseColor = '#818cf8'; glowColor = '#6366f1';
    gradientColors = '#6366f1, #818cf8, #a5b4fc';
  } else if (location.pathname.startsWith('/learning')) {
    baseColor = '#fbbf24'; glowColor = '#f59e0b';
    gradientColors = '#f59e0b, #fbbf24, #fcd34d';
  }

  const recognitionRef = useRef<any>(null);

  const actionRefs = useRef<any>({});

  useEffect(() => {
    if (!supported) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (!wakeWordRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript.toLowerCase();
        }
        
        console.log("[WakeWord] Heard:", transcript);
        const match = transcript.match(/hey zen|heizen|hey then|haysen/i);
        if (match) {
          recognition.stop();
          
          // Play a small wake sound immediately
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            osc.frequency.value = 880;
            osc.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
          } catch(e) {}
          
          // Wait 400ms for the background recognition to fully release the audio hardware
          // before starting the main foreground recognition engine.
          setTimeout(() => {
            try {
              actionRefs.current.toggleListening?.();
            } catch (err) {
              console.error("[WakeWord] Error starting main mic", err);
            }
          }, 400);
        }
      };

      recognition.onend = () => {
        const state = wakeWordStateRef.current;
        if (state.enabled && !state.listening && !state.processing) {
          try { wakeWordRef.current?.start(); } catch(e) {}
        }
      };
      
      wakeWordRef.current = recognition;
    }

    const state = wakeWordStateRef.current;
    if (state.enabled && !state.listening && !state.processing) {
      try { wakeWordRef.current?.start(); } catch(e) {}
    } else {
      try { wakeWordRef.current?.stop(); } catch(e) {}
    }
  }, [wakeWordEnabled, isListening, isProcessing, supported]);

  useEffect(() => {
    // Check support for Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscription('');
      window.dispatchEvent(new CustomEvent('close-mission-report'));
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscription(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast.error('Microphone error: ' + event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  // Global toggle event listener
  useEffect(() => {
    const handleToggle = () => {
      toggleListening();
    };
    window.addEventListener('toggle-voice-capture', handleToggle);
    return () => window.removeEventListener('toggle-voice-capture', handleToggle);
  }, []);

  useEffect(() => {
    if (!isListening && transcription.trim() && !isSilenceOrNoise(transcription) && !isProcessing) {
      processTranscription(transcription);
    }
  }, [isListening, transcription]);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      controls.start({ x: 0, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
    }, 4 * 60 * 1000); // 4 minutes
  };

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const processTranscription = async (text: string) => {
    if (isSilenceOrNoise(text)) return;
    const user = auth.currentUser;
    if (!user) {
      toast.error('Please log in to use voice commands.');
      return;
    }

    setIsProcessing(true);
    const processToastId = toast.loading('Agent routing...');
    const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js

    try {
      // 1. Open agent terminal so user can see live steps
      window.dispatchEvent(new CustomEvent('agent-terminal-open'));
      
      agentMemoryStore.appendMessage({ role: 'user', title: text });
      const answer = await orchestrateAgent(
        text,
        globalData,
        apiKey,
        (step) => {
          window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, source: 'user' } }));
          if (step.type === 'thinking') {
             toast.loading(`Thinking: ${step.title}`, { id: processToastId });
          } else if (step.type === 'tool_call') {
             toast.loading(`Running Tool: ${step.toolName}`, { id: processToastId });
          }
        }
      );
      agentMemoryStore.appendMessage({ role: 'agent', title: answer });
      
      const isChat = answer.length < 250 && !answer.includes('\n') && !answer.includes('##') && !answer.includes('✅') && !answer.includes('SPOKEN_SUMMARY');

      toast.success(isChat ? 'Jarvis replied' : 'Mission complete', { 
        id: processToastId,
        description: isChat ? 'Response ready' : 'Agent result ready',
        duration: 5000,
        action: isChat ? undefined : { label: 'View Report', onClick: () => window.dispatchEvent(new CustomEvent('show-mission-report', { detail: { result: answer } })) }
      });

      // Save to sessionStorage so dashboard can load it on route switch/mount
      sessionStorage.setItem('pending_proactive_briefing', answer);
      
      if (!isChat) {
        missionReportStore.addReport(answer);
      }

      // Navigate to the home dashboard
      navigate('/home');

      if (!isChat) {
        // Auto-surface Mission Report on success
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('show-mission-report', { detail: { result: answer } }));
        }, 500);
      }
      
      setTranscription('');
      window.dispatchEvent(new CustomEvent('close-mission-report'));
    } catch (err: any) {
      console.error('Agent execution error:', err);
      toast.error('Agent failed: ' + (err.message || 'Unknown error'), { id: processToastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (!supported) {
      toast.error('Voice typing is not supported in this browser.');
      return;
    }
    
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const cancelListening = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (recognitionRef.current) {
      setTranscription('');
      window.dispatchEvent(new CustomEvent('close-mission-report'));
      recognitionRef.current.stop();
    }
  };

  if (!supported) return null;

  const bottomPosition = 'calc(85px + env(safe-area-inset-bottom, 0px))';

  return (
    <motion.div 
      drag={!inline}
      dragMomentum={false}
      dragElastic={0.1}
      whileDrag={{ scale: inline ? 1 : 1.05 }}
      animate={controls}
      className={inline ? "" : "voice-widget-fab"}
      onDragStart={() => {
        if (!inline && idleTimerRef.current) clearTimeout(idleTimerRef.current);
      }}
      onDragEnd={() => {
        if (!inline) resetIdleTimer();
      }}
      style={inline ? {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        zIndex: 10,
        pointerEvents: 'none'
      } : {
        position: 'fixed',
        bottom: bottomPosition,
        right: '2rem',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '0.5rem',
        pointerEvents: 'none', // allow clicking through the container
        transition: 'bottom 0.3s ease-out'
      }}
    >
      
      {/* Transcript tooltip */}
      {(isListening || isProcessing) && transcription && (
        <div style={{
          background: 'rgba(14, 14, 18, 0.95)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${glowColor}50`,
          padding: '0.6rem 1rem',
          borderRadius: '16px',
          color: '#fff',
          fontSize: '0.85rem',
          maxWidth: '80vw',
          textAlign: 'right',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'pageEnter 0.2s ease-out',
          pointerEvents: 'auto'
        }}>
          {transcription}
          <span style={{ 
            display: isListening ? 'inline-block' : 'none', 
            width: '4px', height: '14px', background: baseColor, 
            marginLeft: '4px', verticalAlign: 'middle',
            animation: 'pulse 1s infinite alternate' 
          }} />
        </div>
      )}

      {/* Radial Menu */}
      <AnimatePresence>
        {showRadialMenu && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', zIndex: 0, pointerEvents: 'auto' }}>
            {[
              { icon: <CheckSquare size={20} />, label: 'Todo', color: '#a599ff', route: '/todo' },
              { icon: <GraduationCap size={20} />, label: 'Attendance', color: '#10b981', route: '/attendance' },
              { icon: <Moon size={20} />, label: 'Sleep', color: '#6366f1', route: '/log' },
            ].map((item: any, index, arr) => {
              // Spread between -90deg (top) and -180deg (left)
              const angle = -Math.PI/2 - (Math.PI/2) * (index / (arr.length - 1));
              const radius = 80;
              const targetX = Math.cos(angle) * radius - 22;
              const targetY = Math.sin(angle) * radius - 22;

              return (
                <motion.button
                  key={item.label}
                  initial={{ x: -22, y: -22, scale: 0, opacity: 0 }}
                  animate={{ x: targetX, y: targetY, scale: 1, opacity: 1 }}
                  exit={{ x: -22, y: -22, scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: index * 0.05 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.action === 'TOGGLE_WAKE_WORD') {
                      setWakeWordEnabled(prev => !prev);
                    } else if (item.route) {
                      navigate(item.route);
                    }
                    setShowRadialMenu(false);
                  }}
                  style={{
                    position: 'absolute',
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'rgba(20, 20, 25, 0.95)',
                    border: `1px solid ${item.color}50`,
                    color: item.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: `0 4px 15px rgba(0,0,0,0.5), 0 0 10px ${item.color}30`
                  }}
                  title={item.label}
                  whileHover={{ scale: 1.15, background: item.color, color: '#fff', border: 'none' }}
                  whileTap={{ scale: 0.9 }}
                >
                  {item.icon}
                </motion.button>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Main Mic Button */}
      <div style={{ position: 'relative', pointerEvents: 'auto' }}>
        {/* Quick Toggle for Agent Menu (The "More Feature" Bot) */}
        <button
          className="show-on-mobile"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('toggle-global-fab'));
          }}
          style={{
            position: 'absolute',
            top: '-15px',
            left: '-10px',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(20, 20, 25, 0.95)',
            border: '1px solid #a599ff',
            color: '#b8afff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
          }}
          title="Open Agent Menu"
        >
          <Bot size={14} />
        </button>
        
        {/* Quick Toggle for Wake Word - Hidden per user request */}
        <button
          onClick={(e) => {
             if (showRadialMenu) {
               setShowRadialMenu(false);
               return;
             }
             toggleListening();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowRadialMenu(prev => !prev);
          }}
          onMouseDown={() => {
            pressTimer.current = setTimeout(() => setShowRadialMenu(true), 400);
          }}
          onMouseUp={() => {
            if (pressTimer.current) clearTimeout(pressTimer.current);
          }}
          onMouseLeave={() => {
            if (pressTimer.current) clearTimeout(pressTimer.current);
          }}
          onTouchStart={() => {
            pressTimer.current = setTimeout(() => setShowRadialMenu(true), 400);
          }}
          onTouchEnd={() => {
            if (pressTimer.current) clearTimeout(pressTimer.current);
          }}
          disabled={isProcessing}
          aria-label="Voice Quick Capture"
          style={{
            position: 'relative',
            zIndex: 1,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(14, 14, 18, 0.95)', // Dark surface normally
            border: 'none',
            color: '#fff',
            cursor: isProcessing ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1)',
            transform: 'scale(1)',
            transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          {isProcessing ? (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <div
                style={{ zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Mic size={24} color="#fff" />
              </div>
            </div>
          ) : (
            <div style={{ 
              position: 'relative', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '100%',
              height: '100%',
            }}>
              
              {/* 2D Rotating Container */}
              <div style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'spinAndPause 6s infinite',
              }}>
                
                {/* FRONT (Mic & Sparkles) */}
                <div style={{
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'swapMic 6s infinite',
                }}>
                  <Mic size={24} color={isListening ? '#fff' : baseColor} style={{ transition: 'color 0.5s ease' }} />
                  {!isListening && (
                    <Sparkles 
                      size={14} 
                      style={{ 
                        position: 'absolute', 
                        top: '-6px', 
                        right: '-8px', 
                        color: '#fbbf24',
                        animation: 'starTwinkle 3s ease-in-out infinite'
                      }} 
                    />
                  )}
                </div>

                {/* BACK (Logo graphic) */}
                <div style={{
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'swapLogo 6s infinite',
                  pointerEvents: 'none'
                }}>
                  <img 
                    src="/logo.png" 
                    alt="Listening"
                    draggable={false}
                    style={{
                      width: '32px', 
                      height: '32px',
                      borderRadius: '50%',
                      mixBlendMode: 'screen',
                      filter: isListening ? 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' : 'none',
                      objectFit: 'contain',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  />
                </div>
                
              </div>
            </div>
          )}
        </button>

        {/* Cancel small button */}
        {isListening && (
          <button
            onClick={cancelListening}
            style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--bg-surface)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </motion.div>
  );
};
