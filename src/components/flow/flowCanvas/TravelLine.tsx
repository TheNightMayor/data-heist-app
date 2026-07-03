/**
 * TravelLine — animated edge highlight between two nodes.
 *
 * When `activeId` matches the destination of an edge, that edge is
 * drawn over the existing circuit trace as a thicker cyan stroke with
 * a moving dashed overlay, giving a "data flowing" effect.
 *
 * Falls through to `null` (renders nothing) when no active edge exists.
 */

import { Circle, G, Path } from 'react-native-svg';
import type { FlowNode, FlowEdge } from '@/lib/flow/types';
import { NODE_WIDTH } from '@/lib/flow/layoutGraph';
import { circuitPath } from './circuitPath';

export function TravelLine({
  nodes,
  edges,
  activeId,
}: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  activeId: string | null;
}) {
  const edge = edges.find((e) => e.toNodeId === activeId);
  if (!edge) return null;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const from = nodeById.get(edge.fromNodeId);
  const to = nodeById.get(edge.toNodeId);
  if (!from || !to) return null;
  
  // Start is top-center of source (which is lower on screen, higher y)
  // End is bottom-center of target (which is higher on screen, lower y)
  const x1 = from.x + NODE_WIDTH / 2;
  const y1 = from.y;
  const x2 = to.x + NODE_WIDTH / 2;
  const y2 = to.y + NODE_WIDTH;

  const { d, points } = circuitPath(x1, y1, x2, y2);

  return (
    <G>
      <Path
        d={d}
        stroke="#22d3ee"
        strokeWidth={10}
        strokeLinecap="round"
        fill="none"
        opacity={0.15}
      />
      <Path
        d={d}
        stroke="#22d3ee"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
        strokeDasharray="10 20"
      />
      
      {/* Vias for travel line */}
      <Circle cx={x1} cy={y1} r={6} fill="#020617" stroke="#22d3ee" strokeWidth={2} />
      <Circle cx={x1} cy={y1} r={2.5} fill="#22d3ee" />
      
      {/* Corner dots for travel line */}
      {points.slice(1, -1).map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={1.5} fill="#22d3ee" opacity={0.6} />
      ))}

      <Circle cx={x2} cy={y2} r={6} fill="#020617" stroke="#22d3ee" strokeWidth={2} />
      <Circle cx={x2} cy={y2} r={2.5} fill="#22d3ee" />
    </G>
  );
}
