/**
 * GameScreen — main Game mode view.
 * Shows the flowchart, turn indicator, and the resolution modal.
 * Routes to /setup if no game state exists yet for the given mapId.
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView, useWindowDimensions, Animated, Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { nanoid } from 'nanoid';
import { FlowCanvas } from '@/components/flow/flowCanvas/FlowCanvas';
import { FlowNodeView } from '@/components/flow/FlowNode';
import { ResultModal, type RollResultInfo } from '@/components/game/ResultModal';
import { useGameStore } from '@/stores/gameStore';
import { loadMap } from '@/lib/flow/persistence';
import { listGames } from '@/lib/game/persistence';
import { isCompleted, reachableNodes, nodeStatus, nodeProgress } from '@/lib/flow/reachability';
import { effectiveDC, securityBonusForMap } from '@/lib/starfinder/tables';
import { resolve, type Outcome } from '@/lib/resolution';
import { modifierFor, PASSWORD_HACKING_BONUS } from '@/lib/game/types';
import { turnPenalty } from '@/lib/game/turn';
import type { FlowNode } from '@/lib/flow/types';
import { ChamferedFrame } from '@/components/ui/ChamferedFrame';
import { ScreenBackdrop } from '@/components/ui/ScreenBackdrop';
import { Toast, type ToastKind } from '@/components/ui/Toast';

const LAUNCH_PHRASE_PAIRS = [
  ['SPOOFING', 'THE GATEWAY'],
  ['ROUTING', 'THROUGH GHOST NODES'],
  ['DECRYPTING', 'SECURITY LAYERS'],
  ['INJECTING', 'ICEBREAKER PAYLOAD'],
  ['OPENING', 'THE BACKDOOR'],
  ['ENUMERATING', 'OPEN PORTS'],
  ['SNIFFING', 'PACKET TRAFFIC'],
  ['SPOOFING', 'THE HANDSHAKE'],
  ['BRUTE-FORCING', 'THE CREDENTIAL HASH'],
  ['PIVOTING', 'TO THE NEXT HOST'],
  ['ESCALATING', 'PRIVILEGES'],
  ['BYPASSING', 'THE SANDBOX'],
  ['REWRITING', 'ACCESS TOKENS'],
  ['SPLICING', 'THE DATA STREAM'],
  ['MASKING', 'OUR SIGNATURE'],
  ['SEEDING', 'A GHOST PROCESS'],
  ['BREACHING', 'THE AIR GAP'],
  ['SCRUBBING', 'TRACE LOGS'],
  ['SYNCHRONIZING', 'EXPLOIT CHAINS'],
  ['LOCATING', 'ROOT ACCESS'],
  ['HANDSHAKE', 'ACCEPTED'],
  ['SCANNING', 'THE PERIMETER'],
  ['PROBING', 'DEFENSE ROUTES'],
  ['MAPPING', 'THE NETWORK'],
  ['TRACING', 'THE SIGNAL'],
  ['CLONING', 'A VALID SESSION'],
  ['FORGING', 'A CLEARANCE TOKEN'],
  ['CRACKING', 'THE OUTER RING'],
  ['UNLOCKING', 'THE SECURE CHANNEL'],
  ['TUNNELING', 'UNDER THE FIREWALL'],
  ['DODGING', 'THE WATCHDOGS'],
  ['JAMMING', 'THE ALERT GRID'],
  ['SILENCING', 'THE AUDIT TRAIL'],
  ['ERASING', 'OUR FOOTPRINTS'],
  ['SPOOFING', 'A TRUSTED DEVICE'],
  ['REPLAYING', 'THE ACCESS CHALLENGE'],
  ['REVOKING', 'THEIR SESSION KEYS'],
  ['HIJACKING', 'THE MAINTENANCE LINK'],
  ['SEIZING', 'THE CONTROL NODE'],
  ['FORKING', 'A CLEAN ROUTE'],
  ['PARSING', 'THE ENCRYPTED BUNDLE'],
  ['UNPACKING', 'THE PAYLOAD CACHE'],
  ['STAGING', 'THE EXFIL CHANNEL'],
  ['DIVERTING', 'THE DATA STREAM'],
  ['PACKAGING', 'THE TARGET FILES'],
  ['EXTRACTING', 'THE CORE ARCHIVE'],
  ['PURGING', 'THE TEMPORARY KEYS'],
  ['CLOSING', 'THE GHOST ROUTE'],
  ['DISCONNECTING', 'BEFORE TRACEBACK'],
  ['ESCAPING', 'THE LOCKDOWN'],
  ['COMMITTING', 'THE FINAL OVERRIDE'],
];
const LAUNCH_VERTICAL_DURATION = 620;
const LAUNCH_DOT_HOLD = 360;
const LAUNCH_HORIZONTAL_DELAY = 1040;
const LAUNCH_HORIZONTAL_DURATION = 800;
const LAUNCH_CONTENT_DELAY = 1960;
const LAUNCH_REVEAL_FADE_DURATION = 520;
const LAUNCH_CONTENT_FADE_DURATION = 580;
const LAUNCH_ANIMATION_DURATION = 6000;

function GameLaunchOverlay({ width, monitorRect, ready, animationComplete, onFinished }: {
  width: number;
  monitorRect?: { x: number; y: number; width: number; height: number };
  ready: boolean;
  animationComplete: boolean;
  onFinished: () => void;
}) {
  const verticalProgress = useRef(new Animated.Value(0)).current;
  const wipeProgress = useRef(new Animated.Value(0)).current;
  const revealOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentLift = useRef(new Animated.Value(24)).current;
  const logTranslateY = useRef(new Animated.Value(0)).current;
  const enterPulse = useRef(new Animated.Value(0)).current;
  const enterButtonOpacity = useRef(new Animated.Value(0)).current;
  const [phraseLog, setPhraseLog] = useState(() => [LAUNCH_PHRASE_PAIRS[0].join(' ')]);
  const phraseLogRef = useRef([LAUNCH_PHRASE_PAIRS[0].join(' ')]);
  const buttonInserted = true;
  const [showEnter, setShowEnter] = useState(false);
  const isSmallScreen = width < 768;
  const windowWidth = monitorRect?.width ?? 0;
  const windowHeight = monitorRect?.height ?? 0;
  const panelWidth = Math.min(Math.max(windowWidth - 16, 1), 480);
  const centerFade = wipeProgress.interpolate({
    inputRange: [0, 0.08, 0.2, 1],
    outputRange: [1, 1, 0, 0],
  });
  const edgeOpacity = Animated.multiply(
    revealOpacity,
    wipeProgress.interpolate({
      inputRange: [0, 0.08, 0.2, 1],
      outputRange: [0, 0, 1, 1],
    }),
  );

  useEffect(() => {
    Animated.sequence([
      Animated.delay(LAUNCH_DOT_HOLD),
      Animated.timing(verticalProgress, { toValue: 1, duration: LAUNCH_VERTICAL_DURATION, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(LAUNCH_HORIZONTAL_DELAY),
      Animated.timing(wipeProgress, { toValue: 1, duration: LAUNCH_HORIZONTAL_DURATION, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(LAUNCH_CONTENT_DELAY),
      Animated.timing(revealOpacity, { toValue: 0, duration: LAUNCH_REVEAL_FADE_DURATION, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(LAUNCH_CONTENT_DELAY),
      Animated.timing(contentOpacity, { toValue: 1, duration: LAUNCH_CONTENT_FADE_DURATION, useNativeDriver: true }),
    ]).start();

    const phraseTimer = setInterval(() => {
      const firstIndex = Math.floor(Math.random() * LAUNCH_PHRASE_PAIRS.length);
      let secondIndex = firstIndex;
      if (Math.random() < 1 / 3) {
        while (secondIndex === firstIndex) {
          secondIndex = Math.floor(Math.random() * LAUNCH_PHRASE_PAIRS.length);
        }
      }
      const nextLog = [
        ...phraseLogRef.current,
        `${LAUNCH_PHRASE_PAIRS[firstIndex][0]} ${LAUNCH_PHRASE_PAIRS[secondIndex][1]}`,
      ].slice(-3);
      phraseLogRef.current = nextLog;
      const targetOffset = -(nextLog.length - 1) * 18;
      logTranslateY.stopAnimation();
      logTranslateY.setValue(Math.min(0, targetOffset + 18));
      setPhraseLog(nextLog);
    }, 1500);
    return () => {
      clearInterval(phraseTimer);
    };
  }, [contentOpacity, revealOpacity, verticalProgress, wipeProgress]);

  useEffect(() => {
    const targetOffset = -(phraseLog.length - 1) * 18;
    logTranslateY.stopAnimation();
    Animated.timing(logTranslateY, {
      toValue: targetOffset,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [logTranslateY, phraseLog]);

  useEffect(() => {
    if (!animationComplete) {
      setShowEnter(false);
      contentLift.setValue(24);
      enterButtonOpacity.setValue(0);
      return;
    }

    Animated.timing(contentLift, {
      toValue: 0,
      duration: 420,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShowEnter(true);
        Animated.timing(enterButtonOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [animationComplete, contentLift, enterButtonOpacity]);

  const canEnter = ready && showEnter;

  useEffect(() => {
    if (!canEnter) {
      enterPulse.stopAnimation();
      enterPulse.setValue(0);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(enterPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(enterPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [canEnter, enterPulse]);

  return (
    <View pointerEvents="auto" style={[styles.gameLaunchOverlay, !monitorRect ? styles.gameLaunchWaitingOverlay : null]}>
      {monitorRect ? <View style={[styles.gameLaunchWindow, {
        width: windowWidth,
        height: windowHeight,
        left: monitorRect.x,
        top: monitorRect.y,
      }]}>
        {!isSmallScreen && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: contentOpacity, pointerEvents: 'none' }]}>
            <ChamferedFrame width={windowWidth} height={windowHeight} chamfer={24} stroke="#111827" strokeWidth={12} fill="transparent" />
            <View style={{ position: 'absolute', top: 14, left: 14 }}>
              <ChamferedFrame width={Math.max(1, windowWidth - 28)} height={Math.max(1, windowHeight - 28)} chamfer={12} stroke="#475569" strokeWidth={4} fill="transparent" />
            </View>
          </Animated.View>
        )}
        <Animated.View style={[styles.gameLaunchWipeHalf, styles.gameLaunchWipeLeft, { width: windowWidth / 2, transform: [{ translateX: wipeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -(windowWidth / 2)] }) }] }]} />
        <Animated.View style={[styles.gameLaunchWipeHalf, styles.gameLaunchWipeRight, { width: windowWidth / 2, transform: [{ translateX: wipeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, windowWidth / 2] }) }] }]} />
        <Animated.View style={[styles.gameLaunchVerticalReveal, styles.gameLaunchGlow, { opacity: centerFade, transform: [{ scaleY: verticalProgress }] }]} />
        <Animated.View style={[styles.gameLaunchEdgeReveal, styles.gameLaunchGlow, styles.gameLaunchEdgeLeft, { opacity: edgeOpacity, transform: [{ translateX: wipeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -(windowWidth / 2)] }) }] }]} />
        <Animated.View style={[styles.gameLaunchEdgeReveal, styles.gameLaunchGlow, styles.gameLaunchEdgeRight, { opacity: edgeOpacity, transform: [{ translateX: wipeProgress.interpolate({ inputRange: [0, 1], outputRange: [0, windowWidth / 2] }) }] }]} />
        <Animated.View style={[styles.gameLaunchCenterDot, styles.gameLaunchGlow, { opacity: centerFade }]} />
        <Animated.View pointerEvents="auto" style={[styles.gameLaunchPanel, { width: panelWidth, opacity: contentOpacity }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ChamferedFrame width={panelWidth} height={170} chamfer={12} stroke="#164e63" strokeWidth={2} fill="#020617" />
          </View>
          <Animated.View style={[styles.gameLaunchContent, { transform: [{ translateY: contentLift }] }]}>
            <Text style={styles.gameLaunchTitle}>DATA HEIST // CONNECTING</Text>
            <View style={[styles.gameLaunchPhraseViewport, { width: Math.max(panelWidth - 24, 1) }]}>
              <Animated.View style={[styles.gameLaunchPhraseLog, { transform: [{ translateY: logTranslateY }] }]}>
                {phraseLog.map((logLine, index) => (
                  <Text
                    key={`${index}-${logLine}`}
                    style={styles.gameLaunchPhrase}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.65}
                  >
                    {logLine}
                  </Text>
                ))}
              </Animated.View>
            </View>
            <View style={styles.gameLaunchProgressTrack}>
              <View style={styles.gameLaunchProgress} />
            </View>
            {buttonInserted ? (
              <Animated.View style={{ opacity: enterButtonOpacity }}>
                <Pressable disabled={!canEnter} style={styles.gameLaunchEnterButton} onPress={onFinished}>
                  {canEnter ? (
                    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.gameLaunchEnterGlow, {
                      opacity: enterPulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.75] }),
                      transform: [{ scale: enterPulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
                    }]} />
                  ) : null}
                  <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                    <ChamferedFrame width={180} height={40} chamfer={8} stroke="#22d3ee" fill="#0e7490" />
                  </View>
                  <Text style={styles.gameLaunchEnterText}>I'M IN</Text>
                </Pressable>
              </Animated.View>
            ) : null}
          </Animated.View>
        </Animated.View>
      </View> : null}
    </View>
  );
}

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
  dotSquare: { borderRadius: 0 },
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
  hackingMode = 'dynamic',
  mapTier = 1,
  securityBonus = 0,
  rootAccessAchieved = false,
}: {
  targetNode: FlowNode | null;
  label: string;
  successes: number;
  hackingMode?: 'basic' | 'dynamic';
  mapTier?: number;
  securityBonus?: number;
  rootAccessAchieved?: boolean;
}) {
  if (!targetNode) {
    return (
      <View style={panelStyles.empty}>
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
          <ChamferedFrame width={120} height={42} chamfer={6} stroke="#1e293b" fill="#0f172a" strokeWidth={1} />
        </View>
        <Text style={panelStyles.emptyText}>select node</Text>
      </View>
    );
  }
  const catColors: Record<FlowNode['category'], { fill: string; border: string; icon: string }> = {
    module: { fill: '#1e3a8a', border: '#60a5fa', icon: 'M' },
    countermeasure: { fill: '#7f1d1d', border: '#f87171', icon: 'C' },
    access: { fill: '#1e3a8a', border: '#60a5fa', icon: 'A' },
  };
  const cat = catColors[targetNode.category];
  const dc = effectiveDC(mapTier, targetNode.resolve, securityBonus, rootAccessAchieved);
  const subskill = targetNode.resolve?.subskill ?? 'hack';
  const successesRequired = targetNode.resolve?.successesRequired ?? 0;

  return (
    <View style={[panelStyles.panel]}>
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <ChamferedFrame width={240} height={52} chamfer={8} stroke={cat.border} fill="#0f172a" />
      </View>
      <View style={[panelStyles.iconBox, { backgroundColor: cat.fill, borderColor: cat.border }]}>
        <Text style={panelStyles.icon}>{cat.icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={panelStyles.label}>{label}</Text>
        <Text style={panelStyles.name} numberOfLines={1}>{targetNode.name}</Text>
        <Text style={panelStyles.meta}>
          DC {dc} 
          {hackingMode === 'dynamic' && ` • ${subskill[0].toUpperCase() + subskill.slice(1)}`}
          {successesRequired > 0 ? ` • ${successes}/${successesRequired}` : ''}
        </Text>
      </View>
    </View>
  );
}

const panelStyles = StyleSheet.create({
  empty: {
    width: 120,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#475569', fontSize: 11, fontWeight: '700', fontFamily: 'Orbitron' },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 240,
    height: 52,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 16 },
  label: { fontSize: 9, color: '#22d3ee', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Orbitron-Black' },
  name: { fontSize: 13, color: '#f1f5f9', fontWeight: '700', fontFamily: 'Orbitron-Bold' },
  meta: { fontSize: 10, color: '#94a3b8', marginTop: 1, fontFamily: 'Orbitron' },
});

export default function GameScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isSmallScreen = windowWidth < 1024;
  const rollModalWidth = 400;
  const rollButtonWidth = 272;

  const { mapId, launch } = useLocalSearchParams<{ mapId: string; launch?: string }>();
  const router = useRouter();
  const { state, map, dispatch, persist, endGame, loadGameFromState, startGame } = useGameStore();

  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [supportUpgradePromptOpen, setSupportUpgradePromptOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | undefined>(undefined);
  const [pendingRollNode, setPendingRollNode] = useState<FlowNode | null>(null);
  const [pendingRollKind, setPendingRollKind] = useState<'lead' | 'support-self'>('lead');
  const [toast, setToast] = useState<{ visible: boolean; message: string; detail?: string; kind: ToastKind }>({
    visible: false,
    message: '',
    kind: 'info',
  });
  const [rollModalSize, setRollModalSize] = useState({ width: 0, height: 0 });
  const [planActions, setPlanActions] = useState(1);
  const [planRP, setPlanRP] = useState(0);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [resultModal, setResultModal] = useState<{ visible: boolean; rolling: boolean; info: RollResultInfo | null }>({
    visible: false,
    rolling: false,
    info: null,
  });
  const [booting, setBooting] = useState(true);
  const [launching, setLaunching] = useState(launch === '1');
  const [launchAnimationComplete, setLaunchAnimationComplete] = useState(false);
  const [monitorRect, setMonitorRect] = useState({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!launching) return;
    const animationTimer = setTimeout(() => setLaunchAnimationComplete(true), LAUNCH_ANIMATION_DURATION);
    return () => clearTimeout(animationTimer);
  }, [launching]);

  // Boot: restore the saved session for this map before falling back to setup.
  useEffect(() => {
    if (!mapId || state) {
      if (state) setBooting(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const [savedMap, games] = await Promise.all([loadMap(mapId), listGames()]);
      if (cancelled) return;

      const savedGame = [...games].reverse().find((game) => game.mapId === mapId);
      if (savedMap && savedGame) {
        loadGameFromState(savedGame, savedMap);
      } else if (savedMap) {
        router.replace(`/setup?mapId=${savedMap.id}`);
      }
      setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [state, mapId, router, loadGameFromState]);

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

  const reachableIds = useMemo(() => {
    if (!map || !state) return new Set<string>();
    return reachableNodes(map, {
      visitedNodeIds: new Set(state.visitedNodeIds),
      permanentlyFailedNodeIds: new Set(state.permanentlyFailedNodeIds),
      hiddenNodeIds: new Set(state.hiddenNodeIds ?? []),
      lockedOutNodeIds: new Set(state.lockedOutNodeIds ?? []),
      wipingNodeIds: new Set(state.wipingNodeIds ?? []),
      objectives: state.objectives,
    });
  }, [map, state]);

  const noAvailableNodes = useMemo(() => {
    if (!map || !state) return false;
    return map.nodes.every((node) => {
      if (!reachableIds.has(node.id)) return true;
      if (isCompleted(node, state.objectives)) return true;
      const failures = state.objectives[node.id]?.failures ?? 0;
      const failureLimit = node.countermeasureType === 'wipe' ? 2 : 3;
      return node.category !== 'module' && failures >= failureLimit;
    });
  }, [map, reachableIds, state]);

  const failureLockdown = useMemo(() => {
    if (!noAvailableNodes || !map || !state) return false;
    return map.nodes.some((node) => (
      reachableIds.has(node.id)
      && node.category !== 'module'
      && (state.objectives[node.id]?.failures ?? 0) >= (node.countermeasureType === 'wipe' ? 2 : 3)
    ));
  }, [map, noAvailableNodes, reachableIds, state]);

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
          permanentlyFailedNodeIds: new Set(state.permanentlyFailedNodeIds),
          hiddenNodeIds: new Set(state.hiddenNodeIds ?? []),
          lockedOutNodeIds: new Set(state.lockedOutNodeIds ?? []),
          wipingNodeIds: new Set(state.wipingNodeIds ?? []),
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

  const basicModifierPenalty = turnPenalty(
    state?.actionsTaken ?? 0,
    state?.actionsCommitted ? state.rpCommitted : 0,
  );
  const basicPasswordBonus = state?.passwordAccessAchieved ? PASSWORD_HACKING_BONUS : 0;

  const collectedModules = useMemo(() => {
    if (!map || !state) return [];
    return map.nodes.filter((node) => {
      if (node.category !== 'module') return false;
      const required = node.resolve?.successesRequired ?? 1;
      return (state.objectives[node.id]?.successes ?? 0) >= required;
    });
  }, [map, state]);

  if (booting || !state || !map) {
    return (
      <View style={styles.loading}>
        {!launching ? <Text style={styles.loadingText}>Loading game…</Text> : null}
        {launching ? (
          <GameLaunchOverlay
            width={windowWidth}
            monitorRect={monitorRect.width > 0 ? monitorRect : undefined}
            ready={false}
            animationComplete={launchAnimationComplete}
            onFinished={() => setLaunching(false)}
          />
        ) : null}
      </View>
    );
  }

  const securityBonus = securityBonusForMap(map, state.visitedNodeIds);

  const cumulativeFailureLimit = map.cumulativeFailureLimit;
  const totalFailures = cumulativeFailureLimit === undefined
    ? 0
    : Object.values(state.objectives).reduce(
      (total, objective) => total + (objective.failures ?? 0),
      0,
    );

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
    const rpCost = state.hackingMode === 'dynamic'
      ? (kind === 'support-self' ? 1 : 0) + (spendRP ? 1 : 0)
      : 0;
    if (rpCost > activePlayer.resolvePoints) {
      showToast(`Requires ${rpCost} Resolve Points`, undefined, 'failure');
      return;
    }

    const d20 = rollDie(20);
    const subskill = node.resolve?.subskill ?? 'hack';
    const passwordBonus = state.passwordAccessAchieved ? PASSWORD_HACKING_BONUS : 0;
    const baseModifier = modifierFor(activePlayer, subskill, state.hackingMode) + passwordBonus;
    let modifier = baseModifier;
    const dc = effectiveDC(map.tier, node.resolve, securityBonus, state.rootAccessAchieved);

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
    const outcome: Outcome = resolve({ d20, modifier, dc, spendRP: state.hackingMode === 'dynamic' && spendRP });

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
      outcomeLabel = 'Critical Success!';
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
      outcomeLabel = 'Critical Failure';
      if (state.hackingMode === 'dynamic' && outcome.cpDamageRoll !== undefined && outcome.cpDamageRoll <= 3) {
        detailString = 'Lost 1 CP to countermeasure';
      }
    }

    const info: RollResultInfo = {
      d20: state.hackingMode === 'dynamic' && spendRP ? 0 : d20,
      modifier,
      baseModifier,
      penalty: penalty !== 0 ? penalty : undefined,
      aidBonus: aidBonus !== 0 ? aidBonus : undefined,
      dc,
      total: state.hackingMode === 'dynamic' && spendRP ? dc : outcome.total,
      outcomeLabel,
      successes: applied,
      kind: resultKind,
      detail: detailString,
      nodeName: node.name,
    };

    // Close pre-roll modal.
    setModalOpen(false);

    // Show the rolling animation for all outcomes (including RP spend for "calculating" feel).
    setResultModal({ visible: true, rolling: true, info });
    // Switch from rolling to result after a short roll.
    setTimeout(() => {
      setResultModal((prev) => ({ ...prev, rolling: false }));
    }, 1800);

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

  const handleSupportAction = (action: 'aid' | 'rp' | 'pass' | 'cancel') => {
    if (!activePlayer) return;

    if (action === 'cancel') {
      setSupportUpgradePromptOpen(false);
      return;
    }

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
    const modifier = modifierFor(activePlayer, 'hack') + (state.passwordAccessAchieved ? PASSWORD_HACKING_BONUS : 0);
    const baseDC = effectiveDC(map.tier, target.resolve, securityBonus, state.rootAccessAchieved);
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
    }, 3200);

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

  const showToast = (message: string, detail: string | undefined, kind: ToastKind) => {
    setToast({ visible: true, message, detail, kind });
  };

  const handleNewGame = () => {
    endGame();
    router.replace('/');
  };

  const handleResetMap = () => {
    if (!state || !map) return;
    setHeaderMenuOpen(false);
    startGame(
      map,
      state.players.map((player) => ({
        name: player.name,
        class: player.class,
        computersRanks: player.computersRanks,
        computersModifier: player.computersModifier,
        deceiveModifier: player.deceiveModifier,
        hackModifier: player.hackModifier,
        processModifier: player.processModifier,
        personaModifier: player.personaModifier,
        personaModifierLimit: player.personaModifierLimit,
        resolvePoints: player.resolvePoints,
        pairedLeadId: player.pairedLeadId,
      })),
      state.hackingMode,
    );
    setSelectedNode(null);
    setPendingRollNode(null);
    setModalOpen(false);
    setResultModal({ visible: false, rolling: false, info: null });
  };

  const handleBack = () => {
    setHeaderMenuOpen(false);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(map ? `/setup?mapId=${map.id}` : '/');
  };

  const handleLogOut = () => {
    setSelectedNode(null);
    setPendingRollNode(null);
    setModalOpen(false);
    setHeaderMenuOpen(false);
    dispatch({ type: 'FINISH', result: 'win' });
  };

  return (
    <View style={styles.container}>
      {!isSmallScreen && <ScreenBackdrop />}
      <Toast
        visible={toast.visible}
        message={toast.message}
        detail={toast.detail}
        kind={toast.kind}
        onHide={() => setToast((current) => ({ ...current, visible: false }))}
      />
      <View style={{ flex: 1 }}>
        {/* Header — Turn Order, Round and Objectives */}
        <View style={[styles.header, { top: (isSmallScreen ? 0 : 10) + Math.max(16, (windowHeight - (isSmallScreen ? 0 : 20)) * 0.11) }]}>
        <View style={styles.mapTierRow}>
          <View style={styles.mapTitleGroup}>
            <Text style={styles.mapTitle}>{map.name}</Text>
            {noAvailableNodes ? (
              <Text style={styles.noNodesHeader}>
                {failureLockdown
                  ? 'HACKING ATTEMPT DETECTED. SYSTEM LOCKDOWN INITIATED. PROCEED TO EXIT'
                  : 'NO NODES AVAILABLE • SELECT AN EXIT'}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.mapTier, { color: '#22d3ee' }]}>TIER {map.tier}</Text>
        </View>
        {state.hackingMode === 'dynamic' && <View style={styles.headerRow}>
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
                        {state.hackingMode === 'dynamic' ? `RP ${p.resolvePoints} • CP ${p.currentCP}/${p.maxCP}` : 'COMPUTERS'}
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
        </View>}

        <View style={styles.statRow}>
          {cumulativeFailureLimit !== undefined ? (
            <View style={[styles.statBox, styles.failuresStatBox]}>
              <Text style={styles.statLabel}>TOTAL FAILURES</Text>
              <Text style={[styles.statValue, { color: '#f87171' }]}>{totalFailures}/{cumulativeFailureLimit}</Text>
            </View>
          ) : null}
          {Object.entries(state.objectives || {}).filter(([id]) => {
            const node = map?.nodes.find((candidate) => candidate.id === id);
            return node?.category !== 'module';
          }).map(([id, obj]) => {
            const node = map?.nodes.find((n) => n.id === id);
            return (
              <View key={id} style={styles.statBox}>
                <Text style={styles.statLabel}>{node?.name || id}</Text>
                <Text style={styles.statValue}>
                  <Text style={styles.successStatValue}>
                    {obj.successes}/{node?.resolve?.successesRequired || 1}
                  </Text>
                  {' • '}
                  <Text style={styles.failureStatValue}>{obj.failures ?? 0}/3</Text>
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.modulesRow}>
          <Text style={styles.modulesLabel}>MODULES COLLECTED</Text>
          {collectedModules.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modulesList}
            >
              {collectedModules.map((module) => (
                <View key={module.id} style={styles.moduleChip}>
                  <Text style={styles.moduleChipText} numberOfLines={1}>{module.name}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.modulesEmpty}>NONE</Text>
          )}
        </View>

        <View style={styles.headerMenu}>
          <Pressable
            accessibilityLabel="Open game menu"
            style={styles.menuButton}
            onPress={() => setHeaderMenuOpen((open) => !open)}
          >
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </Pressable>
          {headerMenuOpen ? (
            <View style={styles.menuPanel}>
              <Pressable style={styles.menuItem} onPress={handleResetMap}>
                <Text style={styles.menuItemText}>Reset Map</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={handleBack}>
                <Text style={styles.menuItemText}>Back</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={handleNewGame}>
                <Text style={styles.menuItemText}>Main Menu</Text>
              </Pressable>
              <Pressable style={[styles.menuItem, styles.menuItemDisabled]} disabled>
                <Text style={[styles.menuItemText, styles.menuItemDisabledText]}>Options</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {/* Canvas — constrained to the central monitor area (matches the bezel) */}
      <View style={[styles.canvasWrap, isSmallScreen ? styles.canvasWrapSmall : null]}>
        <FlowCanvas
          map={map}
          mode="game"
          reachableIds={reachableIds}
          activeId={activeTargetId}
          statusById={statusById}
          progressById={progressById}
          wipingNodeIds={resultModal.visible ? new Set<string>() : new Set(state.wipingNodeIds ?? [])}
          selectedId={selectedNode?.id}
          onSelectNode={onSelectNode}
          activePlayerClass={activePlayer?.class}
          canPlanTurn={state.hackingMode === 'dynamic' && activePlayer?.class === 'lead' && state.actionsTaken === 0 && state.actionsCommitted <= 1}
          onPlanTurn={() => setPlanModalOpen(true)}
          onMajorAction={(node) => {
            if (node.category === 'module' && activePlayer) {
              dispatch({ type: 'COLLECT_MODULE', playerId: activePlayer.id, node });
              setSelectedNode(null);
              return;
            }
            openRollForNode(node, activePlayer?.class === 'support' ? 'support-self' : 'lead');
          }}
          onPasswordAction={(node, password) => {
            if (activePlayer) {
              dispatch({ type: 'ENTER_PASSWORD', playerId: activePlayer.id, node, password });
              if (password.trim().toLowerCase() === node.password?.trim().toLowerCase()) {
                showToast('Login successful', 'Global hacking modifier +5', 'success');
              }
              setSelectedNode(null);
            }
          }}
          onSupportAction={() => setSupportUpgradePromptOpen(true)}
          onBuyMajorAction={() => activePlayer && dispatch({ type: 'SUPPORT_BUY_ACTION', playerId: activePlayer.id })}
          onRefundMajorAction={() => activePlayer && dispatch({ type: 'SUPPORT_REFUND_ACTION', playerId: activePlayer.id })}
          onEndTurn={handleEndTurn}
          onLogOut={handleLogOut}
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
          hackingMode={state.hackingMode}
          mapTier={map.tier}
          securityBonus={securityBonus}
          rootAccessAchieved={state.rootAccessAchieved}
          hideInfoDrawers={toast.visible}
          outcomeAnimationReady={!resultModal.visible}
          modifiers={activePlayer ? {
            deceive: activePlayer.deceiveModifier,
            hack: activePlayer.hackModifier,
            process: activePlayer.processModifier,
            total: state.hackingMode === 'basic'
              ? activePlayer.computersModifier + basicPasswordBonus + basicModifierPenalty + currentAidBonus
              : activePlayer.computersModifier,
            base: activePlayer.computersModifier,
            passwordBonus: basicPasswordBonus,
            penalty: basicModifierPenalty,
            aidBonus: currentAidBonus,
          } : undefined}
          onMonitorLayout={setMonitorRect}
          renderNode={(n, info) => (
            <FlowNodeView
              node={n}
              mode="game"
              status={info.status}
              progress={info.progress}
              active={info.active}
              selected={info.selected}
              concealed={info.status === 'blocked' || info.status === 'concealed'}
              concealedOpacity={info.concealedOpacity}
              countermeasureAttached={info.countermeasureAttached}
              countermeasureTargeted={info.countermeasureTargeted}
              wiping={info.wiping}
              outcome={state.hackingMode === 'basic'
                ? state.objectives[n.id]?.successes >= (n.resolve?.successesRequired ?? 1)
                  ? 'success'
                  : (state.objectives[n.id]?.failures ?? 0) >= 3
                    ? 'failure'
                    : undefined
                : undefined}
              collected={n.category === 'module' && (state.objectives[n.id]?.successes ?? 0) >= (n.resolve?.successesRequired ?? 1)}
            />
          )}
        />
      </View>

      {/* Pre-roll modal */}
      <Modal 
        visible={false}
        transparent 
        animationType="fade"
        onRequestClose={() => {
          setModalOpen(false);
          setPendingRollNode(null);
        }}
      >
        <Pressable 
          style={styles.modalBackdrop} 
          onPress={() => {
            setModalOpen(false);
            setPendingRollNode(null);
          }}
        >
          <Pressable
            style={[
              styles.modal,
              {
                width: rollModalWidth,
                alignItems: 'center',
                opacity: rollModalSize.width > 0 ? 1 : 0,
              },
            ]}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setRollModalSize({ width, height });
            }}
            onPress={() => {}}
          >
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              {rollModalSize.width > 0 && rollModalSize.height > 0 ? (
                <ChamferedFrame
                  width={rollModalSize.width}
                  height={rollModalSize.height}
                  chamfer={16}
                  stroke="#475569"
                  strokeWidth={2}
                  fill="#1e293b"
                />
              ) : null}
            </View>
            <View style={{ padding: 24, alignItems: 'center', width: '100%' }}>
            <Text style={styles.modalTitle}>
              {state.hackingMode === 'basic'
                ? pendingRollNode?.name ?? 'Hack Action'
                : 'Major Actions'}
            </Text>
            {pendingRollNode ? (
              <View style={{ alignItems: 'center', marginBottom: 15 }}>
                <Text style={styles.modalSub}>
                  {state.hackingMode === 'basic' ? 'Computers Skill Check' : pendingRollNode.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <View style={{ 
                    backgroundColor: '#1e293b', 
                    paddingHorizontal: 8, 
                    paddingVertical: 2, 
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: '#334155'
                  }}>
                    <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {pendingRollNode.resolve?.subskill ?? 'hack'}
                    </Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 8 }}>
                    DC {effectiveDC(map.tier, pendingRollNode.resolve, securityBonus, state.rootAccessAchieved)}
                  </Text>
                </View>
                {activePlayer && (
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                    Your Modifier: +{modifierFor(activePlayer, pendingRollNode.resolve?.subskill ?? 'hack', state.hackingMode) + (state.passwordAccessAchieved ? PASSWORD_HACKING_BONUS : 0)}
                  </Text>
                )}
              </View>
            ) : null}
            
            {state.pendingAid?.leadId === activePlayer?.id ? (
              <View style={styles.aidBanner}>
                <Text style={styles.aidBannerText}>
                  Receiving +{state.pendingAid!.bonus} Aid from Support hacker
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary, { width: rollButtonWidth }]}
              onPress={() => handleRoll(false)}
            >
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                <ChamferedFrame 
                  width={rollButtonWidth} 
                  height={48} 
                  chamfer={8} 
                  stroke="#22d3ee" 
                  fill="#0e7490" 
                />
              </View>
              <Text style={styles.modalBtnText}>
                Roll d20{state.pendingAid?.leadId === activePlayer?.id ? ` (+${state.pendingAid!.bonus} Aid)` : ''}
              </Text>
            </Pressable>
            {state.hackingMode === 'dynamic' && <Pressable
              style={[
                styles.modalBtn,
                styles.modalBtnSecondary,
                { width: rollButtonWidth },
                !activePlayer || activePlayer.resolvePoints < 1 ? styles.modalBtnDisabled : null,
              ]}
              onPress={() => handleRoll(true)}
              disabled={!activePlayer || activePlayer.resolvePoints < 1}
            >
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                <ChamferedFrame 
                  width={rollButtonWidth} 
                  height={48} 
                  chamfer={8} 
                  stroke={(!activePlayer || activePlayer.resolvePoints < 1) ? "#475569" : "#a855f7"} 
                  fill="#1e293b" 
                />
              </View>
              <Text style={styles.modalBtnText}>
                Spend RP (auto-success)
              </Text>
              {state.pendingAid?.leadId === activePlayer?.id && (
                <Text style={[styles.modalBtnText, { color: '#f87171', fontSize: 10, marginTop: 2 }]}>
                  (+{state.pendingAid!.bonus} Aid ignored)
                </Text>
              )}
            </Pressable>}
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel, { width: rollButtonWidth }]}
              onPress={() => {
                setModalOpen(false);
                setPendingRollNode(null);
              }}
            >
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                <ChamferedFrame 
                  width={rollButtonWidth} 
                  height={48} 
                  chamfer={8} 
                  stroke="#475569" 
                  fill="#0f172a" 
                />
              </View>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Planning modal — opt-in. Default flow is 1 action / 0 RP (no modal). */}
      <Modal 
        visible={!!(planModalOpen && activePlayer?.class === 'lead')} 
        transparent 
        animationType="fade"
        onRequestClose={() => setPlanModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPlanModalOpen(false)}>
          <Pressable style={[styles.modal, { width: 340 }]} onPress={() => {}}>
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              <ChamferedFrame width={340} height={460} chamfer={16} stroke="#22d3ee" fill="#0f172a" />
            </View>
            <View style={{ padding: 20, gap: 10, alignItems: 'center' }}>
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

            {state.hackingMode === 'dynamic' && <View style={styles.stepperRow}>
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
            </View>}
            {state.hackingMode === 'dynamic' && <Text style={styles.helperText}>
              Each RP reduces the cumulative penalty by 5. Free top-up during the turn (no action spent).
            </Text>}

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
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                <ChamferedFrame width={280} height={48} chamfer={8} stroke="#22d3ee" fill="#0e7490" />
              </View>
              <Text style={styles.modalBtnText}>Confirm Plan</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => setPlanModalOpen(false)}
            >
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                <ChamferedFrame width={280} height={48} chamfer={8} stroke="#475569" fill="#0f172a" />
              </View>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Support action prompt */}
      <Modal 
        visible={supportUpgradePromptOpen} 
        transparent 
        animationType="fade"
        onRequestClose={() => handleSupportAction('cancel')}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => handleSupportAction('cancel')}>
          <Pressable style={[styles.modal, { width: 400 }]} onPress={() => {}}>
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              <ChamferedFrame width={400} height={420} chamfer={16} stroke="#22d3ee" fill="#0f172a" />
            </View>
            <View style={{ padding: 24, gap: 10, alignItems: 'center', width: '100%' }}>
              <Text style={styles.modalTitle}>Minor Actions</Text>
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
              <View style={{ alignItems: 'center', marginBottom: 10 }}>
                <Text style={styles.modalSub}>Target: {selectedNode.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <View style={{ 
                    backgroundColor: '#1e293b', 
                    paddingHorizontal: 8, 
                    paddingVertical: 2, 
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: '#334155'
                  }}>
                    <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {selectedNode.resolve?.subskill ?? 'hack'}
                    </Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 8 }}>
                      DC {effectiveDC(map.tier, selectedNode.resolve, securityBonus, state.rootAccessAchieved)}
                  </Text>
                </View>
              </View>
            ) : null}
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={() => handleSupportAction('aid')}
            >
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                <ChamferedFrame width={280} height={48} chamfer={8} stroke="#22d3ee" fill="#0e7490" />
              </View>
              <Text style={styles.modalBtnText}>Aid (+2 / +4)</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={() => handleSupportAction('cancel')}
            >
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                <ChamferedFrame width={280} height={48} chamfer={8} stroke="#475569" fill="#0f172a" />
              </View>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Animated dice roll result modal */}
      {(modalOpen || resultModal.visible) ? (
        <ResultModal
          visible={modalOpen || resultModal.visible}
          rolling={resultModal.visible && resultModal.rolling}
          result={resultModal.visible ? resultModal.info : null}
          playerName={activePlayer?.name ?? 'Player'}
          nodeName={pendingRollNode?.name ?? 'Target'}
          hackingMode={state.hackingMode}
          preRoll={modalOpen && pendingRollNode ? {
            title: state.hackingMode === 'basic' ? pendingRollNode.name : 'Major Actions',
            subtitle: state.hackingMode === 'basic' ? 'Computers Skill Check' : pendingRollNode.name,
            subskill: pendingRollNode.resolve?.subskill ?? 'hack',
            dc: effectiveDC(map.tier, pendingRollNode.resolve, securityBonus, state.rootAccessAchieved),
            modifier: activePlayer
              ? modifierFor(activePlayer, pendingRollNode.resolve?.subskill ?? 'hack', state.hackingMode) + (state.passwordAccessAchieved ? PASSWORD_HACKING_BONUS : 0)
              : 0,
            aidBonus: state.pendingAid?.leadId === activePlayer?.id ? state.pendingAid!.bonus : undefined,
            canSpendRP: !!activePlayer && activePlayer.resolvePoints >= 1,
            onRoll: handleRoll,
            onCancel: () => {
              setModalOpen(false);
              setPendingRollNode(null);
            },
          } : undefined}
          onDismiss={dismissResultModal}
        />
      ) : null}

      {/* Win/Lose modal */}
      <Modal visible={!!state.finished} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, { width: 340 }]}>
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              <ChamferedFrame 
                width={340} 
                height={340} 
                chamfer={16} 
                stroke={state.result === 'win' ? '#22d3ee' : '#f87171'} 
                fill="#0f172a" 
              />
            </View>
            <View style={{ padding: 20, gap: 10 }}>
              <Text style={styles.modalTitle}>
                {state.result === 'win' ? 'Heist Successful!' : 'Heist Failed'}
              </Text>
              <Text style={styles.modalSub}>
                {state.result === 'win' ? 'You reached root access.' : 'All personas ejected.'}
              </Text>
              <View style={styles.finishedModules}>
                <Text style={styles.finishedModulesLabel}>MODULES COLLECTED</Text>
                {collectedModules.length > 0 ? (
                  collectedModules.map((module) => (
                    <Text key={module.id} style={styles.finishedModuleName}>+ {module.name}</Text>
                  ))
                ) : (
                  <Text style={styles.finishedModulesEmpty}>None</Text>
                )}
              </View>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary, { marginTop: 10 }]} onPress={handleNewGame}>
                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                  <ChamferedFrame width={280} height={48} chamfer={8} stroke="#22d3ee" fill="#0e7490" />
                </View>
                <Text style={styles.modalBtnText}>Back to Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {launching ? (
        <GameLaunchOverlay
          width={windowWidth}
          monitorRect={monitorRect.width > 0 ? monitorRect : undefined}
          ready
          animationComplete={launchAnimationComplete}
          onFinished={() => setLaunching(false)}
        />
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loading: { flex: 1, backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94a3b8', fontSize: 16 },
  gameLaunchOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  gameLaunchWaitingOverlay: {
    backgroundColor: '#020617',
  },
  gameLaunchWindow: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  gameLaunchVerticalReveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: '#22d3ee',
  },
  gameLaunchGlow: {
    shadowColor: '#22d3ee',
    shadowOpacity: 0.85,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
    boxShadow: '0px 0px 8px rgba(34, 211, 238, 0.85)',
  },
  gameLaunchEdgeReveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: '#22d3ee',
  },
  gameLaunchEdgeLeft: {},
  gameLaunchEdgeRight: {},
  gameLaunchWipeHalf: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#020617',
  },
  gameLaunchWipeLeft: {
    left: 0,
  },
  gameLaunchWipeRight: {
    right: 0,
  },
  gameLaunchCenterDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 6,
    height: 6,
    marginLeft: -3,
    marginTop: -3,
    borderRadius: 3,
    backgroundColor: '#67e8f9',
  },
  gameLaunchPanel: {
    height: 170,
    position: 'absolute',
    top: '50%',
    marginTop: -85,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.94)',
  },
  gameLaunchContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  gameLaunchTitle: { color: '#22d3ee', fontSize: 15, fontFamily: 'Orbitron-Black', letterSpacing: 1 },
  gameLaunchPhraseViewport: { height: 18, overflow: 'hidden', alignItems: 'center' },
  gameLaunchPhraseLog: { width: '100%' },
  gameLaunchPhrase: { height: 18, lineHeight: 18, color: '#f1f5f9', fontSize: 11, fontFamily: 'Orbitron-Bold', letterSpacing: 1, textAlign: 'center' },
  gameLaunchProgressTrack: { width: '28%', height: 2, backgroundColor: '#155e75' },
  gameLaunchProgress: { width: '100%', height: 2, backgroundColor: '#22d3ee' },
  gameLaunchEnterGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    backgroundColor: '#22d3ee',
    shadowColor: '#22d3ee',
    shadowOpacity: 0.9,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    boxShadow: '0px 0px 16px rgba(34, 211, 238, 0.9)',
  },
  gameLaunchEnterButton: { width: 180, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  gameLaunchEnterText: { color: '#fff', fontSize: 12, fontFamily: 'Orbitron-Bold', letterSpacing: 1 },
  header: {
    position: 'absolute',
    left: '15%',
    right: '15%',
    zIndex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  headerMenu: {
    position: 'absolute',
    top: '50%',
    right: 24,
    marginTop: -18,
    zIndex: 20,
    alignItems: 'flex-end',
  },
  menuButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  menuLine: {
    width: 16,
    height: 2,
    backgroundColor: '#22d3ee',
  },
  menuPanel: {
    width: 144,
    marginTop: 6,
    padding: 4,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
  },
  menuItem: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  menuItemText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'Orbitron-Bold',
    textTransform: 'uppercase',
  },
  menuItemDisabled: {
    borderBottomWidth: 0,
  },
  menuItemDisabledText: {
    color: '#475569',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mapTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mapTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  mapTitle: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Orbitron-Bold',
    flexShrink: 1,
  },
  noNodesHeader: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'Orbitron-Black',
    letterSpacing: 1,
  },
  mapTier: {
    color: '#22d3ee',
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Orbitron-Black',
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
    width: 108,
    flexShrink: 0,
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    width: 76,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
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
  modulesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    minHeight: 28,
  },
  modulesLabel: {
    color: '#22d3ee',
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'Orbitron-Bold',
  },
  modulesList: {
    gap: 6,
    paddingRight: 12,
  },
  moduleChip: {
    maxWidth: 180,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#064e3b',
    borderWidth: 1,
    borderColor: '#34d399',
  },
  moduleChipText: {
    color: '#a7f3d0',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Orbitron',
  },
  modulesEmpty: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'Orbitron',
  },
  finishedModules: {
    width: '100%',
    padding: 10,
    backgroundColor: '#0f2f2a',
    borderWidth: 1,
    borderColor: '#166534',
    gap: 4,
  },
  finishedModulesLabel: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Orbitron-Bold',
    marginBottom: 2,
  },
  finishedModuleName: {
    color: '#a7f3d0',
    fontSize: 12,
    fontFamily: 'Orbitron',
  },
  finishedModulesEmpty: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'Orbitron',
  },
  statBox: {
    width: 132,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  failuresStatBox: {
    marginLeft: 8,
  },
  statLabel: { fontSize: 9, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' },
  statValue: { fontSize: 14, color: '#22d3ee', fontWeight: '800' },
  successStatValue: { color: '#34d399' },
  failureStatValue: { color: '#f87171' },
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
  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#7f1d1d',
  },
  endBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  planBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0e7490',
  },
  rollBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#22c55e',
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
  canvasWrapSmall: {
    marginTop: 0,
    marginBottom: 0,
  },
  playerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
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
    backgroundColor: 'transparent',
    padding: 0,
    width: 320,
    gap: 10,
  },
  modalTitle: { fontSize: 18, color: '#22d3ee', fontWeight: '800', textAlign: 'center' },
  modalSub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginBottom: 4 },
  aidBanner: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    borderWidth: 1,
    borderColor: '#22d3ee',
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
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 280,
    alignSelf: 'center',
    marginVertical: 4,
  },
  modalBtnPrimary: { backgroundColor: 'transparent' },
  modalBtnSecondary: { backgroundColor: 'transparent' },
  modalBtnCancel: { backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent' },
  modalBtnDisabled: { opacity: 0.4 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: 'Orbitron-Bold' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  stepperLabel: { color: '#cbd5e1', fontSize: 14, fontWeight: '700', fontFamily: 'Orbitron' },
  stepperCtl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { backgroundColor: '#334155', opacity: 0.5 },
  stepperBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  stepperValue: { color: '#22d3ee', fontSize: 18, fontWeight: '800', minWidth: 28, textAlign: 'center', fontFamily: 'Orbitron-Black' },
  helperText: { color: '#64748b', fontSize: 11, fontStyle: 'italic', fontFamily: 'Orbitron' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryLabel: { color: '#94a3b8', fontSize: 12 },
  summaryValue: { color: '#fbbf24', fontSize: 16, fontWeight: '800' },
});