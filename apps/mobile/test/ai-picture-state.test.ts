import { AI_MAX_PIECES, type CatalogItem, type DesignItem } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  AI_TYPICAL_MS,
  aiCardText,
  aiResultPicture,
  canAddPiece,
  canRetry,
  chosenItemIds,
  firstChoice,
  isAiBusy,
  photoPieces,
  sourceSize,
} from '@/lib/ai-picture-state';
import { isAiPicture, stripPictures } from '@/lib/picture-state';

const product = (id: string, w: number, d: number, h: number, variants: string[] = []) =>
  ({
    id,
    name: id,
    category: 'sofa',
    dimensions: { w, d, h },
    placement: 'floor',
    variants: variants.map((v) => ({ id: v, name: v.toUpperCase() })),
    license: 'CC0-1.0',
    credit: 't',
    sourceUrl: 'https://example.com',
    model: `models/${id}.glb`,
    thumb: `thumbs/${id}.webp`,
  }) as CatalogItem;

const catalog = new Map(
  [
    product('sofa', 2.2, 1, 0.8, ['blue', 'red']),
    product('chair', 0.5, 0.5, 0.8),
    product('table', 1.3, 1.3, 0.5),
  ].map((p) => [p.id, p]),
);
const item = (id: string, productId: string, variant?: string): DesignItem => ({
  id,
  productId,
  variant,
  x: 0,
  z: 0,
  rotationY: 0,
});

describe('what the AI card says', () => {
  it('counts the seconds while AI works, then says it can take longer', () => {
    const since = 1_000_000;
    expect(aiCardText({ kind: 'making', since }, 'render', since + 12_400).detail).toMatch(
      /about half a minute \(12 s so far\)/,
    );
    expect(
      aiCardText({ kind: 'making', since }, 'render', since + AI_TYPICAL_MS + 1).detail,
    ).toMatch(/up to two minutes/);
  });

  it('says what is being taken, how much is sent, and where the picture went', () => {
    expect(aiCardText({ kind: 'capturing' }, 'ar', 0).detail).toMatch(/camera view/);
    expect(aiCardText({ kind: 'uploading', progress: 0.426 }, 'photo', 0).detail).toBe('43% sent.');
    const done = aiCardText(
      {
        kind: 'done',
        result: { pictureId: 'p', storagePath: 's', width: 1, height: 1, remaining: 3 },
      },
      'photo',
      0,
    );
    expect(done).toMatchObject({ tone: 'done', title: 'AI picture ready' });
    expect(done.detail).toMatch(/from a photo/);
  });

  it('says why there is none, and offers Try again only when it can help', () => {
    expect(aiCardText({ kind: 'failed', failure: 'blocked' }, 'photo', 0)).toMatchObject({
      tone: 'warn',
      title: 'AI couldn’t process this photo',
    });
    expect(aiCardText({ kind: 'failed', failure: 'capture' }, 'render', 0).title).toBe(
      'No picture',
    );
    expect(canRetry('busy')).toBe(true);
    expect(canRetry('slow')).toBe(true);
    expect(canRetry('offline')).toBe(true);
    expect(canRetry('blocked')).toBe(false);
    expect(canRetry('limit')).toBe(false);
    expect(isAiBusy({ kind: 'making', since: 0 })).toBe(true);
    expect(isAiBusy({ kind: 'failed', failure: 'busy' })).toBe(false);
  });
});

describe('the picture sent to AI', () => {
  it('is at most 2048 px on its longest side, never enlarged', () => {
    expect(sourceSize(1179, 2556)).toEqual({ width: 945, height: 2048 });
    expect(sourceSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(sourceSize(1179, 1572)).toEqual({ width: 1179, height: 1572 });
  });
});

describe('choosing the furniture for a photo', () => {
  const pieces = photoPieces(
    [
      item('a', 'chair'),
      item('b', 'sofa', 'red'),
      item('c', 'chair'),
      item('d', 'table'),
      item('e', 'sofa'),
      item('f', 'unknown'),
    ],
    (id) => catalog.get(id) ?? null,
  );

  it('groups pieces by product and colour, biggest first, with the colour named', () => {
    expect(pieces.map((p) => [p.name, p.itemIds])).toEqual([
      ['sofa (RED)', ['b']],
      ['sofa (BLUE)', ['e']],
      ['table', ['d']],
      ['chair', ['a', 'c']],
    ]);
  });

  it(`starts with the biggest pieces, at most ${AI_MAX_PIECES} in all`, () => {
    expect([...firstChoice(pieces)]).toHaveLength(4);
    const many = photoPieces(
      Array.from({ length: 10 }, (_, i) => item(`c${i}`, 'chair')).concat(item('s', 'sofa')),
      (id) => catalog.get(id) ?? null,
    );
    // The ten chairs do not fit with the sofa: only the sofa is chosen at first.
    const chosen = firstChoice(many);
    expect(chosenItemIds(many, chosen)).toEqual(['s']);
    expect(canAddPiece(many, chosen, many[1]!.key)).toBe(false);
    expect(canAddPiece(many, new Set(), many[1]!.key)).toBe(false);
  });

  it('gives the server the design items of the chosen entries', () => {
    const chosen = new Set([pieces[3]!.key, pieces[0]!.key]);
    expect(chosenItemIds(pieces, chosen)).toEqual(['b', 'a', 'c']);
    expect(canAddPiece(pieces, chosen, pieces[2]!.key)).toBe(true);
    expect(canAddPiece(pieces, chosen, 'nope')).toBe(false);
  });
});

describe('the AI picture in the room', () => {
  it('opens in the viewer as an AI picture with its original', () => {
    const picture = aiResultPicture(
      {
        pictureId: 'P',
        storagePath: 'users/u/rooms/r/pictures/P.jpg',
        width: 2,
        height: 1,
        remaining: 0,
      },
      'ar',
      'users/u/rooms/r/pictures/P-source.jpg',
      42,
    );
    expect(picture).toMatchObject({
      id: 'P',
      time: 42,
      file: null,
      pending: null,
      kind: 'ai',
      sourcePath: 'users/u/rooms/r/pictures/P-source.jpg',
      sourceUse: 'ar',
    });
    expect(isAiPicture(picture)).toBe(true);
  });

  it('keeps its AI fields in the room page’s list, and only for AI pictures', () => {
    const list = stripPictures(
      'r',
      [],
      [
        {
          id: 'A',
          createdAt: new Date(2),
          storagePath: 's/A.jpg',
          width: 1,
          height: 1,
          kind: 'ai',
          sourcePath: 's/A-source.jpg',
          sourceUse: 'render',
        },
        { id: 'B', createdAt: new Date(1), storagePath: 's/B.jpg', width: 1, height: 1 },
      ],
      () => null,
    );
    expect(list[0]).toMatchObject({ id: 'A', kind: 'ai', sourcePath: 's/A-source.jpg' });
    expect(isAiPicture(list[1]!)).toBe(false);
    expect('kind' in list[1]!).toBe(false);
  });
});
