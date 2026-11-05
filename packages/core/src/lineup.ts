/**
 * AR line-up: put the saved room where the real room is in the live AR session.
 *
 * The user taps two of the room's corners on the AR floor (the app shows which ones on the plan,
 * e.g. the ends of the longest wall, see `lineUpCorners`). From those corners in room space and the
 * taps in AR world space, `lineUpFromCorners` finds the rigid transform that carries room
 * coordinates into the AR world: a turn about +Y and a shift, never a scale. It also reports how
 * well the distance between the taps matches the distance between the corners.
 *
 * In ViroReact, wrap the room and its furniture in
 * `<ViroNode position={[lineUp.x, lineUp.y, lineUp.z]} rotation={[0, lineUp.rotationY, 0]}>`, or
 * convert single points and poses with `applyLineUp` and `lineUpPose`.
 */
import type { Room, Vec2 } from './types';
import type { Point } from './polygon';
import { normalizeDegrees, type Pose } from './placement';
import { toDegrees, toRadians } from './vec';

/** Room space → AR world. */
export interface LineUp {
  /** Turn about +Y in degrees (the same sense as `DesignItem.rotationY`). */
  rotationY: number;
  /** Where the room's origin lands in the AR world (m); `y` is the AR floor's height. */
  x: number;
  y: number;
  z: number;
}

export type LineUpQuality = 'good' | 'fair' | 'poor';
export type LineUpIssue = 'corners-too-close' | 'distance-mismatch';

export interface LineUpResult extends LineUp {
  /** Distance between the chosen corners in the saved room (m). */
  roomDistance: number;
  /** Distance between the taps (m). */
  tappedDistance: number;
  /** |tapped / room − 1|: 0 is a perfect match, 0.05 means the taps are 5% too far apart or close. */
  mismatch: number;
  /** Largest gap between a tap and its corner after the line-up (m). */
  residual: number;
  /**
   * `good`: mismatch up to 3% with corners at least 1.5 m apart. `fair`: up to 8% and 0.75 m.
   * Otherwise `poor`: ask the user to tap again (`issues` says why).
   */
  quality: LineUpQuality;
  issues: LineUpIssue[];
}

/** A tap on the AR floor: `[x, y, z]`, `{ x, y, z }`, or a floor point `[x, z]` / `{ x, z }`. */
export type FloorTap =
  | readonly [number, number, number]
  | readonly [number, number]
  | { x: number; y?: number; z: number };

const GOOD = { mismatch: 0.03, distance: 1.5 };
const FAIR = { mismatch: 0.08, distance: 0.75 };

function readTap(p: FloorTap): { x: number; z: number; y: number | null } {
  if (Array.isArray(p)) {
    return p.length === 3 ? { x: p[0]!, y: p[1]!, z: p[2]! } : { x: p[0]!, y: null, z: p[1]! };
  }
  const o = p as { x: number; y?: number; z: number };
  return { x: o.x, z: o.z, y: typeof o.y === 'number' ? o.y : null };
}

const readPoint = (p: Point | Vec2): Vec2 => (Array.isArray(p) ? { x: p[0], z: p[1] } : p);

/** Turns (x, z) about +Y by `deg` degrees: +X goes toward -Z, +Z toward +X. */
function rotateY(p: Vec2, deg: number): Vec2 {
  const r = toRadians(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
}

/**
 * Least-squares line-up from two or more matching points (room corner ↔ AR tap). Null when the
 * points are fewer than two, not finite, or all in one spot.
 */
export function lineUpFromPairs(
  pairs: readonly { room: Point | Vec2; tapped: FloorTap }[],
  options: { floorY?: number } = {},
): LineUpResult | null {
  if (pairs.length < 2) return null;
  const rooms = pairs.map((p) => readPoint(p.room));
  const taps = pairs.map((p) => readTap(p.tapped));
  const finite = (v: number) => Number.isFinite(v);
  if (!rooms.every((p) => finite(p.x) && finite(p.z))) return null;
  if (!taps.every((p) => finite(p.x) && finite(p.z) && (p.y === null || finite(p.y)))) return null;

  const mean = (vs: readonly { x: number; z: number }[]) => ({
    x: vs.reduce((s, v) => s + v.x, 0) / vs.length,
    z: vs.reduce((s, v) => s + v.z, 0) / vs.length,
  });
  const rc = mean(rooms);
  const tc = mean(taps);
  let sumDot = 0;
  let sumCross = 0;
  let sumRoom2 = 0;
  for (let i = 0; i < rooms.length; i++) {
    const u = { x: rooms[i]!.x - rc.x, z: rooms[i]!.z - rc.z };
    const v = { x: taps[i]!.x - tc.x, z: taps[i]!.z - tc.z };
    sumDot += v.x * u.x + v.z * u.z;
    sumCross += v.x * u.z - v.z * u.x;
    sumRoom2 += u.x * u.x + u.z * u.z;
  }
  if (sumRoom2 < 1e-12 || Math.hypot(sumDot, sumCross) < 1e-12) return null;
  const rotationY = normalizeDegrees(toDegrees(Math.atan2(sumCross, sumDot)));
  const turned = rotateY(rc, rotationY);
  const ys = taps.map((t) => t.y).filter((y): y is number => y !== null);
  const y = options.floorY ?? (ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : 0);
  const lineUp: LineUp = { rotationY, x: tc.x - turned.x, y, z: tc.z - turned.z };

  // Scale the taps would need: Σ v·R(u) / Σ |u|². For two points this is tapped / room distance.
  const scale = Math.hypot(sumDot, sumCross) / sumRoom2;
  const mismatch = Math.abs(scale - 1);
  let residual = 0;
  for (let i = 0; i < rooms.length; i++) {
    const w = applyLineUp(lineUp, rooms[i]!);
    residual = Math.max(residual, Math.hypot(w.x - taps[i]!.x, w.z - taps[i]!.z));
  }
  let roomDistance = 0;
  let tappedDistance = 0;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const d = Math.hypot(rooms[i]!.x - rooms[j]!.x, rooms[i]!.z - rooms[j]!.z);
      if (d > roomDistance) {
        roomDistance = d;
        tappedDistance = Math.hypot(taps[i]!.x - taps[j]!.x, taps[i]!.z - taps[j]!.z);
      }
    }
  }
  const issues: LineUpIssue[] = [];
  if (roomDistance < GOOD.distance) issues.push('corners-too-close');
  if (mismatch > GOOD.mismatch) issues.push('distance-mismatch');
  const quality: LineUpQuality = !issues.length
    ? 'good'
    : mismatch <= FAIR.mismatch && roomDistance >= FAIR.distance
      ? 'fair'
      : 'poor';
  return { ...lineUp, roomDistance, tappedDistance, mismatch, residual, quality, issues };
}

/**
 * Line-up from two room corners and the same two corners tapped on the AR floor, in the same
 * order. The AR floor height comes from the taps' y (or `floorY`).
 */
export function lineUpFromCorners(
  corners: readonly [Point | Vec2, Point | Vec2],
  tapped: readonly [FloorTap, FloorTap],
  options: { floorY?: number } = {},
): LineUpResult | null {
  return lineUpFromPairs(
    [
      { room: corners[0], tapped: tapped[0] },
      { room: corners[1], tapped: tapped[1] },
    ],
    options,
  );
}

/** Corners to ask the user to tap: the two ends of the longest wall, as indices into `room.points`. */
export function lineUpCorners(room: Room): [number, number] | null {
  let best: [number, number] | null = null;
  let bestLength = 0;
  for (const w of room.walls) {
    const a = room.points[w.a];
    const b = room.points[w.b];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLength) {
      bestLength = len;
      best = [w.a, w.b];
    }
  }
  return best;
}

/** A point on the room's floor, in AR world coordinates. */
export function applyLineUp(lineUp: LineUp, p: Point | Vec2): Vec2 {
  const t = rotateY(readPoint(p), lineUp.rotationY);
  return { x: t.x + lineUp.x, z: t.z + lineUp.z };
}

/** An AR world point on the floor, in room coordinates. */
export function applyLineUpInverse(lineUp: LineUp, p: Point | Vec2): Vec2 {
  const q = readPoint(p);
  return rotateY({ x: q.x - lineUp.x, z: q.z - lineUp.z }, -lineUp.rotationY);
}

/** The transform that undoes `lineUp` (AR world → room space). */
export function invertLineUp(lineUp: LineUp): LineUp {
  const t = rotateY({ x: lineUp.x, z: lineUp.z }, -lineUp.rotationY);
  return { rotationY: normalizeDegrees(-lineUp.rotationY), x: -t.x, y: -lineUp.y, z: -t.z };
}

/** A furniture pose in room space (`DesignItem`) as a pose in the AR world. */
export function lineUpPose(lineUp: LineUp, pose: Pose): Pose {
  const p = applyLineUp(lineUp, pose);
  return { x: p.x, z: p.z, rotationY: normalizeDegrees(pose.rotationY + lineUp.rotationY) };
}

/** A pose in the AR world (after the user moved an item in AR) back in room space. */
export function lineUpPoseInverse(lineUp: LineUp, pose: Pose): Pose {
  const p = applyLineUpInverse(lineUp, pose);
  return { x: p.x, z: p.z, rotationY: normalizeDegrees(pose.rotationY - lineUp.rotationY) };
}
