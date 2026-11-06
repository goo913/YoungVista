/**
 * "See it in your room": a saved room in the camera view, at true size, lined up with the real
 * one. It never blocks: the furniture always shows at its saved spots in the room.
 *
 * The user finds the floor, then either aims the dot at the two ends of one wall (shown on a
 * small plan: corner 1 is the left end, seen facing the wall) and taps "Corner here" at each, or
 * taps "Place by hand" to put the room where the dot is. Any two taps half a metre apart or more
 * are taken, in either order; how the taps differ from the plan is said, never refused. Right
 * after a scan, in the same AR session, the room is lined up already. "Move the room" then lets
 * one finger drag the whole room along the floor and two fingers turn it (or "Turn 90°").
 *
 * The furniture can be moved with a finger, turned with two fingers or the 15° buttons, and added
 * where the dot is. Every change is saved to the room's design (the same autosave as the
 * furniture screen), and changes made elsewhere show up here (furnish/design-follow.ts). The
 * ghost walls show how well the room lines up; "Line up again" fixes it when things drift.
 */
import {
  applyLineUp,
  formatLength,
  hitLevelPlane,
  roomCenter,
  turnLineUp,
  type Design,
  type LineUp,
  type Room,
  type Vec2,
} from '@youngvista/core';
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LuBox,
  LuCrosshair,
  LuHand,
  LuLocateFixed,
  LuMove,
  LuRotateCw,
  LuUndo2,
} from 'react-icons/lu';
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
  moveRoom,
  otherCorners,
  placeByHand,
  qualityMessage,
  retryLineUp,
  spanFromFirst,
  tapCorner,
  tappedPoints,
  TAP_ERRORS,
  undoTap,
  type LineUpState,
} from '@/ar/lineup-state';
import { aheadOnFloor, MAX_FLOOR_REACH, sameLineUp, worldToRoom } from '@/ar/pose';
import { RoomMover, type RoomMoverInput } from '@/ar/room-mover';
import { rayCaster } from '@/ar/touch';
import { FurniturePicker } from '@/components/furnish/furniture-picker';
import { SaveIndicator } from '@/components/save-indicator';
import { RoundButton } from '@/components/scan/scan-hud';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { noticeText, noticeTone } from '@/furnish/describe';
import { useDesignFollower, useFollowServerDesign } from '@/furnish/design-follow';
import { useDesign } from '@/furnish/use-design';
import { models } from '@/lib/catalog';
import { modelUrl, type CatalogIndex } from '@/lib/catalog-data';
import type { PendingEdits, RoomSummary } from '@/lib/room-doc';
import { saveDesign, type ServerDesign } from '@/lib/rooms';
import { useStore, type Store } from '@/lib/store';
import { useUnits } from '@/lib/units';
import { useAutosave } from '@/lib/use-autosave';
import type { Message } from '@/scan/coaching';
import { ArFurnitureCard } from './ar-furniture-card';
import { ArGestures } from './ar-gestures';
import {
  aimLabel,
  ArBanner,
  ArCard,
  ArReticle,
  ArTopBar,
  floorMessage,
  type BannerAction,
} from './ar-hud';
import type { ArSceneState } from './ar-scene';
import type { ArViewHandle } from './ar-view';
import { LineUpPlan } from './lineup-plan';
import { useArFurniture } from './use-ar-furniture';

const asPending = (design: Design): PendingEdits => ({ design });

/** Still no floor after this long: offer the 3D view instead (ms). */
const SLOW_FLOOR_MS = 15_000;

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
  /** The design as the server has it (lib/rooms.ts), to follow changes made elsewhere. */
  server?: ServerDesign | null;
  /** A design edit made on this phone is not on the server yet. */
  pendingDesign?: boolean;
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
  server = null,
  pendingDesign = false,
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

  // Changes made elsewhere (the website, another phone) show up here when the user is idle.
  const follower = useDesignFollower(summary.design, server);
  const { status, change } = useAutosave({
    roomId: summary.id,
    online,
    write: saveDesign,
    asPending,
    onSaved: follower.saved,
  });
  useFollowServerDesign(follower, {
    server,
    items: design.state.items,
    busy: design.state.gesture !== null || pendingDesign || status !== 'saved',
    onAdopt: (d) => dispatch({ type: 'load', items: d.items, elsewhere: true }),
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
  // "Move the room": fingers move the whole room. `before` is the line-up to go back to (Undo).
  const [moving, setMoving] = useState<{ before: LineUpState } | null>(null);
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
    active: done && lineUp !== null && moving === null,
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
      // The ghost walls are what the room is lined up by: always shown while moving it.
      ghost: ghost || moving !== null,
      taps,
      showAim: !done || selectedId === null || moving !== null,
    }));
  }, [scene, room, lineUp, done, ghost, taps, selectedId, moving]);

  /* Moving the whole room by hand. */
  const pivot = (): Vec2 | null => {
    const aim = controller.getSnapshot().derived.aim;
    if (aim.ok) return aim.point;
    return lineUp ? applyLineUp(lineUp, roomCenter(room)) : null;
  };
  const [mover] = useState(
    () =>
      new RoomMover(
        rayCaster(() => view.current?.unproject ?? null, PixelRatio.get()),
        idleMover(),
      ),
  );
  const [moverGestures] = useState(() => new ArGestures(mover));
  useLayoutEffect(() => {
    mover.update({
      lineUp: moving ? lineUp : null,
      floorY,
      pivot,
      onMove: (next) => setLining((s) => (s ? moveRoom(s, next) : s)),
      onEnd: () => {},
    });
  });
  /** "Move the room": from now on fingers move the whole room; Undo goes back to `from`. */
  const startMoving = (from: LineUpState | null = lining) => {
    if (!from || from.phase.kind !== 'done') return;
    dispatch({ type: 'select', id: null });
    setMoving({ before: from });
    setNote(null);
  };
  const turnQuarter = () => {
    const p = pivot();
    if (!lineUp || !p) return;
    // A quarter turn clockwise, seen from above.
    setLining((s) => (s ? moveRoom(s, turnLineUp(lineUp, -90, p)) : s));
  };
  const undoMove = () => {
    if (!moving) return;
    setLining(moving.before);
    if (moving.before.phase.kind !== 'done') setMoving(null);
    else setMoving({ before: moving.before });
  };

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
    const t = setTimeout(() => setNote(null), note.tone === 'error' ? 6000 : 10000);
    return () => clearTimeout(t);
  }, [note]);
  // Tracking lost for a while and back: the phone may have moved its idea of the room.
  const [driftSeen, setDriftSeen] = useState(tracking.recoveries);
  const drifted = done && tracking.recoveries > driftSeen;
  const failedModels = useStore(scene, (s) => s.failed.size);
  // No floor for a long while (dim light, a plain floor): offer the room in 3D instead.
  const noFloor = floorY === null;
  const [slowFloor, setSlowFloor] = useState(false);
  useEffect(() => {
    if (!noFloor) return;
    const t = setTimeout(() => setSlowFloor(true), SLOW_FLOOR_MS);
    return () => {
      clearTimeout(t);
      setSlowFloor(false);
    };
  }, [noFloor]);

  const again = () => {
    dispatch({ type: 'select', id: null });
    setMoving(null);
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
          action: { label: 'Move the room', onPress: () => startMoving(state) },
        });
        break;
      }
      default:
        setNote(null);
    }
  };

  /** "Place by hand": the room's middle where the dot is, its wall facing the way the phone looks. */
  const placeHere = () => {
    if (!lining) return;
    const snap = controller.getSnapshot();
    const ray = controller.takeAim();
    const camera = snap.state.camera;
    const y = snap.derived.floorY;
    if (!ray || !camera || y === null) {
      setNote({ tone: 'error', title: TAP_ERRORS['no-floor'] });
      return;
    }
    const hit = hitLevelPlane(ray, y, MAX_FLOOR_REACH);
    const ahead = aheadOnFloor({ forward: ray.direction, up: camera.up }) ?? { x: 0, z: -1 };
    const next = placeByHand(lining, room, {
      at: hit.ok ? hit.point : null,
      phone: { x: ray.origin[0], z: ray.origin[2] },
      ahead,
      floorY: y,
    });
    if (!next || next.phase.kind !== 'done') {
      setNote({ tone: 'error', title: TAP_ERRORS['no-floor'] });
      return;
    }
    setDriftSeen(snap.state.recoveries);
    setLining(next);
    setMoving({ before: lining });
    setNote(null);
  };

  /* What to say. */
  const lineUpGuidance: Message | null =
    lining && !done ? lineUpMessage(lining, room, units) : null;
  const guidance: Message | null =
    derived.coaching ?? floorMessage(derived.floorStatus) ?? (moving ? null : lineUpGuidance);
  const guidanceAction: BannerAction | undefined =
    noFloor && slowFloor ? { label: 'See it in 3D', onPress: onClose } : undefined;
  const designNotice = design.state.notice;
  let banner: React.ReactNode = null;
  if (!lining) {
    banner = <ArBanner tone="error" title="This room has no walls to line up with." />;
  } else if (moving) {
    const q = lining.phase.kind === 'done' ? qualityMessage(lining.phase.done, units) : null;
    banner =
      lining.phase.kind === 'done' && lining.phase.done.source === 'hand' && q ? (
        <ArBanner title={q.title} detail={q.detail} />
      ) : null;
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
        tone={noticeTone(designNotice)}
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
  const span = lining
    ? spanFromFirst(lining, floorY, derived.aim.ok ? derived.aim.point : null)
    : null;
  const promptLabel =
    lining && step !== null ? cornerPrompt(room, currentPair(lining), step, units).label : null;
  const reticleLabel = !derived.aim.ok
    ? aimLabel(derived.aim, units)
    : promptLabel
      ? span !== null
        ? `${promptLabel} · ${formatLength(span, units)} from corner 1`
        : promptLabel
      : moving
        ? 'Turns about this dot'
        : selectedId
          ? null
          : aimLabel(derived.aim, units);
  const poor = lining?.phase.kind === 'poor';
  const phoneInRoom =
    moving && lineUp && tracking.camera
      ? worldToRoom(lineUp, { x: tracking.camera.position[0], z: tracking.camera.position[2] })
      : null;

  return (
    <>
      <GestureDetector
        key={moving ? 'room' : 'furniture'}
        gesture={moving ? moverGestures.gesture : ar.gesture}
      >
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
      {!done || !selectedId || moving ? (
        <ArReticle ok={derived.aim.ok} label={reticleLabel} />
      ) : null}
      <View
        className="absolute inset-0"
        pointerEvents="box-none"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}
      >
        <View className="gap-3 px-4" pointerEvents="box-none">
          <ArTopBar title={summary.name} onClose={onClose}>
            {done ? (
              <>
                {moving ? null : (
                  <RoundButton
                    icon={LuBox}
                    label={ghost ? 'Hide the ghost walls' : 'Show the ghost walls'}
                    onPress={() => setGhost(!ghost)}
                    active={ghost}
                  />
                )}
                <RoundButton
                  icon={LuMove}
                  label={moving ? 'Stop moving the room' : 'Move the room'}
                  onPress={() => (moving ? setMoving(null) : startMoving())}
                  active={moving !== null}
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
          {guidance ? (
            <ArBanner title={guidance.title} detail={guidance.detail} action={guidanceAction} />
          ) : null}
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
                    <OverlayButton
                      label="Undo"
                      icon={LuUndo2}
                      onPress={() => setLining(undoTap(lining))}
                    />
                  ) : null}
                  {lining.pairs.length > 1 ? (
                    <OverlayButton
                      label="Other corners"
                      onPress={() => setLining(otherCorners(lining))}
                    />
                  ) : null}
                  <OverlayButton
                    label="Place by hand"
                    icon={LuHand}
                    onPressIn={() => controller.holdAim()}
                    onPress={placeHere}
                    disabled={floorY === null}
                    hint="Puts the room where the dot is; then drag and turn it into place."
                  />
                  {lining.previous ? (
                    <OverlayButton label="Cancel" onPress={() => setLining(cancelLineUp(lining))} />
                  ) : null}
                </View>
              </View>
            </View>
          ) : done && moving ? (
            <View className="flex-row items-end gap-3" pointerEvents="box-none">
              <LineUpPlan room={room} phone={phoneInRoom} size={112} />
              <View className="flex-1">
                <ArCard>
                  <View className="gap-1">
                    <Text className="text-base font-semibold">Move the room</Text>
                    <Text className="text-muted-foreground text-xs">
                      One finger drags the room along the floor, two fingers turn it. Line up the
                      ghost walls with the real walls. The blue dot on the plan is you.
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={turnQuarter}
                      accessibilityLabel="Turn the room a quarter turn"
                    >
                      <Icon as={LuRotateCw} size={14} />
                      <Text>Turn 90°</Text>
                    </Button>
                    <Button variant="outline" size="sm" onPress={undoMove}>
                      <Icon as={LuUndo2} size={14} />
                      <Text>Undo</Text>
                    </Button>
                    <Button size="sm" className="flex-1" onPress={() => setMoving(null)}>
                      <Text>Done</Text>
                    </Button>
                  </View>
                </ArCard>
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

/** What the room mover reads before the screen has given it anything. */
function idleMover(): RoomMoverInput {
  return { lineUp: null, floorY: null, pivot: () => null, onMove: () => {}, onEnd: () => {} };
}

/** An outlined button over the camera view. */
function OverlayButton({
  label,
  icon,
  onPress,
  onPressIn,
  disabled,
  hint,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Icon>['as'];
  onPress: () => void;
  onPressIn?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Button
      variant="outline"
      className="border-white/40 bg-black/40"
      onPress={onPress}
      onPressIn={onPressIn}
      disabled={disabled}
      accessibilityHint={hint}
    >
      {icon ? <Icon as={icon} size={16} className="text-white" /> : null}
      <Text className="text-white">{label}</Text>
    </Button>
  );
}
