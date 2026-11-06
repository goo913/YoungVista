import type { Design, Room } from '@youngvista/core';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { errorCode } from './auth-errors';
import { firestore } from './firebase';
import {
  clearPending,
  onPendingChange,
  readPending,
  readRoomCopy,
  readRoomsCopy,
  removeRoomCopy,
  roomsWithPending,
  writeRoomCopy,
  writeRoomsCopy,
} from './pending';
import {
  designUpdate,
  roomsErrorMessage,
  roomUpdate,
  scannedRoomDoc,
  toSummary,
  withPending,
  type NewScannedRoom,
  type PendingEdits,
  type RoomSummary,
} from './room-doc';

export { saveErrorMessage, type NewScannedRoom, type RoomSummary } from './room-doc';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing' }
  | { status: 'error'; message: string };

export type RoomsState = Loadable<RoomSummary[]> & {
  /** False while the app cannot reach the server (the list may be the phone's copy). */
  online: boolean;
};

/**
 * The signed-in user's rooms, newest first, kept up to date. Without a connection it shows the
 * list as last seen from the server (Firestore's own cache is gone after a restart).
 */
export function useRooms(uid: string): RoomsState {
  const [state, setState] = useState<Loadable<RoomSummary[]>>({ status: 'loading' });
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let live = true;
    let fromServer = false;
    let copy: RoomSummary[] | null = null;
    let offlineList: RoomSummary[] | null = null;
    const showOffline = () => {
      if (!live || fromServer || !copy || !offlineList) return;
      // Offline: the phone's copy, with whatever Firestore holds in memory laid over it.
      const merged = new Map(copy.map((r) => [r.id, r]));
      for (const r of offlineList) merged.set(r.id, r);
      const time = (r: RoomSummary) => r.updatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      setState({ status: 'ready', data: [...merged.values()].sort((a, b) => time(b) - time(a)) });
    };
    void readRoomsCopy(uid).then((rooms) => {
      copy = rooms;
      showOffline();
    });
    const q = query(
      collection(firestore(), 'rooms'),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
    );
    const stop = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (!live) return;
        const rooms = snap.docs.map((d) =>
          toSummary(d.id, d.data({ serverTimestamps: 'estimate' })),
        );
        setOnline(!snap.metadata.fromCache);
        if (snap.metadata.fromCache) {
          offlineList = rooms;
          showOffline();
          if (fromServer) setState({ status: 'ready', data: rooms });
          return;
        }
        fromServer = true;
        setState({ status: 'ready', data: rooms });
        if (!snap.metadata.hasPendingWrites) void writeRoomsCopy(uid, rooms);
      },
      (error) => {
        if (!live) return;
        if (copy?.length) setState({ status: 'ready', data: copy });
        else setState({ status: 'error', message: roomsErrorMessage(error) });
      },
    );
    return () => {
      live = false;
      stop();
    };
  }, [uid]);
  return { ...state, online };
}

export type RoomState = Loadable<RoomSummary> & {
  /** False while the app cannot reach the server (what is shown may be the phone's copy). */
  online: boolean;
  /**
   * True once Firestore has answered (from the server, or from its memory when offline): until
   * then what is shown may be an older copy from the phone. Editors wait for it.
   */
  settled: boolean;
};

/**
 * One room, kept up to date. It opens from the phone's copy first (fast, and without a
 * connection), with edits that are not on the server yet laid over it. Rooms that do not exist or
 * belong to someone else are "missing".
 */
export function useRoom(roomId: string): RoomState {
  const uid = useAuth().user?.uid ?? '';
  const [state, setState] = useState<Loadable<RoomSummary>>({ status: 'loading' });
  const [online, setOnline] = useState(true);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let live = true;
    let server: RoomSummary | null = null;
    let copy: RoomSummary | null = null;
    let copyRead = false;
    let offlineMissing = false;
    let pending: PendingEdits = {};

    const show = () => {
      if (!live) return;
      const base = server ?? copy;
      if (base) setState({ status: 'ready', data: withPending(base, pending) });
      else if (copyRead && offlineMissing) {
        setState({
          status: 'error',
          message: 'This room has not been opened on this phone before. Connect to the internet.',
        });
      }
    };

    void readRoomCopy(uid, roomId).then((c) => {
      copy = c;
      copyRead = true;
      show();
    });
    const loadPending = () =>
      void readPending(uid, roomId).then((p) => {
        pending = p;
        show();
      });
    loadPending();
    const stopPending = onPendingChange((id) => {
      if (id === roomId) loadPending();
    });

    const stop = onSnapshot(
      doc(firestore(), 'rooms', roomId),
      { includeMetadataChanges: true },
      (snap) => {
        if (!live) return;
        const fromServer = !snap.metadata.fromCache;
        setOnline(fromServer);
        setSettled(true);
        if (snap.exists()) {
          server = toSummary(snap.id, snap.data({ serverTimestamps: 'estimate' }));
          if (fromServer && !snap.metadata.hasPendingWrites) void writeRoomCopy(uid, server);
          show();
        } else if (fromServer) {
          server = null;
          void removeRoomCopy(uid, roomId);
          setState({ status: 'missing' });
        } else {
          // Not in Firestore's memory and no connection: the phone's copy, if any, stays.
          offlineMissing = true;
          show();
        }
      },
      (error) => {
        if (!live) return;
        setSettled(true);
        if (errorCode(error) === 'permission-denied') setState({ status: 'missing' });
        else if (!server && !copy) setState({ status: 'error', message: roomsErrorMessage(error) });
      },
    );
    return () => {
      live = false;
      stop();
      stopPending();
    };
  }, [uid, roomId]);

  return { ...state, online, settled };
}

/** Saves a scanned room and returns its id. */
export async function saveScannedRoom(input: NewScannedRoom): Promise<string> {
  const ref = doc(collection(firestore(), 'rooms'));
  await setDoc(ref, scannedRoomDoc(input));
  return ref.id;
}

/** Writes the room's furniture (`rooms/{id}.design`); resolves once the server has it. */
export async function saveDesign(roomId: string, design: Design): Promise<void> {
  await updateDoc(doc(firestore(), 'rooms', roomId), designUpdate(design));
}

/** Writes the room's walls, doors and windows (`rooms/{id}.room`). */
export async function saveRoomShape(roomId: string, room: Room): Promise<void> {
  await updateDoc(doc(firestore(), 'rooms', roomId), roomUpdate(room));
}

/**
 * Sends edits left from an earlier run that never reached the server (the app was closed while
 * offline). Firestore holds them until the connection is back.
 */
export async function sendLeftoverEdits(uid: string): Promise<void> {
  for (const roomId of await roomsWithPending(uid)) {
    const pending = await readPending(uid, roomId);
    const writes: Promise<void>[] = [];
    if (pending.design) writes.push(saveDesign(roomId, pending.design));
    if (pending.room) writes.push(saveRoomShape(roomId, pending.room));
    void Promise.all(writes).then(
      () => clearPending(uid, roomId, pending),
      (error: unknown) => {
        // The room was deleted, or belongs to another account: nothing can save it now.
        const code = errorCode(error);
        if (code === 'not-found' || code === 'permission-denied') {
          void clearPending(uid, roomId, pending);
        }
      },
    );
  }
}
