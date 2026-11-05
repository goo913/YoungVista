/**
 * Room into 3D parts for a clean "dollhouse" model: the floor, wall slabs split around doors and
 * windows, simple frames, and window glass. The same meshes feed the website (three.js) and the
 * phone (ViroReact, via `toViroGeometry`).
 *
 * - The floor is the room outline, triangulated (concave rooms work), at y = 0 facing up.
 * - Walls are `wallThickness` thick and built outward, so the inside of the room keeps its true
 *   size. Neighbouring walls meet at mitred corners; very sharp corners are bevelled instead.
 * - Doors and doorless openings start at the floor; windows start at their sill. The faces inside
 *   an opening (jambs, sill, head) are part of the wall; a doorway's floor strip is part of the
 *   floor mesh.
 * - Every wall is its own closed solid with its own meshes, centre and outward normal, so a viewer
 *   can hide or fade the walls between the camera and the room (see `wallFacesCamera`).
 */
import type { Opening, Room, Vec2 } from './types';
import { signedArea } from './polygon';
import { add, distance, dot, normalize, scale, sub, turn } from './vec';
import { triangulatePolygon } from './triangulate';
import { createMeshWriter, meshBounds, type MeshData, type MeshVec3 } from './mesh';

export const DEFAULT_WALL_THICKNESS = 0.1;
export const DEFAULT_FRAME_WIDTH = 0.06;
export const DEFAULT_FRAME_DEPTH = 0.02;

export interface RoomMeshOptions {
  /** Wall thickness in metres, built outward from the room outline. Default 0.1. */
  wallThickness?: number;
  /** Width of the frame around doors and windows (m). Default 0.06. 0 for no frames. */
  frameWidth?: number;
  /** How far frames stand out from the wall (m). Default 0.02. */
  frameDepth?: number;
  /** Corners whose mitre would be longer than this many wall thicknesses are bevelled. Default 4. */
  miterLimit?: number;
}

export interface WallMesh {
  /** The wall's id in `room.walls`. */
  id: string;
  /** Index in `room.walls`. */
  index: number;
  /** Middle of the wall's inside face at half the ceiling height, [x, y, z]. */
  center: MeshVec3;
  /** Unit vector on the floor plane pointing out of the room through this wall, [x, 0, z]. */
  normal: MeshVec3;
  /** Length of the wall's inside face (m). */
  length: number;
  /** The solid wall: inside and outside faces, top, ends, and the faces inside its openings. */
  panels: MeshData;
  /** Frames around this wall's doors and windows. */
  frames: MeshData;
  /** Glass in this wall's windows, one face toward each side. */
  glass: MeshData;
}

export interface RoomMeshes {
  /** The floor, plus the floor strips under doorways. */
  floor: MeshData;
  /** One entry per `room.walls` item, in the same order. */
  walls: WallMesh[];
  /** Box around every part, walls included. */
  bounds: { min: MeshVec3; max: MeshVec3 };
  /** Centre of that box at floor level: a good point for a camera to look at. */
  center: MeshVec3;
}

type Range = [number, number];
const EPS = 1e-6;

/** Sorted, merged union of ranges. */
function unionRanges(ranges: readonly Range[]): Range[] {
  const sorted = ranges.filter(([a, b]) => b - a > EPS).sort((p, q) => p[0] - q[0]);
  const out: Range[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Parts of `from` not covered by `minus` (both lists of ranges). */
function subtractRanges(from: readonly Range[], minus: readonly Range[]): Range[] {
  const cut = unionRanges(minus);
  const out: Range[] = [];
  for (const [a0, b0] of unionRanges(from)) {
    let a = a0;
    for (const [c, d] of cut) {
      if (d <= a + EPS || c >= b0 - EPS) continue;
      if (c > a + EPS) out.push([a, c]);
      a = Math.max(a, d);
    }
    if (b0 - a > EPS) out.push([a, b0]);
  }
  return out;
}

/** Sorted values with near-duplicates removed. */
function uniqueSorted(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (!out.length || v - out[out.length - 1]! > EPS) out.push(v);
  return out;
}

const rightNormal = (d: Vec2): Vec2 => ({ x: -d.z, z: d.x });

/** How two walls meet at a corner: a shared mitre point, or square ends (bevelled if convex). */
type Join = { kind: 'miter'; point: Vec2 } | { kind: 'split'; convex: boolean };

interface Hole {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  opening: Opening;
}

/** Clips a polygon (in wall coordinates s = along the wall) to lo ≤ s ≤ hi. */
function clipToBand(poly: readonly Vec2[], sOf: (p: Vec2) => number, lo: number, hi: number) {
  const clipOne = (pts: readonly Vec2[], keep: (s: number) => number): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      const fp = keep(sOf(p));
      const fq = keep(sOf(q));
      if (fp >= 0) out.push(p);
      if (fp >= 0 !== fq >= 0) {
        const t = fp / (fp - fq);
        out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
      }
    }
    return out;
  };
  let out = [...poly];
  if (Number.isFinite(lo)) out = clipOne(out, (s) => s - lo);
  if (Number.isFinite(hi)) out = clipOne(out, (s) => hi - s);
  return out;
}

/**
 * Builds the floor, walls, frames and glass of a room. Coordinates are room space: metres, Y up,
 * floor at y = 0, `room.points` on the XZ plane.
 */
export function buildRoomMeshes(room: Room, options: RoomMeshOptions = {}): RoomMeshes {
  const t = Math.max(options.wallThickness ?? DEFAULT_WALL_THICKNESS, 0.001);
  const fw = Math.max(options.frameWidth ?? DEFAULT_FRAME_WIDTH, 0);
  const fd = Math.max(options.frameDepth ?? DEFAULT_FRAME_DEPTH, 0);
  const miterLimit = Math.max(options.miterLimit ?? 4, 1);
  const H = room.ceilingHeight;
  const pts: Vec2[] = room.points.map(([x, z]) => ({ x, z }));
  const n = pts.length;
  const orient = signedArea(pts) >= 0 ? 1 : -1;
  const up: MeshVec3 = [0, 1, 0];
  const down: MeshVec3 = [0, -1, 0];

  const floor = createMeshWriter();
  if (n >= 3) {
    // Floor UVs follow the longest wall so planks and tiles line up with the room.
    let dir: Vec2 = { x: 1, z: 0 };
    let longest = 0;
    for (let i = 0; i < n; i++) {
      const len = distance(pts[i]!, pts[(i + 1) % n]!);
      if (len > longest) {
        longest = len;
        dir = normalize(sub(pts[(i + 1) % n]!, pts[i]!));
      }
    }
    floor.polygon(
      pts.map((p): MeshVec3 => [p.x, 0, p.z]),
      triangulatePolygon(pts),
      up,
      ([x, , z]) => [x * dir.x + z * dir.z, z * dir.x - x * dir.z],
    );
  }

  // Edge k runs from pts[k] to pts[k + 1].
  const edgeDir = pts.map((p, k) => normalize(sub(pts[(k + 1) % n]!, p)));
  const edgeLen = pts.map((p, k) => distance(p, pts[(k + 1) % n]!));
  const edgeOut = edgeDir.map((d) => scale(rightNormal(d), orient));
  const standard =
    n >= 3 &&
    room.walls.length === n &&
    room.walls.every((w, i) => w.a === i && w.b === (i + 1) % n);

  // Corner k joins edge k - 1 (ending there) and edge k (starting there).
  const joins: Join[] = pts.map((p, k) => {
    const prev = (k - 1 + n) % n;
    const d0 = edgeDir[prev]!;
    const d1 = edgeDir[k]!;
    const n0 = edgeOut[prev]!;
    const n1 = edgeOut[k]!;
    const convex = orient * turn(d0, d1) > 0;
    if (!standard || edgeLen[prev]! < EPS || edgeLen[k]! < EPS) return { kind: 'split', convex };
    const c = dot(n0, n1);
    if (1 + c < 1e-9) return { kind: 'split', convex };
    const ratio = Math.sqrt(2 / (1 + c));
    const point = add(p, scale(add(n0, n1), t / (1 + c)));
    if (ratio > miterLimit) return { kind: 'split', convex };
    if (!convex) {
      // An inside corner shortens both walls' outside faces; keep at least half of each.
      const shortenIn = -dot(sub(point, p), d0);
      const shortenOut = dot(sub(point, p), d1);
      if (shortenIn > edgeLen[prev]! / 2 + EPS || shortenOut > edgeLen[k]! / 2 + EPS) {
        return { kind: 'split', convex };
      }
    }
    return { kind: 'miter', point };
  });

  const allBounds: MeshData[] = [floor.mesh];
  const walls: WallMesh[] = room.walls.map((wall, index) => {
    const a = pts[wall.a] ?? { x: 0, z: 0 };
    const b = pts[wall.b] ?? { x: 0, z: 0 };
    const L = distance(a, b);
    const d = normalize(sub(b, a));
    const out = scale(rightNormal(d), orient);
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const panels = createMeshWriter();
    const frames = createMeshWriter();
    const glass = createMeshWriter();
    const result: WallMesh = {
      id: wall.id,
      index,
      center: [mid.x, H / 2, mid.z],
      normal: [out.x, 0, out.z],
      length: L,
      panels: panels.mesh,
      frames: frames.mesh,
      glass: glass.mesh,
    };
    if (L < EPS || H <= EPS) return result;

    const at = (s: number, r: number): Vec2 => ({
      x: a.x + d.x * s + out.x * r,
      z: a.z + d.z * s + out.z * r,
    });
    const P = (s: number, r: number, y: number): MeshVec3 => {
      const q = at(s, r);
      return [q.x, y, q.z];
    };
    const sOf = (p: Vec2) => dot(sub(p, a), d);
    const nIn: MeshVec3 = [-out.x, 0, -out.z];
    const nOut: MeshVec3 = [out.x, 0, out.z];
    const nAlong: MeshVec3 = [d.x, 0, d.z];
    const nBack: MeshVec3 = [-d.x, 0, -d.z];

    // Footprint, counter-clockwise for a counter-clockwise room: inside start, outside corner
    // points at the start, outside corner point at the end, inside end.
    const startJoin: Join = standard ? joins[wall.a]! : { kind: 'split', convex: false };
    const endJoin: Join = standard ? joins[wall.b]! : { kind: 'split', convex: false };
    const prevOut = standard ? edgeOut[(wall.a - 1 + n) % n]! : out;
    const startOuter: Vec2[] =
      startJoin.kind === 'miter'
        ? [startJoin.point]
        : startJoin.convex
          ? [add(a, scale(prevOut, t)), at(0, t)]
          : [at(0, t)];
    const endOuter: Vec2[] = endJoin.kind === 'miter' ? [endJoin.point] : [at(L, t)];
    const footprint = [a, ...startOuter, ...endOuter, b];
    const sA = sOf(startOuter[startOuter.length - 1]!);
    const sB = sOf(endOuter[0]!);

    // Openings, clipped to the part of the wall that has its full thickness.
    const sLo = Math.max(0, sA);
    const sHi = Math.min(L, sB);
    const holes: Hole[] = wall.openings
      .map((o): Hole => {
        const y0 = o.type === 'window' ? Math.max(0, o.sill) : 0;
        return {
          s0: Math.max(o.offset, sLo),
          s1: Math.min(o.offset + o.width, sHi),
          y0,
          y1: Math.min(H, y0 + o.height),
          opening: o,
        };
      })
      .filter((h) => h.s1 - h.s0 > 1e-4 && h.y1 - h.y0 > 1e-4)
      .sort((p, q) => p.s0 - q.s0);
    const holeRangesAt = (x0: number, x1: number): Range[] =>
      unionRanges(
        holes.filter((h) => h.s0 <= x0 + EPS && h.s1 >= x1 - EPS).map((h) => [h.y0, h.y1]),
      );
    const solidAt = (x0: number, x1: number): Range[] =>
      subtractRanges([[0, H]], holeRangesAt(x0, x1));
    const holeEdges = holes.flatMap((h) => [h.s0, h.s1]);

    // Inside face (u runs right to left seen from inside, so textures read the right way round).
    const innerCuts = uniqueSorted([0, L, ...holeEdges]);
    for (let j = 0; j + 1 < innerCuts.length; j++) {
      const x0 = innerCuts[j]!;
      const x1 = innerCuts[j + 1]!;
      for (const [y0, y1] of solidAt(x0, x1)) {
        panels.quad([P(x0, 0, y0), P(x1, 0, y0), P(x1, 0, y1), P(x0, 0, y1)], nIn, [
          [L - x0, y0],
          [L - x1, y0],
          [L - x1, y1],
          [L - x0, y1],
        ]);
      }
      // Faces inside the opening: sill or doorway floor below, head above.
      for (const [h0, h1] of holeRangesAt(x0, x1)) {
        const strip = (y: number): [MeshVec3, MeshVec3, MeshVec3, MeshVec3] => [
          P(x0, 0, y),
          P(x1, 0, y),
          P(x1, t, y),
          P(x0, t, y),
        ];
        const stripUv: [[number, number], [number, number], [number, number], [number, number]] = [
          [x0, 0],
          [x1, 0],
          [x1, t],
          [x0, t],
        ];
        if (h0 > EPS) panels.quad(strip(h0), up, stripUv);
        else floor.quad(strip(0), up, stripUv);
        if (h1 < H - EPS) panels.quad(strip(h1), down, stripUv);
      }
    }

    // Outside face.
    const outerCuts = uniqueSorted([sA, sB, ...holeEdges]);
    for (let j = 0; j + 1 < outerCuts.length; j++) {
      const x0 = outerCuts[j]!;
      const x1 = outerCuts[j + 1]!;
      for (const [y0, y1] of solidAt(x0, x1)) {
        panels.quad([P(x0, t, y0), P(x1, t, y0), P(x1, t, y1), P(x0, t, y1)], nOut, [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ]);
      }
    }

    // Jambs: at each cut, a face toward whichever side is open. Beyond the wall's ends counts as
    // solid (the corner or the neighbouring wall is there).
    const full: Range[] = [[0, H]];
    for (let j = 0; j < innerCuts.length; j++) {
      const c = innerCuts[j]!;
      const left = j > 0 ? solidAt(innerCuts[j - 1]!, c) : full;
      const right = j + 1 < innerCuts.length ? solidAt(c, innerCuts[j + 1]!) : full;
      const jamb = (ranges: Range[], normal: MeshVec3) => {
        for (const [y0, y1] of ranges) {
          panels.quad([P(c, 0, y0), P(c, t, y0), P(c, t, y1), P(c, 0, y1)], normal, [
            [0, y0],
            [t, y0],
            [t, y1],
            [0, y1],
          ]);
        }
      };
      jamb(subtractRanges(left, right), nAlong);
      jamb(subtractRanges(right, left), nBack);
    }

    // Top: the footprint minus the openings that reach the ceiling.
    const openTop = innerCuts
      .slice(0, -1)
      .map((x0, j): Range => [x0, innerCuts[j + 1]!])
      .filter(([x0, x1]) => holeRangesAt(x0, x1).some(([, h1]) => h1 >= H - EPS));
    const topPieces = subtractRanges([[-Infinity, Infinity]], unionRanges(openTop));
    const footprintSign = signedArea(footprint) >= 0 ? 1 : -1;
    for (const [lo, hi] of topPieces) {
      const piece = clipToBand(footprint, sOf, lo, hi);
      if (piece.length < 3) continue;
      panels.polygon(
        piece.map((p): MeshVec3 => [p.x, H, p.z]),
        triangulatePolygon(piece),
        up,
        ([x, , z]) => [x, z],
      );
    }

    // End faces where this wall meets its neighbours. Square ends at the very start or end of the
    // wall stop where an opening reaches the end; mitred and bevelled ends are always solid.
    const cap = (u: Vec2, v: Vec2, ranges: Range[]) => {
      const len = distance(u, v);
      if (len < EPS) return;
      const e = normalize(sub(v, u));
      const nrm = scale(rightNormal(e), footprintSign);
      for (const [y0, y1] of ranges) {
        panels.quad(
          [
            [u.x, y0, u.z],
            [v.x, y0, v.z],
            [v.x, y1, v.z],
            [u.x, y1, u.z],
          ],
          [nrm.x, 0, nrm.z],
          [
            [0, y0],
            [len, y0],
            [len, y1],
            [0, y1],
          ],
        );
      }
    };
    const firstSolid = solidAt(innerCuts[0]!, innerCuts[1] ?? L);
    const lastSolid = solidAt(
      innerCuts[innerCuts.length - 2] ?? 0,
      innerCuts[innerCuts.length - 1]!,
    );
    const squareStart = startJoin.kind === 'split' && !startJoin.convex;
    cap(a, startOuter[0]!, squareStart ? firstSolid : full);
    if (startOuter.length > 1) cap(startOuter[0]!, startOuter[1]!, full);
    cap(endOuter[endOuter.length - 1]!, b, endJoin.kind === 'split' ? lastSolid : full);

    // Frames on both faces, and glass in windows.
    for (const h of holes) {
      if (h.opening.type === 'window') {
        const pane: [MeshVec3, MeshVec3, MeshVec3, MeshVec3] = [
          P(h.s0, t / 2, h.y0),
          P(h.s1, t / 2, h.y0),
          P(h.s1, t / 2, h.y1),
          P(h.s0, t / 2, h.y1),
        ];
        const paneUv: [[number, number], [number, number], [number, number], [number, number]] = [
          [h.s0, h.y0],
          [h.s1, h.y0],
          [h.s1, h.y1],
          [h.s0, h.y1],
        ];
        glass.quad(pane, nIn, paneUv);
        glass.quad(pane, nOut, paneUv);
      }
      if (h.opening.type === 'opening' || fw <= 0 || fd <= 0) continue;
      const window = h.opening.type === 'window';
      const bottom = window ? h.y0 - fw : h.y0;
      const pieces: [Range, Range][] = [
        [
          [h.s0 - fw, h.s0],
          [bottom, h.y1 + fw],
        ],
        [
          [h.s1, h.s1 + fw],
          [bottom, h.y1 + fw],
        ],
        [
          [h.s0, h.s1],
          [h.y1, h.y1 + fw],
        ],
      ];
      if (window) {
        pieces.push([
          [h.s0, h.s1],
          [h.y0 - fw, h.y0],
        ]);
      }
      // rf: the frame's front, away from the wall; rb: its back, against the wall (not drawn).
      const sides: { rf: number; rb: number; front: MeshVec3; sMin: number; sMax: number }[] = [
        { rf: -fd, rb: 0, front: nIn, sMin: 0, sMax: L },
        { rf: t + fd, rb: t, front: nOut, sMin: sA, sMax: sB },
      ];
      for (const { rf, rb, ...side } of sides) {
        for (const [[s0r, s1r], [y0r, y1r]] of pieces) {
          const s0 = Math.max(s0r, side.sMin);
          const s1 = Math.min(s1r, side.sMax);
          const y0 = Math.max(y0r, 0);
          const y1 = Math.min(y1r, H);
          if (s1 - s0 < 1e-4 || y1 - y0 < 1e-4) continue;
          const uv: [[number, number], [number, number], [number, number], [number, number]] = [
            [s0, y0],
            [s1, y0],
            [s1, y1],
            [s0, y1],
          ];
          frames.quad([P(s0, rf, y0), P(s1, rf, y0), P(s1, rf, y1), P(s0, rf, y1)], side.front, uv);
          frames.quad([P(s0, rb, y0), P(s0, rf, y0), P(s0, rf, y1), P(s0, rb, y1)], nBack, uv);
          frames.quad([P(s1, rb, y0), P(s1, rf, y0), P(s1, rf, y1), P(s1, rb, y1)], nAlong, uv);
          frames.quad([P(s0, rb, y0), P(s1, rb, y0), P(s1, rf, y0), P(s0, rf, y0)], down, uv);
          frames.quad([P(s0, rb, y1), P(s1, rb, y1), P(s1, rf, y1), P(s0, rf, y1)], up, uv);
        }
      }
    }
    allBounds.push(panels.mesh, frames.mesh);
    return result;
  });

  const min: MeshVec3 = [Infinity, Infinity, Infinity];
  const max: MeshVec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of allBounds) {
    const bb = meshBounds(m);
    if (!bb) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, bb.min[k]!);
      max[k] = Math.max(max[k]!, bb.max[k]!);
    }
  }
  const bounds = Number.isFinite(min[0])
    ? { min, max }
    : { min: [0, 0, 0] as MeshVec3, max: [0, 0, 0] as MeshVec3 };
  return {
    floor: floor.mesh,
    walls,
    bounds,
    center: [(bounds.min[0] + bounds.max[0]) / 2, 0, (bounds.min[2] + bounds.max[2]) / 2],
  };
}

/**
 * True when the camera is outside the wall's inside face, so the wall stands between the camera
 * and the room: fade or hide it. Works with `WallMesh.center` and `WallMesh.normal`.
 * `margin` (m) keeps walls the camera is nearly level with visible.
 */
export function wallFacesCamera(
  wall: Pick<WallMesh, 'center' | 'normal'>,
  camera: MeshVec3 | { x: number; y: number; z: number },
  margin = 0,
): boolean {
  const [cx, cz] = Array.isArray(camera) ? [camera[0], camera[2]] : [camera.x, camera.z];
  return (cx - wall.center[0]) * wall.normal[0] + (cz - wall.center[2]) * wall.normal[2] > margin;
}
