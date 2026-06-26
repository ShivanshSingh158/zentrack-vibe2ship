import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateMorningBriefing, generateEveningWindDown } from '../../services/gemini';
import { auth } from '../../services/firebase';
import { Sun, Moon, CheckCircle2 } from 'lucide-react';
import { useGlobalData } from '../../contexts/GlobalDataContext';

export const DailyBriefingOverlay = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [type, setType] = useState<'morning' | 'evening' | null>(null);
  const [data, setData] = useState<{ greeting: string; message: string; quote: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { isLoading, tasks, assignments, goals, gymLogs, habits, habitLogs } = useGlobalData();

  useEffect(() => {
    if (isLoading) return;

    const checkTimeAndShow = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const now = new Date();
      const hour = now.getHours();

      const morningKey = `briefing_morning_until`;
      const eveningKey = `briefing_evening_until`;

      const morningUntil = parseInt(localStorage.getItem(morningKey) || '0', 10);
      const eveningUntil = parseInt(localStorage.getItem(eveningKey) || '0', 10);

      let currentType: 'morning' | 'evening' | null = null;

      // Note: for testing, you can change these hour ranges or remove the check temporarily
      if (hour >= 6 && hour < 9 && Date.now() > morningUntil) {
        currentType = 'morning';
      } else if (hour >= 20 && hour < 23 && Date.now() > eveningUntil) {
        currentType = 'evening';
      }

      if (!currentType) return;

      const suppressUntil = Date.now() + 8 * 60 * 60 * 1000;
      if (currentType === 'morning') localStorage.setItem(morningKey, suppressUntil.toString());
      else localStorage.setItem(eveningKey, suppressUntil.toString());

      setType(currentType);
      setIsVisible(true);
      setLoading(true);

      try {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const isGymDay = gymLogs.length > 0; // Simplified for now
        const gymLogged = gymLogs.some((l: { date: string }) => new Date(l.date).toDateString() === now.toDateString());

        if (currentType === 'morning') {
          const briefing = await generateMorningBriefing({ 
            tasks: tasks.filter((t) => t.status !== 'completed'),
            assignments: assignments.filter((a) => a.status !== 'submitted'),
            goals: goals,
            habits: habits,
            isGymDay
          });
          setData(briefing);
        } else {
          const completedTasks = tasks.filter((t:any) => t.status === 'completed' && new Date(t.updatedAt || Date.now()).toDateString() === now.toDateString());
          const completedHabitsCount = habitLogs.filter((l:any) => l.date === todayStr).length;

          const winddown = await generateEveningWindDown({ 
            completedTasks,
            completedHabitsCount,
            totalHabitsCount: habits.length,
            gymLogged
          });
          setData(winddown);
        }
      } catch (error) {
        console.error('Error generating briefing:', error);
        setData({
          greeting: currentType === 'morning' ? 'Good morning!' : 'Good evening.',
          message: currentType === 'morning' ? "Let's make today a great day." : "Time to disconnect and recharge.",
          quote: currentType === 'morning' ? "Win the morning, win the day." : "Rest is necessary."
        });
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(checkTimeAndShow, 1000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

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
