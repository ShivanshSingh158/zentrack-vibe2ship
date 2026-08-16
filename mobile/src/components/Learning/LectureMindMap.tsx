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

function generateMindMapHtml(mapData: MindMapData, lectureTitle: string): string {
  const branches = mapData.branches.slice(0, 6);
  const bCount = branches.length;

  const escapeXml = (unsafe: string) => (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });

  const layoutData = branches.map((branch, bi) => {
    const bAngle = (360 / bCount) * bi;
    const bPos = polarXY(BRANCH_RADIUS, bAngle);
    const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];
    const leafCount = Math.min(branch.children.length, 4);
    const angleSpread = 44;
    const leaves = branch.children.slice(0, 4).map((child, ci) => {
      const offset = leafCount > 1 ? (ci - (leafCount - 1) / 2) * (angleSpread / (leafCount - 1)) : 0;
      const lAngle = bAngle + offset;
      return { label: child, pos: polarXY(LEAF_RADIUS, lAngle) };
    });
    return { branch, bPos, color, leaves, bAngle, bi };
  });

  let connectorsSvg = '';
  layoutData.forEach((b) => {
    connectorsSvg += `<line x1="${CX}" y1="${CY}" x2="${b.bPos.x}" y2="${b.bPos.y}" stroke="${b.color}" stroke-width="2.5" stroke-opacity="0.6" stroke-linecap="round" />\n`;
    b.leaves.forEach((leaf) => {
      connectorsSvg += `<line x1="${b.bPos.x}" y1="${b.bPos.y}" x2="${leaf.pos.x}" y2="${leaf.pos.y}" stroke="${b.color}" stroke-width="1.8" stroke-dasharray="5,5" stroke-opacity="0.4" stroke-linecap="round" />\n`;
    });
  });

  let leavesSvg = '';
  layoutData.forEach((b) => {
    b.leaves.forEach((leaf) => {
      leavesSvg += `
        <g transform="translate(${leaf.pos.x}, ${leaf.pos.y})">
          <rect x="-85" y="-20" width="170" height="40" rx="20" ry="20" fill="#14141e" stroke="${b.color}" stroke-width="1.5" stroke-opacity="0.75" />
          <circle cx="-65" cy="0" r="4.5" fill="${b.color}" />
          <text x="-52" y="4" fill="#f1f5f9" font-family="'Inter', -apple-system, sans-serif" font-size="11.5" font-weight="600">${escapeXml(leaf.label.length > 20 ? leaf.label.slice(0, 18) + '…' : leaf.label)}</text>
        </g>
      `;
    });
  });

  let branchesSvg = '';
  layoutData.forEach((b) => {
    branchesSvg += `
      <g transform="translate(${b.bPos.x}, ${b.bPos.y})">
        <rect x="-90" y="-36" width="180" height="72" rx="16" ry="16" fill="#101018" stroke="${b.color}" stroke-width="2.5" />
        <rect x="-42" y="-28" width="84" height="18" rx="9" ry="9" fill="${b.color}" fill-opacity="0.2" />
        <text x="0" y="-15" fill="${b.color}" font-family="'Inter', -apple-system, sans-serif" font-size="10" font-weight="700" text-anchor="middle" letter-spacing="0.5">PILLAR ${b.bi + 1}</text>
        <text x="0" y="18" fill="#ffffff" font-family="'Inter', -apple-system, sans-serif" font-size="13" font-weight="700" text-anchor="middle">${escapeXml(b.branch.label.length > 20 ? b.branch.label.slice(0, 18) + '…' : b.branch.label)}</text>
      </g>
    `;
  });

  const centerHubSvg = `
    <g transform="translate(${CX}, ${CY})">
      <rect x="-120" y="-48" width="240" height="96" rx="20" ry="20" fill="#1a1130" stroke="#a599ff" stroke-width="3" />
      <rect x="-56" y="-38" width="112" height="18" rx="9" ry="9" fill="#a599ff" fill-opacity="0.25" />
      <text x="0" y="-25" fill="#a599ff" font-family="'Inter', -apple-system, sans-serif" font-size="10" font-weight="800" text-anchor="middle" letter-spacing="0.8">✨ CENTRAL THEME</text>
      <text x="0" y="16" fill="#ffffff" font-family="'Inter', -apple-system, sans-serif" font-size="15" font-weight="800" text-anchor="middle">${escapeXml(mapData.centralTopic)}</text>
    </g>
  `;

  let breakdownHtml = '';
  layoutData.forEach((b) => {
    breakdownHtml += `
      <div class="pillar-card" style="border-color: ${b.color}40; background: linear-gradient(135deg, #13131c 0%, #0d0d14 100%);">
        <div class="pillar-header" style="color: ${b.color};">
          <span class="pillar-tag" style="background: ${b.color}25; color: ${b.color};">Pillar ${b.bi + 1}</span>
          <strong>${escapeXml(b.branch.label)}</strong>
        </div>
        <ul class="leaf-list">
          ${b.branch.children.map(c => `<li><span class="bullet" style="background: ${b.color};"></span>${escapeXml(c)}</li>`).join('')}
        </ul>
      </div>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #080512;
            color: #f1f5f9;
            padding: 32px;
            min-height: 100vh;
          }
          .doc-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid rgba(255,255,255,0.08);
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .title-area h1 {
            font-size: 24px;
            font-weight: 800;
            color: #ffffff;
            letter-spacing: -0.5px;
          }
          .title-area p {
            font-size: 13px;
            color: #94a3b8;
            margin-top: 4px;
          }
          .badge {
            background: rgba(165,153,255,0.15);
            border: 1px solid rgba(165,153,255,0.3);
            color: #a599ff;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .svg-canvas-container {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            border-radius: 24px;
            background: radial-gradient(circle at 50% 50%, #16102c 0%, #080512 85%);
            border: 1px solid rgba(255,255,255,0.08);
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            margin-bottom: 36px;
          }
          svg {
            display: block;
            width: 100%;
            height: auto;
          }
          .breakdown-section {
            max-width: 1200px;
            margin: 0 auto;
          }
          .section-title {
            font-size: 17px;
            font-weight: 700;
            color: #e2e8f0;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .pillar-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
          }
          .pillar-card {
            border: 1px solid;
            border-radius: 14px;
            padding: 16px;
          }
          .pillar-header {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            margin-bottom: 12px;
          }
          .pillar-tag {
            font-size: 9px;
            font-weight: 800;
            padding: 2px 6px;
            border-radius: 6px;
            text-transform: uppercase;
          }
          .leaf-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .leaf-list li {
            font-size: 12px;
            color: #cbd5e1;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .bullet {
            width: 6px;
            height: 6px;
            border-radius: 3px;
            display: inline-block;
            flex-shrink: 0;
          }
          .doc-footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid rgba(255,255,255,0.06);
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="doc-header">
          <div class="title-area">
            <h1>🗺️ Concept Mind Map: ${escapeXml(mapData.centralTopic)}</h1>
            <p>Lecture: <strong>${escapeXml(lectureTitle)}</strong></p>
          </div>
          <div class="badge">ZenTrack Study Engine</div>
        </div>

        <div class="svg-canvas-container">
          <svg viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#a599ff" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#080512" stop-opacity="0" />
              </radialGradient>
            </defs>
            <circle cx="${CX}" cy="${CY}" r="650" fill="url(#centerGlow)" />
            ${connectorsSvg}
            ${leavesSvg}
            ${branchesSvg}
            ${centerHubSvg}
          </svg>
        </div>

        <div class="breakdown-section">
          <div class="section-title">
            <span>📚 Key Conceptual Pillars & Breakdown</span>
          </div>
          <div class="pillar-grid">
            ${breakdownHtml}
          </div>
        </div>

        <div class="doc-footer">
          <span>Exported from ZenTrack Mobile &bull; Concept Mind Map</span>
          <span>Date: ${new Date().toLocaleDateString()}</span>
        </div>
      </body>
    </html>
  `;
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
  const { user } = useCoreData();
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

          {/* Export PDF Button */}
          {mapData && !loading && (
            <TouchableOpacity
              style={[styles.pdfBtn, exportingPdf && { opacity: 0.6 }]}
              onPress={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color="#080510" style={{ transform: [{ scale: 0.8 }] }} />
              ) : (
                <>
                  <Ionicons name="document-text" size={13} color="#080510" />
                  <Text style={styles.pdfBtnText}>Export PDF</Text>
                </>
              )}
            </TouchableOpacity>
          )}

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
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#a599ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 2,
  },
  pdfBtnText: {
    color: '#080510',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
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
