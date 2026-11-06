/**
 * The 3D view's camera: it orbits a point in the room, and the same numbers turn a touch on the
 * screen into a ray, so the app picks and drags furniture with its own maths instead of Viro's
 * events (which then work the same on iPhone and Android).
 *
 * Room space as everywhere: metres, Y up, floor at y = 0. Viro's camera stays at the origin
 * looking down -Z; the room is moved in front of it instead (see `sceneTransform`), so no camera
 * rotation order has to be guessed. Viro spreads the field of view across the longer side of the
 * view (VRONodeCamera: "the major axis"), which `fovTangents` follows.
 */
import type { Footprint, MeshVec3, RoomMeshes } from '@youngvista/core';

export interface Orbit {
  /** The point the camera looks at, in room space. */
  target: MeshVec3;
  /** Around the room (degrees): 0 looks from +Z toward -Z (from the bottom of the plan), 90 from +X. */
  yaw: number;
  /** Above the floor (degrees): 0 is level, 90 straight down. */
  pitch: number;
  /** From the target (m). */
  distance: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Field of view across the longer side of the 3D view (degrees): the ViroCamera's `fieldOfView`. */
export const FIELD_OF_VIEW = 50;
export const PITCH_MIN = 12;
export const PITCH_MAX = 90;
export const DISTANCE_MIN = 0.8;

const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type V3 = MeshVec3;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

export interface CameraBasis {
  /** Screen right. */
  right: V3;
  /** Screen up. */
  up: V3;
  /** Out of the screen, toward the viewer: the camera looks along -back. */
  back: V3;
}

/** The camera's axes in room space: the rotation Ry(yaw)·Rx(-pitch). */
export function cameraBasis(o: Pick<Orbit, 'yaw' | 'pitch'>): CameraBasis {
  const cy = Math.cos(rad(o.yaw));
  const sy = Math.sin(rad(o.yaw));
  const cp = Math.cos(rad(o.pitch));
  const sp = Math.sin(rad(o.pitch));
  return {
    right: [cy, 0, -sy],
    up: [-sy * sp, cp, -cy * sp],
    back: [sy * cp, sp, cy * cp],
  };
}

/** Where the camera is, in room space. */
export function eyePosition(o: Orbit): V3 {
  return add(o.target, mul(cameraBasis(o).back, o.distance));
}

/** tan of half the field of view across the width (x) and the height (y) of the view. */
export function fovTangents(viewport: Viewport, fov = FIELD_OF_VIEW): { x: number; y: number } {
  const t = Math.tan(rad(fov / 2));
  const w = Math.max(viewport.width, 1);
  const h = Math.max(viewport.height, 1);
  return w >= h ? { x: t, y: (t * h) / w } : { x: (t * w) / h, y: t };
}

/**
 * The nested Viro nodes that put the room in front of the fixed camera: from the outside in, move
 * it `distance` away, tilt it by `pitch`, turn it by `-yaw`, and move the target to the origin.
 * Each node turns about one axis only, so Viro's Euler order does not matter.
 */
export function sceneTransform(o: Orbit): {
  push: V3;
  tilt: V3;
  turn: V3;
  shift: V3;
} {
  return {
    push: [0, 0, -o.distance],
    tilt: [o.pitch, 0, 0],
    turn: [0, -o.yaw, 0],
    shift: [-o.target[0], -o.target[1], -o.target[2]],
  };
}

export interface Ray {
  origin: V3;
  /** Unit length. */
  dir: V3;
}

/** The ray from the camera through a point of the view (x, y from its top left corner). */
export function screenRay(
  o: Orbit,
  viewport: Viewport,
  point: { x: number; y: number },
  fov = FIELD_OF_VIEW,
): Ray {
  const { right, up, back } = cameraBasis(o);
  const t = fovTangents(viewport, fov);
  const nx = (2 * point.x) / Math.max(viewport.width, 1) - 1;
  const ny = 1 - (2 * point.y) / Math.max(viewport.height, 1);
  const dir = norm(add(add(mul(right, nx * t.x), mul(up, ny * t.y)), mul(back, -1)));
  return { origin: eyePosition(o), dir };
}

/** Where the ray meets the horizontal plane at height `y` (the floor by default), or null. */
export function rayOnFloor(ray: Ray, y = 0): { x: number; z: number } | null {
  if (ray.dir[1] > -1e-6) return null;
  const t = (y - ray.origin[1]) / ray.dir[1];
  if (!(t > 0)) return null;
  return { x: ray.origin[0] + ray.dir[0] * t, z: ray.origin[2] + ray.dir[2] * t };
}

/** Where a room point appears in the view, or null when it is behind the camera. */
export function projectPoint(
  o: Orbit,
  viewport: Viewport,
  p: V3,
  fov = FIELD_OF_VIEW,
): { x: number; y: number; depth: number } | null {
  const { right, up, back } = cameraBasis(o);
  const v = sub(p, eyePosition(o));
  const depth = -dot(v, back);
  if (depth <= 1e-3) return null;
  const t = fovTangents(viewport, fov);
  const nx = dot(v, right) / (depth * t.x);
  const ny = dot(v, up) / (depth * t.y);
  return { x: ((nx + 1) / 2) * viewport.width, y: ((1 - ny) / 2) * viewport.height, depth };
}

/** A piece of furniture as a box: its footprint, from `y` up to `y + height`. */
export interface PickBox {
  id: string;
  footprint: Footprint;
  y: number;
  height: number;
}

/** Distance along the ray to the box, or null when the ray misses it. */
export function rayHitsBox(ray: Ray, box: PickBox): number | null {
  const fp = box.footprint;
  const ax: V3 = [fp.axisX.x, 0, fp.axisX.z];
  const az: V3 = [fp.axisZ.x, 0, fp.axisZ.z];
  const rel = sub(ray.origin, [fp.center.x, 0, fp.center.z]);
  const o: V3 = [dot(rel, ax), rel[1], dot(rel, az)];
  const d: V3 = [dot(ray.dir, ax), ray.dir[1], dot(ray.dir, az)];
  // Flat things (rugs) still need some thickness to be tapped.
  const top = Math.max(box.y + box.height, box.y + 0.03);
  const lo: V3 = [-fp.halfWidth, box.y, -fp.halfDepth];
  const hi: V3 = [fp.halfWidth, top, fp.halfDepth];
  let t0 = 0;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]!) < 1e-12) {
      if (o[k]! < lo[k]! || o[k]! > hi[k]!) return null;
      continue;
    }
    let a = (lo[k]! - o[k]!) / d[k]!;
    let b = (hi[k]! - o[k]!) / d[k]!;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

/** The id of the nearest box the ray hits, or null. */
export function pickBox(ray: Ray, boxes: readonly PickBox[]): string | null {
  let best: { id: string; t: number } | null = null;
  for (const box of boxes) {
    const t = rayHitsBox(ray, box);
    if (t !== null && (!best || t < best.t)) best = { id: box.id, t };
  }
  return best?.id ?? null;
}

export type ViewPreset = 'corner' | 'top';

/**
 * The camera for a preset, close enough that the room just fits the view: 'corner' is a
 * three-quarter view from the bottom right of the plan, 'top' looks straight down with the plan's
 * +X to the right and +Z down. The same framing as the website's 3D view.
 */
export function fitOrbit(
  meshes: Pick<RoomMeshes, 'bounds' | 'center' | 'walls'>,
  preset: ViewPreset,
  viewport: Viewport,
  fov = FIELD_OF_VIEW,
): Orbit {
  const { bounds, center, walls } = meshes;
  const h = Math.max(bounds.max[1], 0.5);
  const pitch = preset === 'top' ? 90 : 40;
  const yaw = preset === 'top' ? 0 : 28;
  const { right, up, back } = cameraBasis({ yaw, pitch });
  const forward = mul(back, -1);
  const tan = fovTangents(viewport, fov);
  let target: V3 = [center[0], preset === 'top' ? 0 : h * 0.3, center[2]];

  // The outside corners of the walls at floor level, plus the tops of the walls that stay
  // visible (walls facing the camera fade out). The room's bounding box would add the empty
  // corners of an L-shape.
  const corners: V3[] = [];
  for (const wall of walls) {
    const along = { x: -wall.normal[2], z: wall.normal[0] };
    const visible = wall.normal[0] * back[0] + wall.normal[2] * back[2] <= 0;
    for (const end of [-1, 1]) {
      const x = wall.center[0] + along.x * (wall.length / 2) * end + wall.normal[0] * 0.15;
      const z = wall.center[2] + along.z * (wall.length / 2) * end + wall.normal[2] * 0.15;
      corners.push([x, 0, z]);
      if (preset === 'top' || visible) corners.push([x, h, z]);
    }
  }
  if (!corners.length) corners.push([center[0], 0, center[2]]);

  const fit = () => {
    let d = 1;
    for (const c of corners) {
      const p = sub(c, target);
      const depth = dot(p, forward);
      d = Math.max(
        d,
        Math.abs(dot(p, right)) / tan.x - depth,
        Math.abs(dot(p, up)) / tan.y - depth,
      );
    }
    return d * 1.06;
  };
  let distance = fit();
  // Centre the room on screen (its near and far sides project unevenly), then fit again.
  for (let pass = 0; pass < 2; pass++) {
    const eye = add(target, mul(back, distance));
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const c of corners) {
      const v = sub(c, eye);
      const depth = Math.max(dot(v, forward), 1e-3);
      const sx = dot(v, right) / (depth * tan.x);
      const sy = dot(v, up) / (depth * tan.y);
      [x0, x1, y0, y1] = [Math.min(x0, sx), Math.max(x1, sx), Math.min(y0, sy), Math.max(y1, sy)];
    }
    target = add(
      add(target, mul(right, ((x0 + x1) / 2) * distance * tan.x)),
      mul(up, ((y0 + y1) / 2) * distance * tan.y),
    );
    distance = fit();
  }
  return { target, yaw, pitch, distance };
}

/** One finger dragged across the view by (dx, dy) points: turn around the room and tilt. */
export function orbitBy(o: Orbit, dx: number, dy: number, viewport: Viewport): Orbit {
  const w = Math.max(viewport.width, 1);
  const h = Math.max(viewport.height, 1);
  return {
    ...o,
    yaw: o.yaw - (dx / w) * 180,
    pitch: clamp(o.pitch + (dy / h) * 120, PITCH_MIN, PITCH_MAX),
  };
}

/** Pinch: a scale above 1 (fingers apart) moves closer. */
export function zoomBy(o: Orbit, scale: number, maxDistance: number): Orbit {
  if (!(scale > 0)) return o;
  return { ...o, distance: clamp(o.distance / scale, DISTANCE_MIN, Math.max(maxDistance, 2)) };
}

/** In-between camera for a glide from `a` (t = 0) to `b` (t = 1), turning the short way round. */
export function lerpOrbit(a: Orbit, b: Orbit, t: number): Orbit {
  const s = clamp(t, 0, 1);
  const turn = ((((b.yaw - a.yaw) % 360) + 540) % 360) - 180;
  return {
    target: [
      a.target[0] + (b.target[0] - a.target[0]) * s,
      a.target[1] + (b.target[1] - a.target[1]) * s,
      a.target[2] + (b.target[2] - a.target[2]) * s,
    ],
    yaw: a.yaw + turn * s,
    pitch: a.pitch + (b.pitch - a.pitch) * s,
    distance: a.distance + (b.distance - a.distance) * s,
  };
}
