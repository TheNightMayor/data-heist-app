/**
 * layoutGraph — radial auto-layout for FlowMaps.
 *
 * Each node places its children around its six flat hexagon faces. The face
 * order is shuffled per parent, then consumed without repetition before it
 * is shuffled again. The hash-based shuffle keeps the result stable between
 * renders while still distributing children unpredictably.
 */

import type { FlowEdge, FlowMap, FlowNode } from './types';

/** Total virtual canvas size used as a coordinate space for layout. */
export const CANVAS_WIDTH = 3200;
export const CANVAS_HEIGHT = 2800;

/** Center-to-center distance between a parent and its children. */
export const ROW_HEIGHT = 220;

/** Width and height of a single node (square). */
export const NODE_WIDTH = 100;

/** Kept for compatibility with existing layout consumers. */
export const ROW_PADDING = 80;

/** Kept for compatibility with existing layout consumers. */
export const NODE_GAP = 140;

const FACE_ANGLES = [-Math.PI / 2, -Math.PI / 6, Math.PI / 6, Math.PI / 2, 5 * Math.PI / 6, 7 * Math.PI / 6];
const HEX_APOTHEM = (NODE_WIDTH * Math.sqrt(3)) / 4;

export function nodeFaceAnchor(node: NodePosition, toward: NodePosition): NodePosition {
  const center = { x: node.x + NODE_WIDTH / 2, y: node.y + NODE_WIDTH / 2 };
  const towardCenter = { x: toward.x + NODE_WIDTH / 2, y: toward.y + NODE_WIDTH / 2 };
  const dx = towardCenter.x - center.x;
  const dy = towardCenter.y - center.y;
  const angle = Math.atan2(dy, dx);
  const faceAngle = FACE_ANGLES.reduce((closest, candidate) => {
    const distance = Math.abs(Math.atan2(Math.sin(angle - candidate), Math.cos(angle - candidate)));
    const closestDistance = Math.abs(Math.atan2(Math.sin(angle - closest), Math.cos(angle - closest)));
    return distance < closestDistance ? candidate : closest;
  });
  const offsetAngle = angle - faceAngle;
  const distance = HEX_APOTHEM / Math.cos(offsetAngle);
  return {
    x: center.x + Math.cos(angle) * distance,
    y: center.y + Math.sin(angle) * distance,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledFaces(parentId: string): number[] {
  const faces = FACE_ANGLES.map((_, index) => index);
  let seed = hashString(parentId);
  for (let index = faces.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822519) >>> 0;
    const swapIndex = seed % (index + 1);
    [faces[index], faces[swapIndex]] = [faces[swapIndex], faces[index]];
  }
  return faces;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface LayoutResult {
  positions: Map<string, NodePosition>;
  startId: string | null;
  levelCount: number;
}

export function layoutGraph(map: FlowMap): LayoutResult {
  const positions = new Map<string, NodePosition>();
  if (map.nodes.length === 0) {
    return { positions, startId: null, levelCount: 0 };
  }

  // Find start node: prefer access category, leftmost in the original map.
  const accessNodes = map.nodes.filter((n) => n.category === 'access');
  const start = accessNodes.length > 0
    ? accessNodes.reduce((a, b) => (a.x < b.x ? a : b))
    : map.nodes.reduce((a, b) => (a.x < b.x ? a : b));
  const startId = start.id;

  // Build adjacency for radial traversal.
  const outById = new Map<string, string[]>();
  for (const n of map.nodes) outById.set(n.id, []);
  for (const e of map.edges) {
    const arr = outById.get(e.fromNodeId);
    if (arr) arr.push(e.toNodeId);
  }

  const parentFaces = new Map<string, number[]>();
  const parentFaceCycles = new Map<string, number>();
  const queue: string[] = [startId];
  positions.set(startId, {
    x: CANVAS_WIDTH / 2 - NODE_WIDTH / 2,
    y: CANVAS_HEIGHT / 2 - NODE_WIDTH / 2,
  });
  const placed = new Set<string>([startId]);
  let levelCount = 1;

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parent = positions.get(parentId)!;
    let faces = parentFaces.get(parentId) ?? [];
    const children = [...(outById.get(parentId) ?? [])].sort();

    for (const childId of children) {
      if (placed.has(childId)) continue;
      if (faces.length === 0) {
        const cycle = parentFaceCycles.get(parentId) ?? 0;
        faces = shuffledFaces(`${parentId}:${cycle}`);
        parentFaceCycles.set(parentId, cycle + 1);
      }
      const face = faces.shift()!;
      const angle = FACE_ANGLES[face];
      const childCenterX = parent.x + NODE_WIDTH / 2 + Math.cos(angle) * ROW_HEIGHT;
      const childCenterY = parent.y + NODE_WIDTH / 2 + Math.sin(angle) * ROW_HEIGHT;
      positions.set(childId, {
        x: childCenterX - NODE_WIDTH / 2,
        y: childCenterY - NODE_WIDTH / 2,
      });
      placed.add(childId);
      queue.push(childId);
      levelCount = Math.max(levelCount, Math.ceil(Math.hypot(
        positions.get(childId)!.x - CANVAS_WIDTH / 2,
        positions.get(childId)!.y - CANVAS_HEIGHT / 2,
      ) / ROW_HEIGHT) + 1);
    }
    parentFaces.set(parentId, faces);
  }

  // Keep disconnected nodes visible in a separate ring around the layout.
  const disconnected = map.nodes.filter((node) => !placed.has(node.id)).sort((a, b) => a.id.localeCompare(b.id));
  disconnected.forEach((node, index) => {
    const angle = (index / Math.max(disconnected.length, 1)) * Math.PI * 2;
    const radius = ROW_HEIGHT * Math.max(levelCount, 2);
    positions.set(node.id, {
      x: CANVAS_WIDTH / 2 - NODE_WIDTH / 2 + Math.cos(angle) * radius,
      y: CANVAS_HEIGHT / 2 - NODE_WIDTH / 2 + Math.sin(angle) * radius,
    });
  });

  return { positions, startId, levelCount };
}

/**
 * Apply layout positions to a list of nodes, returning a new array with
 * `x`/`y` overwritten. Nodes without a computed position are passed
 * through unchanged so they can be rendered with their original coords.
 *
 * The result fields are named `positionedNodes` / `positionedEdges` so
 * callers can destructure them as a unit ("the positioned graph") and
 * distinguish them from the input `map.nodes` / `map.edges`.
 */
export function applyLayout(map: FlowMap, layout: LayoutResult): {
  positionedNodes: FlowNode[];
  positionedEdges: FlowEdge[];
  startId: string | null;
} {
  const positionedNodes: FlowNode[] = map.nodes.map((n) => {
    const p = layout.positions.get(n.id);
    return p ? { ...n, x: p.x, y: p.y } : n;
  });
  const positionedEdges = map.edges.filter(
    (e) => layout.positions.has(e.fromNodeId) && layout.positions.has(e.toNodeId),
  );
  return { positionedNodes, positionedEdges, startId: layout.startId };
}
