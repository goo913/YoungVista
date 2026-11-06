/**
 * The turn-around scan's capture plan (docs/research/room-capture-and-ai.md, Q1, "Capture: three
 * landscape rings"): standing in one spot, the user turns all the way round three times with the
 * phone held sideways, aimed down about 35°, then level, then up about 35°. Each ring is cut into
 * yaw bins, and the phone keeps the sharpest, steadiest frame in each (keyframes.ts).
 *
 * This file reads a camera pose: which ring and bin it is in, how far off the ring's tilt it is
 * (the pitch guide), how fast it turns, and which bins the user turned past without a keyframe
 * (the gaps to go back to).
 *
 * Angles follow the capture contract (packages/core/src/turn-scan.ts): yaw is the heading of the
 * camera's view, `atan2(x, z)` of its forward direction, in degrees. Seen from above (X right,
 * Z down) it grows counter-clockwise, so turning left raises it. Pitch is the view's angle above
 * the horizon. Plain TypeScript (test/turn-plan.test.ts).
 */
import type { CaptureMode, Vec3Tuple } from '@youngvista/core';

export const CAPTURE_MODE: CaptureMode = 'landscape-3';
/** The rings' tilts, lowest first: down, level, up (degrees above the horizon). */
export const RING_PITCHES: readonly number[] = [-35, 0, 35];
/** The pitch guide shows "on the line" within this many degrees of the ring's tilt. */
export const PITCH_TOLERANCE_DEG = 5;
/** A frame this close to a ring's tilt can be its keyframe (the closest, sharpest one wins). */
export const KEEP_PITCH_TOLERANCE_DEG = 8;
/** Each ring is cut into bins this wide, one keyframe each: 24 per ring, 72 for a spot. */
export const BIN_DEG = 15;
/** Turning faster than this blurs frames: the screen says "Turn slower" (degrees a second). */
export const MAX_TURN_SPEED = 15;
/** The pace the time left assumes (degrees a second; about 36 s a ring). */
export const TURN_PACE = 10;
/** Standing spots: the first, and an optional second for long or L-shaped rooms. */
export const MAX_SPOTS = 2;
/** Further than this from where the spot started, the user is asked to stay put (m). */
export const SPOT_DRIFT = 0.5;

const DEG = Math.PI / 180;

export const binsPerRing = (binDeg = BIN_DEG): number => Math.round(360 / binDeg);

/** Degrees in (-180, 180]. */
export function wrap180(deg: number): number {
  let d = deg % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** Degrees in [0, 360). */
export function wrap360(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Heading of a view direction (`atan2(x, z)`, degrees). */
export const yawOf = (forward: Vec3Tuple): number => Math.atan2(forward[0], forward[2]) / DEG;

/** Angle of a view direction above the horizon (degrees). */
export function pitchOf(forward: Vec3Tuple): number {
  const l = Math.hypot(forward[0], forward[1], forward[2]);
  return l > 0 ? Math.asin(Math.max(-1, Math.min(1, forward[1] / l))) / DEG : 0;
}

/** Where the camera is and where it looks. */
export interface ViewPose {
  position: Vec3Tuple;
  /** Unit vector along the view (the camera's −Z axis). */
  forward: Vec3Tuple;
  yawDeg: number;
  pitchDeg: number;
}

/** The view of ARKit's camera-to-world transform (column-major 4×4); null when it is unusable. */
export function viewFromTransform(m: readonly number[]): ViewPose | null {
  if (m.length < 16 || !m.slice(0, 16).every(Number.isFinite)) return null;
  // The camera looks down its own −Z axis: the transform's third column, turned round.
  const fx = -m[8]!;
  const fy = -m[9]!;
  const fz = -m[10]!;
  const l = Math.hypot(fx, fy, fz);
  if (!(l > 1e-6)) return null;
  const forward: Vec3Tuple = [fx / l, fy / l, fz / l];
  return {
    position: [m[12]!, m[13]!, m[14]!],
    forward,
    yawDeg: yawOf(forward),
    pitchDeg: pitchOf(forward),
  };
}

/** The bin a heading falls in: 0 from yaw 0° up to `binDeg`, and so on round. */
export function binOf(yawDeg: number, binDeg = BIN_DEG): number {
  return Math.floor(wrap360(yawDeg) / binDeg) % binsPerRing(binDeg);
}

/** The heading in the middle of a bin (degrees, in (-180, 180]). */
export const binCenter = (bin: number, binDeg = BIN_DEG): number => wrap180((bin + 0.5) * binDeg);

/** The ring whose tilt is nearest `pitchDeg`, when within `tolerance`; else null. */
export function ringOf(
  pitchDeg: number,
  tolerance = KEEP_PITCH_TOLERANCE_DEG,
  rings: readonly number[] = RING_PITCHES,
): number | null {
  let best: number | null = null;
  rings.forEach((target, ring) => {
    const off = Math.abs(pitchDeg - target);
    if (off <= tolerance && (best === null || off < Math.abs(pitchDeg - rings[best]!))) {
      best = ring;
    }
  });
  return best;
}

export interface PitchGuide {
  ring: number;
  targetDeg: number;
  /** Degrees above (positive) or below the ring's tilt. */
  offsetDeg: number;
  onTarget: boolean;
  /** Which way to tilt the phone to reach the ring, or null when on it. */
  tilt: 'up' | 'down' | null;
}

/** How the phone's tilt compares with ring `ring`'s (the line the screen shows). */
export function pitchGuide(
  pitchDeg: number,
  ring: number,
  tolerance = PITCH_TOLERANCE_DEG,
  rings: readonly number[] = RING_PITCHES,
): PitchGuide {
  const targetDeg = rings[Math.max(0, Math.min(rings.length - 1, ring))]!;
  const offsetDeg = pitchDeg - targetDeg;
  const onTarget = Math.abs(offsetDeg) <= tolerance;
  return {
    ring,
    targetDeg,
    offsetDeg,
    onTarget,
    tilt: onTarget ? null : offsetDeg > 0 ? 'down' : 'up',
  };
}

/** Angle between two view directions (degrees). */
export function angleBetween(a: Vec3Tuple, b: Vec3Tuple): number {
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  if (!(la > 0 && lb > 0)) return 0;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}

/** Smoothing of the turning speed (s): about a third of a second. */
const SPEED_SMOOTHING = 0.3;

export interface TurnReading {
  /** Turning speed about the vertical, smoothed (degrees a second, unsigned). */
  speed: number;
  /** How fast the view moves between these two samples, any direction (degrees a second). */
  angularSpeed: number;
}

/** Turning speed from successive views. */
export class TurnMeter {
  private last: { t: number; yawDeg: number; forward: Vec3Tuple } | null = null;
  private smoothed = 0;

  /** A new view at `t` (seconds). */
  push(t: number, view: Pick<ViewPose, 'yawDeg' | 'forward'>): TurnReading {
    const last = this.last;
    this.last = { t, yawDeg: view.yawDeg, forward: view.forward };
    if (!last) return { speed: this.smoothed, angularSpeed: 0 };
    const dt = t - last.t;
    if (!(dt > 1e-3)) return { speed: this.smoothed, angularSpeed: 0 };
    if (dt > 1) {
      // A long pause (the app was away): start again.
      this.smoothed = 0;
      return { speed: 0, angularSpeed: 0 };
    }
    const rate = Math.abs(wrap180(view.yawDeg - last.yawDeg)) / dt;
    const a = 1 - Math.exp(-dt / SPEED_SMOOTHING);
    this.smoothed += (rate - this.smoothed) * a;
    return { speed: this.smoothed, angularSpeed: angleBetween(last.forward, view.forward) / dt };
  }

  get speed(): number {
    return this.smoothed;
  }

  reset(): void {
    this.last = null;
    this.smoothed = 0;
  }
}

/**
 * How far round the user has turned on a ring: the heading unwrapped from where the ring began
 * (so a full turn is 360° more), and the least and most it reached.
 */
export interface Sweep {
  /** Unwrapped heading now (degrees; equals the real heading modulo 360). */
  at: number;
  min: number;
  max: number;
}

export function startSweep(yawDeg: number): Sweep {
  return { at: yawDeg, min: yawDeg, max: yawDeg };
}

export function extendSweep(sweep: Sweep, yawDeg: number): Sweep {
  const at = sweep.at + wrap180(yawDeg - sweep.at);
  return { at, min: Math.min(sweep.min, at), max: Math.max(sweep.max, at) };
}

/**
 * The bins the sweep has gone past by more than a bin (so not the one being filled now): those
 * still empty there are gaps to go back to.
 */
export function passedBins(sweep: Sweep, binDeg = BIN_DEG): boolean[] {
  const n = binsPerRing(binDeg);
  const lo = sweep.min + binDeg;
  const hi = sweep.max - binDeg;
  return Array.from({ length: n }, (_, bin) => {
    if (hi - lo >= 360) return true;
    if (hi < lo) return false;
    // The bin's middle, unwrapped to the first copy at or above `lo`.
    const c = (bin + 0.5) * binDeg;
    const k = Math.ceil((lo - c) / 360);
    return c + 360 * k <= hi;
  });
}

export interface Gap {
  bin: number;
  /** Degrees to turn to reach the gap's middle: positive to the left. */
  deltaDeg: number;
  turn: 'left' | 'right';
}

/** The nearest bin that was passed but has no keyframe, or null when there is none. */
export function nearestGap(
  filled: readonly boolean[],
  passed: readonly boolean[],
  yawDeg: number,
  binDeg = BIN_DEG,
): Gap | null {
  let best: Gap | null = null;
  filled.forEach((has, bin) => {
    if (has || !passed[bin]) return;
    const deltaDeg = wrap180(binCenter(bin, binDeg) - yawDeg);
    if (!best || Math.abs(deltaDeg) < Math.abs(best.deltaDeg)) {
      best = { bin, deltaDeg, turn: deltaDeg >= 0 ? 'left' : 'right' };
    }
  });
  return best;
}

/** Seconds of turning left for `bins` empty bins at the usual pace. */
export const secondsLeft = (bins: number, binDeg = BIN_DEG): number =>
  Math.round((bins * binDeg) / TURN_PACE);

/** "about 1 min 20 s", "about 40 s". */
export function describeSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds / 5) * 5);
  if (s < 60) return `about ${Math.max(5, s)} s`;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return rest ? `about ${m} min ${rest} s` : `about ${m} min`;
}

/** The rings' names on screen. */
export const RING_NAMES = ['aim down', 'level', 'aim up'] as const;

/**
 * Screen points per degree of tilt near the middle of the camera view, which shows the camera
 * image filling the screen (cropped at the sides it does not fit): the image's long side runs
 * along the screen's long side, and a degree up or down moves the picture by about its vertical
 * focal length times a degree in radians.
 */
export function pointsPerDegree(
  screen: { width: number; height: number },
  optics: { width: number; height: number; fx: number; fy: number },
): number {
  const landscape = screen.width >= screen.height;
  const across = landscape ? optics.width : optics.height;
  const up = landscape ? optics.height : optics.width;
  const focal = landscape ? optics.fy : optics.fx;
  if (!(across > 0 && up > 0 && focal > 0)) return 0;
  const scale = Math.max(screen.width / across, screen.height / up);
  return scale * focal * DEG;
}
