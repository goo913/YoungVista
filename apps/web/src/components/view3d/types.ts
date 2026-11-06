import type { CatalogItem, DesignAction, DesignContext, DesignState } from '@youngvista/core';

/**
 * How the camera moves (the closet's toolbar 3D, Fly and Walk):
 *   orbit  round the room from outside (YoungVista's 3D view, the first thing seen)
 *   fly    through the room as a game flies (Minecraft's spectator mode)
 *   walk   standing in it at eye height
 */
export type NavMode = 'orbit' | 'fly' | 'walk';

/** Furnishing through the 3D view: the page's design editor (absent on a shared, view-only room). */
export interface Editor3D {
  state: DesignState;
  ctx: DesignContext;
  dispatch: (action: DesignAction) => void;
  /** Pieces outside the room or on top of another. */
  invalid: ReadonlySet<string>;
  /** The product in hand while walking or flying (after E): placed with the next click. */
  placing: CatalogItem | null;
  setPlacing: (product: CatalogItem | null) => void;
  /** E: the furniture picker. */
  openPicker: () => void;
  /** A placed piece's name, for the crosshair's words. */
  nameOf: (itemId: string) => string;
}

/** A product in hand, where it would go (walking or flying, after E). */
export interface Ghost {
  productId: string;
  x: number;
  z: number;
  rotationY: number;
  valid: boolean;
}

/** What the page can ask of the 3D view. */
export interface Room3DHandle {
  /** Walking or flying with the keys: take the mouse (a product was just picked). */
  lock: () => boolean;
}

/** YoungVista's orbit field of view (the 3D view as it was). */
export const ORBIT_FOV = 40;

/** Which camera is driving: the closet's `modeOf` (Fly with the mouse alone is round the room). */
export const viewOf = (mode: NavMode, controls: 'keys' | 'mouse'): NavMode =>
  mode === 'walk' ? 'walk' : mode === 'fly' && controls === 'keys' ? 'fly' : 'orbit';

/** What the crosshair is on, as the walk's overlay says it. */
export type HudAim =
  | { kind: 'piece'; name: string }
  | { kind: 'carry'; name: string; on: boolean; ok: boolean }
  | { kind: 'place'; name: string; on: boolean; ok: boolean };

/** What the view shows over the room while it has the mouse. */
export interface Hud {
  /** The crosshair shows (the view has the mouse). */
  cross: boolean;
  aim: HudAim | null;
  /** The flying pace the wheel just picked (× the pace). */
  speed: number | null;
}

export const sameHud = (a: Hud | null, b: Hud | null) => JSON.stringify(a) === JSON.stringify(b);
