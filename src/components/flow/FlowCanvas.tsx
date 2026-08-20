/**
 * FlowCanvas — pan/zoom container with grid background, shared between
 * Build and Game modes.
 *
 * Responsibilities (this file):
 *  - Compute and apply BFS layout to the flow graph.
 *  - Manage pan + pinch gestures via shared values.
 *  - Center the camera on a focus node (initial mount = start access
 *    in the lower-third; subsequent focuses = dead center).
 *  - Compose the child visual layers: grid, decorative stubs, edges,
 *    active-edge highlight, and per-node overlays.
 *
 * Extracted into sibling modules (kept here for readability):
 *  - `circuitPath.ts`            — edge path math
 *  - `layoutGraph.ts`            — BFS-based auto-layout
 *  - `MonitorGlow.tsx`           — radial bezel glow
 *  - `StubBranches.tsx`          — decorative PCB traces
 *  - `TravelLine.tsx`            — animated edge highlight
 *  - `NodeOverlay.tsx`           — per-node pressable wrapper
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, View, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Line, Rect, G, Path } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { FlowMap, FlowNode, FlowEdge } from '@/lib/flow/types';
import type { NodeStatus } from '@/lib/flow/reachability';
import { GRID_SIZE } from '@/lib/flow/layout';
import { CANVAS_WIDTH, CANVAS_HEIGHT, NODE_WIDTH, layoutGraph, applyLayout } from '@/lib/flow/layoutGraph';
import { circuitPath } from './flowCanvas/circuitPath';
import { MonitorGlow } from './flowCanvas/MonitorGlow';
import { StubBranches } from './flowCanvas/StubBranches';
import { TravelLine } from './flowCanvas/TravelLine';
import { NodeOverlay } from './flowCanvas/NodeOverlay';

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
  progressById?: Record<string, number>;
  onSelectNode?: (node: FlowNode) => void;
  mode: 'build' | 'game';
}

export function FlowCanvas({
  map,
  renderNode,
  reachableIds,
  selectedId,
  activeId,
  statusById,
  progressById,
  onSelectNode,
  mode,
}: Props) {
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
    const layout = layoutGraph(map);
    return applyLayout(map, layout);
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
  const lastTargetId = useRef<string | null>(null);
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
  const isInitialScaling = useRef(true);

  useEffect(() => {
    if (!startId || viewRect.width === 0) return;
    const targetId = focusId ?? startId;
    const target = positionedNodes.find((n) => n.id === targetId)
      ?? positionedNodes.find((n) => n.id === startId);
    if (!target) return;

    const nodeCenterX = target.x + NODE_WIDTH / 2;
    const nodeCenterY = target.y + NODE_WIDTH / 2;

    const isInitialFrame = !hasInitializedFocus.current && !focusId;
    const desiredX = viewRect.width / 2;
    const desiredY = isInitialFrame
      ? viewRect.height * 0.72
      : viewRect.height / 2;

    const bX = Math.max(0, CANVAS_WIDTH - viewRect.width);
    const bY = Math.max(0, CANVAS_HEIGHT - viewRect.height);
    const newTx = Math.max(-bX, Math.min(0, desiredX - nodeCenterX));
    const newTy = Math.max(-bY, Math.min(0, desiredY - nodeCenterY));

    if (target.id === lastTargetId.current && hasInitializedFocus.current) {
      return;
    }
    lastTargetId.current = target.id;

    const duration = isInitialFrame ? 600 : 420;
    const easing = Easing.inOut(Easing.cubic);

    if (isInitialFrame) {
      tx.value = newTx;
      ty.value = newTy;
      scale.value = 1;
    } else {
      tx.value = withTiming(newTx, { duration, easing });
      ty.value = withTiming(newTy, { duration, easing });
      scale.value = withTiming(1, { duration, easing });
    }

    hasInitializedFocus.current = true;
  }, [startId, positionedNodes, focusId, viewRect.width, viewRect.height]);

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
                </Defs>
                <Rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />
                {/* Decorative stub branches — fake traces ending in small PCB vias */}
                <StubBranches positionedNodes={positionedNodes} positionedEdges={positionedEdges} />
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
                  const { d } = circuitPath(sx, sy, tx2, ty2);
                  return (
                    <G key={edge.id}>
                      <Path
                        d={d}
                        stroke="#475569"
                        strokeWidth={3}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </G>
                  );
                })}
                <TravelLine nodes={positionedNodes} edges={positionedEdges} selectedId={null} />
              </Svg>

              {positionedNodes.map((node) => {
                const status = statusById?.[node.id] ?? 'available';
                const progress = progressById?.[node.id] ?? 0;
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
                    {renderNode(node, { status, progress, active })}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', overflow: 'hidden' },
  // Outer monitor/tablet bezel — about 70% wide (15% margin each side), centered,
  // with vertical insets so it doesn't touch the top or bottom of the screen.
  // Thick layered look with a subtle highlight rim for dimension/texture.
  monitorFrame: {
    flex: 1,
    marginHorizontal: '15%',
    borderRadius: 0,
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
    boxShadow: '0px 10px 16px rgba(0, 0, 0, 0.75)',
    pointerEvents: 'none',
  },
  // Outer bezel base shadow strip — adds depth at the bottom edge.
  monitorBase: {
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.7)',
    height: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    pointerEvents: 'none',
  },
  // Inner container holds the canvas; decorative overlays are absolutely
  // positioned on top via zIndex.
  canvasContainer: {
    flex: 1,
    position: 'relative',
    borderWidth: 4,
    borderColor: '#475569',
    borderRadius: 0,
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
});
