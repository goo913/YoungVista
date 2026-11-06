import { describe, expect, it } from 'vitest';
import type { UploadFile } from '@/scan/turn/manifest';
import { CaptureUpload, type SendFile } from '@/scan/turn/upload';

const jpeg = (k: number): UploadFile => ({
  uri: `file:///f${k}.jpg`,
  path: `kf/${String(k).padStart(3, '0')}.jpg`,
  contentType: 'image/jpeg',
  bytes: 1000,
});
const manifest: UploadFile = {
  uri: 'file:///capture.json',
  path: 'capture.json',
  contentType: 'application/json',
  bytes: 200,
};

const options = { wait: () => Promise.resolve(), retryDelays: [10, 20, 30] };

describe('CaptureUpload', () => {
  it('sends every JPEG, then capture.json last, reporting the bytes', async () => {
    const order: string[] = [];
    const send: SendFile = async (file, onBytes) => {
      onBytes(file.bytes / 2);
      await Promise.resolve();
      order.push(file.path);
      onBytes(file.bytes);
    };
    const files = [manifest, ...[0, 1, 2, 3, 4].map(jpeg)];
    const upload = new CaptureUpload(files, send, options);
    const seen: number[] = [];
    upload.subscribe(() => seen.push(upload.getSnapshot().sentBytes));
    await upload.start();
    expect(order.at(-1)).toBe('capture.json');
    expect(order).toHaveLength(6);
    expect(upload.getSnapshot()).toMatchObject({
      status: 'done',
      sentBytes: 5200,
      totalBytes: 5200,
      sentFiles: 6,
      totalFiles: 6,
    });
    // Progress only goes up.
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1]!)).toBe(true);
  });

  it('sends a few at a time', async () => {
    let running = 0;
    let most = 0;
    const send: SendFile = async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
    };
    await new CaptureUpload([0, 1, 2, 3, 4, 5, 6].map(jpeg), send, {
      ...options,
      concurrency: 3,
    }).start();
    expect(most).toBe(3);
  });

  it('tries a failed file again before giving up', async () => {
    const tries = new Map<string, number>();
    const send: SendFile = async (file) => {
      const n = (tries.get(file.path) ?? 0) + 1;
      tries.set(file.path, n);
      if (file.path === 'kf/001.jpg' && n < 3) {
        throw Object.assign(new Error('dropped'), { code: 'storage/retry-limit-exceeded' });
      }
    };
    const upload = new CaptureUpload([jpeg(0), jpeg(1), manifest], send, options);
    await upload.start();
    expect(upload.getSnapshot().status).toBe('done');
    expect(tries.get('kf/001.jpg')).toBe(3);
  });

  it('stops after the last retry, and "Try again" sends only what is missing', async () => {
    let online = false;
    const sent: string[] = [];
    const send: SendFile = async (file) => {
      if (!online && file.path === 'kf/002.jpg') {
        throw Object.assign(new Error('offline'), { code: 'storage/retry-limit-exceeded' });
      }
      sent.push(file.path);
    };
    const upload = new CaptureUpload([jpeg(0), jpeg(1), jpeg(2), manifest], send, {
      ...options,
      concurrency: 1,
    });
    await upload.start();
    const failed = upload.getSnapshot();
    expect(failed.status).toBe('failed');
    expect((failed.error as { code: string }).code).toBe('storage/retry-limit-exceeded');
    expect(sent).toEqual(['kf/000.jpg', 'kf/001.jpg']);
    expect(failed.sentFiles).toBe(2);
    online = true;
    await upload.start();
    expect(upload.getSnapshot()).toMatchObject({ status: 'done', runs: 2, sentFiles: 4 });
    expect(sent).toEqual(['kf/000.jpg', 'kf/001.jpg', 'kf/002.jpg', 'capture.json']);
  });

  it('cancels the files on their way', async () => {
    const cancelled: string[] = [];
    let started = 0;
    const send: SendFile = (file, _onBytes, handle) =>
      new Promise((_resolve, reject) => {
        started++;
        handle.onCancel = () => {
          cancelled.push(file.path);
          reject(Object.assign(new Error('cancelled'), { code: 'storage/canceled' }));
        };
      });
    const upload = new CaptureUpload([0, 1, 2, 3].map(jpeg), send, { ...options, concurrency: 2 });
    const done = upload.start();
    await Promise.resolve();
    expect(started).toBe(2);
    upload.cancel();
    await done;
    expect(cancelled.sort()).toEqual(['kf/000.jpg', 'kf/001.jpg']);
    expect(upload.getSnapshot().status).toBe('cancelled');
    expect(started).toBe(2);
  });

  it('says when nothing has moved for a while', async () => {
    let now = 0;
    let finish: () => void = () => {};
    const send: SendFile = () => new Promise((resolve) => (finish = resolve));
    const upload = new CaptureUpload([jpeg(0)], send, {
      ...options,
      slowAfterMs: 15_000,
      now: () => now,
    });
    const done = upload.start();
    now = 16_000;
    await new Promise((r) => setTimeout(r, 1_100));
    expect(upload.getSnapshot().slow).toBe(true);
    finish();
    await done;
    expect(upload.getSnapshot()).toMatchObject({ status: 'done', slow: false });
  });
});
