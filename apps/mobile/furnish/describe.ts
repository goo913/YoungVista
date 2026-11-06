/**
 * Plain words for furniture: sizes in feet and inches or metres, and why a spot is not allowed.
 */
import {
  formatLength,
  type CatalogDimensions,
  type PlacementIssue,
  type UnitSystem,
} from '@youngvista/core';
import type { DesignNotice } from './design-state';

/** "Charcoal sofa" → "charcoal sofa", for use inside a sentence ("TV stand" stays as it is). */
export function inSentence(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;
}

/** `7′ 8″ W × 3′ 1″ D × 2′ 7″ H` or `2.34 × 0.94 × 0.80 m` (width × depth × height). */
export function formatSize(d: CatalogDimensions, units: UnitSystem): string {
  if (units === 'metric') return `${d.w.toFixed(2)} × ${d.d.toFixed(2)} × ${d.h.toFixed(2)} m`;
  return `${formatLength(d.w, units)} W × ${formatLength(d.d, units)} D × ${formatLength(d.h, units)} H`;
}

export interface PlacementProblem {
  reasons: readonly PlacementIssue[];
  overlaps: readonly string[];
}

/**
 * What is wrong with a spot, as a short phrase without a full stop: "Overlaps the charcoal sofa",
 * "Sticks out of the room", "Overlaps 2 pieces". Null when nothing is wrong.
 */
export function placementProblem(
  problem: PlacementProblem,
  nameOf: (itemId: string) => string,
): string | null {
  const parts: string[] = [];
  if (problem.reasons.includes('unknown-product')) return 'This piece is not in the catalog';
  if (problem.reasons.includes('outside-room')) parts.push('sticks out of the room');
  if (problem.reasons.includes('overlaps')) {
    parts.push(
      problem.overlaps.length === 1
        ? `overlaps the ${inSentence(nameOf(problem.overlaps[0]!))}`
        : `overlaps ${problem.overlaps.length} pieces`,
    );
  }
  if (!parts.length) return null;
  const text = parts.join(' and ');
  return text[0]!.toUpperCase() + text.slice(1);
}

/**
 * The message for a notice. `nameOf` names a placed item, `productName` a catalog product.
 */
export function noticeText(
  notice: DesignNotice,
  nameOf: (itemId: string) => string,
  productName: (productId: string) => string,
): string {
  switch (notice.kind) {
    case 'refused': {
      const why = placementProblem(notice, nameOf);
      return why ? `${why}, so it went back.` : 'That spot is not free, so it went back.';
    }
    case 'no-space':
      return `There is no free space for the ${inSentence(productName(notice.productId))}. Move or remove something first.`;
    case 'removed':
      return `Removed the ${inSentence(productName(notice.item.productId))}.`;
  }
}
