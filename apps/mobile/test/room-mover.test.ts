import { applyLineUp, type LineUp, type Vec2 } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { RoomMover, type RoomMoverInput } from '@/ar/room-mover';
import type { RayCaster } from '@/ar/touch';

/**
 * A fake AR view: the screen point (x, y) looks straight down at the floor point (x/100, y/100),
 * and each ray answers when the test lets it (as Viro's `unproject` answers asynchronously).
 */
function fakeView() {
  const waiting: (() => void)[] = [];
  const cast: RayCaster = (x, y) =>
    new Promise((resolve) => {
      waiting.push(() => resolve({ origin: [x / 100, 1.4, y / 100], dir: [0, -1, 0] }));
    });
  const answer = async () => {
    while (waiting.length) {
      waiting.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return { cast, answer };
}

const start: LineUp = { rotationY: 30, x: 1, y: 0, z: -2 };

function setup(over: Partial<RoomMoverInput> = {}) {
  const view = fakeView();
  const moves: LineUp[] = [];
  let ends = 0;
  const mover = new RoomMover(view.cast, {
    lineUp: start,
    floorY: 0,
    pivot: () => ({ x: 2, z: 2 }),
    onMove: (l) => moves.push(l),
    onEnd: () => ends++,
    ...over,
  });
  return { view, mover, moves, ends: () => ends };
}

describe('moving the room by hand', () => {
  it('drags the room along the floor with one finger, by as much as the finger moved', async () => {
    const { view, mover, moves, ends } = setup();
    mover.panStart(100, 100);
    mover.panMove(150, 120);
    await view.answer();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.x).toBeCloseTo(1.5, 9);
    expect(moves[0]!.z).toBeCloseTo(-1.8, 9);
    expect(moves[0]!.rotationY).toBe(30);
    expect(mover.busy).toBe(true);
    mover.panEnd();
    expect(ends()).toBe(1);
    expect(mover.busy).toBe(false);
  });

  it('folds quick moves into the newest one while a ray is on its way', async () => {
    const { view, mover, moves, ends } = setup();
    mover.panStart(0, 0);
    await view.answer();
    mover.panMove(10, 0);
    mover.panMove(20, 0);
    mover.panMove(30, 10);
    mover.panEnd();
    await view.answer();
    // The first move went out at once; the next ones fold into the newest.
    expect(moves.map((l) => [l.x, l.z])).toEqual([
      [1.1, -2],
      [1.3, -1.9],
    ]);
    expect(ends()).toBe(1);
  });

  it('turns the room about the pivot with two fingers, clockwise on screen as seen from above', () => {
    const { mover, moves, ends } = setup();
    mover.turnStart();
    mover.turnMove(90);
    const turned = moves.at(-1)!;
    expect(turned.rotationY).toBeCloseTo(300, 9);
    // The room point under the pivot stays where it was.
    const under: Vec2 = { x: 0, z: 0 };
    const before = applyLineUp(start, under);
    const after = applyLineUp(turned, under);
    const pivot = { x: 2, z: 2 };
    expect(Math.hypot(after.x - pivot.x, after.z - pivot.z)).toBeCloseTo(
      Math.hypot(before.x - pivot.x, before.z - pivot.z),
      9,
    );
    mover.turnEnd();
    expect(ends()).toBe(1);
  });

  it('does nothing without a room, a floor, or a finger on the floor', async () => {
    const none = setup({ lineUp: null });
    none.mover.panStart(0, 0);
    none.mover.panMove(10, 10);
    none.mover.turnStart();
    none.mover.turnMove(30);
    await none.view.answer();
    expect(none.moves).toEqual([]);

    const noFloor = setup({ floorY: null });
    noFloor.mover.panStart(0, 0);
    noFloor.mover.panMove(10, 10);
    await noFloor.view.answer();
    noFloor.mover.panEnd();
    expect(noFloor.moves).toEqual([]);
    expect(noFloor.ends()).toBe(0);

    // A press that never moved does not count as a move.
    const still = setup();
    still.mover.panStart(0, 0);
    await still.view.answer();
    still.mover.panEnd();
    expect(still.ends()).toBe(0);
  });
});
