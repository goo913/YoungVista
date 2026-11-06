/**
 * Rooms from wall marks: how a phone without a depth sensor scans a room.
 *
 * Plain walls are hard to find with a normal phone camera, but the floor is easy and the camera
 * pose is accurate. So the user marks each wall once while turning around the room: they aim the
 * dot in the middle of the screen at the wall's bottom edge (where it meets the floor) or its top
 * edge (where it meets the ceiling) and tap. A mark is that camera ray; where it meets the floor
 * or the ceiling is a point on the wall's line, seen from above.
 *
 * 1. The first wall is marked twice, at two spots along its bottom edge. That gives the room's
 *    two directions (`RoomAxes`): along that wall (axis 0) and square to it (axis 1). Rooms are
 *    taken to be rectilinear: every wall runs along one of the two.
 * 2. Every other wall needs one mark (`placeMark`). Its axis is the one most nearly square to the
 *    view (the user faces the wall), and it faces the camera (the user stands in the room).
 * 3. `groupWallMarks` averages marks of the same wall (same axis and facing, lines within 15 cm)
 *    and turns the axes a little to fit walls whose marks are far apart.
 * 4. `solveRectilinearRoom` joins the walls into a closed outline: a rectangle, an L-shape or any
 *    other room whose walls meet at right angles. The wall lines cut the floor into a grid of
 *    cells. A mark says the cell in front of its wall is in the room and the cell behind it is
 *    not. Where a wall's line runs through the room without the wall (the line of an L-shape's
 *    inner wall), the room continues on both sides, but the room never lies only behind a line:
 *    when the cell behind a stretch of line is in the room, so is the cell in front. The room is
 *    the smallest set of cells that follows; marks that cannot all be true are a conflict.
 *
 * World space as everywhere in core: Y up, the floor plan on XZ (see types.ts).
 */
import type { Vec3Tuple } from './plane';
import { bounds, signedArea, validateRoomShape } from './polygon';
import { DEFAULT_CEILING_HEIGHT, roomArea, roomFromPoints, wallLengths } from './room';
import type { Room, UnitSystem, Vec2 } from './types';
import { formatArea, formatLength } from './units';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------------------------------ */
/* Rays                                                                                        */
/* ------------------------------------------------------------------------------------------ */

/** A camera ray through the middle of the screen, world space (metres). */
export interface CameraRay {
  origin: Vec3Tuple;
  /** Need not be unit length. */
  direction: Vec3Tuple;
}

/** Which edge of a wall a mark aims at: where it meets the floor, or where it meets the ceiling. */
export type WallEdge = 'floor' | 'ceiling';

/** A ray must point at least this far below (floor) or above (ceiling) the horizon (degrees). */
export const MIN_EDGE_ELEVATION_DEG = 4;
/** Marks further than this from the camera, along the floor, are too far to be accurate (m). */
export const MAX_MARK_DISTANCE = 6;

type V3 = [number, number, number];

function unit3(d: Vec3Tuple): V3 | null {
  const l = Math.hypot(d[0], d[1], d[2]);
  return Number.isFinite(l) && l > 1e-9 ? [d[0] / l, d[1] / l, d[2] / l] : null;
}

const finite3 = (v: Vec3Tuple): boolean => v.every((n) => Number.isFinite(n));

/** Degrees above (positive) or below (negative) the horizon. */
export function rayElevationDeg(ray: CameraRay): number {
  const d = unit3(ray.direction);
  return d ? Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG : 0;
}

/** The edge a ray aims at: the floor edge below the horizon, the ceiling edge above it. */
export function edgeForRay(
  ray: CameraRay,
  minElevationDeg = MIN_EDGE_ELEVATION_DEG,
): WallEdge | null {
  const e = rayElevationDeg(ray);
  if (e <= -minElevationDeg) return 'floor';
  if (e >= minElevationDeg) return 'ceiling';
  return null;
}

export type PlaneHit =
  | { ok: true; point: Vec2; distance: number }
  | { ok: false; reason: 'aim-lower' | 'aim-higher' | 'too-far' };

/**
 * Where `ray` meets the level plane at height `y` (the floor, or the ceiling), and how far that
 * is from the camera along the floor.
 */
export function hitLevelPlane(
  ray: CameraRay,
  y: number,
  maxDistance = MAX_MARK_DISTANCE,
  minElevationDeg = MIN_EDGE_ELEVATION_DEG,
): PlaneHit {
  const [ox, oy, oz] = ray.origin;
  const below = !(y >= oy);
  const wrongWay = { ok: false, reason: below ? 'aim-lower' : 'aim-higher' } as const;
  const d = unit3(ray.direction);
  if (!d || !Number.isFinite(y) || !finite3(ray.origin)) return wrongWay;
  const minSin = Math.sin(minElevationDeg * DEG);
  if (below ? d[1] > -minSin : d[1] < minSin) return wrongWay;
  const t = (y - oy) / d[1];
  const point = { x: ox + d[0] * t, z: oz + d[2] * t };
  const distance = Math.hypot(point.x - ox, point.z - oz);
  if (!(distance <= maxDistance)) return { ok: false, reason: 'too-far' };
  return { ok: true, point, distance };
}

export interface WallPlaneHit {
  point: V3;
  /** Position of the hit along the line from `a` toward `b` (m; 0 at `a`). */
  along: number;
  /** Length of the line from `a` to `b`. */
  length: number;
  /** Distance from the camera along the floor (m). */
  distance: number;
}

/** Where `ray` meets the vertical plane standing on the floor line from `a` to `b`. */
export function hitWallPlane(ray: CameraRay, a: Vec2, b: Vec2): WallPlaneHit | null {
  const d = unit3(ray.direction);
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (!d || !finite3(ray.origin) || !(length > 1e-6)) return null;
  const tx = (b.x - a.x) / length;
  const tz = (b.z - a.z) / length;
  const nx = -tz;
  const nz = tx;
  const denom = d[0] * nx + d[2] * nz;
  if (Math.abs(denom) < 1e-6) return null;
  const [ox, oy, oz] = ray.origin;
  const t = ((a.x - ox) * nx + (a.z - oz) * nz) / denom;
  if (!(t > 0)) return null;
  const point: V3 = [ox + d[0] * t, oy + d[1] * t, oz + d[2] * t];
  return {
    point,
    along: (point[0] - a.x) * tx + (point[2] - a.z) * tz,
    length,
    distance: Math.hypot(point[0] - ox, point[2] - oz),
  };
}

/** Lowest and highest ceiling a measurement may give (m): about 5′ 11″ to 19′ 8″. */
export const MEASURED_CEILING_MIN = 1.8;
export const MEASURED_CEILING_MAX = 6;
/** The top edge may be aimed at this far beyond the marked part of the wall (m). */
const CEILING_ALONG_MARGIN = 2;

export type CeilingMeasurement =
  | { ok: true; height: number; point: V3; distance: number }
  | { ok: false; reason: 'aim-higher' | 'not-this-wall' | 'too-far' | 'not-a-ceiling' };

/**
 * The ceiling height from a ray aimed at the top of the wall whose bottom edge runs from `a` to
 * `b`: where the ray meets that wall, above the floor at `floorY`.
 */
export function measureCeiling(
  ray: CameraRay,
  floorY: number,
  a: Vec2,
  b: Vec2,
  maxDistance = MAX_MARK_DISTANCE,
): CeilingMeasurement {
  if (edgeForRay(ray) !== 'ceiling') return { ok: false, reason: 'aim-higher' };
  const hit = hitWallPlane(ray, a, b);
  if (!hit || hit.along < -CEILING_ALONG_MARGIN || hit.along > hit.length + CEILING_ALONG_MARGIN) {
    return { ok: false, reason: 'not-this-wall' };
  }
  if (hit.distance > maxDistance) return { ok: false, reason: 'too-far' };
  const height = hit.point[1] - floorY;
  if (!(height >= MEASURED_CEILING_MIN && height <= MEASURED_CEILING_MAX)) {
    return { ok: false, reason: 'not-a-ceiling' };
  }
  return { ok: true, height, point: hit.point, distance: hit.distance };
}

/* ------------------------------------------------------------------------------------------ */
/* The room's directions                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** The room's two directions on the floor plan: along the first wall, and square to it. */
export interface RoomAxes {
  /** Axis 0: along the first wall (unit vector). */
  u: Vec2;
  /** Axis 1: `u` turned 90° from +X toward +Z. */
  v: Vec2;
}

/** The two marks of the first wall must be at least this far apart (m). */
export const MIN_FIRST_WALL_SPAN = 0.5;

/** Axes whose `u` points `angleRad` from +X toward +Z. */
export function roomAxes(angleRad: number): RoomAxes {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { u: { x: c, z: s }, v: { x: -s, z: c } };
}

/** The angle of `u` from +X toward +Z (radians). */
export const axesAngle = (axes: RoomAxes): number => Math.atan2(axes.u.z, axes.u.x);

/** Axes along the line from `a` to `b`, or null when the points are (almost) the same. */
export function axesThrough(a: Vec2, b: Vec2): RoomAxes | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.hypot(dx, dz) > 1e-6 ? roomAxes(Math.atan2(dz, dx)) : null;
}

/** 0: the wall runs along `u`; 1: along `v`. */
export type WallAxis = 0 | 1;
/** Which side of its line the room is on: +1 the side the normal points to, -1 the other. */
export type WallFacing = 1 | -1;

/** The direction a wall on `axis` runs in. */
export const wallDirection = (axes: RoomAxes, axis: WallAxis): Vec2 =>
  axis === 0 ? axes.u : axes.v;
/** The normal of a wall on `axis`; its line is `p · normal = offset`. */
export const wallNormal = (axes: RoomAxes, axis: WallAxis): Vec2 => (axis === 0 ? axes.v : axes.u);

/** A floor-plan point in the room's frame: `[p · u, p · v]`. */
export const toRoomFrame = (axes: RoomAxes, p: Vec2): [number, number] => [
  p.x * axes.u.x + p.z * axes.u.z,
  p.x * axes.v.x + p.z * axes.v.z,
];

/** The floor-plan point at `a` along `u` and `b` along `v`. */
export const fromRoomFrame = (axes: RoomAxes, a: number, b: number): Vec2 => ({
  x: a * axes.u.x + b * axes.v.x,
  z: a * axes.u.z + b * axes.v.z,
});

/** The end points of the stretch from `from` to `to` along a wall's line, on the floor plan. */
export function wallSegment(
  axes: RoomAxes,
  axis: WallAxis,
  offset: number,
  from: number,
  to: number,
): { a: Vec2; b: Vec2 } {
  return axis === 0
    ? { a: fromRoomFrame(axes, from, offset), b: fromRoomFrame(axes, to, offset) }
    : { a: fromRoomFrame(axes, offset, from), b: fromRoomFrame(axes, offset, to) };
}

/* ------------------------------------------------------------------------------------------ */
/* Placing a mark on a wall                                                                    */
/* ------------------------------------------------------------------------------------------ */

/**
 * A wall's axis is the one most nearly square to the view. A view more than this many degrees
 * from square to both (within 15° of the diagonal) could be either wall, and is refused. It was
 * 15° (within 30° of the diagonal) until a real scan showed people aiming at walls from 20-30°
 * and getting refused for a minute; a view 30° from one wall is 60° from the other, so the wall
 * the user faces is still clear, and a mark near a corner is right on either wall.
 */
export const MAX_VIEW_SKEW_DEG = 30;
/** A mark closer than this to the camera, seen from above, has no clear view direction (m). */
const MIN_VIEW_DISTANCE = 0.25;

export interface WallPlacement {
  axis: WallAxis;
  facing: WallFacing;
  /** The wall's line: `p · normal = offset` (m). */
  offset: number;
  /** Where along the wall the mark is: `p · direction` (m). */
  along: number;
  /** Angle between the view and the wall's normal (degrees, 0 when facing it squarely). */
  skewDeg: number;
}

export type PlaceMarkResult =
  ({ ok: true } & WallPlacement) | { ok: false; reason: 'diagonal' | 'too-close'; skewDeg: number };

/**
 * The wall a mark at `point` (seen from the camera at `camera`, both on the floor plan) is on.
 * The wall faces the camera: the user stands inside the room. `options.axis` forces the axis
 * (the first wall's marks) and then any view is accepted.
 */
export function placeMark(
  point: Vec2,
  camera: Vec2,
  axes: RoomAxes,
  options: { axis?: WallAxis; maxSkewDeg?: number } = {},
): PlaceMarkResult {
  const vx = point.x - camera.x;
  const vz = point.z - camera.z;
  const len = Math.hypot(vx, vz);
  if (!(len >= MIN_VIEW_DISTANCE)) return { ok: false, reason: 'too-close', skewDeg: 0 };
  const c0 = (vx * axes.v.x + vz * axes.v.z) / len; // view · normal of axis-0 walls
  const c1 = (vx * axes.u.x + vz * axes.u.z) / len; // view · normal of axis-1 walls
  const axis: WallAxis = options.axis ?? (Math.abs(c0) >= Math.abs(c1) ? 0 : 1);
  const c = axis === 0 ? c0 : c1;
  const skewDeg = Math.acos(Math.min(1, Math.abs(c))) / DEG;
  if (options.axis === undefined && skewDeg > (options.maxSkewDeg ?? MAX_VIEW_SKEW_DEG)) {
    return { ok: false, reason: 'diagonal', skewDeg };
  }
  const n = wallNormal(axes, axis);
  const t = wallDirection(axes, axis);
  return {
    ok: true,
    axis,
    // The room is on the camera's side of the wall, against the view.
    facing: c > 0 ? -1 : 1,
    offset: point.x * n.x + point.z * n.z,
    along: point.x * t.x + point.z * t.z,
    skewDeg,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Marks of the same wall                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** A mark, ready to be grouped into walls. */
export interface WallMarkInput {
  id: string;
  /** Where the mark's ray met the floor or the ceiling, on the floor plan. */
  point: Vec2;
  /** The camera when the mark was made, on the floor plan. */
  camera: Vec2;
  /** The wall's axis, decided when the mark was made (see `placeMark`). */
  axis: WallAxis;
  /** Default 1. */
  weight?: number;
}

/** A wall: one or more marks on the same line. */
export interface MarkedWall {
  axis: WallAxis;
  facing: WallFacing;
  /** The line: `p · normal = offset` (m); the weighted mean of the marks' offsets. */
  offset: number;
  /** The marks on this wall, in the order they were made. */
  markIds: string[];
  /** Where along the wall each mark is (m), same order. */
  along: number[];
  /** Each mark's own offset (m), same order: how well the marks agree. */
  offsets: number[];
  /** Sum of the marks' weights. */
  weight: number;
}

export interface GroupedWalls {
  /** The axes, turned to fit the marks (see `groupWallMarks`). */
  axes: RoomAxes;
  walls: MarkedWall[];
  /** For each input mark, in input order: the index of its wall. */
  wallOf: number[];
}

/** Marks of the same wall whose lines are at most this far apart (m) are averaged. */
export const MERGE_DISTANCE = 0.15;
/** Marks of one wall at least this far apart (m) show which way it runs. */
const MIN_DIRECTION_SPAN = 0.3;
/** The axes never turn further than this from the first wall (degrees). */
const MAX_TURN_DEG = 5;

function clusterMarks(
  marks: readonly WallMarkInput[],
  axes: RoomAxes,
  mergeDistance: number,
): GroupedWalls {
  const walls: MarkedWall[] = [];
  const wallOf: number[] = [];
  for (const m of marks) {
    const n = wallNormal(axes, m.axis);
    const t = wallDirection(axes, m.axis);
    const offset = m.point.x * n.x + m.point.z * n.z;
    const along = m.point.x * t.x + m.point.z * t.z;
    const side = (m.camera.x - m.point.x) * n.x + (m.camera.z - m.point.z) * n.z;
    const facing: WallFacing = side >= 0 ? 1 : -1;
    const weight = Number.isFinite(m.weight) && m.weight! > 0 ? m.weight! : 1;
    let best = -1;
    let bestGap = mergeDistance;
    walls.forEach((w, i) => {
      if (w.axis !== m.axis || w.facing !== facing) return;
      const gap = Math.abs(w.offset - offset);
      if (gap <= bestGap) {
        best = i;
        bestGap = gap;
      }
    });
    if (best < 0) {
      walls.push({
        axis: m.axis,
        facing,
        offset,
        markIds: [m.id],
        along: [along],
        offsets: [offset],
        weight,
      });
      wallOf.push(walls.length - 1);
    } else {
      const w = walls[best]!;
      w.offset = (w.offset * w.weight + offset * weight) / (w.weight + weight);
      w.weight += weight;
      w.markIds.push(m.id);
      w.along.push(along);
      w.offsets.push(offset);
      wallOf.push(best);
    }
  }
  return { axes, walls, wallOf };
}

/**
 * How far (radians) to turn the axes so that walls marked at spots far apart run straight along
 * them. Each such wall's tilt is weighted by how spread out its marks are; the first wall, whose
 * two marks set the axes, has no tilt and holds the axes in place.
 */
function axesTurn(marks: readonly WallMarkInput[], grouped: GroupedWalls): number {
  let sw = 0;
  let st = 0;
  grouped.walls.forEach((wall, i) => {
    const members = marks.filter((_, k) => grouped.wallOf[k] === i);
    if (members.length < 2) return;
    const along = wall.along;
    if (Math.max(...along) - Math.min(...along) < MIN_DIRECTION_SPAN) return;
    let w = 0;
    let ma = 0;
    let mo = 0;
    members.forEach((m, k) => {
      const mw = m.weight ?? 1;
      w += mw;
      ma += mw * along[k]!;
      mo += mw * wall.offsets[k]!;
    });
    ma /= w;
    mo /= w;
    let saa = 0;
    let sao = 0;
    members.forEach((m, k) => {
      const mw = m.weight ?? 1;
      saa += mw * (along[k]! - ma) ** 2;
      sao += mw * (along[k]! - ma) * (wall.offsets[k]! - mo);
    });
    if (!(saa > 1e-9)) return;
    // A wall along u drifting toward v turns the axes forward; a wall along v drifting toward u
    // turns them back.
    const tilt = Math.atan(sao / saa) * (wall.axis === 0 ? 1 : -1);
    sw += saa;
    st += saa * tilt;
  });
  if (!(sw > 0)) return 0;
  const turn = st / sw;
  return Math.max(-MAX_TURN_DEG * DEG, Math.min(MAX_TURN_DEG * DEG, turn));
}

/**
 * Groups marks into walls: a mark joins a wall with the same axis and facing whose line is at
 * most `mergeDistance` away (the closest one), and the wall's line moves to the average. Then the
 * axes turn to fit walls whose marks are far apart (unless `refine` is false) and the marks are
 * grouped again. Marks are taken in input order, so the result only depends on that order.
 */
export function groupWallMarks(
  marks: readonly WallMarkInput[],
  axes: RoomAxes,
  options: { mergeDistance?: number; refine?: boolean } = {},
): GroupedWalls {
  const merge = options.mergeDistance ?? MERGE_DISTANCE;
  const first = clusterMarks(marks, axes, merge);
  if (options.refine === false) return first;
  const turn = axesTurn(marks, first);
  if (Math.abs(turn) < 1e-5) return first;
  return clusterMarks(marks, roomAxes(axesAngle(axes) + turn), merge);
}

/* ------------------------------------------------------------------------------------------ */
/* Joining the walls into a room                                                               */
/* ------------------------------------------------------------------------------------------ */

export interface RectilinearOptions {
  /** Ceiling height of the returned room (m). Default 8 ft. */
  ceilingHeight?: number;
  /** Shortest allowed wall (m). Default 0.2. */
  minWallLength?: number;
  /** Smallest allowed floor area (m²). Default 2. */
  minArea?: number;
  /** A mark this close to a corner (m) does not say which side of the corner its wall is on. Default 0.1. */
  cornerTolerance?: number;
}

export type RectilinearError = 'too-few-walls' | 'open' | 'conflict' | 'shape';

export interface RectilinearSuccess {
  ok: true;
  room: Room;
  /** For each wall of the room (`room.walls` order): the index of the marked wall it lies on. */
  wallSource: number[];
  /** Walls of the room with no mark on them (filled in from the walls around them). */
  inferredWalls: number[];
  /** Marked walls left out to make the others fit (see `solveRoomLeavingOut`). */
  leftOut: number[];
}

export interface RectilinearFailure {
  ok: false;
  error: RectilinearError;
  /** Plain words for the app. */
  reason: string;
  /** For a conflict: the walls (indices) that cannot all be right. */
  conflicting: number[];
}

export type RectilinearResult = RectilinearSuccess | RectilinearFailure;

const REASONS: Record<RectilinearError, string> = {
  'too-few-walls': 'Mark at least four walls: one on each side of the room.',
  open: 'The walls do not close yet. Mark the walls you have not marked.',
  conflict: 'Two marks disagree: the walls in red cannot both be right. Undo the wrong mark.',
  shape: 'The marked walls do not make a room. Undo the last mark and mark that wall again.',
};

const fail = (error: RectilinearError, conflicting: number[] = []): RectilinearFailure => ({
  ok: false,
  error,
  reason: REASONS[error],
  conflicting,
});

const IN = 1;
const OUT = -1;
/** Outside the grid, beyond the outermost walls: never in the room. */
const OUTSIDE = -1;

interface GridLine {
  wall: number;
  at: number;
  facing: WallFacing;
}

/** A mark may be this far past the room's last corner (m) before it contradicts that wall. */
const PAST_CORNER_TOLERANCE = 0.2;

/**
 * Index of the stretch of a line, between two crossing lines, that contains `t`; `sure` is false
 * when `t` is within `tol` of a corner between two stretches. Null when `t` is beyond the
 * outermost crossing lines.
 */
function stretchOf(
  cuts: readonly number[],
  t: number,
  tol: number,
): { index: number; sure: boolean } | null {
  const last = cuts.length - 1;
  const past = Math.max(tol, PAST_CORNER_TOLERANCE);
  if (t < cuts[0]! - past || t > cuts[last]! + past) return null;
  let k = 0;
  while (k < last - 1 && t > cuts[k + 1]!) k++;
  const sure = (k === 0 || t - cuts[k]! >= tol) && (k === last - 1 || cuts[k + 1]! - t >= tol);
  return { index: k, sure };
}

/**
 * Joins walls that run along the room's two axes into a closed outline. Every wall must be part
 * of it, facing the way it was marked, at the spots it was marked: otherwise the result says why
 * not ('too-few-walls', 'open': walls still missing, 'conflict': marks that cannot all be true,
 * 'shape': not one simple room).
 */
export function solveRectilinearRoom(
  walls: readonly MarkedWall[],
  axes: RoomAxes,
  options: RectilinearOptions = {},
): RectilinearResult {
  const tol = options.cornerTolerance ?? 0.1;
  if (walls.length < 4) return fail('too-few-walls');
  const byOffset = (axis: WallAxis): GridLine[] =>
    walls
      .map((w, wall) => ({ wall, at: w.offset, facing: w.facing, axis: w.axis }))
      .filter((l) => l.axis === axis && Number.isFinite(l.at))
      .sort((p, q) => p.at - q.at)
      .map(({ wall, at, facing }) => ({ wall, at, facing }));
  // Walls along v (axis 1) are the grid's columns at a = const; walls along u its rows at b = const.
  const cols = byOffset(1);
  const rows = byOffset(0);
  if (cols.length < 2 || rows.length < 2) return fail('open');
  const nx = cols.length - 1;
  const ny = rows.length - 1;
  const xs = cols.map((c) => c.at);
  const ys = rows.map((r) => r.at);
  const cell = (i: number, j: number): number =>
    i >= 0 && i < nx && j >= 0 && j < ny ? j * nx + i : OUTSIDE;

  // The cells in front of and behind each stretch of each line.
  interface Edge {
    wall: number;
    front: number;
    back: number;
  }
  const rowEdge = (j: number, i: number): Edge => {
    const above = cell(i, j);
    const below = cell(i, j - 1);
    const line = rows[j]!;
    return line.facing === 1
      ? { wall: line.wall, front: above, back: below }
      : { wall: line.wall, front: below, back: above };
  };
  const colEdge = (k: number, j: number): Edge => {
    const right = cell(k, j);
    const left = cell(k - 1, j);
    const line = cols[k]!;
    return line.facing === 1
      ? { wall: line.wall, front: right, back: left }
      : { wall: line.wall, front: left, back: right };
  };

  // Each cell: in the room, not, or unknown, and which wall said so. Beyond the outermost walls
  // nothing is room: if the marks say otherwise, a wall out there has not been marked yet
  // ('open'). Two walls saying opposite things about one cell is a 'conflict'.
  const BEYOND = -2;
  const state = new Int8Array(nx * ny);
  const origin = new Int32Array(nx * ny).fill(-1);
  let conflict: number[] | null = null;
  let open = false;
  let changed = true;
  const set = (c: number, value: number, wall: number) => {
    if (c === OUTSIDE) {
      if (value === IN) open = true;
      return;
    }
    if (state[c] === 0) {
      state[c] = value;
      origin[c] = wall;
      changed = true;
    } else if (state[c] !== value) {
      if (origin[c] === BEYOND || wall === BEYOND) open = true;
      else conflict ??= [origin[c]!, wall].filter((w, k, all) => all.indexOf(w) === k);
    }
  };

  // What the marks say: in front of each mark is room, behind it is not.
  walls.forEach((w, index) => {
    const along = w.axis === 0 ? xs : ys;
    const lines = w.axis === 0 ? rows : cols;
    const k = lines.findIndex((l) => l.wall === index);
    const found = w.along.map((t) => stretchOf(along, t, tol));
    if (found.some((s) => s === null)) {
      // Marked beyond the outermost crossing wall: the room goes on past it.
      open = true;
      return;
    }
    const sure = found.filter((s) => s!.sure);
    for (const s of sure.length > 0 ? sure : found.slice(0, 1)) {
      const e = w.axis === 0 ? rowEdge(k, s!.index) : colEdge(k, s!.index);
      set(e.front, IN, index);
      set(e.back, OUT, index);
    }
  });

  // A line can be crossed from behind it into the room, where its wall is missing; never from the
  // room out through its back. So: room behind a stretch means room in front of it.
  const edges: Edge[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) edges.push(rowEdge(j, i));
  for (let k = 0; k <= nx; k++) for (let j = 0; j < ny; j++) edges.push(colEdge(k, j));
  while (changed && !conflict) {
    changed = false;
    for (const e of edges) {
      if (e.back !== OUTSIDE && state[e.back] === IN) set(e.front, IN, origin[e.back]!);
      if (e.front === OUTSIDE || state[e.front] === OUT) {
        set(e.back, OUT, e.front === OUTSIDE ? BEYOND : origin[e.front]!);
      }
    }
  }
  if (conflict) return fail('conflict', conflict);
  if (open) return fail('open');

  const inside = (i: number, j: number) => {
    const c = cell(i, j);
    return c !== OUTSIDE && state[c] === IN;
  };
  let count = 0;
  let start = -1;
  for (let c = 0; c < nx * ny; c++) {
    if (state[c] === IN) {
      count++;
      if (start < 0) start = c;
    }
  }
  if (count === 0) return fail('open');

  // One piece, no holes, no two cells touching only at a corner.
  const seen = new Uint8Array(nx * ny);
  const flood = (from: number[], want: (c: number) => boolean): number => {
    let n = 0;
    const stack: number[] = [];
    for (const c of from) {
      if (!seen[c] && want(c)) {
        seen[c] = 1;
        stack.push(c);
      }
    }
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const i = c % nx;
      const j = (c - i) / nx;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const d = cell(i + di, j + dj);
        if (d !== OUTSIDE && !seen[d] && want(d)) {
          seen[d] = 1;
          stack.push(d);
        }
      }
    }
    return n;
  };
  if (flood([start], (c) => state[c] === IN) !== count) return fail('shape');
  seen.fill(0);
  const border: number[] = [];
  for (let i = 0; i < nx; i++) border.push(cell(i, 0), cell(i, ny - 1));
  for (let j = 0; j < ny; j++) border.push(cell(0, j), cell(nx - 1, j));
  if (flood(border, (c) => state[c] !== IN) !== nx * ny - count) return fail('shape');
  for (let i = 1; i < nx; i++) {
    for (let j = 1; j < ny; j++) {
      const a = inside(i - 1, j - 1);
      const b = inside(i, j - 1);
      const c = inside(i - 1, j);
      const d = inside(i, j);
      if (a === d && b === c && a !== b) return fail('shape');
    }
  }

  // Trace the outline counter-clockwise in the (u, v) frame: room on the left of every step.
  const key = (i: number, j: number) => j * (nx + 1) + i;
  const next = new Map<number, { i: number; j: number; wall: number; dir: number }>();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!inside(i, j)) continue;
      if (!inside(i, j - 1)) next.set(key(i, j), { i: i + 1, j, wall: rows[j]!.wall, dir: 0 });
      if (!inside(i + 1, j)) {
        next.set(key(i + 1, j), { i: i + 1, j: j + 1, wall: cols[i + 1]!.wall, dir: 1 });
      }
      if (!inside(i, j + 1)) {
        next.set(key(i + 1, j + 1), { i, j: j + 1, wall: rows[j + 1]!.wall, dir: 2 });
      }
      if (!inside(i - 1, j)) next.set(key(i, j + 1), { i, j, wall: cols[i]!.wall, dir: 3 });
    }
  }
  const [startKey] = next.keys();
  const corners: { i: number; j: number; wall: number }[] = [];
  let at = startKey!;
  let prevDir = -1;
  let steps = 0;
  do {
    const step = next.get(at);
    if (!step || steps > next.size) return fail('shape');
    const i = at % (nx + 1);
    const j = (at - i) / (nx + 1);
    // Stretches of one line in a row make one wall: a corner only where the direction turns.
    if (step.dir !== prevDir) corners.push({ i, j, wall: step.wall });
    prevDir = step.dir;
    at = key(step.i, step.j);
    steps++;
  } while (at !== startKey);
  if (steps !== next.size) return fail('shape');
  if (corners.length > 1 && next.get(startKey!)!.dir === prevDir) {
    // The trace started in the middle of a wall: its first stretch belongs to the last wall.
    corners.shift();
  }

  // Walls with a mark on them were seen; the others were filled in.
  const frame = corners.map((c) => [xs[c.i]!, ys[c.j]!] as [number, number]);
  let points = frame.map(([a, b]) => fromRoomFrame(axes, a, b));
  let source = corners.map((c) => c.wall);
  let seenWall = corners.map((c, k) => {
    const [a0, b0] = frame[k]!;
    const [a1, b1] = frame[(k + 1) % frame.length]!;
    const w = walls[c.wall]!;
    const lo = w.axis === 0 ? Math.min(a0, a1) : Math.min(b0, b1);
    const hi = w.axis === 0 ? Math.max(a0, a1) : Math.max(b0, b1);
    return w.along.some((t) => t >= lo - 0.05 && t <= hi + 0.05);
  });
  if (signedArea(points) < 0) {
    // Core keeps outlines counter-clockwise seen from above: reverse, and the walls with them.
    const n = points.length;
    const remap = <T>(list: T[]): T[] => list.map((_, k) => list[(n - 2 - k + n) % n]!);
    points = [...points].reverse();
    source = remap(source);
    seenWall = remap(seenWall);
  }
  const check = validateRoomShape(points, {
    ...(options.minWallLength !== undefined ? { minWallLength: options.minWallLength } : {}),
    ...(options.minArea !== undefined ? { minArea: options.minArea } : {}),
  });
  if (!check.ok) return { ok: false, error: 'shape', reason: check.reason, conflicting: [] };
  const room = roomFromPoints(points, {
    ceilingHeight: options.ceilingHeight ?? DEFAULT_CEILING_HEIGHT,
  });
  return {
    ok: true,
    room,
    wallSource: source,
    inferredWalls: seenWall.flatMap((s, k) => (s ? [] : [k])),
    leftOut: [],
  };
}

/**
 * Like `solveRectilinearRoom`, but when the walls do not fit together it tries again without one
 * of them: the one with the fewest marks first, the most recent first among equals. Use it when
 * the user asks to finish; finishing by itself should only happen when every wall fits.
 */
export function solveRoomLeavingOut(
  walls: readonly MarkedWall[],
  axes: RoomAxes,
  options: RectilinearOptions = {},
): RectilinearResult {
  const all = solveRectilinearRoom(walls, axes, options);
  if (all.ok || (all.error !== 'conflict' && all.error !== 'shape') || walls.length <= 4) {
    return all;
  }
  const order = walls
    .map((w, i) => ({ i, weight: w.weight }))
    .sort((p, q) => p.weight - q.weight || q.i - p.i);
  for (const { i: drop } of order) {
    const kept = walls.flatMap((_, i) => (i === drop ? [] : [i]));
    const r = solveRectilinearRoom(
      kept.map((i) => walls[i]!),
      axes,
      options,
    );
    if (r.ok) {
      return { ...r, wallSource: r.wallSource.map((s) => kept[s]!), leftOut: [drop] };
    }
  }
  return all;
}

/* ------------------------------------------------------------------------------------------ */
/* Sizes                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** For a rectangular room, its two side lengths (shorter first); otherwise null. */
export function rectangleSides(room: Room): [number, number] | null {
  if (room.points.length !== 4) return null;
  const p = room.points;
  for (let k = 0; k < 4; k++) {
    const a = p[(k + 3) % 4]!;
    const b = p[k]!;
    const c = p[(k + 1) % 4]!;
    const ux = a[0] - b[0];
    const uz = a[1] - b[1];
    const vx = c[0] - b[0];
    const vz = c[1] - b[1];
    const cos = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz));
    if (!(Math.abs(cos) < Math.sin(2 * DEG))) return null;
  }
  const [l0, l1, l2, l3] = wallLengths(room) as [number, number, number, number];
  const a = (l0 + l2) / 2;
  const b = (l1 + l3) / 2;
  return a <= b ? [a, b] : [b, a];
}

/**
 * A short size for a room: `10′ 3″ × 11′ 6″` for a rectangle, otherwise its area and number of
 * walls (`254 sq ft, 6 walls`).
 */
export function describeRoomSize(room: Room, units: UnitSystem): string {
  const sides = rectangleSides(room);
  if (sides) return `${formatLength(sides[0], units)} × ${formatLength(sides[1], units)}`;
  return `${formatArea(roomArea(room), units)}, ${room.walls.length} walls`;
}

/**
 * The room made `factor` times bigger (a tape-measured wall corrects the scan's scale), about the
 * middle of its outline. Doors and windows keep their place along their walls; heights stay.
 */
export function scaleRoom(room: Room, factor: number): Room {
  if (!(factor > 0) || !Number.isFinite(factor)) return room;
  const b = bounds(room.points);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return {
    ...room,
    points: room.points.map(([x, z]) => [cx + (x - cx) * factor, cz + (z - cz) * factor]),
    walls: room.walls.map((w) => ({
      ...w,
      openings: w.openings.map((o) => ({
        ...o,
        offset: o.offset * factor,
        width: o.width * factor,
      })),
    })),
  };
}
