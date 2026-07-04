import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { FlowNode } from '@/lib/flow/types';
import { effectiveDC } from '@/lib/starfinder/tables';
import { ChamferedFrame } from '../ui/ChamferedFrame';

interface NodeActionPanelProps {
  node: FlowNode;
  successes: number;
  canPlanTurn: boolean;
  onPlanTurn: () => void;
  onMajorAction: () => void;
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
  modifiers?: { deceive: number; hack: number; process: number; total: number };
  hackingMode?: 'basic' | 'dynamic';
}

export function NodeActionPanel({
  node,
  successes,
  canPlanTurn,
  onPlanTurn,
  onMajorAction,
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
}: NodeActionPanelProps) {
  const catColors: Record<FlowNode['category'], { fill: string; border: string; icon: string }> = {
    module: { fill: '#1e3a8a', border: '#60a5fa', icon: '📦' },
    countermeasure: { fill: '#7f1d1d', border: '#f87171', icon: '🛡' },
    gateway: { fill: '#374151', border: '#9ca3af', icon: '🔀' },
  };
  const cat = catColors[node.category];
  const dc = effectiveDC(node.tier, node.resolve);
  const subskill = node.resolve?.subskill ?? 'hack';
  const successesRequired = node.resolve?.successesRequired ?? 0;

  const glowColor = isReachable ? '#22d3ee' : '#ef4444';

  const effectiveCommitted = playerClass === 'lead' 
    ? (actionsCommitted > 0 ? actionsCommitted : 1)
    : actionsCommitted;
  const majorDisabled = !isReachable || (playerClass === 'support' && actionsCommitted === 0) || actionsTaken >= effectiveCommitted;

  const PANEL_WIDTH = 260;
  const PANEL_HEIGHT = isReachable ? 320 : 160;

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
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ChamferedFrame 
          width={PANEL_WIDTH} 
          height={PANEL_HEIGHT} 
          chamfer={16} 
          stroke="#475569" 
          strokeWidth={8} 
          fill="rgba(2, 6, 23, 0.95)" 
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
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

      {isReachable && <Text style={styles.playerLabel}>{playerName} ({playerClass})</Text>}
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: cat.fill, borderColor: cat.border }]}>
          <Text style={styles.icon}>{cat.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {isReachable ? node.name : 'Unknown Host'}
          </Text>
          <Text style={styles.meta}>
            DC {dc} 
            {hackingMode === 'dynamic' && ` • ${subskill[0].toUpperCase() + subskill.slice(1)}`}
            {successesRequired > 0 ? ` • ${successes}/${successesRequired}` : ''}
          </Text>
        </View>
      </View>

      {isReachable && (
        <View style={styles.statsRow}>
          <View style={styles.statLine}>
            <Text style={styles.statLabel}>RP</Text>
            <Text style={styles.statValue}>{rp}</Text>
          </View>
          <View style={styles.statLine}>
            <Text style={styles.statLabel}>CP</Text>
            <Text style={styles.statValue}>{cp}/{maxCp}</Text>
          </View>
        </View>
      )}

      {isReachable && (
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

      <View style={styles.actions}>
        {isReachable ? (
          <>
            {canPlanTurn ? (
              <Pressable style={[styles.btn, styles.planBtn]} onPress={onPlanTurn}>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <ChamferedFrame 
                    width={PANEL_WIDTH - 24} 
                    height={32} 
                    chamfer={6} 
                    stroke={majorDisabled ? "#334155" : "#22d3ee"} 
                    fill={majorDisabled ? "#0f172a" : "#0891b2"} 
                  />
                </View>
                <Text style={styles.btnText}>
                  Major Action{playerClass === 'lead' && (aidBonus ?? 0) > 0 ? ` (+${aidBonus} Aid)` : ''}
                </Text>
              </Pressable>

              <Pressable 
                style={[
                  styles.btn, 
                  styles.supportBtn, 
                  (minorActionsTaken > 0 || (playerClass === 'lead' && !otherLeadsExist)) ? styles.btnDisabled : null
                ]} 
                onPress={onSupportAction}
                disabled={minorActionsTaken > 0 || (playerClass === 'lead' && !otherLeadsExist)}
              >
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
              </Pressable>

              {playerClass === 'support' && actionsCommitted === 0 ? (
                <Pressable 
                  style={[styles.btn, styles.buyBtn, (actionsTaken > 0 || rp < 1) ? styles.btnDisabled : null]} 
                  onPress={onBuyMajorAction}
                  disabled={actionsTaken > 0 || rp < 1}
                >
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <ChamferedFrame width={PANEL_WIDTH - 24} height={32} chamfer={6} stroke="#475569" fill="#334155" />
                  </View>
                  <Text style={styles.btnText}>Refund Major Action</Text>
                </Pressable>
              ) : null}

              <Pressable style={[styles.btn, styles.endBtn]} onPress={onEndTurn}>
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <ChamferedFrame width={PANEL_WIDTH - 24} height={32} chamfer={6} stroke="#f87171" fill="#7f1d1d" />
                </View>
                <Text style={styles.btnText}>End Turn</Text>
              </Pressable>
          </>
        ) : (
          <View style={styles.deniedBox}>
            <Text style={styles.deniedText}>ACCESS DENIED</Text>
            <Text style={styles.deniedSubtext}>PRECEDING NODE SECURE</Text>
          </View>
        )}
      </View>
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
  playerLabel: {
    fontSize: 9,
    color: '#22d3ee',
    fontFamily: 'Orbitron-Black',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
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
    gap: 6,
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
