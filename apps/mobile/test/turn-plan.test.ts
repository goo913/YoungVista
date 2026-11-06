import { describe, expect, it } from 'vitest';
import {
  BIN_DEG,
  TurnMeter,
  binCenter,
  binOf,
  binsPerRing,
  describeSeconds,
  extendSweep,
  nearestGap,
  passedBins,
  pitchGuide,
  pointsPerDegree,
  ringOf,
  secondsLeft,
  startSweep,
  viewFromTransform,
  wrap180,
} from '@/scan/turn/plan';
import { cameraTransform, forwardOf } from './turn-helpers';

describe('viewFromTransform', () => {
  it('reads the view along the camera’s −Z axis, as the contract measures heading and tilt', () => {
    // ARKit's identity pose looks down −Z: heading atan2(0, −1) = 180°.
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 1.4, -2, 1];
    const view = viewFromTransform(identity)!;
    expect(view.position).toEqual([0.5, 1.4, -2]);
    expect(view.forward[2]).toBeCloseTo(-1);
    expect(Math.abs(view.yawDeg)).toBeCloseTo(180);
    expect(view.pitchDeg).toBeCloseTo(0);
  });

  it('gives back the heading and tilt a camera was made with', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [90, -35],
      [-120, 35],
      [179, 10],
    ] as const) {
      const view = viewFromTransform(cameraTransform([1, 1.4, 2], yaw, pitch))!;
      expect(wrap180(view.yawDeg - yaw)).toBeCloseTo(0, 6);
      expect(view.pitchDeg).toBeCloseTo(pitch, 6);
      // Turning left (towards +X from +Z, seen from above) raises the heading.
      expect(view.forward).toEqual(forwardOf(yaw, pitch).map((n) => expect.closeTo(n, 9)));
    }
  });

  it('refuses a transform that is not one', () => {
    expect(viewFromTransform([1, 2, 3])).toBeNull();
    expect(viewFromTransform(new Array(16).fill(Number.NaN))).toBeNull();
    expect(viewFromTransform(new Array(16).fill(0))).toBeNull();
  });
});

describe('bins and rings', () => {
  it('cuts each ring into 24 bins of 15° and wraps round', () => {
    expect(binsPerRing()).toBe(24);
    expect(binOf(0)).toBe(0);
    expect(binOf(14.99)).toBe(0);
    expect(binOf(15)).toBe(1);
    expect(binOf(-1)).toBe(23);
    expect(binOf(359.9)).toBe(23);
    expect(binOf(360)).toBe(0);
    expect(binOf(-180)).toBe(12);
    expect(binCenter(0)).toBeCloseTo(7.5);
    expect(binCenter(23)).toBeCloseTo(-7.5);
  });

  it('puts a tilt in the nearest ring within 8°, and in none between them', () => {
    expect(ringOf(-35)).toBe(0);
    expect(ringOf(-28)).toBe(0);
    expect(ringOf(-26)).toBeNull();
    expect(ringOf(0)).toBe(1);
    expect(ringOf(-7)).toBe(1);
    expect(ringOf(33)).toBe(2);
    expect(ringOf(18)).toBeNull();
    expect(ringOf(80)).toBeNull();
  });

  it('guides the tilt to the ring within ±5°', () => {
    expect(pitchGuide(-33, 0)).toMatchObject({ targetDeg: -35, onTarget: true, tilt: null });
    expect(pitchGuide(-42, 0)).toMatchObject({ onTarget: false, tilt: 'up' });
    expect(pitchGuide(-27, 0)).toMatchObject({ onTarget: false, tilt: 'down' });
    expect(pitchGuide(0, 1).onTarget).toBe(true);
    expect(pitchGuide(5.5, 1).tilt).toBe('down');
    expect(pitchGuide(29.5, 2).tilt).toBe('up');
    expect(pitchGuide(0, 0).offsetDeg).toBeCloseTo(35);
  });
});

describe('TurnMeter', () => {
  const turn = (meter: TurnMeter, rate: number, seconds: number, hz = 15, from = 0, t0 = 0) => {
    let last = { speed: 0, angularSpeed: 0 };
    for (let k = 0; k <= seconds * hz; k++) {
      const t = t0 + k / hz;
      const yaw = from + rate * (t - t0);
      last = meter.push(t, { yawDeg: wrap180(yaw), forward: forwardOf(yaw, 0) });
    }
    return last;
  };

  it('settles on the turning speed, across the wrap at ±180°', () => {
    const meter = new TurnMeter();
    const reading = turn(meter, 10, 2, 15, 150);
    expect(reading.speed).toBeCloseTo(10, 0);
    expect(reading.angularSpeed).toBeCloseTo(10, 0);
  });

  it('says a fast turn is fast within half a second', () => {
    const meter = new TurnMeter();
    turn(meter, 8, 2);
    const fast = turn(meter, 25, 0.5, 15, 16, 2.1);
    expect(fast.speed).toBeGreaterThan(15);
  });

  it('starts again after a pause', () => {
    const meter = new TurnMeter();
    turn(meter, 20, 1);
    expect(meter.push(5, { yawDeg: 90, forward: forwardOf(90, 0) }).speed).toBe(0);
  });
});

describe('sweep and gaps', () => {
  it('counts the bins turned past by more than a bin', () => {
    let sweep = startSweep(0);
    for (let yaw = 0; yaw <= 100; yaw += 5) sweep = extendSweep(sweep, yaw);
    const passed = passedBins(sweep);
    // Middles 22.5° to 82.5° are between 15° and 85°.
    expect(passed.flatMap((p, b) => (p ? [b] : []))).toEqual([1, 2, 3, 4, 5]);
  });

  it('follows a turn across 0°, and a full turn passes every bin', () => {
    let sweep = startSweep(340);
    for (let yaw = 340; yaw <= 420; yaw += 5) sweep = extendSweep(sweep, wrap180(yaw));
    expect(sweep.max - sweep.min).toBeCloseTo(80);
    expect(passedBins(sweep).flatMap((p, b) => (p ? [b] : []))).toEqual([0, 1, 2]);
    let full = startSweep(0);
    for (let yaw = 0; yaw >= -400; yaw -= 5) full = extendSweep(full, wrap180(yaw));
    expect(passedBins(full).every(Boolean)).toBe(true);
  });

  it('points to the nearest gap behind, left or right', () => {
    const n = binsPerRing();
    const filled = Array.from({ length: n }, (_, b) => b !== 3 && b !== 10);
    const passed = new Array(n).fill(true);
    expect(nearestGap(filled, passed, 0)).toMatchObject({ bin: 3, turn: 'left' });
    expect(nearestGap(filled, passed, 0)!.deltaDeg).toBeCloseTo(52.5);
    expect(nearestGap(filled, passed, 150)).toMatchObject({ bin: 10 });
    expect(nearestGap(filled, passed, 100)).toMatchObject({ bin: 3, turn: 'right' });
    // Not turned past yet: not a gap.
    expect(nearestGap(filled, new Array(n).fill(false), 0)).toBeNull();
    expect(nearestGap(new Array(n).fill(true), passed, 0)).toBeNull();
  });
});

describe('time and screen', () => {
  it('estimates the time left at 10° a second', () => {
    expect(secondsLeft(24)).toBe((24 * BIN_DEG) / 10);
    expect(describeSeconds(80)).toBe('about 1 min 20 s');
    expect(describeSeconds(120)).toBe('about 2 min');
    expect(describeSeconds(38)).toBe('about 40 s');
    expect(describeSeconds(2)).toBe('about 5 s');
  });

  it('scales the pitch guide to the camera image on screen', () => {
    // A 4:3 image filling an iPhone 15 held sideways: about 11 points a degree.
    const ppd = pointsPerDegree(
      { width: 852, height: 393 },
      { width: 1920, height: 1440, fx: 1450, fy: 1450 },
    );
    expect(ppd).toBeCloseTo((852 / 1920) * 1450 * (Math.PI / 180), 6);
    expect(ppd).toBeGreaterThan(10);
    expect(ppd).toBeLessThan(12);
    expect(
      pointsPerDegree({ width: 400, height: 800 }, { width: 0, height: 0, fx: 0, fy: 0 }),
    ).toBe(0);
  });
});
