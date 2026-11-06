/**
 * Furniture in the AR view, for a saved room and for placing freely: the design's pieces drawn
 * in the scene, fingers that move and turn them (in room space, with the design's own rules), and
 * "Add furniture", which puts the chosen piece where the dot met the floor when it was tapped.
 */
import { hitLevelPlane, type CatalogItem, type LineUp, type Pose } from '@youngvista/core';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';
import type { ArController } from '@/ar/controller';
import { MAX_FLOOR_REACH, placementPose } from '@/ar/pose';
import { ArTouch, rayCaster, type ArTouchInput } from '@/ar/touch';
import type { SceneItem } from '@/components/furnish/room-scene';
import { placementProblem } from '@/furnish/describe';
import { displayedItems, itemChecks, selectedItem } from '@/furnish/design-state';
import { pickBoxFor, sceneItem } from '@/furnish/scene-items';
import type { useDesign } from '@/furnish/use-design';
import type { CatalogIndex } from '@/lib/catalog-data';
import type { Store } from '@/lib/store';
import { ArGestures } from './ar-gestures';
import type { ArSceneState } from './ar-scene';
import type { ArViewHandle } from './ar-view';

type Design = ReturnType<typeof useDesign>;

export interface ArFurnitureOptions {
  catalog: CatalogIndex;
  design: Design;
  controller: ArController;
  scene: Store<ArSceneState>;
  view: React.RefObject<ArViewHandle | null>;
  /** Room → world now, or null. */
  lineUp: LineUp | null;
  /** Lined up and not lining up again: fingers move furniture and Add works. */
  active: boolean;
}

/** Why "Add furniture" could not take the spot under the dot. */
export const ADD_AIM_MESSAGE = {
  floor: 'Aim the dot at the floor where you want the piece, then tap Add furniture.',
  far: 'That spot is too far away. Walk closer, aim the dot at the floor and tap Add furniture.',
  lined: 'Line up the room first.',
};

export function useArFurniture({
  catalog,
  design,
  controller,
  scene,
  view,
  lineUp,
  active,
}: ArFurnitureOptions) {
  const { state, dispatch, ctx } = design;
  const product = useCallback(
    (productId: string): CatalogItem | null => catalog.byId.get(productId) ?? null,
    [catalog],
  );
  const shown = useMemo(() => displayedItems(state), [state]);
  const checks = useMemo(() => itemChecks(state, ctx), [state, ctx]);
  const nameOf = useCallback(
    (itemId: string) => {
      const it = state.items.find((i) => i.id === itemId);
      return (it && product(it.productId)?.name) ?? 'piece';
    },
    [state.items, product],
  );
  const productName = useCallback(
    (productId: string) => product(productId)?.name ?? 'piece',
    [product],
  );
  const sceneItems = useMemo<SceneItem[]>(
    () =>
      shown.map((it) =>
        sceneItem(
          it,
          product(it.productId),
          checks.get(it.id)?.valid === false
            ? 'invalid'
            : it.id === state.selectedId
              ? 'selected'
              : 'none',
        ),
      ),
    [shown, product, checks, state.selectedId],
  );
  const boxes = useMemo(
    () => shown.map((it) => pickBoxFor(it, product(it.productId))),
    [shown, product],
  );

  // The scene draws the pieces where they are shown (the one being moved at its preview spot).
  useEffect(() => scene.set((s) => ({ ...s, items: sceneItems })), [scene, sceneItems]);

  // Fingers: rays from the AR view (Viro's unproject) into room space.
  const [touch] = useState(
    () =>
      new ArTouch(
        rayCaster(() => view.current?.unproject ?? null, PixelRatio.get()),
        idleInput(dispatch),
      ),
  );
  const [gestures] = useState(() => new ArGestures(touch));
  useLayoutEffect(() => {
    touch.update({
      ...idleInput(dispatch),
      lineUp: active ? lineUp : null,
      boxes,
      items: shown,
      selectedId: state.selectedId,
    });
  });

  // "Add furniture": the spot is taken when the button is tapped, before the picker covers the
  // camera (the phone may point anywhere while choosing).
  const [picking, setPicking] = useState(false);
  const spot = useRef<Pose | null>(null);
  const startAdd = (): string | null => {
    if (!active || !lineUp) return ADD_AIM_MESSAGE.lined;
    const ray = controller.takeAim();
    const floorY = controller.getSnapshot().derived.floorY;
    if (!ray || floorY === null) return ADD_AIM_MESSAGE.floor;
    const hit = hitLevelPlane(ray, floorY, MAX_FLOOR_REACH);
    if (!hit.ok) return hit.reason === 'too-far' ? ADD_AIM_MESSAGE.far : ADD_AIM_MESSAGE.floor;
    spot.current = placementPose(lineUp, hit.point, { x: ray.origin[0], z: ray.origin[2] });
    setPicking(true);
    return null;
  };
  const pick = (item: CatalogItem) => {
    setPicking(false);
    const at = spot.current;
    spot.current = null;
    if (at) dispatch({ type: 'add', productId: item.id, at });
  };
  const closePicker = () => {
    setPicking(false);
    spot.current = null;
  };

  // The design's own messages fade by themselves, as on the furniture screen.
  useEffect(() => {
    if (!state.notice) return;
    const t = setTimeout(
      () => dispatch({ type: 'dismiss-notice' }),
      state.notice.kind === 'removed' ? 6000 : 4500,
    );
    return () => clearTimeout(t);
  }, [state.notice, dispatch]);

  const live =
    state.gesture?.moved && !state.gesture.preview.valid
      ? placementProblem(state.gesture.preview, nameOf)
      : null;

  return {
    state,
    dispatch,
    product,
    nameOf,
    productName,
    selected: selectedItem(state),
    gesture: gestures.gesture,
    /** What is wrong with the spot a piece is being moved to, while it moves there. */
    live,
    picking,
    startAdd,
    pick,
    closePicker,
  };
}

/** What fingers do: design actions. Everything else is filled in on each render. */
function idleInput(dispatch: Design['dispatch']): ArTouchInput {
  return {
    lineUp: null,
    boxes: [],
    items: [],
    selectedId: null,
    onTap: (id) => dispatch({ type: 'select', id }),
    onDragStart: (id) => dispatch({ type: 'drag-start', id }),
    onDragMove: (x, z) => dispatch({ type: 'drag-move', x, z }),
    onRotateStart: (id) => dispatch({ type: 'rotate-start', id }),
    onRotateMove: (rotationY) => dispatch({ type: 'rotate-move', rotationY }),
    onGestureEnd: () => dispatch({ type: 'gesture-end' }),
  };
}
