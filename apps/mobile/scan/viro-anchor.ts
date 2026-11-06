/**
 * ViroReact 3.x anchor and camera events, mapped to plain data for the scan session.
 *
 * What ViroReact 3.0.3 sends, read from its bridges (node_modules/@reactvision/react-viro:
 * ios/ViroReact/AR/VRTARUtils.m `createDictionaryFromAnchor`; Android: ReactVision/viro
 * android/viro_bridge/.../ARUtils.java `mapFromARAnchor`) and from ViroCore (ReactVision/virocore):
 * - Anchors (`onAnchorFound`, `onAnchorUpdated`, `onAnchorRemoved` on ViroARScene) carry
 *   `anchorId`, `type` ('plane' for planes), `position` (the anchor transform's translation,
 *   world metres), `rotation` and, for planes, `center`, `width` (extent x), `height` (extent z),
 *   `alignment` ('Horizontal', 'HorizontalUpward', 'HorizontalDownward' or 'Vertical'; iPhones
 *   only say 'Horizontal'), `classification` ('Wall', 'Floor', 'Ceiling', 'Table', 'Seat',
 *   'Door', 'Window', 'None' or 'Unknown') and `vertices` (the boundary polygon).
 * - `rotation` is `transform.extractRotation(scale).toEuler()` in degrees. ViroCore's
 *   VROQuaternion::toEuler returns the angles of R = Rz·Ry·Rx (core's Euler order 'ZYX'), the
 *   same order VROQuaternion::set uses for node rotations.
 * - `center` differs by platform. iOS: the plane's centre in WORLD space (VROARSessioniOS.cpp
 *   multiplies ARKit's local centre by the anchor transform before storing it). Android: always
 *   [0, 0, 0], because the anchor transform is the plane's centre pose (VROARSessionARCore.cpp).
 * - The anchor's origin always lies on the plane, and `vertices` are in the anchor's own space
 *   (ARKit plane geometry, ARCore polygon), so `position + R·v` places them in the world.
 * - Since iOS 16 ARKit no longer turns the anchor to fit the plane: the extent rectangle is turned
 *   by `planeExtent.rotationOnYAxis`, which Viro does not pass on. So `width` and `height` are
 *   not tied to the anchor's x and z axes; the plane's normal and its vertices are reliable.
 * - The camera (`onCameraTransformUpdate`, every frame) carries `position`, `rotation`,
 *   `forward` and `up`, all world space.
 */
import type { PlaneAnchor, Vec3Tuple } from '@youngvista/core';

export type PlaneAlignment = 'Horizontal' | 'HorizontalUpward' | 'HorizontalDownward' | 'Vertical';

const ALIGNMENTS: ReadonlySet<string> = new Set<PlaneAlignment>([
  'Horizontal',
  'HorizontalUpward',
  'HorizontalDownward',
  'Vertical',
]);

/** Boundary vertices kept per plane (ARKit can send a hundred or more). */
export const MAX_PLANE_VERTICES = 64;

/** A plane anchor in the shape `@youngvista/core` works with, plus what Viro says about it. */
export interface TrackedPlane {
  id: string;
  alignment: PlaneAlignment;
  /** Viro's classification ('Wall', 'Floor', 'Ceiling', ...), or null when it sent none. */
  classification: string | null;
  anchor: PlaneAnchor & {
    id: string;
    position: Vec3Tuple;
    rotationDeg: Vec3Tuple;
    /** As Viro sent it: world space on iOS, [0, 0, 0] on Android (see the header). */
    center: Vec3Tuple;
  };
  /** Boundary vertices in the anchor's space, flat `[x0, y0, z0, x1, ...]` (evenly thinned). */
  vertices: number[];
}

/** The camera pose from `onCameraTransformUpdate`, world space. */
export interface CameraPose {
  position: Vec3Tuple;
  /** Euler degrees, same convention as anchors. */
  rotation: Vec3Tuple;
  /** Unit vector the camera looks along (through the middle of the screen). */
  forward: Vec3Tuple;
  /** Unit vector toward the top of the screen. */
  up: Vec3Tuple;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A finite `[x, y, z]` from a Viro array, or null. */
export function vec3(v: unknown): Vec3Tuple | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const [x, y, z] = v as unknown[];
  return finite(x) && finite(y) && finite(z) ? [x, y, z] : null;
}

/** Viro's vertex list as a flat array, keeping at most `max` vertices spread evenly. */
export function flatVertices(v: unknown, max = MAX_PLANE_VERTICES): number[] {
  if (!Array.isArray(v)) return [];
  const all = v.map(vec3).filter((p): p is Vec3Tuple => p !== null);
  const step = Math.max(1, all.length / max);
  const out: number[] = [];
  for (let k = 0; k < all.length && out.length < max * 3; k += step) {
    const p = all[Math.floor(k)]!;
    out.push(p[0], p[1], p[2]);
  }
  return out;
}

/** Maps a Viro anchor to a tracked plane. Returns null for anything that is not a usable plane. */
export function planeFromViroAnchor(anchor: unknown): TrackedPlane | null {
  if (!isObject(anchor)) return null;
  const { anchorId, type, alignment, classification } = anchor;
  if (typeof anchorId !== 'string' || anchorId === '') return null;
  if (type !== undefined && type !== 'plane') return null;
  if (typeof alignment !== 'string' || !ALIGNMENTS.has(alignment)) return null;
  const position = vec3(anchor.position);
  const rotationDeg = vec3(anchor.rotation);
  const center = anchor.center === undefined ? ([0, 0, 0] as const) : vec3(anchor.center);
  const { width, height } = anchor;
  if (!position || !rotationDeg || !center) return null;
  if (!finite(width) || !finite(height) || width < 0 || height < 0) return null;
  return {
    id: anchorId,
    alignment: alignment as PlaneAlignment,
    classification: typeof classification === 'string' ? classification : null,
    anchor: { id: anchorId, position, rotationDeg, center, width, height },
    vertices: flatVertices(anchor.vertices),
  };
}

/** The anchor id of a removed anchor, or null. */
export function anchorIdOf(anchor: unknown): string | null {
  return isObject(anchor) && typeof anchor.anchorId === 'string' && anchor.anchorId
    ? anchor.anchorId
    : null;
}

/** Maps Viro's camera transform event to a pose. Accepts the deprecated nested shape too. */
export function cameraPoseFromViro(event: unknown): CameraPose | null {
  if (!isObject(event)) return null;
  const source =
    isObject(event.cameraTransform) && !('position' in event) ? event.cameraTransform : event;
  const position = vec3(source.position);
  const rotation = vec3(source.rotation);
  const forward = vec3(source.forward);
  const up = vec3(source.up);
  if (!position || !rotation || !forward || !up) return null;
  const f = Math.hypot(...forward);
  const u = Math.hypot(...up);
  if (f < 1e-6 || u < 1e-6) return null;
  return {
    position,
    rotation,
    forward: [forward[0] / f, forward[1] / f, forward[2] / f],
    up: [up[0] / u, up[1] / u, up[2] / u],
  };
}

/** The light estimate from `onAmbientLightUpdate`, or null. */
export function lightIntensityFromViro(update: unknown): number | null {
  return isObject(update) && finite(update.intensity) ? update.intensity : null;
}
