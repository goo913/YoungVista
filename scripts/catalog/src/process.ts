import fs from 'node:fs/promises';
import path from 'node:path';
import { type Document, Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  backrestOffset,
  countTriangles,
  finaliseAttributes,
  flattenTransforms,
  forEachTriangle,
  normalise,
  optimiseGeometry,
  rotateY,
  sceneBounds,
  stripScene,
  type Box,
} from './geometry.ts';
import { decodeRGBA, sampleRepeat } from './images.ts';
import { bakeMaterials } from './materials.ts';
import { MODELS_DIR } from './paths.ts';
import { resolveSource } from './sources.ts';
import { encodeTextures } from './textures.ts';
import type { BuildRecord, GlbRecord, ModelSpec, SourceInfo } from './types.ts';
import { linearToSrgbByte, round, srgbByteToLinear, toHex } from './util.ts';

/** Categories whose back (backrest or headboard) must sit at -Z. */
const HAS_BACK = new Set(['sofa', 'sectional', 'armchair', 'dining-chair', 'office-chair', 'bed']);

const LOGGER = new Logger(Logger.Verbosity.WARN);

export function createIO(): NodeIO {
  return new NodeIO().setLogger(LOGGER).registerExtensions(ALL_EXTENSIONS);
}

export const modelFile = (id: string, variant?: string) =>
  `models/${variant ? `${id}--${variant}` : id}.glb`;
export const thumbFile = (id: string, variant?: string) =>
  `thumbs/${variant ? `${id}--${variant}` : id}.webp`;

interface Target {
  w: number;
  d: number;
  h: number;
  source: string;
}

const PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;

function size(box: Box): [number, number, number] {
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

const fmt = (v: number[]) => v.map((x) => x.toFixed(3)).join(' x ');

/** Decides the real size (W along X, D along Z, H along Y) for a model from its source. */
function decideTarget(spec: ModelSpec, source: SourceInfo, box: Box): Target {
  const [bx, by, bz] = size(box);
  if (spec.dims) return { ...spec.dims };
  if (source.listed) {
    // Listing labels are unreliable (ABO "length" can be the width), so the three listed values
    // are matched to the model's own axes: the assignment closest to the model's size wins.
    const v = source.listed.values;
    let best: { x: number; y: number; z: number; cost: number } | undefined;
    for (const [i, j, k] of PERMUTATIONS) {
      const x = v[i]!;
      const y = v[j]!;
      const z = v[k]!;
      const cost = Math.max(
        Math.abs(Math.log(x / bx)),
        Math.abs(Math.log(y / by)),
        Math.abs(Math.log(z / bz)),
      );
      if (!best || cost < best.cost) best = { x, y, z, cost };
    }
    return {
      w: round(best!.x),
      h: round(best!.y),
      d: round(best!.z),
      source: `${source.listed.source}: ${source.listed.text}`,
    };
  }
  if (source.realScaleNote) {
    return { w: round(bx), h: round(by), d: round(bz), source: source.realScaleNote };
  }
  throw new Error(`${spec.id}: no listed dimensions; add "dims" to the manifest`);
}

/**
 * Refuses to stretch a model by more than `maxStretch` on any axis (changes of 5 mm or less
 * aside), or to rescale it by more than 10% overall: either means the listed size and the model
 * disagree, so a human must decide.
 */
function checkStretch(spec: ModelSpec, box: Box, t: Target): string {
  const [bx, by, bz] = size(box);
  const s = [t.w / bx, t.h / by, t.d / bz];
  const sorted = [...s].sort((a, b) => a - b);
  const median = sorted[1]!;
  // A few millimetres never matter (e.g. a rug's thickness), whatever the percentage.
  const own = [bx, by, bz];
  const stretch = Math.max(
    ...s.map((v, i) => (Math.abs(v - median) * own[i]! <= 0.005 ? 0 : Math.abs(v / median - 1))),
  );
  const limit = spec.maxStretch ?? 0.05;
  const note = `source ${fmt([bx, bz, by])} m (W x D x H), scaled x${s[0]!.toFixed(3)} / x${s[2]!.toFixed(3)} / x${s[1]!.toFixed(3)}`;
  if (!spec.dims && Math.abs(median - 1) > 0.1) {
    throw new Error(
      `${spec.id}: listed size is ${median.toFixed(2)}x the model's own size (${note})`,
    );
  }
  if (stretch > limit) {
    throw new Error(
      `${spec.id}: listed size would stretch the model ${(stretch * 100).toFixed(1)}% on one axis (limit ${limit * 100}%): ${note}`,
    );
  }
  return note;
}

/** Area-weighted average colour of the largest material, as a CSS hex swatch. */
async function swatch(doc: Document): Promise<string> {
  const areaByMat = new Map<unknown, number>();
  forEachTriangle(doc, (p, area) => {
    const m = p.getMaterial();
    areaByMat.set(m, (areaByMat.get(m) ?? 0) + area);
  });
  const mat = [...areaByMat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as
    ReturnType<import('@gltf-transform/core').Primitive['getMaterial']> | undefined;
  if (!mat) return '#808080';
  const f = mat.getBaseColorFactor();
  const tex = mat.getBaseColorTexture();
  const lin = [f[0], f[1], f[2]];
  if (tex?.getImage()) {
    const img = await decodeRGBA(tex.getImage()!);
    const px = new Float64Array(4);
    const uv = [0, 0];
    const sum = [0, 0, 0];
    let weight = 0;
    forEachTriangle(doc, (p, area, _c, idx) => {
      if (p.getMaterial() !== mat || !area) return;
      const attr = p.getAttribute('TEXCOORD_0');
      if (!attr) return;
      let u = 0;
      let v = 0;
      for (const i of idx) {
        attr.getElement(i, uv);
        u += uv[0]! / 3;
        v += uv[1]! / 3;
      }
      sampleRepeat(img, u, v, px);
      for (let k = 0; k < 3; k++) sum[k]! += srgbByteToLinear(px[k]!) * area;
      weight += area;
    });
    if (weight) for (let k = 0; k < 3; k++) lin[k]! *= sum[k]! / weight;
  }
  return toHex(lin.map(linearToSrgbByte) as [number, number, number]);
}

function setCopyright(doc: Document, source: SourceInfo): void {
  const licence = source.license === 'CC0-1.0' ? 'CC0 1.0' : 'CC BY 4.0';
  doc
    .getRoot()
    .getAsset().copyright = `${source.copyright ?? source.credit}. ${licence} (${source.licenseUrl}). Source: ${source.sourceUrl}. Modified: rescaled and optimised.`;
}

interface Look {
  variantId?: string;
  name?: string;
  source: SourceInfo;
  khrVariant?: string;
}

async function buildLook(
  spec: ModelSpec,
  look: Look,
  targetIn: Target | undefined,
): Promise<{ record: GlbRecord; target: Target; stretch: string; frontCheck?: string }> {
  const io = createIO();
  const doc = (await io.read(look.source.file)).setLogger(LOGGER);
  const notes: string[] = [];
  stripScene(doc);
  notes.push(...(await bakeMaterials(doc, look.khrVariant)));
  await flattenTransforms(doc);
  if (spec.rotateY) {
    rotateY(doc, spec.rotateY);
    notes.push(`turned ${spec.rotateY} degrees about +Y`);
  }
  const geo = await optimiseGeometry(doc, spec.maxTriangles ?? 50_000);
  notes.push(...geo.notes);
  const box = sceneBounds(doc);
  const target = targetIn ?? decideTarget(spec, look.source, box);
  const stretch = checkStretch(spec, box, target);
  normalise(doc, target);
  notes.push(...(await finaliseAttributes(doc)));
  notes.push(...(await encodeTextures(doc, { maxSize: spec.maxTexture ?? 1024 })));
  setCopyright(doc, look.source);

  let frontCheck: string | undefined;
  if (HAS_BACK.has(spec.category)) {
    const offset = backrestOffset(doc);
    if (offset > -0.1) {
      throw new Error(
        `${spec.id}: the upper part is not behind the centre (offset ${offset.toFixed(2)}): front is not +Z`,
      );
    }
    frontCheck = `automatic: the top 40% of the surface is centred ${(-offset * 100).toFixed(0)}% of the half-depth behind the centre`;
  }

  const glb = await io.writeBinary(doc);
  const rel = modelFile(spec.id, look.variantId);
  await fs.mkdir(MODELS_DIR, { recursive: true });
  await fs.writeFile(path.join(MODELS_DIR, path.basename(rel)), glb);
  return {
    record: {
      file: rel,
      bytes: glb.byteLength,
      triangles: countTriangles(doc),
      swatch: await swatch(doc),
      notes,
    },
    target,
    stretch,
    frontCheck,
  };
}

export async function buildModel(spec: ModelSpec): Promise<BuildRecord> {
  const source = await resolveSource(spec.source);
  const main = await buildLook(
    spec,
    { source, khrVariant: spec.baseVariant?.khrVariant },
    undefined,
  );
  const variants: BuildRecord['variants'] = [];
  for (const v of spec.variants ?? []) {
    const vSource = 'abo' in v.from ? await resolveSource({ kind: 'abo', id: v.from.abo }) : source;
    const khrVariant = 'khrVariant' in v.from ? v.from.khrVariant : undefined;
    const built = await buildLook(
      spec,
      { variantId: v.id, source: vSource, khrVariant },
      main.target,
    );
    variants.push({
      ...built.record,
      id: v.id,
      name: v.name,
      ...(vSource !== source ? { sourceUrl: vSource.sourceUrl, title: vSource.title } : {}),
    });
  }
  const { file: _file, listed: _listed, realScaleNote: _note, ...credit } = source;
  return {
    id: spec.id,
    dims: { w: main.target.w, d: main.target.d, h: main.target.h },
    dimsSource: `${main.target.source} (${main.stretch})`,
    front: spec.front,
    ...(main.frontCheck ? { frontCheck: main.frontCheck } : {}),
    source: credit,
    main: main.record,
    variants,
    baseVariant: spec.baseVariant && { id: spec.baseVariant.id, name: spec.baseVariant.name },
  };
}
