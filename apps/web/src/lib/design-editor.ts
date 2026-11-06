import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Autosave,
  DesignFollower,
  displayedItems,
  initialDesignState,
  itemChecks,
  newItemId,
  reduceDesign,
  type CatalogItem,
  type Design,
  type DesignAction,
  type DesignActivity,
  type DesignContext,
  type DesignItem,
  type DesignState,
  type ItemCheck,
  type Room,
  type SaveStatus,
  type SnapshotSource,
} from '@youngvista/core';
import type { CatalogIndex } from './catalog';
import { saveDesign } from './rooms';

/** Furnishing one room on the website: the phone's rules, saving and live sync. */
export interface DesignEditor {
  state: DesignState;
  dispatch: (action: DesignAction) => void;
  ctx: DesignContext;
  /** "Saving…", "Saved", "Offline, will save". */
  status: SaveStatus;
  /** The items as drawn (the one being moved at its preview spot). */
  shown: DesignItem[];
  /** Whether each item can stand where it is drawn. */
  checks: Map<string, ItemCheck>;
  product: (productId: string) => CatalogItem | null;
}

/**
 * The design of one room while the owner furnishes it on the website.
 *
 * - The rules are the phone's: core's `reduceDesign` (ported from the phone's design-state.ts),
 *   with core's placement maths (snap to walls within 15 cm, face the room, no overlaps, stay
 *   inside the room).
 * - Every change is saved to `rooms/{id}.design` about a second later, in exactly the phone's
 *   format, by core's `Autosave` (the phone's queue): "Saving…", "Saved", "Offline, will save".
 * - Live sync, the same rule as the phone: a design another device saved is taken when the
 *   snapshot comes from the server (not this page's own pending write), differs from the last
 *   design this page loaded or saved, and the user has no unsaved edit or drag in progress. One
 *   that arrives while they are busy is taken when they are done, unless their edit is saved over
 *   it (core's `DesignFollower`).
 */
export function useDesignEditor({
  roomId,
  room,
  catalog,
  server,
  source,
}: {
  roomId: string;
  room: Room;
  catalog: CatalogIndex;
  /** The design as the newest snapshot has it. */
  server: Design;
  source: SnapshotSource;
}): DesignEditor {
  const ctx = useMemo<DesignContext>(
    () => ({ room, product: (id) => catalog.byId.get(id), newId: () => newItemId() }),
    [room, catalog],
  );
  // The reducer reads this render's room and catalog (React runs the latest reducer).
  const [state, dispatch] = useReducer(
    (s: DesignState, action: DesignAction) => reduceDesign(s, action, ctx),
    server.items,
    initialDesignState,
  );
  const [follower] = useState(() => new DesignFollower(server));
  const [status, setStatus] = useState<SaveStatus>('saved');
  const queue = useRef<Autosave<Design> | null>(null);
  // The newest state and the version handed to the queue, for the live-sync checks.
  const current = useRef(state);
  const queued = useRef(0);
  useLayoutEffect(() => {
    current.current = state;
  });
  const online = useRef(!source.fromCache);

  const activity = useCallback(
    (): DesignActivity => ({
      unsaved: (queue.current?.pending ?? false) || current.current.version !== queued.current,
      gesture: current.current.gesture !== null,
    }),
    [],
  );

  // One save queue per room. Leaving the page (or hiding the tab) writes what waits at once.
  useEffect(() => {
    const q = new Autosave<Design>({
      write: (design) => saveDesign(roomId, design),
      onStatus: setStatus,
      onSaved: (design) => follower.saved(design),
    });
    q.setOnline(online.current && navigator.onLine);
    queue.current = q;
    const onHide = () => {
      if (document.visibilityState === 'hidden') q.flush();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      q.flush();
      // Closing the tab while a change is still on its way asks first.
      if (q.pending) e.preventDefault();
    };
    const onNetwork = () => q.setOnline(online.current && navigator.onLine);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      q.flush();
      q.dispose();
      if (queue.current === q) queue.current = null;
    };
  }, [roomId, follower]);

  // Save after every change the user makes (not after loading).
  useEffect(() => {
    if (state.version === 0 || state.version === queued.current) return;
    queued.current = state.version;
    follower.edited();
    queue.current?.change({ items: state.items });
  }, [state.version, state.items, follower]);

  // Each snapshot: is the server's design one to take now?
  useEffect(() => {
    online.current = !source.fromCache;
    queue.current?.setOnline(online.current && navigator.onLine);
    const next = follower.snapshot(server, source, activity());
    if (next) dispatch({ type: 'load', items: next.items });
  }, [server, source, follower, activity]);

  // The user is done (a drag ended, a save settled): a design that waited can be taken now.
  useEffect(() => {
    if (state.gesture || status !== 'saved') return;
    const next = follower.resume(activity());
    if (next) dispatch({ type: 'load', items: next.items });
  }, [state.gesture, status, follower, activity]);

  const product = useCallback(
    (productId: string): CatalogItem | null => catalog.byId.get(productId) ?? null,
    [catalog],
  );
  const shown = useMemo(() => displayedItems(state), [state]);
  const checks = useMemo(() => itemChecks(state, ctx), [state, ctx]);
  return useMemo(
    () => ({ state, dispatch, ctx, status, shown, checks, product }),
    [state, ctx, status, shown, checks, product],
  );
}
