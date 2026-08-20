import React, { useEffect, useCallback, useState } from 'react';
import { StyleSheet, Pressable, ViewStyle, StyleProp, BackHandler, Keyboard } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
  const styles = makeStyles(colors, isDark);

  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(600);
  const backdropOpacity = useSharedValue(0);

  const keyboard = useAnimatedKeyboard();

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    paddingBottom: keyboard.height.value + (fullHeight ? 0 : 32),
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    translateY.value = withTiming(600, { duration: 140, easing: Easing.in(Easing.quad) });
    backdropOpacity.value = withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) {
        runOnJS(setMounted)(false);
        runOnJS(onClose)();
      }
    });
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
      // Instant, smooth fluid entrance with ZERO bounce
      translateY.value = 600;
      translateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      handleClose();
    }
  }, [visible]);

  const [portalId] = useState(() => `bottom-sheet-${Math.random().toString(36).substring(2, 9)}`);

  if (!mounted) return null;

  return (
    <Portal name={portalId}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          fullHeight ? styles.fullHeight : styles.wrapContent,
          sheetStyle,
          contentStyle,
        ]}
      >
        <Pressable onPress={handleClose} hitSlop={{ top: 10, bottom: 10 }}>
          <Animated.View style={styles.handle} />
        </Pressable>
        {children}
      </Animated.View>
    </Portal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  backdrop: {
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    elevation: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: isDark ? 0.7 : 0.15,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? '#1c1c20' : colors.border,
    borderBottomWidth: 0,
  },
  fullHeight: {
    height: '90%',
  },
  wrapContent: {
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
});
