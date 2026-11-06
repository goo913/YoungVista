import { describe, expect, it } from 'vitest';
import {
  KeyframeSelector,
  MAX_KEEP_SPEED,
  blurPixels,
  frameScore,
  type Candidate,
  type FrameSample,
} from '@/scan/turn/keyframes';
import { cameraTransform } from './turn-helpers';

const frame = (
  id: number,
  yawDeg: number,
  pitchDeg: number,
  options: Partial<FrameSample> = {},
): FrameSample => ({
  id,
  t: id / 15,
  transform: cameraTransform([0, 1.4, 0], yawDeg, pitchDeg),
  intrinsics: { fx: 1450, fy: 1450, cx: 960, cy: 720 },
  width: 1920,
  height: 1440,
  tracking: 'normal',
  exposureDuration: 1 / 60,
  sharpness: 400,
  ...options,
});

/** Considers a frame and, if kept, writes it at once. Returns the files to delete. */
function take(selector: KeyframeSelector, f: FrameSample, speed = 8) {
  const decision = selector.consider(f, 0, speed);
  if (decision.kind !== 'keep') return { decision, removed: [] as string[] };
  return {
    decision,
    removed: selector.settle(decision.candidate, { file: `f${f.id}.jpg`, bytes: 500_000 }),
  };
}

describe('frame scores', () => {
  it('measures motion blur in pixels', () => {
    // 10° a second, 1/60 s, a 1450-pixel focal length: about 4 pixels.
    expect(blurPixels(10, 1 / 60, 1450)).toBeCloseTo(4.22, 2);
    expect(blurPixels(10, undefined, 1450)).toBeCloseTo(4.22, 2);
    expect(blurPixels(0, 1 / 30, 1450)).toBe(0);
  });

  it('prefers sharp, steady, centred frames, and normal tracking above all', () => {
    const base = {
      sharpness: 400,
      blurPx: 2,
      pitchOffsetDeg: 0,
      binOffsetDeg: 0,
      tracking: 'normal' as const,
    };
    expect(frameScore({ ...base, sharpness: 800 })).toBeGreaterThan(frameScore(base));
    expect(frameScore({ ...base, blurPx: 8 })).toBeLessThan(frameScore(base));
    expect(frameScore({ ...base, pitchOffsetDeg: 6 })).toBeLessThan(frameScore(base));
    expect(frameScore({ ...base, binOffsetDeg: 7 })).toBeLessThan(frameScore(base));
    expect(frameScore({ ...base, tracking: 'limited', sharpness: 5000 })).toBeLessThan(
      frameScore({ ...base, sharpness: 10, blurPx: 10 }),
    );
  });
});

describe('KeyframeSelector', () => {
  it('keeps the first frame of a bin and replaces it only with a clearly better one', () => {
    const s = new KeyframeSelector();
    expect(take(s, frame(1, 7, -35)).decision.kind).toBe('keep');
    expect(s.filled(0, 0)[0]).toBe(true);
    // Barely sharper: not worth a new picture.
    expect(take(s, frame(2, 7, -35, { sharpness: 401 })).decision).toEqual({
      kind: 'skip',
      reason: 'worse',
    });
    // Twice as sharp: kept, and the old file goes.
    const sharper = take(s, frame(3, 7, -35, { sharpness: 800 }));
    expect(sharper.decision.kind).toBe('keep');
    expect(sharper.removed).toEqual(['f1.jpg']);
    expect(s.keyframes().map((k) => k.frame.id)).toEqual([3]);
  });

  it('keeps a steadier frame over a blurred one', () => {
    const s = new KeyframeSelector();
    take(s, frame(1, 20, 0), 20);
    expect(take(s, frame(2, 20, 0), 4).decision.kind).toBe('keep');
    expect(s.keyframes()[0]!.frame.id).toBe(2);
  });

  it('files frames by ring and bin', () => {
    const s = new KeyframeSelector();
    take(s, frame(1, 7, -35));
    take(s, frame(2, 7, 0));
    take(s, frame(3, 7, 35));
    take(s, frame(4, 100, 0));
    expect(s.filled(0, 0).filter(Boolean)).toHaveLength(1);
    expect(s.filled(0, 1).flatMap((b, i) => (b ? [i] : []))).toEqual([0, 6]);
    expect(s.filled(0, 2)[0]).toBe(true);
    const kept = s.keyframes();
    expect(kept.map((k) => [k.ring, k.bin])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [1, 6],
    ]);
  });

  it('passes over frames between the rings, too fast, or without tracking', () => {
    const s = new KeyframeSelector();
    expect(s.consider(frame(1, 0, -18), 0, 8)).toEqual({ kind: 'skip', reason: 'pitch' });
    expect(s.consider(frame(2, 0, 0), 0, MAX_KEEP_SPEED + 1)).toEqual({
      kind: 'skip',
      reason: 'fast',
    });
    expect(s.consider(frame(3, 0, 0, { tracking: 'unavailable' }), 0, 8)).toEqual({
      kind: 'skip',
      reason: 'tracking',
    });
    expect(s.consider(frame(4, 0, 0, { transform: [1, 2] }), 0, 8)).toEqual({
      kind: 'skip',
      reason: 'no-pose',
    });
    expect(s.skips()).toMatchObject({ pitch: 1, fast: 1, tracking: 1, 'no-pose': 1 });
  });

  it('lets limited tracking fill only an empty bin', () => {
    const s = new KeyframeSelector();
    expect(take(s, frame(1, 40, 0, { tracking: 'limited', sharpness: 5000 })).decision.kind).toBe(
      'keep',
    );
    const normal = take(s, frame(2, 40, 0, { sharpness: 50 }));
    expect(normal.decision.kind).toBe('keep');
    expect(normal.removed).toEqual(['f1.jpg']);
    expect(take(s, frame(3, 40, 0, { tracking: 'limited', sharpness: 9000 })).decision.kind).toBe(
      'skip',
    );
  });

  it('settles writes that finish out of order', () => {
    const s = new KeyframeSelector();
    const a = s.consider(frame(1, 7, 0), 0, 8);
    const b = s.consider(frame(2, 7, 0, { sharpness: 900 }), 0, 8);
    expect(a.kind).toBe('keep');
    expect(b.kind).toBe('keep');
    expect(s.writing).toBe(true);
    // The better one finishes first; the first one's file is then of no use.
    expect(
      s.settle((b as { candidate: Candidate }).candidate, { file: 'f2.jpg', bytes: 1 }),
    ).toEqual([]);
    expect(
      s.settle((a as { candidate: Candidate }).candidate, { file: 'f1.jpg', bytes: 1 }),
    ).toEqual(['f1.jpg']);
    expect(s.writing).toBe(false);
    expect(s.keyframes().map((k) => k.file)).toEqual(['f2.jpg']);
  });

  it('keeps the old keyframe when writing a new one fails', () => {
    const s = new KeyframeSelector();
    take(s, frame(1, 7, 0));
    const better = s.consider(frame(2, 7, 0, { sharpness: 900 }), 0, 8);
    expect(better.kind).toBe('keep');
    expect(s.settle((better as { candidate: Candidate }).candidate, null)).toEqual([]);
    expect(s.keyframes().map((k) => k.file)).toEqual(['f1.jpg']);
  });

  it('keeps each standing spot apart', () => {
    const s = new KeyframeSelector();
    const one = s.consider(frame(1, 7, 0), 0, 8);
    const two = s.consider(frame(2, 7, 0), 1, 8);
    expect(one.kind).toBe('keep');
    expect(two.kind).toBe('keep');
    expect(s.filled(1, 1)[0]).toBe(false); // not written yet
    s.settle((two as { candidate: Candidate }).candidate, { file: 'f2.jpg', bytes: 1 });
    expect(s.filled(1, 1)[0]).toBe(true);
    expect(s.filled(0, 1)[0]).toBe(false);
  });
});
