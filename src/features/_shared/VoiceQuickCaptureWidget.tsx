import { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, X, Sparkles, CheckSquare, Dumbbell, GraduationCap, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalDateString } from '../../utils/dateUtils';
import { toast } from 'sonner';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { parseUniversalVoiceCommand } from '../../services/gemini';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalData } from '../../contexts/GlobalDataContext';

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
  const { todos, calendarEvents } = useGlobalData();

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
    const processToastId = toast.loading('Understanding voice command...');

    try {
      const contextString = `Tasks: ${JSON.stringify(todos.slice(0, 10))}\nEvents: ${JSON.stringify(calendarEvents)}`;
      const parsed = await parseUniversalVoiceCommand(text, contextString);
      const { module, action, payload } = parsed;

      if (module === 'chat' && action === 'speak') {
        toast.dismiss(processToastId);
        toast.success(payload.response);
        
        // Use Web Speech API for TTS
        const utterance = new SpeechSynthesisUtterance(payload.response);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
        
        setIsProcessing(false);
        setTranscription('');
        return;
      }

      if (module === 'todo') {
        if (action === 'add') {
          await addDoc(collection(db, 'todos'), {
            userId: user.uid,
            text: payload.text,
            priority: payload.priority || 'medium',
            isCompleted: false,
            date: payload.date || getLocalDateString(new Date()),
            subject: payload.subject || '',
            estimatedMinutes: payload.estimatedMinutes || 25,
            timeSlot: payload.timeSlot || null,
            isRecurring: payload.isRecurring === 'daily' ? true : false,
            createdAt: Date.now(),
            subTasks: []
          });
          toast.success(`Added task: "${payload.text}"`, { id: processToastId });
        } else if (action === 'complete') {
          const q = query(collection(db, 'todos'), where('userId', '==', user.uid), where('isCompleted', '==', false));
          const snap = await getDocs(q);
          const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          
          const keyword = (payload.keyword || '').toLowerCase();
          const match = tasks.find(t => t.text.toLowerCase().includes(keyword));
          if (match) {
            await updateDoc(doc(db, 'todos', match.id), { isCompleted: true });
            toast.success(`Completed task: "${match.text}"`, { id: processToastId });
          } else {
            toast.error(`Could not find an active task matching "${keyword}"`, { id: processToastId });
          }
        }
      } 
      else if (module === 'gym') {
        const todayStr = getLocalDateString(new Date());
        const docId = `${user.uid}_${todayStr}`;
        const logRef = doc(db, 'gymLogs', docId);
        const logSnap = await getDoc(logRef);
        
        const spokenExerciseName = (payload.exercise || '').toLowerCase();
        const weight = Number(payload.weight) || 0;
        const reps = Number(payload.reps) || 0;

        if (logSnap.exists()) {
          const data = logSnap.data();
          const exercises = data.exercises || [];
          
          // Check if it's a cardio command
          if (spokenExerciseName.includes('treadmill') || spokenExerciseName.includes('cardio')) {
            const cardio = data.cardio || [];
            let matchIndex = cardio.findIndex((c: any) => c.type.toLowerCase().includes('treadmill') || c.id === 'permanent_treadmill');
            
            // AI might put distance in 'weight' and speed in 'reps' if it wasn't sure
            const dist = Number(payload.distanceKm) || Number(payload.weight) || null;
            const speed = Number(payload.speedKmh) || Number(payload.reps) || null;
            const dur = Number(payload.durationMinutes) || null;

            if (matchIndex >= 0) {
              cardio[matchIndex] = { ...cardio[matchIndex], distanceKm: dist, speedKmh: speed, durationMinutes: dur, completed: true };
            } else {
              cardio.push({ id: 'permanent_treadmill', type: 'Treadmill', distanceKm: dist, speedKmh: speed, durationMinutes: dur, completed: true, isPermanent: true });
            }
            
            await updateDoc(logRef, { cardio });
            window.dispatchEvent(new Event('gym-log-updated'));
            
            const msgParts = [];
            if (dist) msgParts.push(`${dist}km`);
            if (dur) msgParts.push(`${dur} mins`);
            if (speed) msgParts.push(`@ ${speed}km/h`);
            toast.success(`Logged Treadmill: ${msgParts.join(' ')}`, { id: processToastId });
            return;
          }

          // Check for explicit "add new" command
          const isExplicitNew = spokenExerciseName.includes('add new') || (payload.text && payload.text.toLowerCase().includes('add new'));
          const cleanExerciseName = spokenExerciseName.replace('add new ', '').trim();

          // Fuzzy match for lifting exercises
          const matchIndex = exercises.findIndex((ex: any) => 
            ex.name.toLowerCase().includes(cleanExerciseName) || 
            cleanExerciseName.includes(ex.name.toLowerCase().replace('standard ', '').replace('s', ''))
          );

          if (matchIndex >= 0) {
            // Update existing exercise
            const ex = exercises[matchIndex];
            const setsLog = ex.setsLog || [];
            
            // Find first uncompleted set
            const targetSetIndex = setsLog.findIndex((s: any) => !s.completed);
            
            if (targetSetIndex >= 0) {
              setsLog[targetSetIndex] = { ...setsLog[targetSetIndex], weight, reps, completed: true };
            } else {
              // Add a new set if all are completed
              setsLog.push({ setNumber: setsLog.length + 1, weight, reps, completed: true });
            }
            
            exercises[matchIndex].setsLog = setsLog;
            
            await updateDoc(logRef, { exercises });
            window.dispatchEvent(new Event('gym-log-updated'));
            toast.success(`Logged ${weight}kg × ${reps} reps for ${ex.name}`, { id: processToastId });
          } else if (isExplicitNew) {
            // Add new custom exercise
            const newExercise = {
              exerciseId: Date.now().toString(),
              name: payload.exercise.replace(/add new /i, '') || 'Unknown Exercise',
              targetSets: 1,
              targetReps: '1',
              isCustom: true,
              setsLog: [{ setNumber: 1, weight, reps, completed: true }]
            };
            await updateDoc(logRef, {
              exercises: [...exercises, newExercise]
            });
            window.dispatchEvent(new Event('gym-log-updated'));
            toast.success(`Added new exercise: ${newExercise.name}`, { id: processToastId });
          } else {
            toast.error(`Exercise "${cleanExerciseName}" not found. Say "Add new ${cleanExerciseName}" to add it.`, { id: processToastId });
          }
        } else {
          // Create new log document
          const newExercise = {
            exerciseId: Date.now().toString(),
            name: payload.exercise || 'Unknown Exercise',
            targetSets: 1,
            targetReps: '1',
            isCustom: true,
            setsLog: [{ setNumber: 1, weight, reps, completed: true }]
          };
          await setDoc(logRef, {
            userId: user.uid,
            date: todayStr,
            exercises: [newExercise],
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          window.dispatchEvent(new Event('gym-log-updated'));
          toast.success(`Logged ${payload.exercise} in Gym`, { id: processToastId });
        }
      }
      else if (module === 'attendance') {
        const dateStr = payload.date || getLocalDateString(new Date());
        const q = query(collection(db, 'attendance_subjects'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const subjects = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        const keyword = (payload.subject || '').toLowerCase();
        const match = subjects.find(s => s.name.toLowerCase() === keyword || s.name.toLowerCase().includes(keyword));
        
        let finalAction = action;
        if (action === 'create_subject' && match) {
          console.log("Auto-downgrading create_subject to update_schedule because subject exists:", match.name);
          finalAction = 'update_schedule';
        }

        if (finalAction === 'create_subject' && payload.subject) {
          const schedule: Record<string, { classCount: number, labCount: number }> = {};
          
          for (let i = 0; i <= 6; i++) {
            schedule[i.toString()] = { classCount: 0, labCount: 0 };
          }

          if (payload.scheduleDays && Array.isArray(payload.scheduleDays)) {
            payload.scheduleDays.forEach((sd: any) => {
              if (typeof sd.dayText === 'string') {
                const textLower = sd.dayText.toLowerCase();
                const allDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                const daysSet = new Set<string>();
                
                const rangeMatch = textLower.match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+(?:to|through|-|till|until)\s+(sun|mon|tue|wed|thu|fri|sat)/);
                if (rangeMatch) {
                  const startIdx = allDays.indexOf(rangeMatch[1]);
                  const endIdx = allDays.indexOf(rangeMatch[2]);
                  if (startIdx !== -1 && endIdx !== -1) {
                    let current = startIdx;
                    while (true) {
                      daysSet.add(current.toString());
                      if (current === endIdx) break;
                      current = (current + 1) % 7;
                    }
                  }
                } else {
                  allDays.forEach((day, index) => {
                    if (textLower.includes(day)) daysSet.add(index.toString());
                  });
                }

                Array.from(daysSet).forEach((idx: string) => {
                  if (schedule[idx]) {
                    const addClass = sd.classCount !== undefined ? Number(sd.classCount) : 0;
                    const addLab = sd.labCount !== undefined ? Number(sd.labCount) : 0;
                    
                    if (addClass === 0 && addLab === 0) {
                      schedule[idx].classCount += 1;
                    } else {
                      schedule[idx].classCount += addClass;
                      schedule[idx].labCount += addLab;
                    }
                  }
                });
              }
            });
          }

          await addDoc(collection(db, 'attendance_subjects'), {
            userId: user.uid,
            name: payload.subject,
            classesAttended: 0,
            classesTotal: 0,
            labsAttended: 0,
            labsTotal: 0,
            targetPercentage: 75,
            schedule
          });

          toast.success(`Created attendance subject: ${payload.subject}`, { id: processToastId });
          setTranscription('');
          setIsProcessing(false);
          return;
        }

        if (finalAction === 'update_schedule' && match) {
          const schedule = { ...match.schedule };
          
          if (payload.scheduleDays && Array.isArray(payload.scheduleDays)) {
            payload.scheduleDays.forEach((sd: any) => {
              if (typeof sd.dayText === 'string') {
                const textLower = sd.dayText.toLowerCase();
                const allDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                const daysSet = new Set<string>();
                
                const rangeMatch = textLower.match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+(?:to|through|-|till|until)\s+(sun|mon|tue|wed|thu|fri|sat)/);
                if (rangeMatch) {
                  const startIdx = allDays.indexOf(rangeMatch[1]);
                  const endIdx = allDays.indexOf(rangeMatch[2]);
                  if (startIdx !== -1 && endIdx !== -1) {
                    let current = startIdx;
                    while (true) {
                      daysSet.add(current.toString());
                      if (current === endIdx) break;
                      current = (current + 1) % 7;
                    }
                  }
                } else {
                  allDays.forEach((day, index) => {
                    if (textLower.includes(day)) daysSet.add(index.toString());
                  });
                }

                Array.from(daysSet).forEach((idx: string) => {
                  if (!schedule[idx]) schedule[idx] = { classCount: 0, labCount: 0 };
                  
                  const addClass = sd.classCount !== undefined ? Number(sd.classCount) : 0;
                  const addLab = sd.labCount !== undefined ? Number(sd.labCount) : 0;
                  
                  if (addClass === 0 && addLab === 0) {
                    schedule[idx].classCount += 1;
                  } else {
                    schedule[idx].classCount += addClass;
                    schedule[idx].labCount += addLab;
                  }
                });
              }
            });
          }

          await updateDoc(doc(db, 'attendance_subjects', match.id), { schedule });
          toast.success(`Updated schedule for ${match.name}`, { id: processToastId });
          setTranscription('');
          setIsProcessing(false);
          return;
        }

        if (finalAction === 'update_schedule' && !match) {
          toast.error(`Subject "${payload.subject}" not found to update. Say "Add NEW subject" first.`, { id: processToastId });
          setTranscription('');
          setIsProcessing(false);
          return;
        }
        
        if (match && finalAction === 'log_attendance') {
          const type = payload.type === 'lab' ? 'lab' : 'class';
          const isExtra = payload.isExtra === true;
          const status = payload.status; // 'present', 'absent', 'cancelled'
          
          const batch = writeBatch(db);
          
          if (status !== 'cancelled') {
            const isAttended = status === 'present';
            const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
            const totalKey = type === 'class' ? 'classesTotal' : 'labsTotal';
            
            batch.update(doc(db, 'attendance_subjects', match.id), {
              [attendedKey]: (match[attendedKey] || 0) + (isAttended ? 1 : 0),
              [totalKey]: (match[totalKey] || 0) + 1
            });
          }

          const actionLabel = status === 'present' ? 'attended' : (status === 'absent' ? 'missed' : 'cancelled');
          const logRef = doc(collection(db, 'attendance_logs'));
          batch.set(logRef, {
            userId: user.uid,
            subjectId: match.id,
            subjectName: match.name,
            type,
            action: actionLabel,
            date: dateStr,
            isExtra,
            timestamp: Date.now()
          });

          await batch.commit();
          toast.success(`Marked ${status} for ${match.name} ${type}`, { id: processToastId });
        } else {
          toast.error(`Subject "${payload.subject}" not found in Attendance`, { id: processToastId });
        }
      }
      else if (module === 'tools') {
        if (payload.type === 'job') {
          await addDoc(collection(db, 'job_applications'), {
            userId: user.uid,
            company: payload.company || 'Unknown',
            role: payload.role || 'Unknown',
            status: payload.status || 'Applied',
            dateApplied: getLocalDateString(new Date())
          });
          toast.success(`Added job application for ${payload.company}`, { id: processToastId });
        } else {
          await addDoc(collection(db, 'learning_topics'), {
            userId: user.uid,
            title: payload.topic || 'Unknown Topic',
            subTasks: [],
            status: 'Todo',
            createdAt: Date.now(),
            lastStudiedAt: Date.now()
          });
          toast.success(`Added learning topic: ${payload.topic}`, { id: processToastId });
        }
      }
      else if (module === 'sleep') {
        const todayStr = getLocalDateString(new Date());
        const qLog = query(collection(db, 'daily_logs'), where('userId', '==', user.uid), where('date', '==', todayStr));
        const logSnap = await getDocs(qLog);
        
        if (!logSnap.empty) {
          const docId = logSnap.docs[0].id;
          await updateDoc(doc(db, 'daily_logs', docId), {
            wakeUpTime: payload.wakeUpTime || '',
            sleepTime: payload.sleepTime || '',
            updatedAt: Date.now()
          });
        } else {
          await addDoc(collection(db, 'daily_logs'), {
            userId: user.uid,
            date: todayStr,
            wakeUpTime: payload.wakeUpTime || '',
            sleepTime: payload.sleepTime || '',
            updatedAt: Date.now()
          });
        }
        toast.success(`Logged sleep. Woke at ${payload.wakeUpTime || '--:--'}`, { id: processToastId });
      }
      else if (module === 'extraworks') {
        const todayStr = getLocalDateString(new Date());
        const qLog = query(collection(db, 'daily_logs'), where('userId', '==', user.uid), where('date', '==', todayStr));
        const logSnap = await getDocs(qLog);
        
        if (!logSnap.empty) {
          const docId = logSnap.docs[0].id;
          const currentLog = logSnap.docs[0].data();
          const currentExtra = currentLog.extraWorks || '';
          const newExtra = currentExtra.trim() ? `${currentExtra}\n- ${payload.text}` : `- ${payload.text}`;
          
          await updateDoc(doc(db, 'daily_logs', docId), {
            extraWorks: newExtra,
            updatedAt: Date.now()
          });
        } else {
          await addDoc(collection(db, 'daily_logs'), {
            userId: user.uid,
            date: todayStr,
            extraWorks: `- ${payload.text}`,
            updatedAt: Date.now()
          });
        }
        toast.success(`Added to Extra Works: "${payload.text}"`, { id: processToastId });
      }
      
      setTranscription('');
    } catch (err: any) {
      console.error('Voice parsing error:', err);
      const msg = (err.message || '').toLowerCase();
      let friendlyError = err.message || 'Unknown error occurred.';
      if (msg.includes('401') || msg.includes('authentication')) {
        friendlyError = 'Invalid Gemini API key. Please update it in your .env file.';
      } else if (msg.includes('429') || msg.includes('quota')) {
        friendlyError = 'Gemini API rate limit reached. Please try again later.';
      }
      toast.error('Voice failed: ' + friendlyError, { id: processToastId });
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
