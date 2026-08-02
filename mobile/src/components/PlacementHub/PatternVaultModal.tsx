/**
 * PatternVaultModal.tsx — ZenTrack Placement Hub Active Recall & Spaced Repetition Vault
 *
 * Provides flashcard-style active recall cards for core DSA & Dev patterns.
 * Spaced intervals (3-day, 7-day, 21-day) help retain problem patterns for FAANG interviews.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PatternCard {
  id: string;
  category: 'DSA' | 'Dev';
  topic: string;
  question: string;
  keyPattern: string;
  codeSnippet?: string;
  lastReviewed?: string;
}

export const CURATED_PATTERNS: PatternCard[] = [
  {
    id: 'pat_dsa_1',
    category: 'DSA',
    topic: 'Arrays & 3-Pointer',
    question: 'Dutch National Flag Algorithm: How do you sort an array of 0s, 1s, and 2s in a single pass?',
    keyPattern: 'Maintain 3 pointers: low=0, mid=0, high=n-1. If nums[mid]==0, swap(low++, mid++). If nums[mid]==1, mid++. If nums[mid]==2, swap(mid, high--).',
    codeSnippet: 'while (mid <= high) {\n  if (nums[mid] === 0) swap(low++, mid++);\n  else if (nums[mid] === 1) mid++;\n  else swap(mid, high--);\n}'
  },
  {
    id: 'pat_dsa_2',
    category: 'DSA',
    topic: 'Two Pointers & Sliding Window',
    question: 'Variable-Size Sliding Window: How to find longest subarray with sum <= K?',
    keyPattern: 'Expand right pointer `right++` to add elements to sum. While sum > K, shrink from left `left++`. Track max length `(right - left + 1)`.',
    codeSnippet: 'for (let right = 0; right < n; right++) {\n  sum += nums[right];\n  while (sum > K) sum -= nums[left++];\n  maxLen = Math.max(maxLen, right - left + 1);\n}'
  },
  {
    id: 'pat_dsa_3',
    category: 'DSA',
    topic: 'LinkedList & Fast/Slow',
    question: 'Floyd’s Cycle Detection: How to detect cycle start node in a Linked List?',
    keyPattern: 'Move slow 1 step, fast 2 steps. When they meet, reset slow to head. Move both slow and fast 1 step at a time; their meeting point is the cycle start node.',
  },
  {
    id: 'pat_dsa_4',
    category: 'DSA',
    topic: 'Monotonic Stack',
    question: 'Next Greater Element: How to find the next greater element for each item in O(N)?',
    keyPattern: 'Traverse array. Maintain a monotonic decreasing stack of indices. While current > stack.top(), pop top index and set its answer to current element.',
    codeSnippet: 'for (let i = 0; i < n; i++) {\n  while (st.length && arr[i] > arr[st.top()]) {\n    ans[st.pop()] = arr[i];\n  }\n  st.push(i);\n}'
  },
  {
    id: 'pat_dsa_5',
    category: 'DSA',
    topic: 'Binary Search on Answer',
    question: 'Koko Eating Bananas: How do you formulate Binary Search when searching for a minimum rate H?',
    keyPattern: 'Define search space low=1, high=max(piles). Compute mid. Check if canEatAll(mid, H) is feasible. If true, try smaller rate high=mid-1; else low=mid+1.',
  },
  {
    id: 'pat_dev_1',
    category: 'Dev',
    topic: 'Asynchronous JavaScript',
    question: 'Event Loop Execution Priority: In what order do Microtasks vs Macrotasks execute?',
    keyPattern: '1. Synchronous code executes first.\n2. Microtask queue (Promises, queueMicrotask, process.nextTick) is COMPLETELY drained.\n3. Macrotask queue (setTimeout, setInterval, I/O) executes ONE task.\n4. Re-render UI and repeat.',
  },
  {
    id: 'pat_dev_2',
    category: 'Dev',
    topic: 'React Core',
    question: 'React Batching & Virtual DOM Reconciliation: Why shouldn’t you mutate state directly?',
    keyPattern: 'React uses Object.is() shallow comparison to detect state changes. Direct array/object mutations keep the same reference, skipping re-renders. Always create a shallow copy (`[...arr]` or `{...obj}`).',
  },
  {
    id: 'pat_dev_3',
    category: 'Dev',
    topic: 'PostgreSQL & Database',
    question: 'B-Tree Index Trade-Offs: When should you NOT add a database index?',
    keyPattern: 'Indexes speed up SELECT queries (O(log N) lookup) but slow down INSERT/UPDATE/DELETE because the index tree must be updated on every write. Avoid indexing low-cardinality columns (e.g. gender or boolean status).',
  },
];

interface PatternVaultModalProps {
  visible: boolean;
  onClose: () => void;
  onRewardXP?: (xp: number) => void;
}

export default function PatternVaultModal({ visible, onClose, onRewardXP }: PatternVaultModalProps) {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCount, setMasteredCount] = useState(0);

  const card = CURATED_PATTERNS[currentIndex % CURATED_PATTERNS.length];

  const handleNext = (remembered: boolean) => {
    if (remembered) {
      feedback.success();
      setMasteredCount(prev => prev + 1);
      onRewardXP?.(50);
    } else {
      feedback.tap();
    }
    setIsFlipped(false);
    setCurrentIndex(prev => prev + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen">
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            <Ionicons name="sparkles" size={20} color={colors.accentPrimary} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>Pattern Vault</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
            <View style={[styles.badge, { backgroundColor: `${colors.accentPrimary}20` }]}>
              <Text style={[styles.badgeText, { color: colors.accentPrimary }]}>{masteredCount} Mastered</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress & Category */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md }}>
          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, letterSpacing: 1.5, color: colors.textMuted, textTransform: 'uppercase' }}>
            Card {(currentIndex % CURATED_PATTERNS.length) + 1} of {CURATED_PATTERNS.length} • {card.category}
          </Text>
          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: card.category === 'DSA' ? '#3b82f6' : '#8b5cf6' }}>
            {card.topic}
          </Text>
        </View>

        {/* Flashcard Body */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            feedback.tap();
            setIsFlipped(!isFlipped);
          }}
          style={[
            styles.flashcard,
            { backgroundColor: colors.surface, borderColor: isFlipped ? colors.accentPrimary : colors.border }
          ]}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            {!isFlipped ? (
              <View style={{ gap: SPACE.md, paddingVertical: SPACE.md }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: colors.textPrimary, lineHeight: 24 }}>
                  {card.question}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.lg }}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={colors.textMuted} />
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textMuted }}>
                    Tap card to reveal pattern & solution
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ gap: SPACE.md, paddingVertical: SPACE.sm }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, letterSpacing: 1, color: colors.accentPrimary, textTransform: 'uppercase' }}>
                  KEY PATTERN & TRICK
                </Text>
                <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary, lineHeight: 22 }}>
                  {card.keyPattern}
                </Text>
                {card.codeSnippet && (
                  <View style={{ backgroundColor: colors.surface2, padding: SPACE.md, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontFamily: FONT_FAMILY.mono || 'monospace', fontSize: 11, color: '#a599ff', lineHeight: 18 }}>
                      {card.codeSnippet}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </TouchableOpacity>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.lg }}>
          <TouchableOpacity
            onPress={() => handleNext(false)}
            style={[styles.actionBtn, { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 }]}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.textSecondary }}>Need Review</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleNext(true)}
            style={[styles.actionBtn, { backgroundColor: `${colors.accentPrimary}20`, borderColor: `${colors.accentPrimary}40`, borderWidth: 1 }]}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentPrimary} />
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xs, color: colors.accentPrimary }}>Got It (+50 XP)</Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    marginTop: 80,
    marginHorizontal: SPACE.md,
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    padding: SPACE.lg,
    maxHeight: '82%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.lg,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashcard: {
    minHeight: 220,
    maxHeight: 320,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACE.lg,
    justifyContent: 'center',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
