/**
 * Typed lengths in the scan flow: the ceiling height step accepts feet and inches or metres
 * through core's `parseLength`.
 */
import { formatLength, METERS_PER_INCH, parseLength, type UnitSystem } from '@youngvista/core';

/** Lowest and highest ceiling the app accepts (m): about 5′ 11″ to 19′ 8″. */
export const CEILING_MIN = 1.8;
export const CEILING_MAX = 6;

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

const EXAMPLE: Record<UnitSystem, string> = {
  imperial: `8' 6" (or 2.6 m)`,
  metric: `2.6 m (or 8' 6")`,
};

/** Reads the ceiling height the user typed. A bare number uses the chosen units. */
export function parseCeilingHeightInput(text: string, units: UnitSystem): LengthInputResult {
  if (!text.trim()) {
    return { ok: false, message: `Type the ceiling height, for example ${EXAMPLE[units]}.` };
  }
  const meters = parseLength(text, units);
  if (meters === null || !Number.isFinite(meters)) {
    return { ok: false, message: `That is not a length. Try ${EXAMPLE[units]}.` };
  }
  if (meters < CEILING_MIN) {
    return {
      ok: false,
      message: `That is lower than a room ceiling. Type at least ${formatLength(CEILING_MIN, units)}.`,
    };
  }
  if (meters > CEILING_MAX) {
    return {
      ok: false,
      message: `That is higher than the app can show. Type at most ${formatLength(CEILING_MAX, units)}.`,
    };
  }
  return { ok: true, meters };
}
