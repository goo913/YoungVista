/**
 * The AR session for a saved room or for placing freely. It runs while this is mounted;
 * unmounting it stops the camera and releases the session.
 *
 * Like the 3D view (components/furnish/room-3d.tsx), the navigator starts with an empty scene and
 * the AR scene follows once the view is laid out: on Android, a node made before the navigator's
 * renderer exists crashes the app, and the first scene added after the renderer starts never gets
 * its Viro context, which the furniture's models need.
 */
import { ViroARScene, ViroARSceneNavigator } from '@reactvision/react-viro';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { V3 } from '@/ar/pose';
import { ArScene, type ArSceneAppProps } from './ar-scene';

type SceneEntry = React.ComponentProps<typeof ViroARSceneNavigator>['initialScene'];

function WaitingScene() {
  return <ViroARScene anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']} />;
}

// Viro types a scene as its own scene class; any component works, and it receives
// `sceneNavigator` (with `viroAppProps`) at run time.
const waitingScene = { scene: WaitingScene } as unknown as SceneEntry;
export const arScene = { scene: ArScene } as unknown as SceneEntry;

/** What the screens need from an AR navigator: rays for touches. */
export interface ArViewHandle {
  /** ViroARSceneNavigator's `unproject`, or null before the view exists. */
  unproject: ((point: V3) => Promise<unknown>) | null;
}

export const ArView = forwardRef<ArViewHandle, { ar: ArSceneAppProps }>(function ArView(
  { ar },
  ref,
) {
  const navigator = useRef<ViroARSceneNavigator>(null);
  const pushed = useRef(false);
  const viroAppProps = useMemo(() => ({ ar }), [ar]);

  useImperativeHandle(
    ref,
    () => ({
      get unproject() {
        const nav = navigator.current;
        return nav ? (point: V3) => nav._unproject(point) : null;
      },
    }),
    [],
  );

  const onLayout = () => {
    if (!pushed.current && navigator.current) {
      pushed.current = true;
      navigator.current.push(arScene as never);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <ViroARSceneNavigator
        ref={navigator}
        initialScene={waitingScene}
        viroAppProps={viroAppProps}
        // No cloud or geospatial anchors (the default provider is ReactVision's cloud).
        provider="none"
        autofocus
        worldAlignment="Gravity"
        occlusionMode="disabled"
        hdrEnabled={false}
        pbrEnabled
        shadowsEnabled
        bloomEnabled={false}
      />
    </View>
  );
});
