import type { Vec2 } from './types';
import { cross, distance, dot, leftNormal, normalize, sub } from './vec';

/** A corner as stored in `Room.points`: `[x, z]` in metres. */
export type Point = [number, number];

const toVec = (p: Point | Vec2): Vec2 => (Array.isArray(p) ? { x: p[0], z: p[1] } : p);

/**
 * Signed area of a closed outline in m². Positive when the corners run counter-clockwise
 * seen from above (looking down -Y, +X to the right, +Z toward the bottom of the screen).
 */
export function signedArea(points: readonly (Point | Vec2)[]): number {
  let s = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = toVec(points[i]!);
    const q = toVec(points[(i + 1) % n]!);
    s += p.z * q.x - p.x * q.z;
  }
  return s / 2;
}

/** Area of a closed outline in m² (always positive). */
export function polygonArea(points: readonly (Point | Vec2)[]): number {
  return Math.abs(signedArea(points));
}

/** Total length of a closed outline in metres. */
export function polygonPerimeter(points: readonly (Point | Vec2)[]): number {
  let s = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) s += distance(toVec(points[i]!), toVec(points[(i + 1) % n]!));
  return s;
}

export function isCounterClockwise(points: readonly (Point | Vec2)[]): boolean {
  return signedArea(points) > 0;
}

/** Returns the corners in counter-clockwise order (seen from above), reversing them if needed. */
export function ensureCounterClockwise<T extends Point | Vec2>(points: readonly T[]): T[] {
  return signedArea(points) < 0 ? [...points].reverse() : [...points];
}

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  width: number;
  depth: number;
}

export function bounds(points: readonly (Point | Vec2)[]): Bounds {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const raw of points) {
    const p = toVec(raw);
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!points.length) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0, width: 0, depth: 0 };
  return { minX, minZ, maxX, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

/**
 * Unit normal of the wall from `a` to `b` pointing into the room, for a counter-clockwise outline.
 */
export function inwardNormal(a: Point | Vec2, b: Point | Vec2): Vec2 {
  return leftNormal(normalize(sub(toVec(b), toVec(a))));
}

const orient = (a: Vec2, b: Vec2, c: Vec2): number => cross(sub(b, a), sub(c, a));
const FOLD_BACK_COS = Math.cos((2 * Math.PI) / 180);

function onSegment(a: Vec2, b: Vec2, p: Vec2, eps: number): boolean {
  return (
    Math.min(a.x, b.x) - eps <= p.x &&
    p.x <= Math.max(a.x, b.x) + eps &&
    Math.min(a.z, b.z) - eps <= p.z &&
    p.z <= Math.max(a.z, b.z) + eps
  );
}

/** True if segments p1-p2 and p3-p4 cross or touch (within `eps` metres). */
export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2, eps = 1e-9): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  const l1 = Math.max(distance(p1, p2), eps);
  const l2 = Math.max(distance(p3, p4), eps);
  // Normalise the orientation tests to distances so eps is in metres.
  const s1 = Math.abs(d1 / l2) <= eps ? 0 : Math.sign(d1);
  const s2 = Math.abs(d2 / l2) <= eps ? 0 : Math.sign(d2);
  const s3 = Math.abs(d3 / l1) <= eps ? 0 : Math.sign(d3);
  const s4 = Math.abs(d4 / l1) <= eps ? 0 : Math.sign(d4);
  if (s1 * s2 < 0 && s3 * s4 < 0) return true;
  if (s1 === 0 && onSegment(p3, p4, p1, eps)) return true;
  if (s2 === 0 && onSegment(p3, p4, p2, eps)) return true;
  if (s3 === 0 && onSegment(p1, p2, p3, eps)) return true;
  if (s4 === 0 && onSegment(p1, p2, p4, eps)) return true;
  return false;
}

/**
 * True if the closed outline does not cross or touch itself: no two non-neighbouring walls meet,
 * and no corner folds a wall straight back onto its neighbour.
 */
export function isSimplePolygon(points: readonly (Point | Vec2)[], eps = 1e-6): boolean {
  const pts = points.map(toVec);
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const c = pts[(i + 2) % n]!;
    // Neighbouring walls must not fold back onto each other (a spike with a corner under 2°).
    const u = normalize(sub(b, a));
    const v = normalize(sub(c, b));
    if (dot(u, v) < -FOLD_BACK_COS) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours via the closing wall
      if (segmentsIntersect(a, b, pts[j]!, pts[(j + 1) % n]!, eps)) return false;
    }
  }
  return true;
}

/** Problems `validateRoomShape` and `buildRoomFromWalls` can report. */
export type RoomShapeError =
  'invalid-input' | 'too-few-walls' | 'wall-too-short' | 'self-intersecting' | 'too-small';

export interface RoomShapeLimits {
  /** Shortest allowed wall in metres. Default 0.2. */
  minWallLength?: number;
  /** Smallest allowed floor area in m². Default 2. */
  minArea?: number;
}

export const DEFAULT_MIN_WALL_LENGTH = 0.2;
export const DEFAULT_MIN_AREA = 2;

/**
 * Who is asking: 'scan' (walls found by the phone, the default) or 'editor' (the user moving a
 * corner or typing a wall length on the plan). The wording tells the user what to do next there.
 */
export type RoomShapeContext = 'scan' | 'editor';

/** Plain-language explanations a UI can show next to an error code. */
export function describeRoomShapeError(
  error: RoomShapeError,
  detail: {
    wallCount?: number;
    minWallLength?: number;
    minArea?: number;
    context?: RoomShapeContext;
  } = {},
): string {
  const editor = detail.context === 'editor';
  switch (error) {
    case 'invalid-input':
      return editor
        ? 'That is not a valid place for a corner.'
        : 'Some wall measurements are not valid numbers. Try scanning the room again.';
    case 'too-few-walls': {
      if (editor) return 'A room needs at least 3 walls.';
      const n = detail.wallCount ?? 0;
      if (n === 0) {
        return 'No walls found yet. Point the phone at the walls and turn slowly around the room.';
      }
      return `Only ${n} wall${n === 1 ? '' : 's'} found. A room needs at least 3. Keep turning around the room, or tap twice at the bottom of a wall that was missed.`;
    }
    case 'wall-too-short': {
      const cm = Math.round((detail.minWallLength ?? DEFAULT_MIN_WALL_LENGTH) * 100);
      return editor
        ? `That would make a wall shorter than ${cm} cm.`
        : `Two corners came out closer than ${cm} cm. Scan the walls near that corner again.`;
    }
    case 'self-intersecting':
      return editor
        ? 'That would make the walls cross each other. Move the corner back a little.'
        : 'The walls found cross each other. Scan the walls that look wrong again.';
    case 'too-small': {
      const m2 = detail.minArea ?? DEFAULT_MIN_AREA;
      const sqft = Math.round(m2 * 10.7639);
      return editor
        ? `That would make the room smaller than ${m2} m² (about ${sqft} sq ft).`
        : `The room is smaller than ${m2} m² (about ${sqft} sq ft). Check that the walls found belong to this room.`;
    }
  }
}

export type RoomShapeValidation =
  { ok: true; area: number } | { ok: false; error: RoomShapeError; reason: string };

/**
 * Checks that an outline can be a room: at least 3 corners, finite numbers, every wall at least
 * `minWallLength` long, no self-crossing, and an area of at least `minArea`. `context` picks the
 * wording of the reason (see `describeRoomShapeError`).
 */
export function validateRoomShape(
  points: readonly (Point | Vec2)[],
  limits: RoomShapeLimits = {},
  context: RoomShapeContext = 'scan',
): RoomShapeValidation {
  const minWallLength = limits.minWallLength ?? DEFAULT_MIN_WALL_LENGTH;
  const minArea = limits.minArea ?? DEFAULT_MIN_AREA;
  const fail = (error: RoomShapeError, wallCount?: number): RoomShapeValidation => ({
    ok: false,
    error,
    reason: describeRoomShapeError(error, { wallCount, minWallLength, minArea, context }),
  });

  const pts = points.map(toVec);
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z))) return fail('invalid-input');
  if (pts.length < 3) return fail('too-few-walls', pts.length);
  for (let i = 0; i < pts.length; i++) {
    if (distance(pts[i]!, pts[(i + 1) % pts.length]!) < minWallLength - 1e-9) {
      return fail('wall-too-short');
    }
  }
  if (!isSimplePolygon(pts)) return fail('self-intersecting');
  const area = polygonArea(pts);
  if (area < minArea) return fail('too-small');
  return { ok: true, area };
}
