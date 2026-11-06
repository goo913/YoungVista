import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { V3 } from '@/ar/pose';
import { arScene, type ArViewHandle } from '@/components/ar/ar-view';
import type { ArSceneAppProps } from '@/components/ar/ar-scene';
import type { ScanController } from '@/scan/controller';
import { ScanScene, type ScanSceneAppProps } from './scan-scene';

// Viro types `scene` as a component without props; it passes `sceneNavigator` at run time.
const initialScene = { scene: ScanScene as unknown as () => React.JSX.Element };

/** The scan's AR session, which can go on to show the saved room (see `showRoom`). */
export interface ScanArHandle extends ArViewHandle {
  /**
   * Swaps the scan's scene for the AR room scene, in the same AR session: the room stays where
   * it was scanned. Viro keeps the session (VROViewAR::setSceneController hands the new scene the
   * same ARSession and, on iPhone, every anchor found so far).
   */
  showRoom(): void;
}

/**
 * The AR session. It runs while this is mounted: unmounting it stops the camera and releases
 * the session (ViroARSceneNavigator cleans up natively on unmount). `ar` is the AR room scene's
 * props, for when the scan goes on to show the room; `furnishing` turns on the shadows and the
 * models' lighting it needs.
 */
export const ScanArView = forwardRef<
  ScanArHandle,
  { controller: ScanController; ar?: ArSceneAppProps; furnishing?: boolean }
>(function ScanArView({ controller, ar, furnishing = false }, ref) {
  const navigator = useRef<ViroARSceneNavigator>(null);
  const shown = useRef(false);
  const viroAppProps = useMemo<ScanSceneAppProps & { ar?: ArSceneAppProps }>(
    () => ({ controller, ar }),
    [controller, ar],
  );

  useImperativeHandle(
    ref,
    () => ({
      get unproject() {
        const nav = navigator.current;
        return nav ? (point: V3) => nav._unproject(point) : null;
      },
      showRoom() {
        if (shown.current || !navigator.current) return;
        shown.current = true;
        navigator.current.push(arScene as never);
      },
    }),
    [],
  );

  return (
    <ViroARSceneNavigator
      ref={navigator}
      initialScene={initialScene}
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
