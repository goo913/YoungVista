/**
 * Touch handling for the 3D view, outside React's render: one finger on a piece drags it along
 * the floor and elsewhere turns around the room, two fingers pinch to zoom and turn the selected
 * piece (or the view), a tap selects. The gestures are built once; `update` keeps what they read
 * current. Picking and dragging use the app's own camera maths (furnish/orbit.ts).
 */
import type { RoomMeshes } from '@youngvista/core';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import {
  fitOrbit,
  lerpOrbit,
  orbitBy,
  pickBox,
  rayOnFloor,
  screenRay,
  zoomBy,
  type Orbit,
  type PickBox,
  type ViewPreset,
  type Viewport,
} from '@/furnish/orbit';
import type { Store } from '@/lib/store';
import type { SceneItem, SceneState } from './room-scene';

export interface FurnitureGestures {
  onTap: (id: string | null) => void;
  onDragStart: (id: string) => void;
  /** The item's centre should go to (x, z) on the floor. */
  onDragMove: (x: number, z: number) => void;
  onRotateStart: (id: string) => void;
  /** The item should turn to `rotationY` degrees. */
  onRotateMove: (rotationY: number) => void;
  onGestureEnd: () => void;
}

export interface View3DInput extends FurnitureGestures {
  items: readonly SceneItem[];
  /** Furniture as boxes, for picking. */
  boxes: readonly PickBox[];
  selectedId: string | null;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type Point = { x: number; y: number };

type OneFinger = { kind: 'drag'; dx: number; dz: number } | { kind: 'orbit'; start: Orbit } | null;
type TwoFinger = { kind: 'rotate'; start: number } | { kind: 'orbit'; start: Orbit } | null;

export class View3DControls {
  readonly gesture: ComposedGesture;
  private readonly store: Store<SceneState>;
  private input: View3DInput;
  private viewport: Viewport | null = null;
  private meshes: RoomMeshes | null = null;
  /** How far pinching out may go: a few times the distance that fits the room. */
  private maxDistance = 20;
  private glide: number | null = null;
  private oneFinger: OneFinger = null;
  private twoFinger: TwoFinger = null;
  private pinchStart: Orbit | null = null;
  private begin = { x: 0, y: 0 };

  constructor(store: Store<SceneState>, input: View3DInput) {
    this.store = store;
    this.input = input;
    // The handlers are passed by reference: an inline arrow in a gesture chain is turned into a
    // worklet by the Reanimated Babel plugin, and then `this` is not this object.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(6)
      .onBegin(this.onPanBegin)
      .onStart(this.onPanStart)
      .onUpdate(this.onPanUpdate)
      .onFinalize(this.onPanEnd);
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(this.onPinchStart)
      .onUpdate(this.onPinchUpdate)
      .onFinalize(this.onPinchEnd);
    const rotation = Gesture.Rotation()
      .runOnJS(true)
      .onStart(this.onTurnStart)
      .onUpdate(this.onTurnUpdate)
      .onFinalize(this.onTurnEnd);
    const tap = Gesture.Tap().runOnJS(true).maxDuration(400).onEnd(this.onTapEnd);
    this.gesture = Gesture.Race(Gesture.Simultaneous(pinch, rotation), pan, tap);
  }

  private readonly onPanBegin = (e: Point) => {
    this.begin = { x: e.x, y: e.y };
  };

  private readonly onPanStart = () => this.panStart();

  private readonly onPanUpdate = (e: Point & { translationX: number; translationY: number }) =>
    this.panMove(e.x, e.y, e.translationX, e.translationY);

  private readonly onPanEnd = () => {
    if (this.oneFinger?.kind === 'drag') this.input.onGestureEnd();
    this.oneFinger = null;
  };

  private readonly onPinchStart = () => {
    this.pinchStart = this.store.get().orbit;
  };

  private readonly onPinchUpdate = (e: { scale: number }) => {
    if (this.pinchStart) this.setOrbit(zoomBy(this.pinchStart, e.scale, this.maxDistance));
  };

  private readonly onPinchEnd = () => {
    this.pinchStart = null;
  };

  private readonly onTurnStart = () => this.turnStart();

  private readonly onTurnUpdate = (e: { rotation: number }) =>
    this.turnMove((e.rotation * 180) / Math.PI);

  private readonly onTurnEnd = () => {
    if (this.twoFinger?.kind === 'rotate') this.input.onGestureEnd();
    this.twoFinger = null;
  };

  private readonly onTapEnd = (e: Point, success: boolean) => {
    if (success) this.input.onTap(this.pick(e.x, e.y));
  };

  /** What the gestures read: the latest props, the view's size and the room. */
  update(input: View3DInput, viewport: Viewport | null, meshes: RoomMeshes) {
    this.input = input;
    this.viewport = viewport;
    this.meshes = meshes;
  }

  /** Frames the room in the view (the three-quarter view). */
  frame(meshes: RoomMeshes, viewport: Viewport) {
    const orbit = fitOrbit(meshes, 'corner', viewport);
    this.maxDistance = orbit.distance * 2.5;
    this.setOrbit(orbit);
  }

  /** Glides to a three-quarter view or straight down. */
  show(preset: ViewPreset) {
    if (!this.viewport || !this.meshes) return;
    const from = this.store.get().orbit;
    const to = fitOrbit(this.meshes, preset, this.viewport);
    this.stopGlide();
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / 650);
      this.store.set((s) => ({ ...s, orbit: lerpOrbit(from, to, easeInOut(t)) }));
      this.glide = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.glide = requestAnimationFrame(step);
  }

  dispose() {
    this.stopGlide();
  }

  private stopGlide() {
    if (this.glide !== null) cancelAnimationFrame(this.glide);
    this.glide = null;
  }

  private setOrbit(orbit: Orbit) {
    this.stopGlide();
    this.store.set((s) => ({ ...s, orbit }));
  }

  private pick(x: number, y: number): string | null {
    if (!this.viewport) return null;
    return pickBox(screenRay(this.store.get().orbit, this.viewport, { x, y }), this.input.boxes);
  }

  private floorAt(x: number, y: number) {
    return this.viewport
      ? rayOnFloor(screenRay(this.store.get().orbit, this.viewport, { x, y }))
      : null;
  }

  private panStart() {
    const { x, y } = this.begin;
    const id = this.pick(x, y);
    const box = id ? this.input.boxes.find((b) => b.id === id) : undefined;
    const hit = this.floorAt(x, y);
    if (id && box && hit) {
      // Keep the piece where the finger holds it, not centred under the finger.
      this.oneFinger = {
        kind: 'drag',
        dx: box.footprint.center.x - hit.x,
        dz: box.footprint.center.z - hit.z,
      };
      this.input.onDragStart(id);
    } else {
      this.oneFinger = { kind: 'orbit', start: this.store.get().orbit };
    }
  }

  private panMove(x: number, y: number, dx: number, dy: number) {
    const m = this.oneFinger;
    if (m?.kind === 'drag') {
      const hit = this.floorAt(x, y);
      if (hit) this.input.onDragMove(hit.x + m.dx, hit.z + m.dz);
    } else if (m?.kind === 'orbit' && this.viewport) {
      this.setOrbit(orbitBy(m.start, dx, dy, this.viewport));
    }
  }

  private turnStart() {
    const { selectedId, items } = this.input;
    const selected = selectedId ? items.find((it) => it.id === selectedId) : undefined;
    if (selected) {
      this.twoFinger = { kind: 'rotate', start: selected.rotationY };
      this.input.onRotateStart(selected.id);
    } else {
      this.twoFinger = { kind: 'orbit', start: this.store.get().orbit };
    }
  }

  private turnMove(degrees: number) {
    const tf = this.twoFinger;
    // Fingers turning clockwise on screen turn the piece clockwise seen from above, which is a
    // smaller rotationY (rotationY turns counter-clockwise from above).
    if (tf?.kind === 'rotate') this.input.onRotateMove(tf.start - degrees);
    else if (tf?.kind === 'orbit')
      this.setOrbit({ ...this.store.get().orbit, yaw: tf.start.yaw + degrees });
  }
}
