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

/** What ViroARSceneNavigator's `_takeScreenshot` resolves with (`url` is a file path). */
export interface ArScreenshot {
  success: boolean;
  url?: string;
  errorCode?: number;
}

/** What the screens need from an AR navigator: rays for touches, and pictures of the view. */
export interface ArViewHandle {
  /** ViroARSceneNavigator's `unproject`, or null before the view exists. */
  unproject: ((point: V3) => Promise<unknown>) | null;
  /**
   * The camera view with the 3D scene, as a PNG in the app's temporary folder (not in Photos):
   * ViroARSceneNavigator's `_takeScreenshot`, or null before the view exists. Used by AI
   * pictures (components/ai/ar-ai-picture.tsx). Optional: the scan's handle has none.
   */
  takeScreenshot?: ((fileName: string) => Promise<ArScreenshot>) | null;
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
      get takeScreenshot() {
        const nav = navigator.current;
        return nav
          ? async (fileName: string) =>
              ((await nav._takeScreenshot(fileName, false)) ?? { success: false }) as ArScreenshot
          : null;
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
