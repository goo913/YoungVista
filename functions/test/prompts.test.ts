import { roomFromPoints, type Room } from '@youngvista/core';
import { describe, expect, it } from 'vitest';
import {
  buildAiPrompt,
  describePiece,
  describeRoom,
  productLabel,
  roomFacts,
  sourceLabel,
  thinkingLevel,
  type PromptPiece,
} from '../src/ai-image/prompts';

/** A 4.8 × 4 m room with a door on one wall and two windows. */
function livingRoom(): Room {
  const room = roomFromPoints(
    [
      [0, 0],
      [4.8, 0],
      [4.8, 4],
      [0, 4],
    ],
    { ceilingHeight: 2.45 },
  );
  room.walls[0]!.openings.push(
    { id: 'w1', type: 'window', offset: 1, width: 1.6, height: 1.3, sill: 0.9 },
    { id: 'w2', type: 'window', offset: 3, width: 1, height: 1.3, sill: 0.9 },
  );
  room.walls[1]!.openings.push({
    id: 'd1',
    type: 'door',
    offset: 0.2,
    width: 0.9,
    height: 2.05,
    sill: 0,
  });
  return room;
}

const sofa: PromptPiece = {
  name: 'Curved velvet sofa (Navy)',
  size: { w: 2.188, d: 1.023, h: 0.788 },
  count: 1,
  image: 2,
};
const chairs: PromptPiece = {
  name: 'Dining chair',
  size: { w: 0.52, d: 0.55, h: 0.8 },
  count: 4,
  image: null,
};

/** The rules every template keeps: the camera, the room, its openings and its size. */
const GEOMETRY = [
  /the camera: the same viewpoint, height, angle, lens and framing/,
  /every wall and corner, the floor and the ceiling, in the same places/,
  /every door, window and opening: on the same wall, in the same place, at the same size/,
  /Never add, remove, move or resize walls, windows, doors or openings/,
  /never change the shape or the size of the room/,
  /Do not add people/,
  /same framing and aspect ratio as image 1/,
  /4\.8 m by 4\.0 m/,
  /2\.5 m ceiling/,
];

describe('the room in words', () => {
  it('gives a rectangular room its two sides, floor, ceiling, doors and windows', () => {
    const facts = roomFacts(livingRoom());
    expect(facts).toMatchObject({ rectangular: true, doors: 1, windows: 2, ceiling: 2.45 });
    expect(facts.area).toBeCloseTo(19.2);
    expect(describeRoom(facts)).toBe(
      'a rectangular room about 4.8 m by 4.0 m, 19.2 m² of floor, with a 2.5 m ceiling, and 1 door or doorway and 2 windows',
    );
  });

  it('lists the walls of any other shape, in order', () => {
    const l = roomFromPoints([
      [0, 0],
      [5, 0],
      [5, 2.5],
      [3, 2.5],
      [3, 4],
      [0, 4],
    ]);
    const facts = roomFacts(l);
    expect(facts.rectangular).toBe(false);
    expect(facts.walls).toHaveLength(6);
    expect(describeRoom(facts)).toMatch(/^a room with 6 walls, about (\d\.\d m, ){5}\d\.\d m long/);
    expect(describeRoom(facts)).not.toMatch(/door|window/);
  });

  it('does not call a tilted four-sided room rectangular', () => {
    const skew = roomFromPoints([
      [0, 0],
      [4, 0],
      [5, 3],
      [0, 3],
    ]);
    expect(roomFacts(skew).rectangular).toBe(false);
  });

  it('gives each piece its true size in centimetres and its product picture', () => {
    expect(describePiece(sofa)).toBe(
      '- Curved velvet sofa (Navy): 219 × 102 × 79 cm (product picture: image 2)',
    );
    expect(describePiece(chairs)).toBe('- 4 × Dining chair: 52 × 55 × 80 cm');
    expect(productLabel(sofa)).toBe('Image 2: product picture of the Curved velvet sofa (Navy).');
  });
});

describe('the prompts', () => {
  const room = roomFacts(livingRoom());

  it.each([
    ['render', [sofa]],
    ['ar', [sofa]],
    ['photo', [sofa]],
    ['photo', []],
  ] as const)('keep the geometry, the camera and the room size (%s)', (use, pieces) => {
    const prompt = buildAiPrompt({ use, room, pieces, request: pieces.length ? '' : 'paint it' });
    for (const rule of GEOMETRY) expect(prompt).toMatch(rule);
  });

  it('render: photo-real, every piece kept where it is, nothing added', () => {
    const prompt = buildAiPrompt({ use: 'render', room, pieces: [sofa, chairs], request: '' });
    expect(prompt).toMatch(/3D view of a real room/);
    expect(prompt).toMatch(/photorealistic interior photograph/);
    expect(prompt).toMatch(/every piece of furniture: the same place, size, orientation and shape/);
    expect(prompt).toMatch(/Never add a piece that image 1 does not show/);
    expect(prompt).toMatch(/cut-away view/);
    expect(prompt).toContain(describePiece(sofa));
    expect(prompt).toContain(describePiece(chairs));
    expect(prompt).toMatch(/match its product picture/);
    expect(prompt).not.toMatch(/person also asks/);
  });

  it('render: an empty room stays empty, with no product pictures mentioned', () => {
    const prompt = buildAiPrompt({ use: 'render', room, pieces: [], request: '' });
    expect(prompt).toMatch(/keep the room empty/);
    expect(prompt).not.toMatch(/product picture/);
  });

  it('ar: only the added furniture changes, and app guides go', () => {
    const prompt = buildAiPrompt({ use: 'ar', room, pieces: [sofa], request: '' });
    expect(prompt).toMatch(/augmented reality app/);
    expect(prompt).toMatch(/everything that is really in the room: keep it as it is/);
    expect(prompt).toMatch(/Change only the added furniture/);
    expect(prompt).toMatch(/Remove any app guides/);
  });

  it('photo with furniture: true size against the room, placed where it belongs', () => {
    const prompt = buildAiPrompt({ use: 'photo', room, pieces: [sofa], request: '' });
    expect(prompt).toMatch(/real photo of a room/);
    expect(prompt).toMatch(/every piece must have its true size compared with the room/);
    expect(prompt).toMatch(/not in front of doors or windows/);
    expect(prompt).toMatch(/never floating, never cutting into a wall/);
    expect(prompt).toMatch(/replace that thing with the new piece/);
    expect(prompt).not.toMatch(/out of view/);
  });

  it("photo with a change only: the person's words, quoted, inside the rules", () => {
    const prompt = buildAiPrompt({
      use: 'photo',
      room,
      pieces: [],
      request: 'paint the walls sage green',
    });
    expect(prompt).toMatch(/Change only what the request asks for/);
    expect(prompt).toContain(
      `The person's request, in their own words: "paint the walls sage green"`,
    );
    expect(prompt).toMatch(/Follow it only as far as the rules above allow/);
    // The request comes after every rule.
    expect(prompt.indexOf('paint the walls')).toBeGreaterThan(prompt.indexOf('Never add, remove'));
  });

  it('adds a request to the other uses as an extra, still inside the rules', () => {
    const prompt = buildAiPrompt({ use: 'render', room, pieces: [sofa], request: 'evening light' });
    expect(prompt).toContain('The person also asks, in their own words: "evening light"');
    expect(prompt).toMatch(/If it asks to change walls, windows, doors, the size of the room/);
  });

  it('labels image 1 by what it is', () => {
    expect(sourceLabel('render')).toMatch(/3D view/);
    expect(sourceLabel('ar')).toMatch(/camera's view/);
    expect(sourceLabel('photo')).toMatch(/photo of the room/);
  });

  it('thinks harder with more kinds of furniture', () => {
    expect(thinkingLevel([sofa], 5)).toBe('MEDIUM');
    expect(
      thinkingLevel(
        Array.from({ length: 6 }, () => sofa),
        5,
      ),
    ).toBe('HIGH');
  });
});
