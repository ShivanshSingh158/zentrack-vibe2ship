import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { LearningTopic, LearningSubTask } from '../../contexts/MobileDataContext';
import * as Haptics from 'expo-haptics';

export interface ChatHistoryItem {
  subId: string;
  topicId: string;
  topicTitle: string;
  subTitle: string;
  url?: string;
  messages: { role: string; text: string }[];
  lastMessageSnippet: string;
  messageCount: number;
  isCurrent: boolean;
}

interface LectureChatHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  currentSubId?: string;
  learningTopics: LearningTopic[];
  onSelectLecture?: (topicId: string, sub: LearningSubTask) => void;
  onClearCurrentChat?: () => void;
}

export const LectureChatHistoryModal: React.FC<LectureChatHistoryModalProps> = ({
  visible,
  onClose,
  currentSubId,
  learningTopics,
  onSelectLecture,
  onClearCurrentChat,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [loading, setLoading] = useState(true);
  const [historyItems, setHistoryItems] = useState<ChatHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Load all lecture chats from AsyncStorage
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const chatKeys = allKeys.filter((k) => k.startsWith('@lecture_chat_'));

      if (chatKeys.length === 0) {
        setHistoryItems([]);
        setLoading(false);
        return;
      }

      const pairs = await AsyncStorage.multiGet(chatKeys);
      const items: ChatHistoryItem[] = [];

      for (const [key, val] of pairs) {
        if (!val) continue;
        const subId = key.replace('@lecture_chat_', '');
        try {
          const messages = JSON.parse(val);
          if (!Array.isArray(messages) || messages.length === 0) continue;

          // Find topic and subtask metadata
          let foundTopic: LearningTopic | undefined;
          let foundSub: LearningSubTask | undefined;

          for (const topic of learningTopics) {
            const sub = topic.subTasks?.find((s) => s.id === subId);
            if (sub) {
              foundTopic = topic;
              foundSub = sub;
              break;
            }
          }

          const userMsgs = messages.filter((m) => m.role === 'user');
          const lastMsg = messages[messages.length - 1]?.text || '';
          const snippet = lastMsg.replace(/\n+/g, ' ').slice(0, 100);

          items.push({
            subId,
            topicId: foundTopic?.id || '',
            topicTitle: foundTopic?.title || 'Lecture Topic',
            subTitle: foundSub?.title || `Lecture ${subId.slice(0, 6)}`,
            url: foundSub?.url,
            messages,
            lastMessageSnippet: snippet,
            messageCount: messages.length,
            isCurrent: subId === currentSubId,
          });
        } catch {
          // Ignore parse errors
        }
      }

      // Sort: current first, then by message count / activity
      items.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return b.messageCount - a.messageCount;
      });

      // Cap at 5 most recent/active chat histories — auto-prune oldest
      if (items.length > 5) {
        const toKeep = items.slice(0, 5);
        const toPrune = items.slice(5);
        for (const excess of toPrune) {
          AsyncStorage.removeItem(`@lecture_chat_${excess.subId}`).catch(() => {});
        }
        setHistoryItems(toKeep);
      } else {
        setHistoryItems(items);
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    } finally {
      setLoading(false);
    }
  }, [learningTopics, currentSubId]);

  useEffect(() => {
    if (visible) {
      loadHistory();
      setSearchQuery('');
    }
  }, [visible, loadHistory]);

  const handleDeleteItem = async (item: ChatHistoryItem) => {
    Alert.alert(
      'Delete Conversation?',
      `Are you sure you want to delete the chat history for "${item.subTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(`@lecture_chat_${item.subId}`);
              setHistoryItems((prev) => prev.filter((i) => i.subId !== item.subId));
              if (item.isCurrent && onClearCurrentChat) {
                onClearCurrentChat();
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              console.warn('Failed to delete chat item:', e);
            }
          },
        },
      ]
    );
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return historyItems;
    const q = searchQuery.toLowerCase();
    return historyItems.filter(
      (item) =>
        item.subTitle.toLowerCase().includes(q) ||
        item.topicTitle.toLowerCase().includes(q) ||
        item.lastMessageSnippet.toLowerCase().includes(q)
    );
  }, [historyItems, searchQuery]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalContent, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={s.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={s.headerIconBadge}>
                <Ionicons name="time" size={18} color={colors.accentPrimary} />
              </View>
              <View>
                <Text style={s.headerTitle}>Lecture Chat History</Text>
                <Text style={s.headerSubtitle}>
                  {historyItems.length} saved (max 5 kept)
                </Text>
              </View>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={s.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              style={s.searchInput}
              placeholder="Search past conversations..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Content List */}
          {loading ? (
            <View style={s.centered}>
              <ActivityIndicator size="small" color={colors.accentPrimary} />
              <Text style={s.loadingText}>Loading past conversations...</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={s.centered}>
              <Ionicons name="chatbubbles-outline" size={40} color={isDark ? '#3f3f46' : '#C7C6D3'} />
              <Text style={s.emptyTitle}>
                {searchQuery ? 'No matching conversations' : 'No Chat History Yet'}
              </Text>
              <Text style={s.emptySub}>
                {searchQuery
                  ? 'Try searching for a different keyword'
                  : 'Start asking ZEN-GPT questions in any lecture video to build your history.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 10 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredItems.map((item) => (
                <TouchableOpacity
                  key={item.subId}
                  style={[s.card, item.isCurrent && s.cardActive]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.isCurrent) {
                      onClose();
                    } else if (onSelectLecture && item.topicId) {
                      const topic = learningTopics.find((t) => t.id === item.topicId);
                      const sub = topic?.subTasks?.find((s) => s.id === item.subId);
                      if (sub) {
                        onClose();
                        onSelectLecture(item.topicId, sub);
                      } else {
                        onClose();
                      }
                    }
                  }}
                >
                  <View style={s.cardTopRow}>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'nowrap' }}>
                        {item.isCurrent && (
                          <View style={s.currentBadge}>
                            <Text style={s.currentBadgeText}>CURRENT</Text>
                          </View>
                        )}
                        <Text style={[s.topicBadgeText, { flexShrink: 1 }]} numberOfLines={1}>
                          {item.topicTitle}
                        </Text>
                      </View>
                      <Text style={s.lectureTitle} numberOfLines={1}>
                        {item.subTitle}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={s.deleteBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => handleDeleteItem(item)}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <Text style={s.snippetText} numberOfLines={2}>
                    {item.lastMessageSnippet}
                  </Text>

                  <View style={s.cardBottomRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.accentPrimary} />
                      <Text style={s.countText}>{item.messageCount} messages</Text>
                    </View>
                    <Text style={s.openText}>
                      {item.isCurrent ? 'Viewing now →' : 'Open Lecture →'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? '#1c1c1f' : '#ECEBF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#18181b' : '#F5F4FA',
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: FONT_FAMILY.body,
  },
  emptyTitle: {
    marginTop: 12,
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: FONT_FAMILY.bold,
  },
  emptySub: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: FONT_FAMILY.body,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  card: {
    backgroundColor: isDark ? '#18181b' : '#F8F7FC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: {
    borderColor: isDark ? 'rgba(165,153,255,0.4)' : 'rgba(108,92,231,0.4)',
    backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.08)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  currentBadge: {
    backgroundColor: isDark ? 'rgba(0,193,110,0.15)' : 'rgba(5,150,105,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: {
    color: isDark ? '#00c16e' : '#059669',
    fontSize: 9.5,
    fontFamily: FONT_FAMILY.bold,
  },
  topicBadgeText: {
    color: colors.accentPrimary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.medium,
  },
  lectureTitle: {
    color: colors.textPrimary,
    fontSize: 14.5,
    fontFamily: FONT_FAMILY.bold,
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 8,
  },
  snippetText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: FONT_FAMILY.body,
    marginBottom: 8,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  countText: {
    color: colors.textSecondary,
    fontSize: 11.5,
    fontFamily: FONT_FAMILY.medium,
  },
  openText: {
    color: colors.accentPrimary,
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
  },
});

export default LectureChatHistoryModal;
