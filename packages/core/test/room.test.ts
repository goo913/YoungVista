import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CEILING_HEIGHT,
  bounds,
  ensureCounterClockwise,
  inwardNormal,
  isCounterClockwise,
  isRoom,
  isSimplePolygon,
  polygonArea,
  polygonPerimeter,
  roomArea,
  roomFromFirestore,
  roomFromPoints,
  roomPerimeter,
  roomToFirestore,
  signedArea,
  validateRoomShape,
  wallEndpoints,
  wallLengths,
  type Point,
} from '../src';
import { lShape, rectangle } from './helpers';

describe('polygon helpers', () => {
  // Seen from above (+X right, +Z toward the bottom of the screen) this runs counter-clockwise.
  const ccwSquare: Point[] = [
    [0, 0],
    [0, 4],
    [3, 4],
    [3, 0],
  ];

  it('measures signed area counter-clockwise seen from above', () => {
    expect(signedArea(ccwSquare)).toBeCloseTo(12, 12);
    expect(signedArea([...ccwSquare].reverse())).toBeCloseTo(-12, 12);
    expect(isCounterClockwise(ccwSquare)).toBe(true);
    expect(ensureCounterClockwise([...ccwSquare].reverse())).toEqual(
      [...ccwSquare].reverse().reverse(),
    );
    expect(polygonArea(lShape)).toBeCloseTo(27, 12);
    expect(polygonPerimeter(rectangle(4, 3))).toBeCloseTo(14, 12);
  });

  it('accepts { x, z } points too', () => {
    expect(signedArea(ccwSquare.map(([x, z]) => ({ x, z })))).toBeCloseTo(12, 12);
  });

  it('gives inward normals for a counter-clockwise outline', () => {
    const n = inwardNormal(ccwSquare[0]!, ccwSquare[1]!); // west wall, interior toward +X
    expect(n.x).toBeCloseTo(1, 12);
    expect(n.z).toBeCloseTo(0, 12);
  });

  it('computes bounds', () => {
    expect(bounds(lShape)).toEqual({ minX: 0, minZ: 0, maxX: 6, maxZ: 6, width: 6, depth: 6 });
  });

  it('detects self-crossing and spikes', () => {
    const bowTie: Point[] = [
      [0, 0],
      [4, 4],
      [4, 0],
      [0, 4],
    ];
    expect(isSimplePolygon(bowTie)).toBe(false);
    expect(isSimplePolygon(rectangle(4, 3))).toBe(true);
    const spike: Point[] = [
      [0, 0],
      [4, 0],
      [4, 3],
      [2, 3],
      [6, 3],
      [0, 3],
    ];
    expect(isSimplePolygon(spike)).toBe(false);
    const touching: Point[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 0],
      [0, 4],
    ];
    expect(isSimplePolygon(touching)).toBe(false);
  });
});

describe('validateRoomShape', () => {
  it('accepts a normal room and reports its area', () => {
    expect(validateRoomShape(rectangle(4, 3))).toEqual({ ok: true, area: 12 });
  });

  it('explains what is wrong', () => {
    expect(
      validateRoomShape([
        [0, 0],
        [1, 0],
      ]),
    ).toMatchObject({ ok: false, error: 'too-few-walls' });
    expect(
      validateRoomShape([
        [0, 0],
        [4, 4],
        [4, 0],
        [0, 4],
      ]),
    ).toMatchObject({ ok: false, error: 'self-intersecting' });
    expect(validateRoomShape(rectangle(1, 1))).toMatchObject({ ok: false, error: 'too-small' });
    expect(
      validateRoomShape([
        [0, 0],
        [4, 0],
        [4, 3],
        [0.1, 3],
        [0, 3],
      ]),
    ).toMatchObject({ ok: false, error: 'wall-too-short' });
    expect(
      validateRoomShape([
        [0, 0],
        [Number.NaN, 1],
        [1, 1],
      ]),
    ).toMatchObject({ ok: false, error: 'invalid-input' });
    const r = validateRoomShape(rectangle(1, 1));
    expect(!r.ok && r.reason).toMatch(/2 m²/);
  });

  it('respects custom limits', () => {
    expect(validateRoomShape(rectangle(1, 1), { minArea: 0.5 })).toMatchObject({ ok: true });
  });
});

describe('room model', () => {
  it('builds walls between consecutive corners in counter-clockwise order', () => {
    const clockwise = [...rectangle(4, 3)].reverse();
    const room = roomFromPoints(clockwise, { ceilingHeight: 2.5 });
    expect(isCounterClockwise(room.points)).toBe(true);
    expect(room.ceilingHeight).toBe(2.5);
    expect(room.walls).toHaveLength(4);
    expect(room.walls[3]).toEqual({ id: 'w4', a: 3, b: 0, openings: [] });
    expect(roomFromPoints(rectangle(4, 3)).ceilingHeight).toBe(DEFAULT_CEILING_HEIGHT);
  });

  it('measures walls, area and perimeter', () => {
    const room = roomFromPoints(lShape);
    expect(wallLengths(room).reduce((s, l) => s + l, 0)).toBeCloseTo(24, 12);
    expect(roomArea(room)).toBeCloseTo(27, 12);
    expect(roomPerimeter(room)).toBeCloseTo(24, 12);
    expect(wallEndpoints(room, room.walls[0]!)).toEqual({
      a: { x: room.points[0]![0], z: room.points[0]![1] },
      b: { x: room.points[1]![0], z: room.points[1]![1] },
    });
  });

  it('round-trips through the Firestore shape without nested arrays', () => {
    const room = roomFromPoints([
      [0.12345, 0],
      [4, 0.00049],
      [4, 3],
      [0, 3],
    ]);
    room.walls[0]!.openings.push({
      id: 'd1',
      type: 'door',
      offset: 0.5,
      width: 0.9,
      height: 2.03,
      sill: 0,
    });
    const stored = roomToFirestore(room);
    expect(stored.points.every((p) => !Array.isArray(p))).toBe(true);
    const i = room.points.findIndex((p) => p[0] === 0.12345);
    const j = room.points.findIndex((p) => p[1] === 0.00049);
    expect(stored.points[i]).toEqual({ x: 0.123, z: 0 });
    const back = roomFromFirestore(JSON.parse(JSON.stringify(stored)));
    expect(back).not.toBeNull();
    expect(isRoom(back)).toBe(true);
    expect(back!.walls[0]!.openings).toEqual(room.walls[0]!.openings);
    expect(back!.points[j]).toEqual([4, 0]);
  });

  it('rejects data that is not a room and rebuilds missing walls', () => {
    expect(roomFromFirestore(null)).toBeNull();
    expect(roomFromFirestore({ version: 2, points: [] })).toBeNull();
    expect(
      roomFromFirestore({
        version: 1,
        points: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      }),
    ).toBeNull();
    expect(
      roomFromFirestore({
        version: 1,
        points: [
          { x: 0, z: 0 },
          { x: 1, z: 0 },
        ],
      }),
    ).toBeNull();
    const rebuilt = roomFromFirestore({
      version: 1,
      points: [
        { x: 0, z: 0 },
        { x: 0, z: 3 },
        { x: 4, z: 3 },
        { x: 4, z: 0 },
      ],
    });
    expect(rebuilt?.walls).toHaveLength(4);
    expect(rebuilt?.ceilingHeight).toBe(DEFAULT_CEILING_HEIGHT);
    expect(isRoom({ ...rebuilt, walls: [] })).toBe(false);
    expect(isRoom('room')).toBe(false);
  });
});
