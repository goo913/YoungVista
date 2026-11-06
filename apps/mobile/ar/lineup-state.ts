/**
 * Lining up a saved room with the real one in AR: the user aims the dot at two corners of the
 * room on the floor (the ends of one wall, shown on a small plan) and taps "Corner here" at each.
 * From the two corners in room space and the two taps in the AR world, core's
 * `lineUpFromCorners` finds the turn and shift that put the room where it is. A poor match (the
 * taps much closer together or further apart than the corners) asks again.
 *
 * Taps are kept as camera rays, as the scan keeps its marks, so the line-up follows the floor if
 * the phone finds it a little higher or lower later. Right after a scan, in the same AR session,
 * the room needs no taps at all (`lineUpFromScan`, see pose.ts).
 *
 * Plain data and pure functions; the AR screen holds one state.
 */
import {
  hitLevelPlane,
  lineUpCorners,
  lineUpFromCorners,
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
import { cornerPrompt } from './corner-prompts';
import { onFloor, scanLineUp } from './pose';

/** A corner tap: the camera ray through the dot when Corner here was tapped (world). */
export type CornerTap = CameraRay;

/** The room is lined up. */
export interface LinedUp {
  source: 'corners' | 'scan';
  /** The two taps (corners only). */
  taps: readonly [CornerTap, CornerTap] | null;
  /** The corners they were for (indices into `room.points`), or null after a scan. */
  corners: readonly [number, number] | null;
  /** The line-up as of the taps, for when the taps no longer reach the floor (rare). */
  lineUp: LineUp;
  /** How far off the corners are (m): the taps' residual, or the scan's estimate. */
  offset: number;
  quality: LineUpQuality;
  /** The match, when lined up from corners. */
  result: LineUpResult | null;
}

export type LineUpPhase =
  /** Aiming at the corners: no tap yet, or the first one done. */
  | { kind: 'aiming'; taps: readonly CornerTap[] }
  /** The two taps did not match the plan: ask again. */
  | { kind: 'poor'; result: LineUpResult | null }
  | { kind: 'done'; done: LinedUp };

export interface LineUpState {
  /** Pairs of corners that can be used, the ends of each wall, longest wall first. */
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
/** The second tap must be at least this far from the first (m). */
export const MIN_TAP_SPACING = 0.3;

export type CornerTapError = 'no-floor' | 'aim-lower' | 'too-far' | 'under-phone' | 'same-corner';

export const TAP_ERRORS: Record<CornerTapError, string> = {
  'no-floor': 'Find the floor first: point the phone at the floor and move it slowly.',
  'aim-lower': 'Aim the dot lower, at the corner where the walls meet the floor.',
  'too-far': 'That corner is too far away. Walk closer to it and try again.',
  'under-phone': 'Aim at the corner, not at the floor under the phone.',
  'same-corner': 'That is the same corner again. Aim at corner 2, at the other end of the wall.',
};

/**
 * The pairs of corners to offer: the default from core's `lineUpCorners` (the ends of the
 * longest wall) first, then the ends of every other wall, longest first.
 */
export function cornerPairs(room: Room): [number, number][] {
  const first = lineUpCorners(room);
  if (!first) return [];
  const others = room.walls
    .map((w, i) => ({ pair: [w.a, w.b] as [number, number], length: wallLength(room, i) }))
    .filter((p) => !(p.pair[0] === first[0] && p.pair[1] === first[1]))
    .filter((p) => p.length > 0.3)
    .sort((p, q) => q.length - p.length)
    .map((p) => p.pair);
  return [first, ...others];
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
    quality: offset <= 0.03 ? 'good' : offset <= 0.08 ? 'fair' : 'poor',
    result: null,
  };
  return { pairs, pair: 0, phase: { kind: 'done', done }, previous: null };
}

/** The two corners asked for now. */
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

/** The line-up from two taps of two corners, with the floor at `floorY`. */
function match(
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
  const corners = currentPair(state);
  const both: [CornerTap, CornerTap] = [taps[0]!, tap];
  const result = match(room, corners, both, floorY);
  if (!result || result.quality === 'poor') {
    return {
      state: { ...state, phase: { kind: 'poor', result } },
      outcome: { kind: 'poor', result },
    };
  }
  const done: LinedUp = {
    source: 'corners',
    taps: both,
    corners,
    lineUp: { rotationY: result.rotationY, x: result.x, y: result.y, z: result.z },
    offset: result.residual,
    quality: result.quality,
    result,
  };
  return {
    state: { ...state, phase: { kind: 'done', done }, previous: null },
    outcome: { kind: 'done', done },
  };
}

/** Takes back the first corner's tap. */
export function undoTap(state: LineUpState): LineUpState {
  if (state.phase.kind !== 'aiming' || state.phase.taps.length === 0) return state;
  return { ...state, phase: { kind: 'aiming', taps: [] } };
}

/** After a poor match: aim at both corners again. */
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
 * worked out again for the floor as it is now (`floorY`); after a scan it is the room as scanned.
 */
export function activeLineUp(state: LineUpState, room: Room, floorY: number | null): LineUp | null {
  if (state.phase.kind !== 'done') return null;
  const done = state.phase.done;
  if (floorY === null) return done.source === 'scan' ? null : done.lineUp;
  if (done.source === 'scan' || !done.taps || !done.corners) return scanLineUp(floorY);
  const again = match(room, done.corners, done.taps, floorY);
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

/** What to do while lining up: which corner to aim at, or why the taps did not match. */
export function lineUpMessage(state: LineUpState, room: Room, units: UnitSystem): Message {
  if (state.phase.kind === 'poor') return poorMessage(state.phase.result, units);
  const step = aimedStep(state) ?? 0;
  const prompt = cornerPrompt(room, currentPair(state), step, units, state.pair === 0);
  return { title: prompt.title, detail: prompt.detail };
}

/** Why two taps did not line up, and what to do. */
export function poorMessage(result: LineUpResult | null, units: UnitSystem): Message {
  if (!result) {
    return {
      title: 'That did not line up',
      detail: 'The dot was not on the floor for one of the corners. Aim at both corners again.',
    };
  }
  if (result.issues.includes('corners-too-close') && result.roomDistance < 0.75) {
    return {
      title: 'Those corners are too close together',
      detail: 'Tap Other corners to use the ends of a longer wall.',
    };
  }
  return {
    title: 'That did not line up',
    detail: `On the plan these corners are ${formatLength(result.roomDistance, units)} apart, but your taps were ${formatLength(result.tappedDistance, units)} apart. Check you are aiming at corners 1 and 2, then try again.`,
  };
}

/** The line-up's quality in plain words: "Lined up, 2 cm off". */
export function qualityMessage(done: LinedUp, units: UnitSystem): Message {
  if (done.source === 'scan') {
    return done.offset < 0.01
      ? {
          title: 'Lined up from the scan',
          detail: 'The room is where you scanned it. If things drift, tap Line up again.',
        }
      : {
          title: `Lined up from the scan, up to ${formatOffset(done.offset, units)} off`,
          detail:
            'The room was resized to your tape measure, so its walls can sit a little off. Tap Line up again for a closer fit.',
        };
  }
  const off = formatOffset(done.offset, units);
  return done.quality === 'good'
    ? { title: `Lined up, ${off} off`, detail: 'Walk around: the furniture stays where it is.' }
    : {
        title: `Lined up, about ${off} off`,
        detail:
          'Close enough to see the furniture. For a closer fit, tap Line up again and aim carefully at the corners.',
      };
}
