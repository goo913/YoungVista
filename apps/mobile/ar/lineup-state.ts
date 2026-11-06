/**
 * Lining up a saved room with the real one in AR. It never blocks: the furniture always shows.
 *
 * - From two corners: the user aims the dot at the two ends of one wall (shown on a small plan:
 *   corner 1 is the left end seen facing the wall, corner 2 the right end) and taps "Corner here"
 *   at each. Any two taps at least `MIN_TAP_SPACING` apart are taken, in either order (core's
 *   `lineUpFromRoomCorners` tells from where the phone was). A scan is only about 90% right, so
 *   the taps rarely match the plan exactly: the fit spreads the difference over both corners and
 *   the message says it ("the saved room is about 30 cm shorter here"), never "try again".
 * - By hand: "Place by hand" puts the room's middle where the dot is, its wall facing the way the
 *   phone looks, with no corners at all.
 * - Right after a scan, in the same AR session: lined up already (`lineUpFromScan`, see pose.ts).
 *
 * Any line-up can then be moved by hand (`moveRoom`: one finger drags the room along the floor,
 * two fingers turn it, see room-mover.ts). Corner taps are kept as camera rays, as the scan keeps
 * its marks, so a line-up from corners follows the floor if the phone finds it a little higher or
 * lower later; one moved by hand keeps its place and only follows the floor's height.
 *
 * Plain data and pure functions; the AR screen holds one state.
 */
import {
  hitLevelPlane,
  LINE_UP_MIN_SPACING,
  lineUpAt,
  lineUpCorners,
  lineUpFromCorners,
  lineUpFromRoomCorners,
  roomCenter,
  wallLength,
  formatLength,
  METERS_PER_INCH,
  type CameraRay,
  type LineUp,
  type LineUpQuality,
  type LineUpResult,
  type Room,
  type UnitSystem,
  type Vec2,
} from '@youngvista/core';
import type { Message } from '@/scan/coaching';
import { cornerPrompt, facingOrder, facingWall } from './corner-prompts';
import { onFloor, scanLineUp } from './pose';

/** A corner tap: the camera ray through the dot when Corner here was tapped (world). */
export type CornerTap = CameraRay;

/** The room is lined up. */
export interface LinedUp {
  /** From two corner taps, from the scan in the same AR session, or placed by hand. */
  source: 'corners' | 'scan' | 'hand';
  /** The two taps, in the order tapped (corners only). */
  taps: readonly [CornerTap, CornerTap] | null;
  /** The corners the taps were for, in the order tapped (indices into `room.points`). */
  corners: readonly [number, number] | null;
  /** The line-up as of the taps, as placed by hand, or as moved by hand. */
  lineUp: LineUp;
  /** How far off the corners are (m): the taps' residual, or the scan's estimate. */
  offset: number;
  quality: LineUpQuality;
  /** The match, when lined up from corners. */
  result: LineUpResult | null;
  /** The corners were tapped the other way round from how they were asked for (that is fine). */
  swapped: boolean;
  /** Moved or turned by hand since: `lineUp` is used as it is, and only follows the floor. */
  adjusted: boolean;
}

export type LineUpPhase =
  /** Aiming at the corners: no tap yet, or the first one done. */
  | { kind: 'aiming'; taps: readonly CornerTap[] }
  /** The two taps could not be used (rare: the dot was off the floor): ask again. */
  | { kind: 'poor'; result: LineUpResult | null }
  | { kind: 'done'; done: LinedUp };

export interface LineUpState {
  /** Pairs of corners that can be used, the ends of each wall as [left, right], longest first. */
  pairs: readonly (readonly [number, number])[];
  /** Which pair is asked for. */
  pair: number;
  phase: LineUpPhase;
  /** The line-up before "Line up again": Cancel goes back to it. */
  previous: LinedUp | null;
}

/** Corner taps further than this from the phone, along the floor, are too far to be accurate (m). */
export const MAX_CORNER_DISTANCE = 6;
/** A tap closer than this to the phone is the floor under it, not a corner (m). */
export const UNDER_PHONE = 0.25;
/** The second tap must be at least this far from the first (m): any two taps this apart count. */
export const MIN_TAP_SPACING = LINE_UP_MIN_SPACING;
/** Placing by hand with the dot off the floor: the room's middle goes this far ahead (m). */
export const PLACE_AHEAD = 2;

export type CornerTapError = 'no-floor' | 'aim-lower' | 'too-far' | 'under-phone' | 'same-corner';

export const TAP_ERRORS: Record<CornerTapError, string> = {
  'no-floor': 'Find the floor first: point the phone at the floor and move it slowly.',
  'aim-lower': 'Aim the dot lower, at the corner where the walls meet the floor.',
  'too-far': 'That corner is too far away. Walk closer to it and try again.',
  'under-phone': 'Aim at the corner, not at the floor under the phone.',
  'same-corner': 'That is too close to corner 1. Aim at corner 2, at the other end of the wall.',
};

/**
 * The pairs of corners to offer, each as [left end, right end] seen facing its wall: the ends of
 * the longest wall (core's `lineUpCorners`) first, then the ends of every other wall at least
 * `MIN_TAP_SPACING` long, longest first.
 */
export function cornerPairs(room: Room): [number, number][] {
  const first = lineUpCorners(room);
  if (!first) return [];
  const same = (p: readonly [number, number], q: readonly [number, number]) =>
    (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]);
  return room.walls
    .map((w, i) => ({ pair: [w.a, w.b] as [number, number], length: wallLength(room, i) }))
    .filter((p) => p.length >= MIN_TAP_SPACING)
    .sort(
      (p, q) => Number(same(q.pair, first)) - Number(same(p.pair, first)) || q.length - p.length,
    )
    .map((p) => facingOrder(room, p.pair));
}

/** Starts lining up `room` from its corners, or null when it has no usable wall. */
export function createLineUp(room: Room): LineUpState | null {
  const pairs = cornerPairs(room);
  if (!pairs.length) return null;
  return { pairs, pair: 0, phase: { kind: 'aiming', taps: [] }, previous: null };
}

/**
 * Right after a scan, in the same AR session: lined up already, `offset` metres off at most
 * (see `scanLineUpOffset`). The floor height comes in with `activeLineUp`.
 */
export function lineUpFromScan(room: Room, offset: number): LineUpState {
  const pairs = cornerPairs(room);
  const done: LinedUp = {
    source: 'scan',
    taps: null,
    corners: null,
    lineUp: scanLineUp(0),
    offset,
    quality: offset <= 0.03 ? 'good' : offset <= 0.08 ? 'fair' : 'rough',
    result: null,
    swapped: false,
    adjusted: false,
  };
  return { pairs, pair: 0, phase: { kind: 'done', done }, previous: null };
}

/** The two corners asked for now, as [left end, right end]. */
export const currentPair = (state: LineUpState): readonly [number, number] =>
  state.pairs[state.pair] ?? state.pairs[0]!;

/** Which corner is being aimed at (0 or 1), or null when not aiming. */
export function aimedStep(state: LineUpState): 0 | 1 | null {
  return state.phase.kind === 'aiming' ? (state.phase.taps.length === 0 ? 0 : 1) : null;
}

/** Where a tap's ray meets the floor at `floorY`, or why it does not count. */
function tapPoint(
  tap: CornerTap,
  floorY: number,
): { ok: true; point: Vec2 } | { ok: false; error: CornerTapError } {
  const hit = hitLevelPlane(tap, floorY, MAX_CORNER_DISTANCE);
  if (!hit.ok) return { ok: false, error: hit.reason === 'too-far' ? 'too-far' : 'aim-lower' };
  if (hit.distance < UNDER_PHONE) return { ok: false, error: 'under-phone' };
  return { ok: true, point: hit.point };
}

/** The two taps on the floor at `floorY`, or null when either no longer reaches it. */
function tapPoints(taps: readonly CornerTap[], floorY: number): Vec2[] | null {
  const points: Vec2[] = [];
  for (const t of taps) {
    const p = tapPoint(t, floorY);
    if (!p.ok) return null;
    points.push(p.point);
  }
  return points;
}

/** Where the phone was for a tap, on the floor (world). */
const phoneAt = (tap: CornerTap): Vec2 => ({ x: tap.origin[0], z: tap.origin[2] });

/**
 * The line-up from two taps of the corners asked for, in either order (the phone's spots decide,
 * see core's `lineUpFromRoomCorners`), with the floor at `floorY`.
 */
function match(
  room: Room,
  corners: readonly [number, number],
  taps: readonly [CornerTap, CornerTap],
  floorY: number,
) {
  const points = tapPoints(taps, floorY);
  if (!points) return null;
  return lineUpFromRoomCorners(room, corners, [points[0]!, points[1]!], {
    floorY,
    from: taps.map(phoneAt),
  });
}

/** The same two taps fitted again, on the floor as it is now, in the order already decided. */
function refit(
  room: Room,
  corners: readonly [number, number],
  taps: readonly [CornerTap, CornerTap],
  floorY: number,
): LineUpResult | null {
  const points = tapPoints(taps, floorY);
  const a = room.points[corners[0]];
  const b = room.points[corners[1]];
  if (!points || !a || !b) return null;
  return lineUpFromCorners([a, b], [points[0]!, points[1]!], { floorY });
}

export type TapOutcome =
  | { kind: 'next' }
  | { kind: 'done'; done: LinedUp }
  | { kind: 'poor'; result: LineUpResult | null }
  | { kind: 'refused'; error: CornerTapError; message: string };

/** "Corner here": the dot's ray at the corner being asked for. */
export function tapCorner(
  state: LineUpState,
  room: Room,
  tap: CornerTap,
  floorY: number | null,
): { state: LineUpState; outcome: TapOutcome } {
  const refuse = (error: CornerTapError) => ({
    state,
    outcome: { kind: 'refused' as const, error, message: TAP_ERRORS[error] },
  });
  if (state.phase.kind !== 'aiming') return refuse('no-floor');
  if (floorY === null) return refuse('no-floor');
  const here = tapPoint(tap, floorY);
  if (!here.ok) return refuse(here.error);
  const taps = state.phase.taps;
  if (taps.length === 0) {
    return {
      state: { ...state, phase: { kind: 'aiming', taps: [tap] } },
      outcome: { kind: 'next' },
    };
  }
  const first = tapPoint(taps[0]!, floorY);
  if (
    first.ok &&
    Math.hypot(here.point.x - first.point.x, here.point.z - first.point.z) < MIN_TAP_SPACING
  ) {
    return refuse('same-corner');
  }
  const asked = currentPair(state);
  const both: [CornerTap, CornerTap] = [taps[0]!, tap];
  const result = match(room, asked, both, floorY);
  if (!result || result.quality === 'poor') {
    return {
      state: { ...state, phase: { kind: 'poor', result } },
      outcome: { kind: 'poor', result },
    };
  }
  const { swapped, ...fit } = result;
  const done: LinedUp = {
    source: 'corners',
    taps: both,
    corners: swapped ? [asked[1], asked[0]] : asked,
    lineUp: { rotationY: fit.rotationY, x: fit.x, y: fit.y, z: fit.z },
    offset: fit.residual,
    quality: fit.quality,
    result: fit,
    swapped,
    adjusted: false,
  };
  return {
    state: { ...state, phase: { kind: 'done', done }, previous: null },
    outcome: { kind: 'done', done },
  };
}

/** Where the dot is for "Place by hand": a floor point, the phone, and the floor's height. */
export interface HandPlacement {
  /** Where the dot meets the floor (world), or null when it does not. */
  at: Vec2 | null;
  /** The camera's spot over the floor (world). */
  phone: Vec2;
  /** The way the camera looks, along the floor (world); used when the dot is off the floor. */
  ahead: Vec2;
  floorY: number;
}

/**
 * "Place by hand": the room's middle where the dot is (else `PLACE_AHEAD` in front of the
 * phone), turned so the wall asked for faces the way the phone looks (the prompt asks the user
 * to face it). The user then drags and turns it into place. Null without a usable direction.
 */
export function placeByHand(
  state: LineUpState,
  room: Room,
  input: HandPlacement,
): LineUpState | null {
  const len = Math.hypot(input.ahead.x, input.ahead.z);
  const forward = len > 1e-6 ? { x: input.ahead.x / len, z: input.ahead.z / len } : null;
  const at =
    input.at ??
    (forward
      ? { x: input.phone.x + forward.x * PLACE_AHEAD, z: input.phone.z + forward.z * PLACE_AHEAD }
      : null);
  if (!at) return null;
  const toward = { x: at.x - input.phone.x, z: at.z - input.phone.z };
  const direction = Math.hypot(toward.x, toward.z) > 0.05 ? toward : forward;
  const wall = facingWall(room, currentPair(state));
  if (!direction || !wall) return null;
  const lineUp = lineUpAt(
    { point: roomCenter(room), direction: wall.facing },
    { point: at, direction },
    input.floorY,
  );
  if (!lineUp) return null;
  const done: LinedUp = {
    source: 'hand',
    taps: null,
    corners: null,
    lineUp,
    offset: 0,
    quality: 'rough',
    result: null,
    swapped: false,
    adjusted: true,
  };
  const previous = state.phase.kind === 'done' ? state.phase.done : state.previous;
  return { ...state, phase: { kind: 'done', done }, previous };
}

/** The room moved or turned by hand (room-mover.ts): from now on it stays where it was put. */
export function moveRoom(state: LineUpState, lineUp: LineUp): LineUpState {
  if (state.phase.kind !== 'done') return state;
  return {
    ...state,
    phase: { kind: 'done', done: { ...state.phase.done, lineUp, adjusted: true } },
  };
}

/** Takes back the first corner's tap. */
export function undoTap(state: LineUpState): LineUpState {
  if (state.phase.kind !== 'aiming' || state.phase.taps.length === 0) return state;
  return { ...state, phase: { kind: 'aiming', taps: [] } };
}

/** After taps that could not be used: aim at both corners again. */
export function retryLineUp(state: LineUpState): LineUpState {
  return state.phase.kind === 'poor' ? { ...state, phase: { kind: 'aiming', taps: [] } } : state;
}

/** "Line up again" (things drifted, or the first line-up was off): back to the corners. */
export function lineUpAgain(state: LineUpState): LineUpState {
  const previous = state.phase.kind === 'done' ? state.phase.done : state.previous;
  return { ...state, phase: { kind: 'aiming', taps: [] }, previous };
}

/** Cancel lining up again: the line-up from before comes back. */
export function cancelLineUp(state: LineUpState): LineUpState {
  if (!state.previous || state.phase.kind === 'done') return state;
  return { ...state, phase: { kind: 'done', done: state.previous }, previous: null };
}

/** A corner is hidden behind furniture: ask for the ends of the next wall instead. */
export function otherCorners(state: LineUpState): LineUpState {
  if (state.pairs.length < 2 || state.phase.kind === 'done') return state;
  return {
    ...state,
    pair: (state.pair + 1) % state.pairs.length,
    phase: { kind: 'aiming', taps: [] },
  };
}

/**
 * The room → world transform to draw with now, or null while lining up. From corners it is
 * worked out again for the floor as it is now (`floorY`); after a scan it is the room as scanned;
 * placed or moved by hand, it stays where it was put, on the floor.
 */
export function activeLineUp(state: LineUpState, room: Room, floorY: number | null): LineUp | null {
  if (state.phase.kind !== 'done') return null;
  const done = state.phase.done;
  if (done.adjusted || done.source === 'hand') {
    return floorY === null ? done.lineUp : onFloor(done.lineUp, floorY);
  }
  if (floorY === null) return done.source === 'scan' ? null : done.lineUp;
  if (done.source === 'scan' || !done.taps || !done.corners) return scanLineUp(floorY);
  const again = refit(room, done.corners, done.taps, floorY);
  return again
    ? { rotationY: again.rotationY, x: again.x, y: floorY, z: again.z }
    : onFloor(done.lineUp, floorY);
}

/** The corner taps made so far, on the floor at `floorY` (to mark them in the room). */
export function tappedPoints(state: LineUpState, floorY: number | null): Vec2[] {
  if (floorY === null || state.phase.kind !== 'aiming') return [];
  return state.phase.taps.flatMap((t) => {
    const p = tapPoint(t, floorY);
    return p.ok ? [p.point] : [];
  });
}

/**
 * While aiming at corner 2: how far the dot is from corner 1's tap, along the floor (m), so the
 * user can tell they are at the right corner. Null otherwise.
 */
export function spanFromFirst(
  state: LineUpState,
  floorY: number | null,
  aim: Vec2 | null,
): number | null {
  if (!aim || aimedStep(state) !== 1) return null;
  const first = tappedPoints(state, floorY)[0];
  return first ? Math.hypot(aim.x - first.x, aim.z - first.z) : null;
}

/* ------------------------------------------------------------------------------------------ */
/* Words                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/** A small distance in plain words: "2 cm", "less than 1 cm", "1 in". */
export function formatOffset(meters: number, units: UnitSystem): string {
  if (units === 'metric') {
    const cm = Math.round(meters * 100);
    return cm < 1 ? 'less than 1 cm' : `${cm} cm`;
  }
  const inches = Math.round(meters / METERS_PER_INCH);
  return inches < 1 ? 'less than 1 in' : `${inches} in`;
}

/** A difference in plain words: centimetres or inches below a metre, else a length. */
const formatDifference = (meters: number, units: UnitSystem): string =>
  meters < 1 ? formatOffset(meters, units) : formatLength(meters, units);

/** What to do while lining up: which corner to aim at, or why the taps could not be used. */
export function lineUpMessage(state: LineUpState, room: Room, units: UnitSystem): Message {
  if (state.phase.kind === 'poor') return poorMessage(state.phase.result, units);
  const step = aimedStep(state) ?? 0;
  const prompt = cornerPrompt(room, currentPair(state), step, units, state.pair === 0);
  return { title: prompt.title, detail: prompt.detail };
}

/** Why two taps could not be used, and what to do (rare: only when they give no direction). */
export function poorMessage(result: LineUpResult | null, units: UnitSystem): Message {
  if (result?.issues.includes('corners-too-close') && result.roomDistance < MIN_TAP_SPACING) {
    return {
      title: 'Those corners are too close together',
      detail: 'Tap Other corners to use the ends of a longer wall, or Place by hand.',
    };
  }
  if (result) {
    return {
      title: 'Those taps were too close together',
      detail: `On the plan these corners are ${formatLength(result.roomDistance, units)} apart. Aim at both ends of the wall again, or tap Place by hand.`,
    };
  }
  return {
    title: 'The dot was not on the floor',
    detail: 'Aim at both corners again, where the walls meet the floor, or tap Place by hand.',
  };
}

/**
 * How the saved room compares with the taps along their wall, or null when it is close: "The
 * saved room is about 30 cm shorter here".
 */
export function differenceMessage(result: LineUpResult, units: UnitSystem): string | null {
  const diff = result.roomDistance - result.tappedDistance;
  if (Math.abs(diff) < 0.05 && result.mismatch <= 0.03) return null;
  return `The saved room is about ${formatDifference(Math.abs(diff), units)} ${diff < 0 ? 'shorter' : 'longer'} here`;
}

/** The line-up in plain words: "Lined up, 2 cm off", or how it differs and what to do. */
export function qualityMessage(done: LinedUp, units: UnitSystem): Message {
  if (done.source === 'hand') {
    return {
      title: 'Room placed by hand',
      detail:
        'Drag it with one finger and turn it with two until the ghost walls sit on the real walls.',
    };
  }
  if (done.adjusted) {
    return {
      title: 'Room moved by hand',
      detail: 'It stays where you put it. Walk around: the furniture stays with it.',
    };
  }
  if (done.source === 'scan') {
    return done.offset < 0.01
      ? {
          title: 'Lined up from the scan',
          detail: 'The room is where you scanned it. If things drift, tap Line up again.',
        }
      : {
          title: `Lined up from the scan, up to ${formatOffset(done.offset, units)} off`,
          detail:
            'The room was resized to your tape measure, so its walls can sit a little off. Tap Move the room to drag it into place.',
        };
  }
  const swapped = done.swapped ? ' You tapped the corners the other way round, which is fine.' : '';
  const difference = done.result ? differenceMessage(done.result, units) : null;
  if (difference && done.result) {
    return {
      title: `Lined up. ${difference}.`,
      detail: `Your corners were ${formatLength(done.result.tappedDistance, units)} apart; on the plan they are ${formatLength(done.result.roomDistance, units)}. The difference is spread over both corners. Tap Move the room to drag it into place.${swapped}`,
    };
  }
  const off = formatOffset(done.offset, units);
  return done.quality === 'good'
    ? {
        title: `Lined up, ${off} off`,
        detail: `Walk around: the furniture stays where it is.${swapped}`,
      }
    : {
        title: `Lined up, about ${off} off`,
        detail: `Close enough to see the furniture. Tap Move the room to fine-tune it.${swapped}`,
      };
}
