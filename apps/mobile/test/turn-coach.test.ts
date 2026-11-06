import { describe, expect, it } from 'vitest';
import type { CaptureSnapshot } from '@/scan/turn/capture';
import { captureMessage, fitMessage, progressLine, type FitStage } from '@/scan/turn/coach';
import { pitchGuide } from '@/scan/turn/plan';

const turning = (over: Partial<CaptureSnapshot> = {}): CaptureSnapshot => ({
  phase: 'turning',
  spot: 0,
  ring: 1,
  coverage: [new Array(24).fill(true), new Array(24).fill(false), new Array(24).fill(false)],
  view: { yawDeg: 10, pitchDeg: 1 },
  guide: pitchGuide(1, 1),
  speed: 9,
  tooFast: false,
  drift: 0.1,
  gap: null,
  tracking: 'normal',
  trackingReason: null,
  optics: null,
  filled: 30,
  total: 72,
  ringFilled: 6,
  ringTotal: 24,
  secondsLeft: 63,
  keyframes: 30,
  revision: 1,
  ...over,
});

describe('captureMessage', () => {
  it('says the most urgent thing first', () => {
    const coaching = { title: 'Move slowly', detail: '…' };
    const everything = turning({
      tooFast: true,
      drift: 1,
      guide: pitchGuide(20, 1),
      gap: { bin: 3, deltaDeg: 40, turn: 'left' },
    });
    expect(captureMessage(everything, coaching).hint).toBe('tracking');
    expect(captureMessage(everything, null).hint).toBe('too-fast');
    expect(captureMessage({ ...everything, tooFast: false }, null).hint).toBe('drift');
    expect(captureMessage({ ...everything, tooFast: false, drift: 0 }, null).hint).toBe(
      'tilt-down',
    );
    expect(
      captureMessage({ ...everything, tooFast: false, drift: 0, guide: pitchGuide(1, 1) }, null),
    ).toMatchObject({ hint: 'gap', title: 'Go back to fill the gap' });
    expect(captureMessage(turning(), null)).toMatchObject({
      hint: 'turn',
      title: 'Turn 2 of 3: level',
    });
  });

  it('tells which way the gap is and how far', () => {
    const m = captureMessage(turning({ gap: { bin: 20, deltaDeg: -47, turn: 'right' } }), null);
    expect(m.detail).toContain('Turn right about 45°');
  });

  it('asks to tilt the right way', () => {
    expect(captureMessage(turning({ ring: 0, guide: pitchGuide(-50, 0) }), null).hint).toBe(
      'tilt-up',
    );
  });

  it('offers the second spot once', () => {
    expect(captureMessage(turning({ phase: 'spot-done' }), null).detail).toContain('second spot');
    expect(captureMessage(turning({ phase: 'spot-done', spot: 1 }), null).title).toBe(
      'Both spots done',
    );
  });

  it('writes the progress line', () => {
    expect(progressLine(turning())).toBe('Turn 2 of 3 · 6 of 24 · about 1 min 5 s left');
    expect(progressLine(turning({ spot: 1 }))).toMatch(/^Second spot · /);
  });
});

describe('fitMessage', () => {
  const stages: FitStage[] = [
    'uploading',
    'asking',
    'queued',
    'running',
    'done',
    'failed',
    'upload-failed',
    'request-failed',
    'timeout',
  ];

  it('has plain words for every stage, the server’s own error when it failed', () => {
    for (const stage of stages) {
      const m = fitMessage(stage, null);
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.detail.length).toBeGreaterThan(5);
    }
    expect(fitMessage('failed', 'Too dark to see the walls.').detail).toBe(
      'Too dark to see the walls.',
    );
  });

  it('calls the model "AI" and nothing else', () => {
    const words = stages.map((s) => JSON.stringify(fitMessage(s, null))).join(' ');
    expect(words).toContain('AI');
    expect(words).not.toMatch(/gemini|google|vertex|openai|gpt|claude|anthropic|moge|nano banana/i);
  });
});
