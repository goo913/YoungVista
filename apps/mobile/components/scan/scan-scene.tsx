import {
  ViroARScene,
  ViroMaterials,
  ViroPolyline,
  ViroQuad,
  ViroSphere,
} from '@reactvision/react-viro';
import { wallDirection, type Vec2 } from '@youngvista/core';
import { memo, useSyncExternalStore } from 'react';
import type { ScanController } from '@/scan/controller';
import { DEBUG_EULER_ORDERS, EULER_ORDER_COLORS, planeDebugRows } from '@/scan/debug';

/** What the scan screen passes to the scene through ViroARSceneNavigator's `viroAppProps`. */
export interface ScanSceneAppProps {
  controller: ScanController;
}

const constant = (color: string) => ({ diffuseColor: color, lightingModel: 'Constant' as const });
const translucent = (color: string) => ({
  diffuseColor: color,
  lightingModel: 'Constant' as const,
  blendMode: 'Alpha' as const,
  cullMode: 'None' as const,
});

ViroMaterials.createMaterials({
  scanLine: constant('#ffffff'),
  scanLineConflict: constant('#ef4444'),
  scanLinePlane: constant('#38bdf8'),
  scanPanel: translucent('rgba(255, 255, 255, 0.14)'),
  scanPanelConflict: translucent('rgba(239, 68, 68, 0.2)'),
  scanMarkFirst: constant('#facc15'),
  scanMarkWall: constant('#ffffff'),
  scanMarkCeiling: constant('#22d3ee'),
  scanAimOk: constant('#4ade80'),
  scanAimBad: constant('#f59e0b'),
  debugPlaneOutline: constant('#38bdf8'),
  debugLevelOutline: constant('#facc15'),
  ...Object.fromEntries(
    DEBUG_EULER_ORDERS.map((order) => [`debug${order}`, constant(EULER_ORDER_COLORS[order])]),
  ),
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

/**
 * A straight line. The scene re-renders with every published change; plain-number props let
 * memo skip lines that did not move, so Viro only hears about real changes.
 */
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

const segment = (a: Vec2, b: Vec2, ay: number, by = ay) => ({
  ax: a.x,
  ay,
  az: a.z,
  bx: b.x,
  by,
  bz: b.z,
});

interface PanelProps {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  width: number;
  height: number;
  material: string;
}

/** A see-through wall: a quad standing on the floor line. */
const Panel = memo(function Panel({ x, y, z, yawDeg, width, height, material }: PanelProps) {
  return (
    <ViroQuad
      position={[x, y, z]}
      rotation={[0, yawDeg, 0]}
      width={width}
      height={height}
      materials={[material]}
    />
  );
});

const Dot = memo(function Dot({
  x,
  y,
  z,
  radius,
  material,
}: {
  x: number;
  y: number;
  z: number;
  radius: number;
  material: string;
}) {
  return <ViroSphere position={[x, y, z]} radius={radius} materials={[material]} />;
});

/**
 * The AR scene: listens for planes and the camera, and shows what the scan has made of the
 * marks: a dot for each mark, and for each wall a line on the floor, a line at the ceiling and a
 * faint see-through wall between them (red when it does not fit). The dot in the middle of the
 * screen has a twin in the room: green where a mark would go, amber where it cannot.
 *
 * With the debug overlay on it also draws every plane Viro found (outlines: blue upright,
 * yellow level) and, for each upright plane, its floor line under each Euler order (green ZYX,
 * Viro's own; red YXZ; blue XYZ).
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
  const height = derived.ceiling?.height ?? null;
  const rows = debug ? planeDebugRows(state, derived) : [];
  const { aim, firstWall, axes } = derived;

  let preview: SegmentProps | null = null;
  if (floorY !== null && aim.point) {
    if (derived.step === 'second-mark' && firstWall.a) {
      preview = {
        ...segment(firstWall.a, aim.point, floorY + 0.01),
        thickness: 0.01,
        material: aim.ok ? 'scanAimOk' : 'scanAimBad',
      };
    } else if (aim.ok && aim.placement && axes) {
      const d = wallDirection(axes, aim.placement.axis);
      const half = 0.6;
      const p = aim.point;
      preview = {
        ...segment(
          { x: p.x - d.x * half, z: p.z - d.z * half },
          { x: p.x + d.x * half, z: p.z + d.z * half },
          aim.y,
        ),
        thickness: 0.01,
        material: 'scanAimOk',
      };
    }
  }

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
        ? derived.walls.flatMap((w, i) => {
            const line = w.conflict
              ? 'scanLineConflict'
              : w.fromPlanes
                ? 'scanLinePlane'
                : 'scanLine';
            const dx = w.b.x - w.a.x;
            const dz = w.b.z - w.a.z;
            const length = Math.hypot(dx, dz);
            const items = [
              <Segment
                key={`floor-${i}`}
                {...segment(w.a, w.b, floorY + 0.005)}
                thickness={w.inferred ? 0.006 : 0.012}
                material={line}
              />,
            ];
            // The ceiling line and the see-through wall once the ceiling height is known.
            if (height !== null) {
              items.push(
                <Segment
                  key={`ceiling-${i}`}
                  {...segment(w.a, w.b, floorY + height - 0.005)}
                  thickness={w.inferred ? 0.006 : 0.012}
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
                    material={w.conflict ? 'scanPanelConflict' : 'scanPanel'}
                  />,
                );
              }
            }
            return items;
          })
        : null}

      {derived.marks.map((m) =>
        m.point && m.y !== null ? (
          <Dot
            key={`mark-${m.id}`}
            x={m.point.x}
            y={m.y + (m.edge === 'floor' ? 0.02 : -0.02)}
            z={m.point.z}
            radius={0.03}
            material={
              m.role === 'first'
                ? 'scanMarkFirst'
                : m.role === 'ceiling' || m.edge === 'ceiling'
                  ? 'scanMarkCeiling'
                  : 'scanMarkWall'
            }
          />
        ) : null,
      )}

      {aim.point && aim.y !== null ? (
        <Dot
          x={aim.point.x}
          y={aim.y + (aim.edge === 'ceiling' ? -0.015 : 0.015)}
          z={aim.point.z}
          radius={0.02}
          material={aim.ok ? 'scanAimOk' : 'scanAimBad'}
        />
      ) : null}
      {preview ? <Segment {...preview} /> : null}

      {rows.map((row) =>
        row.outline.length >= 3 ? (
          <ViroPolyline
            key={`plane-${row.id}`}
            points={[...row.outline, row.outline[0]!].map((p) => [p.x, p.y, p.z])}
            thickness={0.008}
            materials={[row.alignment === 'Vertical' ? 'debugPlaneOutline' : 'debugLevelOutline']}
          />
        ) : null,
      )}
      {floorY !== null
        ? rows.flatMap((row) =>
            row.lines.map((l, k) =>
              l.line ? (
                <Segment
                  key={`euler-${row.id}-${l.order}`}
                  // Stacked a little apart so lines that agree stay visible.
                  {...segment(l.line.a, l.line.b, floorY + 0.02 + 0.015 * k)}
                  thickness={0.01}
                  material={`debug${l.order}`}
                />
              ) : null,
            ),
          )
        : null}
    </ViroARScene>
  );
}
