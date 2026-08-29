/**
 * Starfinder-style DC tables and objective presets.
 * Centralized so rebalancing the game is a one-file change.
 */

import type { FlowMap, ObjectiveResolve, Subskill } from '../flow/types';
import { BASIC_MODULE_RESOLVE, HARDENED_MODULE_RESOLVE } from '../flow/modules';

/**
 * Starfinder 1e: base DC to hack a computer = 13 + 4 × tier.
 * (We round 4×tier since tiers are integers; matches the official table.)
 */
export function dcForTier(tier: number): number {
  const t = Math.max(1, Math.min(10, Math.floor(tier)));
  return 13 + 4 * t;
}

/**
 * Compute the effective DC for a check against a node.
 * Root access reduces subsequent DCs by 20.
 */
export function effectiveDC(tier: number, resolve?: ObjectiveResolve, securityBonus = 0, rootAccess = false): number {
  const base = resolve?.dcOverride ?? dcForTier(tier);
  return base + securityBonus + (resolve?.dcModifier ?? 0) - (rootAccess ? 20 : 0);
}

/** Highest active Security-module bonus before the listed modules are collected. */
export function securityBonusForMap(map: FlowMap, collectedNodeIds: Iterable<string> = []): number {
  const collected = new Set(collectedNodeIds);
  return Math.min(4, map.nodes.reduce((bonus, node) => (
    node.category === 'module' && !collected.has(node.id) ? Math.max(bonus, node.security ?? 0) : bonus
  ), 0));
}

export const SHOCK_GRID_RANKS = {
  1: { dc: 20, damage: '8d6' },
  2: { dc: 22, damage: '10d6' },
  3: { dc: 24, damage: '12d6' },
  4: { dc: 27, damage: '14d6' },
  5: { dc: 30, damage: '16d6' },
} as const;

export type ShockGridRank = keyof typeof SHOCK_GRID_RANKS;

/**
 * Sample objective presets for Build mode.
 * Designers can use these as starting points.
 */
export const OBJECTIVE_PRESETS: Record<string, ObjectiveResolve> = {
  basicModule: BASIC_MODULE_RESOLVE,
  hardenedModule: HARDENED_MODULE_RESOLVE,
  // Countermeasure (basic firewall) — Deceive+Hack
  firewall: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
  // Countermeasure (counterhacker) — multi-success, dangerous
  counterhacker: { subskill: 'deceive', dcModifier: 0, successesRequired: 2 },
  // Access — easiest, one success
  access: { subskill: 'hack', dcModifier: -2, successesRequired: 1 },
};

/** Subskill labels for UI. */
export const SUBSKILL_LABELS: Record<Subskill, string> = {
  deceive: 'Deceive',
  hack: 'Hack',
  process: 'Process',
};