/**
 * Finding the floor among ViroReact's level planes, and keeping it.
 *
 * - Planes classified 'Table', 'Seat' or 'Ceiling' are never the floor; neither are planes that
 *   face down.
 * - A plane classified 'Floor' is preferred (any height that is below the phone).
 * - Otherwise the floor is the lowest large level plane at a height that fits a phone held by
 *   someone standing: 0.9 to 2.2 m below the camera. A bed (about 0.55 m high) or a desk is less
 *   than that below a phone held at chest height, so it is "furniture", not the floor.
 * - Once found, the floor stays: it follows its plane as ARKit refines it, moves to the plane at
 *   the same height when ARKit merges planes, keeps its height if its plane goes away, and only
 *   gives way to a plane at least 8 cm lower (the lowest plane wins) or to one classified 'Floor'.
 */
import { planeArea, planeHeight } from './planes';
import type { TrackedPlane } from './viro-anchor';

export interface FloorState {
  /** World height of the floor (m). */
  y: number;
  /** The plane it comes from; null once that plane went away (the height is kept). */
  planeId: string | null;
  classification: string | null;
}

/** 'too-high': no floor, but a level plane too high to be one (a bed, a desk). */
export type FloorStatus = 'found' | 'searching' | 'too-high';

/** How far below the camera an unclassified floor can be (m). */
export const FLOOR_MIN_DROP = 0.9;
export const FLOOR_MAX_DROP = 2.2;
/** The same for a plane classified 'Floor'. */
const CLASSIFIED_MIN_DROP = 0.3;
const CLASSIFIED_MAX_DROP = 2.6;
/** Smallest unclassified plane taken for the floor (m²). */
export const FLOOR_MIN_AREA = 0.25;
/** A candidate at least this much lower replaces the floor (m). */
export const FLOOR_SWITCH_DROP = 0.08;
/** After a merge, the floor moves to a plane within this height (m). */
const SAME_HEIGHT = 0.05;
/** Level planes this big or bigger (m²) count when telling "too high" from "searching". */
const NOTICE_AREA = 0.1;

const NEVER_FLOOR: ReadonlySet<string> = new Set(['Table', 'Seat', 'Ceiling']);

const isLevelUp = (p: TrackedPlane): boolean =>
  p.alignment === 'Horizontal' || p.alignment === 'HorizontalUpward';
const excluded = (p: TrackedPlane): boolean =>
  !isLevelUp(p) || (p.classification !== null && NEVER_FLOOR.has(p.classification));
const isFloorClass = (p: TrackedPlane): boolean => p.classification === 'Floor';

/** Could this plane be the floor, seen from a camera at height `cameraY`? */
export function isFloorCandidate(p: TrackedPlane, cameraY: number): boolean {
  if (excluded(p)) return false;
  const drop = cameraY - planeHeight(p);
  if (!Number.isFinite(drop)) return false;
  if (isFloorClass(p)) return drop >= CLASSIFIED_MIN_DROP && drop <= CLASSIFIED_MAX_DROP;
  return planeArea(p) >= FLOOR_MIN_AREA && drop >= FLOOR_MIN_DROP && drop <= FLOOR_MAX_DROP;
}

/** The best floor among the planes: the lowest 'Floor' plane, else the lowest candidate. */
export function bestFloorPlane(
  planes: readonly TrackedPlane[],
  cameraY: number | null,
): TrackedPlane | null {
  if (cameraY === null || !Number.isFinite(cameraY)) return null;
  const candidates = planes.filter((p) => isFloorCandidate(p, cameraY));
  const floors = candidates.filter(isFloorClass);
  const pool = floors.length > 0 ? floors : candidates;
  let best: TrackedPlane | null = null;
  for (const p of pool) if (!best || planeHeight(p) < planeHeight(best)) best = p;
  return best;
}

const toFloor = (p: TrackedPlane): FloorState => ({
  y: planeHeight(p),
  planeId: p.id,
  classification: p.classification,
});

const same = (a: FloorState, b: FloorState) =>
  a.y === b.y && a.planeId === b.planeId && a.classification === b.classification;

/**
 * The floor after a change in the planes or the camera, from the floor before (see the header).
 * Returns `prev` itself when nothing changed.
 */
export function nextFloor(
  prev: FloorState | null,
  planesById: Readonly<Record<string, TrackedPlane>>,
  cameraY: number | null,
): FloorState | null {
  const planes = Object.values(planesById);
  let current = prev;
  if (current?.planeId) {
    const own = planesById[current.planeId];
    if (own && !excluded(own)) {
      current = toFloor(own);
    } else if (own) {
      current = null; // now known to be furniture or a ceiling: look again
    } else {
      // Gone: ARKit merged it into another plane. Carry on with one at the same height.
      const y = current.y;
      const match = planes
        .filter((p) => !excluded(p) && Math.abs(planeHeight(p) - y) <= SAME_HEIGHT)
        .sort((p, q) => Math.abs(planeHeight(p) - y) - Math.abs(planeHeight(q) - y))[0];
      current = match ? toFloor(match) : { ...current, planeId: null };
    }
  }
  const best = bestFloorPlane(planes, cameraY);
  let next = current;
  if (!current) {
    next = best ? toFloor(best) : null;
  } else if (best && best.id !== current.planeId) {
    const y = planeHeight(best);
    const currentIsFloor = current.classification === 'Floor';
    const lower = y < current.y - FLOOR_SWITCH_DROP && (isFloorClass(best) || !currentIsFloor);
    const classified = isFloorClass(best) && !currentIsFloor && y <= current.y + SAME_HEIGHT;
    if (lower || classified) next = toFloor(best);
  }
  if (prev && next && same(prev, next)) return prev;
  return next;
}

/** What to tell the user about the floor. */
export function floorStatus(
  floor: FloorState | null,
  planesById: Readonly<Record<string, TrackedPlane>>,
  cameraY: number | null,
): FloorStatus {
  if (floor) return 'found';
  if (cameraY === null) return 'searching';
  const tooHigh = Object.values(planesById).some((p) => {
    if (!isLevelUp(p) || p.classification === 'Ceiling' || planeArea(p) < NOTICE_AREA) return false;
    if (p.classification === 'Table' || p.classification === 'Seat') return true;
    const drop = cameraY - planeHeight(p);
    return drop > 0.1 && drop < FLOOR_MIN_DROP;
  });
  return tooHigh ? 'too-high' : 'searching';
}
