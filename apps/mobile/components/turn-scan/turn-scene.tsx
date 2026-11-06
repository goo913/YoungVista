/**
 * The turn-around scan's AR scene. It listens for planes and the camera (the scan session finds the
 * floor from them, scan/floor.ts) and, once the server has fitted the room, shows its walls in the
 * camera view: a line on the floor, a line at the ceiling and a faint wall between, white for walls
 * the server is sure of or that were marked by hand, amber for walls it is unsure of (offered for a
 * mark by hand), red for walls that do not fit. While marking by hand it also shows the dot where a
 * mark would go, and a dot for each mark made.
 */
import {
  ViroARScene,
  ViroMaterials,
  ViroPolyline,
  ViroQuad,
  ViroSphere,
} from '@reactvision/react-viro';
import type { Vec2 } from '@youngvista/core';
import { memo, useSyncExternalStore } from 'react';
import { useStore, type Store } from '@/lib/store';
import type { ScanController } from '@/scan/controller';
import { wallSources } from '@/scan/turn/merge';

/** What the screen tells the scene. */
export interface TurnSceneState {
  /** Draw the walls (once the server's fit is in, or while marking). */
  walls: boolean;
  /** Draw the dot where a mark would go. */
  aim: boolean;
}

export const initialTurnSceneState: TurnSceneState = { walls: false, aim: false };

/** What the screen passes to the scene through ViroARSceneNavigator's `viroAppProps`. */
export interface TurnSceneAppProps {
  controller: ScanController;
  turn: Store<TurnSceneState>;
}

const constant = (color: string) => ({ diffuseColor: color, lightingModel: 'Constant' as const });
const translucent = (color: string) => ({
  diffuseColor: color,
  lightingModel: 'Constant' as const,
  blendMode: 'Alpha' as const,
  cullMode: 'None' as const,
});

ViroMaterials.createMaterials({
  turnLine: constant('#ffffff'),
  turnLineUnsure: constant('#f59e0b'),
  turnLineConflict: constant('#ef4444'),
  turnPanel: translucent('rgba(255, 255, 255, 0.14)'),
  turnPanelUnsure: translucent('rgba(245, 158, 11, 0.26)'),
  turnPanelConflict: translucent('rgba(239, 68, 68, 0.2)'),
  turnMark: constant('#ffffff'),
  turnMarkCeiling: constant('#22d3ee'),
  turnAimOk: constant('#4ade80'),
  turnAimBad: constant('#f59e0b'),
});

interface SegmentProps {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  thickness: number;
  material: string;
}

/** A straight line; plain-number props let memo skip the lines that did not move. */
const Segment = memo(function Segment({
  ax,
  ay,
  az,
  bx,
  by,
  bz,
  thickness,
  material,
}: SegmentProps) {
  return (
    <ViroPolyline
      points={[
        [ax, ay, az],
        [bx, by, bz],
      ]}
      thickness={thickness}
      materials={[material]}
    />
  );
});

const segment = (a: Vec2, b: Vec2, y: number) => ({
  ax: a.x,
  ay: y,
  az: a.z,
  bx: b.x,
  by: y,
  bz: b.z,
});

const Panel = memo(function Panel(props: {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  width: number;
  height: number;
  material: string;
}) {
  return (
    <ViroQuad
      position={[props.x, props.y, props.z]}
      rotation={[0, props.yawDeg, 0]}
      width={props.width}
      height={props.height}
      materials={[props.material]}
    />
  );
});

const Dot = memo(function Dot(props: {
  x: number;
  y: number;
  z: number;
  radius: number;
  material: string;
}) {
  return (
    <ViroSphere
      position={[props.x, props.y, props.z]}
      radius={props.radius}
      materials={[props.material]}
    />
  );
});

export function TurnScene(props: {
  sceneNavigator?: { viroAppProps?: Partial<TurnSceneAppProps> };
}) {
  const app = props.sceneNavigator?.viroAppProps;
  if (!app?.controller || !app.turn) return <ViroARScene />;
  return <TurnSceneContent controller={app.controller} turn={app.turn} />;
}

function TurnSceneContent({ controller, turn }: TurnSceneAppProps) {
  const { state, derived } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const showWalls = useStore(turn, (s) => s.walls);
  const showAim = useStore(turn, (s) => s.aim);
  const floorY = derived.floor?.y ?? null;
  const height = derived.ceiling?.height ?? null;
  const sources = state.fit && derived.grouped ? wallSources(derived.grouped, state.fit) : [];
  const { aim } = derived;

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
      {showWalls && floorY !== null
        ? derived.walls.flatMap((w, i) => {
            const source = w.wall >= 0 ? sources[w.wall] : undefined;
            const unsure = source?.kind === 'fit' && source.unsure;
            const line = w.conflict ? 'turnLineConflict' : unsure ? 'turnLineUnsure' : 'turnLine';
            const panel = w.conflict
              ? 'turnPanelConflict'
              : unsure
                ? 'turnPanelUnsure'
                : 'turnPanel';
            const thickness = w.inferred ? 0.006 : unsure ? 0.016 : 0.012;
            const dx = w.b.x - w.a.x;
            const dz = w.b.z - w.a.z;
            const length = Math.hypot(dx, dz);
            const items = [
              <Segment
                key={`floor-${i}`}
                {...segment(w.a, w.b, floorY + 0.005)}
                thickness={thickness}
                material={line}
              />,
            ];
            if (height !== null) {
              items.push(
                <Segment
                  key={`ceiling-${i}`}
                  {...segment(w.a, w.b, floorY + height - 0.005)}
                  thickness={thickness}
                  material={line}
                />,
              );
              if (length > 0.05 && !w.inferred) {
                items.push(
                  <Panel
                    key={`panel-${i}`}
                    x={(w.a.x + w.b.x) / 2}
                    y={floorY + height / 2}
                    z={(w.a.z + w.b.z) / 2}
                    yawDeg={(Math.atan2(-dz, dx) * 180) / Math.PI}
                    width={length}
                    height={height}
                    material={panel}
                  />,
                );
              }
            }
            return items;
          })
        : null}

      {showWalls
        ? derived.marks.map((m) =>
            m.point && m.y !== null ? (
              <Dot
                key={`mark-${m.id}`}
                x={m.point.x}
                y={m.y + (m.edge === 'floor' ? 0.02 : -0.02)}
                z={m.point.z}
                radius={0.03}
                material={m.edge === 'ceiling' ? 'turnMarkCeiling' : 'turnMark'}
              />
            ) : null,
          )
        : null}

      {showAim && aim.point && aim.y !== null ? (
        <Dot
          x={aim.point.x}
          y={aim.y + (aim.edge === 'ceiling' ? -0.015 : 0.015)}
          z={aim.point.z}
          radius={0.02}
          material={aim.ok ? 'turnAimOk' : 'turnAimBad'}
        />
      ) : null}
    </ViroARScene>
  );
}
