/**
 * Captures what the 3D view draws, as a JPEG file, for the final picture.
 *
 * ViroReact 3.0.3 has a screenshot only for its AR navigator (`_takeScreenshot`); the 3D view's
 * navigator (Viro3DSceneNavigator) has none on either platform. Its renderer draws into:
 * - iPhone: a GLKView (ViroKit's VROViewScene). This module calls `GLKView.snapshot`, which draws
 *   a fresh frame off screen: exactly what ViroKit's own `takeScreenshot` does (VROViewRecorder).
 * - Android: a TextureView (ViroCore's GLTextureView). This module reads its latest frame with
 *   `TextureView.getBitmap()`.
 * Either way the picture is the 3D scene alone, at the view's full pixel size, without anything
 * React Native draws over it.
 */
import { requireOptionalNativeModule } from 'expo';

export interface SceneCaptureOptions {
  /** JPEG quality, 0 to 1. */
  quality: number;
  /** Fills any transparent pixels, e.g. '#f1f1f0'. */
  background: string;
}

export interface SceneCaptureResult {
  /** `file://` URI of the JPEG in the app's cache folder. */
  uri: string;
  /** Pixels. */
  width: number;
  height: number;
}

interface SceneCaptureModule {
  captureAsync(viewTag: number, options: SceneCaptureOptions): Promise<SceneCaptureResult>;
}

// Optional: an app built before this module existed (or a unit test) simply has no pictures.
const native = requireOptionalNativeModule<SceneCaptureModule>('SceneCapture');

/** False in an app build made before the picture feature: it needs a new build. */
export const sceneCaptureAvailable = native !== null;

/** Captures the 3D view whose React tag is `viewTag` (`findNodeHandle` of its navigator). */
export function captureScene(
  viewTag: number,
  options: SceneCaptureOptions,
): Promise<SceneCaptureResult> {
  if (!native) {
    return Promise.reject(new Error('This build of the app cannot take pictures yet.'));
  }
  return native.captureAsync(viewTag, options);
}
