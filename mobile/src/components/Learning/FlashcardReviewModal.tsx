/**
 * FlashcardReviewModal.tsx — ZenTrack Mobile
 * Interactive 3D Active Recall & Spaced Repetition Review Deck.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, ActivityIndicator, Dimensions, Platform, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { Flashcard, ReviewGrade, submitFlashcardReview } from '../../services/flashcardService';
import { awardXP } from '../../services/xpSystem';

interface FlashcardReviewModalProps {
  visible: boolean;
  onClose: () => void;
  dueCards: Flashcard[];
  onSessionComplete?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Parses markdown inline backticks (`code`) and renders stylish code chips
 */
function FormattedCardText({ text, isQuestion = false, styles }: { text: string; isQuestion?: boolean; styles: any }) {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`)/g);

  return (
    <Text style={isQuestion ? styles.questionText : styles.answerText}>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          const code = part.slice(1, -1);
          return (
            <Text
              key={index}
              style={[
                styles.inlineCodeChip,
                !isQuestion && styles.inlineCodeChipGreen,
              ]}
            >
              {` ${code} `}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

export default function FlashcardReviewModal({
  visible,
  onClose,
  dueCards,
  onSessionComplete,
}: FlashcardReviewModalProps) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  // Animation values
  const flipAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && dueCards.length > 0) {
      setDeck(dueCards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowHint(false);
      setSessionFinished(false);
      setSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });
      flipAnim.setValue(0);
      progressAnim.setValue(1 / dueCards.length);
    }
  }, [visible, dueCards]);

  useEffect(() => {
    if (deck.length > 0) {
      Animated.timing(progressAnim, {
        toValue: (currentIndex + 1) / deck.length,
        duration: 250,
        useNativeDriver: false,
      }).start();
    }
  }, [currentIndex, deck.length]);

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Tactile bounce on tap
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    if (!isFlipped) {
      Animated.spring(flipAnim, {
        toValue: 180,
        friction: 8,
        tension: 12,
        useNativeDriver: true,
      }).start();
      setIsFlipped(true);
    } else {
      Animated.spring(flipAnim, {
        toValue: 0,
        friction: 8,
        tension: 12,
        useNativeDriver: true,
      }).start();
      setIsFlipped(false);
    }
  };

  const handleToggleHint = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!showHint) {
      setShowHint(true);
      Animated.timing(hintOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      setShowHint(false);
      hintOpacity.setValue(0);
    }
  };

  const handleGrade = async (grade: ReviewGrade) => {
    if (submitting || !deck[currentIndex]) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setSessionStats(prev => ({ ...prev, [grade]: prev[grade] + 1 }));

    const currentCard = deck[currentIndex];
    if (currentCard.id) {
      await submitFlashcardReview(currentCard.id, currentCard, grade);
    }

    if (currentIndex + 1 < deck.length) {
      // Flip back to front smoothly and advance
      flipAnim.setValue(0);
      setIsFlipped(false);
      setShowHint(false);
      hintOpacity.setValue(0);
      setCurrentIndex(prev => prev + 1);
      setSubmitting(false);
    } else {
      // Session finished!
      await awardXP('FLASHCARD_REVIEW');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSessionFinished(true);
      setSubmitting(false);
      if (onSessionComplete) onSessionComplete();
    }
  };

  if (!visible) return null;

  const currentCard = deck[currentIndex];

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const progressPercent = deck.length > 0 ? Math.round(((currentIndex + (isFlipped ? 1 : 0.5)) / deck.length) * 100) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header Bar */}
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={s.headerIconBox}>
                <Ionicons name="flash" size={16} color={colors.accentPrimary} />
              </View>
              <View>
                <Text style={s.headerTitle}>Daily Active Recall</Text>
                <Text style={s.headerSubtitle}>Spaced Repetition Deck</Text>
              </View>
            </View>

            <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {sessionFinished ? (
            /* Celebration Screen */
            <View style={s.finishedBox}>
              <View style={s.starCircle}>
                <Ionicons name="trophy" size={40} color={isDark ? '#00c16e' : '#059669'} />
              </View>
              
              <Text style={s.finishTitle}>Deck Mastered! ⚡</Text>
              <Text style={s.finishSub}>
                You reviewed {deck.length} flashcard{deck.length > 1 ? 's' : ''} and locked in your cognitive retention for today.
              </Text>

              {/* Stats Breakdown Card */}
              <View style={s.statsCard}>
                <View style={s.statItem}>
                  <Text style={[s.statNum, { color: isDark ? '#00c16e' : '#059669' }]}>{sessionStats.easy + sessionStats.good}</Text>
                  <Text style={s.statLabel}>Recalled</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={[s.statNum, { color: '#f5a623' }]}>{sessionStats.hard}</Text>
                  <Text style={s.statLabel}>Hard</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={[s.statNum, { color: '#ff453a' }]}>{sessionStats.again}</Text>
                  <Text style={s.statLabel}>Again</Text>
                </View>
              </View>

              <View style={s.xpBadge}>
                <Ionicons name="sparkles" size={14} color={isDark ? '#00c16e' : '#059669'} />
                <Text style={s.xpBadgeText}>+15 XP Added to Vanguard Level</Text>
              </View>

              <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={s.doneBtnText}>Continue to Dashboard</Text>
                <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
              </TouchableOpacity>
            </View>
          ) : currentCard ? (
            /* Review Card Deck */
            <View style={{ flex: 1 }}>
              {/* Animated Progress Bar */}
              <View style={s.progressSection}>
                <View style={s.progressRow}>
                  <Text style={s.progressText}>
                    Card <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{currentIndex + 1}</Text> of {deck.length}
                  </Text>
                  <Text style={s.progressPct}>{progressPercent}% Done</Text>
                </View>
                <View style={s.progressBarTrack}>
                  <Animated.View
                    style={[
                      s.progressBarFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Subject / Lecture Capsule */}
              <View style={s.sourceRow}>
                <View style={s.topicPill}>
                  <Ionicons name="book-outline" size={12} color={colors.accentPrimary} style={{ marginRight: 4 }} />
                  <Text style={s.topicPillText} numberOfLines={1}>
                    {currentCard.topicTitle || 'Learning Workspace'}
                  </Text>
                </View>
                {currentCard.lectureTitle && (
                  <Text style={s.lectureText} numberOfLines={1}>
                    {currentCard.lectureTitle}
                  </Text>
                )}
              </View>

              {/* 3D Flippable Flashcard Canvas */}
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleFlip}
                style={s.cardWrapper}
              >
                <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }, { perspective: 1000 }] }}>
                  {!isFlipped ? (
                    /* ── FRONT FACE: QUESTION ── */
                    <Animated.View style={[s.cardFace, s.cardFaceFront, { transform: [{ rotateY: frontInterpolate }] }]}>
                      <View style={s.cardTop}>
                        <View style={s.badgeQuestion}>
                          <Ionicons name="help-circle" size={13} color={colors.accentPrimary} style={{ marginRight: 4 }} />
                          <Text style={s.badgeQuestionText}>QUESTION</Text>
                        </View>
                        <View style={s.flipPromptBadge}>
                          <Ionicons name="sync-outline" size={12} color={colors.textSecondary} />
                          <Text style={s.flipPromptText}>Tap to Flip</Text>
                        </View>
                      </View>

                      <ScrollView style={s.cardScroll} showsVerticalScrollIndicator={false}>
                        <FormattedCardText text={currentCard.question} isQuestion={true} styles={s} />
                      </ScrollView>

                      {/* Hint Trigger Accordion */}
                      {currentCard.hint && (
                        <View style={s.hintContainer}>
                          {showHint ? (
                            <Animated.View style={[s.hintBox, { opacity: hintOpacity }]}>
                              <View style={s.hintHeader}>
                                <Ionicons name="bulb" size={14} color="#f5a623" />
                                <Text style={s.hintLabel}>Memory Cue:</Text>
                              </View>
                              <Text style={s.hintText}>{currentCard.hint}</Text>
                            </Animated.View>
                          ) : (
                            <TouchableOpacity
                              style={s.showHintBtn}
                              activeOpacity={0.7}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleToggleHint();
                              }}
                            >
                              <Ionicons name="bulb-outline" size={14} color="#f5a623" />
                              <Text style={s.showHintText}>Need a memory hint?</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      <View style={s.cardBottomCue}>
                        <Ionicons name="hand-left-outline" size={13} color={colors.textSecondary} />
                        <Text style={s.cardBottomCueText}>Tap card to reveal answer</Text>
                      </View>
                    </Animated.View>
                  ) : (
                    /* ── BACK FACE: ANSWER ── */
                    <Animated.View style={[s.cardFace, s.cardFaceBack, { transform: [{ rotateY: backInterpolate }] }]}>
                      <View style={s.cardTop}>
                        <View style={s.badgeAnswer}>
                          <Ionicons name="checkmark-circle" size={13} color={isDark ? '#00c16e' : '#059669'} style={{ marginRight: 4 }} />
                          <Text style={s.badgeAnswerText}>KEY ANSWER</Text>
                        </View>
                        <View style={s.flipPromptBadge}>
                          <Ionicons name="shield-checkmark-outline" size={12} color={isDark ? '#00c16e' : '#059669'} />
                          <Text style={[s.flipPromptText, { color: isDark ? '#00c16e' : '#059669' }]}>Recall Test</Text>
                        </View>
                      </View>

                      <ScrollView style={s.cardScroll} showsVerticalScrollIndicator={false}>
                        <FormattedCardText text={currentCard.answer} isQuestion={false} styles={s} />
                      </ScrollView>

                      <View style={s.cardBottomCue}>
                        <Text style={[s.cardBottomCueText, { color: colors.textSecondary }]}>Rate your recall below to schedule next review</Text>
                      </View>
                    </Animated.View>
                  )}
                </Animated.View>
              </TouchableOpacity>

              {/* Interactive Grading Row (Shown when card is flipped) */}
              {isFlipped ? (
                <View style={s.gradeContainer}>
                  <Text style={s.gradeHeaderLabel}>HOW WELL DID YOU RECALL THIS?</Text>
                  <View style={s.gradeRow}>
                    <TouchableOpacity
                      style={[s.gradeBtn, s.gradeAgain]}
                      activeOpacity={0.8}
                      onPress={() => handleGrade('again')}
                      disabled={submitting}
                    >
                      <View style={s.gradeIconCircle}>
                        <Ionicons name="reload" size={14} color="#ff453a" />
                      </View>
                      <Text style={[s.gradeTitle, { color: '#ff453a' }]}>Again</Text>
                      <Text style={s.gradeSub}>1 Day</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.gradeBtn, s.gradeHard]}
                      activeOpacity={0.8}
                      onPress={() => handleGrade('hard')}
                      disabled={submitting}
                    >
                      <View style={s.gradeIconCircle}>
                        <Ionicons name="fitness" size={14} color="#f5a623" />
                      </View>
                      <Text style={[s.gradeTitle, { color: '#f5a623' }]}>Hard</Text>
                      <Text style={s.gradeSub}>2 Days</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.gradeBtn, s.gradeGood]}
                      activeOpacity={0.8}
                      onPress={() => handleGrade('good')}
                      disabled={submitting}
                    >
                      <View style={s.gradeIconCircle}>
                        <Ionicons name="thumbs-up" size={14} color={colors.accentPrimary} />
                      </View>
                      <Text style={[s.gradeTitle, { color: colors.accentPrimary }]}>Good</Text>
                      <Text style={s.gradeSub}>4 Days</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.gradeBtn, s.gradeEasy]}
                      activeOpacity={0.8}
                      onPress={() => handleGrade('easy')}
                      disabled={submitting}
                    >
                      <View style={s.gradeIconCircle}>
                        <Ionicons name="rocket" size={14} color={isDark ? '#00c16e' : '#059669'} />
                      </View>
                      <Text style={[s.gradeTitle, { color: isDark ? '#00c16e' : '#059669' }]}>Easy</Text>
                      <Text style={s.gradeSub}>7+ Days</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={s.unflippedHintRow}>
                  <TouchableOpacity style={s.revealAnswerBtn} activeOpacity={0.8} onPress={handleFlip}>
                    <Text style={s.revealAnswerBtnText}>Reveal Answer</Text>
                    <Ionicons name="chevron-forward" size={15} color={isDark ? '#000000' : '#FFFFFF'} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary, fontFamily: FONT_FAMILY.body }}>No flashcards due right now!</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    height: '86%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    backgroundColor: isDark ? '#18181b' : '#ECEBF2',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSection: {
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: FONT_FAMILY.medium,
  },
  progressPct: {
    color: colors.accentPrimary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: isDark ? '#18181b' : '#ECEBF2',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentPrimary,
    borderRadius: 2,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  topicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.2)',
    maxWidth: '55%',
  },
  topicPillText: {
    color: colors.accentPrimary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
  },
  lectureText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.body,
    flex: 1,
  },
  cardWrapper: {
    flex: 1,
    maxHeight: 380,
    marginBottom: 12,
  },
  cardFace: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  cardFaceFront: {
    backgroundColor: colors.surface,
    borderColor: isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.20)',
  },
  cardFaceBack: {
    backgroundColor: isDark ? '#111614' : '#F7FDF9',
    borderColor: isDark ? 'rgba(0,193,110,0.25)' : 'rgba(5,150,105,0.25)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeQuestionText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    color: colors.accentPrimary,
    letterSpacing: 0.6,
  },
  badgeAnswer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(0,193,110,0.12)' : 'rgba(5,150,105,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeAnswerText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    color: isDark ? '#00c16e' : '#059669',
    letterSpacing: 0.6,
  },
  flipPromptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flipPromptText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: FONT_FAMILY.medium,
  },
  cardScroll: {
    flex: 1,
    marginVertical: 4,
  },
  questionText: {
    color: colors.textPrimary,
    fontSize: 17,
    lineHeight: 27,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: -0.2,
  },
  answerText: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 26,
    fontFamily: FONT_FAMILY.medium,
  },
  inlineCodeChip: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 15,
    color: colors.accentPrimary,
    backgroundColor: isDark ? 'rgba(192, 132, 252, 0.15)' : 'rgba(108,92,231,0.10)',
    fontWeight: '700',
  },
  inlineCodeChipGreen: {
    color: isDark ? '#34d399' : '#059669',
    backgroundColor: isDark ? 'rgba(52, 211, 153, 0.15)' : 'rgba(5,150,105,0.12)',
  },
  hintContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  hintBox: {
    backgroundColor: isDark ? 'rgba(245,166,35,0.08)' : 'rgba(245,158,11,0.08)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245,166,35,0.22)' : 'rgba(245,158,11,0.22)',
  },
  hintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  hintLabel: {
    color: '#f5a623',
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
  },
  hintText: {
    color: isDark ? '#fcd34d' : '#B45309',
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 18,
  },
  showHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: isDark ? 'rgba(245,166,35,0.06)' : 'rgba(245,158,11,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(245,166,35,0.15)' : 'rgba(245,158,11,0.20)',
  },
  showHintText: {
    color: isDark ? '#f5a623' : '#D97706',
    fontSize: 11.5,
    fontFamily: FONT_FAMILY.medium,
  },
  cardBottomCue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardBottomCueText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.medium,
  },
  gradeContainer: {
    marginTop: 'auto',
    marginBottom: 8,
  },
  gradeHeaderLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 8,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gradeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeIconCircle: {
    marginBottom: 3,
  },
  gradeAgain: {
    borderColor: 'rgba(255,69,58,0.3)',
    backgroundColor: 'rgba(255,69,58,0.08)',
  },
  gradeHard: {
    borderColor: 'rgba(245,166,35,0.3)',
    backgroundColor: 'rgba(245,166,35,0.08)',
  },
  gradeGood: {
    borderColor: isDark ? 'rgba(165,153,255,0.3)' : 'rgba(108,92,231,0.3)',
    backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.08)',
  },
  gradeEasy: {
    borderColor: isDark ? 'rgba(0,193,110,0.3)' : 'rgba(16,185,129,0.3)',
    backgroundColor: isDark ? 'rgba(0,193,110,0.08)' : 'rgba(16,185,129,0.08)',
  },
  gradeTitle: {
    fontSize: 12.5,
    fontFamily: FONT_FAMILY.bold,
  },
  gradeSub: {
    fontSize: 9.5,
    color: colors.textSecondary,
    fontFamily: FONT_FAMILY.body,
    marginTop: 1,
  },
  unflippedHintRow: {
    marginTop: 'auto',
    marginBottom: 8,
  },
  revealAnswerBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 13,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: isDark ? 0.2 : 0.1,
    shadowRadius: 6,
  },
  revealAnswerBtnText: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
  },
  finishedBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  starCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: isDark ? 'rgba(0,193,110,0.12)' : 'rgba(5,150,105,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(0,193,110,0.3)' : 'rgba(5,150,105,0.3)',
  },
  finishTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: -0.3,
  },
  finishSub: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: FONT_FAMILY.body,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: isDark ? '#141416' : '#F5F4FA',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    marginTop: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.bold,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: FONT_FAMILY.medium,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: isDark ? 'rgba(0,193,110,0.12)' : 'rgba(5,150,105,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(0,193,110,0.25)' : 'rgba(5,150,105,0.25)',
  },
  xpBadgeText: {
    color: isDark ? '#00c16e' : '#059669',
    fontSize: 12.5,
    fontFamily: FONT_FAMILY.bold,
  },
  doneBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 24,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.25 : 0.12,
    shadowRadius: 8,
  },
  doneBtnText: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontSize: 14.5,
    fontFamily: FONT_FAMILY.bold,
  },
});
