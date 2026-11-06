/**
 * The 3D view (React Three Fiber). Loaded lazily: three.js only downloads when the 3D tab opens.
 *
 * The room is centred on the origin. Three ways of moving, as in the team's closet designer
 * (the toolbar's 3D, Fly and Walk; see view3d/navigator.tsx): round the room (the orbit view, the
 * first thing seen: walls between the camera and the room fade out, "Top view" looks straight
 * down), flying through it, or walking in it. The ⚙ holds how a person moves and their walk
 * settings, the "?" says how to move, and the full-screen button shows the whole viewer full
 * screen. "Download picture" renders one clean frame at twice the screen's pixel ratio.
 *
 * On the owner's room page the furniture can be moved here too, by the phone's rules (core's
 * design reducer): drag a piece across the floor, turn it with the dot in front of it, or, walking
 * and flying, pick it up with the crosshair.
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
import {
  LuBox,
  LuCircleCheck,
  LuCircleHelp,
  LuDownload,
  LuImagePlus,
  LuLoaderCircle,
  LuMaximize,
  LuMinimize,
  LuSettings,
  LuSquare,
} from 'react-icons/lu';
import {
  WALK,
  buildRoomMeshes,
  itemFootprint,
  wallFacesCamera,
  type Footprint,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { modelUrl } from '@/lib/catalog';
import type { FurnitureEntry } from '@/lib/furniture';
import { useMovePrefs } from '@/lib/move-prefs';
import { saveBlob } from '@/lib/save-file';
import { cn } from '@/lib/utils';
import { MoveHelp } from './view3d/move-help';
import { MoveSettings } from './view3d/move-settings';
import { Navigator } from './view3d/navigator';
import {
  ORBIT_FOV,
  viewOf,
  type Editor3D,
  type Ghost,
  type Hud,
  type NavMode,
  type Room3DHandle,
} from './view3d/types';
import { WalkHud } from './view3d/walk-hud';

const COLORS = {
  background: '#f1f1f0',
  floor: '#d8c3a2',
  wall: '#f6f4f0',
  ceiling: '#f4f2ed',
  apron: '#e3e1dc',
  frame: '#b9ad9c',
  glass: '#a9cbe8',
  placeholder: '#c9c9cf',
  selected: '#0284c7',
  invalid: '#dc2626',
  valid: '#16a34a',
  aim: '#15171a',
};
/** Opacity of a wall that stands between the camera and the room. */
const FADED = 0.1;
const FOV = ORBIT_FOV;
/** Size used for items whose product is unknown. */
const UNKNOWN_SIZE = { w: 0.5, d: 0.5, h: 0.5 };

type View = 'corner' | 'top';
type CaptureType = 'image/png' | 'image/jpeg';
type Capture = (type: CaptureType) => Promise<{ blob: Blob; width: number; height: number } | null>;

export interface Room3DProps {
  room: Room;
  furniture: readonly FurnitureEntry[];
  /** Room name, for the picture's file name. */
  name: string;
  /** Furnishing (the owner's room page). A shared room is view only. */
  editor?: Editor3D | null;
  /** Full screen for the viewer around this view. */
  fullscreen?: { active: boolean; toggle: () => void } | null;
  /** What the page can ask of the view (take the mouse after a product was picked). */
  handle?: RefObject<Room3DHandle | null>;
  /** Which way the view moves now. */
  onModeChange?: (mode: NavMode) => void;
  /** Saves a picture of the view to the room's pictures (the owner's page). */
  onSavePicture?: (jpeg: Blob, width: number, height: number) => Promise<void>;
}

export default function Room3D({
  room,
  furniture,
  name,
  editor = null,
  fullscreen = null,
  handle,
  onModeChange,
  onSavePicture,
}: Room3DProps) {
  const meshes = useMemo(() => buildRoomMeshes(room), [room]);
  const [request, setRequest] = useState<{ view: View; n: number }>({ view: 'corner', n: 0 });
  const [mode, setMode] = useState<NavMode>('orbit');
  const [prefs, setPrefs] = useMovePrefs();
  const view = viewOf(mode, prefs.controls);
  const [hud, setHud] = useState<Hud | null>(null);
  const [aim, setAim] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [vanish, setVanish] = useState<{ id: string; t: number } | null>(null);
  const [pop, setPop] = useState<'settings' | 'help' | null>(null);
  const capture = useRef<Capture | null>(null);
  const ownHandle = useRef<Room3DHandle | null>(null);
  const pieces = useRef(new Map<string, THREE.Object3D>());
  const walls = useRef(new Set<THREE.Object3D>());
  const knob = useRef<THREE.Object3D | null>(null);
  // Labels attach to this element. (drei's default target changes once the canvas connects, and
  // under React 19 that leaves labels mounted with the scene empty.)
  const labelLayer = useRef<HTMLDivElement>(null);
  const register = useCallback((fn: Capture | null) => {
    capture.current = fn;
  }, []);
  const [saving, setSaving] = useState<null | 'download' | 'room'>(null);
  const [saveNote, setSaveNote] = useState<{ ok: boolean; text: string } | null>(null);
  const initial = useMemo(() => cameraPreset(meshes, 'corner', 4 / 3), [meshes]);
  const touch = useMemo(() => {
    try {
      return matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => onModeChange?.(mode), [mode, onModeChange]);
  useEffect(() => {
    if (!saveNote?.ok) return;
    const t = setTimeout(() => setSaveNote(null), 6000);
    return () => clearTimeout(t);
  }, [saveNote]);

  const chooseMode = (next: string) => {
    if (next !== 'orbit' && next !== 'fly' && next !== 'walk') return;
    setMode(next);
    // Space must jump, not press the button just clicked
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  async function download(type: CaptureType) {
    if (!capture.current) return;
    setSaving('download');
    setSaveNote(null);
    try {
      const shot = await capture.current(type);
      if (!shot) throw new Error('empty picture');
      saveBlob(shot.blob, pictureFileName(name, type));
      setSaveNote({
        ok: true,
        text: `Saved ${type === 'image/png' ? 'a PNG' : 'a JPEG'} picture to your downloads.`,
      });
    } catch {
      setSaveNote({
        ok: false,
        text: 'The picture could not be saved. Try again, or try a smaller window.',
      });
    } finally {
      setSaving(null);
    }
  }

  async function saveToRoom() {
    if (!capture.current || !onSavePicture) return;
    setSaving('room');
    setSaveNote(null);
    try {
      const shot = await capture.current('image/jpeg');
      if (!shot) throw new Error('empty picture');
      await onSavePicture(shot.blob, shot.width, shot.height);
      setSaveNote({ ok: true, text: 'Saved to this room’s pictures (below).' });
    } catch {
      setSaveNote({
        ok: false,
        text: 'The picture could not be saved to the room. Check your connection and try again.',
      });
    } finally {
      setSaving(null);
    }
  }

  const carryingId = editor?.state.gesture && view !== 'orbit' ? editor.state.gesture.id : null;
  const placingProduct = editor?.placing ?? null;
  const hint =
    view === 'orbit'
      ? mode === 'fly'
        ? 'Drag to turn, scroll to move the view, ⌘/Ctrl + scroll to zoom.'
        : 'Drag to turn, scroll or pinch to zoom, right-drag or two fingers to move. Walls facing you fade so you can see in.'
      : prefs.controls === 'keys' && !touch
        ? 'Click the room to start; Esc gives the mouse back. The ? lists the keys.'
        : mode === 'walk'
          ? 'Drag to look around, scroll or pinch to step, double-click or double-tap the floor to walk there.'
          : 'Drag to turn round the room.';

  return (
    <div className={cn('gap-2', fullscreen?.active ? 'flex min-h-0 flex-1 flex-col' : 'grid')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={mode}
            onValueChange={chooseMode}
            aria-label="How to move"
          >
            <ToggleGroupItem
              value="orbit"
              className="px-3"
              title="3D — round the room: drag to turn it, scroll to come closer"
            >
              3D
            </ToggleGroupItem>
            {prefs.controls === 'keys' || mode === 'fly' ? (
              <ToggleGroupItem
                value="fly"
                className="px-3"
                title="Fly — through the room with the keys, as in a game"
              >
                Fly
              </ToggleGroupItem>
            ) : null}
            <ToggleGroupItem
              value="walk"
              className="px-3"
              title="Walk — stand in the room: click, then the mouse looks and W A S D walk"
            >
              Walk
            </ToggleGroupItem>
          </ToggleGroup>
          {mode === 'orbit' ? (
            <>
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
                Corner view
              </Button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={saving !== null}>
                {saving ? (
                  <LuLoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <LuDownload aria-hidden />
                )}
                Picture
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => void download('image/png')}>
                <LuDownload aria-hidden />
                Download PNG (sharpest)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void download('image/jpeg')}>
                <LuDownload aria-hidden />
                Download JPEG (smaller file)
              </DropdownMenuItem>
              {onSavePicture ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void saveToRoom()}>
                    <LuImagePlus aria-hidden />
                    Save to this room’s pictures
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover open={pop === 'settings'} onOpenChange={(o) => setPop(o ? 'settings' : null)}>
            <PopoverTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Settings"
                title="Settings — moving around, the field of view, the mouse’s speed"
              >
                <LuSettings aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <MoveSettings prefs={prefs} onChange={setPrefs} flying={mode === 'fly'} />
            </PopoverContent>
          </Popover>
          <Popover open={pop === 'help'} onOpenChange={(o) => setPop(o ? 'help' : null)}>
            <PopoverTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="How to move round"
                title="How to move round"
              >
                <LuCircleHelp aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)]">
              <MoveHelp mode={mode} controls={prefs.controls} viewOnly={!editor} touch={touch} />
            </PopoverContent>
          </Popover>
          {fullscreen ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? 'Leave full screen' : 'Full screen'}
              aria-pressed={fullscreen.active}
              title={fullscreen.active ? 'Leave full screen' : 'Full screen'}
            >
              {fullscreen.active ? <LuMinimize aria-hidden /> : <LuMaximize aria-hidden />}
            </Button>
          ) : null}
        </div>
      </div>
      {/* isolate: labels inside the view never draw over the page's sticky header. */}
      <div
        ref={labelLayer}
        data-nav-mode={mode}
        className={cn(
          'relative isolate w-full overflow-hidden rounded-lg border bg-[#f1f1f0]',
          fullscreen?.active ? 'min-h-0 flex-1' : 'aspect-square max-h-[75vh] sm:aspect-[16/10]',
        )}
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
            <RoomModel meshes={meshes} solid={view === 'walk'} walls={walls} />
            {view !== 'orbit' ? <Ceiling room={room} offset={meshes.center} /> : null}
            {view === 'walk' ? <Apron meshes={meshes} /> : null}
            <group position={[-meshes.center[0], 0, -meshes.center[2]]}>
              {furniture.map((f) => (
                <Furniture
                  key={f.item.id}
                  entry={f}
                  labelLayer={labelLayer}
                  pieces={pieces}
                  lifted={f.item.id === carryingId}
                  vanish={vanish?.id === f.item.id ? vanish.t : null}
                />
              ))}
              {editor ? (
                <Marks
                  furniture={furniture}
                  editor={editor}
                  view={view}
                  carryingId={carryingId}
                  aim={hud?.cross ? aim : null}
                  knob={knob}
                />
              ) : null}
              {ghost && placingProduct ? (
                <GhostBox ghost={ghost} size={placingProduct.dimensions} />
              ) : null}
            </group>
            <OrbitControls
              makeDefault
              enabled={view === 'orbit'}
              enableDamping
              dampingFactor={0.12}
              maxPolarAngle={Math.PI * 0.48}
              minDistance={0.8}
              maxDistance={initial.distance * 3}
              mouseButtons={
                mode === 'fly'
                  ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
                  : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
              }
            />
            <CameraRig meshes={meshes} request={request} />
            <Navigator
              mode={mode}
              controls={prefs.controls}
              prefs={prefs}
              room={room}
              meshes={meshes}
              furniture={furniture}
              pieces={pieces}
              walls={walls}
              knob={knob}
              editor={editor}
              lightFrom={lightPosition(meshes)}
              handle={handle ?? ownHandle}
              onHud={setHud}
              onAim={setAim}
              onGhost={setGhost}
              onVanish={setVanish}
              onToggleHand={() => setPrefs({ hand: !prefs.hand })}
            />
            <CaptureBridge register={register} />
          </Canvas>
        </ErrorBoundary>
        {hud ? <WalkHud hud={hud} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {saveNote ? (
        <p
          role="status"
          className={cn(
            'flex items-center gap-1.5 text-sm',
            saveNote.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
          )}
        >
          {saveNote.ok ? <LuCircleCheck className="size-4 shrink-0" aria-hidden /> : null}
          {saveNote.text}
        </p>
      ) : null}
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

/** Fits the camera on the first frame and glides to "Top view" or "Corner view" when asked. */
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
    // Walking or flying, the person's own view is left alone (the room is fitted on the way back).
    if (!controls || !controls.enabled) return;
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
    if (!g || !controls.enabled) return;
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

/** Where the sun comes from (world), for the shadows and the hand. */
function lightPosition(meshes: RoomMeshes): [number, number, number] {
  const { min, max } = meshes.bounds;
  const extent = Math.max(max[0] - min[0], max[2] - min[2]) * 0.75 + 1;
  const height = Math.max(max[1], 1);
  return [-extent * 0.45, height + extent * 1.6, extent * 0.8];
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
        position={lightPosition(meshes)}
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

function RoomModel({
  meshes,
  solid,
  walls,
}: {
  meshes: RoomMeshes;
  solid: boolean;
  walls: RefObject<Set<THREE.Object3D>>;
}) {
  return (
    <group position={[-meshes.center[0], 0, -meshes.center[2]]}>
      <mesh receiveShadow>
        <Geometry key={meshKey(meshes.floor)} mesh={meshes.floor} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.85} />
      </mesh>
      {meshes.walls.map((wall) => (
        <Wall key={wall.id} wall={wall} offset={meshes.center} solid={solid} walls={walls} />
      ))}
    </group>
  );
}

/**
 * One wall, fading out while it stands between the camera and the room. Walking, nothing fades
 * out of the way (as in the closet designer): the walls stand as walls.
 */
function Wall({
  wall,
  offset,
  solid,
  walls,
}: {
  wall: WallMesh;
  offset: readonly number[];
  solid: boolean;
  walls: RefObject<Set<THREE.Object3D>>;
}) {
  const group = useRef<THREE.Group>(null);
  const panels = useRef<THREE.Mesh>(null);
  const panelMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const frameMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const glassMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const opacity = useRef<number | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [solid, invalidate]);
  // The wall stops the crosshair's reach (walking and flying).
  const registerPanels = useCallback(
    (m: THREE.Mesh | null) => {
      panels.current = m;
      if (!m) return;
      m.userData.wall = true;
      const set = walls.current;
      set.add(m);
      return () => {
        set.delete(m);
      };
    },
    [walls],
  );

  useFrame((state: RootState, delta) => {
    const cam = state.camera.position;
    // The scene is shifted by -offset, so add it back to get the camera in room coordinates.
    const camera = { x: cam.x + offset[0]!, y: cam.y, z: cam.z + offset[2]! };
    const target = !solid && wallFacesCamera(wall, camera, 0.05) ? FADED : 1;
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
    if (panels.current) {
      panels.current.castShadow = next > 0.6;
      panels.current.userData.faded = next < 0.6;
    }
  });

  return (
    <group ref={group}>
      <mesh ref={registerPanels} castShadow receiveShadow>
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

/**
 * Walking and flying, the room has a ceiling. It faces down, so it shows from inside the room and
 * is gone once the camera rises above it (the dollhouse view round the room has none).
 */
function Ceiling({ room, offset }: { room: Room; offset: readonly number[] }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(room.points.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ShapeGeometry(shape);
    // The shape's (x, y) become the floor's (x, z), and its face (+Z) turns to look down.
    g.rotateX(Math.PI / 2);
    return g;
  }, [room]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={[-offset[0]!, room.ceilingHeight, -offset[2]!]}
      receiveShadow
    >
      {/* Lit from below only by the room's bounce: a little light of its own keeps it pale. */}
      <meshStandardMaterial
        color={COLORS.ceiling}
        emissive={COLORS.ceiling}
        emissiveIntensity={0.45}
        roughness={1}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

/** Walking: floor round the room, to step out onto through a door. */
function Apron({ meshes }: { meshes: RoomMeshes }) {
  const { min, max } = meshes.bounds;
  const margin = 2 * (WALK.overhang + 0.1);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
      <planeGeometry args={[max[0] - min[0] + margin, max[2] - min[2] + margin]} />
      <meshStandardMaterial color={COLORS.apron} roughness={0.95} />
    </mesh>
  );
}

type LabelLayer = RefObject<HTMLDivElement | null>;

function Furniture({
  entry,
  labelLayer,
  pieces,
  lifted,
  vanish,
}: {
  entry: FurnitureEntry;
  labelLayer: LabelLayer;
  pieces: RefObject<Map<string, THREE.Object3D>>;
  /** Carried: held a little off the floor. */
  lifted: boolean;
  /** Taken away: shrinking about its middle as it lifts off (0 → 1). */
  vanish: number | null;
}) {
  const { item, product } = entry;
  const url = product ? modelUrl(product, item.variant) : null;
  const size = product?.dimensions ?? UNKNOWN_SIZE;
  const id = item.id;
  const register = useCallback(
    (g: THREE.Group | null) => {
      if (!g) return;
      g.userData.itemId = id;
      const map = pieces.current;
      map.set(id, g);
      return () => {
        if (map.get(id) === g) map.delete(id);
      };
    },
    [id, pieces],
  );
  const k = vanish === null ? 1 : Math.max(0.001, 1 - vanish);
  return (
    <group
      ref={register}
      position={[item.x, (item.y ?? 0) + (lifted ? 0.0254 : 0), item.z]}
      rotation={[0, THREE.MathUtils.degToRad(item.rotationY), 0]}
    >
      <group scale={k} position={[0, (size.h / 2) * (1 - k) + 0.127 * (vanish ?? 0), 0]}>
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

/** A footprint drawn on the floor: the selected piece, one that cannot stay, one carried. */
function FootprintMark({ footprint, color }: { footprint: Footprint; color: string }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(
      footprint.corners.map((c) => new THREE.Vector3(c.x, 0.008, c.z)),
    );
    return g;
  }, [footprint]);
  const fill = useMemo(() => {
    const shape = new THREE.Shape(footprint.corners.map((c) => new THREE.Vector2(c.x, c.z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.006, 0);
    return g;
  }, [footprint]);
  useEffect(
    () => () => {
      geometry.dispose();
      fill.dispose();
    },
    [geometry, fill],
  );
  return (
    <group userData={{ noCapture: true }}>
      <lineLoop geometry={geometry}>
        <lineBasicMaterial color={color} linewidth={2} depthTest={false} />
      </lineLoop>
      <mesh geometry={fill} renderOrder={2}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** The marks on the furniture: selection, pieces that cannot stay, what the crosshair is on, the turn dot. */
function Marks({
  furniture,
  editor,
  view,
  carryingId,
  aim,
  knob,
}: {
  furniture: readonly FurnitureEntry[];
  editor: Editor3D;
  view: NavMode;
  carryingId: string | null;
  aim: string | null;
  knob: RefObject<THREE.Object3D | null>;
}) {
  const { state, invalid } = editor;
  const g = state.gesture;
  const selected = furniture.find((f) => f.item.id === state.selectedId) ?? null;
  const aimed = aim ? (furniture.find((f) => f.item.id === aim) ?? null) : null;
  const showKnob = view === 'orbit' && selected && !(g && g.kind === 'drag');
  return (
    <>
      {furniture.map((f) => {
        const id = f.item.id;
        const moving = g?.id === id;
        const color = moving
          ? g!.preview.valid
            ? id === carryingId
              ? COLORS.valid
              : COLORS.selected
            : COLORS.invalid
          : invalid.has(id)
            ? COLORS.invalid
            : id === state.selectedId
              ? COLORS.selected
              : null;
        return color ? <FootprintMark key={id} footprint={f.footprint} color={color} /> : null;
      })}
      {aimed && aimed.product ? <AimBox entry={aimed} /> : null}
      {showKnob && selected ? <TurnKnob entry={selected} knob={knob} /> : null}
    </>
  );
}

/** What the crosshair is on: Minecraft's thin dark box round it. */
function AimBox({ entry }: { entry: FurnitureEntry }) {
  const { item, product } = entry;
  const size = product?.dimensions ?? UNKNOWN_SIZE;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  useEffect(() => () => edges.dispose(), [edges]);
  const pad = 0.009; // the closet's 0.35″
  return (
    <lineSegments
      geometry={edges}
      position={[item.x, (item.y ?? 0) + size.h / 2, item.z]}
      rotation={[0, THREE.MathUtils.degToRad(item.rotationY), 0]}
      scale={[size.w + pad * 2, size.h + pad * 2, size.d + pad * 2]}
      renderOrder={21}
      userData={{ noCapture: true }}
    >
      <lineBasicMaterial color={COLORS.aim} transparent opacity={0.6} />
    </lineSegments>
  );
}

/** The selected piece's turn dot, in front of it on the floor: drag it round to turn the piece. */
function TurnKnob({
  entry,
  knob,
}: {
  entry: FurnitureEntry;
  knob: RefObject<THREE.Object3D | null>;
}) {
  const { footprint: fp, front } = entry;
  const reach = fp.halfDepth + 0.3;
  const at = { x: fp.center.x + front.x * reach, z: fp.center.z + front.z * reach };
  const edge = { x: fp.center.x + front.x * fp.halfDepth, z: fp.center.z + front.z * fp.halfDepth };
  const line = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(edge.x, 0.012, edge.z),
        new THREE.Vector3(at.x, 0.012, at.z),
      ]),
    [edge.x, edge.z, at.x, at.z],
  );
  useEffect(() => () => line.dispose(), [line]);
  const register = useCallback(
    (g: THREE.Group | null) => {
      const ref = knob as { current: THREE.Object3D | null };
      ref.current = g;
      return () => {
        if (ref.current === g) ref.current = null;
      };
    },
    [knob],
  );
  return (
    <group userData={{ noCapture: true }}>
      <lineSegments geometry={line}>
        <lineBasicMaterial color={COLORS.selected} depthTest={false} />
      </lineSegments>
      <group ref={register} position={[at.x, 0.012, at.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh renderOrder={3}>
          <circleGeometry args={[0.11, 32]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} transparent opacity={0.95} />
        </mesh>
        <mesh renderOrder={4}>
          <ringGeometry args={[0.075, 0.11, 32]} />
          <meshBasicMaterial color={COLORS.selected} depthTest={false} transparent />
        </mesh>
        <mesh renderOrder={4}>
          <ringGeometry args={[0.03, 0.045, 24, 1, 0.4, Math.PI * 1.5]} />
          <meshBasicMaterial color={COLORS.selected} depthTest={false} transparent />
        </mesh>
      </group>
    </group>
  );
}

/** A product in hand, where it would go: green where it may, red where it may not. */
function GhostBox({ ghost, size }: { ghost: Ghost; size: { w: number; d: number; h: number } }) {
  const color = ghost.valid ? COLORS.valid : COLORS.invalid;
  const footprint = useMemo(
    () => itemFootprint({ x: ghost.x, z: ghost.z, rotationY: ghost.rotationY }, size),
    [ghost.x, ghost.z, ghost.rotationY, size],
  );
  return (
    <group userData={{ noCapture: true }}>
      <mesh
        position={[ghost.x, size.h / 2, ghost.z]}
        rotation={[0, THREE.MathUtils.degToRad(ghost.rotationY), 0]}
      >
        <boxGeometry args={[size.w, size.h, size.d]} />
        <meshStandardMaterial color={color} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <FootprintMark footprint={footprint} color={color} />
    </group>
  );
}

/**
 * Hands the parent a function that renders one clean frame (no marks, no hand) at twice the
 * screen's pixel ratio.
 */
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
      // The selection marks, the crosshair's box and a product in hand stay out of the picture.
      const hidden: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.userData.noCapture && o.visible) hidden.push(o);
      });
      try {
        for (const o of hidden) o.visible = false;
        gl.setPixelRatio(ratio);
        gl.render(scene, camera);
        const width = gl.domElement.width;
        const height = gl.domElement.height;
        // toBlob copies the frame right away, before the browser clears it.
        const blob = await new Promise<Blob | null>((resolve) =>
          gl.domElement.toBlob(resolve, type, type === 'image/jpeg' ? 0.92 : undefined),
        );
        return blob ? { blob, width, height } : null;
      } finally {
        for (const o of hidden) o.visible = true;
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
