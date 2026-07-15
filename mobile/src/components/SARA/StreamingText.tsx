/**
 * StreamingText — Reveals text character-by-character to simulate AI token streaming.
 * Shows a blinking `|` cursor while streaming, removes it when isComplete=true.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

interface StreamingTextProps {
  text: string;
  isComplete?: boolean;
  style?: any;
  /** ms per character reveal (default 18) */
  speed?: number;
}

function BlinkingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.Text style={[styles.cursor, { opacity }]}>{'|'}</Animated.Text>
  );
}

export default function StreamingText({
  text,
  isComplete = false,
  style,
  speed = 18,
}: StreamingTextProps) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reset when text changes
    setDisplayed('');
    indexRef.current = 0;

    if (!text) return;

    timerRef.current = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));

      if (indexRef.current >= text.length) {
        clearInterval(timerRef.current!);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed]);

  const isStillStreaming = !isComplete || displayed.length < text.length;

  return (
    <Text style={style}>
      {displayed}
      {isStillStreaming && <BlinkingCursor />}
    </Text>
  );
}

const styles = StyleSheet.create({
  cursor: {
    fontSize: 15,
    fontWeight: '700',
    color: '#a599ff',
  },
});
