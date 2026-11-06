/**
 * Camera geometry for the scan: the ray through the dot in the middle of the screen, where the
 * phone is on the floor plan and which way it faces.
 *
 * World space follows core: Y up, the floor on the XZ plane. Angles are degrees counter-clockwise
 * from +X seen from above (core's `angleAboveDeg`), so a positive turn is a turn to the left.
 */
import { angleAboveDeg, type CameraRay, type Vec2 } from '@youngvista/core';
import type { CameraPose } from './viro-anchor';

/** A ray from the camera through the middle of the screen. */
export type Ray = CameraRay;

export const rayFromCamera = (pose: CameraPose): Ray => ({
  origin: pose.position,
  direction: pose.forward,
});

/** The camera's position on the floor plan. */
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

export type TurnDirection = 'left' | 'right' | 'ahead' | 'behind';

/** Which way to turn from `heading` to face `targetDeg` (both degrees, see the header). */
export function turnToward(heading: number, targetDeg: number): TurnDirection {
  const delta = wrapDeg180(targetDeg - heading);
  if (Math.abs(delta) <= 35) return 'ahead';
  if (Math.abs(delta) >= 145) return 'behind';
  return delta > 0 ? 'left' : 'right';
}
