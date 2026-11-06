/**
 * The AR scene for a saved room ("See it in your room") and for placing freely: the furniture at
 * true size where it stands in the room, with a soft shadow on the real floor, an optional faint
 * outline of the room's walls, doors and windows ("ghost walls"), and while lining up the dot on
 * the floor and the corners tapped so far.
 *
 * The room, its ghost and its furniture are in one node with the line-up's transform
 * (core's lineup.ts), so everything in it is in room space. The shadow is caught by an invisible
 * quad on the floor (ViroQuad's `arShadowReceiver`: ViroCore's VROARShadow on iPhone, a
 * transparent shadow material on Android). Its darkness is the light's shadow opacity minus the
 * ambient light's brightness, so the ambient light stays low and a directional light from above
 * does most of the lighting. Both follow the phone's estimate of the room's light (ar/light.ts).
 */
import {
  ViroAmbientLight,
  ViroARScene,
  ViroDirectionalLight,
  ViroMaterials,
  ViroNode,
  ViroPolyline,
  ViroQuad,
  ViroSphere,
} from '@reactvision/react-viro';
import { bounds, roomCenter, type LineUp, type Room, type Vec2 } from '@youngvista/core';
import { memo, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ArController } from '@/ar/controller';
import { ghostLines, type GhostLine } from '@/ar/ghost';
import { arLights } from '@/ar/light';
import { roomToWorld, type V3 } from '@/ar/pose';
import { Furniture, type SceneItem } from '@/components/furnish/room-scene';
import { useStore, type Store } from '@/lib/store';

/** What the AR scene draws besides what the controller tracks. */
export interface ArSceneState {
  /** Room → world: the latest line-up, null before the first one. */
  lineUp: LineUp | null;
  /** Show the room and its furniture (false while lining up again). */
  showRoom: boolean;
  /** The saved room (its ghost walls and its floor); null when placing freely. */
  room: Room | null;
  /** Show the ghost walls. */
  ghost: boolean;
  /** The furniture, in room space. */
  items: readonly SceneItem[];
  /** Corners tapped so far while lining up (world floor points). */
  taps: readonly Vec2[];
  /** Show the dot where it meets the floor. */
  showAim: boolean;
  /** Pieces whose model could not load (shown as grey boxes of their size). */
  failed: ReadonlySet<string>;
}

export const initialArSceneState = (room: Room | null = null): ArSceneState => ({
  lineUp: null,
  showRoom: false,
  room,
  ghost: true,
  items: [],
  taps: [],
  showAim: true,
  failed: new Set(),
});

/** What a navigator passes to the scene, as `viroAppProps.ar`. */
export interface ArSceneAppProps {
  controller: ArController;
  store: Store<ArSceneState>;
}

ViroMaterials.createMaterials({
  arGhostWall: { diffuseColor: '#ffffff', lightingModel: 'Constant' },
  arGhostDoor: { diffuseColor: '#fbbf24', lightingModel: 'Constant' },
  arGhostWindow: { diffuseColor: '#7dd3fc', lightingModel: 'Constant' },
  arAimOk: { diffuseColor: '#4ade80', lightingModel: 'Constant' },
  arAimBad: { diffuseColor: '#f59e0b', lightingModel: 'Constant' },
  arTap: { diffuseColor: '#facc15', lightingModel: 'Constant' },
  // Its own material: the AR shadow shader is added to the quad's first material.
  arShadowCatcher: { diffuseColor: '#ffffff', lightingModel: 'Lambert' },
});

const GHOST_MATERIAL: Record<GhostLine['kind'], string> = {
  wall: 'arGhostWall',
  door: 'arGhostDoor',
  opening: 'arGhostDoor',
  window: 'arGhostWindow',
};

/** The scene a navigator shows (Viro passes `sceneNavigator` to it at run time). */
export function ArScene(props: { sceneNavigator?: { viroAppProps?: { ar?: ArSceneAppProps } } }) {
  const ar = props.sceneNavigator?.viroAppProps?.ar;
  // The same plane detection as the scan, so going from a scan to AR does not reconfigure the
  // phone's AR session.
  if (!ar) return <ViroARScene anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']} />;
  return <ArSceneContent controller={ar.controller} store={ar.store} />;
}

function ArSceneContent({ controller, store }: ArSceneAppProps) {
  const { state, derived } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const lineUp = useStore(store, (s) => s.lineUp);
  const showRoom = useStore(store, (s) => s.showRoom);
  const room = useStore(store, (s) => s.room);
  const ghost = useStore(store, (s) => s.ghost);
  const items = useStore(store, (s) => s.items);
  const taps = useStore(store, (s) => s.taps);
  const showAim = useStore(store, (s) => s.showAim);
  const floorY = derived.floorY;
  const aim = derived.aim;
  // Rounded levels (ar/light.ts): the lights change only when the room's light really does.
  const { ambient, directional } = arLights(state.lightIntensity);

  const onFailed = useCallback(
    (id: string, failed: boolean) =>
      store.set((s) => {
        if (s.failed.has(id) === failed) return s;
        const next = new Set(s.failed);
        if (failed) next.add(id);
        else next.delete(id);
        return { ...s, failed: next };
      }),
    [store],
  );

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
      {lineUp ? (
        <Lights
          lineUp={lineUp}
          room={room}
          items={items}
          ambient={ambient}
          directional={directional}
        />
      ) : null}
      {/* Once lined up, the room's node stays; lining up again only hides it. */}
      {lineUp ? (
        <RoomNode
          lineUp={lineUp}
          visible={showRoom}
          room={room}
          ghost={ghost}
          items={items}
          onFailed={onFailed}
        />
      ) : null}
      {showAim && aim.ok ? (
        <Dot x={aim.point.x} y={aim.y + 0.01} z={aim.point.z} radius={0.02} material="arAimOk" />
      ) : null}
      {floorY !== null
        ? taps.map((p, i) => <TapMark key={`tap-${i}`} x={p.x} y={floorY} z={p.z} />)
        : null}
    </ViroARScene>
  );
}

/**
 * Light from above, a little to one side, that casts the shadows; little ambient light. Their
 * intensities follow the room's light (ar/light.ts).
 */
const LIGHT_DIRECTION: V3 = [0.25, -1, -0.35];

/** Around the room (or the pieces placed freely), where the shadow is worked out (m). */
function shadowArea(lineUp: LineUp, room: Room | null, items: readonly SceneItem[]) {
  if (room) {
    const b = bounds(room.points);
    return { center: roomToWorld(lineUp, roomCenter(room)), size: Math.max(b.width, b.depth) + 2 };
  }
  if (!items.length) return { center: roomToWorld(lineUp, { x: 0, z: 0 }), size: 8 };
  const xs = items.map((it) => it.x);
  const zs = items.map((it) => it.z);
  const mid = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
  const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  return { center: roomToWorld(lineUp, mid), size: Math.max(spread + 4, 6) };
}

const Lights = memo(function Lights({
  lineUp,
  room,
  items,
  ambient,
  directional,
}: {
  lineUp: LineUp;
  room: Room | null;
  items: readonly SceneItem[];
  ambient: number;
  directional: number;
}) {
  const area = shadowArea(lineUp, room, items);
  const len = Math.hypot(...LIGHT_DIRECTION);
  const reach = area.size * 1.5 + 3;
  const c = area.center;
  // Rounded, so the shadow box does not move with every small change.
  const at = (v: number) => Math.round(v * 4) / 4;
  return (
    <>
      <ViroAmbientLight color="#ffffff" intensity={ambient} />
      <ViroDirectionalLight
        color="#ffffff"
        intensity={directional}
        direction={LIGHT_DIRECTION}
        castsShadow
        shadowOpacity={0.7}
        shadowMapSize={2048}
        shadowOrthographicSize={Math.ceil(area.size * 1.2)}
        shadowOrthographicPosition={[
          at(c[0] - (LIGHT_DIRECTION[0] / len) * reach),
          at(c[1] - (LIGHT_DIRECTION[1] / len) * reach),
          at(c[2] - (LIGHT_DIRECTION[2] / len) * reach),
        ]}
        shadowNearZ={0.1}
        shadowFarZ={reach * 2 + 4}
      />
    </>
  );
});

/**
 * The room in room space: the shadow-catching floor, the ghost walls (always there, shown or
 * hidden: on Android a changed `visible` always shows, a new child sometimes does not) and the
 * furniture last, where new pieces do appear. Memoised: the scene re-renders with every tracking
 * update (ten times a second), the room only when it changes.
 */
const RoomNode = memo(function RoomNode({
  lineUp,
  visible,
  room,
  ghost,
  items,
  onFailed,
}: {
  lineUp: LineUp;
  visible: boolean;
  room: Room | null;
  ghost: boolean;
  items: readonly SceneItem[];
  onFailed: (id: string, failed: boolean) => void;
}) {
  return (
    <ViroNode
      position={[lineUp.x, lineUp.y, lineUp.z]}
      rotation={[0, lineUp.rotationY, 0]}
      visible={visible}
    >
      <ShadowFloor room={room} items={items} />
      {room ? <Ghost room={room} visible={ghost} /> : null}
      {items.map((item) => (
        <Furniture key={item.id} item={item} onFailed={onFailed} />
      ))}
    </ViroNode>
  );
});

/** An invisible floor that only shows the furniture's shadows. */
const ShadowFloor = memo(function ShadowFloor({
  room,
  items,
}: {
  room: Room | null;
  items: readonly SceneItem[];
}) {
  let cx = 0;
  let cz = 0;
  let w = 20;
  let d = 20;
  if (room) {
    const b = bounds(room.points);
    cx = (b.minX + b.maxX) / 2;
    cz = (b.minZ + b.maxZ) / 2;
    w = b.width + 2;
    d = b.depth + 2;
  } else if (items.length) {
    cx = items.reduce((s, it) => s + it.x, 0) / items.length;
    cz = items.reduce((s, it) => s + it.z, 0) / items.length;
    cx = Math.round(cx);
    cz = Math.round(cz);
  }
  return (
    <ViroQuad
      position={[cx, 0.001, cz]}
      rotation={[-90, 0, 0]}
      width={w}
      height={d}
      arShadowReceiver
      materials={['arShadowCatcher']}
      shadowCastingBitMask={0}
      renderingOrder={-10}
    />
  );
});

const Ghost = memo(function Ghost({ room, visible }: { room: Room; visible: boolean }) {
  const lines = useMemo(() => ghostLines(room), [room]);
  return (
    <ViroNode visible={visible}>
      {lines.map((l) => (
        <ViroPolyline
          key={l.key}
          points={[l.a, l.b]}
          thickness={l.kind === 'wall' ? 0.006 : 0.008}
          materials={[GHOST_MATERIAL[l.kind]]}
          shadowCastingBitMask={0}
        />
      ))}
    </ViroNode>
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
  return (
    <ViroSphere
      position={[x, y, z]}
      radius={radius}
      materials={[material]}
      shadowCastingBitMask={0}
    />
  );
});

/** A corner already tapped: a yellow dot with a short post, easy to see from across the room. */
const TapMark = memo(function TapMark({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <ViroNode position={[x, y, z]}>
      <ViroSphere
        radius={0.03}
        position={[0, 0.03, 0]}
        materials={['arTap']}
        shadowCastingBitMask={0}
      />
      <ViroPolyline
        points={[
          [0, 0, 0],
          [0, 0.4, 0],
        ]}
        thickness={0.01}
        materials={['arTap']}
        shadowCastingBitMask={0}
      />
    </ViroNode>
  );
});
