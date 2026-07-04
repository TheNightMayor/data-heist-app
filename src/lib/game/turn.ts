/**
 * Phase reducer / state machine for Game mode.
 *
 * Pure functions that take a GameState and an action, return a new GameState.
 * No React imports — unit-testable in isolation.
 *
 * The map (FlowMap) is passed alongside the action because GameState
 * intentionally does not hold the full map (it just holds visited node IDs).
 */

import { effectiveDC } from '../starfinder/tables';
import { resolve as resolveRoll, type Outcome } from '../resolution';
import type {
  GameState,
  GameLogEntry,
} from './types';
import type { FlowNode, FlowMap } from '../flow/types';
import { modifierFor } from './types';

export type GameAction =
  | {
      type: 'COMMIT_TURN';
      playerId: string;
      /** 1-4 major actions the Lead commits to this turn. */
      actionsCommitted: number;
      /** 0-3 resolve points the Lead commits to spending this turn. */
      rpCommitted: number;
    }
  | {
      type: 'PLAN_TURN';
      playerId: string;
      /** 1-4 major actions the Lead opts into for this turn. */
      actionsCommitted: number;
      /** 0-3 resolve points the Lead opts into spending this turn. */
      rpCommitted: number;
    }
  | {
      type: 'ROLL_RESOLVE';
      playerId: string;
      node: FlowNode;
      d20: number;
      spendRP?: boolean;
      aidBonus?: number;
    }
  | { type: 'ADVANCE_TURN' }
  | { type: 'END_PHASE' }
  | { type: 'SUPPORT_UPGRADE'; playerId: string }
  | { type: 'SET_PAIRED_LEAD'; supportId: string; leadId?: string }
  | { type: 'SUPPORT_BUY_ACTION'; playerId: string }
  | { type: 'SUPPORT_REFUND_ACTION'; playerId: string }
  | {
      type: 'SUPPORT_AID';
      supportId: string;
      leadId: string;
      /** Target Resolve action — the node the Support is aiding. */
      targetNode: FlowNode;
      d20: number;
      spendRP?: boolean;
    }
  | { type: 'FINISH'; result: 'win' | 'lose' };

/**
 * Apply a GameAction. The map is passed for objective lookups
 * (e.g. ticking countdowns) but is not stored on GameState.
 */
export function reducer(state: GameState, action: GameAction, map?: FlowMap): GameState {
  switch (action.type) {
    case 'COMMIT_TURN':
      return commitTurn(state, action);
    case 'PLAN_TURN':
      return planTurn(state, action);
    case 'ROLL_RESOLVE':
      return rollResolve(state, action, map);
    case 'ADVANCE_TURN':
      return advanceTurn(state, map);
    case 'END_PHASE':
      return endPhase(state, map);
    case 'SUPPORT_UPGRADE':
      return upgradeSupport(state, action.playerId);
    case 'SUPPORT_AID':
      return supportAid(state, action, map);
    case 'SET_PAIRED_LEAD':
      return setPairedLead(state, action.supportId, action.leadId);
    case 'SUPPORT_BUY_ACTION':
      return supportBuyAction(state, action.playerId);
    case 'SUPPORT_REFUND_ACTION':
      return supportRefundAction(state, action.playerId);
    case 'FINISH':
      return { ...state, finished: true, result: action.result };
    default:
      return state;
  }
}

function setPairedLead(state: GameState, supportId: string, leadId?: string): GameState {
  // Update the support player's pairedLeadId, then recompute pairedSupportIds
  const updated = state.players.map((p) =>
    p.id === supportId && p.class === 'support'
      ? { ...p, pairedLeadId: leadId }
      : p,
  );

  // Rebuild pairedSupportIds for each lead
  const withLeads = updated.map((p) => {
    if (p.class !== 'lead') return { ...p, pairedSupportIds: p.pairedSupportIds ?? [] };
    const supports = updated.filter((s) => s.class === 'support' && s.pairedLeadId === p.id).map((s) => s.id);
    return { ...p, pairedSupportIds: supports };
  });

  return { ...state, players: withLeads };
}

function supportBuyAction(state: GameState, playerId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.class !== 'support' || player.resolvePoints < 1) return state;

  return {
    ...state,
    actionsCommitted: 1,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, resolvePoints: p.resolvePoints - 1 } : p
    ),
  };
}

function supportRefundAction(state: GameState, playerId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.class !== 'support') return state;

  return {
    ...state,
    actionsCommitted: 0,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, resolvePoints: p.resolvePoints + 1 } : p
    ),
  };
}

// ---------- Planning ----------

/**
 * Cumulative penalty on the *current* roll. After the first major action,
 * every subsequent action adds -5; each committed RP reduces the total by 5.
 * Penalty is non-positive and stacks with whatever the player rolled.
 */
export function turnPenalty(
  actionsTaken: number,
  rpCommitted: number,
): number {
  const extra = Math.max(0, actionsTaken); // actions after the first
  const raw = -(extra * 5) + (rpCommitted * 5);
  // Never grants a bonus beyond the first action (penalty is non-positive).
  return Math.min(0, raw);
}

function commitTurn(
  state: GameState,
  action: Extract<GameAction, { type: 'COMMIT_TURN' }>,
): GameState {
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player || player.ejected) return state;

  const actions = Math.max(1, Math.min(4, Math.floor(action.actionsCommitted)));
  const rp = Math.max(0, Math.min(3, Math.floor(action.rpCommitted)));
  // Cannot commit more RP than the player has.
  const rpClamped = Math.min(rp, player.resolvePoints);

  return {
    ...state,
    actionsCommitted: actions,
    rpCommitted: rpClamped,
    actionsTaken: 0,
    phase: 'idle',
  };
}

/**
 * Opt-in plan upgrade. Like commitTurn, but only valid BEFORE the player has
 * rolled this turn (actionsTaken === 0). No-op if the player has already
 * committed a plan and tries to upgrade mid-turn, or if they've already
 * started rolling.
 *
 * Default flow (no PLAN_TURN): first roll auto-commits 1 action / 0 RP.
 */
function planTurn(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAN_TURN' }>,
): GameState {
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player || player.ejected) return state;
  // Can't change the plan mid-turn.
  if (state.actionsTaken > 0) return state;

  const actions = Math.max(1, Math.min(4, Math.floor(action.actionsCommitted)));
  const rp = Math.max(0, Math.min(3, Math.floor(action.rpCommitted)));
  const rpClamped = Math.min(rp, player.resolvePoints);

  return {
    ...state,
    actionsCommitted: actions,
    rpCommitted: rpClamped,
    actionsTaken: 0,
    phase: 'idle',
  };
}

// ---------- Roll ----------

function rollResolve(
  state: GameState,
  action: Extract<GameAction, { type: 'ROLL_RESOLVE' }>,
  _map?: FlowMap,
): GameState {
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return state;
  if (player.ejected) return state;

  // Secondary hackers (Support) must ALWAYS spend 1 RP to perform a Resolve action.
  // If they bought a major action using SUPPORT_BUY_ACTION, they already paid.
  const isSupport = player.class === 'support';
  const baselineCost = (isSupport && state.actionsCommitted === 0) ? 1 : 0;
  const rpCost = baselineCost + (action.spendRP ? 1 : 0);

  if (rpCost > 0 && player.resolvePoints < rpCost) {
    return state;
  }

  const node = action.node;

  // Auto-commit default plan (1 action / 0 RP) if the player hasn't planned
  // yet this turn. PLAN_TURN is opt-in for larger commitments; the default
  // case is a single roll with no penalty.
  const effectiveCommitted = state.actionsCommitted > 0 ? state.actionsCommitted : 1;
  const effectiveRPCommitted = state.actionsCommitted > 0 ? state.rpCommitted : 0;

  const dc = effectiveDC(node.tier, node.resolve);
  const subskill = node.resolve?.subskill ?? 'hack';
  const baseModifier = modifierFor(player, subskill, state.hackingMode);
  const penalty = turnPenalty(state.actionsTaken, effectiveRPCommitted);
  const modifier = baseModifier + penalty + (action.aidBonus ?? 0);

  const outcome: Outcome = resolveRoll({
    d20: action.d20,
    modifier,
    dc,
    spendRP: action.spendRP,
  });

  let updatedPlayers = state.players;
  if (outcome.kind === 'nat1' && outcome.cpDamageRoll !== undefined) {
    const damage = outcome.cpDamageRoll <= 3 ? 1 : 0;
    if (damage > 0) {
      updatedPlayers = updatedPlayers.map((p) =>
        p.id === player.id
          ? { ...p, currentCP: Math.max(0, p.currentCP - damage), ejected: p.currentCP - damage <= 0 }
          : p,
      );
    }
  }

  if (rpCost > 0) {
    updatedPlayers = updatedPlayers.map((p) =>
      p.id === player.id ? { ...p, resolvePoints: Math.max(0, p.resolvePoints - rpCost) } : p,
    );
  }

  const successesRequired = node.resolve?.successesRequired ?? 1;
  const applied = Math.min(outcome.successes, successesRequired);
  const newObjectives = { ...state.objectives };
  const existing = newObjectives[node.id] ?? {
    nodeId: node.id,
    successes: 0,
    countdown: node.countdown,
  };
  newObjectives[node.id] = {
    ...existing,
    successes: existing.successes + applied,
  };

  const visited = state.visitedNodeIds.includes(node.id)
    ? state.visitedNodeIds
    : [...state.visitedNodeIds, node.id];

  // Consume any pending Aid from a Support player on this roll. Only the
  // Lead's roll consumes the aid — even if the Lead rolled against a node
  // other than the one the Support aimed at, the aid is one-shot.
  const pendingAid = state.pendingAid?.leadId === player.id ? undefined : state.pendingAid;

  const log: GameLogEntry[] = [
    {
      turn: state.turn,
      playerId: player.id,
      nodeId: node.id,
      roll: outcome.d20,
      total: outcome.total,
      dc,
      outcome: outcome.kind,
      successesGained: applied,
      cpLost:
        outcome.kind === 'nat1' && outcome.cpDamageRoll !== undefined && outcome.cpDamageRoll <= 3
          ? 1
          : 0,
      rpSpent: rpCost,
    },
    ...state.log,
  ].slice(0, 20);

  let finished = state.finished;
  let result = state.result;
  if (node.isRootAccess && newObjectives[node.id].successes >= successesRequired) {
    finished = true;
    result = 'win';
  }
  if (updatedPlayers.every((p) => p.ejected || p.currentCP <= 0)) {
    finished = true;
    result = 'lose';
  }

  // Consume a committed major action.
  const actionsTaken = state.actionsTaken + 1;

  // We no longer auto-advance when actions are exhausted.
  // The player MUST click "End Turn" manually.
  const nextPhase: typeof state.phase = 'resolved';

  return {
    ...state,
    players: updatedPlayers,
    visitedNodeIds: visited,
    objectives: newObjectives,
    log,
    finished,
    result,
    actionsTaken,
    // Persist the effective commitment so the rest of the system (UI badges,
    // exhaustion checks) sees the same value the roll was computed with.
    actionsCommitted: effectiveCommitted,
    rpCommitted: effectiveRPCommitted,
    phase: nextPhase,
    hazardSkipActive: outcome.hazardSkip,
    pendingAid,
  };
}

function advanceTurn(state: GameState, _map?: FlowMap): GameState {
  // Find the next non-ejected player in turn order. Skip ejected players and
  // wrap around. If we wrap back to the same player we started from (i.e.
  // every remaining player is ejected), don't increment the round counter.
  const orderLen = state.turnOrder.length;
  let next = (state.activePlayerIndex + 1) % orderLen;
  let safety = orderLen;
  let wrapped = false;
  let found = -1;
  while (safety-- > 0) {
    const candidate = state.players.find((p) => p.id === state.turnOrder[next]);
    if (candidate && !candidate.ejected) {
      found = next;
      break;
    }
    next = (next + 1) % orderLen;
    if (next === (state.activePlayerIndex + 1) % orderLen) wrapped = true;
    if (wrapped) break;
  }
  // If we couldn't find any non-ejected player, stay put and don't increment.
  if (found === -1) {
    return { ...state, phase: 'idle', hazardSkipActive: false };
  }

  // Round increments when active player wraps back to index 0
  // (i.e. all players in the round have acted).
  const round = found <= state.activePlayerIndex ? state.round + 1 : state.round;

  return {
    ...state,
    activePlayerIndex: found,
    // Default phase is 'idle' — planning is opt-in via PLAN_TURN.
    // The first roll auto-commits 1 action / 0 RP if no PLAN_TURN was issued.
    phase: 'idle',
    hazardSkipActive: false,
    round,
    // Reset per-turn counters for the new active player.
    actionsCommitted: 0,
    rpCommitted: 0,
    actionsTaken: 0,
    minorActionsTaken: 0,
    // Note: pendingAid is NOT reset here. It persists until the targeted Lead 
    // consumes it on their own turn.
  };
}

function endPhase(state: GameState, map?: FlowMap): GameState {
  const newObjectives = { ...state.objectives };
  for (const objId of Object.keys(newObjectives)) {
    const obj = newObjectives[objId];
    if (obj.countdown !== undefined && obj.countdown > 0) {
      newObjectives[objId] = { ...obj, countdown: obj.countdown - 1 };
    }
  }
  void map;
  return {
    ...state,
    objectives: newObjectives,
    turn: state.turn + 1,
  };
}

function upgradeSupport(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId && p.class === 'support' && p.resolvePoints > 0
        ? { ...p, resolvePoints: p.resolvePoints - 1 }
        : p,
    ),
  };
}
/**
 * Support Aid — minor action.
 *
 * The Support rolls a skill check vs DC max(10, baseDC - 10). Outcomes:
 *   - Failure: no bonus.
 *   - Success: paired Lead's next Resolve gets +2.
 *   - Success by 10+: paired Lead's next Resolve gets +4.
 *
 * RP-spend → auto-success → grants +2 (no chance for +4 since no roll).
 * On roll, nat1 / nat20 follow normal d20 rules via the shared `resolve`.
 */
function supportAid(
  state: GameState,
  action: Extract<GameAction, { type: 'SUPPORT_AID' }>,
  map?: FlowMap,
): GameState {
  const support = state.players.find((p) => p.id === action.supportId);
  const lead = state.players.find((p) => p.id === action.leadId);
  if (!support || support.ejected) return state;
  if (!lead || lead.ejected) return state;

  const target = action.targetNode;
  void map;

  // DC: max(10, effectiveDC − 10).
  const baseDC = effectiveDC(target.tier, target.resolve);
  const dc = Math.max(10, baseDC - 10);

  // Use the Support's hack modifier (Aid is a Computers/hack-style check).
  const modifier = modifierFor(support, 'hack');
  const outcome = resolveRoll({ d20: action.d20, modifier, dc, spendRP: action.spendRP });

  // Determine bonus. RP-spend auto-success → +2.
  let bonus = 0;
  let outcomeLabel: string;
  if (outcome.kind === 'rp-spend') {
    bonus = 2;
    outcomeLabel = 'Aid (auto)';
  } else if (outcome.kind === 'nat1' || outcome.kind === 'failure') {
    bonus = 0;
    outcomeLabel = 'Aid failed';
  } else if (outcome.kind === 'nat20' || outcome.kind === 'major-success') {
    // success by 10 or more
    bonus = 4;
    outcomeLabel = 'Aid +4';
  } else {
    // standard-success
    bonus = 2;
    outcomeLabel = 'Aid +2';
  }

  // RP-spend decrements active player's RP.
  let updatedPlayers = state.players;
  if (action.spendRP) {
    updatedPlayers = updatedPlayers.map((p) =>
      p.id === support.id ? { ...p, resolvePoints: Math.max(0, p.resolvePoints - 1) } : p,
    );
  }

  const log: GameLogEntry[] = [
    {
      turn: state.turn,
      playerId: support.id,
      nodeId: target.id,
      roll: outcome.d20,
      total: outcome.total,
      dc,
      outcome: outcomeLabel,
      successesGained: bonus, // repurposed: aid bonus
    },
    ...state.log,
  ].slice(0, 20);

  // If this was a self-aid (Lead minor action), it doesn't grant a bonus to next roll.
  // It just consumes the minor action and logs the success/failure.
  const isSelfAid = support.id === lead.id;
  
  const pendingAid = (bonus > 0 && !isSelfAid)
    ? { leadId: lead.id, bonus, targetNodeId: target.id } 
    : state.pendingAid;

  return {
    ...state,
    players: updatedPlayers,
    log,
    pendingAid,
    minorActionsTaken: state.minorActionsTaken + 1,
    phase: 'resolved', 
    hazardSkipActive: false,
  };
}
declare module './types' {
  interface GameState {
    hazardSkipActive?: boolean;
  }
}