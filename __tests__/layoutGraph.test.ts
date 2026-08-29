import { CANVAS_HEIGHT, CANVAS_WIDTH, NODE_WIDTH, ROW_HEIGHT, layoutGraph, nodeFaceAnchor } from '../src/lib/flow/layoutGraph';
import type { FlowMap } from '../src/lib/flow/types';

function makeMap(childCount: number): FlowMap {
  return {
    id: 'radial-test',
    name: 'Radial test',
    tier: 1,
    updatedAt: '',
    nodes: [
      { id: 'parent', name: 'Parent', x: 0, y: 0, category: 'access' },
      ...Array.from({ length: childCount }, (_, index) => ({
        id: `child-${index}`,
        name: `Child ${index}`,
        x: 0,
        y: 0,
        category: 'module' as const,
      })),
    ],
    edges: Array.from({ length: childCount }, (_, index) => ({
      id: `edge-${index}`,
      fromNodeId: 'parent',
      toNodeId: `child-${index}`,
    })),
  };
}

describe('layoutGraph radial placement', () => {
  test('assigns the six faces before reusing one', () => {
    const positions = layoutGraph(makeMap(7)).positions;
    const parent = positions.get('parent')!;
    const distances = Array.from({ length: 7 }, (_, index) => {
      const child = positions.get(`child-${index}`)!;
      return Math.round(Math.atan2(child.y - parent.y, child.x - parent.x) * 180 / Math.PI);
    });

    expect(new Set(distances.slice(0, 6)).size).toBe(6);
    expect(distances).toHaveLength(7);
    expect(distances.every((angle) => [-150, -90, -30, 30, 90, 150].includes(angle))).toBe(true);
    expect(Array.from(positions.values()).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(parent).toEqual({ x: CANVAS_WIDTH / 2 - NODE_WIDTH / 2, y: CANVAS_HEIGHT / 2 - NODE_WIDTH / 2 });
    expect(NODE_WIDTH).toBe(100);
    expect(ROW_HEIGHT).toBeGreaterThan(NODE_WIDTH);
  });

  test('anchors each edge on the facing hexagon faces', () => {
    const parent = { x: 100, y: 100 };
    const child = { x: 320, y: 100 };
    const source = nodeFaceAnchor(parent, child);
    const target = nodeFaceAnchor(child, parent);

    expect(source.x).toBeGreaterThan(parent.x + NODE_WIDTH / 2);
    expect(target.x).toBeLessThan(child.x + NODE_WIDTH / 2);
    expect(source.y).toBeCloseTo(parent.y + NODE_WIDTH / 2);
    expect(target.y).toBeCloseTo(child.y + NODE_WIDTH / 2);
  });
});
