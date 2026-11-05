/**
 * Builds the furniture catalog into apps/web/public/catalog:
 *   catalog.json, credits.json, models/{id}.glb, thumbs/{id}.webp (variants: {id}--{variant}).
 *
 * Usage (from the repo root):
 *   npm --prefix scripts/catalog run build                  everything
 *   npm --prefix scripts/catalog run build -- --only a,b    rebuild some models, keep the rest
 *   npm --prefix scripts/catalog run build -- --phase 1     only the first 15
 *   npm --prefix scripts/catalog run build -- --review      also write review sheets to .cache/review
 *   npm --prefix scripts/catalog run validate               checks only
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';
import type { Catalog, CatalogItem, CatalogVariant } from '../../../packages/core/src/catalog.ts';
import { MODELS } from './models.ts';
import {
  BUILD_CACHE_DIR,
  CACHE_DIR,
  CATALOG_JSON,
  CREDITS_JSON,
  MODELS_DIR,
  OUT_DIR,
  REPO_DIR,
  THUMBS_DIR,
} from './paths.ts';
import { buildModel, thumbFile } from './process.ts';
import { verifyDatasetLicences } from './sources.ts';
import { Renderer } from './thumbs.ts';
import type { BuildRecord, ModelSpec } from './types.ts';
import { formatBytes, printTable } from './util.ts';
import { validateCatalog } from './validate.ts';

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    phase: { type: 'string' },
    review: { type: 'boolean', default: false },
    'validate-only': { type: 'boolean', default: false },
  },
});

const recordFile = (id: string) => path.join(BUILD_CACHE_DIR, `${id}.json`);

async function readRecord(id: string): Promise<BuildRecord | undefined> {
  try {
    return JSON.parse(await fs.readFile(recordFile(id), 'utf8')) as BuildRecord;
  } catch {
    return undefined;
  }
}

/** Formats JSON with the repo's Prettier settings so `prettier --check` agrees with the output. */
async function writeJson(file: string, data: unknown): Promise<void> {
  const config = (await prettier.resolveConfig(path.join(REPO_DIR, 'package.json'))) ?? {};
  const text = await prettier.format(JSON.stringify(data), { ...config, parser: 'json' });
  await fs.writeFile(file, text);
}

function catalogItem(spec: ModelSpec, rec: BuildRecord): CatalogItem {
  const variants: CatalogVariant[] = [];
  if (rec.baseVariant) {
    variants.push({ id: rec.baseVariant.id, name: rec.baseVariant.name, swatch: rec.main.swatch });
  }
  for (const v of rec.variants) {
    variants.push({
      id: v.id,
      name: v.name,
      swatch: v.swatch,
      model: v.file,
      thumb: thumbFile(spec.id, v.id),
    });
  }
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    dimensions: rec.dims,
    placement: spec.placement,
    variants,
    license: rec.source.license,
    credit: rec.source.credit,
    sourceUrl: rec.source.sourceUrl,
    model: rec.main.file,
    thumb: thumbFile(spec.id),
  };
}

function creditEntry(spec: ModelSpec, rec: BuildRecord) {
  return {
    id: spec.id,
    name: spec.name,
    title: rec.source.title,
    author: rec.source.author,
    ...(rec.source.copyright ? { copyright: rec.source.copyright } : {}),
    source: rec.source.library,
    sourceUrl: rec.source.sourceUrl,
    license: rec.source.license,
    licenseUrl: rec.source.licenseUrl,
    credit: rec.source.credit,
    modified: 'rescaled and optimised',
    dimensions: rec.dims,
    dimensionsSource: rec.dimsSource,
    front: rec.front,
    ...(rec.frontCheck ? { frontCheck: rec.frontCheck } : {}),
    ...(rec.variants.some((v) => v.sourceUrl)
      ? {
          variants: rec.variants
            .filter((v) => v.sourceUrl)
            .map((v) => ({ id: v.id, title: v.title, sourceUrl: v.sourceUrl })),
        }
      : {}),
  };
}

/** Deletes published files that the catalog no longer references. */
async function removeStale(catalog: Catalog): Promise<void> {
  const keep = new Set<string>();
  for (const item of catalog.items) {
    keep.add(item.model).add(item.thumb);
    for (const v of item.variants) {
      if (v.model) keep.add(v.model);
      if (v.thumb) keep.add(v.thumb);
    }
  }
  for (const [dir, sub] of [
    [MODELS_DIR, 'models'],
    [THUMBS_DIR, 'thumbs'],
  ] as const) {
    for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
      if (!keep.has(`${sub}/${f}`)) await fs.rm(path.join(dir, f));
    }
  }
}

async function main(): Promise<void> {
  const inScope = MODELS.filter((m) => !args.phase || m.phase <= Number(args.phase));
  const ids = new Set(MODELS.map((m) => m.id));
  if (ids.size !== MODELS.length) throw new Error('Duplicate ids in models.ts');
  const only = args.only?.split(',').map((s) => s.trim());
  for (const id of only ?? []) if (!ids.has(id)) throw new Error(`Unknown model id ${id}`);
  const maxTriangles = new Map(MODELS.map((m) => [m.id, m.maxTriangles ?? 50_000]));

  if (!args['validate-only']) {
    for (const note of await verifyDatasetLicences()) console.log(`Licence check: ${note}`);
    const toBuild = inScope.filter((m) => !only || only.includes(m.id));
    await fs.mkdir(BUILD_CACHE_DIR, { recursive: true });
    await fs.mkdir(MODELS_DIR, { recursive: true });
    await fs.mkdir(THUMBS_DIR, { recursive: true });
    const failed: string[] = [];
    for (const spec of toBuild) {
      process.stdout.write(`Building ${spec.id} ... `);
      try {
        const rec = await buildModel(spec);
        await fs.writeFile(recordFile(spec.id), JSON.stringify(rec, null, 2));
        const files = [rec.main, ...rec.variants];
        console.log(
          `${files.length} GLB(s), ${formatBytes(files.reduce((s, f) => s + f.bytes, 0))}, ${rec.main.triangles} triangles`,
        );
      } catch (e) {
        console.log('FAILED');
        console.error(`  ${(e as Error).message}`);
        failed.push(spec.id);
      }
    }
    if (failed.length) throw new Error(`Failed to build: ${failed.join(', ')}`);

    const records = new Map<string, BuildRecord>();
    for (const spec of inScope) {
      const rec = await readRecord(spec.id);
      if (!rec) throw new Error(`${spec.id} has never been built; run without --only first`);
      records.set(spec.id, rec);
    }

    const renderer = await Renderer.start();
    try {
      for (const spec of toBuild) {
        const rec = records.get(spec.id)!;
        const view = spec.category === 'rug' ? 'thumb-flat' : 'thumb';
        await renderer.thumbnail(rec.main.file, path.join(OUT_DIR, thumbFile(spec.id)), view);
        for (const v of rec.variants) {
          await renderer.thumbnail(v.file, path.join(OUT_DIR, thumbFile(spec.id, v.id)), view);
        }
      }
      if (args.review) {
        const list = toBuild.flatMap((spec) => {
          const rec = records.get(spec.id)!;
          return [
            { file: rec.main.file, label: spec.id },
            ...rec.variants.map((v) => ({ file: v.file, label: `${spec.id} / ${v.id}` })),
          ];
        });
        for (let i = 0; i < list.length; i += 6) {
          const sheet = path.join(
            CACHE_DIR,
            'review',
            `sheet-${String(i / 6 + 1).padStart(2, '0')}.png`,
          );
          await renderer.reviewSheet(list.slice(i, i + 6), sheet);
          console.log(`Review sheet: ${sheet}`);
        }
      }
    } finally {
      await renderer.close();
    }

    const catalog: Catalog = {
      version: 1,
      items: inScope.map((spec) => catalogItem(spec, records.get(spec.id)!)),
    };
    await writeJson(CATALOG_JSON, catalog);
    await writeJson(CREDITS_JSON, {
      version: 1,
      notice:
        'YoungVista furniture models. Each model was rescaled to its real size and optimised (texture size, mesh simplification, format). CC BY 4.0 models need the attribution below.',
      items: inScope.map((spec) => creditEntry(spec, records.get(spec.id)!)),
    });
    await removeStale(catalog);

    console.log('\nCatalog');
    printTable(
      ['id', 'name', 'category', 'w x d x h (m)', 'licence', 'credit', 'tris', 'size', 'variants'],
      inScope.map((spec) => {
        const rec = records.get(spec.id)!;
        return [
          spec.id,
          spec.name,
          spec.category,
          `${rec.dims.w} x ${rec.dims.d} x ${rec.dims.h}`,
          rec.source.license,
          rec.source.credit,
          String(rec.main.triangles),
          formatBytes(rec.main.bytes),
          [rec.baseVariant?.id, ...rec.variants.map((v) => v.id)].filter(Boolean).join(', ') || '-',
        ];
      }),
    );
  }

  const ok = await validateCatalog(maxTriangles);
  if (!ok) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
