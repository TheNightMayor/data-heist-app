/**
 * GameScreen — main Game mode view.
 * Shows the flowchart, turn indicator, and the resolution modal.
 * Routes to /setup if no game state exists yet for the given mapId.
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { nanoid } from 'nanoid';
import { FlowCanvas } from '@/components/flow/FlowCanvas';
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
}: {
  class: 'lead' | 'support';
  actionsCommitted: number;
  actionsTaken: number;
}) {
  // Lead: pip count = remaining major actions.
  // Support: 1 dot if Aid hasn't been used, 0 if it has.
  const total = cls === 'lead' ? Math.max(actionsCommitted, 1) : 1;
  const used = cls === 'lead' ? actionsTaken : 0; // Aid consumes the whole turn
  const remaining = Math.max(0, total - used);

  const dotColor = cls === 'lead' ? '#22d3ee' : '#a78bfa';
  const emptyColor = '#1e293b';

  return (
    <View style={pipStyles.row} accessibilityLabel={`${remaining} ${cls === 'lead' ? 'major' : 'minor'} action${remaining === 1 ? '' : 's'} remaining`}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            pipStyles.dot,
            cls === 'lead' ? pipStyles.dotSquare : pipStyles.dotCircle,
            { backgroundColor: i < remaining ? dotColor : emptyColor },
          ]}
        />
      ))}
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
        <Text style={panelStyles.emptyText}>No active target</Text>
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

  // Resolve the current target node + label for the topbar panel.
  const currentTargetNode = useMemo(() => {
    if (!map || !activeTargetId) return null;
    return map.nodes.find((n) => n.id === activeTargetId) ?? null;
  }, [map, activeTargetId]);

  const activePlayerId = state?.turnOrder?.[state?.activePlayerIndex];
  const activePlayer = state?.players.find((p) => p.id === activePlayerId);

  const currentTargetLabel = state?.pendingAid
    ? 'Aid target'
    : pendingRollNode
      ? 'Pending roll'
      : selectedNode
        ? 'Selected node'
        : '';
  const currentTargetSuccesses = currentTargetNode
    ? state?.objectives[currentTargetNode.id]?.successes ?? 0
    : 0;

  if (!state || !map) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading game…</Text>
      </View>
    );
  }

  const onSelectNode = (node: FlowNode) => {
    if (state.finished) return;
    if (!reachableIds.has(node.id)) return;
    // Block new rolls once the Lead has spent their committed actions.
    if (
      activePlayer?.class === 'lead' &&
      state.actionsCommitted > 0 &&
      state.actionsTaken >= state.actionsCommitted
    ) {
      return;
    }
    // Land on the node for both Lead and Support. For Supports we don't
    // immediately show the popup; they get the same selection UX as Leads.
    setSelectedNode(node);
    if (activePlayer?.class === 'lead') return;
  };

  const openRollForNode = (node: FlowNode, kind: 'lead' | 'support-self' = 'lead') => {
    setPendingRollNode(node);
    setPendingRollKind(kind);
    setModalOpen(true);
  };

  const rollDie = (sides: number = 20) => Math.floor(Math.random() * sides) + 1;

  const handleRoll = (spendRP: boolean) => {
    if (!pendingRollNode || !activePlayer) return;
    const d20 = rollDie(20);
    const subskill = pendingRollNode.resolve?.subskill ?? 'hack';
    let modifier = modifierFor(activePlayer, subskill);
    const dc = effectiveDC(pendingRollNode.tier, pendingRollNode.resolve);

    // Consume pending Aid from a paired Support, if any. Only applies when
    // this is a Lead roll (pendingRollKind === 'lead').
    let aidBonus = 0;
    if (
      pendingRollKind === 'lead' &&
      activePlayer.class === 'lead' &&
      state.pendingAid?.leadId === activePlayer.id
    ) {
      aidBonus = state.pendingAid.bonus;
    }
    modifier += aidBonus;

    // Pre-compute the outcome so we can show it after the rolling animation.
    const outcome: Outcome = resolve({ d20, modifier, dc, spendRP });

    const applied = Math.min(outcome.successes, pendingRollNode.resolve?.successesRequired ?? 1);

    let kind: RollResultInfo['kind'] = 'info';
    let outcomeLabel = 'Roll';
    let detail: string | undefined;

    if (outcome.kind === 'rp-spend') {
      kind = 'success';
      outcomeLabel = 'Auto-Success (Resolve Point)';
      detail = 'RP spent — no roll needed';
    } else if (outcome.kind === 'nat20') {
      kind = 'success';
      outcomeLabel = 'Natural 20!';
    } else if (outcome.kind === 'major-success') {
      kind = 'success';
      outcomeLabel = 'Major Success';
    } else if (outcome.kind === 'standard-success') {
      kind = 'success';
      outcomeLabel = 'Success';
    } else if (outcome.kind === 'failure') {
      kind = 'failure';
      outcomeLabel = 'Failure';
    } else if (outcome.kind === 'nat1') {
      kind = 'critical';
      outcomeLabel = 'Natural 1!';
      if (outcome.cpDamageRoll !== undefined && outcome.cpDamageRoll <= 3) {
        detail = 'Lost 1 CP to countermeasure';
      }
    }

    const finalDetail = aidBonus > 0
      ? `${detail ?? ''}${detail ? ' • ' : ''}Aid bonus +${aidBonus}`.trim()
      : detail;

    const info: RollResultInfo = {
      d20: spendRP ? 0 : d20,
      modifier,
      dc,
      total: spendRP ? dc : outcome.total,
      outcomeLabel,
      successes: applied,
      kind,
      detail: finalDetail,
      nodeName: pendingRollNode.name,
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
      node: pendingRollNode,
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
    if (!activePlayer || activePlayer.class !== 'support') return;
    setSupportUpgradePromptOpen(false);
    const target = selectedNode;
    if (action === 'pass') {
      dispatch({ type: 'ADVANCE_TURN' });
      setSelectedNode(null);
      return;
    }
    if (action === 'rp') {
      // Spend RP for own major action — one roll of their own (no planning).
      if (!target) {
        showToast('Pick a target node first', undefined, 'info');
        return;
      }
      if (activePlayer.resolvePoints <= 0) {
        showToast('No Resolve Points left', undefined, 'failure');
        return;
      }
      setPendingRollNode(target);
      // Reuse the roll modal; mark this roll as the Support's own.
      setPendingRollKind('support-self');
      setModalOpen(true);
      return;
    }
    // action === 'aid'
    if (!target) {
      showToast('Pick a target node first', undefined, 'info');
      return;
    }
    // Prefer the UI-selected lead, otherwise read the current pairing from state
    const supportPlayer = state.players.find((p) => p.id === activePlayer.id);
    const chosenLeadId = selectedLeadId ?? supportPlayer?.pairedLeadId;
    const lead = chosenLeadId ? state.players.find((p) => p.id === chosenLeadId) : undefined;
    if (!lead) {
      showToast('No paired Lead to aid', undefined, 'failure');
      return;
    }
    // Roll the Aid check immediately.
    const d20 = rollDie(20);
    dispatch({
      type: 'SUPPORT_AID',
      supportId: activePlayer.id,
      leadId: lead.id,
      targetNode: target,
      d20,
    });
    setSelectedNode(null);
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

      {/* Top bar — turn indicator + actions */}
      <View style={styles.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.turnLabel}>
            Round {state.round + 1} • Turn {state.turn + 1}
          </Text>
          <Text style={styles.activeName}>
            {activePlayer?.name ?? '—'} ({activePlayer?.class})
          </Text>
        </View>
        <CurrentTargetPanel
          targetNode={currentTargetNode}
          label={currentTargetLabel}
          successes={currentTargetSuccesses}
        />
        {state.actionsCommitted > 0 && (
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Actions</Text>
            <Text style={styles.statValue}>
              {state.actionsTaken}/{state.actionsCommitted}
            </Text>
          </View>
        )}
        {state.actionsCommitted > 0 && (
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Penalty</Text>
            <Text style={styles.statValue}>
              {turnPenalty(state.actionsTaken, state.rpCommitted)}
            </Text>
          </View>
        )}
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>RP</Text>
          <Text style={styles.statValue}>{activePlayer?.resolvePoints ?? 0}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>CP</Text>
          <Text style={styles.statValue}>
            {activePlayer?.currentCP ?? 0}/{activePlayer?.maxCP ?? 0}
          </Text>
        </View>
        {activePlayer?.class === 'lead' && state.actionsTaken === 0 && state.actionsCommitted <= 1 && (
          <Pressable style={styles.planBtn} onPress={() => setPlanModalOpen(true)}>
            <Text style={styles.planBtnText}>Plan Turn</Text>
          </Pressable>
        )}
        {selectedNode && activePlayer?.class === 'lead' && (
          <Pressable
            style={styles.rollBtn}
            onPress={() => openRollForNode(selectedNode, 'lead')}
          >
            <Text style={styles.rollBtnText}>Roll Check</Text>
          </Pressable>
        )}
        {selectedNode && activePlayer?.class === 'support' && (
          <>
            <Pressable
              style={styles.rollBtn}
              onPress={() => openRollForNode(selectedNode, 'support-self')}
            >
              <Text style={styles.rollBtnText}>Roll Check</Text>
            </Pressable>
            <Pressable
              style={[styles.planBtn, { marginLeft: 8 }]}
              onPress={() => setSupportUpgradePromptOpen(true)}
            >
              <Text style={styles.planBtnText}>Support Action</Text>
            </Pressable>
          </>
        )}
        <Pressable style={styles.endBtn} onPress={handleEndTurn}>
          <Text style={styles.endBtnText}>End Turn</Text>
        </Pressable>
      </View>

      {/* Player strip — runs across the top, just below the topbar */}
      <ScrollView
        style={styles.playerStrip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}
      >
        {( 
          state.turnOrder.map((id) => state.players.find((p) => p.id === id)).filter(Boolean) as typeof state.players
        ).map((p) => {
          const isActive = p.id === activePlayerId;
          return (
            <View
              key={p.id}
              style={[styles.playerChip, isActive && styles.playerChipActive]}
            >
              <Text style={styles.playerName}>{p.name}</Text>
              <Text style={styles.playerStats}>
                {p.class === 'lead' ? '★' : '◇'} RP {p.resolvePoints} • CP {p.currentCP}/{p.maxCP}
              </Text>
              {isActive && !p.ejected && (
                <ActionPips
                  class={p.class}
                  actionsCommitted={state.actionsCommitted}
                  actionsTaken={state.actionsTaken}
                />
              )}
              {p.ejected && <Text style={styles.ejected}>EJECTED</Text>}
            </View>
          );
        })}
      </ScrollView>

      {/* Canvas — constrained to the central monitor area (matches the bezel) */}
      <View style={styles.canvasWrap}>
        <FlowCanvas
          map={map}
          mode="game"
          reachableIds={reachableIds}
          activeId={activeTargetId}
          statusById={statusById}
          onSelectNode={onSelectNode}
          renderNode={(n, info) => (
            <FlowNodeView
              node={n}
              mode="game"
              status={info.status}
              progress={progressById[n.id] ?? 0}
              active={info.active}
            />
          )}
        />
      </View>

      {/* Pre-roll modal */}
      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Resolve Check</Text>
            {pendingRollNode && (
              <Text style={styles.modalSub}>
                {pendingRollNode.name} (DC {effectiveDC(pendingRollNode.tier, pendingRollNode.resolve)})
              </Text>
            )}
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={() => handleRoll(false)}
            >
              <Text style={styles.modalBtnText}>🎲 Roll d20</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                styles.modalBtnSecondary,
                !activePlayer || activePlayer.resolvePoints <= 0 ? styles.modalBtnDisabled : null,
              ]}
              onPress={() => handleRoll(true)}
              disabled={!activePlayer || activePlayer.resolvePoints <= 0}
            >
              <Text style={styles.modalBtnText}>
                ⭐ Spend RP (auto-success)
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
      <Modal visible={planModalOpen && activePlayer?.class === 'lead'} transparent animationType="fade">
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
                  style={[styles.stepperBtn, planActions <= 1 && styles.stepperBtnDisabled]}
                  onPress={() => setPlanActions((n) => Math.max(1, n - 1))}
                  disabled={planActions <= 1}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{planActions}</Text>
                <Pressable
                  style={[styles.stepperBtn, planActions >= 4 && styles.stepperBtnDisabled]}
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
                  style={[styles.stepperBtn, planRP <= 0 && styles.stepperBtnDisabled]}
                  onPress={() => setPlanRP((n) => Math.max(0, n - 1))}
                  disabled={planRP <= 0}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{planRP}</Text>
                <Pressable
                  style={[
                    styles.stepperBtn,
                    (planRP >= 3 || planRP >= (activePlayer?.resolvePoints ?? 0)) && styles.stepperBtnDisabled,
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
            <Text style={styles.modalSub}>
              {activePlayer?.name}, choose a Lead to aid:
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {state.players.filter((p) => p.class === 'lead').map((lead) => (
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
            {selectedNode && (
              <Text style={styles.modalSub}>
                Target: {selectedNode.name} (effective DC {effectiveDC(selectedNode.tier, selectedNode.resolve)})
              </Text>
            )}
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={() => handleSupportAction('aid')}
            >
              <Text style={styles.modalBtnText}>
                ✨ Aid (+2 / +4 by 10+) — DC {selectedNode ? Math.max(10, effectiveDC(selectedNode.tier, selectedNode.resolve) - 10) : '?'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                styles.modalBtnSecondary,
                !activePlayer || activePlayer.resolvePoints <= 0 ? styles.modalBtnDisabled : null,
              ]}
              onPress={() => handleSupportAction('rp')}
              disabled={!activePlayer || activePlayer.resolvePoints <= 0}
            >
              <Text style={styles.modalBtnText}>
                ⭐ Spend RP — own major action
              </Text>
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
      <ResultModal
        visible={resultModal.visible}
        rolling={resultModal.rolling}
        result={resultModal.info}
        playerName={activePlayer?.name ?? 'Player'}
        nodeName={pendingRollNode?.name ?? 'Target'}
        onDismiss={dismissResultModal}
      />

      {/* Win/Lose modal */}
      <Modal visible={state.finished} transparent animationType="fade">
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  loading: { flex: 1, backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94a3b8', fontSize: 16 },
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
  rollBtnText: {
    color: '#020617',
    fontWeight: '700',
    fontSize: 12,
  },
  planBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  playerStrip: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 160,
    maxHeight: '60%',
    paddingVertical: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  // Canvas wrap fills the available width (player strip overlays it on the left),
  // with vertical insets so it doesn't touch the top/bottom of the screen.
  canvasWrap: {
    position: 'absolute',
    top: '12%',
    bottom: '12%',
    left: 0,
    right: 0,
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