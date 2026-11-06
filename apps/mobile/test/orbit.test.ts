import { buildRoomMeshes, itemFootprint, roomFromPoints } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  cameraBasis,
  eyePosition,
  fitOrbit,
  fovTangents,
  lerpOrbit,
  orbitBy,
  pickBox,
  PITCH_MAX,
  PITCH_MIN,
  projectPoint,
  rayOnFloor,
  sceneTransform,
  screenRay,
  zoomBy,
  type Orbit,
} from '@/furnish/orbit';

const view = { width: 400, height: 600 };
const orbit: Orbit = { target: [2, 0.5, 1.5], yaw: 28, pitch: 40, distance: 6 };

const close = (a: readonly number[], b: readonly number[], digits = 6) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe('the camera', () => {
  it('looks at its target from yaw and pitch', () => {
    const top = cameraBasis({ yaw: 0, pitch: 90 });
    // Straight down with the plan's +X to the right and +Z down the screen.
    close(top.right, [1, 0, 0]);
    close(top.up, [0, 0, -1]);
    close(top.back, [0, 1, 0]);
    const level = cameraBasis({ yaw: 90, pitch: 0 });
    close(level.back, [1, 0, 0]); // looking from +X
    close(eyePosition({ target: [1, 2, 3], yaw: 0, pitch: 0, distance: 5 }), [1, 2, 8]);
  });

  it('spreads the field of view across the longer side, like Viro', () => {
    const t = Math.tan((25 * Math.PI) / 180);
    expect(fovTangents({ width: 400, height: 600 }, 50)).toEqual({ x: (t * 400) / 600, y: t });
    expect(fovTangents({ width: 600, height: 400 }, 50)).toEqual({ x: t, y: (t * 400) / 600 });
  });

  it('turns screen points into rays and back', () => {
    const p: [number, number, number] = [3.1, 0, 2.2];
    const s = projectPoint(orbit, view, p)!;
    expect(s.depth).toBeGreaterThan(0);
    const hit = rayOnFloor(screenRay(orbit, view, s))!;
    expect(hit.x).toBeCloseTo(3.1, 6);
    expect(hit.z).toBeCloseTo(2.2, 6);
    // The middle of the screen looks at the target.
    const centre = projectPoint(orbit, view, orbit.target)!;
    expect(centre.x).toBeCloseTo(200, 6);
    expect(centre.y).toBeCloseTo(300, 6);
    // Behind the camera there is nothing to show; rays above the horizon miss the floor.
    expect(projectPoint(orbit, view, eyePosition({ ...orbit, distance: 8 }))).toBeNull();
    const level = { ...orbit, pitch: 0 };
    expect(rayOnFloor(screenRay(level, view, { x: 200, y: 10 }))).toBeNull();
  });

  it('lists the nested Viro nodes that move the room in front of the camera', () => {
    expect(sceneTransform(orbit)).toEqual({
      push: [0, 0, -6],
      tilt: [40, 0, 0],
      turn: [0, -28, 0],
      shift: [-2, -0.5, -1.5],
    });
  });

  it('orbits, tilts within limits and zooms', () => {
    const turned = orbitBy(orbit, 200, 0, view);
    expect(turned.yaw).toBeCloseTo(28 - 90);
    expect(orbitBy(orbit, 0, 10_000, view).pitch).toBe(PITCH_MAX);
    expect(orbitBy(orbit, 0, -10_000, view).pitch).toBe(PITCH_MIN);
    expect(zoomBy(orbit, 2, 20).distance).toBe(3);
    expect(zoomBy(orbit, 0.01, 20).distance).toBe(20);
    expect(zoomBy(orbit, 0, 20)).toBe(orbit);
  });

  it('glides the short way round', () => {
    const a = { ...orbit, yaw: 350 };
    const b = { ...orbit, yaw: 10, pitch: 90 };
    expect(lerpOrbit(a, b, 0.5).yaw).toBeCloseTo(360);
    expect(lerpOrbit(a, b, 0.5).pitch).toBeCloseTo(65);
    expect(lerpOrbit(a, b, 1).yaw % 360).toBeCloseTo(10);
  });
});

describe('framing and picking', () => {
  const room = roomFromPoints([
    [0, 0],
    [5, 0],
    [5, 2.5],
    [3, 2.5],
    [3, 4],
    [0, 4],
  ]);
  const meshes = buildRoomMeshes(room);

  it('fits the whole floor on screen in both presets', () => {
    for (const preset of ['corner', 'top'] as const) {
      const o = fitOrbit(meshes, preset, view);
      for (const [x, z] of room.points) {
        const s = projectPoint(o, view, [x, 0, z])!;
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(view.width);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(view.height);
      }
    }
    expect(fitOrbit(meshes, 'top', view).pitch).toBe(90);
  });

  it('picks the nearest piece under a finger', () => {
    const o = fitOrbit(meshes, 'corner', view);
    const table = { id: 'table', x: 1.5, z: 1.5, rotationY: 0 };
    const lamp = { id: 'lamp', x: 4, z: 1, rotationY: 0 };
    const boxes = [
      { id: 'table', footprint: itemFootprint(table, { w: 1, d: 1 }), y: 0, height: 0.75 },
      { id: 'lamp', footprint: itemFootprint(lamp, { w: 0.4, d: 0.4 }), y: 0, height: 1.8 },
      // A rug under the table: the table is in front of it.
      { id: 'rug', footprint: itemFootprint(table, { w: 2, d: 2 }), y: 0, height: 0.01 },
    ];
    const onTable = projectPoint(o, view, [1.5, 0.75, 1.5])!;
    expect(pickBox(screenRay(o, view, onTable), boxes)).toBe('table');
    const onLamp = projectPoint(o, view, [4, 1.2, 1])!;
    expect(pickBox(screenRay(o, view, onLamp), boxes)).toBe('lamp');
    const onRug = projectPoint(o, view, [2.4, 0, 2.4])!; // the rug's near corner
    expect(pickBox(screenRay(o, view, onRug), boxes)).toBe('rug');
    const empty = projectPoint(o, view, [4.5, 0, 2.2])!;
    expect(pickBox(screenRay(o, view, empty), boxes)).toBeNull();
  });
});
