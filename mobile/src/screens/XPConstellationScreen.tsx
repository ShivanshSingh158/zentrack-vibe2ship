import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Rect,
  Defs,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const NODE_RADIUS = 30;

type Level = {
  id: string;
  name: string;
  xp: number;
  colors: [string, string];
  icon: string;
  image?: any;
  description: string;
};

import { getXPState, LEVEL_TITLES, LEVEL_THRESHOLDS } from '../services/xpSystem';

const LEVEL_COLORS: [string, string][] = [
  ['#34d399', '#22d3ee'], // 0
  ['#22d3ee', '#3b82f6'], // 1
  ['#14b8a6', '#0ea5e9'], // 2 - Sentinel
  ['#3b82f6', '#6366f1'], // 3 - Guardian
  ['#a855f7', '#ec4899'], // 4
  ['#f59e0b', '#fbbf24'], // 5
  ['#f97316', '#ef4444'], // 6
  ['#ec4899', '#8b5cf6'], // 7
];

const LEVEL_ICONS = [
  'compass-outline',       // Seeker
  'shield-half-outline',   // Warden
  'eye-outline',           // Sentinel
  'shield-checkmark-outline', // Guardian
  'flash-outline',         // Vanguard
  'star-outline',          // Luminary
  'flame-outline',         // Legend
  'infinite-outline',      // Mythic
];

const LORE = [
  "The journey begins. Eyes wide open, stepping into the unknown.",
  "A steadfast protector of discipline, forging iron habits.",
  "A vigilant watcher of progress. Every rep, every day matters.",
  "An unwavering shield against complacency. The foundation is set.",
  "The tip of the spear. Leading the charge into uncharted strength.",
  "A shining beacon of dedication. Your aura inspires all.",
  "Carving your name into eternity. A living myth walking among mortals.",
  "Beyond human limits. A cosmic force of unstoppable momentum."
];

const MASCOT_IMAGES = [
  require('../../assets/mascots/level0.png'),
  require('../../assets/mascots/level1.png'),
  require('../../assets/mascots/level3.png'), // Sentinel
  require('../../assets/mascots/level2.png'), // Guardian
  require('../../assets/mascots/level4.png'),
  require('../../assets/mascots/level5.png'),
  require('../../assets/mascots/level6.png'),
  require('../../assets/mascots/level7.png'),
];

const LEVELS: Level[] = LEVEL_TITLES.map((name, i) => ({
  id: name.toLowerCase(),
  name,
  xp: LEVEL_THRESHOLDS[i],
  colors: LEVEL_COLORS[i] || ['#ffffff', '#ffffff'],
  icon: LEVEL_ICONS[i] || 'planet-outline',
  image: MASCOT_IMAGES[i] || undefined,
  description: LORE[i] || "Keep pushing forward.",
}));

// ---------- Star field ----------
const NUM_STARS = 90;

function useStarField(height: number) {
  return useMemo(
    () =>
      Array.from({ length: NUM_STARS }).map(() => ({
        x: Math.random() * SCREEN_W,
        y: Math.random() * height,
        r: Math.random() * 1.6 + 0.4,
        baseOpacity: Math.random() * 0.5 + 0.2,
        delay: Math.random() * 3000,
        duration: 1800 + Math.random() * 2200,
      })),
    [height]
  );
}

function TwinkleStar({
  x,
  y,
  r,
  baseOpacity,
}: {
  x: number;
  y: number;
  r: number;
  baseOpacity: number;
}) {
  return <Circle cx={x} cy={y} r={r} fill="#ffffff" opacity={baseOpacity} />;
}

// ---------- Node ----------
function ConstellationNode({
  level,
  index,
  status,
  layout,
  onPress,
}: {
  level: Level;
  index: number;
  status: 'past' | 'current' | 'future';
  layout: 'left' | 'right';
  onPress: () => void;
}) {
  const pulse = useSharedValue(0);
  const press = useSharedValue(1);

  useEffect(() => {
    if (status === 'current') {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    }
  }, [status]);

  const haloProps = useAnimatedProps(() => ({
    r: 30 + (pulse.value * 30),
    opacity: 0.55 * (1 - pulse.value),
  }));

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const isFuture = status === 'future';
  const nodeOpacity = isFuture ? 0.32 : 1;
  const gradId = `nodeGrad-${level.id}`;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 90).duration(500).easing(Easing.out(Easing.exp))}
      style={[
        styles.nodeWrapper,
        { flexDirection: layout === 'left' ? 'row' : 'row-reverse' },
      ]}
    >
      <Pressable
        onPressIn={() => {
          press.value = withSpring(0.92);
        }}
        onPressOut={() => {
          press.value = withSpring(1);
        }}
        onPress={onPress}
      >
        <Animated.View style={[styles.nodeVisual, pressStyle]}>
          <Svg width={140} height={140}>
            <Defs>
              <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={level.colors[0]} stopOpacity={1} />
                <Stop offset="100%" stopColor={level.colors[1]} stopOpacity={1} />
              </RadialGradient>
              <RadialGradient id={`halo-${gradId}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={level.colors[0]} stopOpacity={1} />
                <Stop offset="40%" stopColor={level.colors[0]} stopOpacity={0.7} />
                <Stop offset="100%" stopColor={level.colors[0]} stopOpacity={0} />
              </RadialGradient>
            </Defs>

            {status === 'current' && (
              <AnimatedCircle cx={70} cy={70} fill={`url(#halo-${gradId})`} animatedProps={haloProps} />
            )}

            {!level.image ? (
              <>
                <Circle cx={70} cy={70} r={NODE_RADIUS + 10} fill="none" stroke={level.colors[1]} strokeWidth={isFuture ? 0 : 2} opacity={0.35} />
                <Circle cx={70} cy={70} r={NODE_RADIUS} fill={`url(#${gradId})`} opacity={nodeOpacity} />
                <Circle cx={70} cy={70} r={NODE_RADIUS} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.25} />
              </>
            ) : null}
          </Svg>

          {level.image ? (
            <Animated.Image 
              source={level.image} 
              style={{ position: 'absolute', top: -5, left: -5, width: 150, height: 150, opacity: nodeOpacity }} 
              resizeMode="contain" 
            />
          ) : (
            <View style={{ position: 'absolute', top: 70 - 14, left: 70 - 14, opacity: nodeOpacity }}>
              <Ionicons name={level.icon as any} size={28} color="#ffffff" />
            </View>
          )}
        </Animated.View>
      </Pressable>

      <View style={[styles.loreContainer, layout === 'left' ? { paddingLeft: 16 } : { paddingRight: 16 }]}>
        <Text
          style={[
            styles.nodeLabel,
            { textAlign: layout === 'left' ? 'left' : 'right', opacity: isFuture ? 0.4 : 1 },
            status === 'current' && styles.nodeLabelCurrent,
          ]}
        >
          {level.name}
        </Text>
        <Text style={[styles.nodeXp, { textAlign: layout === 'left' ? 'left' : 'right', opacity: isFuture ? 0.35 : 0.7 }]}>
          {level.xp.toLocaleString()} XP
        </Text>
        <Text style={[styles.loreText, { textAlign: layout === 'left' ? 'left' : 'right', opacity: isFuture ? 0.2 : 0.85 }]}>
          {level.description}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function XPConstellationScreen() {
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const [currentXP, setCurrentXP] = useState(0);

  useEffect(() => {
    getXPState().then(state => {
      setCurrentXP(state.xp);
    });
  }, []);

  const currentLevelIndex = useMemo(() => {
    let idx = 0;
    LEVELS.forEach((lvl, i) => {
      if (currentXP >= lvl.xp) idx = i;
    });
    return idx;
  }, [currentXP]);

  const stars = useStarField(SCREEN_H);
  const reversedLevels = useMemo(() => [...LEVELS].reverse(), []);

  // Auto-scroll to current level on mount
  useEffect(() => {
    const t = setTimeout(() => {
      if (scrollRef.current) {
        // reversed array index: 0 is highest level, 7 is lowest level
        const reverseIndex = LEVELS.length - 1 - currentLevelIndex;
        
        // Estimate height: 140 visual + 40 margin = 180 per item.
        // Add 120 for the ScrollView's paddingTop
        const ITEM_HEIGHT = 180;
        const targetY = reverseIndex * ITEM_HEIGHT + 120;
        
        // Offset a bit so it's centered nicely, not perfectly at the very top edge
        const scrollY = Math.max(targetY - 140, 0); 
        
        scrollRef.current.scrollTo({ y: scrollY, animated: true });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [currentLevelIndex]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={StyleSheet.absoluteFill}>
        <Svg width={SCREEN_W} height={SCREEN_H}>
          <Defs>
            <RadialGradient id="bgGlow" cx="50%" cy="20%" r="80%">
              <Stop offset="0%" stopColor="#1a0b2e" stopOpacity={1} />
              <Stop offset="55%" stopColor="#0a0614" stopOpacity={1} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={1} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="url(#bgGlow)" />
          {stars.map((s, i) => (
            <TwinkleStar key={i} {...s} />
          ))}
        </Svg>
      </View>

      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Pressable 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }} 
          hitSlop={16} 
          style={styles.backBtn}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Lore Codex</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 120, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        {reversedLevels.map((level, i) => {
          const originalIndex = LEVELS.length - 1 - i;
          const status: 'past' | 'current' | 'future' =
            originalIndex < currentLevelIndex ? 'past' : originalIndex === currentLevelIndex ? 'current' : 'future';
          const layout = i % 2 === 0 ? 'left' : 'right';

          return (
            <ConstellationNode
              key={level.id}
              level={level}
              index={i}
              status={status}
              layout={layout}
              onPress={() => {
                Haptics.selectionAsync();
              }}
            />
          );
        })}
      </ScrollView>

      <Animated.View entering={FadeInDown.delay(200)} style={styles.footer}>
        <Text style={styles.footerLevel}>{LEVELS[currentLevelIndex].name}</Text>
        <Text style={styles.footerXp}>{currentXP.toLocaleString()} XP total</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    height: 96,
    paddingTop: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    color: '#ffffff',
    fontSize: 26,
    marginTop: -2,
    marginLeft: -2,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  nodeWrapper: {
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 40,
    alignItems: 'center',
  },
  nodeVisual: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loreContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nodeLabel: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  nodeLabelCurrent: {
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  nodeXp: {
    color: '#5ac8fa',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  loreText: {
    color: '#c8c8d8',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 30,
    paddingTop: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  footerLevel: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  footerXp: {
    color: '#a0a0b8',
    fontSize: 13,
    marginTop: 2,
  },
});
