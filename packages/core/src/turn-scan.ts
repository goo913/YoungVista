/**
 * The turn-around scan, as the phone, the server and the website share it. The user stands in the
 * room and turns (no corner marks); the phone uploads posed keyframes, a server job fits the
 * walls, and the phone builds the room from the result with the same solver as marked walls.
 *
 * 1. **Capture** (phone): `CaptureManifest` at `captureFile(uid, scanId)` plus one JPEG per
 *    `CaptureFrame`, in the folder `captureFolder(uid, scanId)`.
 * 2. **Fit** (server): the callable `fitRoom({ scanId })` queues the job; the job writes
 *    `scanFits/{scanId}` (`ScanFitDoc`): status, then the fitted walls as marks, the ceiling
 *    height, doors and windows, and a 360° panorama per standing spot.
 * 3. **Build** (phone): `fitMarks` turns the result into `WallMarkInput`s for `groupWallMarks` and
 *    `solveRectilinearRoom`, merged with any marks the user adds for low-confidence walls.
 * 4. **Tour** (phone, website): the saved room keeps its spots as `RoomTour` in `rooms/{id}.tour`.
 *
 * Coordinates are the AR world of the scan session (ARKit: metres, Y up, gravity aligned), the
 * same frame as the marked-wall scan, so fitted walls, user marks and the AR view all agree.
 */
import type { Vec2 } from './types';
import type { Vec3Tuple } from './plane';
import {
  roomAxes,
  type RoomAxes,
  type WallAxis,
  type WallFacing,
  type WallMarkInput,
} from './wall-marks';

/** Version of the capture files; the server refuses versions it does not know. */
export const CAPTURE_VERSION = 1;

/** Where a turn-around scan's files live in Storage (no trailing slash). */
export const captureFolder = (uid: string, scanId: string): string =>
  `users/${uid}/scans/${scanId}`;

/** The capture's manifest. */
export const captureFile = (uid: string, scanId: string): string =>
  `${captureFolder(uid, scanId)}/capture.json`;

/** A keyframe's JPEG, relative to the capture folder: `kf/007.jpg`. */
export const keyframeFile = (index: number): string => `kf/${String(index).padStart(3, '0')}.jpg`;

/** A spot's 360° panorama (written by the server), relative to the capture folder. */
export const panoramaFile = (spot: number): string => `pano/spot-${spot}.jpg`;

/** How the phone was held: three landscape rings (down, level, up) or two portrait rings. */
export type CaptureMode = 'landscape-3' | 'portrait-2';

/** One keyframe: a JPEG of the camera image exactly as ARKit captured it, with its pose. */
export interface CaptureFrame {
  index: number;
  /** Relative to the capture folder (`keyframeFile(index)`). */
  file: string;
  /** Seconds since the capture started. */
  t: number;
  /** The standing spot (0 for the first). */
  spot: number;
  /** 0, 1, 2 from the lowest ring up. */
  ring: number;
  /** The camera's heading and tilt when taken (degrees; heading as `atan2(x, z)` of forward). */
  yawDeg: number;
  pitchDeg: number;
  /**
   * ARKit's camera-to-world transform, column-major 4×4 (16 numbers). Camera axes are ARKit's:
   * +X along the image's width, +Y up the image, looking down −Z, for the image as stored.
   */
  transform: number[];
  /** Pinhole intrinsics in pixels, for the JPEG as stored. */
  intrinsics: { fx: number; fy: number; cx: number; cy: number };
  width: number;
  height: number;
  tracking: 'normal' | 'limited';
  /** Higher is sharper (the phone's own measure; only compared within one capture). */
  sharpness?: number;
  /** Seconds. */
  exposureDuration?: number;
}

/** The capture manifest (`capture.json`). */
export interface CaptureManifest {
  version: typeof CAPTURE_VERSION;
  scanId: string;
  ownerId: string;
  /** ISO 8601. */
  createdAt: string;
  mode: CaptureMode;
  device: { model: string; os: string; app: string; viro: string; videoFormat?: string };
  /** The AR floor plane's height (world y, m) at the end, and how it moved during the capture. */
  floor: { y: number; history?: { t: number; y: number }[] };
  /** Where the user stood: the mean camera position of each spot's frames. */
  spots: { index: number; position: Vec3Tuple }[];
  frames: CaptureFrame[];
}

export type ScanFitStatus = 'queued' | 'running' | 'done' | 'failed';

/** A fitted wall, given as marks so the phone's solver builds the room exactly as for taps. */
export interface FittedMark {
  id: string;
  /** Where the wall's line meets the floor, on the floor plan (world x, z). */
  point: Vec2;
  /** Where the camera stood, on the floor plan: says which side of the wall the room is on. */
  camera: Vec2;
  axis: WallAxis;
  /** 0..1: how sure the server is (low-confidence walls are offered for a mark by hand). */
  confidence: number;
}

/** A door, window or opening the server found, on one fitted wall (by any of its mark ids). */
export interface FittedOpening {
  markId: string;
  kind: 'door' | 'window' | 'opening';
  /** Along the wall's direction in the fit's axes (m, same frame as `toRoomFrame`). */
  from: number;
  to: number;
  /** Heights above the floor (m). */
  bottom: number;
  top: number;
  confidence: number;
}

/** A 360° panorama the server stitched for one standing spot. */
export interface TourSpot {
  spot: number;
  /** Full Storage path of the equirectangular JPEG (2:1). */
  storagePath: string;
  width: number;
  height: number;
  /** Where the camera stood (world, m): the panorama's centre. */
  position: Vec3Tuple;
  /** Heading (degrees, `atan2(x, z)`) of the panorama's centre column (u = 0.5). */
  yawDeg: number;
}

/** `scanFits/{scanId}`, written only by the server (the owner can read it). */
export interface ScanFitDoc {
  ownerId: string;
  status: ScanFitStatus;
  /** Plain words when `failed`. */
  error?: string;
  /** Present when `done`. */
  result?: {
    /** The room's axes, as `axesAngle` (radians): marks' `axis` refers to these. */
    axesAngle: number;
    floorY: number;
    /** Metres above the floor, or null when the ceiling could not be found. */
    ceilingHeight: number | null;
    marks: FittedMark[];
    openings: FittedOpening[];
    spots: TourSpot[];
  };
  /** Model and code versions, timings: for the team. */
  info?: Record<string, unknown>;
}

/** The tour kept with a saved room: `rooms/{id}.tour`, in room coordinates. */
export interface RoomTour {
  scanId: string;
  spots: (Omit<TourSpot, 'position' | 'yawDeg'> & {
    /** The spot in room coordinates (m; y above the floor). */
    position: Vec3Tuple;
    /** Heading of the panorama's centre column in room coordinates (degrees). */
    yawDeg: number;
  })[];
}

/** Below this confidence a fitted wall is shown as unsure and offered for a mark by hand. */
export const LOW_CONFIDENCE = 0.5;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec2 = (v: unknown): v is Vec2 =>
  !!v && typeof v === 'object' && isNum((v as Vec2).x) && isNum((v as Vec2).z);

/** Reads `scanFits/{scanId}` data; null when it is not a fit document. */
export function scanFitFromFirestore(data: unknown): ScanFitDoc | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const status = d.status;
  if (typeof d.ownerId !== 'string') return null;
  if (status !== 'queued' && status !== 'running' && status !== 'done' && status !== 'failed') {
    return null;
  }
  const out: ScanFitDoc = { ownerId: d.ownerId, status };
  if (typeof d.error === 'string') out.error = d.error;
  if (d.info && typeof d.info === 'object') out.info = d.info as Record<string, unknown>;
  const r = d.result as Record<string, unknown> | undefined;
  if (status === 'done' && r && typeof r === 'object' && isNum(r.axesAngle) && isNum(r.floorY)) {
    const marks = (Array.isArray(r.marks) ? r.marks : []).filter(
      (m): m is FittedMark =>
        !!m &&
        typeof (m as FittedMark).id === 'string' &&
        isVec2((m as FittedMark).point) &&
        isVec2((m as FittedMark).camera) &&
        ((m as FittedMark).axis === 0 || (m as FittedMark).axis === 1) &&
        isNum((m as FittedMark).confidence),
    );
    const openings = (Array.isArray(r.openings) ? r.openings : []).filter(
      (o): o is FittedOpening =>
        !!o &&
        typeof (o as FittedOpening).markId === 'string' &&
        ['door', 'window', 'opening'].includes((o as FittedOpening).kind) &&
        [o.from, o.to, o.bottom, o.top, o.confidence].every(isNum),
    );
    const spots = (Array.isArray(r.spots) ? r.spots : []).filter(
      (s): s is TourSpot =>
        !!s &&
        typeof (s as TourSpot).storagePath === 'string' &&
        [s.spot, s.width, s.height, s.yawDeg].every(isNum) &&
        Array.isArray((s as TourSpot).position) &&
        (s as TourSpot).position.length === 3 &&
        (s as TourSpot).position.every(isNum),
    );
    out.result = {
      axesAngle: r.axesAngle,
      floorY: r.floorY,
      ceilingHeight: isNum(r.ceilingHeight) ? r.ceilingHeight : null,
      marks,
      openings,
      spots,
    };
  }
  return out;
}

/** The fit's marks as solver input, with the fit's axes; confidence becomes the mark's weight. */
export function fitMarks(result: NonNullable<ScanFitDoc['result']>): {
  axes: RoomAxes;
  marks: WallMarkInput[];
} {
  return {
    axes: roomAxes(result.axesAngle),
    marks: result.marks.map((m) => ({
      id: m.id,
      point: m.point,
      camera: m.camera,
      axis: m.axis,
      weight: Math.max(0.05, Math.min(1, m.confidence)),
    })),
  };
}

/** Which side of its wall a fitted mark's room is on (as `placeMark` reports it for a tap). */
export function fittedFacing(axes: RoomAxes, mark: FittedMark): WallFacing {
  const n = mark.axis === 0 ? axes.v : axes.u;
  // As in `placeMark`: the view from the camera to the wall, against the wall's normal.
  const c = (mark.point.x - mark.camera.x) * n.x + (mark.point.z - mark.camera.z) * n.z;
  return c > 0 ? -1 : 1;
}
