/**
 * Game store — current GameState + dispatch wrapper.
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { reducer, type GameAction } from '../lib/game/turn';
import { maxCPFor } from '../lib/game/types';
import type { GameState, Player, CharacterClass, Subskill } from '../lib/game/types';
import type { FlowMap } from '../lib/flow/types';
import { saveGame } from '../lib/game/persistence';

interface SetupInput {
  name: string;
  class: CharacterClass;
  computersRanks: number;
  /** Optional override; defaults to computersModifier. */
  computersModifier?: number;
  deceiveModifier?: number;
  hackModifier?: number;
  processModifier?: number;
  personaModifier?: number;
  personaModifierLimit?: number;
  resolvePoints?: number;
  /** For Support class: which Lead ID is paired. */
  pairedLeadId?: string;
  /** Draft player id from setup UI (used to map pairings). */
  draftId?: string;
}

interface GameStore {
  state: GameState | null;
  map: FlowMap | null;
  normalizePlayers: (players: Player[]) => Player[];
  dispatch: (action: GameAction) => void;
  startGame: (map: FlowMap, players: SetupInput[], hackingMode?: 'basic' | 'dynamic') => void;
  endGame: () => void;
  loadGameFromState: (state: GameState, map: FlowMap) => void;
  persist: () => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  map: null,

  // Ensure every Support is paired to an existing Lead, rebuild pairedSupportIds,
  // and assign initiatives if missing. Returns a new Player[] copy.
  // This is used both on startGame and when loading persisted state.
  normalizePlayers: (players: Player[]): Player[] => {
    const copy = players.map((p) => ({ ...p }));
    const leads = copy.filter((p) => p.class === 'lead');
    if (leads.length === 0) return copy;
    const firstLead = leads[0];

    // Assign any support without a valid pairedLeadId to the first lead
    for (const p of copy) {
      if (p.class === 'support') {
        const valid = p.pairedLeadId && copy.some((q) => q.id === p.pairedLeadId && q.class === 'lead');
        if (!valid) p.pairedLeadId = firstLead.id;
      }
    }

    // Rebuild pairedSupportIds for each lead
    for (const l of copy.filter((p) => p.class === 'lead')) {
      l.pairedSupportIds = copy.filter((s) => s.class === 'support' && s.pairedLeadId === l.id).map((s) => s.id);
    }

    // Assign initiatives if missing: leads get spaced values, supports get lead - 1
    const leadList = copy.filter((p) => p.class === 'lead');
    for (let i = 0; i < leadList.length; i++) {
      const lead = leadList[i];
      const leadInitiative = (i + 1) * 10;
      const li = copy.find((p) => p.id === lead.id);
      if (li && li.initiative === undefined) li.initiative = leadInitiative;
      for (const supId of li!.pairedSupportIds) {
        const sp = copy.find((p) => p.id === supId);
        if (sp && sp.initiative === undefined) sp.initiative = leadInitiative - 1;
      }
    }

    // Any remaining without initiative get a high value
    for (let i = 0; i < copy.length; i++) {
      if (copy[i].initiative === undefined) copy[i].initiative = 1000 + i;
    }

    return copy;
  },

  startGame: (map, players, hackingMode = 'dynamic') => {
    const playersForMode = hackingMode === 'basic'
      ? [players.find((p) => p.class === 'lead') ?? players[0]].filter(Boolean)
      : players;
    // Map draft IDs (from setup UI) to newly generated player IDs so pairings survive
    const draftToNewId = new Map<string, string>();
    for (const p of playersForMode) {
      draftToNewId.set(p.draftId ?? nanoid(6), nanoid(8));
    }

    const builtPlayers: Player[] = playersForMode.map((p) => {
      const mod = p.computersModifier ?? p.computersRanks;
      const ranks = hackingMode === 'basic' ? 0 : p.computersRanks;
      const max = hackingMode === 'basic' ? 0 : maxCPFor(ranks);
      const newId = draftToNewId.get(p.draftId ?? '');
      return {
        id: newId ?? nanoid(8),
        name: p.name,
        class: p.class,
        pairedSupportIds: [],
        pairedLeadId: p.pairedLeadId ? draftToNewId.get(p.pairedLeadId) : undefined,
        computersRanks: ranks,
        computersModifier: mod,
        deceiveModifier: p.deceiveModifier ?? mod,
        hackModifier: p.hackModifier ?? mod,
        processModifier: p.processModifier ?? mod,
        personaModifier: p.personaModifier ?? 0,
        personaModifierLimit: p.personaModifierLimit ?? Math.floor(ranks / 3),
        resolvePoints: hackingMode === 'basic' ? 0 : (p.resolvePoints ?? 3),
        currentCP: max,
        maxCP: max,
        ejected: false,
      };
    });
    // Normalize players (ensures every Support is paired, rebuilds pairedSupportIds, assigns initiatives)
    const normalized = get().normalizePlayers(builtPlayers);
    // Build turn order by sorting players by `initiative` ascending. Tie-break: supports before leads, then name.
    const sorted = [...normalized].sort((a, b) => {
      const ai = a.initiative ?? 1000;
      const bi = b.initiative ?? 1000;
      if (ai !== bi) return ai - bi;
      if (a.class !== b.class) return a.class === 'support' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const state: GameState = {
      id: nanoid(10),
      mapId: map.id,
      mapName: map.name,
      hackingMode,
      players: normalized,
      // Turn order: derived from initiative sorting (lower acts earlier).
      turnOrder: sorted.map((p) => p.id),
      activePlayerIndex: 0,
      phase: 'idle',
      turn: 0,
      round: 0,
      actionsCommitted: 0,
      rpCommitted: 0,
      actionsTaken: 0,
      minorActionsTaken: 0,
      visitedNodeIds: [],
      permanentlyFailedNodeIds: [],
      hiddenNodeIds: [],
      wipingNodeIds: [],
      objectives: {},
      log: [],
      finished: false,
      rootAccessAchieved: false,
      passwordAccessAchieved: false,
    };
    set({ state, map });
  },

  endGame: () => {
    set({ state: null, map: null });
  },

  loadGameFromState: (state, map) => {
    // Normalize loaded players and rebuild turn order to enforce pairing invariants
    const normalized = get().normalizePlayers(state.players);
    const sorted = [...normalized].sort((a, b) => {
      const ai = a.initiative ?? 1000;
      const bi = b.initiative ?? 1000;
      if (ai !== bi) return ai - bi;
      if (a.class !== b.class) return a.class === 'support' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    set({ state: { ...state, players: normalized, turnOrder: sorted.map((p) => p.id), activePlayerIndex: 0 }, map });
  },

  dispatch: (action) => {
    const { state, map } = get();
    if (!state) return;
    const next = reducer(state, action, map ?? undefined);
    set({ state: next });
  },

  persist: async () => {
    const { state } = get();
    if (!state) return;
    await saveGame(state);
  },
}));