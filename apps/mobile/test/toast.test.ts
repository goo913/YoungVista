import { describe, expect, it } from 'vitest';
import { toasts } from '@/lib/toast';

describe('toasts', () => {
  it('shows one at a time, the newest, and hides only the one asked for', () => {
    const seen: (string | null)[] = [];
    const stop = toasts.subscribe(() => seen.push(toasts.get()?.title ?? null));
    const first = toasts.show({ tone: 'success', title: 'Picture deleted' });
    const second = toasts.show({ tone: 'error', title: 'The room was not deleted', detail: 'x' });
    expect(toasts.get()).toMatchObject({ id: second, tone: 'error' });
    // The first one's timer runs out: the second one stays.
    toasts.dismiss(first);
    expect(toasts.get()?.id).toBe(second);
    toasts.dismiss(second);
    expect(toasts.get()).toBeNull();
    stop();
    toasts.show({ tone: 'info', title: 'Not seen' });
    expect(seen).toEqual(['Picture deleted', 'The room was not deleted', null]);
    toasts.dismiss();
    expect(toasts.get()).toBeNull();
  });
});
