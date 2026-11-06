import { describe, expect, it } from 'vitest';
import { floorStatus, nextFloor, type FloorState } from '@/scan/floor';
import {
  createScanState,
  deriveScan,
  removePlane,
  setCamera,
  setTracking,
  upsertPlane,
  type ScanState,
} from '@/scan/session';
import { planeFromViroAnchor } from '@/scan/viro-anchor';
import { floorAnchor, pose } from './helpers';

/** ARKit's origin is where the phone started: the carpet is about 1.4 m below it. */
const CARPET = -1.4;
const BED = CARPET + 0.55;

const plane = (anchor: unknown) => {
  const p = planeFromViroAnchor(anchor);
  if (!p) throw new Error('not a plane');
  return p;
};
const carpet = (y = CARPET, id = 'carpet') => plane(floorAnchor(id, y, { size: 2 }));
const bed = (classification = 'None') =>
  plane(floorAnchor('bed', BED, { x: 1, z: 1, size: 1.6, classification }));

/** The phone held `eye` metres above the carpet, looking down. */
const holding = (eye = 1.4): ScanState =>
  setTracking(setCamera(createScanState(), pose([0, CARPET + eye, 0], [0, -0.8, -1])), {
    state: 3,
    reason: 1,
  });

describe('finding the floor', () => {
  it('takes the carpet, not the bed, whichever is found first', () => {
    const bedFirst = upsertPlane(upsertPlane(holding(), bed()), carpet());
    const carpetFirst = upsertPlane(upsertPlane(holding(), carpet()), bed());
    expect(bedFirst.floor).toEqual({ y: CARPET, planeId: 'carpet', classification: 'None' });
    expect(carpetFirst.floor).toEqual(bedFirst.floor);
  });

  it('with only the bed, finds no floor and says it looks like furniture', () => {
    const s = upsertPlane(holding(), bed());
    expect(s.floor).toBeNull();
    const d = deriveScan(s);
    expect(d.step).toBe('floor');
    expect(d.floorStatus).toBe('too-high');
    expect(d.message.title).toBe('That looks like furniture, point at the floor');
    expect(deriveScan(holding()).message.title).toBe('Point at the floor');
  });

  it('moves down to the carpet when a tall person first saw the bed as the floor', () => {
    // Held 1.6 m up, the bed is 1.05 m below: it could be a floor, until the carpet shows up.
    let s = upsertPlane(holding(1.6), bed());
    expect(s.floor?.planeId).toBe('bed');
    s = upsertPlane(s, carpet());
    expect(s.floor?.planeId).toBe('carpet');
  });

  it('never takes a table, a seat or a ceiling, and prefers a plane classified as floor', () => {
    expect(upsertPlane(holding(1.6), bed('Seat')).floor).toBeNull();
    expect(upsertPlane(holding(1.6), bed('Table')).floor).toBeNull();
    const ceiling = plane(floorAnchor('c', CARPET - 0.5, { classification: 'Ceiling' }));
    expect(upsertPlane(holding(), ceiling).floor).toBeNull();
    const classified = plane(floorAnchor('f', CARPET + 0.01, { classification: 'Floor' }));
    const s = upsertPlane(upsertPlane(holding(), carpet()), classified);
    expect(s.floor?.planeId).toBe('f');
    // A classified floor is believed even close below the phone (someone kneeling).
    expect(
      upsertPlane(holding(0.5), plane(floorAnchor('k', CARPET, { classification: 'Floor' }))).floor
        ?.planeId,
    ).toBe('k');
  });

  it('ignores small patches and planes far below', () => {
    expect(
      upsertPlane(holding(), plane(floorAnchor('speck', CARPET, { size: 0.3 }))).floor,
    ).toBeNull();
    expect(upsertPlane(holding(), carpet(CARPET - 1.5)).floor).toBeNull();
  });
});

describe('keeping the floor', () => {
  it('stays when the phone is raised or lowered', () => {
    let s = upsertPlane(holding(1.4), carpet());
    s = setCamera(s, pose([0, CARPET + 0.6, 0], [0, -1, -0.2]));
    s = setCamera(s, pose([0, CARPET + 2.3, 0], [0, -1, -0.2]));
    expect(s.floor?.planeId).toBe('carpet');
  });

  it('follows its plane as ARKit refines it, and does not flip to a plane at the same height', () => {
    let s = upsertPlane(holding(), carpet());
    s = upsertPlane(s, carpet(CARPET - 0.004));
    expect(s.floor?.y).toBeCloseTo(CARPET - 0.004, 9);
    const before = s.floor;
    s = upsertPlane(s, carpet(CARPET - 0.03, 'other-patch'));
    expect(s.floor).toBe(before);
  });

  it('moves to the plane ARKit merged it into, and keeps its height if none is left', () => {
    let s = upsertPlane(upsertPlane(holding(), carpet()), carpet(CARPET + 0.01, 'big'));
    expect(s.floor?.planeId).toBe('carpet');
    s = removePlane(s, 'carpet');
    expect(s.floor).toEqual({ y: CARPET + 0.01, planeId: 'big', classification: 'None' });
    s = removePlane(s, 'big');
    expect(s.floor).toEqual({ y: CARPET + 0.01, planeId: null, classification: 'None' });
    expect(deriveScan(s).step).toBe('first-wall');
  });

  it('looks again when its plane turns out to be a table', () => {
    let s = upsertPlane(holding(1.6), bed());
    s = upsertPlane(s, bed('Table'));
    expect(s.floor).toBeNull();
  });

  it('nextFloor returns the same object when nothing changed', () => {
    const planes = { carpet: carpet() };
    const f = nextFloor(null, planes, 0)!;
    expect(nextFloor(f, planes, 0.2)).toBe(f);
    const none: FloorState | null = nextFloor(null, {}, 0);
    expect(none).toBeNull();
    expect(floorStatus(null, {}, null)).toBe('searching');
  });
});
