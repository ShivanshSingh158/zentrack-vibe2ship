import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import {
  ProactiveAgentAnimation,
  WorkspaceIntegrationAnimation,
  SmartTasksAnimation,
  FlowStateAnimation,
  LearningAnimation,
  ConsoleAnalyticsAnimation,
} from './LandingAnimations';
import '../styles/landing.css';

const BG_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

/* ── FEATURE DATA ─────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    id: 'agents',
    label: '01 — PROACTIVE AI',
    title: 'Fully Autonomous',
    titleEm: 'AI Orchestration',
    desc: 'Your AI companion never sleeps. The moment an email lands or a deadline shifts, ZenTrack\'s agents auto-trigger — routing tasks, blocking calendar time, and drafting docs. Zero manual setup. Zero missed moments.',
    bullets: ['Auto-triggered by Gmail, Calendar & Docs', 'Multi-step autonomous action chains', 'Proactive — acts before you even ask'],
    animation: ProactiveAgentAnimation,
    reverse: false,
  },
  {
    id: 'workspace',
    label: '02 — GOOGLE WORKSPACE',
    title: 'Deep Native',
    titleEm: 'Google Integration',
    desc: 'Not just connected — deeply embedded. ZenTrack speaks Gmail, Calendar, Drive, Docs, Tasks, and YouTube natively. Your entire digital life synced, analysed, and acted upon in real-time from one intelligent hub.',
    bullets: ['Gmail, Calendar, Drive, Docs, Tasks & YouTube', 'Real-time bidirectional sync', 'Email → task auto-conversion with AI priority'],
    animation: WorkspaceIntegrationAnimation,
    reverse: true,
  },
  {
    id: 'tasks',
    label: '03 — SMART TASKS',
    title: 'AI-Prioritised',
    titleEm: 'Task Management',
    desc: 'Every task knows exactly where it belongs. ZenTrack reads your inbox, extracts action items, assigns P1/P2/P3 scores, and intelligently time-blocks your calendar — so nothing ever slips through the cracks again.',
    bullets: ['AI priority scoring (P1 / P2 / P3)', 'Auto-created tasks from emails & meetings', 'Smart day-planning & conflict-free scheduling'],
    animation: SmartTasksAnimation,
    reverse: false,
  },
  {
    id: 'flow',
    label: '04 — FLOW STATE ENGINE',
    title: 'Your Personal',
    titleEm: 'Flow State OS',
    desc: 'Build the conditions for your deepest work. Intelligent focus sessions protect your time, habit streaks build momentum, and a "Life Saver" mode auto-reschedules your entire day when deadlines loom — so you never panic again.',
    bullets: ['Intelligent focus sessions & Pomodoro timer', 'Habit streaks, rituals & daily check-ins', '"Life Saver" emergency mode for crunch days'],
    animation: FlowStateAnimation,
    reverse: true,
  },
  {
    id: 'learning',
    label: '05 — LEARNING HUB',
    title: 'Growth on',
    titleEm: 'Autopilot',
    desc: 'Curated daily learning modules, YouTube playlist integration, and spaced-repetition AI coaching that adapts to your rhythm. Build a learning ritual and watch your knowledge compound — one session at a time.',
    bullets: ['Daily modules with spaced repetition', 'YouTube deep integration & playlist learning', 'AI-paced progress tracking & coach'],
    animation: LearningAnimation,
    reverse: false,
  },
  {
    id: 'console',
    label: '06 — AGENT CONSOLE',
    title: 'Command Your',
    titleEm: 'Agent Runtime',
    desc: 'Speak in plain language and watch your agents reason in real-time. Get live analytics on every dimension of your productivity, inspect AI decisions, and fine-tune your workflow from a sleek terminal interface.',
    bullets: ['Natural language agent commands', 'Real-time execution logs & AI reasoning', 'Full personal analytics dashboard'],
    animation: ConsoleAnalyticsAnimation,
    reverse: true,
  },
];

const STATS = [
  { value: '50+', label: 'Tasks Automated Daily'  },
  { value: '15h', label: 'Saved Per Week'          },
  { value: '97%', label: 'Focus Score Average'     },
  { value: '<2s', label: 'Agent Response Time'     },
];

const NAV_LINKS = ['Home', 'Agents', 'Workspace', 'Tasks', 'Flow', 'Learning', 'Console'];

/* ── HELPERS ─────────────────────────────────────────────────────────────── */

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 44 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── MAIN COMPONENT ───────────────────────────────────────────────────────── */

export const Landing = ({ onTryNow }: { onTryNow: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end start'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 80, damping: 30 });
  const videoScale   = useTransform(smooth, [0, 1],    [1, 1.14]);
  const videoOpacity = useTransform(smooth, [0, 0.45], [1, 0]);
  const heroY        = useTransform(smooth, [0, 0.22], [0, -70]);

  const scrollTo = (id: string) => {
    if (id === 'Home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const el = document.getElementById(id.toLowerCase());
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing-page" ref={containerRef}>

      {/* ── Animated CSS starfield background (always visible) ─── */}
      <div className="landing-bg-canvas">
        <div className="landing-bg-orb landing-bg-orb-1" />
        <div className="landing-bg-orb landing-bg-orb-2" />
        <div className="landing-bg-orb landing-bg-orb-3" />
      </div>

      {/* ── Video background (loads on top when available) ─────── */}
      <motion.video
        ref={videoRef}
        autoPlay loop muted playsInline
        src={BG_VIDEO}
        className="landing-video"
        style={{ scale: videoScale, opacity: videoOpacity }}
        onCanPlay={() => { if (videoRef.current) videoRef.current.classList.add('loaded'); }}
        onError={() => { if (videoRef.current) videoRef.current.style.display = 'none'; }}
      />

      {/* ── Dark gradient overlay ─────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.04) 35%, rgba(0,0,0,0.6) 100%)' }} />

      {/* ══════════════════════════════════════════════════
          NAV
      ══════════════════════════════════════════════════ */}
      <nav className="landing-nav" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="landing-logo" onClick={() => scrollTo('Home')} style={{ cursor: 'pointer' }}>
          <img src="/logo_white.png" alt="ZenTrack" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          ZenTrack
        </motion.div>

        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
          className="landing-nav-links">
          {NAV_LINKS.map((link) => (
            <button key={link} onClick={() => scrollTo(link)} className="nav-link">
              {link}
            </button>
          ))}
        </motion.div>

        <motion.button initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
          onClick={onTryNow} className="btn-glass liquid-glass">
          Log In
        </motion.button>
      </nav>

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <motion.div className="landing-hero" style={{ y: heroY, minHeight: '90vh', paddingTop: '5rem', paddingBottom: '7rem' }}>
        <motion.span
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
          style={{ display: 'inline-block', marginBottom: '2rem', fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '4px 16px' }}>
          AI-Powered Productivity OS
        </motion.span>

        <motion.h1 className="hero-title"
          initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}>
          Where <em>agentic workflows</em>{' '}
          meet your <em>connected workspace.</em>
        </motion.h1>

        <motion.p className="hero-subtitle"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.55 }}>
          Take charge of your life with a fully autonomous companion — one that proactively handles your inbox, builds your routines, and saves you from last-minute chaos. Every single day.
        </motion.p>

        <motion.div style={{ display: 'flex', gap: '1rem', marginTop: '3rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.75 }}>
          <motion.button onClick={onTryNow} className="hero-cta-btn liquid-glass"
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} style={{ marginTop: 0 }}>
            Try ZenTrack Now
          </motion.button>
          <motion.button onClick={() => scrollTo('Agents')}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
            See how it works
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
        </motion.div>
      </motion.div>

      {/* ══════════════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════════════ */}
      <FadeUp>
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '72rem', margin: '0 auto 6rem', padding: '0 2rem' }}>
          <div className="liquid-glass" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.1)' }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ padding: '1.75rem 1rem', textAlign: 'center', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem', fontWeight: 400, color: 'white', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.38)', marginTop: '0.5rem', letterSpacing: '0.04em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* ══════════════════════════════════════════════════
          FEATURE SECTIONS  (6 sections)
      ══════════════════════════════════════════════════ */}
      {FEATURES.map((feat, idx) => {
        const AnimComp = feat.animation;
        const isReverse = feat.reverse;
        return (
          <section key={feat.id} id={feat.id} className="scroll-section" style={{ padding: '5rem 2rem', minHeight: '100vh' }}>
            <div className="feature-container" style={{ flexDirection: isReverse ? 'row-reverse' : 'row', gap: '4rem' }}>

              {/* Text */}
              <div className="feature-text" style={{ maxWidth: '30rem' }}>
                <FadeUp delay={0}>
                  <span style={{ display: 'inline-block', fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '1.2rem' }}>
                    {feat.label}
                  </span>
                </FadeUp>
                <FadeUp delay={0.07}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 3.5vw, 3.25rem)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.02em', color: 'white', marginBottom: '1.15rem' }}>
                    {feat.title}{' '}
                    <em style={{ fontStyle: 'normal', color: 'var(--muted-foreground)' }}>{feat.titleEm}</em>
                  </h2>
                </FadeUp>
                <FadeUp delay={0.14}>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '1.02rem', lineHeight: 1.72, marginBottom: '1.6rem' }}>{feat.desc}</p>
                </FadeUp>
                <FadeUp delay={0.2}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {feat.bullets.map((b, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.88rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.35)', flexShrink: 0, marginTop: 7 }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </FadeUp>
                {idx === FEATURES.length - 1 && (
                  <FadeUp delay={0.28}>
                    <motion.button onClick={onTryNow} className="hero-cta-btn liquid-glass"
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                      style={{ marginTop: 0, padding: '0.9rem 2.5rem', fontSize: '0.95rem' }}>
                      Get Started — It's Free
                    </motion.button>
                  </FadeUp>
                )}
              </div>

              {/* Animation */}
              <motion.div
                initial={{ opacity: 0, x: isReverse ? -50 : 50, scale: 0.97 }}
                whileInView={{ opacity: 1, x: 0, scale: 1 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
                style={{ flex: 1, width: '100%', maxWidth: '50rem' }}
              >
                <AnimComp />
              </motion.div>
            </div>
          </section>
        );
      })}

      {/* ══════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════ */}
      <section style={{ position: 'relative', zIndex: 10, padding: '8rem 2rem 10rem', textAlign: 'center' }}>
        <FadeUp>
          <div style={{ maxWidth: '52rem', margin: '0 auto' }}>
            <span style={{ display: 'inline-block', fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: '1.5rem' }}>
              Begin your journey
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 5.5vw, 4.75rem)', fontWeight: 400, lineHeight: 1.05, color: 'white', marginBottom: '1.5rem', letterSpacing: '-0.025em' }}>
              Ready to enter your{' '}
              <em style={{ fontStyle: 'normal', color: 'var(--muted-foreground)' }}>flow state?</em>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '38rem', margin: '0 auto 3rem' }}>
              Join thousands building calmer, more intentional, fully automated lives — powered by an AI that actually works for you.
            </p>
            <motion.button onClick={onTryNow} className="hero-cta-btn liquid-glass"
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              style={{ marginTop: 0, padding: '1.1rem 3.5rem', fontSize: '1rem' }}>
              Try ZenTrack — it's free
            </motion.button>
          </div>
        </FadeUp>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer style={{ position: 'relative', zIndex: 10, borderTop: '1px solid rgba(255,255,255,0.07)', padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '80rem', margin: '0 auto', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="landing-logo" style={{ fontSize: '1.2rem', cursor: 'default' }}>
          <img src="/logo_white.png" alt="ZenTrack" style={{ width: 22, height: 22, objectFit: 'contain', opacity: 0.6 }} />
          <span style={{ opacity: 0.45 }}>ZenTrack</span>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.22)', margin: 0 }}>
          © 2026 ZenTrack. Built with intention.
        </p>
      </footer>
    </div>
  );
};
