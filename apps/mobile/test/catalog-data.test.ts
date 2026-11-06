import { METERS_PER_INCH, type CatalogItem } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import { formatSize, inSentence, noticeText, placementProblem } from '@/furnish/describe';
import { newItemId } from '@/furnish/ids';
import {
  activeVariant,
  allModelUrls,
  CATALOG_JSON_URL,
  catalogFromText,
  categoryGroups,
  creditGroups,
  indexCatalog,
  modelUrl,
  thumbUrl,
} from '@/lib/catalog-data';
import { EMULATOR_CONFIG, emulatorHostFor } from '@/lib/emulator';

const sofa: CatalogItem = {
  id: 'sofa-velvet',
  name: 'Curved velvet sofa',
  category: 'sofa',
  dimensions: { w: 2.188, d: 1.023, h: 0.788 },
  placement: 'floor',
  variants: [
    { id: 'champagne', name: 'Champagne', swatch: '#948579' },
    {
      id: 'navy',
      name: 'Navy',
      swatch: '#2b456e',
      model: 'models/sofa-velvet--navy.glb',
      thumb: 'thumbs/sofa-velvet--navy.webp',
    },
  ],
  license: 'CC-BY-4.0',
  credit: 'Wayfair, LLC (Eric Chadwick)',
  sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Assets',
  model: 'models/sofa-velvet.glb',
  thumb: 'thumbs/sofa-velvet.webp',
};
const plant: CatalogItem = {
  ...sofa,
  id: 'plant-potted',
  name: 'Potted plant',
  category: 'plant',
  dimensions: { w: 0.7, d: 0.66, h: 0.84 },
  variants: [],
  license: 'CC0-1.0',
  credit: 'Rico Cilliers, Poly Haven',
  model: 'models/plant-potted.glb',
  thumb: 'thumbs/plant-potted.webp',
};
const armchair: CatalogItem = {
  ...plant,
  id: 'armchair',
  name: 'Accent armchair',
  category: 'armchair',
  license: 'CC-BY-4.0',
  model: 'models/armchair.glb',
};

const catalogText = JSON.stringify({ version: 1, items: [sofa, plant, armchair] });

describe('catalog data', () => {
  it('reads catalog.json and indexes it', () => {
    const catalog = catalogFromText(catalogText)!;
    expect(catalog.items.map((i) => i.id)).toEqual(['sofa-velvet', 'plant-potted', 'armchair']);
    const index = indexCatalog(catalog);
    expect(index.byId.get('armchair')?.name).toBe('Accent armchair');
    expect(index.product('plant-potted')?.dimensions.h).toBe(0.84);
    expect(catalogFromText('not json')).toBeNull();
    expect(catalogFromText('{"version":1,"items":[]}')).toBeNull();
    expect(CATALOG_JSON_URL).toBe('https://young-vista.web.app/catalog/catalog.json');
  });

  it('groups the picker by category in the catalog order', () => {
    const groups = categoryGroups(catalogFromText(catalogText)!);
    expect(groups.map((g) => `${g.label}:${g.items.length}`)).toEqual([
      'Sofas:1',
      'Armchairs:1',
      'Plants:1',
    ]);
  });

  it('picks the model and picture of a colour', () => {
    expect(modelUrl(sofa)).toBe('https://young-vista.web.app/catalog/models/sofa-velvet.glb');
    expect(modelUrl(sofa, 'champagne')).toBe(modelUrl(sofa)); // the item's own look
    expect(modelUrl(sofa, 'navy')).toBe(
      'https://young-vista.web.app/catalog/models/sofa-velvet--navy.glb',
    );
    expect(thumbUrl(sofa, 'navy')).toMatch(/sofa-velvet--navy\.webp$/);
    expect(thumbUrl({ ...plant, thumb: '' })).toBeNull();
    expect(allModelUrls(catalogFromText(catalogText)!)).toHaveLength(4);
    expect(activeVariant(sofa)?.id).toBe('champagne');
    expect(activeVariant(sofa, 'navy')?.id).toBe('navy');
    expect(activeVariant(plant)).toBeNull();
  });

  it('lists credits with the CC BY models first', () => {
    const groups = creditGroups(catalogFromText(catalogText)!);
    expect(groups.map((g) => [g.license, g.items.map((i) => i.name)])).toEqual([
      ['CC-BY-4.0', ['Accent armchair', 'Curved velvet sofa']],
      ['CC0-1.0', ['Potted plant']],
    ]);
  });
});

describe('furniture words', () => {
  it('formats real sizes in feet and inches or metres', () => {
    expect(
      formatSize(
        { w: 84 * METERS_PER_INCH, d: 38 * METERS_PER_INCH, h: 33 * METERS_PER_INCH },
        'imperial',
      ),
    ).toBe('7′ 0″ W × 3′ 2″ D × 2′ 9″ H');
    expect(formatSize(sofa.dimensions, 'metric')).toBe('2.19 × 1.02 × 0.79 m');
  });

  it('explains why a spot is not allowed', () => {
    const nameOf = (id: string) => (id === 's' ? 'Charcoal sofa' : 'Oak and white TV stand');
    expect(placementProblem({ reasons: ['overlaps'], overlaps: ['s'] }, nameOf)).toBe(
      'Overlaps the charcoal sofa',
    );
    expect(placementProblem({ reasons: ['overlaps'], overlaps: ['s', 't'] }, nameOf)).toBe(
      'Overlaps 2 pieces',
    );
    expect(
      placementProblem({ reasons: ['outside-room', 'overlaps'], overlaps: ['t'] }, nameOf),
    ).toBe('Sticks out of the room and overlaps the oak and white TV stand');
    expect(placementProblem({ reasons: [], overlaps: [] }, nameOf)).toBeNull();
    expect(inSentence('TV stand')).toBe('TV stand');
    expect(inSentence('2-drawer nightstand')).toBe('2-drawer nightstand');
  });

  it('words the notices', () => {
    const nameOf = () => 'Charcoal sofa';
    const productName = () => 'Upholstered king bed';
    expect(
      noticeText(
        { kind: 'refused', id: 'a', reasons: ['overlaps'], overlaps: ['s'] },
        nameOf,
        productName,
      ),
    ).toBe('Overlaps the charcoal sofa, so it went back.');
    expect(noticeText({ kind: 'no-space', productId: 'bed' }, nameOf, productName)).toBe(
      'There is no free space for the upholstered king bed. Move or remove something first.',
    );
    expect(
      noticeText(
        {
          kind: 'removed',
          index: 0,
          item: { id: 'a', productId: 'bed', x: 0, z: 0, rotationY: 0 },
        },
        nameOf,
        productName,
      ),
    ).toBe('Removed the upholstered king bed.');
  });
});

describe('ids and the emulator switch', () => {
  it('makes short, distinct item ids', () => {
    const a = newItemId(
      () => 0.123,
      () => 1_700_000_000_000,
    );
    const b = newItemId(
      () => 0.124,
      () => 1_700_000_000_000,
    );
    expect(a).toMatch(/^i[0-9a-z]+$/);
    expect(a).not.toBe(b);
    expect(
      newItemId(
        () => 0,
        () => 0,
      ),
    ).toBe('i0000000');
  });

  it('uses the emulators only in development runs that ask for them', () => {
    expect(emulatorHostFor(true, '10.0.2.2')).toBe('10.0.2.2');
    expect(emulatorHostFor(true, '  ')).toBeNull();
    expect(emulatorHostFor(true, undefined)).toBeNull();
    // A release build never points at the emulators, even if the setting slipped in.
    expect(emulatorHostFor(false, '10.0.2.2')).toBeNull();
    expect(EMULATOR_CONFIG.projectId).toBe('demo-young-vista');
  });
});
