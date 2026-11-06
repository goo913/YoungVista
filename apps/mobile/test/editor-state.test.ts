import {
  bounds,
  findOpening,
  itemFootprint,
  openingSegment,
  roomArea,
  roomFromPoints,
  wallLength,
  type Room,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { fitPlan, footprintContains, itemAt, toRoom, toView } from '@/lib/plan-transform';
import {
  canUndo,
  describeChanges,
  editorHit,
  initialEditorState,
  openingName,
  reduceEditor,
  snapCorner,
  type RoomEditorAction,
  type RoomEditorState,
} from '@/room-edit/editor-state';

// A 4 × 3 m room: corners (0,0) (4,0) (4,3) (0,3) after ordering; walls w1..w4.
const room = roomFromPoints([
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
]);

const run = (state: RoomEditorState, ...actions: RoomEditorAction[]) =>
  actions.reduce(reduceEditor, state);

const wallAt = (r: Room, a: [number, number], b: [number, number]) =>
  r.walls.find((w) => {
    const p = r.points[w.a]!;
    const q = r.points[w.b]!;
    return (
      (p[0] === a[0] && p[1] === a[1] && q[0] === b[0] && q[1] === b[1]) ||
      (p[0] === b[0] && p[1] === b[1] && q[0] === a[0] && q[1] === a[1])
    );
  })!;

const top = wallAt(room, [0, 0], [4, 0]);

describe('room editor', () => {
  it('moves a corner, snapping it square, and can undo it', () => {
    const corner = room.points.findIndex(([x, z]) => x === 4 && z === 3);
    let s = run(
      initialEditorState(room),
      { type: 'corner-drag-start', index: corner },
      { type: 'corner-drag-move', point: { x: 4.52, z: 3.03 }, snap: 0.05 },
    );
    expect(s.room.points[corner]).toEqual([4.52, 3]); // z lined up with the neighbour
    s = run(s, { type: 'drag-end' });
    expect(s.version).toBe(1);
    expect(canUndo(s)).toBe(true);
    const undone = run(s, { type: 'undo' });
    expect(undone.room).toBe(room);
    expect(undone.message?.text).toBe('Undone.');
    expect(canUndo(undone)).toBe(false);
  });

  it('keeps the last good corner and says why when walls would cross', () => {
    const corner = room.points.findIndex(([x, z]) => x === 4 && z === 3);
    const s = run(
      initialEditorState(room),
      { type: 'corner-drag-start', index: corner },
      { type: 'corner-drag-move', point: { x: 3.5, z: 2.5 } },
      { type: 'corner-drag-move', point: { x: -1, z: -1 } },
    );
    expect(s.room.points[corner]).toEqual([3.5, 2.5]);
    expect(s.message).toEqual({
      tone: 'error',
      text: 'That would make the walls cross each other. Move the corner back a little.',
    });
    const ended = run(s, { type: 'drag-end' });
    expect(ended.message?.tone).toBe('error');
    expect(ended.version).toBe(1);
  });

  it('types a wall length; the neighbouring wall keeps its direction', () => {
    const s = run(initialEditorState(room), { type: 'set-wall-length', wallId: top.id, meters: 5 });
    expect(wallLength(s.room, top.id)).toBeCloseTo(5);
    // Still a rectangle: 5 × 3 m.
    const b = bounds(s.room.points);
    expect([b.width, b.depth]).toEqual([5, 3]);
    expect(roomArea(s.room)).toBeCloseTo(15);
    const bad = run(s, { type: 'set-wall-length', wallId: top.id, meters: 0.05 });
    expect(bad.message?.text).toBe('Enter a wall length of at least 20 cm.');
    expect(bad.room).toBe(s.room);
  });

  it('adds a door with the default size in the middle of a wall, and selects it', () => {
    const s = run(initialEditorState(room), {
      type: 'add-opening',
      wallId: top.id,
      openingType: 'door',
    });
    const door = s.room.walls.find((w) => w.id === top.id)!.openings[0]!;
    expect(door).toMatchObject({ id: 'door-1', type: 'door', width: 0.9, height: 2.03, sill: 0 });
    expect(door.offset).toBeCloseTo(1.55);
    expect(s.selection).toEqual({ kind: 'opening', id: 'door-1' });
    expect(s.message?.text).toBe('Door 1 added. Drag it along the wall to move it.');
    const win = run(s, { type: 'add-opening', wallId: top.id, openingType: 'window' });
    expect(findOpening(win.room, 'window-1')!.opening).toMatchObject({
      width: 1.2,
      height: 1.2,
      sill: 0.9,
    });
  });

  it('drags an opening along its wall and stops at the end', () => {
    let s = run(initialEditorState(room), {
      type: 'add-opening',
      wallId: top.id,
      openingType: 'door',
    });
    s = run(
      s,
      { type: 'opening-drag-start', id: 'door-1', point: { x: 2, z: 0.1 } },
      { type: 'opening-drag-move', point: { x: 2.5, z: 0.3 } },
    );
    const door = () => {
      const o = findOpening(s.room, 'door-1')!.opening;
      return openingSegment(s.room, top.id, o)!;
    };
    // It follows the finger along the wall (0.5 m), whichever way the wall runs.
    expect(door().center.x).toBeCloseTo(2.5);
    expect(door().center.z).toBeCloseTo(0);
    s = run(s, { type: 'opening-drag-move', point: { x: 9, z: 0 } }, { type: 'drag-end' });
    expect(Math.max(door().a.x, door().b.x)).toBeCloseTo(4); // stopped at the corner
    expect(s.version).toBe(2);
  });

  it('changes and removes openings, explaining what is not possible', () => {
    let s = run(initialEditorState(room), {
      type: 'add-opening',
      wallId: top.id,
      openingType: 'window',
    });
    s = run(s, { type: 'update-opening', id: 'window-1', changes: { sill: 2 } });
    expect(s.message).toEqual({
      tone: 'error',
      text: 'The window reaches above the ceiling. Make it shorter or lower its sill.',
    });
    s = run(s, { type: 'update-opening', id: 'window-1', changes: { width: 1.5 } });
    expect(findOpening(s.room, 'window-1')!.opening.width).toBe(1.5);
    s = run(s, { type: 'remove-opening', id: 'window-1' });
    expect(findOpening(s.room, 'window-1')).toBeNull();
    expect(s.message?.text).toBe('Window 1 removed.');
    expect(s.selection).toEqual({ kind: 'wall', id: top.id });
  });

  it('says when a ceiling change shrinks windows', () => {
    let s = run(initialEditorState(room), {
      type: 'add-opening',
      wallId: top.id,
      openingType: 'window',
    });
    s = run(s, { type: 'set-ceiling', meters: 1.9 });
    expect(s.room.ceilingHeight).toBe(1.9);
    expect(s.message?.text).toBe('Window 1 was made smaller to fit.');
    expect(run(s, { type: 'set-ceiling', meters: 9 }).message?.text).toMatch(/at most 6 m/);
  });

  it('describes changes in plain words', () => {
    const r = run(initialEditorState(room), {
      type: 'add-opening',
      wallId: top.id,
      openingType: 'door',
    }).room;
    expect(
      describeChanges(
        [
          { wallId: top.id, openingId: 'door-1', change: 'moved' },
          { wallId: top.id, openingId: 'gone', change: 'removed' },
        ],
        r,
      ),
    ).toBe(
      'Door 1 was moved along its wall to fit. A door or window was removed: it no longer fits on its wall.',
    );
    expect(describeChanges([], r)).toBeNull();
    expect(openingName({ id: 'window-12', type: 'window' })).toBe('Window 12');
    expect(openingName({ id: 'x', type: 'opening' })).toBe('Opening');
  });

  it('works out what a touch is on', () => {
    const withDoor = run(initialEditorState(room), {
      type: 'add-opening',
      wallId: top.id,
      openingType: 'door',
    }).room;
    const corner = withDoor.points.findIndex(([x, z]) => x === 0 && z === 0);
    expect(editorHit(withDoor, { x: 0.05, z: 0.04 }, 0.2)).toEqual({
      kind: 'corner',
      index: corner,
    });
    expect(editorHit(withDoor, { x: 2, z: 0.05 }, 0.2)).toEqual({ kind: 'opening', id: 'door-1' });
    expect(editorHit(withDoor, { x: 0.8, z: 0.05 }, 0.2)).toEqual({ kind: 'wall', id: top.id });
    expect(editorHit(withDoor, { x: 2, z: 1.5 }, 0.2)).toBeNull();
  });

  it('snaps a corner only to its own neighbours', () => {
    const corner = room.points.findIndex(([x, z]) => x === 4 && z === 3);
    expect(snapCorner(room, corner, { x: 4.03, z: 3.2 }, 0.05)).toEqual({ x: 4, z: 3.2 });
    expect(snapCorner(room, corner, { x: 4.2, z: 3.2 }, 0.05)).toEqual({ x: 4.2, z: 3.2 });
    expect(snapCorner(room, corner, { x: 4.03, z: 3.02 }, 0)).toEqual({ x: 4.03, z: 3.02 });
  });
});

describe('plan transform', () => {
  it('fits the room in the view and converts both ways', () => {
    const t = fitPlan(room.points, 400, 300, 0.5);
    // 5 × 4 m with the margin; 300 / 4 = 75 points per metre.
    expect(t.scale).toBe(75);
    const p = toView(t, { x: 2, z: 1.5 }); // the room's middle
    expect(p).toEqual({ x: 200, y: 150 });
    expect(toRoom(t, p)).toEqual({ x: 2, z: 1.5 });
  });

  it('finds the piece under a finger, preferring the selected one and furniture over rugs', () => {
    const rug = {
      id: 'rug',
      flat: true,
      footprint: itemFootprint({ x: 2, z: 1.5, rotationY: 0 }, { w: 2, d: 1.5 }),
    };
    const table = {
      id: 'table',
      flat: false,
      footprint: itemFootprint({ x: 2, z: 1.5, rotationY: 45 }, { w: 1, d: 1 }),
    };
    const chair = {
      id: 'chair',
      flat: false,
      footprint: itemFootprint({ x: 2.6, z: 1.5, rotationY: 0 }, { w: 0.5, d: 0.5 }),
    };
    const items = [rug, table, chair];
    expect(itemAt(items, { x: 2, z: 1.5 }, null)).toBe('table');
    expect(itemAt(items, { x: 1.2, z: 1 }, null)).toBe('rug');
    expect(itemAt(items, { x: 2.4, z: 1.5 }, 'table')).toBe('table');
    expect(itemAt(items, { x: 2.4, z: 1.5 }, null)).toBe('chair');
    expect(itemAt(items, { x: 3.6, z: 0.2 }, null)).toBeNull();
    expect(footprintContains(chair.footprint, { x: 2.9, z: 1.5 }, 0.06)).toBe(true);
  });
});
