/**
 * Map persistence — save/load FlowMaps via AsyncStorage.
 * Used by both Build mode (save edited map) and Game mode (load map to play).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SAMPLE_MAPS } from '../../sample-maps';
import type { FlowMap } from './types';

const MAPS_KEY = 'data-heist.maps.v1';

export async function loadAllMaps(): Promise<FlowMap[]> {
  try {
    const raw = await AsyncStorage.getItem(MAPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FlowMap[];
  } catch (e) {
    console.warn('loadAllMaps failed', e);
    return [];
  }
}

export async function loadMap(id: string): Promise<FlowMap | null> {
  const all = await loadAllMaps();
  const stored = all.find((m) => m.id === id);
  const bundled = SAMPLE_MAPS.find((m) => m.id === id);
  const storedLooksBuiltIn = stored?.builtIn !== false;

  if (stored && bundled && storedLooksBuiltIn && stored.updatedAt < bundled.updatedAt) {
    await saveMap(bundled);
    return bundled;
  }

  return stored ?? bundled ?? null;
}

export async function saveMap(map: FlowMap): Promise<void> {
  const all = await loadAllMaps();
  const idx = all.findIndex((m) => m.id === map.id);
  const updated: FlowMap = { ...map, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.push(updated);
  }
  await AsyncStorage.setItem(MAPS_KEY, JSON.stringify(all));
}

export async function deleteMap(id: string): Promise<void> {
  const all = await loadAllMaps();
  const filtered = all.filter((m) => m.id !== id);
  await AsyncStorage.setItem(MAPS_KEY, JSON.stringify(filtered));
}

/** Save a whole list of maps (used to seed bundled maps). */
export async function saveAllMaps(maps: FlowMap[]): Promise<void> {
  await AsyncStorage.setItem(MAPS_KEY, JSON.stringify(maps));
}