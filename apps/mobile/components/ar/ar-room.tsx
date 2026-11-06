/**
 * "See it in your room": a saved room in the camera view, at true size, lined up with the real
 * one. The user finds the floor, then aims the dot at two corners shown on a small plan and taps
 * "Corner here" at each; right after a scan, in the same AR session, the room is lined up
 * already. Then the furniture stands at its saved spots with soft shadows; it can be moved with a
 * finger, turned with two fingers or the 15° buttons, and added where the dot is. Every change is
 * saved to the room's design (the same autosave as the furniture screen). The ghost walls show
 * how well the room lines up; "Line up again" fixes it when things drift.
 */
import type { Design, LineUp, Room } from '@youngvista/core';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuBox, LuCrosshair, LuLocateFixed, LuUndo2 } from 'react-icons/lu';
import type { ArController } from '@/ar/controller';
import { cornerPrompt } from '@/ar/corner-prompts';
import {
  activeLineUp,
  aimedStep,
  cancelLineUp,
  createLineUp,
  currentPair,
  lineUpAgain,
  lineUpFromScan,
  lineUpMessage,
  qualityMessage,
  retryLineUp,
  tapCorner,
  tappedPoints,
  TAP_ERRORS,
  undoTap,
  otherCorners,
  type LineUpState,
} from '@/ar/lineup-state';
import { sameLineUp } from '@/ar/pose';
import { FurniturePicker } from '@/components/furnish/furniture-picker';
import { SaveIndicator } from '@/components/save-indicator';
import { RoundButton } from '@/components/scan/scan-hud';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { noticeText } from '@/furnish/describe';
import { useDesign } from '@/furnish/use-design';
import { models } from '@/lib/catalog';
import { modelUrl, type CatalogIndex } from '@/lib/catalog-data';
import type { PendingEdits, RoomSummary } from '@/lib/room-doc';
import { saveDesign } from '@/lib/rooms';
import { useStore, type Store } from '@/lib/store';
import { useUnits } from '@/lib/units';
import { useAutosave } from '@/lib/use-autosave';
import type { Message } from '@/scan/coaching';
import { ArFurnitureCard } from './ar-furniture-card';
import { aimLabel, ArBanner, ArReticle, ArTopBar, floorMessage, type BannerAction } from './ar-hud';
import type { ArSceneState } from './ar-scene';
import type { ArViewHandle } from './ar-view';
import { LineUpPlan } from './lineup-plan';
import { useArFurniture } from './use-ar-furniture';

const asPending = (design: Design): PendingEdits => ({ design });

type Note = {
  tone: 'info' | 'error' | 'success';
  title: string;
  detail?: string;
  action?: BannerAction;
} | null;

/** The same line-up object while it barely changes, so the scene does not redraw for nothing. */
function useSteadyLineUp(next: LineUp | null): LineUp | null {
  const [kept, setKept] = useState(next);
  const same = sameLineUp(kept, next);
  if (!same) setKept(next);
  return same ? kept : next;
}

export interface ArRoomProps {
  summary: RoomSummary;
  room: Room;
  online: boolean;
  catalog: CatalogIndex;
  controller: ArController;
  scene: Store<ArSceneState>;
  view: React.RefObject<ArViewHandle | null>;
  /** Right after a scan in the same AR session: lined up already, at most this far off (m). */
  fromScan?: { offset: number } | null;
  onClose: () => void;
}

export function ArRoom({
  summary,
  room,
  online,
  catalog,
  controller,
  scene,
  view,
  fromScan = null,
  onClose,
}: ArRoomProps) {
  const insets = useSafeAreaInsets();
  const [units] = useUnits();
  const { state: tracking, derived } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const design = useDesign(room, catalog, summary.design);
  const { dispatch } = design;
  const { status, change } = useAutosave({
    roomId: summary.id,
    online,
    write: saveDesign,
    asPending,
  });
  // Save after every change the user makes (not after loading).
  useEffect(() => {
    if (design.state.version > 0) change({ items: design.state.items });
  }, [design.state.version, design.state.items, change]);

  // Start fetching every model this room uses, so the furniture appears soon after lining up.
  useEffect(() => {
    models.prefetch(
      summary.design.items.flatMap((it) => {
        const product = catalog.byId.get(it.productId);
        return product ? [modelUrl(product, it.variant)] : [];
      }),
    );
  }, [summary, catalog]);

  /* Lining up. */
  const [lining, setLining] = useState<LineUpState | null>(() =>
    fromScan ? lineUpFromScan(room, fromScan.offset) : createLineUp(room),
  );
  const floorY = derived.floorY;
  const done = lining?.phase.kind === 'done';
  const lineUp = useSteadyLineUp(
    useMemo(() => (lining ? activeLineUp(lining, room, floorY) : null), [lining, room, floorY]),
  );
  const ar = useArFurniture({
    catalog,
    design,
    controller,
    scene,
    view,
    lineUp,
    active: done && lineUp !== null,
  });
  const [ghost, setGhost] = useState(true);
  const taps = useMemo(() => (lining ? tappedPoints(lining, floorY) : []), [lining, floorY]);
  const selectedId = design.state.selectedId;
  useEffect(() => {
    scene.set((s) => ({
      ...s,
      room,
      // Lining up again keeps the last line-up in the scene, hidden.
      lineUp: lineUp ?? s.lineUp,
      showRoom: done && lineUp !== null,
      ghost,
      taps,
      showAim: !done || selectedId === null,
    }));
  }, [scene, room, lineUp, done, ghost, taps, selectedId]);

  /* Messages. */
  const [note, setNote] = useState<Note>(() => {
    if (!fromScan) return null;
    const s = lineUpFromScan(room, fromScan.offset);
    return s.phase.kind === 'done'
      ? { tone: 'success', ...qualityMessage(s.phase.done, units) }
      : null;
  });
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), note.tone === 'error' ? 6000 : 7000);
    return () => clearTimeout(t);
  }, [note]);
  // Tracking lost for a while and back: the phone may have moved its idea of the room.
  const [driftSeen, setDriftSeen] = useState(tracking.recoveries);
  const drifted = done && tracking.recoveries > driftSeen;
  const failedModels = useStore(scene, (s) => s.failed.size);

  const again = () => {
    dispatch({ type: 'select', id: null });
    setLining((s) => (s ? lineUpAgain(s) : s));
    setNote(null);
    setDriftSeen(tracking.recoveries);
  };

  const tapHere = () => {
    if (!lining) return;
    const ray = controller.takeAim();
    if (!ray) {
      setNote({ tone: 'error', title: TAP_ERRORS['no-floor'] });
      return;
    }
    const { state, outcome } = tapCorner(
      lining,
      room,
      ray,
      controller.getSnapshot().derived.floorY,
    );
    setLining(state);
    switch (outcome.kind) {
      case 'refused':
        setNote({ tone: 'error', title: outcome.message });
        break;
      case 'done': {
        setDriftSeen(controller.getSnapshot().state.recoveries);
        const q = qualityMessage(outcome.done, units);
        setNote({
          tone: 'success',
          title: q.title,
          detail: q.detail,
          action: { label: 'Try again', onPress: again },
        });
        break;
      }
      default:
        setNote(null);
    }
  };

  /* What to say. */
  const guidance: Message | null =
    derived.coaching ??
    floorMessage(derived.floorStatus) ??
    (lining && !done ? lineUpMessage(lining, room, units) : null);
  const designNotice = design.state.notice;
  let banner: React.ReactNode = null;
  if (!lining) {
    banner = <ArBanner tone="error" title="This room has no walls to line up with." />;
  } else if (done && ar.live) {
    banner = <ArBanner tone="error" title={ar.live} />;
  } else if (drifted) {
    banner = (
      <ArBanner
        title="Things may have moved"
        detail="The phone lost track of the room for a moment. If the furniture is not where it should be, line up again."
        action={{ label: 'Line up again', onPress: again }}
        onDismiss={() => setDriftSeen(tracking.recoveries)}
      />
    );
  } else if (note) {
    banner = (
      <ArBanner
        tone={note.tone}
        title={note.title}
        detail={note.detail}
        action={note.action}
        onDismiss={() => setNote(null)}
      />
    );
  } else if (done && designNotice) {
    banner = (
      <ArBanner
        tone={designNotice.kind === 'removed' ? 'info' : 'error'}
        title={noticeText(designNotice, ar.nameOf, ar.productName)}
        action={
          designNotice.kind === 'removed'
            ? { label: 'Undo', onPress: () => dispatch({ type: 'undo-remove' }) }
            : undefined
        }
        onDismiss={() => dispatch({ type: 'dismiss-notice' })}
      />
    );
  } else if (done && failedModels > 0) {
    banner = (
      <ArBanner
        title={`${failedModels === 1 ? 'A piece shows' : `${failedModels} pieces show`} as a grey box`}
        detail="Its model could not load. The box is its real size. Check the connection."
      />
    );
  }

  const step = lining ? aimedStep(lining) : null;
  const reticleLabel = !derived.aim.ok
    ? aimLabel(derived.aim, units)
    : lining && step !== null
      ? cornerPrompt(room, currentPair(lining), step, units).label
      : selectedId
        ? null
        : aimLabel(derived.aim, units);
  const poor = lining?.phase.kind === 'poor';

  return (
    <>
      <GestureDetector gesture={ar.gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
      {!done || !selectedId ? <ArReticle ok={derived.aim.ok} label={reticleLabel} /> : null}
      <View
        className="absolute inset-0"
        pointerEvents="box-none"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}
      >
        <View className="gap-3 px-4" pointerEvents="box-none">
          <ArTopBar title={summary.name} onClose={onClose}>
            {done ? (
              <>
                <RoundButton
                  icon={LuBox}
                  label={ghost ? 'Hide the ghost walls' : 'Show the ghost walls'}
                  onPress={() => setGhost(!ghost)}
                  active={ghost}
                />
                <RoundButton icon={LuLocateFixed} label="Line up again" onPress={again} />
              </>
            ) : null}
          </ArTopBar>
          {done ? (
            <View className="bg-background/90 self-center rounded-full px-3 py-1">
              <SaveIndicator status={status} />
            </View>
          ) : null}
          {guidance ? <ArBanner title={guidance.title} detail={guidance.detail} /> : null}
          {banner}
        </View>
        <View className="flex-1" pointerEvents="box-none" />
        <View className="px-4" pointerEvents="box-none">
          {lining && !done ? (
            <View className="flex-row items-end gap-3" pointerEvents="box-none">
              <LineUpPlan room={room} corners={currentPair(lining)} step={step} />
              <View className="flex-1 gap-2">
                {poor ? (
                  <Button size="lg" onPress={() => setLining(retryLineUp(lining))}>
                    <Text>Try again</Text>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onPressIn={() => controller.holdAim()}
                    onPress={tapHere}
                    disabled={floorY === null}
                    accessibilityHint="Marks the corner under the dot in the middle of the screen."
                  >
                    <Icon as={LuCrosshair} size={18} />
                    <Text>Corner here</Text>
                  </Button>
                )}
                <View className="flex-row flex-wrap gap-2">
                  {step === 1 ? (
                    <OverlayButton label="Undo" icon onPress={() => setLining(undoTap(lining))} />
                  ) : null}
                  {lining.pairs.length > 1 ? (
                    <OverlayButton
                      label="Other corners"
                      onPress={() => setLining(otherCorners(lining))}
                    />
                  ) : null}
                  {lining.previous ? (
                    <OverlayButton label="Cancel" onPress={() => setLining(cancelLineUp(lining))} />
                  ) : null}
                </View>
              </View>
            </View>
          ) : done ? (
            <ArFurnitureCard
              ar={ar}
              controller={controller}
              units={units}
              hint={
                design.state.items.length === 0
                  ? 'Aim the dot where you want a piece, then tap Add furniture.'
                  : 'Tap a piece to move it: drag it along the floor, turn it with two fingers.'
              }
              onAddError={(message) => setNote({ tone: 'error', title: message })}
            />
          ) : null}
        </View>
      </View>
      <FurniturePicker
        visible={ar.picking}
        catalog={catalog}
        units={units}
        onClose={ar.closePicker}
        onPick={ar.pick}
      />
    </>
  );
}

/** An outlined button over the camera view. */
function OverlayButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: boolean;
  onPress: () => void;
}) {
  return (
    <Button variant="outline" className="border-white/40 bg-black/40" onPress={onPress}>
      {icon ? <Icon as={LuUndo2} size={16} className="text-white" /> : null}
      <Text className="text-white">{label}</Text>
    </Button>
  );
}
