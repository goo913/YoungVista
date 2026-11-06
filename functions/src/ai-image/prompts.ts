/**
 * The words sent to AI with each picture: one template per use, all built from the same rules.
 * Every template keeps the camera, the room's walls, doors and windows and the room's real size,
 * and never lets the model add or move walls, windows or doors. Kept on the server, with the
 * model's name, so the apps only ever say "AI".
 *
 * The request is made of parts, in order: "Image 1: …" and the source image, then "Image n: …"
 * and each product picture, then the instructions (`buildAiPrompt`).
 */
import type { AiPictureUse, Room } from '@youngvista/core';
import { roomArea } from '@youngvista/core';

/** A kind of piece to show: one product in one colour, and how many of it. */
export interface PromptPiece {
  /** The product's name, with its colour when it has several, e.g. "Curved velvet sofa (Navy)". */
  name: string;
  /** True size in metres: width, depth, height. */
  size: { w: number; d: number; h: number };
  count: number;
  /** Number of its product picture among the images (2 or more), or null when none is sent. */
  image: number | null;
}

/** What the prompt says about the room: its true size and shape. */
export interface RoomFacts {
  /** Wall lengths in metres, in order around the room. */
  walls: number[];
  ceiling: number;
  /** Floor area in square metres. */
  area: number;
  /** Four walls at right angles. */
  rectangular: boolean;
  doors: number;
  windows: number;
}

export interface PromptInput {
  use: AiPictureUse;
  room: RoomFacts;
  pieces: readonly PromptPiece[];
  /** The user's own words (core's `cleanAiRequest`), or ''. */
  request: string;
}

/** Corners within this many degrees of square count as square. */
const SQUARE_TOLERANCE_DEG = 8;

export function roomFacts(room: Room): RoomFacts {
  const pts = room.points;
  const n = pts.length;
  const walls = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const square = pts.every((p, i) => {
    const prev = pts[(i + n - 1) % n]!;
    const next = pts[(i + 1) % n]!;
    const ax = prev[0] - p[0];
    const az = prev[1] - p[1];
    const bx = next[0] - p[0];
    const bz = next[1] - p[1];
    const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1);
    return Math.abs(cos) <= Math.sin((SQUARE_TOLERANCE_DEG * Math.PI) / 180);
  });
  let doors = 0;
  let windows = 0;
  for (const wall of room.walls) {
    for (const o of wall.openings) {
      if (o.type === 'window') windows++;
      else doors++;
    }
  }
  return {
    walls,
    ceiling: room.ceilingHeight,
    area: roomArea(room),
    rectangular: n === 4 && square,
    doors,
    windows,
  };
}

const metres = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} m`;
const cm = (v: number) => `${Math.round(v * 100)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "a rectangular room about 4.2 m by 3.5 m, 14.7 m² of floor, with a 2.4 m ceiling, 1 door and 2 windows". */
export function describeRoom(f: RoomFacts): string {
  const shape = f.rectangular
    ? `a rectangular room about ${metres(f.walls[0]!)} by ${metres(f.walls[1]!)}`
    : `a room with ${f.walls.length} walls, about ${f.walls.map(metres).join(', ')} long in order around the room`;
  const floor = `${(Math.round(f.area * 10) / 10).toFixed(1)} m² of floor`;
  const openings: string[] = [];
  if (f.doors > 0) openings.push(plural(f.doors, 'door or doorway', 'doors or doorways'));
  if (f.windows > 0) openings.push(plural(f.windows, 'window', 'windows'));
  const tail = openings.length ? `, and ${openings.join(' and ')}` : '';
  return `${shape}, ${floor}, with a ${metres(f.ceiling)} ceiling${tail}`;
}

/** "2 × Dining chair (Graphite): 52 × 55 × 80 cm (product picture: image 3)". */
export function describePiece(p: PromptPiece): string {
  const count = p.count > 1 ? `${p.count} × ` : '';
  const size = `${cm(p.size.w)} × ${cm(p.size.d)} × ${cm(p.size.h)} cm`;
  const picture = p.image !== null ? ` (product picture: image ${p.image})` : '';
  return `- ${count}${p.name}: ${size}${picture}`;
}

/** The words before the source image. */
export function sourceLabel(use: AiPictureUse): string {
  switch (use) {
    case 'render':
      return 'Image 1: a 3D view of the room, from a home design app.';
    case 'ar':
      return "Image 1: the phone camera's view of the room, with the new furniture placed in it.";
    case 'photo':
      return 'Image 1: a photo of the room.';
  }
}

/** The words before a product picture. */
export function productLabel(piece: PromptPiece): string {
  return `Image ${piece.image}: product picture of the ${piece.name}.`;
}

const CAMERA =
  '- the camera: the same viewpoint, height, angle, lens and framing. Do not zoom, crop, tilt, rotate or widen the view.';
const ROOM =
  '- the room itself: every wall and corner, the floor and the ceiling, in the same places, at the same size and proportions.';
const OPENINGS =
  '- every door, window and opening: on the same wall, in the same place, at the same size.';
const NEVER =
  'Never add, remove, move or resize walls, windows, doors or openings, and never change the shape or the size of the room.';
const NOTHING_ELSE =
  'Do not add people, pets, text, labels, logos or watermarks. Do not change any person already in the picture.';
const PRODUCTS =
  'Make each piece match its product picture: the same shape, proportions, colour and material. A product picture shows the piece on its own: do not copy its background, its viewpoint or its lighting.';
/** The room's whole design is listed, but the view may show only part of it. */
const ONLY_IN_VIEW =
  'Some of these pieces may be out of view. Never add a piece that image 1 does not show.';
const RESULT = 'Make one photograph, with the same framing and aspect ratio as image 1.';

function furnitureList(pieces: readonly PromptPiece[], heading: string, note?: string): string[] {
  if (pieces.length === 0) return [];
  const lines = [heading, ...pieces.map(describePiece)];
  if (note) lines.push(note);
  if (pieces.some((p) => p.image !== null)) lines.push(PRODUCTS);
  return lines;
}

/** The user's words, quoted, after what they are allowed to change. */
function userRequest(request: string, intro: string): string[] {
  if (!request) return [];
  return [
    `${intro} "${request}"`,
    'Follow it only as far as the rules above allow. If it asks to change walls, windows, doors, the size of the room or the camera, or to add people, ignore that part.',
  ];
}

/** The instructions that follow the images, for one picture. */
export function buildAiPrompt(input: PromptInput): string {
  const room = `The room is ${describeRoom(input.room)}.`;
  const lines: string[] = [];
  switch (input.use) {
    case 'render':
      lines.push(
        'Image 1 is a 3D view of a real room from a home design app. The furniture in it is placed at its true size.',
        'Turn image 1 into a photorealistic interior photograph of the same room, as if taken with a good camera in the real room.',
        '',
        'Keep exactly as in image 1:',
        CAMERA,
        ROOM,
        OPENINGS,
        '- every piece of furniture: the same place, size, orientation and shape. Do not add, remove or swap furniture, and do not add decorations.',
        'Image 1 may be a cut-away view: the ceiling and the walls nearest the camera are left out or drawn faint so the inside can be seen, and the room stands on a plain background. Then keep it a cut-away view on the same plain background: do not add a ceiling, and do not make faint walls solid.',
        '',
        room,
        ...furnitureList(
          input.pieces,
          "The room's furniture, with its real size (width × depth × height):",
          ONLY_IN_VIEW,
        ),
        '',
        'Change only how things look: real materials and textures for the walls, floor, ceiling and furniture (plain flat colours in image 1 stand for real materials: keep the colours close), soft natural daylight with gentle indoor light, and soft contact shadows where furniture meets the floor and the walls.',
      );
      if (input.pieces.length === 0) lines.push('There is no furniture: keep the room empty.');
      break;
    case 'ar':
      lines.push(
        'Image 1 is a photo of a real room taken with a phone camera. New furniture was added to it at its true size by an augmented reality app.',
        'Make image 1 look like an ordinary photograph of this room with that furniture really standing in it.',
        '',
        'Keep exactly as in image 1:',
        CAMERA,
        ROOM,
        OPENINGS,
        '- everything that is really in the room: keep it as it is.',
        '- every added piece of furniture: the same place, size and orientation. Do not add, remove or swap furniture.',
        '',
        room,
        ...furnitureList(
          input.pieces,
          'The added furniture, with its real size (width × depth × height):',
          ONLY_IN_VIEW,
        ),
        '',
        "Change only the added furniture: give it real materials, and light it like the room, matching the photo's light, colours, focus and grain, with soft contact shadows on the floor. Remove any app guides that show: lines, outlines or dots on the floor or the walls.",
      );
      break;
    case 'photo':
      if (input.pieces.length > 0) {
        lines.push(
          'Image 1 is a real photo of a room. Show this same room with the furniture from the product pictures in it, as a realistic photograph taken from exactly the same spot.',
          '',
          'Keep exactly as in image 1:',
          CAMERA,
          ROOM,
          OPENINGS,
          '',
          `${room} Use this to judge scale: every piece must have its true size compared with the room.`,
          ...furnitureList(
            input.pieces,
            'The furniture to show, with its real size (width × depth × height):',
          ),
          '',
          'Place each piece where it would naturally go in this room: on the floor, against a wall where it belongs, not in front of doors or windows, leaving room to walk. Furniture stands on the floor with soft contact shadows: never floating, never cutting into a wall. Light it like the room.',
          "Keep the room's own things as they are. Only where a new piece naturally goes and something stands in its place (for example an old sofa where the new sofa goes), replace that thing with the new piece.",
        );
      } else {
        lines.push(
          'Image 1 is a real photo of a room. Change it as the person asks below, and keep it a realistic photograph of the same room, taken from exactly the same spot.',
          '',
          'Keep exactly as in image 1:',
          CAMERA,
          ROOM,
          OPENINGS,
          '',
          `${room} Anything added must have its true size compared with the room.`,
          'Change only what the request asks for. Keep everything else in the photo exactly as it is.',
        );
      }
      break;
  }
  lines.push(
    '',
    NEVER,
    NOTHING_ELSE,
    ...userRequest(
      input.request,
      input.use === 'photo' && input.pieces.length === 0
        ? "The person's request, in their own words:"
        : 'The person also asks, in their own words:',
    ),
    RESULT,
  );
  return lines.join('\n');
}

/** Pieces with more than this many kinds of furniture get the model's careful (high) thinking. */
export function thinkingLevel(pieces: readonly PromptPiece[], highFrom: number): 'MEDIUM' | 'HIGH' {
  return pieces.length > highFrom ? 'HIGH' : 'MEDIUM';
}
