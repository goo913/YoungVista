import { roomFromPoints, type Room } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { ghostLines } from '@/ar/ghost';
import { sameLineUp } from '@/ar/pose';

const box = roomFromPoints(
  [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ],
  { ceilingHeight: 2.5 },
);

function withDoorAndWindow(room: Room): Room {
  return {
    ...room,
    walls: room.walls.map((w, i) =>
      i === 0
        ? {
            ...w,
            openings: [
              { id: 'd', type: 'door' as const, offset: 0.5, width: 0.9, height: 2.1, sill: 0 },
              { id: 'w', type: 'window' as const, offset: 2, width: 1.2, height: 1.2, sill: 0.9 },
            ],
          }
        : w,
    ),
  };
}

describe('ghost walls', () => {
  it('outline every wall along the floor, the ceiling and its corner', () => {
    const lines = ghostLines(box);
    expect(lines).toHaveLength(4 * 3);
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    for (const l of lines.filter((l) => l.key.endsWith('-top'))) {
      expect(l.a[1]).toBe(2.5);
      expect(l.b[1]).toBe(2.5);
    }
    const corners = lines.filter((l) => l.key.endsWith('-corner'));
    expect(corners.map((l) => l.b[1])).toEqual([2.5, 2.5, 2.5, 2.5]);
  });

  it('frame doors on the floor and windows above their sill', () => {
    const room = withDoorAndWindow(box);
    const door = ghostLines(room).filter((l) => l.kind === 'door');
    const windows = ghostLines(room).filter((l) => l.kind === 'window');
    // A door: two sides and a top (its bottom is the floor line).
    expect(door).toHaveLength(3);
    expect(Math.max(...door.map((l) => Math.max(l.a[1], l.b[1])))).toBeCloseTo(2.1);
    // A window: all four sides, from its sill up.
    expect(windows).toHaveLength(4);
    expect(Math.min(...windows.map((l) => Math.min(l.a[1], l.b[1])))).toBeCloseTo(0.9);
    expect(Math.max(...windows.map((l) => Math.max(l.a[1], l.b[1])))).toBeCloseTo(2.1);
  });
});

describe('line-ups that put the room in the same place', () => {
  const l = { rotationY: 10, x: 1, y: -1.3, z: 2 };
  it('ignore changes far below a millimetre, and see bigger ones', () => {
    expect(sameLineUp(l, { ...l, x: 1.0002 })).toBe(true);
    expect(sameLineUp(l, { ...l, rotationY: 370.001 })).toBe(true);
    expect(sameLineUp(l, { ...l, z: 2.01 })).toBe(false);
    expect(sameLineUp(l, { ...l, rotationY: 10.5 })).toBe(false);
    expect(sameLineUp(l, null)).toBe(false);
    expect(sameLineUp(null, null)).toBe(true);
  });
});
