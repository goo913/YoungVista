/**
 * The furniture catalog as the app uses it: an index by id, the picker's categories, the credits
 * list and file URLs. Plain TypeScript (no React Native), so it is unit tested.
 */
import {
  CATALOG_CATEGORIES,
  catalogModelUrl,
  catalogThumbUrl,
  catalogUrl,
  catalogVariant,
  parseCatalog,
  productLookup,
  type Catalog,
  type CatalogCategory,
  type CatalogItem,
  type CatalogLicense,
  type CatalogVariant,
  type ProductLookup,
} from '@youngvista/core';

/** `https://young-vista.web.app/catalog/catalog.json`: the same files the website uses. */
export const CATALOG_JSON_URL = catalogUrl('catalog.json');

export interface CatalogIndex {
  catalog: Catalog;
  byId: ReadonlyMap<string, CatalogItem>;
  product: ProductLookup;
}

export function indexCatalog(catalog: Catalog): CatalogIndex {
  return {
    catalog,
    byId: new Map(catalog.items.map((item) => [item.id, item])),
    product: productLookup(catalog),
  };
}

/** Reads `catalog.json` text. Null when it is not a catalog (or holds no items). */
export function catalogFromText(text: string): Catalog | null {
  try {
    const catalog = parseCatalog(JSON.parse(text));
    return catalog && catalog.items.length > 0 ? catalog : null;
  } catch {
    return null;
  }
}

export interface CategoryGroup {
  id: CatalogCategory;
  label: string;
  items: CatalogItem[];
}

/** The picker's categories in the catalog's order, leaving out empty ones. */
export function categoryGroups(catalog: Catalog): CategoryGroup[] {
  return CATALOG_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    items: catalog.items.filter((item) => item.category === c.id),
  })).filter((g) => g.items.length > 0);
}

/** The model of an item in a colour (variant-aware, from the catalog's server). */
export const modelUrl = (item: CatalogItem, variant?: string): string =>
  catalogModelUrl(item, variant);

/** The thumbnail of an item in a colour, or null when the item has none. */
export const thumbUrl = (item: CatalogItem, variant?: string): string | null =>
  item.thumb || catalogVariant(item, variant)?.thumb ? catalogThumbUrl(item, variant) : null;

/** Every model file the catalog uses (each item and each colour with its own model). */
export function allModelUrls(catalog: Catalog): string[] {
  const urls = new Set<string>();
  for (const item of catalog.items) {
    urls.add(modelUrl(item));
    for (const v of item.variants) urls.add(modelUrl(item, v.id));
  }
  return [...urls];
}

/**
 * The colour an item shows: its saved variant, else the first variant (the item's own look).
 * Null when the item has a single look.
 */
export function activeVariant(item: CatalogItem, variant?: string): CatalogVariant | null {
  return catalogVariant(item, variant) ?? item.variants[0] ?? null;
}

export const LICENSES: Record<CatalogLicense, { label: string; name: string; url: string }> = {
  'CC-BY-4.0': {
    label: 'CC BY 4.0',
    name: 'Creative Commons Attribution 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  'CC0-1.0': {
    label: 'CC0',
    name: 'Creative Commons Zero (public domain)',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
};

export interface CreditGroup {
  license: CatalogLicense;
  items: CatalogItem[];
}

/** The credits screen: models that must be credited (CC BY) first, then public domain (CC0). */
export function creditGroups(catalog: Catalog): CreditGroup[] {
  const order: CatalogLicense[] = ['CC-BY-4.0', 'CC0-1.0'];
  return order
    .map((license) => ({
      license,
      items: catalog.items
        .filter((item) => item.license === license)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);
}
