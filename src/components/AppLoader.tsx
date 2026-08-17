import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AppLoaderProps {
  title?: string;
  subtitle?: string;
}

const QUOTES = [
  { text: "You have power over your mind, not outside events. Realize this, and you find strength.", author: "Marcus Aurelius" },
  { text: "Until you make the unconscious conscious, it will direct your life and you will call it fate.", author: "Carl Jung" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "There is nothing outside of yourself that can enable you to get better, stronger, or smarter.", author: "Miyamoto Musashi" },
  { text: "The obstacle in the path becomes the path. Never forget, within every obstacle is an opportunity to improve.", author: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "The first principle is that you must not fool yourself and you are the easiest person to fool.", author: "Richard Feynman" },
  { text: "Desire is a contract you make with yourself to be unhappy until you get what you want.", author: "Naval Ravikant" },
  { text: "Small disciplines repeated with consistency every day lead to great achievements gained slowly over time.", author: "John C. Maxwell" }
];

export const AppLoader: React.FC<AppLoaderProps> = ({
  title = "ZenTrack",
  subtitle = "AUTHENTICATING SESSION"
}) => {
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    setQuoteIdx(Math.floor(Math.random() * QUOTES.length));
    const interval = setInterval(() => {
      setQuoteIdx(prev => (prev + 1) % QUOTES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: '#000000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: 'hidden',
    }}>
      {/* ── Ambient Obsidian Cosmos Background Glows ── */}
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(165, 153, 255, 0.12) 0%, rgba(22, 12, 40, 0.4) 40%, transparent 70%)',
        filter: 'blur(40px)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, transparent 70%)',
        filter: 'blur(50px)',
        top: '35%',
        left: '60%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      {/* ── Main Loading Card Container ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          maxWidth: '520px',
          padding: '0 1.5rem',
          textAlign: 'center',
        }}
      >
        {/* ── Glowing Pulsing Zen Robot Mascot & Dual Spinner Ring ── */}
        <div style={{ position: 'relative', width: '108px', height: '108px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Outer Breathing Glow Ring */}
          <motion.div
            animate={{
              scale: [1, 1.16, 1],
              opacity: [0.45, 0.85, 0.45],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              inset: '-8px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(165, 153, 255, 0.4) 0%, transparent 70%)',
              filter: 'blur(10px)',
            }}
          />

          {/* Rotating Gradient Spinner Arc */}
          <svg width="108" height="108" viewBox="0 0 108 108" style={{ position: 'absolute', animation: 'spin 2.2s linear infinite' }}>
            <defs>
              <linearGradient id="loaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a599ff" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
            <circle
              cx="54"
              cy="54"
              r="48"
              fill="none"
              stroke="rgba(255, 255, 255, 0.06)"
              strokeWidth="3.5"
            />
            <circle
              cx="54"
              cy="54"
              r="48"
              fill="none"
              stroke="url(#loaderGrad)"
              strokeWidth="3.5"
              strokeDasharray="210 100"
              strokeLinecap="round"
            />
          </svg>

          {/* Central Glass Orb containing the Robot Mascot */}
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
              boxShadow: [
                '0 0 25px rgba(165, 153, 255, 0.4)',
                '0 0 50px rgba(165, 153, 255, 0.75)',
                '0 0 25px rgba(165, 153, 255, 0.4)',
              ],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              width: '74px',
              height: '74px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(165, 153, 255, 0.25) 0%, rgba(18, 18, 22, 0.95) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1.5px solid rgba(165, 153, 255, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              padding: '6px',
            }}
          >
            {/* Zen Robot Mascot from Mobile App */}
            <motion.img
              src="/sara-idle.png"
              alt="ZenTrack Robot Mascot"
              animate={{
                y: [0, -3, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                width: '48px',
                height: '48px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 2px 8px rgba(165, 153, 255, 0.4))',
              }}
            />
          </motion.div>
        </div>

        {/* ── Brand Title & Status Pill ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.65rem' }}>
          <h2 style={{
            fontFamily: "var(--font-display, 'Playfair Display', Georgia, serif)",
            fontSize: '2rem',
            fontWeight: 600,
            color: '#ffffff',
            margin: 0,
            letterSpacing: '-0.02em',
            textShadow: '0 2px 20px rgba(165, 153, 255, 0.25)',
          }}>
            {title === "Loading Zentrack..." ? "ZenTrack" : title}
          </h2>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            background: 'rgba(165, 153, 255, 0.08)',
            border: '1px solid rgba(165, 153, 255, 0.25)',
            borderRadius: '9999px',
            padding: '0.25rem 0.85rem',
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#5eda9e',
              boxShadow: '0 0 8px #5eda9e',
              animation: 'pulse 1.8s infinite',
            }} />
            <span style={{
              color: '#a599ff',
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              {subtitle}
            </span>
          </div>
        </div>

        {/* ── Stoic & Cognitive Quotes Stream ── */}
        <div style={{
          minHeight: '85px',
          width: '100%',
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: '1.25rem',
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={quoteIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: 'easeInOut' }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.4rem',
                position: 'absolute',
                width: '100%',
              }}
            >
              <p style={{
                color: 'rgba(255, 255, 255, 0.75)',
                fontSize: '0.92rem',
                fontStyle: 'italic',
                textAlign: 'center',
                lineHeight: 1.55,
                margin: 0,
                fontWeight: 400,
              }}>
                "{QUOTES[quoteIdx].text}"
              </p>
              <span style={{
                color: '#a599ff',
                fontSize: '0.76rem',
                fontWeight: 500,
                letterSpacing: '0.04em',
                opacity: 0.85,
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
