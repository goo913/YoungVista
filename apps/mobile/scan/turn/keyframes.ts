/**
 * Which camera frames become keyframes: per standing spot, per ring, per yaw bin, the sharpest and
 * steadiest frame (plan.ts has the rings and bins).
 *
 * The phone samples frames a few times a second (modules/room-capture). For each one this decides
 * at once whether it beats the bin's keyframe so far; if it does, the native module writes its
 * JPEG, and only once that is done does it become the bin's keyframe (`settle`), so a keyframe
 * always has its file. Files that lost (a better frame came while one was being written) are
 * handed back to be deleted.
 *
 * A frame's score: its sharpness (the log of the native module's Laplacian variance, so it is a
 * ratio), less its motion blur in pixels (angular speed × exposure × focal length), less a little
 * for being off the ring's tilt or the bin's middle. Frames with limited tracking only fill a bin
 * nothing else has. Plain TypeScript (test/turn-keyframes.test.ts).
 */
import {
  BIN_DEG,
  KEEP_PITCH_TOLERANCE_DEG,
  RING_PITCHES,
  binCenter,
  binOf,
  ringOf,
  viewFromTransform,
  wrap180,
  type ViewPose,
} from './plan';

/** A sampled frame, as the native module reports it (times made relative to the capture). */
export interface FrameSample {
  id: number;
  /** Seconds since the capture started. */
  t: number;
  /** Camera-to-world, column-major 4×4. */
  transform: readonly number[];
  intrinsics: { fx: number; fy: number; cx: number; cy: number };
  width: number;
  height: number;
  tracking: 'normal' | 'limited' | 'unavailable';
  /** Seconds. */
  exposureDuration?: number;
  sharpness?: number;
}

/** A frame chosen for a bin, on its way to being written or written. */
export interface Candidate {
  frame: FrameSample;
  view: ViewPose;
  spot: number;
  ring: number;
  bin: number;
  /** Motion blur during the exposure (pixels). */
  blurPx: number;
  score: number;
}

/** A keyframe: a candidate whose JPEG is written. */
export interface KeptFrame extends Candidate {
  /** `file://` URI of the JPEG on the phone. */
  file: string;
  bytes: number;
}

export type SkipReason = 'no-pose' | 'tracking' | 'pitch' | 'fast' | 'worse';

export type Decision =
  { kind: 'keep'; candidate: Candidate } | { kind: 'skip'; reason: SkipReason };

/** Faster than this (degrees a second) a frame is too blurred to keep at all. */
export const MAX_KEEP_SPEED = 30;
/** A frame must beat the bin's keyframe by this much to replace it (no churn for nothing). */
export const REPLACE_MARGIN = 0.05;
/** Exposure assumed when the camera does not say (s). */
const DEFAULT_EXPOSURE = 1 / 60;
/** Score lost by a frame with limited tracking: any normal frame beats it. */
const LIMITED_PENALTY = 100;

/** Motion blur in pixels: how far the image moves during the exposure. */
export function blurPixels(
  angularSpeedDeg: number,
  exposure: number | undefined,
  fx: number,
): number {
  const e =
    exposure !== undefined && exposure > 0 && Number.isFinite(exposure)
      ? exposure
      : DEFAULT_EXPOSURE;
  return ((Math.max(0, angularSpeedDeg) * Math.PI) / 180) * e * Math.max(0, fx);
}

export function frameScore(input: {
  sharpness?: number;
  blurPx: number;
  pitchOffsetDeg: number;
  binOffsetDeg: number;
  tracking: FrameSample['tracking'];
}): number {
  const sharp = Math.log1p(Math.max(0, input.sharpness ?? 0));
  return (
    sharp -
    0.1 * input.blurPx -
    0.03 * Math.abs(input.pitchOffsetDeg) -
    0.01 * Math.abs(input.binOffsetDeg) -
    (input.tracking === 'limited' ? LIMITED_PENALTY : 0)
  );
}

export interface SelectorOptions {
  binDeg: number;
  pitchTolerance: number;
  rings: readonly number[];
}

const DEFAULTS: SelectorOptions = {
  binDeg: BIN_DEG,
  pitchTolerance: KEEP_PITCH_TOLERANCE_DEG,
  rings: RING_PITCHES,
};

interface Bin {
  best: KeptFrame | null;
  /** The latest candidate being written for this bin, if any. */
  pending: Candidate | null;
}

const binKey = (spot: number, ring: number, bin: number) => `${spot}/${ring}/${bin}`;

export class KeyframeSelector {
  private readonly options: SelectorOptions;
  private readonly bins = new Map<string, Bin>();
  private readonly skipped: Record<SkipReason, number> = {
    'no-pose': 0,
    tracking: 0,
    pitch: 0,
    fast: 0,
    worse: 0,
  };

  constructor(options: Partial<SelectorOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Whether `frame`, taken at standing spot `spot` while the view turned at `angularSpeed`
   * degrees a second, should be written as its bin's keyframe. A 'keep' marks it as the bin's
   * pending candidate until `settle` says how writing it went.
   */
  consider(frame: FrameSample, spot: number, angularSpeed: number): Decision {
    const skip = (reason: SkipReason): Decision => {
      this.skipped[reason]++;
      return { kind: 'skip', reason };
    };
    const view = viewFromTransform(frame.transform);
    if (!view) return skip('no-pose');
    if (frame.tracking === 'unavailable') return skip('tracking');
    const { binDeg, pitchTolerance, rings } = this.options;
    const ring = ringOf(view.pitchDeg, pitchTolerance, rings);
    if (ring === null) return skip('pitch');
    if (angularSpeed > MAX_KEEP_SPEED) return skip('fast');
    const bin = binOf(view.yawDeg, binDeg);
    const blurPx = blurPixels(angularSpeed, frame.exposureDuration, frame.intrinsics.fx);
    const score = frameScore({
      sharpness: frame.sharpness,
      blurPx,
      pitchOffsetDeg: view.pitchDeg - rings[ring]!,
      binOffsetDeg: wrap180(view.yawDeg - binCenter(bin, binDeg)),
      tracking: frame.tracking,
    });
    const key = binKey(spot, ring, bin);
    const slot = this.bins.get(key) ?? { best: null, pending: null };
    const toBeat = Math.max(slot.best?.score ?? -Infinity, slot.pending?.score ?? -Infinity);
    const empty = !slot.best && !slot.pending;
    if (!empty && !(score > toBeat + REPLACE_MARGIN)) return skip('worse');
    const candidate: Candidate = { frame, view, spot, ring, bin, blurPx, score };
    this.bins.set(key, { ...slot, pending: candidate });
    return { kind: 'keep', candidate };
  }

  /**
   * Writing `candidate`'s JPEG finished (`written`), or failed (null). Returns the files no longer
   * needed: the keyframe it replaced, or its own when a better frame came meanwhile.
   */
  settle(candidate: Candidate, written: { file: string; bytes: number } | null): string[] {
    const key = binKey(candidate.spot, candidate.ring, candidate.bin);
    const slot = this.bins.get(key);
    if (!slot || slot.pending !== candidate) return written ? [written.file] : [];
    if (!written) {
      this.bins.set(key, { ...slot, pending: null });
      return [];
    }
    this.bins.set(key, { best: { ...candidate, ...written }, pending: null });
    return slot.best ? [slot.best.file] : [];
  }

  /** Which bins of a ring have a keyframe (index = bin). */
  filled(spot: number, ring: number): boolean[] {
    const n = Math.round(360 / this.options.binDeg);
    return Array.from({ length: n }, (_, bin) => !!this.bins.get(binKey(spot, ring, bin))?.best);
  }

  /** Every keyframe, oldest first. */
  keyframes(): KeptFrame[] {
    return [...this.bins.values()]
      .flatMap((b) => (b.best ? [b.best] : []))
      .sort((p, q) => p.frame.t - q.frame.t);
  }

  /** True while some JPEG is still being written. */
  get writing(): boolean {
    return [...this.bins.values()].some((b) => b.pending !== null);
  }

  /** How many frames were passed over, by reason (for the scan log). */
  skips(): Record<SkipReason, number> {
    return { ...this.skipped };
  }
}
