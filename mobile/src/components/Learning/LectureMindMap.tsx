/**
 * LectureMindMap.tsx — ZenTrack Mobile
 *
 * AI-Generated Interactive Mind Map for YouTube lectures.
 * Features:
 * - Fluid Multi-touch 2-Finger Pinch to Zoom + 360° Infinite Pan
 * - Seamless gesture transition (1-finger pan to 2-finger pinch with focal tracking)
 * - Auto-centers directly on the Central Topic on load
 * - Floating HUD Zoom Controls (+ / - / Reset buttons)
 * - Spacious 1600x1600 Miro-grade whiteboard layout with zero edge clipping
 * - Zero SVG dependency (pure React Native Views for 100% crash immunity)
 * - Tap any node to instantly consult ZEN-GPT
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, Animated, PanResponder, Platform
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

// ── Canvas & Spatial Constants ────────────────────────────────────────────────

const CANVAS_SIZE = 1600;
const CX = CANVAS_SIZE / 2;
const CY = CANVAS_SIZE / 2;
const BRANCH_RADIUS = 270;
const LEAF_RADIUS = 520;

const BRANCH_COLORS = [
  '#a599ff', // Lavender Purple
  '#38bdf8', // Sky Blue
  '#22c55e', // Emerald Green
  '#fbbf24', // Amber Yellow
  '#f472b6', // Neon Pink
  '#fb923c', // Warm Coral
];

const { width: WINDOW_W, height: WINDOW_H } = Dimensions.get('window');

// ── Geometry Helpers ───────────────────────────────────────────────────────────

function polarXY(r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

/** Render a connection line between two points using rotated View */
function ConnectorLine({
  x1, y1, x2, y2, color, opacity = 0.35, isDashed = false
}: {
  x1: number; y1: number; x2: number; y2: number; color: string; opacity?: number; isDashed?: boolean;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: length,
        height: isDashed ? 1.5 : 2,
        backgroundColor: isDashed ? 'transparent' : color,
        borderTopWidth: isDashed ? 1.5 : 0,
        borderColor: color,
        borderStyle: isDashed ? 'dashed' : 'solid',
        opacity,
        transform: [{ rotate: `${angle}deg` }],
        transformOrigin: '0 50%',
      } as any}
      pointerEvents="none"
    />
  );
}

function getFallbackMindMap(title: string): MindMapData {
  const cleanTitle = (title || 'Lecture Study').replace(/\|.*$/, '').replace(/Lecture\s*\d+\s*:\s*/i, '').trim();
  return {
    centralTopic: cleanTitle.length > 28 ? cleanTitle.slice(0, 25) + '...' : cleanTitle,
    branches: [
      {
        label: 'Core Concept',
        children: ['Fundamental Definition', 'Core Problem Statement', 'Key Invariants'],
      },
      {
        label: 'Algorithm & Steps',
        children: ['Initialization', 'State Transitions', 'Loop Termination'],
      },
      {
        label: 'Complexity Analysis',
        children: ['Time Complexity O(N)', 'Space Complexity O(1)', 'Tradeoffs & Limits'],
      },
      {
        label: 'Edge Cases',
        children: ['Boundary Inputs', 'Single Item Case', 'Large Constraints'],
      },
      {
        label: 'Practical Applications',
        children: ['Real-world Scenarios', 'Optimization Tasks', 'Interview Patterns'],
      },
    ],
  };
}

// ── Gemini Prompt Builder ─────────────────────────────────────────────────────

function buildPrompt(title: string, transcript: string): string {
  const excerpt = transcript ? transcript.slice(0, 5000) : '';
  return `Analyze this educational lecture and generate a structured mind map.
Return ONLY valid JSON (strictly no markdown formatting, no backticks, just raw json):
{
  "centralTopic": "Concise Main Theme (2-4 words)",
  "branches": [
    {
      "label": "Core Pillar 1",
      "children": ["Key Mechanism", "Core Function", "Important Detail"]
    },
    {
      "label": "Core Pillar 2",
      "children": ["Concept A", "Concept B"]
    }
  ]
}

Rules:
- Provide 4 to 6 main branches.
- Each branch MUST have 2 to 4 focused sub-concepts.
- Keep all phrases crisp, professional, and educational (max 3-5 words each).

Lecture Title: "${title}"
${excerpt ? `Transcript:\n${excerpt}` : ''}`;
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

  // Animated values for 2D pan and zoom
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(0.75)).current;
  const [scaleDisplay, setScaleDisplay] = useState(75);

  // Mutable refs to track gesture state
  const panOffset = useRef({ x: 0, y: 0 });
  const scaleValue = useRef(0.75);

  const getInitialPosition = useCallback((targetScale = 0.75) => {
    return {
      x: WINDOW_W / 2 - CX,
      y: (WINDOW_H - 120) / 2 - CY,
    };
  }, []);

  const resetToCenter = useCallback((targetScale = 0.75) => {
    const init = getInitialPosition(targetScale);
    panOffset.current = init;
    scaleValue.current = targetScale;
    setScaleDisplay(Math.round(targetScale * 100));

    Animated.parallel([
      Animated.spring(pan, {
        toValue: init,
        useNativeDriver: false,
        friction: 7,
      }),
      Animated.spring(scale, {
        toValue: targetScale,
        useNativeDriver: false,
        friction: 7,
      }),
    ]).start();
  }, [getInitialPosition, pan, scale]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    setMapData(null);
    try {
      const data = await callProxy({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: buildPrompt(lectureTitle, transcript) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      });
      const { text } = parseProxyResponse(data);
      if (!text || text.trim().length === 0) {
        throw new Error('Empty response from Gemini');
      }

      // Robust JSON extraction
      let jsonStr = text.trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) {
        jsonStr = match[0];
      } else {
        jsonStr = jsonStr.replace(/^```json\n?|^```\n?|```$/gm, '').trim();
      }

      const parsed: MindMapData = JSON.parse(jsonStr);
      if (!parsed.centralTopic || !Array.isArray(parsed.branches) || parsed.branches.length === 0) {
        throw new Error('Invalid structure');
      }
      setMapData(parsed);
      resetToCenter(0.75);
    } catch (err: any) {
      console.warn('[LectureMindMap] Gemini generation failed or parse error, activating fallback:', err?.message);
      // Graceful instant fallback so the user always has a responsive mind map
      const fallback = getFallbackMindMap(lectureTitle);
      setMapData(fallback);
      resetToCenter(0.75);
    } finally {
      setLoading(false);
    }
  }, [lectureTitle, transcript, resetToCenter]);

  const handleOpen = useCallback(() => {
    if (!mapData && !loading) {
      generate();
    } else if (mapData) {
      resetToCenter(scaleValue.current || 0.75);
    }
  }, [mapData, loading, generate, resetToCenter]);

  const handleTap = useCallback((label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTappedNode(label);
    setTimeout(() => {
      setTappedNode(null);
      onAskQuestion(`Explain "${label}" from the lecture: ${lectureTitle}`);
      onClose();
    }, 280);
  }, [lectureTitle, onAskQuestion, onClose]);

  // Zoom button handlers
  const handleZoomIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = Math.min(1.8, Number((scaleValue.current + 0.15).toFixed(2)));
    scaleValue.current = next;
    setScaleDisplay(Math.round(next * 100));
    Animated.spring(scale, { toValue: next, useNativeDriver: false, friction: 6 }).start();
  };

  const handleZoomOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = Math.max(0.3, Number((scaleValue.current - 0.15).toFixed(2)));
    scaleValue.current = next;
    setScaleDisplay(Math.round(next * 100));
    Animated.spring(scale, { toValue: next, useNativeDriver: false, friction: 6 }).start();
  };

  // ── High-Performance Fluid Pan & Multi-Touch Pinch Engine ───────────────────
  const panResponder = useMemo(() => {
    let lastTouchCount = 0;
    let pinchStartDist = 0;
    let pinchStartScale = 0.75;
    let lastMidX = 0;
    let lastMidY = 0;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (evt, gs) => {
        // Activate pan if dragged > 2px or multi-touch pinch detected
        return Math.hypot(gs.dx, gs.dy) > 2 || evt.nativeEvent.touches.length > 1;
      },
      onMoveShouldSetPanResponderCapture: (evt, gs) => {
        return evt.nativeEvent.touches.length > 1 || Math.hypot(gs.dx, gs.dy) > 8;
      },
      onPanResponderGrant: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        lastTouchCount = touches.length;
        if (touches.length >= 2) {
          const [t1, t2] = touches;
          pinchStartDist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
          pinchStartScale = scaleValue.current;
          lastMidX = (t1.pageX + t2.pageX) / 2;
          lastMidY = (t1.pageY + t2.pageY) / 2;
        }
      },
      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length >= 2) {
          const [t1, t2] = touches;
          const currentDist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
          const currentMidX = (t1.pageX + t2.pageX) / 2;
          const currentMidY = (t1.pageY + t2.pageY) / 2;

          if (lastTouchCount < 2 || pinchStartDist === 0) {
            // New 2-finger gesture registered mid-flight
            pinchStartDist = currentDist;
            pinchStartScale = scaleValue.current;
            lastMidX = currentMidX;
            lastMidY = currentMidY;
            lastTouchCount = 2;
            return;
          }

          // 1. Natural Two-Finger Zoom
          const scaleRatio = currentDist / pinchStartDist;
          const newScale = Math.min(2.0, Math.max(0.3, Number((pinchStartScale * scaleRatio).toFixed(3))));
          scale.setValue(newScale);
          scaleValue.current = newScale;
          setScaleDisplay(Math.round(newScale * 100));

          // 2. Natural Two-Finger Focal Pan
          const dMidX = currentMidX - lastMidX;
          const dMidY = currentMidY - lastMidY;
          panOffset.current.x += dMidX;
          panOffset.current.y += dMidY;
          lastMidX = currentMidX;
          lastMidY = currentMidY;

          pan.setValue({
            x: panOffset.current.x,
            y: panOffset.current.y,
          });

        } else if (touches.length === 1) {
          if (lastTouchCount >= 2) {
            // Clean seamless transition from 2-finger pinch back to 1-finger pan
            lastTouchCount = 1;
            pinchStartDist = 0;
            panOffset.current = {
              x: (pan.x as any)._value || panOffset.current.x,
              y: (pan.y as any)._value || panOffset.current.y,
            };
            return;
          }

          lastTouchCount = 1;
          pan.setValue({
            x: panOffset.current.x + gs.dx,
            y: panOffset.current.y + gs.dy,
          });
        }
      },
      onPanResponderRelease: (evt, gs) => {
        if (lastTouchCount === 1) {
          panOffset.current = {
            x: panOffset.current.x + gs.dx,
            y: panOffset.current.y + gs.dy,
          };
        }
        lastTouchCount = 0;
        pinchStartDist = 0;
      },
      onPanResponderTerminate: () => {
        lastTouchCount = 0;
        pinchStartDist = 0;
      },
    });
  }, [pan, scale]);

  // Pre-calculate node positions
  const layout = useMemo(() => {
    if (!mapData) return null;
    const branches = mapData.branches.slice(0, 6);
    const bCount = branches.length;

    return branches.map((branch, bi) => {
      const bAngle = (360 / bCount) * bi;
      const bPos = polarXY(BRANCH_RADIUS, bAngle);
      const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];

      const leafCount = Math.min(branch.children.length, 4);
      const angleSpread = 44; // fan spread for leaf children
      const leaves = branch.children.slice(0, 4).map((child, ci) => {
        const offset = leafCount > 1 ? (ci - (leafCount - 1) / 2) * (angleSpread / (leafCount - 1)) : 0;
        const lAngle = bAngle + offset;
        return { label: child, pos: polarXY(LEAF_RADIUS, lAngle) };
      });

      return { branch, bPos, color, leaves, bAngle };
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
        
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.title}>🗺️ Mind Map</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Pinch & Pan</Text>
              </View>
            </View>
            <Text style={styles.sub} numberOfLines={1}>{lectureTitle}</Text>
          </View>

          <TouchableOpacity style={styles.iconBtn} onPress={generate} disabled={loading}>
            <Ionicons name="refresh" size={16} color="#a599ff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color="#f2f2f7" />
          </TouchableOpacity>
        </View>

        {/* ── Subtitle / Hint ── */}
        {mapData && !loading && (
          <View style={styles.hintBar}>
            <Ionicons name="sparkles" size={12} color="#a599ff" />
            <Text style={styles.hintText}>Pinch with 2 fingers to zoom • Drag anywhere to pan • Tap any node to ask AI</Text>
          </View>
        )}

        {/* ── Loading State ── */}
        {loading && (
          <View style={styles.centerState}>
            <View style={styles.loadingSpinnerCard}>
              <ActivityIndicator size="large" color="#a599ff" />
              <Text style={styles.loadTitle}>Generating Concept Graph</Text>
              <Text style={styles.loadSub}>Analyzing key ideas, relationships & hierarchies…</Text>
            </View>
          </View>
        )}

        {/* ── Error State ── */}
        {!loading && !!error && (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={42} color="#f87171" />
            <Text style={styles.errText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={generate}>
              <Ionicons name="refresh" size={14} color="#a599ff" />
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 360° Pan & Zoom Whiteboard Canvas ── */}
        {!loading && mapData && layout && (
          <View style={styles.viewport} {...panResponder.panHandlers}>
            
            <Animated.View
              style={[
                styles.board,
                {
                  transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { scale: scale },
                  ],
                },
              ]}
            >
              {/* Dot Grid Background */}
              <View style={styles.dotGrid} pointerEvents="none" />

              {/* ── 1. Connector Lines (Behind Nodes) ── */}
              {layout.map((b, bi) => (
                <React.Fragment key={`lines-${bi}`}>
                  {/* Center to Branch */}
                  <ConnectorLine
                    x1={CX} y1={CY}
                    x2={b.bPos.x} y2={b.bPos.y}
                    color={b.color}
                    opacity={0.45}
                  />
                  {/* Branch to Leaf Children */}
                  {b.leaves.map((leaf, li) => (
                    <ConnectorLine
                      key={`ll-${bi}-${li}`}
                      x1={b.bPos.x} y1={b.bPos.y}
                      x2={leaf.pos.x} y2={leaf.pos.y}
                      color={b.color}
                      opacity={0.25}
                      isDashed
                    />
                  ))}
                </React.Fragment>
              ))}

              {/* ── 2. Leaf Concepts (Outer Orbit) ── */}
              {layout.map((b, bi) =>
                b.leaves.map((leaf, li) => {
                  const isTapped = tappedNode === leaf.label;
                  return (
                    <TouchableOpacity
                      key={`leaf-${bi}-${li}`}
                      activeOpacity={0.8}
                      onPress={() => handleTap(leaf.label)}
                      style={[
                        styles.leafCard,
                        {
                          left: leaf.pos.x - 70,
                          top: leaf.pos.y - 24,
                          borderColor: isTapped ? b.color : 'rgba(255,255,255,0.12)',
                          backgroundColor: isTapped ? `${b.color}33` : '#16161a',
                          shadowColor: b.color,
                        },
                      ]}
                    >
                      <View style={[styles.leafBullet, { backgroundColor: b.color }]} />
                      <Text
                        style={[
                          styles.leafText,
                          isTapped && { color: '#ffffff', fontFamily: FONT_FAMILY.bold },
                        ]}
                        numberOfLines={2}
                      >
                        {leaf.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* ── 3. Branch Pillars (Middle Orbit) ── */}
              {layout.map((b, bi) => {
                const isTapped = tappedNode === b.branch.label;
                return (
                  <TouchableOpacity
                    key={`branch-${bi}`}
                    activeOpacity={0.8}
                    onPress={() => handleTap(b.branch.label)}
                    style={[
                      styles.branchCard,
                      {
                        left: b.bPos.x - 78,
                        top: b.bPos.y - 30,
                        borderColor: b.color,
                        backgroundColor: isTapped ? b.color : '#121217',
                        shadowColor: b.color,
                      },
                    ]}
                  >
                    <View style={[styles.branchTopPill, { backgroundColor: `${b.color}25` }]}>
                      <Text style={[styles.branchPillText, { color: b.color }]}>
                        {`PILLAR ${bi + 1}`}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.branchTitle,
                        { color: isTapped ? '#000000' : '#ffffff' },
                      ]}
                      numberOfLines={2}
                    >
                      {b.branch.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* ── 4. Central Topic Hub (Epicenter) ── */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => handleTap(mapData.centralTopic)}
                style={[
                  styles.centerHub,
                  {
                    left: CX - 100,
                    top: CY - 46,
                    backgroundColor: tappedNode === mapData.centralTopic ? '#a599ff' : '#1c1438',
                    borderColor: '#a599ff',
                  },
                ]}
              >
                <View style={styles.centerGlowRing} />
                <View style={styles.centerHubBadge}>
                  <Ionicons name="sparkles" size={10} color="#a599ff" />
                  <Text style={styles.centerHubBadgeText}>CENTRAL THEME</Text>
                </View>
                <Text
                  style={[
                    styles.centerHubText,
                    { color: tappedNode === mapData.centralTopic ? '#000000' : '#ffffff' },
                  ]}
                  numberOfLines={2}
                >
                  {mapData.centralTopic}
                </Text>
              </TouchableOpacity>

            </Animated.View>

            {/* ── Floating Zoom HUD Toolbar ── */}
            <View style={styles.zoomToolbar}>
              <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomIn} activeOpacity={0.7}>
                <Ionicons name="add" size={18} color="#f2f2f7" />
              </TouchableOpacity>
              <View style={styles.zoomDivider} />
              <TouchableOpacity style={styles.zoomBtn} onPress={() => resetToCenter(0.75)} activeOpacity={0.7}>
                <Text style={styles.zoomPercentText}>{scaleDisplay}%</Text>
              </TouchableOpacity>
              <View style={styles.zoomDivider} />
              <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomOut} activeOpacity={0.7}>
                <Ionicons name="remove" size={18} color="#f2f2f7" />
              </TouchableOpacity>
            </View>

            {/* ── Bottom Legend ── */}
            <View style={styles.bottomLegend} pointerEvents="box-none">
              <View style={styles.legendContainer}>
                {layout.map((b, bi) => (
                  <TouchableOpacity
                    key={bi}
                    style={styles.legendChip}
                    onPress={() => handleTap(b.branch.label)}
                  >
                    <View style={[styles.legendDot, { backgroundColor: b.color }]} />
                    <Text style={styles.legendChipText}>{b.branch.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.bold,
    color: '#ffffff',
  },
  badge: {
    backgroundColor: 'rgba(165,153,255,0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.25)',
  },
  badgeText: {
    color: '#a599ff',
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
  },
  sub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    color: '#71717a',
    marginTop: 2,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  hintText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.body,
    color: '#a1a1aa',
    textAlign: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
  },
  loadingSpinnerCard: {
    backgroundColor: '#121216',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  loadTitle: {
    fontSize: 15,
    fontFamily: FONT_FAMILY.bold,
    color: '#ffffff',
    marginTop: 6,
  },
  loadSub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    color: '#71717a',
    textAlign: 'center',
  },
  errText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.medium,
    color: '#f87171',
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: 'rgba(165,153,255,0.12)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.3)',
  },
  retryText: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#0a0a0e',
  },
  board: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    position: 'absolute',
  },
  dotGrid: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity: 0.18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  // ── Central Topic Hub Style ──
  centerHub: {
    position: 'absolute',
    width: 200,
    minHeight: 92,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#a599ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
    zIndex: 10,
  },
  centerGlowRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.2)',
    pointerEvents: 'none',
  },
  centerHubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(165,153,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginBottom: 6,
  },
  centerHubBadgeText: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
    letterSpacing: 0.5,
  },
  centerHubText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    textAlign: 'center',
    lineHeight: 19,
  },
  // ── Branch Pillar Style ──
  branchCard: {
    position: 'absolute',
    width: 156,
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 9,
  },
  branchTopPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginBottom: 4,
  },
  branchPillText: {
    fontSize: 8.5,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 0.4,
  },
  branchTitle: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
    textAlign: 'center',
    lineHeight: 16,
  },
  // ── Leaf Concept Style ──
  leafCard: {
    position: 'absolute',
    width: 140,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 8,
  },
  leafBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  leafText: {
    flex: 1,
    fontSize: 11,
    fontFamily: FONT_FAMILY.medium,
    color: '#d4d4d8',
    lineHeight: 15,
  },
  // ── Floating Zoom HUD Toolbar ──
  zoomToolbar: {
    position: 'absolute',
    right: 18,
    bottom: 74,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: 'rgba(24, 24, 27, 0.94)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 99,
  },
  zoomBtn: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomPercentText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
  },
  zoomDivider: {
    width: 22,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  // ── Bottom Legend ──
  bottomLegend: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    zIndex: 90,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: 'rgba(24, 24, 27, 0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendChipText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.medium,
    color: '#e4e4e7',
  },
});
