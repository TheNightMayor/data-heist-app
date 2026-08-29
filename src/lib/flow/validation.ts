import type { FlowMap } from './types';

/** Return target IDs protected by more than one Firewall. */
export function overlappingFirewallTargets(map: FlowMap): string[] {
  const firewallCountByTarget = new Map<string, number>();
  const moduleIds = new Set(map.nodes.filter((node) => node.category === 'module').map((node) => node.id));
  for (const node of map.nodes) {
    if (node.category !== 'countermeasure' || node.countermeasureType !== 'firewall') continue;
    for (const targetId of node.targetNodeIds ?? []) {
      if (!moduleIds.has(targetId)) continue;
      firewallCountByTarget.set(targetId, (firewallCountByTarget.get(targetId) ?? 0) + 1);
    }
  }

  return [...firewallCountByTarget.entries()]
    .filter(([, count]) => count > 1)
    .map(([targetId]) => targetId);
}

export function shockGridsWithInvalidRank(map: FlowMap): string[] {
  return map.nodes
    .filter((node) => {
      const rank = node.countermeasureRank;
      return node.category === 'countermeasure'
        && node.countermeasureType === 'shock-grid'
        && (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > 5);
    })
    .map((node) => node.id);
}

export function multipleShockGrids(map: FlowMap): string[] {
  return map.nodes
    .filter((node) => node.category === 'countermeasure' && node.countermeasureType === 'shock-grid')
    .map((node) => node.id)
    .slice(1);
}

