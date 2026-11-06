/**
 * Test data for the turn-around scan: ARKit camera transforms and sampled frames as the capture
 * module sends them (modules/room-capture `FrameEvent`).
 */
import type { RawFrame } from '@/scan/turn/capture';

export type V3 = [number, number, number];

const DEG = Math.PI / 180;

/** The view direction for a heading (`atan2(x, z)`) and a tilt above the horizon. */
export function forwardOf(yawDeg: number, pitchDeg: number): V3 {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  return [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
}

/**
 * ARKit's camera-to-world transform (column-major 4×4) for a camera at `position` looking along
 * heading `yawDeg` and tilt `pitchDeg`, upright: its −Z axis is the view, +Y up the image.
 */
export function cameraTransform(position: V3, yawDeg: number, pitchDeg: number): number[] {
  const f = forwardOf(yawDeg, pitchDeg);
  const z: V3 = [-f[0], -f[1], -f[2]];
  // x = up × z, then y = z × x: a right-handed frame with x across and y up the image.
  const xr: V3 = [z[2], 0, -z[0]];
  const xl = Math.hypot(...xr);
  const x: V3 = [xr[0] / xl, xr[1] / xl, xr[2] / xl];
  const y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [...x, 0, ...y, 0, ...z, 0, ...position, 1];
}

/** A sampled 1920 × 1440 frame. */
export function rawFrame(
  id: number,
  timestamp: number,
  position: V3,
  yawDeg: number,
  pitchDeg: number,
  options: Partial<RawFrame> = {},
): RawFrame {
  return {
    id,
    timestamp,
    transform: cameraTransform(position, yawDeg, pitchDeg),
    intrinsics: [1450, 1450, 960, 720],
    width: 1920,
    height: 1440,
    tracking: 'normal',
    trackingReason: null,
    exposureDuration: 1 / 60,
    sharpness: 400,
    ...options,
  };
}
