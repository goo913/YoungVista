import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { USER_AGENT } from './paths.ts';

const STALL_MS = 60_000;

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export function md5(data: Uint8Array): string {
  return createHash('md5').update(data).digest('hex');
}

/**
 * Downloads `url` to `dest` once. Later calls reuse the cached file. When `expectMd5` is given,
 * a cached or fresh file with a different checksum is rejected.
 */
export async function download(url: string, dest: string, expectMd5?: string): Promise<string> {
  if (await exists(dest)) {
    if (!expectMd5 || md5(await fs.readFile(dest)) === expectMd5) return dest;
    await fs.rm(dest);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  for (let attempt = 1; ; attempt++) {
    // Large ABO files (up to ~80 MB) can stall on a slow link: abort when no bytes arrive for a
    // minute, then retry.
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(new Error('stalled')), STALL_MS);
    const watchdog = new Transform({
      transform(chunk, _encoding, done) {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(new Error('stalled')), STALL_MS);
        done(null, chunk);
      },
    });
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(
        Readable.fromWeb(res.body as WebReadableStream),
        watchdog,
        createWriteStream(tmp),
      );
      clearTimeout(timer);
      break;
    } catch (e) {
      clearTimeout(timer);
      if (attempt >= 4) {
        throw new Error(`Download failed (${(e as Error).message}): ${url}`, { cause: e });
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  if (expectMd5) {
    const got = md5(await fs.readFile(tmp));
    if (got !== expectMd5) {
      await fs.rm(tmp);
      throw new Error(`Checksum mismatch for ${url}: expected ${expectMd5}, got ${got}`);
    }
  }
  await fs.rename(tmp, dest);
  return dest;
}

/** Downloads JSON once and caches it. */
export async function fetchJson<T>(url: string, cacheFile: string): Promise<T> {
  await download(url, cacheFile);
  return JSON.parse(await fs.readFile(cacheFile, 'utf8')) as T;
}

export const round = (v: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** Linear colour component (0-1) to an sRGB byte. */
export function linearToSrgbByte(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

export function srgbByteToLinear(b: number): number {
  const c = b / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Prints rows as a fixed-width text table. */
export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
}
