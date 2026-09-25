import React, { useEffect, useCallback, useState } from 'react';
import {
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
  BackHandler,
  Keyboard,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  useAnimatedKeyboard,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Portal } from '../../contexts/PortalContext';
import { useTheme } from "../../contexts/ThemeContext";

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  fullHeight?: boolean;
  avoidKeyboard?: boolean;
  keyboardOffset?: number;
}

export default function BottomSheet({
  visible,
  onClose,
  children,
  contentStyle,
  fullHeight = false,
  avoidKeyboard = true,
  keyboardOffset = 0,
}: BottomSheetProps) {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  const safeBottom = Math.max(insets.bottom, 16);
  const baseBottomPadding = fullHeight ? 0 : safeBottom;

  const keyboard = useAnimatedKeyboard();

  const sheetStyle = useAnimatedStyle(() => {
    if (!avoidKeyboard) {
      return {
        transform: [{ translateY: translateY.value }],
        paddingBottom: baseBottomPadding,
      };
    }

    const kh = Math.max(0, keyboard.height.value);
    const dynamicBottom = kh > 0
      ? kh + keyboardOffset + (fullHeight ? 0 : 8)
      : baseBottomPadding;

    return {
      transform: [{ translateY: translateY.value }],
      paddingBottom: dynamicBottom,
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    backdropOpacity.value = withTiming(0, {
      duration: 200,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      {
        duration: 210,
        easing: Easing.bezier(0.32, 0, 0.67, 0),
      },
      (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
          runOnJS(onClose)();
        }
      }
    );
  }, [onClose]);

  // Android hardware back button handler
  useEffect(() => {
    if (!visible) return;
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [visible, handleClose]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Apple iOS Critically Damped Spring: fluid glide, zero rubber-band bounce
      translateY.value = SCREEN_HEIGHT;
      translateY.value = withSpring(0, {
        damping: 32,
        stiffness: 280,
        mass: 0.85,
      });
      backdropOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
    } else if (mounted) {
      handleClose();
    }
  }, [visible]);

  const [portalId] = useState(() => `bottom-sheet-${Math.random().toString(36).substring(2, 9)}`);

  if (!mounted) return null;

  return (
    <Portal name={portalId}>
      {/* Frosted Glass Blur Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <BlurView
          intensity={isDark ? 30 : 20}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={handleClose}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          fullHeight ? styles.fullHeight : styles.wrapContent,
          contentStyle,
          sheetStyle,
        ]}
      >
        <Pressable onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}>
          <Animated.View style={styles.handle} />
        </Pressable>
        {children}
      </Animated.View>
    </Portal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  backdrop: {
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.25)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingTop: 14,
    elevation: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: isDark ? 0.65 : 0.15,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
    borderBottomWidth: 0,
  },
  fullHeight: {
    height: '92%',
  },
  wrapContent: {
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.18)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
});
