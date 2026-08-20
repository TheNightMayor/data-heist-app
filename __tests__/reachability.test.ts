import { reachableNodes, isReachable, downstreamNodes, upstreamNodes, nodeStatus, nodeProgress } from '../src/lib/flow/reachability';
import type { FlowMap } from '../src/lib/flow/types';

const map: FlowMap = {
  id: 'm1',
  name: 'Test',
  updatedAt: '',
  nodes: [
    { id: 'a', name: 'A', x: 0, y: 0, category: 'access', tier: 1, resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 } },
    { id: 'b', name: 'B', x: 1, y: 0, category: 'module', tier: 1, resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 } },
    { id: 'c', name: 'C', x: 2, y: 0, category: 'access', tier: 1, hazard: true, resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 } },
    { id: 'd', name: 'D', x: 3, y: 0, category: 'module', tier: 1, resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 } },
  ],
  edges: [
    { id: 'e1', fromNodeId: 'a', toNodeId: 'b' },
    { id: 'e2', fromNodeId: 'b', toNodeId: 'c' },
    { id: 'e3', fromNodeId: 'c', toNodeId: 'd' },
  ],
};

describe('reachability', () => {
  test('starting node is reachable', () => {
    const r = isReachable(map.nodes[0], { visitedNodeIds: new Set(), hazardSkipActive: false }, map);
    expect(r).toBe(true);
  });

  test('downstream node is reachable only after predecessor is completed', () => {
    const d = map.nodes[3];
    // d is downstream of c. Without any progress, d is blocked.
    expect(isReachable(d, { visitedNodeIds: new Set(), hazardSkipActive: false }, map)).toBe(false);
    // c is visited but not completed → d still blocked.
    expect(isReachable(d, { visitedNodeIds: new Set(['a', 'b', 'c']), hazardSkipActive: false, objectives: {} }, map)).toBe(false);
    // c is completed (1/1) → d becomes reachable.
    expect(isReachable(
      d,
      {
        visitedNodeIds: new Set(['a', 'b', 'c']),
        hazardSkipActive: false,
        objectives: { c: { nodeId: 'c', successes: 1 } },
      },
      map,
    )).toBe(true);
  });

  test('hazard-flagged node is reachable with hazardSkip active', () => {
    const c = map.nodes[2];
    expect(isReachable(c, { visitedNodeIds: new Set(), hazardSkipActive: false }, map)).toBe(false);
    expect(isReachable(c, { visitedNodeIds: new Set(), hazardSkipActive: true }, map)).toBe(true);
  });

  test('reachableNodes returns the right set', () => {
    const set = reachableNodes(map, {
      visitedNodeIds: new Set(['a']),
      hazardSkipActive: false,
      objectives: {},
    });
    expect(set.has('a')).toBe(true); // visited, always reachable
    expect(set.has('b')).toBe(false); // a is visited but not completed → b is blocked
    expect(set.has('c')).toBe(false); // not yet reachable
    expect(set.has('d')).toBe(false);
  });

  test('downstreamNodes traverses edges transitively', () => {
    const down = downstreamNodes('a', map);
    expect(down.has('b')).toBe(true);
    expect(down.has('c')).toBe(true);
    expect(down.has('d')).toBe(true);
    expect(down.has('a')).toBe(false);
  });

  test('upstreamNodes traverses edges transitively', () => {
    const up = upstreamNodes('d', map);
    expect(up.has('c')).toBe(true);
    expect(up.has('b')).toBe(true);
    expect(up.has('a')).toBe(true);
    expect(up.has('d')).toBe(false);
  });
});

describe('nodeStatus', () => {
  const baseState = (overrides: Partial<Parameters<typeof nodeStatus>[1]> = {}) => ({
    visitedNodeIds: new Set<string>(),
    hazardSkipActive: false,
    permanentlyFailedNodeIds: new Set<string>(),
    objectives: {},
    ...overrides,
  });

  test('starting node with no progress is available', () => {
    expect(nodeStatus(map.nodes[0], baseState(), map)).toBe('available');
  });

  test('downstream node with no progress is blocked', () => {
    expect(nodeStatus(map.nodes[1], baseState(), map)).toBe('blocked');
  });

  test('attempted node with no successes yet is visited', () => {
    expect(nodeStatus(map.nodes[0], baseState({ visitedNodeIds: new Set(['a']) }), map)).toBe('visited');
  });

  test('node with partial successes is visited', () => {
    // Use a 2-success node so partial progress is observable.
    const bWithTwoReq = { ...map.nodes[1], resolve: { subskill: 'hack' as const, dcModifier: 0, successesRequired: 2 } };
    const objectives = {
      a: { nodeId: 'a', successes: 1 },
      b: { nodeId: 'b', successes: 1 },
    };
    expect(nodeStatus(bWithTwoReq, baseState({ objectives }), map)).toBe('visited');
  });

  test('node with full successes is unlocked', () => {
    const objectives = { a: { nodeId: 'a', successes: 1 } };
    expect(nodeStatus(map.nodes[0], baseState({ objectives }), map)).toBe('unlocked');
  });

  test('permanently-failed wins over everything else', () => {
    const objectives = { a: { nodeId: 'a', successes: 1 } };
    const state = baseState({
      objectives,
      permanentlyFailedNodeIds: new Set(['a']),
    });
    expect(nodeStatus(map.nodes[0], state, map)).toBe('permanently-failed');
    expect(isReachable(map.nodes[0], state, map)).toBe(false);
  });
});

describe('nodeProgress', () => {
  test('returns 0 when no objective progress', () => {
    expect(nodeProgress(map.nodes[0], { objectives: {} })).toBe(0);
  });

  test('returns ratio of successes to required', () => {
    const objectives = { a: { nodeId: 'a', successes: 1 } };
    // a has successesRequired 1 → 1.0
    expect(nodeProgress(map.nodes[0], { objectives })).toBe(1);
  });

  test('clamps to [0, 1]', () => {
    const objectives = { a: { nodeId: 'a', successes: 5 } };
    expect(nodeProgress(map.nodes[0], { objectives })).toBe(1);
  });

  test('returns 0 for nodes without resolve (successesRequired = 0)', () => {
    const plain = { ...map.nodes[0], resolve: undefined } as any;
    const objectives = { a: { nodeId: 'a', successes: 5 } };
    expect(nodeProgress(plain, { objectives })).toBe(0);
  });
});