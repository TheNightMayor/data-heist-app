/**
 * Toast — non-blocking notification that auto-dismisses after a duration.
 * Used for roll outcomes, mode B declarations, and other transient feedback.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

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

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: style.bg,
          borderColor: style.border,
        },
      ]}
      onStartShouldSetResponder={() => false}
    >
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
    left: 24,
    right: 24,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 24, fontWeight: '800' },
  textCol: { flex: 1 },
  message: { color: '#f8fafc', fontSize: 15, fontWeight: '800' },
  detail: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
});