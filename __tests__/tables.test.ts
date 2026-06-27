import { dcForTier, effectiveDC, OBJECTIVE_PRESETS, SUBSKILL_LABELS } from '../src/lib/starfinder/tables';

describe('DC tables', () => {
  test('dcForTier matches Starfinder 1e formula 13 + 4*tier', () => {
    expect(dcForTier(1)).toBe(17);
    expect(dcForTier(2)).toBe(21);
    expect(dcForTier(3)).toBe(25);
    expect(dcForTier(5)).toBe(33);
    expect(dcForTier(10)).toBe(53);
  });

  test('dcForTier clamps to [1,10]', () => {
    expect(dcForTier(0)).toBe(17); // clamped up to 1
    expect(dcForTier(-5)).toBe(17);
    expect(dcForTier(15)).toBe(53); // clamped down to 10
  });

  test('effectiveDC adds objective modifier', () => {
    expect(effectiveDC(1)).toBe(17);
    expect(effectiveDC(1, OBJECTIVE_PRESETS.gateway)).toBe(15); // gateway is -2
    expect(effectiveDC(3, OBJECTIVE_PRESETS.hardenedModule)).toBe(25);
  });

  test('objective presets are well-formed', () => {
    for (const [name, p] of Object.entries(OBJECTIVE_PRESETS)) {
      expect(p.subskill).toMatch(/deceive|hack|process/);
      expect(p.successesRequired).toBeGreaterThanOrEqual(1);
      expect(typeof name).toBe('string');
    }
  });

  test('subskill labels are capitalized', () => {
    expect(SUBSKILL_LABELS.deceive).toBe('Deceive');
    expect(SUBSKILL_LABELS.hack).toBe('Hack');
    expect(SUBSKILL_LABELS.process).toBe('Process');
  });
});