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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, View, Text, StyleSheet, Pressable, Modal, useWindowDimensions } from 'react-native';
import Svg, { Defs, Pattern, Line, Rect, G, Path, Circle, Text as SvgText } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { ChamferedFrame } from '../../ui/ChamferedFrame';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  withRepeat,
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { FlowMap, FlowNode, FlowEdge } from '@/lib/flow/types';
import type { ObjectiveProgress } from '@/lib/game/types';
import { isCompleted, type NodeStatus } from '@/lib/flow/reachability';
import { GRID_SIZE } from '@/lib/flow/layout';
import { CANVAS_WIDTH, CANVAS_HEIGHT, NODE_WIDTH, layoutGraph, applyLayout } from '@/lib/flow/layoutGraph';
import { circuitPath } from './circuitPath';
import { MonitorGlow } from './MonitorGlow';
import { StubBranches } from './StubBranches';
import { TravelLine } from './TravelLine';
import { NodeOverlay } from './NodeOverlay';
import { NodeActionPanel } from '../NodeActionPanel';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const WheelContainer = View as React.ComponentType<
  React.ComponentProps<typeof View> & {
    onWheel?: (event: {
      deltaY: number;
      clientX?: number;
      clientY?: number;
      offsetX?: number;
      offsetY?: number;
      currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } };
      preventDefault?: () => void;
    }) => void;
  }
>;

function PulsingGlow({ d, pulse }: { d: string; pulse: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => ({
    strokeOpacity: pulse.value * 0.4,
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

function EndpointKeyhole({ cx, cy, color, glowing = false, pulse }: { cx: number; cy: number; color: string; glowing?: boolean; pulse?: SharedValue<number> }) {
  const glowProps = useAnimatedProps(() => ({
    strokeOpacity: glowing ? pulse?.value ?? 0.4 : 0,
  }));
  return (
    <G transform={`translate(${cx - 20} ${cy - 25})`}>
      <AnimatedPath
        d="M 20 3 C 25.5 3 30 7.5 30 13 C 30 16.6 28.1 19.7 25.2 21.4 L 29 42 L 11 42 L 14.8 21.4 C 11.9 19.7 10 16.6 10 13 C 10 7.5 14.5 3 20 3 Z"
        fill="none"
        stroke={color}
        strokeWidth={20}
        strokeLinejoin="round"
        animatedProps={glowProps}
      />
      <Path
        d="M 20 3 C 25.5 3 30 7.5 30 13 C 30 16.6 28.1 19.7 25.2 21.4 L 29 42 L 11 42 L 14.8 21.4 C 11.9 19.7 10 16.6 10 13 C 10 7.5 14.5 3 20 3 Z"
        fill="none"
        stroke={color}
        strokeWidth={16}
        strokeOpacity={0.16}
        strokeLinejoin="round"
      />
      <Path
        d="M 20 3 C 25.5 3 30 7.5 30 13 C 30 16.6 28.1 19.7 25.2 21.4 L 29 42 L 11 42 L 14.8 21.4 C 11.9 19.7 10 16.6 10 13 C 10 7.5 14.5 3 20 3 Z"
        fill="#020617"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </G>
  );
}

interface Props {
  map: FlowMap;
  renderNode: (
    node: FlowNode,
    info: { status: NodeStatus; progress: number; active: boolean; selected: boolean; concealedOpacity: number; countermeasureAttached: boolean; countermeasureTargeted: boolean; wiping: boolean },
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
  wipingNodeIds?: Set<string>;
  hiddenCountermeasureIds?: Set<string>;
  fakeShellActive?: boolean;
  onSelectNode?: (node: FlowNode | null) => void;
  mode: 'build' | 'game';

  // New props for the action panel
  activePlayerClass?: 'lead' | 'support';
  canPlanTurn?: boolean;
  onPlanTurn?: () => void;
  onMajorAction?: (node: FlowNode) => void;
  onPasswordAction?: (node: FlowNode, password: string) => void;
  onSupportAction?: (node: FlowNode) => void;
  onBuyMajorAction?: () => void;
  onRefundMajorAction?: () => void;
  onEndTurn?: () => void;
  onLogOut?: () => void;
  objectives?: Record<string, ObjectiveProgress>;
  playerName?: string;
  rp?: number;
  cp?: number;
  maxCp?: number;
  actionsCommitted?: number;
  actionsTaken?: number;
  minorActionsTaken?: number;
  otherLeadsExist?: boolean;
  aidBonus?: number;
  hackingMode?: 'basic' | 'dynamic';
  mapTier?: number;
  securityBonus?: number;
  rootAccessAchieved?: boolean;
  modifiers?: {
    deceive: number;
    hack: number;
    process: number;
    total: number;
    base?: number;
    passwordBonus?: number;
    penalty?: number;
    aidBonus?: number;
  };
  hideInfoDrawers?: boolean;
  outcomeAnimationReady?: boolean;
  onMonitorLayout?: (rect: { x: number; y: number; width: number; height: number }) => void;
}

export function FlowCanvas({ 
  map, 
  renderNode, 
  reachableIds, 
  selectedId, 
  activeId, 
  statusById, 
  progressById,
  wipingNodeIds,
  hiddenCountermeasureIds,
  fakeShellActive,
  onSelectNode, 
  mode,
  activePlayerClass,
  canPlanTurn,
  onPlanTurn,
  onMajorAction,
  onPasswordAction,
  onSupportAction,
  onBuyMajorAction,
  onRefundMajorAction,
  onEndTurn,
  onLogOut,
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
  hackingMode,
  mapTier,
  securityBonus,
  rootAccessAchieved,
  modifiers,
  hideInfoDrawers,
  outcomeAnimationReady,
  onMonitorLayout,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const isSmallScreen = windowWidth < 1024;
  const [disconnectPromptOpen, setDisconnectPromptOpen] = useState(false);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const pulse = useSharedValue(0.15);
  const keyholePulse = useSharedValue(0);
  const draggedRef = useRef(false);

  const resetDrag = useCallback(() => {
    draggedRef.current = false;
  }, []);
  const markDragged = useCallback(() => {
    draggedRef.current = true;
  }, []);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [pulse]);

  useEffect(() => {
    keyholePulse.value = withRepeat(
      withTiming(0.55, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(keyholePulse);
  }, [keyholePulse]);

  // Live measurements of the visible canvas area (the bezel).
  // Initialized from window dims; refined via onLayout as soon as the wrapper mounts.
  const [viewRect, setViewRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const monitorRef = useRef<View>(null);
  const [canvasRect, setCanvasRect] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);

  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startScale = useSharedValue(1);

  // Bezel dimensions mirrored as shared values so the gesture worklet
  // can clamp pan bounds on the UI thread.
  const viewW = useSharedValue(0);
  const viewH = useSharedValue(0);

  // Translation range that keeps the scaled canvas covering the viewport.
  // The canvas starts at the origin and may move only up/left from there.
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
      runOnJS(resetDrag)();
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      if (Math.abs(e.translationX) > 8 || Math.abs(e.translationY) > 8) {
        runOnJS(markDragged)();
      }
      const nextX = startTx.value + e.translationX;
      const nextY = startTy.value + e.translationY;
      const bX = txBound.value;
      const bY = tyBound.value;
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

  const handleWheel = useCallback((event: {
    deltaY: number;
    clientX?: number;
    clientY?: number;
    offsetX?: number;
    offsetY?: number;
    currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } };
    preventDefault?: () => void;
  }) => {
    event.preventDefault?.();
    const nextScale = Math.max(0.5, Math.min(2, scale.value * Math.exp(-event.deltaY * 0.0015)));
    const nextXBound = Math.max(0, CANVAS_WIDTH * nextScale - viewW.value);
    const nextYBound = Math.max(0, CANVAS_HEIGHT * nextScale - viewH.value);
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const cursorX = rect && event.clientX !== undefined
      ? event.clientX - rect.left
      : event.offsetX ?? viewW.value / 2;
    const cursorY = rect && event.clientY !== undefined
      ? event.clientY - rect.top
      : event.offsetY ?? viewH.value / 2;
    const scaleRatio = nextScale / scale.value;
    const zoomedX = cursorX - (cursorX - tx.value) * scaleRatio;
    const zoomedY = cursorY - (cursorY - ty.value) * scaleRatio;
    scale.value = nextScale;
    tx.value = Math.max(-nextXBound, Math.min(0, zoomedX));
    ty.value = Math.max(-nextYBound, Math.min(0, zoomedY));
  }, [scale, tx, ty, viewW, viewH]);

  const composed = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => {
    // Hide the canvas until we've measured the screen and framed the first node.
    // This prevents the jarring "flash at origin" on mount.
    const opacity = isReady ? 1 : 0;
    return {
      opacity: withTiming(opacity, { duration: 150 }),
      transformOrigin: '0 0',
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

  const startNode = useMemo(() => positionedNodes.find(n => n.id === startId), [positionedNodes, startId]);
  const rootNode = useMemo(() => positionedNodes.find(n => n.isRootAccess), [positionedNodes]);
  const exitAvailable = rootNode ? isCompleted(rootNode, objectives) : false;

  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    // Match the centered monitor frame's 15% side margins until onLayout reports its exact size.
    setViewRect({ x: width * 0.15, y: 0, width: width * 0.7, height });
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
  const [focusAnimating, setFocusAnimating] = useState(false);
  const [displayedPanelId, setDisplayedPanelId] = useState<string | null>(selectedId ?? null);
  // `hasInitializedFocus` flips true after the first centering animation
  // runs. It lets us distinguish "first-ever framing" (lower-third start
  // node) from "focus happens to equal start node now" (true center).
  // Without this, picking the start node as the active target would
  // re-trigger the lower-third framing on every focus change.
  const hasInitializedFocus = useRef(false);
  const lastTargetId = useRef<string | null>(null);
  useEffect(() => {
    if (activeId) {
      setFocusAnimating(true);
      setFocusId(activeId);
    }
  }, [activeId]);

  useEffect(() => {
    if (!focusAnimating) return;
    const timer = setTimeout(() => {
      setFocusAnimating(false);
      setDisplayedPanelId(selectedId ?? null);
    }, 600);
    return () => clearTimeout(timer);
  }, [focusAnimating, selectedId]);

  // Center the canvas on the focus node (defaulting to the start node).
  // Uses smooth timing animations so the camera glides instead of snapping.
  // Final values are clamped to the current pan bounds so the canvas never
  // settles in a position that would let the user scroll past it.
  const animateToFocus = useCallback((focusTargetId: string | null, force = false) => {
    if (!startId || viewRect.width === 0) return;
    const targetId = focusTargetId ?? startId;
    const target = positionedNodes.find((n) => n.id === targetId)
      ?? positionedNodes.find((n) => n.id === startId);
    if (!target) return;
    const currentScale = scale.value;
    const nodeCenterX = target.x + NODE_WIDTH / 2;
    const nodeCenterY = target.y + NODE_WIDTH / 2;
    // The canvas is positioned inside `canvasContainer`, which is a child
    // of the bezel — so transforms are measured in bezel-LOCAL coords,
    // not screen coords. The bezel center is therefore at
    // `(width/2, height/2)` regardless of where the bezel sits on screen.
    // Only the very first framing (mount, no explicit focus yet) puts
    // the start access lower-third so the level graph flows upward.
    // Keep focused nodes two-thirds of the way up from the bottom of the canvas.
    const desiredX = viewRect.width / 2;
    const isInitialStart = !hasInitializedFocus.current && !focusTargetId;

    const desiredY = isInitialStart
      ? viewRect.height * 0.72
      : viewRect.height / 3;
    // Bounds mirror the worklet's: canvas left/top edge must stay at or
    // before the bezel's left/top edge (tx ≤ 0), and the canvas must
    // extend past the bezel's right/bottom edge (tx ≥ -extra).
    const bX = Math.max(0, CANVAS_WIDTH * currentScale - viewRect.width);
    const bY = Math.max(0, CANVAS_HEIGHT * currentScale - viewRect.height);
    const newTx = Math.max(-bX, Math.min(0, desiredX - nodeCenterX * currentScale));
    const newTy = Math.max(-bY, Math.min(0, desiredY - nodeCenterY * currentScale));
    if (!force && target.id === lastTargetId.current && hasInitializedFocus.current) return;
    lastTargetId.current = target.id;
    // Faster initial pan (mount), gentler follow pan on selection.
    const duration = isInitialStart ? 600 : 800;
    const easing = Easing.bezier(0.65, 0, 0.35, 1);
    cancelAnimation(tx);
    cancelAnimation(ty);
    cancelAnimation(scale);
    tx.value = withTiming(newTx, { duration, easing });
    ty.value = withTiming(newTy, { duration, easing });
    if (isInitialStart) setIsReady(true);
    hasInitializedFocus.current = true;
  }, [startId, positionedNodes, viewRect.width, viewRect.height, tx, ty, scale, isSmallScreen]);

  useEffect(() => {
    animateToFocus(focusId);
  }, [animateToFocus, focusId]);

  const handleSelect = useCallback(
    (node: FlowNode | null) => {
      if (!node) {
        setFocusAnimating(true);
        onSelectNode?.(null);
        return;
      }
      if (node && node.id !== focusId) {
        setFocusAnimating(true);
        setFocusId(node.id);
        animateToFocus(node.id, true);
      }
      onSelectNode?.(node);
    },
    [animateToFocus, focusId, onSelectNode],
  );

  const nodeById = useMemo(() => new Map(positionedNodes.map((n) => [n.id, n])), [positionedNodes]);
  const noAvailableNodes = useMemo(() => {
    if (mode !== 'game' || !reachableIds) return false;
    return positionedNodes.every((node) => {
      if (!reachableIds.has(node.id)) return true;
      if (isCompleted(node, objectives)) return true;
      const failures = objectives?.[node.id]?.failures ?? 0;
      return node.failureLimit !== undefined
        && failures >= node.failureLimit;
    });
  }, [mode, objectives, positionedNodes, reachableIds]);
  const adjacentToUnlockedIds = useMemo(() => {
    const adjacent = new Set<string>();
    if (mode !== 'game' || !statusById) return adjacent;
    for (const edge of positionedEdges) {
      if (statusById[edge.fromNodeId] === 'unlocked') {
        adjacent.add(edge.toNodeId);
      }
    }
    return adjacent;
  }, [mode, positionedEdges, statusById]);

  return (
    <View style={styles.container}>
      <View
        ref={monitorRef}
        style={[
          styles.monitorFrame,
          isSmallScreen ? styles.monitorFrameSmall : null
        ]}
        onLayout={(e) => {
          const { x, y, width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setViewRect({ x, y, width, height });
            monitorRef.current?.measureInWindow((screenX, screenY, measuredWidth, measuredHeight) => {
              onMonitorLayout?.({ x: screenX, y: screenY, width: measuredWidth, height: measuredHeight });
            });
          }
        }}
      >
        {!isSmallScreen && <View style={styles.monitorHighlight} />}
        {!isSmallScreen && <View style={styles.monitorBase} />}
        {/* Chamfered Bezel Background */}
        {!isSmallScreen && viewRect.width > 0 && (
          <>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
              <ChamferedFrame
                width={viewRect.width}
                height={viewRect.height}
                chamfer={isSmallScreen ? 12 : 24}
                stroke="transparent"
                strokeWidth={0}
                fill="rgba(2, 6, 23, 0.96)"
              />
            </View>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, pointerEvents: 'none' }}>
            <ChamferedFrame
              width={viewRect.width}
              height={viewRect.height}
              chamfer={isSmallScreen ? 12 : 24}
              stroke="#111827"
              strokeWidth={12}
              fill="transparent"
            />
            </View>
          </>
        )}
        {/* Soft top + bottom radial glows (SVG-based true radial gradients). */}
        {!isSmallScreen && <MonitorGlow width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />}
        <WheelContainer
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) setCanvasRect({ width, height });
          }}
          onWheel={handleWheel}
          style={[
            styles.canvasContainer,
            isSmallScreen ? styles.canvasContainerSmall : null
          ]}>
          {/* Inner Chamfered Frame */}
          {!isSmallScreen && canvasRect.width > 0 && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, pointerEvents: 'none' }}>
              <ChamferedFrame
                width={canvasRect.width}
                height={canvasRect.height}
                chamfer={isSmallScreen ? 8 : 12}
                stroke="#475569"
                strokeWidth={4}
                fill="transparent"
              />
            </View>
          )}
          <GestureDetector gesture={composed}>
            <Animated.View style={[styles.canvas, animatedStyle]}>
              <Pressable 
                style={StyleSheet.absoluteFill} 
                onPress={() => {
                  if (draggedRef.current) {
                    draggedRef.current = false;
                    return;
                  }
                  handleSelect(null);
                }} 
              />
              <Svg
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              >
                <Defs>
                  {/* Square grid pattern */}
                  <Pattern 
                    id="grid" 
                    width={GRID_SIZE} 
                    height={GRID_SIZE} 
                    patternUnits="userSpaceOnUse"
                  >
                    <Path
                      d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth={1}
                    />
                  </Pattern>
                </Defs>
                <Rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />

                {/* Entry Access Decoration (below start node) */}
                {startNode && (
                  <G>
                    <Line
                      x1={startNode.x + NODE_WIDTH / 2} y1={startNode.y + NODE_WIDTH}
                      x2={startNode.x + NODE_WIDTH / 2} y2={startNode.y + NODE_WIDTH + 60}
                      stroke="#22d3ee" strokeWidth={9} strokeOpacity={0.16} strokeLinecap="round"
                    />
                    <Line 
                      x1={startNode.x + NODE_WIDTH / 2} y1={startNode.y + NODE_WIDTH} 
                      x2={startNode.x + NODE_WIDTH / 2} y2={startNode.y + NODE_WIDTH + 60} 
                      stroke="#22d3ee" strokeWidth={3} strokeDasharray="6 4"
                    />
                    <EndpointKeyhole
                      cx={startNode.x + NODE_WIDTH / 2}
                      cy={startNode.y + NODE_WIDTH + 80}
                      color="#22d3ee"
                      glowing={noAvailableNodes}
                      pulse={keyholePulse}
                    />
                    <SvgText 
                      x={startNode.x + NODE_WIDTH / 2} y={startNode.y + NODE_WIDTH + 120} 
                      fontSize={10} textAnchor="middle" fill="#475569" fontWeight="800"
                    >
                      LOCAL_JACK
                    </SvgText>
                  </G>
                )}
                {/* Exit Access Decoration (above the completed final node) */}
                {rootNode && (
                  <G>
                   <Line 
                      x1={rootNode.x + NODE_WIDTH / 2} y1={rootNode.y} 
                      x2={rootNode.x + NODE_WIDTH / 2} y2={rootNode.y - 60} 
                      stroke={exitAvailable ? '#22d3ee' : '#1e293b'}
                      strokeWidth={exitAvailable ? 3 : 2}
                      strokeOpacity={exitAvailable ? 1 : 0.7}
                      strokeDasharray="6 4"
                    />
                    <EndpointKeyhole
                      cx={rootNode.x + NODE_WIDTH / 2}
                      cy={rootNode.y - 80}
                      color={exitAvailable ? '#22d3ee' : '#475569'}
                      glowing={noAvailableNodes && exitAvailable}
                      pulse={keyholePulse}
                    />
                    <SvgText 
                      x={rootNode.x + NODE_WIDTH / 2} y={rootNode.y - 115} 
                      fontSize={10} textAnchor="middle"
                      fill={exitAvailable ? '#22d3ee' : '#475569'} fontWeight="800"
                    >
                      ROUTE_EXIT
                    </SvgText>
                  </G>
                )}

                {/* Decorative stub branches — fake traces ending in small PCB vias */}
                <StubBranches 
                  positionedNodes={mode === 'game'
                    ? positionedNodes.filter((node) => !hiddenCountermeasureIds?.has(node.id)
                      && (!fakeShellActive || (node.category === 'countermeasure' && node.countermeasureType === 'fake-shell')))
                    : positionedNodes}
                  positionedEdges={mode === 'game'
                    ? positionedEdges.filter((edge) => !hiddenCountermeasureIds?.has(edge.fromNodeId)
                      && !hiddenCountermeasureIds?.has(edge.toNodeId)
                      && (!fakeShellActive || (nodeById.get(edge.fromNodeId)?.countermeasureType === 'fake-shell'
                        && nodeById.get(edge.toNodeId)?.category === 'countermeasure'
                        && nodeById.get(edge.toNodeId)?.countermeasureType === 'fake-shell')))
                    : positionedEdges}
                />
                {/* Edges — circuit-style right-angle paths with rounded corners */}
                {positionedEdges.map((edge) => {
                  const from = nodeById.get(edge.fromNodeId);
                  const to = nodeById.get(edge.toNodeId);
                  if (!from || !to) return null;
                  if (mode === 'game' && (hiddenCountermeasureIds?.has(from.id) || hiddenCountermeasureIds?.has(to.id))) return null;
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
                        strokeOpacity={isAvailablePath ? 1 : 0.4}
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
                <TravelLine
                  nodes={mode === 'game'
                    ? positionedNodes.filter((node) => !hiddenCountermeasureIds?.has(node.id)
                      && (!fakeShellActive || (node.category === 'countermeasure' && node.countermeasureType === 'fake-shell')))
                    : positionedNodes}
                  edges={mode === 'game'
                    ? positionedEdges.filter((edge) => !hiddenCountermeasureIds?.has(edge.fromNodeId)
                      && !hiddenCountermeasureIds?.has(edge.toNodeId)
                      && (!fakeShellActive || (nodeById.get(edge.fromNodeId)?.category === 'countermeasure'
                        && nodeById.get(edge.fromNodeId)?.countermeasureType === 'fake-shell'
                        && nodeById.get(edge.toNodeId)?.category === 'countermeasure'
                        && nodeById.get(edge.toNodeId)?.countermeasureType === 'fake-shell')))
                    : positionedEdges}
                  selectedId={selectedId ?? null}
                  wipingNodeIds={wipingNodeIds}
                  hiddenCountermeasureIds={hiddenCountermeasureIds}
                />
              </Svg>
              {startNode && mode === 'game' && onLogOut && (
                <Pressable
                  style={[styles.entryJackPressTarget, { left: startNode.x + NODE_WIDTH / 2 - 30, top: startNode.y + NODE_WIDTH + 50 }]}
                  onPress={() => setDisconnectPromptOpen(true)}
                  accessibilityLabel="Local datajack"
                />
              )}
              {rootNode && exitAvailable && mode === 'game' && onLogOut && (
                <Pressable
                  style={[styles.entryJackPressTarget, { left: rootNode.x + NODE_WIDTH / 2 - 30, top: rootNode.y - 110 }]}
                  onPress={() => setDisconnectPromptOpen(true)}
                  accessibilityLabel="Root exit"
                />
              )}
              {positionedNodes.map((node) => {
                if (mode === 'game' && hiddenCountermeasureIds?.has(node.id)) return null;
                const status = statusById?.[node.id] ?? 'available';
                const isActive = activeId === node.id;
                const isSelected = selectedId === node.id;
                const isReachable = reachableIds ? reachableIds.has(node.id) : true;
                const countermeasureAttached = positionedEdges.some((edge) => {
                  if (edge.fromNodeId !== node.id && edge.toNodeId !== node.id) return false;
                  const from = nodeById.get(edge.fromNodeId);
                  const to = nodeById.get(edge.toNodeId);
                  return from?.category === 'countermeasure' || to?.category === 'countermeasure';
                });
                const selectedCountermeasure = selectedId ? nodeById.get(selectedId) : undefined;
                const targetIds = selectedCountermeasure?.category === 'countermeasure'
                  ? selectedCountermeasure.targetNodeIds?.length
                    ? selectedCountermeasure.targetNodeIds
                    : positionedEdges.filter((edge) => edge.fromNodeId === selectedCountermeasure.id).map((edge) => edge.toNodeId)
                  : [];
                
                return (
                  <React.Fragment key={node.id}>
                    <NodeOverlay
                      node={node}
                      reachable={isReachable}
                      selected={isSelected}
                      active={isActive}
                      adjacentToUnlocked={adjacentToUnlockedIds.has(node.id)}
                      mode={mode}
                      onPress={() => handleSelect(node)}
                    >
                      {renderNode(node, {
                        status,
                        progress: progressById?.[node.id] ?? 0,
                        active: isActive,
                        selected: isSelected,
                        concealedOpacity: adjacentToUnlockedIds.has(node.id) ? 0.4 : 0.14,
                        countermeasureAttached,
                        countermeasureTargeted: targetIds.includes(node.id),
                                              wiping: wipingNodeIds?.has(node.id) ?? false,
                      })}
                    </NodeOverlay>

                    {node.id === displayedPanelId && mode === 'game' && activePlayerClass && (
                      <NodeActionPanel
                        key={displayedPanelId}
                        node={node}
                        closing={focusAnimating}
                        isReachable={isReachable}
                        successes={objectives?.[node.id]?.successes ?? 0}
                        failures={objectives?.[node.id]?.failures ?? 0}
                        canPlanTurn={canPlanTurn ?? false}
                        onPlanTurn={onPlanTurn ?? (() => {})}
                        onMajorAction={() => onMajorAction?.(node)}
                        onPasswordAction={(password) => onPasswordAction?.(node, password)}
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
                        hackingMode={hackingMode}
                        mapTier={mapTier}
                        rootAccessAchieved={rootAccessAchieved}
                        securityBonus={securityBonus}
                        modifiers={modifiers}
                        hideInfoDrawers={hideInfoDrawers}
                        outcomeAnimationReady={outcomeAnimationReady}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </Animated.View>
          </GestureDetector>
          </WheelContainer>
      </View>
      <Modal
        visible={disconnectPromptOpen && mode === 'game' && !!onLogOut}
        transparent
        animationType="fade"
        onRequestClose={() => setDisconnectPromptOpen(false)}
      >
        <View style={styles.disconnectBackdrop}>
          <View style={styles.disconnectModal}>
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              <ChamferedFrame width={320} height={190} chamfer={16} stroke="#fbbf24" fill="#0f172a" />
            </View>
            <Text style={styles.disconnectTitle}>Disconnect your datajack and collect modules?</Text>
            <Text style={styles.disconnectMessage}>You may not be able to return.</Text>
            <View style={styles.disconnectActions}>
              <Pressable style={styles.disconnectCancel} onPress={() => setDisconnectPromptOpen(false)}>
                <Text style={styles.disconnectCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.disconnectConfirm}
                onPress={() => {
                  setDisconnectPromptOpen(false);
                  onLogOut?.();
                }}
              >
                <Text style={styles.disconnectConfirmText}>Disconnect</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden' },
  entryJackPressTarget: {
    position: 'absolute',
    width: 60,
    height: 60,
    backgroundColor: 'transparent',
  },
  disconnectBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
  },
  disconnectModal: {
    width: 320,
    minHeight: 190,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  disconnectTitle: {
    color: '#fef3c7',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: 'Orbitron-Bold',
  },
  disconnectMessage: { color: '#94a3b8', fontSize: 12, fontFamily: 'Orbitron', textAlign: 'center' },
  disconnectActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  disconnectCancel: { minWidth: 100, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  disconnectCancelText: { color: '#cbd5e1', fontFamily: 'Orbitron-Bold', fontSize: 11 },
  disconnectConfirm: { minWidth: 120, paddingVertical: 10, alignItems: 'center', backgroundColor: '#92400e', borderWidth: 1, borderColor: '#fbbf24' },
  disconnectConfirmText: { color: '#fef3c7', fontFamily: 'Orbitron-Bold', fontSize: 11 },
  // Outer monitor/tablet bezel — about 70% wide (15% margin each side), centered,
  // with vertical insets so it doesn't touch the top or bottom of the screen.
  // Thick layered look with a subtle highlight rim for dimension/texture.
  monitorFrame: {
    flex: 1,
    marginHorizontal: '15%',
    marginVertical: '4%',
    backgroundColor: 'transparent',
    boxShadow: '0px 10px 16px rgba(0, 0, 0, 0.75)',
    elevation: 10,
    overflow: 'hidden',
  },
  monitorFrameSmall: {
    marginHorizontal: 0,
    marginVertical: 0,
  },
  // Outer bezel highlight (top sheen) — gives the bezel a subtle 3D bevel.
  monitorHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
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
    pointerEvents: 'none',
  },
  // Inner container holds the canvas; decorative overlays are absolutely
  // positioned on top via zIndex.
  canvasContainer: {
    flex: 1,
    position: 'relative',
    margin: 14,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.7)',
    elevation: 4,
  },
  canvasContainerSmall: {
    margin: 0,
    boxShadow: 'none',
    elevation: 0,
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#020617',
  },
});
