/**
 * The "ghost walls" of the AR view: a faint outline of the saved room, drawn over the real one so
 * the user can see how well it lines up. Each wall is a line along the floor, a line at the
 * ceiling and an upright line at its corner; each door, window and opening is a frame on its
 * wall. Room space, metres (the AR scene draws it inside the lined-up node).
 */
import { openingSegment, wallEndpoints, type OpeningType, type Room } from '@youngvista/core';
import type { V3 } from './pose';

export interface GhostLine {
  /** Stable key for React. */
  key: string;
  a: V3;
  b: V3;
  kind: 'wall' | OpeningType;
}

/** Floor lines sit this far above the floor so the real floor does not hide them (m). */
const LIFT = 0.008;

export function ghostLines(room: Room): GhostLine[] {
  const h = room.ceilingHeight;
  const lines: GhostLine[] = [];
  room.walls.forEach((w) => {
    const { a, b } = wallEndpoints(room, w);
    lines.push(
      { key: `${w.id}-floor`, a: [a.x, LIFT, a.z], b: [b.x, LIFT, b.z], kind: 'wall' },
      { key: `${w.id}-top`, a: [a.x, h, a.z], b: [b.x, h, b.z], kind: 'wall' },
      { key: `${w.id}-corner`, a: [a.x, LIFT, a.z], b: [a.x, h, a.z], kind: 'wall' },
    );
    for (const o of w.openings) {
      const seg = openingSegment(room, w.id, o);
      if (!seg) continue;
      const lo = Math.max(o.sill, LIFT);
      const hi = Math.min(o.sill + o.height, h);
      const p = seg.a;
      const q = seg.b;
      const k = `${w.id}-${o.id}`;
      lines.push(
        { key: `${k}-l`, a: [p.x, lo, p.z], b: [p.x, hi, p.z], kind: o.type },
        { key: `${k}-r`, a: [q.x, lo, q.z], b: [q.x, hi, q.z], kind: o.type },
        { key: `${k}-t`, a: [p.x, hi, p.z], b: [q.x, hi, q.z], kind: o.type },
      );
      if (o.sill > LIFT) {
        lines.push({ key: `${k}-b`, a: [p.x, lo, p.z], b: [q.x, lo, q.z], kind: o.type });
      }
    }
  });
  return lines;
}
