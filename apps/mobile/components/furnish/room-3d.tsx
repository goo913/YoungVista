/**
 * The 3D view of a room (Viro3DSceneNavigator: a plain 3D scene on iPhone and Android, no camera
 * or AR session). One finger turns around the room, two fingers pinch to zoom, and "Top view"
 * looks straight down. Furniture is picked and dragged with the app's own camera maths
 * (furnish/orbit.ts): a finger that starts on a piece moves it along the floor, and a two-finger
 * turn rotates the selected piece. The touch handling lives in view-3d-controls.ts.
 *
 * `capture()` takes the final picture: what the scene draws, without anything drawn over it
 * (modules/scene-capture).
 */
import { Viro3DSceneNavigator } from '@reactvision/react-viro';
import { buildRoomMeshes, type Room, type RoomMeshes } from '@youngvista/core';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { findNodeHandle, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Text } from '@/components/ui/text';
import { projectPoint, type ViewPreset, type Viewport } from '@/furnish/orbit';
import { createStore, useStore, type Store } from '@/lib/store';
import { captureScene, type SceneCaptureResult } from '@/modules/scene-capture';
import {
  RoomScene,
  SCENE_COLORS,
  WaitingScene,
  type RoomSceneAppProps,
  type SceneState,
} from './room-scene';
import { View3DControls, type View3DInput } from './view-3d-controls';

export type { FurnitureGestures } from './view-3d-controls';

// Viro types a scene as its own scene class; any component works, and it receives
// `sceneNavigator` (with `viroAppProps`) at run time.
type SceneEntry = React.ComponentProps<typeof Viro3DSceneNavigator>['initialScene'];
const waitingScene = { scene: WaitingScene } as unknown as SceneEntry;
const roomScene = { scene: RoomScene } as unknown as SceneEntry;

export interface Room3DProps extends View3DInput {
  room: Room;
}

export interface Room3DHandle {
  /** Glides to a three-quarter view or straight down. */
  show(preset: ViewPreset): void;
  /**
   * Resolves once every piece's model is drawn (or could not load): true, or false after
   * `timeoutMs` with some still loading.
   */
  whenModelsReady(timeoutMs: number): Promise<boolean>;
  /** The scene as a JPEG at the view's full pixel size (the final picture). */
  capture(): Promise<SceneCaptureResult>;
}

/** The pieces whose model is still loading. */
const loadingCount = (s: SceneState) =>
  s.items.filter((it) => it.modelUrl && !s.ready.has(it.id) && !s.failed.has(it.id)).length;

export const Room3D = forwardRef<Room3DHandle, Room3DProps>(function Room3D(props, ref) {
  const { room, items } = props;
  const meshes = useMemo(() => buildRoomMeshes(room), [room]);
  const [store] = useState(() =>
    createStore<SceneState>({
      meshes,
      items,
      orbit: { target: [0, 0, 0], yaw: 28, pitch: 40, distance: 8 },
      failed: new Set(),
      ready: new Set(),
    }),
  );
  const [controls] = useState(() => new View3DControls(store, props));
  const appProps = useMemo<RoomSceneAppProps>(() => ({ store }), [store]);
  const navigator = useRef<Viro3DSceneNavigator>(null);
  const pushed = useRef(false);
  const framed = useRef<RoomMeshes | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);

  useLayoutEffect(() => controls.update(props, viewport, meshes));
  useEffect(() => store.set((s) => ({ ...s, items })), [store, items]);
  useEffect(() => store.set((s) => ({ ...s, meshes })), [store, meshes]);
  useEffect(() => () => controls.dispose(), [controls]);

  // Frame the room once the view has a size (and again for a different room).
  useEffect(() => {
    if (!viewport || framed.current === meshes) return;
    framed.current = meshes;
    controls.frame(meshes, viewport);
  }, [controls, meshes, viewport]);

  useImperativeHandle(
    ref,
    () => ({
      show: (preset) => controls.show(preset),
      whenModelsReady: (timeoutMs) =>
        new Promise<boolean>((resolve) => {
          if (loadingCount(store.get()) === 0) {
            resolve(true);
            return;
          }
          // Both callbacks run later, once `timer` and `stop` exist.
          const timer = setTimeout(() => done(false), timeoutMs);
          const stop = store.subscribe(() => {
            if (loadingCount(store.get()) === 0) done(true);
          });
          function done(ready: boolean) {
            clearTimeout(timer);
            stop();
            resolve(ready);
          }
        }),
      capture: async () => {
        const tag = navigator.current ? findNodeHandle(navigator.current) : null;
        if (tag == null) throw new Error('The 3D view is not ready yet.');
        return captureScene(tag, { quality: 0.92, background: SCENE_COLORS.background });
      },
    }),
    [controls, store],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setViewport({ width, height });
    // The navigator's native view exists once its container has been laid out: now the room's
    // scene can follow the empty one it started with (see WaitingScene).
    if (!pushed.current && navigator.current) {
      pushed.current = true;
      navigator.current.push(roomScene as never);
    }
  };

  // Made once: everything the scene draws comes through the store, so the navigator (and the
  // scene under it) need not re-render with this view, which happens at every step of a drag.
  const scene = useMemo(
    () => (
      <Viro3DSceneNavigator
        ref={navigator}
        initialScene={waitingScene}
        viroAppProps={appProps}
        hdrEnabled={false}
        pbrEnabled
        shadowsEnabled
        bloomEnabled={false}
      />
    ),
    [appProps],
  );

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {scene}
      <FailedLabels store={store} viewport={viewport} />
      <GestureDetector gesture={controls.gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
    </View>
  );
});

/** "Sofa (model not available)" above each piece whose model could not load. */
function FailedLabels({
  store,
  viewport,
}: {
  store: Store<SceneState>;
  viewport: Viewport | null;
}) {
  const failed = useStore(store, (s) => s.failed);
  const items = useStore(store, (s) => s.items);
  const orbit = useStore(store, (s) => s.orbit);
  if (!viewport || failed.size === 0) return null;
  return (
    <>
      {items.map((item) => {
        if (!failed.has(item.id)) return null;
        const p = projectPoint(orbit, viewport, [item.x, item.y + item.size.h + 0.1, item.z]);
        if (!p) return null;
        return (
          <View
            key={item.id}
            pointerEvents="none"
            style={[styles.label, { left: p.x - LABEL_WIDTH / 2, top: p.y - 30 }]}
          >
            <Text className="text-center text-xs font-medium text-white" numberOfLines={2}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </>
  );
}

const LABEL_WIDTH = 168;

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: SCENE_COLORS.background, overflow: 'hidden' },
  label: {
    position: 'absolute',
    width: LABEL_WIDTH,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(24, 24, 27, 0.8)',
  },
});
