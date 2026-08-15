/**
 * FlashcardReviewModal.tsx — ZenTrack Mobile
 * 3-Minute Daily Active Recall Spaced Repetition Review Deck.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, ActivityIndicator, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FONT_FAMILY } from '../../theme/tokens';
import { Flashcard, ReviewGrade, submitFlashcardReview } from '../../services/flashcardService';
import { awardXP } from '../../services/xpSystem';

interface FlashcardReviewModalProps {
  visible: boolean;
  onClose: () => void;
  dueCards: Flashcard[];
  onSessionComplete?: () => void;
}

const { width } = Dimensions.get('window');

export default function FlashcardReviewModal({
  visible,
  onClose,
  dueCards,
  onSessionComplete,
}: FlashcardReviewModalProps) {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && dueCards.length > 0) {
      setDeck(dueCards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowHint(false);
      setSessionFinished(false);
      flipAnim.setValue(0);
    }
  }, [visible, dueCards]);

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isFlipped) {
      Animated.spring(flipAnim, {
        toValue: 180,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }).start();
      setIsFlipped(true);
    } else {
      Animated.spring(flipAnim, {
        toValue: 0,
        friction: 8,
        tension: 10,
        useNativeDriver: true,
      }).start();
      setIsFlipped(false);
    }
  };

  const handleGrade = async (grade: ReviewGrade) => {
    if (submitting || !deck[currentIndex]) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const currentCard = deck[currentIndex];
    if (currentCard.id) {
      await submitFlashcardReview(currentCard.id, currentCard, grade);
    }

    if (currentIndex + 1 < deck.length) {
      // Flip back and advance
      flipAnim.setValue(0);
      setIsFlipped(false);
      setShowHint(false);
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={s.headerIconBox}>
                <Ionicons name="flash" size={16} color="#a599ff" />
              </View>
              <Text style={s.headerTitle}>Daily Active Recall</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#8e8e93" />
            </TouchableOpacity>
          </View>

          {sessionFinished ? (
            /* Celebration Screen */
            <View style={s.finishedBox}>
              <View style={s.starCircle}>
                <Ionicons name="trophy" size={36} color="#00c16e" />
              </View>
              <Text style={s.finishTitle}>Deck Completed!</Text>
              <Text style={s.finishSub}>
                You reviewed {deck.length} flashcard{deck.length > 1 ? 's' : ''} and reinforced your memory.
              </Text>
              <View style={s.xpBadge}>
                <Ionicons name="sparkles" size={14} color="#00c16e" />
                <Text style={s.xpBadgeText}>+10 XP Earned</Text>
              </View>
              <TouchableOpacity style={s.doneBtn} onPress={onClose}>
                <Text style={s.doneBtnText}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          ) : currentCard ? (
            /* Review Card Deck */
            <View style={{ flex: 1 }}>
              {/* Progress Bar */}
              <View style={s.progressRow}>
                <Text style={s.progressText}>Card {currentIndex + 1} of {deck.length}</Text>
                <View style={s.progressBarTrack}>
                  <View style={[s.progressBarFill, { width: `${((currentIndex + 1) / deck.length) * 100}%` }]} />
                </View>
              </View>

              {/* Source Tag */}
              <View style={s.sourceRow}>
                {currentCard.topicTitle && (
                  <View style={s.topicPill}>
                    <Text style={s.topicPillText} numberOfLines={1}>{currentCard.topicTitle}</Text>
                  </View>
                )}
                {currentCard.lectureTitle && (
                  <Text style={s.lectureText} numberOfLines={1}>• {currentCard.lectureTitle}</Text>
                )}
              </View>

              {/* 3D Flippable Card */}
              <TouchableOpacity activeOpacity={0.95} onPress={handleFlip} style={s.cardWrapper}>
                {!isFlipped ? (
                  /* FRONT: Question */
                  <Animated.View style={[s.cardFace, { transform: [{ rotateY: frontInterpolate }] }]}>
                    <View style={s.cardTop}>
                      <Text style={s.cardSideLabel}>QUESTION</Text>
                      <Ionicons name="help-circle-outline" size={18} color="#a599ff" />
                    </View>

                    <Text style={s.questionText}>{currentCard.question}</Text>

                    {currentCard.hint && (
                      <View style={{ marginTop: 'auto' }}>
                        {showHint ? (
                          <View style={s.hintBox}>
                            <Ionicons name="bulb-outline" size={14} color="#f5a623" />
                            <Text style={s.hintText}>{currentCard.hint}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={s.showHintBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              setShowHint(true);
                            }}
                          >
                            <Ionicons name="bulb-outline" size={14} color="#8e8e93" />
                            <Text style={s.showHintText}>Need a hint?</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    <View style={s.tapToFlipHint}>
                      <Ionicons name="sync" size={12} color="#71717a" />
                      <Text style={s.tapToFlipText}>Tap anywhere to reveal answer</Text>
                    </View>
                  </Animated.View>
                ) : (
                  /* BACK: Answer */
                  <Animated.View style={[s.cardFace, s.cardFaceBack, { transform: [{ rotateY: backInterpolate }] }]}>
                    <View style={s.cardTop}>
                      <Text style={[s.cardSideLabel, { color: '#00c16e' }]}>ANSWER</Text>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#00c16e" />
                    </View>

                    <Text style={s.answerText}>{currentCard.answer}</Text>

                    <View style={s.tapToFlipHint}>
                      <Ionicons name="sync" size={12} color="#71717a" />
                      <Text style={s.tapToFlipText}>Rate your recall below</Text>
                    </View>
                  </Animated.View>
                )}
              </TouchableOpacity>

              {/* Grading Buttons (shown when flipped) */}
              {isFlipped && (
                <View style={s.gradeRow}>
                  <TouchableOpacity
                    style={[s.gradeBtn, { borderColor: '#ff453a', backgroundColor: 'rgba(255,69,58,0.1)' }]}
                    onPress={() => handleGrade('again')}
                    disabled={submitting}
                  >
                    <Text style={[s.gradeTitle, { color: '#ff453a' }]}>Again</Text>
                    <Text style={s.gradeSub}>1 day</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.gradeBtn, { borderColor: '#f5a623', backgroundColor: 'rgba(245,166,35,0.1)' }]}
                    onPress={() => handleGrade('hard')}
                    disabled={submitting}
                  >
                    <Text style={[s.gradeTitle, { color: '#f5a623' }]}>Hard</Text>
                    <Text style={s.gradeSub}>2 days</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.gradeBtn, { borderColor: '#a599ff', backgroundColor: 'rgba(165,153,255,0.1)' }]}
                    onPress={() => handleGrade('good')}
                    disabled={submitting}
                  >
                    <Text style={[s.gradeTitle, { color: '#a599ff' }]}>Good</Text>
                    <Text style={s.gradeSub}>4 days</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.gradeBtn, { borderColor: '#00c16e', backgroundColor: 'rgba(0,193,110,0.1)' }]}
                    onPress={() => handleGrade('easy')}
                    disabled={submitting}
                  >
                    <Text style={[s.gradeTitle, { color: '#00c16e' }]}>Easy</Text>
                    <Text style={s.gradeSub}>7+ days</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#8e8e93', fontFamily: FONT_FAMILY.body }}>No flashcards due right now!</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#121214', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '82%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerIconBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(165,153,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 17, color: '#f2f2f7' },
  closeBtn: { padding: 6, backgroundColor: '#1c1c1e', borderRadius: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { color: '#8e8e93', fontSize: 12, fontFamily: FONT_FAMILY.medium },
  progressBarTrack: { width: 120, height: 4, backgroundColor: '#1c1c1e', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#a599ff', borderRadius: 2 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  topicPill: { backgroundColor: 'rgba(165,153,255,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)' },
  topicPillText: { color: '#a599ff', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  lectureText: { color: '#71717a', fontSize: 11, fontFamily: FONT_FAMILY.body, flex: 1 },
  cardWrapper: { flex: 1, maxHeight: 340, marginBottom: 16 },
  cardFace: { flex: 1, backgroundColor: '#1a1a1e', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', justifyContent: 'space-between' },
  cardFaceBack: { backgroundColor: '#16191f', borderColor: 'rgba(0,193,110,0.25)' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSideLabel: { fontSize: 11, fontFamily: FONT_FAMILY.bold, color: '#a599ff', letterSpacing: 0.5 },
  questionText: { color: '#ffffff', fontSize: 17, lineHeight: 26, fontFamily: FONT_FAMILY.bold, marginTop: 16 },
  answerText: { color: '#f2f2f7', fontSize: 16, lineHeight: 25, fontFamily: FONT_FAMILY.medium, marginTop: 16 },
  hintBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(245,166,35,0.1)', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,166,35,0.2)' },
  hintText: { color: '#f5a623', fontSize: 12, fontFamily: FONT_FAMILY.body, flex: 1 },
  showHintBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  showHintText: { color: '#8e8e93', fontSize: 12, fontFamily: FONT_FAMILY.medium },
  tapToFlipHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  tapToFlipText: { color: '#71717a', fontSize: 11, fontFamily: FONT_FAMILY.body },
  gradeRow: { flexDirection: 'row', gap: 8, marginTop: 'auto', marginBottom: 10 },
  gradeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gradeTitle: { fontSize: 13, fontFamily: FONT_FAMILY.bold },
  gradeSub: { fontSize: 10, color: '#71717a', fontFamily: FONT_FAMILY.body, marginTop: 2 },
  finishedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  starCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,193,110,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,193,110,0.3)' },
  finishTitle: { color: '#ffffff', fontSize: 20, fontFamily: FONT_FAMILY.bold },
  finishSub: { color: '#8e8e93', fontSize: 13, fontFamily: FONT_FAMILY.body, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,193,110,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginTop: 16, borderWidth: 1, borderColor: 'rgba(0,193,110,0.3)' },
  xpBadgeText: { color: '#00c16e', fontSize: 13, fontFamily: FONT_FAMILY.bold },
  doneBtn: { backgroundColor: '#a599ff', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, marginTop: 24, width: '100%', alignItems: 'center' },
  doneBtnText: { color: '#080510', fontSize: 14, fontFamily: FONT_FAMILY.bold },
});
