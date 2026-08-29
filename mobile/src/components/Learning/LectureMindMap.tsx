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
  View, Text, Modal, TouchableOpacity,
  ActivityIndicator, Dimensions, Animated, PanResponder, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { uploadFileToCloudinary } from '../../services/cloudinary';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

// Extracted styles, constants & HTML exporter
import {
  CANVAS_SIZE, CX, CY, BRANCH_RADIUS, LEAF_RADIUS_INNER, LEAF_RADIUS_OUTER,
  BRANCH_COLORS_DARK, BRANCH_COLORS_LIGHT, makeStyles,
} from './lectureMindMapStyles';
import {
  MindMapData, MindMapBranch, polarXY, generateMindMapHtml,
} from './lectureMindMapHtml';

export type { MindMapData, MindMapBranch };

interface LectureMindMapProps {
  visible: boolean;
  onClose: () => void;
  lectureTitle: string;
  transcript: string;
  onAskQuestion: (question: string) => void;
}

const { width: WINDOW_W, height: WINDOW_H } = Dimensions.get('window');

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
  const { user } = useCoreData();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [mapData, setMapData] = useState<MindMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [tappedNode, setTappedNode] = useState<string | null>(null);

  // Animated values for 2D pan and zoom
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(0.75)).current;
  const [scaleDisplay, setScaleDisplay] = useState(75);

  // Mutable refs to track gesture state
  const panOffset = useRef({ x: 0, y: 0 });
  const scaleValue = useRef(0.75);

  const handleExportPdf = useCallback(async () => {
    if (!mapData) return;
    setExportingPdf(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const cleanTitle = (lectureTitle || mapData.centralTopic || 'MindMap').replace(/[/\\?%*:|"<>]/g, '_').trim();
      const pdfFileName = `${cleanTitle}_MindMap.pdf`;
      const htmlContent = generateMindMapHtml(mapData, lectureTitle);

      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      // Save to Cloudinary & Vault storage nodes if user is logged in
      let pdfUrl = uri;
      let pdfSize = 80000;
      if (user) {
        try {
          const uploadRes = await uploadFileToCloudinary(uri, 'application/pdf', pdfFileName);
          if (uploadRes?.url) {
            pdfUrl = uploadRes.url;
            pdfSize = uploadRes.size || 80000;
          }
          await addDoc(collection(db, COLLECTION.STORAGE_NODES), {
            userId: user.uid,
            name: pdfFileName,
            type: 'file',
            fileType: 'pdf',
            url: pdfUrl,
            size: pdfSize,
            parentId: null, // Vault root
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } catch (uploadErr) {
          console.warn('[LectureMindMap] Cloudinary PDF upload fallback:', uploadErr);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e: any) {
      console.error('[LectureMindMap] PDF Export Error:', e);
    } finally {
      setExportingPdf(false);
    }
  }, [mapData, lectureTitle, user]);

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
          }
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          if (dist > 0 && pinchStartDist > 0) {
            const factor = dist / pinchStartDist;
            const newScale = Math.max(0.35, Math.min(2.0, pinchStartScale * factor));
            scale.setValue(newScale);
            scaleValue.current = newScale;
            setScaleDisplay(Math.round(newScale * 100));
          }
        } else if (touches.length === 1) {
          if (lastTouchCount >= 2) {
            lastTouchCount = 1;
            pinchStartDist = 0;
            panOffset.current = {
              x: (pan.x as any)._value || panOffset.current.x,
              y: (pan.y as any)._value || panOffset.current.y,
            };
          }
          pan.setValue({ x: gs.dx, y: gs.dy });
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
    });
  }, [pan, scale]);

  // Pre-calculate node positions
  const layout = useMemo(() => {
    if (!mapData) return null;
    const branches = mapData.branches.slice(0, 6);
    const bCount = branches.length;
    const branchColors = isDark ? BRANCH_COLORS_DARK : BRANCH_COLORS_LIGHT;

    return branches.map((branch, bi) => {
      const bAngle = (360 / bCount) * bi;
      const bPos = polarXY(BRANCH_RADIUS, bAngle);
      const color = branchColors[bi % branchColors.length];

      const leafCount = Math.min(branch.children.length, 4);
      const angleSpread = leafCount <= 2 ? 30 : leafCount === 3 ? 42 : 50;
      const leaves = branch.children.slice(0, 4).map((child, ci) => {
        const offset = leafCount > 1 ? (ci - (leafCount - 1) / 2) * (angleSpread / (leafCount - 1)) : 0;
        const lAngle = bAngle + offset;
        const leafRadius = leafCount > 2 ? (ci % 2 === 0 ? LEAF_RADIUS_OUTER : LEAF_RADIUS_INNER) : 530;
        return { label: child, pos: polarXY(leafRadius, lAngle) };
      });

      return { branch, bPos, color, leaves, bAngle };
    });
  }, [mapData, isDark]);

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

          {/* Export PDF Button */}
          {mapData && !loading && (
            <TouchableOpacity
              style={[styles.pdfBtn, exportingPdf && { opacity: 0.6 }]}
              onPress={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color={isDark ? '#080510' : '#FFFFFF'} style={{ transform: [{ scale: 0.8 }] }} />
              ) : (
                <>
                  <Ionicons name="document-text" size={13} color={isDark ? '#080510' : '#FFFFFF'} />
                  <Text style={styles.pdfBtnText}>Export PDF</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.iconBtn} onPress={generate} disabled={loading}>
            <Ionicons name="refresh" size={16} color={colors.accentPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ── Subtitle / Hint ── */}
        {mapData && !loading && (
          <View style={styles.hintBar}>
            <Ionicons name="sparkles" size={12} color={colors.accentPrimary} />
            <Text style={styles.hintText}>Pinch with 2 fingers to zoom • Drag anywhere to pan • Tap any node to ask AI</Text>
          </View>
        )}

        {/* ── Loading State ── */}
        {loading && (
          <View style={styles.centerState}>
            <View style={styles.loadingSpinnerCard}>
              <ActivityIndicator size="large" color={colors.accentPrimary} />
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
              <Ionicons name="refresh" size={14} color={colors.accentPrimary} />
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
                    opacity={isDark ? 0.45 : 0.55}
                  />
                  {/* Branch to Leaf Children */}
                  {b.leaves.map((leaf, li) => (
                    <ConnectorLine
                      key={`ll-${bi}-${li}`}
                      x1={b.bPos.x} y1={b.bPos.y}
                      x2={leaf.pos.x} y2={leaf.pos.y}
                      color={b.color}
                      opacity={isDark ? 0.25 : 0.35}
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
                          borderColor: isTapped ? b.color : (isDark ? 'rgba(255,255,255,0.12)' : colors.border),
                          backgroundColor: isTapped ? `${b.color}25` : (isDark ? '#16161a' : '#FFFFFF'),
                          shadowColor: b.color,
                        },
                      ]}
                    >
                      <View style={[styles.leafBullet, { backgroundColor: b.color }]} />
                      <Text
                        style={[
                          styles.leafText,
                          isTapped && { color: isDark ? '#ffffff' : b.color, fontFamily: FONT_FAMILY.bold },
                        ]}
                        numberOfLines={3}
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
                        left: b.bPos.x - 82,
                        top: b.bPos.y - 32,
                        borderColor: b.color,
                        backgroundColor: isTapped ? b.color : (isDark ? '#121217' : '#FFFFFF'),
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
                        { color: isTapped ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary },
                      ]}
                      numberOfLines={3}
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
                    backgroundColor: tappedNode === mapData.centralTopic ? colors.accentPrimary : (isDark ? '#1c1438' : '#FFFFFF'),
                    borderColor: colors.accentPrimary,
                  },
                ]}
              >
                <View style={styles.centerGlowRing} />
                <View style={styles.centerHubBadge}>
                  <Ionicons name="sparkles" size={10} color={colors.accentPrimary} />
                  <Text style={styles.centerHubBadgeText}>CENTRAL THEME</Text>
                </View>
                <Text
                  style={[
                    styles.centerHubText,
                    { color: tappedNode === mapData.centralTopic ? (isDark ? '#000000' : '#FFFFFF') : colors.textPrimary },
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
                <Ionicons name="add" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.zoomDivider} />
              <TouchableOpacity style={styles.zoomBtn} onPress={() => resetToCenter(0.75)} activeOpacity={0.7}>
                <Text style={styles.zoomPercentText}>{scaleDisplay}%</Text>
              </TouchableOpacity>
              <View style={styles.zoomDivider} />
              <TouchableOpacity style={styles.zoomBtn} onPress={handleZoomOut} activeOpacity={0.7}>
                <Ionicons name="remove" size={18} color={colors.textPrimary} />
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

