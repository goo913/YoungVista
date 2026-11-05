/**
 * Checks the published catalog. Any failure fails the build. Per GLB: Khronos glTF-Validator has
 * no errors, the bounding box matches the listed size within 1 cm, the origin is on the floor and
 * centred within 1 mm, triangle and size budgets, no banned extensions, JPEG/PNG textures of 1024 px
 * or less, and the thumbnail exists. Then catalog.json is checked at runtime and type-checked
 * against `Catalog` from packages/core.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getBounds, listTextureSlots } from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { CATALOG_CATEGORIES, type Catalog } from '../../../packages/core/src/catalog.ts';
import { CATALOG_JSON, CATALOG_TYPES_TS, OUT_DIR, PIPELINE_DIR } from './paths.ts';
import { countTriangles } from './geometry.ts';
import { createIO } from './process.ts';
import { formatBytes, printTable } from './util.ts';

export const BANNED_EXTENSIONS = [
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_meshopt_compression',
  'KHR_texture_basisu',
  'EXT_texture_webp',
  'EXT_texture_avif',
  'KHR_mesh_quantization',
];
export const LIMITS = {
  glbBytes: 3 * 1024 * 1024,
  totalBytes: 60 * 1024 * 1024,
  thumbBytes: 60 * 1024,
  textureSize: 1024,
  triangles: 50_000,
  /** Bounding box against the listed size, metres. */
  dims: 0.01,
  /** Origin: min y and the x/z centre, metres. */
  origin: 0.001,
};

const run = promisify(execFile);

interface GlbCheck {
  label: string;
  dims: string;
  triangles: number;
  bytes: number;
  validator: string;
  extensions: string;
  textures: string;
  bbox: string;
  thumb: string;
  failures: string[];
}

async function checkGlb(
  label: string,
  modelRel: string,
  thumbRel: string,
  dims: { w: number; d: number; h: number },
  maxTriangles: number,
): Promise<GlbCheck> {
  const failures: string[] = [];
  const file = path.join(OUT_DIR, modelRel);
  const bytes = new Uint8Array(await fs.readFile(file));
  if (bytes.byteLength > LIMITS.glbBytes)
    failures.push(`GLB is ${formatBytes(bytes.byteLength)} (> 3 MB)`);

  const report = await validator.validateBytes(bytes, { maxIssues: 100, format: 'glb' });
  const errors = report.issues.messages.filter((m) => m.severity === 0);
  if (report.issues.numErrors > 0) {
    failures.push(`validator: ${errors.map((e) => `${e.code} ${e.pointer ?? ''}`).join('; ')}`);
  }

  const used = [...(report.info?.extensionsUsed ?? []), ...(report.info?.extensionsRequired ?? [])];
  const banned = used.filter((e) => BANNED_EXTENSIONS.includes(e));
  if (banned.length) failures.push(`banned extensions: ${banned.join(', ')}`);

  const images = (report.info?.resources ?? []).filter((r) => r.pointer.startsWith('/images/'));
  for (const img of images) {
    if (img.mimeType !== 'image/jpeg' && img.mimeType !== 'image/png') {
      failures.push(`${img.pointer} is ${img.mimeType}`);
    }
    if (img.image && Math.max(img.image.width, img.image.height) > LIMITS.textureSize) {
      failures.push(`${img.pointer} is ${img.image.width}x${img.image.height}`);
    }
  }
  if ((report.info?.maxUVs ?? 0) > 1) failures.push('more than one UV set');

  const doc = await createIO().readBinary(bytes);
  // ViroCore caches each image with the colour space of its first use, so one image must not
  // serve both a colour slot (sRGB) and a data slot (linear).
  for (const texture of doc.getRoot().listTextures()) {
    const slots = listTextureSlots(texture);
    const color = slots.some((s) => s === 'baseColorTexture' || s === 'emissiveTexture');
    if (color && slots.some((s) => !['baseColorTexture', 'emissiveTexture'].includes(s))) {
      failures.push(`one image used as colour and data: ${slots.join(', ')}`);
    }
  }
  const { min, max } = getBounds(doc.getRoot().getDefaultScene()!);
  const size = { w: max[0] - min[0], h: max[1] - min[1], d: max[2] - min[2] };
  const off = {
    w: size.w - dims.w,
    d: size.d - dims.d,
    h: size.h - dims.h,
  };
  for (const k of ['w', 'd', 'h'] as const) {
    if (Math.abs(off[k]) > LIMITS.dims)
      failures.push(`${k} is ${size[k].toFixed(3)} m, listed ${dims[k]}`);
  }
  const cx = (min[0] + max[0]) / 2;
  const cz = (min[2] + max[2]) / 2;
  if (Math.abs(min[1]) > LIMITS.origin) failures.push(`min y is ${min[1].toFixed(4)}`);
  if (Math.abs(cx) > LIMITS.origin || Math.abs(cz) > LIMITS.origin) {
    failures.push(`footprint centre is (${cx.toFixed(4)}, ${cz.toFixed(4)})`);
  }
  const triangles = countTriangles(doc);
  if (triangles > maxTriangles) failures.push(`${triangles} triangles (> ${maxTriangles})`);
  if (
    report.info?.totalTriangleCount !== undefined &&
    report.info.totalTriangleCount !== triangles
  ) {
    failures.push(`triangle counts differ (${report.info.totalTriangleCount} vs ${triangles})`);
  }

  let thumb = 'missing';
  try {
    const st = await fs.stat(path.join(OUT_DIR, thumbRel));
    thumb = formatBytes(st.size);
    if (st.size > LIMITS.thumbBytes) failures.push(`thumbnail is ${thumb} (> 60 KB)`);
  } catch {
    failures.push(`thumbnail ${thumbRel} missing`);
  }

  const maxOff = Math.max(...Object.values(off).map(Math.abs));
  return {
    label,
    dims: `${dims.w.toFixed(2)} x ${dims.d.toFixed(2)} x ${dims.h.toFixed(2)}`,
    triangles,
    bytes: bytes.byteLength,
    validator: `${report.issues.numErrors}E ${report.issues.numWarnings}W`,
    extensions: used.length ? used.join(',') : 'none',
    textures: images.length
      ? `${images.length}x ${Math.max(...images.map((i) => Math.max(i.image?.width ?? 0, i.image?.height ?? 0)))}px`
      : 'none',
    bbox: `${(maxOff * 1000).toFixed(1)}mm`,
    thumb,
    failures,
  };
}

const KEYS = {
  item: [
    'id',
    'name',
    'category',
    'dimensions',
    'placement',
    'variants',
    'license',
    'credit',
    'sourceUrl',
    'model',
    'thumb',
  ],
  variant: ['id', 'name', 'swatch', 'model', 'thumb'],
};

/** Runtime check of catalog.json against the `Catalog` shape, plus file references. */
async function checkCatalogShape(catalog: unknown): Promise<string[]> {
  const errs: string[] = [];
  const c = catalog as Catalog;
  if (typeof c !== 'object' || c === null) return ['catalog.json is not an object'];
  if (Object.keys(c).sort().join() !== 'items,version')
    errs.push('top-level keys must be version, items');
  if (c.version !== 1) errs.push('version must be 1');
  const categories = new Set<string>(CATALOG_CATEGORIES.map((x) => x.id));
  const ids = new Set<string>();
  const fileExists = async (rel: string) => {
    if (rel.startsWith('/') || rel.includes('..')) return false;
    return fs.access(path.join(OUT_DIR, rel)).then(
      () => true,
      () => false,
    );
  };
  for (const item of c.items ?? []) {
    const where = `item ${item.id}`;
    for (const k of Object.keys(item))
      if (!KEYS.item.includes(k)) errs.push(`${where}: unknown key ${k}`);
    if (typeof item.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id))
      errs.push(`${where}: bad id`);
    if (ids.has(item.id)) errs.push(`${where}: duplicate id`);
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name) errs.push(`${where}: name`);
    if (!categories.has(item.category)) errs.push(`${where}: category ${item.category}`);
    const d = item.dimensions;
    if (!d || !(['w', 'd', 'h'] as const).every((k) => typeof d[k] === 'number' && d[k] > 0)) {
      errs.push(`${where}: dimensions`);
    }
    if (!['floor', 'wall', 'tabletop'].includes(item.placement)) errs.push(`${where}: placement`);
    if (!['CC0-1.0', 'CC-BY-4.0'].includes(item.license)) errs.push(`${where}: license`);
    if (typeof item.credit !== 'string' || !item.credit) errs.push(`${where}: credit`);
    if (!/^https:\/\//.test(item.sourceUrl)) errs.push(`${where}: sourceUrl`);
    if (!(await fileExists(item.model))) errs.push(`${where}: model ${item.model} missing`);
    if (!(await fileExists(item.thumb))) errs.push(`${where}: thumb ${item.thumb} missing`);
    const vids = new Set<string>();
    for (const v of item.variants ?? []) {
      for (const k of Object.keys(v))
        if (!KEYS.variant.includes(k)) errs.push(`${where}: variant key ${k}`);
      if (!v.id || vids.has(v.id)) errs.push(`${where}: variant id ${v.id}`);
      vids.add(v.id);
      if (!v.name) errs.push(`${where}: variant name`);
      if (v.swatch !== undefined && !/^#[0-9a-f]{6}$/.test(v.swatch))
        errs.push(`${where}: swatch ${v.swatch}`);
      if (v.model !== undefined && !(await fileExists(v.model)))
        errs.push(`${where}: ${v.model} missing`);
      if (v.thumb !== undefined && !(await fileExists(v.thumb)))
        errs.push(`${where}: ${v.thumb} missing`);
    }
  }
  return errs;
}

/** Type-checks catalog.json as an object literal that must satisfy `Catalog` (no extra keys). */
async function typecheckCatalog(json: string): Promise<string[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-typecheck-'));
  try {
    await fs.writeFile(
      path.join(dir, 'catalog.check.ts'),
      `import type { Catalog } from ${JSON.stringify(CATALOG_TYPES_TS)};\n\nexport const catalog = ${json.trim()} satisfies Catalog;\n`,
    );
    await fs.writeFile(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowImportingTsExtensions: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['catalog.check.ts'],
      }),
    );
    const tsc = path.join(PIPELINE_DIR, 'node_modules/typescript/bin/tsc');
    try {
      await run(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json')]);
      return [];
    } catch (e) {
      const out = (e as { stdout?: string }).stdout ?? String(e);
      return out.trim().split('\n').slice(0, 20);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await dirBytes(p) : (await fs.stat(p)).size;
  }
  return total;
}

/** Validates everything under apps/web/public/catalog. Returns false on any failure. */
export async function validateCatalog(maxTrianglesById: Map<string, number>): Promise<boolean> {
  const json = await fs.readFile(CATALOG_JSON, 'utf8');
  let catalog: Catalog;
  try {
    catalog = JSON.parse(json) as Catalog;
  } catch (e) {
    console.error(`catalog.json does not parse: ${e}`);
    return false;
  }
  const checks: GlbCheck[] = [];
  for (const item of catalog.items) {
    const max = maxTrianglesById.get(item.id) ?? LIMITS.triangles;
    checks.push(await checkGlb(item.id, item.model, item.thumb, item.dimensions, max));
    for (const v of item.variants) {
      if (!v.model) continue;
      checks.push(
        await checkGlb(
          `  ${item.id} / ${v.id}`,
          v.model,
          v.thumb ?? item.thumb,
          item.dimensions,
          max,
        ),
      );
    }
  }
  console.log('\nValidation');
  printTable(
    [
      'model',
      'w x d x h (m)',
      'tris',
      'size',
      'validator',
      'extensions',
      'textures',
      'bbox off',
      'thumb',
      'result',
    ],
    checks.map((c) => [
      c.label,
      c.dims,
      String(c.triangles),
      formatBytes(c.bytes),
      c.validator,
      c.extensions,
      c.textures,
      c.bbox,
      c.thumb,
      c.failures.length ? 'FAIL' : 'ok',
    ]),
  );
  const failures = checks.flatMap((c) => c.failures.map((f) => `${c.label.trim()}: ${f}`));

  const total = await dirBytes(OUT_DIR);
  const glbTotal = checks.reduce((s, c) => s + c.bytes, 0);
  console.log(
    `\n${checks.length} GLBs, ${formatBytes(glbTotal)}; everything under /catalog/: ${formatBytes(total)} (limit 60 MB)`,
  );
  if (total > LIMITS.totalBytes) failures.push(`catalog is ${formatBytes(total)} (> 60 MB)`);

  failures.push(...(await checkCatalogShape(catalog)).map((e) => `catalog.json: ${e}`));
  const tsErrors = await typecheckCatalog(json);
  if (tsErrors.length) failures.push(...tsErrors.map((e) => `catalog.json type check: ${e}`));
  else
    console.log('catalog.json parses, matches the runtime shape check and type-checks as Catalog.');

  const covered = new Set(catalog.items.map((i) => i.category));
  const missing = CATALOG_CATEGORIES.filter((c) => !covered.has(c.id)).map((c) => c.id);
  console.log(
    `${catalog.items.length} items in ${covered.size} of ${CATALOG_CATEGORIES.length} categories${missing.length ? ` (missing: ${missing.join(', ')})` : ''}.`,
  );

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    return false;
  }
  console.log('All checks passed.');
  return true;
}
