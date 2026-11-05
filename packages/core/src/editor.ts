/**
 * Room editor maths: move a corner, type a wall length, set the ceiling height, and add, move,
 * change or remove doors, windows and openings.
 *
 * Every edit returns a new room (the input is never changed) or an error with a plain-language
 * reason. Openings stay valid when walls change: each one keeps its place on the floor plan as far
 * as possible, then is moved, made smaller, or (when there is no room left) removed to fit; the
 * result lists those changes so the app can tell the user.
 */
import type { Opening, OpeningType, Room, Vec2, Wall } from './types';
import {
  describeRoomShapeError,
  validateRoomShape,
  DEFAULT_MIN_WALL_LENGTH,
  type Point,
  type RoomShapeError,
  type RoomShapeLimits,
} from './polygon';
import { add, distance, dot, intersectLines, normalize, scale, sub } from './vec';

/** Smallest width and height of a door, window or opening (m). */
export const MIN_OPENING_SIZE = 0.2;
export const MIN_CEILING_HEIGHT = 1.5;
export const MAX_CEILING_HEIGHT = 6;

/** Sizes for new openings: a 32″ × 80″ door, a 36″ × 48″ window 36″ up, a 36″ × 80″ opening. */
export const DEFAULT_OPENINGS: Readonly<
  Record<OpeningType, { width: number; height: number; sill: number }>
> = {
  door: { width: 0.8128, height: 2.032, sill: 0 },
  window: { width: 0.9144, height: 1.2192, sill: 0.9144 },
  opening: { width: 0.9144, height: 2.032, sill: 0 },
};

const EPS = 1e-6;

export type RoomEditError =
  | RoomShapeError
  | 'unknown-corner'
  | 'unknown-wall'
  | 'unknown-opening'
  | 'invalid-length'
  | 'ceiling-too-low'
  | 'ceiling-too-high'
  | 'opening-too-small'
  | 'opening-outside-wall'
  | 'opening-above-ceiling'
  | 'opening-overlaps'
  | 'no-room-for-opening';

/** What an edit did to an opening to keep it valid. */
export interface OpeningChange {
  wallId: string;
  openingId: string;
  change: 'moved' | 'resized' | 'removed';
}

export type RoomEditResult =
  | { ok: true; room: Room; changes: OpeningChange[] }
  | { ok: false; error: RoomEditError; reason: string };

const NAMES: Record<OpeningType, string> = { door: 'door', window: 'window', opening: 'opening' };

/** Plain-language explanation of an edit error. */
export function describeRoomEditError(
  error: RoomEditError,
  detail: { type?: OpeningType; minWallLength?: number; minArea?: number } = {},
): string {
  const thing = detail.type ? `The ${NAMES[detail.type]}` : 'It';
  switch (error) {
    case 'unknown-corner':
      return 'That corner is not part of this room.';
    case 'unknown-wall':
      return 'That wall is not part of this room.';
    case 'unknown-opening':
      return 'That door or window is not in this room any more.';
    case 'invalid-length': {
      const cm = Math.round((detail.minWallLength ?? DEFAULT_MIN_WALL_LENGTH) * 100);
      return `Enter a wall length of at least ${cm} cm.`;
    }
    case 'ceiling-too-low':
      return `The ceiling must be at least ${MIN_CEILING_HEIGHT} m (about 4′ 11″) high.`;
    case 'ceiling-too-high':
      return `The ceiling can be at most ${MAX_CEILING_HEIGHT} m (about 19′ 8″) high.`;
    case 'opening-too-small':
      return `${thing} must be at least ${MIN_OPENING_SIZE * 100} cm wide and tall.`;
    case 'opening-outside-wall':
      return `${thing} does not fit on this wall. Make it narrower or move it along the wall.`;
    case 'opening-above-ceiling':
      return `${thing} reaches above the ceiling. Make it shorter${detail.type === 'window' ? ' or lower its sill' : ''}.`;
    case 'opening-overlaps':
      return `${thing} overlaps another door or window on this wall.`;
    case 'no-room-for-opening':
      return `There is no free space on this wall for ${thing === 'It' ? 'it' : thing.toLowerCase()}.`;
    default:
      return describeRoomShapeError(error, detail);
  }
}

const fail = (
  error: RoomEditError,
  detail: Parameters<typeof describeRoomEditError>[1] = {},
): RoomEditResult => ({ ok: false, error, reason: describeRoomEditError(error, detail) });

const toPoint = (p: Point | Vec2): Point => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.z]);

const cloneRoom = (room: Room): Room => ({
  version: 1,
  points: room.points.map(([x, z]) => [x, z]),
  ceilingHeight: room.ceilingHeight,
  walls: room.walls.map((w) => ({ ...w, openings: w.openings.map((o) => ({ ...o })) })),
});

/** Index of a wall given its id or index, or -1. */
export function wallIndexOf(room: Room, wall: string | number): number {
  if (typeof wall === 'number') return Number.isInteger(wall) && room.walls[wall] ? wall : -1;
  return room.walls.findIndex((w) => w.id === wall);
}

interface WallGeometry {
  a: Vec2;
  d: Vec2;
  length: number;
}

function wallGeometry(room: Room, wall: Wall): WallGeometry {
  const pa = room.points[wall.a] ?? [0, 0];
  const pb = room.points[wall.b] ?? [0, 0];
  const a = { x: pa[0], z: pa[1] };
  const b = { x: pb[0], z: pb[1] };
  return { a, d: normalize(sub(b, a)), length: distance(a, b) };
}

/** Length of a wall (m), by id or index. NaN for an unknown wall. */
export function wallLength(room: Room, wall: string | number): number {
  const i = wallIndexOf(room, wall);
  return i < 0 ? NaN : wallGeometry(room, room.walls[i]!).length;
}

/** Where an opening is on the floor plan: its two ends and middle along the wall's inside line. */
export function openingSegment(
  room: Room,
  wall: string | number,
  opening: Pick<Opening, 'offset' | 'width'>,
): { a: Vec2; b: Vec2; center: Vec2 } | null {
  const i = wallIndexOf(room, wall);
  if (i < 0) return null;
  const g = wallGeometry(room, room.walls[i]!);
  const at = (s: number) => add(g.a, scale(g.d, s));
  return {
    a: at(opening.offset),
    b: at(opening.offset + opening.width),
    center: at(opening.offset + opening.width / 2),
  };
}

/**
 * Projects a point onto a wall: `offset` is the distance along the wall from its start (clamped to
 * the wall), `distance` how far the point is from the wall's line. For dragging an opening.
 */
export function projectOntoWall(
  room: Room,
  wall: string | number,
  point: Point | Vec2,
): { offset: number; distance: number } | null {
  const i = wallIndexOf(room, wall);
  if (i < 0) return null;
  const g = wallGeometry(room, room.walls[i]!);
  const [x, z] = toPoint(point);
  const rel = { x: x - g.a.x, z: z - g.a.z };
  const along = dot(rel, g.d);
  return {
    offset: Math.min(Math.max(along, 0), g.length),
    distance: Math.abs(rel.x * g.d.z - rel.z * g.d.x),
  };
}

/** The wall and index holding an opening, or null. */
export function findOpening(
  room: Room,
  openingId: string,
): { wall: Wall; wallIndex: number; opening: Opening } | null {
  for (const [wallIndex, wall] of room.walls.entries()) {
    const opening = wall.openings.find((o) => o.id === openingId);
    if (opening) return { wall, wallIndex, opening };
  }
  return null;
}

/**
 * Checks an opening against a wall: at least 20 cm wide and tall, inside the wall, below the
 * ceiling, and clear of the wall's other openings (touching is fine). Doors and openings must start
 * at the floor. Returns null when it is valid.
 */
export function validateOpening(
  room: Room,
  wall: string | number,
  opening: Opening,
): RoomEditError | null {
  const i = wallIndexOf(room, wall);
  if (i < 0) return 'unknown-wall';
  const values = [opening.offset, opening.width, opening.height, opening.sill];
  if (!values.every(Number.isFinite)) return 'opening-too-small';
  if (opening.width < MIN_OPENING_SIZE - EPS || opening.height < MIN_OPENING_SIZE - EPS) {
    return 'opening-too-small';
  }
  const w = room.walls[i]!;
  const { length } = wallGeometry(room, w);
  if (opening.offset < -EPS || opening.offset + opening.width > length + EPS) {
    return 'opening-outside-wall';
  }
  const sill = opening.type === 'window' ? opening.sill : 0;
  if (sill < -EPS || sill + opening.height > room.ceilingHeight + EPS)
    return 'opening-above-ceiling';
  for (const o of w.openings) {
    if (o.id === opening.id) continue;
    const overlap =
      Math.min(o.offset + o.width, opening.offset + opening.width) -
      Math.max(o.offset, opening.offset);
    if (overlap > EPS) return 'opening-overlaps';
  }
  return null;
}

/**
 * Fits a wall's openings to its length and the ceiling: tops come down to the ceiling, openings
 * wider than the wall shrink, ones past an end slide back, overlapping ones are pushed apart, and
 * any that still do not fit are removed (the last along the wall first).
 */
function fitWallOpenings(
  wall: Wall,
  length: number,
  ceiling: number,
): { openings: Opening[]; changes: OpeningChange[] } {
  const changes = new Map<string, OpeningChange['change']>();
  const mark = (id: string, change: OpeningChange['change']) => {
    if (changes.get(id) !== 'removed' && !(change === 'moved' && changes.get(id) === 'resized')) {
      changes.set(id, change);
    }
  };
  const list: Opening[] = [];
  for (const o of wall.openings) {
    const next = { ...o };
    if (next.type !== 'window') next.sill = 0;
    if (next.sill + next.height > ceiling + EPS) {
      next.height = ceiling - next.sill;
      if (next.height < MIN_OPENING_SIZE) {
        next.height = Math.min(MIN_OPENING_SIZE, ceiling);
        next.sill = Math.max(0, ceiling - next.height);
      }
    }
    if (next.width > length + EPS) next.width = length;
    if (next.width < MIN_OPENING_SIZE - EPS || next.height < MIN_OPENING_SIZE - EPS) {
      mark(o.id, 'removed');
      continue;
    }
    if (next.width !== o.width || next.height !== o.height || next.sill !== o.sill) {
      mark(o.id, 'resized');
    }
    list.push(next);
  }

  // Pack along the wall. Drop the last opening along the wall until the rest fit.
  list.sort((p, q) => p.offset - q.offset);
  while (list.reduce((s, o) => s + o.width, 0) > length + EPS) {
    const dropped = list.pop()!;
    mark(dropped.id, 'removed');
  }
  let start = 0;
  for (const o of list) {
    o.offset = Math.max(o.offset, start);
    start = o.offset + o.width;
  }
  let end = length;
  for (let k = list.length - 1; k >= 0; k--) {
    const o = list[k]!;
    if (o.offset + o.width > end) o.offset = end - o.width;
    end = o.offset;
  }
  for (const o of list) {
    if (Math.abs(o.offset) < EPS) o.offset = 0;
    const before = wall.openings.find((p) => p.id === o.id)!;
    if (Math.abs(o.offset - before.offset) > EPS) mark(o.id, 'moved');
  }
  return {
    openings: list,
    changes: [...changes].map(([openingId, change]) => ({ wallId: wall.id, openingId, change })),
  };
}

/** Makes every opening in the room valid (see the module notes), listing what had to change. */
export function fitOpenings(room: Room): { room: Room; changes: OpeningChange[] } {
  const next = cloneRoom(room);
  const changes: OpeningChange[] = [];
  next.walls = next.walls.map((w) => {
    const fitted = fitWallOpenings(w, wallGeometry(next, w).length, next.ceilingHeight);
    changes.push(...fitted.changes);
    return { ...w, openings: fitted.openings };
  });
  return { room: next, changes };
}

/**
 * The new room after its corners moved: each opening keeps its place on the plan (its middle is
 * projected onto the wall's new line), then everything is fitted.
 */
function withMovedCorners(before: Room, points: Point[], limits?: RoomShapeLimits): RoomEditResult {
  const shape = validateRoomShape(points, limits);
  if (!shape.ok) return { ok: false, error: shape.error, reason: shape.reason };
  const after: Room = { ...cloneRoom(before), points };
  // Moving a corner across the room can turn the outline inside out.
  const signed = (pts: readonly Point[]) =>
    pts.reduce((s, p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      return s + p[1] * q[0] - p[0] * q[1];
    }, 0);
  if (Math.sign(signed(points)) !== Math.sign(signed(before.points))) {
    return fail('self-intersecting');
  }
  after.walls = after.walls.map((w, i) => {
    const old = wallGeometry(before, before.walls[i]!);
    const now = wallGeometry(after, w);
    return {
      ...w,
      openings: w.openings.map((o) => {
        const mid = add(old.a, scale(old.d, o.offset + o.width / 2));
        return { ...o, offset: dot(sub(mid, now.a), now.d) - o.width / 2 };
      }),
    };
  });
  const fitted = fitOpenings(after);
  return { ok: true, room: fitted.room, changes: fitted.changes };
}

/** Moves corner `index` to `to`. The two walls meeting there change length and angle. */
export function moveCorner(
  room: Room,
  index: number,
  to: Point | Vec2,
  limits?: RoomShapeLimits,
): RoomEditResult {
  if (!Number.isInteger(index) || index < 0 || index >= room.points.length) {
    return fail('unknown-corner');
  }
  const p = toPoint(to);
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return fail('invalid-input');
  const points = room.points.map((q, i): Point => (i === index ? p : [q[0], q[1]]));
  return withMovedCorners(room, points, limits);
}

export interface SetWallLengthOptions {
  /** Which end of the wall moves. Default 'end'. */
  move?: 'start' | 'end';
  /**
   * Keep every wall's direction (default true): the neighbouring wall at the moving end slides
   * along with it, so a rectangle stays a rectangle and the wall after that absorbs the change.
   * With false, only the moving corner moves and the neighbouring wall tilts.
   */
  keepAngles?: boolean;
  limits?: RoomShapeLimits;
}

/** Sets a wall's length (m) by moving one of its ends along the wall. */
export function setWallLength(
  room: Room,
  wall: string | number,
  length: number,
  options: SetWallLengthOptions = {},
): RoomEditResult {
  const i = wallIndexOf(room, wall);
  if (i < 0) return fail('unknown-wall');
  const minWallLength = options.limits?.minWallLength ?? DEFAULT_MIN_WALL_LENGTH;
  if (!Number.isFinite(length) || length < minWallLength - EPS) {
    return fail('invalid-length', { minWallLength });
  }
  const n = room.points.length;
  const w = room.walls[i]!;
  const g = wallGeometry(room, w);
  const at = (k: number): Vec2 => ({ x: room.points[k]![0], z: room.points[k]![1] });
  const points = room.points.map(([x, z]): Point => [x, z]);
  const set = (k: number, v: Vec2) => (points[k] = [v.x, v.z]);
  const standard = w.b === (w.a + 1) % n;
  const keepAngles = (options.keepAngles ?? true) && standard && n >= 3;

  if ((options.move ?? 'end') === 'end') {
    const b = add(g.a, scale(g.d, length));
    set(w.b, b);
    if (keepAngles) {
      // The next wall (b → c) stays parallel; c slides along the wall after it (c → e).
      const c = (w.b + 1) % n;
      const e = (w.b + 2) % n;
      const hit = intersectLines(b, sub(at(c), at(w.b)), at(c), sub(at(e), at(c)));
      if (hit) set(c, hit);
    }
  } else {
    const end = add(g.a, scale(g.d, g.length));
    const a = sub(end, scale(g.d, length));
    set(w.a, a);
    if (keepAngles) {
      // The previous wall (y → a) stays parallel; y slides along the wall before it (x → y).
      const y = (w.a - 1 + n) % n;
      const x = (w.a - 2 + n) % n;
      const hit = intersectLines(a, sub(at(w.a), at(y)), at(y), sub(at(y), at(x)));
      if (hit) set(y, hit);
    }
  }
  return withMovedCorners(room, points, options.limits);
}

/** Sets the ceiling height (m). Openings that would reach above it are made shorter. */
export function setCeilingHeight(room: Room, height: number): RoomEditResult {
  if (!Number.isFinite(height) || height < MIN_CEILING_HEIGHT - EPS) return fail('ceiling-too-low');
  if (height > MAX_CEILING_HEIGHT + EPS) return fail('ceiling-too-high');
  const fitted = fitOpenings({ ...room, ceilingHeight: height });
  return { ok: true, room: fitted.room, changes: fitted.changes };
}

/** A new opening's type and, optionally, its size and place. */
export interface OpeningSpec {
  type: OpeningType;
  /** Default: `DEFAULT_OPENINGS[type]`, made to fit the wall and ceiling. */
  width?: number;
  height?: number;
  /** Windows only; doors and openings always start at the floor. */
  sill?: number;
  /** Distance from the wall's start (m). Default: the free spot nearest the middle of the wall. */
  offset?: number;
  /** Default: `door-1`, `window-2`... unique in the room. */
  id?: string;
}

/** An id like `window-3` that no opening in the room uses yet. */
export function newOpeningId(room: Room, type: OpeningType): string {
  const used = new Set(room.walls.flatMap((w) => w.openings.map((o) => o.id)));
  for (let k = 1; ; k++) if (!used.has(`${type}-${k}`)) return `${type}-${k}`;
}

/** The offset closest to `wanted` where an opening of `width` fits between the other openings. */
function nearestFreeOffset(
  wall: Wall,
  length: number,
  width: number,
  wanted: number,
  ignoreId?: string,
): number | null {
  const others = wall.openings.filter((o) => o.id !== ignoreId).sort((p, q) => p.offset - q.offset);
  const gaps: [number, number][] = [];
  let start = 0;
  for (const o of others) {
    gaps.push([start, o.offset]);
    start = Math.max(start, o.offset + o.width);
  }
  gaps.push([start, length]);
  let best: number | null = null;
  for (const [g0, g1] of gaps) {
    if (g1 - g0 < width - EPS) continue;
    const offset = Math.min(Math.max(wanted, g0), g1 - width);
    if (best === null || Math.abs(offset - wanted) < Math.abs(best - wanted)) best = offset;
  }
  return best;
}

const insertSorted = (openings: readonly Opening[], o: Opening): Opening[] =>
  [...openings, o].sort((p, q) => p.offset - q.offset);

/** Adds a door, window or opening to a wall. */
export function addOpening(room: Room, wall: string | number, spec: OpeningSpec): RoomEditResult {
  const i = wallIndexOf(room, wall);
  if (i < 0) return fail('unknown-wall');
  const w = room.walls[i]!;
  const { length } = wallGeometry(room, w);
  const defaults = DEFAULT_OPENINGS[spec.type];
  const width = spec.width ?? Math.min(defaults.width, length);
  let sill = spec.type === 'window' ? (spec.sill ?? defaults.sill) : 0;
  let height = spec.height ?? defaults.height;
  if (spec.height === undefined && sill + height > room.ceilingHeight) {
    height = Math.max(room.ceilingHeight - sill, MIN_OPENING_SIZE);
    if (spec.sill === undefined) sill = Math.max(0, Math.min(sill, room.ceilingHeight - height));
  }
  const offset = spec.offset ?? nearestFreeOffset(w, length, width, (length - width) / 2);
  if (offset === null) return fail('no-room-for-opening', { type: spec.type });
  const opening: Opening = {
    id: spec.id ?? newOpeningId(room, spec.type),
    type: spec.type,
    offset,
    width,
    height,
    sill,
  };
  if (findOpening(room, opening.id)) return fail('opening-overlaps', { type: spec.type });
  const error = validateOpening(room, i, opening);
  if (error) return fail(error, { type: spec.type });
  const next = cloneRoom(room);
  next.walls[i] = { ...next.walls[i]!, openings: insertSorted(next.walls[i]!.openings, opening) };
  return { ok: true, room: next, changes: [] };
}

/**
 * Changes an opening's size, sill or type. A new type takes that type's default height and sill
 * unless they are given. The result must be valid as typed; nothing is adjusted.
 */
export function updateOpening(
  room: Room,
  openingId: string,
  changes: Partial<Pick<Opening, 'type' | 'offset' | 'width' | 'height' | 'sill'>>,
): RoomEditResult {
  const found = findOpening(room, openingId);
  if (!found) return fail('unknown-opening');
  const type = changes.type ?? found.opening.type;
  const retyped = type !== found.opening.type;
  const defaults = DEFAULT_OPENINGS[type];
  const opening: Opening = {
    ...found.opening,
    ...changes,
    type,
    height: changes.height ?? (retyped ? defaults.height : found.opening.height),
    sill: type === 'window' ? (changes.sill ?? (retyped ? defaults.sill : found.opening.sill)) : 0,
  };
  const error = validateOpening(room, found.wallIndex, opening);
  if (error) return fail(error, { type });
  const next = cloneRoom(room);
  const w = next.walls[found.wallIndex]!;
  next.walls[found.wallIndex] = {
    ...w,
    openings: insertSorted(
      w.openings.filter((o) => o.id !== openingId),
      opening,
    ),
  };
  return { ok: true, room: next, changes: [] };
}

/**
 * Moves an opening along its wall, or onto another wall with `toWall`, to the free spot nearest
 * `offset`: it stops at the wall's ends and next to other openings, so a drag can pass every
 * position straight in. Fails only when the opening fits nowhere on that wall.
 */
export function moveOpening(
  room: Room,
  openingId: string,
  offset: number,
  options: { toWall?: string | number } = {},
): RoomEditResult {
  const found = findOpening(room, openingId);
  if (!found) return fail('unknown-opening');
  const target = options.toWall === undefined ? found.wallIndex : wallIndexOf(room, options.toWall);
  if (target < 0) return fail('unknown-wall');
  if (!Number.isFinite(offset)) return fail('opening-outside-wall', { type: found.opening.type });
  const w = room.walls[target]!;
  const { length } = wallGeometry(room, w);
  if (found.opening.width > length + EPS) {
    return fail('opening-outside-wall', { type: found.opening.type });
  }
  const free = nearestFreeOffset(w, length, found.opening.width, offset, openingId);
  if (free === null) return fail('no-room-for-opening', { type: found.opening.type });
  const moved: Opening = { ...found.opening, offset: free };
  const error = validateOpening(room, target, moved);
  if (error && error !== 'opening-overlaps') return fail(error, { type: moved.type });
  const next = cloneRoom(room);
  next.walls[found.wallIndex] = {
    ...next.walls[found.wallIndex]!,
    openings: next.walls[found.wallIndex]!.openings.filter((o) => o.id !== openingId),
  };
  next.walls[target] = {
    ...next.walls[target]!,
    openings: insertSorted(next.walls[target]!.openings, moved),
  };
  return { ok: true, room: next, changes: [] };
}

/** Removes a door, window or opening. */
export function removeOpening(room: Room, openingId: string): RoomEditResult {
  const found = findOpening(room, openingId);
  if (!found) return fail('unknown-opening');
  const next = cloneRoom(room);
  next.walls[found.wallIndex] = {
    ...next.walls[found.wallIndex]!,
    openings: next.walls[found.wallIndex]!.openings.filter((o) => o.id !== openingId),
  };
  return { ok: true, room: next, changes: [] };
}
