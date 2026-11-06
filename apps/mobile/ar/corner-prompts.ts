/**
 * Plain words for the corners the AR line-up asks for: "Corner 1: the left end of the longest
 * wall", "Corner 2: the right end, 16′ 5″ along it". The small plan on screen shows the same two
 * corners, numbered 1 and 2, and where to stand; the words help find them in the real room.
 *
 * Corners are asked for as the user sees them standing in the room facing their wall: corner 1
 * is its left end, corner 2 its right end (`facingOrder`). A wall is told by what is on it (the
 * one with the door), and a corner by what is next to it: a door, an opening or a window on one
 * of its two walls, close to the corner. An inside corner (one that juts into the room, as in an
 * L-shaped room) says so. Taps in the other order still line up (core's
 * `lineUpFromRoomCorners`), so the words help, but nothing depends on them.
 */
import {
  formatLength,
  pointInRoom,
  signedArea,
  wallLength,
  type OpeningType,
  type Room,
  type UnitSystem,
  type Vec2,
} from '@youngvista/core';

/** A door, window or opening counts as "by" a corner when it is this close to it (m). */
export const NEAR_CORNER = 1.0;

export interface CornerInfo {
  index: number;
  /** The nearest door, opening or window by the corner (doors first), or null. */
  feature: OpeningType | null;
  /** The corner juts into the room (its inside angle is more than 180°). */
  inside: boolean;
}

/** Which kind of opening wins when several are by a corner: the easiest to recognise first. */
const FEATURE_ORDER: Record<OpeningType, number> = { door: 0, opening: 1, window: 2 };

/** What is by corner `index` of the room. */
export function cornerInfo(room: Room, index: number): CornerInfo {
  const n = room.points.length;
  let feature: OpeningType | null = null;
  let best = Infinity;
  const consider = (type: OpeningType, gap: number) => {
    if (gap > NEAR_CORNER) return;
    const rank = FEATURE_ORDER[type] * 10 + gap;
    if (rank < best) {
      best = rank;
      feature = type;
    }
  };
  room.walls.forEach((w, i) => {
    if (w.a !== index && w.b !== index) return;
    const length = wallLength(room, i);
    for (const o of w.openings) {
      // Distance from the corner to the nearer edge of the opening, along the wall.
      const gap = w.a === index ? o.offset : length - (o.offset + o.width);
      consider(o.type, Math.max(0, gap));
    }
  });
  const prev = room.points[(index - 1 + n) % n];
  const here = room.points[index];
  const next = room.points[(index + 1) % n];
  let inside = false;
  if (prev && here && next && n > 3) {
    const cross =
      (here[0] - prev[0]) * (next[1] - here[1]) - (here[1] - prev[1]) * (next[0] - here[0]);
    // An outline turns the same way at every outside corner and the other way at an inside
    // corner. `cross` is the turn in x-right, z-up terms, where core's counter-clockwise
    // (`signedArea` > 0, seen from above with +Z down the screen) has outside corners negative.
    const orientation = Math.sign(signedArea(room.points));
    inside = cross * orientation > 1e-9;
  }
  return { index, feature, inside };
}

const point = (room: Room, i: number): Vec2 | null => {
  const p = room.points[i];
  return p ? { x: p[0], z: p[1] } : null;
};

/**
 * Standing in the room facing the wall between corners `pair`: the direction from the room
 * toward the wall (`facing`, a unit vector in room space) and a spot in the room a little in
 * front of the wall's middle (`stand`). Null when the corners are not in the room.
 */
export function facingWall(
  room: Room,
  pair: readonly [number, number],
): { facing: Vec2; stand: Vec2; middle: Vec2 } | null {
  const a = point(room, pair[0]);
  const b = point(room, pair[1]);
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(len > 1e-9)) return null;
  const middle = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  // The two sides of the wall: the room is on the side where a point just off its middle is in it.
  const side = { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
  const probe = 0.05;
  const inward = pointInRoom(room, { x: middle.x + side.x * probe, z: middle.z + side.z * probe })
    ? side
    : { x: -side.x, z: -side.z };
  const depth = Math.min(1.2, len * 0.3);
  return {
    facing: { x: -inward.x, z: -inward.z },
    stand: { x: middle.x + inward.x * depth, z: middle.z + inward.z * depth },
    middle,
  };
}

/**
 * The two corners of a wall as [left end, right end], seen from inside the room facing the wall
 * (Y up: a person facing `f` has their right along f × up, which is (−f.z, f.x) on the floor).
 */
export function facingOrder(room: Room, pair: readonly [number, number]): [number, number] {
  const wall = facingWall(room, pair);
  const a = point(room, pair[0]);
  const b = point(room, pair[1]);
  if (!wall || !a || !b) return [pair[0], pair[1]];
  const right = { x: -wall.facing.z, z: wall.facing.x };
  const along = (b.x - a.x) * right.x + (b.z - a.z) * right.z;
  return along >= 0 ? [pair[0], pair[1]] : [pair[1], pair[0]];
}

const FEATURE_WORDS: Record<OpeningType, string> = {
  door: 'the door',
  opening: 'the opening',
  window: 'the window',
};

const PLURAL: Record<OpeningType, [string, string]> = {
  door: ['a door', 'doors'],
  opening: ['an opening', 'openings'],
  window: ['a window', 'windows'],
};

/** What is on the wall between the corners, in words ("a door and 2 windows"), or null. */
export function wallFeatures(room: Room, pair: readonly [number, number]): string | null {
  const wall = room.walls.find(
    (w) => (w.a === pair[0] && w.b === pair[1]) || (w.a === pair[1] && w.b === pair[0]),
  );
  if (!wall || !wall.openings.length) return null;
  const counts = new Map<OpeningType, number>();
  for (const o of wall.openings) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
  const parts = (['door', 'opening', 'window'] as const).flatMap((type) => {
    const n = counts.get(type) ?? 0;
    if (!n) return [];
    return [n === 1 ? PLURAL[type][0] : `${n} ${PLURAL[type][1]}`];
  });
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}

export interface CornerPrompt {
  /** Which corner, short: "Corner 1: the left end of the longest wall". */
  title: string;
  /** How to find it and what to do. */
  detail: string;
  /** Under the dot: "Corner 1". */
  label: string;
}

const HOW = 'Put the dot where the walls meet the floor, then tap Corner here.';

/**
 * The prompt for one corner of the pair `corners` (two ends of one wall, as [left, right] from
 * `facingOrder`): `step` 0 asks for the first, 1 for the second. `longest` says the wall is the
 * room's longest (the default pair).
 */
export function cornerPrompt(
  room: Room,
  corners: readonly [number, number],
  step: 0 | 1,
  units: UnitSystem,
  longest = true,
): CornerPrompt {
  const index = corners[step];
  const info = cornerInfo(room, index);
  const a = room.points[corners[0]];
  const b = room.points[corners[1]];
  const span = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
  const wall = longest ? 'the longest wall' : `the ${formatLength(span, units)} wall`;
  const features = wallFeatures(room, corners);
  const label = `Corner ${step + 1}`;
  const by = info.feature ? `, by ${FEATURE_WORDS[info.feature]}` : '';
  const inside = info.inside && !info.feature ? ' (the corner that juts into the room)' : '';
  if (step === 0) {
    return {
      title: `Corner 1: the left end of ${wall}${by}`,
      detail: `Stand in the room facing ${wall}${features ? ` (the one with ${features})` : ''}. Its left end${inside} is corner 1 on the plan. ${HOW}`,
      label,
    };
  }
  return {
    title: `Corner 2: the right end of that wall${by}`,
    detail: `Follow the same wall to its other end${inside}, ${formatLength(span, units)} from corner 1. ${HOW}`,
    label,
  };
}
