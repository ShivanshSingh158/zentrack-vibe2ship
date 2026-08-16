import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface AppLoaderProps {
  title?: string;
  subtitle?: string;
}

const QUOTES = [
  { text: "You have power over your mind, not outside events. Realize this, and you find strength.", author: "Marcus Aurelius" },
  { text: "Until you make the unconscious conscious, it will direct your life and you will call it fate.", author: "Carl Jung" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "There is nothing outside of yourself that can enable you to get better, stronger, or smarter.", author: "Miyamoto Musashi" },
  { text: "Nobody cares about your excuses. Nobody is coming to save you.", author: "David Goggins" },
  { text: "The obstacle is the way.", author: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "The first principle is that you must not fool yourself and you are the easiest person to fool.", author: "Richard Feynman" },
  { text: "Desire is a contract you make with yourself to be unhappy until you get what you want.", author: "Naval Ravikant" },
];

export const AppLoader: React.FC<AppLoaderProps> = ({ 
  title = "Loading Zentrack...", 
  subtitle = "AUTHENTICATING" 
}) => {
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    // Pick a random quote on mount
    setQuoteIdx(Math.floor(Math.random() * QUOTES.length));
    
    // Cycle quote every 4 seconds
    const interval = setInterval(() => {
      setQuoteIdx(prev => (prev + 1) % QUOTES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: '#030712',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Background Gradient */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at center, rgba(165, 153, 255, 0.08) 0%, #030712 70%)',
        zIndex: 1
      }} />

      {/* Content Container */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.25, 0.8, 0.25, 1] }}
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2.5rem',
          maxWidth: '500px',
          padding: '0 2rem'
        }}
      >
        {/* Spinner & Titles */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Loader2 
            size={36} 
            color="#a599ff" 
            style={{ animation: 'spin 1.5s linear infinite', marginBottom: '0.5rem' }} 
          />
          <h2 style={{ 
            color: '#fff', 
            fontSize: '1.25rem', 
            fontWeight: 600, 
            margin: 0, 
            letterSpacing: '0.05em', 
            textAlign: 'center' 
          }}>
            {title}
          </h2>
          <p style={{ 
            color: '#a599ff', 
            fontSize: '0.75rem', 
            fontWeight: 700, 
            letterSpacing: '0.15em', 
            textTransform: 'uppercase', 
            textAlign: 'center', 
            margin: 0,
            opacity: 0.8
          }}>
            {subtitle}
          </p>
        </div>

        {/* Quotes Section */}
        <div style={{ minHeight: '80px', width: '100%', position: 'relative', display: 'flex', justifyContent: 'center' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={quoteIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', position: 'absolute' }}
            >
              <p style={{ 
                color: 'rgba(255,255,255,0.7)', 
                fontSize: '0.95rem', 
                fontStyle: 'italic', 
                textAlign: 'center',
                lineHeight: 1.5,
                margin: 0 
              }}>
                "{QUOTES[quoteIdx].text}"
              </p>
              <span style={{ 
                color: 'rgba(255,255,255,0.4)', 
                fontSize: '0.8rem', 
                fontWeight: 500,
                letterSpacing: '0.05em' 
              }}>
                — {QUOTES[quoteIdx].author}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
