/**
 * Final pictures of a room. The phone saves the JPEG to Storage at `picturePath(...)` and writes
 * `buildPictureDoc(...)` to `rooms/{roomId}/pictures/{pictureId}`; the website lists that
 * collection newest first and reads it with `pictureFromFirestore`.
 */
import type { CapturePlatform, PictureDoc, TimestampLike } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPlatform = (v: unknown): v is CapturePlatform =>
  v === 'ios' || v === 'android' || v === 'web';

/** Storage path of a picture: `users/{uid}/rooms/{roomId}/pictures/{pictureId}.jpg`. */
export function picturePath(uid: string, roomId: string, pictureId: string): string {
  return `users/${uid}/rooms/${roomId}/pictures/${pictureId}.jpg`;
}

/** The `rooms/{roomId}/pictures/{pictureId}` document. Pass `createdAt` as a server timestamp. */
export function buildPictureDoc<TTime>(picture: {
  uid: string;
  roomId: string;
  pictureId: string;
  width: number;
  height: number;
  platform: CapturePlatform;
  createdAt: TTime;
}): PictureDoc<TTime> {
  return {
    createdAt: picture.createdAt,
    storagePath: picturePath(picture.uid, picture.roomId, picture.pictureId),
    width: Math.round(picture.width),
    height: Math.round(picture.height),
    platform: picture.platform,
  };
}

/**
 * Reads a picture document. Null when it is not usable. `createdAt` is null while a server
 * timestamp is still pending.
 */
export function pictureFromFirestore(data: unknown): PictureDoc<TimestampLike | null> | null {
  if (typeof data !== 'object' || data === null) return null;
  const { storagePath, width, height, platform, createdAt } = data as Record<string, unknown>;
  if (typeof storagePath !== 'string' || !storagePath.startsWith('users/')) return null;
  if (!isNum(width) || !isNum(height) || width <= 0 || height <= 0) return null;
  const time =
    typeof createdAt === 'object' &&
    createdAt !== null &&
    typeof (createdAt as TimestampLike).toMillis === 'function'
      ? (createdAt as TimestampLike)
      : null;
  return {
    createdAt: time,
    storagePath,
    width,
    height,
    platform: isPlatform(platform) ? platform : 'ios',
  };
}
