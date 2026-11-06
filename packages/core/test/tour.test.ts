import { describe, expect, it } from 'vitest';
import {
  buildShareDoc,
  buildTourEmbed,
  captureFolder,
  isTourScanId,
  nearestTourSpot,
  normalizeHeading,
  panoramaDirection,
  panoramaFile,
  panoramaUv,
  roomFromPoints,
  roomToFirestore,
  roomTourFromFirestore,
  roomTourToFirestore,
  tourEmbedFromJson,
  tourEmbedMessageFromJson,
  tourHeading,
  toursEqual,
  type RoomTour,
} from '../src';
import { rectangle } from './helpers';

const folder = captureFolder('alice', 'scan-1');
const spot = (n: number, extra: Record<string, unknown> = {}) => ({
  spot: n,
  storagePath: `${folder}/${panoramaFile(n)}`,
  width: 4096,
  height: 2048,
  position: [1 + n, 1.45, 2],
  yawDeg: 30 * n,
  ...extra,
});

describe('roomTourFromFirestore', () => {
  it('reads a tour, in spot order', () => {
    const tour = roomTourFromFirestore({ scanId: 'scan-1', spots: [spot(1), spot(0)] });
    expect(tour).toEqual({
      scanId: 'scan-1',
      spots: [
        {
          spot: 0,
          storagePath: 'users/alice/scans/scan-1/pano/spot-0.jpg',
          width: 4096,
          height: 2048,
          position: [1, 1.45, 2],
          yawDeg: 0,
        },
        {
          spot: 1,
          storagePath: 'users/alice/scans/scan-1/pano/spot-1.jpg',
          width: 4096,
          height: 2048,
          position: [2, 1.45, 2],
          yawDeg: 30,
        },
      ],
    });
  });

  it('leaves out spots it cannot use, and keeps the first of a repeated spot', () => {
    const tour = roomTourFromFirestore({
      scanId: 'scan-1',
      spots: [
        spot(0),
        spot(0, { yawDeg: 99 }),
        spot(1, { position: [1, 0, 2] }), // camera on the floor
        spot(2, { position: [1, 2] }),
        spot(3, { width: 0 }),
        spot(4, { yawDeg: Number.NaN }),
        spot(5, { storagePath: 'users/alice/scans/../rooms/x.jpg' }),
        spot(6, { storagePath: '' }),
        spot(7, { spot: 1.5 }),
        spot(8, { spot: -1 }),
        { ...spot(9), extra: 'kept out', width: 4095.6 },
        null,
        'spot',
      ],
    });
    expect(tour?.spots.map((s) => s.spot)).toEqual([0, 9]);
    expect(tour?.spots[0]?.yawDeg).toBe(0);
    expect(tour?.spots[1]).not.toHaveProperty('extra');
    expect(tour?.spots[1]?.width).toBe(4096);
  });

  it('is null without a usable scan id or spot', () => {
    expect(roomTourFromFirestore(undefined)).toBeNull();
    expect(roomTourFromFirestore({ scanId: 'scan-1', spots: [] })).toBeNull();
    expect(roomTourFromFirestore({ scanId: 'scan-1', spots: [spot(0, { width: -1 })] })).toBeNull();
    expect(roomTourFromFirestore({ scanId: '../x', spots: [spot(0)] })).toBeNull();
    expect(roomTourFromFirestore({ scanId: 'a/b', spots: [spot(0)] })).toBeNull();
    expect(roomTourFromFirestore({ spots: [spot(0)] })).toBeNull();
    expect(isTourScanId('9f2C-x_1')).toBe(true);
    expect(isTourScanId('')).toBe(false);
    expect(isTourScanId('x'.repeat(129))).toBe(false);
  });

  it('round-trips through roomTourToFirestore as a deep copy', () => {
    const tour = roomTourFromFirestore({ scanId: 'scan-1', spots: [spot(0), spot(1)] })!;
    const copy = roomTourToFirestore(tour);
    expect(roomTourFromFirestore(copy)).toEqual(tour);
    (copy.spots[0]!.position as unknown as number[])[0] = 99;
    expect(tour.spots[0]!.position[0]).toBe(1);
    expect(toursEqual(tour, roomTourFromFirestore(roomTourToFirestore(tour)))).toBe(true);
    expect(toursEqual(tour, null)).toBe(false);
    expect(toursEqual(null, null)).toBe(true);
    expect(toursEqual(tour, { ...tour, scanId: 'scan-2' })).toBe(false);
  });
});

describe('panorama line-up', () => {
  const close = (a: readonly number[], b: readonly number[]) =>
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

  it('looks along yawDeg in the centre column, and turns right across the picture', () => {
    // Heading 0 looks along +z, 90 along +x.
    close(panoramaDirection(0, 0.5, 0.5), [0, 0, 1]);
    close(panoramaDirection(90, 0.5, 0.5), [1, 0, 0]);
    // A quarter of the way right of the centre: 90° to the right of +z, which is −x.
    close(panoramaDirection(0, 0.75, 0.5), [-1, 0, 0]);
    close(panoramaDirection(0, 0.25, 0.5), [1, 0, 0]);
    // The top row looks straight up, the bottom row straight down.
    close(panoramaDirection(37, 0.3, 0), [0, 1, 0]);
    close(panoramaDirection(37, 0.3, 1), [0, -1, 0]);
    expect(tourHeading({ x: 1, z: 0 })).toBeCloseTo(90);
    expect(tourHeading({ x: -1, z: 0 })).toBeCloseTo(-90);
  });

  it('maps directions back to the same place in the picture', () => {
    for (const yaw of [-170, -45, 0, 12.5, 90, 179]) {
      for (const [u, v] of [
        [0.5, 0.5],
        [0.01, 0.3],
        [0.99, 0.7],
        [0.25, 0.9],
      ] as const) {
        const back = panoramaUv(yaw, panoramaDirection(yaw, u, v));
        expect(back.u).toBeCloseTo(u, 9);
        expect(back.v).toBeCloseTo(v, 9);
      }
    }
    // Lengths do not matter, and u stays in 0..1.
    const uv = panoramaUv(-90, [5, 0, 0]);
    expect(uv.u).toBeCloseTo(0, 9);
    expect(uv.v).toBeCloseTo(0.5, 9);
  });

  it('normalizes headings and finds the nearest spot', () => {
    expect(normalizeHeading(190)).toBe(-170);
    expect(normalizeHeading(-180)).toBe(-180);
    expect(normalizeHeading(180)).toBe(-180);
    expect(normalizeHeading(725)).toBe(5);
    const tour = roomTourFromFirestore({ scanId: 'scan-1', spots: [spot(0), spot(1), spot(2)] })!;
    expect(nearestTourSpot(tour, { x: 2.9, z: 2 }).spot).toBe(2);
    expect(nearestTourSpot(tour, { x: -5, z: 0 }).spot).toBe(0);
  });
});

describe('sharing a tour', () => {
  const stored = roomToFirestore(roomFromPoints(rectangle(4, 3)));
  const tour: RoomTour = roomTourFromFirestore({ scanId: 'scan-1', spots: [spot(0)] })!;
  const room = {
    ownerId: 'alice',
    name: 'Bedroom',
    units: 'metric' as const,
    room: stored,
    design: { items: [] },
  };

  it('copies the tour into the snapshot only when given', () => {
    expect(buildShareDoc(room, { roomId: 'r1', createdAt: 0 })).not.toHaveProperty('tour');
    expect(
      buildShareDoc({ ...room, tour: null }, { roomId: 'r1', createdAt: 0 }),
    ).not.toHaveProperty('tour');
    const share = buildShareDoc({ ...room, tour }, { roomId: 'r1', createdAt: 0 });
    expect(share.tour).toEqual(tour);
    expect(share.tour).not.toBe(tour);
  });
});

describe('the phone’s tour page data', () => {
  const stored = roomToFirestore(roomFromPoints(rectangle(4, 3)));
  const tour = roomTourFromFirestore({ scanId: 'scan-1', spots: [spot(0), spot(1)] })!;
  const url0 = 'https://firebasestorage.googleapis.com/v0/b/x/o/a?alt=media&token=t';

  it('round-trips, keeping only spots with a picture to show', () => {
    const embed = buildTourEmbed({
      name: ' Den ',
      units: 'imperial',
      room: stored,
      design: { items: [{ id: 'a', productId: 'sofa', x: 1, z: 1, rotationY: 0 }] },
      tour,
      images: { [tour.spots[0]!.storagePath]: url0, [tour.spots[1]!.storagePath]: 'file:///x' },
    });
    const read = tourEmbedFromJson(JSON.parse(JSON.stringify(embed)));
    expect(read?.name).toBe('Den');
    expect(read?.room.points).toHaveLength(4);
    expect(read?.design.items).toHaveLength(1);
    expect(read?.tour.spots.map((s) => s.spot)).toEqual([0]);
    expect(read?.images).toEqual({ [tour.spots[0]!.storagePath]: url0 });
  });

  it('is null when there is nothing to show', () => {
    expect(tourEmbedFromJson(null)).toBeNull();
    expect(
      tourEmbedFromJson({ version: 1, room: stored, tour, images: {}, design: { items: [] } }),
    ).toBeNull();
    expect(
      tourEmbedFromJson({ version: 2, room: stored, tour, images: {}, design: { items: [] } }),
    ).toBeNull();
  });

  it('reads the page’s messages', () => {
    expect(tourEmbedMessageFromJson('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(tourEmbedMessageFromJson('{"type":"close"}')).toEqual({ type: 'close' });
    expect(tourEmbedMessageFromJson('{"type":"failed","message":"No pictures"}')).toEqual({
      type: 'failed',
      message: 'No pictures',
    });
    expect(tourEmbedMessageFromJson('{"type":"other"}')).toBeNull();
    expect(tourEmbedMessageFromJson('not json')).toBeNull();
  });
});
