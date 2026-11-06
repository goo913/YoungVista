/**
 * Sending a capture: the keyframe JPEGs, then `capture.json` last, since it lists them (the server
 * is only asked to fit the room once everything is there). A few files go at a time; a file that
 * fails is tried again after a short wait, a few times; when no bytes move for a while the upload
 * says the connection is slow. If it stops anyway, "Try again" carries on with the files not sent
 * yet. The sending itself comes in as `send` (lib/turn-scan.ts: Firebase Storage), so this is
 * plain TypeScript (test/turn-upload.test.ts).
 */
import type { UploadFile } from './manifest';

/** How a running send is stopped: the sender sets `onCancel` (to cancel its upload task). */
export interface SendHandle {
  cancelled: boolean;
  onCancel?: () => void;
}

/** Sends one file, reporting the bytes sent so far; rejects with the storage error. */
export type SendFile = (
  file: UploadFile,
  onBytes: (sent: number) => void,
  handle: SendHandle,
) => Promise<void>;

export type UploadStatus = 'idle' | 'sending' | 'done' | 'failed' | 'cancelled';

export interface UploadSnapshot {
  status: UploadStatus;
  sentBytes: number;
  totalBytes: number;
  sentFiles: number;
  totalFiles: number;
  /** No bytes have moved for a while. */
  slow: boolean;
  /** Why it stopped (the last error), when it failed. */
  error: unknown;
  /** How many times it has started ("Try again" starts it again). */
  runs: number;
}

export interface UploadOptions {
  /** Files sent at once (the manifest always goes alone, last). */
  concurrency: number;
  /** Waits before each retry of a failed file (ms); there are as many retries as waits. */
  retryDelays: readonly number[];
  /** No bytes for this long: slow (ms). */
  slowAfterMs: number;
  now: () => number;
  wait: (ms: number) => Promise<void>;
}

const DEFAULTS: UploadOptions = {
  concurrency: 3,
  retryDelays: [2_000, 5_000, 10_000],
  slowAfterMs: 15_000,
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const isManifest = (f: UploadFile) => f.contentType === 'application/json';

export class CaptureUpload {
  private readonly files: UploadFile[];
  private readonly send: SendFile;
  private readonly options: UploadOptions;
  private readonly listeners = new Set<() => void>();
  private readonly sent = new Set<string>();
  private readonly inFlight = new Map<string, number>();
  private readonly active = new Set<SendHandle>();
  private snapshot: UploadSnapshot;
  private stopped = false;
  private movedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;

  /** `files`: the JPEGs and the manifest (whatever is 'application/json' goes last). */
  constructor(files: readonly UploadFile[], send: SendFile, options: Partial<UploadOptions> = {}) {
    this.files = [...files.filter((f) => !isManifest(f)), ...files.filter(isManifest)];
    this.send = send;
    this.options = { ...DEFAULTS, ...options };
    this.snapshot = {
      status: 'idle',
      sentBytes: 0,
      totalBytes: this.files.reduce((n, f) => n + Math.max(0, f.bytes), 0),
      sentFiles: 0,
      totalFiles: this.files.length,
      slow: false,
      error: null,
      runs: 0,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): UploadSnapshot => this.snapshot;

  /** Sends what is not sent yet; resolves when done, failed or cancelled (it never rejects). */
  start(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    });
    return this.running;
  }

  /** Stops sending (the screen went away, or the user chose to mark the walls instead). */
  cancel(): void {
    this.stopped = true;
    for (const handle of this.active) {
      handle.cancelled = true;
      handle.onCancel?.();
    }
    if (this.snapshot.status === 'sending') this.set({ status: 'cancelled', slow: false });
  }

  private async run(): Promise<void> {
    this.stopped = false;
    this.set({ status: 'sending', error: null, slow: false, runs: this.snapshot.runs + 1 });
    this.movedAt = this.options.now();
    this.timer = setInterval(() => {
      const slow = this.options.now() - this.movedAt > this.options.slowAfterMs;
      if (slow !== this.snapshot.slow && this.snapshot.status === 'sending') this.set({ slow });
    }, 1_000);
    const waiting = this.files.filter((f) => !this.sent.has(f.path));
    const images = waiting.filter((f) => !isManifest(f));
    const last = waiting.filter(isManifest);
    let failure: unknown = null;
    let next = 0;
    // A small pool: each worker takes the next file until none is left or one has failed.
    const worker = async () => {
      while (failure === null && !this.stopped && next < images.length) {
        const file = images[next++]!;
        try {
          await this.sendWithRetries(file);
        } catch (error) {
          failure ??= error;
        }
      }
    };
    const workers = Math.max(1, Math.min(this.options.concurrency, images.length));
    await Promise.all(Array.from({ length: workers }, worker));
    for (const file of last) {
      if (failure !== null || this.stopped) break;
      try {
        await this.sendWithRetries(file);
      } catch (error) {
        failure = error;
      }
    }
    if (this.stopped) this.set({ status: 'cancelled', slow: false });
    else if (failure !== null) this.set({ status: 'failed', error: failure, slow: false });
    else this.set({ status: 'done', slow: false });
  }

  private async sendWithRetries(file: UploadFile): Promise<void> {
    const delays = this.options.retryDelays;
    for (let attempt = 0; ; attempt++) {
      const handle: SendHandle = { cancelled: this.stopped };
      this.active.add(handle);
      try {
        await this.send(
          file,
          (bytes) => {
            if (handle.cancelled) return;
            this.inFlight.set(file.path, Math.max(0, Math.min(bytes, file.bytes)));
            this.moved();
          },
          handle,
        );
        this.inFlight.delete(file.path);
        this.sent.add(file.path);
        this.moved();
        return;
      } catch (error) {
        this.inFlight.delete(file.path);
        this.publishBytes();
        if (this.stopped || attempt >= delays.length) throw error;
      } finally {
        this.active.delete(handle);
      }
      await this.options.wait(delays[attempt]!);
      if (this.stopped) throw new Error('cancelled');
    }
  }

  private moved(): void {
    this.movedAt = this.options.now();
    this.publishBytes();
  }

  private publishBytes(): void {
    let bytes = 0;
    for (const f of this.files) if (this.sent.has(f.path)) bytes += f.bytes;
    for (const b of this.inFlight.values()) bytes += b;
    this.set({ sentBytes: bytes, sentFiles: this.sent.size, slow: false });
  }

  private set(next: Partial<UploadSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of [...this.listeners]) listener();
  }
}
