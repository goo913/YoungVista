/**
 * The furniture an AI picture shows, from the room's design and the catalog: one entry per
 * product and colour (with how many), biggest first, each with its product picture's address on
 * Hosting. The biggest ones get their product picture sent with the request (`numberImages`).
 */
import {
  CATALOG_BASE_URL,
  catalogThumbUrl,
  catalogVariant,
  type CatalogItem,
  type DesignItem,
} from '@youngvista/core';
import type { PromptPiece } from './prompts';

export interface PieceGroup extends PromptPiece {
  productId: string;
  variant: string | null;
  /** Its product picture on Hosting, or null. */
  thumbUrl: string | null;
}

/** The product's name, with the colour when the product comes in several. */
export function pieceName(product: CatalogItem, variantId: string | undefined): string {
  if (product.variants.length < 2) return product.name;
  const variant = catalogVariant(product, variantId) ?? product.variants[0];
  return variant ? `${product.name} (${variant.name})` : product.name;
}

/** Only addresses on the app's own Hosting are fetched (never one a catalog entry points to elsewhere). */
export function ownThumbUrl(url: string): string | null {
  return url.startsWith(CATALOG_BASE_URL) ? url : null;
}

/**
 * The design's pieces as groups, biggest first (by the space they take up). Pieces whose product
 * is not in the catalog are left out. No product picture is numbered yet (`image` is null).
 */
export function groupPieces(
  items: readonly DesignItem[],
  product: (productId: string) => CatalogItem | null,
): PieceGroup[] {
  const groups = new Map<string, PieceGroup>();
  for (const item of items) {
    const p = product(item.productId);
    if (!p) continue;
    const variant = catalogVariant(p, item.variant)?.id ?? null;
    const key = `${p.id}#${variant ?? ''}`;
    const known = groups.get(key);
    if (known) {
      known.count++;
      continue;
    }
    groups.set(key, {
      productId: p.id,
      variant,
      name: pieceName(p, item.variant),
      size: { w: p.dimensions.w, d: p.dimensions.d, h: p.dimensions.h },
      count: 1,
      image: null,
      thumbUrl: ownThumbUrl(catalogThumbUrl(p, item.variant)),
    });
  }
  const volume = (g: PieceGroup) => g.size.w * g.size.d * g.size.h;
  return [...groups.values()].sort((a, b) => volume(b) - volume(a) || a.name.localeCompare(b.name));
}

/** The groups that get a product picture: the first `max` that have one. */
export function referenceCandidates(groups: readonly PieceGroup[], max: number): PieceGroup[] {
  return groups.filter((g) => g.thumbUrl !== null).slice(0, Math.max(0, max));
}

/**
 * Numbers the product pictures that were fetched, in order, from image 2 (image 1 is the source).
 * `fetched` says, for each candidate, whether its picture arrived. Returns new groups.
 */
export function numberImages(
  groups: readonly PieceGroup[],
  candidates: readonly PieceGroup[],
  fetched: readonly boolean[],
): PieceGroup[] {
  const numbers = new Map<PieceGroup, number>();
  let next = 2;
  candidates.forEach((g, i) => {
    if (fetched[i]) numbers.set(g, next++);
  });
  return groups.map((g) => ({ ...g, image: numbers.get(g) ?? null }));
}
