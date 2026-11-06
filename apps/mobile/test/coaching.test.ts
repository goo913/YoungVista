import { describe, expect, it } from 'vitest';
import {
  coachingFor,
  guidanceFor,
  STEP_MESSAGES,
  TRACKING_REASON,
  TRACKING_STATE,
  trackingReasonName,
  trackingStateName,
} from '@/scan/coaching';

const limited = (reason: number) => ({ state: TRACKING_STATE.LIMITED, reason });
const normal = { state: TRACKING_STATE.NORMAL, reason: TRACKING_REASON.NONE };

describe('coachingFor', () => {
  it('waits for the camera before anything else', () => {
    expect(coachingFor({ tracking: null, lightIntensity: null })?.kind).toBe('starting');
  });

  it('turns tracking problems into plain advice', () => {
    const at = (reason: number) =>
      coachingFor({ tracking: limited(reason), lightIntensity: null })?.kind;
    expect(at(TRACKING_REASON.EXCESSIVE_MOTION)).toBe('move-slowly');
    expect(at(TRACKING_REASON.INSUFFICIENT_FEATURES)).toBe('more-light');
    expect(at(TRACKING_REASON.INSUFFICIENT_LIGHT)).toBe('more-light');
    expect(at(TRACKING_REASON.NONE)).toBe('move-slowly');
    expect(
      coachingFor({
        tracking: { state: TRACKING_STATE.UNAVAILABLE, reason: TRACKING_REASON.NONE },
        lightIntensity: null,
      })?.kind,
    ).toBe('move-slowly');
  });

  it('says nothing when tracking works, unless the room is dark', () => {
    expect(coachingFor({ tracking: normal, lightIntensity: 900 })).toBeNull();
    expect(coachingFor({ tracking: normal, lightIntensity: 60 })?.title).toBe('Add more light');
  });

  it('names states and reasons for the debug overlay', () => {
    expect(trackingStateName(3)).toBe('normal');
    expect(trackingReasonName(4)).toBe('insufficient light');
    expect(trackingReasonName(9)).toBe('unknown (9)');
  });
});

describe('guidanceFor', () => {
  const g = (over: Partial<Parameters<typeof guidanceFor>[0]>) =>
    guidanceFor({ step: 'walls', floorStatus: 'found', room: 'open', turn: null, ...over });

  it('asks for the floor, and says when the floor it sees is furniture', () => {
    expect(g({ step: 'floor', floorStatus: 'searching' }).title).toBe('Point at the floor');
    expect(g({ step: 'floor', floorStatus: 'too-high' }).title).toBe(
      'That looks like furniture, point at the floor',
    );
  });

  it('walks through the first wall and the ceiling', () => {
    expect(g({ step: 'first-wall' }).title).toBe('Mark the first wall');
    expect(g({ step: 'second-mark' }).detail).toMatch(/Further is better/);
    expect(g({ step: 'ceiling' }).detail).toBe(
      'Aim at the top of the same wall, where it meets the ceiling, and tap Mark.',
    );
  });

  it('asks for the next wall, which way it is, and says when marks disagree or the room closes', () => {
    expect(g({}).detail).toBe(
      'Aim at its bottom edge (or the top edge if something is in the way) and tap Mark.',
    );
    expect(g({ turn: 'left' }).detail).toMatch(/^Turn left to the next wall\. Aim at/);
    expect(g({ room: 'conflict' })).toEqual(STEP_MESSAGES.conflict);
    expect(g({ room: 'closed' })).toEqual(STEP_MESSAGES.closed);
  });
});
