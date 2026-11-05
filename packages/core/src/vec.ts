import type { Vec2 } from './types';

export const vec2 = (x: number, z: number): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
export const neg = (a: Vec2): Vec2 => ({ x: -a.x, z: -a.z });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;

/** Plain 2D cross product of (x, z) read as (x, y). Only its sign-free magnitude is used for intersections. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.z - a.z * b.x;

/**
 * Positive when `b` turns counter-clockwise from `a`, seen from above (looking down -Y).
 * This is `-cross(a, b)` because +Z points toward the viewer's bottom edge in a top view.
 */
export const turn = (a: Vec2, b: Vec2): number => a.z * b.x - a.x * b.z;

export const length = (a: Vec2): number => Math.hypot(a.x, a.z);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  return l > 0 ? { x: a.x / l, z: a.z / l } : { x: 0, z: 0 };
}

/** Unit vector at 90° to `d`: the left-hand side of `d` as seen from above. */
export const leftNormal = (d: Vec2): Vec2 => ({ x: d.z, z: -d.x });

export const toRadians = (deg: number): number => (deg * Math.PI) / 180;
export const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Angle of `v` in radians, counter-clockwise from +X as seen from above:
 * +X is 0, -Z is π/2, -X is π, +Z is -π/2. Range (-π, π].
 */
export const angleAbove = (v: Vec2): number => Math.atan2(-v.z, v.x);

/** `angleAbove` in degrees, normalised to [0, 360). Use it to compare a camera heading with `coverage` gaps. */
export function angleAboveDeg(v: Vec2): number {
  const d = toDegrees(angleAbove(v));
  return d < 0 ? d + 360 : d;
}

/** Wraps an angle to (-π, π]. */
export function wrapPi(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

/** Wraps an angle to [0, 2π). */
export function wrapTwoPi(a: number): number {
  const r = a % (2 * Math.PI);
  return r < 0 ? r + 2 * Math.PI : r;
}

/** Smallest angle between two lines (directions taken mod 180°), in [0, π/2]. */
export function axialAngle(a: Vec2, b: Vec2): number {
  const c = Math.abs(dot(normalize(a), normalize(b)));
  return Math.acos(Math.min(1, c));
}

/**
 * Intersection of the infinite lines `p + t·d` and `q + s·e`, or null if they are parallel.
 */
export function intersectLines(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, scale(d, t));
}

export const isFiniteVec2 = (v: unknown): v is Vec2 =>
  typeof v === 'object' &&
  v !== null &&
  Number.isFinite((v as Vec2).x) &&
  Number.isFinite((v as Vec2).z);
