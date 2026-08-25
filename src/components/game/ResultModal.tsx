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
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
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
  hackingMode?: 'basic' | 'dynamic';
  preRoll?: {
    title: string;
    subtitle: string;
    subskill: string;
    dc: number;
    modifier: number;
    aidBonus?: number;
    canSpendRP: boolean;
    onRoll: (spendRP: boolean) => void;
    onCancel: () => void;
  };
  onDismiss: () => void;
}

const KIND_STYLES: Record<RollResultInfo['kind'], { bg: string; border: string; icon: string }> = {
  success: { bg: '#064e3b', border: '#34d399', icon: '+' },
  failure: { bg: '#7f1d1d', border: '#f87171', icon: '-' },
  critical: { bg: '#7f1d1d', border: '#f87171', icon: '!' },
  info: { bg: '#1e3a8a', border: '#60a5fa', icon: 'i' },
};

function ThreeIcosahedron({ rolling, bounce }: { rolling: boolean; bounce: Animated.Value }) {
  const mounted = useRef(true);
  const rollingRef = useRef(rolling);

  useEffect(() => {
    rollingRef.current = rolling;
  }, [rolling]);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const handleContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const renderer = new THREE.WebGLRenderer({
      context: gl as unknown as WebGLRenderingContext,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(gl.drawingBufferWidth / 180);
    renderer.setSize(180, 200, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 180 / 200, 0.1, 100);
    camera.position.z = 3.4;

    const geometry = new THREE.IcosahedronGeometry(1.05, 0);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.72,
    });
    const wireframe = new THREE.LineSegments(edges, material);
    scene.add(wireframe);

    let frameId = 0;
    const render = (time: number) => {
      if (!mounted.current) {
        cancelAnimationFrame(frameId);
        geometry.dispose();
        edges.dispose();
        material.dispose();
        renderer.dispose();
        return;
      }

      if (rollingRef.current) {
          wireframe.rotation.x = time * 0.0021;
          wireframe.rotation.y = time * 0.0033;
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
  };

  return (
    <Animated.View style={[styles.icosahedron, { transform: [{ scale: bounce }] }, styles.noPointerEvents]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={handleContextCreate} />
    </Animated.View>
  );
}

const dieTextShadowStyle = { textShadow: '0px 0px 20px #0e7490' } as any;

export function ResultModal({ visible, result, rolling, playerName, nodeName, hackingMode = 'dynamic', preRoll, onDismiss }: Props) {
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
        Animated.timing(scaleAnim, { toValue: 1.3, duration: 150, useNativeDriver: false }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: false })
      ]).start();
    }
  }, [rolling, result, scaleAnim]);

  if (!visible) return null;

  const showResult = !rolling && result;
  const showPreRoll = !!preRoll && !rolling && !result;

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
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
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
            {showPreRoll
              ? preRoll.title
              : hackingMode === 'basic'
              ? `Computers check to hack ${result?.nodeName ?? nodeName}`
              : `${playerName} rolls at ${result?.nodeName ?? nodeName}`}
          </Text>

          <View style={styles.rollingBox}>
            <ThreeIcosahedron rolling={rolling} bounce={scaleAnim} />
            <Animated.Text style={[styles.die, dieTextShadowStyle, { transform: [{ scale: scaleAnim }] }]}> 
              {result?.d20 === 0 && !rolling ? 'AUTO' : spinningD20}
            </Animated.Text>
          </View>

          {showPreRoll && preRoll ? (
            <View style={styles.preRollContent}>
              <Text style={styles.preRollSubtitle}>{preRoll.subtitle}</Text>
              <View style={styles.preRollMeta}>
                {hackingMode === 'dynamic' ? <Text style={styles.preRollSkill}>{preRoll.subskill}</Text> : null}
                <Text style={styles.preRollDc}>DC {preRoll.dc}</Text>
              </View>
              <Text style={styles.preRollModifier}>Computers Modifier: +{preRoll.modifier}</Text>
              {preRoll.aidBonus ? <Text style={styles.preRollAid}>Aid +{preRoll.aidBonus}</Text> : null}
              <Pressable style={styles.preRollButton} onPress={() => preRoll.onRoll(false)}>
                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                  <ChamferedFrame width={272} height={48} chamfer={8} stroke="#22d3ee" fill="#0e7490" />
                </View>
                <Text style={styles.preRollButtonText}>Roll d20</Text>
              </Pressable>
              {hackingMode === 'dynamic' ? (
                <Pressable style={[styles.preRollButton, !preRoll.canSpendRP ? styles.preRollDisabled : null]} onPress={() => preRoll.onRoll(true)} disabled={!preRoll.canSpendRP}>
                  <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                    <ChamferedFrame width={272} height={48} chamfer={8} stroke="#a855f7" fill="#1e293b" />
                  </View>
                  <Text style={styles.preRollButtonText}>Spend RP (auto-success)</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.preRollButton, styles.preRollCancel]} onPress={preRoll.onCancel}>
                <Text style={styles.preRollButtonText}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

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
                            {` +${result.baseModifier}${hackingMode === 'dynamic' ? ' (skill)' : ''}`}
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
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
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
  noPointerEvents: { pointerEvents: 'none' },
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
    height: 520,
    gap: 16,
    alignItems: 'center',
  },
  title: { fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  preRollContent: { alignItems: 'center', gap: 10, width: '100%' },
  preRollSubtitle: { fontSize: 14, color: '#cbd5e1', fontFamily: 'Orbitron-Bold', textTransform: 'uppercase' },
  preRollMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preRollSkill: { color: '#94a3b8', fontSize: 10, fontFamily: 'Orbitron-Bold', textTransform: 'uppercase', borderWidth: 1, borderColor: '#334155', paddingHorizontal: 8, paddingVertical: 3 },
  preRollDc: { color: '#fff', fontSize: 14, fontFamily: 'Orbitron-Bold' },
  preRollModifier: { color: '#64748b', fontSize: 11 },
  preRollAid: { color: '#22d3ee', fontSize: 11, fontFamily: 'Orbitron-Bold' },
  preRollButton: { width: 272, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  preRollButtonText: { color: '#fff', fontSize: 13, fontFamily: 'Orbitron-Bold', textTransform: 'uppercase' },
  preRollDisabled: { opacity: 0.4 },
  preRollCancel: { borderWidth: 1, borderColor: '#475569' },
  rollingBox: { 
    alignItems: 'center', 
    gap: 12, 
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    width: '100%',
    position: 'relative',
  },
  icosahedron: {
    position: 'absolute',
    width: 180,
    height: 200,
    top: '50%',
    left: '50%',
    marginLeft: -90,
    marginTop: -100,
    opacity: 0.42,
  },
  die: {
    fontSize: 96,
    fontWeight: '900',
    color: '#22d3ee',
    minWidth: 120,
    textAlign: 'center',
    zIndex: 2,
  },
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