/**
 * The furniture catalog and its product pictures, read from the app's own Firebase Hosting (the
 * same files the app and the website use). Kept in memory while the function's instance lives.
 */
import { CATALOG_BASE_URL, catalogUrl, parseCatalog, type Catalog } from '@youngvista/core';
import { logger } from 'firebase-functions';
import { imageInfo } from './images';
import type { ModelImage } from './model';

const MAX_THUMB_BYTES = 2 * 1024 * 1024;
const CATALOG_TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;

let catalogCache: { at: number; catalog: Catalog } | null = null;

/** The catalog, kept for 10 minutes; the last good copy when Hosting cannot answer. */
export async function loadCatalog(): Promise<Catalog | null> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.catalog;
  try {
    const res = await fetch(catalogUrl('catalog.json'), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = parseCatalog(await res.json());
    if (catalog) catalogCache = { at: Date.now(), catalog };
  } catch (error) {
    logger.warn('catalog not loaded', { error: String(error) });
  }
  return catalogCache?.catalog ?? null;
}

const thumbCache = new Map<string, ModelImage>();

/** A product picture (a small WebP), only from the app's own Hosting; null when it cannot load. */
export async function loadThumb(url: string): Promise<ModelImage | null> {
  if (!url.startsWith(CATALOG_BASE_URL)) return null;
  const known = thumbCache.get(url);
  if (known) return known;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_THUMB_BYTES) throw new Error('too big');
    const info = imageInfo(bytes);
    if (!info) throw new Error('not an image');
    const image = { bytes, mime: info.mime };
    if (thumbCache.size > 200) thumbCache.clear();
    thumbCache.set(url, image);
    return image;
  } catch (error) {
    logger.warn('product picture not loaded', { url, error: String(error) });
    return null;
  }
}
