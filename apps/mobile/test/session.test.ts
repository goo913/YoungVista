import { isBuildRoomFailure, roomArea } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  buildScannedRoom,
  cancelPendingTap,
  createScanState,
  deriveScan,
  findFloor,
  markWallPoint,
  removePlane,
  scanFailureMessage,
  setCamera,
  setOptions,
  setTracking,
  undoLastTapWall,
  upsertPlane,
  type ScanState,
} from '@/scan/session';
import { planeFromViroAnchor } from '@/scan/viro-anchor';
import { floorAnchor, lookAt, pose, squareRoomWalls, wallAnchor } from './helpers';

const EYE: [number, number, number] = [0, 1.5, 0];

function withAnchors(state: ScanState, ...anchors: unknown[]): ScanState {
  return anchors.reduce<ScanState>((s, a) => {
    const plane = planeFromViroAnchor(a);
    if (!plane) throw new Error('test anchor is not a plane');
    return upsertPlane(s, plane);
  }, state);
}

const tracking = { state: 3, reason: 1 };

/** A session with the phone at eye height in the middle of the room, looking north. */
const started = () => setTracking(setCamera(createScanState(), pose(EYE, [0, -0.3, -1])), tracking);

/** Points the phone at the floor point (x, z) and marks it. */
function tapAt(state: ScanState, x: number, z: number) {
  return markWallPoint(setCamera(state, pose(EYE, lookAt(EYE, x, z))));
}

describe('finding the floor', () => {
  it('uses the lowest upward horizontal plane below the phone', () => {
    const s = withAnchors(
      started(),
      floorAnchor('table', 0.75),
      floorAnchor('floor', 0.02),
      floorAnchor('ceiling', 2.5, { alignment: 'Horizontal', classification: 'None' }),
      floorAnchor('under', -0.6, { alignment: 'HorizontalDownward' }),
      floorAnchor('speck', -0.3, { size: 0.1 }),
    );
    expect(findFloor(s)).toEqual({ y: 0.02, planeId: 'floor' });
  });

  it('accepts iPhone "Horizontal" planes but not ones classified as ceiling', () => {
    const s = withAnchors(
      createScanState(),
      floorAnchor('floor', 0, { alignment: 'Horizontal', classification: 'None' }),
      floorAnchor('ceiling', -1, { alignment: 'Horizontal', classification: 'Ceiling' }),
    );
    expect(findFloor(s)?.planeId).toBe('floor');
  });

  it('shows "Looking for the floor…" and no walls until the floor is found', () => {
    const s = withAnchors(started(), ...squareRoomWalls());
    const d = deriveScan(s);
    expect(d.floor).toBeNull();
    expect(d.coaching.title).toBe('Looking for the floor…');
    expect(d.observations).toEqual([]);
    expect(d.coverage).toBeNull();
  });
});

describe('automatic walls', () => {
  it('turns vertical planes into walls, closes the room and builds it', () => {
    const s = withAnchors(started(), floorAnchor('floor', 0), ...squareRoomWalls());
    const d = deriveScan(s);
    expect(d.observations.map((o) => o.id).sort()).toEqual(['east', 'north', 'south', 'west']);
    expect(d.walls).toHaveLength(4);
    expect(d.coverage?.closed).toBe(true);
    expect(d.coaching.kind).toBe('aim-at-wall');
    expect(d.turn).toBeNull();

    const built = buildScannedRoom(s, d, 2.7);
    expect(isBuildRoomFailure(built)).toBe(false);
    if (isBuildRoomFailure(built)) return;
    expect(built.room.points).toHaveLength(4);
    expect(roomArea(built.room)).toBeCloseTo(16, 1);
    expect(built.room.ceilingHeight).toBe(2.7);
    expect(built.observedWallCount).toBe(4);
  });

  it('places each wall where its plane meets the floor', () => {
    const s = withAnchors(started(), floorAnchor('floor', 0), wallAnchor('west', -2, 0, 90, 3));
    const [west] = deriveScan(s).observations;
    expect(west?.a.x).toBeCloseTo(-2);
    expect(west?.b.x).toBeCloseTo(-2);
    expect(Math.abs((west?.a.z ?? 0) - (west?.b.z ?? 0))).toBeCloseTo(3);
  });

  it('replaces an updated anchor and forgets a removed one', () => {
    let s = withAnchors(started(), floorAnchor('floor', 0), ...squareRoomWalls());
    s = withAnchors(s, wallAnchor('north', 0, -2, 0, 1));
    const north = deriveScan(s).observations.find((o) => o.id === 'north');
    expect(Math.abs((north?.b.x ?? 0) - (north?.a.x ?? 0))).toBeCloseTo(1);

    s = removePlane(s, 'east');
    const d = deriveScan(s);
    expect(d.observations.map((o) => o.id)).not.toContain('east');
    expect(d.coverage?.closed).toBe(false);
    expect(d.turn?.direction).toBeDefined();
    expect(removePlane(s, 'missing')).toBe(s);
  });

  it('explains when there are not enough walls yet', () => {
    const s = withAnchors(started(), floorAnchor('floor', 0), wallAnchor('north', 0, -2, 0, 3.6));
    const built = buildScannedRoom(s);
    expect(isBuildRoomFailure(built)).toBe(true);
    if (!isBuildRoomFailure(built)) return;
    expect(scanFailureMessage(built)).toMatch(/^Only 1 wall found/);
    expect(isBuildRoomFailure(buildScannedRoom(started()))).toBe(true);
  });

  it('uses the chosen Euler order for Viro rotations', () => {
    let s = withAnchors(started(), floorAnchor('floor', 0), wallAnchor('west', -2, 0, 90, 3));
    const yxz = deriveScan(s).observations[0];
    s = setOptions(s, { eulerOrder: 'XYZ' });
    const xyz = deriveScan(s).observations[0];
    // For this plane XYZ lays the wall along X instead of Z: the debug overlay shows both.
    expect(Math.abs((yxz?.a.z ?? 0) - (yxz?.b.z ?? 0))).toBeCloseTo(3);
    expect(Math.abs((xyz?.a.z ?? 0) - (xyz?.b.z ?? 0))).toBeCloseTo(0);
  });
});

describe('tap twice at the bottom of a wall', () => {
  const ready = () => withAnchors(started(), floorAnchor('floor', 0));

  it('needs the camera and the floor first', () => {
    expect(markWallPoint(createScanState()).outcome).toMatchObject({ error: 'no-camera' });
    expect(markWallPoint(started()).outcome).toMatchObject({
      kind: 'error',
      error: 'no-floor',
      message: 'Find the floor first: point the phone at the floor and move it slowly.',
    });
  });

  it('asks to aim lower when the dot is above the floor', () => {
    const s = setCamera(ready(), pose(EYE, [0, 0.2, -1]));
    expect(markWallPoint(s).outcome).toMatchObject({ error: 'aim-lower' });
  });

  it('makes a wall from two taps', () => {
    const first = tapAt(ready(), -1, -2);
    expect(first.outcome.kind).toBe('first-point');
    const d1 = deriveScan(first.state);
    expect(d1.pendingPoint?.x).toBeCloseTo(-1);
    expect(d1.pendingPoint?.z).toBeCloseTo(-2);

    const second = tapAt(first.state, 1, -2);
    expect(second.outcome).toEqual({ kind: 'wall-added', wallId: 'tap-1' });
    const d2 = deriveScan(second.state);
    expect(d2.pendingPoint).toBeNull();
    const wall = d2.observations.find((o) => o.id === 'tap-1');
    expect(wall?.source).toBe('tap');
    expect(wall?.a.x).toBeCloseTo(-1);
    expect(wall?.b.x).toBeCloseTo(1);
    expect(wall?.b.z).toBeCloseTo(-2);
  });

  it('refuses a second tap on the same spot', () => {
    const first = tapAt(ready(), -1, -2);
    const again = tapAt(first.state, -1.1, -2);
    expect(again.outcome).toMatchObject({ error: 'too-close' });
    expect(again.state.pendingTap).not.toBeNull();
  });

  it('can cancel the first tap and undo the last wall', () => {
    const first = tapAt(ready(), -1, -2);
    expect(cancelPendingTap(first.state).pendingTap).toBeNull();
    const done = tapAt(first.state, 1, -2).state;
    expect(undoLastTapWall(done).tapWalls).toHaveLength(0);
    const next = tapAt(tapAt(undoLastTapWall(done), 0, 2).state, 1, 2);
    expect(next.outcome).toEqual({ kind: 'wall-added', wallId: 'tap-2' });
  });

  it('moves tapped walls onto the floor when a lower floor turns up', () => {
    // Only a table top is known: the taps land on its height first.
    let s = withAnchors(started(), floorAnchor('table', 0.75));
    s = tapAt(s, -1, -2).state; // the camera aims at the real floor point...
    s = tapAt(s, 1, -2).state;
    const onTable = deriveScan(s).observations[0];
    expect(onTable?.a.z).toBeCloseTo(-2 * (0.75 / 1.5));

    s = withAnchors(s, floorAnchor('floor', 0));
    const onFloor = deriveScan(s).observations[0];
    expect(onFloor?.a.z).toBeCloseTo(-2);
    expect(onFloor?.b.x).toBeCloseTo(1);
  });

  it('closes a room together with the walls found automatically', () => {
    let s = withAnchors(
      started(),
      floorAnchor('floor', 0),
      wallAnchor('north', 0, -2, 0, 3.6),
      wallAnchor('south', 0, 2, 180, 3.6),
      wallAnchor('east', 2, 0, -90, 3.6),
    );
    expect(deriveScan(s).coverage?.closed).toBe(false);
    // The plain white west wall was missed: mark its bottom at two spots.
    s = tapAt(s, -2, -1.2).state;
    s = tapAt(s, -2, 1.2).state;
    const d = deriveScan(s);
    expect(d.coverage?.closed).toBe(true);
    const built = buildScannedRoom(s, d);
    expect(isBuildRoomFailure(built) ? built.reason : roomArea(built.room)).toBeCloseTo(16, 1);
  });
});
