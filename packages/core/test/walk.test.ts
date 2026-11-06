import { describe, expect, it } from 'vitest';
import {
  WALK,
  advanceBody,
  bodyBusy,
  eyeHeightOf,
  feetInches,
  headOffset,
  innerPoint,
  itemFootprint,
  newBody,
  normalizeFov,
  normalizeHeightCm,
  normalizeLookSpeed,
  normalizeSkin,
  roomFromPoints,
  roomOpenDir,
  roomStartPose,
  roomWalkModel,
  roomWalkWalls,
  settle,
  skinOf,
  steerTo,
  step,
  turnHead,
  walkBy,
  walkModel,
  type BodyConfig,
  type Opening,
  type Room,
  type WalkBody,
  type WalkInput,
  type WalkModel,
} from '../src';
import { lShape, rectangle } from './helpers';

const IN = 0.0254;
const R = WALK.radius;

/** A 4 × 3 m room (x 0…4, z 0…3), with openings on its z = 3 wall when given. */
function room43(...openings: Omit<Opening, 'id'>[]): Room {
  const room = roomFromPoints(rectangle(4, 3));
  const south = room.walls.find((w) => {
    const a = room.points[w.a]!;
    const b = room.points[w.b]!;
    return a[1] === 3 && b[1] === 3;
  })!;
  // Offsets run from the wall's start corner: find which end that is.
  const startX = room.points[south.a]![0];
  south.openings = openings.map((o, i) => ({
    ...o,
    id: `o${i}`,
    offset: startX === 0 ? o.offset : 4 - o.offset - o.width,
  }));
  return room;
}
const door = (from: number, width: number): Omit<Opening, 'id'> => ({
  type: 'door',
  offset: from,
  width,
  height: 2.03,
  sill: 0,
});

const cfg = (extra: Partial<BodyConfig> = {}): BodyConfig => ({
  ...WALK,
  heightCm: 170,
  ceiling: 2.4384,
  ...extra,
});

/** Runs a body for `seconds` at 60 frames a second with the keys `input`. */
function walk(
  body: WalkBody,
  input: WalkInput,
  seconds: number,
  model: WalkModel,
  config = cfg(),
): WalkBody {
  let b = body;
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) b = advanceBody(b, input, 1 / 60, model, config);
  return b;
}

const empty = walkModel({});
const at = (x: number, z: number, yaw = 0) => newBody({ x, z, yaw, pitch: 0 });
const speed = (b: WalkBody) => Math.hypot(b.vx, b.vz);

describe('the walk settings', () => {
  it('are the closet’s, inch for inch, in metres', () => {
    expect(WALK.speed).toBeCloseTo(1.27, 6); // 50″ a second
    expect(WALK.radius).toBeCloseTo(0.2286, 6); // 9″
    expect(WALK.jump).toBeCloseTo(0.4064, 6); // 16″
    expect(WALK.gravity).toBeCloseTo(9.8044, 4); // 386″/s²
    expect(WALK.reach).toBeCloseTo(3.81, 6); // 150″
    expect(WALK.stopSpeed).toBeCloseTo(0.3048, 6); // 12″ a second
    expect(WALK.bob.landDip).toBeCloseTo(0.04064, 6);
    expect(WALK.overhang).toBeCloseTo(3.048, 6); // 120″
    expect([WALK.accel, WALK.friction, WALK.runFactor, WALK.crouchFactor]).toEqual([
      8, 7, 1.6, 0.45,
    ]);
  });

  it('keep a person’s choices in range', () => {
    expect(normalizeHeightCm(300)).toBe(210);
    expect(normalizeHeightCm(null)).toBe(170);
    expect(normalizeFov('95')).toBe(95);
    expect(normalizeFov(undefined)).toBe(100);
    expect(normalizeLookSpeed(1.234)).toBe(1.25);
    expect(normalizeSkin('nope')).toBe('medium');
    expect(skinOf('dark').texture).toBe('dark');
    expect(feetInches(170)).toBe('5′ 7″');
  });
});

describe('the walls of a room', () => {
  it('stand at the room’s inside faces, facing in', () => {
    const walls = roomWalkWalls(room43());
    expect(walls).toHaveLength(4);
    for (const w of walls) {
      // The middle of the room is on the inner side of every wall.
      const mx = (w.ax + w.bx) / 2;
      const mz = (w.az + w.bz) / 2;
      expect((2 - mx) * w.nx + (1.5 - mz) * w.nz).toBeGreaterThan(0);
      expect(w.t).toBeCloseTo(0.1, 9);
    }
  });

  it('have gaps at doors and doorless openings, not at windows', () => {
    expect(roomWalkWalls(room43(door(1.5, 0.9)))).toHaveLength(5);
    expect(
      roomWalkWalls(room43({ type: 'opening', offset: 0.5, width: 1, height: 2.03, sill: 0 })),
    ).toHaveLength(5);
    expect(
      roomWalkWalls(room43({ type: 'window', offset: 1, width: 1.2, height: 1.2, sill: 0.9 })),
    ).toHaveLength(4);
  });
});

describe('walking into things', () => {
  it('stops at a wall, as close as the body is wide', () => {
    const model = roomWalkModel(room43());
    const b = walk(at(2, 1.5, Math.PI / 2), { fwd: 1 }, 4, model); // facing +x
    expect(b.x).toBeLessThanOrEqual(4 - R + 1e-6);
    expect(b.x).toBeGreaterThan(4 - R - 0.01);
    expect(speed(b)).toBeLessThan(0.05); // a wall met head-on takes the speed away
  });

  it('slides along a wall met at a slant', () => {
    const model = roomWalkModel(room43());
    const b = walk(at(2, 1.5, Math.PI / 4), { fwd: 1 }, 3, model); // toward +x and +z
    expect(b.x).toBeCloseTo(4 - R, 2);
    expect(b.z).toBeCloseTo(3 - R, 2); // it slid into the corner
  });

  it('goes through a door and out onto the floor round the room', () => {
    const model = roomWalkModel(room43(door(1.55, 0.9)));
    const b = walk(at(2, 1.5, 0), { fwd: 1 }, 3, model); // facing +z, through the door
    expect(b.z).toBeGreaterThan(3.3);
    // …but not off the floor's edge, 3.05 m past the wall.
    const far = walk(b, { fwd: 1 }, 6, model);
    expect(far.z).toBeLessThanOrEqual(3 + 0.1 + WALK.overhang - R + 1e-6);
    expect(far.z).toBeGreaterThan(3 + 0.1 + WALK.overhang - R - 0.02);
  });

  it('cannot squeeze through an opening narrower than the body', () => {
    const model = roomWalkModel(
      room43({ type: 'opening', offset: 1.85, width: 0.3, height: 2.03, sill: 0 }),
    );
    const b = walk(at(2, 1.5, 0), { fwd: 1 }, 3, model);
    expect(b.z).toBeLessThan(3);
  });

  it('stops at furniture', () => {
    const table = itemFootprint({ x: 2.5, z: 1.5, rotationY: 0 }, { w: 1, d: 1 });
    const model = roomWalkModel(room43(), [table.corners]);
    const b = walk(at(0.5, 1.5, Math.PI / 2), { fwd: 1 }, 3, model);
    expect(b.x).toBeLessThanOrEqual(2 - R + 1e-6);
    expect(b.x).toBeGreaterThan(2 - R - 0.02);
  });

  it('pushes a person out of a wall or a piece they stand in', () => {
    const model = roomWalkModel(room43());
    const p = settle({ x: 3.95, z: 1.5 }, model, R);
    expect(p.x).toBeCloseTo(4 - R, 6);
    const table = itemFootprint({ x: 2, z: 1.5, rotationY: 0 }, { w: 1, d: 1 });
    const q = settle({ x: 2.4, z: 1.5 }, walkModel({ units: [table.corners] }), R);
    expect(q.x).toBeCloseTo(2.5 + R, 6); // out through the nearest side
  });

  it('never steps through a wall, however fast', () => {
    const model = roomWalkModel(room43());
    const p = step({ x: 2, z: 1.5 }, 10, 0, model, R);
    expect(p.x).toBeLessThanOrEqual(4 - R + 1e-6);
  });
});

describe('the body', () => {
  it('gets going in about a quarter of a second, Quake’s way', () => {
    const quick = walk(at(0, 0), { fwd: 1 }, 0.1, empty);
    expect(speed(quick)).toBeGreaterThan(0.4);
    expect(speed(quick)).toBeLessThan(1.1);
    const going = walk(at(0, 0), { fwd: 1 }, 0.4, empty);
    expect(speed(going)).toBeCloseTo(WALK.speed, 3);
    expect(going.z).toBeGreaterThan(0); // yaw 0 faces +z
  });

  it('stops in about six inches', () => {
    const going = walk(at(0, 0), { fwd: 1 }, 1, empty);
    const stopped = walk(going, {}, 1, empty);
    expect(speed(stopped)).toBe(0);
    const slide = stopped.z - going.z;
    expect(slide).toBeGreaterThan(4 * IN);
    expect(slide).toBeLessThan(8 * IN);
  });

  it('hurries with Shift and slows down crouched', () => {
    expect(speed(walk(at(0, 0), { fwd: 1, run: true }, 1, empty))).toBeCloseTo(WALK.speed * 1.6, 3);
    const low = walk(at(0, 0), { fwd: 1, crouch: true }, 1, empty);
    expect(speed(low)).toBeCloseTo(WALK.speed * 0.45, 3);
    expect(eyeHeightOf(low, 170)).toBeCloseTo(1.02, 6); // 60% of 170 cm
    expect(eyeHeightOf(at(0, 0), 170)).toBeCloseTo(1.5895, 6); // 93.5%
  });

  it('is no faster on a diagonal', () => {
    expect(speed(walk(at(0, 0), { fwd: 1, right: 1 }, 1, empty))).toBeCloseTo(WALK.speed, 3);
  });

  it('jumps 16 inches and lands with a give at the knees', () => {
    let b = advanceBody(at(0, 0), { jump: true }, 1 / 60, empty, cfg());
    let top = 0;
    let dipped = false;
    for (let i = 0; i < 120; i++) {
      b = advanceBody(b, {}, 1 / 60, empty, cfg());
      top = Math.max(top, b.y);
      if (b.dip) dipped = true;
    }
    expect(top).toBeCloseTo(WALK.jump, 2);
    expect(b.y).toBe(0);
    expect(dipped).toBe(true);
    // A crouched person does not jump.
    const crouched = walk(at(0, 0), { crouch: true }, 0.5, empty);
    expect(advanceBody(crouched, { jump: true, crouch: true }, 1 / 60, empty, cfg()).vy).toBe(0);
  });

  it('hits its head on a low ceiling', () => {
    let b = advanceBody(at(0, 0), { jump: true }, 1 / 60, empty, cfg({ ceiling: 2 }));
    let top = 0;
    for (let i = 0; i < 120; i++) {
      b = advanceBody(b, {}, 1 / 60, empty, cfg({ ceiling: 2 }));
      top = Math.max(top, b.y);
    }
    // 2 m less half an inch, the head above the eyes (6.5% of 170 cm) and the eyes.
    expect(top).toBeLessThanOrEqual(2 - 0.5 * IN - 0.1105 - 1.5895 + 1e-9);
  });

  it('bobs with each step, and says when a frame is due', () => {
    const going = walk(at(0, 0), { fwd: 1 }, 0.7, empty);
    expect(going.stride).toBeGreaterThan(0.5);
    const off = headOffset(going);
    expect(Math.abs(off.up)).toBeLessThanOrEqual(WALK.bob.rise + 1e-9);
    expect(Math.abs(off.side)).toBeLessThanOrEqual(WALK.bob.sway + 1e-9);
    expect(headOffset(going, WALK, false)).toEqual({ up: 0, side: 0, roll: 0 });
    expect(bodyBusy(going)).toBe(true);
    const still = walk(going, {}, 3, empty);
    expect(bodyBusy(still)).toBe(false);
    expect(bodyBusy(still, { crouch: true })).toBe(true); // about to crouch
  });

  it('turns its head, never quite straight up or down', () => {
    const b = turnHead(at(0, 0), 0.5, 3);
    expect(b.yaw).toBeCloseTo(0.5, 9);
    expect(b.pitch).toBeCloseTo(1.45, 9);
  });

  it('steps with the wheel and walks to a spot', () => {
    const model = roomWalkModel(room43());
    expect(walkBy(at(2, 1.5, 0), 0.5, 0, model).z).toBeCloseTo(2, 9);
    expect(walkBy(at(2, 1.5, 0), 0, 0.5, model).x).toBeCloseTo(1.5, 9); // right of +z is −x
    let b = at(1, 1, 0);
    for (let i = 0; i < 400; i++) {
      const keys = steerTo(b, { x: 3, z: 2 });
      if (!keys) break;
      b = advanceBody(b, keys, 1 / 60, model, cfg());
    }
    expect(Math.hypot(b.x - 3, b.z - 2)).toBeLessThan(0.1);
    expect(steerTo({ x: 3, z: 2, yaw: 0, pitch: 0 }, { x: 3, z: 2 })).toBeNull();
  });
});

describe('where a walk starts', () => {
  it('opens out through the doors', () => {
    expect(roomOpenDir(room43(door(1.5, 0.9)))).toEqual([0, 1]);
    expect(roomOpenDir(room43())).toEqual([0, 1]); // no door: from the bottom of the plan
  });

  it('stands a step inside the way in, facing into the room', () => {
    const room = room43(door(1.55, 0.9));
    const model = roomWalkModel(room);
    const p = roomStartPose(room, model);
    // Across from the middle of the floor (the closet's `innerPoint`: the first grid point as deep
    // inside as any, here 1.5 m in from the left wall).
    expect(p.x).toBeGreaterThanOrEqual(1.5 - 1e-9);
    expect(p.x).toBeLessThanOrEqual(2.5);
    expect(p.z).toBeCloseTo(2.25, 1);
    expect(Math.cos(p.yaw)).toBeCloseTo(-1, 6); // facing −z, into the room
    expect(p.pitch).toBe(0);
  });

  it('starts inside an L-shaped room, clear of its walls', () => {
    const room = roomFromPoints(lShape);
    const model = roomWalkModel(room);
    const p = roomStartPose(room, model);
    expect(settle(p, model, R)).toEqual({ x: p.x, z: p.z });
    const mid = innerPoint(room.points.map(([x, z]) => ({ x, z })));
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(6);
  });
});
