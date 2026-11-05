import { describe, expect, it } from 'vitest';
import { formatArea, formatFeetInches, formatLength, formatMeters, parseLength } from '../src';

const FT = 0.3048;
const IN = 0.0254;

describe('formatFeetInches', () => {
  it('formats feet and whole inches with prime marks', () => {
    expect(formatFeetInches(3.76)).toBe('12′ 4″');
    expect(formatFeetInches(0)).toBe('0′ 0″');
    expect(formatFeetInches(FT)).toBe('1′ 0″');
    expect(formatFeetInches(8 * FT)).toBe('8′ 0″');
    expect(formatFeetInches(7 * IN)).toBe('0′ 7″');
  });

  it('carries 12 rounded inches into the feet', () => {
    expect(formatFeetInches(11.6 * IN)).toBe('1′ 0″');
    expect(formatFeetInches(5 * FT + 11.7 * IN)).toBe('6′ 0″');
  });

  it('handles negative and non-finite values', () => {
    expect(formatFeetInches(-3.76)).toBe('-12′ 4″');
    expect(formatFeetInches(-0.001)).toBe('0′ 0″');
    expect(formatFeetInches(Number.NaN)).toBe('–');
  });
});

describe('formatMeters', () => {
  it('formats metres with two decimals', () => {
    expect(formatMeters(3.76)).toBe('3.76 m');
    expect(formatMeters(3)).toBe('3.00 m');
    expect(formatMeters(0.456)).toBe('0.46 m');
    expect(formatMeters(3.756, 1)).toBe('3.8 m');
    expect(formatMeters(-0.001)).toBe('0.00 m');
    expect(formatMeters(Infinity)).toBe('–');
  });
});

describe('formatLength and formatArea', () => {
  it('follows the unit system', () => {
    expect(formatLength(3.76, 'imperial')).toBe('12′ 4″');
    expect(formatLength(3.76, 'metric')).toBe('3.76 m');
    expect(formatArea(12.345, 'metric')).toBe('12.3 m²');
    expect(formatArea(12.2645, 'imperial')).toBe('132 sq ft');
    expect(formatArea(200, 'imperial')).toBe('2,153 sq ft');
  });
});

describe('parseLength', () => {
  const cases: [string, number][] = [
    ['3.76 m', 3.76],
    ['3.76m', 3.76],
    ['3,76 m', 3.76],
    ['376 cm', 3.76],
    ['3760 mm', 3.76],
    ['2 metres', 2],
    ['2 meters', 2],
    ['45 centimeters', 0.45],
    ['12′ 4″', 12 * FT + 4 * IN],
    ['12\' 4"', 12 * FT + 4 * IN],
    ['12\'4"', 12 * FT + 4 * IN],
    ["12'4", 12 * FT + 4 * IN],
    ["12'", 12 * FT],
    ['12 ft 4 in', 12 * FT + 4 * IN],
    ['12ft4in', 12 * FT + 4 * IN],
    ['12 feet 4 inches', 12 * FT + 4 * IN],
    ['12 ft', 12 * FT],
    ['12.5 ft', 12.5 * FT],
    ['148"', 148 * IN],
    ['148 in', 148 * IN],
    ['4 1/2"', 4.5 * IN],
    ['1/2 in', 0.5 * IN],
    ['10\' 6 1/2"', 10 * FT + 6.5 * IN],
    ['10′ 6½″', 10 * FT + 6.5 * IN],
    ['12-4', 12 * FT + 4 * IN],
    ['  12 FT  ', 12 * FT],
    ["12''", 12 * IN],
  ];
  for (const [text, meters] of cases) {
    it(`reads "${text}"`, () => {
      expect(parseLength(text)).toBeCloseTo(meters, 9);
    });
  }

  it('reads a bare number in the default units', () => {
    expect(parseLength('12')).toBeCloseTo(12 * FT, 9);
    expect(parseLength('12 4')).toBeCloseTo(12 * FT + 4 * IN, 9);
    expect(parseLength('3.76', 'metric')).toBeCloseTo(3.76, 9);
    expect(parseLength('3 4', 'metric')).toBeNull();
  });

  it('reads back what formatFeetInches and formatMeters write', () => {
    for (const m of [0.25, 1, 2.4384, 3.76, 7.9]) {
      expect(parseLength(formatMeters(m))).toBeCloseTo(Math.round(m * 100) / 100, 9);
      expect(Math.abs(parseLength(formatFeetInches(m))! - m)).toBeLessThanOrEqual(IN / 2 + 1e-12);
    }
  });

  it('rejects text that is not a length', () => {
    for (const text of [
      '',
      '   ',
      'abc',
      '12 apples',
      '-3 m',
      '3 m 4',
      '1/0"',
      "'4",
      'm',
      '12 4 5',
    ]) {
      expect(parseLength(text), text).toBeNull();
    }
    expect(parseLength(undefined as unknown as string)).toBeNull();
  });
});
