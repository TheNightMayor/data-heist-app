/**
 * circuitPath — build a circuit-board-style SVG path between two points.
 *
 * Starts at (sx, sy), ends at (tx, ty). The trace typically uses 45° 
 * segments (doglegs) instead of hard 90° bends to match the background 
 * PCB aesthetic. Each corner is filleted with a small radius `r`.
 *
 * Returns both the path string `d` and the list of corner points so
 * renderers can draw decorative "corner dots" if desired.
 */

interface Point { x: number; y: number; }

export function pointsToRoundedPath(points: Point[], radius: number): string {
  if (points.length < 2) return points.length ? `M ${points[0].x} ${points[0].y}` : '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1], p1 = points[i], p2 = points[i + 1];
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    if (r < 0.5) { d += ` L ${p1.x} ${p1.y}`; continue; }
    const v1 = { x: (p1.x - p0.x) / d1, y: (p1.y - p0.y) / d1 };
    const v2 = { x: (p2.x - p1.x) / d2, y: (p2.y - p1.y) / d2 };
    d += ` L ${p1.x - v1.x * r} ${p1.y - v1.y * r} Q ${p1.x} ${p1.y} ${p1.x + v2.x * r} ${p1.y + v2.y * r}`;
  }
  return d + ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
}

export function circuitPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  r = 14,
): { d: string; points: Point[] } {
  const dx = tx - sx;
  const dy = ty - sy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx < 1) {
    return {
      d: `M ${sx} ${sy} L ${tx} ${ty}`,
      points: [{ x: sx, y: sy }, { x: tx, y: ty }],
    };
  }

  // We want to use a 45° dogleg. A 45° segment covering absDx horizontally 
  // also needs absDx vertically.
  const points: Point[] = [{ x: sx, y: sy }];

  if (absDy > absDx) {
    // We have enough vertical room for a 45° segment plus some straight vertical.
    // Start with a small vertical lead-out, then diagonal, then vertical lead-in.
    const verticalRemainder = absDy - absDx;
    const vStart = verticalRemainder / 2;

    const midY1 = sy + (dy > 0 ? vStart : -vStart);
    const midY2 = midY1 + (dy > 0 ? absDx : -absDx);

    points.push({ x: sx, y: midY1 });
    points.push({ x: tx, y: midY2 });
  } else {
    // Not enough vertical room for a 45° segment. 
    // Fall back to a "vertical then horizontal then vertical" 90° style, 
    // but expressed as points for rounding.
    const midY = sy + dy / 2;
    points.push({ x: sx, y: midY });
    points.push({ x: tx, y: midY });
  }

  points.push({ x: tx, y: ty });

  return {
    d: pointsToRoundedPath(points, r),
    points,
  };
}
