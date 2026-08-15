/**
 * SaraBubble - ChatGPT-style message bubble for Sara AI.
 *
 * Variants:
 *   'sara' - Full-width, no bubble card. Sparkles avatar + SARA label + clean markdown
 *   'user' - Right-aligned dark pill/capsule (#27272a)
 *   actionCard / batchActions - Obsidian cards with glassmorphism border
 *   quickReplies - Translucent violet glass pills
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BatchActionCard, { BatchAction } from './BatchActionCard';
import { FONT_FAMILY } from '../../theme/tokens';

export interface ActionCardData {
  icon?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onConfirm?: () => void;
  onEditTime?: () => void;
}

export interface QuickReplyData {
  label: string;
  onPress: () => void;
}

interface SaraBubbleProps {
  sender: 'sara' | 'user';
  text?: string;
  isStreaming?: boolean;
  actionCard?: ActionCardData;
  quickReplies?: QuickReplyData[];
  batchActions?: BatchAction[];
  onBatchConfirm?: (selected: BatchAction[]) => void;
  timestamp?: string;
}

// -- Blinking cursor -----------------------------------------------------------
function Cursor() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.Text style={[styles.cursor, { opacity }]}>|</Animated.Text>;
}

// -- Typing indicator (ChatGPT style 3 pulsing dots) ----------------------------
function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ])
      ).start();
    };
    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, []);

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.typingDot, { opacity: dot1 }]} />
      <Animated.View style={[styles.typingDot, { opacity: dot2 }]} />
      <Animated.View style={[styles.typingDot, { opacity: dot3 }]} />
    </View>
  );
}

// -- Inline markdown parser ----------------------------------------------------
function parseInlineMarkdown(text: string, baseStyle: any): React.ReactNode {
  const parts: { text: string; bold?: boolean; italic?: boolean; code?: boolean }[] = [];
  const regex = /(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index) });
    }
    const m = match[0];
    if (m.startsWith('**') && m.endsWith('**')) {
      parts.push({ text: m.slice(2, -2), bold: true });
    } else if (m.startsWith('*') && m.endsWith('*')) {
      parts.push({ text: m.slice(1, -1), italic: true });
    } else if (m.startsWith('`') && m.endsWith('`')) {
      parts.push({ text: m.slice(1, -1), code: true });
    }
    lastIndex = match.index + m.length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }
  if (parts.length === 0) return null;
  if (parts.length === 1 && !parts[0].bold && !parts[0].italic && !parts[0].code) {
    return <Text style={baseStyle}>{parts[0].text}</Text>;
  }

  return (
    <Text style={baseStyle}>
      {parts.map((part, i) => (
        <Text
          key={i}
          style={[
            baseStyle,
            part.bold && { fontFamily: FONT_FAMILY.bold, color: '#ffffff' },
            part.italic && { fontStyle: 'italic' },
            part.code && { fontFamily: FONT_FAMILY.bold, color: '#a599ff' },
          ]}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

// -- Block markdown renderer ---------------------------------------------------
function MarkdownText({ text, baseStyle }: { text: string; baseStyle: any }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^#\s/.test(trimmed)) {
      const content = trimmed.replace(/^#+\s/, '');
      nodes.push(
        <Text key={i} style={styles.mdH1}>
          {parseInlineMarkdown(content, styles.mdH1)}
        </Text>
      );
    } else if (/^##\s/.test(trimmed)) {
      const content = trimmed.replace(/^#+\s/, '');
      nodes.push(
        <Text key={i} style={styles.mdH2}>
          {parseInlineMarkdown(content, styles.mdH2)}
        </Text>
      );
    } else if (/^[\*\-]\s/.test(trimmed)) {
      const content = trimmed.replace(/^[\*\-]\s+/, '');
      nodes.push(
        <Text key={i} style={[baseStyle, styles.mdBulletText]}>
          <Text style={styles.mdBulletDot}>{'•   '}</Text>
          {parseInlineMarkdown(content, baseStyle)}
        </Text>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)?.[1] || '';
      const content = trimmed.replace(/^\d+\.\s+/, '');
      nodes.push(
        <Text key={i} style={[baseStyle, styles.mdBulletText]}>
          <Text style={styles.mdBulletDot}>{`${num}.  `}</Text>
          {parseInlineMarkdown(content, baseStyle)}
        </Text>
      );
    } else if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      nodes.push(<View key={i} style={styles.mdHr} />);
    } else if (trimmed === '') {
      nodes.push(<View key={i} style={{ height: 6 }} />);
    } else {
      nodes.push(
        <View key={i} style={styles.mdPara}>
          {parseInlineMarkdown(trimmed, baseStyle)}
        </View>
      );
    }
    i++;
  }
  return <>{nodes}</>;
}

// -- Main SaraBubble Component -------------------------------------------------
function SaraBubbleInner({
  sender,
  text = '',
  isStreaming = false,
  actionCard,
  quickReplies,
  batchActions,
  onBatchConfirm,
}: SaraBubbleProps) {
  const isUser = sender === 'user';

  // User Message -> Right-aligned ChatGPT Dark Pill
  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userBubbleText}>{text}</Text>
        </View>
      </View>
    );
  }

  // Sara Message -> ChatGPT Full Width, No Boxy Card
  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantMessageContainer}>
        {/* Avatar + Label Header */}
        <View style={styles.assistantHeader}>
          <View style={styles.assistantAvatar}>
            <Ionicons name="sparkles" size={12} color="#a599ff" />
          </View>
          <Text style={styles.assistantName}>SARA</Text>
        </View>

        {/* Content Body */}
        {!text && isStreaming ? (
          <View style={styles.thinkingContainer}>
            <TypingIndicator />
          </View>
        ) : (
          <View style={styles.markdownWrapper}>
            <MarkdownText text={text} baseStyle={styles.textSara} />
            {isStreaming && <Cursor />}
          </View>
        )}

        {/* Action confirmation card */}
        {actionCard && (
          <View style={styles.actionCard}>
            <TouchableOpacity
              style={styles.actionCardHeader}
              onPress={actionCard.onPress}
              disabled={!actionCard.onPress}
              activeOpacity={0.75}
            >
              <View style={styles.actionCardIcon}>
                <Ionicons
                  name={(actionCard.icon as any) || 'document-text-outline'}
                  size={16}
                  color="#a599ff"
                />
              </View>
              <View style={styles.actionCardContent}>
                <Text style={styles.actionCardTitle}>{actionCard.title}</Text>
                {actionCard.subtitle ? (
                  <Text style={styles.actionCardSub}>{actionCard.subtitle}</Text>
                ) : null}
              </View>
              {actionCard.onPress ? (
                <Ionicons name="chevron-forward" size={14} color="#71717a" style={{ marginLeft: 4 }} />
              ) : null}
            </TouchableOpacity>

            {(actionCard.onConfirm || actionCard.onEditTime) && (
              <View style={styles.actionCardActionsRow}>
                {actionCard.onEditTime && (
                  <TouchableOpacity style={styles.editBtn} onPress={actionCard.onEditTime} activeOpacity={0.8}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
                {actionCard.onConfirm && (
                  <TouchableOpacity style={styles.confirmBtn} onPress={actionCard.onConfirm} activeOpacity={0.8}>
                    <Ionicons name="checkmark" size={14} color="#000000" style={{ marginRight: 4 }} />
                    <Text style={styles.confirmBtnText}>Confirm</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* Batch action card */}
        {batchActions && batchActions.length > 0 && (
          <BatchActionCard
            actions={batchActions}
            onConfirmAll={onBatchConfirm || (() => {})}
            onDismiss={() => {}}
          />
        )}

        {/* Quick-reply chips */}
        {quickReplies && quickReplies.length > 0 && (
          <View style={styles.quickReplies}>
            {quickReplies.map((qr, i) => (
              <TouchableOpacity key={i} style={styles.qrChip} onPress={qr.onPress} activeOpacity={0.75}>
                <Text style={styles.qrChipText}>{qr.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const SaraBubble = React.memo(SaraBubbleInner, (prev, next) => {
  if (!prev.isStreaming && !next.isStreaming) {
    return (
      prev.text === next.text &&
      prev.actionCard === next.actionCard &&
      prev.batchActions === next.batchActions &&
      prev.quickReplies === next.quickReplies
    );
  }
  return false;
});

export default SaraBubble;

// -- Styles --------------------------------------------------------------------
const styles = StyleSheet.create({
  // User Bubble
  userRow: {
    alignItems: 'flex-end',
    width: '100%',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  userBubble: {
    backgroundColor: '#27272a',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '85%',
  },
  userBubbleText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
  },

  // Assistant Message (ChatGPT style)
  assistantRow: {
    width: '100%',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  assistantMessageContainer: {
    width: '100%',
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  assistantAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(165,153,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12.5,
    color: '#a599ff',
    letterSpacing: 0.5,
  },
  markdownWrapper: {
    width: '100%',
  },
  thinkingContainer: {
    paddingVertical: 4,
  },

  // Typography & Elements
  textSara: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    color: '#ececec',
    lineHeight: 23,
  },
  cursor: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#a599ff',
  },

  // Markdown block elements
  mdH1: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    color: '#ffffff',
    lineHeight: 24,
    marginTop: 6,
    marginBottom: 4,
  },
  mdH2: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#f4f4f5',
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 2,
  },
  mdBulletText: {
    marginVertical: 3,
    lineHeight: 22,
  },
  mdBulletDot: {
    fontSize: 15,
    color: '#a599ff',
    fontFamily: FONT_FAMILY.bold,
  },
  mdHr: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
    width: '100%',
  },
  mdPara: {
    marginVertical: 2,
  },

  // Action Cards
  actionCard: {
    marginTop: 12,
    backgroundColor: '#141417',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.22)',
  },
  actionCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  actionCardIcon: {
    marginRight: 10,
    marginTop: 2,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(165,153,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionCardContent: {
    flex: 1,
    flexShrink: 1,
  },
  actionCardTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 21,
    marginBottom: 3,
  },
  actionCardSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: '#a1a1aa',
    lineHeight: 18,
  },
  actionCardActionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  confirmBtnText: {
    color: '#000000',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13.5,
  },
  editBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    color: '#d4d4d8',
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13.5,
  },

  // Quick Reply Chips
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  qrChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.3)',
    backgroundColor: 'rgba(165,153,255,0.1)',
  },
  qrChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    color: '#c4bfff',
  },
});

