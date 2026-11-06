import {
  applyLineUp,
  lineUpCorners,
  roomFromPoints,
  type CameraRay,
  type LineUp,
  type Room,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { cornerInfo, cornerPrompt } from '@/ar/corner-prompts';
import {
  activeLineUp,
  aimedStep,
  cancelLineUp,
  cornerPairs,
  createLineUp,
  currentPair,
  formatOffset,
  lineUpAgain,
  lineUpFromScan,
  lineUpMessage,
  qualityMessage,
  retryLineUp,
  tapCorner,
  tappedPoints,
  undoTap,
  otherCorners,
  type LineUpState,
} from '@/ar/lineup-state';
import { roomToWorld } from '@/ar/pose';

// A 5 × 4 m room: x from 0 to 5, z from 0 to 4, with a door near one end of a long wall.
const plain = roomFromPoints([
  [0, 0],
  [5, 0],
  [5, 4],
  [0, 4],
]);

function withOpenings(room: Room): Room {
  // Put a door 30 cm from the start of wall 0 and a window 40 cm before the end of wall 2.
  const walls = room.walls.map((w, i) => {
    const a = room.points[w.a]!;
    const b = room.points[w.b]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (i === 0) {
      return {
        ...w,
        openings: [{ id: 'd', type: 'door' as const, offset: 0.3, width: 0.8, height: 2, sill: 0 }],
      };
    }
    if (i === 2) {
      return {
        ...w,
        openings: [
          {
            id: 'w',
            type: 'window' as const,
            offset: length - 0.4 - 1,
            width: 1,
            height: 1.2,
            sill: 0.9,
          },
        ],
      };
    }
    return w;
  });
  return { ...room, walls };
}

// An L: 6 × 5 with the 3 × 2 corner at x > 3, z > 3 cut away.
const ell = roomFromPoints([
  [0, 0],
  [6, 0],
  [6, 3],
  [3, 3],
  [3, 5],
  [0, 5],
]);

/** Where the real room is in the AR session: turned 40°, moved, its floor 1.35 m below the phone. */
const truth: LineUp = { rotationY: 40, x: -1.2, y: -1.35, z: 0.7 };

/** A tap: the phone at `from` (room space, 1.35 m up) aiming at room point `p` on the floor. */
function tapAt(
  p: { x: number; z: number },
  from = { x: 2.5, z: 2 },
  error = { x: 0, z: 0 },
): CameraRay {
  const eye = roomToWorld(truth, from, 1.35);
  const target = roomToWorld(truth, { x: p.x + error.x, z: p.z + error.z });
  return {
    origin: eye,
    direction: [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]],
  };
}

const cornerPoint = (room: Room, i: number) => ({ x: room.points[i]![0], z: room.points[i]![1] });

function tapBoth(
  room: Room,
  state: LineUpState,
  errors = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ],
) {
  const [c1, c2] = currentPair(state);
  const one = tapCorner(state, room, tapAt(cornerPoint(room, c1), undefined, errors[0]), truth.y);
  expect(one.outcome.kind).toBe('next');
  return tapCorner(one.state, room, tapAt(cornerPoint(room, c2), undefined, errors[1]), truth.y);
}

describe('corner prompts', () => {
  it('names the corner by the door or the window', () => {
    const room = withOpenings(plain);
    const w0 = room.walls[0]!;
    const w2 = room.walls[2]!;
    expect(cornerInfo(room, w0.a).feature).toBe('door');
    expect(cornerInfo(room, w2.b).feature).toBe('window');
    expect(cornerInfo(room, w0.b).feature).toBeNull();
    const first = cornerPrompt(room, [w0.a, w0.b], 0, 'imperial');
    expect(first.title).toBe('Aim at the corner by the door');
    expect(first.label).toBe('Corner 1');
    const second = cornerPrompt(room, [w0.a, w0.b], 1, 'imperial');
    expect(second.title).toBe('Now the other end of that wall');
    expect(second.detail).toContain('16′ 5″ along the same wall');
    expect(cornerPrompt(room, [w2.a, w2.b], 1, 'metric').title).toBe(
      'Now the corner by the window',
    );
  });

  it('tells an inside corner of an L-shaped room', () => {
    const inside = ell.points.findIndex(([x, z]) => x === 3 && z === 3);
    expect(cornerInfo(ell, inside).inside).toBe(true);
    for (let i = 0; i < ell.points.length; i++) {
      if (i !== inside) expect(cornerInfo(ell, i).inside).toBe(false);
    }
    const wall = ell.walls.find((w) => w.a === inside)!;
    expect(cornerPrompt(ell, [wall.a, wall.b], 0, 'metric', false)).toMatchObject({
      title: 'Aim at the inside corner',
    });
    expect(cornerPrompt(ell, [wall.a, wall.b], 0, 'metric', false).detail).toContain(
      'the corner that juts into the room',
    );
  });

  it('falls back to the wall when nothing is by the corner', () => {
    const [a, b] = lineUpCorners(plain)!;
    const p = cornerPrompt(plain, [a, b], 0, 'metric');
    expect(p.title).toBe('Aim at corner 1');
    expect(p.detail).toContain('one end of the longest wall');
  });
});

describe('lining up from two corners', () => {
  it('asks for the ends of the longest wall first, then other walls', () => {
    const pairs = cornerPairs(ell);
    expect(pairs[0]).toEqual(lineUpCorners(ell));
    expect(pairs).toHaveLength(ell.walls.length);
    const len = ([a, b]: readonly [number, number]) =>
      Math.hypot(ell.points[b]![0] - ell.points[a]![0], ell.points[b]![1] - ell.points[a]![1]);
    expect(len(pairs[0]!)).toBe(6);
    expect(len(pairs[1]!)).toBeGreaterThanOrEqual(len(pairs[2]!));
  });

  it('finds where the room is from two good taps', () => {
    const s0 = createLineUp(plain)!;
    expect(aimedStep(s0)).toBe(0);
    const { state, outcome } = tapBoth(plain, s0);
    expect(outcome.kind).toBe('done');
    expect(state.phase.kind).toBe('done');
    const l = activeLineUp(state, plain, truth.y)!;
    expect(l.rotationY).toBeCloseTo(truth.rotationY, 6);
    expect(l.x).toBeCloseTo(truth.x, 6);
    expect(l.z).toBeCloseTo(truth.z, 6);
    expect(l.y).toBe(truth.y);
    // Every corner lands on the real one.
    for (const [x, z] of plain.points) {
      const got = applyLineUp(l, { x, z });
      const want = applyLineUp(truth, { x, z });
      expect(Math.hypot(got.x - want.x, got.z - want.z)).toBeLessThan(1e-6);
    }
  });

  it('says how far off it is in plain words', () => {
    // Each tap 2 cm outward along the wall: the taps are 4 cm too far apart, each corner 2 cm off.
    const [c1, c2] = currentPair(createLineUp(plain)!);
    const p1 = cornerPoint(plain, c1);
    const p2 = cornerPoint(plain, c2);
    const ux = (p2.x - p1.x) / 5;
    const uz = (p2.z - p1.z) / 5;
    const { outcome } = tapBoth(plain, createLineUp(plain)!, [
      { x: -ux * 0.02, z: -uz * 0.02 },
      { x: ux * 0.02, z: uz * 0.02 },
    ]);
    if (outcome.kind !== 'done') throw new Error('expected a line-up');
    expect(outcome.done.offset).toBeCloseTo(0.02, 6);
    expect(qualityMessage(outcome.done, 'metric').title).toBe('Lined up, 2 cm off');
    expect(qualityMessage(outcome.done, 'imperial').title).toBe('Lined up, 1 in off');
    expect(formatOffset(0.004, 'metric')).toBe('less than 1 cm');
  });

  it('asks again when the taps do not match the plan', () => {
    // The second tap 60 cm short of the corner: 12% off, poor.
    const [c1, c2] = currentPair(createLineUp(plain)!);
    const p1 = cornerPoint(plain, c1);
    const p2 = cornerPoint(plain, c2);
    const back = { x: ((p1.x - p2.x) / 5) * 0.6, z: ((p1.z - p2.z) / 5) * 0.6 };
    const { state, outcome } = tapBoth(plain, createLineUp(plain)!, [{ x: 0, z: 0 }, back]);
    expect(outcome.kind).toBe('poor');
    expect(state.phase.kind).toBe('poor');
    expect(activeLineUp(state, plain, truth.y)).toBeNull();
    const m = lineUpMessage(state, plain, 'metric');
    expect(m.title).toBe('That did not line up');
    expect(m.detail).toContain('5.00 m apart');
    expect(m.detail).toContain('4.40 m apart');
    const again = retryLineUp(state);
    expect(again.phase).toEqual({ kind: 'aiming', taps: [] });
  });

  it('refuses a second tap on the same corner, the floor under the phone, or no floor', () => {
    const s0 = createLineUp(plain)!;
    const [c1] = currentPair(s0);
    const one = tapCorner(s0, plain, tapAt(cornerPoint(plain, c1)), truth.y);
    const same = tapCorner(
      one.state,
      plain,
      tapAt({ x: cornerPoint(plain, c1).x + 0.1, z: cornerPoint(plain, c1).z }),
      truth.y,
    );
    expect(same.outcome).toMatchObject({ kind: 'refused', error: 'same-corner' });
    expect(same.state).toBe(one.state);
    const under = tapCorner(s0, plain, tapAt({ x: 2.55, z: 2 }), truth.y);
    expect(under.outcome).toMatchObject({ kind: 'refused', error: 'under-phone' });
    const up: CameraRay = { origin: [0, 0, 0], direction: [0, 1, -1] };
    expect(tapCorner(s0, plain, up, truth.y).outcome).toMatchObject({ error: 'aim-lower' });
    expect(tapCorner(s0, plain, tapAt(cornerPoint(plain, c1)), null).outcome).toMatchObject({
      error: 'no-floor',
    });
  });

  it('undoes the first tap, uses other corners, and marks the taps', () => {
    const s0 = createLineUp(plain)!;
    const [c1] = currentPair(s0);
    const one = tapCorner(s0, plain, tapAt(cornerPoint(plain, c1)), truth.y).state;
    expect(aimedStep(one)).toBe(1);
    const marked = tappedPoints(one, truth.y);
    expect(marked).toHaveLength(1);
    const want = applyLineUp(truth, cornerPoint(plain, c1));
    expect(marked[0]!.x).toBeCloseTo(want.x, 6);
    expect(undoTap(one).phase).toEqual({ kind: 'aiming', taps: [] });
    const other = otherCorners(one);
    expect(other.pair).toBe(1);
    expect(other.phase).toEqual({ kind: 'aiming', taps: [] });
    // The other pair lines up just as well.
    expect(tapBoth(plain, other).outcome.kind).toBe('done');
  });

  it('lines up again after drift, and Cancel brings the old line-up back', () => {
    const done = tapBoth(plain, createLineUp(plain)!).state;
    const again = lineUpAgain(done);
    expect(again.phase.kind).toBe('aiming');
    expect(activeLineUp(again, plain, truth.y)).toBeNull();
    const back = cancelLineUp(again);
    expect(back.phase).toEqual(done.phase);
    // A new line-up replaces the old one for good.
    const redone = tapBoth(plain, again).state;
    expect(redone.previous).toBeNull();
    expect(cancelLineUp(redone)).toBe(redone);
  });

  it('follows the floor when the phone finds it a little lower', () => {
    const done = tapBoth(plain, createLineUp(plain)!).state;
    const lower = activeLineUp(done, plain, truth.y - 0.03)!;
    expect(lower.y).toBeCloseTo(truth.y - 0.03);
    // The taps' rays meet the lower floor a little further out: the room stays about put.
    expect(Math.hypot(lower.x - truth.x, lower.z - truth.z)).toBeLessThan(0.1);
  });
});

describe('right after a scan', () => {
  it('starts lined up, with the floor from the session', () => {
    const s = lineUpFromScan(plain, 0);
    expect(s.phase.kind).toBe('done');
    expect(activeLineUp(s, plain, -1.31)).toEqual({ rotationY: 0, x: 0, y: -1.31, z: 0 });
    if (s.phase.kind !== 'done') throw new Error('expected done');
    expect(qualityMessage(s.phase.done, 'metric').title).toBe('Lined up from the scan');
    const resized = lineUpFromScan(plain, 0.05);
    if (resized.phase.kind !== 'done') throw new Error('expected done');
    expect(qualityMessage(resized.phase.done, 'metric').title).toBe(
      'Lined up from the scan, up to 5 cm off',
    );
    // The corner taps are there for when things drift.
    expect(lineUpAgain(s).phase).toEqual({ kind: 'aiming', taps: [] });
  });
});
