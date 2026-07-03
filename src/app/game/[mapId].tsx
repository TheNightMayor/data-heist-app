/**
 * GameScreen — main Game mode view.
 * Shows the flowchart, turn indicator, and the resolution modal.
 * Routes to /setup if no game state exists yet for the given mapId.
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { nanoid } from 'nanoid';
import { FlowCanvas } from '@/components/flow/flowCanvas/FlowCanvas';
import { FlowNodeView } from '@/components/flow/FlowNode';
import { Toast, type ToastKind } from '@/components/ui/Toast';
import { ResultModal, type RollResultInfo } from '@/components/game/ResultModal';
import { useGameStore } from '@/stores/gameStore';
import { loadMap } from '@/lib/flow/persistence';
import { reachableNodes, nodeStatus, nodeProgress } from '@/lib/flow/reachability';
import { effectiveDC } from '@/lib/starfinder/tables';
import { resolve, type Outcome } from '@/lib/resolution';
import { modifierFor } from '@/lib/game/types';
import { turnPenalty } from '@/lib/game/turn';
import type { FlowNode } from '@/lib/flow/types';

/**
 * Renders a row of action pips for the currently active player.
 *  - Lead:    major actions remaining (cyan squares).
 *  - Support: minor actions remaining (violet circles).
 *
 * `actionsCommitted` is clamped to a minimum of 1 so the default (uncommitted)
 * Lead still shows 1 dot. `actionsTaken` counts major actions consumed;
 * once it equals `actionsCommitted`, no dots remain.
 */
function ActionPips({
  class: cls,
  actionsCommitted,
  actionsTaken,
  minorActionsTaken,
}: {
  class: 'lead' | 'support';
  actionsCommitted: number;
  actionsTaken: number;
  minorActionsTaken: number;
}) {
  const isLead = cls === 'lead';
  const minorUsed = minorActionsTaken > 0;
  
  if (isLead) {
    const total = Math.max(actionsCommitted, 1);
    const used = actionsTaken;
    const remaining = Math.max(0, total - used);
    return (
      <View style={pipStyles.row} accessibilityLabel={`${remaining} actions remaining`}>
        {/* Lead Minor Action */}
        <View
          style={[
            pipStyles.dot,
            pipStyles.dotCircle,
            { backgroundColor: minorUsed ? '#1e293b' : '#a78bfa' },
          ]}
        />
        {/* Lead Major Actions */}
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              pipStyles.dot,
              pipStyles.dotSquare,
              { backgroundColor: i < remaining ? '#22d3ee' : '#1e293b' },
            ]}
          />
        ))}
      </View>
    );
  }

  // Support Class:
  // - Minor Action dot (Circle, Violet)
  // - Bought Major Action dot (Square, Cyan) if actionsCommitted > 0
  const hasBoughtMajor = actionsCommitted > 0;
  
  const majorUsed = actionsTaken > 0;

  return (
    <View style={pipStyles.row}>
      {/* Minor Action */}
      <View
        style={[
          pipStyles.dot,
          pipStyles.dotCircle,
          { backgroundColor: minorUsed ? '#1e293b' : '#a78bfa' },
        ]}
      />
      {/* Bought Major Action */}
      {hasBoughtMajor ? (
        <View
          style={[
            pipStyles.dot,
            pipStyles.dotSquare,
            { backgroundColor: majorUsed ? '#1e293b' : '#22d3ee' },
          ]}
        />
      ) : null}
    </View>
  );
}

const pipStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, marginTop: 6 },
  dot: { width: 10, height: 10 },
  dotSquare: { borderRadius: 2 },
  dotCircle: { borderRadius: 5 },
});

/**
 * Compact "current target" panel rendered in the topbar. Shows the node the
 * party is currently working on — a Lead's pending roll, or a Support's Aid
 * target. Acts as a stand-in "image" for the focus node until real art ships.
 */
function CurrentTargetPanel({
  targetNode,
  label,
  successes,
}: {
  targetNode: FlowNode | null;
  label: string;
  successes: number;
}) {
  if (!targetNode) {
    return (
      <View style={panelStyles.empty}>
        <Text style={panelStyles.emptyText}>select node</Text>
      </View>
    );
  }
  const catColors: Record<FlowNode['category'], { fill: string; border: string; icon: string }> = {
    module: { fill: '#1e3a8a', border: '#60a5fa', icon: '📦' },
    countermeasure: { fill: '#7f1d1d', border: '#f87171', icon: '🛡' },
    gateway: { fill: '#374151', border: '#9ca3af', icon: '🔀' },
  };
  const cat = catColors[targetNode.category];
  const dc = effectiveDC(targetNode.tier, targetNode.resolve);
  const subskill = targetNode.resolve?.subskill ?? 'hack';
  const successesRequired = targetNode.resolve?.successesRequired ?? 0;

  return (
    <View style={[panelStyles.panel, { borderColor: cat.border }]}>
      <View style={[panelStyles.iconBox, { backgroundColor: cat.fill, borderColor: cat.border }]}>
        <Text style={panelStyles.icon}>{cat.icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={panelStyles.label}>{label}</Text>
        <Text style={panelStyles.name} numberOfLines={1}>{targetNode.name}</Text>
        <Text style={panelStyles.meta}>
          DC {dc} • {subskill[0].toUpperCase() + subskill.slice(1)}
          {successesRequired > 0 ? ` • ${successes}/${successesRequired}` : ''}
        </Text>
      </View>
    </View>
  );
}

const panelStyles = StyleSheet.create({
  empty: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
    borderStyle: 'dashed',
  },
  emptyText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 280,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  label: { fontSize: 9, color: '#22d3ee', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  name: { fontSize: 13, color: '#f1f5f9', fontWeight: '700' },
  meta: { fontSize: 10, color: '#94a3b8', marginTop: 1 },
});

export default function GameScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isSmallScreen = windowWidth < 768;

  const { mapId } = useLocalSearchParams<{ mapId: string }>();
  const router = useRouter();
  const { state, map, dispatch, persist, endGame } = useGameStore();

  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [supportUpgradePromptOpen, setSupportUpgradePromptOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | undefined>(undefined);
  const [pendingRollNode, setPendingRollNode] = useState<FlowNode | null>(null);
  const [pendingRollKind, setPendingRollKind] = useState<'lead' | 'support-self'>('lead');
  const [planActions, setPlanActions] = useState(1);
  const [planRP, setPlanRP] = useState(0);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [resultModal, setResultModal] = useState<{ visible: boolean; rolling: boolean; info: RollResultInfo | null }>({
    visible: false,
    rolling: false,
    info: null,
  });
  const [toast, setToast] = useState<{ visible: boolean; message: string; detail?: string; kind: ToastKind; key: number }>({
    visible: false,
    message: '',
    kind: 'info',
    key: 0,
  });

  function showToast(message: string, detail: string | undefined, kind: ToastKind) {
    setToast({ visible: true, message, detail, kind, key: Date.now() });
  }

  // Boot: if no game state, redirect to setup.
  useEffect(() => {
    if (!state && mapId) {
      loadMap(mapId).then((m) => {
        if (m) router.replace(`/setup?mapId=${m.id}`);
      });
    }
  }, [state, mapId, router]);

  // Persist on every state change.
  useEffect(() => {
    if (state) persist();
  }, [state, persist]);

  // Reset planning steppers when the active player changes.
  useEffect(() => {
    setPlanActions(1);
    setPlanRP(0);
    setPlanModalOpen(false);
    setPendingRollKind('lead');
    setSelectedLeadId(undefined);
  }, [state?.activePlayerIndex, state?.round]);

  useEffect(() => {
    if (supportUpgradePromptOpen) {
      const activeId = state?.turnOrder?.[state.activePlayerIndex];
      const supportPlayer = state?.players.find((p) => p.id === activeId);
      const firstLead = state?.players.find((p) => p.class === 'lead');
      setSelectedLeadId(supportPlayer?.pairedLeadId ?? firstLead?.id);
    }
  }, [supportUpgradePromptOpen, state?.players, state?.turnOrder, state?.activePlayerIndex]);

  // Auto-advance when the reducer marks phase 'advancing' (e.g. actions exhausted).
  useEffect(() => {
    if (state?.phase === 'advancing' && !state.finished) {
      dispatch({ type: 'ADVANCE_TURN' });
    }
  }, [state?.phase, state?.finished, dispatch]);

  // Toast for each new log entry (skip entries from current render before mount).
  const seenLogKeys = useRef<Set<number>>(new Set());
  useEffect(() => {
    const log = state?.log ?? [];
    const seen = seenLogKeys.current;
    const fresh = log.filter((entry) => !seen.has(entry.turn));
    for (const entry of fresh) seen.add(entry.turn);
    if (fresh.length === 0) return;
    const last = fresh[0];
    if (!last.outcome) return;

    const player = state?.players.find((p) => p.id === last.playerId);
    const playerName = player?.name ?? 'Someone';

    let kind: ToastKind = 'info';
    let message = `${playerName}: ${last.outcome}`;
    let detail: string | undefined;

    if (last.outcome === 'rp-spend') {
      kind = 'success';
      message = `${playerName}: Auto-Success`;
      detail = 'Resolve Point spent — no roll needed';
    } else if (last.outcome === 'nat20') {
      kind = 'success';
      message = `${playerName}: Natural 20!`;
      detail = `Roll ${last.roll}, total ${last.total} vs DC ${last.dc}`;
    } else if (last.outcome === 'major-success') {
      kind = 'success';
      message = `${playerName}: Major Success!`;
      detail = `Roll ${last.roll}, total ${last.total} vs DC ${last.dc} — beat by 10+`;
    } else if (last.outcome === 'standard-success') {
      kind = 'success';
      message = `${playerName}: Success`;
      detail = `Roll ${last.roll}, total ${last.total} vs DC ${last.dc}`;
    } else if (last.outcome === 'failure') {
      kind = 'failure';
      message = `${playerName}: Failure`;
      detail = `Roll ${last.roll}, total ${last.total} vs DC ${last.dc}`;
    } else if (last.outcome === 'nat1') {
      kind = 'critical';
      message = `${playerName}: Natural 1!`;
      detail = last.cpLost && last.cpLost > 0
        ? `Lost ${last.cpLost} CP to countermeasure`
        : `Roll ${last.roll} — auto-fail`;
    }

    showToast(message, detail, kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.log]);

  const reachableIds = useMemo(() => {
    if (!map || !state) return new Set<string>();
    return reachableNodes(map, {
      visitedNodeIds: new Set(state.visitedNodeIds),
      hazardSkipActive: !!state.hazardSkipActive,
      permanentlyFailedNodeIds: new Set(state.permanentlyFailedNodeIds),
      objectives: state.objectives,
    });
  }, [map, state]);

  // Per-node visual state and progress fraction for the ring overlay.
  const { statusById, progressById } = useMemo(() => {
    const s: Record<string, ReturnType<typeof nodeStatus>> = {};
    const p: Record<string, number> = {};
    if (!map || !state) return { statusById: s, progressById: p };
    for (const node of map.nodes) {
      s[node.id] = nodeStatus(
        node,
        {
          visitedNodeIds: new Set(state.visitedNodeIds),
          hazardSkipActive: !!state.hazardSkipActive,
          permanentlyFailedNodeIds: new Set(state.permanentlyFailedNodeIds),
          objectives: state.objectives,
        },
        map,
      );
      p[node.id] = nodeProgress(node, { objectives: state.objectives });
    }
    return { statusById: s, progressById: p };
  }, [map, state]);

  // The "current target" — what node the party is working on right now.
  // Priority: pending Aid target > Lead's pending roll > selected node.
  const activeTargetId = state?.pendingAid?.targetNodeId ?? pendingRollNode?.id ?? selectedNode?.id ?? null;

  const activePlayerId = state?.turnOrder?.[state?.activePlayerIndex];
  const activePlayer = state?.players.find((p) => p.id === activePlayerId);

  const otherLeadsExist = useMemo(() => {
    if (!state?.players || !activePlayerId) return false;
    return state.players.some(p => p.class === 'lead' && p.id !== activePlayerId && !p.ejected);
  }, [state?.players, activePlayerId]);

  const currentAidBonus = useMemo(() => {
    if (activePlayer?.class !== 'lead' || !activePlayerId) return 0;
    return state?.pendingAid?.leadId === activePlayerId ? state.pendingAid.bonus : 0;
  }, [activePlayer?.class, activePlayerId, state?.pendingAid]);

  if (!state || !map) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading game…</Text>
      </View>
    );
  }

  const onSelectNode = (node: FlowNode | null) => {
    if (!node) {
      setSelectedNode(null);
      return;
    }
    if (state.finished) return;
    
    // Allow selecting any node to see its info in the actions panel.
    setSelectedNode(node);
  };

  const openRollForNode = (node: FlowNode, kind: 'lead' | 'support-self' = 'lead') => {
    // For Support hackers, we don't block opening the modal anymore.
    // The RP cost check happens inside handleRoll when they actually commit.
    setPendingRollNode(node);
    setPendingRollKind(kind);
    setModalOpen(true);
  };

  const rollDie = (sides: number = 20) => Math.floor(Math.random() * sides) + 1;

  const handleRoll = (spendRP: boolean, overrideNode?: FlowNode, overrideKind?: 'lead' | 'support-self') => {
    const node = overrideNode || pendingRollNode;
    const kind = overrideKind || pendingRollKind;
    if (!node || !activePlayer) return;

    // Pre-calculate RP cost for validation.
    const rpCost = (kind === 'support-self' ? 1 : 0) + (spendRP ? 1 : 0);
    if (rpCost > activePlayer.resolvePoints) {
      showToast(`Requires ${rpCost} Resolve Points`, undefined, 'failure');
      return;
    }

    const d20 = rollDie(20);
    const subskill = node.resolve?.subskill ?? 'hack';
    const baseModifier = modifierFor(activePlayer, subskill);
    let modifier = baseModifier;
    const dc = effectiveDC(node.tier, node.resolve);

    // Apply multi-action penalty
    const penalty = turnPenalty(state.actionsTaken, state.rpCommitted);
    modifier += penalty;

    // Consuming pending Aid from a paired Support, if any.
    let aidBonus = 0;
    const pendingAid = state.pendingAid;
    if (
      kind === 'lead' &&
      activePlayer.class === 'lead' &&
      pendingAid?.leadId === activePlayer.id
    ) {
      aidBonus = pendingAid.bonus;
    }
    modifier += aidBonus;

    // Pre-compute the outcome so we can show it after the rolling animation.
    const outcome: Outcome = resolve({ d20, modifier, dc, spendRP });

    const applied = Math.min(outcome.successes, node.resolve?.successesRequired ?? 1);

    let resultKind: RollResultInfo['kind'] = 'info';
    let outcomeLabel = 'Roll';
    let detailString = '';

    if (outcome.kind === 'rp-spend') {
      resultKind = 'success';
      outcomeLabel = 'Auto-Success (Resolve Point)';
      detailString = 'RP spent — no roll needed';
    } else if (outcome.kind === 'nat20') {
      resultKind = 'success';
      outcomeLabel = 'Natural 20!';
    } else if (outcome.kind === 'major-success') {
      resultKind = 'success';
      outcomeLabel = 'Major Success';
    } else if (outcome.kind === 'standard-success') {
      resultKind = 'success';
      outcomeLabel = 'Success';
    } else if (outcome.kind === 'failure') {
      resultKind = 'failure';
      outcomeLabel = 'Failure';
    } else if (outcome.kind === 'nat1') {
      resultKind = 'critical';
      outcomeLabel = 'Natural 1!';
      if (outcome.cpDamageRoll !== undefined && outcome.cpDamageRoll <= 3) {
        detailString = 'Lost 1 CP to countermeasure';
      }
    }

    const info: RollResultInfo = {
      d20: spendRP ? 0 : d20,
      modifier,
      baseModifier,
      penalty: penalty !== 0 ? penalty : undefined,
      aidBonus: aidBonus !== 0 ? aidBonus : undefined,
      dc,
      total: spendRP ? dc : outcome.total,
      outcomeLabel,
      successes: applied,
      kind: resultKind,
      detail: detailString,
      nodeName: node.name,
    };

    // Close pre-roll modal.
    setModalOpen(false);

    // For RP-spend (auto-success), skip the rolling animation — go straight to result.
    if (spendRP) {
      setResultModal({ visible: true, rolling: false, info });
    } else {
      setResultModal({ visible: true, rolling: true, info });
      // Switch from rolling to result after 800ms.
      setTimeout(() => {
        setResultModal((prev) => ({ ...prev, rolling: false }));
      }, 800);
    }

    // Dispatch the actual game state change.
    dispatch({
      type: 'ROLL_RESOLVE',
      playerId: activePlayer.id,
      node: node,
      d20,
      spendRP,
      aidBonus: aidBonus > 0 ? aidBonus : undefined,
    });
    setPendingRollNode(null);
    setPendingRollKind('lead');
  };

  const dismissResultModal = () => {
    setResultModal({ visible: false, rolling: false, info: null });
  };

  const handleSupportAction = (action: 'aid' | 'rp' | 'pass') => {
    if (!activePlayer) return;

    setSupportUpgradePromptOpen(false);
    const target = selectedNode;

    if (action === 'pass') {
      dispatch({ type: 'ADVANCE_TURN' });
      setSelectedNode(null);
      return;
    }

    if (action === 'rp') {
      // For Support: Spend RP for own major action roll (auto-success).
      // (Leads might eventually get their own RP minor actions here too).
      if (!target) {
        showToast('Pick a target node first', undefined, 'info');
        return;
      }
      if (activePlayer.resolvePoints < 2) {
        showToast('Requires 2 Resolve Points', undefined, 'failure');
        return;
      }
      handleRoll(true, target, 'support-self');
      return;
    }

    // action === 'aid'
    if (!target) {
      showToast('Pick a target node first', undefined, 'info');
      return;
    }

    // Identify target Lead. 
    // If player is a Support, they might have a pairedLeadId. 
    // If player is a Lead, they must pick a DIFFERENT Lead.
    const chosenLeadId = selectedLeadId || 
      (activePlayer.class === 'support' ? state.players.find(p => p.id === activePlayer.id)?.pairedLeadId : undefined);
    
    const lead = chosenLeadId ? state.players.find((p) => p.id === chosenLeadId) : undefined;
    
    if (!lead || (lead.id === activePlayer.id)) {
      showToast('Select a Lead hacker to aid', undefined, 'failure');
      return;
    }

    // Roll the Aid check immediately.
    const d20 = rollDie(20);
    const modifier = modifierFor(activePlayer, 'hack');
    const baseDC = effectiveDC(target.tier, target.resolve);
    const dc = Math.max(10, baseDC - 10);
    const outcome = resolve({ d20, modifier, dc });

    let resultKind: RollResultInfo['kind'] = 'info';
    let outcomeLabel = 'Aid';
    let detail: string | undefined;

    if (outcome.kind === 'nat20' || outcome.kind === 'major-success') {
      resultKind = 'success';
      outcomeLabel = 'Aid Success (+4)';
      detail = 'Major success — bonus increased to +4';
    } else if (outcome.kind === 'standard-success') {
      resultKind = 'success';
      outcomeLabel = 'Aid Success (+2)';
      detail = 'Standard success — bonus +2';
    } else if (outcome.kind === 'failure') {
      resultKind = 'failure';
      outcomeLabel = 'Aid Failure';
      detail = 'No bonus granted';
    } else if (outcome.kind === 'nat1') {
      resultKind = 'critical';
      outcomeLabel = 'Aid Critical Fail';
      detail = 'Natural 1 — no bonus';
    }

    const info: RollResultInfo = {
      d20,
      modifier,
      baseModifier: modifier,
      dc,
      total: outcome.total,
      outcomeLabel,
      successes: 0,
      kind: resultKind,
      detail,
      nodeName: `${target.name} (Aid)`,
    };

    setResultModal({ visible: true, rolling: true, info });
    setTimeout(() => {
      setResultModal((prev) => ({ ...prev, rolling: false }));
    }, 800);

    dispatch({
      type: 'SUPPORT_AID',
      supportId: activePlayer.id,
      leadId: lead.id,
      targetNode: target,
      d20,
    });
    // setSelectedNode(null); // Keep panel open
  };

  const handleEndTurn = () => {
    dispatch({ type: 'END_PHASE' });
    dispatch({ type: 'ADVANCE_TURN' });
    setSelectedNode(null);
  };

  const handleNewGame = () => {
    endGame();
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      {/* Toast notifications for roll outcomes */}
      <Toast
        key={toast.key}
        visible={toast.visible}
        message={toast.message}
        detail={toast.detail}
        kind={toast.kind}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      <View style={{ flex: 1 }}>
        {/* Header — Turn Order, Round and Objectives */}
        <View style={styles.header}>
        <View style={styles.headerRow}>
          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.headerTurnOrder}
          >
            {state.turnOrder
              .map((id) => state.players.find((p) => p.id === id))
              .filter((p): p is NonNullable<typeof p> => !!p)
              .map((p) => {
                const isActive = p.id === activePlayerId;
                return (
                  <View key={p.id} style={{ alignItems: 'center' }}>
                    <View style={[styles.miniPlayerChip, isActive ? styles.miniPlayerChipActive : null]}>
                      <Text style={[
                        styles.miniPlayerClass,
                        isActive ? (p.class === 'lead' ? styles.miniPlayerClassActiveLead : styles.miniPlayerClassActiveSupport) : null
                      ]}>
                        {p.class === 'lead' ? 'LEAD' : 'SUPPORT'}
                      </Text>
                      <Text style={[styles.miniPlayerName, isActive ? styles.miniPlayerNameActive : null]}>
                        {p.name}
                      </Text>
                      <Text style={styles.miniPlayerStats}>
                        RP {p.resolvePoints} • CP {p.currentCP}/{p.maxCP}
                      </Text>
                      {p.ejected ? <Text style={styles.ejected}>EJECTED</Text> : null}
                    </View>
                    {isActive && !p.ejected ? (
                      <ActionPips
                        class={p.class}
                        actionsCommitted={state.actionsCommitted}
                        actionsTaken={state.actionsTaken}
                        minorActionsTaken={state.minorActionsTaken}
                      />
                    ) : null}
                  </View>
                );
              })}
          </ScrollView>

          <View style={styles.roundChip}>
            <Text style={styles.roundLabel}>ROUND</Text>
            <Text style={styles.roundValue}>{state.round + 1}</Text>
          </View>
        </View>

        <View style={styles.statRow}>
          {Object.entries(state.objectives || {}).map(([id, obj]) => {
            const node = map?.nodes.find((n) => n.id === id);
            return (
              <View key={id} style={styles.statBox}>
                <Text style={styles.statLabel}>{node?.name || id}</Text>
                <Text style={styles.statValue}>
                  {obj.successes}/{node?.resolve?.successesRequired || 1}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Canvas — constrained to the central monitor area (matches the bezel) */}
      <View style={styles.canvasWrap}>
        <FlowCanvas
          map={map}
          mode="game"
          reachableIds={reachableIds}
          activeId={activeTargetId}
          statusById={statusById}
          progressById={progressById}
          selectedId={selectedNode?.id}
          onSelectNode={onSelectNode}
          activePlayerClass={activePlayer?.class}
          canPlanTurn={activePlayer?.class === 'lead' && state.actionsTaken === 0 && state.actionsCommitted <= 1}
          onPlanTurn={() => setPlanModalOpen(true)}
          onMajorAction={(node) => openRollForNode(node, activePlayer?.class === 'support' ? 'support-self' : 'lead')}
          onSupportAction={() => setSupportUpgradePromptOpen(true)}
          onBuyMajorAction={() => activePlayer && dispatch({ type: 'SUPPORT_BUY_ACTION', playerId: activePlayer.id })}
          onRefundMajorAction={() => activePlayer && dispatch({ type: 'SUPPORT_REFUND_ACTION', playerId: activePlayer.id })}
          onEndTurn={handleEndTurn}
          objectives={state.objectives}
          playerName={activePlayer?.name}
          rp={activePlayer?.resolvePoints ?? 0}
          cp={activePlayer?.currentCP ?? 0}
          maxCp={activePlayer?.maxCP ?? 0}
          actionsCommitted={state.actionsCommitted}
          actionsTaken={state.actionsTaken}
          minorActionsTaken={state.minorActionsTaken}
          otherLeadsExist={otherLeadsExist}
          aidBonus={currentAidBonus}
          renderNode={(n, info) => (
            <FlowNodeView
              node={n}
              mode="game"
              status={info.status}
              progress={info.progress}
              active={info.active}
              selected={info.selected}
            />
          )}
        />
      </View>

      {/* Pre-roll modal */}
      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Resolve Check</Text>
            {pendingRollNode ? (
              <Text style={styles.modalSub}>
                {pendingRollNode.name} (DC {effectiveDC(pendingRollNode.tier, pendingRollNode.resolve)})
              </Text>
            ) : null}
            
            {state.pendingAid?.leadId === activePlayer?.id ? (
              <View style={styles.aidBanner}>
                <Text style={styles.aidBannerText}>
                  ✨ Receiving +{state.pendingAid.bonus} Aid from Support hacker
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={() => handleRoll(false)}
            >
              <Text style={styles.modalBtnText}>
                🎲 Roll d20{state.pendingAid?.leadId === activePlayer?.id ? ` (+${state.pendingAid.bonus} Aid)` : ''}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                styles.modalBtnSecondary,
                !activePlayer || activePlayer.resolvePoints < (activePlayer.class === 'support' ? 2 : 1) ? styles.modalBtnDisabled : null,
              ]}
              onPress={() => handleRoll(true)}
              disabled={!activePlayer || activePlayer.resolvePoints < (activePlayer.class === 'support' ? 2 : 1)}
            >
              <Text style={styles.modalBtnText}>
                ⭐ Spend RP (auto-success){activePlayer?.class === 'support' ? ' — 2 RP' : ''}
                {state.pendingAid?.leadId === activePlayer?.id ? ` (+${state.pendingAid.bonus} Aid ignored)` : ''}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => {
                setModalOpen(false);
                setPendingRollNode(null);
              }}
            >
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Planning modal — opt-in. Default flow is 1 action / 0 RP (no modal). */}
      <Modal visible={!!(planModalOpen && activePlayer?.class === 'lead')} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Plan Your Turn</Text>
            <Text style={styles.modalSub}>
              {activePlayer?.name}, opt in to more major actions and resolve points.
            </Text>

            {/* Actions stepper */}
            <View style={styles.stepperRow}>
              <Text style={styles.stepperLabel}>Major Actions</Text>
              <View style={styles.stepperCtl}>
                <Pressable
                  style={[styles.stepperBtn, planActions <= 1 ? styles.stepperBtnDisabled : null]}
                  onPress={() => setPlanActions((n) => Math.max(1, n - 1))}
                  disabled={planActions <= 1}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{planActions}</Text>
                <Pressable
                  style={[styles.stepperBtn, planActions >= 4 ? styles.stepperBtnDisabled : null]}
                  onPress={() => setPlanActions((n) => Math.min(4, n + 1))}
                  disabled={planActions >= 4}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.helperText}>Each action after the first adds −5 (cumulative).</Text>

            {/* RP stepper */}
            <View style={styles.stepperRow}>
              <Text style={styles.stepperLabel}>Resolve Points</Text>
              <View style={styles.stepperCtl}>
                <Pressable
                  style={[styles.stepperBtn, planRP <= 0 ? styles.stepperBtnDisabled : null]}
                  onPress={() => setPlanRP((n) => Math.max(0, n - 1))}
                  disabled={planRP <= 0}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{planRP}</Text>
                <Pressable
                  style={[
                    styles.stepperBtn,
                    (planRP >= 3 || planRP >= (activePlayer?.resolvePoints ?? 0)) ? styles.stepperBtnDisabled : null,
                  ]}
                  onPress={() =>
                    setPlanRP((n) => Math.min(3, activePlayer?.resolvePoints ?? 0, n + 1))
                  }
                  disabled={planRP >= 3 || planRP >= (activePlayer?.resolvePoints ?? 0)}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.helperText}>
              Each RP reduces the cumulative penalty by 5. Free top-up during the turn (no action spent).
            </Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Final penalty at action {planActions}:</Text>
              <Text style={styles.summaryValue}>
                {turnPenalty(planActions - 1, planRP)}
              </Text>
            </View>

            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={() => {
                if (!activePlayer) return;
                dispatch({
                  type: 'PLAN_TURN',
                  playerId: activePlayer.id,
                  actionsCommitted: planActions,
                  rpCommitted: planRP,
                });
                setPlanModalOpen(false);
              }}
            >
              <Text style={styles.modalBtnText}>Confirm Plan</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => setPlanModalOpen(false)}
            >
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Support action prompt */}
      <Modal visible={supportUpgradePromptOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Support Action</Text>
            <Text style={styles.modalSub}>{activePlayer?.name}, choose a Lead to aid:</Text>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginVertical: 10 }}>
              {state.players
                .filter((p) => p.class === 'lead' && p.id !== activePlayerId)
                .map((lead) => (
                  <Pressable
                    key={lead.id}
                    onPress={() => {
                      if (!activePlayer) return;
                      setSelectedLeadId(lead.id);
                      dispatch({ type: 'SET_PAIRED_LEAD', supportId: activePlayer.id, leadId: lead.id });
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: selectedLeadId === lead.id ? '#22d3ee' : 'transparent',
                      backgroundColor: '#0f172a',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{lead.name}</Text>
                  </Pressable>
                ))}
            </View>
            {selectedNode ? (
              <Text style={styles.modalSub}>
                Target: {selectedNode.name} (DC {effectiveDC(selectedNode.tier, selectedNode.resolve)})
              </Text>
            ) : null}
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={() => handleSupportAction('aid')}
            >
              <Text style={styles.modalBtnText}>✨ Aid (+2 / +4)</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                styles.modalBtnSecondary,
                (!activePlayer || (activePlayer.resolvePoints ?? 0) < 2) ? styles.modalBtnDisabled : null,
              ]}
              onPress={() => handleSupportAction('rp')}
              disabled={!activePlayer || (activePlayer.resolvePoints ?? 0) < 2}
            >
              <Text style={styles.modalBtnText}>⭐ Spend RP (auto-success) — 2 RP</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => handleSupportAction('pass')}
            >
              <Text style={styles.modalBtnText}>Pass turn</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Animated dice roll result modal */}
      {resultModal.visible ? (
        <ResultModal
          visible={resultModal.visible}
          rolling={resultModal.rolling}
          result={resultModal.info}
          playerName={activePlayer?.name ?? 'Player'}
          nodeName={pendingRollNode?.name ?? 'Target'}
          onDismiss={dismissResultModal}
        />
      ) : null}

      {/* Win/Lose modal */}
      <Modal visible={!!state.finished} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {state.result === 'win' ? '🎉 Heist Successful!' : '💀 Heist Failed'}
            </Text>
            <Text style={styles.modalSub}>
              {state.result === 'win' ? 'You reached root access.' : 'All personas ejected.'}
            </Text>
            <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleNewGame}>
              <Text style={styles.modalBtnText}>Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  loading: { flex: 1, backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94a3b8', fontSize: 16 },
  header: {
    padding: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTurnOrder: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 12,
  },
  miniPlayerChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  miniPlayerChipActive: {
    borderColor: '#22d3ee',
    backgroundColor: '#0f172a',
  },
  miniPlayerClass: {
    fontSize: 8,
    color: '#64748b',
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  miniPlayerClassActiveLead: {
    color: '#22d3ee',
  },
  miniPlayerClassActiveSupport: {
    color: '#a78bfa',
  },
  miniPlayerName: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '700',
  },
  miniPlayerNameActive: {
    color: '#fff',
  },
  miniPlayerStats: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 1,
  },
  roundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  roundLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '800',
    marginRight: 6,
  },
  roundValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statLabel: { fontSize: 9, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 14, color: '#22d3ee', fontWeight: '800' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  turnLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: '700' },
  activeName: { fontSize: 16, color: '#f1f5f9', fontWeight: '800' },
  statBox: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    alignItems: 'center',
  },
  statLabel: { fontSize: 9, color: '#64748b', fontWeight: '700' },
  statValue: { fontSize: 14, color: '#22d3ee', fontWeight: '800' },
  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#7f1d1d',
    borderRadius: 6,
  },
  endBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  planBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0e7490',
    borderRadius: 6,
  },
  rollBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#22c55e',
    borderRadius: 6,
  },
  rollBtnDisabled: {
    opacity: 0.5,
    backgroundColor: '#1e293b',
  },
  rollBtnText: {
    color: '#020617',
    fontWeight: '700',
    fontSize: 12,
  },
  planBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  playerStrip: {
    position: 'absolute',
    left: 12,
    top: 60,
    maxHeight: '60%',
    paddingVertical: 0,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#054357',
  },
  // Canvas wrap fills the available width (player strip overlays it on the left),
  // with vertical insets so it doesn't touch the top/bottom of the screen.
  canvasWrap: {
    position: 'relative',
    flex: 1,
    marginTop: 10,
    marginBottom: 10,
  },
  playerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 140,
  },
  playerChipActive: { borderColor: '#22d3ee' },
  playerName: { fontSize: 13, color: '#f1f5f9', fontWeight: '700' },
  playerStats: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  ejected: { fontSize: 10, color: '#f87171', fontWeight: '700', marginTop: 2 },
  canvasContainer: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#0f172a',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#22d3ee',
    gap: 10,
  },
  modalTitle: { fontSize: 18, color: '#22d3ee', fontWeight: '800', textAlign: 'center' },
  modalSub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginBottom: 4 },
  aidBanner: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    borderWidth: 1,
    borderColor: '#22d3ee',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  aidBannerText: {
    color: '#22d3ee',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBtn: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnPrimary: { backgroundColor: '#0e7490' },
  modalBtnSecondary: { backgroundColor: '#1e293b' },
  modalBtnCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#475569' },
  modalBtnDisabled: { opacity: 0.4 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  stepperLabel: { color: '#cbd5e1', fontSize: 14, fontWeight: '700' },
  stepperCtl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { backgroundColor: '#334155', opacity: 0.5 },
  stepperBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  stepperValue: { color: '#22d3ee', fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  helperText: { color: '#64748b', fontSize: 11, fontStyle: 'italic' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  summaryLabel: { color: '#94a3b8', fontSize: 12 },
  summaryValue: { color: '#fbbf24', fontSize: 16, fontWeight: '800' },
});