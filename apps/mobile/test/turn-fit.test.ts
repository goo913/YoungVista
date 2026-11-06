import {
  LOW_CONFIDENCE,
  rectangleSides,
  roomAxes,
  wallEndpoints,
  type FittedMark,
  type FittedOpening,
  type Room,
  type ScanFitDoc,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { placeFittedOpenings, tourInRoom, tourScanId } from '@/scan/turn/fit';
import {
  FIT_ID,
  REPLACE_DISTANCE,
  fitSeedFrom,
  mergeFitMarks,
  wallSources,
} from '@/scan/turn/merge';
import { QUIET, SimScan, type SimRoom } from './sim';

type FitResult = NonNullable<ScanFitDoc['result']>;

/** A 4 × 3 m room, corners (0, 0) to (4, 3), floor at y = −1.4 (ARKit's origin at the phone). */
const ROOM: SimRoom = {
  outline: [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ],
  ceiling: 2.5,
  floorY: -1.4,
};
const STAND = { x: 2, z: 1.5 };

const mark = (id: string, x: number, z: number, axis: 0 | 1, confidence = 0.9): FittedMark => ({
  id,
  point: { x, z },
  camera: STAND,
  axis,
  confidence,
});

/** What the server would send for ROOM, its north wall (z = 3) put at `north`. */
function fitResult({
  north = 3,
  northConfidence = 0.9,
  east = true,
  ceilingHeight = 2.5 as number | null,
  openings = [] as FittedOpening[],
} = {}): FitResult {
  return {
    axesAngle: 0,
    floorY: ROOM.floorY,
    ceilingHeight,
    marks: [
      mark('s1', 1.3, 0, 0),
      mark('s2', 2.7, 0, 0),
      mark('n1', 1.3, north, 0, northConfidence),
      mark('n2', 2.7, north, 0, northConfidence),
      mark('w1', 0, 1, 1),
      mark('w2', 0, 2, 1),
      ...(east ? [mark('e1', 4, 1, 1), mark('e2', 4, 2, 1)] : []),
    ],
    openings,
    spots: [
      {
        spot: 0,
        storagePath: 'users/u1/scans/s1/pano/spot-0.jpg',
        width: 4096,
        height: 2048,
        position: [2, 0, 1.5],
        yawDeg: 190,
      },
    ],
  };
}

/** A scan session that has found the floor, with the fit in it. */
function fitted(result: FitResult) {
  const sim = new SimScan(ROOM, QUIET, 7).start(STAND);
  sim.controller.setFit(fitSeedFrom(result));
  return sim;
}

describe('fitSeedFrom', () => {
  it('takes the server’s marks, walls and ceiling', () => {
    const seed = fitSeedFrom(fitResult());
    expect(seed.marks.map((m) => m.id)).toEqual([
      'fit:s1',
      'fit:s2',
      'fit:n1',
      'fit:n2',
      'fit:w1',
      'fit:w2',
      'fit:e1',
      'fit:e2',
    ]);
    expect(seed.marks[0]!.weight).toBeCloseTo(0.9);
    expect(seed.ceilingHeight).toBe(2.5);
    expect(seed.walls).toHaveLength(4);
    // The walls run corner to corner once they close the room.
    const south = seed.walls.find((w) => w.markIds.includes(`${FIT_ID}s1`))!;
    expect(south.from).toBeCloseTo(0);
    expect(south.to).toBeCloseTo(4);
    expect(south.confidence).toBeCloseTo(0.9);
  });

  it('drops a ceiling no room has', () => {
    expect(fitSeedFrom(fitResult({ ceilingHeight: 9 })).ceilingHeight).toBeNull();
    expect(fitSeedFrom(fitResult({ ceilingHeight: null })).ceilingHeight).toBeNull();
  });
});

describe('the scan session with the server’s walls', () => {
  it('builds the room with the marked scan’s solver, ceiling and all', () => {
    const sim = fitted(fitResult());
    const { derived } = sim.controller.getSnapshot();
    expect(derived.step).toBe('walls');
    expect(derived.closed).toBe(true);
    expect(derived.ceiling).toEqual({ height: 2.5, source: 'detected' });
    const result = sim.controller.finish();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b] = rectangleSides(result.room)!;
    expect(a).toBeCloseTo(3, 6);
    expect(b).toBeCloseTo(4, 6);
    expect(result.room.ceilingHeight).toBe(2.5);
  });

  it('says which walls the server is unsure of', () => {
    const sim = fitted(fitResult({ north: 2.6, northConfidence: 0.3 }));
    const { state, derived } = sim.controller.getSnapshot();
    const sources = wallSources(derived.grouped!, state.fit!);
    const unsure = sources.flatMap((s, i) => (s.kind === 'fit' && s.unsure ? [i] : []));
    expect(unsure).toHaveLength(1);
    expect(derived.grouped!.walls[unsure[0]!]!.offset).toBeCloseTo(2.6);
    expect(0.3).toBeLessThan(LOW_CONFIDENCE);
  });

  it('lets a mark by hand replace an unsure wall', () => {
    // The server put the north wall 40 cm short (in front of a bed, say).
    const sim = fitted(fitResult({ north: 2.6, northConfidence: 0.3 }));
    const eye: [number, number, number] = [2, ROOM.floorY + 1.4, 1.5];
    const outcome = sim.mark(eye, [2, ROOM.floorY, 3]);
    expect(outcome.kind).toBe('marked');
    const { state, derived } = sim.controller.getSnapshot();
    expect(derived.closed).toBe(true);
    const north = derived.grouped!.walls.filter((w) => w.axis === 0 && w.facing === -1);
    expect(north).toHaveLength(1);
    expect(north[0]!.offset).toBeCloseTo(3, 6);
    expect(north[0]!.markIds).toEqual(['m1']);
    const sources = wallSources(derived.grouped!, state.fit!);
    expect(sources.filter((s) => s.kind === 'hand')).toHaveLength(1);
    const result = sim.controller.finish();
    expect(result.ok && rectangleSides(result.room)![0]).toBeCloseTo(3, 6);
    // Undo brings the server's wall back.
    sim.controller.undo();
    const back = sim.controller.getSnapshot().derived.grouped!.walls;
    expect(back.some((w) => w.axis === 0 && Math.abs(w.offset - 2.6) < 1e-9)).toBe(true);
  });

  it('closes the room with a mark by hand where the server found no wall', () => {
    const sim = fitted(fitResult({ east: false }));
    expect(sim.controller.getSnapshot().derived.closed).toBe(false);
    const eye: [number, number, number] = [2, ROOM.floorY + 1.4, 1.5];
    expect(sim.mark(eye, [4, ROOM.floorY, 1.5]).kind).toBe('marked');
    expect(sim.controller.getSnapshot().derived.closed).toBe(true);
  });

  it('is the marked scan again without the fit', () => {
    const sim = fitted(fitResult());
    sim.controller.setFit(null);
    const { derived } = sim.controller.getSnapshot();
    expect(derived.step).toBe('first-wall');
    expect(derived.grouped).toBeNull();
    expect(derived.ceiling).toBeNull();
  });
});

describe('mergeFitMarks', () => {
  const seed = fitSeedFrom(fitResult());
  const hand = (x: number, z: number, axis: 0 | 1, camera = STAND) => ({
    id: 'm1',
    point: { x, z },
    camera,
    axis,
  });

  it('replaces the wall a hand mark lands on, and only that one', () => {
    const merged = mergeFitMarks(seed, [hand(2, 3.3, 0)]);
    expect(merged.replaced).toHaveLength(1);
    expect(merged.marks.map((m) => m.id)).not.toContain('fit:n1');
    expect(merged.marks.map((m) => m.id)).toContain('fit:s1');
    expect(merged.marks.at(-1)!.id).toBe('m1');
  });

  it('adds a wall for a mark far from any, beyond the ends of one, or facing the other way', () => {
    expect(mergeFitMarks(seed, [hand(2, 3 + REPLACE_DISTANCE + 0.2, 0)]).replaced).toEqual([]);
    expect(mergeFitMarks(seed, [hand(6, 3.2, 0)]).replaced).toEqual([]);
    // Seen from outside the room: the other face of the line.
    expect(mergeFitMarks(seed, [hand(2, 3.1, 0, { x: 2, z: 4.5 })]).replaced).toEqual([]);
    expect(mergeFitMarks(seed, []).marks).toEqual(seed.marks);
  });

  it('measures in the fit’s own axes', () => {
    const turned = fitSeedFrom({ ...fitResult(), axesAngle: 0 });
    expect(roomAxes(turned.axesAngle).u.x).toBeCloseTo(1);
  });
});

describe('placeFittedOpenings', () => {
  const room = (): Room => {
    const sim = fitted(fitResult());
    const r = sim.controller.finish();
    if (!r.ok) throw new Error(r.reason);
    return r.room;
  };
  const opening = (o: Partial<FittedOpening>): FittedOpening => ({
    markId: 's1',
    kind: 'door',
    from: 1,
    to: 1.9,
    bottom: 0,
    top: 2.03,
    confidence: 0.8,
    ...o,
  });
  /** Where an opening's middle is on the plan. */
  const middleOf = (r: Room, wall: number, offset: number, width: number) => {
    const { a, b } = wallEndpoints(r, r.walls[wall]!);
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    const s = (offset + width / 2) / l;
    return { x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s };
  };

  it('puts a door and a window on the walls they were found on', () => {
    const base = room();
    const {
      room: r,
      placed,
      skipped,
    } = placeFittedOpenings(base, {
      axesAngle: 0,
      marks: fitResult().marks,
      openings: [
        opening({}),
        opening({ markId: 'n2', kind: 'window', from: 2.2, to: 3.4, bottom: 0.9, top: 2.1 }),
      ],
    });
    expect(placed).toBe(2);
    expect(skipped).toBe(0);
    const all = r.walls.flatMap((w, i) => w.openings.map((o) => ({ ...o, wall: i })));
    const door = all.find((o) => o.type === 'door')!;
    expect(door.width).toBeCloseTo(0.9, 6);
    expect(door.height).toBeCloseTo(2.03, 6);
    expect(door.sill).toBe(0);
    const doorMid = middleOf(r, door.wall, door.offset, door.width);
    expect(doorMid.x).toBeCloseTo(1.45, 6);
    expect(doorMid.z).toBeCloseTo(0, 6);
    const window = all.find((o) => o.type === 'window')!;
    expect(window.sill).toBeCloseTo(0.9, 6);
    expect(window.height).toBeCloseTo(1.2, 6);
    const windowMid = middleOf(r, window.wall, window.offset, window.width);
    expect(windowMid.x).toBeCloseTo(2.8, 6);
    expect(windowMid.z).toBeCloseTo(3, 6);
  });

  it('leaves out openings it is unsure of or cannot place', () => {
    const { placed, skipped } = placeFittedOpenings(room(), {
      axesAngle: 0,
      marks: fitResult().marks,
      openings: [
        opening({ confidence: 0.1 }),
        opening({ markId: 'nowhere' }),
        opening({ from: 5, to: 6 }),
      ],
    });
    expect(placed).toBe(0);
    expect(skipped).toBe(3);
  });

  it('follows a wall the user moved by hand', () => {
    const sim = fitted(fitResult({ north: 2.6, northConfidence: 0.3 }));
    sim.mark([2, ROOM.floorY + 1.4, 1.5], [2, ROOM.floorY, 3]);
    const r = sim.controller.finish();
    if (!r.ok) throw new Error(r.reason);
    const { room: withWindow, placed } = placeFittedOpenings(r.room, {
      axesAngle: 0,
      marks: fitResult({ north: 2.6, northConfidence: 0.3 }).marks,
      openings: [opening({ markId: 'n1', kind: 'window', bottom: 1, top: 2 })],
    });
    expect(placed).toBe(1);
    const k = withWindow.walls.findIndex((w) => w.openings.length > 0);
    const mid = middleOf(withWindow, k, withWindow.walls[k]!.openings[0]!.offset, 0.9);
    expect(mid.z).toBeCloseTo(3, 6);
  });
});

describe('tourInRoom', () => {
  const base = (): Room => {
    const r = fitted(fitResult()).controller.finish();
    if (!r.ok) throw new Error(r.reason);
    return r.room;
  };

  it('keeps a spot’s place on the plan and measures its height from the floor', () => {
    const result = fitResult();
    const tour = tourInRoom({
      scanId: 's1',
      spots: result.spots,
      floorY: result.floorY,
      room: base(),
      scaleFactor: 1,
    });
    expect(tour.scanId).toBe('s1');
    expect(tour.spots).toEqual([
      {
        spot: 0,
        storagePath: 'users/u1/scans/s1/pano/spot-0.jpg',
        width: 4096,
        height: 2048,
        position: [2, 1.4, 1.5],
        yawDeg: -170,
      },
    ]);
  });

  it('follows the tape correction about the middle of the room', () => {
    const result = fitResult();
    const spot = { ...result.spots[0]!, position: [3, 0, 2] as [number, number, number] };
    const tour = tourInRoom({
      scanId: 's1',
      spots: [spot],
      floorY: -1.4,
      room: base(),
      scaleFactor: 1.1,
    });
    // The room's middle is (2, 1.5): 1 m east and 0.5 m south of it become 1.1 and 0.55.
    expect(tour.spots[0]!.position).toEqual([3.1, 1.4, 2.05]);
  });

  it('reads a tour’s scan id only when it is a plain id', () => {
    expect(tourScanId({ scanId: 'AbC123_x-9', spots: [] })).toBe('AbC123_x-9');
    expect(tourScanId({ scanId: '../other' })).toBeNull();
    expect(tourScanId({ scanId: '' })).toBeNull();
    expect(tourScanId(null)).toBeNull();
    expect(tourScanId('s1')).toBeNull();
  });
});
