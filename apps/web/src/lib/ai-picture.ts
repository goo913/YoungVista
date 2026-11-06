/**
 * "AI picture" on the website: the 3D view, made photo-real by AI (always just "AI": the model
 * and who makes it are never named). The picture of the view goes to Storage next to the room's
 * pictures (core's `aiSourcePath`), then the server's `aiImage` function makes the AI picture and
 * saves it as one of the room's pictures, so the gallery shows it by itself. Same as the phone
 * (apps/mobile/lib/ai-picture.ts).
 */
import {
  AI_CALL_TIMEOUT_MS,
  AI_FAILURE_TEXT,
  AI_SOURCE_MAX_SIDE,
  aiPictureFailure,
  aiSourcePath,
  type AiPictureRequest,
  type AiPictureResult,
} from '@youngvista/core';
import { collection, doc } from 'firebase/firestore';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { firebaseApp } from './firebase';
import { db } from './firestore';
import { storage } from './storage';

/** The picture AI receives: a JPEG at most `AI_SOURCE_MAX_SIDE` px on its longest side. */
async function sourceJpeg(jpeg: Blob, width: number, height: number): Promise<Blob> {
  const long = Math.max(width, height);
  if (long <= AI_SOURCE_MAX_SIDE) return jpeg;
  const k = AI_SOURCE_MAX_SIDE / long;
  const bitmap = await createImageBitmap(jpeg);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * k);
    canvas.height = Math.round(height * k);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Empty picture'))),
        'image/jpeg',
        0.9,
      ),
    );
  } finally {
    bitmap.close();
  }
}

let functions: Functions | undefined;

/**
 * Makes an AI picture of the 3D view: resolves once it is in the room's pictures. Rejects with
 * the Firebase error (see `aiPictureErrorText`).
 */
export async function makeAiPicture(input: {
  uid: string;
  roomId: string;
  jpeg: Blob;
  width: number;
  height: number;
}): Promise<AiPictureResult> {
  // A Firestore id: 20 letters and digits, as the server expects.
  const pictureId = doc(collection(db, 'rooms', input.roomId, 'pictures')).id;
  const source = await sourceJpeg(input.jpeg, input.width, input.height);
  await uploadBytes(ref(storage, aiSourcePath(input.uid, input.roomId, pictureId)), source, {
    contentType: 'image/jpeg',
  });
  functions ??= getFunctions(firebaseApp(), 'us-central1');
  const make = httpsCallable<AiPictureRequest, AiPictureResult>(functions, 'aiImage', {
    timeout: AI_CALL_TIMEOUT_MS,
  });
  const request: AiPictureRequest = {
    roomId: input.roomId,
    pictureId,
    use: 'render',
    itemIds: [],
    request: '',
    platform: 'web',
  };
  return (await make(request)).data;
}

/** Why no AI picture was made, in one or two plain sentences. */
export function aiPictureErrorText(error: unknown): string {
  const failure = aiPictureFailure(error, typeof navigator === 'undefined' || navigator.onLine);
  const text = AI_FAILURE_TEXT[failure];
  return `${text.title}. ${text.detail}`;
}
