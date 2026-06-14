import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateMorningBriefing, generateEveningWindDown } from '../../services/gemini';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { Sun, Moon, CheckCircle2 } from 'lucide-react';

export const DailyBriefingOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [type, setType] = useState<'morning' | 'evening' | null>(null);
  const [data, setData] = useState<{ greeting: string; message: string; quote: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkTimeAndShow = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const now = new Date();
      const hour = now.getHours();

      const morningKey = `briefing_morning_until`;
      const eveningKey = `briefing_evening_until`;

      // Check if we're in a time window AND haven't already shown it in this period
      // "Until" key stores a timestamp — if current time is before that timestamp, suppress
      const morningUntil = parseInt(localStorage.getItem(morningKey) || '0', 10);
      const eveningUntil = parseInt(localStorage.getItem(eveningKey) || '0', 10);

      let currentType: 'morning' | 'evening' | null = null;

      if (hour >= 6 && hour < 9 && Date.now() > morningUntil) {
        currentType = 'morning';
      } else if (hour >= 20 && hour < 23 && Date.now() > eveningUntil) {
        currentType = 'evening';
      }

      if (!currentType) return;

      // ── Mark as seen IMMEDIATELY so refresh never shows it again ──────────
      // Suppress for 8 hours from now — covers the full morning/evening window
      const suppressUntil = Date.now() + 8 * 60 * 60 * 1000;
      if (currentType === 'morning') localStorage.setItem(morningKey, suppressUntil.toString());
      else localStorage.setItem(eveningKey, suppressUntil.toString());

      setType(currentType);
      setIsVisible(true);
      setLoading(true);

      try {
        if (currentType === 'morning') {
          // Fetch some basic data to pass to AI
          const qTasks = query(collection(db, 'todos'), where('userId', '==', user.uid), where('isCompleted', '==', false));
          const snapTasks = await getDocs(qTasks);
          const tasks = snapTasks.docs.map(d => d.data());

          const briefing = await generateMorningBriefing({ tasks });
          setData(briefing);
        } else {
          // Fetch completed tasks for today
          const qTasks = query(collection(db, 'todos'), where('userId', '==', user.uid), where('isCompleted', '==', true));
          const snapTasks = await getDocs(qTasks);
          const completedTasks = snapTasks.docs.map(d => d.data()).filter((t: any) => t.updatedAt && new Date(t.updatedAt).toDateString() === now.toDateString());
          
          const winddown = await generateEveningWindDown({ completedTasks });
          setData(winddown);
        }
      } catch (error) {
        console.error('Error generating briefing:', error);
        // Fallback data if AI fails
        setData({
          greeting: currentType === 'morning' ? 'Good morning!' : 'Good evening.',
          message: currentType === 'morning' ? "Let's make today a great day." : "Time to disconnect and recharge.",
          quote: currentType === 'morning' ? "Win the morning, win the day." : "Rest is necessary."
        });
      } finally {
        setLoading(false);
      }
    };

    // Check after a slight delay to ensure auth is loaded
    const timeout = setTimeout(checkTimeAndShow, 2000);
    return () => clearTimeout(timeout);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: type === 'morning' 
              ? 'linear-gradient(135deg, rgba(251,191,36,0.95), rgba(124,58,237,0.95))'
              : 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(88,28,135,0.95))',
            backdropFilter: 'blur(20px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            padding: '2rem'
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200, delay: 0.2 }}
            style={{
              maxWidth: '600px',
              width: '100%',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2rem'
            }}
          >
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                >
                  {type === 'morning' ? <Sun size={48} color="rgba(255,255,255,0.8)" /> : <Moon size={48} color="rgba(255,255,255,0.8)" />}
                </motion.div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, letterSpacing: '0.05em' }}>
                  {type === 'morning' ? 'Preparing your day...' : 'Summarizing your day...'}
                </h2>
              </div>
            ) : data && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  {type === 'morning' ? <Sun size={64} color="#fcd34d" style={{ marginBottom: '1rem' }} /> : <Moon size={64} color="#c084fc" style={{ marginBottom: '1rem' }} />}
                  <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontFamily: 'var(--font-display)', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
                    {data.greeting}
                  </h1>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  style={{ background: 'rgba(0,0,0,0.2)', padding: '2rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <p style={{ fontSize: '1.25rem', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
                    {data.message}
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <p style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }}>
                    "{data.quote}"
                  </p>
                </motion.div>

                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1 }}
                  onClick={handleClose}
                  style={{
                    marginTop: '1rem',
                    padding: '1rem 3rem',
                    borderRadius: '9999px',
                    border: 'none',
                    background: '#fff',
                    color: type === 'morning' ? '#d97706' : '#581c87',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <CheckCircle2 size={20} />
                  {type === 'morning' ? "Let's Crush It" : "Close Out Day"}
                </motion.button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
