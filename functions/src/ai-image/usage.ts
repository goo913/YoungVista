/**
 * The daily limit and each picture's job, as plain data (the function keeps them in Firestore,
 * which only the server can read or write):
 * - `aiUsage/{uid}`: `{ day, count }`, the AI pictures started on that UTC day;
 * - `aiUsage/{uid}/jobs/{pictureId}`: one AI picture, running, done (with its result) or failed.
 *
 * A job makes calling again with the same picture id safe: a finished picture is answered again
 * without a second charge, and one still running is not started twice.
 */

/** A job still "running" after this long was cut short (the function's limit is 5 minutes). */
export const STALE_JOB_MS = 6 * 60_000;

/** The UTC day of `now`, 'YYYY-MM-DD': the limit starts again at midnight UTC. */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** A finished picture, as the job keeps it (the function's answer without `remaining`). */
export interface JobResult {
  pictureId: string;
  storagePath: string;
  width: number;
  height: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Pictures started on `day`, from `aiUsage/{uid}` (0 on another day, or when unreadable). */
export function countOn(usage: unknown, day: string): number {
  if (!isObj(usage) || usage.day !== day || !isNum(usage.count)) return 0;
  return Math.max(0, Math.floor(usage.count));
}

function jobResult(v: unknown): JobResult | null {
  if (!isObj(v)) return null;
  const { pictureId, storagePath, width, height } = v;
  if (typeof pictureId !== 'string' || typeof storagePath !== 'string') return null;
  if (!isNum(width) || !isNum(height)) return null;
  return { pictureId, storagePath, width, height };
}

export type StartDecision =
  /** Already made: answer with it again (nothing is charged). */
  | { kind: 'done'; result: JobResult; remaining: number }
  /** Being made right now (another call with the same id). */
  | { kind: 'running' }
  /** Today's limit is reached. */
  | { kind: 'limit' }
  /** Go: `count` is today's count with this picture. */
  | { kind: 'start'; count: number; remaining: number };

/**
 * What to do with a request, from its job (`jobs/{pictureId}`, or null) and the user's usage
 * (`aiUsage/{uid}`, or null) at `now` (ms).
 */
export function decideStart(
  job: unknown,
  usage: unknown,
  now: number,
  limit: number,
): StartDecision {
  const day = dayKey(new Date(now));
  const count = countOn(usage, day);
  if (isObj(job)) {
    if (job.status === 'done') {
      const result = jobResult(job.result);
      if (result) return { kind: 'done', result, remaining: Math.max(0, limit - count) };
    }
    if (job.status === 'running' && isNum(job.startedAt) && now - job.startedAt < STALE_JOB_MS) {
      return { kind: 'running' };
    }
  }
  if (count >= limit) return { kind: 'limit' };
  return { kind: 'start', count: count + 1, remaining: limit - count - 1 };
}

/**
 * Gives back a picture that was not made through no fault of the request (the model was busy,
 * the upload was missing): the count it started on `day` goes down by one. Null when there is
 * nothing to give back (another day, or already 0).
 */
export function refundUsage(usage: unknown, day: string): { day: string; count: number } | null {
  const count = countOn(usage, day);
  return count > 0 ? { day, count: count - 1 } : null;
}
