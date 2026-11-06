/**
 * The room page's private link, as the phone shows it, and the snapshot it shares. The same
 * data and rules as the website's share card (apps/web/src/lib/shares.ts and
 * components/share-card.tsx): a share is `shares/{shareId}`, a copy of the room and its design
 * made with core's `buildShareDoc`; `rooms/{id}.shareId` points at it; turning the link off
 * deletes the copy and clears `shareId`. Plain TypeScript (no Firebase), so it is unit tested.
 */
import {
  buildShareDoc,
  generateShareId,
  roomToFirestore,
  shareUrl,
  type Design,
  type RandomBytes,
  type Room,
  type ShareDoc,
  type UnitSystem,
} from '@youngvista/core';

/** What `shares/{shareId}` holds, as far as the room page needs to know. */
export type ShareSnapshot =
  | { status: 'loading' }
  | { status: 'ready'; updatedAt: Date | null }
  /** Deleted (turned off, perhaps on the website) or never there. */
  | { status: 'missing' }
  | { status: 'error'; message: string };

export interface ShareRoom {
  shareId: string | null;
  updatedAt: Date | null;
  /** The room has a floor plan (nothing to share without one). */
  hasPlan: boolean;
}

export type ShareView =
  | { kind: 'none'; canCreate: boolean; text: string }
  | { kind: 'loading'; shareId: string }
  | {
      kind: 'active';
      shareId: string;
      link: string;
      /** When the shared copy was made or last updated. */
      sharedAt: Date | null;
      /** The room changed after the shared copy was made. */
      outdated: boolean;
      canUpdate: boolean;
    }
  | { kind: 'missing'; shareId: string; canCreate: boolean; text: string }
  | { kind: 'error'; shareId: string; text: string };

/** The room's own save lands a moment after the shared copy's; a second is not "changed". */
const SAME_TIME_MS = 1000;

/** What the share card shows for a room and the state of its shared copy. */
export function shareView(room: ShareRoom, snapshot: ShareSnapshot): ShareView {
  if (!room.shareId) {
    return {
      kind: 'none',
      canCreate: room.hasPlan,
      text: room.hasPlan
        ? 'Anyone with the link can see this room and its furniture on the website, without signing in. You can turn it off at any time.'
        : 'Finish the floor plan before sharing this room.',
    };
  }
  const shareId = room.shareId;
  switch (snapshot.status) {
    case 'loading':
      return { kind: 'loading', shareId };
    case 'missing':
      return {
        kind: 'missing',
        shareId,
        canCreate: room.hasPlan,
        text: 'The old link no longer works. Create a new one to share this room again.',
      };
    case 'error':
      return { kind: 'error', shareId, text: snapshot.message };
    case 'ready': {
      const sharedAt = snapshot.updatedAt;
      const outdated =
        sharedAt !== null && room.updatedAt !== null
          ? room.updatedAt.getTime() > sharedAt.getTime() + SAME_TIME_MS
          : false;
      return {
        kind: 'active',
        shareId,
        link: shareUrl(shareId),
        sharedAt,
        outdated,
        canUpdate: room.hasPlan,
      };
    }
  }
}

/** The room as it is shared: the owner, its name and units, its walls and its furniture. */
export interface ShareSource {
  roomId: string;
  ownerId: string;
  name: string;
  units: UnitSystem;
  room: Room;
  design: Design;
}

/** A new share id from the phone's secure random source (expo-crypto's `getRandomBytes`). */
export const newShareId = (randomBytes: RandomBytes): string => generateShareId(randomBytes);

/** The `shares/{shareId}` document for a new link: exactly what the website writes. */
export function newShareDoc<TTime>(source: ShareSource, now: TTime): ShareDoc<TTime> {
  return buildShareDoc(
    {
      ownerId: source.ownerId,
      name: source.name,
      units: source.units,
      room: roomToFirestore(source.room),
      design: source.design,
    },
    { roomId: source.roomId, createdAt: now, updatedAt: now },
  );
}

/** The fields "Update shared copy" writes: the room as it is now, and the time. */
export function shareUpdate<TTime>(
  source: ShareSource,
  now: TTime,
): Pick<ShareDoc<TTime>, 'name' | 'units' | 'room' | 'design'> & { updatedAt: TTime } {
  const { name, units, room, design } = newShareDoc(source, now);
  return { name, units, room, design, updatedAt: now };
}

/** What the system share sheet sends: the link, and a line saying what it is. */
export function shareMessage(name: string, link: string): { title: string; message: string } {
  return { title: name, message: `${name} on YoungVista: ${link}` };
}
