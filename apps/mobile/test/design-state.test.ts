import {
  roomFromPoints,
  type DesignItem,
  type PlacementProduct,
  type ProductLookup,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { noticeText, noticeTone } from '@/furnish/describe';
import {
  displayedItems,
  initialDesignState,
  itemChecks,
  reduceDesign,
  selectedItem,
  type DesignAction,
  type DesignContext,
  type DesignState,
} from '@/furnish/design-state';

// A 5 × 4 m room: x from 0 to 5, z from 0 to 4.
const room = roomFromPoints([
  [0, 0],
  [5, 0],
  [5, 4],
  [0, 4],
]);

const PRODUCTS: Record<string, PlacementProduct> = {
  sofa: { dimensions: { w: 2, d: 0.9, h: 0.8 }, category: 'sofa' },
  table: { dimensions: { w: 1, d: 1, h: 0.75 }, category: 'dining-table' },
  chair: { dimensions: { w: 0.5, d: 0.5, h: 0.9 }, category: 'dining-chair' },
  rug: { dimensions: { w: 2, d: 1.5, h: 0.01 }, category: 'rug' },
  succulent: { dimensions: { w: 0.2, d: 0.2, h: 0.25 }, placement: 'tabletop', category: 'plant' },
};
const product: ProductLookup = (id) => PRODUCTS[id];

function context(): DesignContext {
  let n = 0;
  return { room, product, newId: () => `new-${++n}` };
}

/** Runs actions from a state, with one context (so new ids count up). */
function run(state: DesignState, ...actions: DesignAction[]) {
  const ctx = context();
  return actions.reduce((s, a) => reduceDesign(s, a, ctx), state);
}

const item = (id: string, productId: string, x: number, z: number, rotationY = 0): DesignItem => ({
  id,
  productId,
  x,
  z,
  rotationY,
});

describe('adding furniture', () => {
  it('puts a new piece in a free spot inside the room and selects it', () => {
    const s = run(initialDesignState(), { type: 'add', productId: 'sofa' });
    expect(s.items).toHaveLength(1);
    expect(s.selectedId).toBe('new-1');
    expect(s.version).toBe(1);
    expect(itemChecks(s, context()).get('new-1')?.valid).toBe(true);
  });

  it('never stacks a new piece on top of one already there', () => {
    const s = run(
      initialDesignState(),
      { type: 'add', productId: 'table' },
      { type: 'add', productId: 'table' },
      { type: 'add', productId: 'table' },
    );
    expect(s.items).toHaveLength(3);
    for (const check of itemChecks(s, context()).values()) expect(check.valid).toBe(true);
  });

  it('says so when nothing fits, and ignores unknown products', () => {
    const tiny = roomFromPoints([
      [0, 0],
      [1.5, 0],
      [1.5, 1.5],
      [0, 1.5],
    ]);
    const ctx = { ...context(), room: tiny };
    const s = reduceDesign(initialDesignState(), { type: 'add', productId: 'sofa' }, ctx);
    expect(s.items).toHaveLength(0);
    expect(s.notice).toEqual({ kind: 'no-space', productId: 'sofa' });
    expect(run(initialDesignState(), { type: 'add', productId: 'nope' }).items).toEqual([]);
  });

  it('keeps a chosen colour', () => {
    const s = run(initialDesignState(), { type: 'add', productId: 'sofa', variant: 'navy' });
    expect(s.items[0]!.variant).toBe('navy');
  });
});

describe('dragging', () => {
  const start = initialDesignState([item('t', 'table', 2.5, 2), item('c', 'chair', 1, 1)]);

  it('shows the piece where the finger is, then keeps it there', () => {
    let s = run(start, { type: 'drag-start', id: 't' }, { type: 'drag-move', x: 3, z: 2.2 });
    expect(s.selectedId).toBe('t');
    expect(displayedItems(s).find((i) => i.id === 't')).toMatchObject({ x: 3, z: 2.2 });
    expect(s.items.find((i) => i.id === 't')).toMatchObject({ x: 2.5, z: 2 }); // not saved yet
    s = run(s, { type: 'gesture-end' });
    expect(s.gesture).toBeNull();
    expect(s.items.find((i) => i.id === 't')).toMatchObject({ x: 3, z: 2.2 });
    expect(s.version).toBe(1);
    expect(s.notice).toBeNull();
  });

  it('snaps the back of a piece flush against a nearby wall, facing into the room', () => {
    const s = run(
      initialDesignState([item('s', 'sofa', 2.5, 2)]),
      { type: 'drag-start', id: 's' },
      { type: 'drag-move', x: 2.5, z: 0.5 }, // back 5 cm from the wall at z = 0
      { type: 'gesture-end' },
    );
    const sofa = s.items[0]!;
    expect(sofa.z).toBeCloseTo(0.45, 6); // half its depth from the wall
    expect(sofa.rotationY).toBe(0); // front toward +z, into the room
  });

  it('refuses a spot on top of another piece and goes back to the last free spot', () => {
    const s = run(
      start,
      { type: 'drag-start', id: 'c' },
      { type: 'drag-move', x: 1.4, z: 1.2 }, // free
      { type: 'drag-move', x: 2.3, z: 2 }, // inside the table
    );
    expect(s.gesture?.preview.valid).toBe(false);
    expect(s.gesture?.preview.overlaps).toEqual(['t']);
    const ended = run(s, { type: 'gesture-end' });
    expect(ended.items.find((i) => i.id === 'c')).toMatchObject({ x: 1.4, z: 1.2 });
    expect(ended.notice).toEqual({
      kind: 'refused',
      id: 'c',
      reasons: ['overlaps'],
      overlaps: ['t'],
    });
  });

  it('goes back to where it started when no free spot was passed', () => {
    const s = run(
      start,
      { type: 'drag-start', id: 'c' },
      { type: 'drag-move', x: 2.5, z: 2 },
      { type: 'gesture-end' },
    );
    expect(s.items).toEqual(start.items);
    expect(s.version).toBe(0);
    expect(s.notice?.kind).toBe('refused');
  });

  it('keeps pieces inside the room', () => {
    const s = run(
      start,
      { type: 'drag-start', id: 'c' },
      { type: 'drag-move', x: -3, z: 1 },
      { type: 'gesture-end' },
    );
    const chair = s.items.find((i) => i.id === 'c')!;
    expect(chair.x).toBeGreaterThanOrEqual(0.25 - 0.011);
    expect(itemChecks(s, context()).get('c')?.valid).toBe(true);
  });

  it('changes nothing for a press that never moved, or a cancelled drag', () => {
    expect(run(start, { type: 'drag-start', id: 'c' }, { type: 'gesture-end' }).items).toBe(
      start.items,
    );
    const cancelled = run(
      start,
      { type: 'drag-start', id: 'c' },
      { type: 'drag-move', x: 1.5, z: 1.5 },
      { type: 'gesture-cancel' },
    );
    expect(cancelled.items).toBe(start.items);
    expect(cancelled.gesture).toBeNull();
  });

  it('lets rugs lie under furniture', () => {
    const s = run(
      initialDesignState([item('r', 'rug', 1.5, 1.5), item('t', 'table', 3.5, 2.5)]),
      { type: 'drag-start', id: 't' },
      { type: 'drag-move', x: 1.6, z: 1.6 },
      { type: 'gesture-end' },
    );
    expect(s.items.find((i) => i.id === 't')).toMatchObject({ x: 1.6, z: 1.6 });
    expect(s.notice).toBeNull();
  });

  it('puts a tabletop piece on the table under it', () => {
    const s = run(
      initialDesignState([item('t', 'table', 2.5, 2), item('p', 'succulent', 4, 3)]),
      { type: 'drag-start', id: 'p' },
      { type: 'drag-move', x: 2.5, z: 2 },
      { type: 'gesture-end' },
    );
    expect(s.items.find((i) => i.id === 'p')).toMatchObject({ x: 2.5, z: 2, y: 0.75 });
    const back = run(
      s,
      { type: 'drag-start', id: 'p' },
      { type: 'drag-move', x: 4, z: 3 },
      { type: 'gesture-end' },
    );
    expect(back.items.find((i) => i.id === 'p')!.y).toBeUndefined();
  });
});

describe('turning', () => {
  it('turns in 15° steps with the buttons', () => {
    const s = run(initialDesignState([item('t', 'table', 2.5, 2)]), {
      type: 'rotate-by',
      id: 't',
      degrees: 15,
    });
    expect(s.items[0]!.rotationY).toBe(15);
    expect(run(s, { type: 'rotate-by', id: 't', degrees: -30 }).items[0]!.rotationY).toBe(345);
  });

  it('snaps a two-finger turn to 15° steps without snapping to walls', () => {
    const near = initialDesignState([item('s', 'sofa', 2.5, 0.45)]); // against the wall
    let s = run(near, { type: 'rotate-start', id: 's' }, { type: 'rotate-move', rotationY: 37 });
    expect(s.gesture?.preview.rotationY).toBe(30);
    s = run(s, { type: 'gesture-end' });
    expect(s.items[0]!.rotationY).toBe(30);
    // It stays turned: no wall pulled it back to face the room.
    expect(s.items[0]!.z).toBeGreaterThan(0.45);
  });

  it('refuses a turn into another piece', () => {
    const s = run(initialDesignState([item('s', 'sofa', 2.5, 2), item('c', 'chair', 2.5, 2.9)]), {
      type: 'rotate-by',
      id: 's',
      degrees: 90,
    });
    expect(s.items[0]!.rotationY).toBe(0);
    expect(s.notice).toMatchObject({ kind: 'refused', id: 's', overlaps: ['c'] });
  });
});

describe('copy, remove and colours', () => {
  it('copies a piece next to the original, turned the same way', () => {
    const s = run(initialDesignState([item('c', 'chair', 2.5, 2, 90)]), {
      type: 'duplicate',
      id: 'c',
    });
    expect(s.items).toHaveLength(2);
    const copy = s.items[1]!;
    expect(copy).toMatchObject({ id: 'new-1', productId: 'chair', rotationY: 90 });
    expect(Math.hypot(copy.x - 2.5, copy.z - 2)).toBeLessThan(0.8);
    expect(s.selectedId).toBe('new-1');
    for (const check of itemChecks(s, context()).values()) expect(check.valid).toBe(true);
  });

  it('removes a piece and can bring it back', () => {
    const start = initialDesignState([item('a', 'chair', 1, 1), item('b', 'chair', 3, 3)]);
    const s = run(start, { type: 'select', id: 'a' }, { type: 'remove', id: 'a' });
    expect(s.items.map((i) => i.id)).toEqual(['b']);
    expect(s.selectedId).toBeNull();
    expect(s.notice?.kind).toBe('removed');
    const undone = run(s, { type: 'undo-remove' });
    expect(undone.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(undone.version).toBe(2);
  });

  it('sets and clears a colour', () => {
    const s = run(initialDesignState([item('s', 'sofa', 2.5, 2)]), {
      type: 'set-variant',
      id: 's',
      variant: 'navy',
    });
    expect(s.items[0]!.variant).toBe('navy');
    const cleared = run(s, { type: 'set-variant', id: 's', variant: undefined });
    expect('variant' in cleared.items[0]!).toBe(false);
    // Picking the colour it already has is not a change.
    expect(run(s, { type: 'set-variant', id: 's', variant: 'navy' })).toBe(s);
  });
});

describe('selection and checks', () => {
  it('selects only pieces that exist, and not during a gesture', () => {
    const start = initialDesignState([item('a', 'chair', 1, 1)]);
    expect(run(start, { type: 'select', id: 'zzz' }).selectedId).toBeNull();
    const dragging = run(start, { type: 'drag-start', id: 'a' });
    expect(run(dragging, { type: 'select', id: null }).selectedId).toBe('a');
    expect(selectedItem(run(start, { type: 'select', id: 'a' }))?.id).toBe('a');
  });

  it('flags pieces left outside the room after its walls changed', () => {
    const s = initialDesignState([item('a', 'chair', 6, 1), item('b', 'chair', 1, 1)]);
    const checks = itemChecks(s, context());
    expect(checks.get('a')).toMatchObject({ valid: false, reasons: ['outside-room'] });
    expect(checks.get('b')?.valid).toBe(true);
  });

  it('loads a design from the server without counting it as a change', () => {
    const s = run(initialDesignState(), {
      type: 'load',
      items: [item('a', 'chair', 1, 1)],
    });
    expect(s.items).toHaveLength(1);
    expect(s.version).toBe(0);
    expect(s.notice).toBeNull();
  });

  it('says when the design was changed elsewhere, keeping the selection if the piece is there', () => {
    const start = run(initialDesignState([item('a', 'chair', 1, 1)]), { type: 'select', id: 'a' });
    const s = run(start, {
      type: 'load',
      items: [item('a', 'chair', 2, 2), item('b', 'sofa', 3, 1)],
      elsewhere: true,
    });
    expect(s.notice).toEqual({ kind: 'updated' });
    expect(s.selectedId).toBe('a');
    expect(s.version).toBe(0);
    expect(noticeTone(s.notice!)).toBe('info');
    expect(
      noticeText(
        s.notice!,
        () => 'piece',
        () => 'piece',
      ),
    ).toMatch(/website/);
    const gone = run(start, { type: 'load', items: [], elsewhere: true });
    expect(gone.selectedId).toBeNull();
    expect(noticeTone({ kind: 'no-space', productId: 'sofa' })).toBe('error');
  });
});
