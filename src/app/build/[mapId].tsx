import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMapStore } from '@/stores/mapStore';
import { FlowCanvas } from '@/components/flow/flowCanvas/FlowCanvas';
import { FlowNodeView } from '@/components/flow/FlowNode';
import { NodePalette } from '@/components/flow/NodePalette';
import { NodeEditor } from '@/components/flow/NodeEditor';
import type { NodeCategory, FlowNode } from '@/lib/flow/types';
import { ChamferedFrame } from '@/components/ui/ChamferedFrame';

export default function BuildMapScreen() {
  const { mapId } = useLocalSearchParams<{ mapId: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const {
    current,
    loadMapById,
    updateNode,
    removeNode,
    addNode,
    addEdge,
    setName,
    saveCurrent,
    dirty,
  } = useMapStore();
  const [pickingCategory, setPickingCategory] = useState<NodeCategory | null>(null);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);

  useEffect(() => {
    if (mapId) loadMapById(mapId);
  }, [mapId, loadMapById]);

  if (!current) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const handleCanvasTap = (x: number, y: number) => {
    if (pickingCategory) {
      addNode(pickingCategory, x, y);
      setPickingCategory(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <View style={{ flex: 1, height: 36 }}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ChamferedFrame width={windowWidth - 110} height={36} chamfer={6} stroke="#1e293b" fill="#0f172a" />
          </View>
          <TextInput
            style={styles.nameInput}
            value={current.name}
            onChangeText={setName}
            placeholder="Map name"
            placeholderTextColor="#475569"
          />
        </View>
        <View style={{ width: 80, height: 36 }}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <ChamferedFrame width={80} height={36} chamfer={6} stroke="#22d3ee" fill="#0e7490" />
          </View>
          <Pressable style={styles.saveBtn} onPress={() => saveCurrent()}>
            <Text style={styles.saveBtnText}>{dirty ? 'Save *' : 'Saved'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Canvas — using a simple tap-anywhere approach */}
      <Pressable
        style={styles.canvasContainer}
        onPress={(e) => {
          if (pickingCategory) {
            const { locationX, locationY } = e.nativeEvent;
            handleCanvasTap(locationX, locationY);
          }
        }}
      >
        <FlowCanvas
          map={current}
          mode="build"
          selectedId={selectedNode?.id ?? null}
          onSelectNode={(n) => {
            if (!n) {
              setSelectedNode(null);
              return;
            }
            if (connectFromId) {
              if (connectFromId !== n.id) {
                addEdge(connectFromId, n.id);
              }
              setConnectFromId(null);
              return;
            }
            setSelectedNode(n);
          }}
          renderNode={(n) => (
            <FlowNodeView node={n} mode="build" />
          )}
        />
        {connectFromId && (
          <View style={styles.connectBanner}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <ChamferedFrame width={windowWidth - 16} height={44} chamfer={8} stroke="#22d3ee" fill="rgba(15,23,42,0.95)" />
            </View>
            <Text style={styles.connectBannerText}>
              Tap a node to connect from "{current.nodes.find((n) => n.id === connectFromId)?.name}"
            </Text>
            <Pressable onPress={() => setConnectFromId(null)}>
              <Text style={styles.connectCancel}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </Pressable>

      <NodePalette active={pickingCategory} onPick={(c) => setPickingCategory(pickingCategory === c ? null : c)} />

      {selectedNode && (
        <View style={styles.bottomBar}>
          <View style={{ flex: 1, height: 40 }}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <ChamferedFrame width={(windowWidth - 32) / 2} height={40} chamfer={8} stroke="#334155" fill="#1e293b" />
            </View>
            <Pressable style={styles.actionBtn} onPress={() => setConnectFromId(selectedNode.id)}>
              <Text style={styles.actionBtnText}>🔗 Connect</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1, height: 40 }}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <ChamferedFrame width={(windowWidth - 32) / 2} height={40} chamfer={8} stroke="#334155" fill="#1e293b" />
            </View>
            <Pressable style={styles.actionBtn} onPress={() => setSelectedNode(null)}>
              <Text style={styles.actionBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}

      <NodeEditor
        node={selectedNode}
        onUpdate={(patch) => {
          if (selectedNode) updateNode(selectedNode.id, patch);
        }}
        onDelete={() => {
          if (selectedNode) {
            removeNode(selectedNode.id);
            setSelectedNode(null);
          }
        }}
        onClose={() => setSelectedNode(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  nameInput: {
    paddingHorizontal: 12,
    height: 36,
    color: '#f1f5f9',
    fontSize: 15,
    fontFamily: 'Orbitron-Bold',
  },
  saveBtn: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontFamily: 'Orbitron-Bold', fontSize: 13 },
  canvasContainer: { flex: 1, position: 'relative' },
  loading: { flex: 1, backgroundColor: '#020617', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94a3b8', fontSize: 16, fontFamily: 'Orbitron' },
  connectBanner: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    height: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectBannerText: { color: '#f1f5f9', fontSize: 12, flex: 1, fontFamily: 'Orbitron' },
  connectCancel: { color: '#f87171', fontFamily: 'Orbitron-Bold', fontSize: 12 },
  bottomBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderColor: '#1e293b',
  },
  actionBtn: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#f1f5f9', fontFamily: 'Orbitron-Bold', fontSize: 13 },
});