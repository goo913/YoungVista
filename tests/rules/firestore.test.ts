import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-young-vista',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const db = (uid?: string) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

const roomData = (ownerId: string) => ({
  ownerId,
  name: 'Bedroom',
  units: 'imperial',
  updatedAt: new Date(),
  room: { version: 1, points: [{ x: 0, z: 0 }], ceilingHeight: 2.4384, walls: [] },
  shareId: null,
});

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

const SHARE_ID = 'Xk2v9QpLm4Rt7Wz1Yb8NcD5f';

describe('rooms', () => {
  it('lets the owner create, read, update and delete a room', async () => {
    const alice = db('alice');
    await assertSucceeds(alice.doc('rooms/r1').set(roomData('alice')));
    await assertSucceeds(alice.doc('rooms/r1').get());
    await assertSucceeds(alice.doc('rooms/r1').update({ name: 'Guest room' }));
    await assertSucceeds(alice.doc('rooms/r1').delete());
  });

  it('does not let anyone create a room for someone else', async () => {
    await assertFails(db('alice').doc('rooms/r1').set(roomData('bob')));
    await assertFails(db().doc('rooms/r1').set(roomData('alice')));
  });

  it('hides a room from other users and signed-out visitors', async () => {
    await seed('rooms/r1', roomData('alice'));
    await assertFails(db('bob').doc('rooms/r1').get());
    await assertFails(db().doc('rooms/r1').get());
    await assertFails(db('bob').doc('rooms/r1').update({ name: 'Mine now' }));
    await assertFails(db('bob').doc('rooms/r1').delete());
  });

  it('never lets ownerId change', async () => {
    await seed('rooms/r1', roomData('alice'));
    await assertFails(db('alice').doc('rooms/r1').update({ ownerId: 'bob' }));
    await assertFails(db('bob').doc('rooms/r1').set(roomData('bob')));
  });

  it("lets a user list their own rooms, newest first, but not everyone's", async () => {
    await seed('rooms/r1', roomData('alice'));
    await seed('rooms/r2', roomData('bob'));
    await assertSucceeds(
      db('alice')
        .collection('rooms')
        .where('ownerId', '==', 'alice')
        .orderBy('updatedAt', 'desc')
        .get(),
    );
    await assertFails(db('alice').collection('rooms').get());
    await assertFails(db('alice').collection('rooms').where('ownerId', '==', 'bob').get());
    await assertFails(db().collection('rooms').where('ownerId', '==', 'alice').get());
  });
});

describe('room pictures', () => {
  beforeEach(() => seed('rooms/r1', roomData('alice')));

  it('are readable and writable by the room owner only', async () => {
    const picture = {
      storagePath: 'users/alice/rooms/r1/pictures/p1.jpg',
      width: 2048,
      height: 1536,
    };
    await assertSucceeds(db('alice').doc('rooms/r1/pictures/p1').set(picture));
    await assertSucceeds(db('alice').doc('rooms/r1/pictures/p1').get());
    await assertSucceeds(db('alice').collection('rooms/r1/pictures').get());
    await assertFails(db('bob').doc('rooms/r1/pictures/p1').get());
    await assertFails(db('bob').doc('rooms/r1/pictures/p2').set(picture));
    await assertFails(db().collection('rooms/r1/pictures').get());
  });

  it('cannot be added to a room that does not exist', async () => {
    await assertFails(db('alice').doc('rooms/nope/pictures/p1').set({ width: 1 }));
  });
});

describe('shares', () => {
  const share = (ownerId: string, roomId = 'r1') => ({
    ownerId,
    roomId,
    name: 'Bedroom',
    units: 'metric',
  });

  beforeEach(() => seed('rooms/r1', roomData('alice')));

  it('can be read by anyone with the link, signed in or not', async () => {
    await seed(`shares/${SHARE_ID}`, share('alice'));
    await assertSucceeds(db().doc(`shares/${SHARE_ID}`).get());
    await assertSucceeds(db('bob').doc(`shares/${SHARE_ID}`).get());
  });

  it('cannot be listed', async () => {
    await seed(`shares/${SHARE_ID}`, share('alice'));
    await assertFails(db().collection('shares').get());
    await assertFails(db('alice').collection('shares').where('ownerId', '==', 'alice').get());
  });

  it('can only be created by the owner of the room, with a long id', async () => {
    await assertSucceeds(db('alice').doc(`shares/${SHARE_ID}`).set(share('alice')));
    await assertFails(db('alice').doc('shares/short').set(share('alice')));
    await assertFails(db('bob').doc('shares/Bb2v9QpLm4Rt7Wz1Yb8NcD5f').set(share('bob')));
    await assertFails(db('bob').doc('shares/Cc2v9QpLm4Rt7Wz1Yb8NcD5f').set(share('alice')));
    await assertFails(db().doc('shares/Dd2v9QpLm4Rt7Wz1Yb8NcD5f').set(share('alice')));
    await assertFails(
      db('alice').doc('shares/Ee2v9QpLm4Rt7Wz1Yb8NcD5f').set(share('alice', 'missing-room')),
    );
  });

  it('can only be changed or revoked by its owner, who cannot hand it over', async () => {
    await seed(`shares/${SHARE_ID}`, share('alice'));
    await assertFails(db('bob').doc(`shares/${SHARE_ID}`).update({ name: 'Hacked' }));
    await assertFails(db('bob').doc(`shares/${SHARE_ID}`).delete());
    await assertFails(db('alice').doc(`shares/${SHARE_ID}`).update({ ownerId: 'bob' }));
    await assertFails(db('alice').doc(`shares/${SHARE_ID}`).update({ roomId: 'r2' }));
    await assertSucceeds(db('alice').doc(`shares/${SHARE_ID}`).update({ name: 'Updated' }));
    await assertSucceeds(db('alice').doc(`shares/${SHARE_ID}`).delete());
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await assertFails(db('alice').doc('users/alice').set({ hello: 'world' }));
    await assertFails(db('alice').doc('catalog/item').get());
  });
});
