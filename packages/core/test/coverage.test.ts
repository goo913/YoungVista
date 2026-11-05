import { describe, expect, it } from 'vitest';
import { angleAboveDeg, coverage, type WallObservation } from '../src';
import { edgesOf, lShape, rectangle, wallObservations } from './helpers';

const rect = rectangle(4, 3);
const center = { x: 2, z: 1.5 };

describe('coverage', () => {
  it('reports nothing for no observations', () => {
    const c = coverage([]);
    expect(c.fraction).toBe(0);
    expect(c.wallCount).toBe(0);
    expect(c.closed).toBe(false);
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0]!.sizeDeg).toBe(360);
  });

  it('is complete and closed when every wall was seen end to end', () => {
    const c = coverage(wallObservations(rect), { center });
    expect(c.fraction).toBeCloseTo(1, 9);
    expect(c.coveredDeg).toBeCloseTo(360, 6);
    expect(c.wallCount).toBe(4);
    expect(c.closed).toBe(true);
    expect(c.gaps).toEqual([]);
  });

  it('is closed when the corners were not seen but the walls meet', () => {
    const c = coverage(wallObservations(rect, 0.25, 0.75), { center });
    expect(c.fraction).toBeGreaterThan(0.4);
    expect(c.fraction).toBeLessThan(0.9);
    expect(c.gaps).toHaveLength(4);
    expect(c.gaps.every((g) => g.bridged)).toBe(true);
    expect(c.closed).toBe(true);
  });

  it('is not closed with two walls, and shows where to look next', () => {
    const c = coverage(wallObservations(rect, 0, 1, [2, 3]), { center });
    expect(c.wallCount).toBe(2);
    expect(c.closed).toBe(false);
    expect(c.fraction).toBeGreaterThan(0.3);
    expect(c.fraction).toBeLessThan(0.7);
    const largest = c.gaps[0]!;
    expect(largest.bridged).toBe(false);
    expect(largest.sizeDeg).toBeGreaterThan(150);
  });

  it('is not closed when a wall is missing, and the largest gap points at it', () => {
    const missing = 1;
    const c = coverage(wallObservations(rect, 0, 1, [missing]), { center });
    expect(c.wallCount).toBe(3);
    expect(c.closed).toBe(false);
    const e = edgesOf(rect)[missing]!;
    const toWall = angleAboveDeg({
      x: (e.a.x + e.b.x) / 2 - center.x,
      z: (e.a.z + e.b.z) / 2 - center.z,
    });
    const largest = c.gaps[0]!;
    expect(largest.bridged).toBe(false);
    const diff = Math.abs(((largest.centerDeg - toWall + 540) % 360) - 180);
    expect(diff).toBeLessThan(1);
  });

  it('treats a doorway in a wall as closed', () => {
    const observations: WallObservation[] = wallObservations(rect, 0.1, 0.9, [0]);
    const e = edgesOf(rect)[0]!;
    const at = (t: number) => ({ x: e.a.x + (e.b.x - e.a.x) * t, z: e.a.z + (e.b.z - e.a.z) * t });
    observations.push(
      { id: 'left', source: 'plane', a: at(0.05), b: at(0.35) },
      { id: 'right', source: 'plane', a: at(0.6), b: at(0.95) },
    );
    const c = coverage(observations, { center });
    expect(c.closed).toBe(true);
    expect(c.wallCount).toBe(4);
  });

  it('does not count a wall split by a doorway twice', () => {
    // Two walls of a corner, one of them seen in two pieces: still not a room.
    const [first, second] = edgesOf(rect);
    const at = (e: typeof first, t: number) => ({
      x: e!.a.x + (e!.b.x - e!.a.x) * t,
      z: e!.a.z + (e!.b.z - e!.a.z) * t,
    });
    const c = coverage(
      [
        { id: 'a', source: 'plane', a: at(first, 0.05), b: at(first, 0.95) },
        { id: 'b1', source: 'plane', a: at(second, 0.05), b: at(second, 0.3) },
        { id: 'b2', source: 'plane', a: at(second, 0.6), b: at(second, 0.95) },
      ],
      { center },
    );
    expect(c.wallCount).toBe(2);
    expect(c.closed).toBe(false);
  });

  it('works from the centre of the wall midpoints when no centre is given', () => {
    const c = coverage(wallObservations(rect, 0.1, 0.9));
    expect(c.center.x).toBeCloseTo(2, 9);
    expect(c.center.z).toBeCloseTo(1.5, 9);
    expect(c.closed).toBe(true);
  });

  it('finds a centre that sees every wall of an L-shaped room by itself', () => {
    const c = coverage(wallObservations(lShape, 0.1, 0.9));
    expect(c.closed).toBe(true);
    expect(c.center.x).toBeLessThan(3);
    expect(c.center.z).toBeLessThan(3);
  });

  it('handles an L-shaped room seen from inside', () => {
    const c = coverage(wallObservations(lShape, 0.1, 0.9), { center: { x: 1.5, z: 1.5 } });
    expect(c.wallCount).toBe(6);
    expect(c.closed).toBe(true);
  });
});
