import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, X, RotateCw, Lightbulb, Trophy, CheckCircle2,
  ThumbsUp, Rocket, Flame, ArrowRight, Sparkles, Plus, BookOpen
} from 'lucide-react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { playPopSound } from '../../utils/sound';
import { awardXP } from '../../services/xpSystem';
import { toast } from 'sonner';

export interface Flashcard {
  id?: string;
  userId: string;
  question: string;
  answer: string;
  hint?: string;
  topicTitle?: string;
  lectureTitle?: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextReviewDate: string; // "YYYY-MM-DD"
  lastReviewedAt?: number;
  createdAt: number;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysToDate(days: number, fromDate: Date = new Date()): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

function calculateNextReview(
  card: { repetitions: number; intervalDays: number; easeFactor: number },
  grade: ReviewGrade
): { repetitions: number; intervalDays: number; easeFactor: number; nextReviewDate: string } {
  let { repetitions = 0, intervalDays = 1, easeFactor = 2.5 } = card;

  switch (grade) {
    case 'again':
      repetitions = 0;
      intervalDays = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      break;
    case 'hard':
      repetitions = repetitions + 1;
      intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
      break;
    case 'good':
      repetitions = repetitions + 1;
      if (repetitions === 1) {
        intervalDays = 1;
      } else if (repetitions === 2) {
        intervalDays = 3;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor);
      }
      break;
    case 'easy':
      repetitions = repetitions + 1;
      if (repetitions === 1) {
        intervalDays = 3;
      } else if (repetitions === 2) {
        intervalDays = 6;
      } else {
        intervalDays = Math.round(intervalDays * easeFactor * 1.3) + 1;
      }
      easeFactor = easeFactor + 0.15;
      break;
  }

  const nextReviewDate = addDaysToDate(intervalDays);
  return {
    repetitions,
    intervalDays,
    easeFactor,
    nextReviewDate,
  };
}

const DEFAULT_STARTER_CARDS: Omit<Flashcard, 'id' | 'userId' | 'createdAt'>[] = [
  {
    question: 'What is the core difference between a Mutex and a Semaphore?',
    answer: 'A Mutex provides mutual exclusion for 1 thread with strict ownership; a Semaphore is a signaling mechanism with an integer counter allowing N concurrent resources.',
    hint: 'Think about ownership vs resource count signaling.',
    topicTitle: 'Operating Systems & Concurrency',
    lectureTitle: 'Synchronization Primitives',
    repetitions: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewDate: getLocalDateString(),
  },
  {
    question: 'What is the Feynman Technique for learning complex concepts?',
    answer: '1. Choose concept\n2. Teach it to a 12-year-old using simple analogies\n3. Identify knowledge gaps\n4. Review and simplify further.',
    hint: 'Simplification and teaching as proof of true understanding.',
    topicTitle: 'Meta-Learning & Cognitive Science',
    lectureTitle: 'Active Recall Frameworks',
    repetitions: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewDate: getLocalDateString(),
  },
  {
    question: 'In database systems, what do the ACID properties stand for?',
    answer: 'Atomicity (all or nothing), Consistency (preserves invariants), Isolation (concurrent execution matches serial), and Durability (committed changes persist).',
    hint: 'Four fundamental guarantees of transactional storage.',
    topicTitle: 'Database Internals',
    lectureTitle: 'Transaction Safety',
    repetitions: 0,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewDate: getLocalDateString(),
  }
];

interface FlashcardReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FlashcardReviewModal({ isOpen, onClose }: FlashcardReviewModalProps) {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // New card form state
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newHint, setNewHint] = useState('');
  const [newTopic, setNewTopic] = useState('');

  const todayStr = useMemo(() => getLocalDateString(), []);

  // Fetch cards on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setSessionFinished(false);
    setSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });

    const fetchCards = async () => {
      const user = auth.currentUser;
      if (!user) {
        if (isMounted) {
          setDeck(DEFAULT_STARTER_CARDS.map((c, i) => ({ ...c, id: `starter-${i}`, userId: 'guest', createdAt: Date.now() })));
          setLoading(false);
        }
        return;
      }

      try {
        const q = query(
          collection(db, 'flashcards'),
          where('userId', '==', user.uid)
        );
        const snap = await getDocs(q);
        const fetched: Flashcard[] = [];
        snap.forEach((d) => {
          const data = d.data() as Flashcard;
          fetched.push({ id: d.id, ...data });
        });

        // Filter cards due today or earlier (or all if none due)
        const due = fetched.filter(c => !c.nextReviewDate || c.nextReviewDate <= todayStr);
        const activeList = due.length > 0 ? due : (fetched.length > 0 ? fetched : DEFAULT_STARTER_CARDS.map((c, i) => ({ ...c, id: `starter-${i}`, userId: user.uid, createdAt: Date.now() })));

        if (isMounted) {
          setDeck(activeList);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching flashcards:', err);
        if (isMounted) {
          setDeck(DEFAULT_STARTER_CARDS.map((c, i) => ({ ...c, id: `starter-${i}`, userId: 'local', createdAt: Date.now() })));
          setLoading(false);
        }
      }
    };

    fetchCards();

    return () => {
      isMounted = false;
    };
  }, [isOpen, todayStr]);

  const handleFlip = () => {
    playPopSound();
    setIsFlipped(!isFlipped);
  };

  const handleGrade = async (grade: ReviewGrade) => {
    const currentCard = deck[currentIndex];
    if (!currentCard) return;

    playPopSound();
    setSessionStats(prev => ({ ...prev, [grade]: prev[grade] + 1 }));

    // Update in Firestore if persistent card
    const user = auth.currentUser;
    if (user && currentCard.id && !currentCard.id.startsWith('starter-')) {
      try {
        const next = calculateNextReview(currentCard, grade);
        const cardRef = doc(db, 'flashcards', currentCard.id);
        await updateDoc(cardRef, {
          repetitions: next.repetitions,
          intervalDays: next.intervalDays,
          easeFactor: next.easeFactor,
          nextReviewDate: next.nextReviewDate,
          lastReviewedAt: Date.now(),
        });
      } catch (e) {
        console.warn('Failed to update flashcard interval:', e);
      }
    }

    if (currentIndex + 1 < deck.length) {
      setIsFlipped(false);
      setShowHint(false);
      setCurrentIndex(prev => prev + 1);
    } else {
      // Completed session!
      awardXP('LEARNING_PROGRESS').then((res) => {
        toast.success(`Active Recall session complete! +${res.added} XP ⚡`);
      });
      setSessionFinished(true);
    }
  };

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    const user = auth.currentUser;
    const newCardData: Omit<Flashcard, 'id'> = {
      userId: user?.uid || 'guest',
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
      hint: newHint.trim() || undefined,
      topicTitle: newTopic.trim() || 'Active Recall Workspace',
      repetitions: 0,
      intervalDays: 1,
      easeFactor: 2.5,
      nextReviewDate: todayStr,
      createdAt: Date.now(),
    };

    try {
      if (user?.uid) {
        const docRef = await addDoc(collection(db, 'flashcards'), newCardData);
        setDeck(prev => [...prev, { ...newCardData, id: docRef.id }]);
      } else {
        setDeck(prev => [...prev, { ...newCardData, id: `local-${Date.now()}` }]);
      }
      playPopSound();
      toast.success('Flashcard added to deck ⚡');
      setNewQuestion('');
      setNewAnswer('');
      setNewHint('');
      setNewTopic('');
      setIsCreatingNew(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create flashcard');
    }
  };

  if (!isOpen) return null;

  const currentCard = deck[currentIndex];
  const progressPercent = deck.length > 0 ? Math.round(((currentIndex + (isFlipped ? 1 : 0.5)) / deck.length) * 100) : 0;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{
            background: 'var(--color-surface, #141416)',
            border: '1px solid var(--color-border, #242428)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--color-border, #242428)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(165, 153, 255, 0.12)',
                  border: '1px solid rgba(165, 153, 255, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--zen-purple, #a599ff)',
                }}
              >
                <Zap size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #ffffff)' }}>
                  Daily Active Recall
                </h2>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #8e8e93)' }}>
                  SuperMemo SM-2 Spaced Repetition Engine
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setIsCreatingNew(!isCreatingNew)}
                style={{
                  background: isCreatingNew ? 'rgba(165, 153, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--color-border, #242428)',
                  color: isCreatingNew ? 'var(--zen-purple, #a599ff)' : 'var(--text-secondary, #b3b3b3)',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={13} />
                <span>{isCreatingNew ? 'Back to Deck' : 'Add Card'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary, #ffffff)',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
            {isCreatingNew ? (
              /* Create New Flashcard Form */
              <form onSubmit={handleCreateCard} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #b3b3b3)', display: 'block', marginBottom: '4px' }}>
                    Topic or Subject Name
                  </label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="e.g. Electrical Drives, Operating Systems, DSA..."
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--color-border, #242428)',
                      borderRadius: '10px',
                      padding: '0.65rem 0.85rem',
                      color: 'var(--text-primary, #ffffff)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #b3b3b3)', display: 'block', marginBottom: '4px' }}>
                    Question / Prompt *
                  </label>
                  <textarea
                    rows={3}
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    placeholder="e.g. How does back-EMF affect synchronous motor speed control?"
                    required
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--color-border, #242428)',
                      borderRadius: '10px',
                      padding: '0.65rem 0.85rem',
                      color: 'var(--text-primary, #ffffff)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      resize: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #b3b3b3)', display: 'block', marginBottom: '4px' }}>
                    Answer *
                  </label>
                  <textarea
                    rows={3}
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    placeholder="e.g. Back-EMF opposes the applied voltage, limiting armature current as motor accelerates..."
                    required
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--color-border, #242428)',
                      borderRadius: '10px',
                      padding: '0.65rem 0.85rem',
                      color: 'var(--text-primary, #ffffff)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      resize: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #b3b3b3)', display: 'block', marginBottom: '4px' }}>
                    Memory Hint (Optional)
                  </label>
                  <input
                    type="text"
                    value={newHint}
                    onChange={(e) => setNewHint(e.target.value)}
                    placeholder="e.g. Opposing voltage induced by rotor flux."
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--color-border, #242428)',
                      borderRadius: '10px',
                      padding: '0.65rem 0.85rem',
                      color: 'var(--text-primary, #ffffff)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: 'none',
                      color: 'var(--text-primary, #ffffff)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 2,
                      padding: '0.75rem',
                      borderRadius: '12px',
                      background: 'var(--zen-purple, #a599ff)',
                      border: 'none',
                      color: '#000000',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Save to Deck
                  </button>
                </div>
              </form>
            ) : sessionFinished ? (
              /* Session Finished Celebration View */
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'rgba(94, 218, 158, 0.15)',
                    border: '1px solid rgba(94, 218, 158, 0.3)',
                    color: '#5eda9e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.25rem auto'
                  }}
                >
                  <Trophy size={36} />
                </div>

                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'var(--text-primary, #ffffff)' }}>
                  Deck Mastered! ⚡
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted, #8e8e93)', maxWidth: 400, margin: '0 auto 1.5rem auto' }}>
                  You reviewed {deck.length} flashcard{deck.length > 1 ? 's' : ''} and locked in your spaced retention intervals for today.
                </p>

                {/* Score Breakdown */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--color-border, #242428)',
                    borderRadius: '16px',
                    padding: '1rem',
                    marginBottom: '1.5rem'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#5eda9e' }}>
                      {sessionStats.easy + sessionStats.good}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8e8e93)' }}>Recalled</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b' }}>
                      {sessionStats.hard}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8e8e93)' }}>Hard</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ff6961' }}>
                      {sessionStats.again}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8e8e93)' }}>Again</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'var(--zen-purple, #a599ff)',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '14px',
                    padding: '0.8rem 1.75rem',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <span>Continue to Dashboard</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : loading ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted, #8e8e93)' }}>
                <RotateCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto' }} />
                <div>Loading Spaced Repetition Deck...</div>
              </div>
            ) : currentCard ? (
              /* Review Interactive Flippable Deck View */
              <div>
                {/* Progress Bar Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-muted, #8e8e93)' }}>
                    Card <strong style={{ color: 'var(--text-primary, #ffffff)' }}>{currentIndex + 1}</strong> of {deck.length}
                  </span>
                  <span style={{ color: 'var(--zen-purple, #a599ff)', fontWeight: 700 }}>
                    {progressPercent}% Complete
                  </span>
                </div>

                {/* Progress Bar Track */}
                <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '999px', overflow: 'hidden', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #a599ff, #6c5ce7)',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>

                {/* Topic Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(165, 153, 255, 0.12)',
                      border: '1px solid rgba(165, 153, 255, 0.25)',
                      padding: '3px 10px',
                      borderRadius: '8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--zen-purple, #a599ff)'
                    }}
                  >
                    <BookOpen size={12} />
                    <span>{currentCard.topicTitle || 'Active Recall Workspace'}</span>
                  </div>
                  {currentCard.lectureTitle && (
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted, #8e8e93)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentCard.lectureTitle}
                    </span>
                  )}
                </div>

                {/* 3D Flippable Card Box */}
                <div
                  onClick={handleFlip}
                  style={{
                    background: isFlipped
                      ? 'linear-gradient(145deg, rgba(94, 218, 158, 0.08), rgba(0, 0, 0, 0.4))'
                      : 'linear-gradient(145deg, rgba(165, 153, 255, 0.08), rgba(0, 0, 0, 0.4))',
                    border: `1px solid ${isFlipped ? 'rgba(94, 218, 158, 0.3)' : 'rgba(165, 153, 255, 0.25)'}`,
                    borderRadius: '20px',
                    padding: '1.75rem',
                    minHeight: '260px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
                    marginBottom: '1.25rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: isFlipped ? 'rgba(94, 218, 158, 0.2)' : 'rgba(165, 153, 255, 0.2)',
                        color: isFlipped ? '#5eda9e' : '#a599ff'
                      }}
                    >
                      {isFlipped ? 'ANSWER' : 'QUESTION'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8e8e93)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <RotateCw size={12} />
                      <span>Click to flip</span>
                    </span>
                  </div>

                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0' }}>
                    <p
                      style={{
                        fontSize: isFlipped ? '1.05rem' : '1.15rem',
                        fontWeight: isFlipped ? 500 : 700,
                        lineHeight: 1.6,
                        color: 'var(--text-primary, #ffffff)',
                        textAlign: 'center',
                        margin: 0,
                        whiteSpace: 'pre-line'
                      }}
                    >
                      {isFlipped ? currentCard.answer : currentCard.question}
                    </p>
                  </div>

                  {/* Hint Box (if available and front face) */}
                  {!isFlipped && currentCard.hint && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowHint(!showHint);
                      }}
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '10px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        fontSize: '0.76rem',
                        color: '#f59e0b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Lightbulb size={13} />
                      <span>{showHint ? `Hint: ${currentCard.hint}` : 'Click for memory hint'}</span>
                    </div>
                  )}
                </div>

                {/* Rating Grades or Reveal Button */}
                {isFlipped ? (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted, #8e8e93)', textAlign: 'center', marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      How well did you recall this?
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => handleGrade('again')}
                        style={{
                          background: 'rgba(255, 105, 97, 0.12)',
                          border: '1px solid rgba(255, 105, 97, 0.3)',
                          color: '#ff6961',
                          borderRadius: '12px',
                          padding: '0.65rem 0.4rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Again</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>1 Day</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleGrade('hard')}
                        style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          color: '#f59e0b',
                          borderRadius: '12px',
                          padding: '0.65rem 0.4rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Hard</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>2 Days</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleGrade('good')}
                        style={{
                          background: 'rgba(165, 153, 255, 0.15)',
                          border: '1px solid rgba(165, 153, 255, 0.35)',
                          color: '#a599ff',
                          borderRadius: '12px',
                          padding: '0.65rem 0.4rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Good</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>4 Days</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleGrade('easy')}
                        style={{
                          background: 'rgba(94, 218, 158, 0.15)',
                          border: '1px solid rgba(94, 218, 158, 0.35)',
                          color: '#5eda9e',
                          borderRadius: '12px',
                          padding: '0.65rem 0.4rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Easy</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>7+ Days</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleFlip}
                    style={{
                      width: '100%',
                      background: 'var(--zen-purple, #a599ff)',
                      color: '#000000',
                      border: 'none',
                      borderRadius: '14px',
                      padding: '0.85rem',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>Reveal Answer</span>
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted, #8e8e93)' }}>
                <CheckCircle2 size={36} color="#5eda9e" style={{ margin: '0 auto 0.75rem auto' }} />
                <h4 style={{ color: 'var(--text-primary, #ffffff)', margin: '0 0 0.35rem 0' }}>All Caught Up!</h4>
                <p style={{ fontSize: '0.8rem', maxWidth: 320, margin: '0 auto 1.25rem auto' }}>
                  No flashcards due for review right now.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(true)}
                  style={{
                    background: 'var(--zen-purple, #a599ff)',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.6rem 1.2rem',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  + Add New Flashcard
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
