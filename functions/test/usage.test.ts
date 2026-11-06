import { describe, expect, it } from 'vitest';
import { STALE_JOB_MS, countOn, dayKey, decideStart, refundUsage } from '../src/ai-image/usage';

const NOW = Date.UTC(2026, 10, 6, 18, 0, 0);
const TODAY = '2026-11-06';
const result = {
  pictureId: 'p',
  storagePath: 'users/u/rooms/r/pictures/p.jpg',
  width: 1,
  height: 1,
};

describe('the daily limit', () => {
  it('counts per UTC day', () => {
    expect(dayKey(new Date(NOW))).toBe(TODAY);
    expect(dayKey(new Date(Date.UTC(2026, 10, 6, 23, 59)))).toBe(TODAY);
    expect(dayKey(new Date(Date.UTC(2026, 10, 7, 0, 0)))).toBe('2026-11-07');
    expect(countOn({ day: TODAY, count: 4 }, TODAY)).toBe(4);
    expect(countOn({ day: '2026-11-05', count: 4 }, TODAY)).toBe(0);
    expect(countOn({ day: TODAY, count: 'four' }, TODAY)).toBe(0);
    expect(countOn(null, TODAY)).toBe(0);
  });

  it('starts a picture while there are some left today', () => {
    expect(decideStart(null, null, NOW, 30)).toEqual({ kind: 'start', count: 1, remaining: 29 });
    expect(decideStart(null, { day: TODAY, count: 29 }, NOW, 30)).toEqual({
      kind: 'start',
      count: 30,
      remaining: 0,
    });
  });

  it('refuses once the limit is reached, and starts again the next day', () => {
    expect(decideStart(null, { day: TODAY, count: 30 }, NOW, 30)).toEqual({ kind: 'limit' });
    expect(decideStart(null, { day: '2026-11-05', count: 30 }, NOW, 30)).toEqual({
      kind: 'start',
      count: 1,
      remaining: 29,
    });
  });

  it('answers a picture already made again, without counting it', () => {
    const job = { status: 'done', result };
    expect(decideStart(job, { day: TODAY, count: 30 }, NOW, 30)).toEqual({
      kind: 'done',
      result,
      remaining: 0,
    });
  });

  it('does not start a picture twice while it is being made, unless that try was cut short', () => {
    const running = { status: 'running', startedAt: NOW - 60_000 };
    expect(decideStart(running, null, NOW, 30)).toEqual({ kind: 'running' });
    const stale = { status: 'running', startedAt: NOW - STALE_JOB_MS - 1 };
    expect(decideStart(stale, null, NOW, 30).kind).toBe('start');
    expect(decideStart({ status: 'failed', reason: 'busy' }, null, NOW, 30).kind).toBe('start');
    // A broken record is a new start.
    expect(decideStart({ status: 'done', result: { pictureId: 3 } }, null, NOW, 30).kind).toBe(
      'start',
    );
  });

  it('gives back a picture not made through no fault of the request, on the same day only', () => {
    expect(refundUsage({ day: TODAY, count: 3 }, TODAY)).toEqual({ day: TODAY, count: 2 });
    expect(refundUsage({ day: TODAY, count: 0 }, TODAY)).toBeNull();
    expect(refundUsage({ day: '2026-11-07', count: 3 }, TODAY)).toBeNull();
    expect(refundUsage(null, TODAY)).toBeNull();
  });
});
