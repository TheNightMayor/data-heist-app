/**
 * Grid-snap math for Build mode.
 * Snap coordinates to the nearest 80px grid intersection.
 */

export const GRID_SIZE = 80;

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(y / GRID_SIZE) * GRID_SIZE,
  };
}

export function isOnGrid(x: number, y: number): boolean {
  return x % GRID_SIZE === 0 && y % GRID_SIZE === 0;
}