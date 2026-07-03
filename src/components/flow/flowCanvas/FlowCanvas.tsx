/**
 * FlowCanvas — pan/zoom container with grid background, shared between
 * Build and Game modes.
 *
 * Responsibilities (this file):
 *  - Compute and apply BFS layout to the flow graph.
 *  - Manage pan + pinch gestures via shared values.
 *  - Center the camera on a focus node (initial mount = start gateway
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Defs, Pattern, Line, Rect, G, Path, Circle } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withRepeat,
  Easing,
  runOnJS,
  useAnimatedProps,
} from 'react-native-reanimated';
import type { FlowMap, FlowNode, FlowEdge } from '@/lib/flow/types';
import type { NodeStatus } from '@/lib/flow/reachability';
import { GRID_SIZE } from '@/lib/flow/layout';
import { CANVAS_WIDTH, CANVAS_HEIGHT, NODE_WIDTH, layoutGraph, applyLayout } from '@/lib/flow/layoutGraph';
import { circuitPath } from './circuitPath';
import { MonitorGlow } from './MonitorGlow';
import { StubBranches } from './StubBranches';
import { TravelLine } from './TravelLine';
import { NodeOverlay } from './NodeOverlay';
import { NodeActionPanel } from '../NodeActionPanel';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function PulsingGlow({ d, pulse }: { d: string; pulse: Animated.SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => ({
    strokeOpacity: pulse.value,
  }));
  return (
    <AnimatedPath
      d={d}
      stroke="#22d3ee"
      strokeWidth={8}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      animatedProps={animatedProps}
    />
  );
}

interface Props {
  map: FlowMap;
  renderNode: (
    node: FlowNode,
    info: { status: NodeStatus; progress: number; active: boolean; selected: boolean },
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
  onSelectNode?: (node: FlowNode | null) => void;
  mode: 'build' | 'game';

  // New props for the action panel
  activePlayerClass?: 'lead' | 'support';
  canPlanTurn?: boolean;
  onPlanTurn?: () => void;
  onMajorAction?: (node: FlowNode) => void;
  onSupportAction?: (node: FlowNode) => void;
  onBuyMajorAction?: () => void;
  onRefundMajorAction?: () => void;
  onEndTurn?: () => void;
  objectives?: Record<string, { successes: number }>;
  playerName?: string;
  rp?: number;
  cp?: number;
  maxCp?: number;
  actionsCommitted?: number;
  actionsTaken?: number;
  minorActionsTaken?: number;
  otherLeadsExist?: boolean;
  aidBonus?: number;
}

export function FlowCanvas({ 
  map, 
  renderNode, 
  reachableIds, 
  selectedId, 
  activeId, 
  statusById, 
  onSelectNode, 
  mode,
  activePlayerClass,
  canPlanTurn,
  onPlanTurn,
  onMajorAction,
  onSupportAction,
  onBuyMajorAction,
  onRefundMajorAction,
  onEndTurn,
  objectives,
  playerName,
  rp,
  cp,
  maxCp,
  actionsCommitted,
  actionsTaken,
  minorActionsTaken,
  otherLeadsExist,
  aidBonus,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const isSmallScreen = windowWidth < 768;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const pulse = useSharedValue(0.15);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [pulse]);

  // Live measurements of the visible canvas area (the bezel).
  // Initialized from window dims; refined via onLayout as soon as the wrapper mounts.
  const [viewRect, setViewRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

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

  const animatedStyle = useAnimatedStyle(() => {
    // Hide the canvas until we've measured the screen and framed the first node.
    // This prevents the jarring "flash at origin" on mount.
    const opacity = isReady ? 1 : 0;
    return {
      opacity: withTiming(opacity, { duration: 150 }),
      transform: [
        { translateX: tx.value },
        { translateY: ty.value },
        { scale: scale.value },
      ],
    };
  });

  const { positionedNodes, positionedEdges, startId } = useMemo(() => {
    const layout = layoutGraph(map);
    return applyLayout(map, layout);
  }, [map]);

  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    // Defaults assume the bezel is 75% wide centered (12.5% insets on each side)
    setViewRect({ x: width * 0.125, y: 0, width: width * 0.75, height });
  }, []);

  // Mirror the bezel rect into shared values so the gesture worklet can
  // clamp pan bounds on the UI thread.
  useEffect(() => {
    if (viewRect.width > 0 && viewRect.height > 0) {
      viewW.value = viewRect.width;
      viewH.value = viewRect.height;
    }
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
    (node: FlowNode | null) => {
      if (node) setFocusId(node.id);
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
    // Uses the dead center (or upper-quarter on mobile).
    const desiredX = viewRect.width / 2;
    const isInitialStart = !hasInitializedFocus.current;

    const verticalCenter = isSmallScreen ? viewRect.height * 0.25 : viewRect.height / 2;
    const desiredY = isInitialStart
      ? viewRect.height * 0.72
      : verticalCenter;
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
    scale.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) }, () => {
      if (isInitialStart) {
        runOnJS(setIsReady)(true);
      }
    });
    hasInitializedFocus.current = true;
  }, [startId, positionedNodes, focusId, viewRect, tx, ty, scale, isSmallScreen]);

  const nodeById = useMemo(() => new Map(positionedNodes.map((n) => [n.id, n])), [positionedNodes]);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.monitorFrame,
          isSmallScreen ? { marginHorizontal: 8, borderWidth: 4, borderRadius: 12 } : null
        ]}
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setViewRect({ x, y, width, height });
        }}
      >
        {/* Top sheen + bottom shadow strips add depth to the bezel. */}
        <View style={[styles.monitorHighlight, isSmallScreen ? { borderTopLeftRadius: 8, borderTopRightRadius: 8 } : null]} />
        <View style={[styles.monitorBase, isSmallScreen ? { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, height: 8 } : null]} />
        {/* Soft top + bottom radial glows (SVG-based true radial gradients). */}
        <MonitorGlow width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
        <View style={[
          styles.canvasContainer,
          isSmallScreen ? { margin: 6, borderWidth: 2, borderRadius: 8 } : null
        ]}>
          <GestureDetector gesture={composed}>
            <Animated.View style={[styles.canvas, animatedStyle]}>
              <Pressable 
                style={StyleSheet.absoluteFill} 
                onPress={() => handleSelect(null)} 
              />
              <Svg
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              >
                <Defs>
                  {/* Flat-topped hexagonal grid pattern */}
                  <Pattern 
                    id="grid" 
                    width={GRID_SIZE * 3} 
                    height={GRID_SIZE * Math.sqrt(3)} 
                    patternUnits="userSpaceOnUse"
                  >
                    <Path
                      d={`
                        M ${GRID_SIZE * 0.5} 0 
                        L 0 ${GRID_SIZE * Math.sqrt(3) * 0.5}
                        L ${GRID_SIZE * 0.5} ${GRID_SIZE * Math.sqrt(3)}
                        H ${GRID_SIZE * 1.5}
                        L ${GRID_SIZE * 2} ${GRID_SIZE * Math.sqrt(3) * 0.5}
                        L ${GRID_SIZE * 1.5} 0
                        H ${GRID_SIZE * 0.5}
                        M ${GRID_SIZE * 2} ${GRID_SIZE * Math.sqrt(3) * 0.5}
                        L ${GRID_SIZE * 3} ${GRID_SIZE * Math.sqrt(3) * 0.5}
                      `}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth={1}
                    />
                  </Pattern>
                </Defs>
                <Rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />
                {/* Decorative stub branches — fake traces ending in small PCB vias */}
                <StubBranches 
                  positionedNodes={positionedNodes} 
                  positionedEdges={positionedEdges} 
                />
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
                  const { d, points } = circuitPath(sx, sy, tx2, ty2);
                  const status = statusById?.[edge.toNodeId] ?? 'available';
                  const isAvailablePath = mode === 'game' && (status === 'available' || status === 'visited' || status === 'unlocked');
                  const strokeColor = isAvailablePath ? '#22d3ee' : '#475569';

                  return (
                    <G key={edge.id}>
                      {isAvailablePath && <PulsingGlow d={d} pulse={pulse} />}
                      <Path
                        d={d}
                        stroke={strokeColor}
                        strokeWidth={3}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Corner dots to match background circuit board look */}
                      {points.slice(1, -1).map((p, i) => (
                        <Circle key={i} cx={p.x} cy={p.y} r={1.5} fill={strokeColor} opacity={isAvailablePath ? 0.8 : 0.4} />
                      ))}
                      {/* Outer via ring at start */}
                      <Circle cx={sx} cy={sy} r={6} fill="#020617" stroke={strokeColor} strokeWidth={2} />
                      <Circle cx={sx} cy={sy} r={2.5} fill={strokeColor} />
                      {/* Outer via ring at end */}
                      <Circle cx={tx2} cy={ty2} r={6} fill="#020617" stroke={strokeColor} strokeWidth={2} />
                      <Circle cx={tx2} cy={ty2} r={2.5} fill={strokeColor} />
                    </G>
                  );
                })}
                <TravelLine nodes={positionedNodes} edges={positionedEdges} activeId={activeId ?? null} />
              </Svg>

              {positionedNodes.map((node) => {
                const status = statusById?.[node.id] ?? 'available';
                const isActive = activeId === node.id;
                const isSelected = selectedId === node.id;
                const isReachable = reachableIds ? reachableIds.has(node.id) : true;
                
                return (
                  <React.Fragment key={node.id}>
                    <NodeOverlay
                      node={node}
                      reachable={isReachable}
                      selected={isSelected}
                      active={isActive}
                      mode={mode}
                      onPress={() => handleSelect(node)}
                    >
                      {renderNode(node, { status, progress: 0, active: isActive, selected: isSelected })}
                    </NodeOverlay>

                    {isSelected && mode === 'game' && activePlayerClass && (
                      <NodeActionPanel
                        node={node}
                        isReachable={isReachable}
                        successes={objectives?.[node.id]?.successes ?? 0}
                        canPlanTurn={canPlanTurn ?? false}
                        onPlanTurn={onPlanTurn ?? (() => {})}
                        onMajorAction={() => onMajorAction?.(node)}
                        onSupportAction={() => onSupportAction?.(node)}
                        onBuyMajorAction={onBuyMajorAction}
                        onRefundMajorAction={onRefundMajorAction}
                        onEndTurn={onEndTurn ?? (() => {})}
                        playerClass={activePlayerClass}
                        playerName={playerName ?? 'Player'}
                        rp={rp ?? 0}
                        cp={cp ?? 0}
                        maxCp={maxCp ?? 0}
                        actionsCommitted={actionsCommitted ?? 0}
                        actionsTaken={actionsTaken ?? 0}
                        minorActionsTaken={minorActionsTaken ?? 0}
                        otherLeadsExist={otherLeadsExist}
                        aidBonus={aidBonus}
                      />
                    )}
                  </React.Fragment>
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
});
