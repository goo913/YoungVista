import { picturePath, pictureFromFirestore } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  addPicture,
  FAILURE_TEXT,
  FIRST_RETRY_MS,
  isPictureId,
  MAX_PICTURE_BYTES,
  MAX_RETRY_MS,
  newPictureId,
  nextDue,
  nextWakeAt,
  pendingPicture,
  pictureFailed,
  pictureFailure,
  pictureRecord,
  pictureStoragePath,
  pictureUploaded,
  PICTURE_ID_LENGTH,
  queueFromText,
  queueToText,
  removePicture,
  retryAllNow,
  retryDelayMs,
  shotRows,
  shotSettled,
  shotText,
  shotUpload,
  stripPictures,
  uploadView,
  type PendingPicture,
} from '@/lib/picture-state';

/** A fake random source: the bytes given, over and over. */
const bytesOf =
  (...values: number[]) =>
  (count: number) =>
    Uint8Array.from({ length: count }, (_, i) => values[i % values.length]!);

const picture = (over: Partial<PendingPicture> = {}): PendingPicture => ({
  ...pendingPicture({
    id: 'AbCdEfGhIjKlMnOpQrSt',
    uid: 'alice',
    roomId: 'room1',
    file: 'file:///docs/pictures/AbCdEfGhIjKlMnOpQrSt.jpg',
    width: 1179.4,
    height: 1410.6,
    platform: 'ios',
    takenAt: 1_000,
  }),
  ...over,
});

describe('picture ids', () => {
  it('are 20 letters and digits, like Firestore ids', () => {
    const id = newPictureId(bytesOf(0, 1, 61, 62, 123, 200, 247));
    expect(id).toHaveLength(PICTURE_ID_LENGTH);
    expect(isPictureId(id)).toBe(true);
    // 0 → A, 1 → B, 61 → 9, 62 → A again (62 % 62).
    expect(id.startsWith('AB9A')).toBe(true);
  });

  it('skip the bytes that would make some characters likelier', () => {
    const id = newPictureId(bytesOf(248, 255, 25));
    expect(id).toBe('Z'.repeat(20));
  });

  it('give up on a random source that never works', () => {
    expect(() => newPictureId(bytesOf(255))).toThrow(/unusable/);
    expect(() => newPictureId(() => new Uint8Array(0))).toThrow(/no bytes/);
  });

  it('are told apart from anything else', () => {
    expect(isPictureId('AbCdEfGhIjKlMnOpQrSt')).toBe(true);
    expect(isPictureId('short')).toBe(false);
    expect(isPictureId('AbCdEfGhIjKlMnOpQr/t')).toBe(false);
    expect(isPictureId('AbCdEfGhIjKlMnOpQrSt1')).toBe(false);
    expect(isPictureId(42)).toBe(false);
  });
});

describe('where a picture goes', () => {
  it('stores the JPEG under its owner, at core’s path (storage.rules: users/{uid}/…)', () => {
    const p = picture();
    expect(pictureStoragePath(p)).toBe('users/alice/rooms/room1/pictures/AbCdEfGhIjKlMnOpQrSt.jpg');
    expect(pictureStoragePath(p)).toBe(picturePath('alice', 'room1', p.id));
    // The Storage rules take images of at most 10 MB.
    expect(MAX_PICTURE_BYTES).toBe(10 * 1024 * 1024);
  });

  it('writes the record the website reads back unchanged', () => {
    const createdAt = { toMillis: () => 5_000 };
    const record = pictureRecord(picture(), createdAt);
    expect(record).toEqual({
      createdAt,
      storagePath: 'users/alice/rooms/room1/pictures/AbCdEfGhIjKlMnOpQrSt.jpg',
      width: 1179,
      height: 1411,
      platform: 'ios',
    });
    // apps/web/src/lib/pictures.ts reads records with core's pictureFromFirestore.
    expect(pictureFromFirestore(record)).toEqual(record);
  });
});

describe('the upload queue', () => {
  it('keeps pictures oldest first and replaces one with the same id', () => {
    const a = picture({ id: 'A'.repeat(20), takenAt: 3 });
    const b = picture({ id: 'B'.repeat(20), takenAt: 1 });
    let q = addPicture(addPicture([], a), b);
    expect(q.map((p) => p.id)).toEqual([b.id, a.id]);
    q = addPicture(q, { ...a, attempts: 2 });
    expect(q).toHaveLength(2);
    expect(q[1]!.attempts).toBe(2);
    expect(removePicture(q, a.id).map((p) => p.id)).toEqual([b.id]);
  });

  it('waits longer after each failure, up to five minutes', () => {
    expect(retryDelayMs(1)).toBe(FIRST_RETRY_MS);
    expect(retryDelayMs(2)).toBe(2 * FIRST_RETRY_MS);
    expect(retryDelayMs(4)).toBe(8 * FIRST_RETRY_MS);
    expect(retryDelayMs(40)).toBe(MAX_RETRY_MS);
    expect(retryDelayMs(0)).toBe(FIRST_RETRY_MS);
  });

  it('retries a failed upload later, and the next one is due then', () => {
    const p = picture();
    let q: readonly PendingPicture[] = pictureFailed([p], p.id, 'offline', 10_000);
    expect(q[0]).toMatchObject({
      attempts: 1,
      retryAt: 10_000 + FIRST_RETRY_MS,
      error: FAILURE_TEXT.offline,
      stuck: false,
    });
    expect(nextDue(q, 10_000)).toBeNull();
    expect(nextWakeAt(q)).toBe(10_000 + FIRST_RETRY_MS);
    expect(nextDue(q, 10_000 + FIRST_RETRY_MS)?.id).toBe(p.id);
    q = pictureFailed(q, p.id, 'retry', 20_000);
    expect(q[0]!.retryAt).toBe(20_000 + 2 * FIRST_RETRY_MS);
    // "Try again", or the app came back to the front.
    q = retryAllNow(q);
    expect(q[0]!.retryAt).toBeNull();
    expect(nextDue(q, 0)?.id).toBe(p.id);
  });

  it('stops for good when trying again cannot help', () => {
    const p = picture();
    const q = pictureFailed([p], p.id, 'gone', 1);
    expect(q[0]).toMatchObject({ stuck: true, retryAt: null, error: FAILURE_TEXT.gone });
    expect(nextDue(q, Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(nextWakeAt(q)).toBeNull();
    // Nothing to hurry: the same queue, so nothing is saved or redrawn.
    expect(retryAllNow(q)).toBe(q);
  });

  it('records the picture once its JPEG is uploaded', () => {
    const p = pictureFailed([picture()], picture().id, 'retry', 0)[0]!;
    const [next] = pictureUploaded([p], p.id);
    expect(next).toMatchObject({ step: 'record', attempts: 0, retryAt: null, error: null });
  });

  it('reads Firebase errors', () => {
    expect(pictureFailure('storage/retry-limit-exceeded')).toBe('offline');
    expect(pictureFailure('unavailable')).toBe('offline');
    expect(pictureFailure('storage/canceled')).toBe('offline');
    expect(pictureFailure('permission-denied')).toBe('gone');
    expect(pictureFailure('storage/unauthorized')).toBe('gone');
    expect(pictureFailure('picture/file-missing')).toBe('gone');
    expect(pictureFailure('picture/too-big')).toBe('gone');
    expect(pictureFailure('storage/unknown')).toBe('retry');
    expect(pictureFailure('storage/cannot-slice-blob')).toBe('retry');
    expect(pictureFailure('')).toBe('retry');
    expect(pictureFailure(undefined)).toBe('retry');
  });
});

describe('the queue on the phone', () => {
  it('survives a restart', () => {
    const p = pictureFailed([picture()], picture().id, 'offline', 7)[0]!;
    expect(queueFromText(queueToText([p]), 'alice')).toEqual([p]);
  });

  it("keeps only the user's usable pictures", () => {
    const good = picture();
    const text = JSON.stringify({
      v: 1,
      pictures: [
        good,
        { ...good, id: 'B'.repeat(20), uid: 'bob' },
        { ...good, id: 'bad id' },
        { ...good, id: 'C'.repeat(20), roomId: 'a/b' },
        { ...good, id: 'D'.repeat(20), file: '/no/scheme.jpg' },
        { ...good, id: 'E'.repeat(20), width: 0 },
        { ...good, id: 'F'.repeat(20), takenAt: 'yesterday' },
        null,
        'picture',
      ],
    });
    expect(queueFromText(text, 'alice').map((p) => p.id)).toEqual([good.id]);
  });

  it('fills in what an old or odd entry leaves out', () => {
    const {
      attempts: _a,
      retryAt: _r,
      error: _e,
      stuck: _s,
      step: _t,
      ...bare
    } = picture({
      platform: 'android',
    });
    const [p] = queueFromText(JSON.stringify({ v: 1, pictures: [bare] }), 'alice');
    expect(p).toMatchObject({
      step: 'upload',
      attempts: 0,
      retryAt: null,
      error: null,
      stuck: false,
      platform: 'android',
    });
  });

  it('reads nothing from nothing, other versions or broken text', () => {
    expect(queueFromText(null, 'alice')).toEqual([]);
    expect(queueFromText('', 'alice')).toEqual([]);
    expect(queueFromText('{', 'alice')).toEqual([]);
    expect(queueFromText('{"v":2,"pictures":[]}', 'alice')).toEqual([]);
    expect(queueFromText('{"v":1,"pictures":{}}', 'alice')).toEqual([]);
  });
});

describe('the room page', () => {
  const uploaded = (id: string, at: number | null) => ({
    id,
    createdAt: at === null ? null : new Date(at),
    storagePath: `users/alice/rooms/room1/pictures/${id}.jpg`,
    width: 1000,
    height: 1200,
  });

  it('lists this room’s pictures newest first, waiting ones merged with the server’s', () => {
    const waiting = picture({ id: 'W'.repeat(20), takenAt: 5_000 });
    const elsewhere = picture({ id: 'X'.repeat(20), roomId: 'room2', takenAt: 9_000 });
    // Its record reached the server, but the queue has not let go of it yet.
    const both = picture({ id: 'Y'.repeat(20), takenAt: 3_000, step: 'record' });
    const list = stripPictures(
      'room1',
      [waiting, elsewhere, both],
      [uploaded('U'.repeat(20), 4_000), uploaded('Y'.repeat(20), 3_100)],
      (id) => (id === 'U'.repeat(20) ? 'file:///cache/pictures/U.jpg' : null),
    );
    expect(list.map((p) => p.id)).toEqual(['W'.repeat(20), 'U'.repeat(20), 'Y'.repeat(20)]);
    expect(list[0]).toMatchObject({ file: waiting.file, storagePath: null, pending: waiting });
    expect(list[1]).toMatchObject({ file: 'file:///cache/pictures/U.jpg', pending: null });
    expect(list[2]).toMatchObject({
      storagePath: 'users/alice/rooms/room1/pictures/YYYYYYYYYYYYYYYYYYYY.jpg',
      pending: both,
    });
  });

  it('puts a picture whose server time is still on its way first', () => {
    const list = stripPictures(
      'room1',
      [],
      [uploaded('A'.repeat(20), 1), uploaded('B'.repeat(20), null)],
      () => null,
    );
    expect(list.map((p) => p.id)).toEqual(['B'.repeat(20), 'A'.repeat(20)]);
  });

  it('says how each upload is going, short enough for a tile', () => {
    const p = picture();
    expect(uploadView(p, 0.42, false, true)).toEqual({
      kind: 'uploading',
      text: 'Uploading 42%',
      detail: 'Uploading: 42% done.',
    });
    expect(uploadView(p, 0.42, true, true).text).toBe('Slow upload');
    expect(uploadView({ ...p, step: 'record' }, 1, false, true).text).toBe('Saving…');
    expect(uploadView(p, null, false, true)).toEqual({
      kind: 'waiting',
      text: 'Waiting',
      detail: 'Waiting to upload.',
    });
    expect(uploadView(p, null, false, false).text).toBe('No connection');
    expect(uploadView({ ...p, attempts: 2 }, null, false, true)).toMatchObject({
      text: 'Retrying soon',
      detail: FAILURE_TEXT.retry,
    });
    const stuck = pictureFailed([p], p.id, 'gone', 0)[0]!;
    expect(uploadView(stuck, null, false, true)).toEqual({
      kind: 'failed',
      text: 'Not uploaded',
      detail: FAILURE_TEXT.gone,
    });
    // Every tile label fits a thumbnail (about 16 characters at its size).
    for (const view of [
      uploadView(p, 1, false, true),
      uploadView(p, 0.5, true, true),
      uploadView(p, null, false, false),
      uploadView({ ...p, attempts: 1 }, null, false, true),
    ]) {
      expect(view.text.length).toBeLessThanOrEqual(16);
    }
  });
});

describe('right after Take picture', () => {
  it('follows the picture through the queue', () => {
    const p = picture();
    const sending = { id: p.id, slow: false };
    expect(shotUpload([p], sending, p.id, true)).toBe('uploading');
    expect(shotUpload([p], null, p.id, true)).toBe('waiting');
    expect(shotUpload([{ ...p, stuck: true }], null, p.id, true)).toBe('failed');
    expect(shotUpload([], null, p.id, true)).toBe('uploaded');
  });

  it('says it is waiting while a try runs offline or has stalled', () => {
    const p = picture();
    expect(shotUpload([p], { id: p.id, slow: false }, p.id, false)).toBe('waiting');
    expect(shotUpload([p], { id: p.id, slow: true }, p.id, true)).toBe('waiting');
    expect(uploadView(p, 0, false, false)).toMatchObject({
      kind: 'waiting',
      text: 'No connection',
    });
  });

  it('says where the picture is, in plain words', () => {
    expect(shotText('saved', 'uploaded', false)).toBe('Saved to Photos. It is on the website too.');
    expect(shotText('denied', 'waiting', true)).toBe(
      'Not saved to Photos: allow it in Settings. It will upload when the connection is back. Some furniture was still loading and shows as grey boxes.',
    );
    expect(shotText('saving', 'uploading', false)).toContain('Saving to Photos…');
  });

  it('shows one line for Photos and one for this room, each done, going or a problem', () => {
    expect(shotRows('saved', 'uploaded')).toEqual([
      { tone: 'done', text: 'Saved to Photos' },
      { tone: 'done', text: 'Saved in this room’s pictures and on the website' },
    ]);
    const [photos, room] = shotRows('denied', 'waiting');
    expect(photos.tone).toBe('warn');
    expect(photos.text).toContain('Settings');
    expect(room).toMatchObject({ tone: 'busy' });
    expect(room.text).toContain('when the connection is back');
    expect(shotRows('saving', 'uploading').map((r) => r.tone)).toEqual(['busy', 'busy']);
    expect(shotRows('failed', 'failed').map((r) => r.tone)).toEqual(['warn', 'warn']);
  });

  it('lets the card go once nothing is happening', () => {
    expect(shotSettled('saving', 'uploaded')).toBe(false);
    expect(shotSettled('saved', 'uploading')).toBe(false);
    expect(shotSettled('saved', 'waiting')).toBe(true);
    expect(shotSettled('failed', 'uploaded')).toBe(true);
  });
});
