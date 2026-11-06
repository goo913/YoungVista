/**
 * Posed camera keyframes for the turn-around scan (packages/core/src/turn-scan.ts), taken straight
 * from ARKit through ViroReact's own AR session. iPhone only.
 *
 * ViroReact 3.0.3 gives JavaScript the camera pose but not the camera image, and its screenshot
 * is the screen (cropped, with the AR drawing on it). This module reaches the ARSession behind
 * the AR navigator through ViroKit's shipped headers (VROViewAR -getARSession, then
 * VROARSessioniOS::getARSession(); ios/RCSessionAccess.mm), the way ViroReact's own object
 * detector does, and only reads `currentFrame`: ViroKit stays the session's delegate.
 *
 * - `prepare` says which video format the session runs and switches a 16:9 one to 4:3
 *   (1920 × 1440), which sees about 53° up and down in landscape instead of 41°. The switch only
 *   counts once frames arrive in the new format; otherwise the old one comes back.
 * - `start` samples the session about `rate` times a second. Each sample's image is copied out of
 *   ARKit's buffers at once (so the camera never runs short) and an `onFrame` event carries its
 *   pose, intrinsics, size, tracking, exposure and a sharpness measure. The last `slots` copies
 *   are kept.
 * - `keep` writes one of those copies as a JPEG at full size in the sensor's own orientation,
 *   exactly as the pose and intrinsics describe it. The app decides which frames to keep
 *   (scan/turn/keyframes.ts).
 *
 * The coordinates are ARKit's world, which is also Viro's scene (Viro's camera position is ARKit's
 * `camera.transform` translation, its anchors ARKit's anchor transforms, and nothing in the app
 * moves the world origin), so frames, the AR floor and the scan's marks all agree.
 */
import { requireOptionalNativeModule, type NativeModule } from 'expo';

export interface VideoFormat {
  width: number;
  height: number;
  fps: number;
}

export interface PrepareResult {
  /** The format the session ran when it was found. */
  before: VideoFormat;
  /** The format it runs now. */
  format: VideoFormat;
  /** True when this call switched it to 4:3 and frames arrive in it. */
  switched: boolean;
  /** Why it was not switched, or was switched back (for the scan log). */
  note?: string;
  /** Every format ARKit offers for world tracking on this phone. */
  supported: VideoFormat[];
  /** The model identifier, e.g. "iPhone15,4" for an iPhone 15. */
  model: string;
  /** iOS version, e.g. "27.0". */
  os: string;
}

export type FrameTracking = 'normal' | 'limited' | 'unavailable';

/** One sampled frame, as ARKit gave it. */
export interface FrameEvent {
  id: number;
  /** ARKit's frame timestamp (seconds, system uptime). */
  timestamp: number;
  /** Camera-to-world, column-major 4×4 (ARKit's camera axes: +X along the image width). */
  transform: number[];
  /** fx, fy, cx, cy in pixels, for the image as stored. */
  intrinsics: [number, number, number, number];
  width: number;
  height: number;
  tracking: FrameTracking;
  /** Why tracking is limited ('initializing', 'excessive-motion', ...), or null. */
  trackingReason: string | null;
  /** Seconds. */
  exposureDuration: number;
  exposureOffset: number;
  ambientIntensity: number | null;
  /** Variance of a Laplacian of the image's luma; higher is sharper. */
  sharpness: number;
}

export interface KeepResult {
  /** `file://` URI of the JPEG. */
  uri: string;
  bytes: number;
  width: number;
  height: number;
}

export interface StartOptions {
  /** Samples per second (default 15). */
  rate?: number;
  /** How many of the latest samples stay available to `keep` (default 8). */
  slots?: number;
}

type Events = { onFrame: (event: FrameEvent) => void };

declare class RoomCaptureNative extends NativeModule<Events> {
  prepareAsync(viewTag: number, options: { prefer4x3: boolean }): Promise<PrepareResult>;
  startAsync(viewTag: number, options: StartOptions): Promise<void>;
  keepAsync(frameId: number, uri: string, quality: number): Promise<KeepResult>;
  stopAsync(): Promise<void>;
}

// Optional: Android, an app built before this module existed, and unit tests have none.
const native = requireOptionalNativeModule<RoomCaptureNative>('RoomCapture');

/** False where the turn-around scan cannot run (Android, or an older build of the app). */
export const roomCaptureAvailable = native !== null;

const missing = () =>
  Promise.reject(new Error('This build of the app cannot scan by turning around yet.'));

/** Finds the AR session under the navigator whose React tag is `viewTag`, and its video format. */
export function prepareCapture(
  viewTag: number,
  options: { prefer4x3: boolean } = { prefer4x3: true },
): Promise<PrepareResult> {
  return native ? native.prepareAsync(viewTag, options) : missing();
}

/** Starts sampling frames; they arrive through `onCaptureFrame`. */
export function startCapture(viewTag: number, options: StartOptions = {}): Promise<void> {
  return native ? native.startAsync(viewTag, options) : missing();
}

/** Writes sampled frame `frameId` as a JPEG at `uri`; rejects once that frame is no longer kept. */
export function keepFrame(frameId: number, uri: string, quality = 0.85): Promise<KeepResult> {
  return native ? native.keepAsync(frameId, uri, quality) : missing();
}

/** Stops sampling (JPEGs already asked for are still written). */
export function stopCapture(): Promise<void> {
  return native ? native.stopAsync() : Promise.resolve();
}

/** Listens to sampled frames; returns the function that stops listening. */
export function onCaptureFrame(listener: (event: FrameEvent) => void): () => void {
  if (!native) return () => {};
  const subscription = native.addListener('onFrame', listener);
  return () => subscription.remove();
}
