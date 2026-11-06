/**
 * What the scan says to the user: coaching from ViroReact's tracking state and the light, and the
 * one instruction for each step of the scan.
 *
 * ViroReact 3.0.3 numbers (ViroTrackingStateConstants, ViroARTrackingReasonConstants and the
 * native enums): state 1 unavailable, 2 limited, 3 normal; reason 1 none, 2 excessive motion,
 * 3 insufficient features, 4 insufficient light (Android only, missing from Viro's TypeScript
 * types). iPhones report "initializing" and "relocalizing" as reason 1.
 */
import type { TurnDirection } from './geometry';

export const TRACKING_STATE = { UNAVAILABLE: 1, LIMITED: 2, NORMAL: 3 } as const;
export const TRACKING_REASON = {
  NONE: 1,
  EXCESSIVE_MOTION: 2,
  INSUFFICIENT_FEATURES: 3,
  INSUFFICIENT_LIGHT: 4,
} as const;

export interface TrackingInfo {
  state: number;
  reason: number;
}

/**
 * Below this ambient light estimate the room is too dark to track well. iPhones report about
 * 1000 in a well-lit room; Android is rescaled by Viro to a similar range. The debug overlay
 * shows the live value.
 */
export const LOW_LIGHT_INTENSITY = 150;

export type CoachingKind = 'starting' | 'move-slowly' | 'more-light';

export interface Message {
  title: string;
  detail: string;
}

export interface Coaching extends Message {
  kind: CoachingKind;
}

const COACHING: Record<CoachingKind, Message> = {
  starting: {
    title: 'Starting the camera…',
    detail: 'Hold the phone up and look around slowly.',
  },
  'move-slowly': {
    title: 'Move slowly',
    detail: 'Move the phone slowly and steadily so it can keep track of the room.',
  },
  'more-light': {
    title: 'Add more light',
    detail: 'Turn on more lights. The phone needs light to keep track of the room.',
  },
};

export const coachingMessage = (kind: CoachingKind): Coaching => ({ kind, ...COACHING[kind] });

export interface CoachingInput {
  tracking: TrackingInfo | null;
  lightIntensity: number | null;
}

/** Coaching to show instead of the step's instruction, or null when tracking is fine. */
export function coachingFor({ tracking, lightIntensity }: CoachingInput): Coaching | null {
  if (!tracking) return coachingMessage('starting');
  const dark = lightIntensity !== null && lightIntensity < LOW_LIGHT_INTENSITY;
  if (tracking.state !== TRACKING_STATE.NORMAL) {
    switch (tracking.reason) {
      case TRACKING_REASON.INSUFFICIENT_LIGHT:
      case TRACKING_REASON.INSUFFICIENT_FEATURES:
        return coachingMessage('more-light');
      case TRACKING_REASON.EXCESSIVE_MOTION:
        return coachingMessage('move-slowly');
      default:
        return coachingMessage(dark ? 'more-light' : 'move-slowly');
    }
  }
  return dark ? coachingMessage('more-light') : null;
}

/** The scan's steps (see session.ts). */
export type ScanStep = 'floor' | 'first-wall' | 'second-mark' | 'ceiling' | 'walls';

export const STEP_MESSAGES = {
  searching: {
    title: 'Point at the floor',
    detail: 'Move the phone slowly from side to side until the floor is found.',
  },
  'too-high': {
    title: 'That looks like furniture, point at the floor',
    detail: 'Aim at an open patch of floor and move the phone slowly.',
  },
  'first-wall': {
    title: 'Mark the first wall',
    detail:
      'Pick a wall whose bottom edge you can see. Aim the dot where it meets the floor and tap Mark.',
  },
  'second-mark': {
    title: 'Mark it again, further along',
    detail:
      'Aim at the bottom of the same wall at least 50 cm (20 in) away and tap Mark. Further is better.',
  },
  ceiling: {
    title: 'Now the top of that wall',
    detail: 'Aim at the top of the same wall, where it meets the ceiling, and tap Mark.',
  },
  walls: {
    title: 'Now the next wall',
    detail: 'Aim at its bottom edge (or the top edge if something is in the way) and tap Mark.',
  },
  conflict: {
    title: 'Two marks disagree',
    detail: 'The red wall does not fit with the others. Tap Undo, or mark that wall again.',
  },
  closed: {
    title: 'The room is closed',
    detail: 'Joining the walls…',
  },
} satisfies Record<string, Message>;

const TURN_TEXT: Record<TurnDirection, string> = {
  left: 'Turn left to the next wall.',
  right: 'Turn right to the next wall.',
  ahead: 'The next wall is in front of you.',
  behind: 'The next wall is behind you.',
};

export interface GuidanceInput {
  step: ScanStep;
  floorStatus: 'found' | 'searching' | 'too-high';
  /** Walls step: how the walls fit so far. */
  room: 'closed' | 'conflict' | 'open' | null;
  /** Walls step, rectangles: where the next unmarked wall is. */
  turn: TurnDirection | null;
}

/** The instruction for the current step. */
export function guidanceFor({ step, floorStatus, room, turn }: GuidanceInput): Message {
  switch (step) {
    case 'floor':
      return floorStatus === 'too-high' ? STEP_MESSAGES['too-high'] : STEP_MESSAGES.searching;
    case 'first-wall':
    case 'second-mark':
    case 'ceiling':
      return STEP_MESSAGES[step];
    case 'walls':
      if (room === 'closed') return STEP_MESSAGES.closed;
      if (room === 'conflict') return STEP_MESSAGES.conflict;
      return turn
        ? {
            title: STEP_MESSAGES.walls.title,
            detail: `${TURN_TEXT[turn]} ${STEP_MESSAGES.walls.detail}`,
          }
        : STEP_MESSAGES.walls;
  }
}

/** Readable names for the debug overlay. */
export function trackingStateName(state: number): string {
  return (
    ({ 1: 'unavailable', 2: 'limited', 3: 'normal' } as Record<number, string>)[state] ??
    `unknown (${state})`
  );
}

export function trackingReasonName(reason: number): string {
  return (
    (
      {
        1: 'none',
        2: 'excessive motion',
        3: 'insufficient features',
        4: 'insufficient light',
      } as Record<number, string>
    )[reason] ?? `unknown (${reason})`
  );
}
