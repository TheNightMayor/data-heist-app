import { rollD20, rollWithModifier, rollD6 } from '../src/lib/dice';

describe('dice helpers', () => {
  test('rollD20 returns values in [1, 20]', () => {
    for (let i = 0; i < 200; i++) {
      const n = rollD20();
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(20);
    }
  });

  test('rollWithModifier combines d20 + modifier', () => {
    const r = rollWithModifier(5);
    expect(r.modifier).toBe(5);
    expect(r.total).toBe(r.d20 + 5);
    expect(r.d20).toBeGreaterThanOrEqual(1);
    expect(r.d20).toBeLessThanOrEqual(20);
  });

  test('rollD6 returns values in [1, 6]', () => {
    for (let i = 0; i < 100; i++) {
      expect(rollD6()).toBeGreaterThanOrEqual(1);
      expect(rollD6()).toBeLessThanOrEqual(6);
    }
  });

  test('RNG injection works (deterministic)', () => {
    // 0.45 → floor(0.45 * 20) + 1 = 9 + 1 = 10
    const stub = () => 0.45;
    const r1 = rollWithModifier(0, stub);
    const r2 = rollWithModifier(0, stub);
    expect(r1.d20).toBe(10);
    expect(r2.d20).toBe(10);
    expect(r1.total).toBe(10);
  });
});