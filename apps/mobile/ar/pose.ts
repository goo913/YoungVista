/**
 * The AR world and room space.
 *
 * The AR world is ViroReact's: metres, Y up, its origin where the session started. Room space is
 * core's: the outline on XZ, the floor at y = 0. A `LineUp` (core's lineup.ts) carries room space
 * into the world: a turn about +Y and a shift. The AR scene wraps the room and its furniture in one
 * node with that transform, so everything inside it is drawn in room space; only what the user
 * points at (the dot on the floor, a finger on the screen) comes in world space and is turned
 * into room space here, before the design's own rules (`resolvePlacement`) and its autosave see it.
 *
 * Right after a scan, in the same AR session, the saved room needs no line-up: the scan's solver
 * (core's `solveRectilinearRoom`) works in the room's own frame and turns its corners back into
 * world coordinates with `fromRoomFrame`, and nothing recentres them, so a saved room's points are
 * the scan's world XZ. Only the floor height is missing, and the review screen's tape correction
 * (`scaleRoom`) may have scaled the room about the middle of its outline.
 */
import {
  applyLineUp,
  applyLineUpInverse,
  bounds,
  facingRotation,
  lineUpPose,
  lineUpPoseInverse,
  type LineUp,
  type Pose,
  type Room,
  type Vec2,
} from '@youngvista/core';
import type { Ray } from '@/furnish/orbit';

export type V3 = [number, number, number];

/** The line-up right after a scan, in the same AR session: the room as it is, on the floor. */
export const scanLineUp = (floorY: number): LineUp => ({ rotationY: 0, x: 0, y: floorY, z: 0 });

/**
 * How far off the scan's own line-up can be at the room's corners (m). Zero, unless the review
 * screen rescaled the room by `scaleFactor` to a tape measure: `scaleRoom` keeps the middle of
 * the outline where it is and moves each corner by |1 − 1/f| of its distance from there.
 */
export function scanLineUpOffset(room: Room, scaleFactor: number): number {
  if (!(scaleFactor > 0) || !Number.isFinite(scaleFactor) || Math.abs(scaleFactor - 1) < 1e-9) {
    return 0;
  }
  const b = bounds(room.points);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const far = room.points.reduce((m, [x, z]) => Math.max(m, Math.hypot(x - cx, z - cz)), 0);
  return far * Math.abs(1 - 1 / scaleFactor);
}

/** The same line-up standing on a floor found at another height (the floor plane was refined). */
export const onFloor = (lineUp: LineUp, floorY: number): LineUp =>
  lineUp.y === floorY ? lineUp : { ...lineUp, y: floorY };

/** The ray through two points (from `near` toward `far`), or null when they are the same. */
export function rayThrough(near: V3, far: V3): Ray | null {
  const d: V3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  if (!(l > 1e-9) || !near.every(Number.isFinite)) return null;
  return { origin: near, dir: [d[0] / l, d[1] / l, d[2] / l] };
}

/** A world ray in room space. */
export function rayToRoom(lineUp: LineUp, ray: Ray): Ray {
  const o = applyLineUpInverse(lineUp, { x: ray.origin[0], z: ray.origin[2] });
  const d = applyLineUpInverse(
    { rotationY: lineUp.rotationY, x: 0, y: 0, z: 0 },
    { x: ray.dir[0], z: ray.dir[2] },
  );
  return { origin: [o.x, ray.origin[1] - lineUp.y, o.z], dir: [d.x, ray.dir[1], d.z] };
}

/** A room point in the world, at height `y` above the room's floor. */
export function roomToWorld(lineUp: LineUp, p: Vec2, y = 0): V3 {
  const w = applyLineUp(lineUp, p);
  return [w.x, lineUp.y + y, w.z];
}

/** A floor point in the world, in room space. */
export const worldToRoom = (lineUp: LineUp, p: Vec2): Vec2 => applyLineUpInverse(lineUp, p);

/** Floor points further than this from the camera are not used to place or move furniture (m). */
export const MAX_FLOOR_REACH = 8;

/**
 * Where a ray meets the floor at height `y`, or null when it points up, or meets it further than
 * `maxReach` from the ray's origin along the floor.
 */
export function rayFloorHit(ray: Ray, y = 0, maxReach = MAX_FLOOR_REACH): Vec2 | null {
  if (!(ray.dir[1] < -1e-6)) return null;
  const t = (y - ray.origin[1]) / ray.dir[1];
  if (!(t > 0)) return null;
  const p = { x: ray.origin[0] + ray.dir[0] * t, z: ray.origin[2] + ray.dir[2] * t };
  return Math.hypot(p.x - ray.origin[0], p.z - ray.origin[2]) <= maxReach ? p : null;
}

/**
 * The room pose for a new piece put down at `point` (where the dot meets the floor, world),
 * turned to face the phone at `camera` (world floor position): its front looks at the user.
 * A pose in the world is carried into the room with `lineUpPoseInverse`.
 */
export function placementPose(lineUp: LineUp, point: Vec2, camera: Vec2 | null): Pose {
  const toward = camera ? { x: camera.x - point.x, z: camera.z - point.z } : null;
  const rotationY = toward && Math.hypot(toward.x, toward.z) > 1e-3 ? facingRotation(toward) : 0;
  return lineUpPoseInverse(lineUp, { x: point.x, z: point.z, rotationY });
}

/** A pose in room space as it stands in the world. */
export const poseInWorld = (lineUp: LineUp, pose: Pose): Pose => lineUpPose(lineUp, pose);

/** A pose in the world (moved there in AR) back in room space, ready to save. */
export const poseInRoom = (lineUp: LineUp, pose: Pose): Pose => lineUpPoseInverse(lineUp, pose);

/**
 * Which way the phone looks along the floor (world, not unit length), or null when it cannot
 * tell. Looking nearly straight down, the top of the screen points the way the user faces (as
 * scan/geometry.ts's `headingDeg` reads it).
 */
export function aheadOnFloor(pose: {
  forward: readonly [number, number, number];
  up: readonly [number, number, number];
}): Vec2 | null {
  const [fx, fy, fz] = pose.forward;
  let x = fx;
  let z = fz;
  if (Math.hypot(fx, fz) < 0.25) {
    const s = fy < 0 ? 1 : -1;
    x = pose.up[0] * s;
    z = pose.up[2] * s;
  }
  return Math.hypot(x, z) < 1e-3 ? null : { x, z };
}

/** True when two line-ups put the room in the same place, to within a millimetre or so. */
export function sameLineUp(a: LineUp | null, b: LineUp | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const turn = Math.abs(((a.rotationY - b.rotationY + 540) % 360) - 180);
  return (
    turn < 0.02 &&
    Math.abs(a.x - b.x) < 0.001 &&
    Math.abs(a.y - b.y) < 0.001 &&
    Math.abs(a.z - b.z) < 0.001
  );
}
