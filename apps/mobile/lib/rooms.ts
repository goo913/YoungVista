import { collection, doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { errorCode } from './auth-errors';
import { firestore } from './firebase';
import {
  roomsErrorMessage,
  scannedRoomDoc,
  toSummary,
  type NewScannedRoom,
  type RoomSummary,
} from './room-doc';

export { saveErrorMessage, type NewScannedRoom, type RoomSummary } from './room-doc';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/** The signed-in user's rooms, newest first, kept up to date. */
export function useRooms(uid: string): Loadable<RoomSummary[]> {
  const [state, setState] = useState<Loadable<RoomSummary[]>>({ status: 'loading' });
  useEffect(() => {
    const q = query(
      collection(firestore(), 'rooms'),
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
      (error) => setState({ status: 'error', message: roomsErrorMessage(error) }),
    );
  }, [uid]);
  return state;
}

/** One room, kept up to date. Rooms that do not exist or belong to someone else are "missing". */
export function useRoom(roomId: string): Loadable<RoomSummary> {
  const [state, setState] = useState<Loadable<RoomSummary>>({ status: 'loading' });
  useEffect(() => {
    return onSnapshot(
      doc(firestore(), 'rooms', roomId),
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
          errorCode(error) === 'permission-denied'
            ? { status: 'missing' }
            : { status: 'error', message: roomsErrorMessage(error) },
        ),
    );
  }, [roomId]);
  return state;
}

/** Saves a scanned room and returns its id. */
export async function saveScannedRoom(input: NewScannedRoom): Promise<string> {
  const ref = doc(collection(firestore(), 'rooms'));
  await setDoc(ref, scannedRoomDoc(input));
  return ref.id;
}
