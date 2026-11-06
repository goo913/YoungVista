/**
 * Whole scans, simulated: a person in a room aims the phone and taps Mark, and ScanController gets
 * the events ViroReact would send. "Realistic" noise: every aim off by up to 0.5° in any
 * direction, the floor reported up to 2 cm off, the phone held 1.25 to 1.55 m up (a new height
 * for every mark), and the person standing up to 25 cm from the middle of the room.
 *
 * A floor that is reported off acts like a scale error (everything, the ceiling too, comes out
 * δ/H bigger or smaller), which nothing in the scan can detect: that is what the tape-measure
 * check on the review screen is for.
 */
import {
  describeRoomSize,
  ensureCounterClockwise,
  roomArea,
  wallLengths,
  type Point,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { mulberry32, uprightAnchor } from './helpers';
import {
  QUIET,
  REALISTIC,
  SimScan,
  rotatedRectangle,
  sortedLengths,
  wallOffsetErrors,
  type SimNoise,
} from './sim';

type Edge = 'floor' | 'ceiling';

const quantile = (xs: number[], q: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;

/**
 * The owner's bedroom: 3.0 × 3.5 m, somewhere in ARKit's world, at any angle. From the middle of
 * the room: the door wall twice at its bottom (between the doors), its top for the ceiling, then
 * the bed wall and the desk wall at their top edges (furniture hides their bottoms) and the last
 * wall at its bottom.
 */
function ownersRoom(seed: number, noise: SimNoise, ceiling = 2.44) {
  const r = mulberry32(seed * 7919);
  const room = {
    outline: rotatedRectangle(3.0, 3.5, (r() * 2 - 1) * 2, (r() * 2 - 1) * 2, r() * 360),
    ceiling,
    floorY: -1.4 + (r() * 0.2 - 0.1),
  };
  const sim = new SimScan(room, noise, seed);
  const middle = sim.middle();
  sim.start(middle);
  const spot = () => sim.jitter(middle, noise === QUIET ? 0 : 0.25);
  const edges: Edge[] = ['ceiling', 'ceiling', 'floor'];
  const outcomes = [
    sim.mark(spot(), sim.edgePoint(0, 0.2, 'floor')),
    sim.mark(spot(), sim.edgePoint(0, 0.8, 'floor')),
    sim.mark(spot(), sim.edgePoint(0, 0.5, 'ceiling')),
    ...edges.map((edge, k) => sim.mark(spot(), sim.edgePoint(k + 1, 0.5, edge))),
  ];
  return { sim, room, outcomes, edges };
}

describe("the owner's room (3.0 × 3.5 m)", () => {
  it('comes out exact without noise, and closes by itself', () => {
    for (const seed of [1, 2, 3]) {
      const { sim, room, outcomes } = ownersRoom(seed, QUIET);
      expect(outcomes.every((o) => o.kind === 'marked')).toBe(true);
      const d = sim.controller.getSnapshot().derived;
      expect(d.closed).toBe(true);
      const done = sim.controller.finish();
      expect(done.ok).toBe(true);
      if (!done.ok) continue;
      expect(Math.max(...wallOffsetErrors(done.room, room.outline))).toBeLessThan(1e-6);
      expect(roomArea(done.room)).toBeCloseTo(10.5, 6);
      expect(done.room.ceilingHeight).toBeCloseTo(2.44, 6);
      expect(describeRoomSize(done.room, 'imperial')).toBe('9′ 10″ × 11′ 6″');
    }
  });

  it('is within 5 cm per wall with realistic noise (95% of walls), and the area within 5%', () => {
    const bottom: number[] = [];
    const top: number[] = [];
    const lengths: number[] = [];
    const areas: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { sim, room, outcomes, edges } = ownersRoom(seed, REALISTIC);
      expect(outcomes.every((o) => o.kind === 'marked')).toBe(true);
      expect(sim.controller.getSnapshot().derived.closed).toBe(true);
      const done = sim.controller.finish();
      if (!done.ok) throw new Error(done.reason);
      const errors = wallOffsetErrors(done.room, room.outline);
      // Wall 0 was marked at its bottom; walls 1..3 as in `edges`.
      errors.forEach((e, k) => (k === 0 || edges[k - 1] === 'floor' ? bottom : top).push(e));
      const truth = [3, 3, 3.5, 3.5];
      lengths.push(...sortedLengths(done.room).map((l, i) => Math.abs(l - truth[i]!)));
      areas.push(Math.abs(roomArea(done.room) - 10.5) / 10.5);
    }
    const all = [...bottom, ...top];
    expect(quantile(all, 0.95)).toBeLessThanOrEqual(0.05);
    expect(Math.max(...bottom)).toBeLessThanOrEqual(0.07);
    // Top edges also carry the error of the one ceiling measurement.
    expect(Math.max(...top)).toBeLessThanOrEqual(0.12);
    expect(quantile(areas, 0.95)).toBeLessThanOrEqual(0.05);
    expect(quantile(lengths, 0.5)).toBeLessThanOrEqual(0.04);
  });

  it('ignores the laptop, the desk and the monitors', () => {
    for (const seed of [4, 5]) {
      const clean = ownersRoom(seed, REALISTIC);
      const cluttered = ownersRoom(seed, REALISTIC);
      const { sim } = cluttered;
      const c = sim.controller;
      const mid = sim.middle();
      const toward = mid;
      // In front of the desk wall (wall 2): its side, two monitors on it, and a laptop near the phone.
      const p = (k: number, s: number, inward: number) => sim.standBefore(k, s, inward);
      c.onAnchorFound(
        uprightAnchor('desk', p(2, 0.05, 0.6), p(2, 0.45, 0.6), {
          bottom: sim.room.floorY,
          top: sim.room.floorY + 0.74,
          toward,
        }),
      );
      c.onAnchorFound(
        uprightAnchor('monitor1', p(2, 0.1, 0.3), p(2, 0.27, 0.3), {
          bottom: sim.room.floorY + 0.9,
          top: sim.room.floorY + 1.25,
          toward,
        }),
      );
      c.onAnchorFound(
        uprightAnchor('monitor2', p(2, 0.3, 0.32), p(2, 0.45, 0.32), {
          bottom: sim.room.floorY + 0.9,
          top: sim.room.floorY + 1.3,
          toward,
        }),
      );
      c.onAnchorFound(
        uprightAnchor(
          'laptop',
          { x: mid.x - 0.15, z: mid.z + 0.5 },
          { x: mid.x + 0.15, z: mid.z + 0.5 },
          { bottom: sim.room.floorY + 0.75, top: sim.room.floorY + 0.97, toward },
        ),
      );
      c.flush();
      const a = clean.sim.controller.finish();
      const b = c.finish();
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) expect(b.room.points).toEqual(a.room.points);
    }
  });

  it.each([2.44, 2.7])('measures a %s m ceiling within 3 cm', (h) => {
    const errors: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const { sim } = ownersRoom(seed, { ...REALISTIC, floorError: 0 }, h);
      errors.push(Math.abs(sim.controller.getSnapshot().derived.ceiling!.height - h));
    }
    expect(quantile(errors, 0.95)).toBeLessThanOrEqual(0.03);
  });
});

describe('bad marks', () => {
  it('a mark on the side of the bed stops the room closing; Done leaves it out; Undo removes it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { sim, room } = ownersRoom(seed, REALISTIC);
      // The bed along wall 1: its side is 0.9 m in front of the wall.
      const bed = sim.standBefore(1, 0.5, 0.9);
      const at = sim.standBefore(1, 0.5, 1.6);
      expect(sim.mark(at, [bed.x, room.floorY, bed.z]).kind).toBe('marked');
      const d = sim.controller.getSnapshot().derived;
      expect(d.closed).toBe(false);
      expect(d.walls.some((w) => w.conflict)).toBe(true);
      const done = sim.controller.finish();
      expect(done.ok && done.leftOutMarks).toBe(1);
      if (done.ok)
        expect(Math.max(...wallOffsetErrors(done.room, room.outline))).toBeLessThan(0.12);
      sim.controller.undo();
      expect(sim.controller.getSnapshot().derived.closed).toBe(true);
    }
  });

  it('a second, sloppier mark of the same wall is averaged in', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { sim, room } = ownersRoom(seed, REALISTIC);
      const before = sim.controller.finish();
      // Facing the last wall, 1.5° off.
      const outcome = sim.mark(sim.standBefore(3, 0.4, 1.5), sim.edgePoint(3, 0.4, 'floor'), 1.5);
      expect(outcome).toMatchObject({ kind: 'marked', joined: true });
      const after = sim.controller.finish();
      expect(before.ok && after.ok).toBe(true);
      if (after.ok) {
        expect(after.wallCount).toBe(4);
        expect(Math.max(...wallOffsetErrors(after.room, room.outline))).toBeLessThan(0.12);
      }
    }
  });
});

describe('an L-shaped room', () => {
  // 5 × 4 m with a 2 × 2 m corner cut out, somewhere in the world at an angle.
  const L: Point[] = [
    [0, 0],
    [5, 0],
    [5, 2],
    [3, 2],
    [3, 4],
    [0, 4],
  ];

  function scanL(seed: number, noise: SimNoise) {
    const r = mulberry32(seed * 104729);
    const yaw = (r() * 360 * Math.PI) / 180;
    const [ox, oz] = [(r() * 2 - 1) * 2, (r() * 2 - 1) * 2];
    const place = ([x, z]: Point): Point => [
      ox + x * Math.cos(yaw) - z * Math.sin(yaw),
      oz + x * Math.sin(yaw) + z * Math.cos(yaw),
    ];
    const outline = ensureCounterClockwise(L.map(place));
    const sim = new SimScan({ outline, ceiling: 2.5, floorY: -1.4 }, noise, seed);
    // Walls in the outline's order; each marked by someone standing 1.4 m in front of it.
    const k0 = 0;
    sim.start(sim.standBefore(k0, 0.5, 1.4));
    sim.mark(sim.standBefore(k0, 0.5, 1.4), sim.edgePoint(k0, 0.2, 'floor'));
    sim.mark(sim.standBefore(k0, 0.5, 1.4), sim.edgePoint(k0, 0.8, 'floor'));
    sim.mark(sim.standBefore(k0, 0.5, 1.4), sim.edgePoint(k0, 0.5, 'ceiling'));
    const outcomes = [1, 2, 3, 4, 5].map((k) =>
      sim.mark(sim.standBefore(k, 0.5, 0.9), sim.edgePoint(k, 0.5, k % 2 ? 'floor' : 'ceiling')),
    );
    return { sim, outline, outcomes };
  }

  it('closes and comes out right, with realistic noise', () => {
    const errors: number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const { sim, outline, outcomes } = scanL(seed, REALISTIC);
      expect(outcomes.every((o) => o.kind === 'marked')).toBe(true);
      expect(sim.controller.getSnapshot().derived.closed).toBe(true);
      const done = sim.controller.finish();
      if (!done.ok) throw new Error(done.reason);
      expect(done.room.points).toHaveLength(6);
      errors.push(...wallOffsetErrors(done.room, outline));
      expect(roomArea(done.room)).toBeGreaterThan(16 * 0.95);
      expect(roomArea(done.room)).toBeLessThan(16 * 1.05);
    }
    expect(quantile(errors, 0.95)).toBeLessThanOrEqual(0.05);
  });

  it('is exact without noise', () => {
    const { sim, outline } = scanL(3, QUIET);
    const done = sim.controller.finish();
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(Math.max(...wallOffsetErrors(done.room, outline))).toBeLessThan(1e-6);
    expect(wallLengths(done.room).sort((a, b) => a - b)).toEqual(
      [2, 2, 2, 3, 4, 5].map((n) => expect.closeTo(n, 6)),
    );
  });
});
