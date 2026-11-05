/**
 * The scan session: everything ViroReact has reported (planes by anchor id, the camera, the
 * tracking state) plus the walls the user marked by tapping, and what follows from it (the floor,
 * the wall observations, the live map and whether the room is closed).
 *
 * Plain data and pure functions: ScanController (controller.ts) holds one state and feeds it the
 * Viro events; the screens only read `deriveScan`.
 */
import {
  buildRoomFromWalls,
  coverage,
  describePlane,
  mergeWallObservations,
  wallFromPlane,
  wallFromTaps,
  type BuildRoomFailure,
  type BuildRoomResult,
  type CoverageResult,
  type EulerOrder,
  type MergedWall,
  type Vec2,
  type WallObservation,
} from '@youngvista/core';
import { coachingFor, type Coaching, type TrackingInfo } from './coaching';
import {
  floorPosition,
  headingDeg,
  intersectFloor,
  rayFromCamera,
  turnHint,
  type FloorHit,
  type Ray,
  type TurnHint,
} from './geometry';
import type { CameraPose, TrackedPlane } from './viro-anchor';

export type HorizontalAxis = 'x' | 'z' | 'auto';

export interface ScanOptions {
  /** Euler order of Viro's anchor rotations (see debug.ts). */
  eulerOrder: EulerOrder;
  /** Which local axis of a wall plane runs along the floor; 'auto' picks the more level one. */
  horizontalAxis: HorizontalAxis;
}

/**
 * Defaults until phones confirm otherwise: ViroCore builds its Euler angles like Irrlicht
 * (R = Rz·Ry·Rx, core's 'ZYX'), which gives the same wall lines as core's default 'YXZ'. 'auto'
 * guards against the width and height of a wall plane arriving swapped.
 */
export const DEFAULT_SCAN_OPTIONS: ScanOptions = { eulerOrder: 'YXZ', horizontalAxis: 'auto' };

/** A wall the user marked with two taps at its bottom: the two camera rays. */
export interface TapWall {
  id: string;
  first: Ray;
  second: Ray;
}

export interface ScanState {
  planes: Readonly<Record<string, TrackedPlane>>;
  camera: CameraPose | null;
  tracking: TrackingInfo | null;
  lightIntensity: number | null;
  /** The first tap of a pair, waiting for the second. */
  pendingTap: Ray | null;
  tapWalls: readonly TapWall[];
  nextTapNumber: number;
  options: ScanOptions;
}

export function createScanState(options: Partial<ScanOptions> = {}): ScanState {
  return {
    planes: {},
    camera: null,
    tracking: null,
    lightIntensity: null,
    pendingTap: null,
    tapWalls: [],
    nextTapNumber: 1,
    options: { ...DEFAULT_SCAN_OPTIONS, ...options },
  };
}

export const upsertPlane = (state: ScanState, plane: TrackedPlane): ScanState => ({
  ...state,
  planes: { ...state.planes, [plane.id]: plane },
});

export function removePlane(state: ScanState, id: string): ScanState {
  if (!(id in state.planes)) return state;
  const { [id]: _removed, ...planes } = state.planes;
  return { ...state, planes };
}

export const setCamera = (state: ScanState, camera: CameraPose): ScanState => ({
  ...state,
  camera,
});

export const setTracking = (state: ScanState, tracking: TrackingInfo): ScanState => ({
  ...state,
  tracking,
});

export const setLightIntensity = (state: ScanState, lightIntensity: number): ScanState => ({
  ...state,
  lightIntensity,
});

export const setOptions = (state: ScanState, options: Partial<ScanOptions>): ScanState => ({
  ...state,
  options: { ...state.options, ...options },
});

/* ------------------------------------------------------------------------------------------ */
/* Floor                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface Floor {
  y: number;
  planeId: string;
}

/** Horizontal planes smaller than this (m²) are ignored when looking for the floor. */
export const MIN_FLOOR_PLANE_AREA = 0.04;
/** The floor is at least this far below the phone (m): it rules out ceilings. */
export const MIN_FLOOR_DROP = 0.3;

/** World height of a plane's centre. */
export const planeHeight = (plane: TrackedPlane, order: EulerOrder): number =>
  describePlane(plane.anchor, 0, { eulerOrder: order }).center.y;

const isUpwardHorizontal = (p: TrackedPlane): boolean =>
  (p.alignment === 'Horizontal' || p.alignment === 'HorizontalUpward') &&
  p.classification !== 'Ceiling';

/** The floor: the lowest upward-facing horizontal plane below the phone. */
export function findFloor(state: ScanState): Floor | null {
  let best: Floor | null = null;
  const cameraY = state.camera?.position[1];
  for (const plane of Object.values(state.planes)) {
    if (!isUpwardHorizontal(plane)) continue;
    if (plane.anchor.width * plane.anchor.height < MIN_FLOOR_PLANE_AREA) continue;
    const y = planeHeight(plane, state.options.eulerOrder);
    if (!Number.isFinite(y)) continue;
    if (cameraY !== undefined && y > cameraY - MIN_FLOOR_DROP) continue;
    if (!best || y < best.y) best = { y, planeId: plane.id };
  }
  return best;
}

/* ------------------------------------------------------------------------------------------ */
/* Walls                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** Floor observations of the vertical planes. */
export function planeWallObservations(state: ScanState, floorY: number): WallObservation[] {
  const out: WallObservation[] = [];
  for (const plane of Object.values(state.planes)) {
    if (plane.alignment !== 'Vertical') continue;
    const obs = wallFromPlane(plane.anchor, floorY, {
      id: plane.id,
      eulerOrder: state.options.eulerOrder,
      horizontalAxis: state.options.horizontalAxis,
    });
    if (obs) out.push(obs);
  }
  return out;
}

/** Floor observations of the tapped walls, placed on the current floor. */
export function tapWallObservations(state: ScanState, floorY: number): WallObservation[] {
  const out: WallObservation[] = [];
  for (const wall of state.tapWalls) {
    const a = intersectFloor(wall.first, floorY);
    const b = intersectFloor(wall.second, floorY);
    if (a.ok && b.ok) out.push(wallFromTaps(a.point, b.point, wall.id));
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* "Tap twice at the bottom of a wall"                                                         */
/* ------------------------------------------------------------------------------------------ */

/** The two taps of a wall must be at least this far apart (m). */
export const MIN_TAP_SPACING = 0.3;

export type TapError = 'no-camera' | 'no-floor' | 'aim-lower' | 'too-far' | 'too-close';

export const TAP_ERROR_MESSAGES: Record<TapError, string> = {
  'no-camera': 'The camera is not ready yet. Hold the phone up and try again.',
  'no-floor': 'Find the floor first: point the phone at the floor and move it slowly.',
  'aim-lower': 'Aim the dot lower, at the bottom of the wall where it meets the floor.',
  'too-far': 'That spot is too far away. Walk closer to the wall and try again.',
  'too-close': 'Move the dot further along the wall before the second tap.',
};

export type TapOutcome =
  | { kind: 'first-point'; point: Vec2 }
  | { kind: 'wall-added'; wallId: string }
  | { kind: 'error'; error: TapError; message: string };

const tapError = (error: TapError): TapOutcome => ({
  kind: 'error',
  error,
  message: TAP_ERROR_MESSAGES[error],
});

/**
 * Records where the dot in the middle of the screen meets the floor. The first call starts a
 * wall, the second finishes it.
 */
export function markWallPoint(state: ScanState): { state: ScanState; outcome: TapOutcome } {
  if (!state.camera) return { state, outcome: tapError('no-camera') };
  const floor = findFloor(state);
  if (!floor) return { state, outcome: tapError('no-floor') };
  const ray = rayFromCamera(state.camera);
  const hit = intersectFloor(ray, floor.y);
  if (!hit.ok) return { state, outcome: tapError(hit.reason) };
  if (!state.pendingTap) {
    return {
      state: { ...state, pendingTap: ray },
      outcome: { kind: 'first-point', point: hit.point },
    };
  }
  const first = intersectFloor(state.pendingTap, floor.y);
  if (
    first.ok &&
    Math.hypot(first.point.x - hit.point.x, first.point.z - hit.point.z) < MIN_TAP_SPACING
  ) {
    return { state, outcome: tapError('too-close') };
  }
  const id = `tap-${state.nextTapNumber}`;
  return {
    state: {
      ...state,
      pendingTap: null,
      tapWalls: [...state.tapWalls, { id, first: state.pendingTap, second: ray }],
      nextTapNumber: state.nextTapNumber + 1,
    },
    outcome: { kind: 'wall-added', wallId: id },
  };
}

export const cancelPendingTap = (state: ScanState): ScanState =>
  state.pendingTap ? { ...state, pendingTap: null } : state;

export const undoLastTapWall = (state: ScanState): ScanState =>
  state.tapWalls.length ? { ...state, tapWalls: state.tapWalls.slice(0, -1) } : state;

/* ------------------------------------------------------------------------------------------ */
/* Derived view of the scan                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface ScanDerived {
  floor: Floor | null;
  /** The phone's position on the floor plan. */
  cameraFloor: Vec2 | null;
  headingDeg: number | null;
  /** Where the dot in the middle of the screen meets the floor. Null until the floor is found. */
  aim: FloorHit | null;
  /** The first tap of a pair, on the floor. */
  pendingPoint: Vec2 | null;
  observations: WallObservation[];
  /** Observations merged into walls, for the live map. */
  walls: MergedWall[];
  /** Null until the floor is found. */
  coverage: CoverageResult | null;
  turn: TurnHint | null;
  coaching: Coaching;
  planeCount: number;
  verticalPlaneCount: number;
}

export function deriveScan(state: ScanState): ScanDerived {
  const floor = findFloor(state);
  const camera = state.camera;
  const cameraFloor = camera ? floorPosition(camera) : null;
  const heading = camera ? headingDeg(camera) : null;
  const planes = Object.values(state.planes);
  const base = {
    floor,
    cameraFloor,
    headingDeg: heading,
    planeCount: planes.length,
    verticalPlaneCount: planes.filter((p) => p.alignment === 'Vertical').length,
    coaching: coachingFor({
      tracking: state.tracking,
      floorFound: floor !== null,
      lightIntensity: state.lightIntensity,
    }),
  };
  if (!floor) {
    return {
      ...base,
      aim: null,
      pendingPoint: null,
      observations: [],
      walls: [],
      coverage: null,
      turn: null,
    };
  }
  const observations = [
    ...planeWallObservations(state, floor.y),
    ...tapWallObservations(state, floor.y),
  ];
  const cover = coverage(observations, cameraFloor ? { center: cameraFloor } : {});
  const pending = state.pendingTap ? intersectFloor(state.pendingTap, floor.y) : null;
  return {
    ...base,
    aim: camera ? intersectFloor(rayFromCamera(camera), floor.y) : null,
    pendingPoint: pending?.ok ? pending.point : null,
    observations,
    walls: mergeWallObservations(observations),
    coverage: cover,
    turn: turnHint(heading, cover),
  };
}

/**
 * The reason a room could not be made, worded for the scan. Core's wording for crossing walls
 * and short walls points at the plan editor, which comes in Build 2.
 */
export function scanFailureMessage(failure: BuildRoomFailure): string {
  switch (failure.error) {
    case 'wall-too-short':
      return 'Two corners came out almost on top of each other. Point at the walls near that corner again, then tap Done.';
    case 'self-intersecting':
      return 'The walls found so far cross each other. Point again at the walls that look wrong on the map, then tap Done.';
    default:
      return failure.reason;
  }
}

/**
 * Joins the walls into a room. Walls are ordered around where the phone is now (the user stands
 * in the room while scanning); core tries other centres if that fails.
 */
export function buildScannedRoom(
  state: ScanState,
  derived: ScanDerived = deriveScan(state),
  ceilingHeight?: number,
): BuildRoomResult {
  if (!derived.floor) {
    return {
      error: 'too-few-walls',
      reason: 'The floor has not been found yet. Point the phone at the floor and move it slowly.',
    };
  }
  return buildRoomFromWalls(derived.observations, {
    ...(derived.cameraFloor ? { center: derived.cameraFloor } : {}),
    ...(ceilingHeight !== undefined ? { ceilingHeight } : {}),
  });
}
