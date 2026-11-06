import { DEFAULT_CEILING_HEIGHT, roomArea, wallLengths } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  createScanState,
  deriveScan,
  finishScan,
  markAtAim,
  setCamera,
  setOptions,
  setTracking,
  skipCeiling,
  undo,
  upsertPlane,
  type ScanState,
} from '@/scan/session';
import { planeFromViroAnchor } from '@/scan/viro-anchor';
import { floorAnchor, pose, uprightAnchor, type V3 } from './helpers';

/**
 * A 3.0 × 3.5 m room around the origin: walls at x = ±1.5 and z = ±1.75, the floor at y = 0,
 * the ceiling at 2.44 m. The phone is held 1.4 m up in the middle.
 */
const EYE: V3 = [0, 1.4, 0];
const CEILING = 2.44;
const W = 1.5;
const D = 1.75;

const plane = (anchor: unknown) => {
  const p = planeFromViroAnchor(anchor);
  if (!p) throw new Error('not a plane');
  return p;
};

const aim = (s: ScanState, target: V3, from: V3 = EYE) =>
  setCamera(s, pose(from, [target[0] - from[0], target[1] - from[1], target[2] - from[2]]));

/** Aims at `target` from `from` and taps Mark; fails the test if the mark is refused. */
function mark(s: ScanState, target: V3, from: V3 = EYE): ScanState {
  const r = markAtAim(aim(s, target, from), 1000);
  if (r.outcome.kind !== 'marked') throw new Error(`refused: ${r.outcome.message}`);
  return r.state;
}

const tryMark = (s: ScanState, target: V3, from: V3 = EYE) => markAtAim(aim(s, target, from), 1000);

/** Tracking works and the floor is found. */
const ready = (): ScanState =>
  upsertPlane(
    setTracking(aim(createScanState(), [0.5, 0, -1]), { state: 3, reason: 1 }),
    plane(floorAnchor('floor', 0, { size: 2.5 })),
  );

/** The first wall (north) marked twice at its bottom, and the ceiling measured. */
function withFirstWall(ceiling = CEILING): ScanState {
  let s = mark(ready(), [-1, 0, -D]);
  s = mark(s, [1, 0, -D]);
  return mark(s, [0.2, ceiling, -D]);
}

/** Every wall marked once: north (twice, first), then east and south at the top, west at the bottom. */
function rectangleScan(): ScanState {
  let s = withFirstWall();
  s = mark(s, [W, CEILING, 0.1]);
  s = mark(s, [-0.2, CEILING, D]);
  return mark(s, [-W, 0, 0.2]);
}

describe('the steps of a scan', () => {
  it('goes floor, first wall, second mark, ceiling, walls', () => {
    let s = setTracking(aim(createScanState(), [0, 0, -1]), { state: 3, reason: 1 });
    expect(deriveScan(s).step).toBe('floor');
    expect(tryMark(s, [0, 0, -D]).outcome).toMatchObject({ kind: 'error', error: 'no-floor' });
    s = upsertPlane(s, plane(floorAnchor('floor', 0)));
    expect(deriveScan(s).step).toBe('first-wall');
    expect(deriveScan(s).message.title).toBe('Mark the first wall');
    s = mark(s, [-1, 0, -D]);
    expect(deriveScan(s).step).toBe('second-mark');
    s = mark(s, [1, 0, -D]);
    const d = deriveScan(s);
    expect(d.step).toBe('ceiling');
    expect(d.axes?.u.x).toBeCloseTo(1, 9);
    expect(d.message.title).toBe('Now the top of that wall');
    s = mark(s, [0, CEILING, -D]);
    expect(deriveScan(s).step).toBe('walls');
    expect(deriveScan(s).message.detail).toMatch(/Aim at its bottom edge/);
  });

  it('shows coaching instead when tracking is poor', () => {
    const s = setTracking(ready(), { state: 2, reason: 2 });
    expect(deriveScan(s).message.title).toBe('Move slowly');
  });
});

describe('the first wall', () => {
  it('needs the dot on the floor, not on the wall or under the phone', () => {
    expect(tryMark(ready(), [0, 2, -D]).outcome).toMatchObject({ error: 'aim-lower' });
    expect(tryMark(ready(), [0.05, 0, -0.1]).outcome).toMatchObject({ error: 'under-phone' });
    expect(tryMark(ready(), [0, 0, -9]).outcome).toMatchObject({ error: 'too-far' });
  });

  it('needs the second mark at least 50 cm from the first', () => {
    const s = mark(ready(), [-0.2, 0, -D]);
    expect(tryMark(s, [0.2, 0, -D]).outcome).toMatchObject({ error: 'too-close-to-first' });
    expect(deriveScan(aim(s, [0.2, 0, -D])).aim).toMatchObject({
      ok: false,
      error: 'too-close-to-first',
    });
    expect(tryMark(s, [0.4, 0, -D]).outcome.kind).toBe('marked');
  });
});

describe('the ceiling', () => {
  it.each([2.44, 2.7])('measures a %s m ceiling at the top of the first wall', (h) => {
    const d = deriveScan(withFirstWall(h));
    expect(d.ceiling?.source).toBe('measured');
    expect(d.ceiling?.height).toBeCloseTo(h, 9);
  });

  it('shows the height live, and refuses the floor or another wall', () => {
    let s = mark(ready(), [-1, 0, -D]);
    s = mark(s, [1, 0, -D]);
    expect(deriveScan(aim(s, [0, 2.7, -D])).aim).toMatchObject({
      ok: true,
      ceilingHeight: expect.closeTo(2.7, 9),
    });
    expect(tryMark(s, [0, 0, -D]).outcome).toMatchObject({ error: 'aim-higher' });
    expect(tryMark(s, [W, CEILING, 0.1]).outcome).toMatchObject({ error: 'not-this-wall' });
  });

  it('can be skipped (8 ft), and Undo brings the step back', () => {
    let s = mark(ready(), [-1, 0, -D]);
    s = mark(s, [1, 0, -D]);
    s = skipCeiling(s);
    expect(deriveScan(s).ceiling).toEqual({ height: DEFAULT_CEILING_HEIGHT, source: 'default' });
    expect(deriveScan(s).step).toBe('walls');
    expect(deriveScan(undo(s)).step).toBe('ceiling');
  });

  it('uses a ceiling the phone found when it agrees with the mark', () => {
    let s = withFirstWall(2.44);
    s = upsertPlane(s, plane(floorAnchor('ceil', 2.452, { classification: 'Ceiling' })));
    expect(deriveScan(s).ceiling).toEqual({ height: expect.closeTo(2.452, 9), source: 'detected' });
    // Far from the mark: the mark wins.
    s = upsertPlane(s, plane(floorAnchor('ceil', 2.9, { classification: 'Ceiling' })));
    expect(deriveScan(s).ceiling?.source).toBe('measured');
  });
});

describe('the other walls', () => {
  it('marks the bottom edge below the horizon and the top edge above it, on the same line', () => {
    const s = withFirstWall();
    const bottom = deriveScan(aim(s, [W, 0, 0.3]));
    const top = deriveScan(aim(s, [W, CEILING, 0.3]));
    expect(bottom.aim).toMatchObject({
      ok: true,
      edge: 'floor',
      placement: { axis: 1, facing: -1 },
    });
    expect(top.aim).toMatchObject({
      ok: true,
      edge: 'ceiling',
      placement: { axis: 1, facing: -1 },
    });
    if (!bottom.aim.ok || !top.aim.ok) return;
    expect(bottom.aim.placement!.offset).toBeCloseTo(W, 9);
    expect(top.aim.placement!.offset).toBeCloseTo(W, 9);
    expect(bottom.aim.distance).toBeCloseTo(Math.hypot(W, 0.3), 9);
  });

  it('asks to face the wall when the dot is near a corner, and for an edge when level', () => {
    const s = withFirstWall();
    expect(tryMark(s, [1.3, 0, 1.4]).outcome).toMatchObject({ error: 'diagonal' });
    expect(tryMark(s, [W, 1.4, 0]).outcome).toMatchObject({ error: 'level' });
  });

  it('averages marks of the same wall', () => {
    let s = withFirstWall();
    s = mark(s, [W - 0.04, 0, 0.3]);
    const r = tryMark(s, [W + 0.04, CEILING, 0.3]);
    expect(r.outcome).toMatchObject({ kind: 'marked', joined: true });
    const walls = deriveScan(r.state).grouped!.walls;
    const east = walls.find((w) => w.axis === 1)!;
    expect(east.markIds).toHaveLength(2);
    expect(east.offset).toBeCloseTo(W, 9);
    expect(walls).toHaveLength(2);
  });
});

describe('closing the room', () => {
  it('closes by itself only when every wall fits: four walls of a rectangle', () => {
    let s = withFirstWall();
    s = mark(s, [W, CEILING, 0.1]);
    s = mark(s, [-0.2, CEILING, D]);
    expect(deriveScan(s).closed).toBe(false);
    expect(deriveScan(s).room).toMatchObject({ ok: false, error: 'too-few-walls' });
    s = mark(s, [-W, 0, 0.2]);
    const d = deriveScan(s);
    expect(d.closed).toBe(true);
    expect(d.message.title).toBe('The room is closed');
    const done = finishScan(s, d);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(roomArea(done.room)).toBeCloseTo(10.5, 9);
    expect(done.room.ceilingHeight).toBeCloseTo(CEILING, 9);
    expect(done.inferredWalls).toEqual([]);
    expect(done.leftOutMarks).toBe(0);
  });

  it('does not close while a mark disagrees; Done leaves it out; Undo removes it', () => {
    // The side of the bed, 0.9 m in front of the south wall, marked as a wall.
    const s = mark(rectangleScan(), [0.1, 0, D - 0.9]);
    const d = deriveScan(s);
    expect(d.closed).toBe(false);
    expect(d.room).toMatchObject({ ok: false, error: 'conflict' });
    expect(d.message.title).toBe('Two marks disagree');
    expect(d.walls.filter((w) => w.conflict)).toHaveLength(2);
    const done = finishScan(s, d);
    expect(done).toMatchObject({ ok: true, leftOutMarks: 1 });
    if (done.ok) expect(roomArea(done.room)).toBeCloseTo(10.5, 9);
    expect(deriveScan(undo(s)).closed).toBe(true);
  });

  it('explains why Done cannot finish yet', () => {
    expect(finishScan(ready())).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/first wall/),
    });
    const three = mark(mark(withFirstWall(), [W, 0, 0]), [0, 0, D]);
    expect(finishScan(three)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/four walls/),
    });
  });

  it('closes an L-shaped room', () => {
    // 5 × 4 m with a 2 × 2 m corner missing: x from 0 to 5, z from 0 to 4, no [3, 5] × [2, 4].
    const at: V3 = [1.5, 1.4, 1.5];
    let s = upsertPlane(
      setTracking(aim(createScanState(), [1.5, 0, 0.5], at), { state: 3, reason: 1 }),
      plane(floorAnchor('floor', 0, { x: 1.5, z: 1.5, size: 3 })),
    );
    s = mark(s, [0.5, 0, 0], at); // z = 0 wall, first
    s = mark(s, [2.6, 0, 0], at);
    s = mark(s, [1.5, CEILING, 0], at);
    s = mark(s, [5, 0, 1], [3.8, 1.4, 1]); // x = 5
    s = mark(s, [4, 0, 2], [4, 1.4, 0.8]); // z = 2, the step
    s = mark(s, [3, 0, 3], [1.5, 1.4, 3]); // x = 3, the inner wall
    s = mark(s, [1.5, CEILING, 4], [1.5, 1.4, 2.5]); // z = 4
    expect(deriveScan(s).closed).toBe(false);
    s = mark(s, [0, 0, 2], [1.5, 1.4, 2]); // x = 0
    const d = deriveScan(s);
    expect(d.closed).toBe(true);
    const done = finishScan(s, d);
    expect(done.ok && roomArea(done.room)).toBeCloseTo(16, 9);
    expect(done.ok && wallLengths(done.room).sort((p, q) => p - q)).toEqual(
      [2, 2, 2, 3, 4, 5].map((n) => expect.closeTo(n, 9)),
    );
  });
});

describe('Undo', () => {
  it('takes back marks one at a time, through every step', () => {
    const s = rectangleScan();
    expect(s.marks).toHaveLength(6);
    let u = undo(s);
    expect(u.marks).toHaveLength(5);
    expect(deriveScan(u).closed).toBe(false);
    u = undo(undo(undo(u)));
    expect(deriveScan(u).step).toBe('ceiling');
    u = undo(undo(u));
    expect(deriveScan(u).step).toBe('first-wall');
    expect(undo(u)).toBe(u);
  });
});

describe('detected planes', () => {
  /** Upright planes inside the room that are not walls. */
  const clutter = () => [
    // A laptop screen 0.5 m in front of the phone.
    uprightAnchor(
      'laptop',
      { x: -0.15, z: -0.5 },
      { x: 0.15, z: -0.5 },
      { bottom: 0.75, top: 0.97, toward: { x: 0, z: 0 } },
    ),
    // The side of the desk along the north wall, and a monitor on it.
    uprightAnchor(
      'desk',
      { x: 0.2, z: -1.15 },
      { x: 1.4, z: -1.15 },
      { bottom: 0, top: 0.74, toward: { x: 0, z: 0 } },
    ),
    uprightAnchor(
      'monitor',
      { x: 0.6, z: -1.5 },
      { x: 1.15, z: -1.5 },
      { bottom: 0.9, top: 1.25, toward: { x: 0, z: 0 } },
    ),
    // The real east wall, found for once (turned as iOS 16 does).
    uprightAnchor(
      'east',
      { x: W, z: -1.2 },
      { x: W, z: 1.2 },
      { bottom: 0, top: CEILING, toward: { x: 0, z: 0 }, twistDeg: 35 },
    ),
  ];

  it('make no walls by themselves', () => {
    const clean = deriveScan(rectangleScan());
    let s = rectangleScan();
    for (const a of clutter()) s = upsertPlane(s, plane(a));
    const d = deriveScan(s);
    expect(d.closed).toBe(true);
    expect(d.grouped!.walls).toEqual(clean.grouped!.walls);
    expect(d.planeWalls).toEqual([]);
  });

  it('with "Use detected walls (test)", only a real wall in line with the room joins', () => {
    let s = setOptions(withFirstWall(), { useDetectedWalls: true });
    for (const a of clutter()) s = upsertPlane(s, plane(a));
    const verdicts = Object.fromEntries(
      deriveScan(s).planeWalls.map((c) => [c.planeId, c.verdict]),
    );
    expect(verdicts).toEqual({
      laptop: 'narrow',
      desk: 'contradicts-mark',
      monitor: 'narrow',
      east: 'accepted',
    });
    // The east wall needs no mark now; the other two do.
    s = mark(s, [-0.2, CEILING, D]);
    s = mark(s, [-W, 0, 0.2]);
    const d = deriveScan(s);
    expect(d.closed).toBe(true);
    expect(d.walls.filter((w) => w.fromPlanes)).toHaveLength(1);
  });
});

describe('a floor found late', () => {
  it('moves the marks onto it', () => {
    // A tall person's phone, 1.6 m up: the bed (0.55 m) is taken for the floor at first.
    const eye: V3 = [0, 1.6, 0];
    let s = setTracking(aim(createScanState(), [0, 0, -1], eye), { state: 3, reason: 1 });
    s = upsertPlane(s, plane(floorAnchor('bed', 0.55, { x: 1, z: 1, size: 1.6 })));
    expect(s.floor?.planeId).toBe('bed');
    s = mark(s, [-1, 0, -D], eye);
    s = mark(s, [1, 0, -D], eye);
    const onBed = deriveScan(s).firstWall.a!;
    expect(onBed.z).toBeGreaterThan(-D + 0.4);
    s = upsertPlane(s, plane(floorAnchor('carpet', 0, { size: 2.5 })));
    const first = deriveScan(s).firstWall;
    expect(first.a!.z).toBeCloseTo(-D, 9);
    expect(first.b!.x).toBeCloseTo(1, 9);
  });
});
