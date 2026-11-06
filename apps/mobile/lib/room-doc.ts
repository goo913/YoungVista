import {
  designFromFirestore,
  designToFirestore,
  roomFromFirestore,
  roomToFirestore,
  type CapturePlatform,
  type Design,
  type Room,
  type RoomDoc,
  type UnitSystem,
} from '@youngvista/core';
import { serverTimestamp, Timestamp, type DocumentData, type FieldValue } from 'firebase/firestore';
import { errorCode } from './auth-errors';

// rooms/{roomId} documents: the shape the website reads (apps/web/src/lib/rooms.ts) and the
// Firestore rules allow (owner only).

export interface RoomSummary {
  id: string;
  name: string;
  updatedAt: Date | null;
  units: UnitSystem;
  /** Null when the document has no usable floor plan. */
  room: Room | null;
  /** The furniture placed in the room. */
  design: Design;
}

export function toSummary(id: string, data: DocumentData): RoomSummary {
  const name =
    typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled room';
  return {
    id,
    name,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
    units: data.units === 'metric' ? 'metric' : 'imperial',
    room: roomFromFirestore(data.room),
    design: designFromFirestore(data.design),
  };
}

export interface NewScannedRoom {
  ownerId: string;
  name: string;
  units: UnitSystem;
  room: Room;
  platform: CapturePlatform;
}

/** The Firestore document for a freshly scanned room (exactly the `RoomDoc` shape). */
export function scannedRoomDoc(input: NewScannedRoom): RoomDoc<FieldValue> {
  return {
    ownerId: input.ownerId,
    name: input.name.trim() || 'Untitled room',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    units: input.units,
    room: roomToFirestore(input.room),
    capture: { method: 'scan', platform: input.platform, scaleFactor: 1 },
    design: { items: [] },
    shareId: null,
  };
}

/** The fields an autosave of the furniture writes: exactly `designToFirestore`, and the time. */
export function designUpdate(design: Design): { design: Design; updatedAt: FieldValue } {
  return { design: designToFirestore(design), updatedAt: serverTimestamp() };
}

/** The fields an autosave of the room editor writes. */
export function roomUpdate(room: Room): {
  room: ReturnType<typeof roomToFirestore>;
  updatedAt: FieldValue;
} {
  return { room: roomToFirestore(room), updatedAt: serverTimestamp() };
}

/**
 * The room as kept on the phone (AsyncStorage), so it opens without a connection. Firestore's own
 * cache lives in memory on React Native and is gone after a restart.
 */
interface StoredCopy {
  v: 1;
  name: string;
  updatedAt: number | null;
  units: UnitSystem;
  room: unknown;
  design: Design;
}

export function summaryToCache(summary: RoomSummary): string {
  const copy: StoredCopy = {
    v: 1,
    name: summary.name,
    updatedAt: summary.updatedAt ? summary.updatedAt.getTime() : null,
    units: summary.units,
    room: summary.room ? roomToFirestore(summary.room) : null,
    design: designToFirestore(summary.design),
  };
  return JSON.stringify(copy);
}

/** Reads a copy written by `summaryToCache`; null when there is none or it is unreadable. */
export function summaryFromCache(id: string, text: string | null | undefined): RoomSummary | null {
  if (!text) return null;
  try {
    const copy = JSON.parse(text) as Partial<StoredCopy>;
    if (copy.v !== 1 || typeof copy.name !== 'string') return null;
    return {
      id,
      name: copy.name,
      updatedAt: typeof copy.updatedAt === 'number' ? new Date(copy.updatedAt) : null,
      units: copy.units === 'metric' ? 'metric' : 'imperial',
      room: roomFromFirestore(copy.room),
      design: designFromFirestore(copy.design),
    };
  } catch {
    return null;
  }
}

/** The rooms list as kept on the phone, so it shows without a connection. */
export function listToCache(summaries: readonly RoomSummary[]): string {
  return JSON.stringify(summaries.map((s) => ({ id: s.id, copy: summaryToCache(s) })));
}

/** Reads a list written by `listToCache`; empty when there is none or it is unreadable. */
export function listFromCache(text: string | null | undefined): RoomSummary[] {
  if (!text) return [];
  try {
    const entries = JSON.parse(text) as { id?: unknown; copy?: unknown }[];
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((e) => {
      if (typeof e?.id !== 'string' || typeof e.copy !== 'string') return [];
      const summary = summaryFromCache(e.id, e.copy);
      return summary ? [summary] : [];
    });
  } catch {
    return [];
  }
}

/**
 * Edits not on the server yet, kept on the phone until they are: the newest design and room
 * shape. If the app is closed before the connection comes back, they are sent on the next start.
 */
export interface PendingEdits {
  design?: Design;
  room?: Room;
}

export function pendingToText(pending: PendingEdits): string {
  return JSON.stringify({
    v: 1,
    ...(pending.design ? { design: designToFirestore(pending.design) } : {}),
    ...(pending.room ? { room: roomToFirestore(pending.room) } : {}),
  });
}

export function pendingFromText(text: string | null | undefined): PendingEdits {
  if (!text) return {};
  try {
    const data = JSON.parse(text) as { v?: number; design?: unknown; room?: unknown };
    if (data.v !== 1) return {};
    const out: PendingEdits = {};
    if (data.design !== undefined) out.design = designFromFirestore(data.design);
    const room = data.room !== undefined ? roomFromFirestore(data.room) : null;
    if (room) out.room = room;
    return out;
  } catch {
    return {};
  }
}

/** The room with edits that are not on the server yet laid over it. */
export function withPending(summary: RoomSummary, pending: PendingEdits): RoomSummary {
  if (!pending.design && !pending.room) return summary;
  return {
    ...summary,
    design: pending.design ?? summary.design,
    room: pending.room ?? summary.room,
  };
}

export function roomsErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
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

export function saveErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'unavailable':
      return 'Cannot reach the server. Check your connection and try again.';
    case 'permission-denied':
      return 'You are not allowed to save rooms. Try signing out and in again.';
    default:
      return 'The room could not be saved. Try again.';
  }
}
