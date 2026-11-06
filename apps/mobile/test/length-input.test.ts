import { DEFAULT_CEILING_HEIGHT, METERS_PER_FOOT, METERS_PER_INCH } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  formatLengthInput,
  parseCeilingHeightInput,
  parseOpeningSizeInput,
  parseWallLengthInput,
} from '@/lib/length-input';

const meters = (text: string, units: 'imperial' | 'metric' = 'imperial') => {
  const r = parseCeilingHeightInput(text, units);
  return r.ok ? r.meters : null;
};

describe('formatLengthInput', () => {
  it('offers 8 ft by default in a form the keyboard can edit', () => {
    expect(formatLengthInput(DEFAULT_CEILING_HEIGHT, 'imperial')).toBe(`8' 0"`);
    expect(formatLengthInput(DEFAULT_CEILING_HEIGHT, 'metric')).toBe('2.44 m');
    expect(formatLengthInput(2.5908, 'imperial')).toBe(`8' 6"`);
  });

  it('reads back what it writes', () => {
    for (let inches = 72; inches <= 230; inches += 7) {
      const m = inches * METERS_PER_INCH;
      expect(meters(formatLengthInput(m, 'imperial'))).toBeCloseTo(m, 6);
      expect(meters(formatLengthInput(m, 'metric'), 'metric')).toBeCloseTo(m, 2);
    }
  });
});

describe('parseCeilingHeightInput', () => {
  it('reads feet and inches, metres and centimetres', () => {
    expect(meters(`8' 6"`)).toBeCloseTo(8.5 * METERS_PER_FOOT);
    expect(meters('8′ 6″')).toBeCloseTo(8.5 * METERS_PER_FOOT);
    expect(meters('8 6')).toBeCloseTo(8.5 * METERS_PER_FOOT);
    expect(meters('9 ft')).toBeCloseTo(9 * METERS_PER_FOOT);
    expect(meters('2.6 m')).toBeCloseTo(2.6);
    expect(meters('260 cm')).toBeCloseTo(2.6);
  });

  it('uses the chosen units for a bare number', () => {
    expect(meters('9')).toBeCloseTo(9 * METERS_PER_FOOT);
    expect(meters('2.7', 'metric')).toBeCloseTo(2.7);
  });

  it('explains what is wrong', () => {
    const fail = (text: string, units: 'imperial' | 'metric' = 'imperial') => {
      const r = parseCeilingHeightInput(text, units);
      return r.ok ? null : r.message;
    };
    expect(fail('  ')).toMatch(/^Type the ceiling height, for example 8' 6"/);
    expect(fail('', 'metric')).toMatch(/for example 2\.6 m/);
    expect(fail('tall')).toMatch(/^That is not a length/);
    expect(fail(`4'`)).toBe('That is lower than a room ceiling. Type at least 5′ 11″.');
    expect(fail('25 ft')).toBe('That is higher than the app can show. Type at most 19′ 8″.');
    expect(fail('7 m', 'metric')).toBe(
      'That is higher than the app can show. Type at most 6.00 m.',
    );
  });
});

describe('parseWallLengthInput', () => {
  const wall = (text: string, units: 'imperial' | 'metric' = 'imperial') => {
    const r = parseWallLengthInput(text, units);
    return r.ok ? r.meters : r.message;
  };

  it('reads feet and inches or metres, whatever the units', () => {
    expect(wall(`12' 4"`)).toBeCloseTo(12 * METERS_PER_FOOT + 4 * METERS_PER_INCH);
    expect(wall('12 4')).toBeCloseTo(12 * METERS_PER_FOOT + 4 * METERS_PER_INCH);
    expect(wall('3.76 m')).toBeCloseTo(3.76);
    expect(wall('3.76', 'metric')).toBeCloseTo(3.76);
    expect(wall(`12'`, 'metric')).toBeCloseTo(12 * METERS_PER_FOOT);
  });

  it('refuses lengths no wall can have', () => {
    expect(wall('3 in')).toBe('That is shorter than a wall. Type at least 0′ 8″.');
    expect(wall('0.1', 'metric')).toBe('That is shorter than a wall. Type at least 0.20 m.');
    expect(wall('40 m')).toBe('That is longer than the app can draw. Type at most 98′ 5″.');
    expect(wall('')).toMatch(/^Type the wall length, for example 12' 6"/);
    expect(wall('long')).toMatch(/^That is not a length/);
  });
});

describe('parseOpeningSizeInput', () => {
  it('reads sizes and allows a sill at the floor', () => {
    const r = parseOpeningSizeInput(`2' 11"`, 'imperial', 'width');
    expect(r.ok && r.meters).toBeCloseTo(35 * METERS_PER_INCH);
    const sill = parseOpeningSizeInput('0', 'metric', 'sill');
    expect(sill.ok && sill.meters).toBe(0);
    const small = parseOpeningSizeInput('10 cm', 'metric', 'height');
    expect(!small.ok && small.message).toBe('That is too short. Type at least 0.20 m.');
  });
});
