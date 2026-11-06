import { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { deleteObject, getBlob, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  buildPictureDoc,
  pictureFromFirestore,
  picturePath,
  type CapturePlatform,
} from '@youngvista/core';
import { db } from './firestore';
import type { Loadable } from './rooms';
import { saveBlob } from './save-file';
import { storage } from './storage';

export interface RoomPicture {
  id: string;
  createdAt: Date | null;
  storagePath: string;
  width: number;
  height: number;
  platform: CapturePlatform;
}

/** The room's final pictures, newest first, kept up to date. */
export function usePictures(roomId: string): Loadable<RoomPicture[]> {
  const [state, setState] = useState<Loadable<RoomPicture[]>>({ status: 'loading' });
  useEffect(() => {
    const q = query(collection(db, 'rooms', roomId, 'pictures'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          status: 'ready',
          data: snap.docs.flatMap((d) => {
            const p = pictureFromFirestore(d.data({ serverTimestamps: 'estimate' }));
            if (!p) return [];
            const createdAt = p.createdAt ? new Date(p.createdAt.toMillis()) : null;
            return [{ id: d.id, ...p, createdAt }];
          }),
        }),
      (error) =>
        setState({
          status: 'error',
          message:
            error instanceof FirebaseError && error.code === 'unavailable'
              ? 'Cannot reach the server. Check your connection and try again.'
              : 'The pictures could not be loaded. Try again.',
        }),
    );
  }, [roomId]);
  return state;
}

const urls = new Map<string, Promise<string>>();

/** Download URL of an image in Storage (cached for this page). */
export function usePictureUrl(
  storagePath: string,
): { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' } {
  const [state, setState] = useState<
    { path: string; url: string } | { path: string; failed: true } | null
  >(null);
  useEffect(() => {
    let live = true;
    let pending = urls.get(storagePath);
    if (!pending) {
      pending = getDownloadURL(ref(storage, storagePath));
      urls.set(storagePath, pending);
      pending.catch(() => urls.delete(storagePath));
    }
    pending.then(
      (url) => live && setState({ path: storagePath, url }),
      () => live && setState({ path: storagePath, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [storagePath]);
  if (!state || state.path !== storagePath) return { status: 'loading' };
  return 'url' in state ? { status: 'ready', url: state.url } : { status: 'error' };
}

/** `bedroom-2026-11-06-1432.jpg`: the room's name and when the picture was taken. */
export function pictureFileName(roomName: string, picture: Pick<RoomPicture, 'createdAt'>) {
  const slug =
    roomName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'room';
  const d = picture.createdAt ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${slug}-${stamp}.jpg`;
}

/**
 * Saves a picture to the computer as a file. A cross-origin link ignores `download` (the browser
 * opens the image instead), so the file is fetched through the Storage SDK (`getBlob`, which needs
 * CORS on the bucket) and saved from memory.
 */
export async function downloadPicture(picture: RoomPicture, fileName: string): Promise<void> {
  const blob = await getBlob(ref(storage, picture.storagePath));
  saveBlob(blob, fileName);
}

/** Deletes a picture: its file in Storage, then its record (which removes it from the gallery). */
export async function deletePicture(roomId: string, picture: RoomPicture): Promise<void> {
  try {
    await deleteObject(ref(storage, picture.storagePath));
  } catch (error) {
    // Already gone (an upload that never finished): the record still goes.
    if (!(error instanceof FirebaseError && error.code === 'storage/object-not-found')) throw error;
  }
  urls.delete(picture.storagePath);
  await deleteDoc(doc(db, 'rooms', roomId, 'pictures', picture.id));
}

/**
 * Saves a picture taken in the website's 3D view to the room, as the phone does: the JPEG in
 * Storage at `picturePath(...)`, then its record. Returns the picture's id.
 */
export async function savePictureToRoom(input: {
  uid: string;
  roomId: string;
  jpeg: Blob;
  width: number;
  height: number;
}): Promise<string> {
  const record = doc(collection(db, 'rooms', input.roomId, 'pictures'));
  const path = picturePath(input.uid, input.roomId, record.id);
  await uploadBytes(ref(storage, path), input.jpeg, { contentType: 'image/jpeg' });
  await setDoc(
    record,
    buildPictureDoc({
      uid: input.uid,
      roomId: input.roomId,
      pictureId: record.id,
      width: input.width,
      height: input.height,
      platform: 'web',
      createdAt: serverTimestamp(),
    }),
  );
  return record.id;
}

/** Words for a picture that could not be saved, downloaded or deleted. */
export function pictureErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : '';
  if (code === 'storage/unauthorized' || code === 'permission-denied') {
    return 'You do not have permission to change this picture.';
  }
  if (code === 'storage/retry-limit-exceeded' || code === 'unavailable') {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'That did not work. Check your connection and try again.';
}
