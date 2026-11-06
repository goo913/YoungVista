import { useCallback, useState } from 'react';
import {
  WALK_FOV,
  WALK_HEIGHT_CM,
  WALK_LOOK,
  normalizeFov,
  normalizeHeightCm,
  normalizeLookSpeed,
  normalizeSkin,
  type SkinTone,
} from '@youngvista/core';

/**
 * How a person moves through the 3D view (the closet designer's ⚙, look3d.js CONTROLS):
 *   keys   as a game does: a click hands the view the mouse, the mouse looks, W A S D move
 *   mouse  the mouse alone (or a finger): Fly is then round the room, and Walk looks round with a
 *          drag and steps with the wheel
 */
export type MoveControls = 'keys' | 'mouse';

/** The person's walk: height, field of view, mouse speed, view bobbing and the hand. */
export interface MovePrefs {
  controls: MoveControls;
  heightCm: number;
  fov: number;
  look: number;
  bob: boolean;
  hand: boolean;
  skin: SkinTone['id'];
}

const KEY = 'youngvista.move';

/** Phones and tablets without a mouse start with the mouse-only (touch) way. */
const touchOnly = (): boolean => {
  try {
    return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
};

export const defaultMovePrefs = (): MovePrefs => ({
  controls: touchOnly() ? 'mouse' : 'keys',
  heightCm: WALK_HEIGHT_CM.default,
  fov: WALK_FOV.default,
  look: WALK_LOOK.default,
  bob: true,
  hand: false, // hidden unless the person shows it
  skin: normalizeSkin(undefined),
});

function stored(): MovePrefs {
  const base = defaultMovePrefs();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<MovePrefs> | null;
    if (!raw || typeof raw !== 'object') return base;
    return {
      controls: raw.controls === 'mouse' || raw.controls === 'keys' ? raw.controls : base.controls,
      heightCm: normalizeHeightCm(raw.heightCm),
      fov: normalizeFov(raw.fov),
      look: normalizeLookSpeed(raw.look),
      bob: raw.bob !== false,
      hand: raw.hand === true,
      skin: normalizeSkin(raw.skin),
    };
  } catch {
    return base;
  }
}

/** The person's movement settings, remembered on this device. */
export function useMovePrefs(): [MovePrefs, (change: Partial<MovePrefs>) => void] {
  const [prefs, setPrefs] = useState<MovePrefs>(stored);
  const update = useCallback((change: Partial<MovePrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...change };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private windows); the choice then lasts for this page.
      }
      return next;
    });
  }, []);
  return [prefs, update];
}
