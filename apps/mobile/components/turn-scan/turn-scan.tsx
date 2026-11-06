/**
 * The turn-around scan (docs/research/room-capture-and-ai.md, Q1), on one screen over one AR
 * session, in landscape:
 *
 * 1. How to stand and turn, and the user's yes to sending the pictures (TurnIntro).
 * 2. Find the floor, as the marked scan does (scan/floor.ts), then turn three rings at one spot,
 *    or two spots: the phone keeps posed keyframes (modules/room-capture, scan/turn/capture.ts).
 * 3. Send them and `capture.json` to Storage, ask the server to fit the room (`fitRoom`) and
 *    listen to `scanFits/{scanId}` (lib/turn-scan.ts), the camera still running.
 * 4. The server's walls go into the scan session as marks (scan/turn/merge.ts) and show in the
 *    camera view, unsure ones in amber; one mark by hand fixes any of them. Then the usual ceiling
 *    step, review and save (components/scan/*), with the server's doors and windows on the walls
 *    and its panoramas saved as the room's tour.
 * 5. If the upload or the fit fails, takes too long or finds too few walls, "Mark the walls
 *    instead" carries on as the marked scan, in the same session.
 *
 * Every scan writes one scan log (scan/scan-log.ts plus scan/turn/turn-log.ts).
 */
import { checkPermissions, requestRequiredPermissions } from '@reactvision/react-viro';
import viroPackage from '@reactvision/react-viro/package.json';
import { LOW_CONFIDENCE, describeRoomSize, formatLength, type ScanFitDoc } from '@youngvista/core';
import { Directory, File, Paths } from 'expo-file-system';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { LuBug, LuX } from 'react-icons/lu';
import { ArController } from '@/ar/controller';
import { initialArSceneState } from '@/components/ar/ar-scene';
import { ArAfterScan, SavedCard } from '@/components/scan/after-scan';
import { CameraGate } from '@/components/scan/camera-gate';
import { CeilingStep } from '@/components/scan/ceiling-step';
import { DebugPanel } from '@/components/scan/debug-panel';
import { MiniMap } from '@/components/scan/mini-map';
import {
  RoomReview,
  type ReviewProgress,
  type RoomDraft,
  type SavedRoom,
} from '@/components/scan/room-review';
import {
  GuidanceBanner,
  Notice,
  Reticle,
  RoundButton,
  ScanControls,
} from '@/components/scan/scan-hud';
import { useUser } from '@/lib/auth';
import { createStore } from '@/lib/store';
import {
  captureSender,
  deleteCaptureFolder,
  fitRequestErrorText,
  newScanId,
  requestRoomFit,
  saveRoomTour,
  uploadErrorText,
  watchRoomFit,
} from '@/lib/turn-scan';
import { useUnits } from '@/lib/units';
import {
  keepFrame,
  onCaptureFrame,
  prepareCapture,
  roomCaptureAvailable,
  startCapture,
  stopCapture,
  type PrepareResult,
} from '@/modules/room-capture';
import release from '@/release.json';
import { ScanController, type ScanRecord } from '@/scan/controller';
import { deviceInfo, writeScanLog } from '@/scan/log-writer';
import { ScanLogger } from '@/scan/scan-log';
import type { FinishResult, MarkOutcome } from '@/scan/session';
import { TurnCapture } from '@/scan/turn/capture';
import { captureMessage, type FitStage } from '@/scan/turn/coach';
import { placeFittedOpenings, tourInRoom } from '@/scan/turn/fit';
import { buildManifest, captureProblem, type UploadFile } from '@/scan/turn/manifest';
import { fitSeedFrom, mergeFitMarks, wallSources } from '@/scan/turn/merge';
import { CAPTURE_MODE } from '@/scan/turn/plan';
import { TurnLogBook, type TurnLogInput } from '@/scan/turn/turn-log';
import { CaptureUpload, type UploadSnapshot } from '@/scan/turn/upload';
import { PitchLine, RingDial } from './capture-hud';
import { CameraHud, HUD_RAIL, useLandscape } from '@/components/camera-hud';
import { TurnArView, type TurnArHandle } from './turn-ar-view';
import { TurnIntro } from './turn-intro';
import { CaptureControls, FittedCard, MarkControls, MeasuringCard } from './turn-panels';
import { initialTurnSceneState } from './turn-scene';

/**
 * The server has this long to fit the room before the screen offers to mark instead (ms). On CPU
 * a one-spot fit takes about 6 minutes (docs/server.md); on a GPU about a minute.
 */
const FIT_TIMEOUT_MS = 480_000;
/** "Keep waiting" gives it this much longer (ms). */
const KEEP_WAITING_MS = 120_000;
/** The marked scan finishes by itself once every wall has fitted for this long (ms). */
const AUTO_FINISH_AFTER = 1200;
/** Below this many keyframes in a ring of the first spot, the capture is not sent. */
const MIN_PER_RING = 6;

type Mode = 'intro' | 'capture' | 'measuring' | 'fitted' | 'marking' | 'marked';
type NoticeState = { tone: 'info' | 'error'; text: string } | null;
type Built = Extract<FinishResult, { ok: true }>;

const noStore = () => () => {};

function useUploadSnapshot(upload: CaptureUpload | null): UploadSnapshot | null {
  return useSyncExternalStore(upload ? upload.subscribe : noStore, () =>
    upload ? upload.getSnapshot() : null,
  );
}

function captureDirectory(scanId: string): Directory {
  const dir = new Directory(Paths.cache, 'turn-scan', scanId);
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  } catch {
    // Written into on first use; a failure shows up as frames that cannot be kept.
  }
  return dir;
}

function deleteQuietly(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The cache folder is cleared by the system anyway.
  }
}

const formatName = (f: PrepareResult['format']) => `${f.width}x${f.height}@${f.fps}`;

/** The log's fit entry for a fit that brought no walls. */
const noFit = (
  status: NonNullable<TurnLogInput['fit']>['status'],
  error: string | null,
): NonNullable<TurnLogInput['fit']> => ({
  status,
  error,
  ms: null,
  walls: 0,
  unsure: 0,
  openings: 0,
  spots: 0,
  info: null,
});

export function TurnScan({ onRestart }: { onRestart: () => void }) {
  useKeepAwake();
  const router = useRouter();
  const focused = useIsFocused();
  const landscape = useLandscape();
  const [units] = useUnits();
  const user = useUser();

  const [mode, setMode] = useState<Mode>('intro');
  const [controller] = useState(
    () => new ScanController({ scan: { centerSpace: Platform.OS === 'ios' ? 'world' : 'local' } }),
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [turnStore] = useState(() => createStore(initialTurnSceneState));
  const [arController] = useState(() => new ArController());
  const [arScene] = useState(() => createStore(initialArSceneState()));
  const arProps = useMemo(
    () => ({ controller: arController, store: arScene }),
    [arController, arScene],
  );
  const arView = useRef<TurnArHandle>(null);

  const [scanId] = useState(newScanId);
  const [folder] = useState(() => captureDirectory(scanId));
  const [capture] = useState(
    () =>
      new TurnCapture({
        keep: (id, uri) => keepFrame(id, uri),
        remove: deleteQuietly,
        folder: folder.uri.endsWith('/') ? folder.uri : `${folder.uri}/`,
        viroCamera: () => controller.getSnapshot().state.camera,
      }),
  );
  const shot = useSyncExternalStore(capture.subscribe, capture.getSnapshot);

  const [video, setVideo] = useState<PrepareResult | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [upload, setUpload] = useState<CaptureUpload | null>(null);
  const uploadState = useUploadSnapshot(upload);
  const [fitStage, setFitStage] = useState<FitStage>('uploading');
  const [fitError, setFitError] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [built, setBuilt] = useState<Built | null>(null);
  const [draft, setDraft] = useState<RoomDraft | null>(null);
  const [saved, setSaved] = useState<SavedRoom | null>(null);
  const [inAr, setInAr] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [debug, setDebugState] = useState(false);

  const captureStart = useRef<{ at: number; floorY: number } | null>(null);
  const askedAt = useRef<number | null>(null);
  const latestFit = useRef<ScanFitDoc | null>(null);
  const fitDoc = useRef<ScanFitDoc | null>(null);
  const draftRoom = useRef<RoomDraft['room'] | null>(null);
  const uploadStarted = useRef(false);
  const tourKept = useRef(false);
  /** The camera was started: from then on the scan writes its log. */
  const started = useRef(false);
  /** The user went on to mark the walls: no more uploading or asking. */
  const abandoned = useRef(false);
  /** Asking again after the server failed: its old "failed" does not count. */
  const ignoreFailed = useRef(false);

  // The scan log: the session's, plus what the turn-around scan adds (noted as it goes).
  const [book] = useState(() => new TurnLogBook(scanId));
  const [logger] = useState(
    () =>
      new ScanLogger(
        (doc) => {
          const { state } = controller.getSnapshot();
          const replaced = state.fit
            ? mergeFitMarks(state.fit, handInputs(controller)).replaced.length
            : 0;
          const hand = { marks: state.marks.filter((m) => m.role === 'wall').length, replaced };
          writeScanLog({ ...doc, ...book.fields({ capture: capture.report(), hand }) });
        },
        user.uid,
        deviceInfo(),
      ),
  );

  // Every scan writes one log: when the room is saved, or when the scan ends without saving.
  const lastFailure = useRef<string | null>(null);
  const reviewed = useRef<{ record: ScanRecord; progress: ReviewProgress | null } | null>(null);
  const endScan = useCallback(() => {
    if (logger.done || !started.current) return;
    const review = reviewed.current;
    if (review) {
      const p = review.progress;
      logger.finish(review.record, {
        outcome: p?.error ? 'failed' : 'abandoned',
        failure: p?.error ?? null,
        room: p?.room ?? null,
        scaleFactor: p?.scaleFactor ?? 1,
      });
      return;
    }
    logger.finish(controller.record(), {
      outcome: lastFailure.current ? 'failed' : 'abandoned',
      failure: lastFailure.current,
    });
  }, [controller, logger]);

  // Leaving: stop the camera sampling and the upload, and let the pictures go (the room's tour
  // keeps them in Storage when it was saved).
  const letGo = useCallback(() => {
    capture.stop();
    void stopCapture();
    upload?.cancel();
    try {
      if (folder.exists) folder.delete();
    } catch {
      // The cache folder is cleared by the system anyway.
    }
    if (uploadStarted.current && !tourKept.current) {
      void deleteCaptureFolder(user.uid, scanId).catch(() => undefined);
    }
  }, [capture, upload, folder, user.uid, scanId]);
  const leaving = useRef(letGo);
  useEffect(() => {
    leaving.current = letGo;
  }, [letGo]);

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.dispose();
      arController.dispose();
      // Leaving for good (a remount, as in React's StrictMode, is not leaving).
      setTimeout(() => {
        if (mounted.current) return;
        endScan();
        leaving.current();
      }, 0);
    };
  }, [controller, arController, endScan]);

  const close = useCallback(() => {
    endScan();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router, endScan]);

  // Short-lived notices fade by themselves; errors stay until dismissed or replaced.
  useEffect(() => {
    if (notice?.tone !== 'info') return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  /* 1. Before the camera: the user's yes, and the camera permission asked here (the camera
     gate's own words say nothing is uploaded, which is not so for this scan). */
  const begin = async () => {
    try {
      const has = (await checkPermissions(['camera'])).camera === true;
      if (!has) await requestRequiredPermissions(['camera']);
    } catch {
      // The camera gate asks again, or points to Settings.
    }
    started.current = true;
    setMode('capture');
  };

  /* 2. The AR session: its video format, once the camera runs (its first pose comes through
     the scan session). */
  const prepared = useRef(false);
  useEffect(() => {
    if (mode !== 'capture') return;
    return controller.subscribe(() => {
      if (prepared.current || !controller.getSnapshot().state.camera) return;
      const tag = arView.current?.viewTag();
      if (!tag) return;
      prepared.current = true;
      if (!roomCaptureAvailable) {
        book.note({ videoError: 'The capture module is not in this build.' });
        return;
      }
      setPreparing(true);
      prepareCapture(tag, { prefer4x3: true })
        .then(
          (result) => {
            setVideo(result);
            book.note({ video: result });
          },
          (error: unknown) => {
            book.note({ videoError: error instanceof Error ? error.message : String(error) });
          },
        )
        .finally(() => setPreparing(false));
    });
  }, [mode, controller, book]);

  useEffect(() => {
    if (mode !== 'capture') return;
    return onCaptureFrame((frame) => capture.onFrame(frame));
  }, [mode, capture]);

  const startTurning = async () => {
    const tag = arView.current?.viewTag();
    if (!tag) return;
    setStarting(true);
    try {
      await startCapture(tag, { rate: 15, slots: 8 });
    } catch {
      setNotice({
        tone: 'error',
        text: 'The camera pictures could not be reached. Mark the walls instead.',
      });
      setStarting(false);
      return;
    }
    setStarting(false);
    captureStart.current ??= { at: Date.now(), floorY: snapshot.derived.floor?.y ?? 0 };
    capture.beginSpot();
  };

  /* 3. Send the pictures, ask for the fit, listen to it. */
  const ask = useCallback(async () => {
    if (abandoned.current) return;
    setFitStage('asking');
    setFitError(null);
    latestFit.current = null;
    askedAt.current = Date.now();
    setDeadline(Date.now() + FIT_TIMEOUT_MS);
    try {
      await requestRoomFit(scanId);
    } catch (error) {
      if (!mounted.current || abandoned.current) return;
      // The answer was lost, but the server has the scan anyway (the listener saw it meanwhile).
      const seen = latestFit.current as ScanFitDoc | null;
      if (seen && seen.status !== 'failed') return;
      const text = fitRequestErrorText(error);
      setFitStage('request-failed');
      setFitError(text);
      book.note({ fit: noFit('request-failed', text) });
    }
  }, [scanId, book]);

  const send = useCallback(
    async (job: CaptureUpload) => {
      setFitStage('uploading');
      setFitError(null);
      uploadStarted.current = true;
      const began = Date.now();
      await job.start();
      const s = job.getSnapshot();
      book.note({
        upload: {
          files: s.totalFiles,
          bytes: s.totalBytes,
          ms: s.status === 'done' ? Date.now() - began : null,
          runs: s.runs,
          error: s.status === 'failed' ? uploadErrorText(s.error) : null,
        },
      });
      if (!mounted.current || abandoned.current || s.status === 'cancelled') return;
      if (s.status === 'failed') {
        setFitStage('upload-failed');
        setFitError(uploadErrorText(s.error));
        return;
      }
      await ask();
    },
    [ask, book],
  );

  const measure = async () => {
    const floor = controller.getSnapshot().derived.floor;
    const problem = captureProblem({
      floorY: floor?.y ?? null,
      keyframes: capture.keyframes(),
      minPerRing: MIN_PER_RING,
    });
    if (problem) {
      setNotice({ tone: 'error', text: problem });
      return;
    }
    capture.stop();
    void stopCapture();
    setMode('measuring');
    setFitStage('uploading');
    await capture.settle();
    if (!mounted.current || abandoned.current) return;
    const record = controller.record();
    const start = captureStart.current ?? { at: record.startedAt, floorY: floor?.y ?? 0 };
    const history = [
      { t: 0, y: start.floorY },
      ...record.floorEvents
        .map((e) => ({ t: (record.startedAt + e.t - start.at) / 1000, y: e.floor?.y }))
        .filter((e): e is { t: number; y: number } => e.t > 0 && typeof e.y === 'number'),
    ];
    const v = video;
    const { manifest, files } = buildManifest({
      scanId,
      ownerId: user.uid,
      createdAt: new Date(start.at),
      mode: CAPTURE_MODE,
      device: {
        model: v?.model ?? 'iPhone',
        os: `iOS ${v?.os ?? String(Platform.Version)}`,
        app: `${release.version} (${release.build})`,
        viro: viroPackage.version,
        ...(v
          ? {
              videoFormat: v.switched
                ? `${formatName(v.format)} (switched from ${formatName(v.before)})`
                : formatName(v.format),
            }
          : {}),
      },
      floor: { y: controller.getSnapshot().derived.floor?.y ?? start.floorY, history },
      keyframes: capture.keyframes(),
    });
    let manifestFile: UploadFile;
    try {
      const file = new File(folder, 'capture.json');
      const text = JSON.stringify(manifest);
      file.write(text);
      manifestFile = {
        uri: file.uri,
        path: 'capture.json',
        contentType: 'application/json',
        bytes: text.length,
      };
    } catch {
      setFitStage('upload-failed');
      setFitError('The scan could not be saved on the phone. Mark the walls instead.');
      return;
    }
    const job = new CaptureUpload([...files, manifestFile], captureSender(user.uid, scanId));
    setUpload(job);
    await send(job);
  };

  const onFitDone = useCallback(
    (fit: ScanFitDoc) => {
      const result = fit.result;
      if (!result || result.marks.length === 0) {
        setFitStage('failed');
        setFitError('The pictures did not show enough of the walls.');
        return;
      }
      fitDoc.current = fit;
      const seed = fitSeedFrom(result);
      controller.setFit(seed);
      turnStore.set({ walls: true, aim: false });
      book.note({
        fit: {
          status: 'done',
          error: null,
          ms: askedAt.current ? Date.now() - askedAt.current : null,
          walls: seed.walls.length,
          unsure: seed.walls.filter((w) => w.confidence < LOW_CONFIDENCE).length,
          openings: result.openings.length,
          spots: result.spots.length,
          info: fit.info ?? null,
        },
      });
      setMode('fitted');
    },
    [controller, turnStore, book],
  );

  const watching =
    mode === 'measuring' &&
    (fitStage === 'asking' ||
      fitStage === 'queued' ||
      fitStage === 'running' ||
      fitStage === 'timeout');
  useEffect(() => {
    if (!watching) return;
    return watchRoomFit(
      scanId,
      (fit) => {
        if (!fit) return;
        // Asked again after a failure: the old "failed" stays until the server takes it again.
        if (fit.status === 'failed' && ignoreFailed.current) return;
        ignoreFailed.current = false;
        latestFit.current = fit;
        if (fit.status === 'done') onFitDone(fit);
        else if (fit.status === 'failed') {
          setFitStage('failed');
          setFitError(fit.error ?? null);
          book.note({
            fit: {
              ...noFit('failed', fit.error ?? null),
              ms: askedAt.current ? Date.now() - askedAt.current : null,
              info: fit.info ?? null,
            },
          });
        } else setFitStage((stage) => (stage === 'timeout' ? stage : fit.status));
      },
      () => {
        // Listening failed: the time limit below offers the way out.
      },
    );
  }, [watching, scanId, onFitDone, book]);

  useEffect(() => {
    if (mode !== 'measuring') return;
    if (fitStage !== 'asking' && fitStage !== 'queued' && fitStage !== 'running') return;
    const timer = setTimeout(
      () => {
        setFitStage('timeout');
        if (!book.fit) book.note({ fit: noFit('timeout', null) });
      },
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [mode, fitStage, deadline, book]);

  const retry = () => {
    if (fitStage === 'upload-failed' && upload) {
      void send(upload);
      return;
    }
    ignoreFailed.current = fitStage === 'failed';
    void ask();
  };
  const keepWaiting = () => {
    setDeadline(Date.now() + KEEP_WAITING_MS);
    const status = latestFit.current?.status;
    setFitStage(status === 'queued' || status === 'running' ? status : 'asking');
  };

  /* 4. The server's walls; marks by hand; the room. */
  const finish = useCallback(() => {
    const result = controller.finish();
    if (!result.ok) {
      lastFailure.current = result.reason;
      setNotice({ tone: 'error', text: result.reason });
      return;
    }
    lastFailure.current = null;
    setNotice(null);
    setBuilt(result);
  }, [controller]);

  const markedText = (outcome: Extract<MarkOutcome, { kind: 'marked' }>): string | null => {
    switch (outcome.step) {
      case 'second-mark':
        return 'First wall marked.';
      case 'ceiling':
        return outcome.ceilingHeight !== null
          ? `Ceiling: ${formatLength(outcome.ceilingHeight, units)}.`
          : null;
      case 'walls':
        return outcome.joined ? 'Added to the same wall.' : 'Wall marked.';
      default:
        return null;
    }
  };

  const mark = () => {
    const outcome = controller.mark();
    if (outcome.kind === 'error') {
      setNotice({ tone: 'error', text: outcome.message });
      return;
    }
    const text = markedText(outcome);
    setNotice(text ? { tone: 'info', text } : null);
  };

  const markByHand = () => {
    turnStore.set({ walls: true, aim: true });
    setNotice(null);
    setMode('marking');
  };

  /* 5. The way out: the marked scan, in this same session. */
  const markInstead = () => {
    book.note({ fallback: 'marked' });
    abandoned.current = true;
    capture.stop();
    void stopCapture();
    upload?.cancel();
    controller.setFit(null);
    turnStore.set({ walls: false, aim: false });
    arView.current?.markInstead();
    setNotice(null);
    setMode('marked');
  };

  // The marked scan finishes by itself once every wall fits, as on the scan screen.
  const autoFinish = useRef(false);
  useEffect(() => {
    autoFinish.current = mode === 'marked' && built === null;
  }, [mode, built]);
  useEffect(() => {
    let closedSince: number | null = null;
    let triedFor: string | null = null;
    return controller.subscribe(() => {
      const { state, derived } = controller.getSnapshot();
      if (!autoFinish.current || !derived.closed) {
        closedSince = null;
        return;
      }
      const now = Date.now();
      closedSince ??= now;
      const signature = `${state.marks.length}/${derived.grouped?.walls.length ?? 0}`;
      if (now - closedSince >= AUTO_FINISH_AFTER && triedFor !== signature) {
        triedFor = signature;
        finish();
      }
    });
  }, [controller, finish]);

  const setDebug = (on: boolean) => {
    setDebugState(on);
    controller.setDebug(on);
  };

  // The room is closed and the ceiling set: review it over the running AR session, with the
  // server's doors and windows on its walls when the server's walls were used.
  const next = (ceilingHeight: number) => {
    if (!built) return;
    reviewed.current = { record: controller.record(), progress: null };
    let room = { ...built.room, ceilingHeight };
    const result = fitDoc.current?.result;
    if (result && controller.getSnapshot().state.fit) {
      const placed = placeFittedOpenings(room, {
        axesAngle: result.axesAngle,
        marks: result.marks,
        openings: result.openings,
      });
      room = placed.room;
      book.note({ openingsPlaced: placed.placed });
    }
    draftRoom.current = room;
    setDraft({
      room,
      inferredWalls: built.inferredWalls,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
  };
  const onProgress = useCallback((progress: ReviewProgress) => {
    if (reviewed.current) reviewed.current.progress = progress;
  }, []);
  const onSaved = (room: SavedRoom) => {
    // The panoramas (and the scan's folder, which deleting the room deletes) go with the room.
    const result = fitDoc.current?.result;
    if (result && draftRoom.current) {
      const tour = tourInRoom({
        scanId,
        spots: result.spots,
        floorY: result.floorY,
        room: draftRoom.current,
        scaleFactor: room.scaleFactor,
      });
      tourKept.current = true;
      book.note({ tourSpots: tour.spots.length });
      void saveRoomTour(room.id, tour).catch(() => {
        setTimeout(() => void saveRoomTour(room.id, tour).catch(() => undefined), 5_000);
      });
    }
    const review = reviewed.current;
    if (review && !logger.done) {
      logger.finish(review.record, {
        outcome: 'saved',
        roomId: room.id,
        room: room.room,
        scaleFactor: room.scaleFactor,
      });
    }
    setSaved(room);
  };
  const scanAgain = () => {
    endScan();
    onRestart();
  };
  const discard = () => {
    endScan();
    router.replace('/');
  };
  const openRoom = () => {
    if (saved) router.replace({ pathname: '/rooms/[id]', params: { id: saved.id } });
  };
  const seeInRoom = () => {
    const s = controller.getSnapshot().state;
    arController.seed({
      planes: s.planes,
      camera: s.camera,
      tracking: s.tracking,
      lightIntensity: s.lightIntensity,
      floor: s.floor,
    });
    arView.current?.showRoom();
    setInAr(true);
  };

  if (mode === 'intro') {
    return (
      <View className="flex-1 bg-black">
        <TurnIntro
          available={roomCaptureAvailable && Platform.OS === 'ios'}
          onStart={() => void begin()}
          onMarkInstead={() => router.replace('/scan')}
          onCancel={close}
        />
      </View>
    );
  }

  const derived = snapshot.derived;
  const floorFound = derived.floor !== null;
  const closeButton = <RoundButton icon={LuX} label="Stop scanning" onPress={close} />;
  const noticeView = notice ? (
    <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
      {notice.text}
    </Notice>
  ) : null;

  let hud: React.ReactNode = null;
  if (mode === 'capture') {
    const turning = shot.phase === 'turning' || shot.phase === 'spot-done';
    const message = !floorFound
      ? derived.message
      : shot.phase === 'idle'
        ? (derived.coaching ?? {
            title: 'Floor found',
            detail:
              'Stand in the open floor near the middle, the phone sideways near your chest, then tap Start turning.',
          })
        : captureMessage(shot, derived.coaching);
    hud = (
      <>
        {shot.phase === 'turning' ? (
          <PitchLine capture={shot} />
        ) : (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View className="size-8 rounded-full border-2 border-white/40" />
          </View>
        )}
        <CameraHud
          close={closeButton}
          title="Scan by turning around"
          messages={
            <>
              <GuidanceBanner message={message} />
              {noticeView}
            </>
          }
          map={turning ? <RingDial capture={shot} size={landscape ? 136 : 120} /> : null}
          controls={
            <CaptureControls
              floorFound={floorFound}
              capture={shot}
              starting={starting || preparing}
              onStart={() => void startTurning()}
              onNextRing={() => capture.nextRing()}
              onSecondSpot={() => capture.beginSpot()}
              onMeasure={() => void measure()}
              onMarkInstead={markInstead}
            />
          }
        />
      </>
    );
  } else if (mode === 'measuring') {
    hud = (
      <CameraHud
        close={closeButton}
        title="Measuring"
        messages={noticeView}
        controlsWidth={HUD_RAIL.card}
        controls={
          <MeasuringCard
            stage={fitStage}
            error={fitError}
            upload={uploadState}
            onRetry={retry}
            onKeepWaiting={keepWaiting}
            onMarkInstead={markInstead}
          />
        }
      />
    );
  } else if (mode === 'fitted' || mode === 'marking') {
    const fit = snapshot.state.fit;
    const sources = fit && derived.grouped ? wallSources(derived.grouped, fit) : [];
    const unsure = sources.filter((s) => s.kind === 'fit' && s.unsure).length;
    const size = derived.room?.ok ? describeRoomSize(derived.room.room, units) : null;
    if (mode === 'fitted') {
      hud = (
        <CameraHud
          close={closeButton}
          title="Check the walls"
          messages={derived.coaching ? <GuidanceBanner message={derived.coaching} /> : noticeView}
          map={<MiniMap derived={derived} size={landscape ? 136 : 120} />}
          controlsWidth={HUD_RAIL.card}
          controls={
            <FittedCard
              size={size}
              walls={derived.grouped?.walls.length ?? 0}
              unsure={unsure}
              closed={derived.closed}
              onMark={markByHand}
              onAccept={finish}
              onMarkInstead={markInstead}
            />
          }
        />
      );
    } else {
      const marked = snapshot.state.marks.length;
      const guidance = derived.coaching ?? {
        title:
          unsure > 0
            ? 'Mark the amber walls'
            : derived.closed
              ? 'The room is closed'
              : 'Mark the missing walls',
        detail:
          'Aim the dot at a wall’s bottom edge, or its top edge behind furniture, and tap Mark wall. Your mark replaces that wall.',
      };
      hud = (
        <>
          <Reticle derived={derived} units={units} />
          <CameraHud
            close={closeButton}
            title="Mark a wall"
            messages={
              <>
                <GuidanceBanner message={guidance} />
                {noticeView}
              </>
            }
            map={<MiniMap derived={derived} size={landscape ? 136 : 120} />}
            controls={
              <MarkControls
                progress={`${marked} mark${marked === 1 ? '' : 's'} by hand${unsure ? ` · ${unsure} unsure` : ''}${derived.closed ? ' · room closed' : ''}`}
                canMark={derived.step === 'walls'}
                canUndo={snapshot.state.history.length > 0}
                onMarkPressIn={() => controller.holdAim()}
                onMark={mark}
                onUndo={() => {
                  controller.undo();
                  setNotice(null);
                }}
                onDone={finish}
              />
            }
          />
        </>
      );
    }
  } else if (mode === 'marked') {
    hud = (
      <>
        <Reticle derived={derived} units={units} />
        <CameraHud
          close={closeButton}
          title="Scan a room"
          actions={
            <RoundButton
              icon={LuBug}
              label={debug ? 'Hide debug overlay' : 'Show debug overlay'}
              onPress={() => setDebug(!debug)}
              active={debug}
            />
          }
          messages={
            <>
              {debug ? null : <GuidanceBanner message={derived.message} />}
              {noticeView}
            </>
          }
          aside={debug ? <DebugPanel snapshot={snapshot} controller={controller} /> : null}
          map={<MiniMap derived={derived} size={landscape && debug ? 112 : 152} />}
          controls={
            <ScanControls
              snapshot={snapshot}
              onMarkPressIn={() => controller.holdAim()}
              onMark={mark}
              onUndo={() => {
                controller.undo();
                setNotice(null);
              }}
              onSkipCeiling={() => controller.skipCeiling()}
              onDone={finish}
            />
          }
        />
      </>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {focused ? (
        <CameraGate onClose={close}>
          <TurnArView
            ref={arView}
            controller={controller}
            turn={turnStore}
            ar={arProps}
            furnishing={inAr}
          />
          {inAr && saved ? (
            <ArAfterScan
              saved={saved}
              controller={arController}
              scene={arScene}
              view={arView}
              onClose={openRoom}
            />
          ) : saved ? (
            <SavedCard saved={saved} units={units} onSeeInRoom={seeInRoom} onOpenRoom={openRoom} />
          ) : draft ? (
            <RoomReview
              draft={draft}
              ownerId={user.uid}
              onProgress={onProgress}
              onSaved={onSaved}
              onScanAgain={scanAgain}
              onDiscard={discard}
            />
          ) : built ? (
            <CeilingStep built={built} units={units} onBack={() => setBuilt(null)} onNext={next} />
          ) : (
            hud
          )}
        </CameraGate>
      ) : null}
    </View>
  );
}

/** The session's marks by hand as wall marks (for the log's count of replaced server walls). */
function handInputs(controller: ScanController) {
  const { state, derived } = controller.getSnapshot();
  return state.marks.flatMap((m) => {
    const view = derived.marks.find((v) => v.id === m.id);
    if (m.role !== 'wall' || m.axis === null || !view?.point) return [];
    return [
      {
        id: m.id,
        point: view.point,
        camera: { x: m.ray.origin[0], z: m.ray.origin[2] },
        axis: m.axis,
      },
    ];
  });
}
