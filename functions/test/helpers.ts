/** Image headers just long enough for `imageInfo` (functions/src/ai-image/images.ts). */

/** A baseline JPEG: SOI, an APP0 segment, then a start-of-frame with the size. */
export function jpeg(width: number, height: number, frame = 0xc0): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    // APP0 (JFIF), 16 bytes long.
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // A fill byte, then the frame: length 17, precision 8, height, width, 3 components.
    0xff,
    0xff,
    frame,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    ...new Array<number>(9).fill(0),
    0xff,
    0xd9,
  ]);
}

export function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set(
    [...'IHDR'].map((c) => c.charCodeAt(0)),
    12,
  );
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A lossy WebP (VP8): the size is in the key frame's header. */
export function webp(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set(ascii('RIFF'), 0);
  b.set(ascii('WEBP'), 8);
  b.set(ascii('VP8 '), 12);
  b.set([0x9d, 0x01, 0x2a], 23);
  new DataView(b.buffer).setUint16(26, width, true);
  new DataView(b.buffer).setUint16(28, height, true);
  return b;
}

/** A lossless WebP (VP8L): width - 1 and height - 1 in 14 bits each. */
export function webpLossless(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set(ascii('RIFF'), 0);
  b.set(ascii('WEBP'), 8);
  b.set(ascii('VP8L'), 12);
  b[20] = 0x2f;
  new DataView(b.buffer).setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return b;
}

/** An extended WebP (VP8X): the canvas size, minus one, in 24 bits each. */
export function webpExtended(width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set(ascii('RIFF'), 0);
  b.set(ascii('WEBP'), 8);
  b.set(ascii('VP8X'), 12);
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return b;
}
