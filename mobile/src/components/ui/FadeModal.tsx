import React, { useEffect } from 'react';
import { Modal, StyleSheet, Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from "../../contexts/ThemeContext";

interface FadeModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  dismissible?: boolean;
}

export default function FadeModal({
  visible,
  onClose,
  children,
  contentStyle,
  dismissible = true,
}: FadeModalProps) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [mounted, setMounted] = React.useState(visible);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.value = withTiming(1, { duration: 150 });
    } else if (mounted) {
      opacity.value = withTiming(0, { duration: 120 }, (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
        }
      });
    }
  }, [visible]);

  if (!mounted) return null;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, animatedStyle]}>
        {dismissible && <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />}
        <Animated.View style={[styles.container, contentStyle]}>
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      backdrop: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
      },
      container: {
        backgroundColor: colors.background,
        borderRadius: 20,
        padding: 24,
        width: '85%',
        maxWidth: 400,
        elevation: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
    });
