import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Pressable,
  StatusBar,
  InteractionManager,
  ActivityIndicator,
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

import { getXPState, LEVEL_TITLES, LEVEL_THRESHOLDS, subscribeXPChanges } from '../services/xpSystem';

const LEVEL_COLORS: [string, string][] = [
  ['#34d399', '#10b981'], // 0 Seeker (Emerald Nature)
  ['#06b6d4', '#0284c7'], // 1 Warden (Cyan Hydro Aegis)
  ['#14b8a6', '#0d9488'], // 2 Sentinel (Deep Teal Vanguard)
  ['#3b82f6', '#1d4ed8'], // 3 Guardian (Cobalt Steel Protector)
  ['#a855f7', '#7c3aed'], // 4 Vanguard (Royal Violet Knight)
  ['#f59e0b', '#d97706'], // 5 Luminary (Solar Gold Sage)
  ['#ea580c', '#c2410c'], // 6 Legend (Blazing Magma Flame)
  ['#ec4899', '#db2777'], // 7 Mythic (Mythic Rose Plasma)
  ['#64748b', '#94a3b8'], // 8 Paragon (Silver Metallic Titan)
  ['#dc2626', '#991b1b'], // 9 Titan (Blood Crimson Behemoth)
  ['#10b981', '#047857'], // 10 Ascendant (Jade Transcendent)
  ['#eab308', '#ca8a04'], // 11 Exalted (Radiant Solar Dawn)
  ['#9333ea', '#6b21a8'], // 12 Sovereign (Imperial Purple Monarch)
  ['#2563eb', '#06b6d4'], // 13 Archon (Electric Plasma Archon)
  ['#1e40af', '#60a5fa'], // 14 Celestial (Cosmic Starfield Deep Blue)
  ['#818cf8', '#c084fc'], // 15 Ethereal (Ethereal Lavender Horizon)
  ['#f43f5e', '#fb923c'], // 16 Empyrean (Supernova Coral Flare)
  ['#0d9488', '#2dd4bf'], // 17 Astral (Astral Aurora Borealis)
  ['#475569', '#e2e8f0'], // 18 Zenith (Dark Obsidian Platinum)
  ['#ffd700', '#ff7bf0'], // 19 Apex (Supreme Singularity Rainbow Gold)
];

const TIER_ARCHETYPES = [
  { realm: 'Initiate Realm', element: 'Wind & Discovery', perk: '+5% XP on Daily Quests', title: 'The Seeker of Wisdom' },
  { realm: 'Initiate Realm', element: 'Iron & Discipline', perk: 'Habit Habituation Buffer', title: 'The Iron Warden' },
  { realm: 'Initiate Realm', element: 'Cyan Light', perk: 'Pomodoro Focus +10 XP', title: 'The Vigilant Sentinel' },
  { realm: 'Initiate Realm', element: 'Aegis Shield', perk: 'Zero-Miss Streak Protection', title: 'The Resilient Guardian' },
  { realm: 'Initiate Realm', element: 'Neon Lightning', perk: 'Multi-Task Velocity Bonus', title: 'The Spearhead Vanguard' },
  { realm: 'Luminary Realm', element: 'Solar Flare', perk: '+15% Streak Multiplier & Aura', title: 'The Radiant Luminary' },
  { realm: 'Luminary Realm', element: 'Blazing Fire', perk: '2x XP on Perfect Days', title: 'The Immortal Legend' },
  { realm: 'Luminary Realm', element: 'Astral Violet', perk: 'Constellation HUD Glow Theme', title: 'The Cosmic Mythic' },
  { realm: 'Luminary Realm', element: 'Glacial Platinum', perk: 'Mastery Aura Halo Unlocked', title: 'The Flawless Paragon' },
  { realm: 'Luminary Realm', element: 'Volcanic Core', perk: 'High-Impact Focus Surge', title: 'The Earth-Shaker Titan' },
  { realm: 'Sovereign Realm', element: 'Emerald Ether', perk: 'Instant Recall Accelerator', title: 'The High Ascendant' },
  { realm: 'Sovereign Realm', element: 'Golden Dawn', perk: 'Prestige Streak Emblem', title: 'The Exalted Sovereign' },
  { realm: 'Sovereign Realm', element: 'Imperial Velvet', perk: 'Domain Authority Multiplier', title: 'The True Sovereign' },
  { realm: 'Sovereign Realm', element: 'Arcane Plasma', perk: 'Synapse Speed Overdrive', title: 'The Star Archon' },
  { realm: 'Sovereign Realm', element: 'Deep Cosmos', perk: 'Galactic Horizon Badge', title: 'The Celestial Sentinel' },
  { realm: 'Cosmic Apex', element: 'Pure Spirit', perk: 'Flow-State Transmutation', title: 'The Ethereal Soul' },
  { realm: 'Cosmic Apex', element: 'Supernova', perk: 'Cosmic Flare HUD Glow', title: 'The Empyrean Flare' },
  { realm: 'Cosmic Apex', element: 'Abyssal Void', perk: 'Omnipresent Habit Sync', title: 'The Astral Wanderer' },
  { realm: 'Cosmic Apex', element: 'Obsidian Zenith', perk: 'Zenith Mastery Halo', title: 'The Absolute Zenith' },
  { realm: 'Cosmic Apex', element: 'Supreme Singularity', perk: 'Eternal Zen Omniscience', title: 'The Apex Divinity' },
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
  const [spotlightIndex, setSpotlightIndex] = useState<number | null>(null);

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
    const unsub = subscribeXPChanges(({ xp: newXp }) => {
      setCurrentXP(newXp);
    });
    return unsub;
  }, []);

  const currentLevelIndex = useMemo(() => {
    return LEVELS.findIndex((l) => currentXP >= l.xp && (LEVELS.indexOf(l) === LEVELS.length - 1 || currentXP < LEVELS[LEVELS.indexOf(l) + 1].xp));
  }, [currentXP]);

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  const stars = useStarField(SCREEN_H);
  const reversedLevels = useMemo(() => [...LEVELS].reverse(), []);

  // Auto-scroll to current level on mount
  useEffect(() => {
    const t = setTimeout(() => {
      if (scrollRef.current) {
        const reverseIndex = LEVELS.length - 1 - currentLevelIndex;
        const targetY = nodePositions.current[reverseIndex];
        if (targetY !== undefined) {
          const scrollY = Math.max(targetY - (SCREEN_H / 2) + 120, 0); 
          scrollRef.current.scrollTo({ y: scrollY, animated: true });
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [currentLevelIndex]);

  // Transition Shared Values
  const [navDirection, setNavDirection] = useState<'next' | 'prev'>('next');
  const transX = useSharedValue(0);
  const transScale = useSharedValue(1);
  const transRotate = useSharedValue(0);
  const transOpacity = useSharedValue(1);

  const auraPulseScale = useSharedValue(1);
  const auraPulseOpacity = useSharedValue(0.75);

  const contentY = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  // Mascot Floating Shared Values
  const floatY = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const rotateRays = useSharedValue(0);

  const triggerTransition = useCallback((dir: 'next' | 'prev', newIndex: number) => {
    setNavDirection(dir);
    setSpotlightIndex(newIndex);

    const isApexGod = newIndex >= 15;
    const isSovereign = newIndex >= 10 && newIndex < 15;
    const isLuminary = newIndex >= 5 && newIndex < 10;

    // 1. Initial burst positioning according to Realm
    transX.value = dir === 'next' ? 65 : -65;
    transOpacity.value = 0.15;
    
    if (isApexGod) {
      transScale.value = dir === 'next' ? 1.65 : 0.35;
      transRotate.value = dir === 'next' ? -12 : 12;
    } else if (isSovereign) {
      transScale.value = 0.35;
      transRotate.value = dir === 'next' ? -55 : 55;
    } else if (isLuminary) {
      transScale.value = 1.45;
      transRotate.value = 0;
    } else {
      transScale.value = 0.55;
      transRotate.value = dir === 'next' ? -18 : 18;
    }

    auraPulseScale.value = 1.4;
    auraPulseOpacity.value = 0.9;

    contentY.value = dir === 'next' ? 14 : -14;
    contentOpacity.value = 0.15;

    // 2. Smooth spring physics & crisp easing (100% instant, no delays)
    transX.value = withSpring(0, { damping: 18, stiffness: 240, mass: 0.7 });
    transScale.value = withSpring(1, { damping: 18, stiffness: 220, mass: 0.8 });
    transRotate.value = withSpring(0, { damping: 20, stiffness: 260 });
    transOpacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.ease) });

    auraPulseScale.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    auraPulseOpacity.value = withTiming(0.4, { duration: 350, easing: Easing.out(Easing.quad) });

    contentY.value = withSpring(0, { damping: 20, stiffness: 260 });
    contentOpacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.ease) });
  }, []);

  const openSpotlight = useCallback((index: number) => {
    setNavDirection('next');
    setSpotlightIndex(index);

    transX.value = 0;
    transScale.value = 0.45;
    transRotate.value = -12;
    transOpacity.value = 0.1;

    contentY.value = 18;
    contentOpacity.value = 0.1;

    transScale.value = withSpring(1, { damping: 18, stiffness: 220, mass: 0.8 });
    transRotate.value = withSpring(0, { damping: 20, stiffness: 260 });
    transOpacity.value = withTiming(1, { duration: 180 });

    contentY.value = withSpring(0, { damping: 20, stiffness: 260 });
    contentOpacity.value = withTiming(1, { duration: 180 });
  }, []);

  const handleNext = useCallback(() => {
    if (spotlightIndex !== null && spotlightIndex < LEVELS.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      triggerTransition('next', spotlightIndex + 1);
    }
  }, [spotlightIndex, triggerTransition]);

  const handlePrev = useCallback(() => {
    if (spotlightIndex !== null && spotlightIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      triggerTransition('prev', spotlightIndex - 1);
    }
  }, [spotlightIndex, triggerTransition]);

  useEffect(() => {
    if (spotlightIndex !== null) {
      floatY.value = withRepeat(
        withSequence(
          withTiming(-12, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      );
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      );
      rotateRays.value = withRepeat(
        withTiming(360, { duration: 30000, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [spotlightIndex]);

  const mascotAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: transX.value },
      { translateY: floatY.value },
      { scale: transScale.value },
      { rotate: `${transRotate.value}deg` }
    ],
    opacity: transOpacity.value,
  }));

  const auraAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: transX.value },
      { translateY: floatY.value },
      { scale: pulseScale.value * auraPulseScale.value },
      { rotate: `${transRotate.value * 0.5}deg` }
    ],
    opacity: auraPulseOpacity.value,
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentY.value }],
    opacity: contentOpacity.value,
  }));

  const activeLevel = spotlightIndex !== null ? LEVELS[spotlightIndex] : null;
  const activeArchetype = spotlightIndex !== null ? TIER_ARCHETYPES[spotlightIndex] : null;
  const isApex = spotlightIndex === 19;
  const activeGradient = activeLevel ? activeLevel.colors : ['#34d399', '#10b981'];

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
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" style={{ marginLeft: -1 }} />
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
        {!isReady ? (
          <View style={{ flex: 1, height: SCREEN_H * 0.6, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={LEVELS[currentLevelIndex].colors[0]} />
          </View>
        ) : (
          reversedLevels.map((level, i) => {
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
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    openSpotlight(originalIndex);
                  }}
                />
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Floating Level Status Footer Pill */}
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
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            openSpotlight(currentLevelIndex);
          }}
          style={{ alignItems: 'center' }}
        >
          <Text style={styles.footerLevel}>{LEVELS[currentLevelIndex].name}</Text>
          <Text style={styles.footerXp}>{currentXP.toLocaleString()} XP total · Tap to Inspect</Text>
        </Pressable>
      </Animated.View>

      {/* ── ASCENDED MASCOT SPOTLIGHT CINEMATIC OVERLAY ── */}
      {spotlightIndex !== null && activeLevel && (
        <Animated.View
          entering={FadeIn.duration(260)}
          style={[StyleSheet.absoluteFill, styles.spotlightOverlay]}
        >
          {/* Backdrop Tap to Close */}
          <Pressable 
            style={StyleSheet.absoluteFill} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSpotlightIndex(null);
            }} 
          />

          {/* Deep Cosmic Void & Supernova Glow */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={SCREEN_W} height={SCREEN_H}>
              <Defs>
                <RadialGradient id="spotlightSupernova" cx="50%" cy="48%" r="60%">
                  <Stop offset="0%" stopColor={isApex ? '#ffd700' : activeGradient[0]} stopOpacity={0.45} />
                  <Stop offset="40%" stopColor={isApex ? '#ff7bf0' : activeGradient[1]} stopOpacity={0.22} />
                  <Stop offset="80%" stopColor="#030307" stopOpacity={0.92} />
                  <Stop offset="100%" stopColor="#000000" stopOpacity={0.98} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="url(#spotlightSupernova)" />
              {/* Sacred Orbit Geometry */}
              <Circle
                cx={SCREEN_W / 2}
                cy={SCREEN_H * 0.44}
                r={isApex ? 160 : 130}
                fill="none"
                stroke={isApex ? '#ffd700' : activeGradient[0]}
                strokeWidth={1.5}
                strokeDasharray="6, 6"
                opacity={0.5}
              />
              <Circle
                cx={SCREEN_W / 2}
                cy={SCREEN_H * 0.44}
                r={isApex ? 125 : 100}
                fill="none"
                stroke={isApex ? '#ff7bf0' : activeGradient[1]}
                strokeWidth={1}
                opacity={0.4}
              />
            </Svg>
          </View>

          {/* Top Dismiss Pill */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSpotlightIndex(null);
            }}
            style={styles.spotlightClosePill}
          >
            <Text style={styles.spotlightCloseText}>Tap anywhere to exit</Text>
            <Ionicons name="close" size={15} color="#d1d1d6" />
          </Pressable>

          {/* Previous Mascot Navigator (Hidden on Tier 1) */}
          {spotlightIndex > 0 && (
            <Pressable
              onPress={handlePrev}
              style={[styles.spotlightNavBtn, { left: 16 }]}
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
          )}

          {/* Next Mascot Navigator (Hidden on Tier 20) */}
          {spotlightIndex < LEVELS.length - 1 && (
            <Pressable
              onPress={handleNext}
              style={[styles.spotlightNavBtn, { right: 16 }]}
            >
              <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
            </Pressable>
          )}

          {/* Main Cinematic Content Stack */}
          <View 
            style={styles.spotlightContentContainer} 
            pointerEvents="box-none"
          >
            {/* Header: Realm Badge + Name with Smooth Motion */}
            <Animated.View style={[styles.spotlightHeader, contentAnimatedStyle]}>
              <View style={[
                styles.spotlightRealmBadge,
                {
                  backgroundColor: isApex ? 'rgba(255, 215, 0, 0.2)' : `${activeGradient[0]}22`,
                  borderColor: isApex ? '#ffd70080' : `${activeGradient[0]}60`
                }
              ]}>
                <Text style={[
                  styles.spotlightRealmBadgeText,
                  { color: isApex ? '#ffd700' : activeGradient[0] }
                ]}>
                  ✦ {isApex ? 'SUPREME SINGULARITY · TIER 20' : `TIER ${spotlightIndex + 1} · ${activeArchetype?.realm || 'COSMIC REALM'}`} ✦
                </Text>
              </View>

              <Text style={[
                styles.spotlightHeroTitle,
                { color: '#ffffff', textShadowColor: isApex ? 'rgba(255, 215, 0, 0.8)' : `${activeGradient[0]}80` }
              ]}>
                {activeLevel.name}
              </Text>
              <Text style={[styles.spotlightHeroSubtitle, { color: isApex ? '#ffd700' : activeGradient[0] }]}>
                {activeArchetype?.title || `The Master of ${activeLevel.name}`}
              </Text>
            </Animated.View>

            {/* Centered Large Hero Mascot with Kinetic Spring Engine */}
            <View style={[styles.spotlightMascotContainer, isApex && { width: 310, height: 310 }]}>
              {/* Outer Pulsing Supernova Aura */}
              <Animated.Image
                source={activeLevel.image}
                style={[
                  StyleSheet.absoluteFill,
                  auraAnimatedStyle,
                  {
                    tintColor: isApex ? '#ffd700' : activeGradient[0],
                  }
                ]}
                resizeMode="contain"
              />
              {/* Main Ascended Mascot Avatar */}
              <Animated.Image
                source={activeLevel.image}
                style={[
                  {
                    width: isApex ? 300 : 230,
                    height: isApex ? 300 : 230,
                  },
                  mascotAnimatedStyle
                ]}
                resizeMode="contain"
              />
            </View>

            {/* Glassmorphism Lore & Powers Bento with Kinetic Spring Engine */}
            <Animated.View style={[
              styles.spotlightBentoCard,
              contentAnimatedStyle,
              {
                borderColor: isApex ? 'rgba(255, 215, 0, 0.5)' : `${activeGradient[0]}40`,
                shadowColor: isApex ? '#ffd700' : activeGradient[0]
              }
            ]}>
              <Text style={styles.spotlightLoreText}>
                "{activeLevel.description}"
              </Text>

              <View style={styles.spotlightBadgesRow}>
                <View style={styles.spotlightBadgeItem}>
                  <Text style={styles.spotlightBadgeLabel}>⚡ Element</Text>
                  <Text style={[styles.spotlightBadgeVal, { color: isApex ? '#ffd700' : activeGradient[0] }]}>
                    {activeArchetype?.element || 'Cosmic Aura'}
                  </Text>
                </View>

                <View style={styles.spotlightBadgeDivider} />

                <View style={styles.spotlightBadgeItem}>
                  <Text style={styles.spotlightBadgeLabel}>🛡️ Perk</Text>
                  <Text style={[styles.spotlightBadgeVal, { color: '#5eda9e' }]}>
                    {activeArchetype?.perk || '+10% XP'}
                  </Text>
                </View>

                <View style={styles.spotlightBadgeDivider} />

                <View style={styles.spotlightBadgeItem}>
                  <Text style={styles.spotlightBadgeLabel}>🎯 Required</Text>
                  <Text style={[styles.spotlightBadgeVal, { color: '#ffffff' }]}>
                    {activeLevel.xp.toLocaleString()} XP
                  </Text>
                </View>
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      )}
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

  /* ── Ascended Mascot Spotlight Styles ── */
  spotlightOverlay: {
    zIndex: 100,
    backgroundColor: '#030307',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightClosePill: {
    position: 'absolute',
    top: 52,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    zIndex: 20,
  },
  spotlightCloseText: {
    color: '#d1d1d6',
    fontSize: 12,
    fontWeight: '600',
  },
  spotlightNavBtn: {
    position: 'absolute',
    top: '48%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(20, 20, 26, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 25,
  },
  spotlightContentContainer: {
    width: '100%',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotlightHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  spotlightRealmBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
  },
  spotlightRealmBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  spotlightHeroTitle: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowRadius: 15,
    textShadowOffset: { width: 0, height: 0 },
  },
  spotlightHeroSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  spotlightMascotContainer: {
    width: 250,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  spotlightBentoCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(16, 16, 22, 0.88)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  spotlightLoreText: {
    color: '#f2f2f7',
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 12,
  },
  spotlightBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  spotlightBadgeItem: {
    flex: 1,
    alignItems: 'center',
  },
  spotlightBadgeLabel: {
    color: '#8e8e93',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  spotlightBadgeVal: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  spotlightBadgeDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});

