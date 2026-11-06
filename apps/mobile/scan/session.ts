/**
 * The scan session: what ViroReact reports (planes by anchor id, the camera, tracking) and the
 * marks the user made, and what follows from them: the floor, the room's directions, the walls
 * and the room.
 *
 * Phones without a depth sensor rarely find plain walls, but they find the floor well and know
 * exactly where the camera is. So:
 * 1. 'floor': the app finds the floor by itself (floor.ts).
 * 2. 'first-wall', 'second-mark': two marks along the bottom edge of one wall give the room's two
 *    directions.
 * 3. 'ceiling': a mark at the top of that wall gives the ceiling height, or the user skips (8 ft).
 * 4. 'walls': one mark on every other wall, at its bottom edge or, when something is in the way,
 *    its top edge. The room closes when the walls fit together all the way round.
 *
 * Marks are kept as camera rays, so they move with the floor if a better floor turns up. The
 * geometry is in `@youngvista/core` (wall-marks.ts). Plain data and pure functions:
 * ScanController (controller.ts) holds one state and feeds it Viro's events.
 */
import {
  DEFAULT_CEILING_HEIGHT,
  MERGE_DISTANCE,
  MIN_FIRST_WALL_SPAN,
  angleAboveDeg,
  axesThrough,
  edgeForRay,
  groupWallMarks,
  hitLevelPlane,
  measureCeiling,
  placeMark,
  solveRectilinearRoom,
  solveRoomLeavingOut,
  wallDirection,
  wallEndpoints,
  wallNormal,
  wallSegment,
  type EulerOrder,
  type GroupedWalls,
  type MarkedWall,
  type RectilinearResult,
  type Room,
  type RoomAxes,
  type Vec2,
  type WallAxis,
  type WallEdge,
  type WallFacing,
  type WallMarkInput,
  type WallPlacement,
} from '@youngvista/core';
import {
  TRACKING_STATE,
  coachingFor,
  guidanceFor,
  type Coaching,
  type Message,
  type ScanStep,
  type TrackingInfo,
} from './coaching';
import { floorStatus, nextFloor, type FloorState, type FloorStatus } from './floor';
import { CEILING_MAX, CEILING_MIN } from '@/lib/length-input';
import {
  floorPosition,
  headingDeg,
  rayFromCamera,
  turnToward,
  type Ray,
  type TurnDirection,
} from './geometry';
import {
  VIRO_EULER_ORDER,
  planeArea,
  planeExtentCorners,
  planeHeight,
  planeNormal,
  planeWallLine,
  planeWorldVertices,
  type CenterSpace,
} from './planes';
import type { CameraPose, TrackedPlane } from './viro-anchor';

export type { ScanStep } from './coaching';

export interface ScanOptions {
  /** Euler order of Viro's anchor rotations: Viro's own is 'ZYX' (planes.ts). */
  eulerOrder: EulerOrder;
  /** How Viro reports plane centres on this phone: 'world' on iPhone, 'local' on Android. */
  centerSpace: CenterSpace;
  /** Debug ("Use detected walls (test)"): planes that line up with the room add walls. */
  useDetectedWalls: boolean;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  eulerOrder: VIRO_EULER_ORDER,
  centerSpace: 'world',
  useDetectedWalls: false,
};

export type MarkRole = 'first' | 'ceiling' | 'wall';

/** One tap of Mark: the camera ray, and what it was for. */
export interface Mark {
  /** 'm1', 'm2', ... */
  id: string;
  role: MarkRole;
  edge: WallEdge;
  ray: Ray;
  /** The wall's axis, decided when the mark was made (0 for the first wall); null for the ceiling. */
  axis: WallAxis | null;
  /** When it was made (ms since 1970). */
  at: number;
}

export interface ScanState {
  planes: Readonly<Record<string, TrackedPlane>>;
  camera: CameraPose | null;
  tracking: TrackingInfo | null;
  lightIntensity: number | null;
  /** Found by itself and kept (floor.ts); null until found. */
  floor: FloorState | null;
  marks: readonly Mark[];
  /** The user chose "Skip, use 8 ft" at the ceiling step. */
  ceilingSkipped: boolean;
  /** What Undo takes back, last first. */
  history: readonly ('mark' | 'skip-ceiling')[];
  nextMarkNumber: number;
  options: ScanOptions;
  /**
   * Where the phone has been on the floor plan since the first mark, while tracking was normal,
   * a point every VISIT_STEP. A wall cannot stand where the phone has been (`wallEvidence`).
   */
  visited: readonly Vec2[];
}

export function createScanState(options: Partial<ScanOptions> = {}): ScanState {
  return {
    planes: {},
    camera: null,
    tracking: null,
    lightIntensity: null,
    floor: null,
    marks: [],
    ceilingSkipped: false,
    history: [],
    nextMarkNumber: 1,
    options: { ...DEFAULT_SCAN_OPTIONS, ...options },
    visited: [],
  };
}

/** Looks at the floor again after the planes or the camera changed. */
function withFloor(state: ScanState): ScanState {
  const floor = nextFloor(state.floor, state.planes, state.camera?.position[1] ?? null);
  return floor === state.floor ? state : { ...state, floor };
}

export const upsertPlane = (state: ScanState, plane: TrackedPlane): ScanState =>
  withFloor({ ...state, planes: { ...state.planes, [plane.id]: plane } });

export function removePlane(state: ScanState, id: string): ScanState {
  if (!(id in state.planes)) return state;
  const { [id]: _removed, ...planes } = state.planes;
  return withFloor({ ...state, planes });
}

/** The phone's path is kept as a point every this far (m)... */
const VISIT_STEP = 0.2;
/** ...up to this many points (a long walk round a big room is a few hundred). */
const MAX_VISITED = 2000;

/**
 * Adds the phone's position to the path. Only after the first mark (the user may walk in from
 * another room before that) and only while tracking is normal (positions can jump otherwise).
 */
function visit(state: ScanState, camera: CameraPose): readonly Vec2[] {
  const v = state.visited;
  if (state.marks.length === 0 || v.length >= MAX_VISITED) return v;
  if (state.tracking?.state !== TRACKING_STATE.NORMAL) return v;
  const p = floorPosition(camera);
  const last = v[v.length - 1];
  if (last && Math.hypot(p.x - last.x, p.z - last.z) < VISIT_STEP) return v;
  return [...v, p];
}

export const setCamera = (state: ScanState, camera: CameraPose): ScanState =>
  withFloor({ ...state, camera, visited: visit(state, camera) });

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
/* Steps                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function scanStep(state: ScanState): ScanStep {
  if (!state.floor) return 'floor';
  const firsts = state.marks.filter((m) => m.role === 'first').length;
  if (firsts === 0) return 'first-wall';
  if (firsts === 1) return 'second-mark';
  if (!state.ceilingSkipped && !state.marks.some((m) => m.role === 'ceiling')) return 'ceiling';
  return 'walls';
}

/** Stored marks are worked out again when the floor moves: be generous with them. */
const AGAIN_MAX_DISTANCE = 12;
const AGAIN_MIN_ELEVATION_DEG = 0.5;

/** Where a stored mark's ray meets the level plane at `y`. */
function markPoint(mark: Mark, y: number): Vec2 | null {
  const hit = hitLevelPlane(mark.ray, y, AGAIN_MAX_DISTANCE, AGAIN_MIN_ELEVATION_DEG);
  return hit.ok ? hit.point : null;
}

export interface FirstWall {
  a: Vec2 | null;
  b: Vec2 | null;
}

function firstWallOf(state: ScanState, floorY: number): FirstWall {
  const [ma, mb] = state.marks.filter((m) => m.role === 'first');
  return { a: ma ? markPoint(ma, floorY) : null, b: mb ? markPoint(mb, floorY) : null };
}

export interface CeilingInfo {
  height: number;
  /**
   * 'measured': from the mark at the top of the first wall. 'detected': the phone found the
   * ceiling itself (and it agrees with the mark, if there is one). 'default': 8 ft.
   */
  source: 'measured' | 'detected' | 'default';
}

/** A detected ceiling replaces a measured one when they are this close (m). */
const CEILING_AGREEMENT = 0.15;

/**
 * The ceiling's height above the floor from a plane the phone found (iPhones classify it
 * 'Ceiling'; Android reports it facing down), or null. ARKit seldom finds plain ceilings, but
 * when it does its height is more precise than a mark.
 */
export function detectedCeiling(state: ScanState, floorY: number): number | null {
  let best: { h: number; area: number } | null = null;
  for (const p of Object.values(state.planes)) {
    const down = p.classification === 'Ceiling' || p.alignment === 'HorizontalDownward';
    if (!down || p.alignment === 'Vertical') continue;
    const h = planeHeight(p) - floorY;
    const area = planeArea(p);
    if (h < CEILING_MIN || h > CEILING_MAX || area < 0.1) continue;
    if (!best || area > best.area) best = { h, area };
  }
  return best?.h ?? null;
}

function ceilingOf(state: ScanState, floorY: number, first: FirstWall): CeilingInfo | null {
  const mark = state.marks.find((m) => m.role === 'ceiling');
  if (!mark && !state.ceilingSkipped) return null;
  const detected = detectedCeiling(state, floorY);
  if (mark && first.a && first.b) {
    const m = measureCeiling(mark.ray, floorY, first.a, first.b, AGAIN_MAX_DISTANCE);
    if (m.ok) {
      return detected !== null && Math.abs(detected - m.height) <= CEILING_AGREEMENT
        ? { height: detected, source: 'detected' }
        : { height: m.height, source: 'measured' };
    }
  }
  return detected !== null
    ? { height: detected, source: 'detected' }
    : { height: DEFAULT_CEILING_HEIGHT, source: 'default' };
}

/* ------------------------------------------------------------------------------------------ */
/* Where a wall cannot be                                                                      */
/* ------------------------------------------------------------------------------------------ */

/*
 * A mark at the bottom edge only works when that edge can be seen. A bed or desk often hides it,
 * and then the dot lands on the floor in front of the furniture: the wall comes out too close,
 * as in the owner's first iPhone 15 scan after the marked-wall rebuild (the window wall behind
 * the bed came out 1.5 m short, though the phone had been well past it). Two things the phone
 * knows for sure rule a wall out: where the phone itself has been, and furniture tops that reach
 * through the wall's line.
 */

/** The phone was more than this past a wall's line: the wall cannot be there (m). */
export const PAST_WALL_MARGIN = 0.6;
/** ...at this many points of its path at least (one odd camera reading is not enough). */
const PAST_WALL_MIN_VISITS = 2;
/** A furniture top reaching more than this past a wall's line rules the wall out (m)... */
export const FURNITURE_PAST_WALL = 0.4;
/** ...when it also reaches this far inside the line: one surface through the wall. */
const FURNITURE_INSIDE = 0.05;
/** Level surfaces between these heights above the floor are furniture tops (m). */
const FURNITURE_MIN_HEIGHT = 0.15;
const FURNITURE_MAX_HEIGHT = 1.3;
/**
 * Only evidence within this distance along the wall from its marks counts (m), so the far wing of
 * an L-shaped room is not taken as being past the wall.
 */
const EVIDENCE_ALONG = 1.5;

/** Why a wall cannot be where its marks put it. */
export type WallEvidence = 'walked-past' | 'furniture';

/** How far a wall is drawn past its marks when no crossing wall ends it yet (m). */
const OPEN_END = 0.6;

/** A level furniture top (bed, desk, table) on the floor plan. */
interface FurnitureTop {
  /** World height (y). */
  y: number;
  outline: Vec2[];
}

function furnitureTops(state: ScanState, floorY: number): FurnitureTop[] {
  const { eulerOrder, centerSpace } = state.options;
  const tops: FurnitureTop[] = [];
  for (const plane of Object.values(state.planes)) {
    if (plane.id === state.floor?.planeId || plane.alignment === 'Vertical') continue;
    if (!(planeNormal(plane, eulerOrder).y > 0.9)) continue; // facing up, not an underside
    const y = planeHeight(plane);
    const h = y - floorY;
    if (h < FURNITURE_MIN_HEIGHT || h > FURNITURE_MAX_HEIGHT) continue;
    const corners =
      plane.vertices.length >= 9
        ? planeWorldVertices(plane, eulerOrder)
        : planeExtentCorners(plane, eulerOrder, centerSpace);
    if (corners.length >= 3) tops.push({ y, outline: corners.map((c) => ({ x: c.x, z: c.z })) });
  }
  return tops;
}

/** A wall's line and where along it the marks are. */
interface WallLine {
  axis: WallAxis;
  facing: WallFacing;
  offset: number;
  alongFrom: number;
  alongTo: number;
}

/** Why the wall cannot be on `line`, or null when nothing rules it out. */
export function wallEvidence(
  line: WallLine,
  axes: RoomAxes,
  visited: readonly Vec2[],
  tops: readonly FurnitureTop[],
): WallEvidence | null {
  const n = wallNormal(axes, line.axis);
  const t = wallDirection(axes, line.axis);
  // How far past the wall a point is: positive on the side away from the room.
  const past = (p: Vec2) => -(p.x * n.x + p.z * n.z - line.offset) * line.facing;
  const along = (p: Vec2) => p.x * t.x + p.z * t.z;
  const lo = line.alongFrom - EVIDENCE_ALONG;
  const hi = line.alongTo + EVIDENCE_ALONG;
  let visits = 0;
  for (const p of visited) {
    if (past(p) <= PAST_WALL_MARGIN) continue;
    const a = along(p);
    if (a >= lo && a <= hi && ++visits >= PAST_WALL_MIN_VISITS) return 'walked-past';
  }
  for (const top of tops) {
    let most = -Infinity;
    let least = Infinity;
    let from = Infinity;
    let to = -Infinity;
    for (const q of top.outline) {
      const d = past(q);
      const a = along(q);
      most = Math.max(most, d);
      least = Math.min(least, d);
      from = Math.min(from, a);
      to = Math.max(to, a);
    }
    if (most > FURNITURE_PAST_WALL && least < -FURNITURE_INSIDE && to >= lo && from <= hi) {
      return 'furniture';
    }
  }
  return null;
}

/** Even-odd test: is `p` inside the polygon? */
function insideOutline(p: Vec2, outline: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]!;
    const b = outline[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when the ray passes through a furniture top before it gets down to height `y`. */
function rayOnFurniture(ray: Ray, y: number, tops: readonly FurnitureTop[]): boolean {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (!(dy < -1e-6)) return false;
  return tops.some((top) => {
    if (!(top.y < oy && top.y > y)) return false;
    const s = (top.y - oy) / dy;
    return insideOutline({ x: ox + dx * s, z: oz + dz * s }, top.outline);
  });
}

/** A dropped wall: its marks, why it cannot be there, and where it was (drawn in red). */
export interface DroppedWall {
  wall: MarkedWall;
  evidence: WallEvidence;
  a: Vec2;
  b: Vec2;
}

/**
 * The walls the phone's path or a furniture top rules out, and their marks. The first wall is
 * never dropped: it sets the room's directions and the ceiling.
 */
function contradictedWalls(
  state: ScanState,
  grouped: GroupedWalls,
  tops: readonly FurnitureTop[],
): { dropped: DroppedWall[]; markIds: Set<string> } {
  const firstIds = new Set(state.marks.filter((m) => m.role === 'first').map((m) => m.id));
  const dropped: DroppedWall[] = [];
  const markIds = new Set<string>();
  for (const wall of grouped.walls) {
    if (wall.markIds.some((id) => firstIds.has(id) || id.startsWith('plane:'))) continue;
    const evidence = wallEvidence(
      {
        axis: wall.axis,
        facing: wall.facing,
        offset: wall.offset,
        alongFrom: Math.min(...wall.along),
        alongTo: Math.max(...wall.along),
      },
      grouped.axes,
      state.visited,
      tops,
    );
    if (!evidence) continue;
    const seg = wallSegment(
      grouped.axes,
      wall.axis,
      wall.offset,
      Math.min(...wall.along) - OPEN_END,
      Math.max(...wall.along) + OPEN_END,
    );
    dropped.push({ wall, evidence, a: seg.a, b: seg.b });
    for (const id of wall.markIds) markIds.add(id);
  }
  return { dropped, markIds };
}

/* ------------------------------------------------------------------------------------------ */
/* Where the dot is aimed                                                                      */
/* ------------------------------------------------------------------------------------------ */

export type AimError =
  | 'no-camera'
  | 'no-floor'
  | 'aim-lower'
  | 'aim-higher'
  | 'level'
  | 'too-far'
  | 'too-close-to-first'
  | 'under-phone'
  | 'diagonal'
  | 'walked-past'
  | 'furniture'
  | 'on-furniture'
  | 'not-this-wall'
  | 'not-a-ceiling';

export const AIM_MESSAGES: Record<AimError, string> = {
  'no-camera': 'The camera is not ready yet. Hold the phone up and try again.',
  'no-floor': 'Find the floor first: point the phone at the floor and move it slowly.',
  'aim-lower': 'Aim the dot lower, where the wall meets the floor.',
  'aim-higher': 'Aim the dot higher, where the wall meets the ceiling.',
  level: 'Aim at the bottom edge of the wall, or at its top edge.',
  'too-far': 'That spot is too far away. Walk closer to the wall and try again.',
  'too-close-to-first':
    'Move the dot further along the same wall: at least 50 cm (20 in) from the first mark.',
  'under-phone': 'Aim at the edge of a wall, not at the floor under the phone.',
  diagonal: 'Face the wall more directly, then tap Mark.',
  'walked-past':
    'Your phone has already been past that spot, so the wall is further back. If furniture hides its bottom edge, aim at its top edge.',
  furniture:
    'A bed, desk or table reaches past that spot, so the wall is further back. Aim at its top edge instead.',
  'on-furniture':
    'The dot is on furniture. Aim where the wall meets the floor, or at its top edge.',
  'not-this-wall': 'Aim at the top of the same wall you just marked.',
  'not-a-ceiling':
    'That does not look like the top of this wall. Aim where the wall meets the ceiling.',
};

/** Short labels under the dot. */
export const AIM_LABELS: Record<AimError, string> = {
  'no-camera': 'Starting…',
  'no-floor': 'Find the floor first',
  'aim-lower': 'Aim lower',
  'aim-higher': 'Aim higher',
  level: 'Aim at a top or bottom edge',
  'too-far': 'Too far away',
  'too-close-to-first': 'Further along the wall',
  'under-phone': 'Aim at a wall',
  diagonal: 'Face the wall',
  'walked-past': 'The wall is further back',
  furniture: 'Furniture in the way',
  'on-furniture': 'On furniture',
  'not-this-wall': 'The same wall',
  'not-a-ceiling': 'Aim at the ceiling line',
};

export type Aim =
  | {
      ok: true;
      edge: WallEdge;
      /** Where the dot meets the edge, on the floor plan, and its height (world y). */
      point: Vec2;
      y: number;
      /** From the camera, along the floor (m). */
      distance: number;
      /** Walls step: the wall this mark goes on. */
      placement: WallPlacement | null;
      /** Ceiling step: the height this mark measures. */
      ceilingHeight: number | null;
    }
  | {
      ok: false;
      error: AimError;
      edge: WallEdge | null;
      /** Where the dot meets the edge, when it does. */
      point: Vec2 | null;
      y: number | null;
    };

const miss = (
  error: AimError,
  edge: WallEdge | null = null,
  point: Vec2 | null = null,
  y: number | null = null,
): Aim => ({ ok: false, error, edge, point, y });

/** A mark closer than this to the camera on the floor plan is the floor under the phone (m). */
const UNDER_PHONE = 0.25;

function aimFor(
  state: ScanState,
  step: ScanStep,
  first: FirstWall,
  ceiling: CeilingInfo | null,
  axes: RoomAxes | null,
  tops: readonly FurnitureTop[],
): Aim {
  const camera = state.camera;
  if (!camera) return miss('no-camera');
  const floorY = state.floor?.y;
  if (step === 'floor' || floorY === undefined) return miss('no-floor');
  const ray = rayFromCamera(camera);
  const cam = floorPosition(camera);
  const ok = (
    edge: WallEdge,
    point: Vec2,
    y: number,
    distance: number,
    placement: WallPlacement | null = null,
    ceilingHeight: number | null = null,
  ): Aim => ({ ok: true, edge, point, y, distance, placement, ceilingHeight });

  if (step === 'first-wall' || step === 'second-mark') {
    const hit = hitLevelPlane(ray, floorY);
    if (!hit.ok) return miss(hit.reason === 'too-far' ? 'too-far' : 'aim-lower', 'floor');
    if (hit.distance < UNDER_PHONE) return miss('under-phone', 'floor', hit.point, floorY);
    if (rayOnFurniture(ray, floorY, tops)) return miss('on-furniture', 'floor', hit.point, floorY);
    const a = first.a;
    if (step === 'second-mark' && a) {
      const span = Math.hypot(hit.point.x - a.x, hit.point.z - a.z);
      if (span < MIN_FIRST_WALL_SPAN) return miss('too-close-to-first', 'floor', hit.point, floorY);
    }
    return ok('floor', hit.point, floorY, hit.distance);
  }

  if (step === 'ceiling') {
    if (!first.a || !first.b) return miss('no-floor');
    const m = measureCeiling(ray, floorY, first.a, first.b);
    if (!m.ok) return miss(m.reason, 'ceiling');
    const point = { x: m.point[0], z: m.point[2] };
    return ok('ceiling', point, m.point[1], m.distance, null, m.height);
  }

  // Walls: the floor edge below the horizon, the ceiling edge above it.
  if (!axes) return miss('no-floor');
  const edge = edgeForRay(ray);
  if (!edge) return miss('level');
  const y = edge === 'floor' ? floorY : floorY + (ceiling?.height ?? DEFAULT_CEILING_HEIGHT);
  const hit = hitLevelPlane(ray, y);
  if (!hit.ok) return miss(hit.reason, edge);
  if (edge === 'floor' && rayOnFurniture(ray, y, tops)) {
    return miss('on-furniture', edge, hit.point, y);
  }
  const placed = placeMark(hit.point, cam, axes);
  if (!placed.ok) {
    return miss(placed.reason === 'diagonal' ? 'diagonal' : 'under-phone', edge, hit.point, y);
  }
  const evidence = wallEvidence(
    { ...placed, alongFrom: placed.along, alongTo: placed.along },
    axes,
    state.visited,
    tops,
  );
  if (evidence) return miss(evidence, edge, hit.point, y);
  return ok(edge, hit.point, y, hit.distance, placed);
}

/* ------------------------------------------------------------------------------------------ */
/* Walls from marks (and, in test mode, from planes)                                           */
/* ------------------------------------------------------------------------------------------ */

/** Why a vertical plane was or was not taken as a wall ("Use detected walls (test)"). */
export type PlaneWallVerdict =
  'accepted' | 'not-vertical' | 'off-axis' | 'narrow' | 'contradicts-mark' | 'no-camera';

export interface PlaneWallCheck {
  planeId: string;
  verdict: PlaneWallVerdict;
  /** Degrees from the nearest room axis. */
  offAxisDeg: number | null;
  /** Its stretch along the floor (m). */
  width: number | null;
}

/** A plane must run within this many degrees of a room axis to be a wall. */
export const PLANE_AXIS_TOLERANCE_DEG = 7;
/** ...and be at least this wide (m). */
export const PLANE_MIN_WIDTH = 0.6;
/** A plane counts half as much as a mark. */
const PLANE_WEIGHT = 0.5;

function planeWalls(
  state: ScanState,
  axes: RoomAxes,
  marked: GroupedWalls,
): { inputs: WallMarkInput[]; checks: PlaneWallCheck[] } {
  const inputs: WallMarkInput[] = [];
  const checks: PlaneWallCheck[] = [];
  const { eulerOrder, centerSpace } = state.options;
  for (const plane of Object.values(state.planes)) {
    if (plane.alignment !== 'Vertical') continue;
    const check = (verdict: PlaneWallVerdict, offAxisDeg: number | null, width: number | null) =>
      checks.push({ planeId: plane.id, verdict, offAxisDeg, width });
    const line = planeWallLine(plane, eulerOrder, centerSpace);
    if (!line) {
      check('not-vertical', null, null);
      continue;
    }
    const cu = Math.abs(line.direction.x * axes.u.x + line.direction.z * axes.u.z);
    const cv = Math.abs(line.direction.x * axes.v.x + line.direction.z * axes.v.z);
    const axis: WallAxis = cu >= cv ? 0 : 1;
    const offAxisDeg = (Math.acos(Math.min(1, Math.max(cu, cv))) * 180) / Math.PI;
    const width = line.to - line.from;
    if (offAxisDeg > PLANE_AXIS_TOLERANCE_DEG) {
      check('off-axis', offAxisDeg, width);
      continue;
    }
    if (width < PLANE_MIN_WIDTH) {
      check('narrow', offAxisDeg, width);
      continue;
    }
    if (!state.camera) {
      check('no-camera', offAxisDeg, width);
      continue;
    }
    const n = wallNormal(axes, axis);
    const t = wallDirection(axes, axis);
    const at = (s: number): Vec2 => ({
      x: line.point.x + line.direction.x * s,
      z: line.point.z + line.direction.z * s,
    });
    const mid = at((line.from + line.to) / 2);
    const offset = mid.x * n.x + mid.z * n.z;
    const cam = floorPosition(state.camera);
    const facing: WallFacing = (cam.x - mid.x) * n.x + (cam.z - mid.z) * n.z >= 0 ? 1 : -1;
    const ends = [at(line.from), at(line.to)].map((p) => p.x * t.x + p.z * t.z);
    const lo = Math.min(...ends);
    const hi = Math.max(...ends);
    // A marked wall says where this stretch of wall is: a plane elsewhere on it is not the wall.
    const contradicts = marked.walls.some(
      (w) =>
        w.axis === axis &&
        w.facing === facing &&
        Math.abs(w.offset - offset) > MERGE_DISTANCE &&
        Math.min(...w.along) - 0.3 <= hi &&
        Math.max(...w.along) + 0.3 >= lo,
    );
    if (contradicts) {
      check('contradicts-mark', offAxisDeg, width);
      continue;
    }
    check('accepted', offAxisDeg, width);
    inputs.push({
      id: `plane:${plane.id}`,
      point: mid,
      camera: { x: mid.x + facing * n.x, z: mid.z + facing * n.z },
      axis,
      weight: PLANE_WEIGHT,
    });
  }
  return { inputs, checks };
}

/** A wall to draw, on the floor plan. */
export interface WallView {
  a: Vec2;
  b: Vec2;
  /** Index into the grouped walls; -1 for a wall that was ruled out (`ScanDerived.dropped`). */
  wall: number;
  /** Part of the room that no mark is on (filled in). */
  inferred: boolean;
  conflict: boolean;
  /** Only detected planes are on it ("Use detected walls (test)"). */
  fromPlanes: boolean;
}

/** A mark to draw. */
export interface MarkView {
  id: string;
  role: MarkRole;
  edge: WallEdge;
  /** Where it hit, on the floor plan and in height (null when it no longer works out). */
  point: Vec2 | null;
  y: number | null;
  /** Index into the grouped walls (wall and first-wall marks). */
  wall: number | null;
}

function wallViews(grouped: GroupedWalls, room: RectilinearResult | null): WallView[] {
  const fromPlanes = (i: number) =>
    grouped.walls[i]!.markIds.every((id) => id.startsWith('plane:'));
  if (room?.ok) {
    return room.room.walls.map((w, k) => {
      const { a, b } = wallEndpoints(room.room, w);
      const wall = room.wallSource[k]!;
      return {
        a,
        b,
        wall,
        inferred: room.inferredWalls.includes(k),
        conflict: false,
        fromPlanes: fromPlanes(wall),
      };
    });
  }
  const conflicting = room && !room.ok ? room.conflicting : [];
  return grouped.walls.map((w, i) => {
    const lo = Math.min(...w.along);
    const hi = Math.max(...w.along);
    const crossing = grouped.walls.filter((o) => o.axis !== w.axis).map((o) => o.offset);
    const end = crossing.filter((o) => o >= hi - 0.05).sort((p, q) => p - q)[0];
    const start = crossing.filter((o) => o <= lo + 0.05).sort((p, q) => q - p)[0];
    const seg = wallSegment(
      grouped.axes,
      w.axis,
      w.offset,
      start !== undefined ? start : lo - OPEN_END,
      end !== undefined ? end : hi + OPEN_END,
    );
    return {
      ...seg,
      wall: i,
      inferred: false,
      conflict: conflicting.includes(i),
      fromPlanes: fromPlanes(i),
    };
  });
}

/** For a room that is still a rectangle: which way the next unmarked wall is. */
function nextWallTurn(grouped: GroupedWalls, heading: number | null): TurnDirection | null {
  if (heading === null) return null;
  const sides = new Set(grouped.walls.map((w) => `${w.axis}:${w.facing}`));
  if (sides.size !== grouped.walls.length) return null; // two walls on one side: not a rectangle
  const missing = (
    [
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
    ] as const
  ).filter(([axis, facing]) => !sides.has(`${axis}:${facing}`));
  if (missing.length === 0) return null;
  let best: { delta: number; target: number } | null = null;
  for (const [axis, facing] of missing) {
    // From inside the room, the wall on that side is against its facing.
    const n = wallNormal(grouped.axes, axis);
    const target = angleAboveDeg({ x: -facing * n.x, z: -facing * n.z });
    const delta = Math.abs(((target - heading + 540) % 360) - 180);
    if (!best || delta < best.delta) best = { delta, target };
  }
  return best ? turnToward(heading, best.target) : null;
}

/* ------------------------------------------------------------------------------------------ */
/* Derived view of the scan                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface ScanDerived {
  step: ScanStep;
  floor: FloorState | null;
  floorStatus: FloorStatus;
  /** The phone's position on the floor plan. */
  cameraFloor: Vec2 | null;
  headingDeg: number | null;
  /** The room's directions, once the first wall is marked. */
  axes: RoomAxes | null;
  firstWall: FirstWall;
  ceiling: CeilingInfo | null;
  aim: Aim;
  marks: MarkView[];
  /** The marked walls (and accepted planes); null before the first wall. */
  grouped: GroupedWalls | null;
  walls: WallView[];
  /** The walls joined into a room, every one of them; null before the walls step. */
  room: RectilinearResult | null;
  /** Walls left out because the phone's path or a furniture top rules them out (drawn red). */
  dropped: DroppedWall[];
  /** Every wall fits and the room is closed: the scan can finish by itself. */
  closed: boolean;
  /** Test mode: what happened to each vertical plane. */
  planeWalls: PlaneWallCheck[];
  /** What to do now (coaching first, when tracking is poor). */
  message: Message;
  coaching: Coaching | null;
  planeCount: number;
  verticalPlaneCount: number;
}

export function deriveScan(state: ScanState): ScanDerived {
  const step = scanStep(state);
  const camera = state.camera;
  const planes = Object.values(state.planes);
  const cameraY = camera?.position[1] ?? null;
  const heading = camera ? headingDeg(camera) : null;
  const floorY = state.floor?.y ?? null;
  const first: FirstWall = floorY === null ? { a: null, b: null } : firstWallOf(state, floorY);
  const ceiling = floorY === null ? null : ceilingOf(state, floorY, first);
  const startAxes = first.a && first.b ? axesThrough(first.a, first.b) : null;

  // Every mark on a wall, as a point on the wall's floor line.
  const inputs: WallMarkInput[] = [];
  const markWall = new Map<string, number>();
  const markViews: MarkView[] = state.marks.map((m) => {
    if (floorY === null)
      return { id: m.id, role: m.role, edge: m.edge, point: null, y: null, wall: null };
    if (m.role === 'ceiling') {
      const hit =
        first.a && first.b
          ? measureCeiling(m.ray, floorY, first.a, first.b, AGAIN_MAX_DISTANCE)
          : null;
      return {
        id: m.id,
        role: m.role,
        edge: m.edge,
        point: hit?.ok ? { x: hit.point[0], z: hit.point[2] } : null,
        y: hit?.ok ? hit.point[1] : null,
        wall: null,
      };
    }
    const y = m.edge === 'floor' ? floorY : floorY + (ceiling?.height ?? DEFAULT_CEILING_HEIGHT);
    const point = markPoint(m, y);
    if (point && m.axis !== null) {
      inputs.push({
        id: m.id,
        point,
        camera: { x: m.ray.origin[0], z: m.ray.origin[2] },
        axis: m.axis,
      });
    }
    return { id: m.id, role: m.role, edge: m.edge, point, y: point ? y : null, wall: null };
  });

  const tops = floorY === null ? [] : furnitureTops(state, floorY);
  let grouped: GroupedWalls | null = null;
  let planeChecks: PlaneWallCheck[] = [];
  let dropped: DroppedWall[] = [];
  let used = inputs;
  if (startAxes) {
    grouped = groupWallMarks(used, startAxes);
    if (step === 'walls') {
      // A wall where the phone has been, or that furniture reaches through, is left out.
      const ruled = contradictedWalls(state, grouped, tops);
      if (ruled.dropped.length > 0) {
        dropped = ruled.dropped;
        used = inputs.filter((i) => !ruled.markIds.has(i.id));
        grouped = groupWallMarks(used, startAxes);
      }
    }
    if (state.options.useDetectedWalls && step === 'walls') {
      const fromPlanes = planeWalls(state, grouped.axes, grouped);
      planeChecks = fromPlanes.checks;
      if (fromPlanes.inputs.length > 0) {
        grouped = groupWallMarks([...used, ...fromPlanes.inputs], startAxes);
      }
    }
    grouped.wallOf.forEach((w, k) => {
      if (k < used.length) markWall.set(used[k]!.id, w);
    });
  }
  const room =
    step === 'walls' && grouped
      ? solveRectilinearRoom(grouped.walls, grouped.axes, {
          ceilingHeight: ceiling?.height ?? DEFAULT_CEILING_HEIGHT,
        })
      : null;
  const walls = grouped
    ? [
        ...wallViews(grouped, room),
        ...dropped.map(({ a, b }) => ({
          a,
          b,
          wall: -1,
          inferred: false,
          conflict: true,
          fromPlanes: false,
        })),
      ]
    : [];
  const axes = grouped?.axes ?? null;
  const aim = aimFor(state, step, first, ceiling, axes, tops);
  const status = floorStatus(state.floor, state.planes, cameraY);
  const roomState =
    room === null
      ? null
      : room.ok
        ? 'closed'
        : room.error === 'conflict' || room.error === 'shape'
          ? 'conflict'
          : 'open';
  const coaching = coachingFor({ tracking: state.tracking, lightIntensity: state.lightIntensity });
  const message =
    coaching ??
    guidanceFor({
      step,
      floorStatus: status,
      room: roomState,
      ruledOut: dropped[0]?.evidence ?? null,
      turn: step === 'walls' && grouped ? nextWallTurn(grouped, heading) : null,
    });

  return {
    step,
    floor: state.floor,
    floorStatus: status,
    cameraFloor: camera ? floorPosition(camera) : null,
    headingDeg: heading,
    axes,
    firstWall: first,
    ceiling,
    aim,
    marks: markViews.map((v) => ({ ...v, wall: markWall.get(v.id) ?? null })),
    grouped,
    walls,
    room,
    dropped,
    closed: room?.ok === true,
    planeWalls: planeChecks,
    message,
    coaching,
    planeCount: planes.length,
    verticalPlaneCount: planes.filter((p) => p.alignment === 'Vertical').length,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Actions                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type MarkOutcome =
  | {
      kind: 'marked';
      mark: Mark;
      /** The step the mark was made in. */
      step: ScanStep;
      /** Ceiling step: the height measured. */
      ceilingHeight: number | null;
      /** Walls step: it joined a wall that was already marked (they are averaged). */
      joined: boolean;
    }
  | { kind: 'error'; error: AimError; message: string };

/** "Mark": records the camera ray if the dot is on something this step can use. */
export function markAtAim(
  state: ScanState,
  now: number = Date.now(),
  derived: ScanDerived = deriveScan(state),
): { state: ScanState; outcome: MarkOutcome } {
  const { aim, step } = derived;
  if (!aim.ok || !state.camera) {
    const error = aim.ok ? 'no-camera' : aim.error;
    return { state, outcome: { kind: 'error', error, message: AIM_MESSAGES[error] } };
  }
  const role: MarkRole = step === 'ceiling' ? 'ceiling' : step === 'walls' ? 'wall' : 'first';
  const placement = aim.placement;
  const mark: Mark = {
    id: `m${state.nextMarkNumber}`,
    role,
    edge: aim.edge,
    ray: rayFromCamera(state.camera),
    axis: role === 'first' ? 0 : role === 'wall' && placement ? placement.axis : null,
    at: now,
  };
  const joined =
    role === 'wall' &&
    placement !== null &&
    (derived.grouped?.walls ?? []).some(
      (w) =>
        w.axis === placement.axis &&
        w.facing === placement.facing &&
        Math.abs(w.offset - placement.offset) <= MERGE_DISTANCE,
    );
  return {
    state: {
      ...state,
      marks: [...state.marks, mark],
      history: [...state.history, 'mark'],
      nextMarkNumber: state.nextMarkNumber + 1,
    },
    outcome: { kind: 'marked', mark, step, ceilingHeight: aim.ceilingHeight, joined },
  };
}

/** "Skip, use 8 ft" at the ceiling step. */
export function skipCeiling(state: ScanState): ScanState {
  if (scanStep(state) !== 'ceiling') return state;
  return { ...state, ceilingSkipped: true, history: [...state.history, 'skip-ceiling'] };
}

/** Takes back the last mark (or the ceiling skip). */
export function undo(state: ScanState): ScanState {
  const last = state.history[state.history.length - 1];
  if (!last) return state;
  const history = state.history.slice(0, -1);
  return last === 'skip-ceiling'
    ? { ...state, history, ceilingSkipped: false }
    : { ...state, history, marks: state.marks.slice(0, -1) };
}

export type FinishResult =
  | {
      ok: true;
      room: Room;
      /** Walls of the room no mark is on (drawn dashed). */
      inferredWalls: number[];
      /** Walls joined from marks (and planes). */
      wallCount: number;
      /** Marks left out because they did not fit. */
      leftOutMarks: number;
      ceiling: CeilingInfo;
    }
  | { ok: false; reason: string };

const NOT_YET: Record<Exclude<ScanStep, 'walls'>, string> = {
  floor: AIM_MESSAGES['no-floor'],
  'first-wall': 'Mark the first wall first: aim where a wall meets the floor and tap Mark.',
  'second-mark': 'Mark the first wall once more, further along, then the other walls.',
  ceiling: 'Mark the top of the first wall, or tap "Skip, use 8 ft", then mark the other walls.',
};

/**
 * Joins the walls into a room when the user asks ("Done"): if the walls do not all fit, it leaves
 * out the one that does not (see core's `solveRoomLeavingOut`).
 */
export function finishScan(
  state: ScanState,
  derived: ScanDerived = deriveScan(state),
): FinishResult {
  if (derived.step !== 'walls') return { ok: false, reason: NOT_YET[derived.step] };
  if (!derived.grouped) return { ok: false, reason: NOT_YET['first-wall'] };
  const ceiling = derived.ceiling ?? { height: DEFAULT_CEILING_HEIGHT, source: 'default' as const };
  const r = solveRoomLeavingOut(derived.grouped.walls, derived.grouped.axes, {
    ceilingHeight: ceiling.height,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  const walls = derived.grouped.walls;
  return {
    ok: true,
    room: r.room,
    inferredWalls: r.inferredWalls,
    wallCount: walls.length - r.leftOut.length,
    leftOutMarks: r.leftOut.reduce((n, i) => n + walls[i]!.markIds.length, 0),
    ceiling,
  };
}
