/**
 * Map store (Build mode) — current map being edited + persistence actions.
 */

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { FlowMap, FlowNode, FlowEdge, NodeCategory } from '../lib/flow/types';
import { snapToGrid } from '../lib/flow/layout';
import { saveMap, loadMap, loadAllMaps, deleteMap as deleteMapFromStorage } from '../lib/flow/persistence';

interface MapStore {
  current: FlowMap | null;
  allMaps: FlowMap[];
  dirty: boolean;
  loading: boolean;
  // actions
  createMap: (name: string) => FlowMap;
  loadMapById: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  saveCurrent: () => Promise<void>;
  deleteMapById: (id: string) => Promise<void>;
  addNode: (category: NodeCategory, x: number, y: number) => FlowNode;
  updateNode: (id: string, patch: Partial<FlowNode>) => void;
  removeNode: (id: string) => void;
  addEdge: (fromNodeId: string, toNodeId: string) => void;
  removeEdge: (id: string) => void;
  setName: (name: string) => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  current: null,
  allMaps: [],
  dirty: false,
  loading: false,

  createMap: (name) => {
    const newMap: FlowMap = {
      id: nanoid(10),
      name: name || 'Untitled Map',
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
    };
    set({ current: newMap, dirty: true });
    return newMap;
  },

  loadMapById: async (id) => {
    set({ loading: true });
    const map = await loadMap(id);
    set({ current: map, dirty: false, loading: false });
  },

  refreshAll: async () => {
    const maps = await loadAllMaps();
    set({ allMaps: maps });
  },

  saveCurrent: async () => {
    const cur = get().current;
    if (!cur) return;
    await saveMap(cur);
    set({ dirty: false });
    // Refresh the allMaps list too
    const maps = await loadAllMaps();
    set({ allMaps: maps });
  },

  deleteMapById: async (id) => {
    await deleteMapFromStorage(id);
    const maps = await loadAllMaps();
    const cur = get().current;
    set({
      allMaps: maps,
      current: cur?.id === id ? null : cur,
    });
  },

  addNode: (category, x, y) => {
    const cur = get().current;
    if (!cur) throw new Error('No map loaded');
    const snapped = snapToGrid(x, y);
    const id = nanoid(8);
    let newNode: FlowNode;
    switch (category) {
      case 'module':
        newNode = {
          id,
          name: `Module ${cur.nodes.length + 1}`,
          x: snapped.x,
          y: snapped.y,
          category,
          tier: 1,
        };
        break;
      case 'countermeasure':
        newNode = {
          id,
          name: `Firewall ${cur.nodes.length + 1}`,
          x: snapped.x,
          y: snapped.y,
          category,
          tier: 1,
          countermeasureType: 'wipe',
          countdown: 3,
        };
        break;
      case 'access':
        newNode = {
          id,
          name: `Access ${cur.nodes.length + 1}`,
          x: snapped.x,
          y: snapped.y,
          category,
          tier: 1,
        };
        break;
    }
    set({
      current: { ...cur, nodes: [...cur.nodes, newNode] },
      dirty: true,
    });
    return newNode;
  },

  updateNode: (id, patch) => {
    const cur = get().current;
    if (!cur) return;
    set({
      current: {
        ...cur,
        nodes: cur.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      },
      dirty: true,
    });
  },

  removeNode: (id) => {
    const cur = get().current;
    if (!cur) return;
    set({
      current: {
        ...cur,
        nodes: cur.nodes.filter((n) => n.id !== id),
        edges: cur.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
      },
      dirty: true,
    });
  },

  addEdge: (fromNodeId, toNodeId) => {
    if (fromNodeId === toNodeId) return;
    const cur = get().current;
    if (!cur) return;
    // Prevent duplicates
    if (cur.edges.some((e) => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId)) return;
    const edge: FlowEdge = { id: nanoid(8), fromNodeId, toNodeId };
    set({
      current: { ...cur, edges: [...cur.edges, edge] },
      dirty: true,
    });
  },

  removeEdge: (id) => {
    const cur = get().current;
    if (!cur) return;
    set({
      current: { ...cur, edges: cur.edges.filter((e) => e.id !== id) },
      dirty: true,
    });
  },

  setName: (name) => {
    const cur = get().current;
    if (!cur) return;
    set({
      current: { ...cur, name },
      dirty: true,
    });
  },
}));