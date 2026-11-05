/**
 * Holds one scan session and feeds it ViroReact's events. The AR scene and the overlay read it
 * through `subscribe`/`getSnapshot` (React's useSyncExternalStore).
 *
 * Viro calls the camera callback every frame and the anchor callbacks many times a second, so
 * the derived view (floor, walls, map, coverage) is recomputed and published at most every
 * `throttleMs`. Taps and option changes publish at once.
 */
import type { BuildRoomResult } from '@youngvista/core';
import type { TrackingInfo } from './coaching';
import {
  buildScannedRoom,
  cancelPendingTap,
  createScanState,
  deriveScan,
  markWallPoint,
  removePlane,
  setCamera,
  setLightIntensity,
  setOptions,
  setTracking,
  undoLastTapWall,
  upsertPlane,
  type ScanDerived,
  type ScanOptions,
  type ScanState,
  type TapOutcome,
} from './session';
import {
  anchorIdOf,
  cameraPoseFromViro,
  lightIntensityFromViro,
  planeFromViroAnchor,
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
}

export class ScanController {
  private state: ScanState;
  private snapshot: ScanSnapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private debug = false;
  private readonly throttleMs: number;

  constructor(options: ScanControllerOptions = {}) {
    this.throttleMs = options.throttleMs ?? 100;
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
    if (plane) this.update((s) => upsertPlane(s, plane));
  };

  onAnchorUpdated = (anchor: unknown): void => this.onAnchorFound(anchor);

  onAnchorRemoved = (anchor?: unknown): void => {
    const id = anchorIdOf(anchor);
    if (id) this.update((s) => removePlane(s, id));
  };

  onTrackingUpdated = (state: number, reason: number): void => {
    const tracking: TrackingInfo = { state, reason };
    this.update((s) => setTracking(s, tracking));
  };

  onCameraTransformUpdate = (transform: unknown): void => {
    const pose = cameraPoseFromViro(transform);
    if (pose) this.update((s) => setCamera(s, pose));
  };

  onAmbientLightUpdate = (update: unknown): void => {
    const intensity = lightIntensityFromViro(update);
    if (intensity !== null) this.update((s) => setLightIntensity(s, intensity));
  };

  /* Actions from the scan screen. */

  /** "Mark wall": the first call starts a wall at the dot, the second finishes it. */
  markWallPoint(): TapOutcome {
    const { state, outcome } = markWallPoint(this.state);
    this.state = state;
    this.flush();
    return outcome;
  }

  cancelPendingTap(): void {
    this.state = cancelPendingTap(this.state);
    this.flush();
  }

  undoLastTapWall(): void {
    this.state = undoLastTapWall(this.state);
    this.flush();
  }

  setOptions(options: Partial<ScanOptions>): void {
    this.state = setOptions(this.state, options);
    this.flush();
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
    this.flush(true);
  }

  /** Joins the walls found so far into a room. */
  buildRoom(ceilingHeight?: number): BuildRoomResult {
    this.flush();
    return buildScannedRoom(this.state, this.snapshot.derived, ceilingHeight);
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

  private update(change: (state: ScanState) => ScanState): void {
    this.state = change(this.state);
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.throttleMs);
    }
  }
}
