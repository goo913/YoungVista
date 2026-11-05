import { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { pictureFromFirestore, type CapturePlatform } from '@youngvista/core';
import { db } from './firestore';
import type { Loadable } from './rooms';
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
