import sharp from 'sharp';

/** 8-bit RGBA pixels, row-major from the top-left. */
export interface RawImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export async function decodeRGBA(encoded: Uint8Array): Promise<RawImage> {
  const { data, info } = await sharp(encoded)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
  };
}

/** Bilinear sample with REPEAT wrapping. `u`, `v` in texture space (0-1 covers the image once). */
export function sampleRepeat(img: RawImage, u: number, v: number, out: Float64Array): void {
  const x = u * img.width - 0.5;
  const y = v * img.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrapX = (i: number) => ((i % img.width) + img.width) % img.width;
  const wrapY = (i: number) => ((i % img.height) + img.height) % img.height;
  const xa = wrapX(x0);
  const xb = wrapX(x0 + 1);
  const ya = wrapY(y0);
  const yb = wrapY(y0 + 1);
  const d = img.data;
  for (let c = 0; c < 4; c++) {
    const p00 = d[(ya * img.width + xa) * 4 + c]!;
    const p10 = d[(ya * img.width + xb) * 4 + c]!;
    const p01 = d[(yb * img.width + xa) * 4 + c]!;
    const p11 = d[(yb * img.width + xb) * 4 + c]!;
    out[c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
  }
}

/**
 * Makes a new image whose pixel at texture coordinate (u, v) is the source sampled at
 * `map(u, v)`. Used to bake a KHR_texture_transform tiling into the texture itself.
 */
export function resample(
  src: RawImage,
  width: number,
  height: number,
  map: (u: number, v: number) => [number, number],
): RawImage {
  const data = new Uint8Array(width * height * 4);
  const px = new Float64Array(4);
  // 2x2 supersampling keeps the tiled detail from aliasing when many tiles land in one image.
  const offsets = [0.25, 0.75];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const acc = [0, 0, 0, 0];
      for (const oy of offsets) {
        for (const ox of offsets) {
          const [su, sv] = map((x + ox) / width, (y + oy) / height);
          sampleRepeat(src, su, sv, px);
          for (let c = 0; c < 4; c++) acc[c]! += px[c]! / 4;
        }
      }
      for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round(acc[c]!);
    }
  }
  return { data, width, height };
}

/** Mean of each channel, 0-255. */
export function meanRGBA(img: RawImage): [number, number, number, number] {
  const sum = [0, 0, 0, 0];
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) sum[c]! += img.data[i * 4 + c]!;
  return sum.map((s) => s / n) as [number, number, number, number];
}

export function hasTransparency(img: RawImage): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 250) return true;
  return false;
}

export async function encodePng(img: RawImage): Promise<Uint8Array> {
  const buf = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return new Uint8Array(buf);
}
