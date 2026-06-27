/**
 * Win/lose checks for Game mode.
 */

import type { GameState } from './types';

export interface WinLoseResult {
  finished: boolean;
  result?: 'win' | 'lose';
  reason?: string;
}

export function checkWinLose(state: GameState, rootNodeId?: string): WinLoseResult {
  if (state.finished) {
    return { finished: true, result: state.result };
  }

  // Win condition: the root-access node has enough successes.
  if (rootNodeId) {
    const obj = state.objectives[rootNodeId];
    if (obj && obj.successes > 0) {
      return { finished: true, result: 'win', reason: 'Root access achieved.' };
    }
  }

  // Lose condition: all players ejected.
  if (state.players.length > 0 && state.players.every((p) => p.ejected || p.currentCP <= 0)) {
    return { finished: true, result: 'lose', reason: 'All personas ejected.' };
  }

  return { finished: false };
}