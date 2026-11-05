import { describe, expect, it } from 'vitest';
import {
  buildRoomMeshes,
  emptyMesh,
  meshArea,
  meshBounds,
  mergeMeshes,
  polygonArea,
  roomFromPoints,
  toViroGeometry,
  toViroGeometryParts,
  triangulatePolygon,
  wallFacesCamera,
  type MeshData,
  type Opening,
  type Point,
  type Room,
} from '../src';
import { alcoveRoom, chamferRoom, lShape, rectangle, rotate, thinL } from './helpers';

type V3 = [number, number, number];

function triangles(mesh: MeshData): [V3, V3, V3][] {
  const p = (i: number): V3 => [
    mesh.positions[i * 3]!,
    mesh.positions[i * 3 + 1]!,
    mesh.positions[i * 3 + 2]!,
  ];
  const out: [V3, V3, V3][] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    out.push([p(mesh.indices[t]!), p(mesh.indices[t + 1]!), p(mesh.indices[t + 2]!)]);
  }
  return out;
}

const cross = (u: V3, v: V3): V3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Every triangle is wound counter-clockwise around its vertices' normal (its front face). */
function expectFrontFacing(mesh: MeshData) {
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = triangles({ ...mesh, indices: mesh.indices.slice(t, t + 3) })[0]!;
    const n = cross(minus(b, a), minus(c, a));
    const len = Math.hypot(...n);
    expect(len).toBeGreaterThan(0);
    const i = mesh.indices[t]! * 3;
    const vn: V3 = [mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!];
    expect(Math.hypot(...vn)).toBeCloseTo(1, 9);
    expect((n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2]) / len).toBeGreaterThan(0.999);
  }
}

/** Sum of each triangle's area times its normal. A closed surface sums to zero. */
function vectorArea(mesh: MeshData): V3 {
  const s: V3 = [0, 0, 0];
  for (const [a, b, c] of triangles(mesh)) {
    const n = cross(minus(b, a), minus(c, a));
    s[0] += n[0] / 2;
    s[1] += n[1] / 2;
    s[2] += n[2] / 2;
  }
  return s;
}

function pointInPolygon(points: Point[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const T = 0.1; // default wall thickness
const H = 2.4384; // default ceiling height

function withOpenings(room: Room, wallIndex: number, openings: Opening[]): Room {
  return {
    ...room,
    walls: room.walls.map((w, i) => (i === wallIndex ? { ...w, openings } : w)),
  };
}

const door = (offset: number, width = 0.9, height = 2.03): Opening => ({
  id: `d${offset}`,
  type: 'door',
  offset,
  width,
  height,
  sill: 0,
});
const window_ = (offset: number, width = 1.2, height = 1.2, sill = 0.9): Opening => ({
  id: `w${offset}`,
  type: 'window',
  offset,
  width,
  height,
  sill,
});

describe('triangulatePolygon', () => {
  const area = (pts: Point[], idx: number[]) => {
    let sum = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const [ax, az] = pts[idx[t]!]!;
      const [bx, bz] = pts[idx[t + 1]!]!;
      const [cx, cz] = pts[idx[t + 2]!]!;
      // Counter-clockwise seen from above is positive (same formula as signedArea).
      sum += (az * bx - ax * bz + bz * cx - bx * cz + cz * ax - cx * az) / 2;
    }
    return sum;
  };

  it.each([
    ['rectangle', rectangle(4, 3)],
    ['L-shape', lShape],
    ['thin L', thinL],
    ['alcove', alcoveRoom],
    ['chamfer', chamferRoom],
    ['rotated L', rotate(lShape, 33)],
  ])('covers a %s exactly with counter-clockwise triangles', (_, pts) => {
    const idx = triangulatePolygon(pts);
    expect(idx.length).toBe((pts.length - 2) * 3);
    expect(area(pts, idx)).toBeCloseTo(polygonArea(pts), 9);
    for (let t = 0; t < idx.length; t += 3) {
      expect(area(pts, idx.slice(t, t + 3))).toBeGreaterThan(0);
      // Every triangle lies inside the room (its centroid does, for a valid triangulation).
      const cx = (pts[idx[t]!]![0] + pts[idx[t + 1]!]![0] + pts[idx[t + 2]!]![0]) / 3;
      const cz = (pts[idx[t]!]![1] + pts[idx[t + 1]!]![1] + pts[idx[t + 2]!]![1]) / 3;
      expect(pointInPolygon(pts, cx, cz)).toBe(true);
    }
  });

  it('accepts clockwise outlines and still returns counter-clockwise triangles', () => {
    const cw = [...lShape].reverse();
    const idx = triangulatePolygon(cw);
    expect(area(cw, idx)).toBeCloseTo(27, 9);
  });

  it('skips straight and repeated corners', () => {
    const pts: Point[] = [
      [0, 0],
      [0, 2],
      [0, 2],
      [2, 2],
      [4, 2],
      [4, 0],
    ];
    const idx = triangulatePolygon(pts);
    expect(area(pts, idx)).toBeCloseTo(8, 9);
    for (let t = 0; t < idx.length; t += 3) {
      expect(area(pts, idx.slice(t, t + 3))).toBeGreaterThan(1e-9);
    }
  });

  it('handles a comb with many concave corners', () => {
    const pts: Point[] = [[0, 0]];
    for (let k = 0; k < 5; k++) {
      pts.push([k * 2, 3], [k * 2 + 1, 3], [k * 2 + 1, 1], [k * 2 + 2, 1]);
    }
    pts.push([10, 0]);
    const ccwPts = roomFromPoints(pts).points;
    const idx = triangulatePolygon(ccwPts);
    expect(area(ccwPts, idx)).toBeCloseTo(polygonArea(ccwPts), 9);
  });

  it('returns nothing for fewer than three corners', () => {
    expect(triangulatePolygon([[0, 0]])).toEqual([]);
  });
});

describe('mesh helpers', () => {
  const quad: MeshData = {
    positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  };

  it('merges meshes and offsets their indices', () => {
    const m = mergeMeshes([quad, emptyMesh(), quad]);
    expect(m.positions).toHaveLength(24);
    expect(m.indices).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(meshArea(m)).toBeCloseTo(2, 12);
    expect(meshBounds(m)).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
    expect(meshBounds(emptyMesh())).toBeNull();
  });

  it('converts to ViroGeometry nested arrays with one submesh per part', () => {
    const one = toViroGeometry(quad, { uvScale: 2 });
    expect(one.vertices).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ]);
    expect(one.normals[0]).toEqual([0, 0, 1]);
    expect(one.texcoords[2]).toEqual([2, 2]);
    expect(one.triangleIndices).toEqual([[0, 1, 2, 0, 2, 3]]);

    const parts = toViroGeometryParts([
      { mesh: quad, material: 'wall' },
      { mesh: emptyMesh(), material: 'glass' },
      { mesh: quad, material: 'frame' },
    ]);
    expect(parts.materials).toEqual(['wall', 'frame']);
    expect(parts.vertices).toHaveLength(8);
    expect(parts.triangleIndices).toEqual([
      [0, 1, 2, 0, 2, 3],
      [4, 5, 6, 4, 6, 7],
    ]);
  });
});

describe('buildRoomMeshes', () => {
  const rect = roomFromPoints(rectangle(4, 3));

  it('builds a floor of the room size facing up', () => {
    const m = buildRoomMeshes(rect);
    expect(meshArea(m.floor)).toBeCloseTo(12, 9);
    expectFrontFacing(m.floor);
    for (let i = 1; i < m.floor.normals.length; i += 3) expect(m.floor.normals[i]).toBe(1);
    for (let i = 1; i < m.floor.positions.length; i += 3) expect(m.floor.positions[i]).toBe(0);
  });

  it('builds walls outward so the inside keeps its true size', () => {
    const m = buildRoomMeshes(rect);
    expect(m.walls).toHaveLength(4);
    expect(m.bounds.min[0]).toBeCloseTo(-T, 9);
    expect(m.bounds.min[2]).toBeCloseTo(-T, 9);
    expect(m.bounds.max[0]).toBeCloseTo(4 + T, 9);
    expect(m.bounds.max[2]).toBeCloseTo(3 + T, 9);
    expect(m.bounds.max[1]).toBeCloseTo(H, 9);
    expect(m.center[0]).toBeCloseTo(2, 12);
    expect(m.center[1]).toBe(0);
    expect(m.center[2]).toBeCloseTo(1.5, 12);
    for (const w of m.walls) {
      expectFrontFacing(w.panels);
      // Nothing of a wall reaches into the room.
      for (let i = 0; i < w.panels.positions.length; i += 3) {
        const x = w.panels.positions[i]!;
        const z = w.panels.positions[i + 2]!;
        const inside = x > 1e-9 && x < 4 - 1e-9 && z > 1e-9 && z < 3 - 1e-9;
        expect(inside).toBe(false);
      }
    }
  });

  it('gives each wall its id, centre and outward normal', () => {
    const m = buildRoomMeshes(rect);
    for (const [i, w] of m.walls.entries()) {
      expect(w.id).toBe(rect.walls[i]!.id);
      expect(w.index).toBe(i);
      expect(w.center[1]).toBeCloseTo(H / 2, 12);
      const toWall = [w.center[0] - 2, w.center[2] - 1.5];
      expect(toWall[0]! * w.normal[0] + toWall[1]! * w.normal[2]).toBeGreaterThan(0);
      expect(Math.hypot(w.normal[0], w.normal[2])).toBeCloseTo(1, 12);
    }
    const lengths = m.walls.map((w) => w.length).sort();
    expect(lengths[0]).toBeCloseTo(3, 12);
    expect(lengths[3]).toBeCloseTo(4, 12);
  });

  it('makes every wall a closed solid (open only underneath)', () => {
    const m = buildRoomMeshes(rect);
    for (const w of m.walls) {
      const [sx, sy, sz] = vectorArea(w.panels);
      expect(sx).toBeCloseTo(0, 9);
      expect(sz).toBeCloseTo(0, 9);
      // The missing bottom face: the wall's footprint, a trapezoid (mitred corners).
      expect(sy).toBeCloseTo((w.length + T) * T, 9);
    }
  });

  it('cuts doors from the floor and windows from the sill, with reveals', () => {
    const room = withOpenings(withOpenings(rect, 0, [door(1)]), 2, [window_(1.4)]);
    const m = buildRoomMeshes(room);
    const doorWall = m.walls[0]!;
    const windowWall = m.walls[2]!;
    for (const w of [doorWall, windowWall]) {
      expectFrontFacing(w.panels);
      expectFrontFacing(w.frames);
      expectFrontFacing(w.glass);
    }
    // Door: the wall stays closed except for the doorway's floor strip, which the floor gets.
    const [dx, dy, dz] = vectorArea(doorWall.panels);
    expect(dx).toBeCloseTo(0, 9);
    expect(dz).toBeCloseTo(0, 9);
    expect(dy).toBeCloseTo((doorWall.length + T) * T - 0.9 * T, 9);
    expect(meshArea(m.floor)).toBeCloseTo(12 + 0.9 * T, 9);
    // Window: a tunnel through the wall, so the solid is still closed.
    const [wx, wy, wz] = vectorArea(windowWall.panels);
    expect(wx).toBeCloseTo(0, 9);
    expect(wz).toBeCloseTo(0, 9);
    expect(wy).toBeCloseTo((windowWall.length + T) * T, 9);
    // Two panes of glass (one facing each way), and frames only where there is a door or window.
    expect(meshArea(windowWall.glass)).toBeCloseTo(2 * 1.2 * 1.2, 9);
    expect(meshArea(doorWall.glass)).toBe(0);
    expect(meshArea(doorWall.frames)).toBeGreaterThan(0);
    expect(meshArea(m.walls[1]!.frames)).toBe(0);
  });

  it('leaves the inside face with exactly the opening cut out', () => {
    const plain = buildRoomMeshes(rect).walls[0]!;
    const cut = buildRoomMeshes(withOpenings(rect, 0, [door(0.5), window_(2.2, 1, 1)])).walls[0]!;
    const insideArea = (w: typeof plain) => {
      let sum = 0;
      for (const [a, b, c] of triangles(w.panels)) {
        const n = cross(minus(b, a), minus(c, a));
        const len = Math.hypot(...n);
        // Faces on the wall line facing into the room (wall 0 runs along z = 3, facing -Z).
        const nz = n[2] / len;
        const onInside = [a, b, c].every((p) => Math.abs(p[2] - 3) < 1e-9);
        if (nz < -0.999 && onInside) sum += len / 2;
      }
      return sum;
    };
    expect(insideArea(plain)).toBeCloseTo(4 * H, 9);
    expect(insideArea(cut)).toBeCloseTo(4 * H - 0.9 * 2.03 - 1 * 1, 9);
  });

  it('splits the top of the wall around an opening that reaches the ceiling', () => {
    const room = withOpenings(rect, 0, [{ ...door(1.5, 1, 5), type: 'opening' }]);
    const w = buildRoomMeshes(room).walls[0]!;
    expectFrontFacing(w.panels);
    const [sx, sy, sz] = vectorArea(w.panels);
    expect(sx).toBeCloseTo(0, 9);
    expect(sz).toBeCloseTo(0, 9);
    // The top is open over the doorway (the bottom has no faces anyway).
    expect(sy).toBeCloseTo((w.length + T) * T - 1 * T, 9);
    expect(meshArea(w.frames)).toBe(0);
  });

  it('keeps openings that touch a corner or each other inside the wall', () => {
    const room = withOpenings(rect, 0, [door(0, 1), window_(1, 1, 1, 1), door(3, 1)]);
    const m = buildRoomMeshes(room);
    const w = m.walls[0]!;
    expectFrontFacing(w.panels);
    const [sx, , sz] = vectorArea(w.panels);
    expect(sx).toBeCloseTo(0, 9);
    expect(sz).toBeCloseTo(0, 9);
    expect(meshArea(m.floor)).toBeCloseTo(12 + 2 * T, 9);
  });

  it('works for concave rooms, with mitres at the inside corner', () => {
    for (const pts of [lShape, thinL, alcoveRoom, rotate(lShape, 20)]) {
      const room = roomFromPoints(pts);
      const m = buildRoomMeshes(room);
      expect(meshArea(m.floor)).toBeCloseTo(polygonArea(room.points), 9);
      expectFrontFacing(m.floor);
      for (const w of m.walls) {
        expectFrontFacing(w.panels);
        const [sx, sy, sz] = vectorArea(w.panels);
        expect(Math.abs(sx)).toBeLessThan(1e-9);
        expect(Math.abs(sz)).toBeLessThan(1e-9);
        expect(sy).toBeGreaterThan(0);
      }
      // Wall footprints add up to the ring between the room and its outward offset outline.
      const footprints = m.walls.reduce((s, w) => s + vectorArea(w.panels)[1], 0);
      const perimeter = room.walls.reduce((s, _, i) => s + m.walls[i]!.length, 0);
      const outsideCorners = 4; // net turning of a closed outline: four right angles' worth
      expect(footprints).toBeCloseTo(perimeter * T + outsideCorners * T * T, 6);
    }
  });

  it('bevels very sharp corners instead of growing long spikes', () => {
    const sharp = roomFromPoints([
      [0, 0],
      [6, 0],
      [0, 1],
    ]);
    const m = buildRoomMeshes(sharp);
    for (const w of m.walls) expectFrontFacing(w.panels);
    // A mitre at the ~9.5° corner would reach about 1.2 m past it.
    expect(m.bounds.max[0]).toBeLessThan(6 + 4 * T);
  });

  it('falls back to square wall ends at tiny inside steps', () => {
    // A 0.2 m deep step: two inside corners 0.2 m apart with 0.25 m thick walls.
    const step = roomFromPoints([
      [0, 0],
      [4, 0],
      [4, 1.5],
      [2.2, 1.5],
      [2.2, 1.7],
      [2, 1.7],
      [2, 3],
      [0, 3],
    ]);
    const m = buildRoomMeshes(step, { wallThickness: 0.25 });
    for (const w of m.walls) {
      expectFrontFacing(w.panels);
      expect(meshArea(w.panels)).toBeGreaterThan(0);
    }
  });

  it('honours frame and thickness options', () => {
    const room = withOpenings(rect, 0, [door(1)]);
    expect(meshArea(buildRoomMeshes(room, { frameWidth: 0 }).walls[0]!.frames)).toBe(0);
    const thick = buildRoomMeshes(room, { wallThickness: 0.2 });
    expect(thick.bounds.min[2]).toBeCloseTo(-0.2, 9);
  });

  it('returns empty parts for a room without a usable outline', () => {
    const m = buildRoomMeshes({ version: 1, points: [], ceilingHeight: H, walls: [] });
    expect(m.walls).toEqual([]);
    expect(meshArea(m.floor)).toBe(0);
  });
});

describe('wallFacesCamera', () => {
  const m = buildRoomMeshes(roomFromPoints(rectangle(4, 3)));
  const wallAt = (z: number) => m.walls.find((w) => Math.abs(w.center[2] - z) < 1e-9)!;

  it('picks the walls between the camera and the room', () => {
    const camera: V3 = [2, 3, 8]; // in front of the z = 3 wall, looking in
    expect(wallFacesCamera(wallAt(3), camera)).toBe(true);
    expect(wallFacesCamera(wallAt(0), camera)).toBe(false);
    expect(wallFacesCamera(wallAt(0), { x: 2, y: 3, z: -5 })).toBe(true);
  });

  it('keeps every wall when looking down from above the room', () => {
    expect(m.walls.some((w) => wallFacesCamera(w, [2, 10, 1.5]))).toBe(false);
  });
});
