/**
 * FlowNode — visual representation of a single node.
 *
 * Mode-aware:
 *  - Build mode: category-colored fill, no ring overlay.
 *  - Game mode: a circular ring sits behind the node. The ring's base color
 *    reflects the node's state (available / visited / unlocked / blocked /
 *    permanently-failed), and a brighter overlay arc fills clockwise from
 *    12 o'clock as the player accrues successes.
 *
 * The category (module / countermeasure / access) is now communicated by
 * the icon's tint inside the node, so the border alone can signal state.
 */

import { memo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Polygon, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useAnimatedProps as useReanimatedProps,
} from 'react-native-reanimated';
import { ChamferedFrame } from '../ui/ChamferedFrame';
import type { FlowNode, NodeCategory } from '@/lib/flow/types';
import type { NodeStatus } from '@/lib/flow/reachability';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  node: FlowNode;
  mode: 'build' | 'game';
  status?: NodeStatus;
  /** 0..1 — fraction of successes / successesRequired. */
  progress?: number;
  active?: boolean;
  selected?: boolean;
  outcome?: 'success' | 'failure';
  collected?: boolean;
  concealed?: boolean;
  concealedOpacity?: number;
  countermeasureAttached?: boolean;
  countermeasureTargeted?: boolean;
  wiping?: boolean;
}

const NODE_SIZE = 100;
const RING_OUTER = 96;       // outer diameter of the ring container
const HEX_PADDING = 0;
const HEX_WIDTH = NODE_SIZE - HEX_PADDING * 2;
const HEX_SIDE = HEX_WIDTH / 2;
const HEX_HEIGHT = HEX_SIDE * Math.sqrt(3);
const HEX_Y_OFFSET = (NODE_SIZE - HEX_HEIGHT) / 2;
const HEX_POINTS = [
  `${HEX_PADDING + HEX_SIDE * 0.5},${HEX_Y_OFFSET}`,
  `${HEX_PADDING + HEX_SIDE * 1.5},${HEX_Y_OFFSET}`,
  `${HEX_PADDING + HEX_WIDTH},${HEX_Y_OFFSET + HEX_HEIGHT / 2}`,
  `${HEX_PADDING + HEX_SIDE * 1.5},${HEX_Y_OFFSET + HEX_HEIGHT}`,
  `${HEX_PADDING + HEX_SIDE * 0.5},${HEX_Y_OFFSET + HEX_HEIGHT}`,
  `${HEX_PADDING},${HEX_Y_OFFSET + HEX_HEIGHT / 2}`,
].join(' ');

/** Base ring color per NodeStatus. */
const RING_COLORS: Record<NodeStatus, string> = {
  available: '#22d3ee',         // cyan-400
  visited: '#fbbf24',          // amber-400
  unlocked: '#22d3ee',         // light blue
  blocked: '#475569',          // slate-600
  concealed: '#475569',        // slate-600
  'permanently-failed': '#f87171', // red-400
};

/** Inner-box tint per category. The border is reserved for state. */
const CATEGORY_COLORS: Record<NodeCategory, { fill: string; border: string; icon: string }> = {
  module: { fill: '#854d0e', border: '#fbbf24', icon: 'M' },
  countermeasure: { fill: '#7f1d1d', border: '#f87171', icon: 'C' },
  access: { fill: '#1e3a8a', border: '#60a5fa', icon: 'A' },
} as const;

const PORTAL_SPIRAL_PATH = (() => {
  const points: string[] = [];
  const pointCount = 120;
  const turnCount = 2.5;

  for (let index = 0; index <= pointCount; index += 1) {
    const progress = index / pointCount;
    const angle = progress * turnCount * Math.PI * 2;
    const radius = 0.15 + progress * 5.25;
    const x = 14 + Math.cos(angle) * radius;
    const y = 15 + Math.sin(angle) * radius;
    points.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return points.join(' ');
})();

function TreasureChestIcon() {
  return (
    <Svg width={34} height={30} viewBox="0 0 34 30">
      <Path d="M 5 12 Q 5 4 14 3 H 25 Q 29 5 29 12 Z" fill="#b45309" stroke="#fbbf24" strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M 24 12 C 24 7 25 4 26.5 4 C 28 4 29 7 29 9" fill="none" stroke="#d97706" strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M 5 12 H 24 V 25 H 5 Z" fill="#92400e" stroke="#fbbf24" strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M 24 12 L 29 9 V 21 L 24 25 Z" fill="#78350f" stroke="#d97706" strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M 8 12 V 25 M 21 12 V 25" stroke="#fbbf24" strokeWidth={1.2} />
      <Path d="M 5 14 H 24" stroke="#fcd34d" strokeWidth={1.5} />
      <Polygon points="13.5,16 16,16 16.7,18.5 15.5,21 13.5,21 12.8,18.5" fill="#fbbf24" stroke="#fef08a" strokeWidth={1} strokeLinejoin="round" />
    </Svg>
  );
}

function ModuleSparkle({ small = false }: { small?: boolean }) {
  const sparkleMotion = useSharedValue(0);

  useEffect(() => {
    sparkleMotion.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    return () => cancelAnimation(sparkleMotion);
  }, [sparkleMotion]);

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + sparkleMotion.value * 0.65,
    transform: [
      { scale: 0.75 + sparkleMotion.value * 0.35 },
      { rotate: `${sparkleMotion.value * 12 - 6}deg` },
    ],
  }), [sparkleMotion]);

  return (
    <Animated.View style={[styles.moduleSparkle, sparkleStyle]}>
      <Svg width={small ? 14 : 22} height={small ? 14 : 22} viewBox="0 0 22 22">
        <Path
          d="M11 0 L13 8 L22 11 L13 13 L11 22 L9 13 L0 11 L9 8 Z"
          fill="#fef08a"
          stroke="#fbbf24"
          strokeWidth={1}
        />
      </Svg>
    </Animated.View>
  );
}

function ModuleGleam({ collected, clipId }: { collected: boolean; clipId: string }) {
  const gleamMotion = useSharedValue(0);

  useEffect(() => {
    if (collected) {
      cancelAnimation(gleamMotion);
      gleamMotion.value = 0;
      return;
    }

    gleamMotion.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );

    return () => cancelAnimation(gleamMotion);
  }, [collected, gleamMotion]);

  const gleamProps = useReanimatedProps(() => ({
    points: `${gleamMotion.value * 130 - 65},-20 ${gleamMotion.value * 130 - 47},-20 ${gleamMotion.value * 130 + 53},120 ${gleamMotion.value * 130 + 35},120`,
    opacity: 0.55,
  }), [gleamMotion]);

  if (collected) return null;

  return (
    <Animated.View style={styles.moduleGleam} pointerEvents="none">
      <Svg width={NODE_SIZE} height={NODE_SIZE} viewBox={`0 0 ${NODE_SIZE} ${NODE_SIZE}`}>
        <Defs>
          <ClipPath id={clipId}>
            <Polygon points={HEX_POINTS} />
          </ClipPath>
        </Defs>
        <AnimatedPolygon
          points="0,-20 18,-20 118,120 100,120"
          fill="#fef3c7"
          clipPath={`url(#${clipId})`}
          animatedProps={gleamProps}
        />
      </Svg>
    </Animated.View>
  );
}

function BrickWallIcon() {
  const fireMotion = useSharedValue(0);

  useEffect(() => {
    fireMotion.value = withRepeat(
      withTiming(1, { duration: 520, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    return () => cancelAnimation(fireMotion);
  }, [fireMotion]);

  const fireStyle = useAnimatedStyle(() => ({
    opacity: 0.88 + fireMotion.value * 0.12,
    transform: [
      { translateY: fireMotion.value * -1.5 },
      { scaleX: 1 + fireMotion.value * 0.025 },
    ],
  }), [fireMotion]);

  return (
    <View style={styles.trapIcon}>
      <Animated.View style={[styles.fireLayer, fireStyle]}>
        <Svg width={62} height={42} viewBox="0 0 62 42">
          <Path d="M 10 9 C 6 6 11 3 10 -3 C 16 3 17 7 14 11 Z M 25 8 C 21 5 27 2 26 -2 C 32 3 32 7 29 10 Z M 42 9 C 38 5 44 3 43 -3 C 49 3 50 7 47 11 Z" fill="#ef4444" stroke="#7f1d1d" strokeWidth={1} strokeLinejoin="round" />
          <Path d="M 12 9 C 10 7 13 4 13 1 C 16 5 16 8 15 10 Z M 27 8 C 25 6 28 4 28 1 C 31 5 31 8 30 9 Z M 44 9 C 42 7 45 4 45 1 C 48 5 48 8 47 10 Z" fill="#fbbf24" />
          <Path d="M 17 7 C 15 5 19 3 18 -2 C 22 3 22 6 20 8 Z M 34 8 C 32 6 36 3 35 -1 C 39 4 39 7 37 9 Z" fill="#f97316" stroke="#7f1d1d" strokeWidth={0.8} strokeLinejoin="round" />
          <Path d="M 7 10 C 5 8 8 7 8 5 C 11 8 11 9 10 11 Z M 21 10 C 19 8 22 6 22 4 C 25 7 25 9 24 10 Z M 38 10 C 36 8 39 6 39 4 C 42 7 42 9 41 10 Z M 47 10 C 45 8 48 7 48 5 C 51 8 51 9 50 11 Z" fill="#f97316" stroke="#7f1d1d" strokeWidth={0.7} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      <Svg width={62} height={42} viewBox="0 0 62 42" style={styles.wallLayer}>
        <Path d="M 8 8 H 54 V 37 H 8 Z" fill="#991b1b" stroke="#450a0a" strokeWidth={2} />
        <Path d="M 8 15 H 54 M 8 23 H 54 M 8 30 H 54" stroke="#7f1d1d" strokeWidth={1.5} />
        <Path d="M 20 8 V 15 M 43 8 V 15 M 14 15 V 23 M 32 15 V 23 M 50 15 V 23 M 20 23 V 30 M 43 23 V 30 M 14 30 V 37 M 32 30 V 37 M 50 30 V 37" stroke="#7f1d1d" strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

function AccessGatewayIcon() {
  const spiralRotation = useSharedValue(0);

  useEffect(() => {
    spiralRotation.value = withRepeat(
      withTiming(360, { duration: 1800, easing: Easing.linear }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(spiralRotation);
    };
  }, [spiralRotation]);

  const spiralStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 2 },
      { rotate: `${spiralRotation.value}deg` },
    ],
  }), [spiralRotation]);

  return (
    <View style={styles.gatewayIcon}>
      <View style={styles.gatewayArch}>
        <Svg width={36.4} height={39} viewBox="0 0 28 30">
          <Path
            d="M 3 26 V 10 C 3 5 7.9 2 14 2 C 20.1 2 25 5 25 10 V 26 H 20 V 11 C 20 8 17.5 6 14 6 C 10.5 6 8 8 8 11 V 26 Z"
            fill="#22d3ee"
            stroke="#1e3a8a"
            strokeWidth={2.5}
            fillRule="evenodd"
          />
        </Svg>
      </View>
      <Animated.View style={[styles.gatewaySpiral, spiralStyle]}>
        <Svg width={36.4} height={39} viewBox="0 0 28 30">
          <Path
            d={PORTAL_SPIRAL_PATH}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={0.65}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>
      <Svg width={36.4} height={39} viewBox="0 0 28 30" style={styles.gatewayLeftArrow}>
        <Path
          d="M 1 19 H 10"
          fill="none"
          stroke="#1e3a8a"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Path
          d="M 1 19 H 10"
          fill="none"
          stroke="#22d3ee"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </Svg>
      <Svg width={41.6} height={39} viewBox="0 0 32 30" style={styles.gatewayArrow}>
        <Path
          d="M 18 19 H 27 M 24 15.5 L 30 19 L 24 22.5"
          fill="none"
          stroke="#1e3a8a"
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M 18 19 H 27 M 24 15.5 L 30 19 L 24 22.5"
          fill="none"
          stroke="#22d3ee"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export const FlowNodeView = memo(function FlowNodeView({ node, mode, status = 'available', progress = 0, active, selected, outcome, collected = false, concealed = false, concealedOpacity = 1, countermeasureAttached = false, countermeasureTargeted = false, wiping = false }: Props) {
  const cat = CATEGORY_COLORS[node.category];

  const isUnlocked = status === 'unlocked';
  const outcomeFill = concealed
    ? '#1e293b'
    : outcome === 'success' ? '#166534' : outcome === 'failure' ? '#991b1b' : cat.fill;
  const outcomeStroke = outcome === 'success' ? '#34d399' : outcome === 'failure' ? '#f87171' : null;
  const hexStrokeColor = countermeasureTargeted
    ? '#22d3ee'
    : concealed
      ? '#475569'
      : outcomeStroke ?? (countermeasureAttached ? '#22d3ee' : (isUnlocked ? '#22d3ee' : RING_COLORS[status]));

  const pulse = useSharedValue(0);
  const dashOffset = useSharedValue(0);
  const wipeOpacity = useSharedValue(1);
  useEffect(() => {
    if (isUnlocked) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else {
      pulse.value = 0;
    }
  }, [isUnlocked, pulse]);

  useEffect(() => {
    cancelAnimation(dashOffset);
    dashOffset.value = countermeasureTargeted
      ? withRepeat(withTiming(300, { duration: 24000, easing: Easing.linear }), -1, false)
      : 0;
  }, [countermeasureTargeted, dashOffset]);

  useEffect(() => {
    wipeOpacity.value = withTiming(wiping ? 0 : 1, { duration: 900 });
  }, [wipeOpacity, wiping]);

  const animatedHexProps = useReanimatedProps(() => {
    return {
      strokeWidth: isUnlocked ? 2 + pulse.value * 2 : 2,
    };
  }, [isUnlocked]);

  const animatedGlowProps = useReanimatedProps(() => {
    return {
      strokeOpacity: isUnlocked ? 0.1 + pulse.value * 0.3 : 0,
      strokeWidth: isUnlocked ? 4 + pulse.value * 8 : 0,
    };
  }, [isUnlocked]);
  const animatedTargetProps = useReanimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }), [dashOffset]);
  const wipeStyle = useAnimatedStyle(() => ({ opacity: wipeOpacity.value }), [wipeOpacity]);

  return (
    <Animated.View style={[styles.wrapper, active && styles.wrapperActive, wipeStyle]}>
      <View style={styles.node}>
        <Svg width={NODE_SIZE} height={NODE_SIZE} style={styles.hexagonSvg}>
          <AnimatedPolygon
            points={HEX_POINTS}
            fill="transparent"
            stroke="#22d3ee"
            animatedProps={animatedGlowProps}
          />
          <AnimatedPolygon
            points={HEX_POINTS}
            fill={outcomeFill}
            fillOpacity={concealed ? 0.8 * concealedOpacity : 0.8}
            stroke="#475569"
            strokeOpacity={concealed ? 0.8 : 1}
            animatedProps={animatedHexProps}
          />
          <AnimatedPolygon
            points={HEX_POINTS}
            fill="transparent"
            stroke={hexStrokeColor}
            strokeOpacity={countermeasureTargeted ? 1 : 0}
            strokeWidth={3}
            strokeDasharray={countermeasureTargeted ? '10 20' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            animatedProps={animatedTargetProps}
          />
          <AnimatedPolygon
            points={HEX_POINTS}
            fill="transparent"
            stroke={hexStrokeColor}
            strokeOpacity={countermeasureTargeted ? 0 : (concealed ? 0.8 : 1)}
            animatedProps={animatedHexProps}
          />
        </Svg>
        {node.category === 'module' && !concealed && (
          <ModuleGleam collected={collected} clipId={`module-gleam-${node.id}`} />
        )}
        {!concealed && (
          <View style={[styles.hexContent, concealed ? { opacity: concealedOpacity } : null, styles.noPointerEvents]}>
            {node.category === 'access' ? <AccessGatewayIcon /> : node.category === 'module' ? (
              <View style={styles.moduleIcon}>
                <TreasureChestIcon />
                {!collected && (
                  <>
                    <ModuleSparkle />
                    <View style={styles.moduleSparkleSmall}>
                      <ModuleSparkle small />
                    </View>
                  </>
                )}
              </View>
            ) : node.category === 'countermeasure' ? <BrickWallIcon /> : <Text style={styles.icon}>{cat.icon}</Text>}
            <Text style={styles.label}>{node.name}</Text>
          </View>
        )}
        {(selected || active) && mode === 'game' && !collected && (
          <View style={{ position: 'absolute', top: -4, left: -4 }}>
            <ChamferedFrame width={108} height={108} openCenter={true} />
          </View>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: RING_OUTER,
    height: RING_OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapperActive: {
    // No layout shift when active; the active marker is positioned
    // absolutely above the node instead.
  },
  focusMarker: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    zIndex: 1,
  },
  noPointerEvents: { pointerEvents: 'none' },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: 0,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  hexagonSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'visible',
  },
  hexContent: {
    position: 'absolute',
    width: NODE_SIZE,
    height: NODE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  gatewayIcon: {
    width: 36.4,
    height: 39,
    position: 'relative',
  },
  trapIcon: {
    width: 62,
    height: 42,
    position: 'relative',
  },
  moduleIcon: {
    width: 46,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  moduleSparkle: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
  },
  moduleSparkleSmall: {
    position: 'absolute',
    top: 24,
    left: -10,
    width: 14,
    height: 14,
  },
  moduleGleam: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: NODE_SIZE,
    height: NODE_SIZE,
    zIndex: 1,
  },
  fireLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 62,
    height: 42,
    zIndex: 0,
  },
  wallLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  gatewayArch: {
    position: 'absolute',
    left: -6,
    zIndex: 2,
    width: 36.4,
    height: 39,
  },
  gatewayArrow: {
    position: 'absolute',
    top: -2,
    left: 4,
    width: 41.6,
    height: 39,
  },
  gatewayLeftArrow: {
    position: 'absolute',
    top: -2,
    left: -4,
    zIndex: 3,
    width: 36.4,
    height: 39,
  },
  gatewaySpiral: {
    position: 'absolute',
    top: 0,
    left: -6,
    zIndex: 1,
    width: 36.4,
    height: 39,
  },
  icon: { fontSize: 18 },
  label: {
    fontSize: 11,
    color: '#f8fafc',
    fontFamily: 'Orbitron-Bold',
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 14,
    minWidth: 140, // Expand past the edges of the hexagon
  },
  collectedOverlay: {
    position: 'absolute',
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(6, 78, 59, 0.92)',
    borderWidth: 2,
    borderColor: '#34d399',
    zIndex: 2,
  },
  collectedText: {
    color: '#d1fae5',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    fontFamily: 'Orbitron-Black',
    textAlign: 'center',
  },
  root: { position: 'absolute', top: 2, left: 4, fontSize: 10, color: '#fbbf24' },
});