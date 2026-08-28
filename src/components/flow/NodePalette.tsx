/**
 * NodePalette — floating tool palette for Build mode.
 * Lets the user pick a node type and tap the canvas to place.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NodeCategory } from '@/lib/flow/types';
import { ACCESS_NODE_CATEGORY, COUNTERMEASURE_NODE_CATEGORY, MODULE_NODE_CATEGORY } from '@/lib/flow/nodes';
import { ChamferedFrame } from '../ui/ChamferedFrame';

interface Props {
  onPick: (category: NodeCategory) => void;
  active: NodeCategory | null;
}

export function NodePalette({ onPick, active }: Props) {
  const items: { category: NodeCategory; label: string; icon: string; color: string }[] = [
    { category: MODULE_NODE_CATEGORY, label: 'Module', icon: 'M', color: '#1e3a8a' },
    { category: COUNTERMEASURE_NODE_CATEGORY, label: 'Firewall', icon: 'C', color: '#7f1d1d' },
    { category: ACCESS_NODE_CATEGORY, label: 'Access', icon: 'A', color: '#1e3a8a' },
  ];
  return (
    <View style={styles.palette}>
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
          <ChamferedFrame width={110} height={145} chamfer={8} stroke="#1e293b" fill="rgba(15,23,42,0.95)" />
      </View>
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
    width: 110,
    height: 180,
    padding: 8,
    gap: 6,
  },
  title: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderRadius: 0,
  },
  icon: { fontSize: 16 },
  label: { fontSize: 12, color: '#f1f5f9', fontWeight: '700' },
});