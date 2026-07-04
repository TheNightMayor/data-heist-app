/**
 * ResultModal — animated dice roll result display.
 *
 * Flow:
 *  1. User clicks "Roll d20" in the pre-roll modal.
 *  2. Caller invokes resolveWithAnimation, which:
 *     a. Generates a random d20 and dispatches the action immediately.
 *     b. Opens THIS modal in "rolling" state (animated d20 spinning).
 *     c. After 800ms, switches to "result" state showing the outcome.
 *  3. User taps Continue to dismiss.
 */

import { useEffect, useState, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { ChamferedFrame } from '../ui/ChamferedFrame';

export interface RollResultInfo {
  d20: number;
  modifier: number;
  baseModifier?: number;
  penalty?: number;
  aidBonus?: number;
  dc: number;
  total: number;
  /** Outcome label, e.g. "Success", "Failure", "Nat 20!" */
  outcomeLabel: string;
  /** Successes gained (for Resolve). */
  successes: number;
  /** Color: green | red | amber | blue */
  kind: 'success' | 'failure' | 'critical' | 'info';
  /** Optional detail like CP damage. */
  detail?: string;
  /** Name of the node being rolled against (frozen at roll time). */
  nodeName?: string;
}

interface Props {
  visible: boolean;
  result: RollResultInfo | null;
  /** While result is null but visible is true, show "rolling..." spinner. */
  rolling: boolean;
  playerName: string;
  nodeName: string;
  onDismiss: () => void;
}

const KIND_STYLES: Record<RollResultInfo['kind'], { bg: string; border: string; icon: string }> = {
  success: { bg: '#064e3b', border: '#34d399', icon: '✓' },
  failure: { bg: '#7f1d1d', border: '#f87171', icon: '✗' },
  critical: { bg: '#78350f', border: '#fbbf24', icon: '⚠' },
  info: { bg: '#1e3a8a', border: '#60a5fa', icon: 'ℹ' },
};

export function ResultModal({ visible, result, rolling, playerName, nodeName, onDismiss }: Props) {
  const [spinningD20, setSpinningD20] = useState(1);
  const [modalSize, setModalSize] = useState({ w: 0, h: 0 });
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Spin animation: cycle random numbers while rolling.
  useEffect(() => {
    if (rolling) {
      const id = setInterval(() => {
        setSpinningD20(Math.floor(Math.random() * 20) + 1);
      }, 60);
      return () => clearInterval(id);
    } else if (result) {
      // When rolling stops, set the final number and trigger the pop animation.
      setSpinningD20(result.d20);
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true })
      ]).start();
    }
  }, [rolling, result, scaleAnim]);

  if (!visible) return null;

  const showResult = !rolling && result;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View 
          style={styles.modal}
          onLayout={(e) => setModalSize({ 
            w: e.nativeEvent.layout.width, 
            h: e.nativeEvent.layout.height 
          })}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {modalSize.h > 0 && (
              <ChamferedFrame 
                width={modalSize.w} 
                height={modalSize.h} 
                chamfer={20} 
                stroke="#22d3ee" 
                fill="#0f172a" 
              />
            )}
          </View>
          <Text style={styles.title}>
            {playerName} rolls at {result?.nodeName ?? nodeName}
          </Text>

          <View style={styles.rollingBox}>
            <Text style={styles.dieLabel}>d20</Text>
            <Animated.Text style={[styles.die, { transform: [{ scale: scaleAnim }] }]}>
              {result?.d20 === 0 && !rolling ? '⭐' : spinningD20}
            </Animated.Text>
            {rolling ? (
              <Text style={styles.rollingText}>Rolling…</Text>
            ) : (
              <Text style={[styles.rollingText, { color: result ? KIND_STYLES[result.kind].border : '#22d3ee' }]}>
                {result?.outcomeLabel || 'Settled'}
              </Text>
            )}
          </View>

          {showResult && result ? (
            <View style={[styles.resultBox, { backgroundColor: KIND_STYLES[result.kind].bg, borderColor: KIND_STYLES[result.kind].border }]}>
              <View style={styles.resultRow}>
                <Text style={[styles.icon, { color: KIND_STYLES[result.kind].border }]}>{KIND_STYLES[result.kind].icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.outcomeLabel}>{result.outcomeLabel}</Text>
                  <Text style={styles.detail}>
                    {result.d20 === 0 && result.kind === 'success' ? (
                      <Text>Automated Success</Text>
                    ) : (
                      <Text>
                        Rolled {result.d20}
                        {result.baseModifier !== undefined ? (
                          <Text>
                            {` +${result.baseModifier} (skill)`}
                            {result.penalty ? ` ${result.penalty} (penalty)` : ''}
                            {result.aidBonus ? ` +${result.aidBonus} (aid)` : ''}
                          </Text>
                        ) : (
                          <Text>{` ${result.modifier >= 0 ? '+' : '-'} ${Math.abs(result.modifier)}`}</Text>
                        )}
                      </Text>
                    )}
                    <Text>{` = `}</Text>
                    <Text style={styles.bold}>{result.total}</Text>
                    {result.dc ? (
                      <Text>
                        {' '}
                        vs DC <Text style={styles.bold}>{result.dc}</Text>
                      </Text>
                    ) : null}
                  </Text>
                  {result.detail ? <Text style={styles.detail}>{result.detail}</Text> : null}
                </View>
              </View>
            </View>
          ) : null}

          {showResult ? (
            <Pressable style={styles.continueBtn} onPress={onDismiss}>
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <ChamferedFrame width={modalSize.w - 48} height={48} chamfer={8} stroke="#22d3ee" fill="#0e7490" />
              </View>
              <Text style={styles.continueBtnText}>Continue</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    padding: 24,
    width: '100%',
    maxWidth: 380,
    gap: 16,
    alignItems: 'center',
  },
  title: { fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  rollingBox: { 
    alignItems: 'center', 
    gap: 12, 
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    width: '100%',
  },
  dieLabel: { fontSize: 12, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 },
  die: {
    fontSize: 96,
    fontWeight: '900',
    color: '#22d3ee',
    textShadowColor: '#0e7490',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    minWidth: 120,
    textAlign: 'center',
  },
  rollingText: { fontSize: 14, color: '#22d3ee', fontWeight: '700' },
  resultBox: {
    width: '100%',
    padding: 16,
    borderWidth: 2,
  },
  resultRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { fontSize: 32, fontWeight: '800' },
  outcomeLabel: { fontSize: 18, color: '#f8fafc', fontWeight: '800' },
  detail: { color: '#cbd5e1', fontSize: 13, marginTop: 4 },
  bold: { fontWeight: '800', color: '#fff' },
  continueBtn: {
    height: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  continueBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, fontFamily: 'Orbitron-Bold' },
});