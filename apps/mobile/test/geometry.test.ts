import { coverage, wallFromTaps } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { headingDeg, intersectFloor, turnHint, wrapDeg180 } from '@/scan/geometry';
import { pose } from './helpers';

describe('intersectFloor', () => {
  it('finds where the ray through the screen centre meets the floor', () => {
    const hit = intersectFloor({ origin: [0, 1.5, 0], direction: [0, -1, -1] }, 0);
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.point.x).toBeCloseTo(0);
    expect(hit.point.z).toBeCloseTo(-1.5);
    expect(hit.distance).toBeCloseTo(1.5);
  });

  it('works with a floor that is not at zero and an unnormalised direction', () => {
    const hit = intersectFloor({ origin: [2, 0.4, 1], direction: [3, -4, 0] }, -0.8);
    expect(hit.ok && hit.point.x).toBeCloseTo(2 + 0.9);
    expect(hit.ok && hit.point.z).toBeCloseTo(1);
  });

  it('asks to aim lower at or above the horizon', () => {
    expect(intersectFloor({ origin: [0, 1.5, 0], direction: [0, 0.3, -1] }, 0)).toEqual({
      ok: false,
      reason: 'aim-lower',
    });
    expect(intersectFloor({ origin: [0, 1.5, 0], direction: [0, 0, -1] }, 0)).toEqual({
      ok: false,
      reason: 'aim-lower',
    });
  });

  it('refuses points too far along the floor', () => {
    expect(intersectFloor({ origin: [0, 1.5, 0], direction: [0, -0.1, -1] }, 0)).toEqual({
      ok: false,
      reason: 'too-far',
    });
  });
});

describe('headingDeg', () => {
  it('uses core angles: +X is 0, -Z is 90, -X is 180, +Z is 270', () => {
    expect(headingDeg(pose([0, 1, 0], [1, 0, 0]))).toBeCloseTo(0);
    expect(headingDeg(pose([0, 1, 0], [0, 0, -1]))).toBeCloseTo(90);
    expect(headingDeg(pose([0, 1, 0], [-1, -0.5, 0]))).toBeCloseTo(180);
    expect(headingDeg(pose([0, 1, 0], [0, 0, 1]))).toBeCloseTo(270);
  });

  it('uses the top of the phone when looking straight down', () => {
    expect(headingDeg(pose([0, 1, 0], [0, -1, 0], [0, 0, -1]))).toBeCloseTo(90);
    expect(headingDeg(pose([0, 1, 0], [0.05, -1, 0], [-1, 0.05, 0]))).toBeCloseTo(180);
  });
});

describe('wrapDeg180', () => {
  it('wraps to (-180, 180]', () => {
    expect(wrapDeg180(190)).toBeCloseTo(-170);
    expect(wrapDeg180(-190)).toBeCloseTo(170);
    expect(wrapDeg180(540)).toBeCloseTo(180);
    expect(wrapDeg180(-180)).toBeCloseTo(180);
    expect(wrapDeg180(45)).toBeCloseTo(45);
  });
});

describe('turnHint', () => {
  // One wall to the north (-Z) of the phone: everything else is a gap centred on the south.
  const north = wallFromTaps({ x: -1.8, z: -2 }, { x: 1.8, z: -2 }, 'n');
  const cover = coverage([north], { center: { x: 0, z: 0 } });

  it('says which way to turn toward the biggest gap', () => {
    // Positive angles turn left (counter-clockwise seen from above).
    expect(turnHint(100, cover)?.direction).toBe('left');
    expect(turnHint(80, cover)?.direction).toBe('right');
    expect(turnHint(100, cover)?.text).toBe('Turn left to find the next wall');
  });

  it('says the next wall is ahead when facing the gap', () => {
    const hint = turnHint(270, cover);
    expect(hint?.direction).toBe('ahead');
    expect(hint?.degrees).toBe(0);
  });

  it('says nothing before the first wall, after the room closes, or without a heading', () => {
    expect(turnHint(90, coverage([], { center: { x: 0, z: 0 } }))).toBeNull();
    expect(turnHint(null, cover)).toBeNull();
    const closed = coverage(
      [
        wallFromTaps({ x: -1.8, z: -2 }, { x: 1.8, z: -2 }, 'n'),
        wallFromTaps({ x: -1.8, z: 2 }, { x: 1.8, z: 2 }, 's'),
        wallFromTaps({ x: -2, z: -1.8 }, { x: -2, z: 1.8 }, 'w'),
        wallFromTaps({ x: 2, z: -1.8 }, { x: 2, z: 1.8 }, 'e'),
      ],
      { center: { x: 0, z: 0 } },
    );
    expect(closed.closed).toBe(true);
    expect(turnHint(0, closed)).toBeNull();
  });
});
