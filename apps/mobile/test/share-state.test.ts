import {
  buildShareDoc,
  isShareId,
  roomFromFirestore,
  roomFromPoints,
  roomToFirestore,
  SHARE_ID_LENGTH,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  newShareDoc,
  newShareId,
  shareMessage,
  shareUpdate,
  shareView,
  type ShareSource,
} from '@/lib/share-state';

const room = roomFromPoints([
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
]);

const source: ShareSource = {
  roomId: 'room1',
  ownerId: 'user1',
  name: '  Den ',
  units: 'metric',
  room,
  design: {
    items: [{ id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 90, variant: undefined }],
  },
};

const ID = 'Xk2vQ9pLm3Rt7Wy1Zb4Nc8Df';
const at = (s: number) => new Date(1_700_000_000_000 + s * 1000);

describe('the share card', () => {
  it('offers a link for a room with a floor plan', () => {
    expect(
      shareView({ shareId: null, updatedAt: at(0), hasPlan: true }, { status: 'missing' }),
    ).toMatchObject({
      kind: 'none',
      canCreate: true,
    });
    const noPlan = shareView(
      { shareId: null, updatedAt: null, hasPlan: false },
      { status: 'missing' },
    );
    expect(noPlan).toMatchObject({ kind: 'none', canCreate: false });
    if (noPlan.kind === 'none') expect(noPlan.text).toContain('floor plan');
  });

  it('shows the live link and whether the room changed since it was shared', () => {
    const shared = { status: 'ready' as const, updatedAt: at(10) };
    const same = shareView({ shareId: ID, updatedAt: at(10.5), hasPlan: true }, shared);
    expect(same).toEqual({
      kind: 'active',
      shareId: ID,
      link: `https://young-vista.web.app/s/${ID}`,
      sharedAt: at(10),
      outdated: false,
      canUpdate: true,
    });
    const changed = shareView({ shareId: ID, updatedAt: at(60), hasPlan: true }, shared);
    expect(changed).toMatchObject({ kind: 'active', outdated: true });
  });

  it('waits for the shared copy, and says when the link no longer works', () => {
    expect(
      shareView({ shareId: ID, updatedAt: null, hasPlan: true }, { status: 'loading' }),
    ).toEqual({
      kind: 'loading',
      shareId: ID,
    });
    const gone = shareView({ shareId: ID, updatedAt: null, hasPlan: true }, { status: 'missing' });
    expect(gone).toMatchObject({ kind: 'missing', shareId: ID, canCreate: true });
    expect(
      shareView(
        { shareId: ID, updatedAt: null, hasPlan: true },
        { status: 'error', message: 'Cannot reach the server.' },
      ),
    ).toEqual({ kind: 'error', shareId: ID, text: 'Cannot reach the server.' });
  });
});

describe('the shared copy', () => {
  it('is exactly what the website writes', () => {
    const now = { server: 'time' };
    const doc = newShareDoc(source, now);
    expect(doc).toEqual(
      buildShareDoc(
        {
          ownerId: 'user1',
          name: '  Den ',
          units: 'metric',
          room: roomToFirestore(room),
          design: source.design,
        },
        { roomId: 'room1', createdAt: now, updatedAt: now },
      ),
    );
    expect(doc.name).toBe('Den');
    expect(doc.ownerId).toBe('user1');
    expect(doc.roomId).toBe('room1');
    expect(roomFromFirestore(doc.room)).toEqual(room);
    // Firestore refuses undefined fields.
    expect(Object.keys(doc.design.items[0]!)).not.toContain('variant');
    expect(JSON.stringify(doc)).not.toContain('undefined');
  });

  it('is refreshed without touching its owner, room or creation time', () => {
    const update = shareUpdate(source, 'later');
    expect(Object.keys(update).sort()).toEqual(['design', 'name', 'room', 'units', 'updatedAt']);
    expect(update.updatedAt).toBe('later');
  });

  it('gets a long random id the rules accept', () => {
    let n = 0;
    const bytes = (count: number) => Uint8Array.from({ length: count }, () => (n++ * 37) % 256);
    const id = newShareId(bytes);
    expect(id).toHaveLength(SHARE_ID_LENGTH);
    expect(isShareId(id)).toBe(true);
  });

  it('is sent with a line saying what it is', () => {
    expect(shareMessage('Den', 'https://young-vista.web.app/s/x')).toEqual({
      title: 'Den',
      message: 'Den on YoungVista: https://young-vista.web.app/s/x',
    });
  });
});
