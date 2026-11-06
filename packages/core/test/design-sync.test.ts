import { describe, expect, it } from 'vitest';
import {
  DesignFollower,
  designsEqual,
  formatSize,
  inSentence,
  noticeText,
  placementProblem,
  shouldAdoptServerDesign,
  type Design,
  type DesignItem,
} from '../src';

const item = (id: string, x: number, extra: Partial<DesignItem> = {}): DesignItem => ({
  id,
  productId: 'chair',
  x,
  z: 1,
  rotationY: 0,
  ...extra,
});
const design = (...items: DesignItem[]): Design => ({ items });

const server = { fromCache: false, hasPendingWrites: false };
const idle = { unsaved: false, gesture: false };

describe('designsEqual', () => {
  it('compares designs as Firestore stores them', () => {
    expect(designsEqual(design(item('a', 1)), design(item('a', 1)))).toBe(true);
    expect(designsEqual(design(item('a', 1)), design(item('a', 1.5)))).toBe(false);
    // An unset colour, an unset height and a height of 0 are the same thing.
    expect(
      designsEqual(design(item('a', 1, { variant: undefined, y: 0 })), design(item('a', 1))),
    ).toBe(true);
    expect(designsEqual(design(item('a', 1)), design(item('a', 1, { variant: 'navy' })))).toBe(
      false,
    );
    expect(
      designsEqual(design(item('a', 1), item('b', 2)), design(item('b', 2), item('a', 1))),
    ).toBe(false);
    expect(designsEqual(design(), design())).toBe(true);
  });
});

describe('shouldAdoptServerDesign', () => {
  const base = design(item('a', 1));
  const other = design(item('a', 2));

  it('takes a different design from the server when the user is idle', () => {
    expect(shouldAdoptServerDesign(other, server, base, idle)).toBe(true);
  });

  it('never takes its own pending write, a cached snapshot or the design it has', () => {
    expect(shouldAdoptServerDesign(other, { ...server, hasPendingWrites: true }, base, idle)).toBe(
      false,
    );
    expect(shouldAdoptServerDesign(other, { ...server, fromCache: true }, base, idle)).toBe(false);
    expect(shouldAdoptServerDesign(base, server, base, idle)).toBe(false);
  });

  it('waits while there is an unsaved edit or a drag', () => {
    expect(shouldAdoptServerDesign(other, server, base, { unsaved: true, gesture: false })).toBe(
      false,
    );
    expect(shouldAdoptServerDesign(other, server, base, { unsaved: false, gesture: true })).toBe(
      false,
    );
  });
});

describe('DesignFollower', () => {
  const loaded = design(item('a', 1));
  const phone = design(item('a', 1), item('b', 3)); // another device added a piece

  it('adopts what another device saved', () => {
    const f = new DesignFollower(loaded);
    expect(f.snapshot(loaded, server, idle)).toBeNull(); // the first snapshot: what it loaded
    expect(f.snapshot(phone, server, idle)).toEqual(phone);
    expect(f.baseline).toEqual(phone);
    expect(f.snapshot(phone, server, idle)).toBeNull(); // the same again: nothing new
  });

  it('ignores its own write until the server has it, then knows it', () => {
    const f = new DesignFollower(loaded);
    const mine = design(item('a', 2));
    f.edited();
    // Our write shows first as a pending local snapshot, then confirmed by the server, then the
    // save's promise resolves.
    expect(
      f.snapshot(mine, { ...server, hasPendingWrites: true }, { unsaved: true, gesture: false }),
    ).toBeNull();
    expect(f.snapshot(mine, server, { unsaved: true, gesture: false })).toBeNull();
    f.saved(mine);
    expect(f.deferred).toBeNull();
    expect(f.baseline).toEqual(mine);
    expect(f.snapshot(mine, server, idle)).toBeNull();
  });

  it('keeps a design that came during a drag, and takes it when the drag changed nothing', () => {
    const f = new DesignFollower(loaded);
    expect(f.snapshot(phone, server, { unsaved: false, gesture: true })).toBeNull();
    expect(f.deferred).toEqual(phone);
    expect(f.resume({ unsaved: false, gesture: true })).toBeNull(); // still dragging
    expect(f.resume(idle)).toEqual(phone);
    expect(f.deferred).toBeNull();
    expect(f.resume(idle)).toBeNull();
  });

  it('drops a design that came during an edit: the edit is saved over it', () => {
    const f = new DesignFollower(loaded);
    expect(f.snapshot(phone, server, { unsaved: true, gesture: false })).toBeNull();
    const mine = design(item('a', 4));
    f.saved(mine);
    expect(f.resume(idle)).toBeNull();
    // A drag that moved a piece is an edit too.
    expect(f.snapshot(phone, server, { unsaved: false, gesture: true })).toBeNull();
    f.edited();
    expect(f.resume(idle)).toBeNull();
  });

  it('takes the newest design when several came while busy, and none it already has', () => {
    const f = new DesignFollower(loaded);
    const later = design(item('a', 1), item('b', 3), item('c', 4));
    f.snapshot(phone, server, { unsaved: false, gesture: true });
    f.snapshot(later, server, { unsaved: false, gesture: true });
    expect(f.resume(idle)).toEqual(later);
    // Another device put the room back as this page loaded it: the waiting design is forgotten.
    const g = new DesignFollower(loaded);
    g.snapshot(phone, server, { unsaved: false, gesture: true });
    g.snapshot(loaded, server, { unsaved: false, gesture: true });
    expect(g.deferred).toBeNull();
    expect(g.resume(idle)).toBeNull();
  });

  it('never takes a cached snapshot, even after the user is done', () => {
    const f = new DesignFollower(loaded);
    expect(f.snapshot(phone, { fromCache: true, hasPendingWrites: false }, idle)).toBeNull();
    expect(f.resume(idle)).toBeNull();
  });
});

describe('words for furniture', () => {
  const names: Record<string, string> = { s: 'Charcoal sofa', t: 'TV stand' };
  const nameOf = (id: string) => names[id] ?? 'piece';

  it('puts names inside sentences', () => {
    expect(inSentence('Charcoal sofa')).toBe('charcoal sofa');
    expect(inSentence('TV stand')).toBe('TV stand');
  });

  it('says why a spot is not allowed', () => {
    expect(placementProblem({ reasons: ['overlaps'], overlaps: ['s'] }, nameOf)).toBe(
      'Overlaps the charcoal sofa',
    );
    expect(
      placementProblem({ reasons: ['outside-room', 'overlaps'], overlaps: ['s', 't'] }, nameOf),
    ).toBe('Sticks out of the room and overlaps 2 pieces');
    expect(placementProblem({ reasons: ['unknown-product'], overlaps: [] }, nameOf)).toBe(
      'This piece is not in the catalog',
    );
    expect(placementProblem({ reasons: [], overlaps: [] }, nameOf)).toBeNull();
  });

  it('words every notice', () => {
    const productName = () => 'Velvet sofa';
    expect(
      noticeText(
        { kind: 'refused', id: 'x', reasons: ['overlaps'], overlaps: ['t'] },
        nameOf,
        productName,
      ),
    ).toBe('Overlaps the TV stand, so it went back.');
    expect(noticeText({ kind: 'no-space', productId: 'p' }, nameOf, productName)).toBe(
      'There is no free space for the velvet sofa. Move or remove something first.',
    );
    expect(noticeText({ kind: 'removed', item: item('a', 1), index: 0 }, nameOf, productName)).toBe(
      'Removed the velvet sofa.',
    );
  });

  it('gives sizes in feet and inches or metres', () => {
    expect(formatSize({ w: 2.34, d: 0.94, h: 0.8 }, 'metric')).toBe('2.34 × 0.94 × 0.80 m');
    expect(formatSize({ w: 2.34, d: 0.94, h: 0.8 }, 'imperial')).toMatch(/W × .* D × .* H$/);
  });
});
