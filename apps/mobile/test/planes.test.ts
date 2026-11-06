import { describe, expect, it } from 'vitest';
import { planeDebugRows } from '@/scan/debug';
import {
  VIRO_EULER_ORDER,
  planeNormal,
  planeTiltDeg,
  planeWallLine,
  planeWorldCenter,
  planeWorldVertices,
} from '@/scan/planes';
import { createScanState, deriveScan, upsertPlane } from '@/scan/session';
import { planeFromViroAnchor } from '@/scan/viro-anchor';
import { floorAnchor, uprightAnchor } from './helpers';

const parse = (anchor: unknown) => {
  const p = planeFromViroAnchor(anchor);
  if (!p) throw new Error('not a plane');
  return p;
};

/** A wall from (0.5, -2) to (2.5, -1): turned about 26.6° from the X axis, facing the origin. */
const slanted = (twistDeg: number, platform: 'ios' | 'android' = 'ios') =>
  parse(
    uprightAnchor(
      'W',
      { x: 0.5, z: -2 },
      { x: 2.5, z: -1 },
      { bottom: -1.4, top: 1.0, toward: { x: 0, z: 0 }, twistDeg, platform },
    ),
  );

describe("Viro's anchor rotation (R = Rz·Ry·Rx)", () => {
  it('puts the normal of an upright plane level, toward the camera side', () => {
    for (const twist of [0, 25, -60, 90]) {
      const p = slanted(twist);
      const n = planeNormal(p, VIRO_EULER_ORDER);
      expect(n.y).toBeCloseTo(0, 9);
      expect(planeTiltDeg(p, VIRO_EULER_ORDER)).toBeCloseTo(0, 6);
      // Square to the wall's direction (2, 1), on the origin's side.
      expect(n.x * 2 + n.z * 1).toBeCloseTo(0, 9);
      expect(n.x * (0 - 1.5) + n.z * (0 - -1.5)).toBeGreaterThan(0);
    }
  });

  it('finds where the plane meets the floor from its normal and vertices, however it is turned', () => {
    for (const twist of [0, 30, 90, -135]) {
      const line = planeWallLine(slanted(twist), VIRO_EULER_ORDER, 'world')!;
      const a = {
        x: line.point.x + line.direction.x * line.from,
        z: line.point.z + line.direction.z * line.from,
      };
      const b = {
        x: line.point.x + line.direction.x * line.to,
        z: line.point.z + line.direction.z * line.to,
      };
      const ends = [a, b].sort((p, q) => p.x - q.x);
      expect(ends[0]!.x).toBeCloseTo(0.5, 9);
      expect(ends[0]!.z).toBeCloseTo(-2, 9);
      expect(ends[1]!.x).toBeCloseTo(2.5, 9);
      expect(ends[1]!.z).toBeCloseTo(-1, 9);
    }
  });

  it('reads the vertices in the anchor’s space', () => {
    const corners = planeWorldVertices(slanted(40), VIRO_EULER_ORDER);
    expect(corners.map((c) => [c.x, c.y, c.z].map((n) => Number(n.toFixed(9))))).toEqual([
      [0.5, -1.4, -2],
      [2.5, -1.4, -1],
      [2.5, 1, -1],
      [0.5, 1, -2],
    ]);
  });

  it('takes the centre as sent on iPhone (world) and as an offset on Android', () => {
    const ios = slanted(10, 'ios');
    const android = slanted(10, 'android');
    expect(planeWorldCenter(ios, VIRO_EULER_ORDER, 'world')).toMatchObject({
      x: expect.closeTo(1.5, 9),
      y: expect.closeTo(-0.2, 9),
      z: expect.closeTo(-1.5, 9),
    });
    expect(planeWorldCenter(android, VIRO_EULER_ORDER, 'local')).toMatchObject({
      x: expect.closeTo(1.5, 9),
      y: expect.closeTo(-0.2, 9),
    });
    // The old reading (iPhone centre as an offset) puts the plane metres away.
    const wrong = planeWorldCenter(ios, VIRO_EULER_ORDER, 'local');
    expect(Math.hypot(wrong.x - 1.5, wrong.z + 1.5)).toBeGreaterThan(1);
  });

  it('shows in the debug rows whether the centre convention fits the vertices', () => {
    let s = createScanState({ centerSpace: 'world' });
    s = upsertPlane(s, slanted(20, 'ios'));
    s = upsertPlane(s, parse(floorAnchor('F', -1.4, { x: 1, z: 1 })));
    const rows = planeDebugRows(s, deriveScan(s));
    expect(rows.map((r) => r.centerGap)).toEqual([expect.closeTo(0, 9), expect.closeTo(0, 9)]);
    const wall = rows.find((r) => r.id === 'W')!;
    expect(wall.lines.map((l) => l.order)).toEqual(['ZYX', 'YXZ', 'XYZ']);
    expect(wall.lines[0]!.tiltDeg).toBeCloseTo(0, 6);
    const asAndroid = planeDebugRows(
      { ...s, options: { ...s.options, centerSpace: 'local' } },
      deriveScan(s),
    );
    expect(asAndroid.find((r) => r.id === 'W')!.centerGap).toBeGreaterThan(1);
  });
});
