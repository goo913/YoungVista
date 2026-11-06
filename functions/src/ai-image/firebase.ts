/**
 * What `makeAiPicture` touches, for real: Firestore (rooms, their pictures, and the usage and job
 * records under `aiUsage/{uid}`, which the rules keep server-only), Storage (the default bucket),
 * the catalog and its product pictures on Hosting, and the model on Vertex AI.
 */
import { randomUUID } from 'node:crypto';
import { designFromFirestore, roomFromFirestore } from '@youngvista/core';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { AI_IMAGE_CONFIG, type AiImageConfig } from './config';
import { loadCatalog, loadThumb } from './hosting';
import type { AiImageDeps } from './make-picture';
import { vertexImageModel, type ImageModel } from './model';
import { dayKey, decideStart, refundUsage } from './usage';

/** Bigger files are not read (the Storage rules allow 10 MB uploads). */
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

const notFound = (error: unknown) => (error as { code?: unknown })?.code === 404;

let model: ImageModel | null = null;

export function firebaseDeps(config: AiImageConfig = AI_IMAGE_CONFIG): AiImageDeps {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const usageRef = (uid: string) => db.collection('aiUsage').doc(uid);
  const jobRef = (uid: string, pictureId: string) =>
    usageRef(uid).collection('jobs').doc(pictureId);
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'young-vista';
  model ??= vertexImageModel(config, project);

  return {
    config,
    now: () => Date.now(),
    serverTime: () => FieldValue.serverTimestamp(),
    model,
    log: logger,
    catalog: loadCatalog,
    thumb: loadThumb,

    async readRoom(roomId) {
      const snap = await db.collection('rooms').doc(roomId).get();
      if (!snap.exists) return null;
      const data = snap.data() ?? {};
      return {
        ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
        room: roomFromFirestore(data.room),
        design: designFromFirestore(data.design),
      };
    },

    startJob(uid, pictureId, job) {
      return db.runTransaction(async (tx) => {
        const [usage, current] = await Promise.all([
          tx.get(usageRef(uid)),
          tx.get(jobRef(uid, pictureId)),
        ]);
        const now = Date.now();
        const decision = decideStart(current.data() ?? null, usage.data() ?? null, now, job.limit);
        if (decision.kind === 'start') {
          const day = dayKey(new Date(now));
          tx.set(usageRef(uid), {
            day,
            count: decision.count,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(jobRef(uid, pictureId), {
            status: 'running',
            roomId: job.roomId,
            use: job.use,
            day,
            startedAt: now,
          });
        }
        return decision;
      });
    },

    finishJob(uid, pictureId, end) {
      return db.runTransaction(async (tx) => {
        const job = await tx.get(jobRef(uid, pictureId));
        const usage = await tx.get(usageRef(uid));
        if (end.status === 'failed' && end.refund) {
          const day = job.get('day');
          const back = typeof day === 'string' ? refundUsage(usage.data() ?? null, day) : null;
          if (back) tx.set(usageRef(uid), back, { merge: true });
        }
        tx.set(
          jobRef(uid, pictureId),
          end.status === 'done'
            ? { status: 'done', result: end.result, finishedAt: Date.now() }
            : { status: 'failed', reason: end.reason, finishedAt: Date.now() },
          { merge: true },
        );
      });
    },

    async readFile(path) {
      const file = bucket.file(path);
      try {
        const [meta] = await file.getMetadata();
        if (Number(meta.size) > MAX_SOURCE_BYTES) return null;
        const [contents] = await file.download();
        return new Uint8Array(contents);
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },

    async writeFile(path, bytes, contentType) {
      await bucket.file(path).save(Buffer.from(bytes), {
        resumable: false,
        contentType,
        metadata: {
          cacheControl: 'private, max-age=31536000',
          // What the apps' getDownloadURL() hands out, as for an upload from the apps.
          metadata: { firebaseStorageDownloadTokens: randomUUID() },
        },
      });
    },

    async deleteFile(path) {
      try {
        await bucket.file(path).delete();
      } catch (error) {
        if (!notFound(error)) throw error;
      }
    },

    writePicture(roomId, pictureId, doc) {
      return db.runTransaction(async (tx) => {
        const room = db.collection('rooms').doc(roomId);
        if (!(await tx.get(room)).exists) return false;
        tx.set(room.collection('pictures').doc(pictureId), doc);
        return true;
      });
    },
  };
}
