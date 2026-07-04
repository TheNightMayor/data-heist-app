import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useMapStore } from '@/stores/mapStore';
import { SAMPLE_MAPS } from '../sample-maps';
import { saveAllMaps } from '@/lib/flow/persistence';
import { ChamferedFrame } from '@/components/ui/ChamferedFrame';

export default function HomeScreen() {
  const { allMaps, refreshAll, loading } = useMapStore();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 48, 592);

  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

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
        <View 
          style={StyleSheet.flatten([styles.bigButton, styles.bigButtonDisabled, { width: cardWidth }])}
          onLayout={(e) => setCardHeights(prev => ({ ...prev, 'build': e.nativeEvent.layout.height }))}
          // @ts-ignore - 'title' is valid on web for hover tooltips
          title="Coming soon!"
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {cardHeights['build'] && (
              <ChamferedFrame 
                width={cardWidth} 
                height={cardHeights['build']} 
                chamfer={16} 
                stroke="#475569" 
                strokeWidth={2}
                fill="#1e293b" 
              />
            )}
          </View>
          <Text style={[styles.bigButtonText, { color: '#64748b' }]}>🛠 Build Map</Text>
          <Text style={[styles.bigButtonSub, { color: '#475569' }]}>Design a new network</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>Sample Maps</Text>
      {SAMPLE_MAPS.map((m) => (
        <Pressable
          key={m.id}
          style={[styles.mapCard, { width: cardWidth }]}
          onPress={() => handlePlaySample(m.id)}
          onLayout={(e) => setCardHeights(prev => ({ ...prev, [m.id]: e.nativeEvent.layout.height }))}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {cardHeights[m.id] && (
              <ChamferedFrame 
                width={cardWidth} 
                height={cardHeights[m.id]} 
                chamfer={16} 
                stroke="#1e293b" 
                strokeWidth={2}
                fill="#0f172a" 
              />
            )}
          </View>
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
                style={[styles.mapCard, { width: cardWidth }]}
                onPress={() => handlePlaySample(m.id)}
                onLayout={(e) => setCardHeights(prev => ({ ...prev, [m.id]: e.nativeEvent.layout.height }))}
              >
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {cardHeights[m.id] && (
                    <ChamferedFrame 
                      width={cardWidth} 
                      height={cardHeights[m.id]} 
                      chamfer={16} 
                      stroke="#1e293b" 
                      strokeWidth={2}
                      fill="#0f172a" 
                    />
                  )}
                </View>
                <Text style={styles.mapName}>{m.name}</Text>
                <Pressable
                  style={styles.editBtn}
                  onLayout={(e) => setCardHeights(prev => ({ ...prev, [m.id + '_edit']: e.nativeEvent.layout.height }))}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/build/${m.id}`);
                  }}
                >
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <ChamferedFrame 
                      width={60} 
                      height={24} 
                      chamfer={4} 
                      stroke="#22d3ee" 
                      fill="#1e293b" 
                    />
                  </View>
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
    alignItems: 'center',
  },
  bigButtonDisabled: {
    opacity: 0.8,
  },
  buildButton: {
    // Removed old background values as ChamferedFrame handles them
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
    padding: 16,
    marginBottom: 8,
  },
  mapName: { fontSize: 16, fontFamily: 'Orbitron-Bold', color: '#f1f5f9' },
  mapDesc: { fontSize: 12, fontFamily: 'Orbitron', color: '#94a3b8', marginTop: 4 },
  mapMeta: { fontSize: 10, fontFamily: 'Orbitron', color: '#475569', marginTop: 4 },
  editBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 60,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: { fontSize: 11, color: '#22d3ee', fontFamily: 'Orbitron-Bold' },
});