import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { CatalogLicense } from '../../../packages/core/src/catalog.ts';
import { CACHE_DIR } from './paths.ts';
import type { SourceInfo, SourceRef } from './types.ts';
import { download, exists, fetchJson } from './util.ts';

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

// ---------------------------------------------------------------------------------------------
// Licence checks against the official pages (run on every build, pages are cached in .cache).

export const LICENCE_PAGES = {
  abo: 'https://amazon-berkeley-objects.s3.amazonaws.com/index.html',
  polyhaven: 'https://polyhaven.com/license',
  khronos: (model: string) =>
    `https://github.com/KhronosGroup/glTF-Sample-Assets/blob/${KHRONOS_COMMIT}/Models/${model}/metadata.json`,
};

/** Confirms the dataset-wide licences on the official pages. Throws if the wording changed. */
export async function verifyDatasetLicences(): Promise<string[]> {
  const notes: string[] = [];
  const aboFile = await download(LICENCE_PAGES.abo, path.join(CACHE_DIR, 'licence/abo-index.html'));
  const abo = (await fs.readFile(aboFile, 'utf8')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const aboLicence =
    'This work is licensed under the Creative Commons Attribution 4.0 International Public License (CC BY 4.0)';
  const aboCredit =
    'Credit for the data, including all images and 3D models, must be given to: Amazon.com';
  if (!abo.includes(aboLicence) || !abo.includes(aboCredit)) {
    throw new Error(`ABO licence wording not found on ${LICENCE_PAGES.abo}. Re-check the licence.`);
  }
  notes.push(`ABO: "${aboLicence}"; "${aboCredit}" (${LICENCE_PAGES.abo})`);

  const phFile = await download(
    LICENCE_PAGES.polyhaven,
    path.join(CACHE_DIR, 'licence/polyhaven-license.html'),
  );
  const ph = (await fs.readFile(phFile, 'utf8')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (!ph.includes('Our assets are all licensed as CC0')) {
    throw new Error(`Poly Haven CC0 wording not found on ${LICENCE_PAGES.polyhaven}.`);
  }
  notes.push(`Poly Haven: "Our assets are all licensed as CC0" (${LICENCE_PAGES.polyhaven})`);
  return notes;
}

/** Rejects (and deletes) a cached file that is not a binary glTF, e.g. a saved error page. */
async function assertGlb(file: string): Promise<string> {
  const handle = await fs.open(file);
  const magic = Buffer.alloc(4);
  await handle.read(magic, 0, 4, 0);
  await handle.close();
  if (magic.toString('latin1') !== 'glTF') {
    await fs.rm(file);
    throw new Error(`${file} is not a GLB; deleted it, run again to re-download`);
  }
  return file;
}

export async function resolveSource(ref: SourceRef): Promise<SourceInfo> {
  switch (ref.kind) {
    case 'abo':
      return aboSource(ref.id);
    case 'polyhaven':
      return polyHavenSource(ref.id);
    case 'khronos':
      return khronosSource(ref.id);
  }
}

// ---------------------------------------------------------------------------------------------
// Amazon Berkeley Objects (CC BY 4.0, credit "Amazon.com").

const ABO_BASE = 'https://amazon-berkeley-objects.s3.amazonaws.com';
const ABO_DIR = path.join(CACHE_DIR, 'abo');

interface AboDimension {
  unit: string;
  value: number;
}

interface AboListing {
  itemId: string;
  name: string;
  productType: string;
  dimensions: Partial<Record<'height' | 'length' | 'width', AboDimension>>;
}

interface AboIndex {
  paths: Record<string, string>;
  listings: Record<string, AboListing>;
}

let aboIndex: Promise<AboIndex> | undefined;

/** 3dmodels.csv (model id to file path) joined with the listings that have a 3D model. */
function loadAboIndex(): Promise<AboIndex> {
  aboIndex ??= (async () => {
    const indexFile = path.join(ABO_DIR, 'index.json');
    if (await exists(indexFile)) return JSON.parse(await fs.readFile(indexFile, 'utf8'));
    const csvFile = await download(
      `${ABO_BASE}/3dmodels/metadata/3dmodels.csv.gz`,
      path.join(ABO_DIR, '3dmodels.csv.gz'),
    );
    const paths: Record<string, string> = {};
    const lines = gunzipSync(await fs.readFile(csvFile))
      .toString('utf8')
      .trim()
      .split('\n');
    for (const line of lines.slice(1)) {
      const [id, file] = line.split(',');
      if (id && file) paths[id] = file;
    }
    const listings: Record<string, AboListing> = {};
    for (const shard of '0123456789abcdef') {
      const file = await download(
        `${ABO_BASE}/listings/metadata/listings_${shard}.json.gz`,
        path.join(ABO_DIR, `listings_${shard}.json.gz`),
      );
      for (const line of gunzipSync(await fs.readFile(file))
        .toString('utf8')
        .split('\n')) {
        if (!line.trim()) continue;
        const o = JSON.parse(line) as {
          item_id: string;
          '3dmodel_id'?: string;
          item_name?: { language_tag: string; value: string }[];
          product_type?: { value: string }[];
          item_dimensions?: Record<string, { unit: string; value: number }>;
        };
        const id = o['3dmodel_id'];
        if (!id || listings[id]) continue;
        const name =
          o.item_name?.find((n) => n.language_tag.startsWith('en'))?.value ??
          o.item_name?.[0]?.value ??
          '';
        const dimensions: AboListing['dimensions'] = {};
        for (const key of ['height', 'length', 'width'] as const) {
          const d = o.item_dimensions?.[key];
          if (d) dimensions[key] = { unit: d.unit, value: d.value };
        }
        listings[id] = {
          itemId: o.item_id,
          name: name.replace(/&amp;/g, '&'),
          productType: o.product_type?.[0]?.value ?? '',
          dimensions,
        };
      }
    }
    const index: AboIndex = { paths, listings };
    await fs.writeFile(indexFile, JSON.stringify(index));
    return index;
  })();
  return aboIndex;
}

const UNIT_TO_M: Record<string, number> = {
  inches: 0.0254,
  centimeters: 0.01,
  millimeters: 0.001,
  meters: 1,
  feet: 0.3048,
};

async function aboSource(id: string): Promise<SourceInfo> {
  const index = await loadAboIndex();
  const file = index.paths[id];
  const listing = index.listings[id];
  if (!file || !listing) throw new Error(`ABO model ${id} not found in 3dmodels.csv or listings`);
  const url = `${ABO_BASE}/3dmodels/original/${file}`;
  const local = await assertGlb(await download(url, path.join(ABO_DIR, 'models', `${id}.glb`)));

  const parts: string[] = [];
  const values: number[] = [];
  for (const key of ['length', 'width', 'height'] as const) {
    const d = listing.dimensions[key];
    if (!d) continue;
    const factor = UNIT_TO_M[d.unit];
    if (!factor) throw new Error(`ABO ${id}: unknown unit ${d.unit}`);
    values.push(d.value * factor);
    parts.push(`${key} ${+d.value.toFixed(2)} ${d.unit === 'inches' ? 'in' : d.unit}`);
  }
  return {
    file: local,
    title: listing.name,
    author: 'Amazon.com',
    library: 'Amazon Berkeley Objects',
    license: 'CC-BY-4.0',
    licenseUrl: CC_BY,
    credit: 'Amazon.com',
    sourceUrl: url,
    copyright: 'Amazon.com',
    listed:
      values.length === 3
        ? {
            values: values as [number, number, number],
            text: parts.join(', '),
            source: `ABO product listing ${listing.itemId} (item_dimensions)`,
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Poly Haven (CC0). The API asks for a User-Agent naming the software (sent by download()).

const PH_DIR = path.join(CACHE_DIR, 'polyhaven');
const PH_RESOLUTION = '1k';

interface PolyHavenInfo {
  name: string;
  authors: Record<string, string>;
  /** Millimetres along Blender X (width), Y (depth) and Z (height). */
  dimensions?: [number, number, number];
}

interface PolyHavenFile {
  url: string;
  md5: string;
  size: number;
}

type PolyHavenFiles = {
  gltf: Record<string, { gltf: PolyHavenFile & { include?: Record<string, PolyHavenFile> } }>;
};

async function polyHavenSource(slug: string): Promise<SourceInfo> {
  const dir = path.join(PH_DIR, slug);
  const info = await fetchJson<PolyHavenInfo>(
    `https://api.polyhaven.com/info/${slug}`,
    path.join(dir, 'info.json'),
  );
  const files = await fetchJson<PolyHavenFiles>(
    `https://api.polyhaven.com/files/${slug}`,
    path.join(dir, 'files.json'),
  );
  const gltf = files.gltf[PH_RESOLUTION]?.gltf;
  if (!gltf) throw new Error(`Poly Haven ${slug}: no ${PH_RESOLUTION} glTF download`);
  const filesDir = path.join(dir, PH_RESOLUTION);
  const local = await download(gltf.url, path.join(filesDir, path.basename(gltf.url)), gltf.md5);
  for (const [rel, f] of Object.entries(gltf.include ?? {})) {
    const dest = path.resolve(filesDir, rel);
    if (!dest.startsWith(filesDir + path.sep)) throw new Error(`Bad include path ${rel}`);
    await download(f.url, dest, f.md5);
  }
  const author = Object.keys(info.authors).join(', ');
  const dims = info.dimensions;
  return {
    file: local,
    title: info.name,
    author,
    library: 'Poly Haven',
    license: 'CC0-1.0',
    licenseUrl: CC0,
    credit: `${author}, Poly Haven`,
    sourceUrl: `https://polyhaven.com/a/${slug}`,
    listed: dims
      ? {
          values: [dims[0] / 1000, dims[1] / 1000, dims[2] / 1000],
          text: `${dims.map((v) => Math.round(v)).join(' x ')} mm`,
          source: `Poly Haven API dimensions (api.polyhaven.com/info/${slug})`,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Khronos glTF-Sample-Assets, pinned to one commit. Only CC0 and CC BY 4.0 models are allowed.

export const KHRONOS_COMMIT = '8f492390ddc7a2ae221a1369ef560589cf8c70fb';
const KH_DIR = path.join(CACHE_DIR, 'khronos');

/** What each model's README says about its real-world size. */
const KHRONOS_SCALE_NOTES: Record<string, string> = {
  GlamVelvetSofa:
    'Khronos README: "represents a real product, a velvet sofa bed" (86 in wide); used at its own size (2.188 m = 86.1 in wide)',
  SheenChair:
    'Khronos README: fabrics matched to a real Wayfair slipper chair; used at its own size (glTF units are metres)',
  LightsPunctualLamp:
    'Khronos README gives no product size; used at its own size (glTF units are metres, 1.86 m tall)',
};

interface KhronosMetadata {
  name: string;
  legal: { spdx: string; artist: string; owner: string; year: string; what: string }[];
}

async function khronosSource(model: string): Promise<SourceInfo> {
  const base = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${KHRONOS_COMMIT}/Models/${model}`;
  const meta = await fetchJson<KhronosMetadata>(
    `${base}/metadata.json`,
    path.join(KH_DIR, model, 'metadata.json'),
  );
  const spdx = new Set(meta.legal.map((l) => l.spdx));
  for (const s of spdx) {
    if (s !== 'CC0-1.0' && s !== 'CC-BY-4.0') {
      throw new Error(`Khronos ${model}: licence ${s} is not CC0-1.0 or CC-BY-4.0`);
    }
  }
  const license: CatalogLicense = spdx.has('CC-BY-4.0') ? 'CC-BY-4.0' : 'CC0-1.0';
  const local = await assertGlb(
    await download(`${base}/glTF-Binary/${model}.glb`, path.join(KH_DIR, model, `${model}.glb`)),
  );
  const owners = [...new Set(meta.legal.map((l) => l.owner.replace(/^Copyright \d{4} /, '')))];
  const artists = [...new Set(meta.legal.map((l) => l.artist))];
  const credit = owners
    .map((o) => (artists.includes(o) ? o : `${o} (${artists.join(', ')})`))
    .join('; ');
  const scaleNote = KHRONOS_SCALE_NOTES[model];
  if (!scaleNote) throw new Error(`Khronos ${model}: add a real-scale note to KHRONOS_SCALE_NOTES`);
  return {
    file: local,
    title: meta.name,
    author: artists.join(', '),
    library: 'Khronos glTF Sample Assets',
    license,
    licenseUrl: license === 'CC0-1.0' ? CC0 : CC_BY,
    credit,
    sourceUrl: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/${KHRONOS_COMMIT}/Models/${model}`,
    copyright: meta.legal
      .map((l) => `© ${l.year} ${l.owner.replace(/^Copyright \d{4} /, '')}`)
      .join('; '),
    realScaleNote: scaleNote,
  };
}
