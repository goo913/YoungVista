/**
 * Hands the scanned room from the scan screen to the review screen. The scan screen is replaced
 * by the review screen (so the AR session is released), which leaves no navigation state to
 * carry a room in; a room is too big for a route parameter.
 */
import type { CapturePlatform, Room } from '@youngvista/core';

export interface RoomDraft {
  room: Room;
  /** Indices into `room.walls` of walls the scan never saw (they were filled in). */
  inferredWalls: number[];
  observedWallCount: number;
  platform: CapturePlatform;
}

let current: RoomDraft | null = null;

export const setRoomDraft = (draft: RoomDraft): void => {
  current = draft;
};

export const getRoomDraft = (): RoomDraft | null => current;

export const clearRoomDraft = (): void => {
  current = null;
};
