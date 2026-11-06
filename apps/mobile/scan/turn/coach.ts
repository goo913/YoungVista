/**
 * What the turn-around scan says on screen, in plain words: while turning (the one thing to do
 * now, most urgent first), and while the server measures the room. Plain TypeScript
 * (test/turn-coach.test.ts).
 */
import type { ScanFitStatus } from '@youngvista/core';
import type { Message } from '@/scan/coaching';
import type { CaptureSnapshot } from './capture';
import { MAX_SPOTS, RING_NAMES, SPOT_DRIFT, describeSeconds } from './plan';

export type CaptureHint =
  'tracking' | 'spot-done' | 'too-fast' | 'drift' | 'tilt-up' | 'tilt-down' | 'gap' | 'turn';

/** The message while turning. `coaching`: the scan session's own (tracking, light), if any. */
export function captureMessage(
  capture: CaptureSnapshot,
  coaching: Message | null,
): Message & { hint: CaptureHint } {
  if (coaching) return { hint: 'tracking', ...coaching };
  if (capture.phase === 'spot-done') {
    return capture.spot + 1 < MAX_SPOTS
      ? {
          hint: 'spot-done',
          title: 'All three turns done',
          detail:
            'Measure the room now. In a long or L-shaped room, add a second spot at its other end first.',
        }
      : { hint: 'spot-done', title: 'Both spots done', detail: 'Measure the room now.' };
  }
  if (capture.tooFast) {
    return {
      hint: 'too-fast',
      title: 'Turn slower',
      detail: 'Fast turns blur the pictures. Take about 10 seconds for a quarter turn.',
    };
  }
  if (capture.drift > SPOT_DRIFT) {
    return {
      hint: 'drift',
      title: 'Stay on one spot',
      detail: 'Go back to where you started and turn on your heels, the phone near your chest.',
    };
  }
  const guide = capture.guide;
  if (guide && !guide.onTarget) {
    return guide.tilt === 'up'
      ? {
          hint: 'tilt-up',
          title: 'Tilt the phone up to the line',
          detail: 'Keep the dot on the line while you turn.',
        }
      : {
          hint: 'tilt-down',
          title: 'Tilt the phone down to the line',
          detail: 'Keep the dot on the line while you turn.',
        };
  }
  if (capture.gap) {
    const deg = Math.max(15, Math.round(Math.abs(capture.gap.deltaDeg) / 5) * 5);
    return {
      hint: 'gap',
      title: 'Go back to fill the gap',
      detail: `Turn ${capture.gap.turn} about ${deg}° to the empty part of the circle, slowly.`,
    };
  }
  return {
    hint: 'turn',
    title: `Turn ${capture.ring + 1} of 3: ${RING_NAMES[capture.ring] ?? ''}`,
    detail:
      capture.ringFilled === 0
        ? 'Turn slowly on the spot, all the way round. The circle fills in as you go.'
        : 'Keep turning slowly. The circle fills in as you go.',
  };
}

/** The progress line: "Turn 2 of 3 · 14 of 24 · about 1 min 20 s left". */
export function progressLine(capture: CaptureSnapshot): string {
  if (capture.phase !== 'turning') {
    return `${capture.keyframes} pictures`;
  }
  const spot = capture.spot > 0 ? 'Second spot · ' : '';
  return `${spot}Turn ${capture.ring + 1} of 3 · ${capture.ringFilled} of ${capture.ringTotal} · ${describeSeconds(capture.secondsLeft)} left`;
}

/** Where the server's fit is, for the panel. */
export type FitStage =
  'uploading' | 'asking' | ScanFitStatus | 'upload-failed' | 'request-failed' | 'timeout';

export function fitMessage(stage: FitStage, error: string | null): Message {
  switch (stage) {
    case 'uploading':
      return {
        title: 'Sending the pictures',
        detail: 'Keep the app open. You can stay where you are.',
      };
    case 'asking':
    case 'queued':
      return {
        title: 'Waiting for the server',
        detail: 'Your room is next in line to be measured.',
      };
    case 'running':
      return {
        title: 'Measuring your room',
        detail: 'AI is finding the walls, doors and windows. This takes about a minute.',
      };
    case 'done':
      return { title: 'Room measured', detail: 'Check the walls in the camera view.' };
    case 'failed':
      return {
        title: 'The room could not be measured',
        detail: error ?? 'The scan did not show enough of the walls.',
      };
    case 'upload-failed':
      return { title: 'The pictures did not all upload', detail: error ?? 'Try again.' };
    case 'request-failed':
      return { title: 'The room could not be sent for measuring', detail: error ?? 'Try again.' };
    case 'timeout':
      return {
        title: 'Measuring is taking too long',
        detail: 'Keep waiting, or mark the walls yourself: it takes about a minute.',
      };
  }
}
