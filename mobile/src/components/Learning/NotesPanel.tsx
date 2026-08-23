/**
 * NotesPanel.tsx - Extracted Notes Panel for LearningVideoPlayer
 *
 * Only mounted when notesVisible === true. Fully unmounts when closed,
 * freeing the TextInput, Markdown renderer, and all state.
 */
import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Platform, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import VsCodeSyntaxHighlighter from './VsCodeSyntaxHighlighter';
import InlineCodeRunner, { isRunnable } from './InlineCodeRunner';

interface NotesPanelProps {
  currentNotes: string;
  setCurrentNotes: (v: string) => void;
  saveNotes: () => void;
  detectedTimestamps: string[];
  handleInsertTimestamp: () => void;
  handleSeekToTimestamp: (ts: string) => void;
  handleExportToNotes: () => void;
  exporting: boolean;
}

export default function NotesPanel({
  currentNotes, setCurrentNotes, saveNotes, detectedTimestamps,
  handleInsertTimestamp, handleSeekToTimestamp, handleExportToNotes, exporting,
}: NotesPanelProps) {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const mdStyles = useMemo(() => makeMdStyles(colors, isDark), [colors, isDark]);
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('edit');

  const markdownRules = useMemo(() => ({
    fence: (node: any) => {
      const language = (node.sourceInfo || 'code').trim();
      const codeContent = (node.content || '').replace(/\n$/, '');
      if (isRunnable(language)) {
        return <InlineCodeRunner key={node.key} code={codeContent} language={language} nodeKey={node.key} />;
      }
      return (
        <View key={node.key} style={s.codeBoxContainer}>
          <VsCodeSyntaxHighlighter code={codeContent} language={language} showLineNumbers={true} />
        </View>
      );
    },
    code_block: (node: any) => {
      const codeContent = (node.content || '').replace(/\n$/, '');
      return (
        <View key={node.key} style={s.codeBoxContainer}>
          <VsCodeSyntaxHighlighter code={codeContent} showLineNumbers={false} />
        </View>
      );
    },
  }), [s]);

  return (
    <KeyboardAvoidingView style={s.notesPanel} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={s.panelHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={s.panelTitle}>Notes</Text>
          <View style={s.modeToggleContainer}>
            <TouchableOpacity style={[s.modeToggleBtn, notesMode === 'edit' && s.modeToggleBtnActive]} onPress={() => setNotesMode('edit')}>
              <Text style={[s.modeToggleText, notesMode === 'edit' && s.modeToggleTextActive]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modeToggleBtn, notesMode === 'preview' && s.modeToggleBtnActive]} onPress={() => setNotesMode('preview')}>
              <Text style={[s.modeToggleText, notesMode === 'preview' && s.modeToggleTextActive]}>Preview</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity style={s.toolActionBtn} onPress={handleInsertTimestamp}>
            <Ionicons name="time-outline" size={13} color={colors.accentPrimary} />
            <Text style={s.toolActionText}>+ Time</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.exportBtn, exporting && { opacity: 0.6 }]} onPress={handleExportToNotes} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color={isDark ? '#080510' : '#FFFFFF'} /> : (
              <>
                <Ionicons name="share-outline" size={12} color={isDark ? '#080510' : '#FFFFFF'} />
                <Text style={s.exportBtnText}>Export</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.saveNoteBtn} onPress={saveNotes}>
            <Text style={{ color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold, fontSize: 12.5 }}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Timestamp chips */}
      {detectedTimestamps.length > 0 && (
        <View style={s.timestampChipsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}>
            <Text style={s.timestampChipsLabel}>Jump:</Text>
            {detectedTimestamps.map((ts, idx) => (
              <TouchableOpacity key={idx} style={s.timestampChip} onPress={() => handleSeekToTimestamp(ts)}>
                <Ionicons name="play" size={9} color={colors.accentPrimary} />
                <Text style={s.timestampChipText}>{ts}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {notesMode === 'edit' ? (
        <TextInput
          style={s.notesInput}
          multiline
          textAlignVertical="top"
          placeholder={"Jot down notes here... Use # headers, **bold**, and tap '+ Time' to insert clickable video timestamps."}
          placeholderTextColor={colors.textMuted}
          value={currentNotes}
          onChangeText={setCurrentNotes}
          onBlur={saveNotes}
        />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {currentNotes.trim() ? (
            <Markdown rules={markdownRules} style={mdStyles}>{currentNotes}</Markdown>
          ) : (
            <Text style={{ color: colors.textMuted, fontStyle: 'italic', fontFamily: FONT_FAMILY.body }}>
              No notes written yet. Switch to Edit mode or tap '+ Time' to start.
            </Text>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  notesPanel: { flex: 1, backgroundColor: colors.surface },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  panelTitle: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary, fontSize: 16 },
  modeToggleContainer: { flexDirection: 'row', backgroundColor: isDark ? '#1c1c1e' : '#EAE9F2', borderRadius: 12, padding: 2, marginLeft: 8 },
  modeToggleBtn: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  modeToggleBtnActive: { backgroundColor: isDark ? 'rgba(165,153,255,0.2)' : '#FFFFFF' },
  modeToggleText: { fontSize: 11, color: colors.textMuted, fontFamily: FONT_FAMILY.body },
  modeToggleTextActive: { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
  toolActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.10)', borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.25)' },
  toolActionText: { color: colors.accentPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.accentPrimary },
  exportBtnText: { color: isDark ? '#080510' : '#FFFFFF', fontSize: 11, fontFamily: FONT_FAMILY.bold },
  saveNoteBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  timestampChipsContainer: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  timestampChipsLabel: { color: colors.textMuted, fontSize: 11, fontFamily: FONT_FAMILY.bold, marginRight: 2 },
  timestampChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.10)', borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.3)' : 'rgba(108,92,231,0.25)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  timestampChipText: { color: colors.textPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold },
  notesInput: { flex: 1, padding: 16, color: colors.textPrimary, fontFamily: FONT_FAMILY.body, fontSize: 14 },
  codeBoxContainer: { backgroundColor: isDark ? '#1e1e1e' : '#F8F7FC', borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginVertical: 8, overflow: 'hidden' },
});

const makeMdStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  body: { color: isDark ? '#ececec' : '#1C1C1E', fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 24 },
  heading1: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 12, marginBottom: 6 },
  heading2: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 10, marginBottom: 4 },
  heading3: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 8, marginBottom: 4 },
  strong: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  em: { color: isDark ? '#e5e5ea' : '#3A3A3C', fontStyle: 'italic' },
  bullet_list_icon: { color: isDark ? '#00c16e' : '#059669', fontSize: 14, marginTop: 3, marginRight: 8 },
  ordered_list_icon: { color: isDark ? '#00c16e' : '#059669', fontSize: 14, marginTop: 3, marginRight: 8 },
  code_inline: { color: isDark ? '#00c16e' : '#059669', backgroundColor: 'transparent', fontFamily: 'Inter_600SemiBold', fontSize: 14.5 },
  code_block: { color: isDark ? '#f2f2f7' : '#1C1C1E', backgroundColor: isDark ? '#141416' : '#F8F7FC', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: colors.border },
  fence: { color: isDark ? '#f2f2f7' : '#1C1C1E', backgroundColor: isDark ? '#141416' : '#F8F7FC', fontFamily: 'Inter_400Regular', padding: 12, borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: colors.border },
  pre: { backgroundColor: isDark ? '#141416' : '#F8F7FC', borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginVertical: 6 },
  blockquote: { backgroundColor: isDark ? 'rgba(0,193,110,0.08)' : 'rgba(5,150,105,0.08)', borderColor: isDark ? '#00c16e' : '#059669', borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6, borderRadius: 4 },
  paragraph: { marginTop: 0, marginBottom: 8 },
});
