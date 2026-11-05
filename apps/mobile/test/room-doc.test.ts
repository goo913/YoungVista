import { roomFromFirestore, roomFromPoints } from '@youngvista/core';
import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { saveErrorMessage, scannedRoomDoc, toSummary } from '@/lib/room-doc';

const room = roomFromPoints(
  [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ],
  { ceilingHeight: 2.5 },
);

describe('scannedRoomDoc', () => {
  it('writes the RoomDoc shape the website reads', () => {
    const doc = scannedRoomDoc({
      ownerId: 'uid-1',
      name: '  Bedroom  ',
      units: 'imperial',
      room,
      platform: 'ios',
    });
    expect(Object.keys(doc).sort()).toEqual(
      [
        'capture',
        'createdAt',
        'design',
        'name',
        'ownerId',
        'room',
        'shareId',
        'units',
        'updatedAt',
      ].sort(),
    );
    expect(doc).toMatchObject({
      ownerId: 'uid-1',
      name: 'Bedroom',
      units: 'imperial',
      capture: { method: 'scan', platform: 'ios', scaleFactor: 1 },
      design: { items: [] },
      shareId: null,
    });
    // Firestore cannot store nested arrays: corners are { x, z } maps.
    expect(doc.room.points).toHaveLength(4);
    expect(doc.room.points).toContainEqual({ x: 4, z: 3 });
    expect(roomFromFirestore(doc.room)).toEqual(room);
  });

  it('never saves an empty name', () => {
    const doc = scannedRoomDoc({
      ownerId: 'u',
      name: '   ',
      units: 'metric',
      room,
      platform: 'android',
    });
    expect(doc.name).toBe('Untitled room');
  });
});

describe('toSummary', () => {
  it('reads what scannedRoomDoc wrote back from Firestore', () => {
    const stored = scannedRoomDoc({
      ownerId: 'u',
      name: 'Den',
      units: 'metric',
      room,
      platform: 'ios',
    });
    const now = Timestamp.fromMillis(1_700_000_000_000);
    const summary = toSummary('r1', { ...stored, createdAt: now, updatedAt: now });
    expect(summary).toEqual({
      id: 'r1',
      name: 'Den',
      updatedAt: now.toDate(),
      units: 'metric',
      room,
    });
  });
});

describe('saveErrorMessage', () => {
  it('explains a failed save', () => {
    expect(saveErrorMessage({ code: 'unavailable' })).toMatch(/connection/);
    expect(saveErrorMessage(new Error('x'))).toBe('The room could not be saved. Try again.');
  });
});
