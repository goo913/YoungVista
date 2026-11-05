import type {
  CatalogCategory,
  CatalogLicense,
  CatalogPlacement,
} from '../../../packages/core/src/catalog.ts';

/** Where a model comes from. `id` is the ABO 3D model id, the Poly Haven slug or the Khronos folder. */
export type SourceRef =
  { kind: 'abo'; id: string } | { kind: 'polyhaven'; id: string } | { kind: 'khronos'; id: string };

/** A colour option with its own GLB. */
export interface VariantSpec {
  /** Stable id, saved in designs. Kebab-case. */
  id: string;
  name: string;
  /** Another source model of the same product in another colour (ABO), or a KHR_materials_variants name. */
  from: { abo: string } | { khrVariant: string };
}

export interface ModelSpec {
  /** Stable catalog id (saved in designs as `productId`). Kebab-case, never reused. */
  id: string;
  /** Neutral display name: no brand or product-line names. */
  name: string;
  category: CatalogCategory;
  placement: CatalogPlacement;
  source: SourceRef;
  /** 1 = the first 15 (fully verified first), 2 = the growth to about 40. */
  phase: 1 | 2;
  /** How the front (+Z) was determined. Written to credits.json. */
  front: string;
  /** Turn the source about +Y by this many degrees (counter-clockwise seen from above) first. */
  rotateY?: number;
  /** The item's own look when it has variants: listed first, uses the item's model and thumb. */
  baseVariant?: { id: string; name: string; khrVariant?: string };
  variants?: VariantSpec[];
  /** Explicit real dimensions in metres, when the source metadata cannot be used. */
  dims?: { w: number; d: number; h: number; source: string };
  /** Largest stretch allowed between the source's own size and the listed size, per axis. Default 0.05. */
  maxStretch?: number;
  maxTriangles?: number;
  maxTexture?: number;
}

/** A downloaded source with the facts needed for credits and sizing. */
export interface SourceInfo {
  /** Local .glb or .gltf file. */
  file: string;
  /** Original title at the source. */
  title: string;
  author: string;
  /** Library or dataset name, e.g. "Amazon Berkeley Objects". */
  library: string;
  license: CatalogLicense;
  licenseUrl: string;
  /** Attribution shown on the credits screen. */
  credit: string;
  /** Page (or file) the model came from. */
  sourceUrl: string;
  /** Copyright line, when the source gives one. */
  copyright?: string;
  /** Real dimensions as three values in metres, in any axis order, with where they came from. */
  listed?: { values: [number, number, number]; text: string; source: string };
  /** The source states that the model itself is at real-world scale. */
  realScaleNote?: string;
}

/** Facts about one written GLB, kept in .cache/build so partial runs can rebuild catalog.json. */
export interface GlbRecord {
  file: string;
  bytes: number;
  triangles: number;
  swatch: string;
  notes: string[];
}

export interface BuildRecord {
  id: string;
  dims: { w: number; d: number; h: number };
  dimsSource: string;
  front: string;
  /** Result of the automatic back check (seats and beds). */
  frontCheck?: string;
  source: Omit<SourceInfo, 'file' | 'listed' | 'realScaleNote'>;
  main: GlbRecord;
  variants: (GlbRecord & { id: string; name: string; sourceUrl?: string; title?: string })[];
  baseVariant?: { id: string; name: string };
}
