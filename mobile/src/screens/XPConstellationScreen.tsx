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
  useAnimatedScrollHandler,
  interpolateColor,
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
  ['#94a3b8', '#f8fafc'], // 8 - Paragon (Silver/Ice White)
  ['#dc2626', '#7f1d1d'], // 9 - Titan (Crimson/Dark Red)
  ['#6ee7b7', '#059669'], // 10 - Ascendant (Mint/Emerald)
  ['#ca8a04', '#fef08a'], // 11 - Exalted (Rose Gold/Peach)
  ['#7e22ce', '#d946ef'], // 12 - Sovereign (Purple/Magenta)
  ['#2563eb', '#22d3ee'], // 13 - Archon (Neon Blue/Cyan)
  ['#1e3a8a', '#e0f2fe'], // 14 - Celestial (Midnight Blue/White)
  ['#a78bfa', '#fdf4ff'], // 15 - Ethereal (Lilac/Pearl)
  ['#f43f5e', '#fdba74'], // 16 - Empyrean (Cherry Red/Orange)
  ['#0f766e', '#5eead4'], // 17 - Astral (Deep Ocean/Aquamarine)
  ['#334155', '#e2e8f0'], // 18 - Zenith (Obsidian/Platinum)
  ['#eab308', '#ffffff'], // 19 - Apex (Pure Gold/White)
];

const LEVEL_ICONS = [
  'compass-outline',       // 0 Seeker
  'shield-half-outline',   // 1 Warden
  'eye-outline',           // 2 Sentinel
  'shield-checkmark-outline', // 3 Guardian
  'flash-outline',         // 4 Vanguard
  'star-outline',          // 5 Luminary
  'flame-outline',         // 6 Legend
  'infinite-outline',      // 7 Mythic
  'diamond-outline',       // 8 Paragon
  'hammer-outline',        // 9 Titan
  'rocket-outline',        // 10 Ascendant
  'sunny-outline',         // 11 Exalted
  'trophy-outline',        // 12 Sovereign
  'hardware-chip-outline', // 13 Archon
  'planet-outline',        // 14 Celestial
  'cloud-outline',         // 15 Ethereal
  'bonfire-outline',       // 16 Empyrean
  'moon-outline',          // 17 Astral
  'prism-outline',         // 18 Zenith
  'sparkles-outline',      // 19 Apex
];

const LORE = [
  "The journey begins. Eyes wide open, stepping into the unknown.",
  "A steadfast protector of discipline, forging iron habits.",
  "A vigilant watcher of progress. Every rep, every day matters.",
  "An unwavering shield against complacency. The foundation is set.",
  "The tip of the spear. Leading the charge into uncharted strength.",
  "A shining beacon of dedication. Your aura inspires all.",
  "Carving your name into eternity. A living myth walking among mortals.",
  "Beyond human limits. A cosmic force of unstoppable momentum.",
  "A flawless model of excellence. The standard all others strive to meet.",
  "Unstoppable force meets immovable object. Raw, earth-shattering power.",
  "Rising above mortal limitations. A being of pure, untethered potential.",
  "Revered and glorious. Walking in the warm light of true achievement.",
  "Absolute authority over your own destiny. The king of your domain.",
  "A commander of raw energy. Precision and power perfectly balanced.",
  "Observing from the stars. Your vision spans galaxies and ages.",
  "Drifting through the material world untouched. Pure spiritual focus.",
  "Burning with the fierce, blinding heat of a supreme solar flare.",
  "Navigating multidimensional spaces. Boundless depth and ancient wisdom.",
  "The absolute peak of physical and mental perfection. Silent, sharp, absolute.",
  "The pinnacle of existence. Radiating pure, brilliant light above all else."
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
  require('../../assets/mascots/level8.png'), // Paragon
  require('../../assets/mascots/level9.png'),
  require('../../assets/mascots/level10.png'),
  require('../../assets/mascots/level11.png'),
  require('../../assets/mascots/level12.png'),
  require('../../assets/mascots/level13.png'),
  require('../../assets/mascots/level14.png'),
  require('../../assets/mascots/level15.png'),
  require('../../assets/mascots/level16.png'),
  require('../../assets/mascots/level17.png'),
  require('../../assets/mascots/level18.png'),
  require('../../assets/mascots/level19.png'),
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
const STAR_COLORS = ['#ffffff', '#e0f2fe', '#fef08a', '#ffedd5', '#d8b4fe'];

function useStarField(height: number) {
  return useMemo(
    () =>
      Array.from({ length: NUM_STARS }).map(() => ({
        x: Math.random() * SCREEN_W,
        y: Math.random() * height,
        r: Math.random() * 1.8 + 0.3,
        baseOpacity: Math.random() * 0.6 + 0.1,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        delay: Math.random() * 3000,
        duration: 1800 + Math.random() * 2200,
      })),
    [height]
  );
}

function TwinkleStar({ x, y, r, baseOpacity, color }: any) {
  return (
    <>
      {r > 1.2 && <Circle cx={x} cy={y} r={r * 2.5} fill={color} opacity={baseOpacity * 0.3} />}
      <Circle cx={x} cy={y} r={r} fill={color} opacity={baseOpacity} />
    </>
  );
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
  layout: 'left' | 'right' | 'center';
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
    r: (layout === 'center' ? 60 : 30) + (pulse.value * 30),
    opacity: 0.55 * (1 - pulse.value),
  }));

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const isFuture = status === 'future';
  const isCenter = layout === 'center';
  let nodeOpacity = 1;
  if (isCenter) nodeOpacity = 1;
  else if (isFuture) nodeOpacity = 0.3;
  else if (status === 'past') nodeOpacity = 0.7;
  const gradId = `nodeGrad-${level.id}`;
  const visualSize = isCenter ? 180 : 140;
  const centerPos = visualSize / 2;

  return (
    <Animated.View
      entering={FadeInDown.duration(350).easing(Easing.out(Easing.exp))}
      style={[
        styles.nodeWrapper,
        isCenter 
          ? { flexDirection: 'column', alignItems: 'center', marginBottom: 40, marginTop: 60 }
          : { flexDirection: layout === 'left' ? 'row' : 'row-reverse' },
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
        <Animated.View style={[styles.nodeVisual, pressStyle, isCenter && { width: visualSize, height: visualSize, alignSelf: 'center', marginBottom: 0 }]}>
          <Svg width={visualSize} height={visualSize}>
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
              <AnimatedCircle cx={centerPos} cy={centerPos} fill={`url(#halo-${gradId})`} animatedProps={haloProps} />
            )}

            {!level.image ? (
              <>
                <Circle cx={centerPos} cy={centerPos} r={(isCenter ? NODE_RADIUS * 2 : NODE_RADIUS) + 10} fill="none" stroke={level.colors[1]} strokeWidth={isFuture ? 0 : 2} opacity={0.35} />
                <Circle cx={centerPos} cy={centerPos} r={isCenter ? NODE_RADIUS * 2 : NODE_RADIUS} fill={`url(#${gradId})`} opacity={nodeOpacity} />
                <Circle cx={centerPos} cy={centerPos} r={isCenter ? NODE_RADIUS * 2 : NODE_RADIUS} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.25} />
              </>
            ) : null}
          </Svg>

          {level.image ? (
            <>
              {/* Real Mascot Image */}
              <Animated.Image 
                source={level.image} 
                style={[
                  { position: 'absolute', top: -25, left: -25, width: 190, height: 190, opacity: nodeOpacity, zIndex: 2 },
                  isCenter && { 
                    top: -110, 
                    left: -110, 
                    width: 400, 
                    height: 400, 
                    opacity: 1, 
                  }
                ]} 
                resizeMode="contain" 
              />
            </>
          ) : (
            <View style={{ position: 'absolute', top: centerPos - (isCenter ? 24 : 14), left: centerPos - (isCenter ? 24 : 14), opacity: nodeOpacity }}>
              <Ionicons name={level.icon as any} size={isCenter ? 48 : 28} color="#ffffff" />
            </View>
          )}
        </Animated.View>
      </Pressable>

      <View style={[
        styles.loreContainer, 
        isCenter ? { paddingHorizontal: 24, alignItems: 'center' } : layout === 'left' ? { paddingLeft: 16 } : { paddingRight: 16 }
      ]}>
        <Text
          style={[
            styles.nodeLabel,
            { textAlign: isCenter ? 'center' : layout === 'left' ? 'left' : 'right', opacity: isCenter ? 1 : (isFuture ? 0.4 : 1) },
            status === 'current' && styles.nodeLabelCurrent,
            isCenter && { fontSize: 36, letterSpacing: 1.5, marginBottom: 4 }
          ]}
        >
          {level.name}
        </Text>
        <Text style={[styles.nodeXp, { textAlign: isCenter ? 'center' : layout === 'left' ? 'left' : 'right', opacity: isCenter ? 1 : (isFuture ? 0.35 : 0.7) }, isCenter && { fontSize: 18 }]}>
          {level.xp.toLocaleString()} XP
        </Text>
        <Text style={[styles.loreText, { textAlign: isCenter ? 'center' : layout === 'left' ? 'left' : 'right', opacity: isCenter ? 1 : (isFuture ? 0.2 : 0.85), marginTop: isCenter ? 4 : 0 }, isCenter && { fontSize: 16, lineHeight: 24 }]}>
          {level.description}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function XPConstellationScreen() {
  const navigation = useNavigation();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const nodePositions = useRef<{[key: number]: number}>({});
  const [currentXP, setCurrentXP] = useState(0);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

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
        // reversed array index: 0 is highest level (Apex), 19 is lowest level (Seeker)
        const reverseIndex = LEVELS.length - 1 - currentLevelIndex;
        
        // Grab the exact Y position of the current level's node
        const targetY = nodePositions.current[reverseIndex];
        
        if (targetY !== undefined) {
          // Subtract a portion of the screen height so the current level is positioned 
          // in the middle/lower-middle of the screen
          const scrollY = Math.max(targetY - (SCREEN_H / 2) + 120, 0); 
          scrollRef.current.scrollTo({ y: scrollY, animated: true });
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [currentLevelIndex]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* SVG Overlay for Galaxy Effect (Vignette + Stars) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={SCREEN_W} height={SCREEN_H}>
          <Defs>
            <RadialGradient id="galaxyVignette" cx="50%" cy="40%" r="70%">
              <Stop offset="0%" stopColor="#000000" stopOpacity={0.2} />
              <Stop offset="60%" stopColor="#000000" stopOpacity={0.85} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={1} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="url(#galaxyVignette)" />
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
        <Text style={styles.headerTitle}>Ascension Path</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <ScrollView
        ref={scrollRef as any}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 120, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        {reversedLevels.map((level, i) => {
          const originalIndex = LEVELS.length - 1 - i;
          const actualStatus = originalIndex < currentLevelIndex ? 'past' : originalIndex === currentLevelIndex ? 'current' : 'future';
          const layout = originalIndex === LEVELS.length - 1 ? 'center' : i % 2 === 0 ? 'left' : 'right';

          return (
            <View 
              key={level.id}
              onLayout={(e) => {
                nodePositions.current[i] = e.nativeEvent.layout.y;
              }}
              style={{ position: 'relative' }}
            >
              {/* Localized Nebula Background */}
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: -1, opacity: originalIndex === LEVELS.length - 1 ? 1 : (actualStatus === 'future' ? 0.3 : (actualStatus === 'past' ? 0.7 : 1)) }]} pointerEvents="none">
                <Svg width={SCREEN_W} height={originalIndex === LEVELS.length - 1 ? 1200 : 600} style={{ position: 'absolute' }}>
                  <Defs>
                    <RadialGradient id={`nebula-${level.id}`} cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor={level.colors[0]} stopOpacity={0.25} />
                      <Stop offset="40%" stopColor={level.colors[0]} stopOpacity={0.12} />
                      <Stop offset="100%" stopColor={level.colors[0]} stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  {originalIndex === LEVELS.length - 1 ? (
                    <Circle cx={SCREEN_W / 2} cy={600} r={600} fill={`url(#nebula-${level.id})`} />
                  ) : (
                    <Circle cx={SCREEN_W / 2} cy={300} r={300} fill={`url(#nebula-${level.id})`} />
                  )}
                </Svg>
              </View>

              <ConstellationNode
                level={level}
                index={i}
                status={actualStatus}
                layout={layout}
                onPress={() => {
                  Haptics.selectionAsync();
                }}
              />
            </View>
          );
        })}
      </ScrollView>

      <Animated.View 
        entering={FadeInDown.delay(200)} 
        style={[
          styles.footer, 
          { 
            borderColor: LEVELS[currentLevelIndex].colors[0],
            shadowColor: LEVELS[currentLevelIndex].colors[0] 
          }
        ]}
      >
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
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 12, 16, 0.95)',
    borderWidth: 1,
    borderRadius: 30,
    paddingHorizontal: 32,
    paddingVertical: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
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
