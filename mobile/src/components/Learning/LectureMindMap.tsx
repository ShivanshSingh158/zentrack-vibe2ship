/**
 * LectureMindMap.tsx — ZenTrack Mobile
 *
 * AI-Generated Interactive Mind Map for YouTube lectures.
 * Uses pure React Native View + absolute positioning — NO react-native-svg import.
 * This avoids the "Tried to register two views with the same name RNSVGCircle"
 * Metro hot-reload ghost that fires when a new file imports the SVG module.
 *
 * Layout: central node at screen center, branch nodes at radius 150,
 * leaf nodes at radius 270. Connections drawn with rotated thin View elements.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  transcript: string;
  onAskQuestion: (question: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BRANCH_COLORS = [
  '#a599ff', '#22c55e', '#f59e0b', '#38bdf8', '#f472b6', '#fb923c',
];

const { width: SCREEN_W } = Dimensions.get('window');
const MAP_W = SCREEN_W - 32;
const MAP_H = 560;
const CX = MAP_W / 2;
const CY = MAP_H / 2;
const BRANCH_R = 150;
const LEAF_R = 270;
const CENTER_NODE_R = 50;   // "radius" (half-width) of central node box
const BRANCH_NODE_R = 32;
const LEAF_NODE_W = 72;
const LEAF_NODE_H = 28;

// ── Geometry helpers ───────────────────────────────────────────────────────────

function deg2rad(deg: number) { return (deg - 90) * Math.PI / 180; }

function polarXY(r: number, angleDeg: number) {
  const rad = deg2rad(angleDeg);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

/** Draw a line from (x1,y1) to (x2,y2) as a thin rotated View */
function Line({ x1, y1, x2, y2, color, opacity = 0.35 }: {
  x1: number; y1: number; x2: number; y2: number; color: string; opacity?: number;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return (
    <View
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: length,
        height: 1.5,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${angle}deg` }],
        transformOrigin: '0 50%',
      } as any}
      pointerEvents="none"
    />
  );
}

function wrapLabel(text: string, max = 12): string[] {
  if (text.length <= max) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur.trim()); cur = w;
    } else { cur = (cur + ' ' + w).trim(); }
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 3);
}

// ── Gemini prompt ──────────────────────────────────────────────────────────────

function buildPrompt(title: string, transcript: string): string {
  const excerpt = transcript ? transcript.slice(0, 5000) : '';
  return `Analyze this lecture and return ONLY valid JSON (no markdown, no backticks):
{
  "centralTopic": "max 4 words",
  "branches": [
    { "label": "Branch Name", "children": ["concept 1", "concept 2", "concept 3"] }
  ]
}
Rules: 4-6 branches, 2-4 leaf children each, all labels max 4 words.

Lecture: "${title}"
${excerpt ? `Transcript:\n${excerpt}` : ''}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LectureMindMap({
  visible, onClose, lectureTitle, transcript, onAskQuestion,
}: LectureMindMapProps) {
  const insets = useSafeAreaInsets();
  const [mapData, setMapData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tappedNode, setTappedNode] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true); setError(''); setMapData(null);
    try {
      const data = await callProxy({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: buildPrompt(lectureTitle, transcript) }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 900 },
      });
      const { text } = parseProxyResponse(data);
      const cleaned = text.replace(/^```json\n?|^```\n?|```$/gm, '').trim();
      const parsed: MindMapData = JSON.parse(cleaned);
      if (!parsed.centralTopic || !Array.isArray(parsed.branches)) throw new Error();
      setMapData(parsed);
    } catch {
      setError('Could not generate mind map. Tap Retry.');
    } finally { setLoading(false); }
  }, [lectureTitle, transcript]);

  const handleOpen = useCallback(() => {
    if (!mapData && !loading) generate();
  }, [mapData, loading, generate]);

  const handleTap = useCallback((label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTappedNode(label);
    setTimeout(() => {
      setTappedNode(null);
      onAskQuestion(`Explain "${label}" in the context of ${lectureTitle}`);
      onClose();
    }, 320);
  }, [lectureTitle, onAskQuestion, onClose]);

  // Pre-compute all node positions
  const layout = useMemo(() => {
    if (!mapData) return null;
    const branches = mapData.branches.slice(0, 6);
    const bCount = branches.length;
    return branches.map((branch, bi) => {
      const bAngle = (360 / bCount) * bi;
      const bPos = polarXY(BRANCH_R, bAngle);
      const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];
      const leaves = branch.children.slice(0, 4).map((child, ci) => {
        const spread = 50;
        const lAngle = bAngle + (ci - (branch.children.length - 1) / 2) * (spread / Math.max(branch.children.length - 1, 1));
        return { label: child, pos: polarXY(LEAF_R, lAngle) };
      });
      return { branch, bPos, color, leaves };
    });
  }, [mapData]);

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
            <Text style={styles.title}>🗺️ Mind Map</Text>
            <Text style={styles.sub} numberOfLines={1}>{lectureTitle}</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={generate} disabled={loading}>
            <Ionicons name="refresh" size={16} color="#a599ff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color="#f2f2f7" />
          </TouchableOpacity>
        </View>

        {mapData && !loading && (
          <Text style={styles.hint}>💡 Tap any node to ask ZEN-GPT</Text>
        )}

        {/* Loading */}
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#a599ff" />
            <Text style={styles.loadText}>ZEN-GPT is mapping the lecture…</Text>
          </View>
        )}

        {/* Error */}
        {!loading && !!error && (
          <View style={styles.center}>
            <Text style={styles.errText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={generate}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Map canvas — pure View, no SVG */}
        {!loading && mapData && layout && (
          <ScrollView
            contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ width: MAP_W, height: MAP_H }}>

              {/* ── Connection lines ── */}
              {layout.map((b, bi) => (
                <React.Fragment key={`lines-${bi}`}>
                  {/* Center → Branch */}
                  <Line
                    x1={CX} y1={CY}
                    x2={b.bPos.x} y2={b.bPos.y}
                    color={b.color}
                  />
                  {/* Branch → Leaves */}
                  {b.leaves.map((leaf, li) => (
                    <Line
                      key={`ll-${bi}-${li}`}
                      x1={b.bPos.x} y1={b.bPos.y}
                      x2={leaf.pos.x} y2={leaf.pos.y}
                      color={b.color} opacity={0.22}
                    />
                  ))}
                </React.Fragment>
              ))}

              {/* ── Leaf nodes ── */}
              {layout.map((b, bi) =>
                b.leaves.map((leaf, li) => {
                  const lines = wrapLabel(leaf.label, 11);
                  const isTapped = tappedNode === leaf.label;
                  const h = 24 + (lines.length - 1) * 13;
                  return (
                    <TouchableOpacity
                      key={`lf-${bi}-${li}`}
                      activeOpacity={0.7}
                      onPress={() => handleTap(leaf.label)}
                      style={[styles.leafNode, {
                        left: leaf.pos.x - LEAF_NODE_W / 2,
                        top: leaf.pos.y - h / 2,
                        width: LEAF_NODE_W,
                        minHeight: h,
                        borderColor: b.color,
                        backgroundColor: isTapped ? b.color : 'rgba(255,255,255,0.05)',
                      }]}
                    >
                      {lines.map((line, i) => (
                        <Text
                          key={i}
                          style={[styles.leafText, { color: isTapped ? '#000' : '#c4c4cc' }]}
                          numberOfLines={1}
                        >{line}</Text>
                      ))}
                    </TouchableOpacity>
                  );
                })
              )}

              {/* ── Branch nodes ── */}
              {layout.map((b, bi) => {
                const lines = wrapLabel(b.branch.label, 9);
                const isTapped = tappedNode === b.branch.label;
                return (
                  <TouchableOpacity
                    key={`bn-${bi}`}
                    activeOpacity={0.75}
                    onPress={() => handleTap(b.branch.label)}
                    style={[styles.branchNode, {
                      left: b.bPos.x - BRANCH_NODE_R,
                      top: b.bPos.y - BRANCH_NODE_R,
                      width: BRANCH_NODE_R * 2,
                      height: BRANCH_NODE_R * 2,
                      borderColor: b.color,
                      backgroundColor: isTapped ? b.color : `${b.color}22`,
                    }]}
                  >
                    {lines.map((line, i) => (
                      <Text
                        key={i}
                        style={[styles.branchText, { color: isTapped ? '#000' : b.color }]}
                        numberOfLines={1}
                      >{line}</Text>
                    ))}
                  </TouchableOpacity>
                );
              })}

              {/* ── Central node ── */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleTap(mapData.centralTopic)}
                style={[styles.centralNode, {
                  left: CX - CENTER_NODE_R,
                  top: CY - CENTER_NODE_R,
                  width: CENTER_NODE_R * 2,
                  height: CENTER_NODE_R * 2,
                  backgroundColor: tappedNode === mapData.centralTopic ? '#a599ff' : '#1a1040',
                }]}
              >
                {wrapLabel(mapData.centralTopic, 9).map((line, i) => (
                  <Text
                    key={i}
                    style={[styles.centralText, {
                      color: tappedNode === mapData.centralTopic ? '#000' : '#fff',
                    }]}
                    numberOfLines={1}
                  >{line}</Text>
                ))}
              </TouchableOpacity>

            </View>

            {/* Legend */}
            <View style={styles.legend}>
              {layout.map((b, bi) => (
                <TouchableOpacity
                  key={bi} style={styles.legendRow}
                  onPress={() => handleTap(b.branch.label)}
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 6, gap: 10 },
  title: { fontSize: 18, fontFamily: FONT_FAMILY.bold, color: '#ffffff' },
  sub: { fontSize: 12, fontFamily: FONT_FAMILY.body, color: '#71717a', marginTop: 1 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  hint: { fontSize: 11, fontFamily: FONT_FAMILY.body, color: '#52525b', textAlign: 'center', marginBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  loadText: { fontSize: 14, fontFamily: FONT_FAMILY.medium, color: '#71717a', textAlign: 'center' },
  errText: { fontSize: 14, fontFamily: FONT_FAMILY.medium, color: '#ef4444', textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: 'rgba(165,153,255,0.12)',
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)',
  },
  retryText: { fontSize: 14, fontFamily: FONT_FAMILY.bold, color: '#a599ff' },
  // Node styles — all positioned absolutely inside the canvas View
  centralNode: {
    position: 'absolute',
    borderRadius: 50, borderWidth: 2, borderColor: '#a599ff',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  centralText: { fontSize: 11, fontFamily: FONT_FAMILY.bold, textAlign: 'center' },
  branchNode: {
    position: 'absolute',
    borderRadius: 32, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  branchText: { fontSize: 9, fontFamily: FONT_FAMILY.bold, textAlign: 'center' },
  leafNode: {
    position: 'absolute',
    borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, paddingVertical: 3,
  },
  leafText: { fontSize: 8, fontFamily: FONT_FAMILY.medium, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingHorizontal: 16 },
  legendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 11, fontFamily: FONT_FAMILY.medium, color: '#a1a1aa' },
});
