/**
 * NodeEditor — bottom-sheet editor for the currently selected node in Build mode.
 */

import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { FlowNode, NodeCategory } from '@/lib/flow/types';

interface Props {
  node: FlowNode | null;
  onUpdate: (patch: Partial<FlowNode>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeEditor({ node, onUpdate, onDelete, onClose }: Props) {
  if (!node) return null;
  return (
    <View style={styles.editor}>
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
          {(['module', 'countermeasure', 'gateway'] as NodeCategory[]).map((c) => (
            <Pressable
              key={c}
              style={[styles.pill, node.category === c && styles.pillActive]}
              onPress={() => onUpdate({ category: c })}
            >
              <Text style={styles.pillText}>{c}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Tier (1–10) → DC</Text>
        <View style={styles.row}>
          <Pressable style={styles.stepBtn} onPress={() => onUpdate({ tier: Math.max(1, node.tier - 1) })}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <Text style={styles.tierValue}>{node.tier} (DC {13 + 4 * node.tier})</Text>
          <Pressable style={styles.stepBtn} onPress={() => onUpdate({ tier: Math.min(10, node.tier + 1) })}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.toggle, node.hazard && styles.toggleActive]}
          onPress={() => onUpdate({ hazard: !node.hazard })}
        >
          <Text style={styles.toggleText}>⚠ Hazard (skippable on beat-by-10+)</Text>
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
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderColor: '#22d3ee',
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: 280,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#22d3ee' },
  close: { fontSize: 22, color: '#94a3b8', padding: 4 },
  body: { marginTop: 8 },
  label: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginTop: 8, letterSpacing: 1 },
  input: {
    backgroundColor: '#1e293b',
    color: '#f1f5f9',
    padding: 10,
    borderRadius: 6,
    fontSize: 14,
    marginTop: 4,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  pillActive: { borderColor: '#22d3ee', backgroundColor: '#0e7490' },
  pillText: { fontSize: 12, color: '#f1f5f9' },
  stepBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  stepBtnText: { fontSize: 18, color: '#22d3ee', fontWeight: '700' },
  tierValue: { fontSize: 14, color: '#f1f5f9', fontWeight: '700' },
  toggle: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    marginTop: 8,
  },
  toggleActive: { borderColor: '#22d3ee', backgroundColor: '#0e7490' },
  toggleText: { color: '#f1f5f9', fontWeight: '700', fontSize: 13 },
  deleteBtn: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#7f1d1d',
    marginTop: 12,
    marginBottom: 24,
  },
  deleteBtnText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});