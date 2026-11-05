import {
  roomFromFirestore,
  roomToFirestore,
  type CapturePlatform,
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
