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
 * The category (module / countermeasure / gateway) is now communicated by
 * the icon's tint inside the node, so the border alone can signal state.
 */

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G, Polygon } from 'react-native-svg';
import type { FlowNode as FlowNodeType } from '@/lib/flow/types';
import type { NodeStatus } from '@/lib/flow/reachability';

interface Props {
  node: FlowNodeType;
  mode: 'build' | 'game';
  status?: NodeStatus;
  /** 0..1 — fraction of successes / successesRequired. */
  progress?: number;
  active?: boolean;
}

const NODE_SIZE = 100;
const RING_OUTER = 96;       // outer diameter of the ring container
const RING_STROKE = 4;       // base ring thickness
const ARC_STROKE = 6;        // overlay arc is slightly thicker
const RADIUS = (RING_OUTER - RING_STROKE) / 2; // ring centerline
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
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
  unlocked: '#16a34a',         // green-500 (successful hack)
  blocked: '#475569',          // slate-600
  'permanently-failed': '#f87171', // red-400
};

/**
 * Brighter overlay color for the clockwise progress arc. Each is a lighter
 * tint of the base ring color so the sweep reads as "progress within this
 * state" rather than a separate indicator.
 */
const ARC_COLORS: Record<NodeStatus, string> = {
  available: '#a5f3fc',        // cyan-200
  visited: '#fde68a',          // amber-200
  unlocked: '#bbf7d0',         // green-200 (successful hack)
  blocked: '#94a3b8',          // slate-400 (dim, rarely visible)
  'permanently-failed': '#fecaca', // red-200
};

/** Inner-box tint per category. The border is reserved for state. */
const CATEGORY_COLORS = {
  module: { fill: '#1e3a8a', border: '#60a5fa', icon: '📦' },
  countermeasure: { fill: '#7f1d1d', border: '#f87171', icon: '🛡' },
  gateway: { fill: '#374151', border: '#9ca3af', icon: '🔀' },
} as const;

export function FlowNodeView({ node, mode, status = 'available', progress = 0, active }: Props) {
  const cat = CATEGORY_COLORS[node.category];
  const label = node.name.length > 9 ? node.name.slice(0, 8) + '…' : node.name;
  const ringColor = RING_COLORS[status];
  const arcColor = ARC_COLORS[status];

  // For unlocked, the full ring is the unlocked color and no sweep is shown.
  const sweepProgress = status === 'unlocked' ? 1 : Math.max(0, Math.min(1, progress));
  const dashOffset = CIRCUMFERENCE * (1 - sweepProgress);

  const showRing = mode === 'game';

  return (
    <View style={[styles.wrapper, active && styles.wrapperActive]}>
      {showRing && (
        <Svg width={RING_OUTER} height={RING_OUTER} style={StyleSheet.absoluteFill}>
          {/* Glow / fade behind the ring for all statuses. */}
          <Circle
            cx={RING_OUTER / 2}
            cy={RING_OUTER / 2}
            r={RADIUS + 2}
            stroke={ringColor}
            strokeWidth={12}
            strokeOpacity={0.16}
            fill="transparent"
          />
          <Circle
            cx={RING_OUTER / 2}
            cy={RING_OUTER / 2}
            r={RADIUS + 6}
            stroke={ringColor}
            strokeWidth={10}
            strokeOpacity={0.08}
            fill="transparent"
          />
          {/* Base ring */}
          <Circle
            cx={RING_OUTER / 2}
            cy={RING_OUTER / 2}
            r={RADIUS}
            stroke={ringColor}
            strokeWidth={RING_STROKE}
            fill="transparent"
          />
          {/* Clockwise progress arc. Rotated -90° so it starts at 12 o'clock. */}
          {sweepProgress > 0 && (
            <G transform={`rotate(-90 ${RING_OUTER / 2} ${RING_OUTER / 2})`}>
              <Circle
                cx={RING_OUTER / 2}
                cy={RING_OUTER / 2}
                r={RADIUS}
                stroke={arcColor}
                strokeWidth={ARC_STROKE}
                fill="transparent"
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={dashOffset}
              />
            </G>
          )}
        </Svg>
      )}

      <View style={styles.node}>
        <Svg width={NODE_SIZE} height={NODE_SIZE} style={styles.hexagonSvg}>
          <Polygon points={HEX_POINTS} fill="#2F4F4F" stroke={cat.border} strokeWidth={2} />
        </Svg>
        <View style={styles.hexContent} pointerEvents="none">
          <Text style={styles.icon}>{cat.icon}</Text>
          <Text style={styles.label} numberOfLines={2}>{label}</Text>
          {node.hazard && <Text style={styles.hazard}>⚠</Text>}
          {node.isRootAccess && <Text style={styles.root}>★</Text>}
        </View>
        {active && mode === 'game' && <View style={styles.activeRing} />}
      </View>
    </View>
  );
}

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
    textShadowColor: 'rgba(34, 211, 238, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
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
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 14,
  },
  hazard: { position: 'absolute', top: 2, right: 4, fontSize: 10, color: '#fbbf24' },
  root: { position: 'absolute', top: 2, left: 4, fontSize: 10, color: '#fbbf24' },
  activeRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#22d3ee',
  },
});