/**
 * Coaching messages during a scan, from ViroReact's tracking state and reason plus what the scan
 * has found so far.
 *
 * ViroReact 3.0.3 numbers (ViroTrackingStateConstants, ViroARTrackingReasonConstants and the
 * native enums): state 1 unavailable, 2 limited, 3 normal; reason 1 none, 2 excessive motion,
 * 3 insufficient features, 4 insufficient light (Android only, missing from Viro's TypeScript
 * types). iPhones report "initializing" and "relocalizing" as reason 1.
 */

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
 * Below this ambient light estimate the room is too dark for plain walls. iPhones report about
 * 1000 in a well-lit room; Android is rescaled by Viro to a similar range. Tune it on phones with
 * the debug overlay, which shows the live value.
 */
export const LOW_LIGHT_INTENSITY = 150;

export type CoachingKind =
  'starting' | 'move-slowly' | 'more-light' | 'point-at-floor' | 'aim-at-wall';

export interface Coaching {
  kind: CoachingKind;
  title: string;
  detail: string;
}

const MESSAGES: Record<CoachingKind, Omit<Coaching, 'kind'>> = {
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
    detail: 'Turn on more lights. Plain walls are hard to see in a dim room.',
  },
  'point-at-floor': {
    title: 'Looking for the floor…',
    detail: 'Point at the floor and move the phone slowly from side to side.',
  },
  'aim-at-wall': {
    title: 'Aim at a wall',
    detail:
      'Turn slowly and point at each wall. If a wall is missed, aim the dot at its bottom and tap Mark wall twice.',
  },
};

export const coachingMessage = (kind: CoachingKind): Coaching => ({ kind, ...MESSAGES[kind] });

export interface CoachingInput {
  tracking: TrackingInfo | null;
  floorFound: boolean;
  lightIntensity: number | null;
}

/** The one message to show now, most urgent first. */
export function coachingFor({ tracking, floorFound, lightIntensity }: CoachingInput): Coaching {
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
  if (dark) return coachingMessage('more-light');
  return coachingMessage(floorFound ? 'aim-at-wall' : 'point-at-floor');
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
