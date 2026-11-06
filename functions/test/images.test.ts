import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { closestAspectRatio, imageInfo, sourceProblem } from '../src/ai-image/images';
import { jpeg, png, webp, webpExtended, webpLossless } from './helpers';

describe('image types and sizes from the first bytes', () => {
  it('reads JPEG, baseline and progressive, past fill bytes and other segments', () => {
    expect(imageInfo(jpeg(1536, 1024))).toEqual({ mime: 'image/jpeg', width: 1536, height: 1024 });
    expect(imageInfo(jpeg(2400, 1792, 0xc2))).toEqual({
      mime: 'image/jpeg',
      width: 2400,
      height: 1792,
    });
    // A Huffman table (0xC4) is not a frame.
    const huffman = jpeg(10, 10, 0xc4);
    expect(imageInfo(huffman)).toBeNull();
  });

  it('reads PNG and the three kinds of WebP', () => {
    expect(imageInfo(png(1179, 2556))).toEqual({ mime: 'image/png', width: 1179, height: 2556 });
    expect(imageInfo(webp(512, 512))).toEqual({ mime: 'image/webp', width: 512, height: 512 });
    expect(imageInfo(webpLossless(300, 200))).toEqual({
      mime: 'image/webp',
      width: 300,
      height: 200,
    });
    expect(imageInfo(webpExtended(4000, 3000))).toEqual({
      mime: 'image/webp',
      width: 4000,
      height: 3000,
    });
  });

  it("reads the catalog's own product pictures", () => {
    const bytes = readFileSync(
      new URL('../../apps/web/public/catalog/thumbs/sofa-velvet.webp', import.meta.url),
    );
    expect(imageInfo(new Uint8Array(bytes))).toEqual({
      mime: 'image/webp',
      width: 512,
      height: 512,
    });
  });

  it('refuses what is not an image', () => {
    expect(imageInfo(new Uint8Array())).toBeNull();
    expect(imageInfo(new TextEncoder().encode('<html>not a picture</html>'))).toBeNull();
    expect(imageInfo(jpeg(1, 1).subarray(0, 12))).toBeNull();
  });
});

describe('source checks', () => {
  it('takes ordinary pictures and refuses tiny, huge or strip-like ones', () => {
    expect(sourceProblem(imageInfo(jpeg(2048, 1536)))).toBeNull();
    expect(sourceProblem(imageInfo(png(945, 2048)))).toBeNull();
    expect(sourceProblem(null)).toMatch(/not a JPEG/);
    expect(sourceProblem(imageInfo(jpeg(200, 400)))).toMatch(/too small/);
    expect(sourceProblem(imageInfo(jpeg(9000, 6000)))).toMatch(/too big/);
    expect(sourceProblem(imageInfo(jpeg(3000, 600)))).toMatch(/thin/);
  });
});

describe('aspect ratios', () => {
  it("picks the model's ratio closest to the picture's", () => {
    expect(closestAspectRatio(1536, 1024)).toBe('3:2');
    expect(closestAspectRatio(2048, 1536)).toBe('4:3');
    expect(closestAspectRatio(1179, 1572)).toBe('3:4');
    expect(closestAspectRatio(945, 2048)).toBe('9:16');
    expect(closestAspectRatio(1000, 1000)).toBe('1:1');
    expect(closestAspectRatio(1920, 1080)).toBe('16:9');
    expect(closestAspectRatio(2560, 1080)).toBe('21:9');
  });
});
