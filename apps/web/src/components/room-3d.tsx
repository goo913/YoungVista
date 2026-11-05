/**
 * The 3D view (React Three Fiber). Loaded lazily: three.js only downloads when the 3D tab opens.
 *
 * The room is centred on the origin. Walls between the camera and the room fade out, the camera
 * orbits and zooms, "Top view" looks straight down, and "Download picture" renders one clean frame
 * at twice the screen's pixel ratio.
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { LuBox, LuDownload, LuLoaderCircle, LuSquare } from 'react-icons/lu';
import {
  buildRoomMeshes,
  wallFacesCamera,
  type MeshData,
  type Room,
  type RoomMeshes,
  type WallMesh,
} from '@youngvista/core';
import { ErrorBoundary } from '@/components/error-boundary';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { modelUrl } from '@/lib/catalog';
import type { FurnitureEntry } from '@/lib/furniture';

const COLORS = {
  background: '#f1f1f0',
  floor: '#d8c3a2',
  wall: '#f6f4f0',
  frame: '#b9ad9c',
  glass: '#a9cbe8',
  placeholder: '#c9c9cf',
};
/** Opacity of a wall that stands between the camera and the room. */
const FADED = 0.1;
const FOV = 40;

type View = 'corner' | 'top';
type CaptureType = 'image/png' | 'image/jpeg';
type Capture = (type: CaptureType) => Promise<Blob | null>;

export interface Room3DProps {
  room: Room;
  furniture: readonly FurnitureEntry[];
  /** Room name, for the picture's file name. */
  name: string;
}

export default function Room3D({ room, furniture, name }: Room3DProps) {
  const meshes = useMemo(() => buildRoomMeshes(room), [room]);
  const [request, setRequest] = useState<{ view: View; n: number }>({ view: 'corner', n: 0 });
  const capture = useRef<Capture | null>(null);
  // Labels attach to this element. (drei's default target changes once the canvas connects, and
  // under React 19 that leaves labels mounted with the scene empty.)
  const labelLayer = useRef<HTMLDivElement>(null);
  const register = useCallback((fn: Capture | null) => {
    capture.current = fn;
  }, []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const initial = useMemo(() => cameraPreset(meshes, 'corner', 4 / 3), [meshes]);

  async function download(type: CaptureType) {
    if (!capture.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const blob = await capture.current(type);
      if (!blob) throw new Error('empty picture');
      saveBlob(blob, pictureFileName(name, type));
    } catch {
      setSaveError('The picture could not be saved. Try again, or try a smaller window.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRequest((r) => ({ view: 'top', n: r.n + 1 }))}
          >
            <LuSquare aria-hidden />
            Top view
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRequest((r) => ({ view: 'corner', n: r.n + 1 }))}
          >
            <LuBox aria-hidden />
            3D view
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={saving}>
              {saving ? (
                <LuLoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <LuDownload aria-hidden />
              )}
              Download picture
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void download('image/png')}>
              PNG (sharpest)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void download('image/jpeg')}>
              JPEG (smaller file)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* isolate: labels inside the view never draw over the page's sticky header. */}
      <div
        ref={labelLayer}
        className="relative isolate aspect-square max-h-[75vh] w-full overflow-hidden rounded-lg border bg-[#f1f1f0] sm:aspect-[16/10]"
      >
        <ErrorBoundary fallback={() => <NoWebGL />}>
          <Canvas
            shadows="percentage"
            dpr={[1, 2]}
            frameloop="demand"
            camera={{ fov: FOV, near: 0.05, far: 500, position: initial.position }}
            gl={{ antialias: true }}
            aria-label={`3D view of ${name}`}
          >
            <color attach="background" args={[COLORS.background]} />
            <Lights meshes={meshes} />
            <RoomModel meshes={meshes} />
            <group position={[-meshes.center[0], 0, -meshes.center[2]]}>
              {furniture.map((f) => (
                <Furniture key={f.item.id} entry={f} labelLayer={labelLayer} />
              ))}
            </group>
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.12}
              maxPolarAngle={Math.PI * 0.48}
              minDistance={0.8}
              maxDistance={initial.distance * 3}
            />
            <CameraRig meshes={meshes} request={request} />
            <CaptureBridge register={register} />
          </Canvas>
        </ErrorBoundary>
      </div>
      <p className="text-xs text-muted-foreground">
        Drag to turn, scroll or pinch to zoom, right-drag or two fingers to move. Walls facing you
        fade so you can see in.
      </p>
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
    </div>
  );
}

function NoWebGL() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      This browser could not start the 3D view. It needs WebGL: try another browser, or turn on
      hardware acceleration.
    </div>
  );
}

/**
 * Where the camera starts ('corner': a three-quarter view from the front right) or looks straight
 * down ('top'), close enough that the room's outline just fits the view.
 */
function cameraPreset(meshes: RoomMeshes, view: View, aspect: number) {
  const { bounds, center, walls } = meshes;
  const h = Math.max(bounds.max[1], 0.5);
  const target = new THREE.Vector3(0, view === 'top' ? 0 : h * 0.3, 0);
  const elevation = THREE.MathUtils.degToRad(view === 'top' ? 89.9 : 40);
  const azimuth = THREE.MathUtils.degToRad(view === 'top' ? 0 : 28);
  const dir = new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  );
  // Camera axes for looking along -dir.
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const tanH = tanV * aspect;
  // The outside corners of the walls at floor level, plus the tops of the far walls only: the
  // near walls fade out anyway. (The room's bounding box would add empty corners of L-shapes.)
  const corners: THREE.Vector3[] = [];
  for (const wall of walls) {
    for (const end of [-1, 1]) {
      // Each end of the wall's outside face, pushed out by the wall thickness margin.
      const half = wall.length / 2;
      const along = { x: -wall.normal[2], z: wall.normal[0] };
      const x = wall.center[0] - center[0] + along.x * half * end + wall.normal[0] * 0.15;
      const z = wall.center[2] - center[2] + along.z * half * end + wall.normal[2] * 0.15;
      corners.push(new THREE.Vector3(x, 0, z));
      if (view === 'top' || x * dir.x + z * dir.z <= 0) corners.push(new THREE.Vector3(x, h, z));
    }
  }
  if (!corners.length) corners.push(new THREE.Vector3(0, 0, 0));
  // The closest distance at which every corner of the room's box is in view.
  const fit = () => {
    let d = 1;
    for (const c of corners) {
      const p = c.clone().sub(target);
      const depth = p.dot(forward);
      d = Math.max(d, Math.abs(p.dot(right)) / tanH - depth, Math.abs(p.dot(up)) / tanV - depth);
    }
    return d * 1.06;
  };
  let distance = fit();
  // Centre the box on screen (its near and far sides project unevenly), then fit again.
  for (let pass = 0; pass < 2; pass++) {
    const camera = target.clone().addScaledVector(dir, distance);
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const c of corners) {
      const v = c.clone().sub(camera);
      const depth = Math.max(v.dot(forward), 1e-3);
      const sx = v.dot(right) / (depth * tanH);
      const sy = v.dot(up) / (depth * tanV);
      [x0, x1, y0, y1] = [Math.min(x0, sx), Math.max(x1, sx), Math.min(y0, sy), Math.max(y1, sy)];
    }
    target
      .addScaledVector(right, ((x0 + x1) / 2) * distance * tanH)
      .addScaledVector(up, ((y0 + y1) / 2) * distance * tanV);
    distance = fit();
  }
  const position = target.clone().addScaledVector(dir, distance);
  return {
    position: position.toArray() as [number, number, number],
    target: target.toArray() as [number, number, number],
    distance,
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Fits the camera on the first frame and glides to "Top view" or "3D view" when asked. */
function CameraRig({
  meshes,
  request,
}: {
  meshes: RoomMeshes;
  request: { view: View; n: number };
}) {
  const placed = useRef<RoomMeshes | null>(null);
  const handled = useRef(0);
  const glide = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
  } | null>(null);
  // Frames only render on demand: ask for one so a new view request starts gliding.
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [request, meshes, invalidate]);

  useFrame((state, delta) => {
    const controls = state.controls as OrbitControlsImpl | null;
    if (!controls) return;
    const aspect = state.size.width / Math.max(state.size.height, 1);
    if (placed.current !== meshes) {
      placed.current = meshes;
      const p = cameraPreset(meshes, 'corner', aspect);
      state.camera.position.set(...p.position);
      controls.target.set(...p.target);
      controls.update();
      state.invalidate();
      return;
    }
    if (handled.current !== request.n) {
      handled.current = request.n;
      const p = cameraPreset(meshes, request.view, aspect);
      glide.current = {
        from: state.camera.position.clone(),
        to: new THREE.Vector3(...p.position),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(...p.target),
        t: 0,
      };
    }
    const g = glide.current;
    if (!g) return;
    g.t = Math.min(1, g.t + delta / 0.7);
    const e = easeInOut(g.t);
    state.camera.position.lerpVectors(g.from, g.to, e);
    controls.target.lerpVectors(g.fromTarget, g.toTarget, e);
    controls.update();
    if (g.t < 1) state.invalidate();
    else glide.current = null;
  });
  return null;
}

function Lights({ meshes }: { meshes: RoomMeshes }) {
  const { min, max } = meshes.bounds;
  const extent = Math.max(max[0] - min[0], max[2] - min[2]) * 0.75 + 1;
  const height = Math.max(max[1], 1);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9bca8', 1.5]} />
      <directionalLight
        key={extent.toFixed(2)}
        castShadow
        intensity={2.2}
        position={[-extent * 0.45, height + extent * 1.6, extent * 0.8]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-camera-near={0.1}
        shadow-camera-far={extent * 6 + height * 2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={5}
      />
    </>
  );
}

const meshIds = new WeakMap<MeshData, number>();
let nextMeshId = 1;
/** A stable React key per mesh, so a changed mesh gets a fresh geometry. */
function meshKey(mesh: MeshData): number {
  let id = meshIds.get(mesh);
  if (id === undefined) {
    id = nextMeshId++;
    meshIds.set(mesh, id);
  }
  return id;
}

function Geometry({ mesh }: { mesh: MeshData }) {
  const arrays = useMemo(
    () => ({
      position: new Float32Array(mesh.positions),
      normal: new Float32Array(mesh.normals),
      uv: new Float32Array(mesh.uvs),
      index:
        mesh.positions.length / 3 > 65535
          ? new Uint32Array(mesh.indices)
          : new Uint16Array(mesh.indices),
    }),
    [mesh],
  );
  return (
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[arrays.position, 3]} />
      <bufferAttribute attach="attributes-normal" args={[arrays.normal, 3]} />
      <bufferAttribute attach="attributes-uv" args={[arrays.uv, 2]} />
      <bufferAttribute attach="index" args={[arrays.index, 1]} />
    </bufferGeometry>
  );
}

function RoomModel({ meshes }: { meshes: RoomMeshes }) {
  return (
    <group position={[-meshes.center[0], 0, -meshes.center[2]]}>
      <mesh receiveShadow>
        <Geometry key={meshKey(meshes.floor)} mesh={meshes.floor} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.85} />
      </mesh>
      {meshes.walls.map((wall) => (
        <Wall key={wall.id} wall={wall} offset={meshes.center} />
      ))}
    </group>
  );
}

/** One wall, fading out while it stands between the camera and the room. */
function Wall({ wall, offset }: { wall: WallMesh; offset: readonly number[] }) {
  const group = useRef<THREE.Group>(null);
  const panels = useRef<THREE.Mesh>(null);
  const panelMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const frameMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const glassMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const opacity = useRef<number | null>(null);

  useFrame((state: RootState, delta) => {
    const cam = state.camera.position;
    // The scene is shifted by -offset, so add it back to get the camera in room coordinates.
    const camera = { x: cam.x + offset[0]!, y: cam.y, z: cam.z + offset[2]! };
    const target = wallFacesCamera(wall, camera, 0.05) ? FADED : 1;
    const current = opacity.current;
    let next = current === null ? target : THREE.MathUtils.damp(current, target, 10, delta);
    if (Math.abs(next - target) < 0.004) next = target;
    else state.invalidate();
    if (next === current) return;
    opacity.current = next;
    for (const m of [panelMaterial.current, frameMaterial.current]) {
      if (!m) continue;
      m.opacity = next;
      m.depthWrite = next > 0.6;
    }
    if (glassMaterial.current) glassMaterial.current.opacity = 0.32 * next;
    if (group.current) group.current.visible = next > 0.01;
    if (panels.current) panels.current.castShadow = next > 0.6;
  });

  return (
    <group ref={group}>
      <mesh ref={panels} castShadow receiveShadow>
        <Geometry key={meshKey(wall.panels)} mesh={wall.panels} />
        <meshStandardMaterial
          ref={panelMaterial}
          color={COLORS.wall}
          roughness={0.92}
          transparent
        />
      </mesh>
      <mesh castShadow receiveShadow>
        <Geometry key={meshKey(wall.frames)} mesh={wall.frames} />
        <meshStandardMaterial
          ref={frameMaterial}
          color={COLORS.frame}
          roughness={0.7}
          transparent
        />
      </mesh>
      <mesh>
        <Geometry key={meshKey(wall.glass)} mesh={wall.glass} />
        <meshStandardMaterial
          ref={glassMaterial}
          color={COLORS.glass}
          roughness={0.05}
          metalness={0.1}
          transparent
          opacity={0.32}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

type LabelLayer = RefObject<HTMLDivElement | null>;

function Furniture({ entry, labelLayer }: { entry: FurnitureEntry; labelLayer: LabelLayer }) {
  const { item, product } = entry;
  const url = product ? modelUrl(product, item.variant) : null;
  const size = product?.dimensions ?? { w: 0.5, d: 0.5, h: 0.5 };
  return (
    <group
      position={[item.x, item.y ?? 0, item.z]}
      rotation={[0, THREE.MathUtils.degToRad(item.rotationY), 0]}
    >
      {url ? (
        <ErrorBoundary
          key={url}
          fallback={() => (
            <Placeholder
              size={size}
              label={`${entry.name} (model unavailable)`}
              labelLayer={labelLayer}
            />
          )}
        >
          <Suspense fallback={<Placeholder size={size} loading labelLayer={labelLayer} />}>
            <Model url={url} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <Placeholder size={size} label="Unknown item" labelLayer={labelLayer} />
      )}
    </group>
  );
}

function Model({ url }: { url: string }) {
  // No Draco or Meshopt: catalog models are plain GLB (ViroReact needs that too).
  const { scene } = useGLTF(url, false, false);
  const copy = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  return <primitive object={copy} />;
}

/** A box of the item's real size: a wireframe while loading, labelled when the model failed. */
function Placeholder({
  size,
  label,
  loading = false,
  labelLayer,
}: {
  size: { w: number; d: number; h: number };
  label?: ReactNode;
  loading?: boolean;
  labelLayer: LabelLayer;
}) {
  return (
    <group>
      <mesh position={[0, size.h / 2, 0]} castShadow={!loading}>
        <boxGeometry args={[size.w, size.h, size.d]} />
        <meshStandardMaterial
          color={COLORS.placeholder}
          wireframe={loading}
          transparent
          opacity={loading ? 0.6 : 0.85}
        />
      </mesh>
      {label ? (
        <Html
          center
          position={[0, size.h + 0.15, 0]}
          zIndexRange={[10, 0]}
          portal={labelLayer as RefObject<HTMLElement>}
          className="pointer-events-none"
        >
          <span className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium whitespace-nowrap text-foreground shadow-sm">
            {label}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

/** Hands the parent a function that renders one clean frame at twice the screen's pixel ratio. */
function CaptureBridge({ register }: { register: (capture: Capture | null) => void }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    register(async (type) => {
      const { gl, scene, camera, size, invalidate } = get();
      const context = gl.getContext();
      const viewport = context.getParameter(context.MAX_VIEWPORT_DIMS) as Int32Array;
      const maxSide = Math.min(
        gl.capabilities.maxTextureSize,
        context.getParameter(context.MAX_RENDERBUFFER_SIZE) as number,
        viewport[0] ?? 4096,
        viewport[1] ?? 4096,
      );
      const previous = gl.getPixelRatio();
      const ratio = Math.min(
        (window.devicePixelRatio || 1) * 2,
        maxSide / Math.max(size.width, size.height),
      );
      try {
        gl.setPixelRatio(ratio);
        gl.render(scene, camera);
        // toBlob copies the frame right away, before the browser clears it.
        return await new Promise<Blob | null>((resolve) =>
          gl.domElement.toBlob(resolve, type, type === 'image/jpeg' ? 0.92 : undefined),
        );
      } finally {
        gl.setPixelRatio(previous);
        invalidate();
      }
    });
    return () => register(null);
  }, [get, register]);
  return null;
}

function pictureFileName(name: string, type: CaptureType): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'room';
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${slug}-${stamp}.${type === 'image/png' ? 'png' : 'jpg'}`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
