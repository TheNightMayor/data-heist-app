/**
 * Phase reducer / state machine for Game mode.
 *
 * Pure functions that take a GameState and an action, return a new GameState.
 * No React imports — unit-testable in isolation.
 *
 * The map (FlowMap) is passed alongside the action because GameState
 * intentionally does not hold the full map (it just holds visited node IDs).
 */

import { effectiveDC, securityBonusForMap } from '../starfinder/tables';
import { resolve as resolveRoll, type Outcome } from '../resolution';
import type {
  GameState,
  GameLogEntry,
  PendingShockGridSave,
} from './types';
import type { FlowNode, FlowMap } from '../flow/types';
import { modifierFor, PASSWORD_HACKING_BONUS } from './types';
import { isCompleted, isReachable } from '../flow/reachability';
import { SHOCK_GRID_RANKS, type ShockGridRank } from '../starfinder/tables';

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
  | { type: 'ENTER_PASSWORD'; playerId: string; node: FlowNode; password: string }
  | { type: 'COLLECT_MODULE'; playerId: string; node: FlowNode }
  | { type: 'ADVANCE_TURN' }
  | { type: 'END_PHASE' }
  | {
      type: 'RESOLVE_SHOCK_SAVE';
      playerId: string;
      d20: number;
      modifier: number;
    }
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
    case 'ENTER_PASSWORD':
      return enterPassword(state, action, map);
    case 'COLLECT_MODULE':
      return collectModule(state, action, map);
    case 'ADVANCE_TURN':
      return advanceTurn(state, map);
    case 'END_PHASE':
      return endPhase(state, map);
    case 'RESOLVE_SHOCK_SAVE':
      return resolveShockSave(state, action);
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

function enterPassword(
  state: GameState,
  action: Extract<GameAction, { type: 'ENTER_PASSWORD' }>,
  map?: FlowMap,
): GameState {
  if (state.finished) return state;
  const player = state.players.find((candidate) => candidate.id === action.playerId);
  if (!player || player.ejected || !action.node.password) return state;
  const effectiveCommitted = state.actionsCommitted > 0 ? state.actionsCommitted : 1;
  if (action.password.trim().toLowerCase() !== action.node.password.trim().toLowerCase()) {
    const existing = state.objectives[action.node.id] ?? {
      nodeId: action.node.id,
      successes: 0,
      failures: 0,
    };
    const objectives = {
      ...state.objectives,
      [action.node.id]: {
        ...existing,
        failures: (existing.failures ?? 0) + 1,
      },
    };
    const globalFailures = Object.values(objectives).reduce(
      (total, objective) => total + (objective.failures ?? 0),
      0,
    );
    const lockoutTriggered = Boolean(
      map?.nodes.some((candidate) => (
        candidate.category === 'countermeasure' && candidate.countermeasureType === 'lockout'
      ))
      && globalFailures >= (map?.cumulativeFailureLimit ?? 3),
    );
    const alarmNodeIds = [...(state.alarmNodeIds ?? [])];
    if (map && (lockoutTriggered || globalFailures >= 2)) {
      for (const alarmNode of map.nodes.filter((candidate) => (
        candidate.category === 'countermeasure'
        && candidate.countermeasureType === 'alarm'
        && (lockoutTriggered || !isCompleted(candidate, objectives))
      ))) {
        if (!alarmNodeIds.includes(alarmNode.id)) alarmNodeIds.push(alarmNode.id);
      }
    }
    const lockedOutNodeIds = [...(state.lockedOutNodeIds ?? [])];
    if (lockoutTriggered && map) {
      for (const candidate of map.nodes) {
        if (!lockedOutNodeIds.includes(candidate.id)) lockedOutNodeIds.push(candidate.id);
      }
    }
    let pendingShockGridSave: PendingShockGridSave | undefined;
    const shockGrid = map?.nodes.find((candidate) => (
      candidate.category === 'countermeasure' && candidate.countermeasureType === 'shock-grid'
    ));
    if (shockGrid && !lockoutTriggered && globalFailures >= 1) {
      const rank = shockGrid.countermeasureRank as ShockGridRank;
      const rankData = SHOCK_GRID_RANKS[rank];
      if (rankData) {
        pendingShockGridSave = {
          nodeId: shockGrid.id,
          saveType: globalFailures === 1 ? 'fortitude' : 'reflex',
          playerIds: state.players.map((candidate) => candidate.id),
          currentPlayerIndex: 0,
          rank,
          dc: rankData.dc,
          damage: rankData.damage,
        };
      }
    }
    const visitedNodeIds = state.visitedNodeIds.includes(action.node.id)
      ? state.visitedNodeIds
      : [...state.visitedNodeIds, action.node.id];
    return {
      ...state,
      visitedNodeIds,
      objectives,
      alarmNodeIds,
      lockedOutNodeIds,
      pendingShockGridSave,
      log: [{
        turn: state.turn,
        playerId: player.id,
        nodeId: action.node.id,
        outcome: 'password-failure',
      }, ...state.log].slice(0, 20),
      actionsCommitted: effectiveCommitted,
      actionsTaken: state.actionsTaken + 1,
      phase: state.hackingMode === 'basic' && !lockoutTriggered ? 'advancing' : 'resolved',
      finished: lockoutTriggered,
      result: lockoutTriggered ? 'lose' : state.result,
    };
  }
  if (map && !isReachable(action.node, {
    visitedNodeIds: new Set(state.visitedNodeIds),
    permanentlyFailedNodeIds: new Set(state.permanentlyFailedNodeIds),
    hiddenNodeIds: new Set(state.hiddenNodeIds ?? []),
    objectives: state.objectives,
  }, map)) return state;

  const successesRequired = action.node.resolve?.successesRequired ?? 1;
  const existing = state.objectives[action.node.id] ?? {
    nodeId: action.node.id,
    successes: 0,
    failures: 0,
  };
  const objective = {
    ...existing,
    successes: successesRequired,
  };
  const actionsTaken = state.actionsTaken + 1;
  const nextPhase: typeof state.phase = state.hackingMode === 'basic' && !state.finished
    ? 'advancing'
    : 'resolved';

  return {
    ...state,
    visitedNodeIds: state.visitedNodeIds.includes(action.node.id)
      ? state.visitedNodeIds
      : [...state.visitedNodeIds, action.node.id],
    objectives: { ...state.objectives, [action.node.id]: objective },
    log: [{
      turn: state.turn,
      playerId: player.id,
      nodeId: action.node.id,
      outcome: 'password-success',
      successesGained: Math.max(0, successesRequired - existing.successes),
    }, ...state.log].slice(0, 20),
    rootAccessAchieved: state.rootAccessAchieved || Boolean(action.node.isRootAccess),
    passwordAccessAchieved: true,
    actionsCommitted: effectiveCommitted,
    actionsTaken,
    phase: nextPhase,
  };
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
  map?: FlowMap,
): GameState {
  if (state.finished) return state;
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return state;
  if (player.ejected) return state;

  // Secondary hackers (Support) must ALWAYS spend 1 RP to perform a Resolve action.
  // If they bought a major action using SUPPORT_BUY_ACTION, they already paid.
  const isSupport = player.class === 'support';
  const spendRP = state.hackingMode === 'dynamic' && Boolean(action.spendRP);
  const baselineCost = state.hackingMode === 'dynamic' && (isSupport && state.actionsCommitted === 0) ? 1 : 0;
  const rpCost = baselineCost + (spendRP ? 1 : 0);

  if (rpCost > 0 && player.resolvePoints < rpCost) {
    return state;
  }

  const node = action.node;

  // Auto-commit default plan (1 action / 0 RP) if the player hasn't planned
  // yet this turn. PLAN_TURN is opt-in for larger commitments; the default
  // case is a single roll with no penalty.
  const effectiveCommitted = state.actionsCommitted > 0 ? state.actionsCommitted : 1;
  const effectiveRPCommitted = state.actionsCommitted > 0 ? state.rpCommitted : 0;

  const securityBonus = map ? securityBonusForMap(map, state.visitedNodeIds) : 0;
  const dc = effectiveDC(map?.tier ?? 1, node.resolve, securityBonus, state.rootAccessAchieved);
  const subskill = node.resolve?.subskill ?? 'hack';
  const baseModifier = modifierFor(player, subskill, state.hackingMode);
  const penalty = turnPenalty(state.actionsTaken, effectiveRPCommitted);
  const passwordBonus = state.passwordAccessAchieved ? PASSWORD_HACKING_BONUS : 0;
  const feedbackPenalty = state.feedbackPenalty ?? 0;
  const modifier = baseModifier + passwordBonus + penalty + feedbackPenalty + (action.aidBonus ?? 0);

  const outcome: Outcome = resolveRoll({
    d20: action.d20,
    modifier,
    dc,
    spendRP,
  });

  let updatedPlayers = state.players;
  if (state.hackingMode === 'dynamic' && outcome.kind === 'nat1' && outcome.cpDamageRoll !== undefined) {
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
    failures: 0,
    countdown: node.countdown,
  };
  const failed = outcome.kind === 'failure' || outcome.kind === 'nat1';
  newObjectives[node.id] = {
    ...existing,
    successes: existing.successes + applied,
    failures: (existing.failures ?? 0) + (failed ? 1 : 0),
  };

  const hiddenNodeIds = [...(state.hiddenNodeIds ?? [])];
  const wipingNodeIds = [...(state.wipingNodeIds ?? [])];
  const revealedCountermeasureIds = [...(state.revealedCountermeasureIds ?? [])];
  const fakeShellDisabled = Boolean(state.fakeShellDisabled)
    || Boolean(map?.nodes.some((candidate) => candidate.countermeasureType === 'fake-shell')
      && outcome.total >= effectiveDC(map?.tier ?? 1, undefined, securityBonus, state.rootAccessAchieved) + 5);
  if (map) {
    for (const candidate of map.nodes) {
      if (
        candidate.category === 'countermeasure'
        && candidate.visibilityDC !== undefined
        && outcome.total >= candidate.visibilityDC
        && !revealedCountermeasureIds.includes(candidate.id)
      ) {
        revealedCountermeasureIds.push(candidate.id);
      }
    }
  }
  const decoyNodeIds = [...(state.decoyNodeIds ?? [])];
  const alarmNodeIds = [...(state.alarmNodeIds ?? [])];
  const lockedOutNodeIds = [...(state.lockedOutNodeIds ?? [])];
  let lockoutTriggered = false;
  let nextFeedbackPenalty = state.feedbackPenalty ?? 0;
  const objectiveCompleted = newObjectives[node.id].successes >= successesRequired;
  const globalFailures = Object.values(newObjectives).reduce(
    (total, objective) => total + (objective.failures ?? 0),
    0,
  );
  if (
    failed
    && globalFailures >= (map?.cumulativeFailureLimit ?? 3)
    && map?.nodes.some((candidate) => (
      candidate.category === 'countermeasure' && candidate.countermeasureType === 'lockout'
    ))
  ) {
    lockoutTriggered = true;
    for (const candidate of map.nodes) {
      if (!lockedOutNodeIds.includes(candidate.id)) lockedOutNodeIds.push(candidate.id);
    }
  }
  const wipeTriggered =
    failed &&
    !objectiveCompleted &&
    node.category === 'countermeasure' &&
    node.countermeasureType === 'wipe' &&
    (newObjectives[node.id].failures === 2 || outcome.kind === 'nat1');
  if (
    wipeTriggered &&
    map
  ) {
    const targetIds = node.targetNodeIds?.length
      ? node.targetNodeIds
      : map.edges.filter((edge) => edge.fromNodeId === node.id).map((edge) => edge.toNodeId);
    for (const targetId of targetIds) {
      if (!hiddenNodeIds.includes(targetId)) hiddenNodeIds.push(targetId);
      if (!wipingNodeIds.includes(targetId)) wipingNodeIds.push(targetId);
    }
  }

  const feedbackNodeActive = node.category === 'countermeasure' && node.countermeasureType === 'feedback'
    ? !objectiveCompleted
    : Boolean(map?.nodes.some((candidate) => (
      candidate.category === 'countermeasure'
      && candidate.countermeasureType === 'feedback'
      && (candidate.visibilityDC === undefined || state.revealedCountermeasureIds?.includes(candidate.id))
      && !isCompleted(candidate, newObjectives)
    )));
  const feedbackTriggered = failed && feedbackNodeActive && outcome.total <= dc - 5;
  const effectLog: GameLogEntry[] = [];
  let pendingShockGridSave: PendingShockGridSave | undefined;
  const shockGrid = map?.nodes.find((candidate) => (
    candidate.category === 'countermeasure' && candidate.countermeasureType === 'shock-grid'
  ));
  if (failed && shockGrid && globalFailures >= 1 && !lockoutTriggered) {
    const rank = shockGrid.countermeasureRank as ShockGridRank;
    const rankData = SHOCK_GRID_RANKS[rank];
    if (rankData) {
      pendingShockGridSave = {
        nodeId: shockGrid.id,
        saveType: globalFailures === 1 ? 'fortitude' : 'reflex',
        playerIds: state.players.map((candidate) => candidate.id),
        currentPlayerIndex: 0,
        rank,
        dc: rankData.dc,
        damage: rankData.damage,
      };
      effectLog.push({ turn: state.turn, playerId: player.id, nodeId: shockGrid.id, outcome: `countermeasure-shock-grid-${pendingShockGridSave.saveType}` });
    }
  }
  if (feedbackTriggered) {
    nextFeedbackPenalty = -5;
    effectLog.push({ turn: state.turn, playerId: player.id, nodeId: node.id, outcome: 'countermeasure-feedback' });
  }
  if (failed && !objectiveCompleted && node.category === 'countermeasure' && node.countermeasureType !== 'feedback') {
    switch (node.countermeasureType) {
      case 'fake-shell':
        if (!decoyNodeIds.includes(node.id)) decoyNodeIds.push(node.id);
        effectLog.push({ turn: state.turn, playerId: player.id, nodeId: node.id, outcome: 'countermeasure-fake-shell' });
        break;
      case 'alarm':
        break;
      case 'lockout':
        break;
      default:
        break;
    }
  }

  if (lockoutTriggered) {
    effectLog.push({ turn: state.turn, playerId: player.id, nodeId: node.id, outcome: 'countermeasure-lockout' });
  }

  if (failed && map && (lockoutTriggered || globalFailures >= 2)) {
    for (const alarmNode of map.nodes.filter((candidate) => (
      candidate.category === 'countermeasure'
      && candidate.countermeasureType === 'alarm'
      && (lockoutTriggered || !isCompleted(candidate, newObjectives))
    ))) {
      if (!alarmNodeIds.includes(alarmNode.id)) {
        alarmNodeIds.push(alarmNode.id);
        effectLog.push({ turn: state.turn, playerId: player.id, nodeId: alarmNode.id, outcome: 'countermeasure-alarm' });
      }
    }
  }

  const feedbackCleared = !failed
    && node.category === 'countermeasure'
    && node.countermeasureType === 'feedback'
    && objectiveCompleted;
  if (!failed && node.category === 'countermeasure' && node.countermeasureType === 'alarm' && objectiveCompleted) {
    const alarmIndex = alarmNodeIds.indexOf(node.id);
    if (alarmIndex >= 0) alarmNodeIds.splice(alarmIndex, 1);
  }

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
        state.hackingMode === 'dynamic' && outcome.kind === 'nat1' && outcome.cpDamageRoll !== undefined && outcome.cpDamageRoll <= 3
          ? 1
          : 0,
      rpSpent: rpCost,
    },
    ...effectLog,
    ...state.log,
  ].slice(0, 20);

  const rootAccessAchieved = state.rootAccessAchieved || (
    node.isRootAccess && newObjectives[node.id].successes >= successesRequired
  );
  let finished: boolean = state.finished;
  let result = state.result;
  if (lockoutTriggered) {
    finished = true;
    result = 'lose';
  }
  if (state.hackingMode === 'dynamic' && updatedPlayers.every((p) => p.ejected || p.currentCP <= 0)) {
    finished = true;
    result = 'lose';
  }

  // Consume a committed major action.
  const actionsTaken = state.actionsTaken + 1;

  // Simple mode has one action per turn and no End Turn control. Let the
  // game screen advance it automatically after the result is recorded.
  const nextPhase: typeof state.phase = state.hackingMode === 'basic' && !finished
    ? 'advancing'
    : 'resolved';

  return {
    ...state,
    players: updatedPlayers,
    visitedNodeIds: visited,
    objectives: newObjectives,
    hiddenNodeIds,
    wipingNodeIds,
    revealedCountermeasureIds,
    feedbackPenalty: feedbackCleared ? 0 : nextFeedbackPenalty,
    decoyNodeIds,
    fakeShellDisabled,
    alarmNodeIds,
    lockedOutNodeIds,
    pendingShockGridSave,
    log,
    finished,
    result,
    rootAccessAchieved,
    actionsTaken,
    // Persist the effective commitment so the rest of the system (UI badges,
    // exhaustion checks) sees the same value the roll was computed with.
    actionsCommitted: effectiveCommitted,
    rpCommitted: effectiveRPCommitted,
    phase: nextPhase,
    pendingAid,
  };
}

function resolveShockSave(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_SHOCK_SAVE' }>,
): GameState {
  const pending = state.pendingShockGridSave;
  if (!pending || pending.playerIds[pending.currentPlayerIndex] !== action.playerId) return state;

  const success = action.d20 + action.modifier >= pending.dc;
  const player = state.players.find((candidate) => candidate.id === action.playerId);
  if (!player) return state;
  const logEntry: GameLogEntry = {
    turn: state.turn,
    playerId: player.id,
    nodeId: pending.nodeId,
    roll: action.d20,
    total: action.d20 + action.modifier,
    dc: pending.dc,
    outcome: success
      ? `shock-grid-${pending.saveType}-success`
      : pending.saveType === 'fortitude'
        ? 'shock-grid-stunned'
        : `shock-grid-damage-${pending.damage}`,
  };
  const stunnedPlayerIds = [...(state.stunnedPlayerIds ?? [])];
  if (!success && pending.saveType === 'fortitude' && !stunnedPlayerIds.includes(player.id)) {
    stunnedPlayerIds.push(player.id);
  }
  const nextIndex = pending.currentPlayerIndex + 1;
  return {
    ...state,
    pendingShockGridSave: nextIndex >= pending.playerIds.length
      ? undefined
      : { ...pending, currentPlayerIndex: nextIndex },
    stunnedPlayerIds,
    log: [logEntry, ...state.log].slice(0, 20),
  };
}

function collectModule(
  state: GameState,
  action: Extract<GameAction, { type: 'COLLECT_MODULE' }>,
  map?: FlowMap,
): GameState {
  if (state.finished) return state;
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player || player.ejected || action.node.category !== 'module') return state;
  if (state.visitedNodeIds.includes(action.node.id)) return state;
  if (map && !isReachable(action.node, {
    visitedNodeIds: new Set(state.visitedNodeIds),
    permanentlyFailedNodeIds: new Set(state.permanentlyFailedNodeIds),
    hiddenNodeIds: new Set(state.hiddenNodeIds ?? []),
    objectives: state.objectives,
  }, map)) return state;

  const required = action.node.resolve?.successesRequired ?? 1;
  return {
    ...state,
    visitedNodeIds: [...state.visitedNodeIds, action.node.id],
    objectives: {
      ...state.objectives,
      [action.node.id]: {
        nodeId: action.node.id,
        successes: required,
        failures: 0,
      },
    },
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
  const stunnedPlayerIds = new Set(state.stunnedPlayerIds ?? []);
  while (safety-- > 0) {
    const candidate = state.players.find((p) => p.id === state.turnOrder[next]);
    if (candidate && !candidate.ejected) {
      if (stunnedPlayerIds.has(candidate.id)) {
        stunnedPlayerIds.delete(candidate.id);
        next = (next + 1) % orderLen;
        continue;
      }
      found = next;
      break;
    }
    next = (next + 1) % orderLen;
    if (next === (state.activePlayerIndex + 1) % orderLen) wrapped = true;
    if (wrapped) break;
  }
  // If we couldn't find any non-ejected player, stay put and don't increment.
  if (found === -1) {
    return { ...state, phase: 'idle', stunnedPlayerIds: [...stunnedPlayerIds] };
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
    round,
    // Reset per-turn counters for the new active player.
    actionsCommitted: 0,
    rpCommitted: 0,
    actionsTaken: 0,
    minorActionsTaken: 0,
    stunnedPlayerIds: [...stunnedPlayerIds],
    // Note: pendingAid is NOT reset here. It persists until the targeted Lead 
    // consumes it on their own turn.
  };
}

function endPhase(state: GameState, map?: FlowMap): GameState {
  const newObjectives = { ...state.objectives };
  const permanentlyFailedNodeIds = [...state.permanentlyFailedNodeIds];
  const lockedOutNodeIds = [...(state.lockedOutNodeIds ?? [])];
  for (const objId of Object.keys(newObjectives)) {
    const obj = newObjectives[objId];
    if (obj.countdown !== undefined && obj.countdown > 0) {
      const countdown = obj.countdown - 1;
      newObjectives[objId] = { ...obj, countdown };
      if (countdown === 0) {
        const lockoutIndex = lockedOutNodeIds.indexOf(objId);
        if (lockoutIndex >= 0) {
          lockedOutNodeIds.splice(lockoutIndex, 1);
        }
        if (!permanentlyFailedNodeIds.includes(objId)) {
          permanentlyFailedNodeIds.push(objId);
        }
      }
    }
  }
  void map;
  return {
    ...state,
    objectives: newObjectives,
    permanentlyFailedNodeIds,
    lockedOutNodeIds,
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
  const securityBonus = map ? securityBonusForMap(map, state.visitedNodeIds) : 0;
  const baseDC = effectiveDC(map?.tier ?? 1, target.resolve, securityBonus, state.rootAccessAchieved);
  const dc = Math.max(10, baseDC - 10);

  // Use the Support's hack modifier (Aid is a Computers/hack-style check).
  const modifier = modifierFor(support, 'hack') + (state.passwordAccessAchieved ? PASSWORD_HACKING_BONUS : 0);
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

  const failed = outcome.kind === 'nat1' || outcome.kind === 'failure';
  const objectives = { ...state.objectives };
  const existing = objectives[target.id] ?? {
    nodeId: target.id,
    successes: 0,
    failures: 0,
    countdown: target.countdown,
  };
  objectives[target.id] = {
    ...existing,
    failures: (existing.failures ?? 0) + (failed ? 1 : 0),
  };

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
    objectives,
    log,
    pendingAid,
    minorActionsTaken: state.minorActionsTaken + 1,
    phase: 'resolved',
  };
}

