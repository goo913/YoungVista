import {
  buildTourEmbed,
  roomFromPoints,
  roomToFirestore,
  TOUR_EMBED_GLOBAL,
  tourEmbedFromJson,
  type RoomTour,
} from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  readTourMessage,
  staysOnWebsite,
  tourInjection,
  tourPageUrl,
  websiteFor,
} from '@/lib/tour-page';

describe('the tour page’s website', () => {
  it('is the live site in release builds, whatever is set', () => {
    expect(websiteFor({ dev: false, emulatorHost: null })).toBe('https://young-vista.web.app');
    expect(
      websiteFor({ dev: false, emulatorHost: '10.0.2.2', override: 'http://evil.example' }),
    ).toBe('https://young-vista.web.app');
  });

  it('is the dev server next to the emulators, or the address set, in development', () => {
    expect(websiteFor({ dev: true, emulatorHost: '192.168.1.20' })).toBe(
      'http://192.168.1.20:5173',
    );
    expect(
      websiteFor({ dev: true, emulatorHost: '192.168.1.20', override: 'http://mac.local:5391/' }),
    ).toBe('http://mac.local:5391');
    expect(websiteFor({ dev: true, emulatorHost: null, override: 'not a url' })).toBe(
      'https://young-vista.web.app',
    );
  });

  it('keeps the WebView on that website', () => {
    const site = 'https://young-vista.web.app';
    expect(tourPageUrl(`${site}/`)).toBe(`${site}/embed/tour`);
    expect(staysOnWebsite(`${site}/embed/tour`, site)).toBe(true);
    expect(staysOnWebsite(`${site}/assets/a.js`, site)).toBe(true);
    expect(staysOnWebsite('https://young-vista.web.app.example.com/x', site)).toBe(false);
    expect(staysOnWebsite('https://example.com/', site)).toBe(false);
  });
});

describe('handing the tour to the page', () => {
  const tour: RoomTour = {
    scanId: 'scan-1',
    spots: [
      {
        spot: 0,
        storagePath: 'users/u/scans/scan-1/pano/spot-0.jpg',
        width: 4096,
        height: 2048,
        position: [1, 1.45, 1],
        yawDeg: 12,
      },
    ],
  };
  const embed = buildTourEmbed({
    name: 'Den </script> "quoted"',
    units: 'metric',
    room: roomToFirestore(
      roomFromPoints([
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ]),
    ),
    design: { items: [] },
    tour,
    images: { [tour.spots[0]!.storagePath]: 'https://firebasestorage.googleapis.com/x?token=1' },
  });

  it('sets the window property the page reads, with data the page accepts', () => {
    const window: Record<string, unknown> = {};
    // The injected script runs as plain JavaScript in the page.
    new Function('window', tourInjection(embed))(window);
    const read = tourEmbedFromJson(window[TOUR_EMBED_GLOBAL]);
    expect(read?.name).toBe('Den </script> "quoted"');
    expect(read?.tour.spots).toHaveLength(1);
  });

  it('reads the page’s messages', () => {
    expect(readTourMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(readTourMessage('{"type":"failed","message":"No pictures"}')).toEqual({
      type: 'failed',
      message: 'No pictures',
    });
    expect(readTourMessage('nonsense')).toBeNull();
  });
});
