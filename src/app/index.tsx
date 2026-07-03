import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useMapStore } from '@/stores/mapStore';
import { SAMPLE_MAPS } from '../sample-maps';
import { saveAllMaps } from '@/lib/flow/persistence';

export default function HomeScreen() {
  const { allMaps, refreshAll, loading } = useMapStore();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await refreshAll();
      // Seed bundled maps if storage is empty.
      const stored = await (await import('@/lib/flow/persistence')).loadAllMaps();
      const merged = stored.map((m) => {
        const bundled = SAMPLE_MAPS.find((sm) => sm.id === m.id);
        const looksBuiltIn = m.builtIn !== false;
        if (bundled && looksBuiltIn && m.updatedAt < bundled.updatedAt) {
          return bundled;
        }
        return m;
      });
      const missing = SAMPLE_MAPS.filter((sm) => !merged.some((m) => m.id === sm.id));
      if (missing.length > 0 || merged.length !== stored.length) {
        await saveAllMaps([...merged, ...missing]);
        await refreshAll();
      }
    })();
  }, [refreshAll]);

  const handlePlaySample = (mapId: string) => {
    router.push(`/setup?mapId=${mapId}`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.contentWrapper}>
      <Text style={styles.title}>Data Heist</Text>
      <Text style={styles.subtitle}>Pass-and-play hacking with flowcharts</Text>

      <View style={styles.buttonRow}>
        <Link href="/build" asChild>
          <Pressable style={StyleSheet.flatten([styles.bigButton, styles.buildButton])}>
            <Text style={styles.bigButtonText}>🛠 Build Map</Text>
            <Text style={styles.bigButtonSub}>Design a new network</Text>
          </Pressable>
        </Link>
      </View>

      <Text style={styles.sectionHeader}>Sample Maps</Text>
      {SAMPLE_MAPS.map((m) => (
        <Pressable
          key={m.id}
          style={styles.mapCard}
          onPress={() => handlePlaySample(m.id)}
        >
          <Text style={styles.mapName}>{m.name}</Text>
          <Text style={styles.mapDesc}>{m.description}</Text>
          <Text style={styles.mapMeta}>
            {m.nodes.length} nodes • {m.edges.length} edges
          </Text>
        </Pressable>
      ))}

      {allMaps.filter((m) => !m.builtIn).length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Your Maps</Text>
          {allMaps
            .filter((m) => !m.builtIn)
            .map((m) => (
              <Pressable
                key={m.id}
                style={styles.mapCard}
                onPress={() => handlePlaySample(m.id)}
              >
                <Text style={styles.mapName}>{m.name}</Text>
                <Pressable
                  style={styles.editBtn}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/build/${m.id}`);
                  }}
                >
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              </Pressable>
            ))}
        </>
      )}

      {loading && <ActivityIndicator color="#22d3ee" style={{ marginTop: 24 }} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  content: { padding: 24, alignItems: 'stretch' },
  contentWrapper: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 12,
  },
  title: { fontSize: 36, fontFamily: 'Orbitron-Black', color: '#22d3ee', marginTop: 16 },
  subtitle: { fontSize: 14, fontFamily: 'Orbitron', color: '#94a3b8', marginBottom: 16 },
  buttonRow: { marginVertical: 8 },
  bigButton: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  buildButton: {
    backgroundColor: '#0e7490',
    borderColor: '#22d3ee',
  },
  bigButtonText: { fontSize: 20, fontFamily: 'Orbitron-Bold', color: '#fff' },
  bigButtonSub: { fontSize: 12, fontFamily: 'Orbitron', color: '#cffafe', marginTop: 4 },
  sectionHeader: {
    fontSize: 14,
    fontFamily: 'Orbitron-Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 4,
    letterSpacing: 1,
  },
  mapCard: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  mapName: { fontSize: 16, fontFamily: 'Orbitron-Bold', color: '#f1f5f9' },
  mapDesc: { fontSize: 12, fontFamily: 'Orbitron', color: '#94a3b8', marginTop: 4 },
  mapMeta: { fontSize: 10, fontFamily: 'Orbitron', color: '#475569', marginTop: 4 },
  editBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1e293b',
  },
  editBtnText: { fontSize: 11, color: '#22d3ee', fontWeight: '700' },
});