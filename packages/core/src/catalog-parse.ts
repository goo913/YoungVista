import {
  CATALOG_CATEGORIES,
  type Catalog,
  type CatalogCategory,
  type CatalogItem,
  type CatalogLicense,
  type CatalogPlacement,
  type CatalogVariant,
} from './catalog';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isPositive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const CATEGORY_IDS = new Set<string>(CATALOG_CATEGORIES.map((c) => c.id));
const PLACEMENTS = new Set<string>(['floor', 'wall', 'tabletop']);

function parseVariant(v: unknown): CatalogVariant | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const variant: CatalogVariant = { id: v.id, name: str(v.name) || v.id };
  if (typeof v.swatch === 'string') variant.swatch = v.swatch;
  if (typeof v.model === 'string' && v.model) variant.model = v.model;
  if (typeof v.thumb === 'string' && v.thumb) variant.thumb = v.thumb;
  return variant;
}

function parseItem(v: unknown): CatalogItem | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || typeof v.model !== 'string') return null;
  const d = v.dimensions;
  if (!isObj(d) || !isPositive(d.w) || !isPositive(d.d) || !isPositive(d.h)) return null;
  return {
    id: v.id,
    name: str(v.name) || v.id,
    category: (CATEGORY_IDS.has(str(v.category)) ? v.category : 'cabinet') as CatalogCategory,
    dimensions: { w: d.w, d: d.d, h: d.h },
    placement: (PLACEMENTS.has(str(v.placement)) ? v.placement : 'floor') as CatalogPlacement,
    variants: Array.isArray(v.variants)
      ? v.variants.map(parseVariant).filter((x): x is CatalogVariant => x !== null)
      : [],
    // An unknown licence is shown as CC BY (credit the source) rather than claimed public domain.
    license: (v.license === 'CC0-1.0' ? 'CC0-1.0' : 'CC-BY-4.0') as CatalogLicense,
    credit: str(v.credit),
    sourceUrl: str(v.sourceUrl),
    model: v.model,
    thumb: str(v.thumb),
  };
}

/**
 * Reads `catalog.json` tolerantly, for the app and the website: items without an id, a model or
 * positive dimensions are left out, and unknown categories, placements or licences fall back to
 * defaults. Null if the data is not a catalog at all.
 */
export function parseCatalog(data: unknown): Catalog | null {
  if (!isObj(data) || !Array.isArray(data.items)) return null;
  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  for (const raw of data.items) {
    const item = parseItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return { version: 1, items };
}
