/**
 * One turn-around capture, from the frames the native module samples to the keyframes and what
 * the screen shows: the ring being turned, its targets filling in, the pitch guide, the turning
 * speed, the gaps to go back to and the time left.
 *
 * The user turns three rings at a standing spot (plan.ts): down, level, up. A ring is done when
 * every bin has a keyframe, and the next one starts by itself; "Next turn" moves on with gaps
 * left. After the third ring the spot is done; a second spot (long or L-shaped rooms) turns the
 * same three rings again.
 *
 * It also checks that Viro's camera and ARKit's frames describe the same world (`viroCamera`):
 * their positions and view directions should agree to within the phone's movement between the two
 * readings. Plain TypeScript: the native calls come in as `CaptureDeps` (test/turn-capture.test.ts).
 */
import type { Vec3Tuple } from '@youngvista/core';
import type { CameraPose } from '@/scan/viro-anchor';
import { KeyframeSelector, type Candidate, type KeptFrame, type SkipReason } from './keyframes';
import {
  BIN_DEG,
  KEEP_PITCH_TOLERANCE_DEG,
  MAX_SPOTS,
  MAX_TURN_SPEED,
  RING_PITCHES,
  TurnMeter,
  angleBetween,
  extendSweep,
  nearestGap,
  passedBins,
  pitchGuide,
  secondsLeft,
  startSweep,
  viewFromTransform,
  type Gap,
  type PitchGuide,
  type Sweep,
} from './plan';

/** A sampled frame as the native module sends it (modules/room-capture `FrameEvent`). */
export interface RawFrame {
  id: number;
  /** ARKit's timestamp (seconds). */
  timestamp: number;
  transform: readonly number[];
  /** fx, fy, cx, cy (pixels). */
  intrinsics: readonly number[];
  width: number;
  height: number;
  tracking: 'normal' | 'limited' | 'unavailable';
  trackingReason?: string | null;
  exposureDuration?: number;
  sharpness?: number;
}

export interface CaptureDeps {
  /** Writes sampled frame `id` as a JPEG at `uri` (modules/room-capture `keepFrame`). */
  keep(id: number, uri: string): Promise<{ bytes: number }>;
  /** Deletes a JPEG that is no longer needed. */
  remove(uri: string): void;
  /** The folder for the JPEGs: a `file://` URI ending in '/'. */
  folder: string;
  /** Viro's latest camera pose, to check it is the same world as ARKit's frames. */
  viroCamera?: () => CameraPose | null;
}

export type CapturePhase = 'idle' | 'turning' | 'spot-done' | 'stopped';

export interface CaptureSnapshot {
  phase: CapturePhase;
  /** Standing spot (0 for the first). */
  spot: number;
  /** The ring being turned (0 down, 1 level, 2 up). */
  ring: number;
  /** This spot's rings: which bins have a keyframe. */
  coverage: boolean[][];
  /** Where the phone looks now. */
  view: { yawDeg: number; pitchDeg: number } | null;
  /** How the tilt compares with the ring's (null when not turning). */
  guide: PitchGuide | null;
  /** Turning speed (degrees a second) and whether it is too fast. */
  speed: number;
  tooFast: boolean;
  /** How far the phone has moved, along the floor, from where the spot began (m). */
  drift: number;
  /** The nearest bin of this ring that was turned past without a keyframe. */
  gap: Gap | null;
  tracking: RawFrame['tracking'] | null;
  trackingReason: string | null;
  /** The camera image's size and focal lengths (pixels), for drawing the pitch guide. */
  optics: { width: number; height: number; fx: number; fy: number } | null;
  /** This spot: bins with a keyframe, out of all. */
  filled: number;
  total: number;
  /** The ring being turned: bins with a keyframe, out of all. */
  ringFilled: number;
  ringTotal: number;
  /** Turning time left at this spot at the usual pace (s). */
  secondsLeft: number;
  /** Keyframes so far, every spot. */
  keyframes: number;
  revision: number;
}

/** Where the frames agree with Viro's camera (for the scan log). */
export interface FrameCheck {
  samples: number;
  medianM: number;
  maxM: number;
  medianDeg: number;
  maxDeg: number;
}

export interface CaptureReport {
  samples: number;
  keyframes: number;
  bytes: number;
  skips: Record<SkipReason, number>;
  /** Fastest smoothed turning speed seen while turning (degrees a second). */
  maxSpeed: number;
  /** Samples taken while turning too fast. */
  fastSamples: number;
  spots: number;
  rings: { spot: number; ring: number; filled: number; total: number }[];
  /** First to last sample (s). */
  seconds: number;
  frameCheck: FrameCheck | null;
}

/** Frames kept for the world check (it only needs a sample of them). */
const MAX_CHECKS = 400;

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export class TurnCapture {
  private readonly deps: CaptureDeps;
  private readonly selector = new KeyframeSelector();
  private readonly meter = new TurnMeter();
  private readonly listeners = new Set<() => void>();
  private readonly writes = new Set<Promise<void>>();
  private snapshot: CaptureSnapshot;

  private phase: CapturePhase = 'idle';
  private spot = 0;
  private ring = 0;
  private origin: Vec3Tuple | null = null;
  private sweep: Sweep | null = null;
  private t0: number | null = null;
  private lastT = 0;
  private samples = 0;
  private maxSpeed = 0;
  private fastSamples = 0;
  private spotsBegun = 0;
  private readonly checks: { m: number; deg: number }[] = [];
  private live: Omit<
    CaptureSnapshot,
    | 'phase'
    | 'spot'
    | 'ring'
    | 'coverage'
    | 'filled'
    | 'total'
    | 'ringFilled'
    | 'ringTotal'
    | 'secondsLeft'
    | 'keyframes'
    | 'revision'
    | 'gap'
  > = {
    view: null,
    guide: null,
    speed: 0,
    tooFast: false,
    drift: 0,
    tracking: null,
    trackingReason: null,
    optics: null,
  };

  constructor(deps: CaptureDeps) {
    this.deps = deps;
    this.snapshot = this.build(0);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CaptureSnapshot => this.snapshot;

  /** Starts turning at the first spot, or (after a spot is done) at the next one. */
  beginSpot(): void {
    if (this.phase === 'turning' || this.phase === 'stopped') return;
    if (this.phase === 'spot-done') {
      if (this.spotsBegun >= MAX_SPOTS) return;
      this.spot++;
    }
    this.spotsBegun++;
    this.phase = 'turning';
    this.ring = 0;
    this.origin = null;
    this.sweep = null;
    this.publish();
  }

  /** "Next turn": moves on from the ring being turned, with whatever gaps it has. */
  nextRing(): void {
    if (this.phase !== 'turning') return;
    this.advance();
    this.publish();
  }

  /** No more frames: the capture is over (the JPEGs being written still finish). */
  stop(): void {
    this.phase = 'stopped';
    this.publish();
  }

  /** A sampled frame from the native module. */
  onFrame(raw: RawFrame): void {
    if (this.phase === 'stopped') return;
    this.t0 ??= raw.timestamp;
    const t = raw.timestamp - this.t0;
    this.lastT = Math.max(this.lastT, t);
    const view = viewFromTransform(raw.transform);
    if (!view) return;
    this.samples++;
    const reading = this.meter.push(t, view);
    this.checkWorld(view.position, view.forward);
    const [fx = 0, fy = 0, cx = 0, cy = 0] = raw.intrinsics;
    this.live = {
      view: { yawDeg: view.yawDeg, pitchDeg: view.pitchDeg },
      guide: this.phase === 'turning' ? pitchGuide(view.pitchDeg, this.ring) : null,
      speed: reading.speed,
      tooFast: reading.speed > MAX_TURN_SPEED,
      drift: this.live.drift,
      tracking: raw.tracking,
      trackingReason: raw.trackingReason ?? null,
      optics: fx > 0 && fy > 0 ? { width: raw.width, height: raw.height, fx, fy } : null,
    };
    if (this.phase === 'turning') {
      this.origin ??= view.position;
      this.live.drift = Math.hypot(
        view.position[0] - this.origin[0],
        view.position[2] - this.origin[2],
      );
      this.maxSpeed = Math.max(this.maxSpeed, reading.speed);
      if (reading.speed > MAX_TURN_SPEED) this.fastSamples++;
      if (Math.abs(view.pitchDeg - RING_PITCHES[this.ring]!) <= KEEP_PITCH_TOLERANCE_DEG) {
        this.sweep = this.sweep ? extendSweep(this.sweep, view.yawDeg) : startSweep(view.yawDeg);
      }
      const decision = this.selector.consider(
        {
          id: raw.id,
          t,
          transform: raw.transform,
          intrinsics: { fx, fy, cx, cy },
          width: raw.width,
          height: raw.height,
          tracking: raw.tracking,
          exposureDuration: raw.exposureDuration,
          sharpness: raw.sharpness,
        },
        this.spot,
        reading.angularSpeed,
      );
      if (decision.kind === 'keep') this.write(decision.candidate);
    }
    this.publish();
  }

  /** Resolves once every JPEG asked for is written (or has failed). */
  async settle(): Promise<void> {
    while (this.writes.size > 0) await Promise.allSettled([...this.writes]);
  }

  /** The keyframes, oldest first. */
  keyframes(): KeptFrame[] {
    return this.selector.keyframes();
  }

  report(): CaptureReport {
    const keyframes = this.selector.keyframes();
    const rings: CaptureReport['rings'] = [];
    for (let spot = 0; spot <= this.spot; spot++) {
      RING_PITCHES.forEach((_, ring) => {
        const filled = this.selector.filled(spot, ring);
        rings.push({ spot, ring, filled: filled.filter(Boolean).length, total: filled.length });
      });
    }
    const m = this.checks.map((c) => c.m);
    const deg = this.checks.map((c) => c.deg);
    return {
      samples: this.samples,
      keyframes: keyframes.length,
      bytes: keyframes.reduce((n, k) => n + k.bytes, 0),
      skips: this.selector.skips(),
      maxSpeed: this.maxSpeed,
      fastSamples: this.fastSamples,
      spots: this.spotsBegun,
      rings,
      seconds: this.lastT,
      frameCheck: this.checks.length
        ? {
            samples: this.checks.length,
            medianM: median(m),
            maxM: Math.max(...m),
            medianDeg: median(deg),
            maxDeg: Math.max(...deg),
          }
        : null,
    };
  }

  private write(candidate: Candidate): void {
    const uri = `${this.deps.folder}f${candidate.frame.id}.jpg`;
    const work = this.deps.keep(candidate.frame.id, uri).then(
      (done) => this.settled(candidate, { file: uri, bytes: done.bytes }),
      () => this.settled(candidate, null),
    );
    this.writes.add(work);
    void work.finally(() => this.writes.delete(work));
  }

  private settled(candidate: Candidate, written: { file: string; bytes: number } | null): void {
    for (const file of this.selector.settle(candidate, written)) this.deps.remove(file);
    if (this.phase === 'turning' && candidate.spot === this.spot && candidate.ring === this.ring) {
      if (this.selector.filled(this.spot, this.ring).every(Boolean)) this.advance();
    }
    this.publish();
  }

  /** On to the next ring, or the spot is done after the last. */
  private advance(): void {
    this.sweep = null;
    if (this.ring + 1 < RING_PITCHES.length) this.ring++;
    else this.phase = 'spot-done';
  }

  private checkWorld(position: Vec3Tuple, forward: Vec3Tuple): void {
    const viro = this.deps.viroCamera?.();
    if (!viro || this.checks.length >= MAX_CHECKS) return;
    this.checks.push({
      m: Math.hypot(
        position[0] - viro.position[0],
        position[1] - viro.position[1],
        position[2] - viro.position[2],
      ),
      deg: angleBetween(forward, viro.forward),
    });
  }

  private publish(): void {
    this.snapshot = this.build(this.snapshot.revision + 1);
    for (const listener of [...this.listeners]) listener();
  }

  private build(revision: number): CaptureSnapshot {
    const coverage = RING_PITCHES.map((_, ring) => this.selector.filled(this.spot, ring));
    const all = coverage.flat();
    const ringBins = coverage[this.ring] ?? [];
    const left = coverage
      .slice(this.ring)
      .flat()
      .filter((has) => !has).length;
    const turning = this.phase === 'turning';
    const gap =
      turning && this.sweep && this.live.view
        ? nearestGap(ringBins, passedBins(this.sweep, BIN_DEG), this.live.view.yawDeg, BIN_DEG)
        : null;
    return {
      ...this.live,
      guide: turning ? this.live.guide : null,
      phase: this.phase,
      spot: this.spot,
      ring: this.ring,
      coverage,
      gap,
      filled: all.filter(Boolean).length,
      total: all.length,
      ringFilled: ringBins.filter(Boolean).length,
      ringTotal: ringBins.length,
      secondsLeft: turning ? secondsLeft(left) : 0,
      keyframes: this.selector.keyframes().length,
      revision,
    };
  }
}
