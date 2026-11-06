/**
 * Hands the scanned room from the scan screen to the review screen. The scan screen is replaced
 * by the review screen (so the AR session is released), which leaves no navigation state to
 * carry a room in; a room is too big for a route parameter.
 */
import type { CapturePlatform, Room } from '@youngvista/core';
import type { ScanRecord } from './controller';
import type { ScanLogger } from './scan-log';

export interface RoomDraft {
  room: Room;
  /** Indices into `room.walls` of walls no mark was on (they were filled in). */
  inferredWalls: number[];
  /** Walls joined from the marks. */
  observedWallCount: number;
  platform: CapturePlatform;
  /** The scan, for its log: the review screen writes it once the room is saved or dropped. */
  log: { logger: ScanLogger; record: ScanRecord } | null;
}

let current: RoomDraft | null = null;

export const setRoomDraft = (draft: RoomDraft): void => {
  current = draft;
};

export const getRoomDraft = (): RoomDraft | null => current;

export const clearRoomDraft = (): void => {
  current = null;
};
