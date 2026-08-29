/**
 * TravelLine — animated edge highlight between two nodes.
 *
 * When a countermeasure is selected, its target paths are drawn over the
 * existing circuit traces as thicker cyan strokes with moving dashed overlays.
 *
 * Falls through to `null` (renders nothing) when no active edge exists.
 */

import { useEffect } from 'react';
import { Circle, G, Path } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { FlowNode, FlowEdge } from '@/lib/flow/types';
import { nodeFaceAnchor } from '@/lib/flow/layoutGraph';
import { circuitPath } from './circuitPath';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedGroup = Animated.createAnimatedComponent(G);
const DASH_SPEED = 12.5;

function WipingTargetGroup({ wiping, children }: { wiping: boolean; children: React.ReactNode }) {
  const wipeOpacity = useSharedValue(1);
  useEffect(() => {
    wipeOpacity.value = withTiming(wiping ? 0 : 1, { duration: 900 });
  }, [wipeOpacity, wiping]);

  const animatedProps = useAnimatedProps(() => ({ opacity: wipeOpacity.value }));
  return <AnimatedGroup animatedProps={animatedProps}>{children}</AnimatedGroup>;
}

function MovingTargetPath({ d, pathLength }: { d: string; pathLength: number }) {
  const dashOffset = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(dashOffset);
    dashOffset.value = withRepeat(
      withTiming(-pathLength, {
        duration: (pathLength / DASH_SPEED) * 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [dashOffset, pathLength]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  return (
    <AnimatedPath
      d={d}
      stroke="#22d3ee"
      strokeWidth={3}
      strokeLinecap="round"
      fill="none"
      strokeDasharray="10 20"
      animatedProps={animatedProps}
    />
  );
}

export function TravelLine({
  nodes,
  edges,
  selectedId,
  wipingNodeIds,
  hiddenCountermeasureIds,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedId?: string | null;
  wipingNodeIds?: Set<string>;
  hiddenCountermeasureIds?: Set<string>;
}) {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const selectedNode = selectedId ? nodeById.get(selectedId) : undefined;
  const sourceNodes = [
    ...(selectedNode?.category === 'countermeasure' ? [selectedNode] : []),
    ...nodes.filter((node) => {
      if (node.category !== 'countermeasure') return false;
      const targetIds = node.targetNodeIds?.length
        ? node.targetNodeIds
        : edges.filter((edge) => edge.fromNodeId === node.id).map((edge) => edge.toNodeId);
      return targetIds.some((targetId) => wipingNodeIds?.has(targetId));
    }),
  ].filter((node, index, all) => !hiddenCountermeasureIds?.has(node.id)
    && all.findIndex((candidate) => candidate.id === node.id) === index);
  const highlightedEdges = sourceNodes.flatMap((sourceNode) => {
    const targetIds = sourceNode.targetNodeIds?.length
      ? sourceNode.targetNodeIds
      : edges.filter((edge) => edge.fromNodeId === sourceNode.id).map((edge) => edge.toNodeId);
    return targetIds.filter((targetId) => !hiddenCountermeasureIds?.has(targetId)).map((targetId, index) => ({
      id: `target-${sourceNode.id}-${targetId}-${index}`,
      fromNodeId: sourceNode.id,
      toNodeId: targetId,
    }));
  });

  return (
    <>
      {highlightedEdges.map((edge) => {
        const from = nodeById.get(edge.fromNodeId);
        const to = nodeById.get(edge.toNodeId);
        if (!from || !to) return null;

        const sourceAnchor = nodeFaceAnchor(from, to);
        const targetAnchor = nodeFaceAnchor(to, from);
        const x1 = sourceAnchor.x;
        const y1 = sourceAnchor.y;
        const x2 = targetAnchor.x;
        const y2 = targetAnchor.y;
        const { d, points } = circuitPath(x1, y1, x2, y2);
        const pathLength = points.slice(1).reduce((length, point, index) => {
          const previous = points[index];
          return length + Math.hypot(point.x - previous.x, point.y - previous.y);
        }, 0);

        return (
          <WipingTargetGroup key={edge.id} wiping={wipingNodeIds?.has(edge.toNodeId) ?? false}>
            <Path
              d={d}
              stroke="#22d3ee"
              strokeWidth={10}
              strokeLinecap="round"
              fill="none"
              opacity={0.15}
            />
            <MovingTargetPath d={d} pathLength={pathLength} />
            {points.slice(1, -1).map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={1.5} fill="#22d3ee" opacity={0.6} />
            ))}
            <Circle cx={x1} cy={y1} r={6} fill="#020617" stroke="#22d3ee" strokeWidth={2} />
            <Circle cx={x1} cy={y1} r={2.5} fill="#22d3ee" />
            <Circle cx={x2} cy={y2} r={6} fill="#020617" stroke="#22d3ee" strokeWidth={2} />
            <Circle cx={x2} cy={y2} r={2.5} fill="#22d3ee" />
          </WipingTargetGroup>
        );
      })}
    </>
  );
}
