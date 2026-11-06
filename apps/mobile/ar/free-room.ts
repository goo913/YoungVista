/**
 * "Place freely": true-size furniture in the camera view with no saved room. The pieces still go
 * through the design's own rules (furnish/design-state.ts: 15° turns, no overlaps), inside a large
 * square "room" around where the AR session started, whose walls are too far away to snap to.
 * The AR world is its room space, so the line-up is only the floor's height (`scanLineUp`).
 * Nothing is saved.
 */
import { roomFromPoints, type Room } from '@youngvista/core';

/** Half the side of the open square (m): far beyond any home's rooms. */
export const FREE_HALF_SIZE = 10;

/** The open square the pieces stand in, centred on the AR session's origin. */
export function freeRoom(half = FREE_HALF_SIZE): Room {
  return roomFromPoints(
    [
      [-half, -half],
      [-half, half],
      [half, half],
      [half, -half],
    ],
    { wallIdPrefix: 'free' },
  );
}
