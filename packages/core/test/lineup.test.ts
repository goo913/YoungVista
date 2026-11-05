import { describe, expect, it } from 'vitest';
import {
  applyLineUp,
  applyLineUpInverse,
  invertLineUp,
  lineUpCorners,
  lineUpFromCorners,
  lineUpFromPairs,
  lineUpPose,
  lineUpPoseInverse,
  roomFromPoints,
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
    expect(lineUpFromCorners([A, B], [tap(A, 1.1), tap(B, 1.1)])!.quality).toBe('poor');

    const near = { x: 1, z: 0 };
    const short = lineUpFromCorners([A, near], [tap(A), tap(near)])!;
    expect(short.issues).toEqual(['corners-too-close']);
    expect(short.quality).toBe('fair');
    const tiny = { x: 0.5, z: 0 };
    expect(lineUpFromCorners([A, tiny], [tap(A), tap(tiny)])!.quality).toBe('poor');
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
