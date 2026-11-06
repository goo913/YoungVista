import { CAPTURE_VERSION, keyframeFile } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import type { KeptFrame } from '@/scan/turn/keyframes';
import { buildManifest, captureProblem } from '@/scan/turn/manifest';
import { viewFromTransform } from '@/scan/turn/plan';
import { cameraTransform, type V3 } from './turn-helpers';

function kept(id: number, t: number, spot: number, ring: number, yaw: number, at: V3): KeptFrame {
  const pitch = [-35, 0, 35][ring]!;
  const transform = cameraTransform(at, yaw, pitch);
  return {
    frame: {
      id,
      t,
      transform,
      intrinsics: { fx: 1450.1234, fy: 1449.9876, cx: 959.5, cy: 719.25 },
      width: 1920,
      height: 1440,
      tracking: id % 10 === 0 ? 'limited' : 'normal',
      exposureDuration: 0.0166666,
      sharpness: 431.27,
    },
    view: viewFromTransform(transform)!,
    spot,
    ring,
    bin: Math.floor((((yaw % 360) + 360) % 360) / 15),
    blurPx: 2,
    score: 5,
    file: `file:///cache/turn-scan/s1/f${id}.jpg`,
    bytes: 450_000 + id,
  };
}

const input = (keyframes: KeptFrame[]) => ({
  scanId: 's1',
  ownerId: 'u1',
  createdAt: new Date('2026-11-06T18:00:00Z'),
  mode: 'landscape-3' as const,
  device: {
    model: 'iPhone15,4',
    os: 'iOS 27.0',
    app: '0.4.0 (12)',
    viro: '3.0.3',
    videoFormat: '1920x1440@60',
  },
  floor: {
    y: -1.41234,
    history: [
      { t: 0, y: -1.4 },
      { t: 12.345, y: -1.41234 },
    ],
  },
  keyframes,
});

describe('buildManifest', () => {
  const frames = [
    kept(3, 2.5, 0, 0, 30, [0.1, 0, 0]),
    kept(1, 0.4, 0, 0, 0, [0, 0, 0]),
    kept(9, 40.2, 0, 1, 15, [0.1, 0, 0.1]),
    kept(10, 90.1, 1, 2, 0, [3, 0.1, 1]),
  ];

  it('numbers the keyframes in the order they were taken, one JPEG each', () => {
    const { manifest, files } = buildManifest(input(frames));
    expect(manifest.frames.map((f) => [f.index, f.file, f.t])).toEqual([
      [0, 'kf/000.jpg', 0.4],
      [1, 'kf/001.jpg', 2.5],
      [2, 'kf/002.jpg', 40.2],
      [3, 'kf/003.jpg', 90.1],
    ]);
    expect(files.map((f) => [f.uri, f.path, f.contentType])).toEqual([
      ['file:///cache/turn-scan/s1/f1.jpg', keyframeFile(0), 'image/jpeg'],
      ['file:///cache/turn-scan/s1/f3.jpg', keyframeFile(1), 'image/jpeg'],
      ['file:///cache/turn-scan/s1/f9.jpg', keyframeFile(2), 'image/jpeg'],
      ['file:///cache/turn-scan/s1/f10.jpg', keyframeFile(3), 'image/jpeg'],
    ]);
    expect(files[0]!.bytes).toBe(450_001);
  });

  it('carries each frame’s own pose, intrinsics, size, tracking and exposure', () => {
    const { manifest } = buildManifest(input(frames));
    const f = manifest.frames[1]!;
    expect(f).toMatchObject({ spot: 0, ring: 0, width: 1920, height: 1440, tracking: 'normal' });
    expect(f.yawDeg).toBeCloseTo(30, 2);
    expect(f.pitchDeg).toBeCloseTo(-35, 2);
    expect(f.transform).toHaveLength(16);
    expect(f.transform[12]).toBeCloseTo(0.1, 6);
    expect(f.intrinsics).toEqual({ fx: 1450.123, fy: 1449.988, cx: 959.5, cy: 719.25 });
    expect(f.sharpness).toBe(431.3);
    expect(f.exposureDuration).toBe(0.016667);
    expect(manifest.frames[3]!.tracking).toBe('limited');
  });

  it('says where each spot was, the floor and the device', () => {
    const { manifest } = buildManifest(input(frames));
    expect(manifest).toMatchObject({
      version: CAPTURE_VERSION,
      scanId: 's1',
      ownerId: 'u1',
      createdAt: '2026-11-06T18:00:00.000Z',
      mode: 'landscape-3',
      device: { model: 'iPhone15,4', viro: '3.0.3', videoFormat: '1920x1440@60' },
      floor: {
        y: -1.4123,
        history: [
          { t: 0, y: -1.4 },
          { t: 12.35, y: -1.4123 },
        ],
      },
    });
    expect(manifest.spots).toEqual([
      { index: 0, position: [0.0667, 0, 0.0333] },
      { index: 1, position: [3, 0.1, 1] },
    ]);
  });

  it('stays well under the 2 MB the rules allow, even for two full spots', () => {
    const many: KeptFrame[] = [];
    for (let k = 0; k < 144; k++)
      many.push(
        kept(k + 1, k, k < 72 ? 0 : 1, (k % 72) % 3, (k * 15) % 360, [0.12345, 0.0123, -0.5]),
      );
    const { manifest } = buildManifest(input(many));
    expect(JSON.stringify(manifest).length).toBeLessThan(200_000);
  });
});

describe('captureProblem', () => {
  const ring = (r: number, n: number) =>
    Array.from({ length: n }, (_, k) =>
      kept(r * 100 + k + 1, r * 100 + k, 0, r, k * 15, [0, 0, 0]),
    );

  it('wants a floor and enough of every ring', () => {
    const full = [...ring(0, 20), ...ring(1, 20), ...ring(2, 20)];
    expect(captureProblem({ floorY: -1.4, keyframes: full, minPerRing: 6 })).toBeNull();
    expect(captureProblem({ floorY: null, keyframes: full, minPerRing: 6 })).toMatch(/floor/);
    expect(
      captureProblem({ floorY: -1.4, keyframes: [...ring(0, 20), ...ring(1, 3)], minPerRing: 6 }),
    ).toMatch(/too few pictures/);
  });
});
