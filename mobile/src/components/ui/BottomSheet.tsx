import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  StyleSheet,
  Pressable,
  ViewStyle,
  StyleProp,
  BackHandler,
  Keyboard,
  Dimensions,
  Platform,
  View,
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
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
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
  const isClosingRef = useRef(false);

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
    // GPU-accelerated keyboard lift: shifts the entire sheet upwards on the compositor thread
    // Leaves paddingBottom static to eliminate 60-120fps Yoga layout thrashing and stutter
    const keyboardShift = (!fullHeight && kh > 0)
      ? Math.max(0, kh - safeBottom + keyboardOffset)
      : 0;

    return {
      transform: [{ translateY: translateY.value - keyboardShift }],
      paddingBottom: baseBottomPadding,
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const dismissToBottom = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Keyboard.dismiss();
    backdropOpacity.value = withTiming(0, {
      duration: 180,
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
          isClosingRef.current = false;
        }
      }
    );
  }, [onClose]);

  // Interactive Pan Gesture for drag-to-dismiss
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      // Dismiss keyboard immediately on drag touch so it doesn't linger
      runOnJS(Keyboard.dismiss)();
    })
    .onUpdate((event) => {
      'worklet';
      if (event.translationY > 0) {
        // Dragging down: 1:1 direct tracking
        translateY.value = event.translationY;
        // Interpolate backdrop fade
        const progress = Math.min(1, event.translationY / (SCREEN_HEIGHT * 0.4));
        backdropOpacity.value = Math.max(0.05, 1 - progress * 0.85);
      } else {
        // Dragging up past top: Apple rubber-band resistance (friction factor 0.16)
        translateY.value = event.translationY * 0.16;
      }
    })
    .onEnd((event) => {
      'worklet';
      // Dismiss threshold: either dragged down > 110px or fast flick downward (> 650px/s)
      if (event.translationY > 110 || event.velocityY > 650) {
        if (isClosingRef.current) return;
        isClosingRef.current = true;
        backdropOpacity.value = withTiming(0, { duration: 160 });
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 190, easing: Easing.bezier(0.32, 0, 0.67, 0) },
          (finished) => {
            if (finished) {
              runOnJS(setMounted)(false);
              runOnJS(onClose)();
              isClosingRef.current = false;
            }
          }
        );
      } else {
        // Snap back to zero with critically damped spring
        translateY.value = withSpring(0, {
          damping: 30,
          stiffness: 300,
          mass: 0.65,
        });
        backdropOpacity.value = withTiming(1, { duration: 160 });
      }
    });

  const handleClose = useCallback(() => {
    dismissToBottom();
  }, [dismissToBottom]);

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

  const isOpenedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      if (!isOpenedRef.current) {
        isOpenedRef.current = true;
        isClosingRef.current = false;
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
      }
    } else {
      isOpenedRef.current = false;
      if (mounted && !isClosingRef.current) {
        handleClose();
      }
    }
  }, [visible, mounted, handleClose]);

  const [portalId] = useState(() => `bottom-sheet-${Math.random().toString(36).substring(2, 9)}`);

  if (!mounted) return null;

  return (
    <Portal name={portalId}>
      {/* Frosted Glass Blur Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={isDark ? 30 : 20}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)' },
            ]}
          />
        )}
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
        {/* Interactive Handle with Pan Gesture */}
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleContainer} hitSlop={{ top: 12, bottom: 12, left: 32, right: 32 }}>
            <Animated.View style={styles.handle} />
          </View>
        </GestureDetector>
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
  handleContainer: {
    width: '100%',
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.18)',
    borderRadius: 2,
    alignSelf: 'center',
  },
});
