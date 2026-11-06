/**
 * A simulated scan: a person holding a phone in a room, sending ScanController the events
 * ViroReact would, and tapping Mark. Used to check the whole scan with realistic noise.
 */
import {
  ensureCounterClockwise,
  inwardNormal,
  wallLengths,
  type Point,
  type Room,
  type Vec2,
} from '@youngvista/core';
import { ScanController } from '@/scan/controller';
import type { ScanOptions } from '@/scan/session';
import { aimedCamera, floorAnchor, mulberry32, type V3 } from './helpers';

export interface SimRoom {
  /** Corners on the floor plan, any order (made counter-clockwise). */
  outline: Point[];
  ceiling: number;
  /** World height of the floor (ARKit's origin is where the phone started, so about -1.4). */
  floorY: number;
}

export interface SimNoise {
  /** Largest aim error per mark (degrees). */
  aimDeg: number;
  /** The floor plane is reported up to this far off (m). */
  floorError: number;
  /** The phone is held this high above the floor (m), anywhere in between for each mark. */
  eye: [number, number];
}

export const QUIET: SimNoise = { aimDeg: 0, floorError: 0, eye: [1.4, 1.4] };
export const REALISTIC: SimNoise = { aimDeg: 0.5, floorError: 0.02, eye: [1.25, 1.55] };

export class SimScan {
  readonly controller: ScanController;
  readonly room: SimRoom;
  readonly outline: Point[];
  readonly rand: () => number;
  readonly noise: SimNoise;
  /** The floor height the phone reports. */
  readonly reportedFloorY: number;
  private t = 0;

  constructor(room: SimRoom, noise: SimNoise, seed: number, options: Partial<ScanOptions> = {}) {
    this.room = room;
    this.outline = ensureCounterClockwise(room.outline);
    this.noise = noise;
    this.rand = mulberry32(seed);
    this.controller = new ScanController({ now: () => this.t, scan: options });
    this.reportedFloorY = room.floorY + (this.rand() * 2 - 1) * noise.floorError;
  }

  /** Tracking starts, the phone looks down at the floor and finds it. */
  start(at: Vec2): this {
    const c = this.controller;
    c.onTrackingUpdated(3, 1);
    c.onCameraTransformUpdate(
      aimedCamera(this.eyeAt(at), [at.x + 0.8, this.room.floorY, at.z], this.rand),
    );
    c.onAnchorFound(floorAnchor('floor', this.reportedFloorY, { x: at.x, z: at.z, size: 2.5 }));
    c.flush();
    return this;
  }

  /** The phone's position for a person standing at `at` (its height varies). */
  eyeAt(at: Vec2): V3 {
    const [lo, hi] = this.noise.eye;
    return [at.x, this.room.floorY + lo + (hi - lo) * this.rand(), at.z];
  }

  /** A point on wall `k`'s bottom ('floor') or top ('ceiling') edge, `s` of the way along it. */
  edgePoint(k: number, s: number, edge: 'floor' | 'ceiling'): V3 {
    const p = this.outline[k % this.outline.length]!;
    const q = this.outline[(k + 1) % this.outline.length]!;
    const y = edge === 'floor' ? this.room.floorY : this.room.floorY + this.room.ceiling;
    return [p[0] + (q[0] - p[0]) * s, y, p[1] + (q[1] - p[1]) * s];
  }

  /** Points the phone from `at` at `target` (with aim noise), as Viro would report it. */
  aim(at: Vec2 | V3, target: V3, errorDeg = this.noise.aimDeg): this {
    this.t += 700;
    const eye = Array.isArray(at) ? (at as V3) : this.eyeAt(at as Vec2);
    this.controller.onCameraTransformUpdate(aimedCamera(eye, target, this.rand, errorDeg));
    this.controller.flush();
    return this;
  }

  /** Aims and taps Mark. */
  mark(at: Vec2 | V3, target: V3, errorDeg = this.noise.aimDeg) {
    return this.aim(at, target, errorDeg).controller.mark();
  }

  /** Where a person stands to mark wall `k`: `back` metres in front of the spot `s` along it. */
  standBefore(k: number, s: number, back: number): Vec2 {
    const p = this.outline[k % this.outline.length]!;
    const q = this.outline[(k + 1) % this.outline.length]!;
    const a = { x: p[0], z: p[1] };
    const b = { x: q[0], z: q[1] };
    const n = inwardNormal(a, b);
    return { x: a.x + (b.x - a.x) * s + n.x * back, z: a.z + (b.z - a.z) * s + n.z * back };
  }

  /** The middle of the room's corners. */
  middle(): Vec2 {
    const n = this.outline.length;
    return {
      x: this.outline.reduce((s, p) => s + p[0], 0) / n,
      z: this.outline.reduce((s, p) => s + p[1], 0) / n,
    };
  }

  /** A spot within `r` metres of `p`. */
  jitter(p: Vec2, r: number): Vec2 {
    return { x: p.x + (this.rand() * 2 - 1) * r, z: p.z + (this.rand() * 2 - 1) * r };
  }
}

/** A rectangle `w` × `d` with its middle at (cx, cz), turned `yawDeg`. */
export function rotatedRectangle(w: number, d: number, cx: number, cz: number, yawDeg: number) {
  const r = (yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return (
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as Point[]
  ).map(([x, z]): Point => [cx + x * c - z * s, cz + x * s + z * c]);
}

/**
 * How far each true wall's line is from the scanned one (m): for each true wall, the scanned wall
 * most nearly parallel and closest, and the largest distance of its two ends from the true line.
 */
export function wallErrors(scanned: Room, truth: Point[]): number[] {
  const t = ensureCounterClockwise(truth);
  const walls = scanned.points.map((p, i) => [p, scanned.points[(i + 1) % scanned.points.length]!]);
  return t.map((p, k) => {
    const q = t[(k + 1) % t.length]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const dx = (q[0] - p[0]) / len;
    const dz = (q[1] - p[1]) / len;
    const off = (x: number, z: number) => Math.abs((x - p[0]) * -dz + (z - p[1]) * dx);
    let best = Infinity;
    for (const [a, b] of walls) {
      const ex = b![0] - a![0];
      const ez = b![1] - a![1];
      const parallel = Math.abs(ex * dz - ez * dx) / Math.hypot(ex, ez) < 0.2;
      if (!parallel) continue;
      best = Math.min(best, Math.max(off(a![0], a![1]), off(b![0], b![1])));
    }
    return best;
  });
}

/**
 * How far each true wall's middle is from the scanned wall's line (m): the wall's position,
 * without the small turn of the whole room that `wallErrors` also counts.
 */
export function wallOffsetErrors(scanned: Room, truth: Point[]): number[] {
  const t = ensureCounterClockwise(truth);
  const walls = scanned.points.map((p, i) => [p, scanned.points[(i + 1) % scanned.points.length]!]);
  return t.map((p, k) => {
    const q = t[(k + 1) % t.length]!;
    const mx = (p[0] + q[0]) / 2;
    const mz = (p[1] + q[1]) / 2;
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    let best = Infinity;
    for (const [a, b] of walls) {
      const ex = b![0] - a![0];
      const ez = b![1] - a![1];
      const l = Math.hypot(ex, ez);
      if (Math.abs(ex * dz - ez * dx) / (l * Math.hypot(dx, dz)) > 0.2) continue;
      best = Math.min(best, Math.abs((mx - a![0]) * -ez + (mz - a![1]) * ex) / l);
    }
    return best;
  });
}

/** Wall lengths, sorted, to compare rooms without caring where the outline starts. */
export const sortedLengths = (room: Room) => wallLengths(room).sort((p, q) => p - q);
