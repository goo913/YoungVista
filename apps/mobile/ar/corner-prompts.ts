/**
 * Plain words for the corners the AR line-up asks for: "Aim at the corner by the door", "Now the
 * other end of that wall, 12′ 3″ along it". The small plan on screen shows the same two corners,
 * numbered 1 and 2; the words help find them in the real room.
 *
 * A corner is described by what is next to it: a door, an opening or a window on one of its two
 * walls, close to the corner. Otherwise an inside corner (one that juts into the room, as in an
 * L-shaped room) says so; any other corner is told by its wall.
 */
import {
  formatLength,
  signedArea,
  wallLength,
  type OpeningType,
  type Room,
  type UnitSystem,
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

const FEATURE_WORDS: Record<OpeningType, string> = {
  door: 'the door',
  opening: 'the opening',
  window: 'the window',
};

export interface CornerPrompt {
  /** What to do, short: "Aim at the corner by the door". */
  title: string;
  /** How to find it and what to do. */
  detail: string;
  /** Under the dot: "Corner 1". */
  label: string;
}

const HOW = 'Put the dot where the walls meet the floor, then tap Corner here.';

/**
 * The prompt for one corner of the pair `corners` (two ends of one wall): `step` 0 asks for the
 * first, 1 for the second. `longest` says the wall is the room's longest (the default pair).
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
  const label = `Corner ${step + 1}`;
  if (step === 0) {
    const title = info.feature
      ? `Aim at the corner by ${FEATURE_WORDS[info.feature]}`
      : info.inside
        ? 'Aim at the inside corner'
        : 'Aim at corner 1';
    const where = info.inside && !info.feature ? 'the corner that juts into the room, ' : '';
    return {
      title,
      detail: `It is corner 1 on the plan: ${where}one end of ${wall}. ${HOW}`,
      label,
    };
  }
  const title = info.feature
    ? `Now the corner by ${FEATURE_WORDS[info.feature]}`
    : 'Now the other end of that wall';
  return {
    title,
    detail: `Corner 2 on the plan, ${formatLength(span, units)} along the same wall from corner 1. ${HOW}`,
    label,
  };
}
