/**
 * FlowCanvas — pan/zoom container with grid background, shared between Build and Game modes.
 * Uses react-native-svg to render nodes/edges; gestures via react-native-gesture-handler.
 *
 * Layout model: nodes are positioned by their topological level (BFS from the start
 * node). Start node sits at the bottom; deeper levels move upward and spread across
 * a row. Edges are drawn between nodes using these computed positions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, View, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect, Line, Circle, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { FlowMap, FlowNode, FlowEdge } from '@/lib/flow/types';
import type { NodeStatus } from '@/lib/flow/reachability';
import { GRID_SIZE } from '@/lib/flow/layout';

interface Props {
  map: FlowMap;
  renderNode: (
    node: FlowNode,
    info: { status: NodeStatus; progress: number; active: boolean },
  ) => React.ReactNode;
  reachableIds?: Set<string>;
  selectedId?: string | null;
  /**
   * The id of the node that is currently the "party's focus" — e.g. a Lead's
   * pending roll target, or a Support's Aid target. Rendered with the
   * `active` flag in `FlowNodeView` (cyan glow).
   */
  activeId?: string | null;
  /** Per-node visual status. Used for opacity / hit-area gating. */
  statusById?: Record<string, NodeStatus>;
  onSelectNode?: (node: FlowNode) => void;
  mode: 'build' | 'game';
}

const CANVAS_WIDTH = 3200;
const CANVAS_HEIGHT = 2800;
const ROW_HEIGHT = 220;
const NODE_WIDTH = 100;
const ROW_PADDING = 80;
// Gap between sibling nodes within a row (tighter than before).
const NODE_GAP = 140;

/**
 * Build a circuit-board-style polyline with rounded 90° corners.
 * Starts at (sx, sy), ends at (tx, ty), going vertically first then
 * horizontally (or horizontally then vertically for the closer axis first).
 * Each corner is filleted with a small radius `r` using quadratic curves.
 *
 * The path always begins moving in the direction that gets us closer to
 * the target on the dominant axis — but to evoke circuit boards we prefer
 * a "down-then-side" or "side-then-down" trace:
 *
 *   if source.y < target.y (source above target): go down first, then side.
 *   if source.y > target.y (source below target): go side first, then down.
 *
 * Since this layout has edges going UPWARD (target above source), we always
 * go up first then sideways.
 */
function circuitPath(sx: number, sy: number, tx: number, ty: number, r = 14): string {
  // Determine trace: vertical first, then horizontal. Both endpoints are
  // expected to differ in y (target is above source).
  const goingUp = ty < sy;
  const upY = goingUp ? ty + r : ty - r;
  const sideX = sx === tx ? sx : (tx > sx ? tx - r : tx + r);
  const midY = sy === ty ? sy : (goingUp ? sy - r : sy + r);
  const startY = goingUp ? sy - r : sy + r;

  if (sx === tx) {
    // Straight vertical line — single segment.
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }

  // Vertical leg from source bottom to midY, then horizontal to sideX,
  // then vertical from midY to target top. Fillets at each corner.
  return [
    `M ${sx} ${sy}`,
    `L ${sx} ${startY}`,
    `Q ${sx} ${midY} ${sx === tx ? sx : sideX < sx ? sx - r : sx + r} ${midY}`,
    `L ${sideX} ${upY}`,
    `Q ${tx} ${upY} ${tx} ${ty}`,
  ].join(' ');
}
function computeLayout(map: FlowMap): { positions: Map<string, { x: number; y: number }>; startId: string | null; levelCount: number } {
  const positions = new Map<string, { x: number; y: number }>();
  if (map.nodes.length === 0) return { positions, startId: null, levelCount: 0 };

  // Find start node: prefer gateway category, leftmost in the original map
  const gateways = map.nodes.filter((n) => n.category === 'gateway');
  const start = gateways.length > 0
    ? gateways.reduce((a, b) => (a.x < b.x ? a : b))
    : map.nodes.reduce((a, b) => (a.x < b.x ? a : b));
  const startId = start.id;

  // Build adjacency for BFS
  const outById = new Map<string, string[]>();
  for (const n of map.nodes) outById.set(n.id, []);
  for (const e of map.edges) {
    const arr = outById.get(e.fromNodeId);
    if (arr) arr.push(e.toNodeId);
  }

  const levelById = new Map<string, number>();
  const order: string[] = [];
  const queue: string[] = [startId];
  levelById.set(startId, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const outs = outById.get(id) ?? [];
    for (const t of outs) {
      if (!levelById.has(t)) {
        levelById.set(t, (levelById.get(id) ?? 0) + 1);
        queue.push(t);
      }
    }
  }
  // Disconnected nodes: place at the top row
  let maxLevel = 0;
  for (const n of map.nodes) {
    if (!levelById.has(n.id)) {
      maxLevel += 1;
      levelById.set(n.id, maxLevel);
      order.push(n.id);
    } else {
      maxLevel = Math.max(maxLevel, levelById.get(n.id) ?? 0);
    }
  }

  // Group nodes by level
  const byLevel = new Map<number, string[]>();
  for (const id of order) {
    const lvl = levelById.get(id) ?? 0;
    const arr = byLevel.get(lvl) ?? [];
    arr.push(id);
    byLevel.set(lvl, arr);
  }
  // Sort each level alphabetically for stable rendering
  for (const [, ids] of byLevel) ids.sort();

  // Position rows centered vertically on the canvas midpoint so the layout
  // sits in the middle of the grid rather than glued to the bottom.
  // Level 0 (start) is at the bottom of the layout; deeper levels go up.
  const cx = CANVAS_WIDTH / 2;
  const layoutLevels = maxLevel + 1;
  const layoutHeight = (layoutLevels - 1) * ROW_HEIGHT + NODE_WIDTH;
  const layoutTop = (CANVAS_HEIGHT - layoutHeight) / 2;
  const layoutBottom = layoutTop + layoutHeight;
  for (const [lvl, ids] of byLevel) {
    // bottom row at level 0; levels above move up by ROW_HEIGHT
    const rowY = layoutBottom - NODE_WIDTH - lvl * ROW_HEIGHT;
    const total = ids.length;
    const stride = NODE_WIDTH + NODE_GAP;
    ids.forEach((id, i) => {
      const offset = (i - (total - 1) / 2) * stride;
      positions.set(id, { x: cx + offset, y: rowY });
    });
  }

  return { positions, startId, levelCount: maxLevel + 1 };
}

/**
 * MonitorGlow — soft true radial gradients at the top and bottom of the
 * monitor. Brightest at the rim, fading to transparent toward the center.
 * Renders as an absolutely positioned SVG overlay that doesn't intercept
 * gestures.
 */
function MonitorGlow({ width, height }: { width: number; height: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5,
      }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Top glow: brightest at the very top edge, fading to transparent toward the middle. */}
          <RadialGradient id="topGlow" cx="0.5" cy="0" r="0.55" fx="0.5" fy="0">
            <Stop offset="0%" stopColor="rgb(34, 211, 238)" stopOpacity="0.55" />
            <Stop offset="35%" stopColor="rgb(34, 211, 238)" stopOpacity="0.28" />
            <Stop offset="75%" stopColor="rgb(34, 211, 238)" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="rgb(34, 211, 238)" stopOpacity="0" />
          </RadialGradient>
          {/* Bottom glow: brightest at the very bottom edge, fading to transparent toward the middle. */}
          <RadialGradient id="bottomGlow" cx="0.5" cy="1" r="0.55" fx="0.5" fy="1">
            <Stop offset="0%" stopColor="rgb(167, 139, 250)" stopOpacity="0.55" />
            <Stop offset="35%" stopColor="rgb(167, 139, 250)" stopOpacity="0.28" />
            <Stop offset="75%" stopColor="rgb(167, 139, 250)" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="rgb(167, 139, 250)" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {/* Top half rect — radial gradient masked to upper portion. */}
        <Rect x="0" y="0" width="1" height="0.5" fill="url(#topGlow)" />
        {/* Bottom rect — radial gradient masked to lower third (≈2/3 of prior height). */}
        <Rect x="0" y="0.667" width="1" height="0.333" fill="url(#bottomGlow)" />
      </Svg>
    </View>
  );
}

export function FlowCanvas({ map, renderNode, reachableIds, selectedId, activeId, statusById, onSelectNode, mode }: Props) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);

  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(1);

  // Bezel dimensions mirrored as shared values so the gesture worklet
  // can clamp pan bounds on the UI thread.
  const viewW = useSharedValue(0);
  const viewH = useSharedValue(0);

  // Maximum |tx|/|ty| allowed given the current zoom + viewport. When the
  // scaled canvas is larger than the viewport, the canvas is anchored and
  // can only pan between [-bound, 0] (so its right/bottom edge never
  // uncovers the bezel). When it's smaller or equal, bound is 0 and the
  // canvas is locked to the top-left origin (no scrolling past it).
  const txBound = useDerivedValue(() => {
    const scaledW = CANVAS_WIDTH * scale.value;
    const extra = scaledW - viewW.value;
    return extra > 0 ? extra : 0;
  });
  const tyBound = useDerivedValue(() => {
    const scaledH = CANVAS_HEIGHT * scale.value;
    const extra = scaledH - viewH.value;
    return extra > 0 ? extra : 0;
  });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const nextX = startTx.value + e.translationX;
      const nextY = startTy.value + e.translationY;
      const bX = txBound.value;
      const bY = tyBound.value;
      // Clamp into [-b, 0]: pulling right (positive e.translationX) can
      // only go up to 0; pulling left can go down to -b.
      tx.value = Math.max(-bX, Math.min(0, nextX));
      ty.value = Math.max(-bY, Math.min(0, nextY));
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(0.5, Math.min(2, startScale.value * e.scale));
    });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const { positionedNodes, positionedEdges, startId } = useMemo(() => {
    const { positions, startId: sid } = computeLayout(map);
    const nodes: FlowNode[] = map.nodes.map((n) => {
      const p = positions.get(n.id);
      return p ? { ...n, x: p.x, y: p.y } : n;
    });
    const edges: FlowEdge[] = map.edges.filter((e) => positions.has(e.fromNodeId) && positions.has(e.toNodeId));
    return { positionedNodes: nodes, positionedEdges: edges, startId: sid };
  }, [map]);

  // Live measurements of the visible canvas area (the bezel).
  // Initialized from window dims; refined via onLayout as soon as the wrapper mounts.
  const [viewRect, setViewRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    // Defaults assume the bezel is 75% wide centered (12.5% insets on each side)
    setViewRect({ x: width * 0.125, y: 0, width: width * 0.75, height });
  }, []);

  // Mirror the bezel rect into shared values so the gesture worklet can
  // clamp pan bounds on the UI thread.
  useEffect(() => {
    viewW.value = viewRect.width;
    viewH.value = viewRect.height;
  }, [viewRect, viewW, viewH]);

  // Internal "focus" node. The camera centers on this node whenever it
  // changes. It's seeded from `activeId` (the existing game-driven focus)
  // and updated whenever the user taps a node — so plain clicks pan the
  // camera to the tapped node even when they don't change `activeId`.
  const [focusId, setFocusId] = useState<string | null>(null);
  // `hasInitializedFocus` flips true after the first centering animation
  // runs. It lets us distinguish "first-ever framing" (lower-third start
  // node) from "focus happens to equal start node now" (true center).
  // Without this, picking the start node as the active target would
  // re-trigger the lower-third framing on every focus change.
  const hasInitializedFocus = useRef(false);
  useEffect(() => {
    if (activeId) setFocusId(activeId);
  }, [activeId]);

  // Wrap the parent's `onSelectNode` so taps also drive `focusId`.
  const handleSelect = useCallback(
    (node: FlowNode) => {
      setFocusId(node.id);
      onSelectNode?.(node);
    },
    [onSelectNode],
  );

  // Center the canvas on the focus node (defaulting to the start node).
  // Uses smooth timing animations so the camera glides instead of snapping.
  // Final values are clamped to the current pan bounds so the canvas never
  // settles in a position that would let the user scroll past it.
  useEffect(() => {
    if (!startId || viewRect.width === 0) return;
    const targetId = focusId ?? startId;
    const target = positionedNodes.find((n) => n.id === targetId)
      ?? positionedNodes.find((n) => n.id === startId);
    if (!target) return;
    const nodeCenterX = target.x + NODE_WIDTH / 2;
    const nodeCenterY = target.y + NODE_WIDTH / 2;
    // The canvas is positioned inside `canvasContainer`, which is a child
    // of the bezel — so transforms are measured in bezel-LOCAL coords,
    // not screen coords. The bezel center is therefore at
    // `(width/2, height/2)` regardless of where the bezel sits on screen.
    // Only the very first framing (mount, no explicit focus yet) puts
    // the start gateway lower-third so the level graph flows upward.
    // Every subsequent focus — including refocusing on the start node —
    // uses the dead center.
    const desiredX = viewRect.width / 2;
    const isInitialStart = !hasInitializedFocus.current;
    const desiredY = isInitialStart
      ? viewRect.height * 0.72
      : viewRect.height / 2;
    // Bounds mirror the worklet's: canvas left/top edge must stay at or
    // before the bezel's left/top edge (tx ≤ 0), and the canvas must
    // extend past the bezel's right/bottom edge (tx ≥ -extra).
    const bX = Math.max(0, CANVAS_WIDTH - viewRect.width);
    const bY = Math.max(0, CANVAS_HEIGHT - viewRect.height);
    const newTx = Math.max(-bX, Math.min(0, desiredX - nodeCenterX));
    const newTy = Math.max(-bY, Math.min(0, desiredY - nodeCenterY));
    // Faster initial pan (mount), gentler follow pan on selection.
    const duration = isInitialStart ? 600 : 420;
    tx.value = withTiming(newTx, { duration, easing: Easing.inOut(Easing.cubic) });
    ty.value = withTiming(newTy, { duration, easing: Easing.inOut(Easing.cubic) });
    scale.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) });
    hasInitializedFocus.current = true;
  }, [startId, positionedNodes, focusId, viewRect, tx, ty, scale]);

  const nodeById = useMemo(() => new Map(positionedNodes.map((n) => [n.id, n])), [positionedNodes]);

  return (
    <View style={styles.container}>
      <View
        style={styles.monitorFrame}
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setViewRect({ x, y, width, height });
        }}
      >
        {/* Top sheen + bottom shadow strips add depth to the bezel. */}
        <View style={styles.monitorHighlight} />
        <View style={styles.monitorBase} />
        {/* Soft top + bottom radial glows (SVG-based true radial gradients). */}
        <MonitorGlow width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
        <View style={styles.canvasContainer}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.canvas, animatedStyle]}>
          <Svg
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          >
            <Defs>
              <Pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                <Line x1="0" y1="0" x2={GRID_SIZE} y2="0" stroke="#1e293b" strokeWidth={1} />
                <Line x1="0" y1="0" x2="0" y2={GRID_SIZE} stroke="#1e293b" strokeWidth={1} />
              </Pattern>
              <Circle id="arrow" r={5} fill="#22d3ee" />
            </Defs>
            <Rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />
            {/* Decorative stub branches — fake traces ending in small PCB vias */}
            <StubBranches positionedNodes={positionedNodes} />
            {/* Edges — circuit-style right-angle paths with rounded corners */}
            {positionedEdges.map((edge) => {
              const from = nodeById.get(edge.fromNodeId);
              const to = nodeById.get(edge.toNodeId);
              if (!from || !to) return null;
              // Anchor: bottom-center of source node, top-center of target node.
              // Source node is BELOW the target on screen (higher y = lower on screen).
              const sx = from.x + NODE_WIDTH / 2;
              const sy = from.y; // bottom edge of source
              const tx2 = to.x + NODE_WIDTH / 2;
              const ty2 = to.y + NODE_WIDTH; // top edge of target
              const d = circuitPath(sx, sy, tx2, ty2);
              return (
                <G key={edge.id}>
                  <Path
                    d={d}
                    stroke="#475569"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd="url(#arrow)"
                  />
                </G>
              );
            })}
            <TravelLine nodes={positionedNodes} edges={positionedEdges} activeId={activeId ?? null} />
          </Svg>

          {positionedNodes.map((node) => {
            const status = statusById?.[node.id] ?? 'available';
            const active = activeId === node.id;
            return (
              <NodeOverlay
                key={node.id}
                node={node}
                reachable={reachableIds ? reachableIds.has(node.id) : true}
                selected={selectedId === node.id}
                active={active}
                mode={mode}
                onPress={() => handleSelect(node)}
              >
                {renderNode(node, { status, progress: 0, active })}
              </NodeOverlay>
            );
          })}
        </Animated.View>
      </GestureDetector>
        </View>
      </View>
    </View>
  );
}

function TravelLine({ nodes, edges, activeId }: { nodes: FlowNode[]; edges: FlowEdge[]; activeId: string | null }) {
  const edge = edges.find((e) => e.toNodeId === activeId);
  if (!edge) return null;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const from = nodeById.get(edge.fromNodeId);
  const to = nodeById.get(edge.toNodeId);
  if (!from || !to) return null;
  const x1 = from.x + NODE_WIDTH / 2;
  const y1 = from.y + NODE_WIDTH / 2;
  const x2 = to.x + NODE_WIDTH / 2;
  const y2 = to.y + NODE_WIDTH / 2;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth={6} strokeLinecap="round" opacity={0.25} />
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth={8} strokeLinecap="round" opacity={0.3} strokeDasharray="14 90" />
    </G>
  );
}

/**
 * StubBranches — random decorative traces that don't connect to anything,
 * ending in a small "via" circle. Sprinkled around the canvas to evoke
 * PCB traces that go nowhere. Stable per-map-id so the same map always
 * shows the same decoration.
 */
type Stub = {
  traces: { d: string; endX: number; endY: number; corners: { x: number; y: number }[] }[];
};

function StubBranches({ positionedNodes }: { positionedNodes: FlowNode[] }) {
  const stubs = useMemo(() => {
    try {
      return generateStubs(positionedNodes ?? []);
    } catch (e) {
      return [];
    }
  }, [positionedNodes]);
  return (
    <G>
      {stubs.map((stub, i) => (
        <G key={`stub-${i}`}>
          {stub.traces.map((s, k) => (
            <G key={`trace-${i}-${k}`}>
              <Path
                d={s.d}
                stroke="#334155"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.7}
              />
              {/* Outer via ring */}
              <Circle cx={s.endX} cy={s.endY} r={6} fill="#020617" stroke="#475569" strokeWidth={2} />
              {/* Inner via dot */}
              <Circle cx={s.endX} cy={s.endY} r={2.5} fill="#475569" />
              {/* PCB corner dots at each 90° turn along the trace */}
              {s.corners.map((c, j) => (
                <Circle key={`c-${i}-${k}-${j}`} cx={c.x} cy={c.y} r={2} fill="#475569" opacity={0.8} />
              ))}
            </G>
          ))}
        </G>
      ))}
    </G>
  );
}

/**
 * Generate ~16-22 short circuit-style stubs that branch off positioned
 * nodes (left or right side) and run outward with several 90° turns,
 * ending in a small PCB via. Each stub:
 *  - starts at the left or right edge midpoint of a randomly chosen node,
 *  - goes outward a short distance,
 *  - then snakes through 2-4 more 90° segments (more angles = more PCB-like),
 *  - ends in a small via circle, with a tiny dot at each right-angle corner.
 */
function generateStubs(positionedNodes: FlowNode[]): Stub[] {
  // Deterministic seed derived from positioned node coordinates (stable per map
  // AND per current layout — so re-layouts regenerate stubs accordingly).
  const seedStr = positionedNodes
    .filter((n) => n && typeof n.x === 'number' && typeof n.y === 'number')
    .map((n) => `${Math.round(n.x)}:${Math.round(n.y)}`)
    .join('|') || 'empty';
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rng = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };

  if (positionedNodes.length === 0) return [];
  const count = 9 + Math.floor(rng() * 5); // 9..13
  const stubs: Stub[] = [];

  type Seg = { x1: number; y1: number; x2: number; y2: number };
  const placedSegs: Seg[] = [];

  const segsOverlap = (a: Seg, b: Seg, margin: number) => {
    const ax = [Math.min(a.x1, a.x2), Math.max(a.x1, a.x2)];
    const ay = [Math.min(a.y1, a.y2), Math.max(a.y1, a.y2)];
    const bx = [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)];
    const by = [Math.min(b.y1, b.y2), Math.max(b.y1, b.y2)];
    const overlapLen = (a1: number, a2: number, b1: number, b2: number) => {
      const lo = Math.max(a1, b1);
      const hi = Math.min(a2, b2);
      return Math.max(0, hi - lo);
    };
    return overlapLen(ax[0], ax[1], bx[0], bx[1]) > margin &&
           overlapLen(ay[0], ay[1], by[0], by[1]) > margin;
  };

  const overlapsAny = (a: Seg, margin: number) =>
    placedSegs.some((b) => segsOverlap(a, b, margin));
  const overlapsSelf = (currentSegs: Seg[], a: Seg, margin: number) =>
    currentSegs.some((b) => segsOverlap(a, b, margin));

  const STUB_MARGIN = 12;

  // Build a single short fork trace starting at (sx, sy), going in the
  // requested perpendicular direction, ending at a via.
  const tryFork = (
    sx: number,
    sy: number,
    dirHoriz: 1 | -1,
    dirVert2: 1 | -1,
    currentSegs: Seg[],
    candidateSegs: Seg[],
    segStrings: string[]
  ): { ok: boolean; segs: Seg[]; strings: string[]; endX: number; endY: number; corners: { x: number; y: number }[] } => {
    const forkLength = 30 + Math.floor(rng() * 40);
    const forkX = sx + dirHoriz * forkLength;
    const forkY = sy + dirVert2 * (20 + Math.floor(rng() * 30));
    const fSeg: Seg = { x1: sx, y1: sy, x2: forkX, y2: sy };
    const fSeg2: Seg = { x1: forkX, y1: sy, x2: forkX, y2: forkY };
    if (overlapsSelf(currentSegs, fSeg, STUB_MARGIN) ||
        overlapsSelf(currentSegs, fSeg2, STUB_MARGIN) ||
        overlapsAny(fSeg, STUB_MARGIN) ||
        overlapsAny(fSeg2, STUB_MARGIN)) {
      return { ok: false, segs: [], strings: [], endX: 0, endY: 0, corners: [] };
    }
    const filletR = 6;
    const midX = sx + (forkX - sx) * 0.5;
    const strings = [
      `M ${sx} ${sy}`,
      `L ${midX} ${sy}`,
      `Q ${midX + dirHoriz * filletR * 0} ${sy} ${midX + dirHoriz * filletR} ${sy + dirVert2 * 0}`, // corner dot
      `L ${forkX} ${sy - dirVert2 * filletR}`,
      `Q ${forkX} ${sy} ${forkX + dirHoriz * filletR * (dirVert2 === 1 ? 1 : -1)} ${sy}`,
      `L ${forkX} ${forkY}`,
    ];
    return {
      ok: true,
      segs: [fSeg, fSeg2],
      strings,
      endX: forkX,
      endY: forkY,
      corners: [{ x: sx, y: sy }, { x: forkX, y: sy }, { x: forkX, y: forkY }],
    };
  };

  let attempts = 0;
  const maxAttempts = 4000;
  while (stubs.length < count && attempts < maxAttempts) {
    attempts++;
    // Pick an anchor: 60% chance to start from a real node edge,
    // 40% chance to start from a "phantom" anchor in the upper canvas
    // area (above the topmost nodes) so stubs populate that zone too.
    let cx0: number, cy0: number, fromLeft0: boolean;
    if (rng() < 0.6) {
      const startNode = positionedNodes[Math.floor(rng() * positionedNodes.length)];
      if (!startNode) continue;
      fromLeft0 = rng() < 0.5;
      cx0 = fromLeft0 ? startNode.x : startNode.x + NODE_WIDTH;
      cy0 = startNode.y + 20 + rng() * (NODE_WIDTH - 40);
    } else {
      // Phantom anchor near top of canvas, along the visible band edges.
      fromLeft0 = rng() < 0.5;
      const distFromCenter = 250 + rng() * 1100;
      cx0 = fromLeft0 ? CANVAS_WIDTH / 2 - distFromCenter : CANVAS_WIDTH / 2 + distFromCenter;
      cy0 = 80 + rng() * (CANVAS_HEIGHT - 200);
    }
    const fromLeft = fromLeft0;
    const sx0 = cx0;
    const sy0 = cy0;

    const outward = 50 + rng() * 80;
    let cx = sx0;
    let cy = sy0;
    const outwardX = sx0 + (fromLeft ? -outward : outward);
    const corners: { x: number; y: number }[] = [{ x: cx, y: cy }, { x: outwardX, y: cy }];
    const candidateSegs: Seg[] = [{ x1: cx, y1: cy, x2: outwardX, y2: cy }];
    const segments: string[] = [`M ${cx} ${cy}`, `L ${outwardX} ${cy}`];
    cx = outwardX;

    const extraSteps = 2 + Math.floor(rng() * 3);
    let dirVert = rng() < 0.5 ? -1 : 1;
    let horizSign = rng() < 0.5 ? -1 : 1;
    let rejected = false;

    for (let s = 0; s < extraSteps; s++) {
      const dy = (40 + rng() * 60) * dirVert;
      const filletR = 8;
      const midY = cy + dy * 0.5;
      const newY = cy + dy;
      const vSeg: Seg = { x1: cx, y1: cy, x2: cx, y2: newY };
      if (overlapsSelf(candidateSegs, vSeg, STUB_MARGIN) ||
          overlapsAny(vSeg, STUB_MARGIN)) {
        rejected = true;
        break;
      }
      segments.push(`L ${cx} ${midY - dirVert * filletR}`);
      segments.push(`Q ${cx} ${midY} ${cx + dirVert * filletR * (s % 2 === 0 ? 1 : -1)} ${midY}`);
      cy = newY;
      corners.push({ x: cx, y: cy });
      candidateSegs.push(vSeg);

      if (rng() < 0.3) horizSign *= -1;
      const outwardBias = fromLeft ? -1 : 1;
      const horizDir = s === 0 ? outwardBias : horizSign;
      const dx = 40 + rng() * 80;
      const newX = cx + horizDir * dx;
      const hSeg: Seg = { x1: cx, y1: cy, x2: newX, y2: cy };
      if (overlapsSelf(candidateSegs, hSeg, STUB_MARGIN) ||
          overlapsAny(hSeg, STUB_MARGIN)) {
        rejected = true;
        break;
      }
      segments.push(`L ${newX} ${cy}`);
      cx = newX;
      corners.push({ x: cx, y: cy });
      candidateSegs.push(hSeg);

      if (rng() < 0.5) dirVert *= -1;
    }

    if (rejected) continue;

    const finalY = cy + dirVert * 6;
    segments.push(`L ${cx} ${finalY}`);

    if (cy < 60 || cy > CANVAS_HEIGHT - 60) continue;
    if (cx < 60 || cx > CANVAS_WIDTH - 60) continue;
    // Spread stubs over a wider visible band (the larger 3200-wide canvas).
    if (Math.abs(cx - CANVAS_WIDTH / 2) > 1400) continue;
    // Allow vertical spread across the full canvas — even above the
    // topmost nodes — so stubs populate the whole visible map area.

    // Optionally branch off up to 2 corners with short sub-traces.
    const traces: Stub['traces'] = [
      { d: segments.join(' '), endX: cx, endY: cy, corners },
    ];

    const usedForkIndices = new Set<number>();
    const maxForks = corners.length >= 4 ? 2 : 1;
    let forksAdded = 0;
    for (let f = 0; f < maxForks; f++) {
      if (corners.length < 3) break;
      // Pick a random corner that hasn't been forked from yet.
      let forkIdx = -1;
      for (let tries = 0; tries < 6; tries++) {
        const candidate = 1 + Math.floor(rng() * (corners.length - 1));
        if (!usedForkIndices.has(candidate)) {
          forkIdx = candidate;
          break;
        }
      }
      if (forkIdx === -1) break;
      usedForkIndices.add(forkIdx);
      const fc = corners[forkIdx];
      const dirHoriz: 1 | -1 = rng() < 0.5 ? 1 : -1;
      const dirVert2: 1 | -1 = rng() < 0.5 ? 1 : -1;
      const fork = tryFork(fc.x, fc.y, dirHoriz, dirVert2, candidateSegs, candidateSegs, segments);
      if (fork.ok) {
        candidateSegs.push(...fork.segs);
        traces.push({
          d: fork.strings.join(' '),
          endX: fork.endX,
          endY: fork.endY,
          corners: fork.corners,
        });
        forksAdded++;
      }
    }

    placedSegs.push(...candidateSegs);
    stubs.push({ traces });
  }
  return stubs;
}

function NodeOverlay({
  node,
  reachable,
  selected,
  active,
  mode,
  onPress,
  children,
}: {
  node: FlowNode;
  reachable: boolean;
  selected: boolean;
  active: boolean;
  mode: 'build' | 'game';
  onPress: () => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const growUp = active;
  return (
    <Pressable
      style={[
        styles.nodeWrapper,
        growUp && styles.nodeWrapperActive,
        {
          left: node.x,
          top: node.y - (growUp ? 18 : 0),
          opacity: mode === 'game' && !reachable ? 0.4 : 1,
          borderColor: selected ? '#22d3ee' : 'transparent',
          borderWidth: selected ? 3 : 0,
          transform: [{ scale: hovered ? 1.05 : 1 }],
        },
      ]}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => {
        setHovered(false);
        onPress();
      }}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', overflow: 'hidden' },
  // Outer monitor/tablet bezel — about 70% wide (15% margin each side), centered,
  // with vertical insets so it doesn't touch the top or bottom of the screen.
  // Thick layered look with a subtle highlight rim for dimension/texture.
  monitorFrame: {
    flex: 1,
    marginHorizontal: '15%',
    borderRadius: 18,
    borderWidth: 8,
    borderColor: '#111827',
    backgroundColor: 'rgba(2, 6, 23, 0.96)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.75,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  // Outer bezel highlight (top sheen) — gives the bezel a subtle 3D bevel.
  monitorHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    pointerEvents: 'none',
  },
  // Outer bezel base shadow strip — adds depth at the bottom edge.
  monitorBase: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    pointerEvents: 'none',
  },
  // Soft radial glow at the top of the bezel — starts solid at the rim and
  // fades toward transparent in the middle of the monitor.
  glowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '12%',
    backgroundColor: 'rgba(34, 211, 238, 0.55)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    pointerEvents: 'none',
    zIndex: 5,
  },
  // Middle band — half-strength at ~8% in from the top.
  glowTopFade: {
    position: 'absolute',
    top: '8%',
    left: 0,
    right: 0,
    height: '14%',
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
    pointerEvents: 'none',
    zIndex: 4,
  },
  // Soft radial glow at the bottom of the bezel — starts solid at the rim
  // and fades toward transparent in the middle.
  glowBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '12%',
    backgroundColor: 'rgba(167, 139, 250, 0.55)',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    pointerEvents: 'none',
    zIndex: 5,
  },
  // Middle band — half-strength at ~8% in from the bottom.
  glowBottomFade: {
    position: 'absolute',
    bottom: '8%',
    left: 0,
    right: 0,
    height: '14%',
    backgroundColor: 'rgba(167, 139, 250, 0.18)',
    pointerEvents: 'none',
    zIndex: 4,
  },
  // Inner container holds the canvas; decorative overlays are absolutely
  // positioned on top via zIndex.
  canvasContainer: {
    flex: 1,
    position: 'relative',
    borderWidth: 4,
    borderColor: '#475569',
    borderRadius: 12,
    margin: 14,
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 4,
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#020617',
  },
  nodeWrapper: {
    position: 'absolute',
    width: NODE_WIDTH,
    height: NODE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeWrapperActive: {
    height: NODE_WIDTH + 18,
  },
});
