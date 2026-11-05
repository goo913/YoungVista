import type { CatalogItem, CatalogVariant } from './catalog';

/** Where the catalog is served: Firebase Hosting, the same files for the app and the website. */
export const CATALOG_BASE_URL = 'https://young-vista.web.app/catalog/';

/**
 * Full URL of a catalog file from its path relative to `/catalog/` (as in `catalog.json`), e.g.
 * `models/sofa.glb` → `https://young-vista.web.app/catalog/models/sofa.glb`. The website passes
 * `'/catalog/'` as `base` to load from its own origin. Absolute URLs are returned unchanged.
 */
export function catalogUrl(path: string, base: string = CATALOG_BASE_URL): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  const root = base.endsWith('/') ? base : `${base}/`;
  return root + path.replace(/^\/+/, '');
}

/** The item's variant with this id, if any. */
export function catalogVariant(
  item: Pick<CatalogItem, 'variants'>,
  variantId: string | undefined,
): CatalogVariant | undefined {
  return variantId === undefined ? undefined : item.variants.find((v) => v.id === variantId);
}

/** URL of the item's GLB, using the variant's own model when it has one. */
export function catalogModelUrl(
  item: Pick<CatalogItem, 'model' | 'variants'>,
  variantId?: string,
  base: string = CATALOG_BASE_URL,
): string {
  return catalogUrl(catalogVariant(item, variantId)?.model ?? item.model, base);
}

/** URL of the item's thumbnail, using the variant's own thumbnail when it has one. */
export function catalogThumbUrl(
  item: Pick<CatalogItem, 'thumb' | 'variants'>,
  variantId?: string,
  base: string = CATALOG_BASE_URL,
): string {
  return catalogUrl(catalogVariant(item, variantId)?.thumb ?? item.thumb, base);
}
