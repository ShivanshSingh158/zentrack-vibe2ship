/**
 * WellnessRecallWidget.tsx — Web twin of mobile Wellness & Recall section
 * Water log row + Active Recall flashcard card + motivational quote
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Droplets } from 'lucide-react';

interface WellnessRecallWidgetProps {
  waterCompletedMl: number;
  waterGoalMl: number;
  onAddWater: (ml: number) => void;
  dueFlashcardsCount: number;
  onReviewFlashcards: () => void;
  quote?: { text: string; author: string };
}

const DEFAULT_QUOTE = {
  text: 'Discipline is choosing between what you want now and what you want most.',
  author: 'Abraham Lincoln',
};

export function WellnessRecallWidget({
  waterCompletedMl,
  waterGoalMl,
  onAddWater,
  dueFlashcardsCount,
  onReviewFlashcards,
  quote = DEFAULT_QUOTE,
}: WellnessRecallWidgetProps) {
  const waterLiters = waterCompletedMl >= 100
    ? (waterCompletedMl / 1000).toFixed(1)
    : String(waterCompletedMl || 0);

  const waterGoalLiters = (waterGoalMl || 3000) >= 100
    ? ((waterGoalMl || 3000) / 1000).toFixed(1)
    : String(waterGoalMl || 3000);

  const waterPct = waterGoalMl > 0 ? Math.min((waterCompletedMl / waterGoalMl) * 100, 100) : 0;

  return (
    <div className="wellness-card">
      {/* Section label */}
      <div className="wellness-section-label">
        <span>Wellness &amp; Recall</span>
        <button className="wellness-learn-link">Learn →</button>
      </div>

      {/* Water row */}
      <div className="wellness-water-row">
        <div className="wellness-water-icon">
          <Droplets size={16} color="#89dceb" />
        </div>
        <div className="wellness-water-content">
          <div className="wellness-water-text-row">
            <span className="wellness-water-value" style={{ color: '#89dceb' }}>
              {waterLiters} / {waterGoalLiters}L
              <span className="wellness-water-pct"> ({Math.round(waterPct)}%)</span>
            </span>
          </div>
          {/* Water bar */}
          <div className="wellness-water-track">
            <motion.div
              className="wellness-water-fill"
              initial={{ width: 0 }}
              animate={{ width: `${waterPct}%` }}
              transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
            />
          </div>
        </div>
        {/* Quick buttons */}
        <div className="wellness-water-btns">
          <motion.button
            className="wellness-water-btn"
            onClick={() => onAddWater(250)}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.04 }}
            aria-label="Add 250ml"
          >
            +250ml
          </motion.button>
          <motion.button
            className="wellness-water-btn"
            onClick={() => onAddWater(500)}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.04 }}
            aria-label="Add 500ml"
          >
            +500ml
          </motion.button>
        </div>
      </div>

      {/* Active Recall row */}
      {dueFlashcardsCount > 0 && (
        <div className="wellness-recall-row">
          {/* Left flash icon */}
          <div className="wellness-recall-icon">
            <Zap size={16} color="#a599ff" />
          </div>
          <div className="wellness-recall-content">
            <span className="wellness-recall-title">3-Min Active Recall</span>
            <span className="wellness-recall-sub">
              {dueFlashcardsCount} flashcard{dueFlashcardsCount > 1 ? 's' : ''} scheduled
            </span>
          </div>
          <motion.button
            className="wellness-review-btn"
            onClick={onReviewFlashcards}
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.04 }}
          >
            Review
          </motion.button>
        </div>
      )}

      {/* Motivational quote */}
      <div className="wellness-quote">
        <p className="wellness-quote-text">"{quote.text}"</p>
      </div>
    </div>
  );
}
