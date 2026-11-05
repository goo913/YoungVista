import { describe, expect, it } from 'vitest';
import {
  anchorIdOf,
  cameraPoseFromViro,
  lightIntensityFromViro,
  planeFromViroAnchor,
  vec3,
} from '@/scan/viro-anchor';
import { floorAnchor, wallAnchor } from './helpers';

describe('planeFromViroAnchor', () => {
  it('maps a Viro plane anchor to core PlaneAnchor fields', () => {
    const plane = planeFromViroAnchor({ ...wallAnchor('A1', 1, -2, 0, 3), center: [0.1, 0, 0] });
    expect(plane).toEqual({
      id: 'A1',
      alignment: 'Vertical',
      classification: 'Wall',
      anchor: {
        id: 'A1',
        position: [1, 1.2, -2],
        rotationDeg: [90, 0, 0],
        center: [0.1, 0, 0],
        width: 3,
        height: 2.4,
      },
      vertexCount: 0,
    });
  });

  it('defaults a missing centre to the anchor origin and accepts iPhone alignments', () => {
    const { center: _center, ...anchor } = floorAnchor('F', 0, { alignment: 'Horizontal' });
    const plane = planeFromViroAnchor(anchor);
    expect(plane?.anchor.center).toEqual([0, 0, 0]);
    expect(plane?.alignment).toBe('Horizontal');
  });

  it('rejects anything that is not a usable plane', () => {
    const good = wallAnchor('A1', 0, 0, 0, 1);
    expect(planeFromViroAnchor(null)).toBeNull();
    expect(planeFromViroAnchor('plane')).toBeNull();
    expect(planeFromViroAnchor({ ...good, anchorId: '' })).toBeNull();
    expect(planeFromViroAnchor({ ...good, type: 'image' })).toBeNull();
    expect(planeFromViroAnchor({ ...good, alignment: 'Sideways' })).toBeNull();
    expect(planeFromViroAnchor({ ...good, position: [0, 0] })).toBeNull();
    expect(planeFromViroAnchor({ ...good, rotation: [0, Number.NaN, 0] })).toBeNull();
    expect(planeFromViroAnchor({ ...good, center: 'middle' })).toBeNull();
    expect(planeFromViroAnchor({ ...good, width: -1 })).toBeNull();
    expect(planeFromViroAnchor({ ...good, height: undefined })).toBeNull();
  });

  it('reads the id of a removed anchor', () => {
    expect(anchorIdOf({ anchorId: 'X' })).toBe('X');
    expect(anchorIdOf(undefined)).toBeNull();
    expect(anchorIdOf({ anchorId: 3 })).toBeNull();
  });
});

describe('cameraPoseFromViro', () => {
  it('reads the flat event and normalises the vectors', () => {
    const p = cameraPoseFromViro({
      position: [1, 1.5, 2],
      rotation: [0, 90, 0],
      forward: [0, 0, -2],
      up: [0, 3, 0],
    });
    expect(p).toEqual({
      position: [1, 1.5, 2],
      rotation: [0, 90, 0],
      forward: [0, 0, -1],
      up: [0, 1, 0],
    });
  });

  it('reads the deprecated nested cameraTransform shape', () => {
    const p = cameraPoseFromViro({
      cameraTransform: {
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        forward: [1, 0, 0],
        up: [0, 1, 0],
      },
    });
    expect(p?.forward).toEqual([1, 0, 0]);
  });

  it('rejects missing or degenerate vectors', () => {
    expect(cameraPoseFromViro({ position: [0, 0, 0] })).toBeNull();
    expect(
      cameraPoseFromViro({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        forward: [0, 0, 0],
        up: [0, 1, 0],
      }),
    ).toBeNull();
  });
});

describe('small readers', () => {
  it('vec3 needs three finite numbers', () => {
    expect(vec3([1, 2, 3, 4])).toEqual([1, 2, 3]);
    expect(vec3([1, '2', 3])).toBeNull();
  });

  it('reads the light estimate', () => {
    expect(lightIntensityFromViro({ intensity: 820, color: '#fff' })).toBe(820);
    expect(lightIntensityFromViro({})).toBeNull();
  });
});
