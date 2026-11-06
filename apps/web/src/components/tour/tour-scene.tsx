/**
 * Inside the 360° view's canvas: the camera standing on a spot, the panorama around it, the room's
 * walls, floor and ceiling as invisible depth (so furniture behind a real wall is hidden), the
 * room's furniture at true size with soft shadows under it, and a circle on the floor at each
 * other spot to move there.
 *
 * Draw order: the panorama sphere first (no depth), then the room shell (depth only; while moving,
 * the two panoramas projected onto it), then the furniture, its floor shadows and the circles.
 * The sphere, the shell and the circles live on `TOUR_LAYER` only, so the floor shadows (drawn by
 * a camera that sees layer 0) come from the furniture alone.
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { bounds, type Room, type RoomTour, type RoomTourSpot } from '@youngvista/core';
import { ErrorBoundary } from '@/components/error-boundary';
import { modelUrl } from '@/lib/catalog';
import type { FurnitureEntry } from '@/lib/furniture';
import {
  defaultFov,
  inSight,
  shellGeometry,
  shellShader,
  sphereShader,
  type LoadedPanorama,
} from './panorama';
import type { TourRig } from './tour-rig';

/** The layer of everything that is not furniture (seen by the view, not by the floor shadows). */
export const TOUR_LAYER = 1;
const UNKNOWN_SIZE = { w: 0.5, d: 0.5, h: 0.5 };
const deg = THREE.MathUtils.degToRad;

/** Puts an object on `TOUR_LAYER` only. */
function useTourLayer<T extends THREE.Object3D>() {
  return useCallback((o: T | null) => {
    o?.layers.set(TOUR_LAYER);
  }, []);
}

export interface TourSceneProps {
  rig: TourRig;
  room: Room;
  tour: RoomTour;
  /** The spot the camera stands on (React's copy: it changes when a move ends). */
  current: LoadedPanorama | null;
  furniture: readonly FurnitureEntry[];
  onPick: (spot: RoomTourSpot) => void;
  /** The view was dragged or zoomed (hides the first-time hint). */
  onInteract?: () => void;
}

export function TourScene({
  rig,
  room,
  tour,
  current,
  furniture,
  onPick,
  onInteract,
}: TourSceneProps) {
  const shell = useMemo(() => shellGeometry(room), [room]);
  useEffect(() => () => shell.dispose(), [shell]);
  return (
    <>
      <TourCamera rig={rig} />
      <LookControls rig={rig} onInteract={onInteract} />
      <PanoramaSphere rig={rig} />
      <RoomShell geometry={shell} rig={rig} />
      <PanoramaLight pano={current} />
      {current ? (
        <Hotspots room={room} tour={tour} current={current.spot} rig={rig} onPick={onPick} />
      ) : null}
      <group>
        {furniture.map((f) => (
          <Piece key={f.item.id} entry={f} />
        ))}
      </group>
      {furniture.length ? <FloorShadows room={room} /> : null}
    </>
  );
}

/** Puts the camera where the rig says, every frame, and keeps the glide and moves running. */
function TourCamera({ rig }: { rig: TourRig }) {
  const get = useThree((s) => s.get);
  useLayoutEffect(() => {
    const { camera, raycaster } = get();
    camera.rotation.order = 'YXZ';
    // The view sees the panorama, the shell and the circles; clicks reach the circles.
    camera.layers.enable(TOUR_LAYER);
    raycaster.layers.enable(TOUR_LAYER);
  }, [get]);
  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / Math.max(state.size.height, 1);
    rig.fitFov(aspect, defaultFov);
    const running = rig.step(delta);
    camera.position.copy(rig.position);
    // Heading 180° is three.js's resting −z view.
    camera.rotation.set(deg(rig.pitch), deg(rig.heading) - Math.PI, 0);
    if (camera.fov !== rig.fov) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
    rig.publish(aspect);
    if (running) state.invalidate();
  }, -1);
  return null;
}

/**
 * Drag to look (the picture follows the finger), pinch or the wheel to zoom, and a flick keeps
 * turning for a moment.
 */
function LookControls({ rig, onInteract }: { rig: TourRig; onInteract?: () => void }) {
  const get = useThree((s) => s.get);
  const interact = useRef(onInteract);
  useLayoutEffect(() => {
    interact.current = onInteract;
  });
  useEffect(() => {
    const el = get().gl.domElement;
    el.style.touchAction = 'none';
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; fov: number } | null = null;
    let velocity = { heading: 0, pitch: 0, at: 0 };
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      rig.spin = null;
      velocity = { heading: 0, pitch: 0, at: e.timeStamp };
      if (pointers.size === 2) pinch = { distance: spread(), fov: rig.fov };
    };
    const moved = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 1) {
        if (!dx && !dy) return;
        // A drag across the view's height turns it by its field of view.
        const k = rig.fov / Math.max(el.clientHeight, 1);
        rig.look(dx * k, dy * k);
        const dt = Math.max(e.timeStamp - velocity.at, 1) / 1000;
        const blend = (old: number, now: number) => old * 0.3 + now * 0.7;
        velocity = {
          heading: blend(velocity.heading, (dx * k) / dt),
          pitch: blend(velocity.pitch, (dy * k) / dt),
          at: e.timeStamp,
        };
        interact.current?.();
      } else if (pinch && pinch.distance > 0) {
        const d = spread();
        if (d > 0) rig.setFov((pinch.fov * pinch.distance) / d);
        interact.current?.();
      }
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        // A flick (still moving when let go) glides on.
        const recent = e.timeStamp - velocity.at < 80;
        const speed = Math.hypot(velocity.heading, velocity.pitch);
        if (recent && speed > 30) {
          const cap = Math.min(1, 360 / speed);
          rig.spin = { heading: velocity.heading * cap, pitch: velocity.pitch * cap };
          rig.invalidate();
        }
      } else {
        velocity = { heading: 0, pitch: 0, at: e.timeStamp };
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 20 : 1;
      rig.zoom(Math.exp(e.deltaY * lines * 0.0015));
      interact.current?.();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', moved);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', moved);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [get, rig]);
  return null;
}

/** The current spot's panorama, at infinity: a sphere that travels with the camera. */
function PanoramaSphere({ rig }: { rig: TourRig }) {
  const shader = useMemo(() => sphereShader(), []);
  const layer = useTourLayer<THREE.Mesh>();
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  useFrame((state) => {
    const pano = rig.current;
    if (mesh.current) {
      mesh.current.position.copy(state.camera.position);
      mesh.current.visible = !!pano;
    }
    const u = material.current?.uniforms;
    if (pano && u && u.map!.value !== pano.texture) {
      u.map!.value = pano.texture;
      u.yaw!.value = deg(pano.spot.yawDeg);
    }
  });
  return (
    <mesh
      ref={(m) => {
        mesh.current = m;
        layer(m);
      }}
      renderOrder={-10}
      frustumCulled={false}
    >
      <sphereGeometry args={[10, 64, 32]} />
      <shaderMaterial ref={material} args={[shader]} />
    </mesh>
  );
}

/**
 * The room's walls, floor and ceiling: depth only while standing (furniture behind them is
 * hidden), and both panoramas projected onto them while moving between spots.
 */
function RoomShell({ geometry, rig }: { geometry: THREE.BufferGeometry; rig: TourRig }) {
  const shader = useMemo(() => shellShader(), []);
  const layer = useTourLayer<THREE.Mesh>();
  const still = useRef<THREE.Mesh>(null);
  const moving = useRef<THREE.Mesh>(null);
  const blend = useRef<THREE.ShaderMaterial>(null);
  useFrame(() => {
    const move = rig.move;
    if (still.current) still.current.visible = !move;
    if (moving.current) moving.current.visible = !!move;
    const u = blend.current?.uniforms;
    if (!move || !u) return;
    u.mapA!.value = move.from.texture;
    u.mapB!.value = move.to.texture;
    (u.centerA!.value as THREE.Vector3).set(...move.from.spot.position);
    (u.centerB!.value as THREE.Vector3).set(...move.to.spot.position);
    u.yawA!.value = deg(move.from.spot.yawDeg);
    u.yawB!.value = deg(move.to.spot.yawDeg);
    u.mixT!.value = rig.fade;
  });
  return (
    <>
      <mesh
        ref={(m) => {
          still.current = m;
          layer(m);
        }}
        geometry={geometry}
        renderOrder={-5}
      >
        <meshBasicMaterial colorWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        ref={(m) => {
          moving.current = m;
          layer(m);
        }}
        geometry={geometry}
        renderOrder={-5}
        visible={false}
      >
        <shaderMaterial ref={blend} args={[shader]} />
      </mesh>
    </>
  );
}

/** The panorama also lights the furniture and shows in its reflections. */
function PanoramaLight({ pano }: { pano: LoadedPanorama | null }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (!pano) return;
    const { scene, invalidate } = get();
    scene.environment = pano.environment;
    // three.js puts an environment's centre column at heading 90°; this one's is at yawDeg.
    scene.environmentRotation.set(0, deg(pano.spot.yawDeg - 90), 0);
    scene.environmentIntensity = 0.9;
    invalidate();
    return () => {
      if (scene.environment === pano.environment) scene.environment = null;
    };
  }, [pano, get]);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#a89a85', 0.45]} />
      <directionalLight position={[1.5, 4, 2]} intensity={0.9} />
    </>
  );
}

/**
 * A circle on the floor at each other spot the camera can see: click or tap it to move there.
 * Real walls hide a circle (it is left out); furniture, which is not really there, only dims it
 * (a faint ring shows through).
 */
function Hotspots({
  room,
  tour,
  current,
  rig,
  onPick,
}: {
  room: Room;
  tour: RoomTour;
  current: RoomTourSpot;
  rig: TourRig;
  onPick: (spot: RoomTourSpot) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const shown = useMemo(() => {
    const from = { x: current.position[0], z: current.position[2] };
    return tour.spots.filter(
      (s) => s.spot !== current.spot && inSight(room, from, { x: s.position[0], z: s.position[2] }),
    );
  }, [room, tour, current]);
  useFrame(() => {
    if (group.current) group.current.visible = !rig.move;
  });
  return (
    <group ref={group}>
      {shown.map((s) => (
        <Hotspot key={s.spot} spot={s} onPick={onPick} />
      ))}
    </group>
  );
}

function Hotspot({ spot, onPick }: { spot: RoomTourSpot; onPick: (spot: RoomTourSpot) => void }) {
  const [hover, setHover] = useState(false);
  const layer = useTourLayer<THREE.Object3D>();
  const setLayers = useCallback(
    (g: THREE.Group | null) => {
      g?.traverse((o) => layer(o));
    },
    [layer],
  );
  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hover]);
  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // A drag that ends on a circle only turns the view.
    if (e.delta > 6) return;
    onPick(spot);
  };
  return (
    <group
      ref={setLayers}
      position={[spot.position[0], 0.012, spot.position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={hover ? 1.15 : 1}
      userData={{ tourSpot: spot.spot }}
    >
      <mesh
        renderOrder={20}
        onClick={pick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <circleGeometry args={[0.28, 48]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={hover ? 0.5 : 0.28}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh renderOrder={21}>
        <ringGeometry args={[0.2, 0.26, 48]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* A thin dark edge, so the circle shows on a pale floor too. */}
      <mesh renderOrder={21}>
        <ringGeometry args={[0.26, 0.28, 48]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.3}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Through furniture: a faint ring. */}
      <mesh renderOrder={19}>
        <ringGeometry args={[0.2, 0.26, 48]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.4}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** One piece of furniture at its saved place and true size. */
function Piece({ entry }: { entry: FurnitureEntry }) {
  const { item, product } = entry;
  const url = product ? modelUrl(product, item.variant) : null;
  const size = product?.dimensions ?? UNKNOWN_SIZE;
  return (
    <group
      position={[item.x, item.y ?? 0, item.z]}
      rotation={[0, deg(item.rotationY), 0]}
      userData={{ itemId: item.id }}
    >
      {url ? (
        <ErrorBoundary key={url} fallback={() => <Stand size={size} />}>
          <Suspense fallback={null}>
            <Model url={url} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <Stand size={size} />
      )}
    </group>
  );
}

function Model({ url }: { url: string }) {
  // Plain GLB, as in the 3D view.
  const { scene } = useGLTF(url, false, false);
  const copy = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={copy} />;
}

/** A box of the piece's true size, when its model is missing. */
function Stand({ size }: { size: { w: number; d: number; h: number } }) {
  return (
    <mesh position={[0, size.h / 2, 0]}>
      <boxGeometry args={[size.w, size.h, size.d]} />
      <meshStandardMaterial color="#c9c9cf" transparent opacity={0.85} />
    </mesh>
  );
}

/**
 * Soft shadows on the floor under the furniture (drawn from below, blurred). drei draws the blur
 * on a plane at the world's origin, so the shadows sit centred on the origin, just under the
 * floor (and above the depth-only floor), and reach out over the whole room.
 */
function FloorShadows({ room }: { room: Room }) {
  const b = useMemo(() => bounds(room.points), [room]);
  const coarse = useMemo(() => {
    try {
      return matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  }, []);
  const reachX = Math.max(Math.abs(b.minX), Math.abs(b.maxX)) + 0.5;
  const reachZ = Math.max(Math.abs(b.minZ), Math.abs(b.maxZ)) + 0.5;
  return (
    <ContactShadows
      position={[0, -0.01, 0]}
      scale={[reachX * 2, reachZ * 2]}
      resolution={coarse ? 512 : 1024}
      far={1.6}
      blur={2.4}
      opacity={0.7}
      color="#1d150c"
      renderOrder={5}
    />
  );
}
