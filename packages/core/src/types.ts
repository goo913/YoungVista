/**
 * Shared YoungVista data types.
 *
 * Conventions (see build.md):
 * - Units are metres internally.
 * - World space is Y up, the floor is y = 0, and the room outline lies on the XZ plane.
 * - "Seen from above" means looking down the -Y axis with +X to the right, so +Z points
 *   toward the bottom of the screen (this is also how an SVG plan with y = z is drawn).
 */

/** A point or direction on the floor plane (metres). */
export interface Vec2 {
  x: number;
  z: number;
}

/** Where a wall observation came from: an AR vertical plane, or two taps at the bottom of a wall. */
export type ObservationSource = 'plane' | 'tap';

/**
 * One sighting of a wall where it meets the floor: a segment on the XZ plane.
 * Several observations of the same wall are merged by `buildRoomFromWalls`.
 */
export interface WallObservation {
  /** Stable id, e.g. the AR anchor id. A later observation with the same id replaces an earlier one. */
  id: string;
  source: ObservationSource;
  a: Vec2;
  b: Vec2;
  /** 0..1, defaults to 1. Scales the observation's weight (its length) when walls are merged. */
  confidence?: number;
}

export type OpeningType = 'door' | 'window' | 'opening';

/** A door, window or doorless opening in a wall. All values in metres. */
export interface Opening {
  id: string;
  type: OpeningType;
  /** Distance along the wall from its start point (`a`) to the near edge of the opening. */
  offset: number;
  /** Width along the wall. */
  width: number;
  /** Height of the opening itself. */
  height: number;
  /** Height of the bottom of the opening above the floor (0 for doors and openings). */
  sill: number;
}

/** A wall between two corners of the room outline. */
export interface Wall {
  id: string;
  /** Index into `Room.points` of the start corner. */
  a: number;
  /** Index into `Room.points` of the end corner. */
  b: number;
  openings: Opening[];
}

/**
 * A room: a closed outline of corners on the floor plus the ceiling height.
 * `points` are `[x, z]` metres, counter-clockwise seen from above (the interior is on the left
 * of each wall). `walls[i]` runs from `points[i]` to `points[(i + 1) % points.length]`.
 */
export interface Room {
  version: 1;
  points: [number, number][];
  ceilingHeight: number;
  walls: Wall[];
}

/**
 * The room as stored in Firestore. Firestore cannot store an array directly inside another
 * array, so corners are stored as `{ x, z }` maps. Convert with `roomToFirestore` and
 * `roomFromFirestore`.
 */
export interface StoredRoom {
  version: 1;
  points: Vec2[];
  ceilingHeight: number;
  walls: Wall[];
}

/** A piece of furniture placed in a room. Position in metres on the floor, rotation in degrees about +Y. */
export interface DesignItem {
  id: string;
  productId: string;
  variant?: string;
  x: number;
  z: number;
  rotationY: number;
  /**
   * Height of the item's base above the floor in metres. Only set for tabletop items resting on
   * another item (see `resolvePlacement`); floor items leave it out, which means 0.
   */
  y?: number;
}

export interface Design {
  items: DesignItem[];
}

/** Which units the owner prefers for this room. Values are always stored in metres. */
export type UnitSystem = 'imperial' | 'metric';

/**
 * How the room was captured.
 * - `scan`: AR walls found by turning around the room (Build 1).
 * - `roomplan`: Apple RoomPlan automatic scanning (later).
 * - `manual`: drawn or typed in.
 */
export type CaptureMethod = 'scan' | 'roomplan' | 'manual';

export type CapturePlatform = 'ios' | 'android' | 'web';

export interface Capture {
  method: CaptureMethod;
  platform: CapturePlatform;
  /** Correction applied to the AR scale (1 = none), e.g. after the user typed a known wall length. */
  scaleFactor: number;
}

/** Any timestamp with `toMillis()`, such as Firestore's `Timestamp`. Core has no Firebase import. */
export interface TimestampLike {
  toMillis(): number;
}

/** Firestore document `rooms/{roomId}`. */
export interface RoomDoc<TTime = TimestampLike> {
  ownerId: string;
  name: string;
  createdAt: TTime;
  updatedAt: TTime;
  units: UnitSystem;
  room: StoredRoom;
  capture: Capture;
  design: Design;
  /** Id of the active `shares/{shareId}` snapshot, or null when the room is not shared. */
  shareId: string | null;
}

/** Firestore document `shares/{shareId}`: a read-only snapshot for a private link. */
export interface ShareDoc<TTime = TimestampLike> {
  ownerId: string;
  roomId: string;
  name: string;
  createdAt: TTime;
  /** When the owner last refreshed the snapshot. Missing on snapshots never refreshed. */
  updatedAt?: TTime;
  units: UnitSystem;
  room: StoredRoom;
  design: Design;
}

/**
 * Firestore document `rooms/{roomId}/pictures/{pictureId}`: a final picture of the room. The
 * image itself is a JPEG in Storage at `storagePath`. Build it with `buildPictureDoc`.
 */
export interface PictureDoc<TTime = TimestampLike> {
  createdAt: TTime;
  /** `users/{uid}/rooms/{roomId}/pictures/{pictureId}.jpg` (see `picturePath`). */
  storagePath: string;
  /** Image size in pixels. */
  width: number;
  height: number;
  /** Where the picture was taken. */
  platform: CapturePlatform;
}
