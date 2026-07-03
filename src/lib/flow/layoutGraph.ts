/**
 * layoutGraph — BFS-based auto-layout for FlowMaps.
 *
 * Computes pixel positions for every node in a FlowMap, anchored at the
 * start gateway and fanning upward through topological levels. Pure
 * function with no React dependencies so it can be tested in isolation
 * and reused by any renderer.
 *
 * Convention:
 *  - Level 0 (start) sits at the bottom of the layout band.
 *  - Each subsequent level moves UP by ROW_HEIGHT.
 *  - Within a level, nodes are spread horizontally and sorted
 *    alphabetically by id for stable rendering.
 *  - Disconnected nodes are placed in a synthetic top row so they
 *    remain visible.
 */

import type { FlowEdge, FlowMap, FlowNode } from './types';

/** Total virtual canvas size used as a coordinate space for layout. */
export const CANVAS_WIDTH = 3200;
export const CANVAS_HEIGHT = 2800;

/** Vertical distance between layout levels. */
export const ROW_HEIGHT = 220;

/** Width and height of a single node (square). */
export const NODE_WIDTH = 100;

/** Horizontal padding between sibling nodes within a row. */
export const ROW_PADDING = 80;

/** Center-to-center horizontal stride between sibling nodes. */
export const NODE_GAP = 140;

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

  // Find start node: prefer gateway category, leftmost in the original map.
  const gateways = map.nodes.filter((n) => n.category === 'gateway');
  const start = gateways.length > 0
    ? gateways.reduce((a, b) => (a.x < b.x ? a : b))
    : map.nodes.reduce((a, b) => (a.x < b.x ? a : b));
  const startId = start.id;

  // Build adjacency for BFS.
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

  // Disconnected nodes: place at a synthetic top row.
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

  // Group nodes by level.
  const byLevel = new Map<number, string[]>();
  for (const id of order) {
    const lvl = levelById.get(id) ?? 0;
    const arr = byLevel.get(lvl) ?? [];
    arr.push(id);
    byLevel.set(lvl, arr);
  }
  // Sort each level alphabetically for stable rendering.
  for (const ids of byLevel.values()) ids.sort();

  // Position rows centered vertically on the canvas midpoint so the
  // layout sits in the middle of the grid rather than glued to the
  // bottom. Level 0 (start) is at the bottom; deeper levels go up.
  const cx = CANVAS_WIDTH / 2;
  const layoutLevels = maxLevel + 1;
  const layoutHeight = (layoutLevels - 1) * ROW_HEIGHT + NODE_WIDTH;
  const layoutTop = (CANVAS_HEIGHT - layoutHeight) / 2;
  const layoutBottom = layoutTop + layoutHeight;
  for (const [lvl, ids] of byLevel) {
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
