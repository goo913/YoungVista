import { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  Timestamp,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import {
  buildShareDoc,
  designFromFirestore,
  generateShareId,
  isShareId,
  roomFromFirestore,
  shareUrl,
  type Design,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { db } from './firestore';
import type { Loadable, RoomSummary } from './rooms';

/** A shared snapshot of a room, as the public link shows it. */
export interface SharedRoom {
  id: string;
  roomId: string;
  name: string;
  units: UnitSystem;
  /** Null when the snapshot has no usable floor plan. */
  room: Room | null;
  design: Design;
  /** When the snapshot was taken or last refreshed. */
  updatedAt: Date | null;
}

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

function toShared(id: string, data: DocumentData): SharedRoom {
  const name =
    typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Untitled room';
  return {
    id,
    roomId: typeof data.roomId === 'string' ? data.roomId : '',
    name,
    units: data.units === 'metric' ? 'metric' : 'imperial',
    room: roomFromFirestore(data.room),
    design: designFromFirestore(data.design),
    updatedAt: toDate(data.updatedAt) ?? toDate(data.createdAt),
  };
}

/**
 * A share snapshot, kept up to date, readable without signing in. "missing" when the link does not
 * exist or was revoked (or the id cannot be a share id).
 */
export function useShare(shareId: string | null): Loadable<SharedRoom> {
  const valid = isShareId(shareId);
  // Remember which id the state belongs to, so a new id never shows the previous one's state.
  const [state, setState] = useState<{ id: string; value: Loadable<SharedRoom> } | null>(null);
  useEffect(() => {
    if (!valid) return;
    return onSnapshot(
      doc(db, 'shares', shareId),
      (snap) =>
        setState({
          id: shareId,
          value: snap.exists()
            ? {
                status: 'ready',
                data: toShared(snap.id, snap.data({ serverTimestamps: 'estimate' })),
              }
            : { status: 'missing' },
        }),
      (error) =>
        setState({
          id: shareId,
          value:
            error.code === 'permission-denied'
              ? { status: 'missing' }
              : { status: 'error', message: shareErrorMessage(error) },
        }),
    );
  }, [shareId, valid]);
  if (!valid) return { status: 'missing' };
  return state?.id === shareId ? state.value : { status: 'loading' };
}

/** The public link for a share on this website. */
export const shareLink = (shareId: string) => shareUrl(shareId, window.location.origin);

export function shareErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : '';
  switch (code) {
    case 'unavailable':
      return 'Cannot reach the server. Check your connection and try again.';
    case 'permission-denied':
      return 'You do not have permission to change the link for this room.';
    default:
      return 'Something went wrong with the link. Try again.';
  }
}

const randomBytes = (count: number) => crypto.getRandomValues(new Uint8Array(count));

function snapshotOf(room: RoomSummary) {
  if (!room.stored) throw new Error('This room has no floor plan to share yet.');
  return {
    ownerId: room.ownerId,
    name: room.name,
    units: room.units,
    room: room.stored,
    design: room.design,
  };
}

/** Creates a private link: the snapshot and `rooms/{id}.shareId`, in one write. */
export async function createShare(room: RoomSummary): Promise<string> {
  const shareId = generateShareId(randomBytes);
  const batch = writeBatch(db);
  batch.set(
    doc(db, 'shares', shareId),
    buildShareDoc(snapshotOf(room), {
      roomId: room.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  batch.update(doc(db, 'rooms', room.id), { shareId });
  await batch.commit();
  return shareId;
}

/** Refreshes the shared copy with the room as it is now. The link stays the same. */
export async function updateShare(room: RoomSummary, shareId: string): Promise<void> {
  const {
    name,
    units,
    room: stored,
    design,
  } = buildShareDoc(snapshotOf(room), {
    roomId: room.id,
    createdAt: null,
  });
  await updateDoc(doc(db, 'shares', shareId), {
    name,
    units,
    room: stored,
    design,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Revokes the link: deletes the snapshot (when it still exists) and clears `rooms/{id}.shareId`,
 * in one write.
 */
export async function revokeShare(
  room: RoomSummary,
  shareId: string,
  snapshotExists: boolean,
): Promise<void> {
  const batch = writeBatch(db);
  if (snapshotExists) batch.delete(doc(db, 'shares', shareId));
  batch.update(doc(db, 'rooms', room.id), { shareId: null });
  await batch.commit();
}
