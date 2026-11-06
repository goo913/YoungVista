import { formatLength } from '@youngvista/core';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanArView } from '@/components/scan/ar-view';
import { CameraGate } from '@/components/scan/camera-gate';
import { CeilingStep } from '@/components/scan/ceiling-step';
import { DebugPanel } from '@/components/scan/debug-panel';
import { MiniMap } from '@/components/scan/mini-map';
import { GuidanceBanner, Notice, Reticle, ScanControls, TopBar } from '@/components/scan/scan-hud';
import { useUser } from '@/lib/auth';
import { useUnits } from '@/lib/units';
import { ScanController } from '@/scan/controller';
import { setRoomDraft } from '@/scan/draft';
import { createScanLogger } from '@/scan/log-writer';
import type { FinishResult, MarkOutcome } from '@/scan/session';

/** The room finishes by itself once every wall has fitted together for this long (ms). */
const AUTO_FINISH_AFTER = 1200;

type NoticeState = { tone: 'info' | 'error'; text: string } | null;
type Built = Extract<FinishResult, { ok: true }>;

export default function ScanScreen() {
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

  const [built, setBuilt] = useState<Built | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [debug, setDebugState] = useState(false);

  // Every scan writes one log: here when it ends on this screen, on the review screen otherwise.
  const handedOver = useRef(false);
  const lastFailure = useRef<string | null>(null);
  const endScan = useCallback(() => {
    if (handedOver.current || logger.done) return;
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
      // Leaving without saving (a remount, as in React's StrictMode, is not leaving).
      setTimeout(() => {
        if (!mounted.current) endScan();
      }, 0);
    };
  }, [controller, endScan]);

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

  const next = (ceilingHeight: number) => {
    if (!built) return;
    handedOver.current = true;
    setRoomDraft({
      room: { ...built.room, ceilingHeight },
      inferredWalls: built.inferredWalls,
      observedWallCount: built.wallCount,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      log: { logger, record: controller.record() },
    });
    // Replacing the screen unmounts the AR view, which releases the camera.
    router.replace('/review');
  };

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {focused ? (
        <CameraGate onClose={close}>
          <ScanArView controller={controller} />
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
                  {debug ? null : <GuidanceBanner derived={snapshot.derived} />}
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
        </CameraGate>
      ) : null}
    </View>
  );
}
