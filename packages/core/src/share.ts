/**
 * Private share links. A share is a snapshot of a room and its design at `shares/{shareId}`,
 * readable by anyone who has the (long, random) id and never listable. The owner creates it, can
 * refresh it, and deletes it to revoke the link; `rooms/{roomId}.shareId` points at the active one.
 */
import type { RoomDoc, ShareDoc, StoredRoom } from './types';
import type { RoomTour } from './turn-scan';
import { designToFirestore } from './design';
import { roomTourToFirestore } from './tour';

/** Default share id length: 24 letters and digits, about 143 bits of randomness. */
export const SHARE_ID_LENGTH = 24;
/** The Firestore rules refuse shorter share ids. */
export const SHARE_ID_MIN_LENGTH = 20;
/** Public address of the website; share links are `${SHARE_BASE_URL}/s/{shareId}`. */
export const SHARE_BASE_URL = 'https://young-vista.web.app';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Bytes at or above this are skipped so every character is equally likely (248 = 4 × 62). */
const BYTE_LIMIT = 248;

/**
 * Returns `count` random bytes. On the web: `(n) => crypto.getRandomValues(new Uint8Array(n))`.
 * On the phone, where `crypto` is missing by default: `expo-crypto`'s `getRandomBytes`.
 */
export type RandomBytes = (count: number) => Uint8Array;

/** A new share id: `length` (at least 20) URL-safe letters and digits from `randomBytes`. */
export function generateShareId(randomBytes: RandomBytes, length = SHARE_ID_LENGTH): string {
  if (!Number.isInteger(length) || length < SHARE_ID_MIN_LENGTH) {
    throw new RangeError(`Share ids need at least ${SHARE_ID_MIN_LENGTH} characters.`);
  }
  let id = '';
  for (let round = 0; id.length < length; round++) {
    if (round > 64) throw new Error('The random source keeps returning unusable bytes.');
    const bytes = randomBytes(Math.max(16, (length - id.length) * 2));
    if (!bytes || bytes.length === 0) throw new Error('The random source returned no bytes.');
    for (const b of bytes) {
      if (b >= BYTE_LIMIT) continue;
      id += ALPHABET[b % ALPHABET.length];
      if (id.length === length) break;
    }
  }
  return id;
}

/** True for a string that can be a share id (20 to 128 URL-safe characters). */
export function isShareId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

/** The link to a share, e.g. `https://young-vista.web.app/s/Xk2v…`. */
export function shareUrl(shareId: string, baseUrl = SHARE_BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, '')}/s/${encodeURIComponent(shareId)}`;
}

const copyStoredRoom = (room: StoredRoom): StoredRoom => ({
  version: 1,
  points: room.points.map((p) => ({ x: p.x, z: p.z })),
  ceilingHeight: room.ceilingHeight,
  walls: room.walls.map((w) => ({
    id: w.id,
    a: w.a,
    b: w.b,
    openings: w.openings.map((o) => ({ ...o })),
  })),
});

/**
 * The `shares/{shareId}` snapshot of a room document. Pass `createdAt` (and `updatedAt` when
 * refreshing) as server timestamps. The result is a deep copy with no `undefined` fields, ready
 * for `setDoc`. A `tour` is copied only when given: its pictures must be marked as shared first
 * (`TOUR_SHARE_METADATA`), or the link's viewers cannot load them.
 */
export function buildShareDoc<TTime>(
  room: Pick<RoomDoc<unknown>, 'ownerId' | 'name' | 'units' | 'room' | 'design'> & {
    tour?: RoomTour | null;
  },
  ids: { roomId: string; createdAt: TTime; updatedAt?: TTime },
): ShareDoc<TTime> {
  const doc: ShareDoc<TTime> = {
    ownerId: room.ownerId,
    roomId: ids.roomId,
    name: room.name.trim() || 'Untitled room',
    createdAt: ids.createdAt,
    units: room.units === 'metric' ? 'metric' : 'imperial',
    room: copyStoredRoom(room.room),
    design: designToFirestore(room.design ?? { items: [] }),
  };
  if (ids.updatedAt !== undefined) doc.updatedAt = ids.updatedAt;
  if (room.tour) doc.tour = roomTourToFirestore(room.tour);
  return doc;
}
