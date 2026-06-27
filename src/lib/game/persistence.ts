/**
 * Game state persistence — save/load running games (different from map persistence).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameState } from '../game/types';

const GAME_KEY = 'data-heist.games.v1';

export async function saveGame(game: GameState): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(GAME_KEY);
    const games: GameState[] = raw ? JSON.parse(raw) : [];
    const idx = games.findIndex((g) => g.id === game.id);
    if (idx >= 0) {
      games[idx] = game;
    } else {
      games.push(game);
    }
    await AsyncStorage.setItem(GAME_KEY, JSON.stringify(games));
  } catch (e) {
    console.warn('saveGame failed', e);
  }
}

export async function loadGame(id: string): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(GAME_KEY);
    if (!raw) return null;
    const games: GameState[] = JSON.parse(raw);
    return games.find((g) => g.id === id) ?? null;
  } catch (e) {
    console.warn('loadGame failed', e);
    return null;
  }
}

export async function listGames(): Promise<GameState[]> {
  try {
    const raw = await AsyncStorage.getItem(GAME_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GameState[];
  } catch {
    return [];
  }
}

export async function deleteGame(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(GAME_KEY);
  const games: GameState[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(GAME_KEY, JSON.stringify(games.filter((g) => g.id !== id)));
}