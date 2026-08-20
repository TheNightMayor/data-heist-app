/**
 * Reachability logic for Game mode.
 *
 * A node is "reachable" if:
 *  - It's the starting node (no incoming edges), OR
 *  - It's been **completed** (successes ≥ required) — even partially attempted but failed nodes do NOT unlock downstream, OR
 *  - Any of its incoming edges comes from a **completed** node (visited alone is not enough — must be succeeded)
 *
 * Hazard-flagged nodes are reachable ONLY if hazardSkip is active
 * (i.e. the previous action was a major success / beat-by-10+).
 */

import type { FlowMap, FlowNode, FlowEdge } from './types';
import type { ObjectiveProgress } from '../game/types';

export interface ReachabilityState {
  /** IDs of nodes the player has ever tapped. */
  visitedNodeIds?: Set<string>;
  /** Hazard-skip flag from the last major success. */
  hazardSkipActive?: boolean;
  /** Per-node progress keyed by node id (used to test "completed"). */
  objectives?: Record<string, ObjectiveProgress>;
  /**
   * IDs of nodes that have been permanently failed (e.g. countermeasure
   * countdown elapsed, or a flagged nat-1). Currently only the data slot is
   * wired — the trigger that populates this array is TODO.
   */
  permanentlyFailedNodeIds?: Set<string>;
  /** IDs of nodes concealed by a countermeasure. */
  hiddenNodeIds?: Set<string>;
  /** IDs currently showing a Wipe transition; does not affect reachability. */
  wipingNodeIds?: Set<string>;
}

/**
 * Visual / logical state of a node in Game mode.
 * Drives the border ring color and the clockwise progress overlay.
 */
export type NodeStatus =
  | 'available'
  | 'visited'
  | 'unlocked'
  | 'blocked'
  | 'concealed'
  | 'permanently-failed';

/** Has this node accumulated enough successes to count as "completed"? */
export function isCompleted(
  node: FlowNode,
  objectives: Record<string, ObjectiveProgress> = {},
): boolean {
  const required = node.resolve?.successesRequired ?? 1;
  const obj = objectives[node.id];
  return !!obj && obj.successes >= required;
}

export function isReachable(
  node: FlowNode,
  state: ReachabilityState,
  map: FlowMap,
): boolean {
  // Permanently-failed nodes are never reachable again.
  if (state.permanentlyFailedNodeIds?.has(node.id)) return false;
  if (state.hiddenNodeIds?.has(node.id)) return false;

  // Already-completed (or fully-visited-in-some-form) nodes stay reachable —
  // players can re-tap them for info, to retry after a failure, etc.
  if (state.visitedNodeIds?.has(node.id)) return true;

  // Find incoming edges.
  const incoming = map.edges.filter((e) => e.toNodeId === node.id);

  // No incoming edges → starting node.
  if (incoming.length === 0) return true;

  // Any incoming edge from a **completed** node → reachable.
  // Just being visited isn't enough — a node that was attempted but failed
  // must be retried (or a different path used) to unlock its children.
  const reachableFromCompleted = incoming.some((e) => {
    const parent = map.nodes.find((n) => n.id === e.fromNodeId);
    if (!parent) return false;
    return isCompleted(parent, state.objectives);
  });
  if (reachableFromCompleted) return true;

  // Hazard-flagged node can be reached via active hazard skip.
  if (node.hazard && state.hazardSkipActive) return true;

  return false;
}

/** Compute the set of reachable nodes given current state. */
export function reachableNodes(
  map: FlowMap,
  state: ReachabilityState,
): Set<string> {
  const result = new Set<string>();
  for (const node of map.nodes) {
    if (isReachable(node, state, map)) {
      result.add(node.id);
    }
  }
  return result;
}

/**
 * Compute the visual/logical status of a node given current game state.
 * Order matters — permanent failure wins over everything else.
 */
export function nodeStatus(
  node: FlowNode,
  state: ReachabilityState,
  map: FlowMap,
): NodeStatus {
  if (state.permanentlyFailedNodeIds?.has(node.id)) {
    return 'permanently-failed';
  }
  if (state.hiddenNodeIds?.has(node.id)) {
    return 'concealed';
  }
  if (isCompleted(node, state.objectives)) {
    return 'unlocked';
  }
  // "Visited" means attempted but not yet completed — i.e. partial progress
  // has been made (or the node has been tapped at least once without finishing).
  const obj = state.objectives?.[node.id];
  const partialProgress =
    (obj?.successes ?? 0) > 0 || !!state.visitedNodeIds?.has(node.id);
  if (partialProgress && isReachable(node, state, map)) {
    return 'visited';
  }
  if (isReachable(node, state, map)) {
    return 'available';
  }
  return 'blocked';
}

/**
 * Fraction of progress [0..1] for the clockwise border overlay.
 * Returns 0 for non-game / unstarted nodes.
 */
export function nodeProgress(
  node: FlowNode,
  state: Pick<ReachabilityState, 'objectives'>,
): number {
  // Nodes without a resolve entry have no progress to show.
  if (!node.resolve) return 0;
  const required = node.resolve.successesRequired;
  if (required <= 0) return 0;
  const successes = state.objectives?.[node.id]?.successes ?? 0;
  return Math.max(0, Math.min(1, successes / required));
}

/** Find outgoing edges from a given node. */
export function outgoingEdges(nodeId: string, edges: FlowEdge[]): FlowEdge[] {
  return edges.filter((e) => e.fromNodeId === nodeId);
}

/** Find all nodes connected downstream of a given node (transitively). */
export function downstreamNodes(
  nodeId: string,
  map: FlowMap,
): Set<string> {
  const result = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const next = outgoingEdges(id, map.edges).map((e) => e.toNodeId);
    for (const n of next) {
      if (!result.has(n) && n !== nodeId) {
        result.add(n);
        queue.push(n);
      }
    }
  }
  return result;
}

/** Find all nodes connected upstream of a given node (transitively). */
export function upstreamNodes(
  nodeId: string,
  map: FlowMap,
): Set<string> {
  const result = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const incoming = map.edges.filter((e) => e.toNodeId === id);
    for (const e of incoming) {
      if (!result.has(e.fromNodeId) && e.fromNodeId !== nodeId) {
        result.add(e.fromNodeId);
        queue.push(e.fromNodeId);
      }
    }
  }
  return result;
}