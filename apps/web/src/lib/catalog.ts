import { useEffect, useState } from 'react';
import {
  catalogModelUrl,
  catalogThumbUrl,
  catalogUrl,
  parseCatalog,
  type Catalog,
  type CatalogItem,
} from '@youngvista/core';

/** The website loads the catalog from its own origin (the same files the phone app uses). */
export const CATALOG_BASE = '/catalog/';

export interface CatalogIndex {
  catalog: Catalog;
  byId: ReadonlyMap<string, CatalogItem>;
}

export type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; data: CatalogIndex }
  | { status: 'error'; message: string };

let pending: Promise<CatalogIndex> | null = null;

/** Fetches and parses `catalog.json` once per page load (retried after a failure). */
export function loadCatalog(): Promise<CatalogIndex> {
  pending ??= fetch(catalogUrl('catalog.json', CATALOG_BASE))
    .then(async (res) => {
      if (!res.ok) throw new Error(`catalog.json: HTTP ${res.status}`);
      const catalog = parseCatalog(await res.json());
      if (!catalog) throw new Error('catalog.json is not a catalog');
      return { catalog, byId: new Map(catalog.items.map((item) => [item.id, item])) };
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** The furniture catalog, for names, sizes, models and credits. */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (data) => live && setState({ status: 'ready', data }),
      () =>
        live &&
        setState({
          status: 'error',
          message: 'Furniture details could not be loaded. Check your connection and reload.',
        }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export const modelUrl = (item: CatalogItem, variant?: string) =>
  catalogModelUrl(item, variant, CATALOG_BASE);

export const thumbUrl = (item: CatalogItem, variant?: string) =>
  item.thumb ? catalogThumbUrl(item, variant, CATALOG_BASE) : null;

export const LICENSES: Record<CatalogItem['license'], { label: string; url: string }> = {
  'CC0-1.0': { label: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'CC-BY-4.0': { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
};
