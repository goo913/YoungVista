import type { Design, DesignItem } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { designKey, DesignFollower } from '@/furnish/design-follow';

const sofa = (x: number): DesignItem => ({
  id: 'sofa',
  productId: 'sofa-1',
  x,
  z: 1,
  rotationY: 0,
});
const design = (...items: DesignItem[]): Design => ({ items });
const D1 = design(sofa(1));
const D2 = design(sofa(2), { id: 'lamp', productId: 'lamp-1', x: 3, z: 3, rotationY: 90 });
const D3 = design(sofa(3));

let revision = 0;
const server = (d: Design) => ({ design: d, revision: ++revision });

describe('following the design changed elsewhere', () => {
  it('compares designs by what is stored', () => {
    expect(designKey(D1)).toBe(designKey(D1.items));
    expect(designKey(design({ ...sofa(1), variant: undefined, y: 0 }))).toBe(designKey(D1));
    expect(designKey(D1)).not.toBe(designKey(D3));
  });

  it('takes over a change from the server while the user is idle', () => {
    const f = new DesignFollower(D1, server(D1));
    expect(f.check(server(D2), D1.items, false)).toEqual(D2);
    // The same snapshot again changes nothing.
    const again = server(D2);
    expect(f.check(again, D2.items, false)).toBeNull();
  });

  it('ignores the snapshot the screen opened with', () => {
    const opened = server(D2);
    // Opened with D1 laid over it (an edit kept on this phone): D2 is not taken over.
    const f = new DesignFollower(D1, opened);
    expect(f.check(opened, D1.items, false)).toBeNull();
  });

  it('ignores the server echoing this screen’s own save', () => {
    const f = new DesignFollower(D1, server(D1));
    // The user moved the sofa: an unsaved edit until the save is on the server.
    expect(f.check(null, D3.items, false)).toBeNull();
    f.saved(D3);
    expect(f.check(server(D3), D3.items, false)).toBeNull();
  });

  it('ignores an echo that arrives before the save is reported, and does not go back to it', () => {
    const f = new DesignFollower(D1, server(D1));
    const echo = server(D3);
    // The echo arrives while the save is still on its way (busy): kept as missed...
    expect(f.check(echo, D3.items, true)).toBeNull();
    // ...then the save is reported: the screen's own write is the last one.
    f.saved(D3);
    expect(f.check(echo, D3.items, false)).toBeNull();
  });

  it('waits for a gesture to end, then takes over what arrived meanwhile', () => {
    const f = new DesignFollower(D1, server(D1));
    const remote = server(D2);
    expect(f.check(remote, D1.items, true)).toBeNull();
    // The finger lifted without moving anything.
    expect(f.check(remote, D1.items, false)).toEqual(D2);
  });

  it('lets the last write win when the user changed something meanwhile', () => {
    const f = new DesignFollower(D1, server(D1));
    const remote = server(D2);
    // A drag in progress when the website's change arrives...
    expect(f.check(remote, D1.items, true)).toBeNull();
    // ...ends with the sofa moved: an unsaved edit, so nothing is taken over...
    expect(f.check(remote, D3.items, false)).toBeNull();
    // ...and once saved, the phone's design is the last write.
    f.saved(D3);
    expect(f.check(remote, D3.items, false)).toBeNull();
    expect(f.check(server(D3), D3.items, false)).toBeNull();
  });

  it('lets a save already on its way win over a change that arrives meanwhile', () => {
    const f = new DesignFollower(D1, server(D1));
    // A piece removed and put back: the screen shows D1 again, but a save is still on its way.
    const remote = server(D2);
    expect(f.check(remote, D1.items, true)).toBeNull();
    // The save lands after the website's change: the phone's write is the last one.
    f.saved(D1);
    expect(f.check(remote, D1.items, false)).toBeNull();
  });

  it('never takes over while an edit made on this phone waits for the server', () => {
    const f = new DesignFollower(D3, server(D1));
    const old = server(D1);
    // An edit kept on the phone (D3) is not on the server yet: busy.
    expect(f.check(old, D3.items, true)).toBeNull();
    // It reaches the server: the snapshot matches what the screen has.
    expect(f.check(server(D3), D3.items, false)).toBeNull();
    expect(f.check(old, D3.items, false)).toBeNull();
  });
});
