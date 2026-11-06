import { describe, expect, it, vi } from 'vitest';
import { cacheName, FileCache, PART_SUFFIX, type FileStore } from '@/lib/file-cache';

/** A FileStore in memory whose downloads the test finishes by hand. */
function memoryStore() {
  const files = new Map<string, string>();
  const pending: { url: string; name: string; resolve: () => void; reject: (e: Error) => void }[] =
    [];
  const store: FileStore = {
    find: (name) => (files.has(name) ? `file:///cache/${name}` : null),
    download: vi.fn(
      (url: string, name: string) =>
        new Promise<string>((resolve, reject) => {
          files.set(name + PART_SUFFIX, 'partial');
          pending.push({
            url,
            name,
            resolve: () => {
              files.delete(name + PART_SUFFIX);
              files.set(name, url);
              resolve(`file:///cache/${name}`);
            },
            reject: (e) => {
              files.delete(name + PART_SUFFIX);
              reject(e);
            },
          });
        }),
    ),
    list: () => [...files.keys()],
    remove: (name) => void files.delete(name),
  };
  return { store, files, pending };
}

const BASE = 'https://young-vista.web.app/catalog/';

describe('cacheName', () => {
  it('names files after their path in the catalog', () => {
    expect(cacheName(`${BASE}models/sofa-velvet--navy.glb`)).toBe('models_sofa-velvet--navy.glb');
    expect(cacheName(`${BASE}thumbs/sofa.webp?v=2`)).toBe('thumbs_sofa.webp');
    expect(cacheName('https://example.com/a b/../x.glb')).toBe('a_b_.._x.glb');
    expect(cacheName('https://example.com/')).toBe('file');
  });
});

describe('FileCache', () => {
  it('downloads a model once, then serves it from the phone', async () => {
    const { store, pending } = memoryStore();
    const cache = new FileCache(store);
    const url = `${BASE}models/sofa.glb`;
    expect(cache.cached(url)).toBeNull();
    const first = cache.get(url);
    const second = cache.get(url); // shares the download
    expect(store.download).toHaveBeenCalledTimes(1);
    pending[0]!.resolve();
    expect(await first).toBe('file:///cache/models_sofa.glb');
    expect(await second).toBe('file:///cache/models_sofa.glb');
    expect(cache.cached(url)).toBe('file:///cache/models_sofa.glb');
    expect(await cache.get(url)).toBe('file:///cache/models_sofa.glb');
    expect(store.download).toHaveBeenCalledTimes(1);
  });

  it('tries a failed download again next time, leaving no broken file', async () => {
    const { store, files, pending } = memoryStore();
    const cache = new FileCache(store);
    const url = `${BASE}models/bed.glb`;
    const first = cache.get(url);
    pending[0]!.reject(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    expect([...files.keys()]).toEqual([]);
    const again = cache.get(url);
    expect(store.download).toHaveBeenCalledTimes(2);
    pending[1]!.resolve();
    await expect(again).resolves.toContain('models_bed.glb');
  });

  it('runs a few downloads at a time', async () => {
    const { store, pending } = memoryStore();
    const cache = new FileCache(store, 2);
    const all = ['a', 'b', 'c', 'd'].map((n) => cache.get(`${BASE}models/${n}.glb`));
    expect(store.download).toHaveBeenCalledTimes(2);
    pending[0]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.download).toHaveBeenCalledTimes(3);
    pending[1]!.resolve();
    pending[2]!.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.download).toHaveBeenCalledTimes(4);
    pending[3]!.resolve();
    expect(await Promise.all(all)).toHaveLength(4);
  });

  it('deletes files the catalog no longer uses, but not ones being downloaded', async () => {
    const { store, files, pending } = memoryStore();
    const cache = new FileCache(store);
    files.set('models_old.glb', 'x');
    files.set('models_keep.glb', 'x');
    files.set('models_stale.glb.part', 'x');
    const running = cache.get(`${BASE}models/new.glb`);
    const removed = cache.prune([`${BASE}models/keep.glb`]);
    expect(removed).toBe(2);
    expect([...files.keys()].sort()).toEqual(['models_keep.glb', 'models_new.glb.part']);
    pending[0]!.resolve();
    await running;
  });

  it('prefetches without throwing', async () => {
    const { store, pending } = memoryStore();
    const cache = new FileCache(store);
    cache.prefetch([`${BASE}models/a.glb`, `${BASE}models/a.glb`]);
    expect(store.download).toHaveBeenCalledTimes(1);
    pending[0]!.reject(new Error('offline'));
    await new Promise((r) => setTimeout(r, 0));
  });
});
