import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { Play, Pause, RotateCcw, X, Zap, CloudRain, CloudDrizzle, Trees, Waves, VolumeX, Check } from 'lucide-react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { LearningSubTask } from '../../types/index';
import { playPopSound } from '../../utils/sound';

export const FocusModeOverlay = () => {
  const { state, focusMode, toggleFocusMode, pauseTimer, resumeTimer, resetTimer, dismissTimer, formatTime, setAmbientSound, setDuration } = usePomodoroContext();
  const [subTasks, setSubTasks] = useState<LearningSubTask[]>([]);
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
        newStatus = !st.isCompleted;
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

  // Track the initial timeLeft when a session starts — so progress is always
  // relative to the actual session duration (not DEFAULT_DURATION of 25min).
  const sessionDurationRef = useRef<number>(25 * 60);
  const prevTaskIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    // When a new task starts (taskId changes from null or changes), snapshot the current timeLeft
    if (state.taskId && state.taskId !== prevTaskIdRef.current) {
      sessionDurationRef.current = state.timeLeft;
      prevTaskIdRef.current = state.taskId;
    }
    if (!state.taskId) prevTaskIdRef.current = null;
  });

  if (!focusMode) return null;

  let bgGradient = 'radial-gradient(ellipse at center, rgba(10, 10, 14, 0.97) 0%, rgba(5, 5, 8, 1) 100%)';
  if (state.ambientSound === 'rain') bgGradient = 'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 1) 100%)';
  if (state.ambientSound === 'soft-rain') bgGradient = 'radial-gradient(ellipse at center, rgba(16, 25, 36, 0.95) 0%, rgba(3, 8, 16, 1) 100%)';
  if (state.ambientSound === 'forest') bgGradient = 'radial-gradient(ellipse at center, rgba(20, 35, 20, 0.95) 0%, rgba(5, 15, 5, 1) 100%)';
  if (state.ambientSound === 'waves') bgGradient = 'radial-gradient(ellipse at center, rgba(15, 35, 45, 0.95) 0%, rgba(5, 15, 25, 1) 100%)';

  return (
    <div className="focus-overlay hide-on-mobile" style={{ background: bgGradient, transition: 'background 1s ease' }}>
      <audio ref={audioRef} />
      {isYoutube && focusMode && (
        <iframe
          width="0"
          height="0"
          src={`https://www.youtube.com/embed/${audioSources[state.ambientSound].split(':')[1]}?autoplay=1&loop=1&playlist=${audioSources[state.ambientSound].split(':')[1]}`}
          frameBorder="0"
          allow="autoplay"
          style={{ display: 'none' }}
        ></iframe>
      )}
      
      <div className="focus-content" style={{ width: '100%', maxWidth: '800px', height: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Top Header */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div className="focus-brand">
            <Zap size={24} />
            <span style={{ fontSize: '0.9rem' }}>Deep Focus</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Ambient Sound Controls */}
            <div className="ambient-controls" style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.4rem', borderRadius: '99px', marginRight: '1rem' }}>
              <button className={`ambient-btn ${state.ambientSound === 'none' ? 'active' : ''}`} onClick={() => setAmbientSound('none')} title="No Sound"><VolumeX size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'rain' ? 'active' : ''}`} onClick={() => setAmbientSound('rain')} title="Heavy Rain"><CloudRain size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'soft-rain' ? 'active' : ''}`} onClick={() => setAmbientSound('soft-rain')} title="Soft Rain"><CloudDrizzle size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'forest' ? 'active' : ''}`} onClick={() => setAmbientSound('forest')} title="Forest"><Trees size={16} /></button>
              <button className={`ambient-btn ${state.ambientSound === 'waves' ? 'active' : ''}`} onClick={() => setAmbientSound('waves')} title="Waves"><Waves size={16} /></button>
            </div>

            <button className="focus-close" onClick={toggleFocusMode} title="Exit Focus Mode" style={{ position: 'static' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {state.taskId ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5rem', flex: 1, justifyContent: 'center', width: '100%' }}>
            
            {/* Timer Ring */}
            <div className="focus-timer-ring" style={{
              position: 'relative',
              width: '280px',
              height: '280px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: 'rgba(15, 15, 20, 0.5)',
              boxShadow: state.isRunning ? '0 0 40px rgba(168, 85, 247, 0.2), inset 0 0 20px rgba(168, 85, 247, 0.1)' : 'inset 0 0 20px rgba(0,0,0,0.5)',
              transition: 'all 0.5s ease'
            }}>
              <svg width="280" height="280" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
                <circle cx="140" cy="140" r="136" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
                <circle 
                  cx="140" cy="140" r="136" 
                  fill="none" 
                  stroke="url(#overlayTimerGradient)" 
                  strokeWidth="4" 
                  strokeDasharray="150 60"
                  style={{
                    transformOrigin: 'center',
                    animation: state.isRunning ? 'spin 10s linear infinite' : 'none',
                    opacity: state.isRunning ? 1 : 0.3,
                    transition: 'opacity 0.5s ease'
                  }}
                />
                <defs>
                  <linearGradient id="overlayTimerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="focus-timer-text" style={{ fontSize: '5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', position: 'relative', zIndex: 10 }}>
                {!state.isRunning && (
                  <button className="btn-icon" onClick={() => setDuration(Math.max(1, Math.floor(state.timeLeft / 60) - 5))} style={{ fontSize: '1.5rem', fontWeight: 700, opacity: 0.5, color: 'white', padding: '0.5rem' }}>-5</button>
                )}
                <span style={{
                  fontFamily: 'var(--font-display)', 
                  fontWeight: 800, 
                  color: state.isRunning ? '#fff' : 'var(--text-muted)',
                  textShadow: state.isRunning ? '0 0 15px rgba(168,85,247,0.5)' : 'none',
                  letterSpacing: '-0.02em',
                  transition: 'all 0.5s ease'
                }}>{formatTime(state.timeLeft)}</span>
                {!state.isRunning && (
                  <button className="btn-icon" onClick={() => setDuration(Math.floor(state.timeLeft / 60) + 5)} style={{ fontSize: '1.5rem', fontWeight: 700, opacity: 0.5, color: 'white', padding: '0.5rem' }}>+5</button>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="focus-controls">
              <button className="focus-btn" onClick={resetTimer} title="Reset Timer">
                <RotateCcw size={20} />
              </button>
              <button
                className="focus-btn focus-btn-primary"
                onClick={() => state.isRunning ? pauseTimer() : resumeTimer()}
                style={{ width: '72px', height: '72px' }}
              >
                {state.isRunning ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: '4px' }} />}
              </button>
              <button className="focus-btn" onClick={() => { dismissTimer(); toggleFocusMode(); }} title="Dismiss & Exit">
                <Check size={20} />
              </button>
            </div>

            {/* Task Info & Subtasks */}
            <div style={{ width: '100%', maxWidth: '600px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', marginTop: '2rem' }}>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 600 }}>Currently Focusing On</div>
              <div className="focus-task-name" style={{ fontSize: '1.5rem', fontWeight: 600 }}>{state.taskText}</div>
              
              {subTasks.length > 0 && (
                <div style={{ width: '100%', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {subTasks.map(st => (
                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', opacity: st.isCompleted ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                      <button 
                        className={`todo-checkbox ${st.isCompleted ? 'checked' : ''}`}
                        onClick={() => toggleSubTask(st.id)}
                        style={{ width: '20px', height: '20px' }}
                      >
                        {st.isCompleted && <Check size={12} strokeWidth={3} />}
                      </button>
                      <span style={{ fontSize: '1rem', color: st.isCompleted ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: st.isCompleted ? 'line-through' : 'none' }}>
                        {st.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="focus-empty" style={{ margin: 'auto' }}>
            <p style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Ready to focus?</p>
            <p style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Start a Pomodoro from your To-Do list or Learning path.</p>
            <button className="btn-secondary" onClick={toggleFocusMode} style={{ marginTop: '2rem', margin: '2rem auto 0 auto' }}>Return to App</button>
          </div>
        )}
      </div>
    </div>
  );
};
