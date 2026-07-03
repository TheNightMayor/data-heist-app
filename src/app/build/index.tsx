import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useMapStore } from '@/stores/mapStore';

export default function BuildIndexScreen() {
  const { allMaps, refreshAll, createMap } = useMapStore();
  const router = useRouter();

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
        <Pressable style={styles.newBtn} onPress={handleNew}>
          <Text style={styles.newBtnText}>+ New Map</Text>
        </Pressable>
      </View>
      <FlatList
        data={allMaps}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/build/${item.id}`)}
          >
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
    backgroundColor: '#0e7490',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  newBtnText: { color: '#fff', fontFamily: 'Orbitron-Bold', fontSize: 13 },
  row: {
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  rowName: { fontSize: 15, color: '#f1f5f9', fontFamily: 'Orbitron-Bold' },
  rowMeta: { fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'Orbitron' },
  empty: { color: '#475569', fontSize: 14, textAlign: 'center', marginTop: 32, fontFamily: 'Orbitron' },
});