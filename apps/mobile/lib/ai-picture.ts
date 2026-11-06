/**
 * AI pictures on the phone: the work behind components/ai.
 *
 * 1. `prepareSource`: the picture AI receives, a JPEG at most 2048 px on its longest side (the
 *    camera view's screenshot is a PNG, a phone photo is 12 MP and may be HEIC);
 * 2. `uploadSource`: it goes to Storage, next to the room's pictures (core's `aiSourcePath`);
 * 3. `callAiImage`: the server's `aiImage` function makes the picture and saves it as one of the
 *    room's pictures (Storage and `rooms/{roomId}/pictures`), so it shows in the room's pictures
 *    here and on the website by itself.
 *
 * It needs a connection: nothing is queued. A home photo goes to AI only after the one-time
 * consent (`hasAiConsent`, components/ai/ai-consent.tsx), which Apple requires before personal
 * data goes to a third-party AI. With the Firebase emulators (lib/emulator.ts) there is no server
 * function, so AI pictures fail with "No AI picture".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AI_CALL_TIMEOUT_MS,
  aiSourcePath,
  type AiPictureRequest,
  type AiPictureResult,
} from '@youngvista/core';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { sourceSize } from './ai-picture-state';
import { firebaseApp, firebaseStorage } from './firebase';
import { saveToPhotos, type PhotosResult } from './pictures';

/** A picture on this phone. */
export interface LocalImage {
  /** `file://` URI. */
  uri: string;
  width: number;
  height: number;
}

/** JPEG quality of the picture sent to AI. */
const SOURCE_QUALITY = 0.88;

/** The picture AI receives: a JPEG, at most `AI_SOURCE_MAX_SIDE` px on its longest side. */
export async function prepareSource(uri: string): Promise<LocalImage> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const size = sourceSize(original.width, original.height);
  const image =
    size.width === original.width && size.height === original.height
      ? original
      : await ImageManipulator.manipulate(uri).resize(size).renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: SOURCE_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * A local file as a Blob for Firebase Storage (React Native's XMLHttpRequest reads `file://`
 * URIs into native blobs, as lib/pictures.ts does for the room's pictures).
 */
function fileBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('The picture file is unreadable.'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/** Sends the picture to Storage, where the server reads it. `onProgress` gets 0 to 1. */
export async function uploadSource(
  input: { uid: string; roomId: string; pictureId: string; image: LocalImage },
  onProgress: (share: number) => void,
): Promise<void> {
  const blob = await fileBlob(input.image.uri);
  try {
    const path = aiSourcePath(input.uid, input.roomId, input.pictureId);
    const task = uploadBytesResumable(ref(firebaseStorage(), path), blob, {
      contentType: 'image/jpeg',
    });
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress(snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0),
        reject,
        resolve,
      );
    });
  } finally {
    (blob as Blob & { close?: () => void }).close?.();
  }
}

let functions: Functions | undefined;

/** Asks the server to make the AI picture; resolves once it is in the room's pictures. */
export async function callAiImage(request: AiPictureRequest): Promise<AiPictureResult> {
  functions ??= getFunctions(firebaseApp(), 'us-central1');
  const make = httpsCallable<AiPictureRequest, AiPictureResult>(functions, 'aiImage', {
    timeout: AI_CALL_TIMEOUT_MS,
  });
  return (await make(request)).data;
}

/**
 * Saves a picture of the room to Photos: its JPEG on this phone when it has one, else a copy
 * downloaded from Storage (AI pictures are made on the server).
 */
export async function saveRoomPictureToPhotos(picture: {
  id: string;
  file: string | null;
  storagePath: string | null;
}): Promise<PhotosResult> {
  if (picture.file) return saveToPhotos(picture.file);
  if (!picture.storagePath) return 'failed';
  try {
    const url = await getDownloadURL(ref(firebaseStorage(), picture.storagePath));
    const copy = await File.downloadFileAsync(
      url,
      new File(Paths.cache, `photos-${picture.id}.jpg`),
      {
        idempotent: true,
      },
    );
    const result = await saveToPhotos(copy.uri);
    try {
      copy.delete();
    } catch {
      // The cache folder is cleared by the system anyway.
    }
    return result;
  } catch {
    return 'failed';
  }
}

/* The one-time consent before a home photo goes to AI. */

/** Raise the version when the consent's words change, so everyone is asked again. */
const consentKey = (uid: string) => `youngvista.aiConsent.v1.${uid}`;

export async function hasAiConsent(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(consentKey(uid))) !== null;
  } catch {
    return false;
  }
}

export async function giveAiConsent(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(consentKey(uid), new Date().toISOString());
  } catch {
    // Not kept: the consent is asked again next time, which is safe.
  }
}
