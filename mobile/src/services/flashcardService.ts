/**
 * flashcardService.ts — ZenTrack Mobile
 * SM-2 Spaced Repetition Flashcard Engine for Active Recall.
 */

import { collection, doc, addDoc, updateDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { COLLECTION } from '../config/constants';
import { safeWrite } from '../utils/safeWrite';

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

/**
 * Formats a Date object as YYYY-MM-DD in local time.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds N days to a Date and returns YYYY-MM-DD.
 */
export function addDaysToDate(days: number, fromDate: Date = new Date()): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

/**
 * SuperMemo SM-2 Interval Calculation.
 */
export function calculateNextReview(
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
      easeFactor = Math.max(1.3, easeFactor);
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

/**
 * Generates 3-5 Active Recall Flashcards using Gemini 2.5 Flash.
 */
export async function generateFlashcardsFromContext(
  lectureTitle: string,
  topicTitle: string,
  contentOrNotes: string
): Promise<{ question: string; answer: string; hint?: string }[]> {
  const lines = (contentOrNotes || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const cards: { question: string; answer: string; hint?: string }[] = [];

  for (let i = 0; i < lines.length && cards.length < 5; i++) {
    const line = lines[i];
    if (line.includes(':')) {
      const parts = line.split(':');
      const q = parts[0].replace(/^[-*#\s]+/, '').trim();
      const a = parts.slice(1).join(':').trim();
      if (q.length > 2 && a.length > 2) {
        cards.push({ question: q, answer: a });
      }
    }
  }

  if (cards.length === 0) {
    cards.push({
      question: `Key takeaway from ${lectureTitle || topicTitle || 'Lecture'}`,
      answer: lines[0] || 'Core principles covered in lecture.',
    });
  }

  return cards;
}

/**
 * Batch saves flashcards to Firestore.
 */
export async function saveFlashcardsToFirestore(
  userId: string,
  lectureTitle: string,
  topicTitle: string,
  cards: { question: string; answer: string; hint?: string }[]
): Promise<number> {
  if (!userId || cards.length === 0) return 0;
  const today = getLocalDateString();
  let count = 0;

  // FIX 6.4: Fetch existing user flashcards to deduplicate by question text
  const existingQuestions = new Set<string>();
  try {
    const q = query(collection(db, COLLECTION.FLASHCARDS), where('userId', '==', userId));
    const snap = await getDocs(q);
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.question) {
        existingQuestions.add(data.question.trim().toLowerCase());
      }
    });
  } catch (e) {
    console.warn('[FlashcardService] Failed to query existing cards for deduplication:', e);
  }

  for (const card of cards) {
    if (!card.question || !card.answer) continue;
    const normQuestion = card.question.trim().toLowerCase();
    if (existingQuestions.has(normQuestion)) {
      continue; // Skip duplicate card
    }

    // Deterministic doc ID from question hash
    let hash = 0;
    for (let i = 0; i < normQuestion.length; i++) {
      hash = ((hash << 5) - hash + normQuestion.charCodeAt(i)) | 0;
    }
    const cardId = `fc_${userId}_${Math.abs(hash)}`;
    const cardRef = doc(db, COLLECTION.FLASHCARDS, cardId);

    const payload = {
      id: cardId,
      userId,
      question: card.question.trim(),
      answer: card.answer.trim(),
      hint: card.hint || '',
      topicTitle,
      lectureTitle,
      repetitions: 0,
      intervalDays: 1,
      easeFactor: 2.5,
      nextReviewDate: today,
      createdAt: Date.now(),
    };

    await safeWrite(
      () => setDoc(cardRef, payload, { merge: true }),
      COLLECTION.FLASHCARDS,
      'set',
      payload,
      cardId
    );
    existingQuestions.add(normQuestion);
    count++;
  }

  return count;
}

/**
 * Fetches flashcards due for review today or earlier.
 */
export async function getDueFlashcards(userId: string): Promise<Flashcard[]> {
  if (!userId) return [];
  const today = getLocalDateString();

  try {
    const q = query(
      collection(db, COLLECTION.FLASHCARDS),
      where('userId', '==', userId)
    );
    const snap = await getDocs(q);
    const results: Flashcard[] = [];
    snap.forEach(d => {
      const data = d.data() as Flashcard;
      // Filter for cards due on or before today
      if (!data.nextReviewDate || data.nextReviewDate <= today) {
        results.push({ id: d.id, ...data });
      }
    });
    return results;
  } catch (e) {
    console.warn('[FlashcardService] Fetch due cards error:', e);
    return [];
  }
}

/**
 * Records a review grade and updates the card's interval in Firestore via safeWrite.
 */
export async function submitFlashcardReview(
  cardId: string,
  currentCard: Flashcard,
  grade: ReviewGrade
): Promise<void> {
  if (!cardId) return;
  const next = calculateNextReview(currentCard, grade);

  const cardRef = doc(db, COLLECTION.FLASHCARDS, cardId);
  const updates = {
    repetitions: next.repetitions,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
    nextReviewDate: next.nextReviewDate,
    lastReviewedAt: Date.now(),
  };

  await safeWrite(
    () => updateDoc(cardRef, updates),
    COLLECTION.FLASHCARDS,
    'update',
    updates,
    cardId
  );
}
