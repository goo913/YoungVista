import type { Document, Texture } from '@gltf-transform/core';
import { listTextureSlots } from '@gltf-transform/functions';
import sharp from 'sharp';
import { decodeRGBA, hasTransparency } from './images.ts';

export interface TextureOptions {
  /** Longest side in pixels (1024 at most). */
  maxSize: number;
}

/** JPEG quality per kind of map. Data maps keep full chroma so channels do not bleed. */
const JPEG = {
  color: { quality: 82, chromaSubsampling: '4:2:0' },
  normal: { quality: 86, chromaSubsampling: '4:4:4' },
  data: { quality: 84, chromaSubsampling: '4:4:4' },
} as const;

function needsAlpha(doc: Document, texture: Texture): boolean {
  return doc
    .getRoot()
    .listMaterials()
    .some((m) => m.getBaseColorTexture() === texture && m.getAlphaMode() !== 'OPAQUE');
}

/**
 * Resizes every texture to `maxSize` or less and stores it as JPEG, or PNG when its alpha is
 * really used (MASK or BLEND materials with transparent pixels). Returns notes.
 */
export async function encodeTextures(doc: Document, opts: TextureOptions): Promise<string[]> {
  const notes: string[] = [];
  const maxSize = Math.min(1024, opts.maxSize);
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const slots = listTextureSlots(texture);
    const kind = slots.some((s) => s === 'baseColorTexture' || s === 'emissiveTexture')
      ? 'color'
      : slots.includes('normalTexture')
        ? 'normal'
        : 'data';
    const meta = await sharp(image).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const scale = Math.min(1, maxSize / Math.max(width, height));
    let pipeline = sharp(image);
    if (scale < 1) {
      pipeline = pipeline.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        kernel: 'lanczos3',
      });
    }
    let out: Buffer;
    let mime: string;
    if (needsAlpha(doc, texture) && hasTransparency(await decodeRGBA(image))) {
      out = await pipeline
        .ensureAlpha()
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
      mime = 'image/png';
    } else {
      out = await pipeline
        .removeAlpha()
        .jpeg({ ...JPEG[kind], mozjpeg: true })
        .toBuffer();
      mime = 'image/jpeg';
    }
    const name = slots.map((s) => s.replace(/Texture$/, '')).join('+') || 'texture';
    texture.setImage(new Uint8Array(out)).setMimeType(mime).setURI('').setName(name);
    if (scale < 1) notes.push(`${name}: ${width}x${height} -> ${Math.round(width * scale)}px`);
  }
  return notes;
}
