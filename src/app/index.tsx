import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Animated } from 'react-native';
import { Link, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useMapStore } from '@/stores/mapStore';
import { SAMPLE_MAPS } from '../sample-maps';
import { saveAllMaps } from '@/lib/flow/persistence';
import { ChamferedFrame } from '@/components/ui/ChamferedFrame';
import { ScreenBackdrop } from '@/components/ui/ScreenBackdrop';

function CharacterChevron() {
  return (
    <Svg width={14} height={12} viewBox="0 0 14 12" aria-hidden>
      <Path d="M1 1 L5 6 L1 11 M7 1 L11 6 L7 11" fill="none" stroke="#cffafe" strokeWidth={1.5} strokeLinecap="square" />
    </Svg>
  );
}

function ModeSegmentHighlight({ width, side }: { width: number; side: 'left' | 'right' }) {
  const chamfer = 6;
  const path = side === 'left'
    ? `M ${chamfer},0 H ${width} V 30 H ${chamfer} L 0,${30 - chamfer} V ${chamfer} Z`
    : `M 0,0 H ${width - chamfer} L ${width},${chamfer} V ${30 - chamfer} L ${width - chamfer},30 H 0 Z`;

  return (
    <View style={[styles.modeSegmentHighlight, side === 'left' ? { left: 0 } : { right: 0 }, { pointerEvents: 'none' }]}>
      <Svg width={width} height={30} viewBox={`0 0 ${width} 30`}>
        <Path d={path} fill="#0e7490" />
      </Svg>
    </View>
  );
}

function AnimatedSelectionShell({
  active,
  height,
  width,
  onLayout,
  children,
}: {
  active: boolean;
  height: number;
  width?: number;
  onLayout: (event: any) => void;
  children: ReactNode;
}) {
  const slide = useRef(new Animated.Value(active ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: active ? 0 : 1,
      duration: 240,
      useNativeDriver: false,
    }).start();
  }, [active, slide]);

  const slideDistance = (width ?? 120) + 16;
  return (
    <View style={[styles.selectionShell, { height }]} onLayout={onLayout}>
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, slideDistance] }) }],
        }}
      >
        {active ? children : null}
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const { allMaps, refreshAll, loading } = useMapStore();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 56, 592);

  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [mapChoiceHeight, setMapChoiceHeight] = useState<number | null>(null);
  const [measuredMapIds, setMeasuredMapIds] = useState<Set<string>>(new Set());
  const [selectionPanelWidths, setSelectionPanelWidths] = useState<Record<string, number>>({});
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const totalMapChoices = SAMPLE_MAPS.length + allMaps.filter((m) => !m.builtIn).length;
  const commonMapHeight = measuredMapIds.size >= totalMapChoices ? mapChoiceHeight : null;

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

  const handlePlaySample = (mapId: string, mode: 'basic' | 'dynamic' = 'dynamic') => {
    router.push(`/setup?mapId=${mapId}&hackingMode=${mode}`);
  };

  const selectMap = (mapId: string) => {
    setSelectedMapId((current) => current === mapId ? null : mapId);
  };

  const [hackingModes, setHackingModes] = useState<Record<string, 'basic' | 'dynamic'>>({});

  const toggleMode = (mapId: string) => {
    setHackingModes(prev => ({
      ...prev,
      [mapId]: prev[mapId] === 'basic' ? 'dynamic' : 'basic'
    }));
  };

  return (
    <View style={styles.screen}>
      <ScreenBackdrop />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.contentWrapper}>
      <View
        style={[styles.titleCard, { width: cardWidth }]}
        onLayout={(e) => setCardHeights(prev => ({ ...prev, title: e.nativeEvent.layout.height }))}
      >
        {cardHeights.title && (
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            <ChamferedFrame width={cardWidth} height={cardHeights.title} chamfer={16} stroke="#22d3ee" strokeWidth={2} fill="#0b1f2a" />
          </View>
        )}
        <Text style={styles.title}>Data Heist</Text>
        <Text style={styles.subtitle}>Pass-and-play hacking with flowcharts</Text>
      </View>

      <View style={styles.buttonRow}>
        <View 
          style={StyleSheet.flatten([styles.bigButton, styles.bigButtonDisabled, { width: cardWidth }])}
          onLayout={(e) => setCardHeights(prev => ({ ...prev, 'build': e.nativeEvent.layout.height }))}
          // @ts-ignore - 'title' is valid on web for hover tooltips
          title="Coming soon!"
        >
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
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
          <Text style={[styles.bigButtonText, { color: '#64748b' }]}>Build Map</Text>
          <Text style={[styles.bigButtonSub, { color: '#475569' }]}>Design a new network</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>Sample Maps</Text>
      {SAMPLE_MAPS.map((m) => {
        const mode = hackingModes[m.id] || 'dynamic';
        const nodeCount = m.nodes.filter((node) => node.category === 'access').length;
        const moduleCount = m.nodes.filter((node) => node.category === 'module').length;
        const countermeasureCount = m.nodes.filter((node) => node.category === 'countermeasure').length;
        return (
          <View key={m.id} style={{ position: 'relative', width: cardWidth }}>
            <Pressable
              style={[styles.mapCard, commonMapHeight ? { height: commonMapHeight } : null, { width: cardWidth }]}
              onPress={() => selectMap(m.id)}
              onLayout={(e) => {
                const height = e.nativeEvent.layout.height;
                setCardHeights(prev => ({ ...prev, [m.id]: height }));
                setMapChoiceHeight(prev => Math.max(prev ?? 0, height));
                setMeasuredMapIds(prev => new Set(prev).add(m.id));
              }}
            >
              <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                {cardHeights[m.id] && (
                  <ChamferedFrame 
                    width={cardWidth} 
                    height={cardHeights[m.id]} 
                    chamfer={16} 
                    stroke={selectedMapId === m.id ? '#22d3ee' : '#1e293b'} 
                    strokeWidth={2}
                    fill={selectedMapId === m.id ? '#0e293b' : '#0f172a'} 
                  />
                )}
              </View>
              <View style={styles.mapCardBody}>
                <View style={styles.mapCardMain}>
                  <Text style={styles.mapName}>{m.name}</Text>
                  <Text style={styles.mapDesc}>{m.description}</Text>
                  <View style={styles.mapMetaRow}>
                    <Text style={styles.mapMetaTier}>Tier {m.tier}</Text>
                    <Text style={styles.mapMeta}> • nodes: {nodeCount} • modules: {moduleCount} • countermeasures: {countermeasureCount}</Text>
                  </View>
                </View>
                <AnimatedSelectionShell
                  active={selectedMapId === m.id}
                  height={commonMapHeight ?? cardHeights[m.id] ?? 0}
                  width={selectionPanelWidths[m.id]}
                  onLayout={(e) => setSelectionPanelWidths(prev => ({ ...prev, [m.id]: e.nativeEvent.layout.width }))}
                >
                  <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                    <ChamferedFrame width={selectionPanelWidths[m.id] ?? cardWidth * 0.22} height={commonMapHeight ?? cardHeights[m.id] ?? 1} chamfer={16} stroke="#22d3ee" strokeWidth={2} fill="#0b1f2a" />
                  </View>
                  <View style={styles.selectionActions}>
                    <View style={[styles.modeToggle, { width: Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20) }]}>
                      {mode === 'basic' && <ModeSegmentHighlight width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) / 2 - 10)} side="left" />}
                      {mode === 'dynamic' && <ModeSegmentHighlight width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) / 2 - 10)} side="right" />}
                      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                        <ChamferedFrame width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20)} height={30} chamfer={6} stroke="#22d3ee" fill="transparent" />
                      </View>
                      <Pressable onPress={() => toggleMode(m.id)} style={[styles.toggleBtn, mode === 'basic' && styles.toggleBtnActive]}>
                        <Text style={[styles.toggleBtnText, mode === 'basic' && styles.toggleBtnTextActive]}>Basic</Text>
                      </Pressable>
                      <View style={[styles.modeDivider, { pointerEvents: 'none' }]} />
                      <Pressable onPress={() => toggleMode(m.id)} style={[styles.toggleBtn, mode === 'dynamic' && styles.toggleBtnActive]}>
                        <Text style={[styles.toggleBtnText, mode === 'dynamic' && styles.toggleBtnTextActive]}>Dynamic</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.characterBtn,
                        styles.characterBtnShadow,
                        { width: Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20) },
                        pressed && styles.characterBtnPressed,
                      ]}
                      onPress={() => handlePlaySample(m.id, mode)}
                    >
                      {({ pressed }) => (
                        <>
                          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                            <ChamferedFrame width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20)} height={30} chamfer={6} stroke="#22d3ee" fill={pressed ? '#155e75' : '#0e7490'} />
                          </View>
                          <View style={styles.characterBtnContent}>
                            <Text style={[styles.characterBtnText, pressed && styles.characterBtnTextPressed]}>CHARACTER</Text>
                            <CharacterChevron />
                          </View>
                        </>
                      )}
                    </Pressable>
                  </View>
                </AnimatedSelectionShell>
              </View>
            </Pressable>
          </View>
        );
      })}

      {allMaps.filter((m) => !m.builtIn).length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Your Maps</Text>
          {allMaps
            .filter((m) => !m.builtIn)
            .map((m) => {
              const mode = hackingModes[m.id] || 'dynamic';
              return (
                <View key={m.id} style={{ position: 'relative', width: cardWidth }}>
                  <Pressable
                    style={[styles.mapCard, commonMapHeight ? { height: commonMapHeight } : null, { width: cardWidth }]}
                    onPress={() => selectMap(m.id)}
                    onLayout={(e) => {
                      const height = e.nativeEvent.layout.height;
                      setCardHeights(prev => ({ ...prev, [m.id]: height }));
                      setMapChoiceHeight(prev => Math.max(prev ?? 0, height));
                      setMeasuredMapIds(prev => new Set(prev).add(m.id));
                    }}
                  >
                    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                      {cardHeights[m.id] && (
                        <ChamferedFrame 
                          width={cardWidth} 
                          height={cardHeights[m.id]} 
                          chamfer={16} 
                          stroke={selectedMapId === m.id ? '#22d3ee' : '#1e293b'} 
                          strokeWidth={2}
                          fill={selectedMapId === m.id ? '#0e293b' : '#0f172a'} 
                        />
                      )}
                    </View>
                    <View style={styles.mapCardBody}>
                      <View style={styles.mapCardMain}>
                        <Text style={styles.mapName}>{m.name}</Text>
                        <Pressable
                          style={styles.editBtn}
                          onLayout={(e) => setCardHeights(prev => ({ ...prev, [m.id + '_edit']: e.nativeEvent.layout.height } as any))}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            router.push(`/build/${m.id}`);
                          }}
                        >
                          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                            <ChamferedFrame width={60} height={24} chamfer={4} stroke="#22d3ee" fill="#1e293b" />
                          </View>
                          <Text style={styles.editBtnText}>Edit</Text>
                        </Pressable>
                      </View>
                      <AnimatedSelectionShell
                        active={selectedMapId === m.id}
                        height={commonMapHeight ?? cardHeights[m.id] ?? 0}
                        width={selectionPanelWidths[m.id]}
                        onLayout={(e) => setSelectionPanelWidths(prev => ({ ...prev, [m.id]: e.nativeEvent.layout.width }))}
                      >
                        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                          <ChamferedFrame width={selectionPanelWidths[m.id] ?? cardWidth * 0.22} height={commonMapHeight ?? cardHeights[m.id] ?? 1} chamfer={16} stroke="#22d3ee" strokeWidth={2} fill="#0b1f2a" />
                        </View>
                        <View style={styles.selectionActions}>
                          <View style={[styles.modeToggle, { width: Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20) }]}>
                            {mode === 'basic' && <ModeSegmentHighlight width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) / 2 - 10)} side="left" />}
                            {mode === 'dynamic' && <ModeSegmentHighlight width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) / 2 - 10)} side="right" />}
                            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                              <ChamferedFrame width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20)} height={30} chamfer={6} stroke="#22d3ee" fill="transparent" />
                            </View>
                            <Pressable onPress={() => toggleMode(m.id)} style={[styles.toggleBtn, mode === 'basic' && styles.toggleBtnActive]}>
                              <Text style={[styles.toggleBtnText, mode === 'basic' && styles.toggleBtnTextActive]}>Basic</Text>
                            </Pressable>
                            <View style={[styles.modeDivider, { pointerEvents: 'none' }]} />
                            <Pressable onPress={() => toggleMode(m.id)} style={[styles.toggleBtn, mode === 'dynamic' && styles.toggleBtnActive]}>
                              <Text style={[styles.toggleBtnText, mode === 'dynamic' && styles.toggleBtnTextActive]}>Dynamic</Text>
                            </Pressable>
                          </View>
                          <Pressable
                            style={({ pressed }) => [
                              styles.characterBtn,
                              styles.characterBtnShadow,
                              { width: Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20) },
                              pressed && styles.characterBtnPressed,
                            ]}
                            onPress={() => handlePlaySample(m.id, mode)}
                          >
                            {({ pressed }) => (
                              <>
                                <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
                                  <ChamferedFrame width={Math.max(1, (selectionPanelWidths[m.id] ?? cardWidth * 0.22) - 20)} height={30} chamfer={6} stroke="#22d3ee" fill={pressed ? '#155e75' : '#0e7490'} />
                                </View>
                                <View style={styles.characterBtnContent}>
                                  <Text style={[styles.characterBtnText, pressed && styles.characterBtnTextPressed]}>CHARACTER</Text>
                                  <CharacterChevron />
                                </View>
                              </>
                            )}
                          </Pressable>
                        </View>
                      </AnimatedSelectionShell>
                    </View>
                  </Pressable>
                </View>
              );
            })}
        </>
      )}

      {loading && <ActivityIndicator color="#22d3ee" style={{ marginTop: 24 }} />}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 28, paddingTop: 44, alignItems: 'stretch' },
  contentWrapper: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 12,
  },
  title: { fontSize: 36, fontFamily: 'Orbitron-Black', color: '#22d3ee', marginTop: 8 },
  subtitle: { fontSize: 14, fontFamily: 'Orbitron', color: '#94a3b8', marginTop: 2 },
  titleCard: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
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
  mapMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  mapMetaTier: { fontSize: 10, fontFamily: 'Orbitron', color: '#22d3ee' },
  mapCardBody: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  mapCardMain: {
    flex: 3,
    position: 'relative',
    minHeight: 54,
  },
  selectionShell: {
    width: '25%',
    position: 'relative',
    overflow: 'hidden',
    marginTop: -16,
    marginBottom: -16,
    marginRight: -16,
  },
  selectionActions: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 12,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    position: 'relative',
  },
  modeSegmentHighlight: {
    position: 'absolute',
    top: 0,
    height: 30,
  },
  toggleBtn: {
    flex: 1,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'transparent',
  },
  modeDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#22d3ee',
  },
  toggleBtnActive: {
    borderColor: '#22d3ee',
  },
  toggleBtnTextActive: {
    color: '#67e8f9',
  },
  toggleBtnText: {
    fontSize: 9,
    color: '#f1f5f9',
    fontFamily: 'Orbitron-Bold',
  },
  characterBtn: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  characterBtnShadow: {
    boxShadow: '0px 3px 4px rgba(0, 0, 0, 0.35)',
    elevation: 4,
  },
  characterBtnPressed: {
    opacity: 0.92,
  },
  characterBtnText: {
    color: '#fff',
    fontSize: 8,
    fontFamily: 'Orbitron-Bold',
  },
  characterBtnTextPressed: {
    color: '#cffafe',
  },
  characterBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
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