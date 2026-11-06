import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

/**
 * Full screen through the Fullscreen API, on one element (the room's viewer, so its toolbar and
 * panels come along). Where the API is missing (an iPhone's Safari), the element fills the window
 * instead. The 3D view's walk and fly keep working: the pointer lock asks for the canvas, which
 * is inside the element.
 */

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as WebkitDocument;

/** The element shown full screen now, or null. */
export const fullscreenElement = (): Element | null =>
  doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null;

const apiAvailable = (): boolean => !!(doc().fullscreenEnabled ?? doc().webkitFullscreenEnabled);

function subscribe(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  return () => {
    document.removeEventListener('fullscreenchange', onChange);
    document.removeEventListener('webkitfullscreenchange', onChange);
  };
}

/**
 * Where menus, dialogs and pop-overs should go: into the element shown full screen (only it is on
 * screen then), else into the page as usual (undefined).
 */
export function usePortalContainer(): HTMLElement | undefined {
  const el = useSyncExternalStore(subscribe, fullscreenElement, () => null);
  return el instanceof HTMLElement ? el : undefined;
}

/** Full screen for `target`: whether it is on, and a toggle. */
export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const el = useSyncExternalStore(subscribe, fullscreenElement, () => null);
  // The window-filling fallback, where the API is missing.
  const [filling, setFilling] = useState(false);
  const native = !!el && el === target.current;
  const active = native || filling;

  const toggle = useCallback(() => {
    const t = target.current as WebkitElement | null;
    if (!t) return;
    if (fullscreenElement()) {
      const exit = doc().exitFullscreen ?? doc().webkitExitFullscreen;
      void Promise.resolve(exit?.call(document)).catch(() => {});
      return;
    }
    if (filling) {
      setFilling(false);
      return;
    }
    if (apiAvailable()) {
      const request = t.requestFullscreen ?? t.webkitRequestFullscreen;
      void Promise.resolve(request?.call(t)).catch(() => setFilling(true));
    } else {
      setFilling(true);
    }
  }, [target, filling]);

  // Esc leaves the window-filling fallback too.
  useEffect(() => {
    if (!filling) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.pointerLockElement) setFilling(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filling]);

  return { active, native, filling, toggle };
}
