/**
 * Saves a value (the room's design, or its walls) about a second after the last change, one write
 * at a time, and says how it is going: "Saving…", "Saved", "Offline, will save".
 *
 * Firestore keeps writes made without a connection and sends them when it is back, so a write's
 * promise can stay open for a long time. The queue waits for it rather than piling up writes, then
 * writes the newest value if more changes came in meanwhile. A write that fails outright (for
 * example permission denied) is tried again later, with growing pauses.
 *
 * Ported from the phone's `apps/mobile/lib/autosave.ts` without changing its behaviour, so the
 * website saves and reports exactly as the phone does. Plain TypeScript with no Firebase import;
 * timers are looked up when used, so tests can fake them.
 */

export type SaveStatus =
  /** Nothing waiting: every change is on the server. */
  | 'saved'
  /** A change is waiting for the pause after typing or dragging, or its write is on its way. */
  | 'saving'
  /** A write is waiting for the connection. */
  | 'offline'
  /** The last write failed; it will be tried again. */
  | 'error';

export interface AutosaveOptions<T> {
  /** Writes the value; resolves once the server has it. */
  write: (value: T) => Promise<void>;
  /** Pause after the last change before writing (ms). Default 1000. */
  delayMs?: number;
  /** A write still open after this long counts as offline (ms). Default 4000. */
  offlineAfterMs?: number;
  /** First pause before trying a failed write again (ms), doubling up to a minute. Default 3000. */
  retryMs?: number;
  onStatus?: (status: SaveStatus) => void;
  /** Called when `value` is on the server and no newer change is waiting. */
  onSaved?: (value: T) => void;
  /** Called when a write fails. */
  onError?: (error: unknown) => void;
}

/** The timers of whatever runs this (browser, phone, Node), looked up when used. */
interface TimerHost {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const timers = (): TimerHost => globalThis as unknown as TimerHost;

const MAX_RETRY_MS = 60_000;

export class Autosave<T> {
  private readonly opts: Required<Omit<AutosaveOptions<T>, 'onStatus' | 'onSaved' | 'onError'>> &
    AutosaveOptions<T>;
  private value: T | undefined;
  private dirty = false;
  private writing = false;
  private slow = false;
  private failed = false;
  private online = true;
  private retryDelay: number;
  private timer: unknown = null;
  private slowTimer: unknown = null;
  private disposed = false;
  private current: SaveStatus = 'saved';

  constructor(options: AutosaveOptions<T>) {
    this.opts = { delayMs: 1000, offlineAfterMs: 4000, retryMs: 3000, ...options };
    this.retryDelay = this.opts.retryMs;
  }

  get status(): SaveStatus {
    return this.current;
  }

  /** True while a change has not reached the server yet. */
  get pending(): boolean {
    return this.dirty || this.writing;
  }

  /** Records a change; it is written after `delayMs` without further changes. */
  change(value: T): void {
    if (this.disposed) return;
    this.value = value;
    this.dirty = true;
    this.failed = false;
    this.retryDelay = this.opts.retryMs;
    this.schedule(this.opts.delayMs);
    this.update();
  }

  /** Writes a waiting change now instead of after the pause (leaving the page, hiding the tab). */
  flush(): void {
    if (this.disposed || !this.dirty) return;
    this.clearTimer();
    void this.run();
  }

  /** Whether the app can reach the server (from Firestore's snapshot metadata). */
  setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    // Back online after a failure: try again straight away.
    if (online && this.failed && this.dirty && !this.writing) {
      this.clearTimer();
      void this.run();
    }
    this.update();
  }

  /** Stops the timers. A write already sent still completes (Firestore keeps it). */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    if (this.slowTimer) timers().clearTimeout(this.slowTimer);
    this.slowTimer = null;
  }

  private schedule(ms: number) {
    this.clearTimer();
    this.timer = timers().setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private clearTimer() {
    if (this.timer) timers().clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    if (this.disposed || this.writing || !this.dirty) return;
    const value = this.value as T;
    this.dirty = false;
    this.writing = true;
    this.slow = false;
    this.slowTimer = timers().setTimeout(() => {
      this.slow = true;
      this.update();
    }, this.opts.offlineAfterMs);
    this.update();
    try {
      await this.opts.write(value);
      this.failed = false;
      this.retryDelay = this.opts.retryMs;
      if (!this.dirty) this.opts.onSaved?.(value);
    } catch (error) {
      this.failed = true;
      this.opts.onError?.(error);
      if (!this.dirty) {
        // Nothing newer came in: this value still has to be saved.
        this.value = value;
        this.dirty = true;
      }
    } finally {
      this.writing = false;
      if (this.slowTimer) timers().clearTimeout(this.slowTimer);
      this.slowTimer = null;
      this.slow = false;
    }
    if (this.disposed) return;
    if (this.dirty) {
      if (this.failed) {
        this.schedule(this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
      } else if (!this.timer) {
        // Changes came in while writing and their pause is already over: write them now. (If
        // the pause is still running, its timer writes them.)
        this.schedule(0);
      }
    }
    this.update();
  }

  private update() {
    if (this.disposed) return;
    let next: SaveStatus;
    if (!this.dirty && !this.writing) next = 'saved';
    else if (this.failed && !this.writing) next = 'error';
    else if (!this.online || this.slow) next = 'offline';
    else next = 'saving';
    if (next !== this.current) {
      this.current = next;
      this.opts.onStatus?.(next);
    }
  }
}

/** The words for the status indicator. */
export const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline, will save',
  error: 'Not saved yet, trying again',
};
