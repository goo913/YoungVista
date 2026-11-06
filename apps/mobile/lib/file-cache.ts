/**
 * Furniture models kept on the phone, so a room opens fast the second time and without a
 * connection. Catalog files never change under the same name (a changed model gets a new file
 * name), so a file's name is its cache key and a stored file never goes stale.
 *
 * Plain TypeScript: the storage is passed in (expo-file-system on the phone, a map in tests).
 */

/** Where cached files live. */
export interface FileStore {
  /** Local URI of the stored file `name`, or null when it is not stored. */
  find(name: string): string | null;
  /**
   * Downloads `url` and stores it as `name`; resolves to its local URI. The file must only appear
   * under `name` once complete, so a failed download never leaves a broken file behind.
   */
  download(url: string, name: string): Promise<string>;
  /** Names of the stored files. */
  list(): string[];
  remove(name: string): void;
}

/**
 * The file name a URL is stored under: its path on the server, without the `catalog/` folder and
 * with `/` replaced, e.g. `…/catalog/models/sofa-velvet--navy.glb` → `models_sofa-velvet--navy.glb`.
 */
export function cacheName(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/]*\/(.*)$/i.exec(url);
  const path = (match ? match[1]! : url).split(/[?#]/)[0]!.replace(/^\/+/, '');
  const safe = path
    .replace(/^catalog\//, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '');
  return safe || 'file';
}

/** Files that are being written: `name.part` while downloading. */
export const PART_SUFFIX = '.part';

export class FileCache {
  private readonly store: FileStore;
  /** How many downloads run at once. */
  private readonly concurrency: number;
  private readonly inflight = new Map<string, Promise<string>>();
  private readonly waiting: (() => void)[] = [];
  private active = 0;

  constructor(store: FileStore, concurrency = 3) {
    this.store = store;
    this.concurrency = Math.max(1, concurrency);
  }

  /** The local URI if the file is already on the phone. */
  cached(url: string): string | null {
    return this.store.find(cacheName(url));
  }

  /**
   * The file's local URI, downloading it first when it is not on the phone yet. Calls for the same
   * URL share one download; a failed download is tried again by the next call.
   */
  get(url: string): Promise<string> {
    const name = cacheName(url);
    const hit = this.store.find(name);
    if (hit) return Promise.resolve(hit);
    const running = this.inflight.get(name);
    if (running) return running;
    const download = this.limited(() => this.store.download(url, name)).finally(() => {
      this.inflight.delete(name);
    });
    this.inflight.set(name, download);
    return download;
  }

  /** Starts downloading files that are not on the phone yet. Failures show up later, in `get`. */
  prefetch(urls: Iterable<string>): void {
    for (const url of urls) this.get(url).catch(() => {});
  }

  /**
   * Deletes stored files that none of `keepUrls` uses (models dropped from the catalog, leftovers
   * of interrupted downloads). Returns how many files were deleted.
   */
  prune(keepUrls: Iterable<string>): number {
    const keep = new Set<string>();
    for (const url of keepUrls) keep.add(cacheName(url));
    let removed = 0;
    for (const name of this.store.list()) {
      const base = name.endsWith(PART_SUFFIX) ? name.slice(0, -PART_SUFFIX.length) : name;
      if (this.inflight.has(base) || (keep.has(name) && name === base)) continue;
      this.store.remove(name);
      removed++;
    }
    return removed;
  }

  private limited<R>(task: () => Promise<R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const start = () => {
        this.active++;
        let run: Promise<R>;
        try {
          run = task();
        } catch (error) {
          run = Promise.reject(error);
        }
        run.then(resolve, reject).finally(() => {
          this.active--;
          this.waiting.shift()?.();
        });
      };
      if (this.active < this.concurrency) start();
      else this.waiting.push(start);
    });
  }
}
