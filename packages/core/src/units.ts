import type { UnitSystem } from './types';

export const METERS_PER_INCH = 0.0254;
export const METERS_PER_FOOT = 0.3048;
export const SQUARE_FEET_PER_SQUARE_METER = 1 / (METERS_PER_FOOT * METERS_PER_FOOT);

const PRIME = '′'; // ′
const DOUBLE_PRIME = '″'; // ″

/** Formats metres as feet and whole inches, e.g. 3.76 → `12′ 4″`. */
export function formatFeetInches(meters: number): string {
  if (!Number.isFinite(meters)) return '–';
  const totalInches = Math.round(Math.abs(meters) / METERS_PER_INCH);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const sign = meters < 0 && totalInches > 0 ? '-' : '';
  return `${sign}${feet}${PRIME} ${inches}${DOUBLE_PRIME}`;
}

/** Formats metres with a fixed number of decimals, e.g. 3.76 → `3.76 m`. */
export function formatMeters(meters: number, decimals = 2): string {
  if (!Number.isFinite(meters)) return '–';
  const v = meters.toFixed(decimals);
  return `${v === `-${(0).toFixed(decimals)}` ? (0).toFixed(decimals) : v} m`;
}

/** Formats a length for the chosen unit system (feet and inches, or metres). */
export function formatLength(meters: number, units: UnitSystem): string {
  return units === 'metric' ? formatMeters(meters) : formatFeetInches(meters);
}

/** Formats an area given in m², e.g. `12.3 m²` or `132 sq ft`. */
export function formatArea(squareMeters: number, units: UnitSystem): string {
  if (!Number.isFinite(squareMeters)) return '–';
  if (units === 'metric') return `${squareMeters.toFixed(1)} m²`;
  // Thousands separators by hand: core must not depend on Intl support in the JS engine.
  const sqft = String(Math.round(squareMeters * SQUARE_FEET_PER_SQUARE_METER));
  return `${sqft.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} sq ft`;
}

const NUM = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const FRAC = String.raw`(?:\d+/\d+)`;
// Inches: "4", "4.5", "4 1/2" or "1/2".
const INCHES = String.raw`(?:${NUM}(?:\s+${FRAC})?|${FRAC})`;

const METRIC_RE = new RegExp(String.raw`^(${NUM})\s*(mm|cm|m)$`);
const FEET_INCHES_RE = new RegExp(String.raw`^(${NUM})\s*'\s*(?:(${INCHES})\s*"?)?$`);
const INCHES_RE = new RegExp(String.raw`^(${INCHES})\s*"$`);
const DASH_RE = new RegExp(String.raw`^(\d+)\s*-\s*(${INCHES})$`);
const BARE_RE = new RegExp(String.raw`^(${NUM})(?:\s+(${INCHES}))?$`);

function parseInches(s: string): number {
  const parts = s.trim().split(/\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes('/')) {
      const [n, d] = part.split('/').map(Number);
      if (!d) return NaN;
      total += n! / d;
    } else {
      total += Number(part);
    }
  }
  return total;
}

/**
 * Parses a typed length into metres. Accepts metric (`3.76 m`, `376 cm`, `3760 mm`, `3,76 m`)
 * and imperial (`12′ 4″`, `12' 4"`, `12 ft 4 in`, `12'4`, `12-4`, `148"`, `4 1/2 in`, `12.5 ft`).
 * A bare number uses `defaultUnits`: metres for 'metric', feet (optionally followed by inches,
 * `12 4`) for 'imperial'. Returns null when the text is not a length.
 */
export function parseLength(input: string, defaultUnits: UnitSystem = 'imperial'): number | null {
  if (typeof input !== 'string') return null;
  let s = input
    .trim()
    .toLowerCase()
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/''/g, '"')
    .replace(/½/g, ' 1/2')
    .replace(/¼/g, ' 1/4')
    .replace(/¾/g, ' 3/4')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(?<![a-z])(?:feet|foot|ft)(?![a-z])\.?/g, "'")
    .replace(/(?<![a-z])(?:inches|inch|in)(?![a-z])\.?/g, '"')
    .replace(/(?<![a-z])millimet(?:er|re)s?(?![a-z])/g, 'mm')
    .replace(/(?<![a-z])centimet(?:er|re)s?(?![a-z])/g, 'cm')
    .replace(/(?<![a-z])met(?:er|re)s?(?![a-z])/g, 'm')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  // "12' 4"" may arrive with spaces around the marks after the word replacements.
  s = s.replace(/\s+(['"])/g, '$1');

  let m = METRIC_RE.exec(s);
  if (m) {
    const v = Number(m[1]);
    const unit = m[2];
    return unit === 'mm' ? v / 1000 : unit === 'cm' ? v / 100 : v;
  }
  m = FEET_INCHES_RE.exec(s);
  if (m) {
    const feet = Number(m[1]);
    const inches = m[2] ? parseInches(m[2]) : 0;
    return Number.isFinite(inches) ? feet * METERS_PER_FOOT + inches * METERS_PER_INCH : null;
  }
  m = INCHES_RE.exec(s);
  if (m) {
    const inches = parseInches(m[1]!);
    return Number.isFinite(inches) ? inches * METERS_PER_INCH : null;
  }
  m = DASH_RE.exec(s);
  if (m) {
    const inches = parseInches(m[2]!);
    return Number.isFinite(inches)
      ? Number(m[1]) * METERS_PER_FOOT + inches * METERS_PER_INCH
      : null;
  }
  m = BARE_RE.exec(s);
  if (m) {
    const first = Number(m[1]);
    if (defaultUnits === 'metric') return m[2] ? null : first;
    const inches = m[2] ? parseInches(m[2]) : 0;
    return Number.isFinite(inches) ? first * METERS_PER_FOOT + inches * METERS_PER_INCH : null;
  }
  return null;
}
