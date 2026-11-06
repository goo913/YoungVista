import {
  applyLineUp,
  itemFootprint,
  lineUpFromCorners,
  roomFromPoints,
  scaleRoom,
  type LineUp,
  type PlacementProduct,
  type ProductLookup,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { freeRoom } from '@/ar/free-room';
import {
  onFloor,
  placementPose,
  poseInRoom,
  poseInWorld,
  rayFloorHit,
  rayThrough,
  rayToRoom,
  roomToWorld,
  scanLineUp,
  scanLineUpOffset,
  worldToRoom,
} from '@/ar/pose';
import {
  initialDesignState,
  placeAt,
  reduceDesign,
  type DesignContext,
} from '@/furnish/design-state';
import { pickBox } from '@/furnish/orbit';

// A 5 × 4 m room: x from 0 to 5, z from 0 to 4.
const room = roomFromPoints([
  [0, 0],
  [5, 0],
  [5, 4],
  [0, 4],
]);

/** The room turned 30° and moved, as it might stand in an AR session, 1.3 m below the phone. */
const lineUp: LineUp = { rotationY: 30, x: 2, y: -1.3, z: -1 };

const PRODUCTS: Record<string, PlacementProduct> = {
  sofa: { dimensions: { w: 2, d: 0.9, h: 0.8 }, category: 'sofa' },
  chair: { dimensions: { w: 0.5, d: 0.5, h: 0.9 }, category: 'dining-chair' },
};
const product: ProductLookup = (id) => PRODUCTS[id];

describe('AR world and room space', () => {
  it('carries floor points both ways', () => {
    for (const p of [
      { x: 0, z: 0 },
      { x: 5, z: 4 },
      { x: 1.2, z: 3.3 },
    ]) {
      const w = roomToWorld(lineUp, p);
      expect(w[1]).toBe(-1.3);
      const back = worldToRoom(lineUp, { x: w[0], z: w[2] });
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.z).toBeCloseTo(p.z, 9);
    }
  });

  it('turns a piece moved in AR back into the pose the design saves', () => {
    const saved = { x: 1.5, z: 2.5, rotationY: 90 };
    const inWorld = poseInWorld(lineUp, saved);
    expect(inWorld.rotationY).toBeCloseTo(120);
    // The user drags it 40 cm along the world's +X and turns it 15° more, in AR.
    const moved = { x: inWorld.x + 0.4, z: inWorld.z, rotationY: inWorld.rotationY + 15 };
    const back = poseInRoom(lineUp, moved);
    expect(back.rotationY).toBeCloseTo(105);
    // 40 cm along the world's +X is 40 cm in the room too, turned by -30°.
    expect(Math.hypot(back.x - saved.x, back.z - saved.z)).toBeCloseTo(0.4, 9);
    expect(back.x - saved.x).toBeCloseTo(0.4 * Math.cos((30 * Math.PI) / 180), 9);
  });

  it('turns a ray from the phone into room space, so it hits the same spot', () => {
    // The phone 1.4 m above the floor at the room's (1, 1), looking down at the room's (3, 2).
    const eye = roomToWorld(lineUp, { x: 1, z: 1 }, 1.4);
    const target = roomToWorld(lineUp, { x: 3, z: 2 });
    const ray = rayThrough(eye, target)!;
    const inRoom = rayToRoom(lineUp, ray);
    expect(inRoom.origin[1]).toBeCloseTo(1.4, 9);
    const hit = rayFloorHit(inRoom)!;
    expect(hit.x).toBeCloseTo(3, 9);
    expect(hit.z).toBeCloseTo(2, 9);
  });

  it('picks the piece under the finger through the line-up', () => {
    const chair = { id: 'c', x: 3, z: 2, rotationY: 0 };
    const boxes = [
      { id: 'c', footprint: itemFootprint(chair, { w: 0.5, d: 0.5 }), y: 0, height: 0.9 },
    ];
    const eye = roomToWorld(lineUp, { x: 1, z: 1 }, 1.4);
    const at = (p: { x: number; z: number }, h = 0.5) =>
      rayToRoom(lineUp, rayThrough(eye, roomToWorld(lineUp, p, h))!);
    expect(pickBox(at({ x: 3, z: 2 }), boxes)).toBe('c');
    // Along z = 1, the ray passes in front of the chair (z 1.75 to 2.25).
    expect(pickBox(at({ x: 4, z: 1 }, 0), boxes)).toBeNull();
  });

  it('only reaches the floor in front of the phone and within reach', () => {
    expect(rayFloorHit({ origin: [0, 1.4, 0], dir: [0, 1, 0] })).toBeNull();
    expect(rayFloorHit({ origin: [0, 1.4, 0], dir: [1, -0.01, 0] })).toBeNull();
    expect(
      rayFloorHit({ origin: [0, 1.4, 0], dir: [Math.SQRT1_2, -Math.SQRT1_2, 0] })?.x,
    ).toBeCloseTo(1.4);
    expect(rayThrough([0, 0, 0], [0, 0, 0])).toBeNull();
  });

  it('turns a new piece to face the phone', () => {
    // The dot on the floor 2 m along the world's -Z of the phone: the piece faces +Z, back at the
    // phone, which in a room turned by 30° is rotationY -30 (330).
    const pose = placementPose(lineUp, { x: 0, z: -2 }, { x: 0, z: 0 });
    expect(pose.rotationY).toBeCloseTo(330);
    const world = poseInWorld(lineUp, pose);
    expect(world.x).toBeCloseTo(0, 9);
    expect(world.z).toBeCloseTo(-2, 9);
    expect(world.rotationY).toBeCloseTo(0, 9);
  });
});

describe('right after a scan', () => {
  it('uses the scan’s world frame as it is, on the floor', () => {
    const l = scanLineUp(-1.32);
    expect(applyLineUp(l, { x: 1.2, z: -3.4 })).toEqual({ x: 1.2, z: -3.4 });
    expect(l.y).toBe(-1.32);
    expect(onFloor(l, -1.3).y).toBe(-1.3);
    expect(onFloor(l, -1.32)).toBe(l);
  });

  it('knows how far off a room rescaled to a tape measure can be', () => {
    expect(scanLineUpOffset(room, 1)).toBe(0);
    // 3% bigger about its middle: the corners, 3.2 m from the middle, moved by 3.2 × (1 − 1/1.03).
    const bigger = scaleRoom(room, 1.03);
    const far = Math.hypot(2.5, 2) * 1.03;
    expect(scanLineUpOffset(bigger, 1.03)).toBeCloseTo(far * (1 - 1 / 1.03), 9);
    // That is the gap between a rescaled corner and where the scan saw it.
    const seen = room.points[2]!;
    const saved = bigger.points[2]!;
    expect(Math.hypot(saved[0] - seen[0], saved[1] - seen[1])).toBeCloseTo(
      scanLineUpOffset(bigger, 1.03),
      9,
    );
  });

  it('agrees with a two-corner line-up of the unscaled room', () => {
    const r = lineUpFromCorners(
      [room.points[0]!, room.points[1]!],
      [room.points[0]!, room.points[1]!],
      {
        floorY: -1.32,
      },
    )!;
    expect(r.quality).toBe('good');
    expect(r.rotationY).toBeCloseTo(0);
    expect(r.x).toBeCloseTo(0);
    expect(r.z).toBeCloseTo(0);
  });
});

describe('placing at the dot', () => {
  const ctx = (items = initialDesignState().items) => ({ room, items, product });

  it('puts a piece where the dot is when it is free', () => {
    const spot = placeAt('chair', { x: 2.5, z: 2, rotationY: 0 }, ctx())!;
    expect(spot.valid).toBe(true);
    expect(spot.x).toBeCloseTo(2.5);
    expect(spot.z).toBeCloseTo(2);
  });

  it('snaps to a wall the dot is close to', () => {
    const spot = placeAt('sofa', { x: 2.5, z: 0.5, rotationY: 180 }, ctx())!;
    expect(spot.valid).toBe(true);
    expect(spot.snappedWall).not.toBeNull();
    expect(spot.z).toBeCloseTo(0.45);
  });

  it('takes the nearest free spot when the dot is on another piece', () => {
    const items = [{ id: 'a', productId: 'chair', x: 2.5, z: 2, rotationY: 0 }];
    const spot = placeAt('chair', { x: 2.5, z: 2, rotationY: 0 }, ctx(items))!;
    expect(spot.valid).toBe(true);
    const d = Math.hypot(spot.x - 2.5, spot.z - 2);
    expect(d).toBeGreaterThanOrEqual(0.49);
    expect(d).toBeLessThan(0.75);
  });

  it('adds through the design reducer and selects the new piece', () => {
    const c: DesignContext = { room, product, newId: () => 'n1' };
    const s = reduceDesign(
      initialDesignState(),
      { type: 'add', productId: 'chair', at: { x: 1, z: 3, rotationY: 33 } },
      c,
    );
    expect(s.items).toEqual([{ id: 'n1', productId: 'chair', x: 1, z: 3, rotationY: 30 }]);
    expect(s.selectedId).toBe('n1');
    expect(s.version).toBe(1);
  });

  it('places freely in the open square, with the same rules', () => {
    const free = freeRoom();
    const c: DesignContext = { room: free, product, newId: () => 'f1' };
    let s = reduceDesign(
      initialDesignState(),
      { type: 'add', productId: 'sofa', at: { x: 0.4, z: -2.1, rotationY: 8 } },
      c,
    );
    expect(s.items[0]).toMatchObject({ x: 0.4, z: -2.1, rotationY: 15 });
    // A second sofa on top of it moves to the nearest free spot.
    s = reduceDesign(
      s,
      { type: 'add', productId: 'sofa', at: { x: 0.4, z: -2.1, rotationY: 8 } },
      {
        ...c,
        newId: () => 'f2',
      },
    );
    expect(s.items).toHaveLength(2);
    const [a, b] = s.items;
    expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeGreaterThan(0.85);
  });
});
