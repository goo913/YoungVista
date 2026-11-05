import { isBuildRoomFailure, type BuildRoomSuccess } from '@youngvista/core';
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
import { CoachingBanner, Notice, Reticle, ScanControls, TopBar } from '@/components/scan/scan-hud';
import { useUnits } from '@/lib/units';
import { ScanController } from '@/scan/controller';
import { setRoomDraft } from '@/scan/draft';
import { scanFailureMessage } from '@/scan/session';

/** The room closes automatically once the walls have gone all the way round for this long (ms). */
const AUTO_FINISH_AFTER = 1200;

type NoticeState = { tone: 'info' | 'error'; text: string } | null;

export default function ScanScreen() {
  useKeepAwake();
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [units] = useUnits();

  const [controller] = useState(() => new ScanController());
  useEffect(() => () => controller.dispose(), [controller]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  const [built, setBuilt] = useState<BuildRoomSuccess | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [debug, setDebugState] = useState(false);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const finish = useCallback(() => {
    const result = controller.buildRoom();
    if (isBuildRoomFailure(result)) {
      setNotice({ tone: 'error', text: scanFailureMessage(result) });
      return;
    }
    setNotice(null);
    setBuilt(result);
  }, [controller]);

  // Auto-finish: once the walls have gone all the way round for a moment, join them. At most
  // once per set of walls, so a failed attempt waits for another wall (or a tap on Done).
  const scanning = useRef(true);
  useEffect(() => {
    scanning.current = built === null;
  }, [built]);
  useEffect(() => {
    let closedSince: number | null = null;
    let triedFor: string | null = null;
    return controller.subscribe(() => {
      const { state, derived } = controller.getSnapshot();
      if (!scanning.current || !derived.coverage?.closed) {
        closedSince = null;
        return;
      }
      const now = Date.now();
      closedSince ??= now;
      const signature = `${derived.coverage.wallCount}/${state.tapWalls.length}`;
      if (now - closedSince >= AUTO_FINISH_AFTER && triedFor !== signature) {
        triedFor = signature;
        finish();
      }
    });
  }, [controller, finish]);

  // Short-lived notices fade by themselves; errors stay until dismissed or replaced.
  useEffect(() => {
    if (notice?.tone !== 'info') return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const mark = () => {
    const outcome = controller.markWallPoint();
    if (outcome.kind === 'error') setNotice({ tone: 'error', text: outcome.message });
    else if (outcome.kind === 'wall-added') setNotice({ tone: 'info', text: 'Wall added.' });
    else setNotice(null);
  };

  const setDebug = (on: boolean) => {
    setDebugState(on);
    controller.setDebug(on);
  };

  const next = (ceilingHeight: number) => {
    if (!built) return;
    setRoomDraft({
      room: { ...built.room, ceilingHeight },
      inferredWalls: built.inferredWalls,
      observedWallCount: built.observedWallCount,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
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
                <Reticle onFloor={snapshot.derived.aim?.ok === true} />
                <View className="gap-3 px-4" pointerEvents="box-none">
                  <TopBar debug={debug} onClose={close} onToggleDebug={() => setDebug(!debug)} />
                  {debug ? null : <CoachingBanner snapshot={snapshot} />}
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
                    onMark={mark}
                    onCancelTap={() => controller.cancelPendingTap()}
                    onUndo={() => controller.undoLastTapWall()}
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
