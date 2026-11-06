/**
 * The scan log: one compact Firestore document per scan, whether the room was saved, abandoned or
 * failed, so the team can see what happened on real phones without asking the owner.
 *
 * `scanLogs/{autoId}` (firestore.rules): the signed-in user creates it for themselves; nobody can
 * change it; only they can read or delete it. Firestore cannot store arrays inside arrays, so
 * points are short number lists inside maps, and camera samples one flat list. The document is
 * kept under 900 KB (Firestore's limit is 1 MiB).
 *
 * Writing never blocks or breaks the scan (log-writer.ts): offline, Firestore queues it.
 */
import { axesAngle, type Room } from '@youngvista/core';
import release from '../release.json';
import { POSE_STRIDE, type ScanRecord } from './controller';

export type ScanOutcome = 'saved' | 'abandoned' | 'failed';

/** Bump when the document's shape changes. */
export const SCAN_LOG_VERSION = 1;
export const SCAN_LOG_MAX_BYTES = 900_000;
/** Vertices written per plane. */
export const LOGGED_VERTICES = 32;
/** Marks written (firestore.rules allows 300). */
export const LOGGED_MARKS = 300;

export interface DeviceInfo {
  platform: string;
  osVersion: string;
  /** Android only: the phone's brand and model. iPhones do not tell apps without expo-device. */
  deviceModel: string | null;
}

export interface ScanLogDetails {
  outcome: ScanOutcome;
  /** The saved room's id. */
  roomId?: string | null;
  /** The room as saved (or as last proposed). */
  room?: Room | null;
  /** Tape-measure correction applied on the review screen (1 = none). */
  scaleFactor?: number;
  /** Why the scan failed, in the words the app showed. */
  failure?: string | null;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const r = (n: number, places = 4): number | null => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
const r3 = (v: readonly number[], places = 4): (number | null)[] =>
  Array.from(v.slice(0, 3), (n) => r(n, places));

/** Builds the document (without `createdAt`, which the writer sets to the server time). */
export function buildScanLog(
  record: ScanRecord,
  ownerId: string,
  device: DeviceInfo,
  details: ScanLogDetails,
): { [key: string]: Json } {
  const { state, derived, startedAt } = record;
  const since = (t: number) => Math.max(0, Math.round(t - startedAt));
  const room = details.room ?? (derived.room?.ok ? derived.room.room : null);
  return {
    v: SCAN_LOG_VERSION,
    ownerId,
    startedAt,
    durationMs: since(record.endedAt),
    app: { version: release.version, build: release.build },
    platform: device.platform,
    osVersion: device.osVersion,
    deviceModel: device.deviceModel,
    outcome: details.outcome,
    roomId: details.roomId ?? null,
    failure: details.failure ?? null,
    scaleFactor: r(details.scaleFactor ?? 1, 5),
    options: {
      eulerOrder: state.options.eulerOrder,
      centerSpace: state.options.centerSpace,
      useDetectedWalls: state.options.useDetectedWalls,
    },
    step: derived.step,
    tracking: state.tracking
      ? { state: state.tracking.state, reason: state.tracking.reason }
      : null,
    lightIntensity: state.lightIntensity === null ? null : r(state.lightIntensity, 0),
    floor: state.floor
      ? {
          y: r(state.floor.y),
          planeId: state.floor.planeId,
          classification: state.floor.classification,
        }
      : null,
    floorStatus: derived.floorStatus,
    floorEvents: record.floorEvents.map((e) => ({
      t: e.t,
      y: e.floor ? r(e.floor.y) : null,
      planeId: e.floor?.planeId ?? null,
      classification: e.floor?.classification ?? null,
    })),
    marks: state.marks.slice(0, LOGGED_MARKS).map((m) => {
      const view = derived.marks.find((v) => v.id === m.id);
      return {
        id: m.id,
        role: m.role,
        edge: m.edge,
        t: since(m.at),
        origin: r3(m.ray.origin),
        direction: r3(m.ray.direction, 5),
        axis: m.axis,
        point: view?.point ? [r(view.point.x), r(view.point.z)] : null,
        y: view?.y === null || view?.y === undefined ? null : r(view.y),
        wall: view?.wall ?? null,
      };
    }),
    ceilingSkipped: state.ceilingSkipped,
    ceiling: derived.ceiling
      ? { height: r(derived.ceiling.height), source: derived.ceiling.source }
      : null,
    axesDeg: derived.axes ? r((axesAngle(derived.axes) * 180) / Math.PI, 3) : null,
    walls: (derived.grouped?.walls ?? []).map((w) => ({
      axis: w.axis,
      facing: w.facing,
      offset: r(w.offset),
      markIds: w.markIds,
      along: w.along.map((t) => r(t, 3)),
      offsets: w.offsets.map((t) => r(t)),
    })),
    droppedWalls: derived.dropped.map(({ wall, evidence }) => ({
      axis: wall.axis,
      facing: wall.facing,
      offset: r(wall.offset),
      markIds: wall.markIds,
      evidence,
    })),
    visitedCount: state.visited.length,
    result: derived.room
      ? derived.room.ok
        ? { closed: true, error: null, conflicting: [] }
        : { closed: false, error: derived.room.error, conflicting: derived.room.conflicting }
      : null,
    finishes: record.finishes.map((f) => ({ t: f.t, ok: f.ok, reason: f.reason })),
    refusedMarks: Object.fromEntries(
      Object.entries(record.refusedMarks).map(([k, n]) => [k, n ?? 0]),
    ),
    refusals: record.refusals.map((f) => ({
      t: f.t,
      error: f.error,
      origin: r3(f.origin),
      direction: r3(f.direction, 5),
    })),
    planeWalls: derived.planeWalls.map((c) => ({
      planeId: c.planeId,
      verdict: c.verdict,
      offAxisDeg: c.offAxisDeg === null ? null : r(c.offAxisDeg, 2),
      width: c.width === null ? null : r(c.width, 3),
    })),
    planes: record.planes.map(({ plane, removed, firstSeen, lastSeen, updates }) => {
      const v = plane.vertices;
      const count = v.length / 3;
      const step = Math.max(1, count / LOGGED_VERTICES);
      const vertices: (number | null)[] = [];
      for (let k = 0; k < count && vertices.length < LOGGED_VERTICES * 3; k += step) {
        const i = Math.floor(k) * 3;
        vertices.push(r(v[i]!, 3), r(v[i + 1]!, 3), r(v[i + 2]!, 3));
      }
      return {
        id: plane.id,
        alignment: plane.alignment,
        classification: plane.classification,
        position: r3(plane.anchor.position),
        rotation: r3(plane.anchor.rotationDeg, 3),
        center: r3(plane.anchor.center),
        width: r(plane.anchor.width, 3),
        height: r(plane.anchor.height, 3),
        vertices,
        vertexCount: count,
        removed,
        firstSeen: since(firstSeen),
        lastSeen: since(lastSeen),
        updates,
      };
    }),
    poseStride: POSE_STRIDE,
    poseFields: 't,px,py,pz,fx,fy,fz,ux,uy,uz',
    poses: record.poses.map((n) => r(n)),
    room: room
      ? {
          points: room.points.flatMap(([x, z]) => [r(x), r(z)]),
          ceilingHeight: r(room.ceilingHeight),
          wallCount: room.walls.length,
        }
      : null,
  };
}

/** About how many bytes Firestore will count for the document. */
export const scanLogSize = (doc: Json): number => JSON.stringify(doc).length;

/**
 * Trims a log that is too big: first the plane vertices, then every other camera sample, then
 * the planes Viro removed, then the oldest planes.
 */
export function capScanLog(
  doc: { [key: string]: Json },
  maxBytes = SCAN_LOG_MAX_BYTES,
): { [key: string]: Json } {
  let out = doc;
  const fits = () => scanLogSize(out) <= maxBytes;
  if (fits()) return out;
  const planes = (out.planes as { [key: string]: Json }[]) ?? [];
  out = { ...out, planes: planes.map((p) => ({ ...p, vertices: [] })), trimmed: true };
  while (!fits() && (out.poses as Json[]).length > POSE_STRIDE) {
    const poses = out.poses as Json[];
    const kept: Json[] = [];
    for (let k = 0; k < poses.length; k += 2 * POSE_STRIDE) {
      kept.push(...poses.slice(k, k + POSE_STRIDE));
    }
    out = { ...out, poses: kept };
  }
  if (!fits()) {
    out = {
      ...out,
      planes: (out.planes as { [key: string]: Json }[]).filter((p) => p.removed !== true),
    };
  }
  while (!fits() && (out.planes as Json[]).length > 0) {
    out = { ...out, planes: (out.planes as Json[]).slice(1) };
  }
  return out;
}

/** Writes one log per scan, whatever happens, at most once. */
export class ScanLogger {
  private written = false;
  private readonly write: (doc: { [key: string]: Json }) => void;
  private readonly ownerId: string;
  private readonly device: DeviceInfo;

  constructor(write: (doc: { [key: string]: Json }) => void, ownerId: string, device: DeviceInfo) {
    this.write = write;
    this.ownerId = ownerId;
    this.device = device;
  }

  get done(): boolean {
    return this.written;
  }

  finish(record: ScanRecord, details: ScanLogDetails): void {
    if (this.written) return;
    this.written = true;
    try {
      this.write(capScanLog(buildScanLog(record, this.ownerId, this.device, details)));
    } catch {
      // The log is for the team: it must never get in the user's way.
    }
  }
}
