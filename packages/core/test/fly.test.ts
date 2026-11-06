import { describe, expect, it } from 'vitest';
import {
  FLY,
  advanceFlight,
  flightFromCamera,
  flyBox,
  flyBy,
  flyClamp,
  flyWheel,
  lookTarget,
  nextFlySpeed,
  orbitFromFlight,
  type Flight,
  type FlyInput,
} from '../src';

const IN = 0.0254;
const still = (yaw = 0, y = 1.5): Flight => ({ x: 0, y, z: 0, yaw, pitch: 0, vx: 0, vy: 0, vz: 0 });

function fly(f: Flight, input: FlyInput, seconds: number) {
  let out = f;
  let moved = false;
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
    const r = advanceFlight(out, input, 1 / 60, null);
    out = r.flight;
    moved = r.moved;
  }
  return { flight: out, moved };
}
const speed = (f: Flight) => Math.hypot(f.vx, f.vy, f.vz);

describe('the fly settings', () => {
  it('are the closet’s, inch for inch, in metres', () => {
    expect(FLY.speed).toBeCloseTo(1.6764, 6); // 66″ a second
    expect(FLY.roam).toBeCloseTo(12.192, 6); // 480″
    expect(FLY.minEye).toBeCloseTo(0.0762, 6); // 3″
    expect(FLY.reach).toBeCloseTo(35.56, 6); // 1400″
    expect(FLY.speeds).toEqual([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]);
    expect([FLY.response, FLY.doubleTapMs, FLY.wheelStepPx, FLY.sprintFactor]).toEqual([
      9, 320, 60, 2,
    ]);
  });
});

describe('flying', () => {
  it('flies level where the head points, getting going with a short glide', () => {
    const tilted = { ...still(Math.PI / 2), pitch: -0.8 }; // facing +x, looking down
    const { flight } = fly(tilted, { fwd: 1 }, 1);
    expect(speed(flight)).toBeCloseTo(FLY.speed, 2);
    expect(flight.x).toBeGreaterThan(1);
    expect(flight.y).toBeCloseTo(1.5, 9); // level: looking down does not dive
    const quick = fly(still(), { fwd: 1 }, 0.1).flight;
    expect(speed(quick)).toBeGreaterThan(0.5 * FLY.speed);
    expect(speed(quick)).toBeLessThan(0.7 * FLY.speed);
  });

  it('rises with Space and sinks with Shift, never under the floor', () => {
    expect(fly(still(), { up: 1 }, 1).flight.y).toBeGreaterThan(2.5);
    const low = fly(still(0, 0.5), { up: -1 }, 3).flight;
    expect(low.y).toBeCloseTo(FLY.minEye, 9);
  });

  it('sprints twice as fast ahead, and the wheel sets the pace', () => {
    expect(speed(fly(still(), { fwd: 1, sprint: true }, 1.5).flight)).toBeCloseTo(2 * FLY.speed, 2);
    // Backing up never sprints.
    expect(speed(fly(still(), { fwd: -1, sprint: true }, 1.5).flight)).toBeCloseTo(FLY.speed, 2);
    expect(speed(fly(still(), { fwd: 1, pace: 0.25 }, 1.5).flight)).toBeCloseTo(
      0.25 * FLY.speed,
      2,
    );
  });

  it('glides to a stop, then needs no more frames', () => {
    const going = fly(still(), { fwd: 1 }, 1).flight;
    const stopping = fly(going, {}, 0.1);
    expect(stopping.moved).toBe(true);
    const stopped = fly(going, {}, 1.5);
    expect(stopped.moved).toBe(false);
    expect(speed(stopped.flight)).toBe(0);
    expect(stopped.flight.z - going.z).toBeLessThan(0.3);
  });

  it('stays round the room', () => {
    const box = flyBox({ min: [0, 0, 0], max: [4, 2.4, 3] });
    expect(box.max.x).toBeCloseTo(4 + 480 * IN, 9);
    expect(flyClamp(100, -5, -100, box)).toEqual({
      x: box.max.x,
      y: FLY.minEye,
      z: box.min.z,
    });
  });

  it('steps ahead along the view, up and down too', () => {
    const up = flyBy({ ...still(), pitch: Math.PI / 2 }, 1);
    expect(up.y).toBeCloseTo(2.5, 9);
    const right = flyBy(still(), 0, 1); // right of +z is −x
    expect(right.x).toBeCloseTo(-1, 9);
  });
});

describe('the wheel', () => {
  it('steps the pace once per notch, faster rolling forward', () => {
    let t = flyWheel(0, -30);
    expect(t).toEqual({ travel: -30, step: 0 });
    t = flyWheel(t.travel, -30);
    expect(t).toEqual({ travel: 0, step: 1 });
    expect(flyWheel(0, 120).step).toBe(-1);
    expect(nextFlySpeed(1, 1)).toBe(1.5);
    expect(nextFlySpeed(4, 1)).toBe(4);
    expect(nextFlySpeed(0.25, -1)).toBe(0.25);
    expect(nextFlySpeed(7, -1)).toBe(0.75); // an unknown pace counts as 1×
  });
});

describe('taking off and landing', () => {
  it('takes off where the orbit camera is, looking where it looks', () => {
    const f = flightFromCamera({ x: 0, y: 3, z: 5 }, { x: 0, y: 0, z: 0 });
    expect(f.yaw).toBeCloseTo(Math.PI, 9); // toward −z
    expect(f.pitch).toBeCloseTo(-Math.atan2(3, 5), 9);
    const t = lookTarget(f);
    expect(t.z).toBeLessThan(5);
    expect(t.y).toBeLessThan(3);
  });

  it('lands back on an orbit about a point ahead', () => {
    const f = { x: 0, y: 1.5, z: 5, yaw: Math.PI, pitch: 0 };
    const o = orbitFromFlight(f, { x: 0, y: 1, z: 0 }, 3);
    expect(o.position).toEqual({ x: 0, y: 1.5, z: 5 });
    expect(o.target.z).toBeCloseTo(5 - Math.hypot(0, 0.5, 5), 6);
    // Right next to the middle: never closer than 24″.
    expect(orbitFromFlight({ ...f, z: 0, y: 1 }, { x: 0, y: 1, z: 0 }, 3).target.z).toBeCloseTo(
      -24 * IN,
      6,
    );
  });
});
