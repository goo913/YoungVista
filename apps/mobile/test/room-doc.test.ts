import { roomFromFirestore, roomFromPoints } from '@youngvista/core';
import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  designUpdate,
  listFromCache,
  listToCache,
  pendingFromText,
  pendingToText,
  roomUpdate,
  saveErrorMessage,
  scannedRoomDoc,
  summaryFromCache,
  summaryToCache,
  toSummary,
  withPending,
  type RoomSummary,
} from '@/lib/room-doc';

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
      design: { items: [] },
      shareId: null,
    });
  });

  it('reads the private link, ignoring anything that cannot be a share id', () => {
    const doc = scannedRoomDoc({
      ownerId: 'u',
      name: 'Den',
      units: 'metric',
      room,
      platform: 'ios',
    });
    expect(toSummary('r1', { ...doc, shareId: 'Xk2vQ9pLm3Rt7Wy1Zb4Nc8Df' }).shareId).toBe(
      'Xk2vQ9pLm3Rt7Wy1Zb4Nc8Df',
    );
    expect(toSummary('r1', { ...doc, shareId: 'short' }).shareId).toBeNull();
    expect(toSummary('r1', { ...doc, shareId: 42 }).shareId).toBeNull();
  });

  it('reads the furniture, skipping unusable items', () => {
    const summary = toSummary('r1', {
      name: 'Den',
      room: scannedRoomDoc({ ownerId: 'u', name: 'Den', units: 'metric', room, platform: 'ios' })
        .room,
      design: {
        items: [
          { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 90, variant: 'navy' },
          { id: 'b', productId: 'lamp' }, // no position
        ],
      },
    });
    expect(summary.design.items).toEqual([
      { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 90, variant: 'navy' },
    ]);
  });
});

const summary: RoomSummary = {
  id: 'r1',
  name: 'Den',
  updatedAt: new Date(1_700_000_000_000),
  units: 'imperial',
  room,
  design: { items: [{ id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 0 }] },
  shareId: 'Xk2vQ9pLm3Rt7Wy1Zb4Nc8Df',
};

describe('autosave writes', () => {
  it('write exactly what designToFirestore gives: no undefined fields', () => {
    const update = designUpdate({
      items: [
        { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 0, variant: undefined, y: 0 },
        { id: 'b', productId: 'succulent', x: 1, z: 2, rotationY: 0, y: 0.75 },
      ],
    });
    expect(update.design).toEqual({
      items: [
        { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 0 },
        { id: 'b', productId: 'succulent', x: 1, z: 2, rotationY: 0, y: 0.75 },
      ],
    });
    expect(Object.keys(update.design.items[0]!)).not.toContain('variant');
    expect(Object.keys(update).sort()).toEqual(['design', 'updatedAt']);
    const shape = roomUpdate(room);
    expect(roomFromFirestore(shape.room)).toEqual(room);
    expect(Object.keys(shape).sort()).toEqual(['room', 'updatedAt']);
  });
});

describe('the copies kept on the phone', () => {
  it('keep the rooms list so it shows without a connection', () => {
    const other: RoomSummary = { ...summary, id: 'r2', name: 'Den', room: null };
    expect(listFromCache(listToCache([summary, other]))).toEqual([summary, other]);
    expect(listFromCache(null)).toEqual([]);
    expect(listFromCache('{"no":"list"}')).toEqual([]);
    expect(listFromCache('[{"id":"x","copy":"broken"}, 7]')).toEqual([]);
  });

  it('keep a room so it opens without a connection', () => {
    expect(summaryFromCache('r1', summaryToCache(summary))).toEqual(summary);
    // A copy written before rooms had links reads as not shared.
    const old = JSON.parse(summaryToCache(summary)) as Record<string, unknown>;
    delete old.shareId;
    expect(summaryFromCache('r1', JSON.stringify(old))?.shareId).toBeNull();
    expect(summaryFromCache('r1', null)).toBeNull();
    expect(summaryFromCache('r1', '{"v":2}')).toBeNull();
    expect(summaryFromCache('r1', 'not json')).toBeNull();
  });

  it('keep edits not on the server yet and lay them over the room', () => {
    const design = { items: [{ id: 'b', productId: 'bed', x: 2, z: 2, rotationY: 90 }] };
    const pending = pendingFromText(pendingToText({ design }));
    expect(pending).toEqual({ design });
    expect(withPending(summary, pending).design).toEqual(design);
    expect(withPending(summary, {})).toBe(summary);
    const moved = roomFromPoints(
      [
        [0, 0],
        [5, 0],
        [5, 3],
        [0, 3],
      ],
      { ceilingHeight: 2.5 },
    );
    expect(withPending(summary, pendingFromText(pendingToText({ room: moved }))).room).toEqual(
      moved,
    );
    expect(pendingFromText('garbage')).toEqual({});
  });
});

describe('saveErrorMessage', () => {
  it('explains a failed save', () => {
    expect(saveErrorMessage({ code: 'unavailable' })).toMatch(/connection/);
    expect(saveErrorMessage(new Error('x'))).toBe('The room could not be saved. Try again.');
  });
});
