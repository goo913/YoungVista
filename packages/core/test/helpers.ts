import { expect } from 'vitest';
import { ensureCounterClockwise, type Point, type Vec2, type WallObservation } from '../src';

/** Small deterministic PRNG so noisy tests are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const ccw = (points: Point[]): Point[] => ensureCounterClockwise(points);

export const rectangle = (w: number, d: number, x0 = 0, z0 = 0): Point[] =>
  ccw([
    [x0, z0],
    [x0 + w, z0],
    [x0 + w, z0 + d],
    [x0, z0 + d],
  ]);

/** 6 × 6 m L-shape with 3 m arms. */
export const lShape: Point[] = ccw([
  [0, 0],
  [6, 0],
  [6, 3],
  [3, 3],
  [3, 6],
  [0, 6],
]);

/** L-shape with 1 m wide, 10 m long arms: the centre of its wall midpoints lies outside it. */
export const thinL: Point[] = ccw([
  [0, 0],
  [10, 0],
  [10, 1],
  [1, 1],
  [1, 10],
  [0, 10],
]);

/** 5 × 4 m room with a 1.5 m wide, 0.6 m deep alcove in one wall. */
export const alcoveRoom: Point[] = ccw([
  [0, 0],
  [2, 0],
  [2, -0.6],
  [3.5, -0.6],
  [3.5, 0],
  [5, 0],
  [5, 4],
  [0, 4],
]);

/** 5 × 4 m room with one 45° corner cut off. */
export const chamferRoom: Point[] = ccw([
  [0, 0],
  [4, 0],
  [5, 1],
  [5, 4],
  [0, 4],
]);

export function rotate(points: Point[], deg: number, about: Vec2 = { x: 0, z: 0 }): Point[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return points.map(([x, z]) => {
    const dx = x - about.x;
    const dz = z - about.z;
    return [about.x + dx * c - dz * s, about.z + dx * s + dz * c];
  });
}

export interface Edge {
  a: Vec2;
  b: Vec2;
}

export function edgesOf(points: Point[]): Edge[] {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length]!;
    return { a: { x: p[0], z: p[1] }, b: { x: q[0], z: q[1] } };
  });
}

const along = (e: Edge, t: number): Vec2 => ({
  x: e.a.x + (e.b.x - e.a.x) * t,
  z: e.a.z + (e.b.z - e.a.z) * t,
});

/**
 * One observation per wall, covering the fraction [from, to] of it (values outside 0..1
 * overshoot the corners).
 */
export function wallObservations(
  points: Point[],
  from = 0,
  to = 1,
  skip: number[] = [],
): WallObservation[] {
  return edgesOf(points).flatMap((e, i) =>
    skip.includes(i)
      ? []
      : [{ id: `w${i}`, source: 'plane' as const, a: along(e, from), b: along(e, to) }],
  );
}

export interface NoiseOptions {
  piecesPerWall?: [number, number];
  /** Each piece covers this fraction of its wall. */
  pieceLength?: [number, number];
  lateralSigma?: number;
  angleSigmaDeg?: number;
  /**
   * Metres at each end of a wall that may stay unseen (e.g. furniture in the corners).
   * Default: 20% of the wall. The first piece starts and the last piece ends within this.
   */
  hiddenEnds?: number;
}

/** Many partial, noisy observations of every wall, in random order and direction. */
export function noisyObservations(
  points: Point[],
  seed: number,
  options: NoiseOptions = {},
): WallObservation[] {
  const rand = mulberry32(seed);
  const [minPieces, maxPieces] = options.piecesPerWall ?? [2, 5];
  const [minLen, maxLen] = options.pieceLength ?? [0.3, 0.8];
  const lateral = options.lateralSigma ?? 0.02;
  const angle = ((options.angleSigmaDeg ?? 1.5) * Math.PI) / 180;
  const out: WallObservation[] = [];
  edgesOf(points).forEach((e, wi) => {
    const pieces = minPieces + Math.floor(rand() * (maxPieces - minPieces + 1));
    const dx = e.b.x - e.a.x;
    const dz = e.b.z - e.a.z;
    const len = Math.hypot(dx, dz);
    const u = { x: dx / len, z: dz / len };
    const n = { x: -u.z, z: u.x };
    const hidden = Math.min(0.45, (options.hiddenEnds ?? 0.2 * len) / len);
    for (let k = 0; k < pieces; k++) {
      let frac = minLen + rand() * (maxLen - minLen);
      let start = rand() * (1 - frac);
      // Make sure the wall is seen from within `hidden` of each end.
      if (k === 0) start = rand() * hidden;
      if (k === 1) start = 1 - frac - rand() * hidden;
      if (start < 0 || start + frac > 1) {
        start = Math.max(0, Math.min(start, 1 - frac));
        frac = Math.min(frac, 1 - start);
      }
      const mid = along(e, start + frac / 2);
      const off = gaussian(rand) * lateral;
      const center = { x: mid.x + n.x * off, z: mid.z + n.z * off };
      const th = Math.atan2(u.z, u.x) + gaussian(rand) * angle;
      const half = (frac * len) / 2;
      const d = { x: Math.cos(th) * half, z: Math.sin(th) * half };
      const a = { x: center.x - d.x, z: center.z - d.z };
      const b = { x: center.x + d.x, z: center.z + d.z };
      const swap = rand() < 0.5;
      out.push({
        id: `w${wi}-${k}`,
        source: rand() < 0.8 ? 'plane' : 'tap',
        a: swap ? b : a,
        b: swap ? a : b,
      });
    }
  });
  // Shuffle.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Largest distance between matching corners of two outlines, trying every cyclic rotation. */
export function outlineError(actual: Point[], expected: Point[]): number {
  if (actual.length !== expected.length) return Infinity;
  let best = Infinity;
  for (let r = 0; r < actual.length; r++) {
    let worst = 0;
    for (let i = 0; i < expected.length; i++) {
      const p = actual[(i + r) % actual.length]!;
      const q = expected[i]!;
      worst = Math.max(worst, Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
    best = Math.min(best, worst);
  }
  return best;
}

export function expectOutline(actual: Point[], expected: Point[], tol = 1e-6): void {
  expect(actual).toHaveLength(expected.length);
  expect(outlineError(actual, expected)).toBeLessThanOrEqual(tol);
}

/** Interior angle (degrees) at each corner. */
export function cornerAngles(points: Point[]): number[] {
  return points.map((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const next = points[(i + 1) % points.length]!;
    const ux = prev[0] - p[0];
    const uz = prev[1] - p[1];
    const vx = next[0] - p[0];
    const vz = next[1] - p[1];
    const c = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz));
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  });
}
