/**
 * The phone's own copies: the last version of each room seen from the server (so a room opens
 * without a connection) and edits not on the server yet (so they survive a restart and are sent
 * when the connection is back). Kept in AsyncStorage per signed-in user.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { designToFirestore, roomToFirestore } from '@youngvista/core';
import {
  listFromCache,
  listToCache,
  pendingFromText,
  pendingToText,
  summaryFromCache,
  summaryToCache,
  type PendingEdits,
  type RoomSummary,
} from './room-doc';

const roomKey = (uid: string, roomId: string) => `youngvista.room.${uid}.${roomId}`;
const listKey = (uid: string) => `youngvista.rooms.${uid}`;

/** The rooms list as last seen from the server. */
export async function readRoomsCopy(uid: string): Promise<RoomSummary[]> {
  try {
    return listFromCache(await AsyncStorage.getItem(listKey(uid)));
  } catch {
    return [];
  }
}

export async function writeRoomsCopy(uid: string, rooms: readonly RoomSummary[]): Promise<void> {
  try {
    await AsyncStorage.setItem(listKey(uid), listToCache(rooms));
  } catch {
    // Storage full or unavailable: the list then needs a connection.
  }
}
const pendingPrefix = (uid: string) => `youngvista.pending.${uid}.`;
const pendingKey = (uid: string, roomId: string) => pendingPrefix(uid) + roomId;

/** The room as last seen from the server: its own copy or its entry in the list, the newer. */
export async function readRoomCopy(uid: string, roomId: string): Promise<RoomSummary | null> {
  try {
    const own = summaryFromCache(roomId, await AsyncStorage.getItem(roomKey(uid, roomId)));
    const listed = (await readRoomsCopy(uid)).find((r) => r.id === roomId) ?? null;
    const time = (r: RoomSummary | null) => r?.updatedAt?.getTime() ?? -1;
    return time(listed) > time(own) ? listed : (own ?? listed);
  } catch {
    return null;
  }
}

export async function writeRoomCopy(uid: string, summary: RoomSummary): Promise<void> {
  try {
    await AsyncStorage.setItem(roomKey(uid, summary.id), summaryToCache(summary));
  } catch {
    // Storage full or unavailable: the room then needs a connection to open.
  }
}

export async function removeRoomCopy(uid: string, roomId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(roomKey(uid, roomId));
  } catch {
    // Nothing to do.
  }
}

// Writes to one room's pending edits run one after another, so a newer edit is never
// overwritten by an older one finishing late.
const chains = new Map<string, Promise<unknown>>();
function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) ?? Promise.resolve()).then(task, task);
  chains.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

const listeners = new Set<(roomId: string) => void>();

/** Calls `listener` with the room's id whenever its pending edits change. */
export function onPendingChange(listener: (roomId: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function readPending(uid: string, roomId: string): Promise<PendingEdits> {
  try {
    return pendingFromText(await AsyncStorage.getItem(pendingKey(uid, roomId)));
  } catch {
    return {};
  }
}

async function storePending(uid: string, roomId: string, pending: PendingEdits): Promise<void> {
  const key = pendingKey(uid, roomId);
  if (!pending.design && !pending.room) await AsyncStorage.removeItem(key);
  else await AsyncStorage.setItem(key, pendingToText(pending));
  for (const l of listeners) l(roomId);
}

/** Remembers an edit until it is on the server. */
export function setPending(uid: string, roomId: string, edit: PendingEdits): Promise<void> {
  const key = pendingKey(uid, roomId);
  return serial(key, async () => {
    try {
      await storePending(uid, roomId, { ...(await readPending(uid, roomId)), ...edit });
    } catch {
      // Storage unavailable: the edit is still saved while the app stays open.
    }
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Forgets an edit once the server has it, unless a newer edit of the same kind came in since.
 */
export function clearPending(uid: string, roomId: string, saved: PendingEdits): Promise<void> {
  const key = pendingKey(uid, roomId);
  return serial(key, async () => {
    try {
      const current = await readPending(uid, roomId);
      const next: PendingEdits = { ...current };
      if (
        saved.design &&
        current.design &&
        same(designToFirestore(current.design), designToFirestore(saved.design))
      ) {
        delete next.design;
      }
      if (
        saved.room &&
        current.room &&
        same(roomToFirestore(current.room), roomToFirestore(saved.room))
      ) {
        delete next.room;
      }
      await storePending(uid, roomId, next);
    } catch {
      // Left in place: it is sent again on the next start, which does no harm.
    }
  });
}

/** Ids of the rooms that have edits not on the server yet. */
export async function roomsWithPending(uid: string): Promise<string[]> {
  try {
    const prefix = pendingPrefix(uid);
    return (await AsyncStorage.getAllKeys())
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  } catch {
    return [];
  }
}
