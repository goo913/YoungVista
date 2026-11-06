/**
 * Top-down plan on screen: room metres to view points and back, and what a finger touched. The
 * plan is drawn as on the website: +X to the right and +Z down the screen, seen from above.
 * Plain TypeScript, shared by the furniture plan and the room editor.
 */
import { bounds, type Footprint, type Point, type Vec2 } from '@youngvista/core';

export interface PlanTransform {
  /** View points per metre. */
  scale: number;
  /** View position of room x = 0, z = 0. */
  ox: number;
  oy: number;
}

/** Fits the room's outline (plus `marginM` metres around it) into a view of `width` × `height`. */
export function fitPlan(
  points: readonly Point[],
  width: number,
  height: number,
  marginM = 0.5,
): PlanTransform {
  const b = bounds(points);
  const w = Math.max(b.width + 2 * marginM, 0.5);
  const d = Math.max(b.depth + 2 * marginM, 0.5);
  const scale = Math.max(Math.min(width / w, height / d), 1e-3);
  return {
    scale,
    ox: width / 2 - ((b.minX + b.maxX) / 2) * scale,
    oy: height / 2 - ((b.minZ + b.maxZ) / 2) * scale,
  };
}

export const toView = (t: PlanTransform, p: Vec2): { x: number; y: number } => ({
  x: p.x * t.scale + t.ox,
  y: p.z * t.scale + t.oy,
});

export const toRoom = (t: PlanTransform, p: { x: number; y: number }): Vec2 => ({
  x: (p.x - t.ox) / t.scale,
  z: (p.y - t.oy) / t.scale,
});

/** True if `p` is inside the footprint grown by `slop` metres on every side. */
export function footprintContains(fp: Footprint, p: Vec2, slop = 0): boolean {
  const lx = (p.x - fp.center.x) * fp.axisX.x + (p.z - fp.center.z) * fp.axisX.z;
  const lz = (p.x - fp.center.x) * fp.axisZ.x + (p.z - fp.center.z) * fp.axisZ.z;
  return Math.abs(lx) <= fp.halfWidth + slop && Math.abs(lz) <= fp.halfDepth + slop;
}

export interface PlanItem {
  id: string;
  footprint: Footprint;
  /** Rugs: other furniture stands on them, so they are picked last. */
  flat: boolean;
}

/**
 * The item under a finger at `p`: the selected item if the finger is on it, else the closest
 * piece of furniture under it, else a rug. `slop` (m) makes small items easier to hit.
 */
export function itemAt(
  items: readonly PlanItem[],
  p: Vec2,
  selectedId: string | null,
  slop = 0,
): string | null {
  const hits = items.filter((it) => footprintContains(it.footprint, p, slop));
  if (!hits.length) return null;
  const selected = hits.find((it) => it.id === selectedId);
  if (selected) return selected.id;
  const dist = (it: PlanItem) =>
    Math.hypot(it.footprint.center.x - p.x, it.footprint.center.z - p.z);
  const solid = hits.filter((it) => !it.flat);
  const pool = solid.length ? solid : hits;
  return pool.reduce((best, it) => (dist(it) < dist(best) ? it : best)).id;
}

/** Distance (m) from `p` to the segment a-b. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}
