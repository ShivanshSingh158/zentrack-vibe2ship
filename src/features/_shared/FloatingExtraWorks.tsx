import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString } from '../../utils/dateUtils';
import { Check, GripHorizontal, EyeOff, ClipboardList } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export const FloatingExtraWorks: React.FC = () => {
  const [tasks, setTasks] = useState<{ id: number; title: string; rawLine: string }[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [fullText, setFullText] = useState<string>('');
  const [isVisible, setIsVisible] = useState(() => localStorage.getItem('zen_floating_extra_works') !== 'hidden');
  const isDragging = React.useRef(false);
  const prevTasksLength = React.useRef(0);

  useEffect(() => {
    if (tasks.length > prevTasksLength.current) {
      setIsVisible(true);
      localStorage.setItem('zen_floating_extra_works', 'visible');
    }
    prevTasksLength.current = tasks.length;
  }, [tasks.length]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const todayStr = getLocalDateString(new Date());
    const q = query(
      collection(db, 'daily_logs'),
      where('userId', '==', auth.currentUser.uid),
      where('date', '==', todayStr)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docData = snap.docs[0];
        setDocId(docData.id);
        const data = docData.data();
        const extraText = (data.extraWorks as string) || '';
        setFullText(extraText);
        
        // Parse lines
        const lines = extraText.split('\n');
        const activeTasks: { id: number; title: string; rawLine: string }[] = [];
        
        lines.forEach((line: string, index: number) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          // Ignore lines that start with [x] or - [x]
          if (trimmed.toLowerCase().startsWith('[x]') || trimmed.toLowerCase().startsWith('- [x]')) return;
          // If it's a list item, remove the prefix
          let cleanText = trimmed;
          if (trimmed.startsWith('- ')) cleanText = trimmed.substring(2);
          
          activeTasks.push({ id: index, title: cleanText, rawLine: line });
        });
        
        setTasks(activeTasks);
      } else {
        setTasks([]);
        setFullText('');
        setDocId(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleMarkDone = async (rawLineToReplace: string) => {
    if (!docId || !fullText) return;
    
    // Replace that exact line with a checked version
    const lines = fullText.split('\n');
    const newLines = lines.map(line => {
      if (line === rawLineToReplace) {
        // If it starts with "- ", insert [x] after the dash
        if (line.trim().startsWith('- ')) {
          return line.replace('- ', '- [x] ');
        }
        // Otherwise just prepend [x]
        return `[x] ${line}`;
      }
      return line;
    });
    
    const newText = newLines.join('\n');
    await updateDoc(doc(db, 'daily_logs', docId), {
      extraWorks: newText,
      updatedAt: Date.now()
    });
  };

  if (tasks.length === 0) return null;

  return (
    <>
      <motion.button
        drag
        dragMomentum={false}
        onDragStart={() => isDragging.current = true}
        onDragEnd={() => setTimeout(() => isDragging.current = false, 150)}
        whileTap={{ cursor: 'grabbing' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => {
          if (isDragging.current) return;
          setIsVisible(true);
          localStorage.setItem('zen_floating_extra_works', 'visible');
        }}
        style={{
          display: isVisible ? 'none' : 'flex',
          position: 'fixed', bottom: '24px', left: '24px', zIndex: 999999,
          background: 'rgba(20, 20, 25, 0.8)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '9999px',
          padding: '0.5rem 1rem', alignItems: 'center', gap: '0.5rem',
          color: '#10b981', fontSize: '0.8rem', fontWeight: 600, cursor: 'grab',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
        }}
      >
        <ClipboardList size={14} /> Show Brain Dump ({tasks.length})
      </motion.button>

      <motion.div
        drag
        dragMomentum={false}
        style={{
          display: isVisible ? 'flex' : 'none',
          position: 'fixed',
          top: '100px', // Start at top instead of bottom so it doesn't get blocked
          right: '40px', // Start on the right
          zIndex: 999999, // Ensure it's above sidebars and tabs
          flexDirection: 'column',
          gap: '0.75rem',
          width: '320px',
          background: 'rgba(15, 15, 20, 0.6)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          padding: '1rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.05)',
          cursor: 'grab' // Indicates draggable
        }}
        whileTap={{ cursor: 'grabbing' }}
      >
      {/* Drag Handle & Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
          <GripHorizontal size={16} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brain Dump</span>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            localStorage.setItem('zen_floating_extra_works', 'hidden');
          }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          title="Hide floating notes"
        >
          <EyeOff size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '50vh', overflowY: 'auto', paddingRight: '4px' }}>
        <AnimatePresence>
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, height: 0, marginTop: 0, padding: 0, border: 'none' }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '0.75rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
            >
              <button
                onClick={() => handleMarkDone(task.rawLine)}
                style={{
                  width: '20px', height: '20px', borderRadius: '5px', marginTop: '2px',
                  background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.3)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <Check size={12} color="#10b981" />
              </button>
              <span style={{ color: '#e4e4e7', fontSize: '0.85rem', fontWeight: 400, lineHeight: 1.4, wordBreak: 'break-word', paddingTop: '2px' }}>
                {task.text}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
    </>
  );
};
