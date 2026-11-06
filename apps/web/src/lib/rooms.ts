import { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import {
  designFromFirestore,
  designToFirestore,
  designsEqual,
  pictureFromFirestore,
  roomFromFirestore,
  roomToFirestore,
  type Design,
  type Room,
  type SnapshotSource,
  type StoredRoom,
  type UnitSystem,
} from '@youngvista/core';
import { db } from './firestore';

export interface RoomSummary {
  id: string;
  ownerId: string;
  name: string;
  updatedAt: Date | null;
  units: UnitSystem;
  /** Null when the document has no usable floor plan. */
  room: Room | null;
  /** The room as stored, for share snapshots (null without a usable floor plan). */
  stored: StoredRoom | null;
  design: Design;
  /** The active share link's id, or null. */
  shareId: string | null;
}

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing' }
  | { status: 'error'; message: string };

function toSummary(id: string, data: DocumentData): RoomSummary {
  const name =
    typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled room';
  const room = roomFromFirestore(data.room);
  return {
    id,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    name,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    units: data.units === 'metric' ? 'metric' : 'imperial',
    room,
    stored: room ? roomToFirestore(room) : null,
    design: designFromFirestore(data.design),
    shareId: typeof data.shareId === 'string' && data.shareId ? data.shareId : null,
  };
}

/**
 * `next`, keeping `prev`'s room and design objects when they did not change: a saved design or a
 * new name then leaves the floor plan's and the 3D view's geometry (and camera) as they are.
 */
function keepUnchanged(prev: RoomSummary | null, next: RoomSummary): RoomSummary {
  if (!prev) return next;
  const out = { ...next };
  if (prev.stored && next.stored && JSON.stringify(prev.stored) === JSON.stringify(next.stored)) {
    out.room = prev.room;
    out.stored = prev.stored;
  }
  if (designsEqual(prev.design, next.design)) out.design = prev.design;
  return out;
}

function errorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : '';
  switch (code) {
    case 'unavailable':
      return 'Cannot reach the server. Check your connection and try again.';
    case 'permission-denied':
      return 'You do not have access to these rooms.';
    case 'failed-precondition':
      return 'The rooms list is still being set up. Try again in a few minutes.';
    default:
      return 'Your rooms could not be loaded. Try again.';
  }
}

/** The signed-in user's rooms, newest first, kept up to date. */
export function useRooms(uid: string): Loadable<RoomSummary[]> {
  const [state, setState] = useState<Loadable<RoomSummary[]>>({ status: 'loading' });
  useEffect(() => {
    const q = query(
      collection(db, 'rooms'),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          status: 'ready',
          data: snap.docs.map((d) => toSummary(d.id, d.data({ serverTimestamps: 'estimate' }))),
        }),
      (error) => setState({ status: 'error', message: errorMessage(error) }),
    );
  }, [uid]);
  return state;
}

/** One open room: as Firestore has it, and where the newest snapshot came from. */
export type RoomState =
  | { status: 'loading' }
  | { status: 'ready'; data: RoomSummary; source: SnapshotSource }
  /** It does not exist, or belongs to someone else. */
  | { status: 'missing' }
  /** It was there while the page was open, and has been deleted. */
  | { status: 'deleted' }
  | { status: 'error'; message: string };

/**
 * One room, kept up to date, with each snapshot's metadata (for live sync and the offline
 * status). Rooms that do not exist or belong to someone else are "missing"; a room deleted while
 * the page is open is "deleted".
 */
export function useRoom(roomId: string): RoomState {
  const [state, setState] = useState<RoomState>({ status: 'loading' });
  useEffect(() => {
    let last: RoomSummary | null = null;
    return onSnapshot(
      doc(db, 'rooms', roomId),
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.exists()) {
          // Without a connection Firestore may not know the room yet: wait for the server.
          if (snap.metadata.fromCache && !last) return;
          setState({ status: last ? 'deleted' : 'missing' });
          return;
        }
        last = keepUnchanged(last, toSummary(snap.id, snap.data({ serverTimestamps: 'estimate' })));
        setState({
          status: 'ready',
          data: last,
          source: {
            fromCache: snap.metadata.fromCache,
            hasPendingWrites: snap.metadata.hasPendingWrites,
          },
        });
      },
      (error) =>
        setState(
          error.code === 'permission-denied' || error.code === 'not-found'
            ? { status: last ? 'deleted' : 'missing' }
            : { status: 'error', message: errorMessage(error) },
        ),
    );
  }, [roomId]);
  return state;
}

/**
 * Writes the room's furniture (`rooms/{id}.design`) exactly as the phone does
 * (`apps/mobile/lib/room-doc.ts` `designUpdate`); resolves once the server has it.
 */
export async function saveDesign(roomId: string, design: Design): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), {
    design: designToFirestore(design),
    updatedAt: serverTimestamp(),
  });
}

/** Longest room name. */
export const ROOM_NAME_MAX = 80;

/** A room name as saved: trimmed, single spaces, at most `ROOM_NAME_MAX` characters. */
export const cleanRoomName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').slice(0, ROOM_NAME_MAX).trim();

/** Renames a room. */
export async function renameRoom(roomId: string, name: string): Promise<void> {
  const clean = cleanRoomName(name);
  if (!clean) throw new Error('A room needs a name.');
  await updateDoc(doc(db, 'rooms', roomId), { name: clean, updatedAt: serverTimestamp() });
}

/** Rooms deleted from this tab (id → name): their page goes back to the list instead of saying so. */
export const deletedHere = new Map<string, string>();

const ignoreMissing = (error: unknown) => {
  if (error instanceof FirebaseError && error.code === 'storage/object-not-found') return;
  throw error;
};

/**
 * Deletes a room and everything that belongs to it, in the order the rules need (the pictures'
 * rule reads the room's owner, so the room goes last):
 *   1. every picture: its file in Storage (`users/{uid}/rooms/{roomId}/pictures/*`, records or
 *      not) and its record (`rooms/{roomId}/pictures/*`);
 *   2. the private link's snapshot (`shares/{shareId}`), if the room has one;
 *   3. the room itself.
 * Safe to run again after a failure: what is already gone is skipped.
 */
export async function deleteRoom(room: Pick<RoomSummary, 'id' | 'ownerId' | 'shareId' | 'name'>) {
  // Storage loads only now, so the rooms list does not download it.
  const [{ storage }, { deleteObject, listAll, ref }] = await Promise.all([
    import('./storage'),
    import('firebase/storage'),
  ]);
  const folder = `users/${room.ownerId}/rooms/${room.id}/pictures`;
  const files = await listAll(ref(storage, folder));
  await Promise.all(files.items.map((f) => deleteObject(f).catch(ignoreMissing)));
  const records = await getDocs(collection(db, 'rooms', room.id, 'pictures'));
  await Promise.all(
    records.docs.map(async (d) => {
      const picture = pictureFromFirestore(d.data());
      // A record pointing outside the folder (none should) still has its file removed.
      if (picture && !picture.storagePath.startsWith(`${folder}/`)) {
        await deleteObject(ref(storage, picture.storagePath)).catch(ignoreMissing);
      }
      await deleteDoc(d.ref);
    }),
  );
  if (room.shareId) {
    // A link turned off elsewhere is already gone (and the rules cannot check a missing one).
    const share = await getDoc(doc(db, 'shares', room.shareId));
    if (share.exists()) await deleteDoc(share.ref);
  }
  deletedHere.set(room.id, room.name);
  try {
    await deleteDoc(doc(db, 'rooms', room.id));
  } catch (error) {
    deletedHere.delete(room.id);
    throw error;
  }
}

/** Words for a failed rename or delete. */
export function roomChangeErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : '';
  if (code === 'unavailable' || code === 'storage/retry-limit-exceeded') {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (code === 'permission-denied' || code === 'storage/unauthorized') {
    return 'You do not have permission to change this room.';
  }
  return 'Something went wrong. Try again.';
}
