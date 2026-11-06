import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArController, LOST_FOR_MS } from '@/ar/controller';
import { aimedCamera, cameraEvent, floorAnchor, type V3 } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const EYE: V3 = [0, 1.4, 0];

describe('ArController', () => {
  it('finds the floor with the scan’s floor finder and coaches until then', () => {
    const c = new ArController();
    c.onCameraTransformUpdate(aimedCamera(EYE, [0, 0, -2]));
    c.flush();
    expect(c.getSnapshot().derived.coaching?.kind).toBe('starting');
    c.onTrackingUpdated(3, 1);
    // A bed is not the floor.
    c.onAnchorFound(floorAnchor('bed', 0.55, { classification: 'None' }));
    c.flush();
    expect(c.getSnapshot().derived.floorStatus).toBe('too-high');
    expect(c.getSnapshot().derived.aim).toEqual({ ok: false, reason: 'no-floor' });
    c.onAnchorFound(floorAnchor('floor', 0));
    vi.advanceTimersByTime(100);
    const d = c.getSnapshot().derived;
    expect(d.coaching).toBeNull();
    expect(d.floorY).toBe(0);
    expect(d.aim.ok).toBe(true);
    if (d.aim.ok) {
      expect(d.aim.point.z).toBeCloseTo(-2);
      expect(d.aim.distance).toBeCloseTo(2);
    }
  });

  it('says "Move slowly" when tracking is limited by motion', () => {
    const c = new ArController();
    c.onTrackingUpdated(2, 2);
    c.flush();
    expect(c.getSnapshot().derived.coaching?.title).toBe('Move slowly');
  });

  it('says the camera is starting, not "Move slowly", until tracking first works', () => {
    const c = new ArController();
    // ARKit and ARCore start out limited, with no reason given.
    c.onTrackingUpdated(2, 1);
    c.flush();
    expect(c.getSnapshot().derived.coaching?.kind).toBe('starting');
    expect(c.getSnapshot().derived.coaching?.title).toBe('Starting the camera…');
    c.onTrackingUpdated(1, 1);
    c.flush();
    expect(c.getSnapshot().derived.coaching?.kind).toBe('starting');
    c.onTrackingUpdated(3, 1);
    c.flush();
    expect(c.getSnapshot().state.trackedOnce).toBe(true);
    expect(c.getSnapshot().derived.coaching).toBeNull();
    // Lost later: now it is the user's movement.
    c.onTrackingUpdated(2, 1);
    c.flush();
    expect(c.getSnapshot().derived.coaching?.kind).toBe('move-slowly');
  });

  it('still asks for light while starting in a dark room', () => {
    const c = new ArController();
    c.onAmbientLightUpdate({ intensity: 40 });
    c.onTrackingUpdated(2, 1);
    c.flush();
    expect(c.getSnapshot().derived.coaching?.kind).toBe('more-light');
  });

  it('has finished starting when it takes over a scan that was tracking', () => {
    const c = new ArController();
    c.seed({
      planes: {},
      camera: null,
      tracking: { state: 3, reason: 1 },
      lightIntensity: 900,
      floor: null,
    });
    expect(c.getSnapshot().state.trackedOnce).toBe(true);
    c.onTrackingUpdated(2, 1);
    c.flush();
    expect(c.getSnapshot().derived.coaching?.kind).toBe('move-slowly');
  });

  it('only reaches the floor in front of the phone', () => {
    const c = new ArController();
    c.onTrackingUpdated(3, 1);
    c.onAnchorFound(floorAnchor('floor', 0));
    c.onCameraTransformUpdate(cameraEvent(EYE, [0, 0.2, -1]));
    c.flush();
    expect(c.getSnapshot().derived.aim).toEqual({ ok: false, reason: 'aim-lower' });
    c.onCameraTransformUpdate(cameraEvent(EYE, [0, -0.1, -1]));
    c.flush();
    expect(c.getSnapshot().derived.aim).toEqual({ ok: false, reason: 'too-far' });
  });

  it('counts tracking that came back after being lost for a while', () => {
    const clock = { t: 0 };
    const c = new ArController({ now: () => clock.t });
    c.onTrackingUpdated(3, 1);
    c.onTrackingUpdated(2, 1);
    clock.t = 300;
    c.onTrackingUpdated(3, 1); // a short blip does not count
    c.flush();
    expect(c.getSnapshot().state.recoveries).toBe(0);
    clock.t = 1000;
    c.onTrackingUpdated(1, 1);
    clock.t = 1000 + LOST_FOR_MS + 200;
    c.onTrackingUpdated(3, 1);
    c.flush();
    expect(c.getSnapshot().state.recoveries).toBe(1);
    expect(c.getSnapshot().state.limitedSince).toBeNull();
  });

  it('takes the aim from just before the finger touched', () => {
    const clock = { t: 0 };
    const c = new ArController({ now: () => clock.t });
    c.onAnchorFound(floorAnchor('floor', 0));
    for (let i = 0; i < 6; i++) {
      clock.t = i * 30;
      c.onCameraTransformUpdate(aimedCamera(EYE, [1, 0, -2]));
    }
    c.holdAim();
    // The tap shakes the phone toward somewhere else.
    clock.t = 200;
    c.onCameraTransformUpdate(aimedCamera(EYE, [-1, 0, -1]));
    const ray = c.takeAim()!;
    const t = -ray.origin[1] / ray.direction[1];
    expect(ray.origin[0] + ray.direction[0] * t).toBeCloseTo(1, 6);
    expect(ray.origin[2] + ray.direction[2] * t).toBeCloseTo(-2, 6);
    // Without a hold, the aim is the camera now.
    const now = c.takeAim()!;
    expect(now.direction[0]).toBeLessThan(0);
  });

  it('takes over the floor and the planes from a scan in the same session', () => {
    const scan = new ArController();
    scan.onTrackingUpdated(3, 1);
    scan.onCameraTransformUpdate(aimedCamera(EYE, [0, 0, -2]));
    scan.onAnchorFound(floorAnchor('floor', -0.02));
    scan.flush();
    const s = scan.getSnapshot().state;
    const c = new ArController();
    const listener = vi.fn();
    c.subscribe(listener);
    c.seed({
      planes: s.planes,
      camera: s.camera,
      tracking: s.tracking,
      lightIntensity: s.lightIntensity,
      floor: s.floor,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(c.getSnapshot().derived.floorY).toBe(-0.02);
    expect(c.getSnapshot().derived.aim.ok).toBe(true);
  });

  it('forgets removed planes and finds no floor without them', () => {
    const c = new ArController();
    c.onCameraTransformUpdate(aimedCamera(EYE, [0, 0, -2]));
    c.onAnchorFound(floorAnchor('floor', 0));
    c.onAnchorRemoved({ anchorId: 'floor' });
    c.onAnchorRemoved({ anchorId: 'nothing' });
    c.flush();
    expect(c.getSnapshot().state.planes).toEqual({});
    // The floor keeps its height when its plane goes away (scan/floor.ts).
    expect(c.getSnapshot().derived.floorY).toBe(0);
  });
});
