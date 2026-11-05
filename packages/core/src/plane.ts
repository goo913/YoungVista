/**
 * AR plane anchors to floor wall observations.
 *
 * An AR plane lies in its anchor's local XZ plane with its normal on local +Y. For a wall
 * (vertical plane) the wall's horizontal direction is the local X axis in world space, and
 * `width` is the extent along local X, `height` the extent along local Z.
 *
 * The anchor rotation arrives as Euler angles in degrees. The order in which ViroReact composes
 * them must be confirmed on a real phone, so it is a parameter (default 'YXZ').
 */
import type { Vec2, WallObservation } from './types';
import { toDegrees, toRadians } from './vec';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Vec3Tuple = readonly [number, number, number];

/**
 * Euler order: 'YXZ' means R = Ry · Rx · Rz (rotate about Y, then the new X, then the new Z),
 * the same convention as three.js.
 */
export type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';

/** Row-major 3×3 matrix: [m11, m12, m13, m21, m22, m23, m31, m32, m33]. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type Axis = 'X' | 'Y' | 'Z';

function axisRotation(axis: Axis, rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  switch (axis) {
    case 'X':
      return [1, 0, 0, 0, c, -s, 0, s, c];
    case 'Y':
      return [c, 0, s, 0, 1, 0, -s, 0, c];
    case 'Z':
      return [c, -s, 0, s, c, 0, 0, 0, 1];
  }
}

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const m = (r: number, c: number) =>
    a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  return [m(0, 0), m(0, 1), m(0, 2), m(1, 0), m(1, 1), m(1, 2), m(2, 0), m(2, 1), m(2, 2)];
}

const tuple = (v: Vec3 | Vec3Tuple): Vec3Tuple => ('x' in v ? [v.x, v.y, v.z] : v);

export function applyMat3(m: Mat3, v: Vec3 | Vec3Tuple): Vec3 {
  const [x, y, z] = tuple(v);
  return {
    x: m[0] * x + m[1] * y + m[2] * z,
    y: m[3] * x + m[4] * y + m[5] * z,
    z: m[6] * x + m[7] * y + m[8] * z,
  };
}

/** Rotation matrix for Euler angles `[x, y, z]` in degrees, composed in `order` (default 'YXZ'). */
export function rotationMatrixFromEuler(
  rotationDeg: Vec3 | Vec3Tuple,
  order: EulerOrder = 'YXZ',
): Mat3 {
  const [x, y, z] = tuple(rotationDeg);
  const angle: Record<Axis, number> = { X: toRadians(x), Y: toRadians(y), Z: toRadians(z) };
  const [p, q, r] = order.split('') as [Axis, Axis, Axis];
  return multiplyMat3(
    multiplyMat3(axisRotation(p, angle[p]), axisRotation(q, angle[q])),
    axisRotation(r, angle[r]),
  );
}

/**
 * Euler angles `[x, y, z]` in degrees for a rotation matrix, in `order`. The inverse of
 * `rotationMatrixFromEuler` (angles may differ but produce the same matrix). Same formulas as three.js.
 */
export function eulerFromRotationMatrix(
  m: Mat3,
  order: EulerOrder = 'YXZ',
): [number, number, number] {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = m;
  const clamp = (v: number) => Math.min(1, Math.max(-1, v));
  const lock = 0.9999999;
  let x = 0;
  let y = 0;
  let z = 0;
  switch (order) {
    case 'XYZ':
      y = Math.asin(clamp(m13));
      if (Math.abs(m13) < lock) {
        x = Math.atan2(-m23, m33);
        z = Math.atan2(-m12, m11);
      } else {
        x = Math.atan2(m32, m22);
      }
      break;
    case 'YXZ':
      x = Math.asin(-clamp(m23));
      if (Math.abs(m23) < lock) {
        y = Math.atan2(m13, m33);
        z = Math.atan2(m21, m22);
      } else {
        y = Math.atan2(-m31, m11);
      }
      break;
    case 'ZXY':
      x = Math.asin(clamp(m32));
      if (Math.abs(m32) < lock) {
        y = Math.atan2(-m31, m33);
        z = Math.atan2(-m12, m22);
      } else {
        z = Math.atan2(m21, m11);
      }
      break;
    case 'ZYX':
      y = Math.asin(-clamp(m31));
      if (Math.abs(m31) < lock) {
        x = Math.atan2(m32, m33);
        z = Math.atan2(m21, m11);
      } else {
        z = Math.atan2(-m12, m22);
      }
      break;
    case 'YZX':
      z = Math.asin(clamp(m21));
      if (Math.abs(m21) < lock) {
        x = Math.atan2(-m23, m22);
        y = Math.atan2(-m31, m11);
      } else {
        y = Math.atan2(m13, m33);
      }
      break;
    case 'XZY':
      z = Math.asin(-clamp(m12));
      if (Math.abs(m12) < lock) {
        x = Math.atan2(m32, m22);
        y = Math.atan2(m13, m11);
      } else {
        x = Math.atan2(-m23, m33);
      }
      break;
  }
  return [toDegrees(x), toDegrees(y), toDegrees(z)];
}

/** An AR plane anchor as reported by ViroReact's `onAnchorFound` / `onAnchorUpdated`. */
export interface PlaneAnchor {
  /** Anchor id; used as the observation id so updates replace earlier sightings. */
  id?: string;
  /** Anchor position in world space (metres). */
  position: Vec3 | Vec3Tuple;
  /** Anchor rotation as Euler angles in degrees. */
  rotationDeg: Vec3 | Vec3Tuple;
  /** Centre of the plane's extent in the anchor's local space. Default [0, 0, 0]. */
  center?: Vec3 | Vec3Tuple;
  /** Extent along local X (metres). */
  width: number;
  /** Extent along local Z (metres). */
  height: number;
}

export interface WallFromPlaneOptions {
  /** Euler order of `rotationDeg`. Default 'YXZ'. */
  eulerOrder?: EulerOrder;
  /** Observation id. Default: the anchor id, else 'plane'. */
  id?: string;
  /** Planes whose normal is more than this many degrees from horizontal are not walls. Default 15. */
  maxTiltDeg?: number;
  /** Planes narrower than this (m, along the floor) are ignored. Default 0.25. */
  minWidth?: number;
  /**
   * Which local axis runs along the floor: 'x' (default, the AR convention above), 'z', or 'auto'
   * (whichever is more horizontal). 'auto' is a safety net while the convention is being checked.
   */
  horizontalAxis?: 'x' | 'z' | 'auto';
}

export type PlaneRejection =
  'not-vertical' | 'axis-not-horizontal' | 'too-narrow' | 'invalid-input';

/** Everything `wallFromPlane` works out, for a debug overlay that draws the raw planes. */
export interface PlaneDescription {
  /** World centre of the plane's extent. */
  center: Vec3;
  /** World direction of local +Y (the plane normal). */
  normal: Vec3;
  /** World direction of local +X (the `width` axis). */
  xAxis: Vec3;
  /** World direction of local +Z (the `height` axis). */
  zAxis: Vec3;
  /** World corners of the plane's extent rectangle, in order. */
  corners: [Vec3, Vec3, Vec3, Vec3];
  /** Angle between the normal and the horizontal plane: 0 for a perfect wall, 90 for a floor. */
  tiltDeg: number;
  /** The floor observation, or null if the plane is not usable as a wall. */
  observation: WallObservation | null;
  rejected?: PlaneRejection;
}

const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const finite3 = (v: Vec3Tuple) => v.every((n) => Number.isFinite(n));

/**
 * Describes an AR plane in world space and, if it is a wall, its floor observation.
 * `floorY` is the detected floor height; planes that float well above it (a picture, the top of
 * a cabinet) get a lower confidence.
 */
export function describePlane(
  plane: PlaneAnchor,
  floorY: number,
  options: WallFromPlaneOptions = {},
): PlaneDescription {
  const order = options.eulerOrder ?? 'YXZ';
  const maxTiltDeg = options.maxTiltDeg ?? 15;
  const minWidth = options.minWidth ?? 0.25;
  const mode = options.horizontalAxis ?? 'x';

  const position = tuple(plane.position);
  const rotation = tuple(plane.rotationDeg);
  const localCenter = tuple(plane.center ?? [0, 0, 0]);
  const R = rotationMatrixFromEuler(rotation, order);
  const center = add3(
    { x: position[0], y: position[1], z: position[2] },
    applyMat3(R, localCenter),
  );
  const normal = applyMat3(R, [0, 1, 0]);
  const xAxis = applyMat3(R, [1, 0, 0]);
  const zAxis = applyMat3(R, [0, 0, 1]);
  const hx = plane.width / 2;
  const hz = plane.height / 2;
  const corner = (sx: number, sz: number) =>
    add3(center, add3(scale3(xAxis, sx * hx), scale3(zAxis, sz * hz)));
  const corners: [Vec3, Vec3, Vec3, Vec3] = [
    corner(-1, -1),
    corner(1, -1),
    corner(1, 1),
    corner(-1, 1),
  ];
  const tiltDeg = toDegrees(Math.asin(Math.min(1, Math.abs(normal.y))));
  const base = { center, normal, xAxis, zAxis, corners, tiltDeg };

  const valid =
    finite3(position) &&
    finite3(rotation) &&
    finite3(localCenter) &&
    Number.isFinite(plane.width) &&
    Number.isFinite(plane.height) &&
    Number.isFinite(floorY);
  if (!valid) return { ...base, observation: null, rejected: 'invalid-input' };
  if (tiltDeg > maxTiltDeg) return { ...base, observation: null, rejected: 'not-vertical' };

  const useX = mode === 'x' || (mode === 'auto' && Math.abs(xAxis.y) <= Math.abs(zAxis.y));
  const axis = useX ? xAxis : zAxis;
  const extent = Math.abs(useX ? plane.width : plane.height);
  const vAxis = useX ? zAxis : xAxis;
  const vExtent = Math.abs(useX ? plane.height : plane.width);
  const horizontal = Math.hypot(axis.x, axis.z);
  if (horizontal < Math.SQRT1_2)
    return { ...base, observation: null, rejected: 'axis-not-horizontal' };

  const u: Vec2 = { x: axis.x / horizontal, z: axis.z / horizontal };
  const floorLength = extent * horizontal;
  if (floorLength < minWidth) return { ...base, observation: null, rejected: 'too-narrow' };

  const half = floorLength / 2;
  const bottom = center.y - (vExtent / 2) * Math.abs(vAxis.y);
  const gap = Math.max(0, bottom - floorY);
  const confidence = Math.min(1, Math.max(0.2, 1 - gap / 2));
  const observation: WallObservation = {
    id: options.id ?? plane.id ?? 'plane',
    source: 'plane',
    a: { x: center.x - u.x * half, z: center.z - u.z * half },
    b: { x: center.x + u.x * half, z: center.z + u.z * half },
    confidence,
  };
  return { ...base, observation };
}

/** Turns an AR vertical plane anchor into a floor wall observation, or null if it is not a usable wall. */
export function wallFromPlane(
  plane: PlaneAnchor,
  floorY: number,
  options: WallFromPlaneOptions = {},
): WallObservation | null {
  return describePlane(plane, floorY, options).observation;
}

/** A wall observation from two taps at the bottom of a wall (floor hit points, world XZ). */
export function wallFromTaps(
  first: Vec2 | Vec3 | Vec3Tuple,
  second: Vec2 | Vec3 | Vec3Tuple,
  id: string,
): WallObservation {
  const flat = (p: Vec2 | Vec3 | Vec3Tuple): Vec2 =>
    Array.isArray(p) ? { x: p[0], z: p[2] } : { x: (p as Vec2).x, z: (p as Vec2).z };
  return { id, source: 'tap', a: flat(first), b: flat(second), confidence: 1 };
}
