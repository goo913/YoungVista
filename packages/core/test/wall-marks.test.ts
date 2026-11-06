import { describe, expect, it } from 'vitest';
import {
  axesAngle,
  axesThrough,
  describeRoomSize,
  edgeForRay,
  fromRoomFrame,
  groupWallMarks,
  hitLevelPlane,
  hitWallPlane,
  inwardNormal,
  measureCeiling,
  placeMark,
  rectangleSides,
  roomArea,
  roomAxes,
  roomFromPoints,
  scaleRoom,
  solveRectilinearRoom,
  solveRoomLeavingOut,
  toRoomFrame,
  wallLengths,
  type CameraRay,
  type MarkedWall,
  type Point,
  type RoomAxes,
  type Vec2,
  type WallAxis,
  type WallMarkInput,
} from '../src';
import { lShape, mulberry32, outlineError, rectangle, rotate } from './helpers';

const DEG = Math.PI / 180;

/** A ray from `from` toward the point `to`. */
const rayTo = (from: [number, number, number], to: [number, number, number]): CameraRay => ({
  origin: from,
  direction: [to[0] - from[0], to[1] - from[1], to[2] - from[2]],
});

const near = (p: Vec2, q: Vec2, tol = 1e-9) =>
  expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeLessThanOrEqual(tol);

/**
 * One mark per wall of `outline` (core order), at `at` of the way along it, made by a camera
 * standing `back` metres in front of that spot. Each wall's axis comes from its direction.
 */
function marksFor(
  outline: Point[],
  axes: RoomAxes,
  { at = 0.5, back = 1.2, skip = [] as number[] } = {},
): WallMarkInput[] {
  const out: WallMarkInput[] = [];
  outline.forEach((p, k) => {
    if (skip.includes(k)) return;
    const q = outline[(k + 1) % outline.length]!;
    const a = { x: p[0], z: p[1] };
    const b = { x: q[0], z: q[1] };
    const point = { x: a.x + (b.x - a.x) * at, z: a.z + (b.z - a.z) * at };
    const n = inwardNormal(a, b);
    const dir = { x: b.x - a.x, z: b.z - a.z };
    const alongU = Math.abs(dir.x * axes.u.x + dir.z * axes.u.z);
    const alongV = Math.abs(dir.x * axes.v.x + dir.z * axes.v.z);
    const axis: WallAxis = alongU >= alongV ? 0 : 1;
    out.push({
      id: `w${k}`,
      point,
      camera: { x: point.x + n.x * back, z: point.z + n.z * back },
      axis,
    });
  });
  return out;
}

function solveOutline(outline: Point[], axes: RoomAxes, options = {}) {
  const grouped = groupWallMarks(marksFor(outline, axes, options), axes);
  return { grouped, result: solveRectilinearRoom(grouped.walls, grouped.axes) };
}

describe('rays', () => {
  const eye: [number, number, number] = [0, 1.4, 0];

  it('meet the floor below the horizon and the ceiling above it', () => {
    const down = rayTo(eye, [1, 0, -2]);
    const hit = hitLevelPlane(down, 0);
    expect(hit.ok && hit.point).toEqual({ x: expect.closeTo(1, 9), z: expect.closeTo(-2, 9) });
    expect(hit.ok && hit.distance).toBeCloseTo(Math.hypot(1, 2), 9);
    const up = rayTo(eye, [0, 2.44, -1.5]);
    const top = hitLevelPlane(up, 2.44);
    expect(top.ok && top.point.z).toBeCloseTo(-1.5, 9);
    expect(edgeForRay(down)).toBe('floor');
    expect(edgeForRay(up)).toBe('ceiling');
  });

  it('refuse to meet a plane on the wrong side, too far away, or near the horizon', () => {
    expect(hitLevelPlane(rayTo(eye, [0, 2, -3]), 0)).toEqual({ ok: false, reason: 'aim-lower' });
    expect(hitLevelPlane(rayTo(eye, [0, 0, -3]), 2.4)).toEqual({ ok: false, reason: 'aim-higher' });
    expect(hitLevelPlane(rayTo(eye, [0, 0, -9]), 0)).toEqual({ ok: false, reason: 'too-far' });
    // 2° below the horizon: neither edge.
    const level = rayTo(eye, [0, 1.4 - Math.tan(2 * DEG), -1]);
    expect(edgeForRay(level)).toBeNull();
    expect(hitLevelPlane(level, 0, 100)).toEqual({ ok: false, reason: 'aim-lower' });
  });

  it('meet the wall standing on a floor line', () => {
    const hit = hitWallPlane(rayTo(eye, [0.5, 2, -2]), { x: -1, z: -2 }, { x: 1, z: -2 });
    expect(hit?.point[1]).toBeCloseTo(2, 9);
    expect(hit?.along).toBeCloseTo(1.5, 9);
    expect(hit?.length).toBeCloseTo(2, 9);
    // Parallel to the wall, or the wall is behind the camera.
    expect(hitWallPlane(rayTo(eye, [1, 2, 0]), { x: -1, z: -2 }, { x: 1, z: -2 })).toBeNull();
    expect(hitWallPlane(rayTo(eye, [0, 2, 1]), { x: -1, z: -2 }, { x: 1, z: -2 })).toBeNull();
  });

  it.each([2.44, 2.7])('measure a %s m ceiling from the top of the first wall', (h) => {
    const a = { x: -1, z: -1.75 };
    const b = { x: 1, z: -1.75 };
    const m = measureCeiling(rayTo([0.3, 1.35, 0.2], [0.4, h, -1.75]), 0, a, b);
    expect(m.ok && m.height).toBeCloseTo(h, 9);
    // The floor is at y = -1.4 in AR coordinates: heights are measured from it.
    const shifted = measureCeiling(rayTo([0, -0.05, 0], [0, h - 1.4, -1.75]), -1.4, a, b);
    expect(shifted.ok && shifted.height).toBeCloseTo(h, 9);
  });

  it('refuse a ceiling aimed below the horizon, at another wall, or too low', () => {
    const a = { x: -1, z: -1.75 };
    const b = { x: 1, z: -1.75 };
    const eye2: [number, number, number] = [0, 1.4, 0];
    expect(measureCeiling(rayTo(eye2, [0, 0, -1.75]), 0, a, b)).toMatchObject({
      reason: 'aim-higher',
    });
    // The top of a side wall: meets the first wall's line far beyond its marks.
    expect(measureCeiling(rayTo(eye2, [1.5, 2.4, -0.1]), 0, a, b)).toMatchObject({
      reason: 'not-this-wall',
    });
    expect(measureCeiling(rayTo(eye2, [0, 1.6, -1.75]), 0, a, b)).toMatchObject({
      reason: 'not-a-ceiling',
    });
  });
});

describe('room axes and marks', () => {
  const axes = roomAxes(30 * DEG);

  it('run along the first wall and square to it', () => {
    const a = axesThrough({ x: 0, z: 0 }, { x: 0, z: 2 })!;
    near(a.u, { x: 0, z: 1 });
    near(a.v, { x: -1, z: 0 });
    expect(axesThrough({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
    const p = { x: 1.3, z: -0.4 };
    const [s, t] = toRoomFrame(axes, p);
    near(fromRoomFrame(axes, s, t), p, 1e-12);
    expect(axesAngle(axes)).toBeCloseTo(30 * DEG, 12);
  });

  it('put a mark on the wall most nearly square to the view, facing the camera', () => {
    const camera = { x: 0, z: 0 };
    // 1.5 m straight along -v, then a little along u: an axis-0 wall the camera looks at.
    const point = fromRoomFrame(axes, 0.2, -1.5);
    const m = placeMark(point, camera, axes);
    expect(m).toMatchObject({ ok: true, axis: 0, facing: 1 });
    expect(m.ok && m.offset).toBeCloseTo(-1.5, 9);
    expect(m.ok && m.along).toBeCloseTo(0.2, 9);
    expect(m.ok && m.skewDeg).toBeCloseTo(Math.atan(0.2 / 1.5) / DEG, 6);
    const side = placeMark(fromRoomFrame(axes, 2, 0.1), camera, axes);
    expect(side).toMatchObject({ ok: true, axis: 1, facing: -1 });
  });

  it('accepts a view up to 30° from square to a wall', () => {
    const point = fromRoomFrame(axes, 1.5 * Math.tan(28 * DEG), -1.5);
    const m = placeMark(point, { x: 0, z: 0 }, axes);
    expect(m).toMatchObject({ ok: true, axis: 0, facing: 1 });
    expect(m.ok && m.skewDeg).toBeCloseTo(28, 6);
  });

  it('refuses a view near the diagonal unless the axis is given', () => {
    const point = fromRoomFrame(axes, 1, -1.2); // 40° from square to either wall
    expect(placeMark(point, { x: 0, z: 0 }, axes)).toMatchObject({ ok: false, reason: 'diagonal' });
    expect(placeMark(point, { x: 0, z: 0 }, axes, { axis: 0 })).toMatchObject({ ok: true });
    expect(placeMark({ x: 0.1, z: 0 }, { x: 0, z: 0 }, axes)).toMatchObject({
      ok: false,
      reason: 'too-close',
    });
  });
});

describe('groupWallMarks', () => {
  const axes = roomAxes(0);
  const mark = (id: string, a: number, b: number, camB: number, axis: WallAxis = 0) => ({
    id,
    point: fromRoomFrame(axes, a, b),
    camera: fromRoomFrame(axes, axis === 0 ? a : 0, axis === 0 ? camB : b),
    axis,
  });

  it('averages marks of the same wall and keeps other walls apart', () => {
    const g = groupWallMarks(
      [
        mark('a', 0, -1.5, 0),
        mark('b', 1, -1.6, 0), // 10 cm off: same wall
        mark('c', 0.5, -1.8, 0), // 30 cm off: another wall (a step, or a bad mark)
        mark('d', 0, 1.5, 0), // the opposite wall faces the other way
      ],
      axes,
      { refine: false },
    );
    expect(g.walls).toHaveLength(3);
    expect(g.wallOf).toEqual([0, 0, 1, 2]);
    expect(g.walls[0]!.offset).toBeCloseTo(-1.55, 9);
    expect(g.walls[0]!.markIds).toEqual(['a', 'b']);
    expect(g.walls.map((w) => w.facing)).toEqual([1, 1, -1]);
  });

  it('turns the axes to fit a wall marked at spots far apart', () => {
    // The first wall's two marks are 0.6 m apart and 2 cm off: the axes start 1.9° out.
    const truth = roomAxes(10 * DEG);
    const start = axesThrough(fromRoomFrame(truth, 0, -1.5), fromRoomFrame(truth, 0.6, -1.48))!;
    const at = (a: number, b: number) => fromRoomFrame(truth, a, b);
    const marks: WallMarkInput[] = [
      { id: 'f1', point: at(0, -1.5), camera: at(0, 0), axis: 0 },
      { id: 'f2', point: at(0.6, -1.48), camera: at(0.6, 0), axis: 0 },
      // The opposite wall, marked 3 m apart (exactly on it).
      { id: 'o1', point: at(-1.5, 1.5), camera: at(-1.5, 0), axis: 0 },
      { id: 'o2', point: at(1.5, 1.5), camera: at(1.5, 0), axis: 0 },
    ];
    const g = groupWallMarks(marks, start);
    const before = Math.abs(axesAngle(start) - 10 * DEG) / DEG;
    const after = Math.abs(axesAngle(g.axes) - 10 * DEG) / DEG;
    expect(before).toBeGreaterThan(1.5);
    expect(after).toBeLessThan(0.3);
    expect(groupWallMarks(marks, start, { refine: false }).axes).toBe(start);
  });
});

describe('solveRectilinearRoom', () => {
  it('closes a rectangle from one mark per wall, at any angle', () => {
    for (const yaw of [0, 17, 90, -123]) {
      const outline = rotate(rectangle(3, 3.5, -1.5, -1.75), yaw);
      const axes = roomAxes(yaw * DEG);
      const { result } = solveOutline(outline, axes);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(outlineError(result.room.points, outline)).toBeLessThan(1e-9);
      expect(roomArea(result.room)).toBeCloseTo(10.5, 9);
      expect(result.inferredWalls).toEqual([]);
      expect(new Set(result.wallSource).size).toBe(4);
    }
  });

  it('closes an L-shaped room', () => {
    const axes = roomAxes(0);
    const { result } = solveOutline(lShape, axes, { at: 0.4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(outlineError(result.room.points, lShape)).toBeLessThan(1e-9);
    expect(roomArea(result.room)).toBeCloseTo(27, 9);
  });

  it('closes a U-shaped room, filling in an arm end that was not marked', () => {
    const u: Point[] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ];
    const outline = roomFromPoints(u).points;
    const axes = roomAxes(0);
    // Skip the end of one arm: it is on the same line as the other arm's end.
    const endOfArm = outline.findIndex((p, k) => {
      const q = outline[(k + 1) % outline.length]!;
      return p[1] === 3 && q[1] === 3 && Math.min(p[0], q[0]) === 0;
    });
    const { result } = solveOutline(outline, axes, { skip: [endOfArm], back: 0.4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(outlineError(result.room.points, outline)).toBeLessThan(1e-9);
    expect(result.inferredWalls).toHaveLength(1);
  });

  it('waits for enough walls', () => {
    const axes = roomAxes(0);
    const outline = rectangle(3, 3.5);
    const three = groupWallMarks(marksFor(outline, axes, { skip: [3] }), axes);
    expect(solveRectilinearRoom(three.walls, axes)).toMatchObject({ error: 'too-few-walls' });
    // Five walls, but one side of the room is still missing.
    const open = groupWallMarks(
      [
        ...marksFor(outline, axes, { skip: [3] }),
        ...marksFor(rectangle(3, 1.2), axes, { skip: [1, 2, 3] }).map((m) => ({
          ...m,
          id: 'x',
        })),
        ...marksFor(rectangle(3, 2.2), axes, { skip: [1, 2, 3] }).map((m) => ({
          ...m,
          id: 'y',
        })),
      ],
      axes,
    );
    expect(open.walls.length).toBeGreaterThanOrEqual(4);
    expect(solveRectilinearRoom(open.walls, axes).ok).toBe(false);
  });

  it('reports marks that cannot all be right, and which walls they are on', () => {
    const axes = roomAxes(0);
    const outline = rectangle(3, 3.5);
    const marks = marksFor(outline, axes);
    // The side of a bed along the first wall, 0.9 m in front of it, marked as a wall.
    const first = marks[0]!;
    const bed = {
      id: 'bed',
      point: { x: first.point.x + 0.5, z: first.point.z + 0.9 },
      camera: first.camera,
      axis: first.axis,
    };
    const grouped = groupWallMarks([...marks, bed], axes);
    const r = solveRectilinearRoom(grouped.walls, axes);
    expect(r).toMatchObject({ ok: false, error: 'conflict' });
    if (r.ok) return;
    const bedWall = grouped.wallOf[4]!;
    expect(r.conflicting).toContain(bedWall);
    expect(r.conflicting).toContain(grouped.wallOf[0]);
    // Finishing anyway leaves the bed out.
    const anyway = solveRoomLeavingOut(grouped.walls, axes);
    expect(anyway.ok && anyway.leftOut).toEqual([bedWall]);
    expect(anyway.ok && outlineError(anyway.room.points, outline)).toBeLessThan(1e-9);
  });

  it('does not close with a wall marked from outside the room', () => {
    const axes = roomAxes(0);
    const marks = marksFor(rectangle(3, 3.5), axes);
    const flipped = marks.map((m, k) =>
      k === 1
        ? { ...m, camera: { x: 2 * m.point.x - m.camera.x, z: 2 * m.point.z - m.camera.z } }
        : m,
    );
    const g = groupWallMarks(flipped, axes);
    // Its mark says the room is behind it; the other three say it is here.
    expect(solveRectilinearRoom(g.walls, axes)).toMatchObject({ ok: false, error: 'conflict' });
  });

  it('says a wall is still missing, not that marks disagree, while an L-shape is half done', () => {
    const axes = roomAxes(0);
    // Every wall but the far end of one arm: the marks on the long walls run past the inner corner.
    const end = lShape.findIndex((p, k) => {
      const q = lShape[(k + 1) % lShape.length]!;
      return p[1] === 6 && q[1] === 6;
    });
    const g = groupWallMarks(marksFor(lShape, axes, { skip: [end], at: 0.2 }), axes);
    expect(solveRectilinearRoom(g.walls, axes)).toMatchObject({ ok: false, error: 'open' });
  });

  it('does not take an L-shape for a rectangle when its inner wall is missing', () => {
    const axes = roomAxes(0);
    const inner = lShape.findIndex((p, k) => {
      const q = lShape[(k + 1) % lShape.length]!;
      return p[0] === 3 && q[0] === 3;
    });
    const g = groupWallMarks(marksFor(lShape, axes, { skip: [inner], at: 0.4 }), axes);
    expect(solveRectilinearRoom(g.walls, axes).ok).toBe(false);
  });

  it('keeps the walls it was given unchanged', () => {
    const axes = roomAxes(0);
    const g = groupWallMarks(marksFor(rectangle(3, 3), axes), axes);
    const copy = JSON.parse(JSON.stringify(g.walls)) as MarkedWall[];
    solveRectilinearRoom(g.walls, axes);
    expect(g.walls).toEqual(copy);
  });
});

describe('sizes', () => {
  it('describe a rectangle by its sides, shorter first', () => {
    const room = roomFromPoints(rotate(rectangle(3.505, 3.124), 20));
    const [a, b] = rectangleSides(room)!;
    expect(a).toBeCloseTo(3.124, 9);
    expect(b).toBeCloseTo(3.505, 9);
    expect(describeRoomSize(room, 'imperial')).toBe('10′ 3″ × 11′ 6″');
    expect(describeRoomSize(room, 'metric')).toBe('3.12 m × 3.50 m');
    expect(describeRoomSize(roomFromPoints(lShape), 'metric')).toBe('27.0 m², 6 walls');
    expect(rectangleSides(roomFromPoints(lShape))).toBeNull();
  });

  it('scale a room about its middle', () => {
    const room = roomFromPoints(rectangle(3, 4, 1, 1));
    const bigger = scaleRoom(room, 1.1);
    expect(wallLengths(bigger).map((l) => Number(l.toFixed(9)))).toEqual([3.3, 4.4, 3.3, 4.4]);
    const mid = (r: typeof room) => [
      (Math.min(...r.points.map((p) => p[0])) + Math.max(...r.points.map((p) => p[0]))) / 2,
      (Math.min(...r.points.map((p) => p[1])) + Math.max(...r.points.map((p) => p[1]))) / 2,
    ];
    expect(mid(bigger)[0]).toBeCloseTo(mid(room)[0]!, 9);
    expect(mid(bigger)[1]).toBeCloseTo(mid(room)[1]!, 9);
    expect(scaleRoom(room, Number.NaN)).toBe(room);
  });
});

describe('noisy marks', () => {
  it('stay within 3 cm per wall for a rectangle with 1 cm noise', () => {
    const rand = mulberry32(7);
    const outline = rectangle(3, 3.5, -1.5, -1.75);
    const axes = roomAxes(0);
    for (let trial = 0; trial < 50; trial++) {
      const marks = marksFor(outline, axes).map((m) => ({
        ...m,
        point: { x: m.point.x + (rand() - 0.5) * 0.02, z: m.point.z + (rand() - 0.5) * 0.02 },
      }));
      const g = groupWallMarks(marks, axes);
      const r = solveRectilinearRoom(g.walls, g.axes);
      expect(r.ok).toBe(true);
      if (r.ok) expect(outlineError(r.room.points, outline)).toBeLessThan(0.03);
    }
  });
});
