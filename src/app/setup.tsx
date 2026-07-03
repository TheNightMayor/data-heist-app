/**
 * Setup screen — player count, names, classes, skill modifier, resolve points.
 * Used before starting a game from the home or map list.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput, ScrollView, Switch, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { nanoid } from 'nanoid';
import { loadMap } from '@/lib/flow/persistence';
import type { FlowMap } from '@/lib/flow/types';
import { useGameStore } from '@/stores/gameStore';
import { ChamferedFrame } from '@/components/ui/ChamferedFrame';

interface DraftPlayer {
  id: string;
  name: string;
  class: 'lead' | 'support';
  computersRanks: number;
  resolvePoints: number;
  /** Support only: which Lead this Support is paired with for Aid. */
  pairedLeadId?: string;
}

export default function SetupScreen() {
  const { mapId } = useLocalSearchParams<{ mapId: string }>();
  const router = useRouter();
  const startGame = useGameStore((s) => s.startGame);

  const [map, setMap] = useState<FlowMap | null>(null);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [players, setPlayers] = useState<DraftPlayer[]>(() => {
    const leadId = nanoid(6);
    const supportId = nanoid(6);
    return [
      { id: leadId, name: 'Alice', class: 'lead', computersRanks: 4, resolvePoints: 3 },
      { id: supportId, name: 'Bob', class: 'support', computersRanks: 4, resolvePoints: 3, pairedLeadId: leadId },
    ];
  });

  useEffect(() => {
    if (mapId) {
      loadMap(mapId).then((m) => setMap(m));
    }
  }, [mapId]);

  const updatePlayer = (id: string, patch: Partial<DraftPlayer>) => {
    setPlayers((ps) => {
      const existing = ps.find((p) => p.id === id);
      if (!existing) return ps;

      // Tentatively apply patch
      const tentative = ps.map((p) => (p.id === id ? { ...p, ...patch } : p));

      // Compute lead lists
      const leadsExcludingTarget = tentative.filter((p) => p.class === 'lead' && p.id !== id);
      const leadsAll = tentative.filter((p) => p.class === 'lead');

      // If patch attempts to convert this player to Support but there are no other leads, reject the change
      if (patch.class === 'support') {
        if (leadsExcludingTarget.length === 0) {
          // Can't convert to Support without another Lead to attach to
          return ps;
        }
        // Ensure the new Support has a pairedLeadId; prefer provided, otherwise first other lead
        const paired = (patch.pairedLeadId as string) ?? tentative.find((p) => p.id !== id && p.class === 'lead')?.id;
        return tentative.map((p) => (p.id === id ? { ...p, class: 'support', pairedLeadId: paired } : p));
      }

      // If patch converts a lead away (to support) or removes a lead, ensure any supports paired to that lead are reassigned
      if (existing.class === 'lead' && (patch.class === 'support' || patch.class === 'support')) {
        // Should have been handled above (conversion to support requires another lead). Safe no-op here.
      }

      // If patch converts someone to lead, or general updates, ensure every support has a valid pairedLeadId
      const validLeadIds = new Set(leadsAll.map((l) => l.id));
      const firstLead = leadsAll[0];
      return tentative.map((p) => {
        if (p.class !== 'support') return p;
        if (!p.pairedLeadId || !validLeadIds.has(p.pairedLeadId)) {
          return { ...p, pairedLeadId: firstLead?.id };
        }
        return p;
      });
    });
  };

  const addPlayer = () => {
    if (players.length >= 4) return;
    setPlayers((ps) => [
      ...ps,
      { id: nanoid(6), name: `Player ${ps.length + 1}`, class: 'lead', computersRanks: 4, resolvePoints: 3 },
    ]);
  };

  // Lead players for the pairing picker.
  const leads = players.filter((p) => p.class === 'lead');

  const removePlayer = (id: string) => {
    if (players.length <= 1) return;
    const toRemove = players.find((p) => p.id === id);
    if (!toRemove) return;

    // Prevent removing the last Lead — there must always be at least one Lead
    if (toRemove.class === 'lead') {
      const otherLeads = players.filter((p) => p.class === 'lead' && p.id !== id);
      if (otherLeads.length === 0) return;
      // Reassign supports paired to this lead to the first other lead
      const newLeadId = otherLeads[0].id;
      setPlayers((ps) => ps
        .filter((p) => p.id !== id)
        .map((p) => (p.class === 'support' && p.pairedLeadId === id ? { ...p, pairedLeadId: newLeadId } : p)));
      return;
    }

    setPlayers((ps) => ps.filter((p) => p.id !== id));
  };

  const handleStart = () => {
    if (!map) return;
    if (leads.length === 0) return;
    // Auto-pair supports to the first lead
    const firstLead = players.find((p) => p.class === 'lead');
    const input = players.map((p) => ({
      draftId: p.id,
      name: p.name,
      class: p.class,
      computersRanks: p.computersRanks,
      resolvePoints: p.resolvePoints,
      pairedLeadId: p.class === 'support' ? (p.pairedLeadId || firstLead?.id) : undefined,
    }));
    startGame(map, input);
    router.push(`/game/${map.id}`);
  };

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 32, 560);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.contentWrapper}>
      <Text style={styles.title}>Setup</Text>
      {map && <Text style={styles.mapLabel}>Map: {map.name}</Text>}

      {players.map((p, i) => (
        <View 
          key={p.id} 
          style={[styles.card, { width: cardWidth }]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            setCardHeights(prev => ({ ...prev, [p.id]: h }));
          }}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
             {cardHeights[p.id] && (
               <ChamferedFrame 
                 width={cardWidth} 
                 height={cardHeights[p.id]} 
                 chamfer={16}
                 stroke="#334155"
                 strokeWidth={2}
                 fill="#1e293b"
               />
             )}
          </View>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Player {i + 1}</Text>
            {players.length > 1 && (
              <Pressable onPress={() => removePlayer(p.id)}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={p.name}
            onChangeText={(name) => updatePlayer(p.id, { name })}
          />
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.label}>Class</Text>
              <View style={styles.row}>
                <Pressable
                  style={[styles.pill, p.class === 'lead' && styles.pillActive]}
                  onPress={() => updatePlayer(p.id, { class: 'lead' })}
                >
                  <Text style={styles.pillText}>Lead</Text>
                </Pressable>
                <Pressable
                  style={[styles.pill, p.class === 'support' && styles.pillActive]}
                  onPress={() => updatePlayer(p.id, { class: 'support' })}
                >
                  <Text style={styles.pillText}>Support</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.label}>Skill Modifier</Text>
              <View style={styles.row}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => updatePlayer(p.id, { computersRanks: Math.max(1, p.computersRanks - 1) })}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.value}>{p.computersRanks}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => updatePlayer(p.id, { computersRanks: Math.min(15, p.computersRanks + 1) })}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.label}>Resolve Points</Text>
              <View style={styles.row}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => updatePlayer(p.id, { resolvePoints: Math.max(0, p.resolvePoints - 1) })}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.value}>{p.resolvePoints}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => updatePlayer(p.id, { resolvePoints: Math.min(10, p.resolvePoints + 1) })}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <Text style={styles.hint}>
            CP: {12 + 2 * p.computersRanks} • All subskills at +{p.computersRanks}
          </Text>
          {p.class === 'support' && (
            <View>
              <Text style={[styles.label, { marginTop: 8 }]}>Paired Lead</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {leads.length === 0 && <Text style={{ color: '#94a3b8' }}>No leads available</Text>}
                {leads.map((lead) => (
                  <Pressable
                    key={lead.id}
                    onPress={() => updatePlayer(p.id, { pairedLeadId: lead.id })}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: p.pairedLeadId === lead.id ? '#22d3ee' : 'transparent',
                      backgroundColor: '#0f172a',
                    }}
                  >
                    <Text style={{ color: '#fff', fontFamily: 'Orbitron-Bold' }}>{lead.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}

      {players.length < 4 && (
        <View>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ChamferedFrame width={cardWidth} height={50} chamfer={8} stroke="#475569" fill="#1e293b" />
          </View>
          <Pressable style={[styles.addBtn, { height: 50 }]} onPress={addPlayer}>
            <Text style={styles.addBtnText}>+ Add Player</Text>
          </Pressable>
        </View>
      )}

      {leads.length === 0 && (
        <Text style={{ color: '#f87171', fontFamily: 'Orbitron-Bold', textAlign: 'center', marginTop: 8 }}>At least one Lead is required to start</Text>
      )}

      <View style={{ marginTop: 8, marginBottom: 24 }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ChamferedFrame 
            width={cardWidth} 
            height={60} 
            chamfer={10} 
            stroke="#22d3ee" 
            fill={(!map || leads.length === 0) ? "#1e293b" : "#0e7490"} 
          />
        </View>
        <Pressable 
          style={[styles.startBtn, { height: 60 }, (!map || leads.length === 0) && styles.startBtnDisabled]} 
          onPress={handleStart} 
          disabled={!map || leads.length === 0}
        >
          <Text style={styles.startBtnText}>Start Game</Text>
        </Pressable>
      </View>
    </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  contentContainer: { padding: 16, alignItems: 'stretch' },
  contentWrapper: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 12,
  },
  title: { fontSize: 24, fontFamily: 'Orbitron-Bold', color: '#22d3ee' },
  mapLabel: { fontSize: 13, fontFamily: 'Orbitron', color: '#94a3b8', marginBottom: 8 },
  card: {
    padding: 20,
    backgroundColor: 'transparent',
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, color: '#f1f5f9', fontFamily: 'Orbitron-Bold' },
  remove: { color: '#f87171', fontSize: 12, fontFamily: 'Orbitron-Bold' },
  label: { fontSize: 11, color: '#64748b', fontFamily: 'Orbitron-Bold', textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1e293b',
    color: '#f1f5f9',
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 14,
    fontFamily: 'Orbitron',
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  col: { flex: 1, gap: 6 },
  statCol: { flex: 1, minWidth: 140, gap: 6 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  pillActive: { borderColor: '#22d3ee', backgroundColor: '#0e7490' },
  pillText: { fontSize: 12, color: '#f1f5f9', fontFamily: 'Orbitron-Bold' },
  stepBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepBtnText: { fontSize: 16, color: '#22d3ee', fontFamily: 'Orbitron-Bold' },
  value: { color: '#f1f5f9', fontSize: 14, fontFamily: 'Orbitron-Bold', minWidth: 24, textAlign: 'center' },
  hint: { fontSize: 11, color: '#475569', marginTop: 4, fontFamily: 'Orbitron' },
  addBtn: {
    height: 44,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#22d3ee', fontFamily: 'Orbitron-Bold', fontSize: 13 },
  startBtn: {
    height: 54,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { color: '#fff', fontFamily: 'Orbitron-Bold', fontSize: 16 },
});
