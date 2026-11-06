import { describe, expect, it } from 'vitest';
import {
  captureFile,
  captureFolder,
  fitMarks,
  fittedFacing,
  groupWallMarks,
  keyframeFile,
  panoramaFile,
  placeMark,
  roomAxes,
  scanFitFromFirestore,
  solveRectilinearRoom,
  type FittedMark,
} from '../src';

/** Marks for a 4 × 3 m room centred on the origin, seen from (0.3, -0.2). */
function rectangleMarks(): FittedMark[] {
  const camera = { x: 0.3, z: -0.2 };
  const at = (id: string, x: number, z: number, axis: 0 | 1): FittedMark => ({
    id,
    point: { x, z },
    camera,
    axis,
    confidence: 0.9,
  });
  // Axis 0 walls run along u = +x (their normal is v = +z); axis 1 walls along z.
  return [at('n', 0.5, -1.5, 0), at('s', -0.4, 1.5, 0), at('w', -2, 0.2, 1), at('e', 2, -0.6, 1)];
}

describe('turn-around scan contract', () => {
  it('names the capture files', () => {
    expect(captureFolder('u1', 's1')).toBe('users/u1/scans/s1');
    expect(captureFile('u1', 's1')).toBe('users/u1/scans/s1/capture.json');
    expect(keyframeFile(7)).toBe('kf/007.jpg');
    expect(panoramaFile(0)).toBe('pano/spot-0.jpg');
  });

  it('reads a finished fit and builds the room with the marked-wall solver', () => {
    const doc = scanFitFromFirestore({
      ownerId: 'u1',
      status: 'done',
      result: {
        axesAngle: 0,
        floorY: -1.4,
        ceilingHeight: 2.5,
        marks: [...rectangleMarks(), { id: 'bad', point: { x: 1 } }],
        openings: [
          { markId: 'n', kind: 'door', from: 0, to: 0.9, bottom: 0, top: 2, confidence: 0.8 },
          { markId: 'n', kind: 'sofa', from: 0, to: 1, bottom: 0, top: 1, confidence: 1 },
        ],
        spots: [],
      },
    });
    expect(doc?.status).toBe('done');
    expect(doc?.result?.marks).toHaveLength(4);
    expect(doc?.result?.openings).toHaveLength(1);
    const { axes, marks } = fitMarks(doc!.result!);
    const grouped = groupWallMarks(marks, axes);
    const solved = solveRectilinearRoom(grouped.walls, grouped.axes, { ceilingHeight: 2.5 });
    expect(solved.ok).toBe(true);
    if (solved.ok) {
      const xs = solved.room.points.map((p) => p[0]);
      const zs = solved.room.points.map((p) => p[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 6);
      expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(3, 6);
    }
  });

  it('agrees with placeMark about which side of the wall the room is on', () => {
    const axes = roomAxes(0.3);
    for (const m of rectangleMarks()) {
      const placed = placeMark(m.point, m.camera, axes, { axis: m.axis });
      if (placed.ok) expect(fittedFacing(axes, m)).toBe(placed.facing);
    }
  });

  it('refuses what is not a fit', () => {
    expect(scanFitFromFirestore(null)).toBeNull();
    expect(scanFitFromFirestore({ ownerId: 'u1', status: 'maybe' })).toBeNull();
    expect(scanFitFromFirestore({ status: 'done' })).toBeNull();
    expect(scanFitFromFirestore({ ownerId: 'u1', status: 'queued' })).toEqual({
      ownerId: 'u1',
      status: 'queued',
    });
  });
});
