import { maxCPFor, modifierFor } from '../src/lib/game/types';
import type { Player } from '../src/lib/game/types';

const basePlayer: Player = {
  id: 'p1',
  name: 'Test',
  class: 'lead',
  pairedSupportIds: [],
  computersRanks: 4,
  computersModifier: 4,
  deceiveModifier: 4,
  hackModifier: 5,
  processModifier: 4,
  personaModifier: 0,
  personaModifierLimit: 1,
  resolvePoints: 3,
  currentCP: 20,
  maxCP: 20,
  ejected: false,
};

describe('game helpers', () => {
  test('maxCPFor = 12 + 2*ranks', () => {
    expect(maxCPFor(4)).toBe(20);
    expect(maxCPFor(0)).toBe(12);
    expect(maxCPFor(8)).toBe(28);
  });

  test('modifierFor returns the right subskill', () => {
    expect(modifierFor(basePlayer, 'deceive')).toBe(4);
    expect(modifierFor(basePlayer, 'hack')).toBe(5);
    expect(modifierFor(basePlayer, 'process')).toBe(4);
  });
});