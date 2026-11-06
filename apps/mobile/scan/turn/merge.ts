/**
 * The server's walls in the scan session (turn-around scan, packages/core/src/turn-scan.ts).
 *
 * The fit comes back as marks, so the session builds the room from them exactly as from taps
 * (core's `groupWallMarks` and `solveRectilinearRoom`), in the same AR world. Walls the server is
 * unsure of are offered for a mark by hand: the usual bottom-edge or top-edge mark, in the same
 * session. A hand mark takes the place of the server's wall it lands on, so the user's mark wins,
 * as it does in the marked scan; a hand mark on no server wall adds a wall (one the server missed).
 * Plain TypeScript (test/turn-fit.test.ts).
 */
import {
  LOW_CONFIDENCE,
  fitMarks,
  groupWallMarks,
  roomAxes,
  solveRectilinearRoom,
  wallDirection,
  wallEndpoints,
  wallNormal,
  type GroupedWalls,
  type ScanFitDoc,
  type WallAxis,
  type WallFacing,
  type WallMarkInput,
} from '@youngvista/core';
import { CEILING_MAX, CEILING_MIN } from '@/lib/length-input';

/** The server's marks go into the session with this in front of their ids (hand marks: 'm1'...). */
export const FIT_ID = 'fit:';
export const isFitMark = (id: string): boolean => id.startsWith(FIT_ID);

/** A wall the server fitted. */
export interface FitWall {
  /** Its marks' session ids. */
  markIds: string[];
  axis: WallAxis;
  facing: WallFacing;
  /** Its line, `p · normal = offset`, in the fit's axes (m). */
  offset: number;
  /** Where along its line it runs, in the fit's axes (m). */
  from: number;
  to: number;
  /** The server's confidence: the most of its marks'. */
  confidence: number;
}

/** The fit as the scan session holds it (session.ts `ScanState.fit`). */
export interface FitSeed {
  /** The room's axes (radians, core's `axesAngle`): marks' axes refer to these. */
  axesAngle: number;
  /** The fitted walls as marks (core's `fitMarks`): `fit:` ids, confidence as weight. */
  marks: WallMarkInput[];
  walls: FitWall[];
  /** Metres above the floor; null when the server found no ceiling (or an impossible one). */
  ceilingHeight: number | null;
}

/** A server wall with no room around it yet is taken to run this far past its marks (m). */
const OPEN_EXTENT = 0.5;

/** The session's seed from a finished fit (`scanFits/{scanId}.result`). */
export function fitSeedFrom(result: NonNullable<ScanFitDoc['result']>): FitSeed {
  const { axes, marks: raw } = fitMarks(result);
  const marks = raw.map((m) => ({ ...m, id: FIT_ID + m.id }));
  const confidence = new Map(result.marks.map((m) => [FIT_ID + m.id, m.confidence]));
  const grouped = groupWallMarks(marks, axes, { refine: false });
  // Where each wall runs: between its corners when the server's walls close a room by themselves.
  const solved = solveRectilinearRoom(grouped.walls, axes);
  const walls = grouped.walls.map((w, i): FitWall => {
    let from = Math.min(...w.along) - OPEN_EXTENT;
    let to = Math.max(...w.along) + OPEN_EXTENT;
    if (solved.ok) {
      const t = wallDirection(axes, w.axis);
      solved.room.walls.forEach((roomWall, k) => {
        if (solved.wallSource[k] !== i) return;
        const { a, b } = wallEndpoints(solved.room, roomWall);
        for (const p of [a, b]) {
          const s = p.x * t.x + p.z * t.z;
          from = Math.min(from, s);
          to = Math.max(to, s);
        }
      });
    }
    return {
      markIds: w.markIds,
      axis: w.axis,
      facing: w.facing,
      offset: w.offset,
      from,
      to,
      confidence: Math.max(...w.markIds.map((id) => confidence.get(id) ?? 0)),
    };
  });
  const h = result.ceilingHeight;
  return {
    axesAngle: result.axesAngle,
    marks,
    walls,
    ceilingHeight: h !== null && h >= CEILING_MIN && h <= CEILING_MAX ? h : null,
  };
}

/** A hand mark takes the place of a server wall on the same side within this distance (m)... */
export const REPLACE_DISTANCE = 1.5;
/** ...when it lands between that wall's ends, give or take this much (m). */
const REPLACE_ALONG = 0.3;

/**
 * The marks the session groups into walls: the server's, without those of any wall the user
 * marked by hand, then the user's own. A hand mark is on a server wall when it has the same axis,
 * faces the same way, lies within REPLACE_DISTANCE of the wall's line and between its ends (the
 * nearest such wall). `replaced`: indices into `seed.walls`.
 */
export function mergeFitMarks(
  seed: FitSeed,
  hand: readonly WallMarkInput[],
): { marks: WallMarkInput[]; replaced: number[] } {
  const axes = roomAxes(seed.axesAngle);
  const replaced = new Set<number>();
  for (const m of hand) {
    const n = wallNormal(axes, m.axis);
    const t = wallDirection(axes, m.axis);
    const offset = m.point.x * n.x + m.point.z * n.z;
    const along = m.point.x * t.x + m.point.z * t.z;
    // As core's `groupWallMarks` decides it: the room is on the camera's side.
    const facing: WallFacing =
      (m.camera.x - m.point.x) * n.x + (m.camera.z - m.point.z) * n.z >= 0 ? 1 : -1;
    let best = -1;
    let nearest = REPLACE_DISTANCE;
    seed.walls.forEach((w, i) => {
      if (w.axis !== m.axis || w.facing !== facing) return;
      if (along < w.from - REPLACE_ALONG || along > w.to + REPLACE_ALONG) return;
      const gap = Math.abs(w.offset - offset);
      if (gap <= nearest) {
        best = i;
        nearest = gap;
      }
    });
    if (best >= 0) replaced.add(best);
  }
  const gone = new Set([...replaced].flatMap((i) => seed.walls[i]!.markIds));
  return {
    marks: [...seed.marks.filter((m) => !gone.has(m.id)), ...hand],
    replaced: [...replaced].sort((a, b) => a - b),
  };
}

export type WallSource =
  | { kind: 'hand' }
  | {
      kind: 'fit';
      /** The server's confidence in it (0 to 1). */
      confidence: number;
      /** Shown as unsure and offered for a mark by hand. */
      unsure: boolean;
    };

/** For each wall of the session: from a mark by hand, or only from the server, and how sure. */
export function wallSources(grouped: GroupedWalls, seed: FitSeed): WallSource[] {
  const weight = new Map(seed.marks.map((m) => [m.id, m.weight ?? 1]));
  return grouped.walls.map((w): WallSource => {
    if (w.markIds.some((id) => !isFitMark(id))) return { kind: 'hand' };
    const confidence = Math.max(...w.markIds.map((id) => weight.get(id) ?? 0));
    return { kind: 'fit', confidence, unsure: confidence < LOW_CONFIDENCE };
  });
}
