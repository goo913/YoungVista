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

describe('scan logs', () => {
  const log = (ownerId: string, extra: Record<string, unknown> = {}) => ({
    v: 1,
    ownerId,
    createdAt: new Date(),
    outcome: 'abandoned',
    platform: 'ios',
    marks: [{ id: 'm1', origin: [0, 1.4, 0], direction: [0, -0.6, -0.8] }],
    walls: [],
    planes: [{ id: 'p1', vertices: [0, 0, 0, 1, 0, 0] }],
    poses: [0, 0, 1.4, 0, 0, -0.6, -0.8, 0, 0.8, -0.6],
    ...extra,
  });

  it('can be written by the signed-in user for themselves only', async () => {
    await assertSucceeds(db('alice').collection('scanLogs').add(log('alice')));
    await assertSucceeds(
      db('alice')
        .doc('scanLogs/l1')
        .set(log('alice', { outcome: 'saved' })),
    );
    await assertFails(db('alice').doc('scanLogs/l2').set(log('bob')));
    await assertFails(db().doc('scanLogs/l3').set(log('alice')));
  });

  it('must look like a scan log of a sane size', async () => {
    const alice = db('alice');
    await assertFails(alice.doc('scanLogs/a').set(log('alice', { outcome: 'great' })));
    await assertFails(alice.doc('scanLogs/b').set(log('alice', { createdAt: 'today' })));
    await assertFails(
      alice.doc('scanLogs/c').set(log('alice', { poses: new Array(7001).fill(0) })),
    );
    await assertFails(
      alice.doc('scanLogs/d').set(log('alice', { planes: new Array(401).fill({}) })),
    );
    await assertFails(alice.doc('scanLogs/e').set(log('alice', { marks: 'many' })));
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    await assertFails(alice.doc('scanLogs/f').set(log('alice', wide)));
  });

  it('can be read and deleted by its owner only, and changed by nobody', async () => {
    await seed('scanLogs/l1', log('alice'));
    await assertSucceeds(db('alice').doc('scanLogs/l1').get());
    await assertFails(db('bob').doc('scanLogs/l1').get());
    await assertFails(db().doc('scanLogs/l1').get());
    await assertFails(db('alice').doc('scanLogs/l1').update({ outcome: 'saved' }));
    await assertFails(
      db('alice')
        .doc('scanLogs/l1')
        .set(log('alice', { outcome: 'saved' })),
    );
    await assertFails(db('bob').doc('scanLogs/l1').delete());
    await assertSucceeds(db('alice').doc('scanLogs/l1').delete());
  });

  it("can be listed by their owner, never anyone else's", async () => {
    await seed('scanLogs/l1', log('alice'));
    await seed('scanLogs/l2', log('bob'));
    await assertSucceeds(db('alice').collection('scanLogs').where('ownerId', '==', 'alice').get());
    await assertFails(db('alice').collection('scanLogs').get());
    await assertFails(db('alice').collection('scanLogs').where('ownerId', '==', 'bob').get());
    await assertFails(db().collection('scanLogs').get());
  });
});

describe('scan fits', () => {
  it('can be read by their owner only, and written by nobody but the server', async () => {
    await seed('scanFits/s1', { ownerId: 'alice', status: 'queued' });
    await assertSucceeds(db('alice').doc('scanFits/s1').get());
    await assertFails(db('bob').doc('scanFits/s1').get());
    await assertFails(db().doc('scanFits/s1').get());
    await assertFails(db('alice').doc('scanFits/s1').update({ status: 'done' }));
    await assertFails(db('alice').doc('scanFits/s2').set({ ownerId: 'alice', status: 'done' }));
    await assertFails(db('alice').doc('scanFits/s1').delete());
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await assertFails(db('alice').doc('users/alice').set({ hello: 'world' }));
    await assertFails(db('alice').doc('catalog/item').get());
  });
});
