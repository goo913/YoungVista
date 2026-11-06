import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosave, SAVE_STATUS_TEXT, type SaveStatus } from '@/lib/autosave';

/** A write whose promise the test settles by hand, like a Firestore write waiting for the server. */
function controlledWrite() {
  const calls: { value: number; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const write = vi.fn(
    (value: number) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject });
      }),
  );
  return { write, calls };
}

function setup(options: { offlineAfterMs?: number; retryMs?: number } = {}) {
  const { write, calls } = controlledWrite();
  const statuses: SaveStatus[] = [];
  const saved: number[] = [];
  const queue = new Autosave<number>({
    write,
    delayMs: 1000,
    offlineAfterMs: options.offlineAfterMs ?? 4000,
    retryMs: options.retryMs ?? 3000,
    onStatus: (s) => statuses.push(s),
    onSaved: (v) => saved.push(v),
  });
  return { queue, write, calls, statuses, saved };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Autosave', () => {
  it('writes about a second after the last change, once', async () => {
    const { queue, write, calls, saved } = setup();
    queue.change(1);
    await vi.advanceTimersByTimeAsync(600);
    queue.change(2);
    await vi.advanceTimersByTimeAsync(600);
    queue.change(3);
    expect(write).not.toHaveBeenCalled();
    expect(queue.status).toBe('saving');
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenLastCalledWith(3);
    calls[0]!.resolve();
    await flush();
    expect(queue.status).toBe('saved');
    expect(saved).toEqual([3]);
    expect(queue.pending).toBe(false);
  });

  it('waits for a slow write, then writes only the newest value', async () => {
    const { queue, write, calls, saved } = setup();
    queue.change(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    queue.change(2);
    queue.change(3);
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).toHaveBeenCalledTimes(1); // still waiting for the first
    calls[0]!.resolve();
    await flush();
    expect(saved).toEqual([]); // 1 is on the server, but newer changes wait
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(3);
    calls[1]!.resolve();
    await flush();
    expect(saved).toEqual([3]);
    expect(queue.status).toBe('saved');
  });

  it('says "offline" while a write waits for the connection, and saves when it is back', async () => {
    const { queue, calls, statuses } = setup();
    queue.setOnline(false);
    queue.change(1);
    expect(queue.status).toBe('offline');
    await vi.advanceTimersByTimeAsync(1000);
    expect(queue.status).toBe('offline');
    queue.setOnline(true);
    expect(queue.status).toBe('saving');
    calls[0]!.resolve(); // Firestore sends the write it held
    await flush();
    expect(queue.status).toBe('saved');
    expect(statuses).toEqual(['offline', 'saving', 'saved']);
  });

  it('counts a write that takes too long as offline', async () => {
    const { queue, calls } = setup({ offlineAfterMs: 4000 });
    queue.change(1);
    await vi.advanceTimersByTimeAsync(1000 + 3999);
    expect(queue.status).toBe('saving');
    await vi.advanceTimersByTimeAsync(1);
    expect(queue.status).toBe('offline');
    calls[0]!.resolve();
    await flush();
    expect(queue.status).toBe('saved');
  });

  it('tries a failed write again with growing pauses, keeping the value', async () => {
    const { queue, write, calls, saved } = setup({ retryMs: 3000 });
    queue.change(7);
    await vi.advanceTimersByTimeAsync(1000);
    calls[0]!.reject(new Error('permission-denied'));
    await flush();
    expect(queue.status).toBe('error');
    await vi.advanceTimersByTimeAsync(2999);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(7);
    calls[1]!.reject(new Error('again'));
    await flush();
    await vi.advanceTimersByTimeAsync(5999);
    expect(write).toHaveBeenCalledTimes(2); // the pause doubled to 6 s
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(3);
    calls[2]!.resolve();
    await flush();
    expect(saved).toEqual([7]);
    expect(queue.status).toBe('saved');
  });

  it('writes at once when flushed (leaving the screen)', async () => {
    const { queue, write } = setup();
    queue.change(4);
    queue.flush();
    expect(write).toHaveBeenCalledWith(4);
    // Nothing waiting: flushing again writes nothing.
    queue.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('stops its timers when disposed, but a write already sent still counts', async () => {
    const { queue, write, calls, saved } = setup();
    queue.change(1);
    queue.flush();
    queue.change(2);
    queue.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(write).toHaveBeenCalledTimes(1);
    calls[0]!.resolve();
    await flush();
    expect(saved).toEqual([]); // 2 was never written, so 1 is not the newest
  });

  it('has words for every status', () => {
    expect(SAVE_STATUS_TEXT).toEqual({
      saved: 'Saved',
      saving: 'Saving…',
      offline: 'Offline, will save',
      error: 'Not saved yet, trying again',
    });
  });
});
