/**
 * generateStubs — procedural PCB trace decoration.
 *
 * Produces a deterministic set of short, branched, circuit-style traces
 * that decorate the empty space around a flow graph. Each trace is a
 * path string with an end-via and corner-dot coordinates ready for SVG
 * rendering.
 *
 * Determinism: the seed is derived from the positioned node coordinates,
 * so the same layout always renders the same decoration.
 *
 * Used by `StubBranches.tsx`. Kept as a pure function so it can be
 * unit-tested without React.
 */

import type { FlowNode } from '@/lib/flow/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, NODE_WIDTH } from '@/lib/flow/layoutGraph';

export interface StubTrace {
  d: string;
  endX: number;
  endY: number;
  corners: { x: number; y: number }[];
}

export interface Stub {
  traces: StubTrace[];
}

type SegKind = 'h' | 'v' | 'd';
interface Seg { kind: SegKind; x1: number; y1: number; x2: number; y2: number; }
interface Point { x: number; y: number; }

const STUB_MARGIN = 18; 
const STUB_EDGE_MARGIN = 24;

function pointsToRoundedPath(points: Point[], radius: number): string {
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

function hashSeed(str: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

function distToSeg(px: number, py: number, s: Seg): number {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, l2 = dx*dx + dy*dy;
  if (l2 === 0) return Math.hypot(px - s.x1, py - s.y1);
  let t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / l2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

function hitsNode(s: Seg, nodes: FlowNode[], margin: number, skip?: FlowNode | null): boolean {
  const sx1 = Math.min(s.x1, s.x2) - margin, sx2 = Math.max(s.x1, s.x2) + margin;
  const sy1 = Math.min(s.y1, s.y2) - margin, sy2 = Math.max(s.y1, s.y2) + margin;
  return nodes.some(n => {
    if (n === skip) return false;
    const nx1 = n.x, nx2 = n.x + NODE_WIDTH, ny1 = n.y, ny2 = n.y + NODE_WIDTH;
    return !(sx1 >= nx2 || sx2 <= nx1 || sy1 >= ny2 || sy2 <= ny1);
  });
}

function segsOverlap(a: Seg, b: Seg, margin: number): boolean {
  const ax1 = Math.min(a.x1, a.x2), ax2 = Math.max(a.x1, a.x2);
  const ay1 = Math.min(a.y1, a.y2), ay2 = Math.max(a.y1, a.y2);
  const bx1 = Math.min(b.x1, b.x2), bx2 = Math.max(b.x1, b.x2);
  const by1 = Math.min(b.y1, b.y2), by2 = Math.max(b.y1, b.y2);

  if (ax1 - margin >= bx2 || ax2 + margin <= bx1 || ay1 - margin >= by2 || ay2 + margin <= by1) return false;
  if (a.kind === b.kind) {
    if (a.kind === 'h') return Math.abs(a.y1 - b.y1) < margin;
    if (a.kind === 'v') return Math.abs(a.x1 - b.x1) < margin;
    const L = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
    return L > 0 && Math.abs((a.y2 - a.y1) * b.x1 - (a.x2 - a.x1) * b.y1 + a.x2 * a.y1 - a.y2 * a.x1) / L < margin;
  }
  return Math.min(distToSeg(a.x1, a.y1, b), distToSeg(a.x2, a.y2, b), distToSeg(b.x1, b.y1, a), distToSeg(b.x2, b.y2, a)) < margin;
}

function tryMultiFork(sx: number, sy: number, dx: 1|-1, dy: 1|-1, count: number, local: Seg[], global: Seg[], edgeSegs: Seg[], rng: () => number, nodes: FlowNode[]): { traces: StubTrace[], segs: Seg[] } | null {
  const traces: StubTrace[] = [], segs: Seg[] = [], spacing = STUB_MARGIN + 2;
  const fl = 30 + rng() * 40, dl = 20 + rng() * 30;
  for (let i = 0; i < count; i++) {
    const s1: Seg = { kind: 'h', x1: sx + i*spacing, y1: sy + i*dy*spacing, x2: sx + i*spacing + dx*fl, y2: sy + i*dy*spacing };
    const isHit = (seg: Seg) => [...local, ...global, ...segs].some(p => segsOverlap(seg, p, STUB_MARGIN)) || 
      hitsNode(seg, nodes, STUB_MARGIN) ||
      edgeSegs.some(e => segsOverlap(seg, e, STUB_EDGE_MARGIN));
    if (isHit(s1)) continue;
    const s2: Seg = { kind: 'v', x1: s1.x2, y1: s1.y2, x2: s1.x2, y2: s1.y2 + dy*dl };
    const hit = isHit(s2);
    const pts = hit ? [{x:s1.x1, y:s1.y1}, {x:s1.x2, y:s1.y2}] : [{x:s1.x1, y:s1.y1}, {x:s1.x2, y:s1.y2}, {x:s2.x2, y:s2.y2}];
    traces.push({ d: pointsToRoundedPath(pts, 8), endX: pts[pts.length-1].x, endY: pts[pts.length-1].y, corners: pts });
    segs.push(s1); if (!hit) segs.push(s2);
  }
  return traces.length ? { traces, segs } : null;
}

export function generateStubs(nodes: FlowNode[], edges: any[] = [], seed?: string): Stub[] {
  const finalSeed = seed || nodes.map(n => `${Math.round(n.x)}:${Math.round(n.y)}`).join('|') || 'empty';
  const rng = hashSeed(finalSeed), stubs: Stub[] = [], globalSegs: Seg[] = [];
  
  // Convert functional edges into avoid-segs
  const edgeSegs: Seg[] = [];
  edges.forEach(edge => {
    const from = nodes.find(n => n.id === edge.fromNodeId);
    const to = nodes.find(n => n.id === edge.toNodeId);
    if (!from || !to) return;
    const sx = from.x + NODE_WIDTH / 2, sy = from.y;
    const tx = to.x + NODE_WIDTH / 2, ty = to.y + NODE_WIDTH;
    const midY = (sy + ty) / 2;
    edgeSegs.push({ kind: 'v', x1: sx, y1: sy, x2: sx, y2: midY });
    edgeSegs.push({ kind: 'h', x1: sx, y1: midY, x2: tx, y2: midY });
    edgeSegs.push({ kind: 'v', x1: tx, y1: midY, x2: tx, y2: ty });
  });

  const targetCount = 65 + Math.floor(rng() * 35);
  let attempts = 0;

  while (stubs.length < targetCount && attempts++ < 250000) {
    let sx, sy, hDir, vDir = rng() < 0.5 ? 1 : -1, fromL = rng() < 0.5, startNode: FlowNode | null = null;
    if (rng() < 0.5 && nodes.length) {
      startNode = nodes[Math.floor(rng() * nodes.length)];
      hDir = fromL ? -1 : 1;
      sx = fromL ? startNode.x - 14 : startNode.x + NODE_WIDTH + 14;
      sy = startNode.y + 20 + rng() * (NODE_WIDTH - 40);
    } else {
      sx = 50 + rng() * (CANVAS_WIDTH - 100); sy = 50 + rng() * (CANVAS_HEIGHT - 100); hDir = fromL ? -1 : 1;
    }

    const initK: SegKind = rng() < 0.4 ? 'h' : rng() < 0.8 ? 'v' : 'd';
    const initL = 40 + rng() * 60;
    const dx0 = (initK === 'h' || initK === 'd') ? hDir * initL : 0;
    const dy0 = (initK === 'v' || initK === 'd') ? (initK === 'v' ? (rng() < 0.5 ? -1 : 1) : vDir) * initL : 0;
    
    const qty = rng() < 0.7 ? 5 + Math.floor(rng() * 6) : 3;
    const spacing = STUB_MARGIN + 2;
    let busX = sx + dx0, busY = sy + dy0;

    interface Strand { x: number; y: number; corners: Point[]; segs: Seg[]; track: number; active: boolean; kind: SegKind; }
    const strands: Strand[] = Array.from({ length: qty }, (_, i) => {
      let ox = 0, oy = 0;
      if (initK === 'h') oy = i * spacing;
      else if (initK === 'v') ox = i * spacing;
      else { const m = Math.hypot(dx0, dy0); ox = (-dy0 / m) * (i * spacing); oy = (dx0 / m) * (i * spacing); }
      const s: Seg = { kind: initK, x1: sx + ox, y1: sy + oy, x2: sx + ox + dx0, y2: sy + oy + dy0 };
      return { x: s.x2, y: s.y2, corners: [{x: s.x1, y: s.y1}, {x: s.x2, y: s.y2}], segs: [s], track: i, active: true, kind: initK };
    });

    const isHit = (seg: Seg, s?: Strand) => globalSegs.some(g => segsOverlap(seg, g, STUB_MARGIN)) || 
      strands.some(other => (s ? other !== s : true) && other.segs.some(os => segsOverlap(seg, os, STUB_MARGIN))) ||
      hitsNode(seg, nodes, STUB_MARGIN, startNode) ||
      edgeSegs.some(e => segsOverlap(seg, e, STUB_EDGE_MARGIN));

    if (strands.some(s => isHit(s.segs[0], s))) continue;

    const move = (k: SegKind, dx: number, dy: number): boolean => {
      const active = strands.filter(s => s.active);
      if (!active.length) return false;
      const m = Math.hypot(dx, dy), px = (-dy / m) * spacing, py = (dx / m) * spacing;
      const results = active.map(s => {
        const tx = busX + px * s.track, ty = busY + py * s.track;
        const jog = (Math.hypot(s.x - tx, s.y - ty) > 0.1) ? { kind: 'd' as SegKind, x1: s.x, y1: s.y, x2: tx, y2: ty } : null;
        const main = { kind: k, x1: tx, y1: ty, x2: tx + dx, y2: ty + dy };
        const hit = [jog, main].some(seg => seg && isHit(seg, s));
        return { s, jog, main, hit };
      });
      if (results.every(r => r.hit)) return false;
      results.forEach(({ s, jog, main, hit }) => {
        if (hit) s.active = false;
        else {
          if (jog) { s.corners.push({x: jog.x2, y: jog.y2}); s.segs.push(jog); s.x = jog.x2; s.y = jog.y2; }
          s.corners.push({x: main.x2, y: main.y2}); s.segs.push(main); s.x = main.x2; s.y = main.y2; s.kind = k;
        }
      });
      busX += dx; busY += dy; return true;
    };

    let turns = 0, steps = 12 + Math.floor(rng() * 12);
    for (let s = 0; s < steps; s++) {
      const roll = rng(), activeS = strands.find(st => st.active) || strands[0];
      const ortho = activeS.kind === 'v' ? 'h' : 'v', prevK = activeS.kind;
      const plans = [
        { c: roll < 0.45, k: 'd' as const, l: 60 + rng() * 60 },
        { c: roll < 0.75, k: activeS.kind, l: 80 + rng() * 80, p: true },
        { c: true,       k: ortho,        l: 50 + rng() * 50 }
      ];
      let moved = false;
      for (const { c, k, l, p } of plans) {
        if (!c) continue;
        for (let attempt = 0; attempt < 2; attempt++) {
          const curH = (attempt === 0) ? hDir : -hDir, curV = (attempt === 0) ? vDir : -vDir;
          const dx = (k === 'h' || k === 'd') ? curH * l : 0;
          const dy = (k === 'v' || k === 'd') ? (k === 'v' ? curV : curV) * l : 0;
          if (move(k as SegKind, dx, dy)) {
            if (attempt === 1) { if (k === 'h' || k === 'd') hDir = -hDir; if (k === 'v' || k === 'd') vDir = -vDir; }
            if (p && rng() < 0.3) vDir *= -1;
            if (k !== prevK) turns++;
            moved = true; break;
          }
          if (k !== activeS.kind) break; // Only retry signs for ortho/diag
        }
        if (moved) break;
      }
      if (!moved) break;
    }

    if (turns < 1 || strands[0].corners.length < 3) continue;
    const p = strands[0]; if (p.y < 10 || p.y > CANVAS_HEIGHT-10 || p.x < 10 || p.x > CANVAS_WIDTH-10) continue;

    const traces = strands.map(s => ({ d: pointsToRoundedPath(s.corners, 8), endX: s.x, endY: s.y, corners: s.corners }));
    const twigSegs: Seg[] = [];
    strands.forEach(s => s.corners.forEach((c, i) => {
      if (i === 0 || i === s.corners.length-1 || rng() > 0.15) return;
      const f = tryMultiFork(c.x, c.y, rng() < 0.5 ? 1 : -1, rng() < 0.5 ? 1 : -1, 2 + Math.floor(rng()*2), strands.flatMap(st => st.segs), [...globalSegs, ...twigSegs], edgeSegs, rng, nodes);
      if (f) { traces.push(...f.traces); twigSegs.push(...f.segs); }
    }));
    globalSegs.push(...strands.flatMap(s => s.segs), ...twigSegs);
    stubs.push({ traces });
  }
  return stubs;
}
