/**
 * Toast — non-blocking notification that auto-dismisses after a duration.
 * Used for roll outcomes, mode B declarations, and other transient feedback.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChamferedFrame } from './ChamferedFrame';

export type ToastKind = 'success' | 'failure' | 'info' | 'critical';

export interface ToastProps {
  message: string;
  detail?: string;
  kind?: ToastKind;
  duration?: number; // ms before auto-dismiss
  visible: boolean;
  onHide: () => void;
}

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; icon: string }> = {
  success: { bg: '#064e3b', border: '#34d399', icon: '✓' },
  failure: { bg: '#7f1d1d', border: '#f87171', icon: '✗' },
  info: { bg: '#1e3a8a', border: '#60a5fa', icon: 'ℹ' },
  critical: { bg: '#78350f', border: '#fbbf24', icon: '⚠' },
};

const DEFAULT_DURATION = 4000;

export function Toast({ message, detail, kind = 'info', duration = DEFAULT_DURATION, visible, onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-60)).current;
  const { width: windowWidth } = useWindowDimensions();
  const [toastHeight, setToastHeight] = useState(0);

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -60, duration: 250, useNativeDriver: true }),
      ]).start(() => onHide());
    }, duration);
    return () => clearTimeout(t);
  }, [visible, duration, opacity, translateY, onHide]);

  if (!visible) return null;
  const style = KIND_STYLES[kind];
  const toastWidth = Math.min(windowWidth - 48, 480);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          width: toastWidth,
          left: (windowWidth - toastWidth) / 2,
        },
      ]}
      onLayout={(e) => setToastHeight(e.nativeEvent.layout.height)}
      onStartShouldSetResponder={() => false}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {toastHeight > 0 && (
          <ChamferedFrame width={toastWidth} height={toastHeight} chamfer={12} stroke={style.border} fill={style.bg} />
        )}
      </View>
      <View style={styles.row}>
        <Text style={[styles.icon, { color: style.border }]}>{style.icon}</Text>
        <View style={styles.textCol}>
          <Text style={styles.message}>{message}</Text>
          {detail && <Text style={styles.detail}>{detail}</Text>}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 80,
    padding: 12,
    zIndex: 1000,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 24, fontFamily: 'Orbitron-Black' },
  textCol: { flex: 1 },
  message: { color: '#f8fafc', fontSize: 15, fontFamily: 'Orbitron-Black' },
  detail: { color: '#cbd5e1', fontSize: 12, marginTop: 2, fontFamily: 'Orbitron' },
});