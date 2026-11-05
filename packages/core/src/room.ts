import type { Opening, Room, StoredRoom, Vec2, Wall } from './types';
import { ensureCounterClockwise, polygonArea, polygonPerimeter, type Point } from './polygon';

/** 8 feet, the default ceiling height offered after a scan. */
export const DEFAULT_CEILING_HEIGHT = 2.4384;

export interface RoomFromPointsOptions {
  ceilingHeight?: number;
  /** Prefix for generated wall ids (`w1`, `w2`, ...). */
  wallIdPrefix?: string;
}

/**
 * Builds a room from an outline. Corners are put in counter-clockwise order (seen from above)
 * and one wall is created per side, without openings.
 */
export function roomFromPoints(
  points: readonly (Point | Vec2)[],
  options: RoomFromPointsOptions = {},
): Room {
  const pts: Point[] = ensureCounterClockwise(
    points.map((p): Point => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z])),
  );
  const prefix = options.wallIdPrefix ?? 'w';
  const walls: Wall[] = pts.map((_, i) => ({
    id: `${prefix}${i + 1}`,
    a: i,
    b: (i + 1) % pts.length,
    openings: [],
  }));
  return {
    version: 1,
    points: pts,
    ceilingHeight: options.ceilingHeight ?? DEFAULT_CEILING_HEIGHT,
    walls,
  };
}

/** Start and end corner of a wall as `{ x, z }`. */
export function wallEndpoints(room: Room, wall: Wall): { a: Vec2; b: Vec2 } {
  const a = room.points[wall.a]!;
  const b = room.points[wall.b]!;
  return { a: { x: a[0], z: a[1] }, b: { x: b[0], z: b[1] } };
}

/** Length of each wall in metres, in `room.walls` order. */
export function wallLengths(room: Room): number[] {
  return room.walls.map((w) => {
    const { a, b } = wallEndpoints(room, w);
    return Math.hypot(b.x - a.x, b.z - a.z);
  });
}

/** Floor area in m². */
export function roomArea(room: Room): number {
  return polygonArea(room.points);
}

/** Length of the outline in metres. */
export function roomPerimeter(room: Room): number {
  return polygonPerimeter(room.points);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseOpening(v: unknown): Opening | null {
  if (!isObj(v)) return null;
  const { id, type, offset, width, height, sill } = v;
  if (typeof id !== 'string') return null;
  if (type !== 'door' && type !== 'window' && type !== 'opening') return null;
  if (!isNum(offset) || !isNum(width) || !isNum(height) || !isNum(sill)) return null;
  return { id, type, offset, width, height, sill };
}

function parseWalls(v: unknown, pointCount: number): Wall[] | null {
  if (!Array.isArray(v) || v.length !== pointCount) return null;
  const walls: Wall[] = [];
  for (const w of v) {
    if (!isObj(w) || typeof w.id !== 'string') return null;
    const { a, b } = w;
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
    if ((a as number) < 0 || (a as number) >= pointCount) return null;
    if ((b as number) < 0 || (b as number) >= pointCount) return null;
    const openings = Array.isArray(w.openings) ? w.openings.map(parseOpening) : [];
    if (openings.some((o) => o === null)) return null;
    walls.push({ id: w.id, a: a as number, b: b as number, openings: openings as Opening[] });
  }
  return walls;
}

/** Type guard for an in-memory `Room` (points as `[x, z]` pairs). */
export function isRoom(value: unknown): value is Room {
  if (!isObj(value) || value.version !== 1 || !isNum(value.ceilingHeight)) return false;
  const { points } = value;
  if (!Array.isArray(points) || points.length < 3) return false;
  if (!points.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]))) {
    return false;
  }
  return parseWalls(value.walls, points.length) !== null;
}

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/**
 * Converts a room into the shape stored in Firestore (`RoomDoc.room`): corners become `{ x, z }`
 * maps because Firestore cannot nest arrays. Coordinates are rounded to the millimetre.
 */
export function roomToFirestore(room: Room): StoredRoom {
  return {
    version: 1,
    points: room.points.map(([x, z]) => ({ x: round(x, 3), z: round(z, 3) })),
    ceilingHeight: round(room.ceilingHeight, 4),
    walls: room.walls.map((w) => ({
      id: w.id,
      a: w.a,
      b: w.b,
      openings: w.openings.map((o) => ({ ...o })),
    })),
  };
}

/**
 * Reads `RoomDoc.room` from Firestore data. Returns null if the data is not a usable room.
 * Missing or mismatched walls are rebuilt from the corners.
 */
export function roomFromFirestore(data: unknown): Room | null {
  if (!isObj(data) || data.version !== 1) return null;
  const { points, ceilingHeight } = data;
  if (!Array.isArray(points) || points.length < 3) return null;
  const pts: Point[] = [];
  for (const p of points) {
    if (!isObj(p) || !isNum(p.x) || !isNum(p.z)) return null;
    pts.push([p.x, p.z]);
  }
  const height = isNum(ceilingHeight) && ceilingHeight > 0 ? ceilingHeight : DEFAULT_CEILING_HEIGHT;
  const walls = parseWalls(data.walls, pts.length);
  if (!walls) return roomFromPoints(pts, { ceilingHeight: height });
  return { version: 1, points: pts, ceilingHeight: height, walls };
}
