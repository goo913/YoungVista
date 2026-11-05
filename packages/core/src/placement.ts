/**
 * Furniture placement on the floor plan.
 *
 * An item's footprint is the rectangle of its catalog width (local X) and depth (local Z) around
 * its position, turned by `rotationY` (degrees about +Y, counter-clockwise seen from above). At
 * rotation 0 the item's front faces +Z; at 90 it faces +X.
 *
 * `resolvePlacement` is the one call a drag or rotate gesture needs: it snaps the rotation to
 * 15° steps (lined up with the room's walls), snaps the item's back flush against a wall within
 * 15 cm (facing into the room, and into a corner when one is near), pushes it back inside the
 * room, and reports whether the spot is valid (inside the room, no overlaps).
 */
import type { Catalog, CatalogDimensions, CatalogPlacement } from './catalog';
import type { DesignItem, Room, Vec2 } from './types';
import { bounds, signedArea } from './polygon';
import { add, distance, dot, leftNormal, normalize, scale, sub, toDegrees, toRadians } from './vec';

/** Snap an item to a wall when its back is within this distance (m). */
export const WALL_SNAP_DISTANCE = 0.15;
/** Rotation steps in degrees. */
export const ROTATION_STEP = 15;
/** How far an item may poke into a wall or another item and still be valid (m). */
export const PLACEMENT_TOLERANCE = 0.01;

/** What placement needs to know about a product. A `CatalogItem` fits. */
export interface PlacementProduct {
  dimensions: CatalogDimensions;
  placement?: CatalogPlacement;
  category?: string;
}

/** Finds a product by id, e.g. `productLookup(catalog)`. */
export type ProductLookup = (productId: string) => PlacementProduct | undefined;

/** Position on the floor (m) and rotation about +Y (degrees). */
export interface Pose {
  x: number;
  z: number;
  rotationY: number;
}

/** An item's rectangle on the floor. */
export interface Footprint {
  center: Vec2;
  /** Half the width, along `axisX` (m). */
  halfWidth: number;
  /** Half the depth, along `axisZ` (m). */
  halfDepth: number;
  /** The item's local +X axis in room space. */
  axisX: Vec2;
  /** The item's local +Z axis in room space: the way its front faces. */
  axisZ: Vec2;
  /** Corners counter-clockwise seen from above, starting at the back corner on the -X side. */
  corners: [Vec2, Vec2, Vec2, Vec2];
}

/** Builds a `ProductLookup` over a catalog. */
export function productLookup(catalog: Pick<Catalog, 'items'>): ProductLookup {
  const byId = new Map(catalog.items.map((item) => [item.id, item]));
  return (id) => byId.get(id);
}

/** Wraps degrees to [0, 360). */
export function normalizeDegrees(deg: number): number {
  const r = deg % 360;
  const out = r < 0 ? r + 360 : r;
  return out >= 360 - 1e-9 || Math.abs(out) < 1e-9 ? 0 : out;
}

/** Rounds a rotation to the nearest `step` degrees counted from `base`, wrapped to [0, 360). */
export function snapRotation(deg: number, step = ROTATION_STEP, base = 0): number {
  if (!(step > 0)) return normalizeDegrees(deg);
  return normalizeDegrees(base + Math.round((deg - base) / step) * step);
}

/** The `rotationY` (degrees) that turns an item's front toward `direction` on the floor. */
export function facingRotation(direction: Vec2): number {
  return normalizeDegrees(toDegrees(Math.atan2(direction.x, direction.z)));
}

/** The item's front direction for a rotation (degrees). */
export function frontDirection(rotationY: number): Vec2 {
  const r = toRadians(rotationY);
  return { x: Math.sin(r), z: Math.cos(r) };
}

/** The footprint of an item of `size` (catalog width and depth) at `pose`. */
export function itemFootprint(pose: Pose, size: { w: number; d: number }): Footprint {
  const r = toRadians(pose.rotationY);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const axisX = { x: c, z: -s };
  const axisZ = { x: s, z: c };
  const hw = Math.max(size.w, 0) / 2;
  const hd = Math.max(size.d, 0) / 2;
  const center = { x: pose.x, z: pose.z };
  const corner = (sx: number, sz: number): Vec2 => ({
    x: center.x + axisX.x * sx * hw + axisZ.x * sz * hd,
    z: center.z + axisX.z * sx * hw + axisZ.z * sz * hd,
  });
  return {
    center,
    halfWidth: hw,
    halfDepth: hd,
    axisX,
    axisZ,
    corners: [corner(-1, -1), corner(-1, 1), corner(1, 1), corner(1, -1)],
  };
}

interface WallLine {
  id: string;
  index: number;
  a: Vec2;
  d: Vec2;
  /** Unit normal into the room. */
  inward: Vec2;
  length: number;
}

function wallLines(room: Room): WallLine[] {
  const orient = signedArea(room.points) >= 0 ? 1 : -1;
  return room.walls.flatMap((w, index) => {
    const pa = room.points[w.a];
    const pb = room.points[w.b];
    if (!pa || !pb) return [];
    const a = { x: pa[0], z: pa[1] };
    const b = { x: pb[0], z: pb[1] };
    const length = distance(a, b);
    if (length < 1e-9) return [];
    const d = normalize(sub(b, a));
    return [{ id: w.id, index, a, d, inward: scale(leftNormal(d), orient), length }];
  });
}

const outline = (room: Room): Vec2[] => room.points.map(([x, z]) => ({ x, z }));

/** Facing away from the longest wall: how a new item is turned by default. */
const defaultRotation = (walls: readonly WallLine[]): number =>
  walls.length ? facingRotation(walls.reduce((m, w) => (w.length > m.length ? w : m)).inward) : 0;

function pointInPolygon(pts: readonly Vec2[], p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2)) : 0;
  return distance(p, add(a, scale(ab, t)));
}

/** True if `p` is inside the room's outline, or within `tolerance` (m) of it. */
export function pointInRoom(room: Room, p: Vec2, tolerance = 0): boolean {
  const pts = outline(room);
  if (pts.length < 3) return false;
  if (pointInPolygon(pts, p)) return true;
  if (tolerance <= 0) return false;
  return pts.some((a, i) => distanceToSegment(p, a, pts[(i + 1) % pts.length]!) <= tolerance);
}

/** True if segment a-b touches the footprint's rectangle shrunk to half sizes hw × hd. */
function segmentTouchesBox(a: Vec2, b: Vec2, fp: Footprint, hw: number, hd: number): boolean {
  const la = sub(a, fp.center);
  const lb = sub(b, fp.center);
  const ax = dot(la, fp.axisX);
  const az = dot(la, fp.axisZ);
  const dx = dot(lb, fp.axisX) - ax;
  const dz = dot(lb, fp.axisZ) - az;
  let t0 = 0;
  let t1 = 1;
  const clips: [number, number][] = [
    [-dx, ax + hw],
    [dx, hw - ax],
    [-dz, az + hd],
    [dz, hd - az],
  ];
  for (const [p, q] of clips) {
    if (Math.abs(p) < 1e-15) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * True if the footprint lies inside the room. It may poke up to `tolerance` (m) into a wall, so an
 * item flush against a wall counts as inside. Works for concave rooms.
 */
export function footprintInRoom(
  room: Room,
  footprint: Footprint,
  tolerance = PLACEMENT_TOLERANCE,
): boolean {
  const pts = outline(room);
  if (pts.length < 3 || !pointInPolygon(pts, footprint.center)) return false;
  const hw = Math.max(footprint.halfWidth - tolerance, 0);
  const hd = Math.max(footprint.halfDepth - tolerance, 0);
  return !pts.some((a, i) => segmentTouchesBox(a, pts[(i + 1) % pts.length]!, footprint, hw, hd));
}

/**
 * Separating-axis test on two footprints. Items that only touch, or overlap by less than
 * `tolerance` (m), do not count as overlapping. A negative tolerance asks for that much clearance.
 */
export function footprintsOverlap(
  a: Footprint,
  b: Footprint,
  tolerance = PLACEMENT_TOLERANCE,
): boolean {
  const d = sub(b.center, a.center);
  for (const axis of [a.axisX, a.axisZ, b.axisX, b.axisZ]) {
    const ra =
      a.halfWidth * Math.abs(dot(a.axisX, axis)) + a.halfDepth * Math.abs(dot(a.axisZ, axis));
    const rb =
      b.halfWidth * Math.abs(dot(b.axisX, axis)) + b.halfDepth * Math.abs(dot(b.axisZ, axis));
    if (Math.abs(dot(d, axis)) >= ra + rb - tolerance) return false;
  }
  return true;
}

/** Where `snapToWall` puts an item. */
export interface WallSnap extends Pose {
  wallId: string;
  wallIndex: number;
  /** Gap between the item and the wall before snapping (m); negative if it poked through. */
  gap: number;
  /** Id of a second wall the item was slid flush against (a corner), or null. */
  cornerWallId: string | null;
}

const minOver = (pts: readonly Vec2[], f: (p: Vec2) => number) =>
  pts.reduce((m, p) => Math.min(m, f(p)), Infinity);
const maxOver = (pts: readonly Vec2[], f: (p: Vec2) => number) =>
  pts.reduce((m, p) => Math.max(m, f(p)), -Infinity);

/**
 * Snaps an item to the nearest wall its footprint comes within `distance` (m, default 15 cm) of:
 * its back (-Z side) goes flush against the wall and its front faces into the room. If another
 * wall is then within `distance` of its side, it slides along the first wall into that corner.
 * Returns null when no wall is close enough.
 */
export function snapToWall(
  room: Room,
  pose: Pose,
  size: { w: number; d: number },
  options: { distance?: number } = {},
): WallSnap | null {
  const maxGap = options.distance ?? WALL_SNAP_DISTANCE;
  if (!(maxGap > 0)) return null;
  const walls = wallLines(room);
  const fp = itemFootprint(pose, size);
  let best: { wall: WallLine; gap: number } | null = null;
  for (const wall of walls) {
    const rel = sub(fp.center, wall.a);
    const along = dot(rel, wall.d);
    // The item must stand in front of this wall, not past its ends or far behind it.
    if (along < 0 || along > wall.length || dot(rel, wall.inward) < -maxGap) continue;
    const gap = minOver(fp.corners, (c) => dot(sub(c, wall.a), wall.inward));
    if (gap > maxGap) continue;
    if (!best || gap < best.gap) best = { wall, gap };
  }
  if (!best) return null;

  const { wall, gap } = best;
  const rotationY = facingRotation(wall.inward);
  const along = Math.min(Math.max(dot(sub(fp.center, wall.a), wall.d), 0), wall.length);
  let center = add(add(wall.a, scale(wall.d, along)), scale(wall.inward, size.d / 2));

  // Into a corner: slide along the wall until the item's side meets a crossing wall nearby.
  let cornerWallId: string | null = null;
  let bestSlide = Infinity;
  const snapped = itemFootprint({ x: center.x, z: center.z, rotationY }, size);
  for (const other of walls) {
    if (other.index === wall.index) continue;
    const k = dot(wall.d, other.inward);
    if (Math.abs(k) < 0.5) continue; // within 30° of parallel: sliding barely closes the gap
    const extent = snapped.corners.map((c) => dot(sub(c, other.a), other.d));
    if (Math.max(...extent) <= 1e-9 || Math.min(...extent) >= other.length - 1e-9) continue;
    const sideGap = minOver(snapped.corners, (c) => dot(sub(c, other.a), other.inward));
    const reach = maxOver(snapped.corners, (c) => dot(sub(c, other.a), other.inward));
    if (sideGap > maxGap || reach <= 0) continue;
    const slide = -sideGap / k;
    if (Math.abs(slide) < Math.abs(bestSlide)) {
      bestSlide = slide;
      cornerWallId = other.id;
    }
  }
  if (cornerWallId !== null) center = add(center, scale(wall.d, bestSlide));
  return {
    x: center.x,
    z: center.z,
    rotationY,
    wallId: wall.id,
    wallIndex: wall.index,
    gap,
    cornerWallId,
  };
}

/**
 * Moves an item (keeping its rotation) to the nearest spot inside the room: first by pushing it
 * out of the walls it pokes through, then by searching nearby (up to `searchRadius` m, default 2).
 * Returns the pose unchanged if it is already inside, or null if nothing nearby fits.
 */
export function clampInsideRoom(
  room: Room,
  pose: Pose,
  size: { w: number; d: number },
  options: { tolerance?: number; searchRadius?: number } = {},
): Pose | null {
  const tol = options.tolerance ?? PLACEMENT_TOLERANCE;
  const walls = wallLines(room);
  const fits = (c: Vec2) =>
    footprintInRoom(room, itemFootprint({ ...pose, x: c.x, z: c.z }, size), tol);
  let center = { x: pose.x, z: pose.z };
  for (let iter = 0; iter < 12; iter++) {
    if (fits(center)) return { ...pose, x: center.x, z: center.z };
    const fp = itemFootprint({ ...pose, ...center }, size);
    let push: Vec2 | null = null;
    let pushDepth = Infinity;
    for (const wall of walls) {
      const extent = fp.corners.map((c) => dot(sub(c, wall.a), wall.d));
      if (Math.max(...extent) <= 1e-9 || Math.min(...extent) >= wall.length - 1e-9) continue;
      const depth = -minOver(fp.corners, (c) => dot(sub(c, wall.a), wall.inward));
      const reach = maxOver(fp.corners, (c) => dot(sub(c, wall.a), wall.inward));
      if (depth <= tol / 2 || reach <= 0) continue;
      if (depth < pushDepth) {
        pushDepth = depth;
        push = scale(wall.inward, depth + 1e-9);
      }
    }
    if (!push) break;
    center = add(center, push);
  }
  if (fits(center)) return { ...pose, x: center.x, z: center.z };

  // Nearest fitting spot on rings around the original position.
  const radius = options.searchRadius ?? 2;
  const step = 0.05;
  for (let r = step; r <= radius + 1e-9; r += step) {
    const count = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
    for (let k = 0; k < count; k++) {
      const a = (2 * Math.PI * k) / count;
      const c = { x: pose.x + r * Math.cos(a), z: pose.z + r * Math.sin(a) };
      if (fits(c)) return { ...pose, x: c.x, z: c.z };
    }
  }
  return null;
}

/**
 * The rotation offset (degrees, in [0, step)) that lines rotation steps up with the room: items
 * backed against the longest wall face an exact step.
 */
export function roomRotationBase(room: Room, step = ROTATION_STEP): number {
  const walls = wallLines(room);
  if (!walls.length || !(step > 0)) return 0;
  const longest = walls.reduce((m, w) => (w.length > m.length ? w : m));
  const r = facingRotation(longest.inward) % step;
  return step - r < 1e-9 ? 0 : r;
}

/** Area-weighted centre of the room's floor. */
export function roomCenter(room: Room): Vec2 {
  const pts = outline(room);
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const c = p.x * q.z - q.x * p.z;
    a += c;
    cx += (p.x + q.x) * c;
    cz += (p.z + q.z) * c;
  }
  if (Math.abs(a) < 1e-12) {
    const b = bounds(pts);
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

export interface FreeSpotOptions {
  /** Preferred rotation (degrees). Default: facing away from the longest wall. */
  rotationY?: number;
  /** Where to start looking. Default: the room's centre. */
  start?: Vec2;
  /** Grid spacing of the search (m). Default 0.1. */
  step?: number;
  /** Space to keep from other items (m). Default 0.05. */
  clearance?: number;
}

/**
 * A spot for a new item of `size` that is inside the room and clear of `obstacles`: the room's
 * centre if it is free, else the nearest free spot, first at the preferred rotation and then
 * turned a quarter. Null if the item fits nowhere.
 */
export function findFreeSpot(
  room: Room,
  size: { w: number; d: number },
  obstacles: readonly Footprint[],
  options: FreeSpotOptions = {},
): Pose | null {
  const pts = outline(room);
  if (pts.length < 3) return null;
  const start = options.start ?? roomCenter(room);
  const step = Math.max(options.step ?? 0.1, 0.01);
  const clearance = options.clearance ?? 0.05;
  const preferred = options.rotationY ?? defaultRotation(wallLines(room));

  const b = bounds(pts);
  const candidates: Vec2[] = [start];
  for (let x = b.minX + step / 2; x < b.maxX; x += step) {
    for (let z = b.minZ + step / 2; z < b.maxZ; z += step) candidates.push({ x, z });
  }
  candidates.sort((p, q) => distance(p, start) - distance(q, start));
  for (const rotationY of [normalizeDegrees(preferred), normalizeDegrees(preferred + 90)]) {
    for (const c of candidates) {
      const fp = itemFootprint({ x: c.x, z: c.z, rotationY }, size);
      if (!footprintInRoom(room, fp, 0)) continue;
      if (obstacles.some((o) => footprintsOverlap(fp, o, -clearance))) continue;
      return { x: c.x, z: c.z, rotationY };
    }
  }
  return null;
}

/** Rugs and other flat items: furniture stands on them, so they never block anything. */
export function isFlatProduct(product: PlacementProduct): boolean {
  return product.category === 'rug' || product.dimensions.h < 0.05;
}

/** Where an item is being dragged or rotated to. `id` skips the item itself in overlap tests. */
export type PlacementCandidate = Pick<DesignItem, 'productId' | 'x' | 'z' | 'rotationY'> & {
  id?: string;
};

export interface PlacementContext {
  room: Room;
  /** The room's other items (the candidate's own entry is skipped by id). */
  items: readonly DesignItem[];
  /** Product sizes, e.g. `productLookup(catalog)`. */
  product: ProductLookup;
}

export interface ResolveOptions {
  /** Snap to a wall within this distance (m). Default 0.15; 0 turns wall snapping off. */
  snapDistance?: number;
  /** Rotation step (degrees), lined up with the room's walls. Default 15; 0 keeps the rotation. */
  rotationStep?: number;
  /** Push the item back inside the room when it pokes out. Default true. */
  clamp?: boolean;
  /** How far an item may poke into a wall or another item and stay valid (m). Default 0.01. */
  tolerance?: number;
}

export type PlacementIssue = 'unknown-product' | 'outside-room' | 'overlaps';

export interface ResolvedPlacement extends Pose {
  /** Height of the item's base: 0 on the floor, or the top of the item a tabletop item rests on. */
  y: number;
  /** Id of the wall the item's back is flush against, or null. */
  snappedWall: string | null;
  /** Id of the item a tabletop item rests on, or null. */
  supportId: string | null;
  /** True when the item is inside the room and overlaps nothing. */
  valid: boolean;
  reasons: PlacementIssue[];
  /** Ids of the items it overlaps. */
  overlaps: string[];
  /** The footprint at the resolved spot, for drawing. */
  footprint: Footprint;
}

interface Placed {
  item: DesignItem;
  product: PlacementProduct;
  footprint: Footprint;
  y: number;
}

function placedItems(ctx: PlacementContext, skipId: string | undefined): Placed[] {
  return ctx.items.flatMap((item) => {
    if (skipId !== undefined && item.id === skipId) return [];
    const product = ctx.product(item.productId);
    if (!product) return [];
    const footprint = itemFootprint(item, { w: product.dimensions.w, d: product.dimensions.d });
    return [{ item, product, footprint, y: item.y ?? 0 }];
  });
}

/** Items stand on each other only if one's base is at (or above) the other's top. */
const levelsOverlap = (y0: number, h0: number, y1: number, h1: number, tol: number) =>
  y0 < y1 + h1 - tol && y1 < y0 + h0 - tol;

/**
 * Resolves a dragged or rotated item into the spot it should take:
 * 1. Rotation snaps to 15° steps lined up with the walls (`rotationStep`).
 * 2. A floor item whose footprint comes within 15 cm of a wall snaps flush against it, back to the
 *    wall and facing into the room, and slides into a corner when one is near (`snapDistance`).
 *    Pass `snapDistance: 0` while the user is turning an item, so it can be turned away from a wall.
 * 3. An item poking out of the room is pushed back inside (`clamp`).
 * 4. A tabletop item rests on the tallest item under its centre (`y`, `supportId`).
 * 5. The spot is valid when the item is inside the room and overlaps no other item. Rugs overlap
 *    freely; items at different heights (a lamp on a table) do not collide.
 *
 * An invalid result still carries the best spot found, so the app can show it (in red, say) and
 * fall back to the last valid spot when the gesture ends.
 */
export function resolvePlacement(
  candidate: PlacementCandidate,
  ctx: PlacementContext,
  options: ResolveOptions = {},
): ResolvedPlacement {
  const tol = options.tolerance ?? PLACEMENT_TOLERANCE;
  const step = options.rotationStep ?? ROTATION_STEP;
  const snapDistance = options.snapDistance ?? WALL_SNAP_DISTANCE;
  const product = ctx.product(candidate.productId);
  const rotationY =
    step > 0
      ? snapRotation(candidate.rotationY, step, roomRotationBase(ctx.room, step))
      : normalizeDegrees(candidate.rotationY);
  let pose: Pose = { x: candidate.x, z: candidate.z, rotationY };
  if (!product) {
    return {
      ...pose,
      y: 0,
      snappedWall: null,
      supportId: null,
      valid: false,
      reasons: ['unknown-product'],
      overlaps: [],
      footprint: itemFootprint(pose, { w: 0, d: 0 }),
    };
  }
  const size = { w: product.dimensions.w, d: product.dimensions.d };
  const tabletop = product.placement === 'tabletop';

  let snappedWall: string | null = null;
  if (!tabletop && snapDistance > 0) {
    const snap = snapToWall(ctx.room, pose, size, { distance: snapDistance });
    if (snap) {
      pose = { x: snap.x, z: snap.z, rotationY: snap.rotationY };
      snappedWall = snap.wallId;
    }
  }
  if (options.clamp ?? true) {
    const clamped = clampInsideRoom(ctx.room, pose, size, { tolerance: tol });
    if (clamped) pose = clamped;
  }
  const footprint = itemFootprint(pose, size);
  if (snappedWall !== null) {
    // Still flush after clamping? (A room too narrow for the item pushes it off the wall.)
    const wall = wallLines(ctx.room).find((w) => w.id === snappedWall);
    const gap = wall ? minOver(footprint.corners, (c) => dot(sub(c, wall.a), wall.inward)) : 1;
    if (Math.abs(gap) > tol) snappedWall = null;
  }

  const others = placedItems(ctx, candidate.id);
  let y = 0;
  let supportId: string | null = null;
  if (tabletop) {
    for (const o of others) {
      if (o.product.placement === 'tabletop' || isFlatProduct(o.product)) continue;
      const top = o.y + o.product.dimensions.h;
      const local = sub(footprint.center, o.footprint.center);
      const onTop =
        Math.abs(dot(local, o.footprint.axisX)) <= o.footprint.halfWidth &&
        Math.abs(dot(local, o.footprint.axisZ)) <= o.footprint.halfDepth;
      if (onTop && top > y) {
        y = top;
        supportId = o.item.id;
      }
    }
  }

  const reasons: PlacementIssue[] = [];
  if (!footprintInRoom(ctx.room, footprint, tol)) reasons.push('outside-room');
  const overlaps: string[] = [];
  if (!isFlatProduct(product)) {
    for (const o of others) {
      if (isFlatProduct(o.product)) continue;
      if (!levelsOverlap(y, product.dimensions.h, o.y, o.product.dimensions.h, tol)) continue;
      if (footprintsOverlap(footprint, o.footprint, tol)) overlaps.push(o.item.id);
    }
  }
  if (overlaps.length) reasons.push('overlaps');
  return {
    ...pose,
    y,
    snappedWall,
    supportId,
    valid: reasons.length === 0,
    reasons,
    overlaps,
    footprint,
  };
}

/**
 * A free spot for a new item of `productId`: the room's centre if free, else the nearest free
 * spot (see `findFreeSpot`), resolved like a drop. Null if the product is unknown or nothing fits.
 */
export function placeNewItem(
  productId: string,
  ctx: PlacementContext,
  options: FreeSpotOptions = {},
): ResolvedPlacement | null {
  const product = ctx.product(productId);
  if (!product) return null;
  const size = { w: product.dimensions.w, d: product.dimensions.d };
  const obstacles = isFlatProduct(product)
    ? []
    : placedItems(ctx, undefined)
        .filter((o) => !isFlatProduct(o.product) && o.y < product.dimensions.h)
        .map((o) => o.footprint);
  const rotationY = snapRotation(
    options.rotationY ?? defaultRotation(wallLines(ctx.room)),
    ROTATION_STEP,
    roomRotationBase(ctx.room),
  );
  const spot = findFreeSpot(ctx.room, size, obstacles, { ...options, rotationY });
  if (!spot) return null;
  return resolvePlacement({ productId, ...spot }, ctx, { snapDistance: 0 });
}
