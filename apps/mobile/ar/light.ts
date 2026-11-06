/**
 * The AR scene's lights follow the room's own light: ViroReact's ambient light estimate (from
 * ARKit's, and ARCore's rescaled by Viro to the same range) dims the furniture in a dim room and
 * brightens it in a bright one, so it sits better among the real things around it.
 */

/** What ARKit reports for a normally lit room (lumens); the scene's base intensities match it. */
export const NEUTRAL_LIGHT = 1000;
/** The furniture never goes darker or brighter than this share of its base lighting. */
export const LIGHT_SCALE_MIN = 0.4;
export const LIGHT_SCALE_MAX = 1.4;

/** The scene's lights in a normally lit room (ViroReact intensities). */
export const BASE_LIGHTS = { ambient: 300, directional: 850 } as const;

/**
 * How much to scale the scene's lights for a light estimate: 1 without one, rounded to tenths so
 * the lights change only when the room's light really does (not with every small flicker).
 */
export function lightScale(estimate: number | null): number {
  if (estimate === null || !Number.isFinite(estimate)) return 1;
  const scale = Math.min(LIGHT_SCALE_MAX, Math.max(LIGHT_SCALE_MIN, estimate / NEUTRAL_LIGHT));
  return Math.round(scale * 10) / 10;
}

/** The ambient and directional light intensities for a light estimate. */
export function arLights(estimate: number | null): { ambient: number; directional: number } {
  const scale = lightScale(estimate);
  return {
    ambient: Math.round(BASE_LIGHTS.ambient * scale),
    directional: Math.round(BASE_LIGHTS.directional * scale),
  };
}
