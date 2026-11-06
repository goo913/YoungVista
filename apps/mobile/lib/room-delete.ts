/**
 * Deleting a room, everywhere: its pictures (JPEGs in Storage and their records), its private
 * link, what the phone keeps of it, and the room itself. The Firestore rules for pictures read the
 * room's owner from the room (`get()`), so the room goes last:
 *
 * 1. each picture's JPEG at users/{uid}/rooms/{roomId}/pictures/* and its record at
 *    rooms/{roomId}/pictures/* (uploads for the room are held first, so none lands meanwhile);
 * 2. the share doc, when the room has a link;
 * 3. the room's waiting picture uploads and edits kept on the phone, and its copies;
 * 4. the room doc.
 *
 * Every step can be made again (a file or record already gone counts as deleted), so a delete
 * cut short by the connection is finished by trying again. It needs a connection: the pictures
 * and the link must go from the website too, and Storage cannot delete offline. The rooms list
 * shows it happening (`useRoomDeletion`); the room disappears once its doc is deleted.
 */
import { isShareId, picturePath } from '@youngvista/core';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
} from 'firebase/firestore';
import { listAll, ref } from 'firebase/storage';
import { useSyncExternalStore } from 'react';
import { firebaseStorage, firestore } from './firebase';
import { forgetPending, removeFromRoomsCopy, removeRoomCopy } from './pending';
import { deleteStorageFile, forgetUploadedFile, pictureUploads, withTimeout } from './pictures';
import { deleteErrorMessage } from './room-doc';
import { toasts } from './toast';

/** Deletes the room `roomId` of user `uid` and everything that belongs to it, in order. */
export async function deleteRoomEverywhere(uid: string, roomId: string): Promise<void> {
  await pictureUploads.holdRoom(roomId);
  try {
    const roomRef = doc(firestore(), 'rooms', roomId);
    const room = await withTimeout(getDocFromServer(roomRef));
    if (room.exists()) {
      // 1. Pictures: each JPEG, then its record.
      const own = `users/${uid}/rooms/${roomId}/pictures/`;
      const records = await withTimeout(getDocsFromServer(collection(roomRef, 'pictures')));
      for (const record of records.docs) {
        const stored: unknown = record.get('storagePath');
        const path =
          typeof stored === 'string' && stored.startsWith(own)
            ? stored
            : picturePath(uid, roomId, record.id);
        await deleteStorageFile(path);
        await withTimeout(deleteDoc(record.ref));
        forgetUploadedFile(record.id);
      }
      // JPEGs whose record was never written (an upload cut short before its record).
      const folder = await withTimeout(listAll(ref(firebaseStorage(), own.slice(0, -1))));
      for (const item of folder.items) await deleteStorageFile(item.fullPath);
      // 2. The private link.
      const shareId: unknown = room.get('shareId');
      if (isShareId(shareId)) {
        const share = await withTimeout(getDocFromServer(doc(firestore(), 'shares', shareId)));
        if (share.exists()) await withTimeout(deleteDoc(share.ref));
      }
    }
    // 3. What the phone keeps.
    await pictureUploads.forgetRoom(roomId);
    await forgetPending(uid, roomId);
    await removeRoomCopy(uid, roomId);
    await removeFromRoomsCopy(uid, roomId);
    // 4. The room.
    if (room.exists()) await withTimeout(deleteDoc(roomRef));
  } catch (error) {
    pictureUploads.releaseRoom(roomId);
    throw error;
  }
}

export type RoomDeletion = { status: 'deleting' } | { status: 'failed'; message: string };

const deletions = new Map<string, RoomDeletion>();
let snapshot: ReadonlyMap<string, RoomDeletion> = new Map();
const listeners = new Set<() => void>();

function setDeletion(roomId: string, value: RoomDeletion | null) {
  if (value) deletions.set(roomId, value);
  else deletions.delete(roomId);
  snapshot = new Map(deletions);
  for (const l of [...listeners]) l();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Rooms being deleted (or whose delete failed), by id. */
export function useRoomDeletions(): ReadonlyMap<string, RoomDeletion> {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** The delete in progress (or failed) for one room, or null. */
export function useRoomDeletion(roomId: string): RoomDeletion | null {
  return useRoomDeletions().get(roomId) ?? null;
}

/** Forgets a failed delete (the room stays). */
export const dismissRoomDeletion = (roomId: string): void => setDeletion(roomId, null);

/**
 * Starts deleting a room. It runs on even if the screen that started it closes; the rooms list
 * shows how it goes, and a short message says when it is done or why it stopped.
 */
export function startRoomDeletion(uid: string, room: { id: string; name: string }): void {
  if (deletions.get(room.id)?.status === 'deleting') return;
  setDeletion(room.id, { status: 'deleting' });
  void deleteRoomEverywhere(uid, room.id).then(
    () => {
      setDeletion(room.id, null);
      toasts.show({ tone: 'success', title: `Deleted “${room.name}”` });
    },
    (error: unknown) => {
      const message = deleteErrorMessage(error, 'room');
      setDeletion(room.id, { status: 'failed', message });
      toasts.show({ tone: 'error', title: `“${room.name}” was not deleted`, detail: message });
    },
  );
}
