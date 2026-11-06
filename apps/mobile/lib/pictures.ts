/**
 * Final pictures on the phone: kept, saved to Photos, uploaded, and listed per room.
 *
 * A new picture is copied into the app's documents folder and added to a queue that is kept in
 * AsyncStorage, so neither a weak connection, a failed upload nor closing the app loses it. The
 * queue uploads one picture at a time: the JPEG to Storage, then its record to Firestore (the
 * website's gallery lists the records). A failed try waits a little longer each time
 * (lib/picture-state.ts) and is tried again at once when the app comes back to the front or a
 * room page sees the server again. Once on the server, the JPEG moves to the cache folder, where
 * the room page still shows it from (the system may clear it; then it comes from Storage).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pictureFromFirestore, type CapturePlatform } from '@youngvista/core';
import { getRandomBytes } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { errorCode } from './auth-errors';
import { firebaseStorage, firestore } from './firebase';
import {
  addPicture,
  MAX_PICTURE_BYTES,
  newPictureId,
  nextDue,
  nextWakeAt,
  pendingPicture,
  pictureFailed,
  pictureFailure,
  pictureRecord,
  pictureStoragePath,
  pictureUploaded,
  queueFromText,
  queueToText,
  removePicture,
  retryAllNow,
  type PendingPicture,
  type PictureQueue,
  type StripPicture,
  type UploadedPicture,
} from './picture-state';

const queueKey = (uid: string) => `youngvista.pictures.${uid}`;

/** Waiting to upload: the documents folder, which the system never clears. */
const waitingDir = new Directory(Paths.document, 'pictures');
/** On the server already: the cache folder (the system may clear it when space runs low). */
const uploadedDir = new Directory(Paths.cache, 'pictures');

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

/** An uploaded picture's JPEG on this phone, if it is still here. */
export function uploadedFile(id: string): string | null {
  try {
    const file = new File(uploadedDir, `${id}.jpg`);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

const deleteQuietly = (uri: string) => {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or in use: the system clears the cache folder anyway.
  }
};

/** A failure with a code, like Firebase's, so `pictureFailure` can read it. */
const failure = (code: string, message: string) => Object.assign(new Error(message), { code });

/** No progress for this long while uploading: the tile says "Slow connection…" (ms). */
const SLOW_AFTER_MS = 15_000;

export interface UploadsSnapshot {
  /** Whose pictures these are (the signed-in user), or null. */
  uid: string | null;
  /** Pictures not completely on the server yet, oldest first. */
  queue: PictureQueue;
  /** The picture being sent now: its share done (0 to 1) and whether it has stalled. */
  active: { id: string; progress: number; slow: boolean } | null;
}

/** The queue of pictures to upload, for the signed-in user. */
class PictureUploads {
  private snapshot: UploadsSnapshot = { uid: null, queue: [], active: null };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private working = false;
  /** Raised when the user changes: work for the previous user is then ignored. */
  private generation = 0;
  private task: UploadTask | null = null;
  private saving: Promise<void> = Promise.resolve();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): UploadsSnapshot => this.snapshot;

  /** Signed in (or out): loads that user's waiting pictures and starts uploading them. */
  async start(uid: string | null): Promise<void> {
    if (this.snapshot.uid === uid) return;
    this.generation++;
    this.task?.cancel();
    this.task = null;
    this.working = false;
    this.clearTimer();
    this.set({ uid, queue: [], active: null });
    if (!uid) return;
    const generation = this.generation;
    let stored: string | null = null;
    try {
      stored = await AsyncStorage.getItem(queueKey(uid));
    } catch {
      // Unreadable: nothing was waiting, as far as this run knows.
    }
    if (generation !== this.generation) return;
    let queue = this.snapshot.queue;
    for (const p of queueFromText(stored, uid)) {
      if (!queue.some((q) => q.id === p.id)) queue = addPicture(queue, p);
    }
    this.set({ queue });
    this.kick();
  }

  /**
   * A picture just taken (a JPEG from the 3D view): copied to the documents folder, added to the
   * queue and kept there until the server has it. The capture itself is left for Photos.
   */
  async add(input: {
    uid: string;
    roomId: string;
    capture: { uri: string; width: number; height: number };
    platform: CapturePlatform;
  }): Promise<PendingPicture> {
    if (this.snapshot.uid !== input.uid) await this.start(input.uid);
    const id = newPictureId(getRandomBytes);
    ensure(waitingDir);
    const kept = new File(waitingDir, `${id}.jpg`);
    new File(input.capture.uri).copySync(kept);
    const picture = pendingPicture({
      id,
      uid: input.uid,
      roomId: input.roomId,
      file: kept.uri,
      width: input.capture.width,
      height: input.capture.height,
      platform: input.platform,
      takenAt: Date.now(),
    });
    this.update((q) => addPicture(q, picture));
    await this.persist();
    this.kick();
    return picture;
  }

  /** "Try again", the app came back to the front, or a screen sees the server again. */
  retryNow = (): void => {
    if (!this.snapshot.uid) return;
    const before = this.snapshot.queue;
    this.update(retryAllNow);
    if (this.snapshot.queue !== before) void this.persist();
    this.kick();
  };

  /** Forgets a picture that cannot be uploaded, and its file. */
  async discard(id: string): Promise<void> {
    const picture = this.snapshot.queue.find((p) => p.id === id);
    if (!picture || this.snapshot.active?.id === id) return;
    this.update((q) => removePicture(q, id));
    await this.persist();
    deleteQuietly(picture.file);
  }

  /** Works on the next picture that is due, or waits until one is. */
  private kick = (): void => {
    this.clearTimer();
    if (this.working || !this.snapshot.uid) return;
    const now = Date.now();
    const next = nextDue(this.snapshot.queue, now);
    if (next) {
      void this.work(next);
      return;
    }
    const wake = nextWakeAt(this.snapshot.queue);
    if (wake !== null) this.timer = setTimeout(this.kick, Math.max(0, wake - now));
  };

  private async work(picture: PendingPicture): Promise<void> {
    const generation = this.generation;
    const current = () => generation === this.generation;
    this.working = true;
    this.set({ active: { id: picture.id, progress: 0, slow: false } });
    try {
      if (picture.step === 'upload') {
        await this.upload(picture, current);
        if (!current()) return;
        this.update((q) => pictureUploaded(q, picture.id));
        await this.persist();
      }
      this.set({ active: { id: picture.id, progress: 1, slow: false } });
      // Resolves once the server has it (Firestore holds it while offline).
      await setDoc(
        doc(firestore(), 'rooms', picture.roomId, 'pictures', picture.id),
        pictureRecord(picture, serverTimestamp()),
      );
      if (!current()) return;
      keepUploadedCopy(picture);
      this.update((q) => removePicture(q, picture.id));
      await this.persist();
    } catch (error) {
      if (!current()) return;
      const kind = pictureFailure(errorCode(error));
      this.update((q) => pictureFailed(q, picture.id, kind, Date.now()));
      await this.persist();
    } finally {
      if (current()) {
        this.working = false;
        this.task = null;
        this.set({ active: null });
        this.kick();
      }
    }
  }

  /** Sends the JPEG to Storage, reporting progress; rejects with Firebase's error. */
  private async upload(picture: PendingPicture, current: () => boolean): Promise<void> {
    const file = new File(picture.file);
    if (!file.exists) throw failure('picture/file-missing', 'The picture file is missing.');
    if (file.size > MAX_PICTURE_BYTES) throw failure('picture/too-big', 'The picture is too big.');
    const blob = await fileBlob(picture.file);
    let stall: ReturnType<typeof setInterval> | null = null;
    try {
      const task = uploadBytesResumable(ref(firebaseStorage(), pictureStoragePath(picture)), blob, {
        contentType: 'image/jpeg',
      });
      this.task = task;
      let progress = 0;
      let movedAt = Date.now();
      stall = setInterval(() => {
        const slow = Date.now() - movedAt > SLOW_AFTER_MS;
        if (current() && this.snapshot.active?.slow !== slow) {
          this.set({ active: { id: picture.id, progress, slow } });
        }
      }, 2_000);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => {
            if (!current()) return;
            movedAt = Date.now();
            progress = snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0;
            this.set({ active: { id: picture.id, progress, slow: false } });
          },
          reject,
          resolve,
        );
      });
    } finally {
      if (stall) clearInterval(stall);
      (blob as Blob & { close?: () => void }).close?.();
    }
  }

  private set(next: Partial<UploadsSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  private update(change: (queue: PictureQueue) => PictureQueue) {
    const queue = change(this.snapshot.queue);
    if (queue !== this.snapshot.queue) this.set({ queue });
  }

  /** Saves the queue as it is when the write runs; writes run one after another. */
  private persist(): Promise<void> {
    this.saving = this.saving.then(async () => {
      const { uid, queue } = this.snapshot;
      if (!uid) return;
      try {
        await AsyncStorage.setItem(queueKey(uid), queueToText(queue));
      } catch {
        // Storage full or unavailable: the queue still works while the app stays open.
      }
    });
    return this.saving;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** The signed-in user's picture uploads (started by app/(app)/_layout.tsx). */
export const pictureUploads = new PictureUploads();

/** The upload queue, kept up to date. */
export function usePictureUploads(): UploadsSnapshot {
  return useSyncExternalStore(pictureUploads.subscribe, pictureUploads.getSnapshot);
}

/** A screen sees the server again (`online` from its snapshot): waiting pictures go now. */
export function useUploadWhenOnline(online: boolean): void {
  useEffect(() => {
    if (online) pictureUploads.retryNow();
  }, [online]);
}

/**
 * A local file as a Blob for Firebase Storage. React Native's XMLHttpRequest reads `file://`
 * URIs into native blobs, which Storage's upload slices and sends.
 */
function fileBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(failure('picture/file-missing', 'The picture file is unreadable.'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/** Uploaded: the JPEG leaves the documents folder for the cache folder. */
function keepUploadedCopy(picture: PendingPicture) {
  try {
    ensure(uploadedDir);
    const from = new File(picture.file);
    if (!from.exists) return;
    const to = new File(uploadedDir, `${picture.id}.jpg`);
    if (to.exists) to.delete();
    from.moveSync(to);
  } catch {
    deleteQuietly(picture.file);
  }
}

/** The capture's temporary file, once Photos has its copy. */
export const forgetCapture = deleteQuietly;

export type PhotosResult = 'saved' | 'denied' | 'failed';

/**
 * Saves a JPEG to the phone's photo library. iPhone: asks once for add-only access (the app never
 * reads photos). Android 11 and newer need no permission; older versions ask to write storage.
 */
export async function saveToPhotos(uri: string): Promise<PhotosResult> {
  try {
    const ask =
      Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) < 30);
    if (ask) {
      let permission = await MediaLibrary.getPermissionsAsync(true);
      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await MediaLibrary.requestPermissionsAsync(true);
      }
      if (permission.status !== 'granted') return 'denied';
    }
    await MediaLibrary.Asset.create(uri);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export type RoomPicturesState =
  | { status: 'loading' }
  | {
      status: 'ready';
      pictures: UploadedPicture[];
      /** True while what is shown comes from the phone's memory, not the server. */
      fromCache: boolean;
    }
  | { status: 'error'; message: string };

/** Most pictures the room page lists. */
const ROOM_PICTURES_LIMIT = 60;

/** The room's pictures on the server, newest first, kept up to date. `retry` listens again. */
export function useRoomPictures(roomId: string): RoomPicturesState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${roomId}#${attempt}`;
  const [state, setState] = useState<{ key: string; value: RoomPicturesState } | null>(null);
  useEffect(() => {
    const q = query(
      collection(firestore(), 'rooms', roomId, 'pictures'),
      orderBy('createdAt', 'desc'),
      limit(ROOM_PICTURES_LIMIT),
    );
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) =>
        setState({
          key,
          value: {
            status: 'ready',
            fromCache: snap.metadata.fromCache,
            pictures: snap.docs.flatMap((d) => {
              const p = pictureFromFirestore(d.data({ serverTimestamps: 'estimate' }));
              if (!p) return [];
              const createdAt = p.createdAt ? new Date(p.createdAt.toMillis()) : null;
              return [{ id: d.id, ...p, createdAt }];
            }),
          },
        }),
      (error) =>
        setState({
          key,
          value: {
            status: 'error',
            message:
              errorCode(error) === 'unavailable'
                ? 'Cannot reach the server. Check your connection and try again.'
                : 'The pictures could not be loaded. Try again.',
          },
        }),
    );
  }, [roomId, key]);
  const value: RoomPicturesState = state?.key === key ? state.value : { status: 'loading' };
  return { ...value, retry: () => setAttempt((n) => n + 1) };
}

const urls = new Map<string, Promise<string>>();

/** The download address of a picture in Storage (cached while the app runs). */
export function usePictureUrl(
  storagePath: string | null,
): { status: 'none' | 'loading' | 'error' } | { status: 'ready'; url: string } {
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!storagePath) return;
    let live = true;
    let pending = urls.get(storagePath);
    if (!pending) {
      pending = getDownloadURL(ref(firebaseStorage(), storagePath));
      urls.set(storagePath, pending);
      pending.catch(() => urls.delete(storagePath));
    }
    pending.then(
      (url) => live && setState({ path: storagePath, url }),
      () => live && setState({ path: storagePath, url: null }),
    );
    return () => {
      live = false;
    };
  }, [storagePath]);
  if (!storagePath) return { status: 'none' };
  if (!state || state.path !== storagePath) return { status: 'loading' };
  return state.url ? { status: 'ready', url: state.url } : { status: 'error' };
}

/**
 * Where to show a picture from: its JPEG on this phone, else (or when that fails to open, the
 * system may have cleared it) its download address in Storage. `uri` is null while loading or
 * when neither works.
 */
export function usePictureSource(picture: StripPicture): {
  uri: string | null;
  loading: boolean;
  onError: () => void;
} {
  const [failed, setFailed] = useState<string | null>(null);
  const local = picture.file && failed !== picture.file ? picture.file : null;
  const remote = usePictureUrl(local ? null : picture.storagePath);
  const uri = local ?? (remote.status === 'ready' ? remote.url : null);
  return {
    uri: uri && failed !== uri ? uri : null,
    loading: !local && remote.status === 'loading',
    onError: () => {
      if (uri) setFailed(uri);
    },
  };
}
