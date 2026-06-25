import { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, X, Sparkles, CheckSquare, Dumbbell, GraduationCap, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalDateString } from '../../utils/dateUtils';
import { toast } from 'sonner';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { orchestrateAgent } from '../../agent/orchestrator';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { agentMemoryStore } from '../../stores/agentMemoryStore';

export const VoiceQuickCaptureWidget = () => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [supported, setSupported] = useState(true);
  const [speechRecognitionError, setSpeechRecognitionError] = useState('');
  const [showRadialMenu, setShowRadialMenu] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const location = useLocation();
  const navigate = useNavigate();
  const { tasks, calendarEvents } = useGlobalData();

  // Determine context-aware theme colors
  let baseColor = '#c084fc'; // Default light purple
  let glowColor = '#a855f7'; // Default strong purple
  let gradientColors = '#a855f7, #ec4899, #f97316';
  
  if (location.pathname.startsWith('/todo')) {
    baseColor = '#60a5fa'; glowColor = '#3b82f6';
    gradientColors = '#3b82f6, #60a5fa, #93c5fd';
  } else if (location.pathname.startsWith('/gym')) {
    baseColor = '#f87171'; glowColor = '#ef4444';
    gradientColors = '#ef4444, #f87171, #fca5a5';
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

  useEffect(() => {
    // Check support for Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscription('');
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
      if (event.error !== 'no-speech') {
        toast.error('Microphone error: ' + event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, []);

  useEffect(() => {
    if (!isListening && transcription.trim() && !isProcessing) {
      processTranscription(transcription);
    }
  }, [isListening, transcription]);

  const processTranscription = async (text: string) => {
    const user = auth.currentUser;
    if (!user) {
      toast.error('Please log in to use voice commands.');
      return;
    }

    setIsProcessing(true);
    const processToastId = toast.loading('Agent routing...');
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

    try {
      agentMemoryStore.appendMessage({ role: 'user', title: text });
      const answer = await orchestrateAgent(
        text,
        tasks,
        calendarEvents,
        apiKey,
        (step) => {
          if (step.type === 'thinking') {
             toast.loading(`Thinking: ${step.title}`, { id: processToastId });
          } else if (step.type === 'tool_call') {
             toast.loading(`Running Tool: ${step.toolName}`, { id: processToastId });
          }
        }
      );
      agentMemoryStore.appendMessage({ role: 'agent', title: answer });
      
      toast.success('Mission complete', { 
        id: processToastId,
        description: 'Agent result ready',
        duration: 5000,
        action: { label: 'View Report', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report')) }
      });

      // Save to sessionStorage so dashboard can load it on route switch/mount
      sessionStorage.setItem('pending_proactive_briefing', answer);

      // Navigate to the home dashboard
      navigate('/home');

      // ✅ Surface result visually in Mission Report panel (same event the dashboard already listens for)
      window.dispatchEvent(new CustomEvent('proactive-briefing', {
        detail: { report: answer, fromVoice: true }
      }));
      
      // Also speak the result via TTS for eyes-free UX
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(answer.slice(0, 500)); // limit TTS to 500 chars
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
      
      setTranscription('');
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
      recognitionRef.current.stop();
    }
  };

  const validPaths = ['/home', '/todo', '/gym', '/attendance', '/tools', '/learning', '/academic', '/dashboard', '/goals', '/analytics', '/habits', '/calendar'];
  const showWidget = validPaths.includes(location.pathname) || location.pathname === '/';
  if (!supported || !showWidget) return null;

  // ZenGym AI usually sits at the bottom right. Move the voice widget higher specifically on the gym page.
  const bottomPosition = location.pathname === '/gym' 
    ? 'calc(155px + env(safe-area-inset-bottom, 0px))'
    : 'calc(85px + env(safe-area-inset-bottom, 0px))';

  return (
    <motion.div 
      drag
      dragMomentum={false}
      dragElastic={0.1}
      whileDrag={{ scale: 1.05 }}
      style={{
        position: 'fixed',
        bottom: bottomPosition,
        right: '1.25rem',
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
              { icon: <CheckSquare size={20} />, label: 'Todo', color: '#3b82f6', route: '/todo' },
              { icon: <Dumbbell size={20} />, label: 'Gym', color: '#ef4444', route: '/gym' },
              { icon: <GraduationCap size={20} />, label: 'Attendance', color: '#10b981', route: '/attendance' },
              { icon: <Moon size={20} />, label: 'Sleep', color: '#6366f1', route: '/log' },
            ].map((item, index, arr) => {
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
                    navigate(item.route);
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
        {/* Animated gradient ring wrapper */}
        <div style={{
          position: 'absolute',
          inset: '-2px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${gradientColors})`,
          opacity: isListening ? 1 : 0.8,
          animation: isListening ? 'spin 2s linear infinite' : 'none',
          zIndex: 0,
          filter: isListening ? 'blur(4px)' : 'none',
          transition: 'all 0.3s ease'
        }} />
        
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
            background: isListening 
              ? '#ef4444' // Solid red when recording
              : 'rgba(14, 14, 18, 0.95)', // Dark surface normally
            border: 'none',
            color: isListening ? '#fff' : '#fff',
            cursor: isProcessing ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1)',
            transform: isListening ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          {isProcessing ? (
            <Loader2 size={24} className="spin" color="#fff" />
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
