import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENINGS,
  addOpening,
  describeRoomEditError,
  findOpening,
  fitOpenings,
  moveCorner,
  moveOpening,
  newOpeningId,
  openingSegment,
  projectOntoWall,
  removeOpening,
  roomArea,
  roomFromPoints,
  setCeilingHeight,
  setWallLength,
  updateOpening,
  validateOpening,
  wallLength,
  wallLengths,
  type Opening,
  type Room,
  type RoomEditResult,
} from '../src';
import { expectOutline, lShape, rectangle } from './helpers';

// 4 × 3 m room: corners (0,3) (4,3) (4,0) (0,0); wall 0 runs (0,3)→(4,3), wall 1 (4,3)→(4,0),
// wall 2 (4,0)→(0,0), wall 3 (0,0)→(0,3).
const base = roomFromPoints(rectangle(4, 3));

function ok(result: RoomEditResult): Room {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}: ${result.reason}`);
  return result.room;
}

function errorOf(result: RoomEditResult): string {
  if (result.ok) throw new Error('expected an error');
  expect(result.reason.length).toBeGreaterThan(10);
  return result.error;
}

const opening = (
  id: string,
  type: Opening['type'],
  offset: number,
  width = 0.9,
  height = 2.03,
  sill = 0,
) => ({ id, type, offset, width, height, sill }) satisfies Opening;

function withOpenings(room: Room, wall: number, openings: Opening[]): Room {
  return { ...room, walls: room.walls.map((w, i) => (i === wall ? { ...w, openings } : w)) };
}

describe('moveCorner', () => {
  it('moves one corner and keeps the walls', () => {
    const room = ok(moveCorner(base, 1, { x: 5, z: 3 }));
    expect(room.points[1]).toEqual([5, 3]);
    expect(room.walls.map((w) => w.id)).toEqual(base.walls.map((w) => w.id));
    expect(wallLengths(room)[0]).toBeCloseTo(5, 12);
    expect(roomArea(room)).toBeCloseTo(13.5, 12);
    expect(base.points[1]).toEqual([4, 3]); // the input is untouched
  });

  it('rejects shapes that cross themselves or are too small', () => {
    expect(errorOf(moveCorner(base, 1, [0.5, -1]))).toBe('self-intersecting');
    expect(errorOf(moveCorner(base, 1, [0.1, 3]))).toBe('wall-too-short');
    expect(errorOf(moveCorner(base, 7, [0, 0]))).toBe('unknown-corner');
    expect(errorOf(moveCorner(base, 1, [NaN, 0]))).toBe('invalid-input');
  });

  it('keeps openings where they are on the plan', () => {
    // A door on wall 1, 1 m from its start (4, 3), so its middle is at (4, 1.55).
    const room = withOpenings(base, 1, [opening('d1', 'door', 1)]);
    const moved = moveCorner(room, 1, [4, 4]); // wall 1 now starts 1 m further away
    const after = ok(moved);
    expect(moved.ok && moved.changes).toEqual([]);
    const door = after.walls[1]!.openings[0]!;
    expect(door.offset).toBeCloseTo(2, 9);
    expect(openingSegment(after, 1, door)!.center.z).toBeCloseTo(1.55, 9);
  });

  it('moves, shrinks or removes openings that no longer fit', () => {
    const room = withOpenings(base, 0, [
      opening('w1', 'window', 2.5, 1.2, 1.2, 0.9),
      opening('d1', 'door', 0.5, 0.9),
    ]);
    // Wall 0 shrinks from 4 m to 2.8 m: the window slides back inside.
    const shorter = moveCorner(room, 1, [2.8, 3]);
    const after = ok(shorter);
    const win = after.walls[0]!.openings.find((o) => o.id === 'w1')!;
    expect(win.offset + win.width).toBeCloseTo(2.8, 9);
    expect(shorter.ok && shorter.changes).toEqual([
      { wallId: 'w1', openingId: 'w1', change: 'moved' },
    ]);
    // Down to 1 m: the door slides back to fit and the window has no room left.
    const tiny = moveCorner(room, 1, [1, 3]);
    expect(tiny.ok && tiny.changes).toEqual(
      expect.arrayContaining([
        { wallId: 'w1', openingId: 'w1', change: 'removed' },
        { wallId: 'w1', openingId: 'd1', change: 'moved' },
      ]),
    );
    const [door, ...rest] = ok(tiny).walls[0]!.openings;
    expect(rest).toEqual([]);
    expect(door!.id).toBe('d1');
    expect(door!.offset + door!.width).toBeCloseTo(1, 12);
    // A wall narrower than the door: the door shrinks to the wall.
    const narrow = moveCorner(
      withOpenings(base, 0, [opening('d1', 'door', 0.5, 0.9)]),
      1,
      [0.6, 3],
    );
    expect(narrow.ok && narrow.changes).toEqual([
      { wallId: 'w1', openingId: 'd1', change: 'resized' },
    ]);
    expect(ok(narrow).walls[0]!.openings[0]!.width).toBeCloseTo(0.6, 12);
  });
});

describe('setWallLength', () => {
  it('keeps a rectangle square when the end moves', () => {
    const room = ok(setWallLength(base, 2, 5)); // wall 2 runs (4,0) → (0,0)
    expectOutline(room.points, [
      [-1, 3],
      [4, 3],
      [4, 0],
      [-1, 0],
    ]);
    expect(wallLength(room, 2)).toBeCloseTo(5, 12);
    expect(wallLength(room, 0)).toBeCloseTo(5, 12);
  });

  it('can move the start instead, or just the one corner', () => {
    const start = ok(setWallLength(base, base.walls[2]!.id, 5, { move: 'start' }));
    expectOutline(start.points, [
      [0, 3],
      [5, 3],
      [5, 0],
      [0, 0],
    ]);
    const stretched = ok(setWallLength(base, 2, 5, { keepAngles: false }));
    expect(stretched.points[3]).toEqual([-1, 0]);
    expect(stretched.points[0]).toEqual([0, 3]);
    expect(roomArea(stretched)).toBeCloseTo(13.5, 12);
  });

  it('works on concave rooms and reports walls that would vanish', () => {
    const l = roomFromPoints(lShape); // walls: (0,6)→(3,6), (3,6)→(3,3), (3,3)→(6,3), ...
    const longer = ok(setWallLength(l, 0, 5));
    expect(longer.points[2]).toEqual([5, 3]);
    expect(wallLength(longer, 2)).toBeCloseTo(1, 12);
    expect(errorOf(setWallLength(l, 0, 6))).toBe('wall-too-short');
  });

  it('rejects lengths that are too short or unknown walls', () => {
    expect(errorOf(setWallLength(base, 0, 0.1))).toBe('invalid-length');
    expect(errorOf(setWallLength(base, 0, NaN))).toBe('invalid-length');
    expect(errorOf(setWallLength(base, 'nope', 2))).toBe('unknown-wall');
    expect(setWallLength(base, 0, 4.1).ok).toBe(true);
  });
});

describe('setCeilingHeight', () => {
  it('lowers tops of doors and windows that would reach above it', () => {
    const room = withOpenings(base, 0, [
      opening('d1', 'door', 0.2),
      opening('w1', 'window', 2, 1.2, 1.2, 0.9),
    ]);
    const result = setCeilingHeight(room, 2);
    const after = ok(result);
    expect(after.ceilingHeight).toBe(2);
    const [door, win] = after.walls[0]!.openings;
    expect(door!.height).toBeCloseTo(2, 12);
    expect(win!.sill).toBe(0.9);
    expect(win!.height).toBeCloseTo(1.1, 12);
    expect(result.ok && result.changes.map((c) => c.change)).toEqual(['resized', 'resized']);
  });

  it('has sensible limits', () => {
    expect(errorOf(setCeilingHeight(base, 1))).toBe('ceiling-too-low');
    expect(errorOf(setCeilingHeight(base, 7))).toBe('ceiling-too-high');
    expect(ok(setCeilingHeight(base, 3)).ceilingHeight).toBe(3);
  });
});

describe('openings', () => {
  it('adds a door in the middle of the wall with default sizes and a fresh id', () => {
    const room = ok(addOpening(base, 0, { type: 'door' }));
    const door = room.walls[0]!.openings[0]!;
    expect(door).toEqual({
      id: 'door-1',
      type: 'door',
      offset: (4 - DEFAULT_OPENINGS.door.width) / 2,
      width: DEFAULT_OPENINGS.door.width,
      height: DEFAULT_OPENINGS.door.height,
      sill: 0,
    });
    expect(newOpeningId(room, 'door')).toBe('door-2');
    expect(findOpening(room, 'door-1')!.wallIndex).toBe(0);
  });

  it('puts the next one in the nearest free space', () => {
    const one = ok(addOpening(base, 0, { type: 'door', width: 2 }));
    const two = ok(addOpening(one, 0, { type: 'window', width: 1 }));
    const win = two.walls[0]!.openings.find((o) => o.type === 'window')!;
    expect(win.offset === 0 || win.offset === 3).toBe(true);
    expect(win.sill).toBe(DEFAULT_OPENINGS.window.sill);
    const full = ok(addOpening(two, 0, { type: 'window', width: 1 }));
    expect(errorOf(addOpening(full, 0, { type: 'door', width: 0.9 }))).toBe('no-room-for-opening');
  });

  it('validates what is typed in', () => {
    const room = ok(addOpening(base, 0, { type: 'door', offset: 1, width: 1 }));
    expect(errorOf(addOpening(room, 0, { type: 'window', offset: 1.5, width: 1 }))).toBe(
      'opening-overlaps',
    );
    expect(errorOf(addOpening(base, 0, { type: 'window', offset: 3.5, width: 1 }))).toBe(
      'opening-outside-wall',
    );
    expect(errorOf(addOpening(base, 0, { type: 'window', sill: 2, height: 1 }))).toBe(
      'opening-above-ceiling',
    );
    expect(errorOf(addOpening(base, 0, { type: 'door', width: 0.1 }))).toBe('opening-too-small');
    expect(errorOf(addOpening(base, 9, { type: 'door' }))).toBe('unknown-wall');
    // Doors always start at the floor.
    const door = ok(addOpening(base, 1, { type: 'door', sill: 1 })).walls[1]!.openings[0]!;
    expect(door.sill).toBe(0);
  });

  it('moves an opening along a wall, stopping at the ends and at other openings', () => {
    let room = ok(addOpening(base, 0, { type: 'door', offset: 0.5, width: 1, id: 'a' }));
    room = ok(addOpening(room, 0, { type: 'window', offset: 2.5, width: 1, id: 'b' }));
    const pastEnd = ok(moveOpening(room, 'b', 9));
    expect(findOpening(pastEnd, 'b')!.opening.offset).toBe(3);
    const intoDoor = ok(moveOpening(room, 'b', 1.2));
    expect(findOpening(intoDoor, 'b')!.opening.offset).toBe(1.5); // stops beside the door
    const otherWall = ok(moveOpening(room, 'b', 1, { toWall: 1 }));
    expect(findOpening(otherWall, 'b')!.wallIndex).toBe(1);
    expect(otherWall.walls[0]!.openings.map((o) => o.id)).toEqual(['a']);
    expect(errorOf(moveOpening(room, 'zzz', 1))).toBe('unknown-opening');
    const wide = ok(addOpening(base, 0, { type: 'opening', width: 3.5, id: 'w' }));
    expect(errorOf(moveOpening(wide, 'w', 0, { toWall: 1 }))).toBe('opening-outside-wall');
  });

  it('updates and removes openings', () => {
    const room = ok(addOpening(base, 0, { type: 'door', offset: 1, width: 1, id: 'd' }));
    const wider = ok(updateOpening(room, 'd', { width: 1.5 }));
    expect(findOpening(wider, 'd')!.opening.width).toBe(1.5);
    expect(errorOf(updateOpening(room, 'd', { width: 3.5 }))).toBe('opening-outside-wall');
    const asWindow = findOpening(ok(updateOpening(room, 'd', { type: 'window' })), 'd')!.opening;
    expect(asWindow.sill).toBe(DEFAULT_OPENINGS.window.sill);
    expect(asWindow.height).toBe(DEFAULT_OPENINGS.window.height);
    const gone = ok(removeOpening(room, 'd'));
    expect(findOpening(gone, 'd')).toBeNull();
    expect(errorOf(removeOpening(gone, 'd'))).toBe('unknown-opening');
  });

  it('checks openings against their wall', () => {
    const room = withOpenings(base, 0, [opening('a', 'door', 0)]);
    expect(validateOpening(room, 0, opening('b', 'window', 1, 1, 1, 1))).toBeNull();
    expect(validateOpening(room, 0, opening('b', 'window', 0.5, 1, 1, 1))).toBe('opening-overlaps');
    expect(validateOpening(room, 0, opening('a', 'door', 0.1))).toBeNull(); // itself is skipped
    expect(validateOpening(room, 0, opening('b', 'window', 3.2, 1, 1, 1))).toBe(
      'opening-outside-wall',
    );
    expect(validateOpening(room, 0, opening('b', 'window', 1, 1, 1, 1.5))).toBe(
      'opening-above-ceiling',
    );
    expect(validateOpening(room, 'x', opening('b', 'door', 1))).toBe('unknown-wall');
  });

  it('fits a whole room of openings', () => {
    const messy = withOpenings(base, 0, [
      opening('a', 'door', 0, 1.5),
      opening('b', 'door', 1, 1.5), // overlaps a
      opening('c', 'window', 3.8, 1, 3, 0.5), // past the end and through the ceiling
    ]);
    const { room, changes } = fitOpenings(messy);
    const list = room.walls[0]!.openings;
    for (const o of list) expect(validateOpening(room, 0, o)).toBeNull();
    expect(list.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(changes.map((c) => `${c.openingId}:${c.change}`).sort()).toEqual([
      'b:moved',
      'c:resized',
    ]);
  });
});

describe('wall helpers', () => {
  it('projects a point onto a wall for dragging', () => {
    expect(projectOntoWall(base, 0, { x: 1.5, z: 2.6 })).toEqual({
      offset: 1.5,
      distance: expect.closeTo(0.4, 12),
    });
    expect(projectOntoWall(base, 0, [9, 3])!.offset).toBe(4);
    expect(projectOntoWall(base, 'nope', [0, 0])).toBeNull();
  });

  it('explains errors in plain words', () => {
    expect(describeRoomEditError('opening-overlaps', { type: 'window' })).toBe(
      'The window overlaps another door or window on this wall.',
    );
    expect(describeRoomEditError('too-small')).toContain('smaller than');
  });
});
