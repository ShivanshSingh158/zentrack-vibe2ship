import React, { useEffect } from 'react';
import { StyleSheet, Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  useAnimatedKeyboard,
  Easing,
} from 'react-native-reanimated';
import { Portal } from '../../contexts/PortalContext';
import { useTheme } from "../../contexts/ThemeContext";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  fullHeight?: boolean;
}

export default function BottomSheet({
  visible,
  onClose,
  children,
  contentStyle,
  fullHeight = false,
}: BottomSheetProps) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  // GG All hooks must be called unconditionally G NO early returns before this line GG
  const [mounted, setMounted] = React.useState(visible);
  const translateY = useSharedValue(1000);
  const backdropOpacity = useSharedValue(0);

  // GG These MUST stay here, before any conditional return GG
  const keyboard = useAnimatedKeyboard();

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    paddingBottom: keyboard.height.value + (fullHeight ? 0 : 40),
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Fast, smooth spring for opening (instant but natural feel)
      translateY.value = withSpring(0, { damping: 22, stiffness: 350, mass: 0.5 });
      backdropOpacity.value = withTiming(1, { duration: 120 });
    } else if (mounted) {
      // Very fast close
      translateY.value = withTiming(1000, { duration: 100, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 100 }, (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
        }
      });
    }
  }, [visible]);

  // Use Modal's built-in visible gate instead of an early return
  // This keeps the hook call order stable across renders
  // We generate a unique portal name using a simple random ID if not provided,
  // but since Portal handles keys, we just use a stable internal id for this instance.
  const [portalId] = React.useState(() => `bottom-sheet-${Math.random().toString(36).substr(2, 9)}`);

  if (!mounted) return null;

  return (
    <Portal name={portalId}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          fullHeight ? styles.fullHeight : styles.wrapContent,
          sheetStyle,
          contentStyle,
        ]}
      >
        <Animated.View style={styles.handle} />
        {children}
      </Animated.View>
    </Portal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      backdrop: {
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
      },
      sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#000000',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        borderWidth: 1,
        borderColor: '#27272A',
      },
      fullHeight: {
        height: '90%',
      },
      wrapContent: {
        maxHeight: '90%',
      },
      handle: {
        width: 40,
        height: 4,
        backgroundColor: colors.border,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
      },
    });
