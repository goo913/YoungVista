/**
 * Furniture catalog types. The catalog is `catalog.json` plus `models/*.glb` and `thumbs/*`,
 * served from Firebase Hosting under `/catalog/`. Paths in an item are relative to `/catalog/`.
 *
 * Models are GLB in metres, origin at the centre of the footprint on the floor, front facing +Z,
 * always true size.
 */

/** The 19 starter categories from the research starter set. */
export const CATALOG_CATEGORIES = [
  { id: 'sofa', label: 'Sofas' },
  { id: 'sectional', label: 'Sectionals' },
  { id: 'armchair', label: 'Armchairs' },
  { id: 'bed', label: 'Beds' },
  { id: 'nightstand', label: 'Nightstands' },
  { id: 'dresser', label: 'Dressers' },
  { id: 'wardrobe', label: 'Wardrobes' },
  { id: 'cabinet', label: 'Cabinets' },
  { id: 'sideboard', label: 'Sideboards' },
  { id: 'bookcase', label: 'Bookcases' },
  { id: 'tv-stand', label: 'TV stands' },
  { id: 'dining-table', label: 'Dining tables' },
  { id: 'coffee-table', label: 'Coffee tables' },
  { id: 'desk', label: 'Desks' },
  { id: 'dining-chair', label: 'Dining chairs' },
  { id: 'office-chair', label: 'Office chairs' },
  { id: 'rug', label: 'Rugs' },
  { id: 'floor-lamp', label: 'Floor lamps' },
  { id: 'plant', label: 'Plants' },
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number]['id'];

/** Where an item can go: on the floor, hung on a wall, or on top of another item. */
export type CatalogPlacement = 'floor' | 'wall' | 'tabletop';

/** SPDX licence id of the model. */
export type CatalogLicense = 'CC0-1.0' | 'CC-BY-4.0';

/** True-size bounding box in metres: width (X), depth (Z), height (Y). */
export interface CatalogDimensions {
  w: number;
  d: number;
  h: number;
}

/** A colour or material option. `model` and `thumb` override the item's when the variant has its own files. */
export interface CatalogVariant {
  id: string;
  name: string;
  /** CSS colour for the swatch, e.g. `#6b5b4b`. */
  swatch?: string;
  model?: string;
  thumb?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  dimensions: CatalogDimensions;
  placement: CatalogPlacement;
  variants: CatalogVariant[];
  license: CatalogLicense;
  /** Attribution to show on the credits screen, e.g. "Amazon.com" or "Wayfair". */
  credit: string;
  /** Page the model came from. */
  sourceUrl: string;
  /** GLB path relative to `/catalog/`, e.g. `models/sofa-midtown.glb`. */
  model: string;
  /** Thumbnail path relative to `/catalog/`, e.g. `thumbs/sofa-midtown.webp`. */
  thumb: string;
}

/** Shape of `catalog.json`. */
export interface Catalog {
  version: 1;
  items: CatalogItem[];
}
