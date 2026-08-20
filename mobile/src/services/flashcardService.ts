/**
 * flashcardService.ts — ZenTrack Mobile
 * SM-2 Spaced Repetition Flashcard Engine for Active Recall.
 */

import { collection, doc, addDoc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { COLLECTION } from '../config/constants';
import { callProxy, parseProxyResponse } from './geminiProxy';

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
  const prompt = `You are an expert cognitive tutor using Active Recall and Spaced Repetition.
Create 3 to 5 high-yield, conceptual flashcards based on this lecture:
Topic: "${topicTitle}"
Lecture: "${lectureTitle}"
Content / Notes:
${contentOrNotes}

Guidelines:
1. Make questions precise, testing fundamental concepts, formulas, or "why/how" mechanisms (not trivial trivia).
2. Keep answers concise, clear, and easy to grade in 5 seconds.
3. Provide a brief 1-sentence hint for each question.

Output strictly valid JSON with this format:
[
  {
    "question": "What is the core difference between a Mutex and a Semaphore?",
    "answer": "A Mutex provides mutual exclusion for 1 thread with ownership; a Semaphore is a signaling counter for N concurrent threads.",
    "hint": "Think about ownership and counting limits."
  }
]`;

  try {
    const response = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });

    const { text } = parseProxyResponse(response);
    if (!text) return [];

    let jsonStr = text.trim();
    const firstB = jsonStr.indexOf('[');
    const lastB = jsonStr.lastIndexOf(']');
    if (firstB !== -1 && lastB !== -1) {
      jsonStr = jsonStr.substring(firstB, lastB + 1);
    }

    const items = JSON.parse(jsonStr);
    if (Array.isArray(items)) {
      return items.map(item => ({
        question: String(item.question || '').trim(),
        answer: String(item.answer || '').trim(),
        hint: item.hint ? String(item.hint).trim() : undefined,
      }));
    }
  } catch (err) {
    console.error('[FlashcardService] Generation failed:', err);
  }

  return [];
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

    await addDoc(collection(db, COLLECTION.FLASHCARDS), {
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
    });
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
 * Records a review grade and updates the card's interval in Firestore.
 */
export async function submitFlashcardReview(
  cardId: string,
  currentCard: Flashcard,
  grade: ReviewGrade
): Promise<void> {
  if (!cardId) return;
  const next = calculateNextReview(currentCard, grade);

  const cardRef = doc(db, COLLECTION.FLASHCARDS, cardId);
  await updateDoc(cardRef, {
    repetitions: next.repetitions,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
    nextReviewDate: next.nextReviewDate,
    lastReviewedAt: Date.now(),
  });
}
