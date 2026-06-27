/**
 * NodePalette — floating tool palette for Build mode.
 * Lets the user pick a node type and tap the canvas to place.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NodeCategory } from '@/lib/flow/types';

interface Props {
  onPick: (category: NodeCategory) => void;
  active: NodeCategory | null;
}

export function NodePalette({ onPick, active }: Props) {
  const items: { category: NodeCategory; label: string; icon: string; color: string }[] = [
    { category: 'module', label: 'Module', icon: '📦', color: '#1e3a8a' },
    { category: 'countermeasure', label: 'Firewall', icon: '🛡', color: '#7f1d1d' },
    { category: 'gateway', label: 'Gateway', icon: '🔀', color: '#374151' },
  ];
  return (
    <View style={styles.palette}>
      <Text style={styles.title}>Add Node</Text>
      {items.map((it) => (
        <Pressable
          key={it.category}
          style={[
            styles.item,
            { backgroundColor: it.color, borderColor: active === it.category ? '#22d3ee' : '#1e293b' },
          ]}
          onPress={() => onPick(it.category)}
        >
          <Text style={styles.icon}>{it.icon}</Text>
          <Text style={styles.label}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  palette: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(15,23,42,0.95)',
    padding: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  title: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 2,
  },
  icon: { fontSize: 16 },
  label: { fontSize: 12, color: '#f1f5f9', fontWeight: '700' },
});