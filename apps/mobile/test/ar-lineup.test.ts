import {
  applyLineUp,
  lineUpCorners,
  roomCenter,
  roomFromPoints,
  type CameraRay,
  type LineUp,
  type Room,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  cornerInfo,
  cornerPrompt,
  facingOrder,
  facingWall,
  wallFeatures,
} from '@/ar/corner-prompts';
import {
  activeLineUp,
  aimedStep,
  cancelLineUp,
  cornerPairs,
  createLineUp,
  currentPair,
  differenceMessage,
  formatOffset,
  lineUpAgain,
  lineUpFromScan,
  lineUpMessage,
  moveRoom,
  otherCorners,
  placeByHand,
  poorMessage,
  qualityMessage,
  retryLineUp,
  spanFromFirst,
  tapCorner,
  tappedPoints,
  undoTap,
  type LineUpState,
} from '@/ar/lineup-state';
import { roomToWorld } from '@/ar/pose';

// A 5 × 4 m room: x from 0 to 5, z from 0 to 4.
const plain = roomFromPoints([
  [0, 0],
  [5, 0],
  [5, 4],
  [0, 4],
]);

/** The index of the corner at (x, z). */
const at = (room: Room, x: number, z: number) =>
  room.points.findIndex(([px, pz]) => px === x && pz === z);

/** The wall from corner (ax, az) to (bx, bz), either way round. */
const wallBetween = (room: Room, a: [number, number], b: [number, number]) => {
  const i = at(room, ...a);
  const j = at(room, ...b);
  return room.walls.find((w) => (w.a === i && w.b === j) || (w.a === j && w.b === i))!;
};

function withOpenings(room: Room): Room {
  // A door 30 cm from (0, 0) on the wall at z = 0, two windows on the wall at z = 4.
  const door = wallBetween(room, [0, 0], [5, 0]);
  const back = wallBetween(room, [5, 4], [0, 4]);
  const walls = room.walls.map((w) => {
    if (w === door) {
      const fromStart = room.points[w.a]![0] === 0;
      return {
        ...w,
        openings: [
          {
            id: 'd',
            type: 'door' as const,
            offset: fromStart ? 0.3 : 5 - 0.3 - 0.8,
            width: 0.8,
            height: 2,
            sill: 0,
          },
        ],
      };
    }
    if (w === back) {
      return {
        ...w,
        openings: [
          { id: 'w1', type: 'window' as const, offset: 1.5, width: 0.8, height: 1.2, sill: 0.9 },
          { id: 'w2', type: 'window' as const, offset: 2.8, width: 0.8, height: 1.2, sill: 0.9 },
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

/** Taps the two corners asked for (or the other way round), with an optional error at each. */
function tapBoth(
  room: Room,
  state: LineUpState,
  errors = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ],
  swap = false,
) {
  const [c1, c2] = swap ? [...currentPair(state)].reverse() : currentPair(state);
  const one = tapCorner(state, room, tapAt(cornerPoint(room, c1!), undefined, errors[0]), truth.y);
  expect(one.outcome.kind).toBe('next');
  return tapCorner(one.state, room, tapAt(cornerPoint(room, c2!), undefined, errors[1]), truth.y);
}

/** How far every corner of the room lands from the real one with `l`. */
const worstCorner = (room: Room, l: LineUp) =>
  Math.max(
    ...room.points.map(([x, z]) => {
      const got = applyLineUp(l, { x, z });
      const want = applyLineUp(truth, { x, z });
      return Math.hypot(got.x - want.x, got.z - want.z);
    }),
  );

describe('corner prompts', () => {
  it('orders a wall as its left and right end, seen from inside the room facing it', () => {
    const o = at(plain, 0, 0);
    const x = at(plain, 5, 0);
    // Standing in the room facing the wall at z = 0 (toward -Z), +X is to the right.
    expect(facingOrder(plain, [x, o])).toEqual([o, x]);
    expect(facingOrder(plain, [o, x])).toEqual([o, x]);
    const wall = facingWall(plain, [o, x])!;
    expect(wall.facing.x).toBeCloseTo(0, 9);
    expect(wall.facing.z).toBeCloseTo(-1, 9);
    expect(wall.stand.z).toBeGreaterThan(0);
    // The wall at z = 4, faced toward +Z: +X is to the left now.
    const a = at(plain, 0, 4);
    const b = at(plain, 5, 4);
    expect(facingOrder(plain, [a, b])).toEqual([b, a]);
  });

  it('says which end of which wall, and what is on the wall and by the corner', () => {
    const room = withOpenings(plain);
    const pair = facingOrder(room, [at(room, 0, 0), at(room, 5, 0)]);
    expect(cornerInfo(room, pair[0]).feature).toBe('door');
    expect(cornerInfo(room, pair[1]).feature).toBeNull();
    expect(wallFeatures(room, pair)).toBe('a door');
    const first = cornerPrompt(room, pair, 0, 'imperial');
    expect(first.title).toBe('Corner 1: the left end of the longest wall, by the door');
    expect(first.detail).toContain('facing the longest wall (the one with a door)');
    expect(first.label).toBe('Corner 1');
    const second = cornerPrompt(room, pair, 1, 'imperial');
    expect(second.title).toBe('Corner 2: the right end of that wall');
    expect(second.detail).toContain('16′ 5″ from corner 1');
    const back = facingOrder(room, [at(room, 0, 4), at(room, 5, 4)]);
    expect(wallFeatures(room, back)).toBe('2 windows');
    expect(cornerPrompt(room, back, 0, 'metric', false).title).toBe(
      'Corner 1: the left end of the 5.00 m wall',
    );
  });

  it('tells an inside corner of an L-shaped room', () => {
    const inside = at(ell, 3, 3);
    expect(cornerInfo(ell, inside).inside).toBe(true);
    for (let i = 0; i < ell.points.length; i++) {
      if (i !== inside) expect(cornerInfo(ell, i).inside).toBe(false);
    }
    const pair = facingOrder(ell, [inside, at(ell, 3, 5)]);
    const step = pair[0] === inside ? 0 : 1;
    expect(cornerPrompt(ell, pair, step, 'metric', false).detail).toContain(
      'the corner that juts into the room',
    );
  });

  it('falls back to the wall when nothing is by the corner', () => {
    const pair = facingOrder(plain, lineUpCorners(plain)!);
    const p = cornerPrompt(plain, pair, 0, 'metric');
    expect(p.title).toBe('Corner 1: the left end of the longest wall');
    expect(p.detail).toContain('Stand in the room facing the longest wall.');
  });
});

describe('lining up from two corners', () => {
  it('asks for the ends of the longest wall first, then other walls, each left to right', () => {
    const pairs = cornerPairs(ell);
    const len = ([a, b]: readonly [number, number]) =>
      Math.hypot(ell.points[b]![0] - ell.points[a]![0], ell.points[b]![1] - ell.points[a]![1]);
    expect(len(pairs[0]!)).toBe(6);
    expect(pairs).toHaveLength(ell.walls.length);
    expect(len(pairs[1]!)).toBeGreaterThanOrEqual(len(pairs[2]!));
    for (const pair of pairs) expect(facingOrder(ell, pair)).toEqual(pair);
  });

  it('finds where the room is from two good taps', () => {
    const s0 = createLineUp(plain)!;
    expect(aimedStep(s0)).toBe(0);
    const { state, outcome } = tapBoth(plain, s0);
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') throw new Error('expected a line-up');
    expect(outcome.done.quality).toBe('good');
    expect(outcome.done.swapped).toBe(false);
    const l = activeLineUp(state, plain, truth.y)!;
    expect(l.rotationY).toBeCloseTo(truth.rotationY, 6);
    expect(l.x).toBeCloseTo(truth.x, 6);
    expect(l.z).toBeCloseTo(truth.z, 6);
    expect(l.y).toBe(truth.y);
    expect(worstCorner(plain, l)).toBeLessThan(1e-6);
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

  it('never refuses taps that do not match the plan: it lines up and says how they differ', () => {
    // The second tap 60 cm short of its corner: 12% off, which used to be refused.
    const [c1, c2] = currentPair(createLineUp(plain)!);
    const p1 = cornerPoint(plain, c1);
    const p2 = cornerPoint(plain, c2);
    const back = { x: ((p1.x - p2.x) / 5) * 0.6, z: ((p1.z - p2.z) / 5) * 0.6 };
    const { state, outcome } = tapBoth(plain, createLineUp(plain)!, [{ x: 0, z: 0 }, back]);
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') throw new Error('expected a line-up');
    expect(outcome.done.quality).toBe('rough');
    // Turned right, and the difference spread over both corners: 30 cm at each.
    const l = activeLineUp(state, plain, truth.y)!;
    expect(l.rotationY).toBeCloseTo(truth.rotationY, 6);
    expect(outcome.done.offset).toBeCloseTo(0.3, 6);
    const m = qualityMessage(outcome.done, 'metric');
    expect(m.title).toBe('Lined up. The saved room is about 60 cm longer here.');
    expect(m.detail).toContain('Your corners were 4.40 m apart; on the plan they are 5.00 m.');
    expect(m.detail).toContain('Move the room');
    // A real wall longer than the saved one says "shorter".
    const out = { x: -back.x / 2, z: -back.z / 2 };
    const longer = tapBoth(plain, createLineUp(plain)!, [{ x: 0, z: 0 }, out]);
    if (longer.outcome.kind !== 'done' || !longer.outcome.done.result) throw new Error('expected');
    expect(differenceMessage(longer.outcome.done.result, 'imperial')).toBe(
      'The saved room is about 12 in shorter here',
    );
  });

  it('takes the corners tapped the other way round', () => {
    const s0 = createLineUp(plain)!;
    const { state, outcome } = tapBoth(plain, s0, undefined, true);
    expect(outcome.kind).toBe('done');
    if (outcome.kind !== 'done') throw new Error('expected a line-up');
    expect(outcome.done.swapped).toBe(true);
    expect(outcome.done.corners).toEqual([currentPair(s0)[1], currentPair(s0)[0]]);
    const l = activeLineUp(state, plain, truth.y)!;
    expect(worstCorner(plain, l)).toBeLessThan(1e-6);
    expect(qualityMessage(outcome.done, 'metric').detail).toContain('the other way round');
    // Following the floor keeps the order that was worked out.
    expect(worstCorner(plain, activeLineUp(state, plain, truth.y - 0.01)!)).toBeLessThan(0.05);
  });

  it('refuses only a second tap too close to the first, the floor under the phone, or no floor', () => {
    const s0 = createLineUp(plain)!;
    const [c1] = currentPair(s0);
    const one = tapCorner(s0, plain, tapAt(cornerPoint(plain, c1)), truth.y);
    const near = cornerPoint(plain, c1);
    const same = tapCorner(
      one.state,
      plain,
      tapAt({ x: near.x === 0 ? 0.4 : near.x - 0.4, z: near.z }),
      truth.y,
    );
    expect(same.outcome).toMatchObject({ kind: 'refused', error: 'same-corner' });
    expect(same.state).toBe(one.state);
    // Half a metre apart is enough.
    const half = tapCorner(
      one.state,
      plain,
      tapAt({ x: near.x === 0 ? 0.55 : near.x - 0.55, z: near.z }),
      truth.y,
    );
    expect(half.outcome.kind).toBe('done');
    const under = tapCorner(s0, plain, tapAt({ x: 2.55, z: 2 }), truth.y);
    expect(under.outcome).toMatchObject({ kind: 'refused', error: 'under-phone' });
    const up: CameraRay = { origin: [0, 0, 0], direction: [0, 1, -1] };
    expect(tapCorner(s0, plain, up, truth.y).outcome).toMatchObject({ error: 'aim-lower' });
    expect(tapCorner(s0, plain, tapAt(cornerPoint(plain, c1)), null).outcome).toMatchObject({
      error: 'no-floor',
    });
  });

  it('undoes the first tap, uses other corners, marks the taps and the span to corner 2', () => {
    const s0 = createLineUp(plain)!;
    const [c1, c2] = currentPair(s0);
    const one = tapCorner(s0, plain, tapAt(cornerPoint(plain, c1)), truth.y).state;
    expect(aimedStep(one)).toBe(1);
    const marked = tappedPoints(one, truth.y);
    expect(marked).toHaveLength(1);
    const want = applyLineUp(truth, cornerPoint(plain, c1));
    expect(marked[0]!.x).toBeCloseTo(want.x, 6);
    // Aiming at corner 2: 5 m from corner 1's tap.
    const aim = applyLineUp(truth, cornerPoint(plain, c2));
    expect(spanFromFirst(one, truth.y, aim)).toBeCloseTo(5, 6);
    expect(spanFromFirst(s0, truth.y, aim)).toBeNull();
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

  it('asks again only for taps that give nothing to line up with', () => {
    const poor = { ...createLineUp(plain)!, phase: { kind: 'poor' as const, result: null } };
    expect(lineUpMessage(poor, plain, 'metric').title).toBe('The dot was not on the floor');
    expect(poorMessage(null, 'metric').detail).toContain('Place by hand');
    expect(retryLineUp(poor).phase).toEqual({ kind: 'aiming', taps: [] });
  });
});

describe('placing and moving the room by hand', () => {
  /** The wall asked for first, the way to face it, and a spot 1.5 m behind the room's middle. */
  const s0 = createLineUp(plain)!;
  const facing = facingWall(plain, currentPair(s0))!.facing;
  const middle = roomCenter(plain);
  const standAt = { x: middle.x - facing.x * 1.5, z: middle.z - facing.z * 1.5 };
  /** The phone there, looking at the floor toward the wall asked for. */
  const hand = (dot: { x: number; z: number } | null) => ({
    at: dot ? applyLineUp(truth, dot) : null,
    phone: applyLineUp(truth, standAt),
    ahead: applyLineUp({ ...truth, x: 0, z: 0 }, facing),
    floorY: truth.y,
  });

  it('puts the middle of the room where the dot is, its wall facing the way the phone looks', () => {
    const placed = placeByHand(s0, plain, hand(roomCenter(plain)))!;
    expect(placed.phase.kind).toBe('done');
    if (placed.phase.kind !== 'done') throw new Error('expected done');
    expect(placed.phase.done.source).toBe('hand');
    expect(qualityMessage(placed.phase.done, 'metric').title).toBe('Room placed by hand');
    // Standing in the middle and facing the longest wall, the room lands where it really is.
    const l = activeLineUp(placed, plain, truth.y)!;
    expect(worstCorner(plain, l)).toBeLessThan(1e-6);
    // The dot off the floor: 2 m ahead of the phone instead.
    const ahead = placeByHand(s0, plain, hand(null))!;
    const placedMiddle = applyLineUp(activeLineUp(ahead, plain, truth.y)!, middle);
    const phone = applyLineUp(truth, standAt);
    expect(Math.hypot(placedMiddle.x - phone.x, placedMiddle.z - phone.z)).toBeCloseTo(2, 6);
  });

  it('keeps a room moved by hand where it was put, on the floor as found', () => {
    const done = tapBoth(plain, createLineUp(plain)!).state;
    const nudged: LineUp = { ...truth, x: truth.x + 0.2, rotationY: truth.rotationY + 3 };
    const moved = moveRoom(done, nudged);
    if (moved.phase.kind !== 'done') throw new Error('expected done');
    expect(moved.phase.done.adjusted).toBe(true);
    expect(moved.phase.done.source).toBe('corners');
    expect(activeLineUp(moved, plain, truth.y)).toEqual(nudged);
    expect(activeLineUp(moved, plain, truth.y - 0.02)).toEqual({ ...nudged, y: truth.y - 0.02 });
    expect(qualityMessage(moved.phase.done, 'metric').title).toBe('Room moved by hand');
    // Lining up again can be cancelled back to the moved room.
    expect(cancelLineUp(lineUpAgain(moved)).phase).toEqual(moved.phase);
    // Nothing to move while aiming.
    const aiming = createLineUp(plain)!;
    expect(moveRoom(aiming, nudged)).toBe(aiming);
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
    // And the room can be moved by hand from there.
    const moved = moveRoom(s, { rotationY: 2, x: 0.1, y: -1.31, z: 0 });
    expect(activeLineUp(moved, plain, -1.3)).toEqual({ rotationY: 2, x: 0.1, y: -1.3, z: 0 });
  });
});
