import { reducer, turnPenalty } from '../src/lib/game/turn';
import type { GameState } from '../src/lib/game/types';
import type { FlowMap, FlowNode } from '../src/lib/flow/types';

const node: FlowNode = {
  id: 'n1',
  name: 'Test Server',
  x: 0,
  y: 0,
  category: 'access',
  isRootAccess: true,
  resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
};

const moduleNode: FlowNode = {
  id: 'module-1',
  name: 'Secure Data',
  x: 80,
  y: 0,
  category: 'module',
  resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
};

const wipeNode: FlowNode = {
  id: 'wipe-1',
  name: 'Wipe',
  x: 160,
  y: 0,
  category: 'countermeasure',
  countermeasureType: 'wipe',
  targetNodeIds: ['target-1'],
  resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
};

const wipeMap: FlowMap = {
  id: 'm1',
  name: 'Test',
  tier: 1,
  nodes: [wipeNode],
  edges: [],
  updatedAt: '2026-08-20T00:00:00.000Z',
};

const countermeasure = (type: NonNullable<FlowNode['countermeasureType']>): FlowNode => ({
  id: `${type}-1`,
  name: type,
  x: 0,
  y: 0,
  category: 'countermeasure',
  countermeasureType: type,
  resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
});

const makeState = (overrides: Partial<GameState> = {}): GameState => ({
  id: 'g1',
  mapId: 'm1',
  mapName: 'Test',
  hackingMode: 'dynamic',
  players: [
    {
      id: 'p1',
      name: 'Alice',
      class: 'lead',
      pairedSupportIds: [],
      computersRanks: 4,
      computersModifier: 5,
      deceiveModifier: 5,
      hackModifier: 5,
      processModifier: 5,
      personaModifier: 0,
      personaModifierLimit: 1,
      resolvePoints: 3,
      currentCP: 20,
      maxCP: 20,
      ejected: false,
    },
  ],
  turnOrder: ['p1'],
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
  ...overrides,
});

describe('turn reducer — ROLL_RESOLVE', () => {
  test('standard success visits node and adds 1 success', () => {
    // d20=15, mod=5, total=20, DC=17 (tier 1) → margin=3 → standard success
    const state = makeState();
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node,
      d20: 15,
    });
    expect(next.visitedNodeIds).toContain('n1');
    expect(next.objectives['n1'].successes).toBe(1);
    expect(next.phase).toBe('resolved');
    expect(next.finished).toBe(false); // root access grants the DC reduction, not a win
    expect(next.rootAccessAchieved).toBe(true);
  });

  test('failure does not add successes but marks visited', () => {
    const state = makeState();
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node,
      d20: 5, // total 10, DC 17 → miss
    });
    expect(next.visitedNodeIds).toContain('n1');
    expect(next.objectives['n1'].successes).toBe(0);
    expect(next.finished).toBe(false);
  });

  test('spendRP auto-succeeds and decrements RP', () => {
    const state = makeState();
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node,
      d20: 1, // would fail without RP
      spendRP: true,
    });
    expect(next.objectives['n1'].successes).toBe(1);
    expect(next.players[0].resolvePoints).toBe(2);
    expect(next.actionsTaken).toBe(1);
  });

  test('entering a node password completes it without a roll', () => {
    const passwordNode = { ...node, password: 'DATAPAD' };
    const state = makeState();
    const next = reducer(state, {
      type: 'ENTER_PASSWORD',
      playerId: 'p1',
      node: passwordNode,
      password: 'DATAPAD',
    });

    expect(next.objectives.n1.successes).toBe(1);
    expect(next.visitedNodeIds).toContain('n1');
    expect(next.log[0].outcome).toBe('password-success');
    expect(next.actionsTaken).toBe(1);
    expect(next.passwordAccessAchieved).toBe(true);
  });

  test('password access adds +5 to later hacking rolls', () => {
    const state = makeState({ passwordAccessAchieved: true });
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: { ...node, isRootAccess: false },
      d20: 10,
    });

    expect(next.log[0].total).toBe(20);
  });

  test('successfully hacking a wipe does not trigger it', () => {
    const state = makeState();
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: wipeNode,
      d20: 15,
    }, wipeMap);

    expect(next.objectives['wipe-1'].successes).toBe(1);
    expect(next.hiddenNodeIds).toEqual([]);
    expect(next.wipingNodeIds).toEqual([]);
  });

  test('Wipe triggers after two failures', () => {
    const first = reducer(makeState(), {
      type: 'ROLL_RESOLVE', playerId: 'p1', node: wipeNode, d20: 5,
    }, wipeMap);
    const next = reducer(first, {
      type: 'ROLL_RESOLVE', playerId: 'p1', node: wipeNode, d20: 5,
    }, wipeMap);
    expect(next.objectives['wipe-1'].failures).toBe(2);
    expect(next.hiddenNodeIds).toEqual(['target-1']);
    expect(next.wipingNodeIds).toEqual(['target-1']);
  });

  test('Feedback applies a -2 penalty to the next Resolve only', () => {
    const state = makeState();
    const feedback = reducer(state, {
      type: 'ROLL_RESOLVE', playerId: 'p1', node: countermeasure('feedback'), d20: 5,
    });
    expect(feedback.feedbackPenalty).toBe(-2);

    const next = reducer(feedback, {
      type: 'ROLL_RESOLVE', playerId: 'p1', node: { ...node, id: 'later' }, d20: 10,
    });
    expect(next.log[0].total).toBe(8);
    expect(next.feedbackPenalty).toBe(0);
  });

  test('Fake Shell and Alarm record their triggered nodes', () => {
    const fakeShell = reducer(makeState(), {
      type: 'ROLL_RESOLVE', playerId: 'p1', node: countermeasure('fake-shell'), d20: 5,
    });
    expect(fakeShell.decoyNodeIds).toEqual(['fake-shell-1']);

    const alarm = reducer(makeState(), {
      type: 'ROLL_RESOLVE', playerId: 'p1', node: countermeasure('alarm'), d20: 5,
    });
    expect(alarm.alarmNodeIds).toEqual(['alarm-1']);
    expect(alarm.log.some((entry) => entry.outcome === 'countermeasure-alarm')).toBe(true);
  });

  test('Shock Grid costs 1 CP on a failed dynamic resolve', () => {
    const next = reducer(makeState(), {
      type: 'ROLL_RESOLVE', playerId: 'p1', node: countermeasure('shock-grid'), d20: 5,
    });
    expect(next.players[0].currentCP).toBe(19);
    expect(next.log.some((entry) => entry.outcome === 'countermeasure-shock-grid')).toBe(true);
  });

  test('Lockout activates after three failures and expires', () => {
    const lockout = countermeasure('lockout');
    let state = makeState();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state = reducer(state, { type: 'ROLL_RESOLVE', playerId: 'p1', node: lockout, d20: 5 });
    }
    expect(state.lockedOutNodeIds).toEqual(['lockout-1']);
    expect(state.objectives['lockout-1'].countdown).toBe(3);

    state = reducer(state, { type: 'END_PHASE' });
    state = reducer(state, { type: 'END_PHASE' });
    expect(state.lockedOutNodeIds).toEqual(['lockout-1']);
    state = reducer(state, { type: 'END_PHASE' });
    expect(state.lockedOutNodeIds).toEqual([]);
    expect(state.permanentlyFailedNodeIds).not.toContain('lockout-1');
  });

  test('root access reduces later DCs by 20 without finishing the session', () => {
    const state = makeState({ rootAccessAchieved: true });
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: { ...node, id: 'later-node', isRootAccess: false },
      d20: 5,
    });

    expect(next.finished).toBe(false);
    expect(next.log[0].dc).toBe(-3);
  });

  test('nat 1 deals CP damage on 1d6 roll of 1-3', () => {
    // Use a non-root node so the game doesn't end
    const nonRoot: FlowNode = { ...node, isRootAccess: false };
    const state = makeState();
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: nonRoot,
      d20: 1, // nat 1 → CP damage roll
    });
    // CP loss is 0 or 1 depending on cpDamageRoll (1-3 → lose 1, 4-6 → lose 0)
    const cpLost = 20 - next.players[0].currentCP;
    expect(cpLost).toBeLessThanOrEqual(1);
  });

  test('ejected players are skipped (no-op on roll)', () => {
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          class: 'lead',
          pairedSupportIds: [],
          computersRanks: 4,
          computersModifier: 5,
          deceiveModifier: 5,
          hackModifier: 5,
          processModifier: 5,
          personaModifier: 0,
          personaModifierLimit: 1,
          resolvePoints: 3,
          currentCP: 0,
          maxCP: 20,
          ejected: true,
        },
      ],
    });
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node,
      d20: 20,
    });
    expect(next.visitedNodeIds).not.toContain('n1');
  });
});

describe('turn reducer — ADVANCE_TURN', () => {
  test('cycles to next non-ejected player', () => {
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          class: 'lead',
          pairedSupportIds: [],
          computersRanks: 4,
          computersModifier: 5,
          deceiveModifier: 5,
          hackModifier: 5,
          processModifier: 5,
          personaModifier: 0,
          personaModifierLimit: 1,
          resolvePoints: 3,
          currentCP: 20,
          maxCP: 20,
          ejected: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          class: 'support',
          pairedSupportIds: [],
          pairedLeadId: 'p1',
          computersRanks: 4,
          computersModifier: 5,
          deceiveModifier: 5,
          hackModifier: 5,
          processModifier: 5,
          personaModifier: 0,
          personaModifierLimit: 1,
          resolvePoints: 3,
          currentCP: 20,
          maxCP: 20,
          ejected: false,
        },
      ],
      turnOrder: ['p1', 'p2'],
      activePlayerIndex: 0,
    });
    const next = reducer(state, { type: 'ADVANCE_TURN' });
    expect(next.activePlayerIndex).toBe(1);
    // Default flow: planning is opt-in, so the next player starts at 'idle'.
    expect(next.phase).toBe('idle');
  });
});

describe('turn reducer — COMMIT_TURN', () => {
  test('records actionsCommitted + rpCommitted and resets actionsTaken', () => {
    const state = makeState({ actionsTaken: 2, actionsCommitted: 0, rpCommitted: 0 });
    const next = reducer(state, {
      type: 'COMMIT_TURN',
      playerId: 'p1',
      actionsCommitted: 3,
      rpCommitted: 2,
    });
    expect(next.actionsCommitted).toBe(3);
    expect(next.rpCommitted).toBe(2);
    expect(next.actionsTaken).toBe(0);
    expect(next.phase).toBe('idle');
  });

  test('clamps actionsCommitted to [1, 4]', () => {
    const over = reducer(makeState(), { type: 'COMMIT_TURN', playerId: 'p1', actionsCommitted: 99, rpCommitted: 0 });
    expect(over.actionsCommitted).toBe(4);
    const under = reducer(makeState(), { type: 'COMMIT_TURN', playerId: 'p1', actionsCommitted: 0, rpCommitted: 0 });
    expect(under.actionsCommitted).toBe(1);
  });

  test('clamps rpCommitted to player.resolvePoints', () => {
    const state = makeState(); // player has resolvePoints: 3
    const next = reducer(state, { type: 'COMMIT_TURN', playerId: 'p1', actionsCommitted: 1, rpCommitted: 9 });
    expect(next.rpCommitted).toBe(3);
  });
});

describe('turn reducer — PLAN_TURN (opt-in)', () => {
  test('opt-in planning upgrades the default 1-action commitment', () => {
    const state = makeState({ actionsCommitted: 0, rpCommitted: 0, actionsTaken: 0 });
    const next = reducer(state, {
      type: 'PLAN_TURN',
      playerId: 'p1',
      actionsCommitted: 3,
      rpCommitted: 1,
    });
    expect(next.actionsCommitted).toBe(3);
    expect(next.rpCommitted).toBe(1);
  });

  test('no-op if player has already rolled this turn', () => {
    const state = makeState({ actionsCommitted: 1, rpCommitted: 0, actionsTaken: 1 });
    const next = reducer(state, {
      type: 'PLAN_TURN',
      playerId: 'p1',
      actionsCommitted: 4,
      rpCommitted: 2,
    });
    expect(next).toBe(state);
  });
});

describe('default flow — auto-commit 1/0 on first roll', () => {
  test('first roll without PLAN_TURN acts as 1 action / 0 RP', () => {
    const state = makeState({ actionsCommitted: 0, rpCommitted: 0, actionsTaken: 0 });
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: { ...node, isRootAccess: false },
      d20: 15,
    });
    // Persisted effective commitment — the roll consumed the default.
    expect(next.actionsCommitted).toBe(1);
    expect(next.rpCommitted).toBe(0);
    expect(next.actionsTaken).toBe(1);
    expect(next.phase).toBe('resolved'); // single action → auto-end
  });

  test('roll after PLAN_TURN respects the explicit commitment', () => {
    const state = makeState({ actionsCommitted: 4, rpCommitted: 2, actionsTaken: 1 });
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: { ...node, isRootAccess: false },
      d20: 15,
    });
    expect(next.actionsCommitted).toBe(4); // unchanged
    expect(next.rpCommitted).toBe(2);
    expect(next.actionsTaken).toBe(2);
    expect(next.phase).toBe('resolved'); // 2 of 4 actions spent, more remain
  });
});

describe('turnPenalty', () => {
  test('no penalty for the first action', () => {
    expect(turnPenalty(0, 0)).toBe(0);
  });
  test('cumulative -5 per extra action', () => {
    expect(turnPenalty(1, 0)).toBe(-5);
    expect(turnPenalty(2, 0)).toBe(-10);
    expect(turnPenalty(3, 0)).toBe(-15);
  });
  test('each RP reduces penalty by 5', () => {
    expect(turnPenalty(3, 1)).toBe(-10);
    expect(turnPenalty(3, 2)).toBe(-5);
    expect(turnPenalty(3, 3)).toBe(0);
  });
  test('penalty never goes positive', () => {
    expect(turnPenalty(1, 5)).toBeLessThanOrEqual(0);
  });
});

describe('turn reducer — ROLL_RESOLVE applies penalty', () => {
  test('second action applies -5 penalty', () => {
    // d20=15, mod normally 5 → total 20 vs DC 17 = success.
    // With -5 penalty: total 15 vs DC 17 = failure.
    const state = makeState({
      actionsCommitted: 2,
      rpCommitted: 0,
      actionsTaken: 1,
    });
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: { ...node, isRootAccess: false },
      d20: 15,
    });
    expect(next.objectives['n1'].successes).toBe(0);
    expect(next.actionsTaken).toBe(2);
    expect(next.phase).toBe('resolved'); // exhausted → auto-end
  });

  test('RP-spend consumes a major action', () => {
    const state = makeState({
      actionsCommitted: 1,
      rpCommitted: 1,
      actionsTaken: 0,
    });
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node,
      d20: 1,
      spendRP: true,
    });
    expect(next.actionsTaken).toBe(1); // was 0, now consumes major action
    expect(next.rpCommitted).toBe(1);
    // 1 action committed, 1 taken → still resolved (manual end turn)
    expect(next.phase).toBe('resolved');
  });

  test('round increments when active player wraps to index 0', () => {
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice', class: 'lead', pairedSupportIds: [],
          computersRanks: 4, computersModifier: 5,
          deceiveModifier: 5, hackModifier: 5, processModifier: 5,
          personaModifier: 0, personaModifierLimit: 1,
          resolvePoints: 3, currentCP: 20, maxCP: 20, ejected: false,
        },
        {
          id: 'p2', name: 'Bob', class: 'lead', pairedSupportIds: [],
          computersRanks: 4, computersModifier: 5,
          deceiveModifier: 5, hackModifier: 5, processModifier: 5,
          personaModifier: 0, personaModifierLimit: 1,
          resolvePoints: 3, currentCP: 20, maxCP: 20, ejected: false,
        },
      ],
      turnOrder: ['p1', 'p2'],
      activePlayerIndex: 1, // currently on p2
      round: 2,
    });
    const next = reducer(state, { type: 'ADVANCE_TURN' });
    expect(next.activePlayerIndex).toBe(0); // wrapped back to p1
    expect(next.round).toBe(3);
  });
});

describe('turn reducer — END_PHASE', () => {
  test('ticks countermeasure countdowns', () => {
    const state = makeState({
      objectives: {
        n2: { nodeId: 'n2', successes: 0, countdown: 3 },
      },
    });
    const next = reducer(state, { type: 'END_PHASE' });
    expect(next.objectives['n2'].countdown).toBe(2);
    expect(next.turn).toBe(1);
  });
});

describe('turn reducer — SUPPORT_UPGRADE', () => {
  test('decrements RP for a support player', () => {
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Sam',
          class: 'support',
          pairedSupportIds: [],
          pairedLeadId: 'p2',
          computersRanks: 4,
          computersModifier: 5,
          deceiveModifier: 5,
          hackModifier: 5,
          processModifier: 5,
          personaModifier: 0,
          personaModifierLimit: 1,
          resolvePoints: 3,
          currentCP: 20,
          maxCP: 20,
          ejected: false,
        },
      ],
    });
    const next = reducer(state, { type: 'SUPPORT_UPGRADE', playerId: 'p1' });
    expect(next.players[0].resolvePoints).toBe(2);
  });

  test('does nothing if player has 0 RP', () => {
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Sam',
          class: 'support',
          pairedSupportIds: [],
          pairedLeadId: 'p2',
          computersRanks: 4,
          computersModifier: 5,
          deceiveModifier: 5,
          hackModifier: 5,
          processModifier: 5,
          personaModifier: 0,
          personaModifierLimit: 1,
          resolvePoints: 0,
          currentCP: 20,
          maxCP: 20,
          ejected: false,
        },
      ],
    });
    const next = reducer(state, { type: 'SUPPORT_UPGRADE', playerId: 'p1' });
    expect(next.players[0].resolvePoints).toBe(0);
  });
});

describe('turn reducer — SUPPORT_AID', () => {
  const aidNode: FlowNode = {
    id: 'n1',
    name: 'Target',
    x: 0,
    y: 0,
    category: 'module',
    resolve: { subskill: 'hack', dcModifier: 0, successesRequired: 1 },
  };

  const makePairedState = (overrides: Partial<GameState> = {}): GameState => ({
    ...makeState({
      players: [
        {
          id: 'p1', name: 'Lead', class: 'lead', pairedSupportIds: ['p2'],
          computersRanks: 4, computersModifier: 5,
          deceiveModifier: 5, hackModifier: 5, processModifier: 5,
          personaModifier: 0, personaModifierLimit: 1,
          resolvePoints: 3, currentCP: 20, maxCP: 20, ejected: false,
        },
        {
          id: 'p2', name: 'Sup', class: 'support', pairedSupportIds: [],
          pairedLeadId: 'p1',
          computersRanks: 4, computersModifier: 5,
          deceiveModifier: 5, hackModifier: 5, processModifier: 5,
          personaModifier: 0, personaModifierLimit: 1,
          resolvePoints: 3, currentCP: 20, maxCP: 20, ejected: false,
        },
      ],
      turnOrder: ['p1', 'p2'],
      activePlayerIndex: 1, // Support's turn
      ...overrides,
    }),
  });

  test('Aid DC is max(10, baseDC - 10)', () => {
    // Tier 1 node → baseDC = 17 → Aid DC = max(10, 17-10) = 10
    // d20=15, mod=5, total=20 vs DC 10 = major-success → +4 bonus
    const state = makePairedState();
    const next = reducer(state, {
      type: 'SUPPORT_AID',
      supportId: 'p2',
      leadId: 'p1',
      targetNode: aidNode,
      d20: 15,
    });
    expect(next.pendingAid).toEqual({ leadId: 'p1', bonus: 4, targetNodeId: 'n1' });
    expect(next.phase).toBe('resolved');
  });

  test('Aid failure grants no bonus', () => {
    // d20=1, mod=5, total=6 vs DC 10 = nat1/failure → no bonus
    const state = makePairedState();
    const next = reducer(state, {
      type: 'SUPPORT_AID',
      supportId: 'p2',
      leadId: 'p1',
      targetNode: aidNode,
      d20: 1,
    });
    expect(next.pendingAid).toBeUndefined();
  });

  test('Aid standard success grants +2 (not +4)', () => {
    // d20=10, mod=5, total=15 vs DC 10 = beat by 5 (not 10) → +2
    const state = makePairedState();
    const next = reducer(state, {
      type: 'SUPPORT_AID',
      supportId: 'p2',
      leadId: 'p1',
      targetNode: aidNode,
      d20: 10,
    });
    expect(next.pendingAid).toEqual({ leadId: 'p1', bonus: 2, targetNodeId: 'n1' });
  });

  test('RP-spend Aid grants +2 (no chance for +4)', () => {
    const state = makePairedState();
    const next = reducer(state, {
      type: 'SUPPORT_AID',
      supportId: 'p2',
      leadId: 'p1',
      targetNode: aidNode,
      d20: 1,
      spendRP: true,
    });
    expect(next.pendingAid).toEqual({ leadId: 'p1', bonus: 2, targetNodeId: 'n1' });
    expect(next.players[1].resolvePoints).toBe(2);
  });

  test('Lead consumes pendingAid on next ROLL_RESOLVE', () => {
    const state = makePairedState({
      activePlayerIndex: 0, // Lead's turn
      pendingAid: { leadId: 'p1', bonus: 4, targetNodeId: 'n1' },
      actionsCommitted: 1,
      actionsTaken: 0,
    });
    const nonRoot = { ...aidNode, isRootAccess: false };
    // Screen would compute aidBonus from state.pendingAid and pass it on the action.
    // d20=10, base mod=5, +4 aid = 9, total=19 vs DC 17 = standard success.
    const next = reducer(state, {
      type: 'ROLL_RESOLVE',
      playerId: 'p1',
      node: nonRoot,
      d20: 10,
      aidBonus: 4,
    });
    expect(next.objectives['n1'].successes).toBe(1);
    // Aid is consumed — no longer pending.
    expect(next.pendingAid).toBeUndefined();
  });

  test('Aid ignored when paired Support is ejected', () => {
    const state = makePairedState({
      players: [
        {
          id: 'p1', name: 'Lead', class: 'lead', pairedSupportIds: ['p2'],
          computersRanks: 4, computersModifier: 5,
          deceiveModifier: 5, hackModifier: 5, processModifier: 5,
          personaModifier: 0, personaModifierLimit: 1,
          resolvePoints: 3, currentCP: 20, maxCP: 20, ejected: false,
        },
        {
          id: 'p2', name: 'Sup', class: 'support', pairedSupportIds: [],
          pairedLeadId: 'p1',
          computersRanks: 4, computersModifier: 5,
          deceiveModifier: 5, hackModifier: 5, processModifier: 5,
          personaModifier: 0, personaModifierLimit: 1,
          resolvePoints: 3, currentCP: 0, maxCP: 20, ejected: true,
        },
      ],
    });
    const next = reducer(state, {
      type: 'SUPPORT_AID',
      supportId: 'p2',
      leadId: 'p1',
      targetNode: aidNode,
      d20: 20,
    });
    expect(next).toBe(state); // no-op
  });
});

describe('turn reducer — COLLECT_MODULE', () => {
  test('collects an accessible module without a roll or action cost', () => {
    const state = makeState({ actionsTaken: 1, visitedNodeIds: ['n1'] });
    const next = reducer(state, {
      type: 'COLLECT_MODULE',
      playerId: 'p1',
      node: moduleNode,
    });

    expect(next.visitedNodeIds).toContain('module-1');
    expect(next.objectives['module-1'].successes).toBe(1);
    expect(next.actionsTaken).toBe(1);
    expect(next.players[0].resolvePoints).toBe(3);
  });

  test('does not collect a non-module node', () => {
    const state = makeState();
    const next = reducer(state, {
      type: 'COLLECT_MODULE',
      playerId: 'p1',
      node,
    });

    expect(next).toBe(state);
  });
});