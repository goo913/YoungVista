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
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearStorage());

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
