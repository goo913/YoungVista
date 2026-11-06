import { useSyncExternalStore } from 'react';

/**
 * A tiny external store: React components outside a screen's tree (the Viro scene, which Viro
 * renders itself) subscribe to just the part they draw.
 */
export interface Store<T> {
  get(): T;
  set(next: T | ((state: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (s: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One part of a store's state. `select` must return a part of the state, not a new object. */
export function useStore<T, S>(store: Store<T>, select: (state: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
