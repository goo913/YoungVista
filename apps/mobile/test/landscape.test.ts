/**
 * The camera screens run in landscape, either way round. The scan and the AR view aim along the
 * camera's forward ray, through the middle of the screen, and turning the phone in the hand (from
 * upright to either landscape side) only rolls the camera about that ray: the aim, the marks, the
 * room and the line-up must not change. Only the camera's `up` turns with the phone. ViroKit
 * reports it as the top of the screen as it is turned (VROARCameraiOS::getRotation turns ARKit's
 * camera by the interface orientation, which plugins/with-scene-lifecycle.js keeps current), so
 * where `up` is used, looking straight down, the top of the screen still points the way the user
 * faces.
 */
import { angleAboveDeg } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { ArController, floorAim } from '@/ar/controller';
import { aheadOnFloor } from '@/ar/pose';
import { rayCaster } from '@/ar/touch';
import { floorPosition, headingDeg, rayFromCamera } from '@/scan/geometry';
import { steadyPose, type TimedPose } from '@/scan/steady';
import type { CameraPose } from '@/scan/viro-anchor';
import { aimedCamera, floorAnchor, mulberry32, pose, type V3 } from './helpers';
import { QUIET, REALISTIC, SimScan, rotatedRectangle, type SimNoise } from './sim';

/** How the phone is held: how far the screen's top is turned about the camera's forward ray. */
const HOLDS = { upright: 0, 'landscape left': 90, 'landscape right': -90 } as const;
type Hold = keyof typeof HOLDS;
const SIDEWAYS: Hold[] = ['landscape left', 'landscape right'];

type Posed = { forward: readonly number[]; up: readonly number[] };

/** The same camera, held as `hold` says: its `up` turned about `forward` (Rodrigues' rotation). */
function heldAs<T extends Posed>(camera: T, hold: Hold): T {
  const r = (HOLDS[hold] * Math.PI) / 180;
  const k = camera.forward;
  const v = camera.up;
  const cross = [
    k[1]! * v[2]! - k[2]! * v[1]!,
    k[2]! * v[0]! - k[0]! * v[2]!,
    k[0]! * v[1]! - k[1]! * v[0]!,
  ];
  const along = k[0]! * v[0]! + k[1]! * v[1]! + k[2]! * v[2]!;
  const up = [0, 1, 2].map(
    (i) => v[i]! * Math.cos(r) + cross[i]! * Math.sin(r) + k[i]! * along * (1 - Math.cos(r)),
  ) as V3;
  return { ...camera, up };
}

const close = (a: readonly number[], b: readonly number[], digits = 9) =>
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, digits));

describe('holding the phone sideways', () => {
  it('only turns the camera’s up: forward stays, up stays square to it', () => {
    const camera = aimedCamera([0, 1.4, 0], [1, 0, -2]);
    for (const hold of SIDEWAYS) {
      const held = heldAs(camera, hold);
      expect(held.forward).toEqual(camera.forward);
      const dot = held.up.reduce((s, x, i) => s + x * camera.forward[i]!, 0);
      expect(dot).toBeCloseTo(0, 12);
      expect(Math.hypot(...held.up)).toBeCloseTo(1, 12);
      // A quarter turn: the screen's top now points where the screen's side did.
      const before = held.up.reduce((s, x, i) => s + x * camera.up[i]!, 0);
      expect(before).toBeCloseTo(0, 12);
    }
  });
});

describe('the dot in the middle of the screen, held sideways', () => {
  it('is the same ray, the same spot on the plan and the same floor point', () => {
    const rand = mulberry32(11);
    const floor = { y: 0, planeId: 'floor', classification: 'Floor' };
    for (let i = 0; i < 100; i++) {
      const eye: V3 = [rand() * 4 - 2, 1.1 + rand() * 0.6, rand() * 4 - 2];
      const target: V3 = [rand() * 8 - 4, rand() < 0.2 ? 0.5 + rand() : 0, rand() * 8 - 4];
      const upright = aimedCamera(eye, target);
      for (const hold of SIDEWAYS) {
        const held = heldAs(upright, hold);
        expect(rayFromCamera(held)).toEqual(rayFromCamera(upright));
        expect(floorPosition(held)).toEqual(floorPosition(upright));
        expect(floorAim(held, floor)).toEqual(floorAim(upright, floor));
      }
    }
  });

  it('takes the same steady aim for a tap (AR line-up, Add furniture)', () => {
    const rand = mulberry32(5);
    const recent: Record<Hold, TimedPose[]> = {
      upright: [],
      'landscape left': [],
      'landscape right': [],
    };
    for (let t = 0; t <= 150; t += 30) {
      // A hand that shakes a little around one aim.
      const target: V3 = [1 + (rand() - 0.5) * 0.004, 0, -2 + (rand() - 0.5) * 0.004];
      const upright = aimedCamera([0, 1.4, 0], target);
      for (const hold of Object.keys(HOLDS) as Hold[]) {
        recent[hold].push({ t, pose: heldAs(upright, hold) });
      }
    }
    const upright = steadyPose(recent.upright, 150)!;
    for (const hold of SIDEWAYS) {
      const held = steadyPose(recent[hold], 150)!;
      close(held.forward, upright.forward, 12);
      close(held.position, upright.position, 12);
      expect(rayFromCamera(held).direction).toEqual(held.forward);
    }
  });

  it('puts the AR view’s dot on the same floor point', () => {
    const aims: Record<Hold, ReturnType<ArController['takeAim']>> = {
      upright: null,
      'landscape left': null,
      'landscape right': null,
    };
    for (const hold of Object.keys(HOLDS) as Hold[]) {
      const clock = { t: 0 };
      const c = new ArController({ now: () => clock.t });
      c.onTrackingUpdated(3, 1);
      c.onAnchorFound(floorAnchor('floor', 0));
      for (let i = 0; i < 6; i++) {
        clock.t = i * 30;
        c.onCameraTransformUpdate(heldAs(aimedCamera([0.3, 1.4, 0.2], [1.5, 0, -2]), hold));
      }
      c.flush();
      const aim = c.getSnapshot().derived.aim;
      expect(aim.ok).toBe(true);
      if (aim.ok) {
        expect(aim.point.x).toBeCloseTo(1.5, 9);
        expect(aim.point.z).toBeCloseTo(-2, 9);
      }
      c.holdAim();
      aims[hold] = c.takeAim();
    }
    for (const hold of SIDEWAYS) {
      close(aims[hold]!.origin, aims.upright!.origin, 12);
      close(aims[hold]!.direction, aims.upright!.direction, 12);
    }
  });
});

describe('which way the user faces, held sideways', () => {
  it('reads the forward ray whenever the phone is not pointing straight down', () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      // Up to about 70° below level: the forward ray still points along the floor enough.
      const yaw = rand() * 2 * Math.PI;
      const pitch = (-rand() * 70 * Math.PI) / 180;
      const forward: V3 = [
        Math.cos(pitch) * Math.cos(yaw),
        Math.sin(pitch),
        -Math.cos(pitch) * Math.sin(yaw),
      ];
      const upright = aimedCamera([0, 1.4, 0], [forward[0], 1.4 + forward[1], forward[2]]);
      for (const hold of SIDEWAYS) {
        const held = heldAs(upright, hold);
        expect(headingDeg(held)).toBeCloseTo(headingDeg(upright)!, 9);
        expect(aheadOnFloor(held)).toEqual(aheadOnFloor(upright));
      }
    }
  });

  it('reads the top of the screen when pointing straight down, as ViroKit turns it', () => {
    // Looking down at the floor in landscape, either way round, the top of the screen (what
    // ViroKit reports as `up` once it knows the screen turned) points away from the user.
    for (const facingDeg of [0, 37, 90, 180, 251]) {
      const r = (facingDeg * Math.PI) / 180;
      const away: V3 = [Math.cos(r), 0, -Math.sin(r)];
      const down = pose([0, 1.4, 0], [away[0] * 0.05, -1, away[2] * 0.05], away);
      expect(headingDeg(down)).toBeCloseTo(angleAboveDeg({ x: away[0], z: away[2] }), 0);
      const ahead = aheadOnFloor(down)!;
      expect(angleAboveDeg(ahead)).toBeCloseTo(angleAboveDeg({ x: away[0], z: away[2] }), 0);
    }
  });
});

/**
 * The owner's bedroom, scanned as in scan-sim.test.ts: the first wall twice at its bottom, its top
 * for the ceiling, then the other three walls. `hold` is how the phone is held throughout.
 */
function scanTheRoom(seed: number, noise: SimNoise, hold: Hold) {
  const r = mulberry32(seed * 7919);
  const room = {
    outline: rotatedRectangle(3.0, 3.5, (r() * 2 - 1) * 2, (r() * 2 - 1) * 2, r() * 360),
    ceiling: 2.44,
    floorY: -1.4 + (r() * 0.2 - 0.1),
  };
  const sim = new SimScan(room, noise, seed);
  const c = sim.controller;
  // Every camera event ViroKit would send, with the phone held this way.
  const event = c.onCameraTransformUpdate;
  c.onCameraTransformUpdate = (transform) => event(heldAs(transform as CameraPose, hold));
  const middle = sim.middle();
  sim.start(middle);
  const spot = () => sim.jitter(middle, noise === QUIET ? 0 : 0.25);
  const outcomes = [
    sim.mark(spot(), sim.edgePoint(0, 0.2, 'floor')),
    sim.mark(spot(), sim.edgePoint(0, 0.8, 'floor')),
    sim.mark(spot(), sim.edgePoint(0, 0.5, 'ceiling')),
    sim.mark(spot(), sim.edgePoint(1, 0.5, 'ceiling')),
    sim.mark(spot(), sim.edgePoint(2, 0.5, 'ceiling')),
    sim.mark(spot(), sim.edgePoint(3, 0.5, 'floor')),
  ];
  return { outcomes, done: c.finish(), derived: c.getSnapshot().derived };
}

describe('a whole scan with the phone held sideways', () => {
  it('marks the same walls and makes the same room as held upright', () => {
    for (const [seed, noise] of [
      [1, QUIET],
      [2, REALISTIC],
      [3, REALISTIC],
      [4, REALISTIC],
    ] as const) {
      const upright = scanTheRoom(seed, noise, 'upright');
      expect(upright.outcomes.every((o) => o.kind === 'marked')).toBe(true);
      expect(upright.done.ok).toBe(true);
      for (const hold of SIDEWAYS) {
        const held = scanTheRoom(seed, noise, hold);
        expect(held.outcomes).toEqual(upright.outcomes);
        expect(held.done).toEqual(upright.done);
        expect(held.derived.closed).toBe(true);
        // The map's wedge and "turn left/right" read the same heading.
        expect(held.derived.headingDeg).toBeCloseTo(upright.derived.headingDeg!, 9);
      }
    }
  });
});

describe('a finger on the AR view in landscape', () => {
  it('reaches the view’s pixels as they are, no axes swapped', async () => {
    const asked: V3[] = [];
    const unproject = (point: V3) => {
      asked.push(point);
      // Any two points along a ray will do; the ray itself is checked elsewhere.
      return Promise.resolve({ position: [point[0], point[1], -point[2] - 1] });
    };
    // iPhone 15 in landscape: 852 × 393 points, 3 pixels a point.
    const cast = rayCaster(() => unproject, 3);
    await cast(852, 393);
    await cast(426, 196.5);
    expect(asked).toEqual([
      [2556, 1179, 0],
      [2556, 1179, 0.1],
      [1278, 589.5, 0],
      [1278, 589.5, 0.1],
    ]);
  });
});
