import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CEILING_HEIGHT,
  buildRoomFromWalls,
  isBuildRoomFailure,
  mergeWallObservations,
  polygonArea,
  signedArea,
  wallLengths,
  type BuildRoomResult,
  type BuildRoomSuccess,
  type Point,
  type WallObservation,
} from '../src';
import {
  alcoveRoom,
  ccw,
  chamferRoom,
  cornerAngles,
  edgesOf,
  expectOutline,
  lShape,
  mulberry32,
  noisyObservations,
  outlineError,
  rectangle,
  rotate,
  thinL,
  wallObservations,
} from './helpers';

function ok(result: BuildRoomResult): BuildRoomSuccess {
  if (isBuildRoomFailure(result))
    throw new Error(`expected a room, got ${result.error}: ${result.reason}`);
  return result;
}

const obs = (id: string, ax: number, az: number, bx: number, bz: number): WallObservation => ({
  id,
  source: 'plane',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
});

describe('buildRoomFromWalls: rectangles', () => {
  const rect = rectangle(4, 3);

  it('builds a rectangle from four exact walls', () => {
    const { room, inferredWalls, observedWallCount } = ok(
      buildRoomFromWalls(wallObservations(rect)),
    );
    expectOutline(room.points, rect);
    expect(polygonArea(room.points)).toBeCloseTo(12, 9);
    expect(signedArea(room.points)).toBeGreaterThan(0);
    expect(inferredWalls).toEqual([]);
    expect(observedWallCount).toBe(4);
  });

  it('finds the corners when only the middle of each wall was seen', () => {
    const { room } = ok(buildRoomFromWalls(wallObservations(rect, 0.3, 0.7)));
    expectOutline(room.points, rect, 1e-9);
  });

  it('trims walls that were seen past the corners', () => {
    const { room } = ok(buildRoomFromWalls(wallObservations(rect, -0.08, 1.08)));
    expectOutline(room.points, rect, 1e-9);
  });

  it('does not depend on the order or direction of the observations', () => {
    const observations = wallObservations(rect, 0.2, 0.8)
      .map((o, i) => (i % 2 ? { ...o, a: o.b, b: o.a } : o))
      .reverse();
    const { room } = ok(buildRoomFromWalls(observations));
    expectOutline(room.points, rect, 1e-9);
  });

  it('keeps the orientation of a rotated room', () => {
    const rotated = rotate(rect, 30, { x: 2, z: 1.5 });
    const { room } = ok(buildRoomFromWalls(wallObservations(rotated, 0.25, 0.75)));
    expectOutline(room.points, rotated, 1e-9);
  });

  it('returns walls that connect consecutive corners, the ceiling height and wall ids', () => {
    const { room } = ok(buildRoomFromWalls(wallObservations(rect), { ceilingHeight: 2.7 }));
    expect(room.version).toBe(1);
    expect(room.ceilingHeight).toBe(2.7);
    expect(room.walls.map((w) => [w.a, w.b])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
    expect(room.walls.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(room.walls.every((w) => w.openings.length === 0)).toBe(true);
    const lengths = wallLengths(room).sort((p, q) => p - q);
    [3, 3, 4, 4].forEach((l, i) => expect(lengths[i]).toBeCloseTo(l, 9));
    expect(ok(buildRoomFromWalls(wallObservations(rect))).room.ceilingHeight).toBe(
      DEFAULT_CEILING_HEIGHT,
    );
  });
});

describe('buildRoomFromWalls: other shapes', () => {
  it('builds an L-shaped room', () => {
    const { room, inferredWalls } = ok(buildRoomFromWalls(wallObservations(lShape, 0.2, 0.8)));
    expectOutline(room.points, lShape, 1e-9);
    expect(polygonArea(room.points)).toBeCloseTo(27, 9);
    expect(inferredWalls).toEqual([]);
  });

  it('builds a thin L-shaped room whose wall midpoints centre is outside the room', () => {
    const { room } = ok(buildRoomFromWalls(wallObservations(thinL, 0.15, 0.85)));
    expectOutline(room.points, thinL, 1e-9);
    expect(polygonArea(room.points)).toBeCloseTo(19, 9);
  });

  it('uses the scan position when it is given', () => {
    const { room } = ok(
      buildRoomFromWalls(wallObservations(thinL, 0.15, 0.85), { center: { x: 0.5, z: 0.5 } }),
    );
    expectOutline(room.points, thinL, 1e-9);
  });

  it('builds a room with an alcove when every wall was seen', () => {
    const { room, inferredWalls } = ok(
      buildRoomFromWalls(wallObservations(alcoveRoom, 0.15, 0.85)),
    );
    expectOutline(room.points, alcoveRoom, 1e-9);
    expect(inferredWalls).toEqual([]);
  });

  it('inserts the short side walls of an alcove that were not seen', () => {
    // Main wall pieces end 0.2 m before the alcove; its back wall was seen 0.2 m short of each side.
    const observations = [
      obs('left', 0.5, 0, 1.8, 0),
      obs('back', 2.2, -0.6, 3.3, -0.6),
      obs('right', 3.7, 0, 4.6, 0),
      obs('east', 5, 0.5, 5, 3.5),
      obs('south', 4.5, 4, 0.5, 4),
      obs('west', 0, 3.5, 0, 0.5),
    ];
    const { room, inferredWalls } = ok(buildRoomFromWalls(observations));
    expectOutline(room.points, alcoveRoom, 1e-9);
    expect(inferredWalls).toHaveLength(2);
  });

  it('keeps a 45° wall while squaring the others', () => {
    const { room } = ok(buildRoomFromWalls(wallObservations(chamferRoom, 0.2, 0.8)));
    expectOutline(room.points, chamferRoom, 1e-9);
  });

  it('merges a wall seen as two pieces either side of a doorway', () => {
    const rect = rectangle(4, 3);
    const observations = wallObservations(rect, 0.2, 0.8, [0]);
    const [first] = edgesOf(rect);
    const at = (t: number) => ({
      x: first!.a.x + (first!.b.x - first!.a.x) * t,
      z: first!.a.z + (first!.b.z - first!.a.z) * t,
    });
    observations.push(
      { id: 'door-left', source: 'plane', a: at(0.1), b: at(0.35) },
      { id: 'door-right', source: 'plane', a: at(0.6), b: at(0.9) },
    );
    const { room, observedWallCount } = ok(buildRoomFromWalls(observations));
    expectOutline(room.points, rect, 1e-9);
    expect(observedWallCount).toBe(5);
    expect(room.walls).toHaveLength(4);
  });
});

describe('buildRoomFromWalls: noisy and incomplete scans', () => {
  const shapes: [string, Point[]][] = [
    ['rectangle', rectangle(4.2, 3.4)],
    ['rotated rectangle', rotate(rectangle(5, 3.6), 17)],
    ['L-shape', lShape],
    ['alcove room', alcoveRoom],
  ];

  for (const [name, shape] of shapes) {
    it(`recovers a ${name} from many partial noisy observations`, () => {
      // Each piece: 2 cm sideways noise and 1.5° turn. build.md promises walls within 5-10 cm.
      const area = polygonArea(shape);
      const errors: number[] = [];
      for (let seed = 1; seed <= 25; seed++) {
        const { room } = ok(buildRoomFromWalls(noisyObservations(shape, seed)));
        const error = outlineError(room.points, shape);
        errors.push(error);
        expect(error, `seed ${seed}`).toBeLessThan(0.1);
        expect(Math.abs(polygonArea(room.points) - area) / area, `seed ${seed}`).toBeLessThan(0.03);
      }
      errors.sort((p, q) => p - q);
      expect(errors[12]).toBeLessThan(0.04);
    });
  }

  it('stays within 15 cm with heavy noise (4 cm sideways, 3° turn per piece)', () => {
    for (const [name, shape] of [shapes[0]!, shapes[3]!]) {
      for (let seed = 1; seed <= 25; seed++) {
        const { room } = ok(
          buildRoomFromWalls(
            noisyObservations(shape, seed, { lateralSigma: 0.04, angleSigmaDeg: 3 }),
          ),
        );
        expect(outlineError(room.points, shape), `${name} seed ${seed}`).toBeLessThan(0.15);
      }
    }
  });

  it('finds corners hidden behind furniture (up to 2.5 m of a wall unseen)', () => {
    for (const [name, shape] of shapes) {
      for (let seed = 1; seed <= 10; seed++) {
        const observations = noisyObservations(shape, 100 + seed, { hiddenEnds: 2.5 });
        const { room } = ok(buildRoomFromWalls(observations));
        expect(outlineError(room.points, shape), `${name} seed ${seed}`).toBeLessThan(0.1);
      }
    }
  });

  it('gives the same room when every observation is repeated', () => {
    const observations = noisyObservations(lShape, 7);
    const repeated = [0, 1, 2].flatMap((k) =>
      observations.map((o) => ({ ...o, id: `${o.id}#${k}` })),
    );
    const once = ok(buildRoomFromWalls(observations)).room.points;
    const thrice = ok(buildRoomFromWalls(repeated)).room.points;
    expect(outlineError(thrice, once)).toBeLessThan(1e-9);
    const shuffled = ok(buildRoomFromWalls([...observations].reverse())).room.points;
    expect(outlineError(shuffled, once)).toBeLessThan(1e-9);
  });

  it('lets a later observation with the same id replace an earlier one', () => {
    const rect = rectangle(4, 3);
    const observations = wallObservations(rect, 0.2, 0.8);
    const stale = { ...observations[0]!, a: { x: 10, z: 10 }, b: { x: 12, z: 11 } };
    const { room } = ok(buildRoomFromWalls([stale, ...observations]));
    expectOutline(room.points, rect, 1e-9);
  });

  it('fills in a missing wall between two parallel walls', () => {
    const rect = rectangle(4, 3);
    const observations = wallObservations(rect, 0, 1, [1]);
    const { room, inferredWalls } = ok(buildRoomFromWalls(observations));
    expectOutline(room.points, rect, 1e-9);
    expect(inferredWalls).toHaveLength(1);
    const lengths = wallLengths(room);
    expect(lengths[inferredWalls[0]!]).toBeCloseTo(3, 9);
  });

  it('puts a missing wall at the farthest point the side walls were seen', () => {
    const observations = [
      obs('north', 0.4, 0, 3.4, 0),
      obs('south', 3.8, 3, 0.4, 3),
      obs('west', 0, 2.6, 0, 0.4),
    ];
    const { room, inferredWalls } = ok(buildRoomFromWalls(observations));
    expectOutline(room.points, rectangle(3.8, 3), 1e-9);
    expect(inferredWalls).toHaveLength(1);
  });

  it('joins the seen ends when a corner would be far beyond them', () => {
    // Wall a was only seen for 1 m: its corner with wall b would be 5 m beyond that.
    const observations = [
      obs('a', 0, 0, 1, 0),
      obs('b', 6, 1, 6, 4),
      obs('c', 6, 5, 0, 5),
      obs('d', 0, 5, 0, 2),
    ];
    const { room, inferredWalls } = ok(buildRoomFromWalls(observations));
    expectOutline(
      room.points,
      ccw([
        [0, 0],
        [1, 0],
        [6, 1],
        [6, 5],
        [0, 5],
      ]),
      1e-9,
    );
    expect(inferredWalls).toHaveLength(1);
    // With a larger allowance the corner is accepted.
    const lenient = ok(buildRoomFromWalls(observations, { maxCornerExtension: 6 }));
    expectOutline(lenient.room.points, rectangle(6, 5), 1e-9);
  });
});

describe('buildRoomFromWalls: square-corner snapping', () => {
  const rect = rectangle(4, 3);
  // Each wall turned 1-3.5° either way about its middle.
  const skewed = (seed: number) => {
    const rand = mulberry32(seed);
    return edgesOf(rect).map((e, i) => {
      const deg = (rand() < 0.5 ? -1 : 1) * (1 + rand() * 2.5);
      const mid: [number, number][] = rotate(
        [
          [e.a.x + (e.b.x - e.a.x) * 0.2, e.a.z + (e.b.z - e.a.z) * 0.2],
          [e.a.x + (e.b.x - e.a.x) * 0.8, e.a.z + (e.b.z - e.a.z) * 0.8],
        ],
        deg,
        { x: (e.a.x + e.b.x) / 2, z: (e.a.z + e.b.z) / 2 },
      );
      return obs(`s${i}`, mid[0]![0], mid[0]![1], mid[1]![0], mid[1]![1]);
    });
  };

  it('snaps nearly square walls to exact right angles', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { room } = ok(buildRoomFromWalls(skewed(seed)));
      for (const a of cornerAngles(room.points)) expect(Math.abs(a - 90)).toBeLessThan(1e-9);
      expect(outlineError(room.points, rect)).toBeLessThan(0.15);
    }
  });

  it('leaves the walls as seen when snapping is off', () => {
    const { room } = ok(buildRoomFromWalls(skewed(3), { snapSquare: false }));
    const worst = Math.max(...cornerAngles(room.points).map((a) => Math.abs(a - 90)));
    expect(worst).toBeGreaterThan(1);
  });

  it('snaps around the room orientation, not the world axes', () => {
    const rotated = rotate(rect, 33);
    const noisy = noisyObservations(rotated, 4, { angleSigmaDeg: 2.5 });
    const { room } = ok(buildRoomFromWalls(noisy));
    for (const a of cornerAngles(room.points)) expect(Math.abs(a - 90)).toBeLessThan(1e-9);
    const [p, q] = [room.points[0]!, room.points[1]!];
    const deg = ((((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI) % 90) + 90) % 90;
    expect(Math.min(Math.abs(deg - 33), Math.abs(deg - 33 + 90))).toBeLessThan(1.5);
  });

  it('does not snap a corner that is far from square', () => {
    // The east wall leans 12.7° from square.
    const shape = ccw([
      [0, 0],
      [5, 0],
      [5.9, 4],
      [0, 4],
    ]);
    const { room } = ok(buildRoomFromWalls(wallObservations(shape, 0.2, 0.8)));
    expectOutline(room.points, shape, 1e-9);
  });
});

describe('buildRoomFromWalls: invalid input', () => {
  it('needs at least three walls', () => {
    const none = buildRoomFromWalls([]);
    expect(none).toMatchObject({ error: 'too-few-walls' });
    expect(isBuildRoomFailure(none) && none.reason).toMatch(/No walls found/);
    const two = buildRoomFromWalls([obs('a', 0, 0, 4, 0), obs('b', 4, 0, 4, 3)]);
    expect(two).toMatchObject({ error: 'too-few-walls' });
    expect(isBuildRoomFailure(two) && two.reason).toMatch(/Only 2 walls/);
  });

  it('counts collinear pieces as one wall', () => {
    const result = buildRoomFromWalls([
      obs('a', 0, 0, 1, 0),
      obs('b', 1.5, 0.05, 2.5, 0.05),
      obs('c', 3, 0, 4, 0),
    ]);
    expect(result).toMatchObject({ error: 'too-few-walls' });
  });

  it('ignores observations that are not finite or too short', () => {
    const rect = rectangle(4, 3);
    const junk: WallObservation[] = [
      obs('nan', Number.NaN, 0, 1, 1),
      obs('inf', 0, Infinity, 1, 1),
      obs('dot', 1, 1, 1.02, 1),
    ];
    const { room } = ok(buildRoomFromWalls([...junk, ...wallObservations(rect, 0.2, 0.8)]));
    expectOutline(room.points, rect, 1e-9);
    expect(buildRoomFromWalls(junk.slice(0, 2))).toMatchObject({ error: 'invalid-input' });
    expect(buildRoomFromWalls('nope' as unknown as WallObservation[])).toMatchObject({
      error: 'invalid-input',
    });
  });

  it('rejects a room that is too small', () => {
    const result = buildRoomFromWalls(wallObservations(rectangle(1.2, 1.2), 0.2, 0.8));
    expect(result).toMatchObject({ error: 'too-small' });
    expect(isBuildRoomFailure(result) && result.reason).toMatch(/smaller than 2 m²/);
  });

  it('accepts a smaller room when minArea allows it', () => {
    const { room } = ok(
      buildRoomFromWalls(wallObservations(rectangle(1.2, 1.2), 0.2, 0.8), { minArea: 1 }),
    );
    expect(polygonArea(room.points)).toBeCloseTo(1.44, 9);
  });

  it('gives every failure a reason to show', () => {
    const results = [
      buildRoomFromWalls([]),
      buildRoomFromWalls([obs('a', 0, 0, 1, 0)]),
      buildRoomFromWalls(wallObservations(rectangle(1, 1))),
    ];
    for (const r of results) {
      expect(isBuildRoomFailure(r)).toBe(true);
      if (isBuildRoomFailure(r)) expect(r.reason.length).toBeGreaterThan(20);
    }
  });
});

describe('mergeWallObservations', () => {
  it('merges overlapping sightings of the same wall and keeps separate walls apart', () => {
    const merged = mergeWallObservations([
      obs('p1', 0, 0, 2, 0.02),
      obs('p2', 1.5, -0.03, 3.5, 0),
      obs('p3', 3.4, 0.01, 4, 0),
      obs('east', 4, 0.3, 4, 2.8),
      obs('inner', 0.5, 0.5, 2, 0.5), // parallel but 0.5 m away: a different wall
    ]);
    expect(merged).toHaveLength(3);
    const long = merged.find((m) => m.sourceIds.includes('p1'))!;
    expect(long.sourceIds.sort()).toEqual(['p1', 'p2', 'p3']);
    expect(long.length).toBeGreaterThan(3.9);
    expect(long.length).toBeLessThan(4.1);
  });

  it('does not merge walls more than 8° apart', () => {
    const merged = mergeWallObservations([obs('a', 0, 0, 2, 0), obs('b', 2, 0, 4, 0.4)]);
    expect(merged).toHaveLength(2);
  });

  it('weights by length times confidence', () => {
    const merged = mergeWallObservations([
      { ...obs('long', 0, 0, 4, 0), confidence: 1 },
      { ...obs('short', 1, 0.1, 2, 0.1), confidence: 0.5 },
    ]);
    expect(merged).toHaveLength(1);
    // Weighted centre line: 4·0 + 0.5·0.1 over 4.5.
    const z = (merged[0]!.a.z + merged[0]!.b.z) / 2;
    expect(z).toBeCloseTo(0.05 / 4.5, 6);
    expect(merged[0]!.weight).toBeCloseTo(4.5, 9);
  });
});
