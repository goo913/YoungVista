/**
 * The 3D view's hands and feet: every way of moving round the room and of handling its furniture.
 *
 *   orbit  YoungVista's 3D view, unchanged: OrbitControls turns, zooms and pans the camera. A
 *          press on a piece drags it across the floor (the phone's rules decide where it lands),
 *          a click selects it, the dot in front of the selected piece turns it.
 *   fly    Minecraft's spectator mode, as the closet designer flies: a click takes the mouse
 *          (Pointer Lock; Esc gives it back), the mouse looks, W A S D fly level where the head
 *          points, Space rises, Shift sinks, a double-tapped W sprints, the wheel sets the pace,
 *          through walls. With the mouse alone (⚙ → Moving around) it is round the room: a drag
 *          orbits, the wheel pans, ⌘/Ctrl + the wheel zooms.
 *   walk   standing in the room, as a game puts you in one: the mouse looks, W A S D and the
 *          arrows move, Shift hurries, Space jumps, C crouches; Quake's acceleration, friction,
 *          head bob and landing (core's walk.ts). Walls and furniture stop you; doors and
 *          openings are gaps. With the mouse alone (or a finger) a drag looks round, the wheel
 *          (or a pinch) steps, a double-click (double-tap) on the floor walks there.
 *
 * Walking or flying with the mouse taken, what the crosshair is on is outlined: a click picks a
 * piece up and carries it with the crosshair across the floor, and a second click puts it down
 * where the placement rules allow; X takes it away; E opens the furniture and the one picked is
 * placed with the next click; right-click puts back what is carried; [ ] turn the piece at the
 * crosshair; H shows or hides the hand.
 *
 * Ported from the team's closet designer (TAKEOFFPRIME, branch avena/closet-ux): the gestures,
 * keys and frame loop of `src/brands/avena/tools/measurement/components/Closet3DView.jsx`
 * (`WALK_KEYS`, `onPointerDown/Move/Up`, `onWheel`, `onKeyDown/Up`, `advance`, `advanceFly`,
 * `syncMode`, the crosshair's `findAim`, `pickUp`, `putDown`, `takeDown`, `secondary`). The
 * pure halves (the walking body, the flight) are core's `walk.ts` and `fly.ts`. Units are metres;
 * pieces are YoungVista's design items, moved by core's design reducer.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  FLY,
  WALK,
  advanceBody,
  advanceFlight,
  bodyBusy,
  eyeHeightOf,
  facingRotation,
  flightFromCamera,
  flyBox,
  flyWheel,
  headOffset,
  lookTarget,
  newBody,
  nextFlySpeed,
  orbitFromFlight,
  resolvePlacement,
  roomStartPose,
  roomWalkModel,
  settle,
  skinOf,
  steerTo,
  turnHead,
  walkBy,
  type Flight,
  type Room,
  type RoomMeshes,
  type Vec2,
  type WalkBody,
  type WalkModel,
} from '@youngvista/core';
import type { FurnitureEntry } from '@/lib/furniture';
import type { MoveControls, MovePrefs } from '@/lib/move-prefs';
import { createHand, type Hand } from './hand';
import {
  ORBIT_FOV,
  sameHud,
  viewOf,
  type Editor3D,
  type Ghost,
  type Hud,
  type HudAim,
  type NavMode,
  type Room3DHandle,
} from './types';

/** The keys a walk answers to (KeyboardEvent.code → what it does), as the closet's WALK_KEYS. */
const WALK_KEYS: Record<string, string> = {
  KeyW: 'fwd',
  ArrowUp: 'fwd',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowLeft: 'turnL',
  ArrowRight: 'turnR',
  Space: 'jump',
  KeyC: 'crouch',
};
/** The keys that act on what the crosshair is on. */
const ACT_KEYS = new Set(['KeyE', 'KeyX', 'KeyH', 'BracketLeft', 'BracketRight']);
/** The middle of the view, where the crosshair is. */
const CENTER = new THREE.Vector2(0, 0);
/** A press that moves less than this (px) is a click. */
const CLICK_SLOP = 4;
/** Two taps this close in time (ms) and space (px) are a double tap. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 40;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

interface NavigatorProps {
  mode: NavMode;
  controls: MoveControls;
  prefs: MovePrefs;
  room: Room;
  meshes: RoomMeshes;
  furniture: readonly FurnitureEntry[];
  /** Each piece's group in the scene, by item id (for the crosshair and the pointer). */
  pieces: RefObject<Map<string, THREE.Object3D>>;
  /** The walls' meshes, which stop a reach. */
  walls: RefObject<Set<THREE.Object3D>>;
  /** The selected piece's turn dot (orbit), when shown. */
  knob: RefObject<THREE.Object3D | null>;
  editor: Editor3D | null;
  /** Where the room's light comes from (world), for the hand. */
  lightFrom: readonly [number, number, number];
  handle: RefObject<Room3DHandle | null>;
  onHud: (hud: Hud | null) => void;
  onAim: (itemId: string | null) => void;
  onGhost: (ghost: Ghost | null) => void;
  /** The piece taken away with X, shrinking as it goes (0 → 1), or null. */
  onVanish: (vanish: { id: string; t: number } | null) => void;
  onToggleHand: () => void;
}

type Press =
  | { kind: 'piece'; id: string; x0: number; y0: number; grab: Vec2; dragging: boolean }
  | { kind: 'turn'; id: string; center: Vec2 };

interface NavState {
  view: NavMode;
  keys: Set<string>;
  run: boolean;
  jump: boolean;
  sprint: boolean;
  lastW: number;
  wheelAcc: number;
  flySpeed: number;
  speedUntil: number;
  speedTimer: ReturnType<typeof setTimeout> | null;
  locked: boolean;
  unlockedAt: number;
  body: WalkBody | null;
  bodyKey: string;
  flight: Flight | null;
  model: WalkModel | null;
  orbitSaved: { position: THREE.Vector3; target: THREE.Vector3 } | null;
  walkTo: Vec2 | null;
  lookYaw: number;
  lookPitch: number;
  drag: { x: number; y: number; x0: number; y0: number; moved: boolean } | null;
  press: Press | null;
  background: { x: number; y: number } | null;
  pointers: Map<number, { x: number; y: number }>;
  pinch: number | null;
  lastTap: { t: number; x: number; y: number } | null;
  aim: string | null;
  carry: { id: string; on: boolean; at: Vec2 | null } | null;
  ghost: Ghost | null;
  vanish: { id: string; t: number; carried: boolean } | null;
  hud: Hud | null;
  continuing: boolean;
  lastT: number;
}

const newNavState = (): NavState => ({
  view: 'orbit',
  keys: new Set(),
  run: false,
  jump: false,
  sprint: false,
  lastW: 0,
  wheelAcc: 0,
  flySpeed: 1,
  speedUntil: 0,
  speedTimer: null,
  locked: false,
  unlockedAt: 0,
  body: null,
  bodyKey: '',
  flight: null,
  model: null,
  orbitSaved: null,
  walkTo: null,
  lookYaw: 0,
  lookPitch: 0,
  drag: null,
  press: null,
  background: null,
  pointers: new Map(),
  pinch: null,
  lastTap: null,
  aim: null,
  carry: null,
  ghost: null,
  vanish: null,
  hud: null,
  continuing: false,
  lastT: 0,
});

/** The pieces a person bumps into: everything standing on the floor that is not a rug. */
function obstacles(furniture: readonly FurnitureEntry[], skip: string | null): Vec2[][] {
  return furniture
    .filter((f) => f.item.id !== skip && !f.flat && !(f.item.y && f.item.y > 0))
    .map((f) => f.footprint.corners);
}

export function Navigator(props: NavigatorProps) {
  const invalidate = useThree((s) => s.invalidate);
  // The element R3F listens on (re-wires the gestures once the canvas is connected); the camera
  // and the renderer are read from `get()` where they are moved, as in a frame.
  const connected = useThree((s) => s.events.connected) as HTMLElement | null;
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const nav = useRef<NavState>(newNavState());
  // Functions the effects call, set by the main effect below (wired once).
  const applyRef = useRef<(() => void) | null>(null);
  const pushHudRef = useRef<(() => void) | null>(null);
  const cancelCarryRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<((dt: number) => boolean) | null>(null);
  const [hand] = useState(createHand);
  useEffect(() => () => hand.dispose(), [hand]);

  const { room, furniture, meshes, prefs, mode, controls } = props;
  const carryId = props.editor?.state.gesture?.id ?? null;
  const model = useMemo(
    () => roomWalkModel(room, obstacles(furniture, carryId)),
    [room, furniture, carryId],
  );
  const roomKey = useMemo(() => JSON.stringify(room.points), [room]);

  // The hand: the person's skin tone and whether it shows; the view's shape.
  useEffect(() => {
    hand.setSkin(skinOf(prefs.skin));
    hand.setVisible(prefs.hand);
    invalidate();
  }, [hand, prefs.skin, prefs.hand, invalidate]);
  useEffect(() => hand.setAspect(width / Math.max(1, height)), [hand, width, height]);

  // The walk model: the room's walls and the furniture standing in it. A piece put where someone
  // stands moves them aside; walls moved on another device start the walk again in the new room.
  useEffect(() => {
    const s = nav.current;
    s.model = model;
    if (!s.body) return;
    if (s.bodyKey === roomKey) {
      s.body = { ...s.body, ...settle(s.body, model, WALK.radius) };
    } else if (s.view === 'walk') {
      const P = latest.current;
      s.body = newBody(roomStartPose(P.room, model, { fovDeg: P.prefs.fov }));
      s.bodyKey = roomKey;
    }
    if (s.view === 'walk') {
      applyRef.current?.();
      invalidate();
    }
  }, [model, roomKey, invalidate]);

  // ── the camera for each way of moving, and the change from one to the next ───────────────
  useEffect(() => {
    const s = nav.current;
    const { gl } = get();
    const camera = get().camera as THREE.PerspectiveCamera;
    const ox = meshes.center[0];
    const oz = meshes.center[2];
    const controlsOf = () => get().controls as OrbitControlsImpl | null;
    const setFov = (fov: number) => {
      if (camera.fov === fov) return;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
    const from = s.view;
    const to = viewOf(mode, controls);
    s.view = to;
    if (from === to) return;
    const P = latest.current;
    const c = controlsOf();
    const camRoom = { x: camera.position.x + ox, y: camera.position.y, z: camera.position.z + oz };
    if (from === 'orbit' && c) {
      s.orbitSaved = { position: camera.position.clone(), target: c.target.clone() };
    }
    if (to === 'fly') {
      const w = s.body;
      if (from === 'walk' && w) {
        s.flight = {
          x: w.x,
          y: eyeHeightOf(w, P.prefs.heightCm),
          z: w.z,
          yaw: w.yaw,
          pitch: w.pitch,
          vx: 0,
          vy: 0,
          vz: 0,
        };
      } else if (c) {
        const t = c.target;
        s.flight = flightFromCamera(camRoom, { x: t.x + ox, y: t.y, z: t.z + oz });
      }
      s.sprint = false;
    }
    if (to === 'walk') {
      const f = s.flight;
      if (from === 'fly' && f && s.model) {
        const p = settle(f, s.model, WALK.radius);
        // in the room, and not pushed far: the walker stands under the flight
        if (Math.hypot(p.x - f.x, p.z - f.z) < 18 * 0.0254 && s.body) {
          s.body = {
            ...newBody({
              x: p.x,
              z: p.z,
              yaw: f.yaw,
              pitch: Math.max(-1.2, Math.min(1.2, f.pitch)),
            }),
          };
        }
      }
      if (!s.body || s.bodyKey !== roomKey) {
        const aspect = width / Math.max(1, height);
        s.body = newBody(
          roomStartPose(room, s.model ?? roomWalkModel(room), { fovDeg: P.prefs.fov, aspect }),
        );
        s.bodyKey = roomKey;
      }
    }
    if (to === 'orbit') {
      setFov(ORBIT_FOV);
      if (c) {
        if (from === 'fly' && s.flight) {
          const { bounds } = meshes;
          const radius =
            Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2 || 3;
          const mid = { x: ox, y: Math.max(bounds.max[1], 0.5) * 0.3, z: oz };
          const o = orbitFromFlight(s.flight, mid, radius);
          camera.position.set(o.position.x - ox, o.position.y, o.position.z - oz);
          c.target.set(o.target.x - ox, o.target.y, o.target.z - oz);
        } else if (s.orbitSaved) {
          camera.position.copy(s.orbitSaved.position);
          c.target.copy(s.orbitSaved.target);
        }
        c.update();
      }
    }
    // whatever was carried goes back; the keys start afresh
    cancelCarryRef.current?.();
    s.keys.clear();
    s.walkTo = null;
    s.press = null;
    s.drag = null;
    if (to === 'orbit' && document.pointerLockElement === gl.domElement) document.exitPointerLock();
    applyRef.current?.();
    pushHudRef.current?.();
    invalidate();
  }, [mode, controls, get, invalidate, meshes, room, roomKey, width, height]);

  // The mouse goes back when the keys' way does (the mouse alone).
  useEffect(() => {
    if (controls !== 'keys' && document.pointerLockElement === get().gl.domElement) {
      document.exitPointerLock();
    }
  }, [controls, get]);

  // The person's field of view, height and bobbing: the camera follows at once.
  useEffect(() => {
    applyRef.current?.();
    invalidate();
  }, [prefs.fov, prefs.heightCm, prefs.bob, invalidate]);

  // ── the gestures, keys and frame: wired once, reading the newest props ───────────────────
  useEffect(() => {
    const canvas = get().gl.domElement;
    const camera = get().camera as THREE.PerspectiveCamera;
    const el = (get().events.connected as HTMLElement | null | undefined) ?? canvas;
    const s = nav.current;
    const P = () => latest.current;
    const offset = () => ({ x: P().meshes.center[0], z: P().meshes.center[2] });
    const controlsOf = () => get().controls as OrbitControlsImpl | null;
    const firstPerson = () => s.view === 'walk' || s.view === 'fly';
    /** With the keys: a click hands the view the mouse, which then looks. */
    const gameWay = () => firstPerson() && P().controls === 'keys';
    const editing = () => !!P().editor;
    const raycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let hoverAt = 0;

    const setFov = (fov: number) => {
      if (camera.fov === fov) return;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
    /** The camera where the walker's eyes or the flight are. */
    const applyCamera = () => {
      const o = offset();
      const pf = P().prefs;
      if (s.view === 'walk' && s.body) {
        // standing: at eye height (crouched, in a jump, bobbing with the step), looking where the
        // head is turned
        const w = s.body;
        const off = headOffset(w, WALK, pf.bob);
        setFov(pf.fov);
        const fx = Math.sin(w.yaw);
        const fz = Math.cos(w.yaw);
        const x = w.x - fz * off.side;
        const z = w.z + fx * off.side;
        const y = eyeHeightOf(w, pf.heightCm) + off.up;
        const cp = Math.cos(w.pitch);
        camera.position.set(x - o.x, y, z - o.z);
        camera.lookAt(x + fx * cp - o.x, y + Math.sin(w.pitch), z + fz * cp - o.z);
        if (off.roll) camera.rotateZ(off.roll);
        return;
      }
      if (s.view === 'fly' && s.flight) {
        const f = s.flight;
        setFov(pf.fov);
        const t = lookTarget(f);
        camera.position.set(f.x - o.x, f.y, f.z - o.z);
        camera.lookAt(t.x - o.x, t.y, t.z - o.z);
      }
    };
    applyRef.current = applyCamera;

    const lockable = typeof canvas.requestPointerLock === 'function';
    /** A click hands the view the mouse (Pointer Lock); Esc, the browser's own, gives it back. */
    const lock = () => {
      if (!lockable || !gameWay()) return false;
      if (document.pointerLockElement === canvas) return true;
      s.drag = null;
      (document.activeElement as HTMLElement | null)?.blur?.(); // Space must not press the last button
      try {
        // refused when asked again too soon after Esc; the next click asks again
        void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
      } catch {
        // the same refusal, from an older browser
      }
      return true;
    };
    const unlock = () => {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
    const handle: Room3DHandle = { lock };
    if (P().handle) (P().handle as { current: Room3DHandle | null }).current = handle;

    // ── where things are ──
    const ndcOf = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    };
    /** Where a ray from the camera meets the floor, in room metres; null looking up. */
    const floorAlong = (ndc: THREE.Vector2): Vec2 | null => {
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
      const o = offset();
      return { x: hit.x + o.x, z: hit.z + o.z };
    };
    const pieceOf = (obj: THREE.Object3D | null): string | null => {
      let o: THREE.Object3D | null = obj;
      while (o) {
        if (typeof o.userData.itemId === 'string') return o.userData.itemId as string;
        o = o.parent;
      }
      return null;
    };
    /**
     * The piece a ray meets first within `far` metres: walls in the way stop it (walking and
     * flying; a wall faded out of the way does not), and the pieces in `skip` are not there.
     */
    const pieceAlong = (ndc: THREE.Vector2, far: number, blockers: boolean, skip: string[]) => {
      raycaster.setFromCamera(ndc, camera);
      raycaster.far = far;
      const targets: THREE.Object3D[] = [];
      for (const [id, g] of P().pieces.current ?? []) if (!skip.includes(id)) targets.push(g);
      if (blockers) for (const w of P().walls.current ?? []) targets.push(w);
      const hits = raycaster.intersectObjects(targets, true);
      raycaster.far = Infinity;
      for (const h of hits) {
        if (!h.object.visible || !(h.object as THREE.Mesh).isMesh) continue;
        if (h.object.userData.wall) {
          if (h.object.userData.faded) continue;
          return null;
        }
        const id = pieceOf(h.object);
        if (id) return id;
      }
      return null;
    };
    const knobAt = (e: { clientX: number; clientY: number }) => {
      const k = P().knob.current;
      if (!k || !k.visible) return false;
      raycaster.setFromCamera(ndcOf(e), camera);
      return raycaster.intersectObject(k, true).length > 0;
    };

    // ── the crosshair: what it is on, a piece carried, a product in hand ──
    const nameOf = (id: string) => P().editor?.nameOf(id) ?? 'Piece';
    const pushHud = () => {
      const E = P().editor;
      let next: Hud | null = null;
      if (firstPerson() && s.locked) {
        let aim: HudAim | null = null;
        if (E) {
          const g = E.state.gesture;
          if (s.carry) {
            aim = {
              kind: 'carry',
              name: nameOf(s.carry.id),
              on: s.carry.on,
              ok: !!g && g.id === s.carry.id && g.preview.valid,
            };
          } else if (E.placing) {
            aim = {
              kind: 'place',
              name: E.placing.name,
              on: !!s.ghost,
              ok: !!s.ghost?.valid,
            };
          } else if (s.aim) {
            aim = { kind: 'piece', name: nameOf(s.aim) };
          }
        }
        next = { cross: true, aim, speed: null };
      }
      // the wheel just changed the flying pace: say it, briefly
      if (s.view === 'fly' && performance.now() < s.speedUntil) {
        next = { ...(next ?? { cross: false, aim: null }), speed: s.flySpeed };
      }
      if (sameHud(next, s.hud)) return;
      s.hud = next;
      P().onHud(next);
    };
    pushHudRef.current = pushHud;
    const setAim = (id: string | null) => {
      if (s.aim === id) return;
      s.aim = id;
      P().onAim(id);
      pushHud();
    };
    const setGhost = (g: Ghost | null) => {
      const a = s.ghost;
      const same =
        a === g ||
        (!!a &&
          !!g &&
          a.productId === g.productId &&
          Math.abs(a.x - g.x) < 1e-4 &&
          Math.abs(a.z - g.z) < 1e-4 &&
          a.rotationY === g.rotationY &&
          a.valid === g.valid);
      if (same) return;
      s.ghost = g;
      P().onGhost(g);
    };

    /** Picks up the piece aimed at: it leaves the floor and follows the crosshair until put down. */
    const pickUp = (id: string) => {
      const E = P().editor;
      if (!E) return;
      E.dispatch({ type: 'drag-start', id });
      s.carry = { id, on: true, at: null };
      setAim(null);
      hand.play('grab');
      hand.setCarry(true);
      carryFrame();
      pushHud();
    };
    /** Each frame of a carry: the piece goes where the crosshair meets the floor, by the rules. */
    const carryFrame = () => {
      const c = s.carry;
      const E = P().editor;
      if (!c || !E) return;
      const at = floorAlong(CENTER);
      c.on = !!at;
      if (at && (!c.at || Math.hypot(at.x - c.at.x, at.z - c.at.z) > 0.002)) {
        c.at = at;
        E.dispatch({ type: 'drag-move', x: at.x, z: at.z });
      }
      pushHud();
    };
    const cancelCarry = () => {
      const c = s.carry;
      if (!c) return;
      s.carry = null;
      P().editor?.dispatch({ type: 'gesture-cancel' });
      hand.setCarry(false);
      pushHud();
      invalidate();
    };
    cancelCarryRef.current = cancelCarry;
    /** The second click: put it down there, if the rules allow it. */
    const putDown = () => {
      const c = s.carry;
      const E = P().editor;
      if (!c || !E) return;
      const g = E.state.gesture;
      // looking up, or no room there: the crosshair says so, and the piece stays in hand
      if (!c.on || !g || g.id !== c.id || !g.preview.valid) return;
      s.carry = null;
      hand.play('release');
      hand.setCarry(false);
      E.dispatch({ type: 'gesture-end' });
      pushHud();
    };
    /** Each frame with a product in hand: where it would go. */
    const placeFrame = () => {
      const E = P().editor;
      const product = E?.placing;
      if (!E || !product) {
        setGhost(null);
        return;
      }
      const at = floorAlong(CENTER);
      if (!at) {
        setGhost(null);
        pushHud();
        return;
      }
      const o = offset();
      // turned to face the person placing it
      const rotationY = facingRotation({
        x: camera.position.x + o.x - at.x,
        z: camera.position.z + o.z - at.z,
      });
      const r = resolvePlacement(
        { productId: product.id, x: at.x, z: at.z, rotationY },
        { room: E.ctx.room, items: E.state.items, product: E.ctx.product },
      );
      setGhost({ productId: product.id, x: r.x, z: r.z, rotationY: r.rotationY, valid: r.valid });
      pushHud();
    };
    /** A product from the furniture (E), placed where the crosshair is. */
    const placeHere = () => {
      const E = P().editor;
      const product = E?.placing;
      const g = s.ghost;
      if (!E || !product || !g) return;
      hand.play('release');
      E.dispatch({
        type: 'add',
        productId: product.id,
        at: { x: g.x, z: g.z, rotationY: g.rotationY },
      });
      E.setPlacing(null);
      setGhost(null);
      pushHud();
    };
    /** X: the piece aimed at (or carried) lifts off and is gone. */
    const takeDown = () => {
      const E = P().editor;
      if (!E || s.vanish) return false;
      const c = s.carry;
      const id = c?.id ?? s.aim;
      if (!id) return false;
      s.carry = null;
      hand.setCarry(false);
      setAim(null);
      hand.play('yank');
      s.vanish = { id, t: 0, carried: !!c };
      P().onVanish({ id, t: 0 });
      pushHud();
      invalidate();
      return true;
    };
    const vanishFrame = (dt: number) => {
      const v = s.vanish;
      if (!v) return false;
      v.t += dt;
      const u = Math.min(1, v.t / 0.34);
      P().onVanish({ id: v.id, t: easeInOut(u) });
      if (u >= 1) {
        s.vanish = null;
        const E = P().editor;
        if (v.carried) E?.dispatch({ type: 'gesture-cancel' });
        E?.dispatch({ type: 'remove', id: v.id });
        P().onVanish(null);
      }
      return true;
    };
    /** A click with the mouse taken: use what the crosshair is on (the closet's `useAim`). */
    const act = () => {
      if (s.vanish || !editing()) return;
      if (s.carry) return putDown();
      if (P().editor?.placing) return placeHere();
      if (s.aim) return pickUp(s.aim);
      hand.play('press');
    };
    /** The right button with the mouse taken: put back what is carried, put away the product in hand, or the piece's panel. */
    const secondary = () => {
      const E = P().editor;
      if (!E) return;
      if (s.carry) {
        hand.play('release');
        cancelCarry();
        return;
      }
      if (E.placing) {
        E.setPlacing(null);
        setGhost(null);
        pushHud();
        return;
      }
      if (s.aim) {
        // the mouse is given back for the piece's panel (turn, copy, colour, remove)
        const id = s.aim;
        unlock();
        E.dispatch({ type: 'select', id });
      }
    };
    /** Each frame the mouse is taken: what the crosshair is on, or where a piece in hand would go. */
    const aimFrame = () => {
      if (s.carry) return carryFrame();
      if (P().editor?.placing) return placeFrame();
      setGhost(null);
      if (!s.locked || s.vanish || !editing()) return setAim(null);
      const far = s.view === 'fly' ? FLY.reach : WALK.reach;
      setAim(pieceAlong(CENTER, far, true, []));
    };

    const onLockChange = () => {
      const on = document.pointerLockElement === canvas;
      if (on === s.locked) return;
      s.locked = on;
      s.drag = null;
      if (!on) {
        s.unlockedAt = performance.now();
        s.keys.clear();
        s.jump = false;
        cancelCarry();
        setAim(null);
        setGhost(null);
      }
      pushHud();
      invalidate();
    };
    document.addEventListener('pointerlockchange', onLockChange);

    // ── the closet's pan, for Fly with the mouse alone (the wheel moves the view) ──
    const panBy = (dxPx: number, dyPx: number) => {
      const c = controlsOf();
      if (!c) return;
      const dist = camera.position.distanceTo(c.target);
      const hPx = canvas.clientHeight || 1;
      const k = (2 * dist * Math.tan(((camera.fov / 2) * Math.PI) / 180)) / hPx;
      const m = camera.matrix.elements;
      const right = new THREE.Vector3(m[0], m[1], m[2]);
      const up = new THREE.Vector3(m[4], m[5], m[6]);
      const move = right.multiplyScalar(-dxPx * k).add(up.multiplyScalar(dyPx * k));
      camera.position.add(move);
      c.target.add(move);
      c.update();
      invalidate();
    };

    const turnBy = (dYaw: number, dPitch: number) => {
      if (s.view === 'fly' && s.flight) s.flight = turnHead(s.flight, dYaw, dPitch);
      else if (s.view === 'walk' && s.body) {
        const pitch = s.body.pitch;
        s.body = turnHead(s.body, dYaw, dPitch);
        s.lookPitch += s.body.pitch - pitch;
      } else return;
      s.lookYaw += dYaw;
      applyCamera();
      invalidate();
    };

    // ── gestures (in the capture phase, before OrbitControls sees them) ──
    const onPointerDown = (e: PointerEvent) => {
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const E = P().editor;
      if (firstPerson()) {
        e.stopPropagation();
        if (gameWay() && s.locked) {
          // the mouse is the head: a click uses what the crosshair is on, the right button puts back
          e.preventDefault();
          if (e.button === 0) act();
          else if (e.button === 2) secondary();
          return;
        }
        if (s.pointers.size === 2 && s.view === 'walk') {
          // two fingers: a pinch steps ahead or back
          const [a, b] = [...s.pointers.values()];
          s.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          s.drag = null;
          s.press = null;
          return;
        }
        // walking with the mouse alone the room is mostly furniture, so a drag looks around (over
        // a piece too) and a click selects; the selected piece is the one a drag moves
        if (s.view === 'walk' && e.button === 0 && E && !gameWay()) {
          const id = pieceAlong(ndcOf(e), Infinity, true, []);
          if (id && id === E.state.selectedId) {
            const at = floorAlong(ndcOf(e));
            const item = E.state.items.find((it) => it.id === id);
            if (at && item) {
              s.press = {
                kind: 'piece',
                id,
                x0: e.clientX,
                y0: e.clientY,
                grab: { x: item.x - at.x, z: item.z - at.z },
                dragging: false,
              };
              el.setPointerCapture?.(e.pointerId);
              return;
            }
          }
        }
        if (e.button !== 0 && e.button !== 1) return;
        s.walkTo = null;
        s.drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
        el.setPointerCapture?.(e.pointerId);
        return;
      }
      // round the room: a piece or the turn dot under the pointer is taken hold of; the rest is
      // OrbitControls' (turn, zoom, pan)
      if (e.button !== 0 || !E || s.pointers.size > 1) {
        s.background = null;
        return;
      }
      if (knobAt(e) && E.state.selectedId) {
        const item = E.state.items.find((it) => it.id === E.state.selectedId);
        if (item) {
          e.stopPropagation();
          s.press = { kind: 'turn', id: item.id, center: { x: item.x, z: item.z } };
          E.dispatch({ type: 'rotate-start', id: item.id });
          el.setPointerCapture?.(e.pointerId);
          return;
        }
      }
      const id = pieceAlong(ndcOf(e), Infinity, false, []);
      if (id) {
        const at = floorAlong(ndcOf(e));
        const item = E.state.items.find((it) => it.id === id);
        if (at && item) {
          e.stopPropagation();
          s.press = {
            kind: 'piece',
            id,
            x0: e.clientX,
            y0: e.clientY,
            // keep the piece where the pointer holds it, not centred under it
            grab: { x: item.x - at.x, z: item.z - at.z },
            dragging: false,
          };
          el.setPointerCapture?.(e.pointerId);
          return;
        }
      }
      s.background = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gameWay() && s.locked) {
        // the head follows the mouse: right turns right, up looks up (a runaway first event after
        // the lock is clipped)
        const k = WALK.lookPerPx * P().prefs.look;
        const mx = Math.max(-300, Math.min(300, e.movementX || 0));
        const my = Math.max(-300, Math.min(300, e.movementY || 0));
        if (mx || my) turnBy(-mx * k, -my * k);
        e.stopPropagation();
        return;
      }
      if (s.pinch !== null && s.pointers.size >= 2 && s.body) {
        const [a, b] = [...s.pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const step = (d - s.pinch) * WALK.wheelPerPx;
        s.pinch = d;
        if (s.model && step) {
          s.body = walkBy(s.body, step, 0, s.model);
          applyCamera();
          invalidate();
        }
        e.stopPropagation();
        return;
      }
      const E = P().editor;
      const p = s.press;
      if (p && E) {
        e.stopPropagation();
        if (p.kind === 'turn') {
          const at = floorAlong(ndcOf(e));
          if (!at) return;
          const dir = { x: at.x - p.center.x, z: at.z - p.center.z };
          if (Math.hypot(dir.x, dir.z) > 1e-3) {
            E.dispatch({ type: 'rotate-move', rotationY: facingRotation(dir) });
          }
          return;
        }
        if (!p.dragging) {
          if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < CLICK_SLOP) return;
          p.dragging = true;
          E.dispatch({ type: 'drag-start', id: p.id });
        }
        const at = floorAlong(ndcOf(e));
        if (at) E.dispatch({ type: 'drag-move', x: at.x + p.grab.x, z: at.z + p.grab.z });
        return;
      }
      const d = s.drag;
      if (d && firstPerson()) {
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        // a click's jitter is not a look
        if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 3) d.moved = true;
        if (!d.moved) return;
        // drag the room: it follows the pointer, the head turns the other way
        const k = WALK.dragLookPerPx;
        turnBy(dx * k, dy * k);
        e.stopPropagation();
        return;
      }
      // round the room: a piece under the pointer can be taken hold of (checked now and then)
      if (!firstPerson() && E && e.pointerType === 'mouse' && e.buttons === 0) {
        const now = performance.now();
        if (now - hoverAt < 60) return;
        hoverAt = now;
        const over = knobAt(e) || !!pieceAlong(ndcOf(e), Infinity, false, []);
        el.style.cursor = over ? 'grab' : '';
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      s.pointers.delete(e.pointerId);
      if (s.pinch !== null) {
        if (s.pointers.size < 2) s.pinch = null;
        return;
      }
      if (gameWay() && s.locked) return; // the press did it
      const E = P().editor;
      const p = s.press;
      if (p) {
        s.press = null;
        e.stopPropagation();
        if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
        if (!E) return;
        if (p.kind === 'turn') E.dispatch({ type: 'gesture-end' });
        else if (p.dragging) E.dispatch({ type: 'gesture-end' });
        else E.dispatch({ type: 'select', id: p.id });
        return;
      }
      const d = s.drag;
      s.drag = null;
      if (d && firstPerson()) {
        if (d.moved) return;
        // a click, not a drag: the view takes the mouse, or (where it cannot, or with the mouse
        // alone) the click selects, and a double tap on the floor walks there
        if (lock()) return;
        const id = E ? pieceAlong(ndcOf(e), Infinity, true, []) : null;
        if (E) E.dispatch({ type: 'select', id });
        if (e.pointerType !== 'mouse' && s.view === 'walk') {
          const now = performance.now();
          const t = s.lastTap;
          if (
            t &&
            now - t.t < DOUBLE_TAP_MS &&
            Math.hypot(e.clientX - t.x, e.clientY - t.y) < DOUBLE_TAP_PX
          ) {
            s.lastTap = null;
            const at = floorAlong(ndcOf(e));
            if (at) {
              s.walkTo = at;
              invalidate();
            }
          } else s.lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
        return;
      }
      // round the room: a click on nothing lets go of the piece
      const b = s.background;
      s.background = null;
      if (b && E && Math.hypot(e.clientX - b.x, e.clientY - b.y) < CLICK_SLOP && !firstPerson()) {
        E.dispatch({ type: 'select', id: null });
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      s.pointers.delete(e.pointerId);
      s.pinch = null;
      const p = s.press;
      s.press = null;
      s.drag = null;
      if (p && (p.kind === 'turn' || p.dragging)) P().editor?.dispatch({ type: 'gesture-cancel' });
    };

    const onWheel = (e: WheelEvent) => {
      if (s.view === 'fly') {
        // Minecraft's spectator wheel: the flying pace, a step a notch
        e.preventDefault();
        e.stopPropagation();
        const w = flyWheel(s.wheelAcc, e.deltaY);
        s.wheelAcc = w.travel;
        if (!w.step) return;
        s.flySpeed = nextFlySpeed(s.flySpeed, w.step);
        s.speedUntil = performance.now() + 1300;
        pushHud();
        if (s.speedTimer) clearTimeout(s.speedTimer);
        s.speedTimer = setTimeout(pushHud, 1350);
        return;
      }
      if (s.view === 'walk') {
        e.preventDefault();
        e.stopPropagation();
        if (s.locked) return; // the keys walk
        // walking, the wheel steps: forward and back, sideways with a sideways scroll
        s.walkTo = null;
        if (!s.body || !s.model) return;
        s.body = walkBy(s.body, -e.deltaY * WALK.wheelPerPx, e.deltaX * WALK.wheelPerPx, s.model);
        applyCamera();
        invalidate();
        return;
      }
      // Fly with the mouse alone is round the room the closet's way: the wheel pans, ⌘/Ctrl +
      // the wheel (and a trackpad's pinch) zooms. Round the room (3D) the wheel zooms, as before.
      if (P().mode === 'fly' && !(e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        let dx = e.deltaX;
        let dy = e.deltaY;
        if (e.shiftKey && dx === 0) {
          dx = dy;
          dy = 0;
        }
        panBy(dx, dy);
      }
    };

    const onContext = (e: MouseEvent) => {
      if (firstPerson()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // walking: a double-click on the floor walks there
    const onDblClick = (e: MouseEvent) => {
      if (s.view !== 'walk' || s.locked) return;
      const at = floorAlong(ndcOf(e));
      if (at) {
        s.walkTo = at;
        invalidate();
      }
    };

    // ── keys: held down, they move the walk or the flight every frame ──
    const walkKeyFor = (e: KeyboardEvent): string | null => {
      if (!firstPerson()) return null;
      if (e.metaKey || e.ctrlKey || e.altKey) return null;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) {
        return null;
      }
      // a menu, a pop-over or a dialog owns the keyboard
      if (document.querySelector('[role="dialog"], [role="menu"], [role="alertdialog"]')) {
        return null;
      }
      if (WALK_KEYS[e.code]) return WALK_KEYS[e.code]!;
      return ACT_KEYS.has(e.code) || e.key === 'Delete' || e.key === 'Backspace' ? 'act' : null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      s.run = e.shiftKey;
      const wk = walkKeyFor(e);
      if (wk === 'act') {
        const E = P().editor;
        // E: the furniture (the one picked is placed with the next click); H: the hand, hidden
        // or shown; [ ]: turn the piece at the crosshair; X, Delete: take it away
        if (e.code === 'KeyE') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!e.repeat && E) {
            cancelCarry();
            unlock();
            E.openPicker();
          }
          return;
        }
        if (e.code === 'KeyH') {
          e.preventDefault();
          if (!e.repeat && s.view === 'walk') P().onToggleHand();
          return;
        }
        if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (s.locked && E && s.aim && !s.carry) {
            E.dispatch({
              type: 'rotate-by',
              id: s.aim,
              degrees: e.code === 'BracketLeft' ? 15 : -15,
            });
            hand.play('press');
          }
          return;
        }
        if (s.locked && E && (s.carry || s.aim)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!e.repeat) takeDown();
        }
        return;
      }
      if (wk) {
        e.preventDefault();
        s.walkTo = null;
        if (wk === 'jump') {
          // walking jumps; flying, Space held rises
          if (!e.repeat) s.jump = true;
          s.keys.add('up');
        } else s.keys.add(wk);
        // W twice, quickly: a sprint, as Minecraft's
        if (wk === 'fwd' && !e.repeat) {
          const now = performance.now();
          if (now - s.lastW < FLY.doubleTapMs) s.sprint = true;
          s.lastW = now;
        }
        invalidate();
        return;
      }
      if (e.key === 'Escape' && (s.carry || s.locked)) {
        // Esc puts back what is carried and gives the mouse back (the browser's own Esc does that
        // too, where the page never sees the key)
        cancelCarry();
        unlock();
        e.stopImmediatePropagation();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      s.run = e.shiftKey;
      const wk = WALK_KEYS[e.code];
      if (wk) s.keys.delete(wk);
      if (e.code === 'Space') s.keys.delete('up');
      if (wk === 'fwd' && !s.keys.has('fwd')) s.sprint = false;
    };
    const onBlur = () => s.keys.clear(); // a key let go in another window

    el.addEventListener('pointerdown', onPointerDown, true);
    el.addEventListener('pointermove', onPointerMove, true);
    el.addEventListener('pointerup', onPointerUp, true);
    el.addEventListener('pointercancel', onPointerCancel, true);
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    el.addEventListener('contextmenu', onContext, true);
    el.addEventListener('dblclick', onDblClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ── one frame's worth of walking or flying ──
    /** Walking: the keys held (or the walk to a spot) move the body. Returns whether a frame is due. */
    const advanceWalk = (dt: number) => {
      const k = s.keys;
      const turn = (k.has('turnL') ? 1 : 0) - (k.has('turnR') ? 1 : 0);
      if (turn) turnBy(turn * ((WALK.turnDegPerSec * Math.PI) / 180) * dt, 0);
      const w = s.body;
      if (!w || !s.model) return !!turn;
      const input = {
        fwd: (k.has('fwd') ? 1 : 0) - (k.has('back') ? 1 : 0),
        right: (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0),
        run: s.run || s.sprint,
        crouch: k.has('crouch'),
        jump: s.jump,
      };
      s.jump = false;
      // the double-click's walk to a spot: steer for it, slowing on arrival
      if (s.walkTo && !input.fwd && !input.right) {
        const keys = steerTo(w, s.walkTo);
        if (!keys) s.walkTo = null;
        else Object.assign(input, keys);
      }
      if (!input.fwd && !input.right && !input.jump && !bodyBusy(w, input)) return !!turn;
      const pf = P().prefs;
      const next = advanceBody(w, input, dt, s.model, {
        ...WALK,
        heightCm: pf.heightCm,
        ceiling: P().room.ceilingHeight,
      });
      // blocked on the way to a spot (a wall, a piece, the floor's edge): stop
      if (s.walkTo && Math.hypot(next.x - w.x, next.z - w.z) < 1e-5) s.walkTo = null;
      s.body = next;
      applyCamera();
      return true;
    };
    /** Flying with the keys: Minecraft's spectator. Returns whether a frame is due. */
    const advanceFlyFrame = (dt: number) => {
      const k = s.keys;
      const turn = (k.has('turnL') ? 1 : 0) - (k.has('turnR') ? 1 : 0);
      if (turn) turnBy(turn * ((WALK.turnDegPerSec * Math.PI) / 180) * dt, 0);
      const f = s.flight;
      if (!f) return !!turn;
      const fwd = (k.has('fwd') ? 1 : 0) - (k.has('back') ? 1 : 0);
      const r = advanceFlight(
        f,
        {
          fwd,
          right: (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0),
          up: (k.has('up') ? 1 : 0) - (s.run || k.has('crouch') ? 1 : 0),
          sprint: s.sprint,
          pace: s.flySpeed,
        },
        dt,
        flyBox(P().meshes.bounds),
      );
      s.flight = r.flight;
      if (r.moved) applyCamera();
      return r.moved || !!turn;
    };
    const lightDir = () => {
      const [x, y, z] = P().lightFrom;
      return new THREE.Vector3(x, y, z)
        .sub(camera.position)
        .applyQuaternion(camera.quaternion.clone().invert());
    };
    frameRef.current = (dt: number) => {
      let busy = false;
      if (s.view === 'walk') {
        if (advanceWalk(dt)) busy = true;
        if (vanishFrame(dt)) busy = true;
        // the mouse taken: the crosshair's target every frame, and the hand keeps breathing
        if (s.locked || s.carry) {
          aimFrame();
          busy = true;
        }
        if (hand.visible) {
          hand.look(s.lookYaw, s.lookPitch);
          const w = s.body;
          if (
            hand.update(dt, { phase: w?.phase ?? 0, stride: w?.stride ?? 0, light: lightDir() })
          ) {
            busy = true;
          }
        }
        s.lookYaw = 0;
        s.lookPitch = 0;
      } else if (s.view === 'fly') {
        if (advanceFlyFrame(dt)) busy = true;
        if (vanishFrame(dt)) busy = true;
        if (s.locked || s.carry) {
          aimFrame();
          busy = true;
        }
        s.lookYaw = 0;
        s.lookPitch = 0;
      } else if (s.vanish) {
        busy = vanishFrame(dt);
      }
      return busy;
    };

    applyCamera();
    // DEV and tests only (left out of production builds): where the walker and the flight are,
    // and what the crosshair is on, as the closet designer's DEV hooks.
    const dev = import.meta.env.DEV ? (window as unknown as Record<string, unknown>) : null;
    if (dev) {
      dev.__youngvista3d = {
        view: () => s.view,
        body: () => (s.body ? { ...s.body } : null),
        flight: () => (s.flight ? { ...s.flight } : null),
        locked: () => s.locked,
        aim: () => s.aim,
        carry: () => s.carry?.id ?? null,
        camera: () => camera.position.toArray(),
        flySpeed: () => s.flySpeed,
        /** Where a point of the room (metres) is on the screen (client pixels). */
        screen: (x: number, y: number, z: number) => {
          const o = offset();
          const p = new THREE.Vector3(x - o.x, y, z - o.z).project(camera);
          const r = canvas.getBoundingClientRect();
          return [r.left + ((p.x + 1) / 2) * r.width, r.top + ((1 - p.y) / 2) * r.height];
        },
      };
    }
    return () => {
      if (dev) delete dev.__youngvista3d;
      document.removeEventListener('pointerlockchange', onLockChange);
      unlock();
      if (s.speedTimer) clearTimeout(s.speedTimer);
      el.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('pointermove', onPointerMove, true);
      el.removeEventListener('pointerup', onPointerUp, true);
      el.removeEventListener('pointercancel', onPointerCancel, true);
      el.removeEventListener('wheel', onWheel, { capture: true });
      el.removeEventListener('contextmenu', onContext, true);
      el.removeEventListener('dblclick', onDblClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      el.style.cursor = '';
      frameRef.current = null;
      applyRef.current = null;
      pushHudRef.current = null;
      cancelCarryRef.current = null;
      const h = latest.current.handle as { current: Room3DHandle | null };
      if (h.current === handle) h.current = null;
    };
  }, [connected, get, invalidate, hand]);

  // A product put away (the picker closed without one, or placed): the ghost goes.
  const placing = props.editor?.placing ?? null;
  useEffect(() => {
    if (!placing) {
      nav.current.ghost = null;
      latest.current.onGhost(null);
    }
    pushHudRef.current?.();
    invalidate();
  }, [placing, invalidate]);

  useFrame(() => {
    const s = nav.current;
    const now = performance.now();
    // a frame after a rest steps a normal frame's worth, not the whole rest
    const dt = s.continuing ? Math.min(0.1, Math.max(0, (now - s.lastT) / 1000)) : 1 / 60;
    s.lastT = now;
    const busy = frameRef.current?.(dt) ?? false;
    s.continuing = busy;
    if (busy) invalidate();
  }, -1);

  return mode === 'walk' && prefs.hand ? <HandPass hand={hand} /> : null;
}

/** Walking: the hand over everything, in a pass of its own. */
function HandPass({ hand }: { hand: Hand }) {
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    hand.render(gl);
  }, 1);
  return null;
}
