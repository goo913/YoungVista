import { describe, expect, it } from 'vitest';
import {
  clampInsideRoom,
  facingRotation,
  findFreeSpot,
  footprintInRoom,
  footprintsOverlap,
  frontDirection,
  isFlatProduct,
  itemFootprint,
  normalizeDegrees,
  placeNewItem,
  pointInRoom,
  productLookup,
  resolvePlacement,
  roomCenter,
  roomFromPoints,
  roomRotationBase,
  signedArea,
  snapRotation,
  snapToWall,
  type CatalogItem,
  type DesignItem,
  type PlacementContext,
  type PlacementProduct,
} from '../src';
import { lShape, rectangle, rotate, thinL } from './helpers';

// 4 × 3 m room. Walls (counter-clockwise): w1 along z = 3, w2 along x = 4, w3 along z = 0,
// w4 along x = 0.
const room = roomFromPoints(rectangle(4, 3));
const wallId = (z: number | null, x: number | null) =>
  room.walls.find((w) => {
    const [ax, az] = room.points[w.a]!;
    const [bx, bz] = room.points[w.b]!;
    return z !== null ? az === z && bz === z : ax === x && bx === x;
  })!.id;
const NORTH = wallId(0, null); // z = 0, faces +Z into the room
const SOUTH = wallId(3, null);
const WEST = wallId(null, 0);

const sofa = { w: 2, d: 0.9 };

const products: Record<string, PlacementProduct> = {
  sofa: { dimensions: { w: 2, d: 0.9, h: 0.85 }, placement: 'floor', category: 'sofa' },
  chair: { dimensions: { w: 0.5, d: 0.5, h: 0.9 }, placement: 'floor', category: 'dining-chair' },
  rug: { dimensions: { w: 2, d: 1.4, h: 0.01 }, placement: 'floor', category: 'rug' },
  table: { dimensions: { w: 1.2, d: 0.8, h: 0.75 }, placement: 'floor', category: 'dining-table' },
  lamp: { dimensions: { w: 0.3, d: 0.3, h: 0.5 }, placement: 'tabletop', category: 'floor-lamp' },
  huge: { dimensions: { w: 5, d: 5, h: 1 }, placement: 'floor', category: 'sectional' },
};
const ctx = (items: DesignItem[] = []): PlacementContext => ({
  room,
  items,
  product: (id) => products[id],
});
const item = (id: string, productId: string, x: number, z: number, rotationY = 0): DesignItem => ({
  id,
  productId,
  x,
  z,
  rotationY,
});

describe('rotation helpers', () => {
  it('wraps and snaps degrees in 15° steps', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(720)).toBe(0);
    expect(snapRotation(7)).toBe(0);
    expect(snapRotation(8)).toBe(15);
    expect(snapRotation(-8)).toBe(345);
    expect(snapRotation(353)).toBe(0);
    expect(snapRotation(20, 15, 8)).toBe(23);
    expect(snapRotation(33, 0)).toBe(33);
  });

  it('turns an item to face a direction (front is +Z at 0°, +X at 90°)', () => {
    expect(facingRotation({ x: 0, z: 1 })).toBe(0);
    expect(facingRotation({ x: 1, z: 0 })).toBe(90);
    expect(facingRotation({ x: 0, z: -1 })).toBe(180);
    expect(facingRotation({ x: -1, z: 0 })).toBe(270);
    const f = frontDirection(90);
    expect(f.x).toBeCloseTo(1, 12);
    expect(f.z).toBeCloseTo(0, 12);
  });

  it('lines rotation steps up with the room walls', () => {
    expect(roomRotationBase(room)).toBe(0);
    // The helper turns +X toward +Z, which is -23° about +Y: steps fall on 7°, 22°, 37°...
    expect(roomRotationBase(roomFromPoints(rotate(rectangle(4, 3), 23)))).toBeCloseTo(7, 9);
  });
});

describe('itemFootprint', () => {
  it('builds the rotated rectangle with corners counter-clockwise', () => {
    const fp = itemFootprint({ x: 1, z: 2, rotationY: 0 }, sofa);
    expect(fp.corners.map((c) => [c.x, c.z])).toEqual([
      [0, 1.55],
      [0, 2.45],
      [2, 2.45],
      [2, 1.55],
    ]);
    const turned = itemFootprint({ x: 0, z: 0, rotationY: 90 }, sofa);
    expect(turned.axisZ.x).toBeCloseTo(1, 12);
    expect(turned.halfWidth).toBe(1);
    expect(signedArea(turned.corners)).toBeCloseTo(2 * 0.9, 12);
    const xs = turned.corners.map((c) => c.x);
    expect(Math.max(...xs)).toBeCloseTo(0.45, 12);
  });
});

describe('inside the room', () => {
  it('tests points with a tolerance', () => {
    expect(pointInRoom(room, { x: 1, z: 1 })).toBe(true);
    expect(pointInRoom(room, { x: 4.005, z: 1 })).toBe(false);
    expect(pointInRoom(room, { x: 4.005, z: 1 }, 0.01)).toBe(true);
  });

  it('lets an item touch a wall or poke in by up to the tolerance', () => {
    const at = (x: number) => itemFootprint({ x, z: 1.5, rotationY: 0 }, sofa);
    expect(footprintInRoom(room, at(2))).toBe(true);
    expect(footprintInRoom(room, at(1))).toBe(true); // flush with x = 0
    expect(footprintInRoom(room, at(0.995))).toBe(true); // 5 mm in
    expect(footprintInRoom(room, at(0.98))).toBe(false); // 2 cm in
    expect(footprintInRoom(room, at(0.98), 0.03)).toBe(true);
    expect(footprintInRoom(room, at(-3))).toBe(false); // outside altogether
  });

  it('works in concave rooms', () => {
    const l = roomFromPoints(lShape); // 6 × 6 with the x > 3, z > 3 quarter missing
    const box = (x: number, z: number) => itemFootprint({ x, z, rotationY: 0 }, { w: 1, d: 1 });
    expect(footprintInRoom(l, box(1.5, 4.5))).toBe(true);
    expect(footprintInRoom(l, box(4.5, 1.5))).toBe(true);
    // Straddles the inside corner at (3, 3): all four corners but one are inside.
    expect(footprintInRoom(l, box(3.2, 3.2))).toBe(false);
    const thin = roomFromPoints(thinL);
    const bar = itemFootprint({ x: 5, z: 0.5, rotationY: 0 }, { w: 6, d: 0.8 });
    expect(footprintInRoom(thin, bar)).toBe(true);
    expect(
      footprintInRoom(thin, itemFootprint({ x: 5, z: 0.5, rotationY: 90 }, { w: 6, d: 0.8 })),
    ).toBe(false);
  });
});

describe('footprintsOverlap', () => {
  const box = (x: number, z: number, r = 0) =>
    itemFootprint({ x, z, rotationY: r }, { w: 1, d: 1 });

  it('finds overlaps but lets items touch', () => {
    expect(footprintsOverlap(box(0, 0), box(0.5, 0.5))).toBe(true);
    expect(footprintsOverlap(box(0, 0), box(1, 0))).toBe(false); // side by side
    expect(footprintsOverlap(box(0, 0), box(0.995, 0))).toBe(false); // within tolerance
    expect(footprintsOverlap(box(0, 0), box(0.98, 0))).toBe(true);
    expect(footprintsOverlap(box(0, 0), box(1.02, 0), -0.05)).toBe(true); // asks for clearance
  });

  it('uses the rotated axes (a diamond beside a square corner)', () => {
    // The diamond's edge facing the square is the line x + z = 2c - 0.707. Its bounding box
    // overlaps the square for c < 1.207, but it only reaches the corner (0.5, 0.5) for c < 0.854.
    expect(footprintsOverlap(box(0, 0), box(0.95, 0.95, 45))).toBe(false);
    expect(footprintsOverlap(box(0, 0), box(0.8, 0.8, 45))).toBe(true);
  });
});

describe('snapToWall', () => {
  it('puts the back flush against a wall within 15 cm, facing into the room', () => {
    const snap = snapToWall(room, { x: 2, z: 0.55, rotationY: 10 }, sofa)!;
    expect(snap.wallId).toBe(NORTH);
    expect(snap.rotationY).toBe(0); // facing +Z, into the room
    expect(snap.z).toBeCloseTo(0.45, 12);
    expect(snap.x).toBeCloseTo(2, 12);
    expect(snap.cornerWallId).toBeNull();

    const south = snapToWall(room, { x: 2, z: 2.5, rotationY: 0 }, sofa)!;
    expect(south.wallId).toBe(SOUTH);
    expect(south.rotationY).toBe(180);
    expect(south.z).toBeCloseTo(3 - 0.45, 12);
  });

  it('does not snap from farther away', () => {
    expect(snapToWall(room, { x: 2, z: 0.65, rotationY: 0 }, sofa)).toBeNull();
    expect(snapToWall(room, { x: 2, z: 0.55, rotationY: 0 }, sofa, { distance: 0 })).toBeNull();
  });

  it('slides into a corner when the side wall is near too', () => {
    const snap = snapToWall(room, { x: 1.1, z: 0.5, rotationY: 0 }, sofa)!;
    expect(snap.wallId).toBe(NORTH);
    expect(snap.cornerWallId).toBe(WEST);
    expect(snap.x).toBeCloseTo(1, 12);
    expect(snap.z).toBeCloseTo(0.45, 12);
  });

  it('snaps to walls at any angle', () => {
    const tilted = roomFromPoints(rotate(rectangle(4, 3), 30));
    const wall = tilted.walls[0]!;
    const [ax, az] = tilted.points[wall.a]!;
    const [bx, bz] = tilted.points[wall.b]!;
    const mid = { x: (ax + bx) / 2, z: (az + bz) / 2 };
    const len = Math.hypot(bx - ax, bz - az);
    const inward = { x: (bz - az) / len, z: -(bx - ax) / len }; // left of a → b
    const pose = { x: mid.x + inward.x * 0.5, z: mid.z + inward.z * 0.5, rotationY: 0 };
    const snap = snapToWall(tilted, pose, sofa)!;
    expect(snap.wallId).toBe(wall.id);
    expect(snap.rotationY).toBeCloseTo(facingRotation(inward), 9);
    const back = itemFootprint(snap, sofa).corners[0]!;
    expect((back.x - ax) * inward.x + (back.z - az) * inward.z).toBeCloseTo(0, 9);
  });
});

describe('clampInsideRoom', () => {
  it('pushes an item back out of a wall', () => {
    const p = clampInsideRoom(room, { x: 0.8, z: 1.5, rotationY: 0 }, sofa)!;
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.z).toBe(1.5);
    expect(clampInsideRoom(room, { x: 2, z: 1.5, rotationY: 0 }, sofa)).toEqual({
      x: 2,
      z: 1.5,
      rotationY: 0,
    });
  });

  it('pushes out of two walls in a corner', () => {
    const p = clampInsideRoom(room, { x: 3.5, z: 2.9, rotationY: 0 }, sofa)!;
    expect(p.x).toBeCloseTo(3, 6);
    expect(p.z).toBeCloseTo(2.55, 6);
  });

  it('gets an item off an inside corner of an L-shaped room', () => {
    const l = roomFromPoints(lShape);
    const size = { w: 1, d: 1 };
    const p = clampInsideRoom(l, { x: 3.2, z: 3.2, rotationY: 0 }, size)!;
    expect(footprintInRoom(l, itemFootprint(p, size))).toBe(true);
    expect(Math.hypot(p.x - 3.2, p.z - 3.2)).toBeLessThan(0.8);
  });

  it('brings back an item dragged just outside, and gives up when nothing fits', () => {
    const p = clampInsideRoom(room, { x: 2, z: -0.6, rotationY: 0 }, sofa)!;
    expect(footprintInRoom(room, itemFootprint(p, sofa))).toBe(true);
    expect(clampInsideRoom(room, { x: 2, z: 1.5, rotationY: 0 }, { w: 5, d: 5 })).toBeNull();
  });
});

describe('findFreeSpot', () => {
  it('uses the room centre first', () => {
    expect(roomCenter(room)).toEqual({ x: 2, z: 1.5 });
    const spot = findFreeSpot(room, sofa, [])!;
    expect(spot.x).toBe(2);
    expect(spot.z).toBe(1.5);
    // Facing away from a longest wall (here the first of the two 4 m walls, along z = 3).
    expect(spot.rotationY).toBe(180);
  });

  it('moves to the nearest free spot, clear of other items', () => {
    const taken = itemFootprint({ x: 2, z: 1.5, rotationY: 0 }, { w: 1.2, d: 0.8 });
    const spot = findFreeSpot(room, { w: 0.5, d: 0.5 }, [taken])!;
    const fp = itemFootprint(spot, { w: 0.5, d: 0.5 });
    expect(footprintsOverlap(fp, taken, -0.05)).toBe(false);
    expect(footprintInRoom(room, fp, 0)).toBe(true);
    expect(Math.hypot(spot.x - 2, spot.z - 1.5)).toBeLessThan(1.2);
  });

  it('turns a long item a quarter when that is the only way it fits', () => {
    const narrow = roomFromPoints(rectangle(1.5, 4));
    const spot = findFreeSpot(narrow, { w: 2, d: 0.9 }, [], { rotationY: 0 })!;
    expect(spot.rotationY).toBe(90);
  });

  it('returns null when the item fits nowhere', () => {
    expect(findFreeSpot(room, { w: 5, d: 5 }, [])).toBeNull();
  });
});

describe('resolvePlacement', () => {
  it('snaps rotation to 15° steps away from walls', () => {
    const r = resolvePlacement({ productId: 'chair', x: 2, z: 1.5, rotationY: 37 }, ctx());
    expect(r.rotationY).toBe(30);
    expect(r.snappedWall).toBeNull();
    expect(r.valid).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.y).toBe(0);
  });

  it('snaps to a wall and reports it', () => {
    const r = resolvePlacement({ productId: 'sofa', x: 2, z: 2.5, rotationY: 20 }, ctx());
    expect(r.snappedWall).toBe(SOUTH);
    expect(r.rotationY).toBe(180);
    expect(r.z).toBeCloseTo(2.55, 9);
    expect(r.valid).toBe(true);
  });

  it('can leave wall snapping off while turning an item', () => {
    const r = resolvePlacement({ productId: 'sofa', x: 2, z: 2.5, rotationY: 20 }, ctx(), {
      snapDistance: 0,
    });
    expect(r.snappedWall).toBeNull();
    expect(r.rotationY).toBe(15);
    expect(r.valid).toBe(true); // clamped back inside
    expect(footprintInRoom(room, r.footprint)).toBe(true);
  });

  it('pushes an item back inside the room', () => {
    const r = resolvePlacement({ productId: 'chair', x: 3.9, z: 1.5, rotationY: 0 }, ctx(), {
      snapDistance: 0,
    });
    expect(r.x).toBeCloseTo(3.75, 6);
    expect(r.valid).toBe(true);
  });

  it('reports overlaps with other items, but not with itself or rugs', () => {
    const items = [item('s1', 'sofa', 2, 1.5), item('r1', 'rug', 2, 1.5)];
    const r = resolvePlacement(
      { id: 'c1', productId: 'chair', x: 2.2, z: 1.4, rotationY: 0 },
      ctx(items),
    );
    expect(r.valid).toBe(false);
    expect(r.reasons).toEqual(['overlaps']);
    expect(r.overlaps).toEqual(['s1']);
    const self = resolvePlacement(
      { id: 's1', productId: 'sofa', x: 2, z: 1.5, rotationY: 0 },
      ctx(items),
    );
    expect(self.valid).toBe(true);
    const rug = resolvePlacement(
      { id: 'r2', productId: 'rug', x: 2, z: 1.5, rotationY: 0 },
      ctx(items),
    );
    expect(rug.valid).toBe(true);
  });

  it('reports an item that does not fit in the room', () => {
    const r = resolvePlacement({ productId: 'huge', x: 2, z: 1.5, rotationY: 0 }, ctx());
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('outside-room');
  });

  it('rejects unknown products', () => {
    const r = resolvePlacement({ productId: 'nope', x: 1, z: 1, rotationY: 0 }, ctx());
    expect(r.valid).toBe(false);
    expect(r.reasons).toEqual(['unknown-product']);
  });

  it('rests tabletop items on the item below them', () => {
    const items = [item('t1', 'table', 2, 1.5), item('l1', 'lamp', 1.7, 1.5)];
    items[1]!.y = 0.75;
    const r = resolvePlacement(
      { id: 'l2', productId: 'lamp', x: 2.4, z: 1.5, rotationY: 0 },
      ctx(items),
    );
    expect(r.y).toBe(0.75);
    expect(r.supportId).toBe('t1');
    expect(r.valid).toBe(true);
    const clash = resolvePlacement(
      { id: 'l2', productId: 'lamp', x: 1.8, z: 1.5, rotationY: 0 },
      ctx(items),
    );
    expect(clash.overlaps).toEqual(['l1']);
    const onFloor = resolvePlacement(
      { productId: 'lamp', x: 3.5, z: 2.5, rotationY: 0 },
      ctx(items),
    );
    expect(onFloor.y).toBe(0);
    expect(onFloor.supportId).toBeNull();
  });
});

describe('placeNewItem', () => {
  it('places a new item at the room centre, or the nearest free spot', () => {
    const first = placeNewItem('sofa', ctx())!;
    expect(first.x).toBe(2);
    expect(first.z).toBe(1.5);
    expect(first.valid).toBe(true);
    const second = placeNewItem('chair', ctx([item('s1', 'sofa', 2, 1.5)]))!;
    expect(second.valid).toBe(true);
    expect(second.overlaps).toEqual([]);
    expect(placeNewItem('huge', ctx())).toBeNull();
    expect(placeNewItem('nope', ctx())).toBeNull();
  });

  it('lets rugs go under furniture', () => {
    const rug = placeNewItem('rug', ctx([item('s1', 'sofa', 2, 1.5)]))!;
    expect(rug.x).toBe(2);
    expect(rug.valid).toBe(true);
    expect(isFlatProduct(products.rug!)).toBe(true);
  });
});

describe('productLookup', () => {
  it('finds catalog items by id', () => {
    const chair: CatalogItem = {
      id: 'chair-a',
      name: 'Chair',
      category: 'dining-chair',
      dimensions: { w: 0.5, d: 0.5, h: 0.9 },
      placement: 'floor',
      variants: [],
      license: 'CC0-1.0',
      credit: 'Poly Haven',
      sourceUrl: 'https://polyhaven.com',
      model: 'models/chair-a.glb',
      thumb: 'thumbs/chair-a.webp',
    };
    const lookup = productLookup({ items: [chair] });
    expect(lookup('chair-a')).toBe(chair);
    expect(lookup('nope')).toBeUndefined();
  });
});
