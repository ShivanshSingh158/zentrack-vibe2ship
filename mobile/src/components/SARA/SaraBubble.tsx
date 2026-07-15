/**
 * SaraBubble — Chat message bubble component for Sara screen.
 *
 * Variants:
 *   'sara'        — dark card, left-aligned, Sara's message (with markdown rendering)
 *   'user'        — purple pill, right-aligned, user's message
 *   'action_card' — confirmation card for Firestore writes
 *   'quick_reply' — row of tappable suggestion chips
 *
 * Markdown supported (no external package):
 *   **bold**, *italic*, # Header, ## Subheader, * bullet, - bullet, empty lines
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme/tokens';

// ── Design tokens ─────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────
export interface ActionCardData {
  icon?: string;   // ionicons name
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
  timestamp?: string;
}

// ── Blinking cursor ────────────────────────────────────────────────────────
function Cursor() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.Text style={[s.cursor, { opacity }]}>{'|'}</Animated.Text>;
}

// ── Typing indicator ────────────────────────────────────────────────────────
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
    <View style={s.typingContainer}>
      <Animated.View style={[s.typingDot, { opacity: dot1 }]} />
      <Animated.View style={[s.typingDot, { opacity: dot2 }]} />
      <Animated.View style={[s.typingDot, { opacity: dot3 }]} />
    </View>
  );
}

// ── Inline markdown parser ─────────────────────────────────────────────────
// Handles **bold**, *italic*, `code` within a single line segment
function parseInlineMarkdown(text: string, baseStyle: any): React.ReactNode {
  // Match **bold**, *italic*, `code`
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
            part.bold  && { fontWeight: '700', color: COLORS.textPrimary },
            part.italic && { fontStyle: 'italic' },
            part.code  && {
              fontFamily: 'monospace',
              backgroundColor: 'rgba(165,153,255,0.15)',
              color: COLORS.accentPrimary,
              borderRadius: 3,
            },
          ]}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

// ── Block markdown renderer ─────────────────────────────────────────────────
function MarkdownText({ text, baseStyle }: { text: string; baseStyle: any }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── H1: # Title ──────────────────────────────────────────────────────
    if (/^#\s/.test(trimmed)) {
      const content = trimmed.replace(/^#+\s/, '');
      nodes.push(
        <Text key={i} style={[baseStyle, s.mdH1]}>
          {parseInlineMarkdown(content, s.mdH1)}
        </Text>
      );
    }
    // ── H2: ## Title ─────────────────────────────────────────────────────
    else if (/^##\s/.test(trimmed)) {
      const content = trimmed.replace(/^#+\s/, '');
      nodes.push(
        <Text key={i} style={[baseStyle, s.mdH2]}>
          {parseInlineMarkdown(content, s.mdH2)}
        </Text>
      );
    }
    // ── Bullet: * item or - item ──────────────────────────────────────────
    else if (/^[\*\-]\s/.test(trimmed)) {
      const content = trimmed.replace(/^[\*\-]\s+/, '');
      nodes.push(
        <Text key={i} style={[baseStyle, s.mdBulletText]}>
          <Text style={s.mdBulletDot}>{'•   '}</Text>
          {/* parseInlineMarkdown returns a <Text>, which nests perfectly */}
          {parseInlineMarkdown(content, baseStyle)}
        </Text>
      );
    }
    // ── Numbered: 1. item ─────────────────────────────────────────────────
    else if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)?.[1] || '';
      const content = trimmed.replace(/^\d+\.\s+/, '');
      nodes.push(
        <Text key={i} style={[baseStyle, s.mdBulletText]}>
          <Text style={s.mdBulletDot}>{`${num}.  `}</Text>
          {parseInlineMarkdown(content, baseStyle)}
        </Text>
      );
    }
    // ── Horizontal rule ───────────────────────────────────────────────────
    else if (/^(---|\*\*\*|___)$/.test(trimmed)) {
      nodes.push(<View key={i} style={s.mdHr} />);
    }
    // ── Empty line → spacer ───────────────────────────────────────────────
    else if (trimmed === '') {
      nodes.push(<View key={i} style={{ height: 6 }} />);
    }
    // ── Regular paragraph ─────────────────────────────────────────────────
    else {
      nodes.push(
        <View key={i} style={s.mdPara}>
          {parseInlineMarkdown(trimmed, baseStyle)}
        </View>
      );
    }

    i++;
  }

  return <>{nodes}</>;
}

// ── Main SaraBubble component ──────────────────────────────────────────────
export default function SaraBubble({
  sender,
  text = '',
  isStreaming = false,
  actionCard,
  quickReplies,
}: SaraBubbleProps) {
  const isUser = sender === 'user';

  return (
    <View style={[s.wrapper, isUser && s.wrapperUser]}>

      {/* ── Message bubble ── */}
      <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleSara]}>
        {!text && isStreaming && !isUser ? (
          <TypingIndicator />
        ) : isUser ? (
          // User bubbles: plain text (user doesn't type markdown)
          <Text style={s.textUser}>
            {text}
            {isStreaming && <Cursor />}
          </Text>
        ) : (
          // Sara bubbles: full markdown rendering
          <View>
            <MarkdownText text={text} baseStyle={s.textSara} />
            {isStreaming && <Cursor />}
          </View>
        )}
      </View>

      {/* ── Action confirmation card ── */}
      {!isUser && actionCard && (
        <View style={s.actionCard}>
          {/* Header row */}
          <TouchableOpacity
            style={s.actionCardHeader}
            onPress={actionCard.onPress}
            disabled={!actionCard.onPress}
            activeOpacity={0.75}
          >
            <View style={s.actionCardIcon}>
              <Ionicons
                name={(actionCard.icon as any) || 'document-text-outline'}
                size={16}
                color={COLORS.accentPrimary}
              />
            </View>
            <View style={s.actionCardContent}>
              <Text style={s.actionCardTitle}>
                {actionCard.title}
              </Text>
              {actionCard.subtitle ? (
                <Text style={s.actionCardSub}>
                  {actionCard.subtitle}
                </Text>
              ) : null}
            </View>
            {actionCard.onPress ? (
              <Ionicons name="chevron-forward" size={14} color={COLORS.textTertiary} style={{ marginLeft: 4 }} />
            ) : null}
          </TouchableOpacity>

          {/* Button row */}
          {(actionCard.onConfirm || actionCard.onEditTime) && (
            <View style={s.actionCardActionsRow}>
              {actionCard.onEditTime && (
                <TouchableOpacity
                  style={s.editBtn}
                  onPress={actionCard.onEditTime}
                  activeOpacity={0.8}
                >
                  <Text style={s.editBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
              {actionCard.onConfirm && (
                <TouchableOpacity
                  style={s.confirmBtn}
                  onPress={actionCard.onConfirm}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={14} color="#000" style={{ marginRight: 4 }} />
                  <Text style={s.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Quick-reply chips ── */}
      {!isUser && quickReplies && quickReplies.length > 0 && (
        <View style={s.quickReplies}>
          {quickReplies.map((qr, i) => (
            <TouchableOpacity key={i} style={s.qrChip} onPress={qr.onPress} activeOpacity={0.75}>
              <Text style={s.qrChipText}>{qr.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  wrapperUser: {
    alignItems: 'flex-end',
  },

  // Bubbles
  bubble: {
    maxWidth: '86%',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleSara: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: COLORS.accentPrimary,
    borderBottomRightRadius: 4,
  },

  textSara: {
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  textUser: {
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.background,
    lineHeight: 22,
  },

  // Cursor
  cursor: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accentPrimary,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accentPrimary,
  },

  // ── Markdown styles ──────────────────────────────────────────────────────
  mdH1: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 24,
    marginTop: 6,
    marginBottom: 4,
  },
  mdH2: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
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
    color: COLORS.accentPrimary,
    fontWeight: 'bold',
  },
  mdHr: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
    width: '100%',
  },
  mdPara: {
    marginVertical: 1,
  },

  // ── Action card ──────────────────────────────────────────────────────────
  actionCard: {
    marginTop: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.25)',
    minWidth: '60%',
    maxWidth: '86%',
    alignSelf: 'flex-start',
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
    flexShrink: 1, // Fixes Android height calculation for wrapped text in row
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 20,
    marginBottom: 3,
  },
  actionCardSub: {
    fontSize: 12,
    fontWeight: '400',
    color: COLORS.textTertiary,
    lineHeight: 17,
  },
  actionCardActionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9,
  },
  confirmBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  editBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '400',
  },

  // ── Quick-reply chips ────────────────────────────────────────────────────
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  qrChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(165,153,255,0.5)',
    backgroundColor: 'rgba(165,153,255,0.08)',
  },
  qrChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
});
