/**
 * The room's real 360° pictures on the phone are the website's own viewer (`TOUR_EMBED_PATH`) in
 * a WebView: one viewer to build and check, with the same furniture, wall hiding and shadows as on
 * the website. The app hands the page everything it shows before the page loads (`TourEmbed`, set
 * on `window[TOUR_EMBED_GLOBAL]`), so the page needs no sign-in. Plain TypeScript (no React Native
 * or Firebase), so it is unit tested.
 */
import {
  SHARE_BASE_URL,
  TOUR_EMBED_GLOBAL,
  TOUR_EMBED_PATH,
  tourEmbedMessageFromJson,
  type TourEmbed,
  type TourEmbedMessage,
} from '@youngvista/core';

/** The website's dev server port (Vite's default), for development runs on the emulators. */
export const DEV_WEBSITE_PORT = 5173;

/**
 * The website the tour page comes from: the live site, or in development runs the address in
 * EXPO_PUBLIC_WEBSITE_URL, else the website's dev server next to the Firebase emulators (whose
 * pictures are plain http, which an https page could not load).
 */
export function websiteFor(input: {
  dev: boolean;
  emulatorHost: string | null;
  override?: string;
}): string {
  if (input.dev) {
    const override = input.override?.trim();
    if (override && /^https?:\/\/[^\s/]+/.test(override)) return override.replace(/\/+$/, '');
    if (input.emulatorHost) return `http://${input.emulatorHost}:${DEV_WEBSITE_PORT}`;
  }
  return SHARE_BASE_URL;
}

/** The tour page's address on a website. */
export const tourPageUrl = (website: string): string =>
  `${website.replace(/\/+$/, '')}${TOUR_EMBED_PATH}`;

/** True for an address the WebView may open: the tour page's own website only. */
export function staysOnWebsite(url: string, website: string): boolean {
  const base = website.replace(/\/+$/, '');
  return url === base || url.startsWith(`${base}/`) || url === 'about:blank';
}

/**
 * The script the WebView runs before the page loads: it puts the tour on `window`. JSON is valid
 * JavaScript, so the data needs no other escaping; `true;` keeps iOS from complaining.
 */
export function tourInjection(embed: TourEmbed): string {
  return `window[${JSON.stringify(TOUR_EMBED_GLOBAL)}] = ${JSON.stringify(embed)};\ntrue;`;
}

/** Reads a message from the tour page (`onMessage`'s `nativeEvent.data`). */
export const readTourMessage = (data: string): TourEmbedMessage | null =>
  tourEmbedMessageFromJson(data);
