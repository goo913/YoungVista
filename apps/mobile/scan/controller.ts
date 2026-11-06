/**
 * Holds one scan session and feeds it ViroReact's events. The AR scene and the overlay read it
 * through `subscribe`/`getSnapshot` (React's useSyncExternalStore).
 *
 * Viro calls the camera callback every frame and the anchor callbacks many times a second, so
 * the derived view (floor, walls, room, aim) is recomputed and published at most every
 * `throttleMs`. Marks, Undo and option changes publish at once.
 *
 * It also keeps what the scan log needs (scan-log.ts): the camera about twice a second, the last
 * state of every plane ever seen, and when the floor changed.
 */
import type { Vec3Tuple } from '@youngvista/core';
import type { TrackingInfo } from './coaching';
import type { FloorState } from './floor';
import {
  createScanState,
  deriveScan,
  finishScan,
  markAtAim,
  removePlane,
  setCamera,
  setLightIntensity,
  setOptions,
  setTracking,
  skipCeiling,
  undo,
  upsertPlane,
  type AimError,
  type FinishResult,
  type MarkOutcome,
  type ScanDerived,
  type ScanOptions,
  type ScanState,
} from './session';
import { rememberPose, steadyPose, type TimedPose } from './steady';
import {
  anchorIdOf,
  cameraPoseFromViro,
  lightIntensityFromViro,
  planeFromViroAnchor,
  type TrackedPlane,
} from './viro-anchor';

export interface ScanSnapshot {
  state: ScanState;
  derived: ScanDerived;
  /** The debug overlay is on: the AR scene draws the raw planes. */
  debug: boolean;
  /** Increases with every published change. */
  revision: number;
}

export interface ScanControllerOptions {
  /** Most frequent publish for Viro events (ms). Default 100. */
  throttleMs?: number;
  scan?: Partial<ScanOptions>;
  /** Clock (ms since 1970); tests pass their own. */
  now?: () => number;
}

/** Numbers per camera sample: time (ms from the start), position, forward, up. */
export const POSE_STRIDE = 10;
/** Most camera samples kept; past it, every other one is dropped and sampling slows down. */
export const MAX_POSE_SAMPLES = 600;
const POSE_INTERVAL_MS = 500;
/** A mark's aim is the camera averaged over this long before the finger touched Mark (ms). */
export { STEADY_MS } from './steady';
/** Most planes and floor changes kept for the log. */
const MAX_LOGGED_PLANES = 300;
const MAX_FLOOR_EVENTS = 50;

export interface LoggedPlane {
  plane: TrackedPlane;
  /** Viro removed it (ARKit merged it into another plane, usually). */
  removed: boolean;
  firstSeen: number;
  lastSeen: number;
  updates: number;
}

export interface FloorEvent {
  /** ms from the start of the scan. */
  t: number;
  floor: FloorState | null;
}

/** Everything the scan log is made from (scan-log.ts). */
export interface ScanRecord {
  startedAt: number;
  endedAt: number;
  state: ScanState;
  derived: ScanDerived;
  /** Flat camera samples, POSE_STRIDE numbers each. */
  poses: number[];
  planes: LoggedPlane[];
  floorEvents: FloorEvent[];
  /** Taps on Mark that were refused, by reason. */
  refusedMarks: Partial<Record<AimError, number>>;
  /** The first MAX_REFUSALS refused taps: when, why, and where the camera aimed. */
  refusals: Refusal[];
  /** Every time the room was put together (auto-finish or Done). */
  finishes: { t: number; ok: boolean; reason: string | null }[];
}

/** A refused tap on Mark, with the ray it was aimed along (world space). */
export interface Refusal {
  /** ms since the scan started. */
  t: number;
  error: AimError;
  origin: Vec3Tuple;
  direction: Vec3Tuple;
}

/** Refused taps kept for the log with their rays (the counts go on regardless). */
export const MAX_REFUSALS = 40;

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export class ScanController {
  private state: ScanState;
  private snapshot: ScanSnapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private debug = false;
  private readonly throttleMs: number;
  private readonly now: () => number;
  private readonly startedAt: number;

  /** The last second of camera poses, for the steady aim. */
  private readonly recent: TimedPose[] = [];
  private heldAt: number | null = null;
  private poses: number[] = [];
  private poseInterval = POSE_INTERVAL_MS;
  private lastPoseAt = -Infinity;
  private readonly planeLog = new Map<string, LoggedPlane>();
  private floorEvents: FloorEvent[] = [];
  private readonly refused: Partial<Record<AimError, number>> = {};
  private readonly refusals: Refusal[] = [];
  private readonly finishes: ScanRecord['finishes'] = [];

  constructor(options: ScanControllerOptions = {}) {
    this.throttleMs = options.throttleMs ?? 100;
    this.now = options.now ?? Date.now;
    this.startedAt = this.now();
    this.state = createScanState(options.scan);
    this.snapshot = {
      state: this.state,
      derived: deriveScan(this.state),
      debug: this.debug,
      revision: 0,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ScanSnapshot => this.snapshot;

  /* ViroARScene callbacks. Arrow functions, so they can be passed as props directly. */

  onAnchorFound = (anchor: unknown): void => {
    const plane = planeFromViroAnchor(anchor);
    if (!plane) return;
    this.logPlane(plane);
    this.update((s) => upsertPlane(s, plane));
  };

  onAnchorUpdated = (anchor: unknown): void => this.onAnchorFound(anchor);

  onAnchorRemoved = (anchor?: unknown): void => {
    const id = anchorIdOf(anchor);
    if (!id) return;
    const logged = this.planeLog.get(id);
    if (logged) {
      logged.removed = true;
      logged.lastSeen = this.now();
    }
    this.update((s) => removePlane(s, id));
  };

  onTrackingUpdated = (state: number, reason: number): void => {
    const tracking: TrackingInfo = { state, reason };
    this.update((s) => setTracking(s, tracking));
  };

  onCameraTransformUpdate = (transform: unknown): void => {
    const pose = cameraPoseFromViro(transform);
    if (!pose) return;
    rememberPose(this.recent, this.now(), pose);
    this.samplePose(pose.position, pose.forward, pose.up);
    this.update((s) => setCamera(s, pose));
  };

  onAmbientLightUpdate = (update: unknown): void => {
    const intensity = lightIntensityFromViro(update);
    if (intensity !== null) this.update((s) => setLightIntensity(s, intensity));
  };

  /* Actions from the scan screen. */

  /**
   * The finger touched Mark. The aim is taken from just before this moment: pressing the button
   * shakes the phone a little.
   */
  holdAim(): void {
    this.heldAt = this.now();
  }

  /** "Mark": records where the dot is aimed, for the current step. */
  mark(): MarkOutcome {
    this.flush();
    const steady = steadyPose(this.recent, this.heldAt ?? this.now());
    this.heldAt = null;
    const { state, outcome } = steady
      ? markAtAim({ ...this.state, camera: steady }, this.now())
      : markAtAim(this.state, this.now(), this.snapshot.derived);
    if (outcome.kind === 'error') {
      this.refused[outcome.error] = (this.refused[outcome.error] ?? 0) + 1;
      const aimed = steady ?? this.state.camera;
      if (aimed && this.refusals.length < MAX_REFUSALS) {
        this.refusals.push({
          t: this.now() - this.startedAt,
          error: outcome.error,
          origin: aimed.position,
          direction: aimed.forward,
        });
      }
    }
    this.set(state);
    return outcome;
  }

  /** "Skip, use 8 ft" at the ceiling step. */
  skipCeiling(): void {
    this.set(skipCeiling(this.state));
  }

  undo(): void {
    this.set(undo(this.state));
  }

  setOptions(options: Partial<ScanOptions>): void {
    this.set(setOptions(this.state, options));
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
    this.flush(true);
  }

  /** Joins the walls into a room ("Done", or by itself once the room is closed). */
  finish(): FinishResult {
    this.flush();
    const result = finishScan(this.state, this.snapshot.derived);
    this.finishes.push({
      t: this.now() - this.startedAt,
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    });
    return result;
  }

  /** What the scan log is made from, as of now. */
  record(): ScanRecord {
    this.flush();
    return {
      startedAt: this.startedAt,
      endedAt: this.now(),
      state: this.state,
      derived: this.snapshot.derived,
      poses: [...this.poses],
      planes: [...this.planeLog.values()].map((p) => ({ ...p })),
      floorEvents: [...this.floorEvents],
      refusedMarks: { ...this.refused },
      refusals: [...this.refusals],
      finishes: [...this.finishes],
    };
  }

  /** Publishes pending changes now. */
  flush(force = false): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const changed = this.snapshot.state !== this.state;
    if (!changed && !force) return;
    this.snapshot = {
      state: this.state,
      derived: changed ? deriveScan(this.state) : this.snapshot.derived,
      debug: this.debug,
      revision: this.snapshot.revision + 1,
    };
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * Drops the pending publish and every listener (the screen is going away). Not final: a
   * component that subscribes again (React StrictMode remounts) is published to as before.
   */
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private noteFloor(before: FloorState | null): void {
    if (this.state.floor === before) return;
    this.floorEvents.push({ t: this.now() - this.startedAt, floor: this.state.floor });
    if (this.floorEvents.length > MAX_FLOOR_EVENTS) this.floorEvents.splice(1, 1);
  }

  /** A change from the user: publish now. */
  private set(state: ScanState): void {
    const before = this.state.floor;
    this.state = state;
    this.noteFloor(before);
    this.flush();
  }

  /** A change from Viro: publish within `throttleMs`. */
  private update(change: (state: ScanState) => ScanState): void {
    const before = this.state.floor;
    this.state = change(this.state);
    this.noteFloor(before);
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.throttleMs);
    }
  }

  private logPlane(plane: TrackedPlane): void {
    const t = this.now();
    const logged = this.planeLog.get(plane.id);
    if (logged) {
      logged.plane = plane;
      logged.removed = false;
      logged.lastSeen = t;
      logged.updates++;
      return;
    }
    if (this.planeLog.size >= MAX_LOGGED_PLANES) {
      // Forget the plane updated longest ago.
      let oldest: LoggedPlane | null = null;
      for (const p of this.planeLog.values())
        if (!oldest || p.lastSeen < oldest.lastSeen) oldest = p;
      if (oldest) this.planeLog.delete(oldest.plane.id);
    }
    this.planeLog.set(plane.id, { plane, removed: false, firstSeen: t, lastSeen: t, updates: 1 });
  }

  private samplePose(
    position: readonly number[],
    forward: readonly number[],
    up: readonly number[],
  ): void {
    const t = this.now() - this.startedAt;
    if (t - this.lastPoseAt < this.poseInterval) return;
    this.lastPoseAt = t;
    this.poses.push(
      t,
      ...position.map((n) => round(n, 4)),
      ...forward.map((n) => round(n, 4)),
      ...up.map((n) => round(n, 3)),
    );
    if (this.poses.length / POSE_STRIDE >= MAX_POSE_SAMPLES) {
      // Keep the whole scan: drop every other sample and sample half as often from now on.
      const kept: number[] = [];
      for (let k = 0; k < this.poses.length; k += 2 * POSE_STRIDE) {
        kept.push(...this.poses.slice(k, k + POSE_STRIDE));
      }
      this.poses = kept;
      this.poseInterval *= 2;
    }
  }
}
