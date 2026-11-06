import { describe, expect, it, vi } from 'vitest';
import { TurnCapture, type CaptureDeps } from '@/scan/turn/capture';
import { RING_PITCHES } from '@/scan/turn/plan';
import { forwardOf, rawFrame, type V3 } from './turn-helpers';

const HZ = 15;

function setup(overrides: Partial<CaptureDeps> = {}) {
  const removed: string[] = [];
  const keep = vi.fn((_id: number, _uri: string) => Promise.resolve({ bytes: 400_000 }));
  const capture = new TurnCapture({
    keep,
    remove: (uri) => removed.push(uri),
    folder: 'file:///cache/turn-scan/s1/',
    ...overrides,
  });
  return { capture, keep, removed };
}

/** Feeds frames like the native module: `HZ` a second, each JPEG written before the next. */
class Turner {
  id = 1;
  t = 100;
  readonly capture: TurnCapture;
  at: V3;

  constructor(capture: TurnCapture, at: V3 = [0, 1.4, 0]) {
    this.capture = capture;
    this.at = at;
  }

  async frame(yawDeg: number, pitchDeg: number, options = {}) {
    this.capture.onFrame(rawFrame(this.id++, this.t, this.at, yawDeg, pitchDeg, options));
    this.t += 1 / HZ;
    await this.capture.settle();
  }

  /** Turns `degrees` at `rate` degrees a second (positive: to the left), tilted `pitchDeg`. */
  async turn(from: number, degrees: number, pitchDeg: number, rate = 10, options = {}) {
    const steps = Math.round((Math.abs(degrees) / rate) * HZ);
    for (let k = 0; k <= steps; k++) {
      await this.frame(from + (Math.sign(degrees) * rate * k) / HZ, pitchDeg, options);
    }
    return from + degrees;
  }
}

describe('TurnCapture', () => {
  it('turns three rings at a spot, a keyframe in every bin, and moves on by itself', async () => {
    const { capture } = setup();
    const turner = new Turner(capture);
    capture.beginSpot();
    expect(capture.getSnapshot()).toMatchObject({ phase: 'turning', spot: 0, ring: 0 });
    let yaw = await turner.turn(0, -375, RING_PITCHES[0]!);
    expect(capture.getSnapshot().ring).toBe(1);
    yaw = await turner.turn(yaw, -375, RING_PITCHES[1]!);
    expect(capture.getSnapshot().ring).toBe(2);
    await turner.turn(yaw, -375, RING_PITCHES[2]!);
    const done = capture.getSnapshot();
    expect(done.phase).toBe('spot-done');
    expect(done.coverage.every((ring) => ring.every(Boolean))).toBe(true);
    expect(done.filled).toBe(72);
    expect(done.keyframes).toBe(72);
    const report = capture.report();
    expect(report.rings.map((r) => r.filled)).toEqual([24, 24, 24]);
    expect(report.keyframes).toBe(72);
    expect(report.bytes).toBe(72 * 400_000);
    expect(report.maxSpeed).toBeLessThan(12);
    // One per bin, all from this spot, each ring's own tilt.
    const keyframes = capture.keyframes();
    for (const k of keyframes) {
      expect(k.spot).toBe(0);
      expect(Math.abs(k.view.pitchDeg - RING_PITCHES[k.ring]!)).toBeLessThan(1e-6);
    }
    expect(new Set(keyframes.map((k) => `${k.ring}/${k.bin}`)).size).toBe(72);
  });

  it('shows the pitch guide and keeps nothing while off the ring’s tilt', async () => {
    const { capture, keep } = setup();
    const turner = new Turner(capture);
    capture.beginSpot();
    await turner.turn(0, -60, 0);
    const s = capture.getSnapshot();
    expect(s.guide).toMatchObject({ ring: 0, onTarget: false, tilt: 'down' });
    expect(s.ringFilled).toBe(0);
    // Level frames are the level ring's, not lost.
    expect(keep).toHaveBeenCalled();
    expect(s.coverage[1]!.some(Boolean)).toBe(true);
    await turner.frame(-60, -34);
    expect(capture.getSnapshot().guide).toMatchObject({ onTarget: true, tilt: null });
  });

  it('warns when turning too fast', async () => {
    const { capture } = setup();
    const turner = new Turner(capture);
    capture.beginSpot();
    await turner.turn(0, -90, -35, 8);
    expect(capture.getSnapshot().tooFast).toBe(false);
    await turner.turn(-90, -60, -35, 30);
    const s = capture.getSnapshot();
    expect(s.tooFast).toBe(true);
    expect(s.speed).toBeGreaterThan(15);
    expect(capture.report().fastSamples).toBeGreaterThan(0);
  });

  it('points back to a gap turned past without a picture', async () => {
    const { capture } = setup();
    const turner = new Turner(capture);
    capture.beginSpot();
    await turner.turn(0, 58, -35);
    // Tracking drops for 34° (no frame can be kept), then comes back.
    await turner.turn(58, 34, -35, 10, { tracking: 'unavailable' });
    await turner.turn(92, 45, -35);
    const s = capture.getSnapshot();
    expect(s.coverage[0]![4]).toBe(false);
    expect(s.coverage[0]![5]).toBe(false);
    expect(s.gap).toMatchObject({ bin: 5, turn: 'right' });
    // Going back fills it.
    await turner.turn(135, -80, -35);
    expect(capture.getSnapshot().coverage[0]![4]).toBe(true);
    expect(capture.getSnapshot().coverage[0]![5]).toBe(true);
    expect(capture.getSnapshot().gap).toBeNull();
  });

  it('moves on with gaps when asked, then turns a second spot', async () => {
    const { capture } = setup();
    const turner = new Turner(capture);
    capture.beginSpot();
    await turner.turn(0, 180, -35);
    capture.nextRing();
    capture.nextRing();
    capture.nextRing();
    expect(capture.getSnapshot().phase).toBe('spot-done');
    capture.beginSpot();
    expect(capture.getSnapshot()).toMatchObject({
      phase: 'turning',
      spot: 1,
      ring: 0,
      ringFilled: 0,
    });
    turner.at = [3, 1.4, 0];
    await turner.turn(0, 30, -35);
    const ids = capture.keyframes().map((k) => k.spot);
    expect(ids).toContain(0);
    expect(ids).toContain(1);
    // At most two spots.
    capture.nextRing();
    capture.nextRing();
    capture.nextRing();
    capture.beginSpot();
    expect(capture.getSnapshot()).toMatchObject({ phase: 'spot-done', spot: 1 });
  });

  it('says when the phone has wandered off its spot', async () => {
    const { capture } = setup();
    const turner = new Turner(capture);
    capture.beginSpot();
    await turner.turn(0, 20, -35);
    expect(capture.getSnapshot().drift).toBeLessThan(0.01);
    turner.at = [0.8, 1.4, 0.1];
    await turner.frame(20, -35);
    expect(capture.getSnapshot().drift).toBeCloseTo(Math.hypot(0.8, 0.1), 6);
  });

  it('deletes the pictures that a better frame replaced', async () => {
    const { capture, removed } = setup();
    const turner = new Turner(capture);
    capture.beginSpot();
    await turner.frame(7, -35, { sharpness: 100 });
    await turner.frame(7.2, -35, { sharpness: 2000 });
    expect(removed).toEqual(['file:///cache/turn-scan/s1/f1.jpg']);
    expect(capture.keyframes().map((k) => k.file)).toEqual(['file:///cache/turn-scan/s1/f2.jpg']);
  });

  it('checks ARKit’s frames against Viro’s camera', async () => {
    let viro: { position: V3; forward: V3 } | null = null;
    const { capture } = setup({
      viroCamera: () =>
        viro && {
          position: viro.position,
          rotation: [0, 0, 0],
          forward: viro.forward,
          up: [0, 1, 0],
        },
    });
    const turner = new Turner(capture);
    capture.beginSpot();
    for (let k = 0; k < 10; k++) {
      // Viro reports the same camera, a moment later (a degree of turn, 3 mm of move).
      viro = { position: [0.003, 1.4, 0], forward: forwardOf(k + 1, -35) };
      await turner.frame(k, -35);
    }
    const check = capture.report().frameCheck!;
    expect(check.samples).toBe(10);
    expect(check.medianM).toBeCloseTo(0.003, 6);
    // A degree of heading, 35° down, is this much angle between the two views.
    const c = Math.cos((35 * Math.PI) / 180);
    const expected = (Math.acos(c * c * Math.cos(Math.PI / 180) + (1 - c * c)) * 180) / Math.PI;
    expect(check.medianDeg).toBeCloseTo(expected, 6);
    expect(check.maxDeg).toBeLessThan(1);
  });

  it('takes no frames once stopped, but finishes the pictures already asked for', async () => {
    let finish: (v: { bytes: number }) => void = () => {};
    const keep = vi.fn(() => new Promise<{ bytes: number }>((resolve) => (finish = resolve)));
    const { capture } = setup({ keep });
    capture.beginSpot();
    capture.onFrame(rawFrame(1, 0, [0, 1.4, 0], 7, -35));
    capture.stop();
    capture.onFrame(rawFrame(2, 0.1, [0, 1.4, 0], 22, -35));
    expect(keep).toHaveBeenCalledTimes(1);
    const settled = capture.settle();
    finish({ bytes: 10 });
    await settled;
    expect(capture.keyframes()).toHaveLength(1);
    expect(capture.getSnapshot().phase).toBe('stopped');
  });
});
