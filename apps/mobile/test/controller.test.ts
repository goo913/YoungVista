import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_POSE_SAMPLES, POSE_STRIDE, ScanController } from '@/scan/controller';
import { aimedCamera, cameraEvent, floorAnchor, type V3 } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const EYE: V3 = [0, 1.4, 0];

/** A controller with its own clock, tracking, and the floor found. */
function started() {
  const clock = { t: 0 };
  const c = new ScanController({ now: () => clock.t });
  c.onTrackingUpdated(3, 1);
  c.onCameraTransformUpdate(aimedCamera(EYE, [0.5, 0, -1]));
  c.onAnchorFound(floorAnchor('floor', 0));
  c.flush();
  return { c, clock };
}

describe('ScanController', () => {
  it('publishes Viro events at most every throttle interval', () => {
    const c = new ScanController({ throttleMs: 100 });
    const listener = vi.fn();
    c.subscribe(listener);
    for (let i = 0; i < 30; i++)
      c.onCameraTransformUpdate(cameraEvent([0, 1.5, i / 100], [0, -0.5, -1]));
    c.onAnchorFound(floorAnchor('floor', 0));
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(1);
    const snap = c.getSnapshot();
    expect(snap.revision).toBe(1);
    expect(snap.state.camera?.position[2]).toBeCloseTo(0.29);
    expect(snap.derived.floor?.planeId).toBe('floor');
    // Nothing new: no publish, same snapshot object for React.
    vi.advanceTimersByTime(500);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot()).toBe(snap);
  });

  it('ignores anchors that are not planes and removes anchors by id', () => {
    const c = new ScanController();
    c.onAnchorFound({ anchorId: 'img', type: 'image', position: [0, 0, 0], rotation: [0, 0, 0] });
    c.onAnchorFound(floorAnchor('floor', 0));
    c.flush();
    expect(Object.keys(c.getSnapshot().state.planes)).toEqual(['floor']);
    c.onAnchorRemoved({ anchorId: 'floor' });
    c.onAnchorRemoved(undefined);
    c.flush();
    expect(c.getSnapshot().state.planes).toEqual({});
  });

  it('publishes marks, Undo and the ceiling skip at once', () => {
    const { c } = started();
    c.onCameraTransformUpdate(aimedCamera(EYE, [-1, 0, -1.75]));
    c.flush();
    const listener = vi.fn();
    c.subscribe(listener);
    expect(c.mark()).toMatchObject({ kind: 'marked', step: 'first-wall' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().state.marks).toHaveLength(1);
    c.onCameraTransformUpdate(aimedCamera(EYE, [1, 0, -1.75]));
    expect(c.mark()).toMatchObject({ kind: 'marked', step: 'second-mark' });
    c.skipCeiling();
    expect(c.getSnapshot().derived.step).toBe('walls');
    c.undo();
    expect(c.getSnapshot().derived.step).toBe('ceiling');
    // The second mark published the pending camera first, then itself.
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('takes the aim from just before the finger touched Mark', () => {
    const { c, clock } = started();
    // Held steady on the bottom of the wall...
    for (let t = 1000; t <= 1150; t += 16) {
      clock.t = t;
      c.onCameraTransformUpdate(aimedCamera(EYE, [0, 0, -1.75]));
    }
    c.holdAim();
    // ...then the tap jolts the phone up the wall before the press ends.
    clock.t = 1250;
    c.onCameraTransformUpdate(aimedCamera(EYE, [0, 0.4, -1.75]));
    const outcome = c.mark();
    expect(outcome.kind).toBe('marked');
    const point = c.getSnapshot().derived.firstWall.a!;
    expect(point.z).toBeCloseTo(-1.75, 6);
  });

  it('keeps what the scan log needs', () => {
    const { c, clock } = started();
    c.onAnchorFound(floorAnchor('bed', 0.55, { x: 1, z: 1, size: 1.6 }));
    c.onAnchorRemoved({ anchorId: 'bed' });
    clock.t = 600;
    c.onCameraTransformUpdate(aimedCamera(EYE, [0, 2, -1.75]));
    expect(c.mark()).toMatchObject({ kind: 'error', error: 'aim-lower' });
    expect(c.finish()).toMatchObject({ ok: false });
    const r = c.record();
    expect(r.planes.map((p) => [p.plane.id, p.removed])).toEqual([
      ['floor', false],
      ['bed', true],
    ]);
    expect(r.refusedMarks).toEqual({ 'aim-lower': 1 });
    expect(r.finishes).toEqual([{ t: 600, ok: false, reason: expect.any(String) }]);
    expect(r.floorEvents).toEqual([
      { t: 0, floor: { y: 0, planeId: 'floor', classification: 'None' } },
    ]);
    expect(r.poses).toHaveLength(2 * POSE_STRIDE);
    expect(r.poses.slice(POSE_STRIDE, POSE_STRIDE + 4)).toEqual([600, 0, 1.4, 0]);
  });

  it('samples the camera about twice a second, thinning out on long scans', () => {
    const { c, clock } = started();
    for (let t = 0; t < 2 * MAX_POSE_SAMPLES * 500; t += 100) {
      clock.t = t;
      c.onCameraTransformUpdate(aimedCamera(EYE, [0, 0, -1]));
    }
    const poses = c.record().poses;
    const n = poses.length / POSE_STRIDE;
    expect(n).toBeLessThan(MAX_POSE_SAMPLES);
    expect(n).toBeGreaterThan(MAX_POSE_SAMPLES / 2 - 2);
    // Still from the start to the end of the scan.
    expect(poses[0]).toBe(0);
    expect(poses[(n - 1) * POSE_STRIDE]).toBeGreaterThan(0.9 * 2 * MAX_POSE_SAMPLES * 500);
  });

  it('stops publishing to old listeners once disposed, and serves new ones', () => {
    const c = new ScanController();
    const listener = vi.fn();
    c.subscribe(listener);
    c.onAnchorFound(floorAnchor('floor', 0));
    c.dispose();
    vi.advanceTimersByTime(1000);
    c.onAnchorFound(floorAnchor('other', -1));
    c.flush();
    expect(listener).not.toHaveBeenCalled();
    // A remounted screen subscribes again and gets updates.
    const again = vi.fn();
    c.subscribe(again);
    c.onTrackingUpdated(3, 1);
    vi.advanceTimersByTime(100);
    expect(again).toHaveBeenCalledTimes(1);
    expect(Object.keys(c.getSnapshot().state.planes).sort()).toEqual(['floor', 'other']);
  });
});
