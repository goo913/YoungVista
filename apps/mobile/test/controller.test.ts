import { isBuildRoomFailure } from '@youngvista/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanController } from '@/scan/controller';
import { cameraEvent, floorAnchor, lookAt, squareRoomWalls } from './helpers';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ScanController', () => {
  it('publishes Viro events at most every throttle interval', () => {
    const c = new ScanController({ throttleMs: 100 });
    const listener = vi.fn();
    c.subscribe(listener);
    for (let i = 0; i < 30; i++)
      c.onCameraTransformUpdate(cameraEvent([0, 1.5, i / 100], [0, 0, -1]));
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

  it('records tracking, light and taps; taps publish at once', () => {
    const c = new ScanController();
    const listener = vi.fn();
    c.subscribe(listener);
    const eye: [number, number, number] = [0, 1.5, 0];
    c.onTrackingUpdated(3, 1);
    c.onAmbientLightUpdate({ intensity: 640, color: '#ffffff' });
    c.onAnchorFound(floorAnchor('floor', 0));
    c.onCameraTransformUpdate(cameraEvent(eye, lookAt(eye, -1, -2)));
    expect(c.markWallPoint().kind).toBe('first-point');
    expect(listener).toHaveBeenCalledTimes(1);
    c.onCameraTransformUpdate(cameraEvent(eye, lookAt(eye, 1, -2)));
    expect(c.markWallPoint()).toEqual({ kind: 'wall-added', wallId: 'tap-1' });
    const { state, derived } = c.getSnapshot();
    expect(state.tracking).toEqual({ state: 3, reason: 1 });
    expect(state.lightIntensity).toBe(640);
    expect(derived.observations.map((o) => o.id)).toEqual(['tap-1']);
    c.undoLastTapWall();
    expect(c.getSnapshot().derived.observations).toEqual([]);
  });

  it('builds the room from what it has seen', () => {
    const c = new ScanController();
    c.onCameraTransformUpdate(cameraEvent([0, 1.5, 0], [0, -0.2, -1]));
    c.onAnchorFound(floorAnchor('floor', 0));
    for (const wall of squareRoomWalls()) c.onAnchorFound(wall);
    const built = c.buildRoom(2.6);
    expect(isBuildRoomFailure(built)).toBe(false);
    expect(c.getSnapshot().derived.coverage?.closed).toBe(true);
  });

  it('changes the Euler order on request', () => {
    const c = new ScanController();
    c.setOptions({ eulerOrder: 'ZYX' });
    expect(c.getSnapshot().state.options).toEqual({ eulerOrder: 'ZYX', horizontalAxis: 'auto' });
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
