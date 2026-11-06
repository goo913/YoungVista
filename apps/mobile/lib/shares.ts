/**
 * Private links from the phone: create, refresh and turn off `shares/{shareId}`, and watch it.
 * The documents are exactly the website's (see share-state.ts), so a link made on the phone
 * opens on https://young-vista.web.app/s/{shareId} without signing in, and the website's share
 * card sees it too.
 */
import { getRandomBytes } from 'expo-crypto';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';
import { isShareId } from '@youngvista/core';
import { errorCode } from './auth-errors';
import { firestore } from './firebase';
import {
  newShareDoc,
  newShareId,
  shareMessage,
  shareUpdate,
  type ShareSnapshot,
  type ShareSource,
} from './share-state';

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

/** The shared copy behind a link, kept up to date: "missing" once it is turned off. */
export function useShare(shareId: string | null): ShareSnapshot {
  const valid = isShareId(shareId);
  // Which id the state belongs to, so a new id never shows the last one's state.
  const [state, setState] = useState<{ id: string; value: ShareSnapshot } | null>(null);
  useEffect(() => {
    if (!valid) return;
    return onSnapshot(
      doc(firestore(), 'shares', shareId),
      (snap) => {
        const data = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null;
        setState({
          id: shareId,
          value: data
            ? { status: 'ready', updatedAt: toDate(data.updatedAt) ?? toDate(data.createdAt) }
            : { status: 'missing' },
        });
      },
      (error) =>
        setState({
          id: shareId,
          value:
            errorCode(error) === 'permission-denied'
              ? { status: 'missing' }
              : { status: 'error', message: shareErrorMessage(error) },
        }),
    );
  }, [shareId, valid]);
  if (!valid) return { status: 'missing' };
  return state?.id === shareId ? state.value : { status: 'loading' };
}

export function shareErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'unavailable':
      return 'Cannot reach the server. Check your connection and try again.';
    case 'permission-denied':
      return 'You do not have permission to change the link for this room.';
    default:
      return 'Something went wrong with the link. Try again.';
  }
}

/** Creates a private link: the shared copy and `rooms/{id}.shareId`, in one write. */
export async function createShare(source: ShareSource): Promise<string> {
  const shareId = newShareId(getRandomBytes);
  const batch = writeBatch(firestore());
  batch.set(doc(firestore(), 'shares', shareId), newShareDoc(source, serverTimestamp()));
  batch.update(doc(firestore(), 'rooms', source.roomId), { shareId });
  await batch.commit();
  return shareId;
}

/** Refreshes the shared copy with the room as it is now. The link stays the same. */
export async function updateShare(source: ShareSource, shareId: string): Promise<void> {
  await updateDoc(doc(firestore(), 'shares', shareId), shareUpdate(source, serverTimestamp()));
}

/**
 * Turns the link off: deletes the shared copy (when it still exists) and clears
 * `rooms/{id}.shareId`, in one write.
 */
export async function revokeShare(
  roomId: string,
  shareId: string,
  snapshotExists: boolean,
): Promise<void> {
  const batch = writeBatch(firestore());
  if (snapshotExists) batch.delete(doc(firestore(), 'shares', shareId));
  batch.update(doc(firestore(), 'rooms', roomId), { shareId: null });
  await batch.commit();
}

/** Opens the system share sheet with the link (Messages, Mail, Copy, ...). */
export async function shareLink(name: string, link: string): Promise<void> {
  const { title, message } = shareMessage(name, link);
  // iPhone: the link as a URL (with a preview) and the line as text. Android takes one text.
  await Share.share(
    Platform.OS === 'ios' ? { url: link, message: `${name} on YoungVista` } : { title, message },
    { dialogTitle: 'Share the room', subject: title },
  );
}
