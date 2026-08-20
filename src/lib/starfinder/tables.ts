/**
 * Starfinder-style DC tables and objective presets.
 * Centralized so rebalancing the game is a one-file change.
 */

import type { ObjectiveResolve, Subskill } from '../flow/types';

/**
 * Starfinder 1e: base DC to hack a computer = 13 + 4 × tier.
 * (We round 4×tier since tiers are integers; matches the official table.)
 */
export function dcForTier(tier: number): number {
  const t = Math.max(1, Math.min(10, Math.floor(tier)));
  return 13 + 4 * t;
}

/**
 * Compute the effective DC for a Resolve check against a node.
 * Adds the objective's dcModifier (if any) to the tier-based base DC.
 */
export function effectiveDC(tier: number, resolve?: ObjectiveResolve): number {
  const base = dcForTier(tier);
  return base + (resolve?.dcModifier ?? 0);
}

/**
 * Sample objective presets for Build mode.
 * Designers can use these as starting points.
 */
export const OBJECTIVE_PRESETS: Record<string, ObjectiveResolve> = {
  // Module (data) — easier, single-success
  basicModule: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
  // Module (hardened) — beat-by-10 multi-success
  hardenedModule: { subskill: 'hack', dcModifier: 0, successesRequired: 2 },
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