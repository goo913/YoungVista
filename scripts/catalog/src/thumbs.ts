/**
 * Renders GLBs with three.js in headless Chrome: a front three-quarter thumbnail for the catalog,
 * and front, side, back and top views for reviewing orientation.
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import sharp from 'sharp';
import { CHROME_PATH, MODELS_DIR, PIPELINE_DIR } from './paths.ts';

export type View = 'thumb' | 'thumb-flat' | 'front' | 'side' | 'back' | 'top';

const THUMB_SIZE = 512;
const THUMB_MAX_BYTES = 60 * 1024;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
};

/** Serves the render page, three.js from node_modules and the built models. */
function serve(): Promise<http.Server> {
  const roots: Record<string, string> = {
    '/three/': path.join(PIPELINE_DIR, 'node_modules/three/'),
    '/models/': MODELS_DIR + path.sep,
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      let file = url === '/' ? path.join(PIPELINE_DIR, 'src/thumb.html') : undefined;
      for (const [prefix, dir] of Object.entries(roots)) {
        if (!url.startsWith(prefix)) continue;
        const candidate = path.resolve(dir, url.slice(prefix.length));
        if (candidate.startsWith(dir)) file = candidate;
      }
      if (!file) throw new Error('not found');
      const body = await fs.readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export class Renderer {
  private server: http.Server;
  private browser: Browser;
  private page: Page;

  private constructor(server: http.Server, browser: Browser, page: Page) {
    this.server = server;
    this.browser = browser;
    this.page = page;
  }

  static async start(): Promise<Renderer> {
    const server = await serve();
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: process.platform === 'darwin' ? ['--use-angle=metal'] : ['--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const { port } = server.address() as AddressInfo;
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction('window.rendererReady === true', { timeout: 30_000 }).catch(() => {
      throw new Error(`Thumbnail page failed to start: ${errors.join('; ')}`);
    });
    return new Renderer(server, browser, page);
  }

  /** Renders `models/<file>` and returns PNG bytes. */
  async render(modelFile: string, view: View, size: number): Promise<Buffer> {
    const url = `/models/${path.basename(modelFile)}`;
    const result = (await this.page.evaluate(
      (u, v, s) =>
        (
          window as unknown as {
            renderModel: (u: string, v: string, s: number) => Promise<{ png: string }>;
          }
        ).renderModel(u, v, s),
      url,
      view,
      size,
    )) as { png: string };
    return Buffer.from(result.png.replace(/^data:image\/png;base64,/, ''), 'base64');
  }

  /** Writes the catalog thumbnail as WebP, lowering quality until it fits the size budget. */
  async thumbnail(modelFile: string, outFile: string, view: View = 'thumb'): Promise<number> {
    const png = await this.render(modelFile, view, THUMB_SIZE);
    let webp: Buffer | undefined;
    for (const quality of [90, 84, 78, 72, 64, 56]) {
      webp = await sharp(png).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
      if (webp.byteLength <= THUMB_MAX_BYTES) break;
    }
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, webp!);
    return webp!.byteLength;
  }

  /** A review sheet: one row per model, columns front / side / back / top / thumb. */
  async reviewSheet(models: { file: string; label: string }[], outFile: string): Promise<void> {
    const cell = 220;
    const views: View[] = ['front', 'side', 'back', 'top', 'thumb'];
    const rows = [];
    for (const m of models) {
      const cells = [];
      for (const v of views) cells.push(await this.render(m.file, v, cell));
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cell * views.length}" height="22"><rect width="100%" height="100%" fill="#222"/><text x="6" y="16" font-family="Helvetica" font-size="14" fill="#fff">${m.label}</text></svg>`,
      );
      rows.push({ cells, label });
    }
    const width = cell * views.length;
    const rowH = cell + 22;
    const composites = rows.flatMap((r, i) => [
      { input: r.label, top: i * rowH, left: 0 },
      ...r.cells.map((c, j) => ({ input: c, top: i * rowH + 22, left: j * cell })),
    ]);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await sharp({
      create: { width, height: rowH * rows.length, channels: 3, background: '#ffffff' },
    })
      .composite(composites)
      .png()
      .toFile(outFile);
  }

  async close(): Promise<void> {
    await this.browser.close();
    this.server.close();
  }
}
