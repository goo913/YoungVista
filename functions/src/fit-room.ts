/**
 * `fitRoom({ scanId })`: starts the server fit of a turn-around scan (packages/core/src/turn-scan.ts).
 *
 * 1. The caller must be signed in (Firebase Auth; no App Check yet), and
 *    `users/{uid}/scans/{scanId}/capture.json` must exist and be theirs (its `ownerId` and
 *    `scanId` match). A `scanFits/{scanId}` owned by someone else is never touched.
 * 2. `scanFits/{scanId}` is created or reset to `{ ownerId, status: 'queued' }` before anything
 *    else happens, so the phone, already listening, sees the fit start.
 * 3. The Cloud Run job `room-fit` (services/room-fit) is executed with `SCAN_ID`, `OWNER_ID` and
 *    `FIT_RUN_ID` as environment overrides. The call returns as soon as the execution starts; the
 *    job moves the document to 'running' and then 'done' or 'failed'.
 *
 * Every call starts a new fit, also for a scan that is queued, running or failed (the phone's
 * "Try again"): the document is reset and gets a new `info.runId`, and an older execution that is
 * still going stops writing to it (the job only writes while the run id is its own).
 * The functions' runtime account needs `roles/run.jobsExecutorWithOverrides` on the job
 * (docs/server.md).
 */
import { randomUUID } from 'node:crypto';
import { v2 as run } from '@google-cloud/run';
import { CAPTURE_VERSION, captureFile } from '@youngvista/core';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

export const ROOM_FIT_JOB = 'room-fit';
export const ROOM_FIT_REGION = 'us-central1';
/** Scan ids: what the phone generates (Firestore auto ids, UUIDs), safe in paths and doc ids. */
const SCAN_ID = /^[A-Za-z0-9_-]{8,128}$/;

/** The environment one execution of the job gets. */
export interface RoomFitEnv {
  SCAN_ID: string;
  OWNER_ID: string;
  /** The fit this execution belongs to (`info.runId`): it writes nothing once another replaces it. */
  FIT_RUN_ID: string;
}

/** What `startFit` needs from Firebase and Cloud Run (replaced in tests). */
export interface FitRoomDeps {
  /** The capture manifest's text, or null when the file does not exist. */
  readManifest(path: string): Promise<string | null>;
  /** The owner of `scanFits/{scanId}`, or null when there is no such document. */
  getFitOwner(scanId: string): Promise<unknown>;
  /** Creates or replaces `scanFits/{scanId}`. */
  resetFit(scanId: string, doc: Record<string, unknown>): Promise<void>;
  /** Merges fields into `scanFits/{scanId}`. */
  updateFit(scanId: string, fields: Record<string, unknown>): Promise<void>;
  /** Starts an execution of the job; resolves with its name once it has started. */
  runJob(env: RoomFitEnv): Promise<string | undefined>;
  now(): number;
  newRunId(): string;
}

export interface FitRoomResult {
  scanId: string;
  status: 'queued';
  runId: string;
}

/** The checks and the start, without Firebase: `fitRoom` wires in the real dependencies. */
export async function startFit(
  deps: FitRoomDeps,
  uid: string | undefined,
  data: unknown,
): Promise<FitRoomResult> {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const scanId = (data as { scanId?: unknown } | null)?.scanId;
  if (typeof scanId !== 'string' || !SCAN_ID.test(scanId)) {
    throw new HttpsError('invalid-argument', 'Send the scan to measure.');
  }

  const text = await deps.readManifest(captureFile(uid, scanId));
  if (text === null) {
    throw new HttpsError('not-found', 'The scan has not finished uploading. Try again.');
  }
  let manifest: { version?: unknown; scanId?: unknown; ownerId?: unknown };
  try {
    manifest = JSON.parse(text) as typeof manifest;
  } catch {
    throw new HttpsError('failed-precondition', 'The scan could not be read. Scan the room again.');
  }
  if (!manifest || typeof manifest !== 'object' || manifest.ownerId !== uid) {
    throw new HttpsError('permission-denied', 'This scan belongs to someone else.');
  }
  if (manifest.scanId !== scanId) {
    throw new HttpsError('failed-precondition', 'The scan could not be read. Scan the room again.');
  }
  if (manifest.version !== CAPTURE_VERSION) {
    throw new HttpsError('failed-precondition', 'Update the app, then scan the room again.');
  }

  const owner = await deps.getFitOwner(scanId);
  if (owner !== null && owner !== uid) {
    throw new HttpsError('permission-denied', 'This scan belongs to someone else.');
  }

  const runId = deps.newRunId();
  await deps.resetFit(scanId, {
    ownerId: uid,
    status: 'queued',
    info: { queuedAt: deps.now(), runId },
  });
  let execution: string | undefined;
  try {
    execution = await deps.runJob({ SCAN_ID: scanId, OWNER_ID: uid, FIT_RUN_ID: runId });
  } catch (err) {
    console.error('fitRoom: could not start the room-fit job', err);
    await deps.updateFit(scanId, {
      status: 'failed',
      error: "The server couldn't start measuring the room. Try again, or mark the walls by hand.",
      'info.code': 'start',
    });
    throw new HttpsError('unavailable', "The server couldn't start measuring. Try again.");
  }
  if (execution) await deps.updateFit(scanId, { 'info.execution': execution });
  return { scanId, status: 'queued', runId };
}

/**
 * Starts an execution of the room-fit job for one scan (Cloud Run Admin API `runJob` with
 * per-execution environment overrides); resolves with the execution's name once it has started,
 * without waiting for it to finish.
 */
export async function runRoomFit(
  client: run.JobsClient,
  project: string,
  env: RoomFitEnv,
): Promise<string | undefined> {
  const [operation] = await client.runJob({
    name: client.jobPath(project, ROOM_FIT_REGION, ROOM_FIT_JOB),
    overrides: {
      containerOverrides: [
        {
          env: [
            { name: 'SCAN_ID', value: env.SCAN_ID },
            { name: 'OWNER_ID', value: env.OWNER_ID },
            { name: 'FIT_RUN_ID', value: env.FIT_RUN_ID },
          ],
        },
      ],
      taskCount: 1,
    },
  });
  // The operation's metadata is the Execution it started.
  const meta = operation.metadata as { name?: string } | null | undefined;
  return meta?.name ?? operation.name ?? undefined;
}

let jobs: run.JobsClient | undefined;

/** The real dependencies: Storage and Firestore through the Admin SDK, Cloud Run Admin API. */
export function firebaseDeps(): FitRoomDeps {
  const db = getFirestore();
  const fits = db.collection('scanFits');
  const project = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'young-vista';
  return {
    async readManifest(path) {
      const file = getStorage().bucket().file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [buf] = await file.download();
      return buf.toString('utf8');
    },
    async getFitOwner(scanId) {
      const snap = await fits.doc(scanId).get();
      return snap.exists ? (snap.get('ownerId') as unknown) : null;
    },
    async resetFit(scanId, doc) {
      await fits.doc(scanId).set(doc);
    },
    async updateFit(scanId, fields) {
      await fits.doc(scanId).update(fields);
    },
    runJob(env) {
      jobs ??= new run.JobsClient();
      return runRoomFit(jobs, project, env);
    },
    now: () => Date.now(),
    newRunId: () => randomUUID(),
  };
}

// Region and instances are set here, not left to index.ts's setGlobalOptions: index.ts re-exports
// this module, and ESM evaluates it before index.ts's own code runs.
export const fitRoom = onCall(
  { region: ROOM_FIT_REGION, maxInstances: 10, timeoutSeconds: 60, memory: '256MiB' },
  (request) => startFit(firebaseDeps(), request.auth?.uid, request.data),
);
