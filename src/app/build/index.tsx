import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useMapStore } from '@/stores/mapStore';
import { ChamferedFrame } from '@/components/ui/ChamferedFrame';

export default function BuildIndexScreen() {
  const { allMaps, refreshAll, createMap } = useMapStore();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 24, 600);
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleNew = () => {
    const m = createMap('New Network');
    router.push(`/build/${m.id}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Maps</Text>
        <View style={{ width: 100, height: 36 }}>
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            <ChamferedFrame width={100} height={36} chamfer={6} stroke="#22d3ee" fill="#0e7490" />
          </View>
          <Pressable style={styles.newBtn} onPress={handleNew}>
            <Text style={styles.newBtnText}>+ New Map</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={allMaps}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, { width: cardWidth }]}
            onPress={() => router.push(`/build/${item.id}`)}
            onLayout={(e) => setRowHeights(prev => ({ ...prev, [item.id]: e.nativeEvent.layout.height }))}
          >
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              {rowHeights[item.id] && (
                <ChamferedFrame 
                  width={cardWidth} 
                  height={rowHeights[item.id]} 
                  chamfer={10} 
                  stroke="#1e293b" 
                  fill="#0f172a" 
                />
              )}
            </View>
            <View>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>
                {item.nodes.length} nodes • {item.edges.length} edges
                {item.builtIn ? ' • Sample' : ''}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No maps yet. Tap "New Map" to start.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  title: { fontSize: 20, fontFamily: 'Orbitron-Bold', color: '#22d3ee' },
  newBtn: {
    paddingHorizontal: 10,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBtnText: { color: '#fff', fontFamily: 'Orbitron-Bold', fontSize: 11 },
  row: {
    padding: 14,
  },
  rowName: { fontSize: 15, color: '#f1f5f9', fontFamily: 'Orbitron-Bold' },
  rowMeta: { fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'Orbitron' },
  empty: { color: '#475569', fontSize: 14, textAlign: 'center', marginTop: 32, fontFamily: 'Orbitron' },
});