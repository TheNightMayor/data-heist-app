import { resolve, resolveAgainstObjective, describeOutcome } from '../src/lib/resolution';

describe('resolution engine — RP spend', () => {
  test('RP spend auto-succeeds regardless of roll', () => {
    const out = resolve({ d20: 1, modifier: -5, dc: 50, spendRP: true });
    expect(out.kind).toBe('rp-spend');
    expect(out.successes).toBe(1);
    expect(out.hazardSkip).toBe(false);
  });

  test('RP spend even at high DC returns 1 success', () => {
    const out = resolve({ d20: 10, modifier: 0, dc: 100, spendRP: true });
    expect(out.successes).toBe(1);
  });
});

describe('resolution engine — nat 20', () => {
  test('nat 20 returns 1 success (no auto-promotion)', () => {
    const out = resolve({ d20: 20, modifier: 0, dc: 25 });
    expect(out.kind).toBe('nat20');
    expect(out.successes).toBe(1);
    expect(out.hazardSkip).toBe(false);
    expect(out.total).toBe(20);
  });

  test('nat 20 vs high DC still succeeds', () => {
    const out = resolve({ d20: 20, modifier: 0, dc: 50 });
    expect(out.kind).toBe('nat20');
    expect(out.successes).toBe(1);
  });
});

describe('resolution engine — beat by 10+ (major success)', () => {
  test('margin >= 10 grants 2 successes + hazard skip', () => {
    // d20=18, mod=7 → total 25, DC 15 → margin 10
    const out = resolve({ d20: 18, modifier: 7, dc: 15 });
    expect(out.kind).toBe('major-success');
    expect(out.successes).toBe(2);
    expect(out.hazardSkip).toBe(true);
  });

  test('beat-by-5 is standard success (no bonus)', () => {
    const out = resolve({ d20: 15, modifier: 5, dc: 15 }); // total 20, margin 5
    expect(out.kind).toBe('standard-success');
    expect(out.successes).toBe(1);
    expect(out.hazardSkip).toBe(false);
  });

  test('nat 20 short-circuits to nat20 (not major-success), even with margin >= 10', () => {
    // d20=20 always returns nat20 with 1 success, per strict 1e.
    const out = resolve({ d20: 20, modifier: 7, dc: 15 });
    expect(out.kind).toBe('nat20');
    expect(out.successes).toBe(1);
  });
});

describe('resolution engine — standard success', () => {
  test('beat by 1 grants 1 success', () => {
    const out = resolve({ d20: 11, modifier: 5, dc: 15 }); // total 16, margin 1
    expect(out.kind).toBe('standard-success');
    expect(out.successes).toBe(1);
  });

  test('exact match (margin 0) is standard success', () => {
    const out = resolve({ d20: 10, modifier: 5, dc: 15 }); // total 15, margin 0
    expect(out.kind).toBe('standard-success');
    expect(out.successes).toBe(1);
  });

  test('miss by 1 is failure', () => {
    const out = resolve({ d20: 9, modifier: 5, dc: 15 }); // total 14, margin -1
    expect(out.kind).toBe('failure');
    expect(out.successes).toBe(0);
  });
});

describe('resolution engine — failure', () => {
  test('miss by 1 is failure (0 successes, no extra penalty)', () => {
    const out = resolve({ d20: 14, modifier: 0, dc: 15 }); // total 14, miss by 1
    expect(out.kind).toBe('failure');
    expect(out.successes).toBe(0);
    expect(out.hazardSkip).toBe(false);
  });

  test('miss by 10 is still just failure (no crit fail)', () => {
    const out = resolve({ d20: 5, modifier: 0, dc: 15 });
    expect(out.kind).toBe('failure');
    expect(out.successes).toBe(0);
  });
});

describe('resolution engine — nat 1', () => {
  test('nat 1 always fails with 0 successes', () => {
    const out = resolve({ d20: 1, modifier: 100, dc: 1 }); // would be major success without nat 1
    expect(out.kind).toBe('nat1');
    expect(out.successes).toBe(0);
  });

  test('nat 1 rolls 1d6 for CP damage (1..6)', () => {
    const out = resolve({ d20: 1, modifier: 0, dc: 50 });
    expect(out.cpDamageRoll).toBeGreaterThanOrEqual(1);
    expect(out.cpDamageRoll).toBeLessThanOrEqual(6);
  });
});

describe('resolveAgainstObjective — multi-success capping', () => {
  test('multi-success objective caps applied at successesRequired', () => {
    // Major success = 2 successes (raw), but objective only needs 1 → applied = 1
    const { outcome, applied } = resolveAgainstObjective(
      { d20: 18, modifier: 7, dc: 15 }, // total 25, margin 10, major success
      1,
    );
    expect(outcome.successes).toBe(2);
    expect(applied).toBe(1);
  });

  test('multi-success objective of 2 takes full 2 from major success', () => {
    const { outcome, applied } = resolveAgainstObjective(
      { d20: 18, modifier: 7, dc: 15 },
      2,
    );
    expect(outcome.successes).toBe(2);
    expect(applied).toBe(2);
  });

  test('standard success gives 1 success, capped at successesRequired', () => {
    const { outcome, applied } = resolveAgainstObjective(
      { d20: 12, modifier: 5, dc: 15 }, // total 17, margin 2, standard
      2,
    );
    expect(outcome.successes).toBe(1);
    expect(applied).toBe(1);
  });
});

describe('describeOutcome', () => {
  test('produces non-empty strings for all kinds', () => {
    const samples = [
      resolve({ d20: 5, modifier: 0, dc: 10, spendRP: true }),
      resolve({ d20: 20, modifier: 0, dc: 10 }),
      resolve({ d20: 18, modifier: 5, dc: 10 }), // major success
      resolve({ d20: 12, modifier: 0, dc: 10 }), // standard
      resolve({ d20: 5, modifier: 0, dc: 10 }),  // failure
      resolve({ d20: 1, modifier: 0, dc: 10 }),  // nat 1
    ];
    for (const s of samples) {
      const text = describeOutcome(s);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});