import { describe, expect, it } from 'vitest';
import {
  coachingFor,
  TRACKING_REASON,
  TRACKING_STATE,
  trackingReasonName,
  trackingStateName,
} from '@/scan/coaching';

const limited = (reason: number) => ({ state: TRACKING_STATE.LIMITED, reason });
const normal = { state: TRACKING_STATE.NORMAL, reason: TRACKING_REASON.NONE };

describe('coachingFor', () => {
  it('waits for the camera before anything else', () => {
    expect(coachingFor({ tracking: null, floorFound: false, lightIntensity: null }).kind).toBe(
      'starting',
    );
  });

  it('turns tracking problems into plain advice', () => {
    const at = (reason: number) =>
      coachingFor({ tracking: limited(reason), floorFound: true, lightIntensity: null }).kind;
    expect(at(TRACKING_REASON.EXCESSIVE_MOTION)).toBe('move-slowly');
    expect(at(TRACKING_REASON.INSUFFICIENT_FEATURES)).toBe('more-light');
    expect(at(TRACKING_REASON.INSUFFICIENT_LIGHT)).toBe('more-light');
    expect(at(TRACKING_REASON.NONE)).toBe('move-slowly');
    expect(
      coachingFor({
        tracking: { state: TRACKING_STATE.UNAVAILABLE, reason: TRACKING_REASON.NONE },
        floorFound: false,
        lightIntensity: null,
      }).kind,
    ).toBe('move-slowly');
  });

  it('looks for the floor, then for walls', () => {
    const floor = coachingFor({ tracking: normal, floorFound: false, lightIntensity: 900 });
    expect(floor.kind).toBe('point-at-floor');
    expect(floor.title).toBe('Looking for the floor…');
    expect(coachingFor({ tracking: normal, floorFound: true, lightIntensity: 900 }).title).toBe(
      'Aim at a wall',
    );
  });

  it('asks for light in a dark room even while tracking works', () => {
    expect(coachingFor({ tracking: normal, floorFound: true, lightIntensity: 60 }).title).toBe(
      'Add more light',
    );
  });

  it('names states and reasons for the debug overlay', () => {
    expect(trackingStateName(3)).toBe('normal');
    expect(trackingReasonName(4)).toBe('insufficient light');
    expect(trackingReasonName(9)).toBe('unknown (9)');
  });
});
