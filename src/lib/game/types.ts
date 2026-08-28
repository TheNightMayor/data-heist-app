/**
 * Game state types — players, resources, phase machine.
 * Persisted via AsyncStorage so save/load preserves the full session.
 */

import type { FlowMap, FlowNode } from '../flow/types';

export type CharacterClass = 'lead' | 'support';

export type Subskill = 'deceive' | 'hack' | 'process';

export interface Player {
  id: string;
  name: string;
  class: CharacterClass;
  /** Lead only: which Support Hackers are paired to this Lead. */
  pairedSupportIds: string[];
  /** Support only: which Lead Hacker this Support aids. */
  pairedLeadId?: string;
  /** Starfinder Computers ranks (drives CP + v2 cap). */
  computersRanks: number;
  /** Initiative ordering value — lower values act earlier. Optional for fixtures. */
  initiative?: number;
  /** Starfinder Computers modifier (sum of ranks + INT mod + bonuses). */
  computersModifier: number;
  /** Per-subskill modifiers. Defaults to computersModifier, overridable. */
  deceiveModifier: number;
  hackModifier: number;
  processModifier: number;
  /** Net bonus points applied across hacking styles. Limit = ranks / 3. */
  personaModifier: number;
  personaModifierLimit: number;
  /** Resolve Points — per-character pool, default 3. */
  resolvePoints: number;
  /** Connection Points — current persona health. */
  currentCP: number;
  /** Connection Points — max derived from computersRanks. */
  maxCP: number;
  /** True if this player has been ejected at 0 CP and is out for the map. */
  ejected: boolean;
}

export type PhaseStatus =
  | 'idle'        // active player can act (default; planning is opt-in via PLAN_TURN)
  | 'rolling'     // a roll is in flight (UI state only)
  | 'resolved'    // last roll resolved, more actions may remain
  | 'advancing';  // transient before next player

export interface ObjectiveProgress {
  nodeId: string;
  successes: number;
  failures?: number;
  /** Current countdown if this is a countermeasure with a timer. */
  countdown?: number;
}

export interface GameLogEntry {
  turn: number;
  playerId: string;
  nodeId?: string;
  roll?: number;
  total?: number;
  dc?: number;
  outcome: string;
  successesGained?: number;
  cpLost?: number;
  rpSpent?: number;
}

export interface GameState {
  id: string;
  mapId: string;
  mapName: string;
  /** 'basic' uses Total Mod for all checks; 'dynamic' uses specific sub-skills. */
  hackingMode: 'basic' | 'dynamic';
  players: Player[];
  /** Order players take turns. */
  turnOrder: string[];
  /** Index into turnOrder for the currently active player. */
  activePlayerIndex: number;
  /** Current phase within the turn. */
  phase: PhaseStatus;
  /** How many phases have elapsed. */
  turn: number;
  /** How many full rounds have elapsed (round = all non-ejected players have taken a turn). */
  round: number;
  /** Lead's committed number of major actions this turn (1-4). 0 for Support / pre-planning. */
  actionsCommitted: number;
  /** Lead's committed RP count this turn (0-3). Subtracts from cumulative penalty. */
  rpCommitted: number;
  /** Lead's number of major actions taken this turn so far. */
  actionsTaken: number;
  /** Support's number of minor actions taken this turn. */
  minorActionsTaken: number;
  /**
   * Aid granted by a Support player. Consumed by the next Lead ROLL_RESOLVE
   * and then cleared. RP-spend Aid gives +2; success-by-10+ gives +4.
   * `targetNodeId` records which node the Support was aiding so the UI
   * can highlight that node as the party's current focus.
   */
  pendingAid?: { leadId: string; bonus: number; targetNodeId: string };
  /** Visited node IDs for progress and retry state. */
  visitedNodeIds: string[];
  /**
   * IDs of nodes that are permanently failed and locked out for the rest of
   * the map. The trigger that populates this is TODO — wiring only.
   */
  permanentlyFailedNodeIds: string[];
  /** Node IDs concealed by a countermeasure such as Wipe. */
  hiddenNodeIds?: string[];
  /** Node IDs currently showing the Wipe transition. */
  wipingNodeIds?: string[];
  /** Penalty applied to the next Resolve check by Feedback. */
  feedbackPenalty?: number;
  /** Countermeasure nodes revealed to be Fake Shells. */
  decoyNodeIds?: string[];
  /** Countermeasure nodes that have triggered an Alarm. */
  alarmNodeIds?: string[];
  /** Countermeasure nodes currently enforcing a Lockout. */
  lockedOutNodeIds?: string[];
  /** Active objectives and their progress. */
  objectives: Record<string, ObjectiveProgress>;
  /** Recent actions for the log panel. */
  log: GameLogEntry[];
  /** True if the game is over (win or lose). */
  finished: boolean;
  /** 'win' | 'lose' | undefined while playing. */
  result?: 'win' | 'lose';
  /** Root access has been secured; subsequent hacking DCs are reduced by 20. */
  rootAccessAchieved?: boolean;
  /** The system password was entered; all subsequent hacking rolls gain +5. */
  passwordAccessAchieved?: boolean;
}

export const PASSWORD_HACKING_BONUS = 5;

export function maxCPFor(ranks: number): number {
  return 12 + 2 * ranks;
}

/** Helper to get a player's modifier for a given subskill, respecting hacking mode. */
export function modifierFor(player: Player, subskill: Subskill, hackingMode: 'basic' | 'dynamic' = 'dynamic'): number {
  if (hackingMode === 'basic') return player.computersModifier;
  switch (subskill) {
    case 'deceive':
      return player.deceiveModifier;
    case 'hack':
      return player.hackModifier;
    case 'process':
      return player.processModifier;
  }
}

/** Find the Lead paired to a given Support, or undefined if Support has no Lead. */
export function findLeadOf(support: Player, players: Player[]): Player | undefined {
  if (support.class !== 'support' || !support.pairedLeadId) return undefined;
  return players.find((p) => p.id === support.pairedLeadId);
}

/** Find all Supports paired to a given Lead. */
export function findSupportsOf(lead: Player, players: Player[]): Player[] {
  if (lead.class !== 'lead') return [];
  return lead.pairedSupportIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
}

export type { FlowMap, FlowNode };