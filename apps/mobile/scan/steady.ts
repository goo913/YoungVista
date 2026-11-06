/**
 * The steady aim: pressing a button shakes the phone a little, so a tap's aim is the camera
 * averaged over the moment just before the finger touched. The scan's Mark and the AR line-up's
 * corner taps both use it.
 */
import type { Vec3Tuple } from '@youngvista/core';
import type { CameraPose } from './viro-anchor';

/** A camera pose and when it was seen (ms). */
export interface TimedPose {
  t: number;
  pose: CameraPose;
}

/** A tap's aim is the camera averaged over this long before the finger touched (ms). */
export const STEADY_MS = 150;
/** ...over the moments it pointed within this many degrees of where it pointed last. */
const STEADY_AGREEMENT_DEG = 1.5;
/** How much camera history to keep (ms). */
export const RECENT_MS = 1000;

/** Adds a pose to `recent` and drops the ones older than `RECENT_MS`. Changes `recent`. */
export function rememberPose(recent: TimedPose[], t: number, pose: CameraPose): void {
  recent.push({ t, pose });
  while (recent.length > 0 && recent[0]!.t < t - RECENT_MS) recent.shift();
}

/**
 * The camera averaged over the STEADY_MS before `at`, using only the moments it pointed where
 * it did last (so a phone still moving onto the target is not smeared in). Null when there is
 * nothing to average.
 */
export function steadyPose(recent: readonly TimedPose[], at: number): CameraPose | null {
  const before = recent.filter((r) => r.t <= at && r.t >= at - STEADY_MS);
  const last = before[before.length - 1]?.pose;
  if (!last) return null;
  const minCos = Math.cos((STEADY_AGREEMENT_DEG * Math.PI) / 180);
  const window = before.filter(
    (r) =>
      r.pose.forward[0] * last.forward[0] +
        r.pose.forward[1] * last.forward[1] +
        r.pose.forward[2] * last.forward[2] >=
      minCos,
  );
  if (window.length < 2) return null;
  const mean = (pick: (p: CameraPose) => Vec3Tuple, unit: boolean): Vec3Tuple => {
    const s = [0, 1, 2].map((k) => window.reduce((acc, r) => acc + pick(r.pose)[k]!, 0));
    const l = unit ? Math.hypot(s[0]!, s[1]!, s[2]!) : window.length;
    return [s[0]! / l, s[1]! / l, s[2]! / l];
  };
  return {
    position: mean((p) => p.position, false),
    rotation: last.rotation,
    forward: mean((p) => p.forward, true),
    up: mean((p) => p.up, true),
  };
}
