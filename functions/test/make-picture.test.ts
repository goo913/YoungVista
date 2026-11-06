import {
  aiSourcePath,
  picturePath,
  roomFromPoints,
  type Catalog,
  type CatalogItem,
  type DesignItem,
  type PictureDoc,
} from '@youngvista/core';
import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import { AI_IMAGE_CONFIG } from '../src/ai-image/config';
import { makeAiPicture, type AiImageDeps, type JobEnd } from '../src/ai-image/make-picture';
import type { GenerateInput, GenerateOutcome } from '../src/ai-image/model';
import { dayKey, decideStart, refundUsage } from '../src/ai-image/usage';
import { jpeg, webp } from './helpers';

const NOW = Date.UTC(2026, 10, 6, 18, 0, 0);
const DAY = dayKey(new Date(NOW));
const UID = 'alice';
const ROOM = 'room1';
const ID = 'AbCdEfGhIjKlMnOpQrSt';
const SOURCE = aiSourcePath(UID, ROOM, ID);
const OUTPUT = picturePath(UID, ROOM, ID);

const product = (id: string, name: string, w: number, d: number, h: number): CatalogItem => ({
  id,
  name,
  category: 'sofa',
  dimensions: { w, d, h },
  placement: 'floor',
  variants: [],
  license: 'CC-BY-4.0',
  credit: 'test',
  sourceUrl: 'https://example.com',
  model: `models/${id}.glb`,
  thumb: `thumbs/${id}.webp`,
});
const sofa = {
  ...product('sofa-velvet', 'Curved velvet sofa', 2.188, 1.023, 0.788),
  variants: [
    { id: 'champagne', name: 'Champagne' },
    { id: 'navy', name: 'Navy', thumb: 'thumbs/sofa-velvet--navy.webp' },
  ],
};
const table = product('coffee-table-round', 'Round marble coffee table', 1.3, 1.3, 0.49);
const chair = product('dining-chair', 'Dining chair', 0.52, 0.55, 0.8);
const catalog: Catalog = { version: 1, items: [sofa, table, chair] };

const items: DesignItem[] = [
  { id: 'i1', productId: 'sofa-velvet', variant: 'navy', x: 2, z: 1, rotationY: 0 },
  { id: 'i2', productId: 'coffee-table-round', x: 2, z: 2, rotationY: 0 },
  { id: 'i3', productId: 'dining-chair', x: 1, z: 3, rotationY: 0 },
  { id: 'i4', productId: 'dining-chair', x: 1.6, z: 3, rotationY: 0 },
  { id: 'i5', productId: 'gone-from-the-catalog', x: 1, z: 1, rotationY: 0 },
];
const room = roomFromPoints([
  [0, 0],
  [4.8, 0],
  [4.8, 4],
  [0, 4],
]);

const made = (): GenerateOutcome => ({
  ok: true,
  image: { bytes: jpeg(2528, 1696), mime: 'image/jpeg' },
  usage: { prompt: 9784, output: 1680, thoughts: 2310, total: 13774 },
  text: '',
});

/** In-memory Firestore, Storage, Hosting and model. */
function world(over: Partial<AiImageDeps> = {}) {
  const files = new Map<string, Uint8Array>([[SOURCE, jpeg(1536, 1024)]]);
  const pictures = new Map<string, PictureDoc<unknown>>();
  const jobs = new Map<string, unknown>();
  let usage: unknown = null;
  const generate = vi.fn(async (_input: GenerateInput) => made());
  const thumb = vi.fn(async (url: string) =>
    url.includes('coffee-table') ? null : { bytes: webp(512, 512), mime: 'image/webp' },
  );
  const deps: AiImageDeps = {
    config: { ...AI_IMAGE_CONFIG, dailyLimit: 3 },
    now: () => NOW,
    serverTime: () => 'server-time',
    readRoom: async (id) => (id === ROOM ? { ownerId: UID, room, design: { items } } : null),
    startJob: async (_uid, pictureId, job) => {
      const decision = decideStart(jobs.get(pictureId) ?? null, usage, NOW, job.limit);
      if (decision.kind === 'start') {
        usage = { day: DAY, count: decision.count };
        jobs.set(pictureId, { status: 'running', startedAt: NOW, day: DAY });
      }
      return decision;
    },
    finishJob: async (_uid, pictureId, end: JobEnd) => {
      if (end.status === 'failed' && end.refund) usage = refundUsage(usage, DAY) ?? usage;
      jobs.set(
        pictureId,
        end.status === 'done' ? { status: 'done', result: end.result } : { status: 'failed' },
      );
    },
    readFile: async (path) => files.get(path) ?? null,
    writeFile: async (path, bytes) => {
      files.set(path, bytes);
    },
    deleteFile: async (path) => {
      files.delete(path);
    },
    writePicture: async (_room, id, doc) => {
      pictures.set(id, doc);
      return true;
    },
    catalog: async () => catalog,
    thumb,
    model: { generate },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    ...over,
  };
  return {
    deps,
    files,
    pictures,
    jobs,
    generate,
    thumb,
    count: () => (usage as { count: number } | null)?.count ?? 0,
  };
}

const ask = (extra: Record<string, unknown> = {}) => ({
  roomId: ROOM,
  pictureId: ID,
  use: 'render',
  platform: 'ios',
  ...extra,
});

async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpsError);
  const e = error as HttpsError;
  return { code: e.code, reason: (e.details as { reason?: string }).reason, message: e.message };
}

describe('making an AI picture', () => {
  it('turns the 3D view into a picture of the room, saved like any other', async () => {
    const w = world();
    const result = await makeAiPicture(UID, ask(), w.deps);
    expect(result).toEqual({
      pictureId: ID,
      storagePath: OUTPUT,
      width: 2528,
      height: 1696,
      remaining: 2,
    });
    expect(w.files.get(OUTPUT)).toEqual(jpeg(2528, 1696));
    expect(w.files.has(SOURCE)).toBe(true);
    expect(w.pictures.get(ID)).toEqual({
      createdAt: 'server-time',
      storagePath: OUTPUT,
      width: 2528,
      height: 1696,
      platform: 'ios',
      kind: 'ai',
      sourcePath: SOURCE,
      sourceUse: 'render',
    });
    expect(w.count()).toBe(1);

    const sent = w.generate.mock.calls[0]![0];
    expect(sent.aspectRatio).toBe('3:2');
    expect(sent.thinking).toBe('MEDIUM');
    expect(sent.source.mime).toBe('image/jpeg');
    // Biggest first; the table's product picture did not load, so the chairs are image 3.
    expect(sent.references.map((r) => r.label)).toEqual([
      'Image 2: product picture of the Curved velvet sofa (Navy).',
      'Image 3: product picture of the Dining chair.',
    ]);
    expect(w.thumb).toHaveBeenCalledWith(
      'https://young-vista.web.app/catalog/thumbs/sofa-velvet--navy.webp',
    );
    expect(sent.prompt).toContain(
      '- Curved velvet sofa (Navy): 219 × 102 × 79 cm (product picture: image 2)',
    );
    expect(sent.prompt).toContain('- Round marble coffee table: 130 × 130 × 49 cm\n');
    expect(sent.prompt).toContain('- 2 × Dining chair: 52 × 55 × 80 cm (product picture: image 3)');
    expect(sent.prompt).not.toContain('gone-from-the-catalog');
    expect(sent.prompt).toMatch(/4\.8 m by 4\.0 m/);
  });

  it('answers the same picture again without making or counting it twice', async () => {
    const w = world();
    const first = await makeAiPicture(UID, ask(), w.deps);
    const again = await makeAiPicture(UID, ask(), w.deps);
    expect(again).toEqual(first);
    expect(w.generate).toHaveBeenCalledTimes(1);
    expect(w.count()).toBe(1);
  });

  it('refuses a second call while the picture is being made', async () => {
    const w = world();
    w.jobs.set(ID, { status: 'running', startedAt: NOW - 10_000 });
    expect(await failure(makeAiPicture(UID, ask(), w.deps))).toMatchObject({
      code: 'already-exists',
      reason: 'in-progress',
    });
    expect(w.generate).not.toHaveBeenCalled();
  });

  it('stops at the daily limit, before asking the model', async () => {
    const w = world();
    for (const id of ['Aaaaaaaaaaaaaaaaaaa1', 'Aaaaaaaaaaaaaaaaaaa2', 'Aaaaaaaaaaaaaaaaaaa3']) {
      w.files.set(aiSourcePath(UID, ROOM, id), jpeg(1536, 1024));
      await makeAiPicture(UID, ask({ pictureId: id }), w.deps);
    }
    expect(await failure(makeAiPicture(UID, ask(), w.deps))).toMatchObject({
      code: 'resource-exhausted',
      reason: 'limit',
    });
    expect(w.generate).toHaveBeenCalledTimes(3);
  });

  it("refuses another account's room, a missing room and a room without a plan", async () => {
    const w = world();
    expect(await failure(makeAiPicture('mallory', ask(), w.deps))).toMatchObject({
      code: 'not-found',
      reason: 'not-found',
    });
    expect(await failure(makeAiPicture(UID, ask({ roomId: 'nope' }), w.deps))).toMatchObject({
      reason: 'not-found',
    });
    const planless = world({
      readRoom: async () => ({ ownerId: UID, room: null, design: { items: [] } }),
    });
    expect(await failure(makeAiPicture(UID, ask(), planless.deps))).toMatchObject({
      code: 'failed-precondition',
      reason: 'no-plan',
    });
    expect(w.count()).toBe(0);
  });

  it('refuses a bad request in plain words', async () => {
    const w = world();
    expect(await failure(makeAiPicture(UID, ask({ use: 'photo' }), w.deps))).toMatchObject({
      code: 'invalid-argument',
      reason: 'bad-request',
      message: 'Choose some furniture, or say what to change.',
    });
  });

  it('gives the day back when the uploaded picture is missing', async () => {
    const w = world();
    w.files.delete(SOURCE);
    expect(await failure(makeAiPicture(UID, ask(), w.deps))).toMatchObject({
      reason: 'no-source',
    });
    expect(w.count()).toBe(0);
    expect(w.pictures.size).toBe(0);
  });

  it('refuses a picture that is not one, or too small, and deletes it', async () => {
    for (const bytes of [new TextEncoder().encode('hello'), jpeg(120, 90)]) {
      const w = world();
      w.files.set(SOURCE, bytes);
      expect(await failure(makeAiPicture(UID, ask(), w.deps))).toMatchObject({
        code: 'invalid-argument',
        reason: 'bad-source',
      });
      expect(w.files.has(SOURCE)).toBe(false);
      expect(w.count()).toBe(0);
    }
  });

  it('keeps the count for a refused picture (it was charged), and saves nothing', async () => {
    const w = world();
    w.generate.mockResolvedValueOnce({ ok: false, reason: 'blocked', detail: 'IMAGE_SAFETY' });
    expect(await failure(makeAiPicture(UID, ask({ use: 'ar' }), w.deps))).toMatchObject({
      reason: 'blocked',
    });
    expect(w.count()).toBe(1);
    expect(w.files.size).toBe(0);
    expect(w.pictures.size).toBe(0);
  });

  it('gives the day back when the model is busy', async () => {
    const w = world();
    w.generate.mockResolvedValueOnce({ ok: false, reason: 'busy', detail: 'HTTP 429' });
    expect(await failure(makeAiPicture(UID, ask(), w.deps))).toMatchObject({
      code: 'unavailable',
      reason: 'busy',
    });
    expect(w.count()).toBe(0);
  });

  it('keeps nothing when the room was deleted while AI worked', async () => {
    const w = world({ writePicture: async () => false });
    expect(await failure(makeAiPicture(UID, ask(), w.deps))).toMatchObject({
      reason: 'not-found',
    });
    expect(w.files.size).toBe(0);
  });

  it('keeps a finished picture even when its job cannot be recorded', async () => {
    const w = world();
    const finishJob = w.deps.finishJob;
    w.deps.finishJob = async (uid, id, end) => {
      if (end.status === 'done') throw new Error('firestore down');
      return finishJob(uid, id, end);
    };
    const result = await makeAiPicture(UID, ask(), w.deps);
    expect(result.storagePath).toBe(OUTPUT);
    expect(w.files.has(OUTPUT)).toBe(true);
    expect(w.files.has(SOURCE)).toBe(true);
    expect(w.pictures.has(ID)).toBe(true);
  });

  it('cleans up after an unexpected failure', async () => {
    const w = world({
      writeFile: async () => {
        throw new Error('storage down');
      },
    });
    expect(await failure(makeAiPicture(UID, ask(), w.deps))).toMatchObject({
      code: 'internal',
      reason: 'failed',
    });
    expect(w.files.has(SOURCE)).toBe(false);
    expect(w.count()).toBe(0);
  });
});

describe('an AI picture of a photo', () => {
  it('shows only the chosen pieces', async () => {
    const w = world();
    await makeAiPicture(UID, ask({ use: 'photo', itemIds: ['i3', 'i4'] }), w.deps);
    const sent = w.generate.mock.calls[0]![0];
    expect(sent.prompt).toContain('- 2 × Dining chair: 52 × 55 × 80 cm (product picture: image 2)');
    expect(sent.prompt).not.toContain('Curved velvet sofa');
    expect(sent.prompt).not.toContain('Round marble coffee table');
    expect(sent.references).toHaveLength(1);
    expect(w.pictures.get(ID)?.sourceUse).toBe('photo');
  });

  it('makes a change asked for in the user’s words, with no furniture', async () => {
    const w = world();
    await makeAiPicture(
      UID,
      ask({ use: 'photo', request: 'paint the walls "sage" green' }),
      w.deps,
    );
    const sent = w.generate.mock.calls[0]![0];
    expect(sent.references).toEqual([]);
    expect(sent.prompt).toContain(`"paint the walls 'sage' green"`);
    expect(w.thumb).not.toHaveBeenCalled();
  });

  it('refuses, without counting, pieces that are no longer in the room', async () => {
    const w = world();
    expect(
      await failure(makeAiPicture(UID, ask({ use: 'photo', itemIds: ['removed'] }), w.deps)),
    ).toMatchObject({ code: 'failed-precondition', reason: 'bad-request' });
    expect(w.count()).toBe(0);
  });

  it('waits for the catalog rather than guess what the pieces look like', async () => {
    const w = world({ catalog: async () => null });
    expect(
      await failure(makeAiPicture(UID, ask({ use: 'photo', itemIds: ['i1'] }), w.deps)),
    ).toMatchObject({ reason: 'busy' });
    expect(w.count()).toBe(0);
  });
});
