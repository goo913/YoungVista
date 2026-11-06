import { describe, expect, it } from 'vitest';
import { floorPosition, headingDeg, rayFromCamera, turnToward, wrapDeg180 } from '@/scan/geometry';
import { pose } from './helpers';

describe('the camera ray', () => {
  it('starts at the camera and runs through the middle of the screen', () => {
    const p = pose([1, 1.4, 2], [0, -1, -1]);
    const ray = rayFromCamera(p);
    expect(ray.origin).toEqual([1, 1.4, 2]);
    expect(ray.direction[1]).toBeCloseTo(-Math.SQRT1_2);
    expect(floorPosition(p)).toEqual({ x: 1, z: 2 });
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

describe('turnToward', () => {
  it('turns left for positive angles (counter-clockwise seen from above)', () => {
    expect(turnToward(90, 180)).toBe('left');
    expect(turnToward(90, 0)).toBe('right');
    expect(turnToward(350, 10)).toBe('ahead');
    expect(turnToward(0, 170)).toBe('behind');
    expect(turnToward(0, -150)).toBe('behind');
  });
});
