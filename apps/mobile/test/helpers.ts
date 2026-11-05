/**
 * Test data shaped like ViroReact 3.x events.
 *
 * A wall anchor uses rotation [90, yaw, 0]: in core's 'YXZ' order that is Ry(yaw)·Rx(90), which
 * turns the plane's local X along the floor (direction (cos yaw, -sin yaw) on the XZ plane), its
 * normal (local Y) level, and local Z straight down, the way AR wall planes are laid out.
 */
import type { CameraPose } from '@/scan/viro-anchor';

type V3 = [number, number, number];

export interface WallAnchorOptions {
  height?: number;
  floorY?: number;
}

export function wallAnchor(
  id: string,
  centerX: number,
  centerZ: number,
  yawDeg: number,
  length: number,
  { height = 2.4, floorY = 0 }: WallAnchorOptions = {},
) {
  return {
    anchorId: id,
    type: 'plane',
    alignment: 'Vertical',
    classification: 'Wall',
    position: [centerX, floorY + height / 2, centerZ] as V3,
    rotation: [90, yawDeg, 0] as V3,
    scale: [1, 1, 1] as V3,
    center: [0, 0, 0] as V3,
    width: length,
    height,
    vertices: [] as V3[],
  };
}

export function floorAnchor(
  id: string,
  y: number,
  { size = 2, alignment = 'HorizontalUpward', classification = 'Floor' } = {},
) {
  return {
    anchorId: id,
    type: 'plane',
    alignment,
    classification,
    position: [0, y, 0] as V3,
    rotation: [0, 0, 0] as V3,
    scale: [1, 1, 1] as V3,
    center: [0, 0, 0] as V3,
    width: size,
    height: size,
  };
}

/** A camera transform event for a phone at `position` looking along `forward`. */
export function cameraEvent(position: V3, forward: V3, up: V3 = [0, 1, 0]) {
  return { position, rotation: [0, 0, 0] as V3, forward, up };
}

/** The pose ScanController stores for `cameraEvent(position, forward, up)`. */
export function pose(position: V3, forward: V3, up: V3 = [0, 1, 0]): CameraPose {
  const n = (v: V3): V3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  return { position, rotation: [0, 0, 0], forward: n(forward), up: n(up) };
}

/** Forward vector from `from` toward the floor point (x, z) at height `floorY`. */
export function lookAt(from: V3, x: number, z: number, floorY = 0): V3 {
  return [x - from[0], floorY - from[1], z - from[2]];
}

/** The four walls of a 4 m × 4 m room around the origin, each 3.6 m long (corners unseen). */
export const squareRoomWalls = () => [
  wallAnchor('north', 0, -2, 0, 3.6),
  wallAnchor('south', 0, 2, 180, 3.6),
  wallAnchor('west', -2, 0, 90, 3.6),
  wallAnchor('east', 2, 0, -90, 3.6),
];
