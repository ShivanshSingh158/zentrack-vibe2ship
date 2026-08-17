import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import {
  Play, Pause, RotateCcw, X, Zap, CloudRain, CloudDrizzle,
  Trees, Waves, VolumeX, Check, Maximize2, Timer as TimerIcon
} from 'lucide-react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { LearningSubTask } from '../../types/index';
import { playPopSound } from '../../utils/sound';
import { ParticleFlowBackground } from '../ui/ParticleFlowBackground';
import { motion, AnimatePresence } from 'framer-motion';

export const FocusModeOverlay = () => {
  const {
    state, focusMode, setFocusMode, toggleFocusMode,
    pauseTimer, resumeTimer, resetTimer, dismissTimer,
    formatTime, setAmbientSound, setDuration
  } = usePomodoroContext();

  const [subTasks, setSubTasks] = useState<LearningSubTask[]>([]);
  const [sessionType, setSessionType] = useState<string>('Focus');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioSources = {
    'none': '',
    'rain': 'https://assets.mixkit.co/active_storage/sfx/2391/2391-preview.mp3',
    'soft-rain': 'youtube:Jvgx5HHJ0qw',
    'forest': 'youtube:xNN7iTA57jM',
    'waves': 'https://www.soundjay.com/nature/sounds/ocean-wave-1.mp3'
  };

  const isYoutube = state.ambientSound !== 'none' && audioSources[state.ambientSound]?.startsWith('youtube:');

  useEffect(() => {
    if (audioRef.current) {
      if (state.ambientSound !== 'none' && !isYoutube) {
        audioRef.current.src = audioSources[state.ambientSound];
        if (state.ambientSound === 'soft-rain') {
          audioRef.current.volume = 0.3;
        } else {
          audioRef.current.volume = 1.0;
        }
        audioRef.current.loop = true;
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [state.ambientSound, focusMode]);

  useEffect(() => {
    if (!focusMode && audioRef.current) {
      audioRef.current.pause();
    } else if (focusMode && audioRef.current && state.ambientSound !== 'none' && !isYoutube) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
  }, [focusMode, state.ambientSound, isYoutube]);

  useEffect(() => {
    if (!focusMode || !state.learningTopicId) {
      setSubTasks([]);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'learning_topics', state.learningTopicId), (docSnap) => {
      if (docSnap.exists()) {
        setSubTasks(docSnap.data().subTasks || []);
      }
    });
    return () => unsubscribe();
  }, [focusMode, state.learningTopicId]);

  const toggleSubTask = async (subTaskId: string) => {
    if (!state.learningTopicId) return;
    let newStatus = false;
    const updated = subTasks.map(st => {
      if (st.id === subTaskId) {
        newStatus = st.status !== 'completed';
        return { ...st, isCompleted: newStatus };
      }
      return st;
    });
    if (newStatus) playPopSound();
    try {
      await updateDoc(doc(db, 'learning_topics', state.learningTopicId), { subTasks: updated });
    } catch (error) {
      console.error('Failed to update subtask', error);
    }
  };

  // Track the initial timeLeft when a session starts
  const sessionDurationRef = useRef<number>(25 * 60);
  const prevTaskIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (state.taskId && state.taskId !== prevTaskIdRef.current) {
      sessionDurationRef.current = state.timeLeft;
      prevTaskIdRef.current = state.taskId;
    }
    if (!state.taskId) prevTaskIdRef.current = null;
  });

  // Background gradient for focus overlay
  let bgGradient = 'radial-gradient(ellipse at center, rgba(10, 10, 14, 0.97) 0%, rgba(5, 5, 8, 1) 100%)';
  if (state.ambientSound === 'rain') bgGradient = 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 1) 100%)';
  if (state.ambientSound === 'soft-rain') bgGradient = 'radial-gradient(ellipse at center, rgba(16, 25, 36, 0.95) 0%, rgba(3, 8, 16, 1) 100%)';
  if (state.ambientSound === 'forest') bgGradient = 'radial-gradient(ellipse at center, rgba(20, 35, 20, 0.95) 0%, rgba(5, 15, 5, 1) 100%)';
  if (state.ambientSound === 'waves') bgGradient = 'radial-gradient(ellipse at center, rgba(15, 35, 45, 0.95) 0%, rgba(5, 15, 25, 1) 100%)';

  return (
    <>
      {/* ── 1. FLOATING MINI-TIMER PILL (When timer is running in background) ── */}
      <AnimatePresence>
        {!focusMode && state.taskId && state.timeLeft > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
            style={{
              position: 'fixed',
              bottom: '84px',
              right: '24px',
              zIndex: 9990,
              background: 'rgba(20, 20, 24, 0.92)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(165, 153, 255, 0.35)',
              borderRadius: '9999px',
              padding: '0.45rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 20px rgba(165, 153, 255, 0.25)',
              cursor: 'pointer',
            }}
            onClick={() => setFocusMode(true)}
          >
            {/* Pulsing Timer Icon Indicator */}
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: state.isRunning ? 'rgba(165, 153, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                border: state.isRunning ? '1px solid #a599ff' : '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: state.isRunning ? '#a599ff' : '#ffffff',
              }}
            >
              <TimerIcon size={14} className={state.isRunning ? 'animate-pulse' : ''} />
            </div>

            {/* Live Ticking Time */}
            <span
              style={{
                fontFamily: "var(--font-sans, 'Inter', sans-serif)",
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.02em',
              }}
            >
              {formatTime(state.timeLeft)}
            </span>

            {/* Task Name Preview */}
            <span
              style={{
                fontSize: '0.78rem',
                color: '#8e8e93',
                maxWidth: '130px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontWeight: 500,
              }}
            >
              {state.taskText}
            </span>

            {/* Mini Play / Pause Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                state.isRunning ? pauseTimer() : resumeTimer();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                cursor: 'pointer',
              }}
              title={state.isRunning ? 'Pause' : 'Resume'}
            >
              {state.isRunning ? <Pause size={11} /> : <Play size={11} />}
            </button>

            {/* Expand to Full Focus Mode */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFocusMode(true);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#a599ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: '2px',
              }}
              title="Expand Focus Mode"
            >
              <Maximize2 size={13} />
            </button>

            {/* Dismiss */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissTimer();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#8e8e93',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: '2px',
              }}
              title="Dismiss Timer"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 2. FULLSCREEN FOCUS MODE OVERLAY ── */}
      <AnimatePresence>
        {focusMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="focus-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              background: bgGradient,
              transition: 'background 1s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ParticleFlowBackground speedMultiplier={state.isRunning ? 1.0 : 0.2} opacity={0.3} />
            <audio ref={audioRef} />
            {isYoutube && (
              <iframe
                width="0"
                height="0"
                src={`https://www.youtube-nocookie.com/embed/${audioSources[state.ambientSound].split(':')[1]}?autoplay=1&loop=1&playlist=${audioSources[state.ambientSound].split(':')[1]}`}
                frameBorder="0"
                allow="autoplay"
                style={{ display: 'none' }}
                title="Ambient Sound"
              />
            )}

            <div
              className="focus-content"
              style={{
                width: '100%',
                maxWidth: '800px',
                height: '100%',
                padding: '2rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                zIndex: 2,
              }}
            >
              {/* Top Header */}
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div className="focus-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a599ff' }}>
                  <Zap size={22} color="#a599ff" />
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Deep Focus</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {/* Ambient Sound Controls */}
                  <div className="ambient-controls" style={{ display: 'flex', gap: '0.4rem', background: 'rgba(255,255,255,0.06)', padding: '0.35rem 0.6rem', borderRadius: '99px' }}>
                    <button className={`ambient-btn ${state.ambientSound === 'none' ? 'active' : ''}`} onClick={() => setAmbientSound('none')} title="No Sound"><VolumeX size={15} /></button>
                    <button className={`ambient-btn ${state.ambientSound === 'rain' ? 'active' : ''}`} onClick={() => setAmbientSound('rain')} title="Heavy Rain"><CloudRain size={15} /></button>
                    <button className={`ambient-btn ${state.ambientSound === 'soft-rain' ? 'active' : ''}`} onClick={() => setAmbientSound('soft-rain')} title="Soft Rain"><CloudDrizzle size={15} /></button>
                    <button className={`ambient-btn ${state.ambientSound === 'forest' ? 'active' : ''}`} onClick={() => setAmbientSound('forest')} title="Forest"><Trees size={15} /></button>
                    <button className={`ambient-btn ${state.ambientSound === 'waves' ? 'active' : ''}`} onClick={() => setAmbientSound('waves')} title="Waves"><Waves size={15} /></button>
                  </div>

                  {/* Exit / Minimize button */}
                  <button
                    type="button"
                    onClick={toggleFocusMode}
                    title="Minimize Focus Mode"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {state.taskId ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', flex: 1, justifyContent: 'center', width: '100%' }}>
                  {/* Session Type Tabs */}
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.3rem', background: 'rgba(255,255,255,0.04)', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}>
                    {(['Focus', 'Short Break', 'Long Break']).map(tab => {
                      const isActive = (sessionType === tab);
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setSessionType(tab);
                            if (tab === 'Focus') setDuration(25);
                            else if (tab === 'Short Break') setDuration(5);
                            else setDuration(15);
                          }}
                          style={{
                            padding: '0.35rem 0.95rem',
                            borderRadius: '999px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            background: isActive ? 'rgba(165,153,255,0.18)' : 'transparent',
                            color: isActive ? '#a599ff' : 'rgba(255,255,255,0.5)',
                            border: isActive ? '1px solid rgba(165,153,255,0.35)' : '1px solid transparent',
                            transition: 'all 0.15s',
                          }}
                        >
                          {tab}
                        </button>
                      );
                    })}
                  </div>

                  {/* Timer Ring Visualizer */}
                  <div
                    style={{
                      position: 'relative',
                      width: '280px',
                      height: '280px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.02)',
                      boxShadow: state.isRunning ? '0 0 50px rgba(165,153,255,0.15)' : 'none',
                      transition: 'all 0.5s ease',
                    }}
                  >
                    <svg width="280" height="280" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
                      <circle cx="140" cy="140" r="134" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                      <circle
                        cx="140"
                        cy="140"
                        r="134"
                        fill="none"
                        stroke="#a599ff"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray="180 80"
                        style={{
                          transformOrigin: 'center',
                          animation: state.isRunning ? 'spin 8s linear infinite' : 'none',
                          opacity: state.isRunning ? 1 : 0.35,
                          transition: 'opacity 0.5s ease',
                          filter: 'drop-shadow(0 0 10px rgba(165,153,255,0.6))',
                        }}
                      />
                    </svg>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 10 }}>
                      {!state.isRunning && (
                        <button
                          type="button"
                          onClick={() => setDuration(Math.max(1, Math.floor(state.timeLeft / 60) - 5))}
                          style={{ background: 'none', border: 'none', fontSize: '1.1rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0.5rem' }}
                        >
                          -5
                        </button>
                      )}

                      <span
                        style={{
                          fontFamily: "var(--font-display, 'Playfair Display', Georgia, serif)",
                          fontWeight: 600,
                          fontSize: '4.25rem',
                          color: '#ffffff',
                          letterSpacing: '-0.03em',
                          lineHeight: 1,
                        }}
                      >
                        {formatTime(state.timeLeft)}
                      </span>

                      {!state.isRunning && (
                        <button
                          type="button"
                          onClick={() => setDuration(Math.floor(state.timeLeft / 60) + 5)}
                          style={{ background: 'none', border: 'none', fontSize: '1.1rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0.5rem' }}
                        >
                          +5
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', gap: '0.85rem' }}>
                    <button
                      type="button"
                      onClick={resetTimer}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '9999px',
                        color: 'rgba(255,255,255,0.7)',
                        padding: '0.65rem 1.75rem',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Reset
                    </button>

                    <button
                      type="button"
                      onClick={() => state.isRunning ? pauseTimer() : resumeTimer()}
                      style={{
                        background: '#a599ff',
                        borderRadius: '9999px',
                        border: 'none',
                        color: '#000000',
                        padding: '0.65rem 2.25rem',
                        fontSize: '0.92rem',
                        cursor: 'pointer',
                        fontWeight: 700,
                        boxShadow: '0 4px 16px rgba(165, 153, 255, 0.35)',
                      }}
                    >
                      {state.isRunning ? 'Pause' : 'Resume'}
                    </button>

                    <button
                      type="button"
                      onClick={() => { dismissTimer(); setFocusMode(false); }}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '9999px',
                        color: 'rgba(255,255,255,0.7)',
                        padding: '0.65rem 1.75rem',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Skip
                    </button>
                  </div>

                  {/* Task Info & Subtasks */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '560px',
                      background: 'rgba(255,255,255,0.03)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                      CURRENTLY FOCUSING ON
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-display, 'Playfair Display', Georgia, serif)",
                        fontSize: '1.65rem',
                        fontWeight: 600,
                        color: '#ffffff',
                        textAlign: 'center',
                        lineHeight: 1.25,
                      }}
                    >
                      {state.taskText}
                    </div>

                    {subTasks.length > 0 && (
                      <div style={{ width: '100%', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {subTasks.map(st => (
                          <div
                            key={st.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.6rem 0.85rem',
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: '10px',
                              opacity: st.status === 'completed' ? 0.5 : 1,
                              transition: 'opacity 0.2s',
                            }}
                          >
                            <button
                              type="button"
                              className={`todo-checkbox ${st.status === 'completed' ? 'checked' : ''}`}
                              onClick={() => toggleSubTask(st.id)}
                              style={{ width: '18px', height: '18px' }}
                            >
                              {st.status === 'completed' && <Check size={11} strokeWidth={3} />}
                            </button>
                            <span style={{ fontSize: '0.88rem', color: st.status === 'completed' ? '#8e8e93' : '#ffffff', textDecoration: st.status === 'completed' ? 'line-through' : 'none' }}>
                              {st.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '1rem', textAlign: 'center' }}>
                  <TimerIcon size={44} color="#a599ff" />
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>Ready to focus?</h3>
                  <p style={{ fontSize: '0.9rem', color: '#8e8e93', margin: 0 }}>Start a timer directly from any task on your list.</p>
                  <button
                    type="button"
                    onClick={() => setFocusMode(false)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '9999px',
                      color: '#ffffff',
                      padding: '0.5rem 1.5rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: '1rem',
                    }}
                  >
                    Return to App
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
