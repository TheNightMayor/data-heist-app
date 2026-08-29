import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { FlowNode } from '@/lib/flow/types';
import { effectiveDC } from '@/lib/starfinder/tables';
import { ChamferedFrame } from '../ui/ChamferedFrame';

interface NodeActionPanelProps {
  node: FlowNode;
  successes: number;
  failures: number;
  canPlanTurn: boolean;
  onPlanTurn: () => void;
  onMajorAction: () => void;
  onPasswordAction?: (password: string) => void;
  onSupportAction?: () => void;
  onBuyMajorAction?: () => void;
  onRefundMajorAction?: () => void;
  onEndTurn: () => void;
  playerClass: 'lead' | 'support';
  playerName: string;
  rp: number;
  cp: number;
  maxCp: number;
  actionsCommitted: number;
  actionsTaken: number;
  minorActionsTaken: number;
  otherLeadsExist?: boolean;
  aidBonus?: number;
  isReachable?: boolean;
  modifiers?: {
    deceive: number;
    hack: number;
    process: number;
    total: number;
    base?: number;
    passwordBonus?: number;
    penalty?: number;
    aidBonus?: number;
  };
  hackingMode?: 'basic' | 'dynamic';
  mapTier?: number;
  securityBonus?: number;
  rootAccessAchieved?: boolean;
  closing?: boolean;
  hideInfoDrawers?: boolean;
  outcomeAnimationReady?: boolean;
}

export function NodeActionPanel({
  node,
  successes,
  failures,
  canPlanTurn,
  onPlanTurn,
  onMajorAction,
  onPasswordAction,
  onSupportAction,
  onBuyMajorAction,
  onRefundMajorAction,
  onEndTurn,
  playerClass,
  playerName,
  rp,
  cp,
  maxCp,
  actionsCommitted,
  actionsTaken,
  minorActionsTaken,
  otherLeadsExist,
  aidBonus,
  isReachable = true,
  modifiers,
  hackingMode = 'dynamic',
  mapTier = 1,
  securityBonus = 0,
  rootAccessAchieved = false,
  closing = false,
  hideInfoDrawers = false,
  outcomeAnimationReady = true,
}: NodeActionPanelProps) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerSize, setDrawerSize] = useState({ width: 0, height: 0 });
  const [modifierDrawerOpen, setModifierDrawerOpen] = useState(false);
  const [modifierDrawerMounted, setModifierDrawerMounted] = useState(false);
  const dc = effectiveDC(mapTier, node.resolve, securityBonus, rootAccessAchieved, node.isRootAccess);
  const subskill = node.resolve?.subskill ?? 'hack';
  const successesRequired = node.resolve?.successesRequired ?? 0;
  const isModule = node.category === 'module';
  const requiredSuccesses = successesRequired || 1;
  const moduleCollected = isModule && successes >= requiredSuccesses;
  const failuresRequired = node.failureLimit;
  const basicOutcome = hackingMode === 'basic'
    ? successes >= requiredSuccesses
      ? 'success'
      : failuresRequired !== undefined && failures >= failuresRequired
        ? 'failure'
        : null
    : null;
  const isSuccessOutcome = basicOutcome === 'success' || moduleCollected;
  const hasTerminalOutcome = basicOutcome !== null || moduleCollected;
  const outcomeBorderColor = isSuccessOutcome
    ? 'rgba(52, 211, 153, 0.4)'
    : basicOutcome === 'failure'
      ? 'rgba(248, 113, 113, 0.4)'
      : '#475569';

  const glowColor = isReachable ? '#22d3ee' : '#ef4444';

  const effectiveCommitted = playerClass === 'lead' 
    ? (actionsCommitted > 0 ? actionsCommitted : 1)
    : actionsCommitted;
  const majorDisabled = !isReachable || basicOutcome !== null || moduleCollected || (!isModule && playerClass === 'support' && actionsCommitted === 0) || (!isModule && actionsTaken >= effectiveCommitted);

  const PANEL_WIDTH = 260;
  const hasPasswordAction = isReachable && !!node.password && !!onPasswordAction;
  const passwordActionHeight = hasPasswordAction ? 74 : 0;
  const infoDrawersHidden = hideInfoDrawers || basicOutcome !== null || moduleCollected;
  const PANEL_HEIGHT = isReachable
    ? (hackingMode === 'basic' ? (basicOutcome ? 220 : 220 + passwordActionHeight) : 320 + passwordActionHeight)
    : 160;
  const basicDetailsHeight = basicOutcome ? 164 : 164 + passwordActionHeight;
  const actionFrameWidth = hackingMode === 'basic' ? PANEL_WIDTH - 40 : PANEL_WIDTH - 24;
  const drawerChamfer = Math.min(8, drawerSize.width / 2, drawerSize.height / 2);
  const verticalProgress = useSharedValue(0);
  const horizontalProgress = useSharedValue(0);
  const revealOpacity = useSharedValue(1);
  const contentOpacity = useSharedValue(0);
  const drawerProgress = useSharedValue(0);
  const modifierDrawerProgress = useSharedValue(0);
  const infoProgress = useSharedValue(0);
  const successOutcomeProgress = useSharedValue(0);
  const failureOutcomeProgress = useSharedValue(0);
  const failureOutcomeOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (isSuccessOutcome && outcomeAnimationReady) {
      successOutcomeProgress.value = 0;
      successOutcomeProgress.value = withTiming(1, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [isSuccessOutcome, outcomeAnimationReady, successOutcomeProgress]);

  React.useEffect(() => {
    if (basicOutcome === 'failure' && outcomeAnimationReady) {
      failureOutcomeProgress.value = withSequence(
        withTiming(-8, { duration: 55 }),
        withTiming(8, { duration: 70 }),
        withTiming(-5, { duration: 60 }),
        withTiming(0, { duration: 65 }),
      );
      failureOutcomeOpacity.value = withTiming(1, { duration: 160 });
    }
  }, [basicOutcome, failureOutcomeOpacity, failureOutcomeProgress, outcomeAnimationReady]);

  React.useEffect(() => {
    if (infoDrawersHidden) {
      setDescriptionOpen(false);
      setModifierDrawerOpen(false);
    }
  }, [infoDrawersHidden]);

  React.useEffect(() => {
    if (closing) {
      contentOpacity.value = 0;
      infoProgress.value = withTiming(0, { duration: 120 });
      revealOpacity.value = 1;
      horizontalProgress.value = withTiming(0, { duration: 240 });
      verticalProgress.value = withDelay(240, withTiming(0, { duration: 180 }));
      return;
    }

    verticalProgress.value = withTiming(1, { duration: 180 });
    horizontalProgress.value = withDelay(180, withTiming(1, { duration: 240 }));
    revealOpacity.value = withDelay(360, withTiming(0, { duration: 160 }));
    contentOpacity.value = withDelay(360, withTiming(1, { duration: 180 }));
    infoProgress.value = withDelay(540, withTiming(1, { duration: 180 }));
  }, [closing, contentOpacity, horizontalProgress, infoProgress, revealOpacity, verticalProgress]);

  React.useEffect(() => {
    if (descriptionOpen) {
      setDrawerMounted(true);
      drawerProgress.value = withTiming(1, { duration: 240 });
      return;
    }

    if (drawerMounted) {
      drawerProgress.value = withTiming(0, { duration: 240 }, (finished) => {
        if (finished) runOnJS(setDrawerMounted)(false);
      });
    }
  }, [descriptionOpen, drawerMounted, drawerProgress]);

  React.useEffect(() => {
    if (modifierDrawerOpen) {
      setModifierDrawerMounted(true);
      modifierDrawerProgress.value = withTiming(1, { duration: 240 });
      return;
    }

    if (modifierDrawerMounted) {
      modifierDrawerProgress.value = withTiming(0, { duration: 240 }, (finished) => {
        if (finished) runOnJS(setModifierDrawerMounted)(false);
      });
    }
  }, [modifierDrawerMounted, modifierDrawerOpen, modifierDrawerProgress]);

  const verticalRevealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ scaleY: verticalProgress.value }],
  }));
  const horizontalRevealStyle = useAnimatedStyle(() => ({
    opacity: revealOpacity.value,
    transform: [{ scaleX: horizontalProgress.value }],
  }));
  const dotRevealStyle = useAnimatedStyle(() => ({ opacity: closing ? 1 : revealOpacity.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const infoStyle = useAnimatedStyle(() => ({
    opacity: infoProgress.value,
    transform: [{ translateY: (1 - infoProgress.value) * -18 }],
  }));
  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - drawerProgress.value) * -12 }],
  }));
  const modifierDrawerStyle = useAnimatedStyle(() => ({
    opacity: modifierDrawerProgress.value,
    transform: [{ translateX: (1 - modifierDrawerProgress.value) * -24 }],
  }));
  const successOutcomeStyle = useAnimatedStyle(() => ({
    opacity: successOutcomeProgress.value,
    transform: [
      { translateY: (1 - successOutcomeProgress.value) * -18 },
      { scale: 0.92 + successOutcomeProgress.value * 0.08 },
    ],
  }), [successOutcomeProgress]);
  const failureOutcomeStyle = useAnimatedStyle(() => ({
    opacity: failureOutcomeOpacity.value,
    transform: [{ translateX: failureOutcomeProgress.value }],
  }), [failureOutcomeOpacity, failureOutcomeProgress]);

  const formatModifier = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

  return (
    <Pressable style={[
      styles.panel,
      {
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        left: node.x + 50 - (PANEL_WIDTH / 2), 
        top: node.y + 110,      
      }
    ]}>
      <Animated.View style={[styles.verticalReveal, verticalRevealStyle, { pointerEvents: 'none' }]} />
      <View style={[styles.horizontalRevealClip, { pointerEvents: 'none' }]}>
        <Animated.View style={[styles.horizontalReveal, horizontalRevealStyle]} />
      </View>
      <Animated.View style={[styles.centerRevealDot, dotRevealStyle, { pointerEvents: 'none' }]} />
      <Animated.View style={[styles.panelContent, contentStyle]}>
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <ChamferedFrame 
          width={PANEL_WIDTH} 
          height={PANEL_HEIGHT} 
          chamfer={16} 
            stroke={hasTerminalOutcome ? outcomeBorderColor : '#475569'}
          strokeWidth={8} 
            fill={isSuccessOutcome ? 'rgba(6, 78, 59, 0.88)' : basicOutcome === 'failure' ? 'rgba(127, 29, 29, 0.88)' : 'rgba(2, 6, 23, 0.95)'} 
        />
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
          <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id="panelGlow" cx="0.5" cy="0" r="1.2" fx="0.5" fy="0">
                <Stop offset="0%" stopColor={glowColor} stopOpacity="0.15" />
                <Stop offset="50%" stopColor={glowColor} stopOpacity="0.05" />
                <Stop offset="100%" stopColor={glowColor} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="1" height="1" fill="url(#panelGlow)" />
          </Svg>
        </View>
      </View>

      {isReachable && hackingMode === 'basic' ? (
        <View style={[styles.basicPlayerHeader, basicOutcome ? styles.outcomeFaded : null]}>
          <Text style={styles.basicPlayerName}>{playerName}</Text>
          <View style={styles.basicComputersButton}>
            <Text style={styles.basicComputers}>COMPUTERS {formatModifier(modifiers?.total ?? 0)}</Text>
            {!infoDrawersHidden && (
              <Pressable
                accessibilityLabel="Show Computers modifier details"
                style={styles.modifierDrawerButton}
                onPress={() => setModifierDrawerOpen((open) => !open)}
              >
                <Text style={styles.modifierDrawerIndicator}>&gt;</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : isReachable ? (
        <Text style={styles.playerLabel}>{playerName} ({playerClass})</Text>
      ) : null}

      <View style={[
        isReachable && hackingMode === 'basic' ? styles.basicDetailsCard : null,
        isReachable && hackingMode === 'basic' ? { height: basicDetailsHeight } : null,
        !isReachable ? styles.deniedContainer : null,
      ]}>
      {isReachable && hackingMode === 'basic' && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
          <ChamferedFrame
            width={PANEL_WIDTH - 24}
            height={basicDetailsHeight}
            chamfer={12}
            stroke={outcomeBorderColor}
            strokeWidth={2}
            fill="rgba(15, 23, 42, 0.68)"
          />
        </View>
      )}
      {isReachable && hackingMode === 'basic' ? (
        <View style={[styles.basicNodeHeader, basicOutcome ? styles.outcomeFaded : null]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {isReachable ? node.name : 'Unknown Host'}
            </Text>
            <Text style={styles.meta}>
              {node.category.toUpperCase()} • DC {dc}
            </Text>
          </View>
        </View>
      ) : isReachable ? (
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {isReachable ? node.name : 'Unknown Host'}
            </Text>
            <Text style={styles.meta}>
              DC {dc}
              {` • ${subskill[0].toUpperCase() + subskill.slice(1)}`}
              {successesRequired > 0 ? ` • ${successes}/${successesRequired}` : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {isReachable && hackingMode === 'dynamic' && (
        <View style={styles.progressDrawer}>
          <View style={styles.progressLine}>
            <Text style={styles.progressLabel}>SUCCESSES</Text>
            <Text style={styles.progressValue}>{successes}/{successesRequired || 1}</Text>
          </View>
          <View style={styles.progressLine}>
            <Text style={styles.progressLabel}>FAILURES</Text>
            <Text style={[styles.progressValue, styles.failureValue]}>{failures}{failuresRequired !== undefined ? `/${failuresRequired}` : ''}</Text>
          </View>
        </View>
      )}

      {isReachable && hackingMode === 'dynamic' && (
        <View style={styles.statsRow}>
          <View style={styles.statLine}>
            <Text style={styles.statLabel}>RP</Text>
            <Text style={styles.statValue}>{rp}</Text>
          </View>
          {hackingMode === 'dynamic' && (
            <View style={styles.statLine}>
              <Text style={styles.statLabel}>CP</Text>
              <Text style={styles.statValue}>{cp}/{maxCp}</Text>
            </View>
          )}
        </View>
      )}

      {isReachable && hackingMode === 'dynamic' && (
        <View style={styles.modifiersRow}>
          {hackingMode === 'dynamic' ? (
            <>
              <View style={styles.modItem}>
                <Text style={styles.modLabel}>Hack</Text>
                <Text style={[styles.modValue, subskill === 'hack' && styles.modValueHighlight]}>
                  +{modifiers?.hack ?? 0}
                </Text>
              </View>
              <View style={styles.modItem}>
                <Text style={styles.modLabel}>Deceive</Text>
                <Text style={[styles.modValue, subskill === 'deceive' && styles.modValueHighlight]}>
                  +{modifiers?.deceive ?? 0}
                </Text>
              </View>
              <View style={styles.modItem}>
                <Text style={styles.modLabel}>Process</Text>
                <Text style={[styles.modValue, subskill === 'process' && styles.modValueHighlight]}>
                  +{modifiers?.process ?? 0}
                </Text>
              </View>
            </>
          ) : (
            <View style={[styles.modItem, { flex: 1 }]}>
              <Text style={styles.modLabel}>Computers Mod</Text>
              <Text style={[styles.modValue, styles.modValueHighlight]}>
                +{modifiers?.total ?? 0}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={[styles.actions, basicOutcome || moduleCollected ? styles.outcomeActions : null]}>
        {isReachable ? (
          moduleCollected ? null : basicOutcome ? (
            <Animated.View style={[
              styles.outcomeMessage,
              basicOutcome === 'success' ? styles.successOutcomeMessage : styles.failureOutcomeMessage,
              basicOutcome === 'success' ? successOutcomeStyle : failureOutcomeStyle,
            ]}>
              <Text style={[
                styles.outcomeMessageText,
                basicOutcome === 'success' ? styles.successOutcomeText : styles.failureOutcomeText,
              ]}>
                {basicOutcome === 'success'
                  ? node.password ? 'Login successful' : 'Successfully hacked!'
                  : 'Hack failed - node locked'}
              </Text>
            </Animated.View>
          ) : (
          <>
            {node.password && onPasswordAction ? (
              <>
                <TextInput
                  style={styles.passwordInput}
                  value={passwordInput}
                  onChangeText={setPasswordInput}
                  placeholder="Enter password"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  editable={!majorDisabled}
                />
                <Pressable
                  style={[styles.btn, styles.majorBtn, majorDisabled || !passwordInput.trim() ? styles.btnDisabled : null]}
                  onPress={() => onPasswordAction(passwordInput)}
                  disabled={majorDisabled || !passwordInput.trim()}
                >
                  <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                    <ChamferedFrame
                      width={actionFrameWidth}
                      height={32}
                      chamfer={6}
                      stroke={majorDisabled || !passwordInput.trim() ? '#334155' : '#22d3ee'}
                      fill={majorDisabled || !passwordInput.trim() ? '#0f172a' : '#0891b2'}
                    />
                  </View>
                  <Text style={styles.btnText}>Enter Password</Text>
                </Pressable>
              </>
            ) : null}
            {canPlanTurn ? (
              <Pressable style={[styles.btn, styles.planBtn]} onPress={onPlanTurn}>
                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                  <ChamferedFrame width={236} height={32} chamfer={6} stroke="#475569" fill="#1e293b" />
                </View>
                <Text style={styles.btnText}>Plan Turn</Text>
              </Pressable>
            ) : null}
            
              <Pressable 
                style={[
                  styles.btn, 
                  styles.majorBtn,
                  majorDisabled ? styles.btnDisabled : null
                ]} 
                onPress={onMajorAction}
                disabled={majorDisabled}
              >
                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                  <ChamferedFrame 
                    width={actionFrameWidth} 
                    height={32} 
                    chamfer={6} 
                    stroke={majorDisabled ? "#334155" : "#22d3ee"} 
                    fill={majorDisabled ? "#0f172a" : "#0891b2"} 
                  />
                </View>
                <Text style={styles.btnText}>
                  {isModule
                    ? 'Collect Module'
                    : hackingMode === 'basic'
                    ? node.category === 'countermeasure' ? 'Hack Countermeasure' : `Hack ${node.name}`
                    : `Major Action${playerClass === 'lead' && (aidBonus ?? 0) > 0 ? ` (+${aidBonus} Aid)` : ''}`}
                </Text>
              </Pressable>

              {hackingMode === 'dynamic' && <Pressable 
                style={[
                  styles.btn, 
                  styles.supportBtn, 
                  (minorActionsTaken > 0 || (playerClass === 'lead' && !otherLeadsExist)) ? styles.btnDisabled : null
                ]} 
                onPress={onSupportAction}
                disabled={minorActionsTaken > 0 || (playerClass === 'lead' && !otherLeadsExist)}
              >
                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                  <ChamferedFrame 
                    width={PANEL_WIDTH - 24} 
                    height={32} 
                    chamfer={6} 
                    stroke={(minorActionsTaken > 0 || (playerClass === 'lead' && !otherLeadsExist)) ? "#334155" : "#a78bfa"} 
                    fill={(minorActionsTaken > 0 || (playerClass === 'lead' && !otherLeadsExist)) ? "#0f172a" : "#7c3aed"} 
                  />
                </View>
                <Text style={styles.btnText}>
                  {(playerClass === 'lead' && !otherLeadsExist) ? 'No Options Available' : 'Minor Action'}
                </Text>
              </Pressable>}

              {playerClass === 'support' && actionsCommitted === 0 ? (
                <Pressable 
                  style={[styles.btn, styles.buyBtn, (actionsTaken > 0 || rp < 1) ? styles.btnDisabled : null]} 
                  onPress={onBuyMajorAction}
                  disabled={actionsTaken > 0 || rp < 1}
                >
                  <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                    <ChamferedFrame 
                      width={PANEL_WIDTH - 24} 
                      height={32} 
                      chamfer={6} 
                      stroke={(actionsTaken > 0 || rp < 1) ? "#334155" : "#22d3ee"} 
                      fill={(actionsTaken > 0 || rp < 1) ? "#0f172a" : "#0e7490"} 
                    />
                  </View>
                  <Text style={styles.btnText}>Buy Major Action (1RP)</Text>
                </Pressable>
              ) : null}

              {playerClass === 'support' && actionsCommitted > 0 && actionsTaken === 0 ? (
                <Pressable style={[styles.btn, styles.refundBtn]} onPress={onRefundMajorAction}>
                  <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                    <ChamferedFrame width={PANEL_WIDTH - 24} height={32} chamfer={6} stroke="#475569" fill="#334155" />
                  </View>
                  <Text style={styles.btnText}>Refund Major Action</Text>
                </Pressable>
              ) : null}

              {hackingMode === 'dynamic' && <Pressable style={[styles.btn, styles.endBtn]} onPress={onEndTurn}>
                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                  <ChamferedFrame width={PANEL_WIDTH - 24} height={32} chamfer={6} stroke="#f87171" fill="#7f1d1d" />
                </View>
                <Text style={styles.btnText}>End Turn</Text>
              </Pressable>}
          </>
          )
        ) : (
          <View style={styles.deniedBox}>
            <Text style={styles.deniedText}>ACCESS DENIED</Text>
            <Text style={styles.deniedSubtext}>PRECEDING NODE SECURE</Text>
          </View>
        )}
      </View>

      {isReachable && hackingMode === 'basic' && (
        <View style={[styles.basicProgressCard, basicOutcome ? styles.outcomeFaded : null]}>
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            <ChamferedFrame
              width={actionFrameWidth}
              height={52}
              chamfer={8}
              stroke={outcomeBorderColor}
              strokeWidth={1}
              fill="rgba(15, 23, 42, 0.72)"
            />
          </View>
          <View style={styles.basicProgressRow}>
            <View style={styles.basicProgressItem}>
              <Text style={styles.progressLabel}>SUCCESSES</Text>
              <Text style={styles.progressValue}>{successes}/{requiredSuccesses}</Text>
            </View>
            <View style={styles.basicProgressItem}>
              <Text style={styles.progressLabel}>FAILURES</Text>
              <Text style={[styles.progressValue, styles.failureValue]}>{failures}{failuresRequired !== undefined ? `/${failuresRequired}` : ''}</Text>
            </View>
          </View>
        </View>
      )}
      </View>
      {moduleCollected && (
        <Animated.View
          style={[
            styles.outcomeMessage,
            styles.moduleCollectedMessage,
            successOutcomeStyle,
            { top: (PANEL_HEIGHT - 72) / 2, width: PANEL_WIDTH, left: 0 },
          ]}
        >
          <Text style={[styles.outcomeMessageText, styles.successOutcomeText]}>
            MODULE COLLECTED!
          </Text>
        </Animated.View>
      )}
      </Animated.View>
      {!infoDrawersHidden && hackingMode === 'basic' && isReachable && modifierDrawerMounted && (
        <Animated.View style={[styles.modifierDrawer, modifierDrawerStyle]}>
          <Text style={styles.modifierDrawerTitle}>COMPUTERS MODIFIER</Text>
          <View style={styles.modifierDetailLine}>
            <Text style={styles.modifierDetailLabel}>Base</Text>
            <Text style={styles.modifierDetailValue}>{formatModifier(modifiers?.base ?? 0)}</Text>
          </View>
          {(modifiers?.passwordBonus ?? 0) !== 0 && (
            <View style={styles.modifierDetailLine}>
              <Text style={styles.modifierDetailLabel}>Password</Text>
              <Text style={styles.modifierDetailValue}>{formatModifier(modifiers?.passwordBonus ?? 0)}</Text>
            </View>
          )}
          {(modifiers?.penalty ?? 0) !== 0 && (
            <View style={styles.modifierDetailLine}>
              <Text style={styles.modifierDetailLabel}>Turn</Text>
              <Text style={[styles.modifierDetailValue, styles.modifierPenalty]}>{formatModifier(modifiers?.penalty ?? 0)}</Text>
            </View>
          )}
          {(modifiers?.aidBonus ?? 0) !== 0 && (
            <View style={styles.modifierDetailLine}>
              <Text style={styles.modifierDetailLabel}>Aid</Text>
              <Text style={styles.modifierDetailValue}>{formatModifier(modifiers?.aidBonus ?? 0)}</Text>
            </View>
          )}
          <View style={[styles.modifierDetailLine, styles.modifierTotalLine]}>
            <Text style={styles.modifierDetailLabel}>Total</Text>
            <Text style={styles.modifierTotalValue}>{formatModifier(modifiers?.total ?? 0)}</Text>
          </View>
        </Animated.View>
      )}
      {!infoDrawersHidden && <View style={styles.descriptionArea}>
        {drawerMounted && (
          <Animated.View
            style={[styles.descriptionDrawer, drawerStyle, { pointerEvents: descriptionOpen ? 'auto' : 'none' }]}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              if (width !== drawerSize.width || height !== drawerSize.height) {
                setDrawerSize({ width, height });
              }
            }}
          >
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              <Svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${drawerSize.width || 1} ${drawerSize.height || 1}`}
                preserveAspectRatio="none"
              >
                <Polygon
                  points={`0,0 ${drawerSize.width},0 ${drawerSize.width},${drawerSize.height - drawerChamfer} ${drawerSize.width - drawerChamfer},${drawerSize.height} ${drawerChamfer},${drawerSize.height} 0,${drawerSize.height - drawerChamfer}`}
                  fill="rgba(15, 23, 42, 0.98)"
                  stroke="#475569"
                  strokeWidth={1}
                />
              </Svg>
            </View>
            <Text style={styles.descriptionText}>
              {node.description || 'No description available.'}
            </Text>
          </Animated.View>
        )}
        <Animated.View style={infoStyle}>
          <Pressable
            accessibilityLabel={descriptionOpen ? 'Close node description' : 'Open node description'}
            style={styles.infoButton}
            onPress={() => setDescriptionOpen((open) => !open)}
          >
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              <Svg width={28} height={18} viewBox="0 0 28 18">
                <Polygon
                  points="0,0 28,0 23,18 5,18"
                  fill="rgba(15, 23, 42, 0.98)"
                  stroke="#64748b"
                  strokeWidth={1}
                />
                <Circle
                  cx={14}
                  cy={9}
                  r={7}
                  fill="none"
                  stroke="#64748b"
                  strokeWidth={1}
                />
              </Svg>
            </View>
            <Text style={styles.infoButtonText}>i</Text>
          </Pressable>
        </Animated.View>
      </View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    // Width and left handled dynamically in the component
    padding: 12,
    zIndex: 100,
  },
  panelContent: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: 12,
    zIndex: 2,
  },
  verticalReveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: '#22d3ee',
  },
  horizontalReveal: {
    position: 'absolute',
    left: 0,
    width: 236,
    top: 0,
    height: 2,
    backgroundColor: '#22d3ee',
  },
  horizontalRevealClip: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 236,
    height: 2,
    marginTop: -1,
    overflow: 'hidden',
  },
  centerRevealDot: {
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
  infoButton: {
    width: 28,
    height: 18,
    marginRight: 12,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'Orbitron-Bold',
  },
  descriptionArea: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 0,
    alignItems: 'flex-end',
  },
  descriptionDrawer: {
    position: 'absolute',
    top: 0,
    width: '92%',
    alignSelf: 'center',
    padding: 12,
  },
  descriptionText: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'Orbitron',
  },
  outcomeFaded: {
    opacity: 0.45,
  },
  outcomeMessage: {
    position: 'absolute',
    top: -16,
    left: 0,
    right: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    zIndex: 200,
    elevation: 20,
  },
  successOutcomeMessage: {
    left: -20,
    right: -20,
    backgroundColor: 'rgba(6, 78, 59, 0.9)',
    borderWidth: 2,
    borderColor: '#34d399',
    minHeight: 72,
  },
  moduleCollectedMessage: {
    backgroundColor: 'rgba(6, 78, 59, 0.9)',
    borderWidth: 2,
    borderColor: '#34d399',
    minHeight: 72,
  },
  failureOutcomeMessage: {
    left: -20,
    right: -20,
    backgroundColor: 'rgba(127, 29, 29, 0.9)',
    borderWidth: 2,
    borderColor: '#f87171',
    minHeight: 72,
  },
  outcomeMessageText: {
    fontSize: 12,
    fontFamily: 'Orbitron-Bold',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  successOutcomeText: {
    color: '#34d399',
    fontSize: 24,
  },
  failureOutcomeText: {
    color: '#f87171',
    fontSize: 24,
  },
  playerLabel: {
    fontSize: 9,
    color: '#22d3ee',
    fontFamily: 'Orbitron-Black',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  basicPlayerHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  basicPlayerName: {
    color: '#f1f5f9',
    fontSize: 14,
    fontFamily: 'Orbitron-Bold',
  },
  basicComputers: {
    color: '#22d3ee',
    fontSize: 10,
    fontFamily: 'Orbitron-Bold',
  },
  basicComputersButton: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  modifierDrawerIndicator: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 12,
    fontFamily: 'Orbitron-Bold',
  },
  modifierDrawerButton: {
    position: 'absolute',
    right: -23,
    top: 0,
    width: 22,
    height: 22,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifierDrawer: {
    position: 'absolute',
    top: 8,
    right: -148,
    width: 142,
    padding: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderWidth: 1,
    borderColor: '#22d3ee',
    zIndex: 0,
    elevation: 8,
  },
  modifierDrawerTitle: {
    color: '#22d3ee',
    fontSize: 8,
    fontFamily: 'Orbitron-Bold',
    marginBottom: 8,
  },
  modifierDetailLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  modifierDetailLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontFamily: 'Orbitron',
  },
  modifierDetailValue: {
    color: '#cbd5e1',
    fontSize: 10,
    fontFamily: 'Orbitron-Bold',
  },
  modifierPenalty: {
    color: '#f87171',
  },
  modifierTotalLine: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 6,
    marginTop: 2,
    marginBottom: 0,
  },
  modifierTotalValue: {
    color: '#67e8f9',
    fontSize: 12,
    fontFamily: 'Orbitron-Black',
  },
  basicNodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginLeft: 8,
  },
  basicDetailsCard: {
    padding: 8,
  },
  deniedContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 8,
  },
  progressDrawer: {
    position: 'absolute',
    right: -78,
    top: 12,
    width: 76,
    padding: 8,
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderWidth: 1,
    borderColor: '#475569',
    borderLeftWidth: 0,
  },
  basicProgressCard: {
    height: 52,
    marginTop: 18,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  basicProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  basicProgressItem: {
    alignItems: 'center',
    minWidth: 88,
  },
  progressLine: { gap: 2 },
  progressLabel: { color: '#94a3b8', fontSize: 8, fontFamily: 'Orbitron-Bold' },
  progressValue: { color: '#22d3ee', fontSize: 14, fontFamily: 'Orbitron-Bold' },
  failureValue: { color: '#f87171' },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 0,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 16 },
  name: { fontSize: 14, color: '#f1f5f9', fontFamily: 'Orbitron-Bold' },
  meta: { fontSize: 11, color: '#94a3b8', marginTop: 1, fontFamily: 'Orbitron' },
  actions: {
    position: 'relative',
    gap: 6,
  },
  outcomeActions: {
    minHeight: 36,
  },
  passwordInput: {
    height: 32,
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    paddingHorizontal: 10,
    fontSize: 12,
    fontFamily: 'Orbitron',
  },
  btn: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginVertical: 2,
  },
  btnText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Orbitron-Bold',
    textTransform: 'uppercase',
  },
  planBtn: {
  },
  majorBtn: {
  },
  btnDisabled: {
    opacity: 0.8,
  },
  buyBtn: {
  },
  refundBtn: {
  },
  supportBtn: {
  },
  endBtn: {
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  statLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'Orbitron-Bold',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    color: '#22d3ee',
    fontFamily: 'Orbitron-Black',
  },
  modifiersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    padding: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  modItem: { alignItems: 'center', flex: 1 },
  modLabel: { fontSize: 8, color: '#64748b', fontFamily: 'Orbitron', textTransform: 'uppercase' },
  modValue: { fontSize: 11, color: '#94a3b8', fontFamily: 'Orbitron-Bold' },
  modValueHighlight: { color: '#22d3ee' },
  deniedBox: {
    backgroundColor: 'rgba(127, 29, 29, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 0,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderStyle: 'dashed',
  },
  deniedText: {
    color: '#ef4444',
    fontSize: 13,
    fontFamily: 'Orbitron-Black',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  deniedSubtext: {
    color: '#f87171',
    fontSize: 9,
    fontFamily: 'Orbitron-Bold',
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'uppercase',
  },
});
