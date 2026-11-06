/**
 * Typed lengths: the ceiling height after a scan, and wall lengths, door and window sizes and the
 * ceiling height in the room editor. Feet and inches or metres both work, through core's
 * `parseLength`; a bare number uses the chosen units.
 */
import {
  DEFAULT_MIN_WALL_LENGTH,
  formatLength,
  METERS_PER_INCH,
  MIN_OPENING_SIZE,
  parseLength,
  type UnitSystem,
} from '@youngvista/core';

/** Lowest and highest ceiling the app accepts (m): about 5′ 11″ to 19′ 8″. */
export const CEILING_MIN = 1.8;
export const CEILING_MAX = 6;

/** Longest wall the editor accepts (m), about 98 ft. */
export const WALL_MAX = 30;

/** Largest door, window or opening (m), about 32 ft. */
export const OPENING_MAX = 10;

/**
 * A length as text that is easy to edit on a phone keyboard and that `parseLength` reads back:
 * `8' 0"` or `2.44 m`.
 */
export function formatLengthInput(meters: number, units: UnitSystem): string {
  if (units === 'metric') return `${meters.toFixed(2)} m`;
  const inches = Math.round(meters / METERS_PER_INCH);
  return `${Math.floor(inches / 12)}' ${inches % 12}"`;
}

export type LengthInputResult = { ok: true; meters: number } | { ok: false; message: string };

export interface LengthLimits {
  /** What is being typed, for the messages: "the ceiling height", "the wall length". */
  what: string;
  min: number;
  max: number;
  /** Message when the value is below `min`. Default: "That is too short. Type at least …". */
  tooLow?: string;
  /** Message when the value is above `max`. Default: "That is too long. Type at most …". */
  tooHigh?: string;
  /** Example values for the hints, per unit system. */
  example?: Record<UnitSystem, string>;
}

const DEFAULT_EXAMPLE: Record<UnitSystem, string> = {
  imperial: `12' 6" (or 3.8 m)`,
  metric: `3.8 m (or 12' 6")`,
};

/** Reads a length the user typed and checks it against `limits`. */
export function parseLengthInput(
  text: string,
  units: UnitSystem,
  limits: LengthLimits,
): LengthInputResult {
  const example = (limits.example ?? DEFAULT_EXAMPLE)[units];
  if (!text.trim()) return { ok: false, message: `Type ${limits.what}, for example ${example}.` };
  const meters = parseLength(text, units);
  if (meters === null || !Number.isFinite(meters)) {
    return { ok: false, message: `That is not a length. Try ${example}.` };
  }
  if (meters < limits.min - 1e-9) {
    const prefix = limits.tooLow ?? 'That is too short.';
    return { ok: false, message: `${prefix} Type at least ${formatLength(limits.min, units)}.` };
  }
  if (meters > limits.max + 1e-9) {
    const prefix = limits.tooHigh ?? 'That is too long.';
    return { ok: false, message: `${prefix} Type at most ${formatLength(limits.max, units)}.` };
  }
  return { ok: true, meters };
}

/** Reads the ceiling height the user typed. A bare number uses the chosen units. */
export function parseCeilingHeightInput(text: string, units: UnitSystem): LengthInputResult {
  return parseLengthInput(text, units, {
    what: 'the ceiling height',
    min: CEILING_MIN,
    max: CEILING_MAX,
    tooLow: 'That is lower than a room ceiling.',
    tooHigh: 'That is higher than the app can show.',
    example: { imperial: `8' 6" (or 2.6 m)`, metric: `2.6 m (or 8' 6")` },
  });
}

/** Reads a wall length typed in the room editor. */
export function parseWallLengthInput(text: string, units: UnitSystem): LengthInputResult {
  return parseLengthInput(text, units, {
    what: 'the wall length',
    min: DEFAULT_MIN_WALL_LENGTH,
    max: WALL_MAX,
    tooLow: 'That is shorter than a wall.',
    tooHigh: 'That is longer than the app can draw.',
  });
}

/** Reads a door or window width, height or sill typed in the room editor. */
export function parseOpeningSizeInput(
  text: string,
  units: UnitSystem,
  what: 'width' | 'height' | 'sill',
): LengthInputResult {
  return parseLengthInput(text, units, {
    what: what === 'sill' ? 'the height of the sill' : `the ${what}`,
    min: what === 'sill' ? 0 : MIN_OPENING_SIZE,
    max: OPENING_MAX,
    example: { imperial: `3' 0" (or 0.9 m)`, metric: `0.9 m (or 3' 0")` },
  });
}
