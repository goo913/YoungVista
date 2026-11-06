/**
 * Final pictures taken on the phone, as plain data: their ids, where they go, and the queue that
 * keeps each one on the phone until it is uploaded. The picture's JPEG goes to Storage at core's
 * `picturePath` and its record to `rooms/{roomId}/pictures/{pictureId}` (core's
 * `buildPictureDoc`): the website's gallery (apps/web/src/lib/pictures.ts) reads exactly these,
 * and the Storage and Firestore rules allow them (images under 10 MB in users/{uid}/, records by
 * the room's owner). No Firebase here, so it is unit tested; lib/pictures.ts does the work.
 */
import {
  buildPictureDoc,
  picturePath,
  type AiPictureUse,
  type CapturePlatform,
  type PictureDoc,
  type RandomBytes,
} from '@youngvista/core';

/** Picture ids look like Firestore's own: 20 letters and digits (about 119 bits). */
export const PICTURE_ID_LENGTH = 20;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Bytes at or above this are skipped so every character is equally likely (248 = 4 × 62). */
const BYTE_LIMIT = 248;

/** A new picture id from a secure random source (expo-crypto's `getRandomBytes`). */
export function newPictureId(randomBytes: RandomBytes): string {
  let id = '';
  for (let round = 0; id.length < PICTURE_ID_LENGTH; round++) {
    if (round > 64) throw new Error('The random source keeps returning unusable bytes.');
    const bytes = randomBytes(32);
    if (!bytes || bytes.length === 0) throw new Error('The random source returned no bytes.');
    for (const b of bytes) {
      if (b >= BYTE_LIMIT) continue;
      id += ALPHABET[b % ALPHABET.length];
      if (id.length === PICTURE_ID_LENGTH) break;
    }
  }
  return id;
}

/** True for an id `newPictureId` can make: safe in a Storage path and a Firestore document id. */
export function isPictureId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{20}$/.test(value);
}

/** The Storage rules refuse anything bigger (storage.rules). */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

/** A picture taken on this phone that is not completely on the server yet. */
export interface PendingPicture {
  id: string;
  /** The signed-in user who took it: the owner of the room. */
  uid: string;
  roomId: string;
  /** `file://` URI of the JPEG, kept on the phone until the server has it. */
  file: string;
  /** Pixels. */
  width: number;
  height: number;
  platform: CapturePlatform;
  /** When it was taken (ms). */
  takenAt: number;
  /** 'upload': the JPEG is not in Storage yet. 'record': it is; the Firestore record is not. */
  step: 'upload' | 'record';
  /** Failed tries since the last success. */
  attempts: number;
  /** After a failure: not before this time (ms). Null: as soon as possible. */
  retryAt: number | null;
  /** Why the last try failed, in words, or null. */
  error: string | null;
  /** Trying again cannot help (the room was deleted, or the file is gone). */
  stuck: boolean;
}

export interface NewPicture {
  id: string;
  uid: string;
  roomId: string;
  file: string;
  width: number;
  height: number;
  platform: CapturePlatform;
  takenAt: number;
}

export function pendingPicture(input: NewPicture): PendingPicture {
  return {
    ...input,
    width: Math.round(input.width),
    height: Math.round(input.height),
    step: 'upload',
    attempts: 0,
    retryAt: null,
    error: null,
    stuck: false,
  };
}

/** Where its JPEG goes in Storage: `users/{uid}/rooms/{roomId}/pictures/{pictureId}.jpg`. */
export const pictureStoragePath = (p: Pick<PendingPicture, 'uid' | 'roomId' | 'id'>): string =>
  picturePath(p.uid, p.roomId, p.id);

/** Its `rooms/{roomId}/pictures/{pictureId}` record. Pass a server timestamp as `createdAt`. */
export function pictureRecord<TTime>(p: PendingPicture, createdAt: TTime): PictureDoc<TTime> {
  return buildPictureDoc({
    uid: p.uid,
    roomId: p.roomId,
    pictureId: p.id,
    width: p.width,
    height: p.height,
    platform: p.platform,
    createdAt,
  });
}

/* The queue: the pictures not on the server yet, oldest first. */

export type PictureQueue = readonly PendingPicture[];

/** First pause after a failure (ms); it doubles with each failure up to `MAX_RETRY_MS`. */
export const FIRST_RETRY_MS = 5_000;
export const MAX_RETRY_MS = 5 * 60_000;

export function retryDelayMs(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(FIRST_RETRY_MS * 2 ** (n - 1), MAX_RETRY_MS);
}

/** Adds a picture (or replaces the one with its id), keeping the queue oldest first. */
export function addPicture(queue: PictureQueue, picture: PendingPicture): PendingPicture[] {
  return [...queue.filter((p) => p.id !== picture.id), picture].sort(
    (a, b) => a.takenAt - b.takenAt,
  );
}

export function removePicture(queue: PictureQueue, id: string): PendingPicture[] {
  return queue.filter((p) => p.id !== id);
}

/** Its JPEG is in Storage: next comes its record, at once. */
export function pictureUploaded(queue: PictureQueue, id: string): PendingPicture[] {
  return queue.map((p) =>
    p.id === id ? { ...p, step: 'record', attempts: 0, retryAt: null, error: null } : p,
  );
}

/**
 * What a failed upload or record means: the connection ('offline', try again soon), something
 * that may pass ('retry'), or something trying again cannot fix ('gone': the room was deleted or
 * belongs to another account, the file is missing or too big).
 */
export type PictureFailure = 'offline' | 'retry' | 'gone';

/** Firebase error codes (Storage's `storage/…` and Firestore's) to what they mean here. */
export function pictureFailure(code: string | null | undefined): PictureFailure {
  switch (code) {
    case 'storage/retry-limit-exceeded':
    case 'storage/canceled':
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
    case 'auth/network-request-failed':
      return 'offline';
    case 'permission-denied':
    case 'not-found':
    case 'storage/unauthorized':
    case 'storage/invalid-argument':
    case 'picture/file-missing':
    case 'picture/too-big':
      return 'gone';
    default:
      return 'retry';
  }
}

export const FAILURE_TEXT: Record<PictureFailure, string> = {
  offline: 'Waiting for a connection.',
  retry: 'The upload did not finish. Trying again soon.',
  gone: 'This picture cannot be uploaded (the room may have been deleted). It is still in Photos.',
};

/** A try failed: count it and wait before the next one (or stop, when trying cannot help). */
export function pictureFailed(
  queue: PictureQueue,
  id: string,
  failure: PictureFailure,
  now: number,
): PendingPicture[] {
  return queue.map((p) => {
    if (p.id !== id) return p;
    const attempts = p.attempts + 1;
    const stuck = failure === 'gone';
    return {
      ...p,
      attempts,
      stuck,
      retryAt: stuck ? null : now + retryDelayMs(attempts),
      error: FAILURE_TEXT[failure],
    };
  });
}

/** "Try again" (or the connection came back): everything waiting is due now. */
export function retryAllNow(queue: PictureQueue): PictureQueue {
  if (!queue.some((p) => p.retryAt !== null && !p.stuck)) return queue;
  return queue.map((p) => (p.retryAt !== null && !p.stuck ? { ...p, retryAt: null } : p));
}

/** The picture to work on next: the oldest one that is due, or null. */
export function nextDue(queue: PictureQueue, now: number): PendingPicture | null {
  return queue.find((p) => !p.stuck && (p.retryAt === null || p.retryAt <= now)) ?? null;
}

/** When the next picture becomes due (ms), or null when none is waiting for a time. */
export function nextWakeAt(queue: PictureQueue): number | null {
  let soonest: number | null = null;
  for (const p of queue) {
    if (p.stuck || p.retryAt === null) continue;
    if (soonest === null || p.retryAt < soonest) soonest = p.retryAt;
  }
  return soonest;
}

/* Kept on the phone (AsyncStorage) between launches. */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPlatform = (v: unknown): v is CapturePlatform =>
  v === 'ios' || v === 'android' || v === 'web';

export function queueToText(queue: PictureQueue): string {
  return JSON.stringify({ v: 1, pictures: queue });
}

/** Reads a queue written by `queueToText`: only `uid`'s usable entries; empty when unreadable. */
export function queueFromText(text: string | null | undefined, uid: string): PendingPicture[] {
  if (!text) return [];
  try {
    const data = JSON.parse(text) as { v?: unknown; pictures?: unknown };
    if (data.v !== 1 || !Array.isArray(data.pictures)) return [];
    return data.pictures.flatMap((raw: unknown): PendingPicture[] => {
      if (typeof raw !== 'object' || raw === null) return [];
      const p = raw as Record<string, unknown>;
      if (!isPictureId(p.id) || p.uid !== uid) return [];
      if (typeof p.roomId !== 'string' || !p.roomId || p.roomId.includes('/')) return [];
      if (typeof p.file !== 'string' || !p.file.startsWith('file://')) return [];
      if (!isNum(p.width) || !isNum(p.height) || p.width <= 0 || p.height <= 0) return [];
      if (!isNum(p.takenAt)) return [];
      return [
        {
          id: p.id,
          uid,
          roomId: p.roomId,
          file: p.file,
          width: Math.round(p.width),
          height: Math.round(p.height),
          platform: isPlatform(p.platform) ? p.platform : 'ios',
          takenAt: p.takenAt,
          step: p.step === 'record' ? 'record' : 'upload',
          attempts: isNum(p.attempts) && p.attempts > 0 ? Math.floor(p.attempts) : 0,
          retryAt: isNum(p.retryAt) ? p.retryAt : null,
          error: typeof p.error === 'string' ? p.error : null,
          stuck: p.stuck === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

/* What the room page shows. */

/** What core's `pictureFromFirestore` says about a picture made by AI (components/ai). */
export interface AiPictureFields {
  kind?: 'ai';
  /** The image it was made from, in Storage. */
  sourcePath?: string;
  sourceUse?: AiPictureUse;
}

/** A picture of the room on the server (its `rooms/{roomId}/pictures/{id}` record). */
export interface UploadedPicture extends AiPictureFields {
  id: string;
  /** Null while the server's timestamp is still on its way. */
  createdAt: Date | null;
  storagePath: string;
  width: number;
  height: number;
}

export interface StripPicture extends AiPictureFields {
  id: string;
  /** When it was taken or uploaded (ms), for sorting. */
  time: number;
  width: number;
  height: number;
  /** Its JPEG on this phone, if it is still here. */
  file: string | null;
  /** Its JPEG in Storage, once it is uploaded. */
  storagePath: string | null;
  /** Not completely on the server yet. */
  pending: PendingPicture | null;
}

/** A picture made by AI: only the server makes them, so they are never waiting on the phone. */
export const isAiPicture = (p: AiPictureFields): boolean => p.kind === 'ai';

/**
 * The room's pictures, newest first: those still on their way from this phone, then (and merged
 * with) those on the server. `localFile` says where a picture's JPEG is kept on this phone after
 * its upload, or null.
 */
export function stripPictures(
  roomId: string,
  queue: PictureQueue,
  uploaded: readonly UploadedPicture[],
  localFile: (id: string) => string | null,
): StripPicture[] {
  const byId = new Map<string, StripPicture>();
  for (const u of uploaded) {
    byId.set(u.id, {
      id: u.id,
      time: u.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
      width: u.width,
      height: u.height,
      file: localFile(u.id),
      storagePath: u.storagePath,
      pending: null,
      ...(u.kind === 'ai'
        ? { kind: 'ai' as const, sourcePath: u.sourcePath, sourceUse: u.sourceUse }
        : {}),
    });
  }
  for (const p of queue) {
    if (p.roomId !== roomId) continue;
    const known = byId.get(p.id);
    byId.set(p.id, {
      id: p.id,
      time: p.takenAt,
      width: p.width,
      height: p.height,
      file: p.file,
      storagePath: known?.storagePath ?? null,
      pending: p,
    });
  }
  return [...byId.values()].sort((a, b) => b.time - a.time);
}

/* Right after "Take picture". */

/** How saving to Photos went: still going, saved, not allowed, or failed. */
export type PhotosState = 'saving' | 'saved' | 'denied' | 'failed';

/** Where the new picture's upload is. */
export type ShotUpload = 'uploading' | 'waiting' | 'uploaded' | 'failed';

/**
 * What the queue says about a picture: being sent, waiting (also while a try runs without a
 * connection, or has stalled: the phone keeps trying by itself), done, or failed for good.
 */
export function shotUpload(
  queue: PictureQueue,
  active: { id: string; slow: boolean } | null,
  pictureId: string,
  online: boolean,
): ShotUpload {
  const p = queue.find((q) => q.id === pictureId);
  if (!p) return 'uploaded';
  if (p.stuck) return 'failed';
  return active?.id === pictureId && online && !active.slow ? 'uploading' : 'waiting';
}

const PHOTOS_TEXT: Record<PhotosState, string> = {
  saving: 'Saving to Photos…',
  saved: 'Saved to Photos.',
  denied: 'Not saved to Photos: allow it in Settings.',
  failed: 'Could not save it to Photos.',
};

const UPLOAD_TEXT: Record<ShotUpload, string> = {
  uploading: 'Uploading to your room…',
  waiting: 'It will upload when the connection is back.',
  uploaded: 'It is on the website too.',
  failed: 'It could not be uploaded.',
};

/** The lines under "Picture taken". `incomplete`: some furniture had not finished loading. */
export function shotText(photos: PhotosState, upload: ShotUpload, incomplete: boolean): string {
  const lines = [PHOTOS_TEXT[photos], UPLOAD_TEXT[upload]];
  if (incomplete) lines.push('Some furniture was still loading and shows as grey boxes.');
  return lines.join(' ');
}

/** The notice can go once nothing is still happening. */
export const shotSettled = (photos: PhotosState, upload: ShotUpload): boolean =>
  photos !== 'saving' && upload !== 'uploading';

/** One line of the "Picture saved" card: done (a tick), still going (a spinner), or a problem. */
export interface ShotRow {
  tone: 'done' | 'busy' | 'warn';
  text: string;
}

const PHOTOS_ROW: Record<PhotosState, ShotRow> = {
  saving: { tone: 'busy', text: 'Saving to Photos…' },
  saved: { tone: 'done', text: 'Saved to Photos' },
  denied: { tone: 'warn', text: 'Not in Photos: allow YoungVista to add photos in Settings' },
  failed: { tone: 'warn', text: 'Could not save it to Photos' },
};

const ROOM_ROW: Record<ShotUpload, ShotRow> = {
  uploading: { tone: 'busy', text: 'Saved in this room’s pictures. Uploading to the website…' },
  waiting: {
    tone: 'busy',
    text: 'Saved in this room’s pictures. It goes to the website when the connection is back.',
  },
  uploaded: { tone: 'done', text: 'Saved in this room’s pictures and on the website' },
  failed: { tone: 'warn', text: 'Kept on this phone, but it could not be uploaded' },
};

/**
 * Where the new picture went, one line each: Photos, and this room (its pictures on the room
 * page, and the website once uploaded).
 */
export const shotRows = (photos: PhotosState, upload: ShotUpload): [ShotRow, ShotRow] => [
  PHOTOS_ROW[photos],
  ROOM_ROW[upload],
];

/**
 * Where an upload is: `text` fits on the picture's tile, `detail` says it in a sentence (the
 * picture viewer, and screen readers).
 */
export interface UploadView {
  kind: 'uploading' | 'waiting' | 'failed';
  text: string;
  detail: string;
}

/**
 * The words on a picture that is not on the server yet. `progress` is the running upload's share
 * done (0 to 1), or null when this picture is not being uploaded now; `slow` when the running
 * upload has made no progress for a while.
 */
export function uploadView(
  p: PendingPicture,
  progress: number | null,
  slow: boolean,
  online: boolean,
): UploadView {
  if (p.stuck) {
    return { kind: 'failed', text: 'Not uploaded', detail: p.error ?? FAILURE_TEXT.gone };
  }
  if (progress !== null && online) {
    if (p.step === 'record') {
      return { kind: 'uploading', text: 'Saving…', detail: 'Uploaded. Adding it to the room…' };
    }
    if (slow) {
      return {
        kind: 'uploading',
        text: 'Slow upload',
        detail: 'Uploading slowly: the connection is weak.',
      };
    }
    const percent = Math.round(progress * 100);
    return {
      kind: 'uploading',
      text: `Uploading ${percent}%`,
      detail: `Uploading: ${percent}% done.`,
    };
  }
  if (!online) {
    return {
      kind: 'waiting',
      text: 'No connection',
      detail: 'Waiting for a connection. It uploads by itself when the connection is back.',
    };
  }
  if (p.attempts > 0) {
    return { kind: 'waiting', text: 'Retrying soon', detail: FAILURE_TEXT.retry };
  }
  return { kind: 'waiting', text: 'Waiting', detail: 'Waiting to upload.' };
}
