import { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { roomFromFirestore, type Room, type UnitSystem } from '@youngvista/core';
import { db } from './firestore';

export interface RoomSummary {
  id: string;
  name: string;
  updatedAt: Date | null;
  units: UnitSystem;
  /** Null when the document has no usable floor plan. */
  room: Room | null;
}

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing' }
  | { status: 'error'; message: string };

function toSummary(id: string, data: DocumentData): RoomSummary {
  const name =
    typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled room';
  return {
    id,
    name,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    units: data.units === 'metric' ? 'metric' : 'imperial',
    room: roomFromFirestore(data.room),
  };
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

/** One room, kept up to date. Rooms that do not exist or belong to someone else are "missing". */
export function useRoom(roomId: string): Loadable<RoomSummary> {
  const [state, setState] = useState<Loadable<RoomSummary>>({ status: 'loading' });
  useEffect(() => {
    return onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) =>
        setState(
          snap.exists()
            ? {
                status: 'ready',
                data: toSummary(snap.id, snap.data({ serverTimestamps: 'estimate' })),
              }
            : { status: 'missing' },
        ),
      (error) =>
        setState(
          error.code === 'permission-denied'
            ? { status: 'missing' }
            : { status: 'error', message: errorMessage(error) },
        ),
    );
  }, [roomId]);
  return state;
}
