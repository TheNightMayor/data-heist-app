import { dcForTier, effectiveDC, OBJECTIVE_PRESETS, securityBonusForMap, SUBSKILL_LABELS } from '../src/lib/starfinder/tables';
import type { FlowMap } from '../src/lib/flow/types';

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
    expect(effectiveDC(1, OBJECTIVE_PRESETS.access)).toBe(15); // access is -2
    expect(effectiveDC(3, OBJECTIVE_PRESETS.hardenedModule)).toBe(25);
  });

  test('effectiveDC supports a custom base DC override', () => {
    expect(effectiveDC(1, { subskill: 'hack', dcOverride: 22, successesRequired: 1 })).toBe(22);
    expect(effectiveDC(1, { subskill: 'hack', dcOverride: 22, dcModifier: 2, successesRequired: 1 }, 1)).toBe(25);
  });

  test('root access is DC 20 above the map DC', () => {
    expect(effectiveDC(3, undefined, 0, false, true)).toBe(45);
  });

  test('root access makes later node checks DC 10', () => {
    expect(effectiveDC(3, undefined, 0, true)).toBe(10);
  });

  test('uncollected Security modules raise DCs until collected', () => {
    const map = {
      id: 'security-test', name: 'Security Test', tier: 1, nodes: [
        { id: 'security-1', name: 'Security I', x: 0, y: 0, category: 'module', security: 1 },
        { id: 'security-2', name: 'Security I', x: 80, y: 0, category: 'module', tier: 1, security: 1 },
        { id: 'security-3', name: 'Security I', x: 160, y: 0, category: 'module', tier: 1, security: 1 },
      ], edges: [], updatedAt: '',
    } as FlowMap;

    expect(securityBonusForMap(map)).toBe(1);
    expect(effectiveDC(1, undefined, securityBonusForMap(map))).toBe(18);
    expect(securityBonusForMap(map, ['security-1', 'security-2'])).toBe(1);
    expect(securityBonusForMap(map, ['security-1', 'security-2', 'security-3'])).toBe(0);
    expect(effectiveDC(1, undefined, securityBonusForMap(map, ['security-1', 'security-2', 'security-3']))).toBe(17);
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