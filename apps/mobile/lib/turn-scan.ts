/**
 * The turn-around scan's server side, as the phone sees it (packages/core/src/turn-scan.ts):
 *
 * 1. the keyframes and `capture.json` go to Storage under `captureFolder(uid, scanId)`
 *    (`captureSender`; storage.rules let the owner write JPEGs and that one JSON file there);
 * 2. the callable `fitRoom({ scanId })` (us-central1) queues the fit (`requestRoomFit`);
 * 3. the fit job writes `scanFits/{scanId}`, which the phone listens to (`watchRoomFit`);
 * 4. a saved room keeps the panoramas as `rooms/{id}.tour` (`saveRoomTour`), and deleting the
 *    room deletes the scan's folder (`deleteCaptureFolder`, from lib/room-delete.ts).
 */
import {
  captureFolder,
  scanFitFromFirestore,
  type RoomTour,
  type ScanFitDoc,
} from '@youngvista/core';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import {
  deleteObject,
  listAll,
  ref,
  uploadBytesResumable,
  type StorageReference,
} from 'firebase/storage';
import type { SendFile } from '@/scan/turn/upload';
import { errorCode } from './auth-errors';
import { emulatorHost, firebaseApp, firebaseStorage, firestore } from './firebase';

/** A new scan id (a Firestore id, so it is a valid `scanFits` document id). */
export const newScanId = (): string => doc(collection(firestore(), 'scanFits')).id;

/** A local file as a Blob for Firebase Storage (React Native reads `file://` URIs this way). */
function fileBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () =>
      reject(Object.assign(new Error('The file is unreadable.'), { code: 'capture/file-missing' }));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/** Sends one capture file to `captureFolder(uid, scanId)/<its path>` (scan/turn/upload.ts). */
export function captureSender(uid: string, scanId: string): SendFile {
  return async (file, onBytes, handle) => {
    const blob = await fileBlob(file.uri);
    try {
      const target = ref(firebaseStorage(), `${captureFolder(uid, scanId)}/${file.path}`);
      const task = uploadBytesResumable(target, blob, { contentType: file.contentType });
      handle.onCancel = () => task.cancel();
      if (handle.cancelled) task.cancel();
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', (snap) => onBytes(snap.bytesTransferred), reject, resolve);
      });
    } finally {
      (blob as Blob & { close?: () => void }).close?.();
    }
  };
}

let functions: Functions | null = null;

function cloudFunctions(): Functions {
  if (!functions) {
    functions = getFunctions(firebaseApp(), 'us-central1');
    if (emulatorHost) {
      try {
        // Firebase's default port for the Functions emulator.
        connectFunctionsEmulator(functions, emulatorHost, 5001);
      } catch {
        // Fast Refresh: already connected.
      }
    }
  }
  return functions;
}

/** Asks the server to fit the room from an uploaded capture. */
export async function requestRoomFit(scanId: string): Promise<void> {
  const fitRoom = httpsCallable<{ scanId: string }, unknown>(cloudFunctions(), 'fitRoom', {
    timeout: 60_000,
  });
  await fitRoom({ scanId });
}

/** How often to look again for a fit the server has not written yet (ms). */
const MISSING_RETRY_MS = 2_000;

/**
 * Listens to `scanFits/{scanId}`. Until the server writes it the document is missing, which the
 * rules (they read its owner) answer with "permission denied": that only means "not yet", so it
 * looks again shortly. Returns the function that stops listening.
 */
export function watchRoomFit(
  scanId: string,
  onFit: (fit: ScanFitDoc | null) => void,
  onError: (error: unknown) => void,
): () => void {
  let live = true;
  let stop: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listen = () => {
    stop = onSnapshot(
      doc(firestore(), 'scanFits', scanId),
      (snap) => {
        if (live) onFit(snap.exists() ? scanFitFromFirestore(snap.data()) : null);
      },
      (error) => {
        if (!live) return;
        if (errorCode(error) === 'permission-denied') {
          timer = setTimeout(() => {
            if (live) listen();
          }, MISSING_RETRY_MS);
        } else {
          onError(error);
        }
      },
    );
  };
  listen();
  return () => {
    live = false;
    stop?.();
    if (timer) clearTimeout(timer);
  };
}

/** Keeps the scan's panoramas with the saved room (`rooms/{id}.tour`, in room coordinates). */
export async function saveRoomTour(roomId: string, tour: RoomTour): Promise<void> {
  await updateDoc(doc(firestore(), 'rooms', roomId), { tour });
}

/** Every file under a Storage folder, sub-folders too. */
async function filesUnder(folder: StorageReference): Promise<StorageReference[]> {
  const listed = await listAll(folder);
  const nested = await Promise.all(listed.prefixes.map(filesUnder));
  return [...listed.items, ...nested.flat()];
}

/**
 * Deletes a turn-around scan's files: its keyframes, `capture.json` and the server's panoramas.
 * A file already gone counts as deleted.
 */
export async function deleteCaptureFolder(uid: string, scanId: string): Promise<void> {
  const files = await filesUnder(ref(firebaseStorage(), captureFolder(uid, scanId)));
  for (const file of files) {
    try {
      await deleteObject(file);
    } catch (error) {
      if (errorCode(error) !== 'storage/object-not-found') throw error;
    }
  }
}

/** Why the upload stopped, in plain words. */
export function uploadErrorText(error: unknown): string {
  switch (errorCode(error)) {
    case 'storage/retry-limit-exceeded':
    case 'storage/canceled':
    case 'network-request-failed':
      return 'The connection dropped. Check it and try again.';
    case 'storage/unauthorized':
    case 'storage/unauthenticated':
      return 'The pictures were not accepted. Sign out and in again, then scan again.';
    case 'storage/quota-exceeded':
      return 'There is no room for more pictures on the server right now.';
    case 'capture/file-missing':
      return 'Some pictures were lost on the phone. Scan again.';
    default:
      return 'The pictures did not finish uploading. Try again.';
  }
}

/** Why asking for the fit failed, in plain words. */
export function fitRequestErrorText(error: unknown): string {
  switch (errorCode(error)) {
    case 'functions/unauthenticated':
      return 'You are signed out. Sign in again, then scan again.';
    case 'functions/permission-denied':
      return 'This account cannot measure rooms yet.';
    case 'functions/not-found':
      return 'Measuring rooms is not switched on yet.';
    case 'functions/resource-exhausted':
      return 'Many rooms are being measured right now. Try again in a minute.';
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
      return 'The server could not be reached. Check the connection and try again.';
    case 'functions/invalid-argument':
    case 'functions/failed-precondition':
      return 'The server could not use this scan.';
    default:
      return 'The room could not be sent for measuring.';
  }
}
