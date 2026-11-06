/**
 * What an image file is, read from its first bytes (no image library on the server): its type
 * and its size in pixels. Used to check the uploaded source, to label the product pictures, and
 * to record the size of the picture AI made.
 */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

/** The source image's sides must be within these (pixels). */
export const SOURCE_MIN_SIDE = 256;
export const SOURCE_MAX_SIDE = 8192;

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + u16be(b, i + 2);
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** JPEG: the size is in the first start-of-frame marker (SOF0 to SOF15, not DHT, JPG or DAC). */
function jpegInfo(b: Uint8Array): ImageInfo | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    // Markers without a length: TEM and RST0..RST7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      return width > 0 && height > 0 ? { mime: 'image/jpeg', width, height } : null;
    }
    // Start of scan before any frame: not a usable JPEG.
    if (marker === 0xda) return null;
    i += 2 + length;
  }
  return null;
}

/** WebP: lossy (VP8), lossless (VP8L) or extended (VP8X). */
function webpInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') {
    return { mime: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { mime: 'image/webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === 'VP8L' && b[20] === 0x2f) {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return {
      mime: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

/** The image's type and size, or null when it is not a JPEG, PNG or WebP image. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpegInfo(b);
  if (b.length >= 24 && u32be(b, 0) === 0x89504e47 && u32be(b, 4) === 0x0d0a1a0a) {
    if (ascii(b, 12, 4) !== 'IHDR') return null;
    const width = u32be(b, 16);
    const height = u32be(b, 20);
    return width > 0 && height > 0 ? { mime: 'image/png', width, height } : null;
  }
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return webpInfo(b);
  return null;
}

/** Why a source image cannot be used, or null when it can. */
export function sourceProblem(info: ImageInfo | null): string | null {
  if (!info) return 'not a JPEG, PNG or WebP image';
  const short = Math.min(info.width, info.height);
  const long = Math.max(info.width, info.height);
  if (short < SOURCE_MIN_SIDE) return `too small (${info.width} × ${info.height})`;
  if (long > SOURCE_MAX_SIDE) return `too big (${info.width} × ${info.height})`;
  if (long / short > 3) return `too long and thin (${info.width} × ${info.height})`;
  return null;
}

/** The aspect ratios the image model makes. */
export const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/**
 * The model's aspect ratio closest to a width × height image (compared as logarithms, so 3:4 and
 * 4:3 are as far from 1:1). The picture AI makes keeps the source's framing best at its ratio.
 */
export function closestAspectRatio(width: number, height: number): AspectRatio {
  const target = Math.log(width / height);
  let best: AspectRatio = '1:1';
  let bestGap = Infinity;
  for (const ratio of ASPECT_RATIOS) {
    const [w, h] = ratio.split(':').map(Number) as [number, number];
    const gap = Math.abs(Math.log(w / h) - target);
    if (gap < bestGap) {
      best = ratio;
      bestGap = gap;
    }
  }
  return best;
}
