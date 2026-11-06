/**
 * Test data shaped like ViroReact 3.x events (see scan/viro-anchor.ts for what Viro sends).
 *
 * Rotations are Euler degrees in Viro's order, R = Rz·Ry·Rx (core's 'ZYX'). On iPhone a plane's
 * `center` is its centre in world space; on Android it is [0, 0, 0] and the anchor sits at the
 * centre. Vertices are in the anchor's space.
 */
import { eulerFromRotationMatrix, type Mat3, type Vec2 } from '@youngvista/core';
import type { CameraPose } from '@/scan/viro-anchor';

export type V3 = [number, number, number];

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit3 = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Small deterministic PRNG so noisy tests are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Viro's `rotation` for an anchor whose local x, y, z axes point along `x`, `y`, `z` in the world. */
export function viroRotation(x: V3, y: V3, z: V3): V3 {
  const m: Mat3 = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  return eulerFromRotationMatrix(m, 'ZYX');
}

export type Platform = 'ios' | 'android';

interface PlaneOptions {
  platform?: Platform;
  classification?: string;
}

/**
 * A level plane anchor at height `y`, `size` metres square around (x, z). iPhones say
 * 'Horizontal' for every level plane.
 */
export function floorAnchor(
  id: string,
  y: number,
  {
    x = 0,
    z = 0,
    size = 2,
    alignment = 'Horizontal',
    classification = 'None',
    platform = 'ios',
  }: PlaneOptions & { x?: number; z?: number; size?: number; alignment?: string } = {},
) {
  const h = size / 2;
  return {
    anchorId: id,
    type: 'plane',
    alignment,
    classification,
    position: [x, y, z] as V3,
    rotation: [0, 0, 0] as V3,
    scale: [1, 1, 1] as V3,
    center: (platform === 'ios' ? [x, y, z] : [0, 0, 0]) as V3,
    width: size,
    height: size,
    vertices: [
      [-h, 0, -h],
      [h, 0, -h],
      [h, 0, h],
      [-h, 0, h],
    ] as V3[],
  };
}

/**
 * An upright plane anchor standing on the floor line from `a` to `b`, from height `bottom` to
 * `top`, its normal toward `toward` (the camera's side). `twistDeg` turns the anchor's x and z
 * axes about the normal, as ARKit does since iOS 16: only the normal and the vertices tell where
 * the plane is.
 */
export function uprightAnchor(
  id: string,
  a: Vec2,
  b: Vec2,
  {
    bottom,
    top,
    toward,
    twistDeg = 0,
    platform = 'ios',
    classification = 'None',
  }: PlaneOptions & { bottom: number; top: number; toward: Vec2; twistDeg?: number },
) {
  const along = unit3([b.x - a.x, 0, b.z - a.z]);
  let n: V3 = [-along[2], 0, along[0]];
  const mid: V3 = [(a.x + b.x) / 2, (bottom + top) / 2, (a.z + b.z) / 2];
  if (dot3(n, [toward.x - mid[0], 0, toward.z - mid[2]]) < 0) n = [-n[0], -n[1], -n[2]];
  const t = (twistDeg * Math.PI) / 180;
  const z0 = cross3(along, n);
  const x: V3 = [
    along[0] * Math.cos(t) - z0[0] * Math.sin(t),
    along[1] * Math.cos(t) - z0[1] * Math.sin(t),
    along[2] * Math.cos(t) - z0[2] * Math.sin(t),
  ];
  const z = cross3(x, n);
  const corners: V3[] = [
    [a.x, bottom, a.z],
    [b.x, bottom, b.z],
    [b.x, top, b.z],
    [a.x, top, a.z],
  ];
  const local = corners.map((p): V3 => {
    const d = sub3(p, mid);
    return [dot3(d, x), dot3(d, n), dot3(d, z)];
  });
  const extent = (k: 0 | 2) =>
    Math.max(...local.map((p) => p[k])) - Math.min(...local.map((p) => p[k]));
  return {
    anchorId: id,
    type: 'plane',
    alignment: 'Vertical',
    classification,
    position: mid,
    rotation: viroRotation(x, n, z),
    scale: [1, 1, 1] as V3,
    center: (platform === 'ios' ? mid : [0, 0, 0]) as V3,
    width: extent(0),
    height: extent(2),
    vertices: local,
  };
}

/**
 * A camera transform event for a phone at `position` aimed at `target`, off by up to `errorDeg`
 * in a random direction (uniform over the disc).
 */
export function aimedCamera(position: V3, target: V3, rand: () => number = () => 0, errorDeg = 0) {
  let f = unit3(sub3(target, position));
  if (errorDeg > 0) {
    const side = Math.abs(f[1]) < 0.9 ? unit3(cross3(f, [0, 1, 0])) : unit3(cross3(f, [1, 0, 0]));
    const other = cross3(side, f);
    const turn = (errorDeg * Math.sqrt(rand()) * Math.PI) / 180;
    const around = 2 * Math.PI * rand();
    const p: V3 = [
      side[0] * Math.cos(around) + other[0] * Math.sin(around),
      side[1] * Math.cos(around) + other[1] * Math.sin(around),
      side[2] * Math.cos(around) + other[2] * Math.sin(around),
    ];
    f = unit3([
      f[0] * Math.cos(turn) + p[0] * Math.sin(turn),
      f[1] * Math.cos(turn) + p[1] * Math.sin(turn),
      f[2] * Math.cos(turn) + p[2] * Math.sin(turn),
    ]);
  }
  const right = Math.abs(f[1]) < 0.99 ? unit3(cross3(f, [0, 1, 0])) : ([1, 0, 0] as V3);
  const up = unit3(cross3(right, f));
  return { position, rotation: [0, 0, 0] as V3, forward: f, up };
}

/** The pose ScanController stores for a camera event. */
export function pose(position: V3, forward: V3, up: V3 = [0, 1, 0]): CameraPose {
  const n = (v: V3): V3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  return { position, rotation: [0, 0, 0], forward: n(forward), up: n(up) };
}

/** A camera transform event for a phone at `position` looking along `forward`. */
export function cameraEvent(position: V3, forward: V3, up: V3 = [0, 1, 0]) {
  return { position, rotation: [0, 0, 0] as V3, forward, up };
}
