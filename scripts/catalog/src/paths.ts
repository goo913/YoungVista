import path from 'node:path';

/** scripts/catalog */
export const PIPELINE_DIR = path.resolve(import.meta.dirname, '..');
export const REPO_DIR = path.resolve(PIPELINE_DIR, '../..');

/** Downloads and per-model build records (gitignored). */
export const CACHE_DIR = path.join(PIPELINE_DIR, '.cache');
export const BUILD_CACHE_DIR = path.join(CACHE_DIR, 'build');

/** Published catalog, served from Firebase Hosting under /catalog/. */
export const OUT_DIR = path.join(REPO_DIR, 'apps/web/public/catalog');
export const MODELS_DIR = path.join(OUT_DIR, 'models');
export const THUMBS_DIR = path.join(OUT_DIR, 'thumbs');
export const CATALOG_JSON = path.join(OUT_DIR, 'catalog.json');
export const CREDITS_JSON = path.join(OUT_DIR, 'credits.json');

/** The catalog types this pipeline must satisfy. */
export const CATALOG_TYPES_TS = path.join(REPO_DIR, 'packages/core/src/catalog.ts');

/** Sent with every download (Poly Haven's API terms ask for a User-Agent that names the software). */
export const USER_AGENT = 'YoungVista-catalog-pipeline/0.1 (+https://young-vista.web.app)';

export const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
