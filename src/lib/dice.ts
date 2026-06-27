/**
 * Pure dice helpers. No React, no Expo — fully unit-testable.
 */

export interface RollResult {
  /** The raw d20 value (1..20). */
  d20: number;
  /** The modifier added. */
  modifier: number;
  /** d20 + modifier. */
  total: number;
}

/** Roll a single d20. Defaults to crypto.getRandomValues for fair rolls. */
export function rollD20(rng: () => number = defaultRng): number {
  const n = rng();
  // Map [0,1) to [1, 20] inclusive.
  return Math.floor(n * 20) + 1;
}

/** Roll a d20 and add a modifier. */
export function rollWithModifier(modifier: number, rng: () => number = defaultRng): RollResult {
  const d20 = rollD20(rng);
  return { d20, modifier, total: d20 + modifier };
}

/** Roll 1d6 (used by Nat 1 CP damage check). */
export function rollD6(rng: () => number = defaultRng): number {
  return Math.floor(rng() * 6) + 1;
}

/** Default RNG — uses crypto.getRandomValues when available, falls back to Math.random. */
export function defaultRng(): number {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 0xffffffff;
  }
  return Math.random();
}