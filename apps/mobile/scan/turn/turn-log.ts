/**
 * What a turn-around scan adds to its scan log (scan/scan-log.ts): the log is the usual one of the
 * scan session (floor, planes, camera path, marks by hand), plus `method: 'turn'` and a compact
 * `turn` map: the video format, the capture's coverage and speed, whether ARKit's frames and Viro's
 * camera agreed, the upload, the server's fit, the marks made by hand and the fallback, if any.
 * Firestore takes no nested arrays and no `undefined`, and the rules allow 60 top-level keys; this
 * adds two. Plain TypeScript (test/turn-log.test.ts).
 */
import type { ScanFitStatus } from '@youngvista/core';
import type { CaptureReport } from './capture';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Version of the `turn` map. */
export const TURN_LOG_VERSION = 1;

export interface VideoInfo {
  before: { width: number; height: number; fps: number };
  format: { width: number; height: number; fps: number };
  switched: boolean;
  note?: string;
  model: string;
  os: string;
}

export interface TurnLogInput {
  scanId: string;
  video: VideoInfo | null;
  /** Why the AR session could not be reached, if it could not. */
  videoError: string | null;
  capture: CaptureReport | null;
  upload: {
    files: number;
    bytes: number;
    ms: number | null;
    runs: number;
    error: string | null;
  } | null;
  fit: {
    /** The server's last status, or what went wrong before it had one. */
    status: ScanFitStatus | 'request-failed' | 'timeout' | 'waiting';
    error: string | null;
    /** From asking to done (ms). */
    ms: number | null;
    walls: number;
    unsure: number;
    openings: number;
    spots: number;
    info: Record<string, unknown> | null;
  } | null;
  /** Marks made by hand while the server's walls were in place, and server walls they replaced. */
  hand: { marks: number; replaced: number };
  /** Doors and windows the server found that went on the room. */
  openingsPlaced: number | null;
  /** The user went on to mark every wall by hand instead. */
  fallback: 'marked' | null;
  /** Spots of the tour saved with the room. */
  tourSpots: number | null;
}

const r = (n: number, places = 3): number | null => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Only the plain values of the server's `info` (no nested lists, which Firestore refuses). */
function plainInfo(info: Record<string, unknown> | null): { [key: string]: Json } | null {
  if (!info) return null;
  const out: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(info).slice(0, 40)) {
    if (typeof value === 'string') out[key] = value.slice(0, 200);
    else if (typeof value === 'number') out[key] = r(value, 4);
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** What a turn-around scan has to say in its log, filled in as the scan goes on. */
export class TurnLogBook {
  private info: TurnLogInput;

  constructor(scanId: string) {
    this.info = {
      scanId,
      video: null,
      videoError: null,
      capture: null,
      upload: null,
      fit: null,
      hand: { marks: 0, replaced: 0 },
      openingsPlaced: null,
      fallback: null,
      tourSpots: null,
    };
  }

  note(changes: Partial<TurnLogInput>): void {
    this.info = { ...this.info, ...changes };
  }

  /** The log's fields as of now, with `latest` (what is only known at the end) laid over. */
  fields(latest: Partial<TurnLogInput> = {}): ReturnType<typeof turnLogFields> {
    return turnLogFields({ ...this.info, ...latest });
  }

  get fit(): TurnLogInput['fit'] {
    return this.info.fit;
  }
}

/** The fields a turn-around scan adds to its scan log. */
export function turnLogFields(input: TurnLogInput): {
  method: 'turn';
  turn: { [key: string]: Json };
} {
  const c = input.capture;
  const v = input.video;
  return {
    method: 'turn',
    turn: {
      v: TURN_LOG_VERSION,
      scanId: input.scanId,
      deviceModel: v?.model ?? null,
      os: v?.os ?? null,
      video: v
        ? {
            before: `${v.before.width}x${v.before.height}@${v.before.fps}`,
            format: `${v.format.width}x${v.format.height}@${v.format.fps}`,
            switched: v.switched,
            note: v.note ?? null,
          }
        : null,
      videoError: input.videoError,
      capture: c
        ? {
            samples: c.samples,
            keyframes: c.keyframes,
            bytes: c.bytes,
            seconds: r(c.seconds, 1),
            spots: c.spots,
            maxSpeed: r(c.maxSpeed, 1),
            fastSamples: c.fastSamples,
            skips: { ...c.skips },
            rings: c.rings.map((ring) => ({ ...ring })),
            frameCheck: c.frameCheck
              ? {
                  samples: c.frameCheck.samples,
                  medianM: r(c.frameCheck.medianM, 4),
                  maxM: r(c.frameCheck.maxM, 4),
                  medianDeg: r(c.frameCheck.medianDeg, 2),
                  maxDeg: r(c.frameCheck.maxDeg, 2),
                }
              : null,
          }
        : null,
      upload: input.upload ? { ...input.upload } : null,
      fit: input.fit
        ? {
            status: input.fit.status,
            error: input.fit.error,
            ms: input.fit.ms,
            walls: input.fit.walls,
            unsure: input.fit.unsure,
            openings: input.fit.openings,
            spots: input.fit.spots,
            info: plainInfo(input.fit.info),
          }
        : null,
      hand: { ...input.hand },
      openingsPlaced: input.openingsPlaced,
      fallback: input.fallback,
      tourSpots: input.tourSpots,
    },
  };
}
