/**
 * Where ViroReact's planes are in the world (see viro-anchor.ts for what Viro sends and how that
 * was settled from its source).
 *
 * Detected planes no longer make walls by themselves: plain walls are rarely found on phones
 * without a depth sensor, and desks, beds, doors and screens are. They are drawn in the debug
 * overlay and written to the scan log, and the debug panel's "Use detected walls (test)" switch
 * lets the ones that line up with the room's axes join the marked walls.
 */
import {
  applyMat3,
  rotationMatrixFromEuler,
  type EulerOrder,
  type Mat3,
  type Vec2,
  type Vec3,
} from '@youngvista/core';
import type { TrackedPlane } from './viro-anchor';

/** Viro's Euler order for anchor rotations: R = Rz·Ry·Rx (VROQuaternion::toEuler). */
export const VIRO_EULER_ORDER: EulerOrder = 'ZYX';

/** How Viro reports a plane's `center`: in world space (iPhone) or the anchor's space (Android). */
export type CenterSpace = 'world' | 'local';

export const planeRotation = (plane: TrackedPlane, order: EulerOrder): Mat3 =>
  rotationMatrixFromEuler(plane.anchor.rotationDeg, order);

/** The plane's normal (the anchor's +Y) in the world. */
export const planeNormal = (plane: TrackedPlane, order: EulerOrder): Vec3 =>
  applyMat3(planeRotation(plane, order), [0, 1, 0]);

/** Height of a level plane: its anchor's origin lies on the plane on both platforms. */
export const planeHeight = (plane: TrackedPlane): number => plane.anchor.position[1];

/** Area of the plane's extent rectangle (m²). */
export const planeArea = (plane: TrackedPlane): number => plane.anchor.width * plane.anchor.height;

/** Angle between the plane's normal and the horizontal (0 for a wall, 90 for a floor). */
export function planeTiltDeg(plane: TrackedPlane, order: EulerOrder): number {
  const n = planeNormal(plane, order);
  return (Math.asin(Math.min(1, Math.abs(n.y))) * 180) / Math.PI;
}

/** The centre of the plane's extent in the world. */
export function planeWorldCenter(
  plane: TrackedPlane,
  order: EulerOrder,
  centerSpace: CenterSpace,
): Vec3 {
  const [cx, cy, cz] = plane.anchor.center;
  if (centerSpace === 'world') return { x: cx, y: cy, z: cz };
  const [px, py, pz] = plane.anchor.position;
  const c = applyMat3(planeRotation(plane, order), plane.anchor.center);
  return { x: px + c.x, y: py + c.y, z: pz + c.z };
}

/** The plane's boundary vertices in the world. */
export function planeWorldVertices(plane: TrackedPlane, order: EulerOrder): Vec3[] {
  const R = planeRotation(plane, order);
  const [px, py, pz] = plane.anchor.position;
  const v = plane.vertices;
  const out: Vec3[] = [];
  for (let k = 0; k + 2 < v.length; k += 3) {
    const p = applyMat3(R, [v[k]!, v[k + 1]!, v[k + 2]!]);
    out.push({ x: px + p.x, y: py + p.y, z: pz + p.z });
  }
  return out;
}

/** The corners of the plane's extent rectangle in the world (when it has no vertices). */
export function planeExtentCorners(
  plane: TrackedPlane,
  order: EulerOrder,
  centerSpace: CenterSpace,
): Vec3[] {
  const R = planeRotation(plane, order);
  const c = planeWorldCenter(plane, order, centerSpace);
  const x = applyMat3(R, [plane.anchor.width / 2, 0, 0]);
  const z = applyMat3(R, [0, 0, plane.anchor.height / 2]);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => ({
    x: c.x + sx! * x.x + sz! * z.x,
    y: c.y + sx! * x.y + sz! * z.y,
    z: c.z + sx! * x.z + sz! * z.z,
  }));
}

/** A vertical plane as a wall on the floor plan. */
export interface PlaneWallLine {
  planeId: string;
  /** Along the wall (unit). */
  direction: Vec2;
  /** The wall's horizontal normal (unit), the way the plane's normal points. */
  normal: Vec2;
  /** A point on the wall's floor line: below the anchor's origin. */
  point: Vec2;
  /** The plane's stretch along `direction`, measured from `point` (m). */
  from: number;
  to: number;
  tiltDeg: number;
}

/** Planes tilted more than this from vertical are not walls (degrees). */
export const MAX_WALL_TILT_DEG = 15;

/**
 * Where a vertical plane meets the floor: its direction comes from the normal (whatever the
 * anchor's x and z axes do), its stretch from the vertices (or the extent rectangle).
 */
export function planeWallLine(
  plane: TrackedPlane,
  order: EulerOrder,
  centerSpace: CenterSpace,
): PlaneWallLine | null {
  const n = planeNormal(plane, order);
  const h = Math.hypot(n.x, n.z);
  const tiltDeg = (Math.atan2(Math.abs(n.y), h) * 180) / Math.PI;
  if (!(h > 1e-6) || tiltDeg > MAX_WALL_TILT_DEG) return null;
  const normal = { x: n.x / h, z: n.z / h };
  const direction = { x: -normal.z, z: normal.x };
  const point = { x: plane.anchor.position[0], z: plane.anchor.position[2] };
  const corners =
    plane.vertices.length >= 9
      ? planeWorldVertices(plane, order)
      : planeExtentCorners(plane, order, centerSpace);
  let from = Infinity;
  let to = -Infinity;
  for (const c of corners) {
    const t = (c.x - point.x) * direction.x + (c.z - point.z) * direction.z;
    from = Math.min(from, t);
    to = Math.max(to, t);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { planeId: plane.id, direction, normal, point, from, to, tiltDeg };
}
