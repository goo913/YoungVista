/**
 * Camera geometry for the scan: where the centre of the screen meets the floor, which way the
 * phone is facing, and which way to turn to find the next wall.
 *
 * World space follows core: Y up, the floor on the XZ plane. Angles are degrees counter-clockwise
 * from +X seen from above (core's `angleAboveDeg`), so a positive turn is a turn to the left.
 */
import { angleAboveDeg, type CoverageResult, type Vec2, type Vec3Tuple } from '@youngvista/core';
import type { CameraPose } from './viro-anchor';

/** A ray from the camera through the middle of the screen. */
export interface Ray {
  origin: Vec3Tuple;
  direction: Vec3Tuple;
}

/** Points further than this along the floor are too far to place reliably (m). */
export const MAX_FLOOR_HIT_DISTANCE = 8;

/** The ray must point at least this far below the horizon (direction.y), about 3 degrees. */
const MIN_DOWNWARD = 0.05;

export type FloorHit =
  { ok: true; point: Vec2; distance: number } | { ok: false; reason: 'aim-lower' | 'too-far' };

export const rayFromCamera = (pose: CameraPose): Ray => ({
  origin: pose.position,
  direction: pose.forward,
});

/** Where `ray` meets the floor plane y = `floorY`, measured along the floor from the camera. */
export function intersectFloor(
  ray: Ray,
  floorY: number,
  maxDistance = MAX_FLOOR_HIT_DISTANCE,
): FloorHit {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0) || !Number.isFinite(floorY)) return { ok: false, reason: 'aim-lower' };
  const uy = dy / len;
  if (uy > -MIN_DOWNWARD) return { ok: false, reason: 'aim-lower' };
  const t = (floorY - oy) / uy; // distance along the unit ray
  if (!(t > 0)) return { ok: false, reason: 'aim-lower' };
  const x = ox + (dx / len) * t;
  const z = oz + (dz / len) * t;
  const distance = Math.hypot(x - ox, z - oz);
  if (distance > maxDistance) return { ok: false, reason: 'too-far' };
  return { ok: true, point: { x, z }, distance };
}

/** The camera's position on the floor (top view). */
export const floorPosition = (pose: CameraPose): Vec2 => ({
  x: pose.position[0],
  z: pose.position[2],
});

/**
 * Which way the phone faces on the floor plan, in degrees (see the header), or null when it
 * cannot tell. Looking straight down at the floor, the top of the phone gives the heading.
 */
export function headingDeg(pose: CameraPose): number | null {
  const [fx, fy, fz] = pose.forward;
  const [ux, , uz] = pose.up;
  let hx = fx;
  let hz = fz;
  if (Math.hypot(fx, fz) < 0.25) {
    // Nearly vertical: when looking down, "up" on the screen points the way the user faces.
    const s = fy < 0 ? 1 : -1;
    hx = ux * s;
    hz = uz * s;
  }
  if (Math.hypot(hx, hz) < 1e-3) return null;
  return angleAboveDeg({ x: hx, z: hz });
}

/** Wraps an angle in degrees to (-180, 180]. */
export function wrapDeg180(deg: number): number {
  let d = deg % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

export type TurnDirection = 'left' | 'right' | 'ahead';

export interface TurnHint {
  direction: TurnDirection;
  /** How far to turn (0 when the gap is ahead). */
  degrees: number;
  /** The direction of the gap's middle (degrees, see the header). */
  targetDeg: number;
  text: string;
}

const TURN_TEXT: Record<TurnDirection, string> = {
  left: 'Turn left to find the next wall',
  right: 'Turn right to find the next wall',
  ahead: 'The next wall is ahead: point at it, or mark it',
};

/**
 * Which way to turn toward the biggest part of the room that has no wall yet. Null before the
 * first wall, when the room is closed, or when the heading is unknown.
 */
export function turnHint(heading: number | null, cover: CoverageResult | null): TurnHint | null {
  if (heading === null || !cover || cover.wallCount === 0 || cover.closed) return null;
  const gap = cover.gaps.find((g) => !g.bridged);
  if (!gap) return null;
  const delta = wrapDeg180(gap.centerDeg - heading);
  if (Math.abs(delta) <= gap.sizeDeg / 2) {
    return { direction: 'ahead', degrees: 0, targetDeg: gap.centerDeg, text: TURN_TEXT.ahead };
  }
  const direction = delta > 0 ? 'left' : 'right';
  return {
    direction,
    degrees: Math.abs(delta),
    targetDeg: gap.centerDeg,
    text: TURN_TEXT[direction],
  };
}
