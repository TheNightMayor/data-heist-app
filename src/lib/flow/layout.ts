/**
 * Grid-snap math for Build mode.
 * Snap coordinates to the nearest square grid intersection.
 */

export const GRID_SIZE = 80;

/**
 * Snap coordinates to the nearest square grid intersection.
 */
export function snapToGrid(x: number, y: number): { x: number; y: number } {
  const size = GRID_SIZE;
  return {
    x: Math.round(x / size) * size,
    y: Math.round(y / size) * size,
  };
}

export function isOnGrid(x: number, y: number): boolean {
  const snapped = snapToGrid(x, y);
  return Math.abs(x - snapped.x) < 0.1 && Math.abs(y - snapped.y) < 0.1;
}
