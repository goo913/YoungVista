import { describe, expect, it, vi } from 'vitest';
import { captureFile } from '@youngvista/core';
import { HttpsError } from 'firebase-functions/v2/https';
import { runRoomFit, startFit, type FitRoomDeps } from '../src/fit-room';

const UID = 'alice';
const SCAN = 'scan-0001abcd';

function manifest(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ version: 1, scanId: SCAN, ownerId: UID, frames: [], ...over });
}

function fakeDeps(opts: {
  manifest?: string | null;
  fit?: Record<string, unknown> | null;
  runFails?: boolean;
}) {
  const docs = new Map<string, Record<string, unknown>>();
  if (opts.fit) docs.set(SCAN, opts.fit);
  let n = 0;
  const deps: FitRoomDeps = {
    readManifest: vi.fn(async (path: string) =>
      path === captureFile(UID, SCAN)
        ? opts.manifest === undefined
          ? manifest()
          : opts.manifest
        : null,
    ),
    getFitOwner: vi.fn(async (scanId: string) => docs.get(scanId)?.ownerId ?? null),
    resetFit: vi.fn(async (scanId: string, doc: Record<string, unknown>) => {
      docs.set(scanId, doc);
    }),
    updateFit: vi.fn(async (scanId: string, fields: Record<string, unknown>) => {
      docs.set(scanId, { ...docs.get(scanId), ...fields });
    }),
    runJob: vi.fn(async () => {
      if (opts.runFails) throw new Error('PERMISSION_DENIED');
      return 'projects/young-vista/locations/us-central1/jobs/room-fit/executions/room-fit-abc';
    }),
    now: () => 1_000_000_000,
    newRunId: () => `run-${++n}`,
  };
  return { deps, docs };
}

async function rejection(p: Promise<unknown>): Promise<HttpsError> {
  try {
    await p;
  } catch (e) {
    return e as HttpsError;
  }
  throw new Error('expected a rejection');
}

describe('fitRoom', () => {
  it('writes the fit as queued, then starts the job with the scan as overrides', async () => {
    const { deps, docs } = fakeDeps({});
    const res = await startFit(deps, UID, { scanId: SCAN });
    expect(res).toEqual({ scanId: SCAN, status: 'queued', runId: 'run-1' });
    expect(deps.resetFit).toHaveBeenCalledWith(SCAN, {
      ownerId: UID,
      status: 'queued',
      info: { queuedAt: 1_000_000_000, runId: 'run-1' },
    });
    expect(deps.runJob).toHaveBeenCalledWith({
      SCAN_ID: SCAN,
      OWNER_ID: UID,
      FIT_RUN_ID: 'run-1',
    });
    // The queued document exists before the job is started.
    const resetOrder = vi.mocked(deps.resetFit).mock.invocationCallOrder[0]!;
    const runOrder = vi.mocked(deps.runJob).mock.invocationCallOrder[0]!;
    expect(resetOrder).toBeLessThan(runOrder);
    expect(docs.get(SCAN)?.['info.execution']).toMatch(/executions\/room-fit-abc$/);
  });

  it('needs a signed-in user and a valid scan id', async () => {
    const { deps } = fakeDeps({});
    expect((await rejection(startFit(deps, undefined, { scanId: SCAN }))).code).toBe(
      'unauthenticated',
    );
    for (const bad of [undefined, 42, 'short', '../../etc/passwd', 'a/b/c/d/e/f/g/h']) {
      expect((await rejection(startFit(deps, UID, { scanId: bad }))).code).toBe('invalid-argument');
    }
    expect(deps.runJob).not.toHaveBeenCalled();
  });

  it("refuses a scan that has not uploaded or is not the caller's", async () => {
    let f = fakeDeps({ manifest: null });
    expect((await rejection(startFit(f.deps, UID, { scanId: SCAN }))).code).toBe('not-found');
    f = fakeDeps({ manifest: manifest({ ownerId: 'mallory' }) });
    expect((await rejection(startFit(f.deps, UID, { scanId: SCAN }))).code).toBe(
      'permission-denied',
    );
    f = fakeDeps({ manifest: '{not json' });
    expect((await rejection(startFit(f.deps, UID, { scanId: SCAN }))).code).toBe(
      'failed-precondition',
    );
    f = fakeDeps({ manifest: manifest({ version: 2 }) });
    expect((await rejection(startFit(f.deps, UID, { scanId: SCAN }))).code).toBe(
      'failed-precondition',
    );
    // Another user's fit document with the same id is never overwritten.
    f = fakeDeps({ fit: { ownerId: 'mallory', status: 'done' } });
    expect((await rejection(startFit(f.deps, UID, { scanId: SCAN }))).code).toBe(
      'permission-denied',
    );
    expect(f.deps.resetFit).not.toHaveBeenCalled();
  });

  it('starts again on every call: after a failure, and while a fit is still running', async () => {
    for (const status of ['failed', 'running', 'queued', 'done']) {
      const f = fakeDeps({ fit: { ownerId: UID, status, info: { runId: 'old' }, error: 'x' } });
      const res = await startFit(f.deps, UID, { scanId: SCAN });
      expect(res.status).toBe('queued');
      expect(f.deps.runJob).toHaveBeenCalledTimes(1);
      const doc = f.docs.get(SCAN)!;
      expect(doc.status).toBe('queued');
      expect(doc.error).toBeUndefined();
      expect((doc.info as { runId: string }).runId).toBe(res.runId);
    }
  });

  it('marks the fit failed in plain words when the job cannot start', async () => {
    const { deps, docs } = fakeDeps({ runFails: true });
    expect((await rejection(startFit(deps, UID, { scanId: SCAN }))).code).toBe('unavailable');
    const doc = docs.get(SCAN)!;
    expect(doc.status).toBe('failed');
    expect(String(doc.error)).not.toMatch(/gemini|google|vertex|moge|cloud run/i);
  });
});

describe('runRoomFit', () => {
  it('runs one task of room-fit with the scan as environment overrides', async () => {
    const requests: unknown[] = [];
    const client = {
      jobPath: (p: string, l: string, j: string) => `projects/${p}/locations/${l}/jobs/${j}`,
      runJob: async (req: unknown) => {
        requests.push(req);
        return [{ name: 'operations/op-1', metadata: { name: 'executions/room-fit-x1' } }];
      },
    } as unknown as Parameters<typeof runRoomFit>[0];
    const env = { SCAN_ID: SCAN, OWNER_ID: UID, FIT_RUN_ID: 'run-9' };
    expect(await runRoomFit(client, 'young-vista', env)).toBe('executions/room-fit-x1');
    expect(requests).toEqual([
      {
        name: 'projects/young-vista/locations/us-central1/jobs/room-fit',
        overrides: {
          containerOverrides: [
            {
              env: [
                { name: 'SCAN_ID', value: SCAN },
                { name: 'OWNER_ID', value: UID },
                { name: 'FIT_RUN_ID', value: 'run-9' },
              ],
            },
          ],
          taskCount: 1,
        },
      },
    ]);
  });
});
