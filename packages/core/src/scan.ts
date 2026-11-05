/**
 * Scan geometry: turns wall observations (AR vertical planes or "tap twice" segments on the
 * floor) into a clean room outline.
 *
 * Pipeline of `buildRoomFromWalls`:
 * 1. Merge observations of the same wall (similar direction, close lines, touching extents),
 *    weighting each by its length times its confidence.
 * 2. Optional square-corner snapping: find the room's dominant orientation by 4-fold angle
 *    averaging and snap walls within a few degrees of it to exact multiples of 90°.
 * 3. Order the walls around a centre (the scan position if given, else the centre of the wall
 *    midpoints) by angle, and orient them counter-clockwise seen from above.
 * 4. Join neighbours: a real turn becomes a corner at the line intersection; nearly collinear
 *    neighbours merge; parallel neighbours with an offset get a short connecting wall (alcove or
 *    step); opposite-facing neighbours get the missing wall between them; a corner far beyond
 *    the observed walls falls back to joining their observed ends.
 * 5. Clean up and validate (≥ 3 corners, no self-crossing, walls ≥ 0.2 m, area ≥ 2 m²).
 *
 * An ordering is only right when the centre can see every wall. If the first centre does not give
 * an outline made of corners only (an L-shaped room can put the midpoint centre outside the room),
 * more centres are tried. Each outline is scored by what it assumes: unseen wall ends are cheap,
 * walls that were never observed are expensive, and cutting away observed wall is very expensive
 * (cutting away more than half of one rejects the outline). The cheapest valid outline wins.
 */
import type { Room, Vec2, WallObservation } from './types';
import {
  DEFAULT_MIN_AREA,
  DEFAULT_MIN_WALL_LENGTH,
  describeRoomShapeError,
  signedArea,
  validateRoomShape,
  type RoomShapeError,
} from './polygon';
import { roomFromPoints, DEFAULT_CEILING_HEIGHT } from './room';
import {
  add,
  angleAbove,
  axialAngle,
  distance,
  dot,
  intersectLines,
  isFiniteVec2,
  midpoint,
  neg,
  normalize,
  scale,
  sub,
  toDegrees,
  toRadians,
  turn,
  wrapPi,
  wrapTwoPi,
} from './vec';

export interface ScanOptions {
  /** Observations whose directions differ by less than this (degrees, mod 180) can be the same wall. Default 8. */
  mergeAngleDeg?: number;
  /** ...and whose lines are less than this far apart (m). Default 0.15. */
  mergeDistance?: number;
  /** ...and whose extents overlap or leave a gap smaller than this (m). Default 0.3. */
  mergeGap?: number;
  /** Neighbouring walls that turn by more than this (degrees) meet at a corner. Default 20. */
  cornerAngleDeg?: number;
  /** Nearly parallel neighbours closer than this (m) are one wall; farther apart they form a step. Default 0.2. */
  collinearDistance?: number;
  /** A corner may extend an observed wall by at most this much (m); beyond it the observed ends are joined. Default 3. */
  maxCornerExtension?: number;
  /** Snap walls that are almost square to exact right angles. Default true. */
  snapSquare?: boolean;
  /** Walls within this many degrees of the dominant orientation are snapped. Default 7. */
  squareSnapDeg?: number;
  /** Shortest allowed wall (m). Default 0.2. */
  minWallLength?: number;
  /** Smallest allowed floor area (m²). Default 2. */
  minArea?: number;
  /** Observations shorter than this (m) are ignored. Default 0.1. */
  minObservationLength?: number;
  /** Ceiling height for the returned room (m). Default 8 ft. */
  ceilingHeight?: number;
  /**
   * Where the user stood while scanning (camera position on the floor). Walls are ordered around
   * it. Pass it when you have it: it is the most reliable centre. Default: centre of the wall midpoints.
   */
  center?: Vec2;
}

type ResolvedOptions = Required<Omit<ScanOptions, 'center'>> & { center?: Vec2 };

const DEFAULTS: Required<Omit<ScanOptions, 'center'>> = {
  mergeAngleDeg: 8,
  mergeDistance: 0.15,
  mergeGap: 0.3,
  cornerAngleDeg: 20,
  collinearDistance: 0.2,
  maxCornerExtension: 3,
  snapSquare: true,
  squareSnapDeg: 7,
  minWallLength: DEFAULT_MIN_WALL_LENGTH,
  minArea: DEFAULT_MIN_AREA,
  minObservationLength: 0.1,
  ceilingHeight: DEFAULT_CEILING_HEIGHT,
};

function resolveOptions(options: ScanOptions): ResolvedOptions {
  const o: ResolvedOptions = { ...DEFAULTS };
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined) (o as Record<string, unknown>)[k] = v;
  }
  return o;
}

/** One weighted observation segment. */
interface Piece {
  id: string;
  a: Vec2;
  b: Vec2;
  w: number;
}

/** A wall line fitted to one or more pieces. The observed extent is `c + t·dir` for t in [t0, t1]. */
interface Line {
  pieces: Piece[];
  dir: Vec2;
  c: Vec2;
  t0: number;
  t1: number;
  weight: number;
}

const startOf = (l: Line): Vec2 => add(l.c, scale(l.dir, l.t0));
const endOf = (l: Line): Vec2 => add(l.c, scale(l.dir, l.t1));
const lengthOf = (l: Line): number => l.t1 - l.t0;
const flip = (l: Line): Line => ({ ...l, dir: neg(l.dir), t0: -l.t1, t1: -l.t0 });
const angleOf = (d: Vec2): number => Math.atan2(d.z, d.x);

function extentAlong(pieces: readonly Piece[], c: Vec2, dir: Vec2): [number, number] {
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const p of pieces) {
    for (const q of [p.a, p.b]) {
      const t = dot(sub(q, c), dir);
      if (t < t0) t0 = t;
      if (t > t1) t1 = t;
    }
  }
  return [t0, t1];
}

function lineFromPieces(pieces: Piece[], c: Vec2, dir: Vec2, weight: number): Line {
  const [t0, t1] = extentAlong(pieces, c, dir);
  return { pieces, dir, c, t0, t1, weight };
}

function lineFromPiece(p: Piece): Line {
  return lineFromPieces([p], midpoint(p.a, p.b), normalize(sub(p.b, p.a)), p.w);
}

/**
 * Fits one line to pieces: direction by weighted doubled-angle averaging (so opposite
 * directions agree), through the weighted centroid of the piece midpoints, extent covering all.
 * Depends only on the set of pieces, not on the order they were merged in.
 */
function fitPieces(pieces: Piece[], refDir: Vec2): Line {
  let s2 = 0;
  let c2 = 0;
  let cx = 0;
  let cz = 0;
  let w = 0;
  for (const p of pieces) {
    const th = 2 * Math.atan2(p.b.z - p.a.z, p.b.x - p.a.x);
    s2 += p.w * Math.sin(th);
    c2 += p.w * Math.cos(th);
    cx += (p.w * (p.a.x + p.b.x)) / 2;
    cz += (p.w * (p.a.z + p.b.z)) / 2;
    w += p.w;
  }
  const th = Math.atan2(s2, c2) / 2;
  let dir = { x: Math.cos(th), z: Math.sin(th) };
  if (dot(dir, refDir) < 0) dir = neg(dir);
  return lineFromPieces(pieces, { x: cx / w, z: cz / w }, dir, w);
}

const combine = (A: Line, B: Line): Line => fitPieces([...A.pieces, ...B.pieces], A.dir);

/** Step 1 test: are A and B the same wall? Returns the merged line or null. */
function tryMerge(A: Line, B: Line, o: ResolvedOptions): Line | null {
  if (axialAngle(A.dir, B.dir) > toRadians(o.mergeAngleDeg)) return null;
  const M = combine(A, B);
  const n = { x: -M.dir.z, z: M.dir.x };
  if (Math.abs(dot(sub(A.c, B.c), n)) > o.mergeDistance) return null;
  const [a0, a1] = extentAlong(A.pieces, M.c, M.dir);
  const [b0, b1] = extentAlong(B.pieces, M.c, M.dir);
  if (Math.max(a0, b0) - Math.min(a1, b1) > o.mergeGap) return null;
  return M;
}

function toPieces(
  observations: readonly WallObservation[],
  o: ResolvedOptions,
): { pieces: Piece[]; invalid: number } {
  // A later observation with the same id (an updated AR anchor) replaces the earlier one.
  const byId = new Map<string, WallObservation>();
  let duplicates = 0;
  observations.forEach((obs, i) => {
    if (!obs || typeof obs !== 'object') return;
    const id = typeof obs.id === 'string' ? obs.id : `#${i}`;
    if (byId.has(id)) duplicates++;
    byId.set(id, obs);
  });
  const pieces: Piece[] = [];
  let invalid = observations.length - byId.size - duplicates; // entries that were not objects
  for (const [id, obs] of byId) {
    if (!isFiniteVec2(obs.a) || !isFiniteVec2(obs.b)) {
      invalid++;
      continue;
    }
    const len = distance(obs.a, obs.b);
    if (len < o.minObservationLength) continue;
    const conf = Number.isFinite(obs.confidence) ? Math.min(1, Math.max(0.05, obs.confidence!)) : 1;
    pieces.push({
      id,
      a: { x: obs.a.x, z: obs.a.z },
      b: { x: obs.b.x, z: obs.b.z },
      w: len * conf,
    });
  }
  return { pieces, invalid };
}

function mergeLines(pieces: Piece[], o: ResolvedOptions): Line[] {
  const lines = pieces.map(lineFromPiece).sort((p, q) => q.weight - p.weight);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const m = tryMerge(lines[i]!, lines[j]!, o);
        if (m) {
          lines[i] = m;
          lines.splice(j, 1);
          merged = true;
          j = i; // line i changed: compare it with everything again
        }
      }
    }
  }
  return lines;
}

/** Number of different wall lines: pieces of one wall on both sides of a gap count once. */
function countDistinctLines(lines: readonly Line[], o: ResolvedOptions): number {
  const reps: Line[] = [];
  for (const l of lines) {
    const same = reps.some((r) => {
      if (axialAngle(r.dir, l.dir) > toRadians(o.mergeAngleDeg)) return false;
      const n = { x: -r.dir.z, z: r.dir.x };
      return Math.abs(dot(sub(l.c, r.c), n)) < o.collinearDistance;
    });
    if (!same) reps.push(l);
  }
  return reps.length;
}

/** Step 2: returns a function that snaps a line to the room's dominant orientation. */
function makeSnapper(lines: readonly Line[], maxDeg: number): (l: Line) => Line {
  const maxRad = toRadians(maxDeg);
  const quarter = Math.PI / 2;
  const dominant = (ls: readonly Line[]) => {
    let s = 0;
    let c = 0;
    for (const l of ls) {
      const a = 4 * angleOf(l.dir);
      s += l.weight * Math.sin(a);
      c += l.weight * Math.cos(a);
    }
    return Math.atan2(s, c) / 4;
  };
  const deviation = (l: Line, th0: number) => {
    const th = angleOf(l.dir);
    const target = th0 + Math.round((th - th0) / quarter) * quarter;
    return { target, dev: th - target };
  };
  // Candidates: the average of all walls, and each wall's own orientation. Each is refined by
  // averaging the walls within the snap window; the one that most wall length agrees with wins,
  // so an angled or bay wall cannot tilt the square ones.
  const supportOf = (th: number) =>
    lines.reduce((acc, l) => (Math.abs(deviation(l, th).dev) <= maxRad ? acc + l.weight : acc), 0);
  let th0 = 0;
  let best = -1;
  for (const start of [dominant(lines), ...lines.map((l) => angleOf(l.dir))]) {
    let th = start;
    for (let k = 0; k < 3; k++) {
      const near = lines.filter((l) => Math.abs(deviation(l, th).dev) <= maxRad);
      if (near.length) th = dominant(near);
    }
    const support = supportOf(th);
    if (support > best + 1e-9) {
      best = support;
      th0 = th;
    }
  }
  return (l: Line) => {
    const { target, dev } = deviation(l, th0);
    if (Math.abs(dev) > maxRad) return l;
    return lineFromPieces(l.pieces, l.c, { x: Math.cos(target), z: Math.sin(target) }, l.weight);
  };
}

/** Step 3: orders lines counter-clockwise (seen from above) around `center`. */
function orderAround(lines: readonly Line[], center: Vec2): { lines: Line[]; key: string } | null {
  const items: { line: Line; angle: number; tag: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    // Signed distance from the centre to the line; positive = the line runs counter-clockwise.
    const side = turn(sub(l.c, center), l.dir);
    if (Math.abs(side) < 0.05) return null; // the centre sits on this wall's line: ambiguous
    const oriented = side > 0 ? l : flip(l);
    const mid = add(oriented.c, scale(oriented.dir, (oriented.t0 + oriented.t1) / 2));
    items.push({
      line: oriented,
      angle: angleAbove(sub(mid, center)),
      tag: `${i}${side > 0 ? '+' : '-'}`,
    });
  }
  items.sort((p, q) => p.angle - q.angle);
  // Cyclic key so the same order found from different centres is only evaluated once.
  const tags = items.map((x) => x.tag);
  const first = tags.indexOf(`0+`) >= 0 ? tags.indexOf('0+') : tags.indexOf('0-');
  const key = [...tags.slice(first), ...tags.slice(0, first)].join(',');
  return { lines: items.map((x) => x.line), key };
}

type Junction =
  | { kind: 'corner'; point: Vec2; extA: number; extB: number }
  | { kind: 'collinear'; offset: number }
  | { kind: 'step'; q1: Vec2; q2: Vec2; offset: number }
  | { kind: 'missing'; q1: Vec2; q2: Vec2 }
  | { kind: 'far'; q1: Vec2; q2: Vec2; extA: number; extB: number };

/** Step 4: how wall A (ending) joins the next wall B (starting), both oriented counter-clockwise. */
function junction(A: Line, B: Line, o: ResolvedOptions): Junction {
  const endA = endOf(A);
  const startB = startOf(B);
  const nA = { x: -A.dir.z, z: A.dir.x };
  if (axialAngle(A.dir, B.dir) >= toRadians(o.cornerAngleDeg)) {
    const P = intersectLines(A.c, A.dir, B.c, B.dir)!;
    const extA = dot(sub(P, A.c), A.dir) - A.t1; // > 0: corner lies beyond A's observed end
    const extB = B.t0 - dot(sub(P, B.c), B.dir); // > 0: corner lies before B's observed start
    const maxOvershootA = Math.min(0.9 * lengthOf(A), o.maxCornerExtension);
    const maxOvershootB = Math.min(0.9 * lengthOf(B), o.maxCornerExtension);
    const ok =
      extA <= o.maxCornerExtension &&
      extB <= o.maxCornerExtension &&
      extA >= -maxOvershootA &&
      extB >= -maxOvershootB;
    return ok
      ? { kind: 'corner', point: P, extA, extB }
      : { kind: 'far', q1: endA, q2: startB, extA, extB };
  }
  const sA = dot(sub(endA, A.c), A.dir);
  const sB = dot(sub(startB, A.c), A.dir);
  if (dot(A.dir, B.dir) > 0) {
    // Distance between the two lines in the middle of where they overlap (or of the gap
    // between them), so a slightly tilted piece lying along a wall still counts as that wall.
    const nB = { x: -B.dir.z, z: B.dir.x };
    const bEnd = dot(sub(endOf(B), A.c), A.dir);
    const mid = (Math.max(A.t0, sB) + Math.min(A.t1, bEnd)) / 2;
    const offset = Math.abs(dot(sub(add(A.c, scale(A.dir, mid)), B.c), nB));
    if (offset < o.collinearDistance) return { kind: 'collinear', offset };
    // Alcove or step: a short connecting wall halfway between A's end and B's start.
    const q1 = add(A.c, scale(A.dir, (sA + sB) / 2));
    const q2 = intersectLines(q1, nA, B.c, B.dir) ?? startB;
    return { kind: 'step', q1, q2, offset };
  }
  // Opposite directions: the wall between them was never seen. Put it at the farthest observed end.
  const q1 = add(A.c, scale(A.dir, Math.max(sA, sB)));
  const q2 = intersectLines(q1, nA, B.c, B.dir) ?? startB;
  return { kind: 'missing', q1, q2 };
}

/** Merges neighbours that are the same wall (e.g. both sides of a doorway). */
function mergeCollinearNeighbours(
  lines: Line[],
  o: ResolvedOptions,
  snap: (l: Line) => Line,
): Line[] {
  const ls = lines.slice();
  let changed = true;
  while (changed && ls.length > 1) {
    changed = false;
    for (let i = 0; i < ls.length; i++) {
      const j = (i + 1) % ls.length;
      if (junction(ls[i]!, ls[j]!, o).kind !== 'collinear') continue;
      const merged = snap(combine(ls[i]!, ls[j]!));
      ls[i] = merged;
      ls.splice(j, 1);
      if (j < i) {
        // We merged the last line with the first: keep the order stable.
        ls.unshift(ls.pop()!);
      }
      changed = true;
      break;
    }
  }
  return ls;
}

interface Outline {
  points: Vec2[];
  /** inferred[k] is true when the wall from points[k] to points[k + 1] was not observed. */
  inferred: boolean[];
}

function removeAt<T>(arr: T[], i: number): void {
  arr.splice(i, 1);
}

/** Removes duplicate corners, straight-through corners and walls shorter than `minLen`. */
function cleanUp(outline: Outline, minLen: number): void {
  const { points: p, inferred: f } = outline;
  const straight = Math.cos(toRadians(1));
  for (let guard = 0; guard < 200 && p.length >= 3; guard++) {
    const n = p.length;
    let changed = false;
    for (let k = 0; k < n && !changed; k++) {
      const k1 = (k + 1) % n;
      if (distance(p[k]!, p[k1]!) < 1e-6) {
        f[k] = f[k1]!;
        removeAt(p, k1);
        removeAt(f, k1);
        changed = true;
      }
    }
    if (changed) continue;
    for (let k = 0; k < n && !changed; k++) {
      const km1 = (k - 1 + n) % n;
      const d1 = normalize(sub(p[k]!, p[km1]!));
      const d2 = normalize(sub(p[(k + 1) % n]!, p[k]!));
      if (dot(d1, d2) > straight) {
        f[km1] = f[km1]! && f[k]!;
        removeAt(p, k);
        removeAt(f, k);
        changed = true;
      }
    }
    if (changed) continue;
    if (n <= 3) break;
    let k = -1;
    let shortest = minLen;
    for (let i = 0; i < n; i++) {
      const l = distance(p[i]!, p[(i + 1) % n]!);
      if (l < shortest) {
        shortest = l;
        k = i;
      }
    }
    if (k < 0) break;
    const k1 = (k + 1) % n;
    const prev = p[(k - 1 + n) % n]!;
    const next = p[(k + 2) % n]!;
    const dPrev = sub(p[k]!, prev);
    const dNext = sub(next, p[k1]!);
    const mid = midpoint(p[k]!, p[k1]!);
    let x =
      axialAngle(dPrev, dNext) > toRadians(10) ? intersectLines(prev, dPrev, p[k1]!, dNext) : null;
    if (!x || distance(x, mid) > 3 * minLen) x = mid;
    p[k] = x;
    f[k] = f[k1]!;
    removeAt(p, k1);
    removeAt(f, k1);
  }
}

interface Attempt {
  outline: Outline;
  cost: number;
  clean: boolean;
}

interface Failure {
  error: RoomShapeError;
  reason: string;
}

function failure(error: RoomShapeError, o: ResolvedOptions, wallCount?: number): Failure {
  return {
    error,
    reason: describeRoomShapeError(error, {
      wallCount,
      minWallLength: o.minWallLength,
      minArea: o.minArea,
    }),
  };
}

/** Steps 4-5 for one ordering. */
function buildOutline(
  ordered: Line[],
  o: ResolvedOptions,
  snap: (l: Line) => Line,
): Attempt | Failure {
  const lines = mergeCollinearNeighbours(ordered, o, snap);
  const n = lines.length;
  if (n < 3) return failure('too-few-walls', o, n);
  const joins = lines.map((l, i) => junction(l, lines[(i + 1) % n]!, o));
  const points: Vec2[] = [];
  const inferred: boolean[] = [];
  const firstOf: Vec2[] = [];
  const lastOf: Vec2[] = [];
  // Walls that were never observed cost per metre, joined far corners more (see the header).
  let cost = 0;
  let clean = true;
  for (const j of joins) {
    switch (j.kind) {
      case 'corner':
        points.push(j.point);
        inferred.push(false);
        firstOf.push(j.point);
        lastOf.push(j.point);
        break;
      case 'step':
      case 'missing':
      case 'far':
        points.push(j.q1, j.q2);
        inferred.push(true, false);
        firstOf.push(j.q1);
        lastOf.push(j.q2);
        cost += 1 + 2 * distance(j.q1, j.q2) + (j.kind === 'far' ? 2 : 0);
        clean = false;
        break;
      case 'collinear':
        // Only left when fewer than 3 walls remain, handled above.
        return failure('too-few-walls', o, n);
    }
  }
  // Every observed wall must still run in its own direction between its two corners, and the
  // outline must agree with what was seen: unseen wall ends are cheap to assume, observed wall
  // that the outline cuts away is expensive, and cutting away most of a wall is wrong.
  for (let i = 0; i < n; i++) {
    const l = lines[i]!;
    const s0 = dot(sub(lastOf[(i - 1 + n) % n]!, l.c), l.dir);
    const s1 = dot(sub(firstOf[i]!, l.c), l.dir);
    if (s1 - s0 <= 0) return failure('self-intersecting', o);
    const extension = Math.max(0, l.t0 - s0) + Math.max(0, s1 - l.t1);
    const contradicted = Math.max(0, s0 - l.t0) + Math.max(0, l.t1 - s1);
    if (contradicted > Math.max(0.3, 0.5 * lengthOf(l))) return failure('self-intersecting', o);
    cost += 0.5 * extension + 2 * contradicted;
  }
  const outline: Outline = { points, inferred };
  cleanUp(outline, o.minWallLength);
  const check = validateRoomShape(outline.points, o);
  if (!check.ok) {
    return check.error === 'too-few-walls'
      ? failure('too-few-walls', o, outline.points.length)
      : { error: check.error, reason: check.reason };
  }
  if (signedArea(outline.points) <= 0) return failure('self-intersecting', o);
  return { outline, cost, clean };
}

function meanOf(points: readonly Vec2[]): Vec2 {
  const s = points.reduce((acc, p) => add(acc, p), { x: 0, z: 0 });
  return scale(s, 1 / Math.max(1, points.length));
}

const midOf = (l: Line): Vec2 => add(l.c, scale(l.dir, (l.t0 + l.t1) / 2));

function candidateCenters(lines: readonly Line[], given?: Vec2): { c: Vec2; preferred: boolean }[] {
  const out: { c: Vec2; preferred: boolean }[] = [];
  if (given && isFiniteVec2(given)) out.push({ c: given, preferred: true });
  out.push({ c: meanOf(lines.map(midOf)), preferred: true });
  const w = lines.reduce((s, l) => s + l.weight, 0);
  out.push({
    c: scale(
      lines.reduce((acc, l) => add(acc, scale(midOf(l), l.weight)), { x: 0, z: 0 }),
      1 / w,
    ),
    preferred: true,
  });
  // A grid over the walls' bounding box catches rooms whose centre of midpoints is not inside
  // the room (thin L-shapes).
  const ends = lines.flatMap((l) => [startOf(l), endOf(l)]);
  const minX = Math.min(...ends.map((p) => p.x));
  const maxX = Math.max(...ends.map((p) => p.x));
  const minZ = Math.min(...ends.map((p) => p.z));
  const maxZ = Math.max(...ends.map((p) => p.z));
  const G = 10;
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      out.push({
        c: { x: minX + ((i + 0.5) * (maxX - minX)) / G, z: minZ + ((j + 0.5) * (maxZ - minZ)) / G },
        preferred: false,
      });
    }
  }
  return out;
}

export interface BuildRoomSuccess {
  room: Room;
  /** Indices into `room.walls` of walls that were never observed and were filled in. */
  inferredWalls: number[];
  /** Number of distinct walls found in the observations (after merging duplicates). */
  observedWallCount: number;
}

export interface BuildRoomFailure {
  error: RoomShapeError;
  /** Plain-language explanation to show in the app. */
  reason: string;
}

export type BuildRoomResult = BuildRoomSuccess | BuildRoomFailure;

export const isBuildRoomFailure = (r: BuildRoomResult): r is BuildRoomFailure => 'error' in r;

/**
 * Builds a room outline from wall observations. Returns `{ room }` or `{ error, reason }`.
 */
export function buildRoomFromWalls(
  observations: readonly WallObservation[],
  options: ScanOptions = {},
): BuildRoomResult {
  const o = resolveOptions(options);
  if (!Array.isArray(observations)) return failure('invalid-input', o);
  const { pieces, invalid } = toPieces(observations, o);
  if (observations.length > 0 && invalid === observations.length)
    return failure('invalid-input', o);
  const merged = mergeLines(pieces, o);
  const distinct = countDistinctLines(merged, o);
  if (distinct < 3) return failure('too-few-walls', o, distinct);
  const snap = o.snapSquare ? makeSnapper(merged, o.squareSnapDeg) : (l: Line) => l;
  const lines = merged.map(snap);

  let best: Attempt | null = null;
  let firstFailure: Failure | null = null;
  const seen = new Set<string>();
  for (const { c, preferred } of candidateCenters(lines, o.center)) {
    const ordered = orderAround(lines, c);
    if (!ordered || seen.has(ordered.key)) continue;
    seen.add(ordered.key);
    const attempt = buildOutline(ordered.lines, o, snap);
    if ('error' in attempt) {
      firstFailure ??= attempt;
      continue;
    }
    if (!best || attempt.cost < best.cost) best = attempt;
    if (preferred && best === attempt && attempt.clean) break;
  }
  if (!best) return firstFailure ?? failure('self-intersecting', o);

  const room = roomFromPoints(best.outline.points, { ceilingHeight: o.ceilingHeight });
  const inferredWalls = best.outline.inferred.flatMap((inf, i) => (inf ? [i] : []));
  return { room, inferredWalls, observedWallCount: merged.length };
}

/** A wall as merged from observations, for drawing the live scan map. */
export interface MergedWall {
  a: Vec2;
  b: Vec2;
  length: number;
  /** Ids of the observations merged into this wall. */
  sourceIds: string[];
  /** Sum of observation lengths times confidence. */
  weight: number;
}

/** Merges duplicate observations of the same wall (step 1 of `buildRoomFromWalls`). */
export function mergeWallObservations(
  observations: readonly WallObservation[],
  options: ScanOptions = {},
): MergedWall[] {
  const o = resolveOptions(options);
  return mergeLines(toPieces(observations, o).pieces, o).map((l) => ({
    a: startOf(l),
    b: endOf(l),
    length: lengthOf(l),
    sourceIds: l.pieces.map((p) => p.id),
    weight: l.weight,
  }));
}

interface Arc {
  start: number;
  end: number;
  line: Line;
}

/** Angular interval of each wall seen from `center`, oriented counter-clockwise, sorted by start. */
function wallArcs(lines: readonly Line[], center: Vec2): Arc[] {
  return lines
    .map((l) => {
      const line = turn(sub(l.c, center), l.dir) >= 0 ? l : flip(l);
      const a0 = angleAbove(sub(startOf(line), center));
      const size = Math.max(0, wrapPi(angleAbove(sub(endOf(line), center)) - a0));
      const start = wrapTwoPi(a0);
      return { start, end: start + size, line };
    })
    .sort((p, q) => p.start - q.start);
}

interface ArcGroup {
  start: number;
  end: number;
  first: Line;
  last: Line;
}

/** Union of arcs on the circle; `first`/`last` are the walls at each end of a covered stretch. */
function unionOfArcs(arcs: readonly Arc[]): ArcGroup[] {
  const groups: ArcGroup[] = [];
  for (const a of arcs) {
    const g = groups[groups.length - 1];
    if (g && a.start <= g.end + 1e-9) {
      if (a.end > g.end) {
        g.end = a.end;
        g.last = a.line;
      }
    } else {
      groups.push({ start: a.start, end: a.end, first: a.line, last: a.line });
    }
  }
  // Join the last group with the first if it wraps past 360°.
  while (groups.length > 1) {
    const last = groups[groups.length - 1]!;
    const first = groups[0]!;
    if (last.end - 2 * Math.PI < first.start - 1e-9) break;
    groups.pop();
    first.start = last.start - 2 * Math.PI;
    first.first = last.first;
    if (last.end - 2 * Math.PI > first.end) {
      first.end = last.end - 2 * Math.PI;
      first.last = last.last;
    }
  }
  return groups;
}

/**
 * Without a camera position, picks the candidate centre from which the walls hide each other
 * least (zero for any point that sees every wall), preferring the centre of the wall midpoints.
 */
function coverageCenter(lines: readonly Line[]): Vec2 {
  if (!lines.length) return { x: 0, z: 0 };
  let best = meanOf(lines.map(midOf));
  let bestOverlap = Infinity;
  for (const { c } of candidateCenters(lines)) {
    if (lines.some((l) => Math.abs(turn(sub(l.c, c), l.dir)) < 0.05)) continue;
    const arcs = wallArcs(lines, c);
    const total = arcs.reduce((s, a) => s + (a.end - a.start), 0);
    const union = unionOfArcs(arcs).reduce((s, g) => s + (g.end - g.start), 0);
    const overlap = total - union;
    if (overlap < bestOverlap - 1e-6) {
      bestOverlap = overlap;
      best = c;
    }
    if (overlap < 1e-6) break;
  }
  return best;
}

export interface CoverageGap {
  /** Angles in degrees, counter-clockwise from +X seen from above (see `angleAboveDeg`). */
  fromDeg: number;
  toDeg: number;
  sizeDeg: number;
  /** Middle of the gap: the direction to aim the phone. */
  centerDeg: number;
  /** True when the walls on both sides can be joined without scanning more (a corner or a doorway). */
  bridged: boolean;
}

export interface CoverageResult {
  /** Share of the 360° around the centre covered by observed walls, 0..1. */
  fraction: number;
  coveredDeg: number;
  /** Distinct walls found so far. */
  wallCount: number;
  /** Uncovered directions, largest first. */
  gaps: CoverageGap[];
  /** True when at least 3 walls go all the way around (every gap can be bridged). Use it to finish a scan. */
  closed: boolean;
  /** The centre the angles are measured from. */
  center: Vec2;
}

/**
 * How much of the room the observed walls cover, seen from `options.center` (the camera
 * position, recommended) or the centre of the wall midpoints, and whether the room is closed.
 */
export function coverage(
  observations: readonly WallObservation[],
  options: ScanOptions = {},
): CoverageResult {
  const o = resolveOptions(options);
  const lines = Array.isArray(observations) ? mergeLines(toPieces(observations, o).pieces, o) : [];
  const center = o.center && isFiniteVec2(o.center) ? o.center : coverageCenter(lines);
  const wallCount = countDistinctLines(lines, o);
  if (!lines.length) {
    return {
      fraction: 0,
      coveredDeg: 0,
      wallCount: 0,
      gaps: [{ fromDeg: 0, toDeg: 360, sizeDeg: 360, centerDeg: 180, bridged: false }],
      closed: false,
      center,
    };
  }
  const arcs = wallArcs(lines, center);

  const groups = unionOfArcs(arcs);
  const coveredRad = Math.min(
    2 * Math.PI,
    groups.reduce((s, g) => s + (g.end - g.start), 0),
  );

  const gaps: CoverageGap[] = [];
  const tol = toRadians(10);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const next = groups[(i + 1) % groups.length]!;
    const from = g.end;
    let to = next.start + (i + 1 >= groups.length ? 2 * Math.PI : 0);
    if (groups.length === 1) to = g.start + 2 * Math.PI;
    const size = to - from;
    if (size <= 1e-9) continue;
    const j = junction(g.last, next.first, o);
    let bridged = false;
    if (lines.length >= 2 && g.last !== next.first) {
      if (j.kind === 'corner') {
        const a = wrapTwoPi(angleAbove(sub(j.point, center)) - from);
        bridged = a <= size + tol || a >= 2 * Math.PI - tol;
      } else if (j.kind === 'collinear') {
        bridged = true;
      } else if (j.kind === 'step') {
        bridged = j.offset <= 1;
      }
    }
    const fromDeg = toDegrees(wrapTwoPi(from));
    const sizeDeg = toDegrees(size);
    gaps.push({
      fromDeg,
      toDeg: toDegrees(wrapTwoPi(to)),
      sizeDeg,
      centerDeg: toDegrees(wrapTwoPi(from + size / 2)),
      bridged,
    });
  }
  gaps.sort((p, q) => q.sizeDeg - p.sizeDeg);
  return {
    fraction: coveredRad / (2 * Math.PI),
    coveredDeg: toDegrees(coveredRad),
    wallCount,
    gaps,
    closed: wallCount >= 3 && gaps.every((g) => g.bridged),
    center,
  };
}
