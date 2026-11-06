import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const MB = 1024 * 1024;
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-young-vista',
    // Firestore too: shared 360° pictures are checked against their link's document.
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
});

const storage = (uid?: string) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();

const picture = 'rooms/r1/pictures/p1.jpg';
// UploadTask is only a thenable; wrap it so assertSucceeds/assertFails get a real promise.
async function upload(
  uid: string | undefined,
  path: string,
  bytes: number,
  contentType = 'image/jpeg',
) {
  await storage(uid).ref(path).put(new Uint8Array(bytes), { contentType });
}

describe('users/{uid}/**', () => {
  it('lets a user upload, read and delete their own images', async () => {
    await assertSucceeds(upload('alice', `users/alice/${picture}`, 1024));
    await assertSucceeds(storage('alice').ref(`users/alice/${picture}`).getMetadata());
    await assertSucceeds(storage('alice').ref(`users/alice/${picture}`).delete());
  });

  it("keeps other users and visitors out of a user's files", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .storage()
        .ref(`users/alice/${picture}`)
        .put(new Uint8Array(16), { contentType: 'image/jpeg' });
    });
    await assertFails(storage('bob').ref(`users/alice/${picture}`).getMetadata());
    await assertFails(storage().ref(`users/alice/${picture}`).getMetadata());
    await assertFails(storage('bob').ref(`users/alice/${picture}`).delete());
    await assertFails(upload('bob', `users/alice/rooms/r1/pictures/p2.jpg`, 16));
  });

  it('accepts images up to 10 MB and nothing else', async () => {
    await assertSucceeds(upload('alice', `users/alice/${picture}`, 10 * MB));
    await assertFails(upload('alice', `users/alice/${picture}`, 10 * MB + 1));
    await assertFails(upload('alice', 'users/alice/notes.txt', 16, 'text/plain'));
  });

  it("takes a turn-around scan's JSON manifest, and no other JSON", async () => {
    const scan = 'users/alice/scans/s1';
    await assertSucceeds(upload('alice', `${scan}/capture.json`, 1024, 'application/json'));
    await assertSucceeds(upload('alice', `${scan}/kf/000.jpg`, 1024));
    await assertFails(upload('alice', `${scan}/capture.json`, 2 * MB + 1, 'application/json'));
    await assertFails(upload('alice', `${scan}/other.json`, 16, 'application/json'));
    await assertFails(upload('bob', `${scan}/capture.json`, 16, 'application/json'));
  });

  it('denies everything outside users/', async () => {
    await assertFails(upload('alice', 'catalog/models/sofa.png', 16, 'image/png'));
    await assertFails(storage('alice').ref('catalog/models/sofa.png').getMetadata());
  });
});

describe("a shared room's 360° pictures", () => {
  const shareId = 'Xk2v9QpLm4Rt7Wz1Yb8NcD5f';
  const pano = 'users/alice/scans/s1/pano/spot-0.jpg';

  async function seed(file: string, metadata: Record<string, string>, shareOwner?: string) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .storage()
        .ref(file)
        .put(new Uint8Array(16), { contentType: 'image/jpeg', customMetadata: metadata });
      if (shareOwner) {
        await ctx.firestore().doc(`shares/${shareId}`).set({ ownerId: shareOwner, roomId: 'r1' });
      }
    });
  }

  it('can be read by anyone while the link that marks them is on', async () => {
    await seed(pano, { shareId }, 'alice');
    await assertSucceeds(storage().ref(pano).getMetadata());
    await assertSucceeds(storage('bob').ref(pano).getMetadata());
    // Never listed, and never written by others.
    await assertFails(storage().ref('users/alice/scans/s1/pano').listAll());
    await assertFails(upload('bob', pano, 16));
    await assertFails(storage('bob').ref(pano).delete());
    // Turning the link off closes them.
    await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(`shares/${shareId}`).delete());
    await assertFails(storage().ref(pano).getMetadata());
    await assertSucceeds(storage('alice').ref(pano).getMetadata());
  });

  it('stay private without a mark, with a link of another owner, or outside pano/', async () => {
    await seed(pano, {}, 'alice');
    await assertFails(storage().ref(pano).getMetadata());
    await seed('users/alice/scans/s1/kf/000.jpg', { shareId });
    await assertFails(storage().ref('users/alice/scans/s1/kf/000.jpg').getMetadata());
    await seed(pano, { shareId }, 'mallory');
    await assertFails(storage().ref(pano).getMetadata());
  });

  it('are marked by their owner only', async () => {
    await seed(pano, {});
    await assertSucceeds(
      storage('alice').ref(pano).updateMetadata({ customMetadata: { shareId } }),
    );
    await assertFails(storage('bob').ref(pano).updateMetadata({ customMetadata: { shareId } }));
  });
});
