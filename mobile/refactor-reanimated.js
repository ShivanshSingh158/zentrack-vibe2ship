const fs = require('fs');
const file = 'src/components/SARA/ActionConfirmationCard.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';",
  "import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';\nimport Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from 'react-native-reanimated';"
);

content = content.replace(
  "  const scaleAnim = useRef(new Animated.Value(1)).current;\n  const fadeAnim = useRef(new Animated.Value(1)).current;",
  "  const scaleAnim = useSharedValue(1);\n  const fadeAnim = useSharedValue(1);"
);

content = content.replace(
      // Micro-animation collapsing into a checkmark
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      setConfirmed(true);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 5,
        useNativeDriver: true,
      }).start();
      onConfirm();
    });,
      // Micro-animation collapsing into a checkmark
    scaleAnim.value = withTiming(0.9, { duration: 200 });
    fadeAnim.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setConfirmed)(true);
        scaleAnim.value = withSpring(1, { damping: 5, stiffness: 40 });
        runOnJS(onConfirm)();
      }
    });
);

// We also need to add animated styles to the Animated.View down in the render.
// Look for style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: fadeAnim }]}
content = content.replace(
      <Animated.View style={[
      styles.card, 
      { 
        transform: [{ scale: scaleAnim }],
        opacity: fadeAnim 
      }
    ]}>,
    const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
    opacity: fadeAnim.value,
  }));

  if (confirmed) {
    return (
      <Animated.View style={[styles.confirmedCard, { transform: [{ scale: scaleAnim.value }] }]}>
        <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
        <Text style={[styles.title, { color: colors.accentGreen, marginLeft: SPACE.sm }]}>Action Confirmed</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[
      styles.card, 
      animatedStyle
    ]}>
);

// Clean up the if (confirmed) that already existed in the file
const oldConfirmedBlock =   if (confirmed) {
    return (
      <Animated.View style={[styles.confirmedCard, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name="checkmark-circle" size={24} color={colors.accentGreen} />
        <Text style={[styles.title, { color: colors.accentGreen, marginLeft: SPACE.sm }]}>Action Confirmed</Text>
      </Animated.View>
    );
  };
content = content.replace(oldConfirmedBlock, `);

fs.writeFileSync(file, content, 'utf8');
