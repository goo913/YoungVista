/**
 * From the server's fit to the saved room (packages/core/src/turn-scan.ts):
 *
 * - `placeFittedOpenings`: the doors and windows the server found, on the walls of the room the
 *   session built. Each opening belongs to one of the server's walls (by a mark id); it goes on the
 *   room's wall along the same line (moved a little if the user marked that wall by hand), at the
 *   same place along it.
 * - `tourInRoom`: the server's 360° panoramas as the room's tour (`rooms/{id}.tour`), in room
 *   coordinates. A scanned room's corners are the scan's world XZ (ar/pose.ts: the solver puts
 *   them back in world coordinates and nothing recentres them), so a spot keeps its x, z and
 *   heading; its y is measured from the floor. The review's tape correction (core's `scaleRoom`)
 *   scales the outline about its middle, so spots are scaled about the same middle.
 *
 * Plain TypeScript (test/turn-fit.test.ts).
 */
import {
  MIN_OPENING_SIZE,
  bounds,
  fitOpenings,
  fittedFacing,
  newOpeningId,
  pointInRoom,
  roomAxes,
  wallDirection,
  wallEndpoints,
  wallNormal,
  type FittedMark,
  type FittedOpening,
  type Room,
  type RoomTour,
  type TourSpot,
} from '@youngvista/core';
import { wrap180 } from './plan';

/** Doors and windows the server is less sure of than this are left out (the editor adds them). */
export const MIN_OPENING_CONFIDENCE = 0.3;
/** The room's wall may be this far from the server's wall line (m): a hand mark may move it. */
const OPENING_WALL_DISTANCE = 1.5;
/** ...and this close to parallel with it (degrees). */
const PARALLEL_DEG = 5;
/** How far into the room the side check looks (m). */
const INSIDE_STEP = 0.05;

const DEG = Math.PI / 180;

export interface OpeningsResult {
  room: Room;
  /** Openings now on the room's walls. */
  placed: number;
  /** Openings left out (unsure, no wall for them, or too small once fitted). */
  skipped: number;
}

/** The server's doors and windows on the room's walls (see the header). */
export function placeFittedOpenings(
  room: Room,
  fit: { axesAngle: number; marks: readonly FittedMark[]; openings: readonly FittedOpening[] },
): OpeningsResult {
  const axes = roomAxes(fit.axesAngle);
  const next: Room = {
    ...room,
    walls: room.walls.map((w) => ({ ...w, openings: [...w.openings] })),
  };
  const before = room.walls.reduce((n, w) => n + w.openings.length, 0);
  for (const o of fit.openings) {
    const mark = fit.marks.find((m) => m.id === o.markId);
    if (o.confidence < MIN_OPENING_CONFIDENCE || !mark) continue;
    const t = wallDirection(axes, mark.axis);
    const n = wallNormal(axes, mark.axis);
    const facing = fittedFacing(axes, mark);
    const line = mark.point.x * n.x + mark.point.z * n.z;
    const lo = Math.min(o.from, o.to);
    const hi = Math.max(o.from, o.to);
    // The room's wall for it: parallel, near the server's line, reaching over the opening, with
    // the room on the side the server's wall faces; the nearest such.
    let best = -1;
    let bestGap = Infinity;
    for (let k = 0; k < next.walls.length; k++) {
      const { a, b } = wallEndpoints(next, next.walls[k]!);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < MIN_OPENING_SIZE) continue;
      const along = ((b.x - a.x) * t.x + (b.z - a.z) * t.z) / length;
      if (Math.abs(along) < Math.cos(PARALLEL_DEG * DEG)) continue;
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const gap = Math.abs(mid.x * n.x + mid.z * n.z - line);
      if (gap > OPENING_WALL_DISTANCE || gap >= bestGap) continue;
      const ta = a.x * t.x + a.z * t.z;
      const tb = b.x * t.x + b.z * t.z;
      const overlap = Math.min(Math.max(ta, tb), hi) - Math.max(Math.min(ta, tb), lo);
      if (overlap < MIN_OPENING_SIZE) continue;
      const inside = {
        x: mid.x + facing * n.x * INSIDE_STEP,
        z: mid.z + facing * n.z * INSIDE_STEP,
      };
      if (!pointInRoom(next, inside)) continue;
      best = k;
      bestGap = gap;
    }
    if (best < 0) continue;
    const wall = next.walls[best]!;
    const { a, b } = wallEndpoints(next, wall);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const ta = a.x * t.x + a.z * t.z;
    const sign = b.x * t.x + b.z * t.z >= ta ? 1 : -1;
    const s1 = (lo - ta) * sign;
    const s2 = (hi - ta) * sign;
    const start = Math.max(0, Math.min(length, Math.min(s1, s2)));
    const end = Math.max(0, Math.min(length, Math.max(s1, s2)));
    const window = o.kind === 'window';
    const sill = window ? Math.max(0, o.bottom) : 0;
    const height = window ? o.top - o.bottom : o.top;
    if (end - start < MIN_OPENING_SIZE || !(height >= MIN_OPENING_SIZE)) continue;
    wall.openings.push({
      id: newOpeningId(next, o.kind),
      type: o.kind,
      offset: start,
      width: end - start,
      height,
      sill,
    });
  }
  // Tops down to the ceiling, overlaps pushed apart, what still does not fit taken out.
  const fitted = fitOpenings(next).room;
  const placed = fitted.walls.reduce((n, w) => n + w.openings.length, 0) - before;
  return { room: fitted, placed, skipped: fit.openings.length - placed };
}

const round = (n: number, places = 3): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * The scan id of a saved room's tour (`rooms/{id}.tour.scanId`), when it is a usable one: what
 * deleting the room needs to delete the scan's folder (lib/room-delete.ts).
 */
export function tourScanId(tour: unknown): string | null {
  const id = tour && typeof tour === 'object' ? (tour as { scanId?: unknown }).scanId : undefined;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/**
 * The room's tour from the server's spots (see the header): `room` is the room as built from the
 * scan, before the review's tape correction, and `scaleFactor` that correction (1 for none).
 */
export function tourInRoom(input: {
  scanId: string;
  spots: readonly TourSpot[];
  floorY: number;
  room: Room;
  scaleFactor: number;
}): RoomTour {
  const b = bounds(input.room.points);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const f = input.scaleFactor > 0 && Number.isFinite(input.scaleFactor) ? input.scaleFactor : 1;
  return {
    scanId: input.scanId,
    spots: input.spots.map((s) => ({
      spot: s.spot,
      storagePath: s.storagePath,
      width: s.width,
      height: s.height,
      position: [
        round(cx + (s.position[0] - cx) * f),
        round(s.position[1] - input.floorY),
        round(cz + (s.position[2] - cz) * f),
      ],
      yawDeg: round(wrap180(s.yawDeg), 2),
    })),
  };
}
