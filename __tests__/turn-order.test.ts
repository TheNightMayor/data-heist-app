jest.mock('nanoid', () => {
  let i = 0;
  return { nanoid: () => `fixed-${++i}` };
});
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: async () => null, setItem: async () => null, removeItem: async () => null } }));
import { useGameStore } from '../src/stores/gameStore';

describe('turn order pairing', () => {
  it('places paired supports before their lead', () => {
    const store = useGameStore;
    // Ensure clean state
    store.getState().endGame();

    const map = { id: 'map1', name: 'Map 1' } as any;
    const players = [
      { name: 'LeadAlice', class: 'lead', computersRanks: 1, draftId: 'd-lead1' },
      { name: 'SupportBob', class: 'support', computersRanks: 1, pairedLeadId: 'd-lead1', draftId: 'd-sup1' },
      { name: 'SupportEve', class: 'support', computersRanks: 1, pairedLeadId: 'd-lead1', draftId: 'd-sup2' },
    ] as any;

    store.getState().startGame(map, players);
    const state = store.getState().state!;

    const lead = state.players.find((p) => p.class === 'lead')!;
    const supports = state.players.filter((p) => p.class === 'support' && p.pairedLeadId === lead.id);
    const leadIndex = state.turnOrder.indexOf(lead.id);

    expect(leadIndex).toBeGreaterThan(-1);
    expect(supports.length).toBeGreaterThan(0);

    for (const s of supports) {
      const idx = state.turnOrder.indexOf(s.id);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeLessThan(leadIndex);
    }
  });
});
