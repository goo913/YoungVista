import { describe, expect, it } from 'vitest';
import {
  applyLineUp,
  applyLineUpInverse,
  invertLineUp,
  LINE_UP_MIN_SPACING,
  lineUpAt,
  lineUpCorners,
  lineUpFromCorners,
  lineUpFromPairs,
  lineUpFromRoomCorners,
  lineUpPose,
  lineUpPoseInverse,
  roomFromPoints,
  shiftLineUp,
  turnLineUp,
  type LineUp,
  type Vec2,
} from '../src';
import { gaussian, mulberry32, rectangle } from './helpers';

/** Room → world with a known turn about +Y and shift, as a phone's AR session might have it. */
const truth: LineUp = { rotationY: 30, x: 2, y: -1.4, z: -1 };
const toWorld = (p: Vec2, s = 1) => {
  const r = (truth.rotationY * Math.PI) / 180;
  return {
    x: s * (p.x * Math.cos(r) + p.z * Math.sin(r)) + truth.x,
    z: s * (-p.x * Math.sin(r) + p.z * Math.cos(r)) + truth.z,
  };
};
const tap = (p: Vec2, s = 1): [number, number, number] => {
  const w = toWorld(p, s);
  return [w.x, truth.y, w.z];
};

const A = { x: 0, z: 0 };
const B = { x: 4, z: 0 };

describe('lineUpFromCorners', () => {
  it('finds the turn and shift from two corners, with no scale', () => {
    const r = lineUpFromCorners([A, B], [tap(A), tap(B)])!;
    expect(r.rotationY).toBeCloseTo(30, 9);
    expect(r.x).toBeCloseTo(2, 9);
    expect(r.z).toBeCloseTo(-1, 9);
    expect(r.y).toBeCloseTo(-1.4, 12);
    expect(r.mismatch).toBeCloseTo(0, 9);
    expect(r.residual).toBeCloseTo(0, 9);
    expect(r.roomDistance).toBeCloseTo(4, 12);
    expect(r.quality).toBe('good');
    expect(r.issues).toEqual([]);
  });

  it('turns an item 90° the same way as DesignItem.rotationY (front +Z → +X)', () => {
    // Taps show the room turned a quarter: room +Z lands on world +X.
    const r = lineUpFromCorners(
      [
        { x: 0, z: 0 },
        { x: 0, z: 3 },
      ],
      [
        [0, 0],
        [3, 0],
      ],
    )!;
    expect(r.rotationY).toBeCloseTo(90, 9);
    expect(lineUpPose(r, { x: 0, z: 0, rotationY: 0 }).rotationY).toBeCloseTo(90, 9);
  });

  it('reports a distance mismatch and short baselines', () => {
    const stretched = lineUpFromCorners([A, B], [tap(A, 1.05), tap(B, 1.05)])!;
    expect(stretched.mismatch).toBeCloseTo(0.05, 9);
    expect(stretched.tappedDistance).toBeCloseTo(4.2, 9);
    expect(stretched.residual).toBeCloseTo(0.1, 9); // the error split between both corners
    expect(stretched.rotationY).toBeCloseTo(30, 9);
    expect(stretched.quality).toBe('fair');
    expect(stretched.issues).toEqual(['distance-mismatch']);

    const near = { x: 1, z: 0 };
    const short = lineUpFromCorners([A, near], [tap(A), tap(near)])!;
    expect(short.issues).toEqual(['corners-too-close']);
    expect(short.quality).toBe('fair');
  });

  it('never refuses a mismatch: a scan 10% or 30% off still lines up, with the room turned right', () => {
    // A scan about 90% right: the real wall is 10% longer than the saved one.
    const off = lineUpFromCorners([A, B], [tap(A, 1.1), tap(B, 1.1)])!;
    expect(off.quality).toBe('rough');
    expect(off.issues).toEqual(['distance-mismatch']);
    expect(off.rotationY).toBeCloseTo(30, 9);
    // The difference (40 cm) is spread over both corners: 20 cm at each.
    expect(off.residual).toBeCloseTo(0.2, 9);
    expect(off.tappedDistance - off.roomDistance).toBeCloseTo(0.4, 9);
    // The middle of the wall lands exactly where the middle of the taps is.
    const mid = applyLineUp(off, { x: 2, z: 0 });
    const want = toWorld({ x: 2, z: 0 }, 1.1);
    expect(Math.hypot(mid.x - want.x, mid.z - want.z)).toBeLessThan(1e-9);

    // Far off (the second tap a metre and a half short of its corner): still usable.
    const short = lineUpFromCorners([A, B], [tap(A), tap({ x: 2.5, z: 0 })])!;
    expect(short.quality).toBe('rough');
    expect(short.rotationY).toBeCloseTo(30, 9);
  });

  it('is poor only when the taps or the corners are too close to tell a direction', () => {
    const tiny = { x: 0.4, z: 0 };
    const close = lineUpFromCorners([A, tiny], [tap(A), tap(tiny)])!;
    expect(close.quality).toBe('poor');
    expect(close.issues).toContain('corners-too-close');
    const half = { x: LINE_UP_MIN_SPACING, z: 0 };
    expect(lineUpFromCorners([A, half], [tap(A), tap(half)])!.quality).toBe('rough');
    // Taps 30 cm apart for a 4 m wall: the direction is a guess.
    const bunched = lineUpFromCorners([A, B], [tap(A), tap({ x: 0.3, z: 0 })])!;
    expect(bunched.quality).toBe('poor');
    expect(bunched.issues).toEqual(['taps-too-close', 'distance-mismatch']);
  });

  it('accepts floor taps without a height', () => {
    const w = [toWorld(A), toWorld(B)];
    const r = lineUpFromCorners(
      [
        [0, 0],
        [4, 0],
      ],
      [[w[0]!.x, w[0]!.z], { x: w[1]!.x, z: w[1]!.z }],
      { floorY: -1.2 },
    )!;
    expect(r.y).toBe(-1.2);
    expect(r.rotationY).toBeCloseTo(30, 9);
  });

  it('returns null for taps or corners in one spot', () => {
    expect(lineUpFromCorners([A, A], [tap(A), tap(B)])).toBeNull();
    expect(lineUpFromCorners([A, B], [tap(A), tap(A)])).toBeNull();
    expect(lineUpFromCorners([A, B], [[NaN, 0, 0], tap(B)])).toBeNull();
  });
});

describe('lineUpFromRoomCorners', () => {
  // A 5 × 4 m room; the user stands inside it, near the middle, when tapping.
  const room = roomFromPoints(rectangle(5, 4));
  const pairOf = (p: Vec2, q: Vec2): [number, number] => [
    room.points.findIndex(([x, z]) => x === p.x && z === p.z),
    room.points.findIndex(([x, z]) => x === q.x && z === q.z),
  ];
  const c1 = { x: 0, z: 0 };
  const c2 = { x: 5, z: 0 };
  const corners = pairOf(c1, c2);
  const phone = [toWorld({ x: 2.5, z: 2.2 }), toWorld({ x: 2.6, z: 2 })];
  const near = (l: LineUp, p: Vec2) => {
    const got = applyLineUp(l, p);
    const want = toWorld(p);
    return Math.hypot(got.x - want.x, got.z - want.z);
  };

  it('takes the taps in the order asked when they fit that way', () => {
    const r = lineUpFromRoomCorners(room, corners, [tap(c1), tap(c2)], { from: phone })!;
    expect(r.swapped).toBe(false);
    expect(r.quality).toBe('good');
    for (const [x, z] of room.points) expect(near(r, { x, z })).toBeLessThan(1e-9);
  });

  it('sees corners tapped the other way round, from where the phone was', () => {
    const r = lineUpFromRoomCorners(room, corners, [tap(c2), tap(c1)], { from: phone })!;
    expect(r.swapped).toBe(true);
    expect(r.rotationY).toBeCloseTo(30, 9);
    for (const [x, z] of room.points) expect(near(r, { x, z })).toBeLessThan(1e-9);
    // The same taps without knowing where the phone was: the order asked, the room half a turn out.
    const blind = lineUpFromRoomCorners(room, corners, [tap(c2), tap(c1)])!;
    expect(blind.swapped).toBe(false);
    expect(blind.rotationY).toBeCloseTo(210, 9);
  });

  it('still sees the swap when the scan is 10% off', () => {
    const r = lineUpFromRoomCorners(room, corners, [tap(c2, 1.1), tap(c1, 1.1)], {
      from: phone,
    })!;
    expect(r.swapped).toBe(true);
    expect(r.quality).toBe('rough');
    expect(r.rotationY).toBeCloseTo(30, 9);
  });

  it('keeps the order asked when both orders leave the phone in the room', () => {
    // An L: the inner wall from (3, 3) to (3, 6); the room reaches both sides of its line.
    const ell = roomFromPoints([
      [0, 0],
      [6, 0],
      [6, 3],
      [3, 3],
      [3, 6],
      [0, 6],
    ]);
    const i = ell.points.findIndex(([x, z]) => x === 3 && z === 3);
    const j = ell.points.findIndex(([x, z]) => x === 3 && z === 6);
    const r = lineUpFromRoomCorners(ell, [i, j], [tap({ x: 3, z: 3 }), tap({ x: 3, z: 6 })], {
      from: [toWorld({ x: 3, z: 1.5 })],
    })!;
    expect(r.swapped).toBe(false);
    expect(lineUpFromRoomCorners(ell, [99, j], [tap(A), tap(B)])).toBeNull();
  });
});

describe('placing and moving the room by hand', () => {
  it('puts a room point on a world point, turned to a world direction', () => {
    const l = lineUpAt(
      { point: { x: 2.5, z: 2 }, direction: { x: 0, z: -1 } },
      { point: { x: 1, z: -3 }, direction: { x: 1, z: 0 } },
      -1.3,
    )!;
    expect(l.y).toBe(-1.3);
    const p = applyLineUp(l, { x: 2.5, z: 2 });
    expect(p.x).toBeCloseTo(1, 9);
    expect(p.z).toBeCloseTo(-3, 9);
    // Room -Z (toward the wall at z = 0) now points along world +X.
    const ahead = applyLineUp(l, { x: 2.5, z: 1 });
    expect(ahead.x - p.x).toBeCloseTo(1, 9);
    expect(ahead.z - p.z).toBeCloseTo(0, 9);
    expect(
      lineUpAt(
        { point: [0, 0], direction: { x: 0, z: 0 } },
        { point: { x: 0, z: 0 }, direction: { x: 1, z: 0 } },
        0,
      ),
    ).toBeNull();
  });

  it('shifts along the floor and turns about a pivot', () => {
    const moved = shiftLineUp(truth, { x: 0.5, z: -0.25 });
    expect(moved).toEqual({ ...truth, x: 2.5, z: -1.25 });
    const pivot = applyLineUp(truth, { x: 4, z: 0 });
    const turned = turnLineUp(truth, 90, pivot);
    expect(turned.rotationY).toBeCloseTo(120, 9);
    expect(turned.y).toBe(truth.y);
    // The corner at the pivot stays; the other end of the wall swings a quarter turn about it.
    const stay = applyLineUp(turned, { x: 4, z: 0 });
    expect(Math.hypot(stay.x - pivot.x, stay.z - pivot.z)).toBeLessThan(1e-9);
    const swung = applyLineUp(turned, A);
    expect(Math.hypot(swung.x - pivot.x, swung.z - pivot.z)).toBeCloseTo(4, 9);
    // Turning back undoes it.
    const back = turnLineUp(turned, -90, pivot);
    expect(back.rotationY).toBeCloseTo(30, 9);
    expect(back.x).toBeCloseTo(truth.x, 9);
    expect(back.z).toBeCloseTo(truth.z, 9);
  });
});

describe('lineUpFromPairs', () => {
  it('averages noisy taps of more corners', () => {
    const rand = mulberry32(7);
    const corners = rectangle(5, 4).map(([x, z]) => ({ x, z }));
    const pairs = corners.map((c) => {
      const w = toWorld(c);
      return {
        room: c,
        tapped: { x: w.x + gaussian(rand) * 0.02, y: -1.4, z: w.z + gaussian(rand) * 0.02 },
      };
    });
    const r = lineUpFromPairs(pairs)!;
    expect(r.rotationY).toBeCloseTo(30, 0);
    expect(Math.hypot(r.x - 2, r.z + 1)).toBeLessThan(0.05);
    expect(r.quality).toBe('good');
    expect(lineUpFromPairs(pairs.slice(0, 1))).toBeNull();
  });
});

describe('applying a line-up', () => {
  const r = lineUpFromCorners([A, B], [tap(A), tap(B)])!;

  it('carries room points to the AR world and back', () => {
    const p = { x: 1.3, z: 2.2 };
    const w = applyLineUp(r, p);
    expect(w.x).toBeCloseTo(toWorld(p).x, 9);
    expect(w.z).toBeCloseTo(toWorld(p).z, 9);
    const back = applyLineUpInverse(r, w);
    expect(back.x).toBeCloseTo(1.3, 9);
    expect(back.z).toBeCloseTo(2.2, 9);
    const inv = invertLineUp(r);
    const again = applyLineUp(inv, w);
    expect(again.x).toBeCloseTo(1.3, 9);
    expect(again.z).toBeCloseTo(2.2, 9);
    expect(inv.y).toBeCloseTo(1.4, 12);
  });

  it('turns furniture poses with the room', () => {
    const pose = { x: 1, z: 1, rotationY: 350 };
    const w = lineUpPose(r, pose);
    expect(w.rotationY).toBeCloseTo(20, 9);
    const back = lineUpPoseInverse(r, w);
    expect(back.x).toBeCloseTo(1, 9);
    expect(back.z).toBeCloseTo(1, 9);
    expect(back.rotationY).toBeCloseTo(350, 9);
  });

  it('suggests the ends of the longest wall as the corners to tap', () => {
    const room = roomFromPoints(rectangle(5, 3));
    const [i, j] = lineUpCorners(room)!;
    const a = room.points[i]!;
    const b = room.points[j]!;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBe(5);
  });
});
