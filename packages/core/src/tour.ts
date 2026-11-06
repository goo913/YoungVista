/**
 * Real-picture tours: the 360° panoramas of a turn-around scan, kept with the saved room as
 * `rooms/{id}.tour` (`RoomTour`, in turn-scan.ts), and what every viewer and tool agrees on.
 *
 * **How a panorama lines up with the room.** A spot's panorama is equirectangular (2:1) and was
 * taken from `position` (room coordinates: metres, y above the floor). Column u (0 at the left
 * edge, 1 at the right) looks along the heading `yawDeg - (u - 0.5) × 360°`, so the centre column
 * looks along `yawDeg`; row v (0 at the top) looks up at the pitch `(0.5 - v) × 180°`. Headings
 * are `atan2(x, z)` in degrees, as everywhere in the scan contract: 0 looks along +z and 90 along
 * +x. Turning right lowers the heading: seen from above (+x to the right, +z down the screen) a
 * rising heading turns counter-clockwise.
 *
 * **Sharing.** A private link's snapshot (`shares/{shareId}.tour`) carries a copy of the tour, and
 * each panorama file is marked with the link's id in its custom metadata (`TOUR_SHARE_METADATA`);
 * storage.rules lets anyone read a marked panorama while that link exists.
 *
 * **The phone.** The app shows a tour in a WebView of the website's `TOUR_EMBED_PATH` page, handing
 * it a `TourEmbed` (room, furniture, tour, image URLs) before the page loads.
 */
import type { Vec3Tuple } from './plane';
import type { RoomTour } from './turn-scan';
import type { Design, Room, StoredRoom, UnitSystem, Vec2 } from './types';
import { designFromFirestore, designToFirestore } from './design';
import { roomFromFirestore } from './room';

/** One standing spot of a saved room's tour (room coordinates). */
export type RoomTourSpot = RoomTour['spots'][number];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** True for a usable scan id: 1 to 128 letters, digits, `-` and `_` (one Storage path segment). */
export function isTourScanId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** A Storage path that cannot climb out of its folder: no empty, `.` or `..` segments. */
function isStoragePath(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 1024) return false;
  return value.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

function spotFromFirestore(data: unknown): RoomTourSpot | null {
  if (!isObj(data)) return null;
  const { spot, storagePath, width, height, position, yawDeg } = data;
  if (!isNum(spot) || !Number.isInteger(spot) || spot < 0) return null;
  if (!isStoragePath(storagePath)) return null;
  if (!isNum(width) || !isNum(height) || width <= 0 || height <= 0) return null;
  if (!Array.isArray(position) || position.length !== 3 || !position.every(isNum)) return null;
  // The camera stood above the floor.
  if (position[1] <= 0) return null;
  if (!isNum(yawDeg)) return null;
  return {
    spot,
    storagePath,
    width: Math.round(width),
    height: Math.round(height),
    position: [position[0], position[1], position[2]],
    yawDeg,
  };
}

/**
 * Reads `rooms/{id}.tour` (or a share's copy). Spots that are not usable are left out, a spot
 * number seen twice keeps its first entry, and the spots come back in spot order. Null when there
 * is no usable tour (no scan id, or no usable spot).
 */
export function roomTourFromFirestore(data: unknown): RoomTour | null {
  if (!isObj(data) || !isTourScanId(data.scanId) || !Array.isArray(data.spots)) return null;
  const seen = new Set<number>();
  const spots: RoomTourSpot[] = [];
  for (const raw of data.spots) {
    const spot = spotFromFirestore(raw);
    if (!spot || seen.has(spot.spot)) continue;
    seen.add(spot.spot);
    spots.push(spot);
  }
  if (!spots.length) return null;
  spots.sort((a, b) => a.spot - b.spot);
  return { scanId: data.scanId, spots };
}

/** A deep copy of a tour that Firestore can store (only the known fields). */
export function roomTourToFirestore(tour: RoomTour): RoomTour {
  return {
    scanId: tour.scanId,
    spots: tour.spots.map((s) => ({
      spot: s.spot,
      storagePath: s.storagePath,
      width: s.width,
      height: s.height,
      position: [s.position[0], s.position[1], s.position[2]],
      yawDeg: s.yawDeg,
    })),
  };
}

/** Two tours with the same scan and spots. */
export function toursEqual(a: RoomTour | null, b: RoomTour | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(roomTourToFirestore(a)) === JSON.stringify(roomTourToFirestore(b));
}

/** A heading in degrees, brought into -180 ≤ h < 180. */
export function normalizeHeading(degrees: number): number {
  return degrees - 360 * Math.floor((degrees + 180) / 360);
}

/** The heading (degrees, `atan2(x, z)`) of a direction on the floor plane. */
export function tourHeading(direction: Vec2): number {
  return (Math.atan2(direction.x, direction.z) * 180) / Math.PI;
}

/** The unit direction seen at (u, v) of a panorama whose centre column looks along `yawDeg`. */
export function panoramaDirection(yawDeg: number, u: number, v: number): Vec3Tuple {
  const heading = ((yawDeg - (u - 0.5) * 360) * Math.PI) / 180;
  const pitch = (0.5 - v) * Math.PI;
  const c = Math.cos(pitch);
  return [c * Math.sin(heading), Math.sin(pitch), c * Math.cos(heading)];
}

/** Where a direction lands in a panorama whose centre column looks along `yawDeg` (0 ≤ u < 1). */
export function panoramaUv(yawDeg: number, direction: Vec3Tuple): { u: number; v: number } {
  const [x, y, z] = direction;
  const len = Math.hypot(x, y, z) || 1;
  const heading = tourHeading({ x, z });
  const u = 0.5 - normalizeHeading(heading - yawDeg) / 360;
  const pitch = Math.asin(Math.max(-1, Math.min(1, y / len)));
  return { u: u - Math.floor(u), v: 0.5 - pitch / Math.PI };
}

/** The spot whose position is nearest a point on the floor. */
export function nearestTourSpot(tour: RoomTour, point: Vec2): RoomTourSpot {
  let best = tour.spots[0]!;
  let bestDistance = Infinity;
  for (const s of tour.spots) {
    const d = Math.hypot(s.position[0] - point.x, s.position[2] - point.z);
    if (d < bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Custom metadata key on a panorama file: the id of the private link it is shared through.
 * storage.rules lets anyone read the file while `shares/{that id}` exists and belongs to the
 * file's owner.
 */
export const TOUR_SHARE_METADATA = 'shareId';

/** The website page the phone's WebView shows a tour on. */
export const TOUR_EMBED_PATH = '/embed/tour';

/** The `window` property the phone sets to the `TourEmbed` before the page loads. */
export const TOUR_EMBED_GLOBAL = '__YOUNGVISTA_TOUR__';

/** What the phone hands the website's tour page, as JSON. */
export interface TourEmbed {
  version: 1;
  name: string;
  units: UnitSystem;
  room: StoredRoom;
  design: Design;
  tour: RoomTour;
  /** Where to download each spot's panorama, by its `storagePath`. */
  images: Record<string, string>;
}

/** The tour page's messages to the phone (`window.ReactNativeWebView.postMessage`, as JSON). */
export type TourEmbedMessage =
  /** The first panorama is on screen. */
  | { type: 'ready' }
  /** Nothing can be shown; the words are for the person. */
  | { type: 'failed'; message: string }
  /** The person asked to leave. */
  | { type: 'close' };

const isWebUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v) && v.length <= 4096;

/**
 * Reads a `TourEmbed`, with the room ready to draw. Spots without an image URL are left out. Null
 * when there is nothing to show.
 */
export function tourEmbedFromJson(data: unknown): {
  name: string;
  units: UnitSystem;
  room: Room;
  design: Design;
  tour: RoomTour;
  images: Record<string, string>;
} | null {
  if (!isObj(data) || data.version !== 1) return null;
  const room = roomFromFirestore(data.room);
  const tour = roomTourFromFirestore(data.tour);
  if (!room || !tour || !isObj(data.images)) return null;
  const images: Record<string, string> = {};
  for (const s of tour.spots) {
    const url = data.images[s.storagePath];
    if (isWebUrl(url)) images[s.storagePath] = url;
  }
  const spots = tour.spots.filter((s) => images[s.storagePath]);
  if (!spots.length) return null;
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Room';
  return {
    name,
    units: data.units === 'metric' ? 'metric' : 'imperial',
    room,
    design: designFromFirestore(data.design),
    tour: { scanId: tour.scanId, spots },
    images,
  };
}

/** A `TourEmbed` ready for JSON (deep copies, no `undefined` fields). */
export function buildTourEmbed(input: {
  name: string;
  units: UnitSystem;
  room: StoredRoom;
  design: Design;
  tour: RoomTour;
  images: Record<string, string>;
}): TourEmbed {
  return {
    version: 1,
    name: input.name,
    units: input.units,
    room: JSON.parse(JSON.stringify(input.room)) as StoredRoom,
    design: designToFirestore(input.design),
    tour: roomTourToFirestore(input.tour),
    images: { ...input.images },
  };
}

/** Reads a message from the tour page; null when it is not one. */
export function tourEmbedMessageFromJson(text: string): TourEmbedMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(data)) return null;
  if (data.type === 'ready' || data.type === 'close') return { type: data.type };
  if (data.type === 'failed') {
    return {
      type: 'failed',
      message: typeof data.message === 'string' ? data.message.slice(0, 300) : '',
    };
  }
  return null;
}
