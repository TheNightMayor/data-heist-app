/**
 * Pure resolution engine.
 *
 * Given a d20 roll, modifier, DC, and optional flags, returns an Outcome.
 *
 * Rules (Starfinder 1e pass/fail + Dynamic Hacking multi-success):
 *  - Spend RP → 1 success regardless of roll (set spendRP=true at call site)
 *  - Nat 20 → auto-success, 1 success (NO auto-promotion to 2; strict 1e)
 *  - Beat DC by 10+ → 2 successes (if multi-success objective), unlocks hazard-skip
 *  - Beat DC by 1–9 → 1 success
 *  - Miss DC → 0 successes; hazard countdown ticks by 1 if hazard is present
 *  - Nat 1 → 0 successes + 1d6 CP damage roll (handled at call site; engine just signals)
 *
 * NO SF2e-style "exceed by 5+" tiers — those were removed in plan revision.
 * NO miss-by-5 extra penalty — also removed.
 */

import { rollD6 } from './dice';

export type OutcomeKind =
  | 'rp-spend'
  | 'nat20'
  | 'major-success' // beat by 10+
  | 'standard-success' // beat by 1-9
  | 'failure'
  | 'nat1';

export interface Outcome {
  kind: OutcomeKind;
  /** d20 + modifier total. */
  total: number;
  /** Raw d20 roll (always present unless this was an RP spend). */
  d20?: number;
  /** How many successes this outcome grants. 0, 1, or 2. */
  successes: number;
  /** True if this outcome unlocks the hazard-skip for the next hazard node. */
  hazardSkip: boolean;
  /** For nat 1: rolled 1d6 for CP damage roll. Caller resolves to actual CP loss. */
  cpDamageRoll?: number;
}

export interface ResolveInput {
  /** Raw d20 value. Ignored if spendRP is true. */
  d20: number;
  /** Modifier applied to the roll. */
  modifier: number;
  /** Difficulty class the roll is compared against. */
  dc: number;
  /** True if the player spent an RP for an auto-success (Mode A). */
  spendRP?: boolean;
}

export function resolve(input: ResolveInput): Outcome {
  const { d20, modifier, dc, spendRP } = input;

  // RP spend — auto-success, 1 success, no roll required.
  if (spendRP) {
    return {
      kind: 'rp-spend',
      total: dc, // for display only
      successes: 1,
      hazardSkip: false,
    };
  }

  const total = d20 + modifier;

  // Nat 20 — auto-success, 1 success (strict 1e: no auto-promotion to 2).
  if (d20 === 20) {
    return {
      kind: 'nat20',
      d20,
      total,
      successes: 1,
      hazardSkip: false,
    };
  }

  // Nat 1 — auto-fail, 0 successes, 1d6 CP damage roll.
  if (d20 === 1) {
    return {
      kind: 'nat1',
      d20,
      total,
      successes: 0,
      hazardSkip: false,
      cpDamageRoll: rollD6(),
    };
  }

  const margin = total - dc;

  if (margin >= 10) {
    // Major success — 2 successes (if objective requires multiple) + hazard skip.
    // Note: nat 20 is caught above and never reaches here.
    return {
      kind: 'major-success',
      d20,
      total,
      successes: 2,
      hazardSkip: true,
    };
  }

  if (margin >= 0) {
    // Standard success — beat or tie DC. 1 success.
    return {
      kind: 'standard-success',
      d20,
      total,
      successes: 1,
      hazardSkip: false,
    };
  }

  // Failure — 0 successes. Hazard countdown (if any) handled at call site.
  return {
    kind: 'failure',
    d20,
    total,
    successes: 0,
    hazardSkip: false,
  };
}

/**
 * Resolve against a specific objective, capping successes at successesRequired.
 * Returns the actual number of successes applied to the objective.
 */
export function resolveAgainstObjective(
  input: ResolveInput,
  successesRequired: number,
): { outcome: Outcome; applied: number } {
  const outcome = resolve(input);
  const applied = Math.min(outcome.successes, successesRequired);
  return { outcome, applied };
}

/** Human-readable label for an outcome. */
export function describeOutcome(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'rp-spend':
      return 'Auto-success (Resolve Point)';
    case 'nat20':
      return 'Nat 20! Auto-success';
    case 'major-success':
      return `Major success (+${outcome.total}). 2 successes, hazard-skip unlocked.`;
    case 'standard-success':
      return `Success (+${outcome.total}). 1 success.`;
    case 'failure':
      return `Failure (${outcome.total}).`;
    case 'nat1':
      return `Nat 1! Auto-fail. CP damage roll: ${outcome.cpDamageRoll}.`;
  }
}