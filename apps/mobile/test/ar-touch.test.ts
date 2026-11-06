import { itemFootprint, type LineUp } from '@youngvista/core';
import { describe, expect, it, vi } from 'vitest';
import { roomToWorld, rayThrough } from '@/ar/pose';
import { ArTouch, rayCaster, type ArTouchInput, type RayCaster } from '@/ar/touch';
import type { Ray } from '@/furnish/orbit';

const lineUp: LineUp = { rotationY: -20, x: 1, y: -1.4, z: 2 };
const EYE = { x: 0, z: 0 };

/**
 * A fake screen: "screen points" are room floor points (x, z) the finger is over, and every ray
 * comes back from the phone 1.4 m above the room's origin, a little later, in world space, as
 * Viro's `unproject` does.
 */
function fakeScreen() {
  const pending: (() => void)[] = [];
  const cast: RayCaster = (x, z) =>
    new Promise<Ray | null>((resolve) => {
      pending.push(() =>
        resolve(rayThrough(roomToWorld(lineUp, EYE, 1.4), roomToWorld(lineUp, { x, z }))),
      );
    });
  const answer = async (n = Infinity) => {
    for (let i = 0; i < n && pending.length; i++) pending.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { cast, answer, pending };
}

const sofa = { id: 's', x: 2, z: 1, rotationY: 0 };
const box = { id: 's', footprint: itemFootprint(sofa, { w: 2, d: 0.9 }), y: 0, height: 0.8 };

function input(over: Partial<ArTouchInput> = {}): ArTouchInput {
  return {
    lineUp,
    boxes: [box],
    items: [sofa],
    selectedId: null,
    onTap: vi.fn(),
    onDragStart: vi.fn(),
    onDragMove: vi.fn(),
    onRotateStart: vi.fn(),
    onRotateMove: vi.fn(),
    onGestureEnd: vi.fn(),
    ...over,
  };
}

describe('touches in AR', () => {
  it('selects the piece under the finger, or nothing', async () => {
    const screen = fakeScreen();
    const i = input();
    const touch = new ArTouch(screen.cast, i);
    const tap = touch.tap(2.2, 1.1);
    await screen.answer();
    await tap;
    expect(i.onTap).toHaveBeenLastCalledWith('s');
    // Off to the side: the ray never crosses the sofa.
    const miss = touch.tap(-1, 3);
    await screen.answer();
    await miss;
    expect(i.onTap).toHaveBeenLastCalledWith(null);
  });

  it('drags a piece along the floor, keeping where the finger holds it', async () => {
    const screen = fakeScreen();
    const i = input();
    const touch = new ArTouch(screen.cast, i);
    touch.panStart(2.5, 1.2);
    await screen.answer();
    expect(i.onDragStart).toHaveBeenCalledWith('s');
    touch.panMove(3, 2.2);
    await screen.answer();
    expect(i.onDragMove).toHaveBeenCalledTimes(1);
    const [x, z] = (i.onDragMove as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // The finger moved (0.5, 1): so does the piece's centre.
    expect(x).toBeCloseTo(2.5, 6);
    expect(z).toBeCloseTo(2, 6);
    touch.panEnd();
    expect(i.onGestureEnd).toHaveBeenCalledTimes(1);
    expect(touch.busy).toBe(false);
  });

  it('folds moves made while a ray is on its way into the newest one', async () => {
    const screen = fakeScreen();
    const i = input();
    const touch = new ArTouch(screen.cast, i);
    touch.panStart(2, 1);
    // Moves and the lift arrive before the start's ray comes back.
    touch.panMove(2.1, 1);
    touch.panMove(2.2, 1);
    touch.panMove(2.3, 1);
    touch.panEnd();
    expect(screen.pending).toHaveLength(1);
    await screen.answer(1); // the start
    expect(i.onDragStart).toHaveBeenCalledWith('s');
    expect(screen.pending).toHaveLength(1); // only the newest move
    expect(i.onGestureEnd).not.toHaveBeenCalled();
    await screen.answer();
    expect(i.onDragMove).toHaveBeenCalledTimes(1);
    expect((i.onDragMove as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeCloseTo(2.3, 6);
    expect(i.onGestureEnd).toHaveBeenCalledTimes(1);
  });

  it('drags the selected piece when the finger starts on empty floor', async () => {
    const screen = fakeScreen();
    const i = input({ selectedId: 's' });
    const touch = new ArTouch(screen.cast, i);
    touch.panStart(-1, 3);
    await screen.answer();
    expect(i.onDragStart).toHaveBeenCalledWith('s');
    touch.panMove(-1, 2.5);
    await screen.answer();
    const [x, z] = (i.onDragMove as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(x).toBeCloseTo(2, 6);
    expect(z).toBeCloseTo(0.5, 6);
  });

  it('does nothing on empty floor with nothing selected, or before the room is lined up', async () => {
    const screen = fakeScreen();
    const i = input();
    const touch = new ArTouch(screen.cast, i);
    touch.panStart(-1, 3);
    await screen.answer();
    touch.panMove(-1, 2);
    touch.panEnd();
    await screen.answer();
    expect(i.onDragStart).not.toHaveBeenCalled();
    expect(i.onGestureEnd).not.toHaveBeenCalled();
    const off = input({ lineUp: null, selectedId: 's' });
    const t2 = new ArTouch(screen.cast, off);
    t2.panStart(2, 1);
    t2.turnStart();
    await t2.tap(2, 1);
    expect(screen.pending).toHaveLength(0);
    expect(off.onDragStart).not.toHaveBeenCalled();
    expect(off.onRotateStart).not.toHaveBeenCalled();
  });

  it('turns the selected piece with two fingers, clockwise seen from above', () => {
    const screen = fakeScreen();
    const i = input({ selectedId: 's', items: [{ ...sofa, rotationY: 90 }] });
    const touch = new ArTouch(screen.cast, i);
    touch.turnStart();
    expect(i.onRotateStart).toHaveBeenCalledWith('s');
    touch.turnMove(20);
    expect(i.onRotateMove).toHaveBeenLastCalledWith(70);
    touch.turnEnd();
    expect(i.onGestureEnd).toHaveBeenCalledTimes(1);
  });
});

describe('rays from Viro', () => {
  it('asks unproject for two depths at the touch, in pixels', async () => {
    const unproject = vi.fn(async ([x, y, z]: [number, number, number]) => ({
      position: [x / 100, -z * 10, y / 100],
    }));
    const cast = rayCaster(() => unproject, 3);
    const ray = (await cast(10, 20))!;
    expect(unproject).toHaveBeenCalledWith([30, 60, 0]);
    expect(unproject).toHaveBeenCalledWith([30, 60, 0.1]);
    expect(ray.origin).toEqual([0.3, -0, 0.6]);
    expect(ray.dir[1]).toBeCloseTo(-1);
  });

  it('gives no ray without the AR view, or when unproject fails', async () => {
    expect(await rayCaster(() => null, 3)(1, 1)).toBeNull();
    const failing = rayCaster(() => () => Promise.reject(new Error('unmounted')), 3);
    expect(await failing(1, 1)).toBeNull();
    const odd = rayCaster(() => async () => ({ position: 'x' }), 3);
    expect(await odd(1, 1)).toBeNull();
  });
});
