/**
 * The furniture catalog and its 3D models on the phone. `catalog.json` and every model the app
 * opens are kept in the app's cache folder (expo-file-system), so rooms open fast the second time
 * and work without a connection. The catalog shows from the phone's copy at once and is refreshed
 * from the server in the background.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import {
  allModelUrls,
  CATALOG_JSON_URL,
  catalogFromText,
  indexCatalog,
  type CatalogIndex,
} from './catalog-data';
import { FileCache, PART_SUFFIX, type FileStore } from './file-cache';

export type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; data: CatalogIndex }
  | { status: 'error'; message: string };

// The cache folder: re-downloadable files belong there (not backed up; the system may clear it
// when the phone runs out of space, and then the app downloads again).
const root = new Directory(Paths.cache, 'catalog');
const modelsDir = new Directory(root, 'files');
const catalogFile = new File(root, 'catalog.json');

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

/** expo-file-system storage for `FileCache`: downloads land in `name.part`, then move into place. */
const modelStore: FileStore = {
  find(name) {
    const file = new File(modelsDir, name);
    return file.exists ? file.uri : null;
  },
  async download(url, name) {
    ensure(modelsDir);
    const part = new File(modelsDir, name + PART_SUFFIX);
    if (part.exists) part.delete();
    await File.downloadFileAsync(url, part, { idempotent: true });
    const done = new File(modelsDir, name);
    if (done.exists) done.delete();
    part.moveSync(done);
    return done.uri;
  },
  list() {
    if (!modelsDir.exists) return [];
    return modelsDir.list().flatMap((entry) => (entry instanceof File ? [entry.name] : []));
  },
  remove(name) {
    const file = new File(modelsDir, name);
    if (file.exists) file.delete();
  },
};

/** The models on the phone. `models.get(url)` gives a local `file://` URI, downloading if needed. */
export const models = new FileCache(modelStore, 3);

let state: CatalogState = { status: 'loading' };
let started = false;
let refreshing = false;
let pruned = false;
const listeners = new Set<() => void>();

function set(next: CatalogState) {
  state = next;
  for (const l of listeners) l();
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const text = await fetchText(CATALOG_JSON_URL, 15000);
    const catalog = catalogFromText(text);
    if (!catalog) throw new Error('catalog.json is not a catalog');
    try {
      ensure(root);
      catalogFile.write(text);
    } catch {
      // Not kept on the phone this time; it still works while the app is open.
    }
    set({ status: 'ready', data: indexCatalog(catalog) });
    if (!pruned) {
      pruned = true;
      try {
        models.prune(allModelUrls(catalog));
      } catch {
        // Old files stay until next time.
      }
    }
  } catch {
    if (state.status !== 'ready') {
      set({
        status: 'error',
        message: 'The furniture list could not be loaded. Check your connection and try again.',
      });
    }
  } finally {
    refreshing = false;
  }
}

function start() {
  if (started) return;
  started = true;
  try {
    if (catalogFile.exists) {
      const catalog = catalogFromText(catalogFile.textSync());
      if (catalog) set({ status: 'ready', data: indexCatalog(catalog) });
    }
  } catch {
    // No usable copy on the phone: wait for the server.
  }
  void refresh();
}

/** Loads the catalog again after it failed (the copy on the phone, if any, keeps showing). */
export function retryCatalog() {
  if (state.status === 'error') set({ status: 'loading' });
  void refresh();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
};

/** The furniture catalog: names, sizes, colours, models and credits. */
export function useCatalog(): CatalogState {
  return useSyncExternalStore(subscribe, () => state);
}
