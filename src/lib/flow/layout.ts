/**
 * Grid-snap math for Build mode.
 * Snap coordinates to the nearest hexagonal grid center.
 */

export const GRID_SIZE = 80;

/**
 * Snap coordinates to the nearest hexagonal grid center.
 * Using "Flat-Topped" hexagons where GRID_SIZE is the side length.
 */
export function snapToGrid(x: number, y: number): { x: number; y: number } {
  const size = GRID_SIZE;

  // Pixel to flat-topped axial
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;

  // Axial to cube
  const cx = q;
  const cz = r;
  const cy = -cx - cz;

  // Snap cube
  let rx = Math.round(cx);
  let ry = Math.round(cy);
  let rz = Math.round(cz);

  const xDiff = Math.abs(rx - cx);
  const yDiff = Math.abs(ry - cy);
  const zDiff = Math.abs(rz - cz);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  // Back to pixel (flat-topped)
  const finalX = size * (1.5 * rx);
  const finalY = size * ((Math.sqrt(3) / 2) * rx + Math.sqrt(3) * rz);

  return { x: finalX, y: finalY };
}

export function isOnGrid(x: number, y: number): boolean {
  const snapped = snapToGrid(x, y);
  return Math.abs(x - snapped.x) < 0.1 && Math.abs(y - snapped.y) < 0.1;
}
