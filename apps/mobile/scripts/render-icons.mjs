/**
 * Renders the app icon, the Android adaptive icon and the splash screen from the mark in
 * assets/brand/mark.svg, at the sizes Expo needs. The PNGs are committed; run this again after
 * changing the mark:
 *
 *   node apps/mobile/scripts/render-icons.mjs
 *
 * Then `npm run iphone` / `npm run android` make the native projects again (assets/ changed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const source = fs.readFileSync(path.join(assets, 'brand', 'mark.svg'), 'utf8');

/** The drawing inside mark.svg (its comment left out). */
const mark = source
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim();

const INK = '#fafafa';
const SOFA = '#d8c3a2';
const SEAT = '#ebdcc2';
/** The website's dark tile colour (apps/web/public/favicon.svg), a little lighter at the top. */
const TILE_TOP = '#2a2a2a';
const TILE_BOTTOM = '#141414';
const SIZE = 1024;
/** The middle of the mark's outline (the house spans y 256 to 798 with its stroke). */
const CENTER = { x: 512, y: 527 };

/** The mark, recoloured, scaled about its middle and moved to the middle of the image. */
function drawMark({ scale, ink = INK, sofa = SOFA, seat = SEAT }) {
  const art = mark.replaceAll(INK, ink).replaceAll(SOFA, sofa).replaceAll(SEAT, seat);
  const move = `translate(${SIZE / 2} ${SIZE / 2}) scale(${scale}) translate(${-CENTER.x} ${-CENTER.y})`;
  return `<g transform="${move}">${art}</g>`;
}

const tile = `
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TILE_TOP}"/>
      <stop offset="1" stop-color="${TILE_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#tile)"/>`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`;

const images = {
  // iOS and the fallback icon: full bleed, no transparency (iOS rounds the corners itself).
  'icon.png': svg(`${tile}${drawMark({ scale: 1.12 })}`),
  // Android adaptive icon: the launcher crops the layers to a circle, squircle or square inside
  // the middle 66 of 108 dp, so the mark stays within a 626 px circle.
  'adaptive-icon-foreground.png': svg(drawMark({ scale: 0.8 })),
  'adaptive-icon-background.png': svg(tile),
  // Android 13 themed icons use only the shape.
  'adaptive-icon-monochrome.png': svg(
    drawMark({ scale: 0.8, ink: '#ffffff', sofa: '#ffffff', seat: '#ffffff' }),
  ),
  // The splash screen: the mark alone, on white (light) and on near-black (dark).
  'splash-icon.png': svg(drawMark({ scale: 1.6, ink: '#171717' })),
  'splash-icon-dark.png': svg(drawMark({ scale: 1.6 })),
};

for (const [name, image] of Object.entries(images)) {
  const png = new Resvg(image, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
  fs.writeFileSync(path.join(assets, name), png);
  console.log(`✓ assets/${name} (${SIZE} × ${SIZE})`);
}
