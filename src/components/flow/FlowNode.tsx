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
import Svg, { Circle, G, Polygon, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { FlowNode as FlowNodeType } from '@/lib/flow/types';
import type { NodeStatus } from '@/lib/flow/reachability';
import { ChamferedFrame } from '../ui/ChamferedFrame';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  node: FlowNodeType;
  mode: 'build' | 'game';
  status?: NodeStatus;
  /** 0..1 — fraction of successes / successesRequired. */
  progress?: number;
  active?: boolean;
  selected?: boolean;
  outcome?: 'success' | 'failure';
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
const CATEGORY_COLORS = {
  module: { fill: '#1e3a8a', border: '#60a5fa', icon: 'M' },
  countermeasure: { fill: '#7f1d1d', border: '#f87171', icon: 'C' },
  access: { fill: '#1e3a8a', border: '#60a5fa', icon: 'A' },
} as const;

export const FlowNodeView = memo(function FlowNodeView({ node, mode, status = 'available', progress = 0, active, selected, outcome, concealed = false, concealedOpacity = 1, countermeasureAttached = false, countermeasureTargeted = false, wiping = false }: Props) {
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

  const animatedHexProps = useAnimatedProps(() => {
    return {
      strokeWidth: isUnlocked ? 2 + pulse.value * 2 : 2,
    };
  });

  const animatedGlowProps = useAnimatedProps(() => {
    return {
      strokeOpacity: isUnlocked ? 0.1 + pulse.value * 0.3 : 0,
      strokeWidth: isUnlocked ? 4 + pulse.value * 8 : 0,
    };
  });
  const animatedTargetProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));
  const wipeStyle = useAnimatedStyle(() => ({ opacity: wipeOpacity.value }));

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
        {!concealed && (
          <View style={[styles.hexContent, concealed ? { opacity: concealedOpacity } : null, styles.noPointerEvents]}>
            <Text style={styles.icon}>{cat.icon}</Text>
            <Text style={styles.label}>{node.name}</Text>
            {node.hazard && <Text style={styles.hazard}>!</Text>}
          </View>
        )}
        {(selected || active) && mode === 'game' && (
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
  hazard: { position: 'absolute', top: 2, right: 4, fontSize: 10, color: '#fbbf24' },
  root: { position: 'absolute', top: 2, left: 4, fontSize: 10, color: '#fbbf24' },
});