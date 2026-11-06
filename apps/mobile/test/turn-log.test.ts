import { describe, expect, it } from 'vitest';
import { buildScanLog } from '@/scan/scan-log';
import { TurnCapture } from '@/scan/turn/capture';
import { turnLogFields, type Json, type TurnLogInput } from '@/scan/turn/turn-log';
import { SimScan, QUIET } from './sim';
import { rawFrame } from './turn-helpers';

/** Firestore stores neither `undefined` nor a list directly inside a list. */
function firestoreSafe(value: unknown, inList = false): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return !inList && value.every((v) => firestoreSafe(v, true));
  if (value && typeof value === 'object')
    return Object.values(value).every((v) => firestoreSafe(v));
  return typeof value !== 'number' || Number.isFinite(value);
}

async function input(): Promise<TurnLogInput> {
  const capture = new TurnCapture({
    keep: () => Promise.resolve({ bytes: 1000 }),
    remove: () => {},
    folder: 'file:///x/',
  });
  capture.beginSpot();
  for (let k = 0; k < 30; k++) capture.onFrame(rawFrame(k + 1, k / 15, [0, 1.4, 0], k, -35));
  await capture.settle();
  return {
    scanId: 's1',
    video: {
      before: { width: 3840, height: 2160, fps: 30 },
      format: { width: 1920, height: 1440, fps: 60 },
      switched: true,
      model: 'iPhone15,4',
      os: '27.0',
    },
    videoError: null,
    capture: capture.report(),
    upload: { files: 73, bytes: 33_000_000, ms: 18_000, runs: 1, error: null },
    fit: {
      status: 'done',
      error: null,
      ms: 61_000,
      walls: 4,
      unsure: 1,
      openings: 2,
      spots: 1,
      info: { model: 'depth-v2', seconds: 41.123456, frames: [1, 2], nested: { a: 1 }, ok: true },
    },
    hand: { marks: 1, replaced: 1 },
    openingsPlaced: 2,
    fallback: null,
    tourSpots: 1,
  };
}

describe('turnLogFields', () => {
  it('adds a compact, Firestore-safe turn map to the scan log', async () => {
    const fields = turnLogFields(await input());
    expect(fields.method).toBe('turn');
    expect(firestoreSafe(fields)).toBe(true);
    const turn = fields.turn as { [key: string]: Json };
    expect(turn.video).toEqual({
      before: '3840x2160@30',
      format: '1920x1440@60',
      switched: true,
      note: null,
    });
    expect(turn.deviceModel).toBe('iPhone15,4');
    // Only plain values of the server's info: no lists, no maps.
    expect((turn.fit as { info: unknown }).info).toEqual({
      model: 'depth-v2',
      seconds: 41.1235,
      ok: true,
    });
    const capture = turn.capture as { keyframes: number; rings: unknown[] };
    expect(capture.keyframes).toBeGreaterThan(0);
    expect(capture.rings).toHaveLength(3);
  });

  it('keeps the scan log within the rules’ 60 keys', async () => {
    const sim = new SimScan(
      {
        outline: [
          [0, 0],
          [4, 0],
          [4, 3],
          [0, 3],
        ],
        ceiling: 2.5,
        floorY: -1.4,
      },
      QUIET,
      3,
    ).start({ x: 2, z: 1.5 });
    const base = buildScanLog(
      sim.controller.record(),
      'u1',
      { platform: 'ios', osVersion: '27.0', deviceModel: null },
      { outcome: 'saved' },
    );
    const doc = { ...base, ...turnLogFields(await input()), createdAt: 'now', trimmed: true };
    expect(Object.keys(doc).length).toBeLessThanOrEqual(60);
    expect(firestoreSafe(doc)).toBe(true);
  });

  it('logs a scan that never reached the server', () => {
    const fields = turnLogFields({
      scanId: 's2',
      video: null,
      videoError: 'The camera has not started yet',
      capture: null,
      upload: null,
      fit: null,
      hand: { marks: 0, replaced: 0 },
      openingsPlaced: null,
      fallback: 'marked',
      tourSpots: null,
    });
    expect(firestoreSafe(fields)).toBe(true);
    expect(fields.turn).toMatchObject({ video: null, fallback: 'marked', capture: null });
  });
});
