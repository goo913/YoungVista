/**
 * One AR view's tracking: what ViroReact reports (planes, the camera, tracking, the light) and
 * what follows from it: the floor (the scan's own floor finder, scan/floor.ts), where the dot in
 * the middle of the screen meets the floor, the coaching to show, and whether tracking was lost
 * for a while and came back (the phone may have shifted its idea of the room: time to offer
 * "Line up again").
 *
 * Like the scan's ScanController, Viro's events are published at most every `throttleMs`, and the
 * AR scene and the screen read it through `subscribe`/`getSnapshot` (useSyncExternalStore).
 */
import { hitLevelPlane, type CameraRay, type Vec2 } from '@youngvista/core';
import { coachingFor, TRACKING_STATE, type Coaching, type TrackingInfo } from '@/scan/coaching';
import { floorStatus, nextFloor, type FloorState, type FloorStatus } from '@/scan/floor';
import { floorPosition, rayFromCamera } from '@/scan/geometry';
import { rememberPose, steadyPose, type TimedPose } from '@/scan/steady';
import {
  anchorIdOf,
  cameraPoseFromViro,
  lightIntensityFromViro,
  planeFromViroAnchor,
  type CameraPose,
  type TrackedPlane,
} from '@/scan/viro-anchor';
import { MAX_FLOOR_REACH } from './pose';

export interface ArState {
  planes: Readonly<Record<string, TrackedPlane>>;
  camera: CameraPose | null;
  tracking: TrackingInfo | null;
  lightIntensity: number | null;
  /** Found by itself and kept (scan/floor.ts); null until found. */
  floor: FloorState | null;
  /** When tracking stopped being normal (ms), or null while it is normal. */
  limitedSince: number | null;
  /** How many times tracking came back after being lost for a while. */
  recoveries: number;
}

/** Where the dot in the middle of the screen meets the floor (world), or why it does not. */
export type FloorAim =
  | { ok: true; point: Vec2; y: number; distance: number }
  | { ok: false; reason: 'no-camera' | 'no-floor' | 'aim-lower' | 'too-far' };

export interface ArDerived {
  floorStatus: FloorStatus;
  floorY: number | null;
  /** Tracking or light trouble ("Move slowly"), shown before anything else. */
  coaching: Coaching | null;
  aim: FloorAim;
  /** The phone on the floor plan (world). */
  cameraFloor: Vec2 | null;
}

export interface ArSnapshot {
  state: ArState;
  derived: ArDerived;
  revision: number;
}

/** Tracking lost for at least this long, then back, counts as a recovery (ms). */
export const LOST_FOR_MS = 1000;

export function createArState(): ArState {
  return {
    planes: {},
    camera: null,
    tracking: null,
    lightIntensity: null,
    floor: null,
    limitedSince: null,
    recoveries: 0,
  };
}

/** Where `camera`'s middle ray meets the floor. */
export function floorAim(camera: CameraPose | null, floor: FloorState | null): FloorAim {
  if (!camera) return { ok: false, reason: 'no-camera' };
  if (!floor) return { ok: false, reason: 'no-floor' };
  const hit = hitLevelPlane(rayFromCamera(camera), floor.y, MAX_FLOOR_REACH);
  if (!hit.ok) return { ok: false, reason: hit.reason === 'too-far' ? 'too-far' : 'aim-lower' };
  return { ok: true, point: hit.point, y: floor.y, distance: hit.distance };
}

export function deriveAr(state: ArState): ArDerived {
  const cameraY = state.camera?.position[1] ?? null;
  return {
    floorStatus: floorStatus(state.floor, state.planes, cameraY),
    floorY: state.floor?.y ?? null,
    coaching: coachingFor({ tracking: state.tracking, lightIntensity: state.lightIntensity }),
    aim: floorAim(state.camera, state.floor),
    cameraFloor: state.camera ? floorPosition(state.camera) : null,
  };
}

const withFloor = (s: ArState): ArState => {
  const floor = nextFloor(s.floor, s.planes, s.camera?.position[1] ?? null);
  return floor === s.floor ? s : { ...s, floor };
};

/** What the AR view can take over from a scan in the same AR session. */
export type ArSeed = Pick<ArState, 'planes' | 'camera' | 'tracking' | 'lightIntensity' | 'floor'>;

export interface ArControllerOptions {
  /** Most frequent publish for Viro events (ms). Default 100. */
  throttleMs?: number;
  /** Clock (ms); tests pass their own. */
  now?: () => number;
}

export class ArController {
  private state: ArState = createArState();
  private snapshot: ArSnapshot;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly throttleMs: number;
  private readonly now: () => number;
  private readonly recent: TimedPose[] = [];
  private heldAt: number | null = null;

  constructor(options: ArControllerOptions = {}) {
    this.throttleMs = options.throttleMs ?? 100;
    this.now = options.now ?? Date.now;
    this.snapshot = { state: this.state, derived: deriveAr(this.state), revision: 0 };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ArSnapshot => this.snapshot;

  /* ViroARScene callbacks: arrow functions, so they can be passed as props directly. */

  onAnchorFound = (anchor: unknown): void => {
    const plane = planeFromViroAnchor(anchor);
    if (!plane) return;
    this.update((s) => withFloor({ ...s, planes: { ...s.planes, [plane.id]: plane } }));
  };

  onAnchorUpdated = (anchor: unknown): void => this.onAnchorFound(anchor);

  onAnchorRemoved = (anchor?: unknown): void => {
    const id = anchorIdOf(anchor);
    if (!id) return;
    this.update((s) => {
      if (!(id in s.planes)) return s;
      const { [id]: _gone, ...planes } = s.planes;
      return withFloor({ ...s, planes });
    });
  };

  onTrackingUpdated = (state: number, reason: number): void => {
    const t = this.now();
    this.update((s) => {
      const normal = state === TRACKING_STATE.NORMAL;
      let { limitedSince, recoveries } = s;
      if (!normal) limitedSince ??= t;
      else if (limitedSince !== null) {
        if (t - limitedSince >= LOST_FOR_MS) recoveries++;
        limitedSince = null;
      }
      return { ...s, tracking: { state, reason }, limitedSince, recoveries };
    });
  };

  onCameraTransformUpdate = (transform: unknown): void => {
    const pose = cameraPoseFromViro(transform);
    if (!pose) return;
    rememberPose(this.recent, this.now(), pose);
    this.update((s) => withFloor({ ...s, camera: pose }));
  };

  onAmbientLightUpdate = (update: unknown): void => {
    const intensity = lightIntensityFromViro(update);
    if (intensity !== null) this.update((s) => ({ ...s, lightIntensity: intensity }));
  };

  /** Takes over what a scan in the same AR session already knows: its planes, floor and camera. */
  seed(seed: ArSeed): void {
    this.set({ ...this.state, ...seed, limitedSince: null });
  }

  /** The finger touched a button that uses the aim: it is taken from just before this moment. */
  holdAim(): void {
    this.heldAt = this.now();
  }

  /**
   * The ray through the dot for a tap: the camera held steady just before the finger touched
   * (see `holdAim`), else the camera now. Null without a camera.
   */
  takeAim(): CameraRay | null {
    this.flush();
    const steady = steadyPose(this.recent, this.heldAt ?? this.now());
    this.heldAt = null;
    const camera = steady ?? this.state.camera;
    return camera ? rayFromCamera(camera) : null;
  }

  /** Publishes pending changes now. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.snapshot.state === this.state) return;
    this.snapshot = {
      state: this.state,
      derived: deriveAr(this.state),
      revision: this.snapshot.revision + 1,
    };
    for (const listener of [...this.listeners]) listener();
  }

  /** Drops the pending publish and every listener (the screen is going away). */
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private set(state: ArState): void {
    this.state = state;
    this.flush();
  }

  private update(change: (state: ArState) => ArState): void {
    this.state = change(this.state);
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.throttleMs);
    }
  }
}
