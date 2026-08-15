/**
 * LectureMindMap.tsx — ZenTrack Mobile
 *
 * AI-Generated Interactive Mind Map for YouTube lectures.
 * - Calls ZEN-GPT to generate a structured JSON mind map from the lecture transcript
 * - Renders it as an SVG diagram using react-native-svg (already installed)
 * - User can tap any node → auto-sends that concept as a ZEN-GPT question
 * - Central node in accent purple, branches in 6 theme colors, leaves in muted white
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';
import { FONT_FAMILY } from '../../theme/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MindMapBranch {
  label: string;
  children: string[];
}

interface MindMapData {
  centralTopic: string;
  branches: MindMapBranch[];
}

interface LectureMindMapProps {
  visible: boolean;
  onClose: () => void;
  lectureTitle: string;
  transcript: string;    // already loaded in tutorTranscriptRef.current
  onAskQuestion: (question: string) => void;
}

// ── Branch color palette ───────────────────────────────────────────────────────
const BRANCH_COLORS = [
  '#a599ff', // purple
  '#22c55e', // green
  '#f59e0b', // amber
  '#38bdf8', // sky blue
  '#f472b6', // pink
  '#fb923c', // orange
];

// ── Layout constants ───────────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const SVG_W = Math.max(SCREEN_W - 32, 340);
const SVG_H = 520;
const CENTER_X = SVG_W / 2;
const CENTER_Y = SVG_H / 2;
const CENTER_R = 52;
const BRANCH_RADIUS = 165;
const LEAF_RADIUS = 275;

// ── Angle helpers ──────────────────────────────────────────────────────────────
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wrapText(text: string, maxLen = 14): string[] {
  if (text.length <= maxLen) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxLen) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 3); // max 3 lines
}

// ── Gemini prompt ──────────────────────────────────────────────────────────────
function buildMindMapPrompt(lectureTitle: string, transcript: string): string {
  const excerpt = transcript ? transcript.slice(0, 6000) : '';
  return `You are an expert educator. Analyze this lecture and generate a concise mind map.

Lecture: "${lectureTitle}"
${excerpt ? `Transcript excerpt:\n${excerpt}` : ''}

Return ONLY valid JSON in this exact format (no markdown, no backticks):
{
  "centralTopic": "short central topic (max 4 words)",
  "branches": [
    { "label": "Branch Name", "children": ["concept 1", "concept 2", "concept 3"] },
    { "label": "Branch Name", "children": ["concept 1", "concept 2"] }
  ]
}

Rules:
- 4-6 branches maximum
- Each branch: 2-4 leaf concepts
- Labels must be short (1-4 words each)
- Focus on the most important concepts only`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LectureMindMap({
  visible, onClose, lectureTitle, transcript, onAskQuestion,
}: LectureMindMapProps) {
  const insets = useSafeAreaInsets();
  const [mapData, setMapData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tappedNode, setTappedNode] = useState<string | null>(null);

  // ── Generate map on first open ─────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError('');
    setMapData(null);
    try {
      const data = await callProxy({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: buildMindMapPrompt(lectureTitle, transcript) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      });
      const { text } = parseProxyResponse(data);
      // Strip markdown fences if model wraps it anyway
      const cleaned = text.replace(/^```json\n?|^```\n?|```$/gm, '').trim();
      const parsed: MindMapData = JSON.parse(cleaned);
      if (!parsed.centralTopic || !Array.isArray(parsed.branches)) throw new Error('Invalid structure');
      setMapData(parsed);
    } catch (e: any) {
      setError('Could not generate mind map. Try again.');
    } finally {
      setLoading(false);
    }
  }, [lectureTitle, transcript]);

  // Auto-generate when modal opens for the first time
  const handleOpen = useCallback(() => {
    if (!mapData && !loading) handleGenerate();
  }, [mapData, loading, handleGenerate]);

  // ── Node tap handler ───────────────────────────────────────────────────────
  const handleNodeTap = useCallback((label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTappedNode(label);
    // Auto-send to ZEN-GPT after brief highlight delay
    setTimeout(() => {
      setTappedNode(null);
      onAskQuestion(`Explain "${label}" in the context of ${lectureTitle}`);
      onClose();
    }, 350);
  }, [lectureTitle, onAskQuestion, onClose]);

  // ── SVG layout computation ─────────────────────────────────────────────────
  const layout = useMemo(() => {
    if (!mapData) return null;
    const branches = mapData.branches.slice(0, 6);
    const bCount = branches.length;

    return branches.map((branch, bi) => {
      const bAngle = (360 / bCount) * bi;
      const bPos = polarToXY(CENTER_X, CENTER_Y, BRANCH_RADIUS, bAngle);
      const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];

      const leaves = branch.children.slice(0, 4).map((child, ci) => {
        const spread = 40; // degrees spread for leaves around branch
        const lAngle = bAngle + (ci - (branch.children.length - 1) / 2) * (spread / Math.max(branch.children.length - 1, 1));
        const lPos = polarToXY(CENTER_X, CENTER_Y, LEAF_RADIUS, lAngle);
        return { label: child, pos: lPos, angle: lAngle };
      });

      return { branch, bPos, color, leaves, bAngle };
    });
  }, [mapData]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>🗺️ Mind Map</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{lectureTitle}</Text>
          </View>
          <TouchableOpacity style={styles.regenBtn} onPress={handleGenerate} disabled={loading}>
            <Ionicons name="refresh" size={16} color="#a599ff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color="#f2f2f7" />
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          {mapData ? '💡 Tap any node to ask ZEN-GPT about that concept' : ''}
        </Text>

        {/* Loading */}
        {loading && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#a599ff" />
            <Text style={styles.loadingText}>ZEN-GPT is mapping the lecture…</Text>
          </View>
        )}

        {/* Error */}
        {!loading && error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleGenerate}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Mind Map SVG */}
        {!loading && mapData && layout && (
          <ScrollView
            contentContainerStyle={{ alignItems: 'center', paddingVertical: 12 }}
            showsVerticalScrollIndicator={false}
          >
            <Svg width={SVG_W} height={SVG_H} style={{ overflow: 'visible' }}>

              {/* Lines: center → branches */}
              {layout.map((b, bi) => (
                <Line
                  key={`cl-${bi}`}
                  x1={CENTER_X} y1={CENTER_Y}
                  x2={b.bPos.x} y2={b.bPos.y}
                  stroke={b.color} strokeWidth={2} strokeOpacity={0.5}
                />
              ))}

              {/* Lines: branches → leaves */}
              {layout.map((b, bi) =>
                b.leaves.map((leaf, li) => (
                  <Line
                    key={`ll-${bi}-${li}`}
                    x1={b.bPos.x} y1={b.bPos.y}
                    x2={leaf.pos.x} y2={leaf.pos.y}
                    stroke={b.color} strokeWidth={1} strokeOpacity={0.3}
                  />
                ))
              )}

              {/* Leaf nodes */}
              {layout.map((b, bi) =>
                b.leaves.map((leaf, li) => {
                  const lines = wrapText(leaf.label, 12);
                  const isTapped = tappedNode === leaf.label;
                  return (
                    <G key={`lf-${bi}-${li}`} onPress={() => handleNodeTap(leaf.label)}>
                      <Rect
                        x={leaf.pos.x - 38} y={leaf.pos.y - 14}
                        width={76} height={lines.length > 1 ? 28 + (lines.length - 1) * 13 : 28}
                        rx={8} ry={8}
                        fill={isTapped ? b.color : 'rgba(255,255,255,0.06)'}
                        stroke={b.color} strokeWidth={1} strokeOpacity={0.4}
                      />
                      {lines.map((line, li2) => (
                        <SvgText
                          key={li2}
                          x={leaf.pos.x}
                          y={leaf.pos.y - (lines.length === 1 ? 2 : (lines.length === 2 ? 8 : 12)) + li2 * 13}
                          fontSize={9}
                          fill={isTapped ? '#000' : '#c4c4cc'}
                          textAnchor="middle"
                          fontWeight="500"
                        >
                          {line}
                        </SvgText>
                      ))}
                    </G>
                  );
                })
              )}

              {/* Branch nodes */}
              {layout.map((b, bi) => {
                const lines = wrapText(b.branch.label, 10);
                const isTapped = tappedNode === b.branch.label;
                return (
                  <G key={`bn-${bi}`} onPress={() => handleNodeTap(b.branch.label)}>
                    <Circle
                      cx={b.bPos.x} cy={b.bPos.y} r={30}
                      fill={isTapped ? b.color : `${b.color}22`}
                      stroke={b.color} strokeWidth={1.5}
                    />
                    {lines.map((line, li) => (
                      <SvgText
                        key={li}
                        x={b.bPos.x}
                        y={b.bPos.y - (lines.length === 1 ? 0 : (lines.length === 2 ? 6 : 10)) + li * 13}
                        fontSize={10}
                        fill={isTapped ? '#000' : b.color}
                        textAnchor="middle"
                        fontWeight="700"
                      >
                        {line}
                      </SvgText>
                    ))}
                  </G>
                );
              })}

              {/* Central node */}
              <G onPress={() => handleNodeTap(mapData.centralTopic)}>
                <Circle cx={CENTER_X} cy={CENTER_Y} r={CENTER_R}
                  fill={tappedNode === mapData.centralTopic ? '#a599ff' : '#1a1040'}
                  stroke="#a599ff" strokeWidth={2}
                />
                {wrapText(mapData.centralTopic, 10).map((line, i, arr) => (
                  <SvgText
                    key={i}
                    x={CENTER_X}
                    y={CENTER_Y - (arr.length === 1 ? 0 : (arr.length === 2 ? 7 : 13)) + i * 14}
                    fontSize={11}
                    fill={tappedNode === mapData.centralTopic ? '#000' : '#ffffff'}
                    textAnchor="middle"
                    fontWeight="700"
                  >
                    {line}
                  </SvgText>
                ))}
              </G>

            </Svg>

            {/* Legend */}
            <View style={styles.legend}>
              {layout.map((b, bi) => (
                <TouchableOpacity
                  key={bi}
                  style={styles.legendRow}
                  onPress={() => handleNodeTap(b.branch.label)}
                >
                  <View style={[styles.legendDot, { backgroundColor: b.color }]} />
                  <Text style={styles.legendText}>{b.branch.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.bold,
    color: '#ffffff',
  },
  headerSub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    color: '#71717a',
    marginTop: 1,
  },
  hint: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.body,
    color: '#52525b',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
    minHeight: 16,
  },
  regenBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(165,153,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  centerState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 14, fontFamily: FONT_FAMILY.medium, color: '#71717a', textAlign: 'center',
  },
  errorText: {
    fontSize: 14, fontFamily: FONT_FAMILY.medium, color: '#ef4444', textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: 'rgba(165,153,255,0.12)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)',
  },
  retryText: {
    fontSize: 14, fontFamily: FONT_FAMILY.bold, color: '#a599ff',
  },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    justifyContent: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24,
  },
  legendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontFamily: FONT_FAMILY.medium, color: '#a1a1aa' },
});
