/**
 * Short confirmations over the screens: "Picture deleted", "Room renamed", "Could not delete the
 * room". One at a time, newest first; each goes by itself after a few seconds (errors stay a
 * little longer). components/toast-host.tsx draws them; any code can show one.
 */
import { useSyncExternalStore } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

/** How long a toast stays (ms). */
export const TOAST_MS: Record<ToastTone, number> = { success: 3500, info: 4000, error: 6500 };

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function set(next: Toast | null) {
  current = next;
  for (const l of [...listeners]) l();
}

export const toasts = {
  /** Shows a toast in place of the one showing; returns its id. */
  show(toast: Omit<Toast, 'id'>): number {
    const id = nextId++;
    set({ ...toast, id });
    return id;
  },
  /** Hides the toast `id` (if it is still the one showing), or whichever is showing. */
  dismiss(id?: number): void {
    if (current && (id === undefined || current.id === id)) set(null);
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(): Toast | null {
    return current;
  },
};

/** The toast showing now, or null. */
export function useToast(): Toast | null {
  return useSyncExternalStore(toasts.subscribe, toasts.get);
}
