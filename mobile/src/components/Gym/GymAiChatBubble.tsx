import React from 'react';
import { View, Text, Platform } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { FONT_FAMILY } from '../../theme/tokens';
import ActionConfirmationCard from '../SARA/ActionConfirmationCard';
import GymAiMultiDayPlanCard from './GymAiMultiDayPlanCard';
import GymAiOptionsChips from './GymAiOptionsChips';

export interface ChatMessage {
  id: string;
  role: 'user' | 'gains' | 'thinking';
  text: string;
  actionCard?: any;
  options?: string[];
}

export interface GymAiChatBubbleProps {
  msg: ChatMessage;
  onSelectOption: (opt: string) => void;
  onWriteOwn: () => void;
  styles: any;
  colors: any;
  isDark: boolean;
}

export const GymAiChatBubble: React.FC<GymAiChatBubbleProps> = React.memo(({
  msg,
  onSelectOption,
  onWriteOwn,
  styles,
  colors,
  isDark,
}) => {
  const isUser = msg.role === 'user';

  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAi]}>
      <View style={isUser ? styles.msgBubbleUser : styles.msgBubbleAi}>
        {isUser ? (
          <Text style={styles.msgTextUser}>{msg.text}</Text>
        ) : (
          <>
            <Markdown
              style={{
                body: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
                strong: { fontFamily: FONT_FAMILY.bold, fontWeight: '700', color: colors.textPrimary },
                em: { fontStyle: 'italic', color: colors.textPrimary },
                bullet_list: { marginVertical: 4 },
                list_item: { marginVertical: 2, color: colors.textPrimary },
                bullet_list_icon: { color: colors.accentPrimary, fontSize: 13, marginTop: 4 },
                ordered_list_icon: { color: colors.accentPrimary, fontSize: 13 },
                paragraph: { marginTop: 0, marginBottom: 6, color: colors.textPrimary },
                heading1: { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 18, marginTop: 10, marginBottom: 4 },
                heading2: { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 16, marginTop: 8, marginBottom: 4 },
                heading3: { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 14, marginTop: 6, marginBottom: 2 },
                code_inline: {
                  backgroundColor: isDark ? 'rgba(165, 153, 255, 0.15)' : 'rgba(108, 92, 231, 0.10)',
                  color: isDark ? '#c4b5fd' : colors.accentPrimary,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  fontSize: 12.5,
                  fontWeight: '600',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 5,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(165, 153, 255, 0.3)' : 'rgba(108, 92, 231, 0.2)',
                },
                code_block: {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f5f5f7',
                  color: colors.textPrimary,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  fontSize: 12,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
                  marginVertical: 6,
                },
                fence: {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f5f5f7',
                  color: colors.textPrimary,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  fontSize: 12,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : colors.border,
                  marginVertical: 6,
                },
                blockquote: {
                  backgroundColor: isDark ? 'rgba(165, 153, 255, 0.06)' : 'rgba(108, 92, 231, 0.06)',
                  borderLeftColor: colors.accentPrimary,
                  borderLeftWidth: 3,
                  paddingLeft: 10,
                  paddingVertical: 4,
                  marginVertical: 6,
                  borderRadius: 4,
                },
                link: { color: colors.accentPrimary, textDecorationLine: 'underline' },
                hr: { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : colors.border, height: 1, marginVertical: 8 },
              }}
            >
              {msg.text}
            </Markdown>

            {/* Render action card if present */}
            {msg.actionCard && (
              <View style={{ marginTop: 8 }}>
                {msg.actionCard.type === 'import_multi_day_plan' ? (
                  <GymAiMultiDayPlanCard card={msg.actionCard} />
                ) : (
                  <ActionConfirmationCard
                    actionType={msg.actionCard.actionType || 'gym'}
                    title={msg.actionCard.title || 'Workout Action'}
                    details={msg.actionCard.details || ''}
                    onConfirm={msg.actionCard.onConfirm || (() => {})}
                    onEdit={msg.actionCard.onEdit}
                  />
                )}
              </View>
            )}

            {/* Render options chips if present */}
            {msg.options && msg.options.length > 0 && (
              <GymAiOptionsChips
                options={msg.options}
                onSelect={onSelectOption}
                onWriteOwn={onWriteOwn}
                disabled={false}
              />
            )}
          </>
        )}
      </View>
    </View>
  );
});

export default GymAiChatBubble;
