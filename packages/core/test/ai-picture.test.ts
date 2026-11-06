import { describe, expect, it } from 'vitest';
import {
  AI_FAILURE_TEXT,
  AI_MAX_PIECES,
  AI_MAX_REQUEST_LENGTH,
  aiPictureFailure,
  aiSourcePath,
  buildPictureDoc,
  cleanAiRequest,
  isAiPictureId,
  parseAiPictureRequest,
  pictureFromFirestore,
  picturePath,
} from '../src';

const ID = 'AbCdEfGhIjKlMnOpQrSt';
const base = { roomId: 'room1', pictureId: ID, platform: 'ios' };
const ok = (data: unknown) => {
  const check = parseAiPictureRequest(data);
  if (!check.ok) throw new Error(check.problem);
  return check.request;
};
const problem = (data: unknown) => {
  const check = parseAiPictureRequest(data);
  return check.ok ? null : check.problem;
};

describe('AI picture requests', () => {
  it('take a picture of the 3D view or the camera view with nothing else', () => {
    expect(ok({ ...base, use: 'render' })).toEqual({
      roomId: 'room1',
      pictureId: ID,
      use: 'render',
      itemIds: [],
      request: '',
      platform: 'ios',
    });
    // The room's furniture is already in the picture: ids sent anyway are not used.
    expect(ok({ ...base, use: 'ar', itemIds: ['a', 'b'] }).itemIds).toEqual([]);
    expect(ok({ ...base, use: 'render', platform: 'web' }).platform).toBe('web');
    expect(ok({ ...base, use: 'render', platform: 'toaster' }).platform).toBe('ios');
  });

  it('take a photo with pieces, a change asked for, or both', () => {
    expect(ok({ ...base, use: 'photo', itemIds: ['a', 'b', 'a'] }).itemIds).toEqual(['a', 'b']);
    expect(ok({ ...base, use: 'photo', request: '  Warm   light ' }).request).toBe('Warm light');
    const both = ok({ ...base, use: 'photo', itemIds: ['a'], request: 'a plant' });
    expect([both.itemIds, both.request]).toEqual([['a'], 'a plant']);
  });

  it('refuse a photo with neither pieces nor a change', () => {
    expect(problem({ ...base, use: 'photo' })).toMatch(/furniture/);
    expect(problem({ ...base, use: 'photo', itemIds: [], request: '   ' })).toMatch(/furniture/);
  });

  it(`refuse more than ${AI_MAX_PIECES} pieces`, () => {
    const ids = Array.from({ length: AI_MAX_PIECES + 1 }, (_, i) => `item${i}`);
    expect(problem({ ...base, use: 'photo', itemIds: ids })).toMatch(/at most/);
    expect(ok({ ...base, use: 'photo', itemIds: ids.slice(1) }).itemIds).toHaveLength(
      AI_MAX_PIECES,
    );
  });

  it('refuse what is not a request', () => {
    expect(problem(null)).not.toBeNull();
    expect(problem('render')).not.toBeNull();
    expect(problem({ ...base, use: 'video' })).toMatch(/kind/);
    expect(problem({ ...base, roomId: '', use: 'render' })).toMatch(/room/);
    expect(problem({ ...base, roomId: 'a/b', use: 'render' })).toMatch(/room/);
    expect(problem({ ...base, pictureId: 'short', use: 'render' })).toMatch(/picture id/);
    expect(problem({ ...base, pictureId: '../../../etc/passwd00', use: 'render' })).not.toBeNull();
    expect(problem({ ...base, use: 'photo', itemIds: 'a' })).not.toBeNull();
    expect(problem({ ...base, use: 'photo', itemIds: ['a/b'] })).not.toBeNull();
    expect(problem({ ...base, use: 'photo', itemIds: [''] })).not.toBeNull();
    expect(problem({ ...base, use: 'photo', request: 42 })).toMatch(/text/);
    expect(
      problem({ ...base, use: 'photo', request: 'x'.repeat(AI_MAX_REQUEST_LENGTH * 2 + 1) }),
    ).toMatch(/too long/);
  });

  it('clean the words: one line, no control characters, single quotes, at most 300 characters', () => {
    expect(cleanAiRequest('  a\nplant\tby the\u0000window  ')).toBe('a plant by the window');
    expect(cleanAiRequest('say "hello" and “hi”')).toBe("say 'hello' and 'hi'");
    expect(cleanAiRequest(`a${String.fromCharCode(0x2028)}b`)).toBe('a b');
    expect(cleanAiRequest('x'.repeat(500))).toHaveLength(AI_MAX_REQUEST_LENGTH);
    expect(cleanAiRequest(undefined)).toBe('');
    expect(cleanAiRequest(7)).toBe('');
  });

  it('keep the source next to the picture, so deleting the room deletes it', () => {
    expect(aiSourcePath('u1', 'r1', ID)).toBe(`users/u1/rooms/r1/pictures/${ID}-source.jpg`);
    expect(aiSourcePath('u1', 'r1', ID).startsWith(picturePath('u1', 'r1', '').slice(0, -4))).toBe(
      true,
    );
    expect(isAiPictureId(ID)).toBe(true);
    expect(isAiPictureId('AbCdEfGhIjKlMnOpQrS')).toBe(false);
    expect(isAiPictureId('AbCdEfGhIjKlMnOpQrS-')).toBe(false);
  });
});

describe('AI picture failures', () => {
  const fnError = (code: string, reason?: string) => ({
    code: `functions/${code}`,
    message: 'x',
    details: reason ? { reason } : undefined,
  });

  it("use the server's reason when it gives one", () => {
    expect(aiPictureFailure(fnError('failed-precondition', 'blocked'))).toBe('blocked');
    expect(aiPictureFailure(fnError('resource-exhausted', 'limit'))).toBe('limit');
    expect(aiPictureFailure(fnError('internal', 'no-image'))).toBe('no-image');
    expect(aiPictureFailure(fnError('internal', 'nonsense'))).toBe('failed');
  });

  it('read the code otherwise', () => {
    expect(aiPictureFailure(fnError('unauthenticated'))).toBe('signed-out');
    expect(aiPictureFailure(fnError('deadline-exceeded'))).toBe('slow');
    expect(aiPictureFailure(fnError('resource-exhausted'))).toBe('limit');
    expect(aiPictureFailure(fnError('internal'))).toBe('failed');
    expect(aiPictureFailure({ code: 'storage/retry-limit-exceeded' })).toBe('offline');
    expect(aiPictureFailure(new Error('boom'))).toBe('failed');
    expect(aiPictureFailure(null)).toBe('failed');
  });

  it('say there is no connection when the app knows it', () => {
    expect(aiPictureFailure(fnError('internal'), false)).toBe('offline');
  });

  it('are plain words that never name who makes the AI', () => {
    for (const { title, detail } of Object.values(AI_FAILURE_TEXT)) {
      expect(`${title} ${detail}`).not.toMatch(/google|gemini|vertex|banana|openai|model/i);
    }
  });
});

describe('AI pictures in the room', () => {
  const doc = buildPictureDoc({
    uid: 'u1',
    roomId: 'r1',
    pictureId: ID,
    width: 2528.2,
    height: 1696,
    platform: 'web',
    createdAt: 'now',
    ai: { sourcePath: aiSourcePath('u1', 'r1', ID), use: 'render' },
  });

  it('are pictures like any other, marked AI, with their source', () => {
    expect(doc).toEqual({
      createdAt: 'now',
      storagePath: `users/u1/rooms/r1/pictures/${ID}.jpg`,
      width: 2528,
      height: 1696,
      platform: 'web',
      kind: 'ai',
      sourcePath: `users/u1/rooms/r1/pictures/${ID}-source.jpg`,
      sourceUse: 'render',
    });
  });

  it('read back with their AI fields, and only well-formed ones', () => {
    const time = { toMillis: () => 5 };
    expect(pictureFromFirestore({ ...doc, createdAt: time })).toEqual({ ...doc, createdAt: time });
    const odd = pictureFromFirestore({ ...doc, sourcePath: 'elsewhere', sourceUse: 'dream' });
    expect(odd?.kind).toBe('ai');
    expect(odd && 'sourcePath' in odd).toBe(false);
    expect(odd && 'sourceUse' in odd).toBe(false);
    // Fields of an AI picture on a picture not marked AI are ignored.
    const plain = pictureFromFirestore({ ...doc, kind: 'other' });
    expect(plain && ['kind', 'sourcePath', 'sourceUse'].some((k) => k in plain)).toBe(false);
  });
});
