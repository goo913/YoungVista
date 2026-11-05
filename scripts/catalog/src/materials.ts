/**
 * Turns materials into core glTF 2.0 that ViroReact can render. ViroCore's glTF loader
 * (ReactVision/virocore, ViroRenderer/VROGLTFLoader.cpp) reads only TEXCOORD_0, ignores each
 * texture's `texCoord`, does not apply KHR_texture_transform, and adds KHR_lights_punctual lights to
 * the scene. So: pick one look from KHR_materials_variants, remove lights, bake texture transforms
 * into UVs or textures, move everything to TEXCOORD_0, approximate sheen and transmission with
 * core factors, then drop every extension.
 */
import type { Document, Material, Primitive, Texture, TextureInfo } from '@gltf-transform/core';
import type {
  EmissiveStrength,
  KHRMaterialsVariants,
  MappingList,
  Sheen,
  Transform,
  Transmission,
} from '@gltf-transform/extensions';
import { metalRough, prune } from '@gltf-transform/functions';
import { decodeRGBA, encodePng, meanRGBA, resample } from './images.ts';

type Slot = 'baseColor' | 'metallicRoughness' | 'normal' | 'occlusion' | 'emissive';

interface Use {
  slot: Slot;
  info: TextureInfo;
  texture: Texture;
  uvSet: number;
  /** Row-major 2x3 affine UV transform [a, b, c, d, e, f]: u' = a u + b v + c, v' = d u + e v + f. */
  m: number[];
}

const IDENTITY = [1, 0, 0, 0, 1, 0];

function textureUses(mat: Material): Use[] {
  const pairs: [Slot, TextureInfo | null, Texture | null][] = [
    ['baseColor', mat.getBaseColorTextureInfo(), mat.getBaseColorTexture()],
    ['metallicRoughness', mat.getMetallicRoughnessTextureInfo(), mat.getMetallicRoughnessTexture()],
    ['normal', mat.getNormalTextureInfo(), mat.getNormalTexture()],
    ['occlusion', mat.getOcclusionTextureInfo(), mat.getOcclusionTexture()],
    ['emissive', mat.getEmissiveTextureInfo(), mat.getEmissiveTexture()],
  ];
  const uses: Use[] = [];
  for (const [slot, info, texture] of pairs) {
    if (!info || !texture) continue;
    const t = info.getExtension<Transform>('KHR_texture_transform');
    let m = IDENTITY;
    let uvSet = info.getTexCoord();
    if (t) {
      // Same matrix as three.js (Matrix3.setUvTransform, used by its GLTFLoader), so the baked
      // result matches what the website showed for the original file.
      const [ox, oy] = t.getOffset();
      const [sx, sy] = t.getScale();
      const r = t.getRotation();
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      m = [sx * cos, sx * sin, ox, -sy * sin, sy * cos, oy];
      uvSet = t.getTexCoord() ?? uvSet;
    }
    uses.push({ slot, info, texture, uvSet, m });
  }
  return uses;
}

const sameM = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
const isIdentity = (m: number[]) => sameM(m, IDENTITY);

function uvRange(prims: Primitive[], set: number): [number, number, number, number] {
  let [minU, minV, maxU, maxV] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const a = p.getAttribute(`TEXCOORD_${set}`);
    if (!a) continue;
    const el = [0, 0];
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, el);
      minU = Math.min(minU, el[0]!);
      maxU = Math.max(maxU, el[0]!);
      minV = Math.min(minV, el[1]!);
      maxV = Math.max(maxV, el[1]!);
    }
  }
  return [minU, minV, maxU, maxV];
}

/** Writes TEXCOORD_0 of each primitive as `m` applied to its TEXCOORD_<set>. */
function bakeUVs(doc: Document, prims: Primitive[], set: number, m: number[]): void {
  for (const p of prims) {
    const src = p.getAttribute(`TEXCOORD_${set}`);
    if (!src) throw new Error(`Primitive is missing TEXCOORD_${set}`);
    const dst = doc.createAccessor().setType('VEC2').setBuffer(src.getBuffer());
    const out = new Float32Array(src.getCount() * 2);
    const el = [0, 0];
    for (let i = 0; i < src.getCount(); i++) {
      src.getElement(i, el);
      const [u, v] = el as [number, number];
      out[i * 2] = m[0]! * u + m[1]! * v + m[2]!;
      out[i * 2 + 1] = m[3]! * u + m[4]! * v + m[5]!;
    }
    dst.setArray(out);
    p.setAttribute('TEXCOORD_0', dst);
  }
}

function setSlot(mat: Material, slot: Slot, texture: Texture | null): void {
  switch (slot) {
    case 'baseColor':
      mat.setBaseColorTexture(texture);
      break;
    case 'metallicRoughness':
      mat.setMetallicRoughnessTexture(texture);
      break;
    case 'normal':
      mat.setNormalTexture(texture);
      break;
    case 'occlusion':
      mat.setOcclusionTexture(texture);
      break;
    case 'emissive':
      mat.setEmissiveTexture(texture);
      break;
  }
}

/** Replaces a texture by its average, folded into the material factor. */
async function flattenToFactor(mat: Material, use: Use, notes: string[]): Promise<void> {
  const mean = meanRGBA(await decodeRGBA(use.texture.getImage()!)).map((v) => v / 255);
  const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  if (use.slot === 'baseColor') {
    const f = mat.getBaseColorFactor();
    mat.setBaseColorFactor([
      f[0] * srgbToLinear(mean[0]!),
      f[1] * srgbToLinear(mean[1]!),
      f[2] * srgbToLinear(mean[2]!),
      f[3] * mean[3]!,
    ]);
  } else if (use.slot === 'metallicRoughness') {
    mat.setRoughnessFactor(mat.getRoughnessFactor() * mean[1]!);
    mat.setMetallicFactor(mat.getMetallicFactor() * mean[2]!);
  } else if (use.slot === 'emissive') {
    const f = mat.getEmissiveFactor();
    mat.setEmissiveFactor([f[0] * mean[0]!, f[1] * mean[1]!, f[2] * mean[2]!]);
  }
  setSlot(mat, use.slot, null);
  const what =
    use.slot === 'normal' || use.slot === 'occlusion' ? 'dropped' : 'flattened to its average';
  notes.push(
    `${mat.getName() || 'material'}: ${use.slot} texture ${what} (tiled on another UV layout)`,
  );
}

/** Bakes a tiling transform into a new image laid out on the untransformed UVs (0-1). */
async function bakeTiling(doc: Document, mat: Material, use: Use, notes: string[]): Promise<void> {
  const src = await decodeRGBA(use.texture.getImage()!);
  const size = Math.min(1024, Math.max(src.width, src.height));
  const m = use.m;
  const img = resample(src, size, size, (u, v) => [
    m[0]! * u + m[1]! * v + m[2]!,
    m[3]! * u + m[4]! * v + m[5]!,
  ]);
  const tex = doc
    .createTexture(`${use.texture.getName()}_baked`)
    .setImage(await encodePng(img))
    .setMimeType('image/png');
  setSlot(mat, use.slot, tex);
  notes.push(`${mat.getName() || 'material'}: ${use.slot} tiling baked into the texture`);
}

/**
 * Resolves texture transforms and extra UV sets so every texture of every material reads
 * TEXCOORD_0 untransformed.
 */
async function resolveUVs(doc: Document, notes: string[]): Promise<void> {
  const root = doc.getRoot();
  const primsByMat = new Map<Material, Primitive[]>();
  for (const mesh of root.listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      const mat = p.getMaterial();
      if (mat) primsByMat.set(mat, [...(primsByMat.get(mat) ?? []), p]);
    }
  }
  for (const [mat, prims] of primsByMat) {
    const uses = textureUses(mat);
    if (!uses.length) continue;
    const allSame = uses.every((u) => u.uvSet === uses[0]!.uvSet && sameM(u.m, uses[0]!.m));
    let anchor = uses[0]!;
    if (!allSame) {
      // Keep the textures laid out on a unique UV layout (no transform, the occlusion map if any)
      // and bake or flatten the tiled ones.
      anchor =
        uses.find((u) => u.slot === 'occlusion' && isIdentity(u.m)) ??
        uses.find((u) => isIdentity(u.m)) ??
        uses.find((u) => u.slot === 'baseColor') ??
        uses[0]!;
      const [minU, minV, maxU, maxV] = uvRange(prims, anchor.uvSet);
      const inUnit = minU >= -1e-3 && minV >= -1e-3 && maxU <= 1 + 1e-3 && maxV <= 1 + 1e-3;
      for (const use of uses) {
        if (use === anchor || (use.uvSet === anchor.uvSet && sameM(use.m, anchor.m))) continue;
        if (use.uvSet === anchor.uvSet && isIdentity(anchor.m) && inUnit) {
          await bakeTiling(doc, mat, use, notes);
        } else {
          await flattenToFactor(mat, use, notes);
        }
      }
    }
    if (anchor.uvSet !== 0 || !isIdentity(anchor.m)) bakeUVs(doc, prims, anchor.uvSet, anchor.m);
    for (const use of textureUses(mat)) {
      use.info.setTexCoord(0);
      use.info.setExtension('KHR_texture_transform', null);
    }
  }
}

/** Applies one KHR_materials_variants look (by name), or keeps the default materials. */
function applyVariant(doc: Document, variantName: string | undefined): void {
  const ext = doc
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === 'KHR_materials_variants') as KHRMaterialsVariants | undefined;
  if (!ext) {
    if (variantName)
      throw new Error(`No KHR_materials_variants in the source for "${variantName}"`);
    return;
  }
  if (variantName) {
    if (!ext.listVariants().some((v) => v.getName() === variantName)) {
      throw new Error(
        `Variant "${variantName}" not found; source has ${ext.listVariants().map((v) => v.getName())}`,
      );
    }
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const p of mesh.listPrimitives()) {
        const list = p.getExtension<MappingList>('KHR_materials_variants');
        const mapping = list
          ?.listMappings()
          .find((m) => m.listVariants().some((v) => v.getName() === variantName));
        const mat = mapping?.getMaterial();
        if (mat) p.setMaterial(mat);
      }
    }
  }
  ext.dispose();
}

/**
 * Linear-space blend toward the sheen colour: velvet reads lighter and tinted by its sheen. Dark
 * velvets get most of their visible colour from sheen; light ones barely change.
 */
const SHEEN_WEIGHT = 0.3;

function bakeFactors(mat: Material, notes: string[]): void {
  const name = mat.getName() || 'material';
  const sheen = mat.getExtension<Sheen>('KHR_materials_sheen');
  if (sheen) {
    const s = sheen.getSheenColorFactor();
    const b = mat.getBaseColorFactor();
    const luminance = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2];
    const k = SHEEN_WEIGHT * (1 - luminance) ** 2;
    mat.setBaseColorFactor([
      b[0] + k * s[0] * (1 - b[0]),
      b[1] + k * s[1] * (1 - b[1]),
      b[2] + k * s[2] * (1 - b[2]),
      b[3],
    ]);
    notes.push(`${name}: sheen blended into the base colour`);
    // Some velvets fake coloured reflections with full metalness; without sheen that renders as
    // dark metal, so fabric becomes a plain dielectric.
    if (mat.getMetallicFactor() > 0.5 && !mat.getMetallicRoughnessTexture()) {
      mat.setMetallicFactor(0);
      notes.push(`${name}: metalness set to 0 (fabric)`);
    }
  }
  const transmission = mat.getExtension<Transmission>('KHR_materials_transmission');
  if (transmission && transmission.getTransmissionFactor() > 0) {
    const rough = mat.getRoughnessFactor();
    if (!mat.getMetallicRoughnessTexture() && rough < 0.5) {
      // Clear glass: alpha blending is the closest core glTF has.
      const b = mat.getBaseColorFactor();
      const alpha = Math.max(0.2, b[3] * (1 - 0.75 * transmission.getTransmissionFactor()));
      mat.setAlphaMode('BLEND').setBaseColorFactor([b[0], b[1], b[2], alpha]);
      notes.push(`${name}: transmission approximated with alpha ${alpha.toFixed(2)}`);
    } else {
      notes.push(`${name}: transmission dropped (rough or textured surface stays opaque)`);
    }
  }
  const strength = mat.getExtension<EmissiveStrength>('KHR_materials_emissive_strength');
  if (strength) {
    const e = mat.getEmissiveFactor();
    const k = strength.getEmissiveStrength();
    mat.setEmissiveFactor([Math.min(1, e[0] * k), Math.min(1, e[1] * k), Math.min(1, e[2] * k)]);
  }
}

/**
 * Alpha blending sorts badly in real-time renderers (three.js turns depth writes off for it), so a
 * BLEND material whose texture alpha is really on/off becomes an alpha-tested MASK, and one with
 * no transparent texels becomes OPAQUE.
 */
async function simplifyAlpha(doc: Document, notes: string[]): Promise<void> {
  for (const mat of doc.getRoot().listMaterials()) {
    if (mat.getAlphaMode() !== 'BLEND' || mat.getBaseColorFactor()[3] < 0.999) continue;
    const image = mat.getBaseColorTexture()?.getImage();
    if (!image) continue;
    const img = await decodeRGBA(image);
    let partial = 0;
    let clear = 0;
    for (let i = 3; i < img.data.length; i += 4) {
      const a = img.data[i]!;
      if (a > 12 && a < 243) partial++;
      if (a < 128) clear++;
    }
    const n = img.width * img.height;
    const name = mat.getName() || 'material';
    if (clear === 0) {
      mat.setAlphaMode('OPAQUE');
      notes.push(`${name}: BLEND without transparent texels made OPAQUE`);
    } else if (partial / n < 0.02) {
      mat.setAlphaMode('MASK').setAlphaCutoff(0.5);
      notes.push(`${name}: on/off alpha changed from BLEND to MASK`);
    }
  }
}

/**
 * Prepares a source document's materials for ViroReact. Returns notes describing what was
 * baked or dropped.
 */
export async function bakeMaterials(doc: Document, variantName?: string): Promise<string[]> {
  const notes: string[] = [];
  const root = doc.getRoot();
  applyVariant(doc, variantName);
  // Drop the other looks' materials before baking anything. Attributes stay: pruning them would
  // renumber TEXCOORD_n without updating KHR_texture_transform's texCoord override.
  await doc.transform(prune({ keepAttributes: true, keepSolidTextures: true }));

  if (
    root.listExtensionsUsed().some((e) => e.extensionName === 'KHR_materials_pbrSpecularGlossiness')
  ) {
    await doc.transform(metalRough());
    notes.push('specular-glossiness converted to metal-roughness');
  }
  for (const mat of root.listMaterials()) bakeFactors(mat, notes);
  await resolveUVs(doc, notes);
  await simplifyAlpha(doc, notes);

  const dropped = root
    .listExtensionsUsed()
    .map((e) => e.extensionName)
    .filter((n) => n !== 'KHR_texture_transform');
  if (dropped.length) notes.push(`extensions removed: ${dropped.join(', ')}`);
  for (const ext of root.listExtensionsUsed()) ext.dispose();
  return notes;
}
