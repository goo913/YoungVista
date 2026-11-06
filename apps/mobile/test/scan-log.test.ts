import { describe, expect, it, vi } from 'vitest';
import release from '../release.json';
import { POSE_STRIDE, ScanController } from '@/scan/controller';
import {
  LOGGED_VERTICES,
  SCAN_LOG_MAX_BYTES,
  ScanLogger,
  buildScanLog,
  capScanLog,
  scanLogSize,
} from '@/scan/scan-log';
import { aimedCamera, floorAnchor, uprightAnchor, type V3 } from './helpers';

const DEVICE = { platform: 'ios', osVersion: '27.2', deviceModel: null };
const EYE: V3 = [0, 1.4, 0];

/** A short scan: the floor, the first wall, the ceiling skipped, one plane with many vertices. */
function scanned() {
  const clock = { t: 1_000_000 };
  const c = new ScanController({ now: () => clock.t });
  c.onTrackingUpdated(3, 1);
  c.onCameraTransformUpdate(aimedCamera(EYE, [0.5, 0, -1]));
  c.onAnchorFound(floorAnchor('floor', 0));
  const big = uprightAnchor(
    'door',
    { x: -1, z: -1.75 },
    { x: 0, z: -1.75 },
    {
      bottom: 0,
      top: 2,
      toward: { x: 0, z: 0 },
    },
  );
  c.onAnchorFound({
    ...big,
    vertices: Array.from({ length: 100 }, (_, i) => [i / 100, 0, 0]),
  });
  for (const target of [
    [-1, 0, -1.75],
    [1, 0, -1.75],
  ] as V3[]) {
    clock.t += 1000;
    c.onCameraTransformUpdate(aimedCamera(EYE, target));
    c.mark();
  }
  c.skipCeiling();
  clock.t += 1000;
  return c;
}

/** Every array in `v`, at any depth, that holds another array (Firestore refuses those). */
function nestedArrays(v: unknown, path = ''): string[] {
  if (Array.isArray(v)) {
    const own = v.some(Array.isArray) ? [path] : [];
    return [...own, ...v.flatMap((x, i) => nestedArrays(x, `${path}[${i}]`))];
  }
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, x]) => nestedArrays(x, `${path}.${k}`));
  }
  return [];
}

function undefinedValues(v: unknown, path = ''): string[] {
  if (v === undefined) return [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => undefinedValues(x, `${path}[${i}]`));
  if (v && typeof v === 'object') {
    return Object.entries(v).flatMap(([k, x]) => undefinedValues(x, `${path}.${k}`));
  }
  return [];
}

describe('the scan log', () => {
  it('says who, which app, which phone and how the scan ended', () => {
    const doc = buildScanLog(scanned().record(), 'alice', DEVICE, { outcome: 'abandoned' });
    expect(doc).toMatchObject({
      v: 1,
      ownerId: 'alice',
      app: { version: release.version, build: release.build },
      platform: 'ios',
      osVersion: '27.2',
      deviceModel: null,
      outcome: 'abandoned',
      roomId: null,
      step: 'walls',
      ceilingSkipped: true,
      ceiling: { height: 2.4384, source: 'default' },
      floor: { y: 0, planeId: 'floor', classification: 'None' },
      options: { eulerOrder: 'ZYX', centerSpace: 'world', useDetectedWalls: false },
    });
    expect(doc.durationMs).toBe(3000);
  });

  it('keeps the marks as camera rays with what they became', () => {
    const doc = buildScanLog(scanned().record(), 'alice', DEVICE, { outcome: 'abandoned' });
    expect(doc.marks).toEqual([
      expect.objectContaining({
        id: 'm1',
        role: 'first',
        edge: 'floor',
        t: 1000,
        origin: [0, 1.4, 0],
        point: [-1, -1.75],
        wall: 0,
      }),
      expect.objectContaining({ id: 'm2', role: 'first', point: [1, -1.75], wall: 0 }),
    ]);
    expect(doc.walls).toEqual([
      expect.objectContaining({ axis: 0, facing: 1, offset: -1.75, markIds: ['m1', 'm2'] }),
    ]);
  });

  it('keeps every plane, with at most 32 vertices, and the camera as one flat list', () => {
    const doc = buildScanLog(scanned().record(), 'alice', DEVICE, { outcome: 'abandoned' });
    const planes = doc.planes as { id: string; vertices: number[]; vertexCount: number }[];
    expect(planes.map((p) => p.id)).toEqual(['floor', 'door']);
    expect(planes[1]!.vertexCount).toBe(64);
    expect(planes[1]!.vertices).toHaveLength(LOGGED_VERTICES * 3);
    expect(doc.poseStride).toBe(POSE_STRIDE);
    expect((doc.poses as number[]).length % POSE_STRIDE).toBe(0);
  });

  it('can be stored in Firestore: no arrays in arrays, nothing undefined', () => {
    const doc = buildScanLog(scanned().record(), 'alice', DEVICE, {
      outcome: 'saved',
      roomId: 'r1',
      scaleFactor: 1.012,
    });
    expect(nestedArrays(doc)).toEqual([]);
    expect(undefinedValues(doc)).toEqual([]);
    expect(doc.scaleFactor).toBe(1.012);
    expect(scanLogSize(doc)).toBeLessThan(40_000);
  });

  it('is trimmed when too big: vertices first, then camera samples', () => {
    const doc = buildScanLog(scanned().record(), 'alice', DEVICE, { outcome: 'abandoned' });
    const huge = { ...doc, poses: Array.from({ length: 200_000 }, () => 1.2345) };
    expect(scanLogSize(huge)).toBeGreaterThan(SCAN_LOG_MAX_BYTES);
    const capped = capScanLog(huge);
    expect(scanLogSize(capped)).toBeLessThanOrEqual(SCAN_LOG_MAX_BYTES);
    expect(capped.trimmed).toBe(true);
    expect((capped.planes as { vertices: number[] }[]).every((p) => p.vertices.length === 0)).toBe(
      true,
    );
    expect(capScanLog(doc)).toBe(doc);
  });

  it('is written once per scan, and a failing write never reaches the app', () => {
    const write = vi.fn();
    const logger = new ScanLogger(write, 'alice', DEVICE);
    const record = scanned().record();
    logger.finish(record, { outcome: 'saved', roomId: 'r1' });
    logger.finish(record, { outcome: 'abandoned' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toMatchObject({ outcome: 'saved', roomId: 'r1' });
    expect(logger.done).toBe(true);
    const broken = new ScanLogger(
      () => {
        throw new Error('offline');
      },
      'alice',
      DEVICE,
    );
    expect(() => broken.finish(record, { outcome: 'failed', failure: 'x' })).not.toThrow();
  });
});
