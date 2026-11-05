import {
  METERS_PER_INCH,
  catalogVariant,
  frontDirection,
  isFlatProduct,
  itemFootprint,
  type CatalogDimensions,
  type CatalogItem,
  type Design,
  type DesignItem,
  type Footprint,
  type UnitSystem,
  type Vec2,
} from '@youngvista/core';
import type { CatalogIndex } from './catalog';

/** A placed item with what the catalog knows about it. */
export interface FurnitureEntry {
  item: DesignItem;
  /** Null when the product is not in the catalog (or the catalog did not load). */
  product: CatalogItem | null;
  name: string;
  variantName: string | null;
  footprint: Footprint;
  front: Vec2;
  /** Rugs: drawn under everything else. */
  flat: boolean;
}

/** Size used for items whose product is unknown. */
const UNKNOWN_SIZE: CatalogDimensions = { w: 0.5, d: 0.5, h: 0.5 };

export function furnitureEntries(design: Design, catalog: CatalogIndex | null): FurnitureEntry[] {
  return design.items.map((item) => {
    const product = catalog?.byId.get(item.productId) ?? null;
    const dims = product?.dimensions ?? UNKNOWN_SIZE;
    return {
      item,
      product,
      name: product?.name ?? 'Unknown item',
      variantName: product ? (catalogVariant(product, item.variant)?.name ?? null) : null,
      footprint: itemFootprint(item, dims),
      front: frontDirection(item.rotationY),
      flat: product ? isFlatProduct(product) : false,
    };
  });
}

/** `84″ W × 38″ D × 33″ H` or `213 × 97 × 84 cm` (width × depth × height). */
export function formatDimensions(d: CatalogDimensions, units: UnitSystem): string {
  if (units === 'metric') {
    const cm = (m: number) => Math.round(m * 100);
    return `${cm(d.w)} × ${cm(d.d)} × ${cm(d.h)} cm`;
  }
  const inches = (m: number) => `${Math.round(m / METERS_PER_INCH)}″`;
  return `${inches(d.w)} W × ${inches(d.d)} D × ${inches(d.h)} H`;
}
