/**
 * Walking through a room: the pure half of the website 3D view's Walk mode. What a person standing
 * in the room cannot walk through, how a step is stopped by it, where they stand when they start,
 * and how a body moves from one frame to the next. No three.js, no DOM: the view builds the model
 * from the room it draws and moves its camera by these answers.
 *
 * Ported from the team's closet designer (TAKEOFFPRIME, branch avena/closet-ux):
 * `src/brands/avena/tools/closet/walk3d.js` and the walk settings of `closet/look3d.js`. The
 * behaviour and every constant are the closet's, converted from inches to metres; the model is
 * built from a YoungVista room (`Room`) and its furniture footprints instead of a closet.
 *
 * Plan coordinates are the room's: metres on the floor, `{ x, z }`.
 *
 *   · a WALL is its inner face (a segment) with its thickness behind it, solid from the floor
 *     up. A door or a doorless opening is a gap in it, walked through; a window is not.
 *   · a LEAF is a slab standing in a doorway (a door leaf). YoungVista draws no door leaves, so
 *     rooms have none, but the model keeps them as the closet does.
 *   · a UNIT is a piece of furniture's footprint, a quad on the floor.
 *   · the FLOOR is the outline a person stays inside: the room and some floor round it, out
 *     through its doors; its edge is slid along like a wall.
 *
 * A person is a circle `radius` wide on the floor; a step that would leave them inside a wall, a
 * leaf or a unit is slid along it, and one that would leave the floor is not taken.
 *
 * The BODY (`advanceBody`) moves the way game players move, Quake's way (its sv_user.c): the keys
 * say which way and how fast a person wants to go; friction sheds speed and acceleration gains on
 * the wanted pace, so a walk starts and stops over a fraction of a second rather than at once. A
 * jump rises and falls under gravity and the ceiling stops the head; C crouches; each step lifts
 * and sways the head a little (`headOffset`).
 */
import type { Room, Vec2 } from './types';
import { bounds, signedArea } from './polygon';
import { DEFAULT_WALL_THICKNESS } from './room-mesh';

const EPS = 1e-9;
/** Metres in an inch: the closet's constants are in inches. */
const IN = 0.0254;

// ── the person's own settings (the closet's WALK_* in look3d.js) ──────────────────────────────

/** Your height, in centimetres: the eyes are at 93.5% of it. */
export const WALK_HEIGHT_CM = { min: 140, max: 210, default: 170 } as const;
/**
 * The field of view, top to bottom, in degrees. A walk starts at 100° (a room looks as big as it
 * is only through a wide lens); past `wide` the edges stretch, as through any wide-angle lens.
 */
export const WALK_FOV = { min: 30, max: 150, default: 100, wide: 120 } as const;
/** How fast the mouse turns the head (× `WALK.lookPerPx`). */
export const WALK_LOOK = { min: 0.25, max: 3, default: 1 } as const;

const within = (v: unknown, r: { min: number; max: number; default: number }, step: number) => {
  const n = v == null || v === '' ? NaN : Number(v); // Number(null) is 0, never a choice
  if (!Number.isFinite(n)) return r.default;
  return Math.max(r.min, Math.min(r.max, Math.round(n / step) * step));
};
export const normalizeHeightCm = (v: unknown): number => within(v, WALK_HEIGHT_CM, 1);
export const normalizeFov = (v: unknown): number => within(v, WALK_FOV, 1);
export const normalizeLookSpeed = (v: unknown): number =>
  Number(within(v, WALK_LOOK, 0.05).toFixed(2));

/**
 * Skin tones for the first-person hand, light to dark: which photographed skin it wears and how
 * much brighter or darker, so the hue stays the skin's own. `hex` is the swatch.
 */
export const SKIN_TONES = [
  { id: 'light', name: 'Light', hex: '#e3a98a', texture: 'light', gain: 0.88 },
  { id: 'medium-light', name: 'Medium light', hex: '#cd997c', texture: 'light', gain: 0.69 },
  { id: 'medium', name: 'Medium', hex: '#b3856c', texture: 'light', gain: 0.5 },
  { id: 'medium-dark', name: 'Medium dark', hex: '#895e42', texture: 'dark', gain: 1.39 },
  { id: 'dark', name: 'Dark', hex: '#6e4b34', texture: 'dark', gain: 0.85 },
] as const;
export type SkinTone = (typeof SKIN_TONES)[number];
export const DEFAULT_SKIN = 'medium';
export const normalizeSkin = (v: unknown): SkinTone['id'] =>
  SKIN_TONES.find((s) => s.id === v)?.id ?? DEFAULT_SKIN;
export const skinOf = (v: unknown): SkinTone =>
  SKIN_TONES.find((s) => s.id === normalizeSkin(v)) ?? SKIN_TONES[2];
/** Centimetres as feet and inches, for the height slider: 170 → 5′ 7″. */
export function feetInches(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
}

// ── how a walk moves (the closet's ROOM_LOOK.walk, in metres) ─────────────────────────────────

export interface WalkBob {
  /** The head's rise and fall with each step (m). */
  rise: number;
  /** Its sway to the side (m). */
  sway: number;
  /** A touch of roll (degrees). */
  rollDeg: number;
  /** A stride (two steps) as a share of the person's height. */
  strideRatio: number;
  /** How far a landing gives at the knees, at most (m). */
  landDip: number;
}

export interface WalkConfig {
  /** The eyes' share of a person's height (ANSUR II), and crouched (C held). */
  eyeRatio: number;
  crouchRatio: number;
  /** Seconds to crouch down, or to stand back up. */
  crouchSec: number;
  /** The hand's own camera: a fixed field of view, so the hand keeps its size. */
  handFovDeg: number;
  /** Walking pace (m/s), how much faster with Shift held, and how much slower crouched. */
  speed: number;
  runFactor: number;
  crouchFactor: number;
  /** Quake's acceleration (a share of the pace a second), friction, stop speed (m/s) and air grip. */
  accel: number;
  friction: number;
  stopSpeed: number;
  airControl: number;
  /** How high a jump lifts the feet (m), and gravity (m/s²). */
  jump: number;
  gravity: number;
  bob: WalkBob;
  /** How fast ← and → turn. */
  turnDegPerSec: number;
  /** How close a body comes to a wall or a piece: half a person's width (m). */
  radius: number;
  /** Radians of turn per pixel the mouse moves, and per pixel dragged without the pointer lock. */
  lookPerPx: number;
  dragLookPerPx: number;
  /** How far a hand reaches (m). */
  reach: number;
  /** How far one wheel notch steps (m per pixel of wheel delta). */
  wheelPerPx: number;
  /** Floor round the room while walking, out through its doors (m). */
  overhang: number;
}

/** The closet's walk settings, inch for inch, in metres. */
export const WALK: WalkConfig = {
  eyeRatio: 0.935,
  crouchRatio: 0.6,
  crouchSec: 0.2,
  handFovDeg: 54,
  speed: 50 * IN,
  runFactor: 1.6,
  crouchFactor: 0.45,
  accel: 8,
  friction: 7,
  stopSpeed: 12 * IN,
  airControl: 0.12,
  jump: 16 * IN,
  gravity: 386 * IN,
  bob: { rise: 0.45 * IN, sway: 0.25 * IN, rollDeg: 0.3, strideRatio: 0.82, landDip: 1.6 * IN },
  turnDegPerSec: 90,
  radius: 9 * IN,
  lookPerPx: 0.0026,
  dragLookPerPx: 0.0042,
  reach: 150 * IN,
  wheelPerPx: 0.25 * IN,
  overhang: 120 * IN,
};

// ── the model ─────────────────────────────────────────────────────────────────────────────────

/** A wall: its inner face from a to b, the unit normal into the room, and its thickness behind. */
export interface WalkWall {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  nx: number;
  nz: number;
  t: number;
}

/** A door leaf: the slab's middle line and its thickness. */
export interface WalkLeaf {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  t: number;
}

export interface WalkModel {
  walls: WalkWall[];
  /** Furniture footprints (convex quads). */
  units: Vec2[][];
  /** The floor's outline; empty means no limit. */
  floor: Vec2[];
  leaves: WalkLeaf[];
  /** The floor's edge as walls of no thickness. */
  edges: WalkWall[];
}

/** The floor's edge as zero-thickness walls, each with its inward normal, so walking into it slides along it. */
function floorEdges(floor: readonly Vec2[]): WalkWall[] {
  if (!floor.length) return [];
  // The shoelace sum as the closet takes it (core's `signedArea` has the opposite sign).
  let area = 0;
  for (let i = 0; i < floor.length; i++) {
    const a = floor[i]!;
    const b = floor[(i + 1) % floor.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  const s = area > 0 ? 1 : -1; // which side of an edge is inside
  const out: WalkWall[] = [];
  for (let i = 0; i < floor.length; i++) {
    const a = floor[i]!;
    const b = floor[(i + 1) % floor.length]!;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    out.push({
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      nx: (-(b.z - a.z) / L) * s,
      nz: ((b.x - a.x) / L) * s,
      t: 0,
    });
  }
  return out;
}

/** The model a walk is checked against. */
export function walkModel({
  walls = [],
  units = [],
  floor = [],
  leaves = [],
}: Partial<Omit<WalkModel, 'edges'>>): WalkModel {
  return { walls, units, floor, leaves, edges: floorEdges(floor) };
}

/**
 * The walls of a room as a person meets them: every wall at its true inside face, `thickness`
 * thick behind it, cut round its doors and doorless openings (gaps walked through).
 */
export function roomWalkWalls(room: Room, thickness = DEFAULT_WALL_THICKNESS): WalkWall[] {
  const orient = signedArea(room.points) >= 0 ? 1 : -1;
  const out: WalkWall[] = [];
  for (const w of room.walls) {
    const pa = room.points[w.a];
    const pb = room.points[w.b];
    if (!pa || !pb) continue;
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    if (len < 1e-6) continue;
    const ux = (pb[0] - pa[0]) / len;
    const uz = (pb[1] - pa[1]) / len;
    // Into the room: the left of the wall for a counter-clockwise outline (as in placement.ts).
    const nx = uz * orient;
    const nz = -ux * orient;
    const gaps = w.openings
      .filter((o) => o.type !== 'window')
      .map((o): [number, number] => [Math.max(0, o.offset), Math.min(len, o.offset + o.width)])
      .sort((p, q) => p[0] - q[0]);
    let cur = 0;
    const piece = (t0: number, t1: number) => {
      if (t1 - t0 < 1e-6) return;
      out.push({
        ax: pa[0] + ux * t0,
        az: pa[1] + uz * t0,
        bx: pa[0] + ux * t1,
        bz: pa[1] + uz * t1,
        nx,
        nz,
        t: thickness,
      });
    };
    for (const [g0, g1] of gaps) {
      piece(cur, g0);
      cur = Math.max(cur, g1);
    }
    piece(cur, len);
  }
  return out;
}

/**
 * The walk model of a room: its walls (doors and openings are gaps), the furniture footprints
 * that stand on the floor, and floor round the room (`overhang`, past the walls) to step out onto.
 */
export function roomWalkModel(
  room: Room,
  units: readonly (readonly Vec2[])[] = [],
  options: { thickness?: number; overhang?: number } = {},
): WalkModel {
  const t = options.thickness ?? DEFAULT_WALL_THICKNESS;
  const m = t + (options.overhang ?? WALK.overhang);
  const b = bounds(room.points);
  return walkModel({
    walls: roomWalkWalls(room, t),
    units: units.map((q) => q.map((p) => ({ x: p.x, z: p.z }))),
    floor: [
      { x: b.minX - m, z: b.minZ - m },
      { x: b.maxX + m, z: b.minZ - m },
      { x: b.maxX + m, z: b.maxZ + m },
      { x: b.minX - m, z: b.maxZ + m },
    ],
  });
}

/** The closest point on segment ab to p. */
function closest(px: number, pz: number, ax: number, az: number, bx: number, bz: number): Vec2 {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const t = L2 < EPS ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return { x: ax + dx * t, z: az + dz * t };
}

/** Whether p is inside the convex quad q (either winding). */
function insideQuad(px: number, pz: number, q: readonly Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const c = (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x);
    if (Math.abs(c) < EPS) continue;
    const s = Math.sign(c);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

function pointInPolygon(p: Vec2, pts: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Pushes a person standing at p (radius r) out of every wall, door leaf and piece they overlap, a
 * few passes so a corner between two of them settles. A wall is a slab with square ends; a leaf a
 * capsule round its middle line; a piece a quad. Returns the settled point.
 */
export function settle(p: Vec2, model: WalkModel, r: number): Vec2 {
  let x = p.x;
  let z = p.z;
  // a capsule round the segment (ax,az)-(bx,bz), `h` thick each side of it: push out along the
  // nearest way, or along (nx, nz) when dead on it
  const capsule = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    h: number,
    nx: number,
    nz: number,
  ) => {
    const c = closest(x, z, ax, az, bx, bz);
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const need = r + h;
    if (d >= need) return false;
    if (d < EPS) {
      x = c.x + nx * need;
      z = c.z + nz * need;
    } else {
      x = c.x + (dx / d) * need;
      z = c.z + (dz / d) * need;
    }
    return true;
  };
  // a wall: a slab (its inner face, its thickness behind) with square ends, so a doorway is as
  // wide as it is (a person passes a jamb as close as their own width allows); inside it, out the
  // nearest way
  const slab = (w: WalkWall) => {
    const ux = w.bx - w.ax;
    const uz = w.bz - w.az;
    const L = Math.hypot(ux, uz);
    if (L < EPS) return false;
    const ex = ux / L;
    const ez = uz / L;
    const along = (x - w.ax) * ex + (z - w.az) * ez;
    const behind = -((x - w.ax) * w.nx + (z - w.az) * w.nz); // < 0 in the room
    const ca = Math.max(0, Math.min(L, along));
    const cb = Math.max(0, Math.min(w.t, behind));
    const cx = w.ax + ex * ca - w.nx * cb;
    const cz = w.az + ez * ca - w.nz * cb;
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d >= r) return false;
    if (d > EPS) {
      x = cx + (dx / d) * r;
      z = cz + (dz / d) * r;
      return true;
    }
    // in it (or on its face): out through the nearest side
    const ways: [number, number, number, number, number][] = [
      [behind, w.nx, w.nz, w.ax + ex * along, w.az + ez * along],
      [w.t - behind, -w.nx, -w.nz, w.ax + ex * along - w.nx * w.t, w.az + ez * along - w.nz * w.t],
      [along, -ex, -ez, w.ax - w.nx * behind, w.az - w.nz * behind],
      [L - along, ex, ez, w.bx - w.nx * behind, w.bz - w.nz * behind],
    ];
    const way = ways.sort((p, q) => p[0] - q[0])[0]!;
    x = way[3] + way[1] * r;
    z = way[4] + way[2] * r;
    return true;
  };
  const walls = model.edges ? [...model.walls, ...model.edges] : model.walls;
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    // the walls, and the floor's edge (a wall of no thickness)
    for (const w of walls) if (slab(w)) moved = true;
    // a door leaf: its own middle line, out the way it is (either side will do)
    for (const l of model.leaves) {
      const L = Math.hypot(l.bx - l.ax, l.bz - l.az) || 1;
      if (capsule(l.ax, l.az, l.bx, l.bz, l.t / 2, -(l.bz - l.az) / L, (l.bx - l.ax) / L)) {
        moved = true;
      }
    }
    for (const q of model.units) {
      let best: { c: Vec2; d: number; a: Vec2; b: Vec2 } | null = null;
      for (let i = 0; i < q.length; i++) {
        const a = q[i]!;
        const b = q[(i + 1) % q.length]!;
        const c = closest(x, z, a.x, a.z, b.x, b.z);
        const d = Math.hypot(x - c.x, z - c.z);
        if (!best || d < best.d) best = { c, d, a, b };
      }
      if (!best) continue;
      const inside = insideQuad(x, z, q);
      if (!inside && best.d >= r) continue;
      if (inside) {
        // out through the nearest side: the side's outward normal
        const ex = best.b.x - best.a.x;
        const ez = best.b.z - best.a.z;
        const L = Math.hypot(ex, ez) || 1;
        let nx = ez / L;
        let nz = -ex / L;
        const mx = (q[0]!.x + q[2]!.x) / 2;
        const mz = (q[0]!.z + q[2]!.z) / 2;
        if ((best.c.x - mx) * nx + (best.c.z - mz) * nz < 0) {
          nx = -nx;
          nz = -nz;
        }
        x = best.c.x + nx * r;
        z = best.c.z + nz * r;
      } else {
        x = best.c.x + ((x - best.c.x) / best.d) * r;
        z = best.c.z + ((z - best.c.z) / best.d) * r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

const onFloor = (p: Vec2, model: WalkModel) =>
  !model.floor.length || pointInPolygon(p, model.floor);

/**
 * One step from `from` by (dx, dz): taken in pieces no longer than half the body (so no wall is
 * stepped through), each settled against the walls and pieces. A piece that would leave the floor
 * stops the step there.
 */
export function step(from: Vec2, dx: number, dz: number, model: WalkModel, r: number): Vec2 {
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / Math.max(IN, r * 0.5)));
  let p = { x: from.x, z: from.z };
  for (let i = 0; i < n; i++) {
    const next = settle({ x: p.x + dx / n, z: p.z + dz / n }, model, r);
    if (!onFloor(next, model)) break;
    p = next;
  }
  return p;
}

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** How far along the ray (o, d) the first segment is; Infinity if none. */
function rayToSegments(ox: number, oz: number, dx: number, dz: number, segs: readonly Segment[]) {
  let best = Infinity;
  for (const w of segs) {
    const ex = w.bx - w.ax;
    const ez = w.bz - w.az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < EPS) continue;
    const t = ((w.ax - ox) * ez - (w.az - oz) * ex) / den;
    const u = ((w.ax - ox) * dz - (w.az - oz) * dx) / den;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  return best;
}

/** Where a person stands and looks: yaw is the facing, radians from +z toward +x. */
export interface WalkPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** How far inside the way in a walk starts (m): a step in from the doorway. */
const WAY_IN = 0.75;

/**
 * Where a person stands when the walk starts: at the way in (`openDir` points out of it), facing
 * into the room, at least far enough back from the wall opposite to take in the room's width at
 * `fovDeg` × `aspect`, then settled clear of every wall and piece and kept on the floor. `center`
 * is a point well inside the room. Looks level, as someone walking in does.
 *
 * The closet stands a person far enough back to take in the closet's width (a closet is shallow,
 * so that is at its way in); a room is deeper, so the start comes forward to its way in too.
 */
export function startPose({
  model,
  center,
  openDir,
  outline,
  radius = WALK.radius,
  fovDeg = WALK_FOV.default,
  aspect = 1.6,
}: {
  model: WalkModel;
  center: Vec2;
  openDir: readonly [number, number];
  /** The room's own outline, to measure its depth through doorways. Default: the walls. */
  outline?: readonly Vec2[];
  radius?: number;
  fovDeg?: number;
  aspect?: number;
}): WalkPose {
  const [ox, oz] = openDir;
  const fx = -ox;
  const fz = -oz;
  const sides: Segment[] = outline?.length
    ? outline.map((a, i) => {
        const b = outline[(i + 1) % outline.length]!;
        return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
      })
    : model.walls;
  const back = rayToSegments(center.x, center.z, fx, fz, sides);
  const bx = Number.isFinite(back) ? center.x + fx * back : center.x;
  const bz = Number.isFinite(back) ? center.z + fz * back : center.z;
  // the room's width across the view: every wall end, measured sideways
  const sx = -fz;
  const sz = fx;
  let lo = Infinity;
  let hi = -Infinity;
  for (const w of model.walls) {
    for (const [x, z] of [
      [w.ax, w.az],
      [w.bx, w.bz],
    ] as const) {
      const s = (x - bx) * sx + (z - bz) * sz;
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
  }
  const across = Number.isFinite(lo) ? hi - lo : 60 * IN;
  const vfov = (fovDeg * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  let need = Math.max(36 * IN, Math.min(150 * IN, across / 2 / Math.tan(hfov / 2) + 12 * IN));
  // …and forward to the way in: the room's depth along the view, less a step
  const front = rayToSegments(bx - fx * 1e-4, bz - fz * 1e-4, ox, oz, sides);
  if (Number.isFinite(front)) need = Math.max(need, Math.min(front - WAY_IN, front - radius));
  let p = settle({ x: bx + ox * need, z: bz + oz * need }, model, radius);
  // off the floor (no floor before the room): walk it back in
  for (let k = 0; k < 40 && !onFloor(p, model); k++) {
    p = settle({ x: p.x - ox * 4 * IN, z: p.z - oz * 4 * IN }, model, radius);
  }
  if (!onFloor(p, model)) p = settle(center, model, radius);
  return { x: p.x, z: p.z, yaw: Math.atan2(fx, fz), pitch: 0 };
}

/**
 * A point well inside a polygon (the middle of its floor, wherever its shape puts that): the grid
 * point farthest from every edge.
 */
export function innerPoint(outline: readonly Vec2[]): Vec2 {
  const xs = outline.map((p) => p.x);
  const zs = outline.map((p) => p.z);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const n = 24;
  let best: { x: number; z: number; d: number } | null = null;
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * j) / n };
      if (!pointInPolygon(p, outline)) continue;
      let d = Infinity;
      for (let k = 0; k < outline.length; k++) {
        const a = outline[k]!;
        const b = outline[(k + 1) % outline.length]!;
        const c = closest(p.x, p.z, a.x, a.z, b.x, b.z);
        d = Math.min(d, Math.hypot(p.x - c.x, p.z - c.z));
      }
      if (!best || d > best.d) best = { ...p, d };
    }
  return best ? { x: best.x, z: best.z } : { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

/**
 * Which way a room opens, in plan: out through its doors and doorless openings (their outward
 * normals, weighted by width), else out of the bottom of the plan (+z), so a walk starts where
 * someone walking in would stand.
 */
export function roomOpenDir(room: Room): [number, number] {
  const orient = signedArea(room.points) >= 0 ? 1 : -1;
  let x = 0;
  let z = 0;
  for (const w of room.walls) {
    const pa = room.points[w.a];
    const pb = room.points[w.b];
    if (!pa || !pb) continue;
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    if (len < 1e-6) continue;
    // out of the room: the opposite of the inward normal
    const outX = -((pb[1] - pa[1]) / len) * orient;
    const outZ = ((pb[0] - pa[0]) / len) * orient;
    for (const o of w.openings) {
      if (o.type === 'window') continue;
      x += outX * o.width;
      z += outZ * o.width;
    }
  }
  const n = Math.hypot(x, z);
  return n > 1e-9 ? [x / n, z / n] : [0, 1];
}

/** Where a walk through `room` starts (`startPose` from the room's own way in). */
export function roomStartPose(
  room: Room,
  model: WalkModel,
  options: { radius?: number; fovDeg?: number; aspect?: number } = {},
): WalkPose {
  const outline = room.points.map(([x, z]) => ({ x, z }));
  return startPose({
    model,
    center: innerPoint(outline),
    openDir: roomOpenDir(room),
    outline,
    ...options,
  });
}

/** Whether any door leaf, standing as given, would overlap a person at p. */
export function leavesHit(leaves: readonly WalkLeaf[], p: Vec2, r: number): boolean {
  for (const l of leaves) {
    const c = closest(p.x, p.z, l.ax, l.az, l.bx, l.bz);
    if (Math.hypot(p.x - c.x, p.z - c.z) < r + l.t / 2) return true;
  }
  return false;
}

// ── the body ──────────────────────────────────────────────────────────────────────────────────

const smooth01 = (t: number) => t * t * (3 - 2 * t);
/** The knees' spring rate (a landing's give comes back in about ⅓ s). */
const DIP_W = 14;

/** A person's eye height standing, and crouched (m), from their height in centimetres. */
export const eyeStand = (heightCm: number, cfg: Pick<WalkConfig, 'eyeRatio'> = WALK): number =>
  (heightCm * cfg.eyeRatio) / 100;
export const eyeCrouch = (heightCm: number, cfg: Pick<WalkConfig, 'crouchRatio'> = WALK): number =>
  (heightCm * cfg.crouchRatio) / 100;

/**
 * A BODY at a pose, what `advanceBody` moves:
 *   x, z, yaw, pitch   where it stands and looks (the pose)
 *   vx, vz             how fast it is going across the floor (m/s)
 *   y, vy              the feet off the floor, and rising (a jump)
 *   crouch             0 standing … 1 crouched
 *   phase, stride      the step cycle (a stride, two steps, is 2π) and how much of it shows (none
 *                      standing still)
 *   dip, dipV          a landing's give at the knees, sprung back to 0
 */
export interface WalkBody extends WalkPose {
  vx: number;
  vz: number;
  y: number;
  vy: number;
  crouch: number;
  phase: number;
  stride: number;
  dip: number;
  dipV: number;
}

export const newBody = (pose: WalkPose): WalkBody => ({
  x: pose.x,
  z: pose.z,
  yaw: pose.yaw,
  pitch: pose.pitch,
  vx: 0,
  vz: 0,
  y: 0,
  vy: 0,
  crouch: 0,
  phase: 0,
  stride: 0,
  dip: 0,
  dipV: 0,
});

/** Where the eyes are now (m): crouched or not, off the floor in a jump. */
export const eyeHeightOf = (
  b: Pick<WalkBody, 'crouch' | 'y'>,
  heightCm: number,
  cfg: Pick<WalkConfig, 'eyeRatio' | 'crouchRatio'> = WALK,
): number =>
  eyeStand(heightCm, cfg) +
  (eyeCrouch(heightCm, cfg) - eyeStand(heightCm, cfg)) * smooth01(b.crouch || 0) +
  (b.y || 0);

/** The keys held: W/S and D/A (−1…1 each), Shift and C held, Space pressed since the last frame. */
export interface WalkInput {
  fwd?: number;
  right?: number;
  run?: boolean;
  crouch?: boolean;
  jump?: boolean;
}

/** `WALK` with the person's height and the room's ceiling (m). */
export type BodyConfig = WalkConfig & { heightCm: number; ceiling?: number };

/**
 * One frame of a walk, `dt` seconds long. Returns the next body; it never ends up inside a wall,
 * a leaf or a piece, or off the floor (`step`).
 */
export function advanceBody(
  b: WalkBody,
  input: WalkInput,
  dt: number,
  model: WalkModel,
  cfg: BodyConfig,
): WalkBody {
  if (!(dt > 0)) return b;
  const n = { ...b };
  const g = cfg.gravity;
  const ground = n.y <= 1e-6 * IN && n.vy <= 0;

  // crouching down or standing up, at its own pace
  const want = input.crouch ? 1 : 0;
  const rate = dt / Math.max(0.01, cfg.crouchSec);
  n.crouch = want > n.crouch ? Math.min(want, n.crouch + rate) : Math.max(want, n.crouch - rate);

  // which way the keys ask to go, across the floor (a diagonal is no faster)
  const fx = Math.sin(n.yaw);
  const fz = Math.cos(n.yaw);
  let wx = fx * (input.fwd || 0) - fz * (input.right || 0);
  let wz = fz * (input.fwd || 0) + fx * (input.right || 0);
  const wl = Math.hypot(wx, wz);
  const amount = Math.min(1, wl);
  if (wl > 1e-9) {
    wx /= wl;
    wz /= wl;
  }
  const pace =
    cfg.speed * (input.run ? cfg.runFactor : 1) * (1 + (cfg.crouchFactor - 1) * smooth01(n.crouch));
  const wish = pace * amount;

  // on the floor, friction first (never slower than the stop speed, so a stop comes to rest),
  // then gain on the wished-for pace, never past it
  if (ground) {
    const sp = Math.hypot(n.vx, n.vz);
    if (sp > 0) {
      const drop = Math.max(sp, cfg.stopSpeed) * cfg.friction * dt;
      const k = Math.max(0, sp - drop) / sp;
      n.vx *= k;
      n.vz *= k;
    }
  }
  if (wish > 0) {
    const add = wish - (n.vx * wx + n.vz * wz);
    if (add > 0) {
      const a = Math.min(add, cfg.accel * (ground ? 1 : cfg.airControl) * wish * dt);
      n.vx += a * wx;
      n.vz += a * wz;
    }
  }

  // across the floor, stopped by what is in the way: what a wall took off the step is gone from
  // the speed, and nothing it pushed adds any
  const to = step({ x: n.x, z: n.z }, n.vx * dt, n.vz * dt, model, cfg.radius);
  const mx = (to.x - n.x) / dt;
  const mz = (to.z - n.z) / dt;
  const was = Math.hypot(n.vx, n.vz);
  const now = Math.hypot(mx, mz);
  const keep = now > was && now > 1e-9 ? was / now : 1;
  n.vx = mx * keep;
  n.vz = mz * keep;
  n.x = to.x;
  n.z = to.z;

  // up and down: a jump from the floor, gravity, the ceiling over the head
  if (ground && input.jump && n.crouch < 0.5) n.vy = Math.sqrt(2 * g * cfg.jump);
  if (n.y > 1e-6 * IN || n.vy > 0) {
    n.y += n.vy * dt - 0.5 * g * dt * dt; // the true arc, whatever the frame rate
    n.vy -= g * dt;
    const head = (cfg.heightCm * (1 - cfg.eyeRatio)) / 100;
    const room = Math.max(
      0,
      (cfg.ceiling ?? Infinity) - 0.5 * IN - head - eyeHeightOf({ ...n, y: 0 }, cfg.heightCm, cfg),
    );
    if (n.y > room) {
      n.y = room;
      n.vy = Math.min(0, n.vy);
    }
    if (n.y <= 0) {
      // landing: the knees give with the fall, as much as a full jump's worth
      const impact = Math.min(1, -n.vy / Math.sqrt(2 * g * Math.max(IN, cfg.jump)));
      n.dipV = impact * cfg.bob.landDip * DIP_W * Math.E;
      n.y = 0;
      n.vy = 0;
    }
  }
  // the knees' spring, critically damped
  if (n.dip || n.dipV) {
    n.dipV += (-DIP_W * DIP_W * n.dip - 2 * DIP_W * n.dipV) * dt;
    n.dip += n.dipV * dt;
    if (Math.abs(n.dip) < 1e-3 * IN && Math.abs(n.dipV) < 1e-2 * IN) n.dip = n.dipV = 0;
  }

  // the step cycle runs with the distance walked; the bob shows with pace
  const sp = Math.hypot(n.vx, n.vz);
  const stride = (cfg.bob.strideRatio * cfg.heightCm) / 100;
  const standing = n.y <= 1e-6 * IN;
  if (standing) n.phase = (n.phase + ((sp * dt) / stride) * 2 * Math.PI) % (2 * Math.PI);
  const target = standing ? Math.min(1, sp / cfg.speed) : 0;
  n.stride += (target - n.stride) * Math.min(1, dt * 8);
  if (n.stride < 1e-4) n.stride = 0;
  return n;
}

/**
 * View bobbing: how far the eyes are off their mark this frame (m), up and to the right, and the
 * head's roll (radians), with the landing's give.
 */
export function headOffset(
  b: Pick<WalkBody, 'stride' | 'phase' | 'dip'>,
  cfg: Pick<WalkConfig, 'bob'> = WALK,
  on = true,
): { up: number; side: number; roll: number } {
  if (!on) return { up: 0, side: 0, roll: 0 };
  const B = cfg.bob;
  const w = b.stride || 0;
  return {
    up: B.rise * w * Math.cos(2 * (b.phase || 0)) - (b.dip || 0),
    side: B.sway * w * Math.sin(b.phase || 0),
    roll: ((B.rollDeg * Math.PI) / 180) * w * Math.sin(b.phase || 0),
  };
}

/**
 * Whether the body is still settling (moving, in the air, crouching or standing up, bobbing or
 * giving at the knees), so a frame is due.
 */
export const bodyBusy = (b: WalkBody | null, input: WalkInput | null = null): boolean =>
  !!b &&
  (Math.hypot(b.vx || 0, b.vz || 0) > 0.01 * IN ||
    (b.y || 0) > 1e-6 * IN ||
    (b.vy || 0) !== 0 ||
    (b.stride || 0) > 0 ||
    !!b.dip ||
    !!b.dipV ||
    (input ? (input.crouch ? (b.crouch || 0) < 1 : (b.crouch || 0) > 0) : false));

/** Turns the head by (yaw, pitch) radians: the mouse, a drag, ← →. Pitch stops short of straight up or down. */
export function turnHead<T extends { yaw: number; pitch: number }>(
  b: T,
  dYaw: number,
  dPitch: number,
): T {
  return { ...b, yaw: b.yaw + dYaw, pitch: Math.max(-1.45, Math.min(1.45, b.pitch + dPitch)) };
}

/** Walks by `fwd` m ahead and `right` m to the side of where the head is turned (the wheel's step). */
export function walkBy(
  b: WalkBody,
  fwd: number,
  right: number,
  model: WalkModel,
  radius = WALK.radius,
): WalkBody {
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  const p = step({ x: b.x, z: b.z }, fx * fwd - fz * right, fz * fwd + fx * right, model, radius);
  return { ...b, x: p.x, z: p.z };
}

/**
 * The double-click's walk to a spot: the keys that steer for it, slowing on arrival. Null when it
 * is reached (within 2″).
 */
export function steerTo(b: WalkPose, to: Vec2): { fwd: number; right: number } | null {
  const dx = to.x - b.x;
  const dz = to.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 2 * IN) return null;
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  const a = Math.min(1, d / (24 * IN));
  return { fwd: ((dx * fx + dz * fz) / d) * a, right: ((dz * fx - dx * fz) / d) * a };
}
