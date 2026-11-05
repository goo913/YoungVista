import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { useMemo } from 'react';
import type { ScanController } from '@/scan/controller';
import { ScanScene, type ScanSceneAppProps } from './scan-scene';

// Viro types `scene` as a component without props; it passes `sceneNavigator` at run time.
const initialScene = { scene: ScanScene as unknown as () => React.JSX.Element };

/**
 * The AR session. It runs while this is mounted: unmounting it stops the camera and releases
 * the session (ViroARSceneNavigator cleans up natively on unmount).
 */
export function ScanArView({ controller }: { controller: ScanController }) {
  const viroAppProps = useMemo<ScanSceneAppProps>(() => ({ controller }), [controller]);
  return (
    <ViroARSceneNavigator
      initialScene={initialScene}
      viroAppProps={viroAppProps}
      // No cloud or geospatial anchors (the default provider is ReactVision's cloud).
      provider="none"
      autofocus
      worldAlignment="Gravity"
      occlusionMode="disabled"
      hdrEnabled={false}
      pbrEnabled={false}
      bloomEnabled={false}
      shadowsEnabled={false}
    />
  );
}
