import { formatLength } from '@youngvista/core';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArController } from '@/ar/controller';
import { initialArSceneState } from '@/components/ar/ar-scene';
import { ArAfterScan, SavedCard } from '@/components/scan/after-scan';
import { ScanArView, type ScanArHandle } from '@/components/scan/ar-view';
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
import { GuidanceBanner, Notice, Reticle, ScanControls, TopBar } from '@/components/scan/scan-hud';
import { ScanTips } from '@/components/scan/scan-tips';
import { useUser } from '@/lib/auth';
import { createStore } from '@/lib/store';
import { useUnits } from '@/lib/units';
import { ScanController, type ScanRecord } from '@/scan/controller';
import { createScanLogger } from '@/scan/log-writer';
import type { FinishResult, MarkOutcome } from '@/scan/session';

/** The room finishes by itself once every wall has fitted together for this long (ms). */
const AUTO_FINISH_AFTER = 1200;

type NoticeState = { tone: 'info' | 'error'; text: string } | null;
type Built = Extract<FinishResult, { ok: true }>;

/**
 * Scanning a room, reviewing it and saving it, then seeing it in the camera view: all on this one
 * screen, over one AR session. The review is shown over the running session, so that after
 * saving, "See it in your room" swaps the scan's AR scene for the room's and the room needs no
 * lining up: its corners are the scan's own world coordinates (see ar/pose.ts).
 */
export default function ScanScreen() {
  // "Scan again" starts over with a new session.
  const [attempt, setAttempt] = useState(0);
  return <ScanSession key={attempt} onRestart={() => setAttempt((n) => n + 1)} />;
}

function ScanSession({ onRestart }: { onRestart: () => void }) {
  useKeepAwake();
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [units] = useUnits();
  const user = useUser();

  const [controller] = useState(
    () => new ScanController({ scan: { centerSpace: Platform.OS === 'ios' ? 'world' : 'local' } }),
  );
  const [logger] = useState(() => createScanLogger(user.uid));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  // After saving: the room in the camera view, in this same AR session.
  const [arController] = useState(() => new ArController());
  const [arScene] = useState(() => createStore(initialArSceneState()));
  const arProps = useMemo(
    () => ({ controller: arController, store: arScene }),
    [arController, arScene],
  );
  const arView = useRef<ScanArHandle>(null);

  const [built, setBuilt] = useState<Built | null>(null);
  const [draft, setDraft] = useState<RoomDraft | null>(null);
  const [saved, setSaved] = useState<SavedRoom | null>(null);
  const [inAr, setInAr] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [debug, setDebugState] = useState(false);

  // Every scan writes one log: when the room is saved, or when the scan ends without saving.
  const lastFailure = useRef<string | null>(null);
  const reviewed = useRef<{ record: ScanRecord; progress: ReviewProgress | null } | null>(null);
  const endScan = useCallback(() => {
    if (logger.done) return;
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
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.dispose();
      arController.dispose();
      // Leaving without saving (a remount, as in React's StrictMode, is not leaving).
      setTimeout(() => {
        if (!mounted.current) endScan();
      }, 0);
    };
  }, [controller, arController, endScan]);

  const close = useCallback(() => {
    endScan();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router, endScan]);

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

  // Auto-finish: once every wall fits and the room is closed, for a moment, join them. At most
  // once per set of marks, so going back to scanning waits for another mark (or Done).
  const scanning = useRef(true);
  useEffect(() => {
    scanning.current = built === null;
  }, [built]);
  useEffect(() => {
    let closedSince: number | null = null;
    let triedFor: string | null = null;
    return controller.subscribe(() => {
      const { state, derived } = controller.getSnapshot();
      if (!scanning.current || !derived.closed) {
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

  // Short-lived notices fade by themselves; errors stay until dismissed or replaced.
  useEffect(() => {
    if (notice?.tone !== 'info') return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

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

  const setDebug = (on: boolean) => {
    setDebugState(on);
    controller.setDebug(on);
  };

  // The room is closed and the ceiling set: review it over the running AR session.
  const next = (ceilingHeight: number) => {
    if (!built) return;
    reviewed.current = { record: controller.record(), progress: null };
    setDraft({
      room: { ...built.room, ceilingHeight },
      inferredWalls: built.inferredWalls,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
  };
  const onProgress = useCallback((progress: ReviewProgress) => {
    if (reviewed.current) reviewed.current.progress = progress;
  }, []);
  const onSaved = (room: SavedRoom) => {
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
  // Leaving for the room page unmounts the AR view, which releases the camera.
  const openRoom = () => {
    if (saved) router.replace({ pathname: '/rooms/[id]', params: { id: saved.id } });
  };
  /**
   * "See it in your room": the AR room scene takes over this session, with what the scan knows
   * (the floor, the planes, the camera), so the room shows at once where it was scanned.
   */
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

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {focused ? (
        <CameraGate onClose={close}>
          <ScanArView ref={arView} controller={controller} ar={arProps} furnishing={inAr} />
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
          ) : (
            <View
              className="absolute inset-0"
              pointerEvents="box-none"
              style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}
            >
              {built ? (
                <CeilingStep
                  built={built}
                  units={units}
                  onBack={() => setBuilt(null)}
                  onNext={next}
                />
              ) : (
                <>
                  <Reticle derived={snapshot.derived} units={units} />
                  <View className="gap-3 px-4" pointerEvents="box-none">
                    <TopBar debug={debug} onClose={close} onToggleDebug={() => setDebug(!debug)} />
                    {debug ? null : <GuidanceBanner message={snapshot.derived.message} />}
                    {notice ? (
                      <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                        {notice.text}
                      </Notice>
                    ) : null}
                  </View>
                  <View className="flex-1 px-4 py-3" pointerEvents="box-none">
                    {debug ? (
                      <View className="max-h-[70%]">
                        <DebugPanel snapshot={snapshot} controller={controller} />
                      </View>
                    ) : null}
                  </View>
                  <View className="flex-row items-end gap-3 px-4">
                    <MiniMap derived={snapshot.derived} />
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
                  </View>
                </>
              )}
            </View>
          )}
        </CameraGate>
      ) : null}
      <ScanTips />
    </View>
  );
}
