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

const RANDOM_NAMES = [
  'Case', 'Molly', 'Armitage', 'Riviera', 'Hideo', 'Wintermute', 'Neuromancer',
  'Deckard', 'Rachel', 'Gaff', 'Sebastian', 'Trinity', 'Neo', 'Morpheus',
  'Oracle', 'Cipher', 'Switch', 'Apoc', 'Mouse', 'Tank', 'Dozer', 'Murphy',
  'Lewis', 'Robo', 'Motoko', 'Batou', 'Ishikawa', 'Saito', 'Pazu', 'Borma',
  'Tachikoma', 'Seven', 'V', 'Johnny', 'Jackie', 'T-Bug', 'Dex', 'Evelyn',
  'Judy', 'Panam', 'River', 'Kerry', 'Alt', 'Rogue', 'Saburo', 'Hanako', 'Yorinobu',
  'Asha', 'Blue-17', 'Emene-3', 'Flick', 'Garro', 'Melody', 'Naga', 'Olas', 'Stringer', 'Twenty', 'Yose', 'Chiskisk', 'Kishara', 'Kuriya', 'Zao', 'Domash', 'Hesori', 'Kima', 'Kopalo', 'Maenala', 'Nomae', 'Oraeus', 'Shess', 'Soryn', 'Taeon', 'Varikuara', 'Coot', 'Drithik', 'Hivonyx', 'Keskodai', 'Remora', 'Tarsith',  'Darisk', 'Gorlai', 'Radenka', 'Shobquor', 'Bena', 'Coponisa', 'Cors', 'Goba', 'Ketch', 'Kib', 'Lolo', 'Niknik', 'Quig', 'Resk', 'Sim', 'Twik', 'Raia', 'Obozaya', 'Navasi', 'Altronus', 'Dolgrin', 'Grunyar', 'Harsk', 'Kazmuk', 'Morgrym', 'Agna', 'Bodill', 'Ingra', 'Kotri', 'Rusalka', 'Caladrel', 'Helas', 'Lariel', 'Myon', 'Rion', 'Saelhn', 'Seltyiel', 'Aerel', 'Amari', 'Kyra', 'Merisiel', 'Aball', 'Bim', 'Fibb', 'Hook', 'Jiggle', 'Fizzle', 'Pippen', 'Whirley', 'Calrel', 'Elenia', 'Lari', 'Myros', 'Riona', 'Sael', 'Dench', 'Krayst', 'Shump', 'Thokk', 'Toof', 'Ghorza', 'Muruk', 'Volen', 'Almar', 'Corrin', 'Dale', 'Eldon', 'Link', 'Milo', 'Pip', 'Roscoe', 'Tobin', 'Wendy',
  'Pixi Sprocket', 'BeeBopp', 'Gregophory', 'Eberhart', 'Zenbot', 'Reverand Ace O\'Trades', 'Patsy Brine', 'The Eaten One', 'CAD', 'Jiit-Jiit', 'Kathshana', 'Irma Silverhand', 'Namfoodle', 
];

function getRandomName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

interface DraftPlayer {
  id: string;
  name: string;
  class: 'lead' | 'support';
  computersRanks: number;
  /** Global total modifier for the base Computers skill. */
  computersModifier: number;
  resolvePoints: number;
  deceiveModifier: number;
  hackModifier: number;
  processModifier: number;
  /** Net bonus points across styles. Determined by ranks/3. */
  personaModifier: number;
  personaModifierLimit: number;
  /** Support only: which Lead this Support is paired with for Aid. */
  pairedLeadId?: string;
}

export default function SetupScreen() {
  const { mapId, hackingMode: modeParam } = useLocalSearchParams<{ mapId: string, hackingMode?: 'basic' | 'dynamic' }>();
  const hackingMode = modeParam || 'dynamic';
  const router = useRouter();
  const startGame = useGameStore((s) => s.startGame);

  const [map, setMap] = useState<FlowMap | null>(null);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [players, setPlayers] = useState<DraftPlayer[]>(() => {
    const leadId = nanoid(6);
    const supportId = nanoid(6);
    const name1 = getRandomName();
    let name2 = getRandomName();
    while (name2 === name1) name2 = getRandomName();
    return [
      { id: leadId, name: name1, class: 'lead', computersRanks: 1, computersModifier: 5, resolvePoints: 3, deceiveModifier: 5, hackModifier: 5, processModifier: 5, personaModifier: 0, personaModifierLimit: 0 },
      { id: supportId, name: name2, class: 'support', computersRanks: 0, computersModifier: 2, resolvePoints: 3, deceiveModifier: 2, hackModifier: 2, processModifier: 2, personaModifier: 0, personaModifierLimit: 0, pairedLeadId: leadId },
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

      // Apply patch and enforce all constraints
      let tentative = ps.map((p) => {
        if (p.id !== id) return p;
        let updated = { ...p, ...patch };

        // 1. Total Mod change syncs sub-modifiers
        if (patch.computersModifier !== undefined) {
          updated.hackModifier = patch.computersModifier;
          updated.deceiveModifier = patch.computersModifier;
          updated.processModifier = patch.computersModifier;
        }

        // 2. Ranks purely determines the Persona limit
        updated.personaModifierLimit = Math.floor(updated.computersRanks / 3);

        // 3. Enforce the +/- 3 absolute bounds relative to Total Mod
        const minVal = updated.computersModifier - 3;
        const maxVal = updated.computersModifier + 3;
        updated.hackModifier = Math.max(0, Math.min(updated.hackModifier, maxVal, Math.max(updated.hackModifier, minVal)));
        updated.deceiveModifier = Math.max(0, Math.min(updated.deceiveModifier, maxVal, Math.max(updated.deceiveModifier, minVal)));
        updated.processModifier = Math.max(0, Math.min(updated.processModifier, maxVal, Math.max(updated.processModifier, minVal)));

        // 4. Enforce Persona Modifier Limit (sum of net added/subtracted points)
        const getPersonaSum = (u: DraftPlayer) => 
          (u.hackModifier - u.computersModifier) +
          (u.deceiveModifier - u.computersModifier) +
          (u.processModifier - u.computersModifier);

        let sum = getPersonaSum(updated);
        if (sum > updated.personaModifierLimit) {
          // If we exceeded the limit, revert the specific skill being changed or reset
          if (patch.hackModifier !== undefined) {
            updated.hackModifier -= (sum - updated.personaModifierLimit);
          } else if (patch.deceiveModifier !== undefined) {
            updated.deceiveModifier -= (sum - updated.personaModifierLimit);
          } else if (patch.processModifier !== undefined) {
            updated.processModifier -= (sum - updated.personaModifierLimit);
          } else {
            // If it was caused by rank or total mod change, reset styles to match total
            updated.hackModifier = updated.computersModifier;
            updated.deceiveModifier = updated.computersModifier;
            updated.processModifier = updated.computersModifier;
          }
        }
        
        updated.personaModifier = getPersonaSum(updated);
        return updated;
      });

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
      { 
        id: nanoid(6), 
        name: getRandomName(), 
        class: 'lead', 
        computersRanks: 1, 
        computersModifier: 5, 
        resolvePoints: 3, 
        deceiveModifier: 5, 
        hackModifier: 5, 
        processModifier: 5,
        personaModifier: 0,
        personaModifierLimit: 0
      },
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
      deceiveModifier: p.deceiveModifier,
      hackModifier: p.hackModifier,
      processModifier: p.processModifier,
      computersModifier: p.computersModifier,
      personaModifier: p.personaModifier,
      personaModifierLimit: p.personaModifierLimit,
      pairedLeadId: p.class === 'support' ? (p.pairedLeadId || firstLead?.id) : undefined,
    }));
    startGame(map, input, hackingMode);
    router.push(`/game/${map.id}`);
  };

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 32, 560);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.contentWrapper}>
      <View style={styles.headerRow}>
        <Pressable 
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.7 }
          ]} 
          onPress={() => router.push('/')}
        >
          <Text style={styles.backBtnText}>← MAPS</Text>
        </Pressable>
        <Text style={styles.title}>Setup</Text>
      </View>
      {map && <Text style={styles.mapLabel}>Map: {map.name}</Text>}

      {players.map((p, i) => {
        const pointsUsed = 
          Math.max(0, p.hackModifier - p.computersModifier) +
          Math.max(0, p.deceiveModifier - p.computersModifier) +
          Math.max(0, p.processModifier - p.computersModifier);
        const bonusFromReductions = 
          Math.max(0, p.computersModifier - p.hackModifier) +
          Math.max(0, p.computersModifier - p.deceiveModifier) +
          Math.max(0, p.computersModifier - p.processModifier);
        const totalBudget = p.personaModifierLimit + bonusFromReductions;

        return (
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
          <View style={styles.nameRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              value={p.name}
              onChangeText={(name) => updatePlayer(p.id, { name })}
            />
            <Pressable
              style={styles.randomBtn}
              onPress={() => updatePlayer(p.id, { name: getRandomName() })}
            >
              <Text style={styles.randomBtnText}>🎲</Text>
            </Pressable>
          </View>
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
            <View style={styles.statCol}>
              <Text style={styles.label}>Max CP</Text>
              <View style={[styles.row, { height: 32 }]}>
                <Text style={[styles.value, { color: '#22d3ee' }]}>{12 + 2 * p.computersRanks}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.statsRow, { marginTop: 8 }]}>
            <View style={styles.statCol}>
              <Text style={styles.label}>Skill Ranks</Text>
              <View style={styles.row}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => updatePlayer(p.id, { computersRanks: Math.max(0, p.computersRanks - 1) })}
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
              <Text style={styles.label}>Total Mod</Text>
              <View style={styles.row}>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => updatePlayer(p.id, { computersModifier: Math.max(0, p.computersModifier - 1) })}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.value}>{p.computersModifier}</Text>
                <Pressable
                  style={styles.stepBtn}
                  onPress={() => updatePlayer(p.id, { computersModifier: Math.min(25, p.computersModifier + 1) })}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
            {hackingMode === 'dynamic' && (
              <View style={styles.statCol}>
                <Text style={styles.label}>Persona Mod</Text>
                <View style={[styles.row, { height: 32 }]}>
                  <Text style={[styles.value, { color: pointsUsed > totalBudget ? '#f43f5e' : '#a855f7' }]}>
                    {pointsUsed} / {totalBudget}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {hackingMode === 'dynamic' && (
            <View style={[styles.statsRow, { marginTop: 8 }]}>
              <View style={styles.statCol}>
                <Text style={styles.label}>Hack Mod</Text>
                <View style={styles.row}>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => updatePlayer(p.id, { hackModifier: Math.max(p.computersModifier - 3, p.hackModifier - 1) })}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.value}>{p.hackModifier}</Text>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => updatePlayer(p.id, { hackModifier: Math.min(p.computersModifier + 3, p.hackModifier + 1) })}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.label}>Deceive Mod</Text>
                <View style={styles.row}>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => updatePlayer(p.id, { deceiveModifier: Math.max(p.computersModifier - 3, p.deceiveModifier - 1) })}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.value}>{p.deceiveModifier}</Text>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => updatePlayer(p.id, { deceiveModifier: Math.min(p.computersModifier + 3, p.deceiveModifier + 1) })}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.statCol}>
                <Text style={styles.label}>Process Mod</Text>
                <View style={styles.row}>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => updatePlayer(p.id, { processModifier: Math.max(p.computersModifier - 3, p.processModifier - 1) })}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.value}>{p.processModifier}</Text>
                  <Pressable
                    style={styles.stepBtn}
                    onPress={() => updatePlayer(p.id, { processModifier: Math.min(p.computersModifier + 3, p.processModifier + 1) })}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {hackingMode === 'dynamic' && (
            <Text style={styles.hint}>
              Updating Total Mod sets all sub-modifiers
            </Text>
          )}
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
      );
    })}

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
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 16,
    marginBottom: 4,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  backBtnText: {
    color: '#94a3b8',
    fontFamily: 'Orbitron-Bold',
    fontSize: 12,
  },
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
  nameRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  randomBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  randomBtnText: { fontSize: 16 },
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
  statCol: { flex: 1, minWidth: 110, gap: 6 },
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
  startBtnDisabled: {
    opacity: 0.5,
  },
  startBtnText: { color: '#fff', fontFamily: 'Orbitron-Bold', fontSize: 16 },
});
