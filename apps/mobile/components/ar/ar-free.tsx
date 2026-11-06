/**
 * "Place freely": true-size catalog pieces in the camera view, no room needed. The user finds the
 * floor, aims the dot and taps Add furniture; pieces can be moved with a finger, turned with two
 * fingers or the 15° buttons, copied and removed. Nothing is saved.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { ArController } from '@/ar/controller';
import { freeRoom } from '@/ar/free-room';
import { scanLineUp } from '@/ar/pose';
import { CameraHud, HUD_RAIL } from '@/components/camera-hud';
import { FurniturePicker } from '@/components/furnish/furniture-picker';
import { noticeText, noticeTone } from '@/furnish/describe';
import { useDesign } from '@/furnish/use-design';
import type { CatalogIndex } from '@/lib/catalog-data';
import type { Store } from '@/lib/store';
import { useUnits } from '@/lib/units';
import { ArFurnitureCard } from './ar-furniture-card';
import { aimLabel, ArBanner, ArReticle, CloseButton, floorMessage } from './ar-hud';
import type { ArSceneState } from './ar-scene';
import type { ArViewHandle } from './ar-view';
import { useArFurniture } from './use-ar-furniture';

/** The open square the pieces stand in (see ar/free-room.ts). */
const FREE_ROOM = freeRoom();
const NO_DESIGN = { items: [] };

export function ArFree({
  catalog,
  controller,
  scene,
  view,
  onClose,
}: {
  catalog: CatalogIndex;
  controller: ArController;
  scene: Store<ArSceneState>;
  view: React.RefObject<ArViewHandle | null>;
  onClose: () => void;
}) {
  const [units] = useUnits();
  const { derived } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const design = useDesign(FREE_ROOM, catalog, NO_DESIGN);
  const { dispatch } = design;
  // The AR world is the open square's room space: only the floor's height is needed. Rounded to
  // the millimetre, so the scene does not redraw for every tiny change of the floor.
  const floorY = derived.floorY === null ? null : Math.round(derived.floorY * 1000) / 1000;
  const lineUp = useMemo(() => (floorY === null ? null : scanLineUp(floorY)), [floorY]);
  const ar = useArFurniture({
    catalog,
    design,
    controller,
    scene,
    view,
    lineUp,
    active: lineUp !== null,
  });
  const selectedId = design.state.selectedId;
  useEffect(() => {
    scene.set((s) => ({
      ...s,
      room: null,
      lineUp: lineUp ?? s.lineUp,
      showRoom: lineUp !== null,
      ghost: false,
      taps: [],
      showAim: selectedId === null,
    }));
  }, [scene, lineUp, selectedId]);

  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const guidance = derived.coaching ?? floorMessage(derived.floorStatus);
  const notice = design.state.notice;
  const found = lineUp !== null;

  return (
    <>
      <GestureDetector gesture={ar.gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
      {!selectedId ? <ArReticle ok={derived.aim.ok} label={aimLabel(derived.aim, units)} /> : null}
      <CameraHud
        close={<CloseButton onClose={onClose} />}
        title="Place freely"
        messages={
          <>
            {guidance ? <ArBanner title={guidance.title} detail={guidance.detail} /> : null}
            {ar.live ? <ArBanner tone="error" title={ar.live} /> : null}
            {!ar.live && error ? (
              <ArBanner tone="error" title={error} onDismiss={() => setError(null)} />
            ) : null}
            {!ar.live && !error && notice ? (
              <ArBanner
                tone={noticeTone(notice)}
                title={noticeText(notice, ar.nameOf, ar.productName)}
                action={
                  notice.kind === 'removed'
                    ? { label: 'Undo', onPress: () => dispatch({ type: 'undo-remove' }) }
                    : undefined
                }
                onDismiss={() => dispatch({ type: 'dismiss-notice' })}
              />
            ) : null}
          </>
        }
        controlsWidth={HUD_RAIL.card}
        controls={
          found ? (
            <ArFurnitureCard
              ar={ar}
              controller={controller}
              units={units}
              hint={
                design.state.items.length === 0
                  ? 'Aim the dot at the floor where you want a piece, then tap Add furniture. Nothing here is saved.'
                  : 'Tap a piece to move it: drag it along the floor, turn it with two fingers. Nothing here is saved.'
              }
              onAddError={setError}
            />
          ) : null
        }
      />
      <FurniturePicker
        visible={ar.picking}
        catalog={catalog}
        units={units}
        onClose={ar.closePicker}
        onPick={ar.pick}
        overCamera
      />
    </>
  );
}
