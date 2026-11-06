/**
 * The turn-around scan's AR session. It runs while this is mounted (unmounting it releases the
 * camera) and carries the whole scan: finding the floor and turning (TurnScene), waiting for the
 * server and marking unsure walls by hand (TurnScene again), marking every wall instead when the
 * server cannot help (the marked scan's own scene, `markInstead`), and the saved room in the camera
 * view (the AR room scene, `showRoom`). Viro hands each new scene the same ARSession and the
 * anchors found so far (VROViewAR::setSceneController), so the world, the floor and the marks
 * stay put throughout.
 */
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { findNodeHandle } from 'react-native';
import type { V3 } from '@/ar/pose';
import type { ArSceneAppProps } from '@/components/ar/ar-scene';
import { arScene, type ArViewHandle } from '@/components/ar/ar-view';
import { ScanScene } from '@/components/scan/scan-scene';
import type { ScanController } from '@/scan/controller';
import { TurnScene, type TurnSceneAppProps } from './turn-scene';

// Viro types `scene` as a component without props; it passes `sceneNavigator` at run time.
const turnScene = { scene: TurnScene as unknown as () => React.JSX.Element };
const markScene = { scene: ScanScene as unknown as () => React.JSX.Element };

export interface TurnArHandle extends ArViewHandle {
  /** The navigator's React tag, for the capture module (modules/room-capture); null before. */
  viewTag(): number | null;
  /** The marked scan's scene takes over, in the same session. */
  markInstead(): void;
  /** The AR room scene takes over, in the same session: the saved room where it was scanned. */
  showRoom(): void;
}

export const TurnArView = forwardRef<
  TurnArHandle,
  {
    controller: ScanController;
    turn: TurnSceneAppProps['turn'];
    ar?: ArSceneAppProps;
    furnishing?: boolean;
  }
>(function TurnArView({ controller, turn, ar, furnishing = false }, ref) {
  const navigator = useRef<ViroARSceneNavigator>(null);
  const scene = useRef<'turn' | 'mark' | 'room'>('turn');
  // One set of props for every scene: TurnScene and the marked scan's read `controller`, the
  // room's reads `ar`.
  const viroAppProps = useMemo(() => ({ controller, turn, ar }), [controller, turn, ar]);

  useImperativeHandle(
    ref,
    () => ({
      get unproject() {
        const nav = navigator.current;
        return nav ? (point: V3) => nav._unproject(point) : null;
      },
      viewTag() {
        return navigator.current ? findNodeHandle(navigator.current) : null;
      },
      markInstead() {
        if (scene.current !== 'turn' || !navigator.current) return;
        scene.current = 'mark';
        navigator.current.replace(markScene as never);
      },
      showRoom() {
        if (scene.current === 'room' || !navigator.current) return;
        scene.current = 'room';
        navigator.current.push(arScene as never);
      },
    }),
    [],
  );

  return (
    <ViroARSceneNavigator
      ref={navigator}
      initialScene={turnScene}
      viroAppProps={viroAppProps}
      // No cloud or geospatial anchors (the default provider is ReactVision's cloud).
      provider="none"
      autofocus
      worldAlignment="Gravity"
      occlusionMode="disabled"
      hdrEnabled={false}
      pbrEnabled={furnishing}
      bloomEnabled={false}
      shadowsEnabled={furnishing}
    />
  );
});
