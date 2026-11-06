import { DEFAULT_CEILING_HEIGHT, roomFromPoints, type Room } from '@youngvista/core';

/**
 * An L-shaped room (5 × 4 m with a 2 × 1.5 m corner cut out) for development runs against the
 * Firebase emulators, where no room can be scanned. Saved through the app's own save code.
 */
export function sampleRoom(): Room {
  return roomFromPoints(
    [
      [0, 0],
      [5, 0],
      [5, 2.5],
      [3, 2.5],
      [3, 4],
      [0, 4],
    ],
    { ceilingHeight: DEFAULT_CEILING_HEIGHT },
  );
}
