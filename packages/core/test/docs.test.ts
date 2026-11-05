import { describe, expect, it } from 'vitest';
import {
  SHARE_ID_LENGTH,
  buildPictureDoc,
  buildShareDoc,
  catalogModelUrl,
  catalogThumbUrl,
  catalogUrl,
  designFromFirestore,
  designToFirestore,
  parseCatalog,
  generateShareId,
  isShareId,
  pictureFromFirestore,
  picturePath,
  roomFromPoints,
  roomToFirestore,
  shareUrl,
  type CatalogItem,
  type RoomDoc,
} from '../src';
import { mulberry32, rectangle } from './helpers';

const seeded = (seed: number) => {
  const rand = mulberry32(seed);
  return (n: number) => Uint8Array.from({ length: n }, () => Math.floor(rand() * 256));
};

describe('share ids', () => {
  it('are 24 URL-safe letters and digits by default', () => {
    const id = generateShareId(seeded(1));
    expect(id).toHaveLength(SHARE_ID_LENGTH);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
    expect(isShareId(id)).toBe(true);
    expect(generateShareId(seeded(2))).not.toBe(id);
    expect(generateShareId(seeded(1), 32)).toHaveLength(32);
  });

  it('skip bytes that would bias the letters', () => {
    let calls = 0;
    const id = generateShareId((n) => {
      calls++;
      // First call: only unusable bytes (248..255). Then bytes 0, 1, 2...
      return calls === 1
        ? new Uint8Array(n).fill(250)
        : Uint8Array.from({ length: n }, (_, i) => i);
    });
    expect(calls).toBe(2);
    expect(id.startsWith('ABCDEFGHIJ')).toBe(true);
  });

  it('refuse short ids and broken random sources', () => {
    expect(() => generateShareId(seeded(1), 12)).toThrow(RangeError);
    expect(() => generateShareId(() => new Uint8Array(0))).toThrow();
    expect(() => generateShareId((n) => new Uint8Array(n).fill(255))).toThrow();
  });

  it('are recognised, and turned into links', () => {
    expect(isShareId('short')).toBe(false);
    expect(isShareId('../../../../../../../../etc')).toBe(false);
    expect(isShareId('Xk2v9QpLm4Rt7Wz1Yb8NcD5f')).toBe(true);
    expect(isShareId(42)).toBe(false);
    expect(shareUrl('Xk2v9QpLm4Rt7Wz1Yb8NcD5f')).toBe(
      'https://young-vista.web.app/s/Xk2v9QpLm4Rt7Wz1Yb8NcD5f',
    );
    expect(shareUrl('abc', 'http://localhost:5173/')).toBe('http://localhost:5173/s/abc');
  });
});

describe('buildShareDoc', () => {
  const stored = roomToFirestore(roomFromPoints(rectangle(4, 3)));
  const roomDoc: RoomDoc<string> = {
    ownerId: 'alice',
    name: '  Bedroom ',
    createdAt: 'then',
    updatedAt: 'now',
    units: 'metric',
    room: stored,
    capture: { method: 'scan', platform: 'ios', scaleFactor: 1 },
    design: {
      items: [
        { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 90, variant: undefined },
        { id: 'b', productId: 'lamp', x: 1, z: 2, rotationY: 0, variant: 'black', y: 0.75 },
      ],
    },
    shareId: null,
  };

  it('snapshots the room for a link, ready for Firestore', () => {
    const share = buildShareDoc(roomDoc, { roomId: 'r1', createdAt: 'ts' });
    expect(share).toEqual({
      ownerId: 'alice',
      roomId: 'r1',
      name: 'Bedroom',
      createdAt: 'ts',
      units: 'metric',
      room: stored,
      design: {
        items: [
          { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 90 },
          { id: 'b', productId: 'lamp', x: 1, z: 2, rotationY: 0, variant: 'black', y: 0.75 },
        ],
      },
    });
    expect('variant' in share.design.items[0]!).toBe(false);
    expect('updatedAt' in share).toBe(false);
    expect(buildShareDoc(roomDoc, { roomId: 'r1', createdAt: 'a', updatedAt: 'b' }).updatedAt).toBe(
      'b',
    );
  });

  it('is a deep copy', () => {
    const share = buildShareDoc(roomDoc, { roomId: 'r1', createdAt: 'ts' });
    share.room.points[0]!.x = 99;
    share.room.walls[0]!.openings.push({
      id: 'x',
      type: 'door',
      offset: 0,
      width: 1,
      height: 2,
      sill: 0,
    });
    expect(stored.points[0]!.x).not.toBe(99);
    expect(stored.walls[0]!.openings).toEqual([]);
  });

  it('names unnamed rooms', () => {
    expect(buildShareDoc({ ...roomDoc, name: ' ' }, { roomId: 'r', createdAt: 0 }).name).toBe(
      'Untitled room',
    );
  });
});

describe('design documents', () => {
  it('read tolerantly and write without undefined fields', () => {
    expect(designFromFirestore(undefined)).toEqual({ items: [] });
    expect(
      designFromFirestore({
        items: [
          { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 45, variant: 'grey' },
          { id: 'b', productId: 'sofa', x: 'nope', z: 2 },
          { id: 'c', productId: 'lamp', x: 0, z: 0, y: 0.7 },
          null,
        ],
      }),
    ).toEqual({
      items: [
        { id: 'a', productId: 'sofa', x: 1, z: 2, rotationY: 45, variant: 'grey' },
        { id: 'c', productId: 'lamp', x: 0, z: 0, rotationY: 0, y: 0.7 },
      ],
    });
    const clean = designToFirestore({
      items: [{ id: 'a', productId: 'p', x: 0, z: 0, rotationY: 0, variant: undefined, y: 0 }],
    });
    expect(clean.items[0]).toEqual({ id: 'a', productId: 'p', x: 0, z: 0, rotationY: 0 });
    expect(Object.keys(clean.items[0]!)).not.toContain('variant');
  });
});

describe('pictures', () => {
  it('build the document the website reads', () => {
    expect(picturePath('u1', 'r1', 'p1')).toBe('users/u1/rooms/r1/pictures/p1.jpg');
    const doc = buildPictureDoc({
      uid: 'u1',
      roomId: 'r1',
      pictureId: 'p1',
      width: 2048.4,
      height: 1536,
      platform: 'android',
      createdAt: 'ts',
    });
    expect(doc).toEqual({
      createdAt: 'ts',
      storagePath: 'users/u1/rooms/r1/pictures/p1.jpg',
      width: 2048,
      height: 1536,
      platform: 'android',
    });
  });

  it('are read back, with a pending timestamp as null', () => {
    const ts = { toMillis: () => 5 };
    const read = pictureFromFirestore({
      ...buildPictureDoc({
        uid: 'u',
        roomId: 'r',
        pictureId: 'p',
        width: 10,
        height: 20,
        platform: 'ios',
        createdAt: ts,
      }),
    });
    expect(read).toEqual({
      createdAt: ts,
      storagePath: 'users/u/rooms/r/pictures/p.jpg',
      width: 10,
      height: 20,
      platform: 'ios',
    });
    expect(
      pictureFromFirestore({ storagePath: 'users/u/x.jpg', width: 1, height: 1, createdAt: null })!
        .createdAt,
    ).toBeNull();
    expect(pictureFromFirestore({ storagePath: 'elsewhere.jpg', width: 1, height: 1 })).toBeNull();
    expect(pictureFromFirestore({ storagePath: 'users/u/x.jpg', width: 0, height: 1 })).toBeNull();
    expect(pictureFromFirestore('nope')).toBeNull();
  });
});

describe('catalog URLs', () => {
  const item: Pick<CatalogItem, 'model' | 'thumb' | 'variants'> = {
    model: 'models/sofa.glb',
    thumb: 'thumbs/sofa.webp',
    variants: [
      { id: 'grey', name: 'Grey' },
      {
        id: 'green',
        name: 'Green',
        model: 'models/sofa-green.glb',
        thumb: 'thumbs/sofa-green.webp',
      },
    ],
  };

  it('joins catalog paths to the hosting base', () => {
    expect(catalogUrl('models/sofa.glb')).toBe(
      'https://young-vista.web.app/catalog/models/sofa.glb',
    );
    expect(catalogUrl('/thumbs/a.webp', '/catalog')).toBe('/catalog/thumbs/a.webp');
    expect(catalogUrl('https://cdn.example/x.glb')).toBe('https://cdn.example/x.glb');
  });

  it('uses a variant’s own files when it has them', () => {
    expect(catalogModelUrl(item)).toBe('https://young-vista.web.app/catalog/models/sofa.glb');
    expect(catalogModelUrl(item, 'grey', '/catalog/')).toBe('/catalog/models/sofa.glb');
    expect(catalogModelUrl(item, 'green', '/catalog/')).toBe('/catalog/models/sofa-green.glb');
    expect(catalogThumbUrl(item, 'green', '/catalog/')).toBe('/catalog/thumbs/sofa-green.webp');
    expect(catalogThumbUrl(item, 'missing', '/catalog/')).toBe('/catalog/thumbs/sofa.webp');
  });
});

describe('parseCatalog', () => {
  it('keeps usable items and fills in defaults', () => {
    const catalog = parseCatalog({
      version: 1,
      items: [
        {
          id: 'sofa',
          name: 'Sofa',
          category: 'sofa',
          dimensions: { w: 2, d: 0.9, h: 0.8 },
          placement: 'floor',
          variants: [
            { id: 'navy', name: 'Navy', model: 'models/sofa--navy.glb' },
            { name: 'no id' },
          ],
          license: 'CC0-1.0',
          credit: 'Poly Haven',
          sourceUrl: 'https://polyhaven.com',
          model: 'models/sofa.glb',
          thumb: 'thumbs/sofa.webp',
        },
        {
          id: 'lamp',
          model: 'models/lamp.glb',
          dimensions: { w: 0.3, d: 0.3, h: 1.5 },
          license: '??',
        },
        { id: 'flat', model: 'models/flat.glb', dimensions: { w: 1, d: 1, h: 0 } },
        { id: 'sofa', model: 'models/dupe.glb', dimensions: { w: 1, d: 1, h: 1 } },
      ],
    })!;
    expect(catalog.items.map((i) => i.id)).toEqual(['sofa', 'lamp']);
    expect(catalog.items[0]!.variants).toEqual([
      { id: 'navy', name: 'Navy', model: 'models/sofa--navy.glb' },
    ]);
    expect(catalog.items[1]).toMatchObject({
      name: 'lamp',
      placement: 'floor',
      license: 'CC-BY-4.0',
      variants: [],
    });
    expect(parseCatalog({ nope: true })).toBeNull();
  });
});
