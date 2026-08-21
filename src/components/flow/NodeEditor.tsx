/**
 * NodeEditor — bottom-sheet editor for the currently selected node in Build mode.
 */

import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { CountermeasureType, FlowNode, NodeCategory } from '@/lib/flow/types';
import { ChamferedFrame } from '../ui/ChamferedFrame';

interface Props {
  node: FlowNode | null;
  onUpdate: (patch: Partial<FlowNode>) => void;
  onDelete: () => void;
  onClose: () => void;
  availableNodes?: FlowNode[];
  targetNodeIds?: Set<string>;
  onToggleTarget?: (nodeId: string) => void;
}

export function NodeEditor({ node, onUpdate, onDelete, onClose, availableNodes = [], targetNodeIds = new Set(), onToggleTarget }: Props) {
  if (!node) return null;
  const countermeasureTypes: { value: CountermeasureType; label: string }[] = [
    { value: 'wipe', label: 'Wipe' },
    { value: 'feedback', label: 'Feedback' },
    { value: 'fake-shell', label: 'Fake Shell' },
    { value: 'alarm', label: 'Alarm' },
    { value: 'lockout', label: 'Lockout' },
    { value: 'shock-grid', label: 'Shock Grid' },
    { value: 'firewall', label: 'Firewall' },
  ];
  return (
    <View style={styles.editor}>
      <View style={{ ...StyleSheet.absoluteFill, top: -1, pointerEvents: 'none' }}>
          <ChamferedFrame width={1200} height={300} chamfer={20} stroke="#22d3ee" fill="#0f172a" strokeWidth={2} />
       </View>
      <View style={styles.header}>
        <Text style={styles.title}>Edit Node</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={node.name}
          onChangeText={(name) => onUpdate({ name })}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.row}>
          {(['module', 'countermeasure', 'access'] as NodeCategory[]).map((c) => (
            <Pressable
              key={c}
              style={[styles.pill, node.category === c && styles.pillActive]}
              onPress={() => onUpdate({ category: c })}
            >
              <Text style={styles.pillText}>{c}</Text>
            </Pressable>
          ))}
        </View>

        {node.category === 'countermeasure' ? (
          <>
            <Text style={styles.label}>Countermeasure</Text>
            <View style={styles.row}>
              {countermeasureTypes.map((type) => (
                <Pressable
                  key={type.value}
                  style={[styles.pill, node.countermeasureType === type.value && styles.pillActive]}
                  onPress={() => onUpdate({ countermeasureType: type.value })}
                >
                  <Text style={styles.pillText}>{type.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Targets</Text>
            <View style={styles.connectionList}>
              {availableNodes.filter((candidate) => candidate.id !== node.id).map((candidate) => {
                const targeted = targetNodeIds.has(candidate.id);
                return (
                  <Pressable
                    key={candidate.id}
                    style={[styles.connectionPill, targeted && styles.connectionPillActive]}
                    onPress={() => onToggleTarget?.(candidate.id)}
                  >
                    <Text style={styles.pillText}>{targeted ? '✓ ' : ''}{candidate.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {node.category !== 'module' ? (
          <>
            <Text style={styles.label}>Custom DC Override</Text>
            <TextInput
              style={styles.input}
              value={node.resolve?.dcOverride?.toString() ?? ''}
              placeholder="Default: map tier"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              onChangeText={(value) => {
                const currentResolve = node.resolve ?? { subskill: 'hack' as const, successesRequired: 1 };
                const dcOverride = value.trim() === '' ? undefined : Number(value);
                onUpdate({
                  resolve: {
                    ...currentResolve,
                    dcOverride: Number.isFinite(dcOverride) ? dcOverride : undefined,
                  },
                });
              }}
            />
          </>
        ) : null}

        <Pressable
          style={[styles.toggle, node.hazard && styles.toggleActive]}
          onPress={() => onUpdate({ hazard: !node.hazard })}
        >
          <Text style={styles.toggleText}>Hazard (skippable on beat-by-10+)</Text>
        </Pressable>

        <Pressable
          style={[styles.toggle, node.isRootAccess && styles.toggleActive]}
          onPress={() => onUpdate({ isRootAccess: !node.isRootAccess })}
        >
          <Text style={styles.toggleText}>★ Root Access (win condition)</Text>
        </Pressable>

        <Pressable style={styles.deleteBtn} onPress={onDelete}>
          <Text style={styles.deleteBtnText}>Delete Node</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: 280,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#22d3ee', fontFamily: 'Orbitron-Bold' },
  close: { fontSize: 22, color: '#94a3b8', padding: 4 },
  body: { marginTop: 8 },
  label: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginTop: 8, letterSpacing: 1, fontFamily: 'Orbitron' },
  input: {
    backgroundColor: '#1e293b',
    color: '#f1f5f9',
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    fontSize: 14,
    fontFamily: 'Orbitron',
    marginTop: 4,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  connectionList: { gap: 6, marginTop: 4 },
  connectionPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  connectionPillActive: { borderColor: '#22d3ee', backgroundColor: '#0e7490' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  pillActive: { borderColor: '#22d3ee', backgroundColor: '#0e7490' },
  pillText: { fontSize: 12, color: '#f1f5f9', fontFamily: 'Orbitron' },
  stepBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepBtnText: { fontSize: 18, color: '#22d3ee', fontFamily: 'Orbitron-Bold' },
  tierValue: { fontSize: 14, color: '#f1f5f9', fontFamily: 'Orbitron-Bold' },
  toggle: {
    padding: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    marginTop: 8,
  },
  toggleActive: { borderColor: '#22d3ee', backgroundColor: '#0e7490' },
  toggleText: { color: '#f1f5f9', fontFamily: 'Orbitron-Bold', fontSize: 13 },
  deleteBtn: {
    padding: 12,
    backgroundColor: '#7f1d1d',
    marginTop: 12,
    marginBottom: 24,
  },
  deleteBtnText: { color: '#fff', fontFamily: 'Orbitron-Bold', textAlign: 'center' },
});