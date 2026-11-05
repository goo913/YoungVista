import {
  ViroARPlane,
  ViroARScene,
  ViroMaterials,
  ViroPolyline,
  ViroQuad,
  ViroSphere,
} from '@reactvision/react-viro';
import { memo, useSyncExternalStore } from 'react';
import type { ScanController } from '@/scan/controller';
import { DEBUG_EULER_ORDERS, EULER_ORDER_COLORS, planeDebugRows } from '@/scan/debug';

/** What the scan screen passes to the scene through ViroARSceneNavigator's `viroAppProps`. */
export interface ScanSceneAppProps {
  controller: ScanController;
}

ViroMaterials.createMaterials({
  scanWall: { diffuseColor: '#ffffff', lightingModel: 'Constant' },
  scanTap: { diffuseColor: '#facc15', lightingModel: 'Constant' },
  debugWallPlane: {
    diffuseColor: 'rgba(56, 189, 248, 0.35)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
  },
  debugFloorPlane: {
    diffuseColor: 'rgba(250, 204, 21, 0.25)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
  },
  ...Object.fromEntries(
    DEBUG_EULER_ORDERS.map((order) => [
      `debug${order}`,
      { diffuseColor: EULER_ORDER_COLORS[order], lightingModel: 'Constant' as const },
    ]),
  ),
});

type Point3 = [number, number, number];

interface FloorLineProps {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
  thickness: number;
  material: string;
}

/**
 * A line on the floor. The scene re-renders with every camera update; plain-number props let
 * memo skip lines that did not move, so Viro only hears about real changes.
 */
const FloorLine = memo(function FloorLine({
  ax,
  az,
  bx,
  bz,
  y,
  thickness,
  material,
}: FloorLineProps) {
  return (
    <ViroPolyline
      points={[
        [ax, y, az],
        [bx, y, bz],
      ]}
      thickness={thickness}
      materials={[material]}
    />
  );
});

const lineProps = (o: { a: { x: number; z: number }; b: { x: number; z: number } }) => ({
  ax: o.a.x,
  az: o.a.z,
  bx: o.b.x,
  bz: o.b.z,
});

/**
 * The AR scene: listens for floor and wall planes and the camera, and draws the walls found so
 * far as white lines on the floor. With the debug overlay on it also draws every plane where
 * Viro itself places it (blue for walls, yellow for floors), and for each wall plane the line
 * that each Euler order gives (red YXZ, green ZYX, blue XYZ), so the right order can be read off
 * on a real phone.
 */
export function ScanScene(props: { sceneNavigator?: { viroAppProps?: ScanSceneAppProps } }) {
  const controller = props.sceneNavigator?.viroAppProps?.controller;
  if (!controller) return <ViroARScene />;
  return <ScanSceneContent controller={controller} />;
}

function ScanSceneContent({ controller }: ScanSceneAppProps) {
  const { state, derived, debug } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const floorY = derived.floor?.y ?? null;
  const rows = debug ? planeDebugRows(state, floorY) : [];

  return (
    <ViroARScene
      anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']}
      onAnchorFound={controller.onAnchorFound}
      onAnchorUpdated={controller.onAnchorUpdated}
      onAnchorRemoved={controller.onAnchorRemoved}
      onTrackingUpdated={controller.onTrackingUpdated}
      onCameraTransformUpdate={controller.onCameraTransformUpdate}
      onAmbientLightUpdate={controller.onAmbientLightUpdate}
    >
      {floorY !== null
        ? derived.walls.map((wall, i) => (
            <FloorLine
              key={`wall-${i}`}
              {...lineProps(wall)}
              y={floorY + 0.01}
              thickness={0.02}
              material="scanWall"
            />
          ))
        : null}

      {floorY !== null && derived.pendingPoint ? (
        <ViroSphere
          position={[derived.pendingPoint.x, floorY + 0.03, derived.pendingPoint.z]}
          radius={0.03}
          materials={['scanTap']}
        />
      ) : null}

      {rows.map((row) => (
        <ViroARPlane key={`plane-${row.id}`} anchorId={row.id}>
          {/* A quad lies in its local XY plane: turn it into the anchor's XZ plane. */}
          <ViroQuad
            position={row.localCenter as Point3}
            rotation={[-90, 0, 0]}
            width={Math.max(row.width, 0.01)}
            height={Math.max(row.height, 0.01)}
            materials={[row.alignment === 'Vertical' ? 'debugWallPlane' : 'debugFloorPlane']}
          />
        </ViroARPlane>
      ))}

      {floorY !== null
        ? rows.flatMap((row) =>
            row.lines.map((line, k) =>
              line.observation ? (
                <FloorLine
                  key={`euler-${row.id}-${line.order}`}
                  {...lineProps(line.observation)}
                  // Stacked a little apart so lines that agree stay visible.
                  y={floorY + 0.02 + 0.015 * k}
                  thickness={0.012}
                  material={`debug${line.order}`}
                />
              ) : null,
            ),
          )
        : null}
    </ViroARScene>
  );
}
