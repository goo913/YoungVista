/**
 * The 360° view's state outside React, so dragging never re-renders the scene: where the camera
 * stands and looks, the field of view, the glide after a flick, and the move between two spots.
 * The scene reads it every frame; the mini-map subscribes to `view`.
 */
import * as THREE from 'three';
import { normalizeHeading } from '@youngvista/core';
import { MAX_FOV, MIN_FOV, horizontalFov, type LoadedPanorama } from './panorama';

/** Where the camera is and which way it looks (the mini-map shows it). */
export interface TourMapView {
  x: number;
  z: number;
  /** Degrees, `atan2(x, z)`. */
  heading: number;
  /** Degrees above the horizon. */
  pitch: number;
  /** Vertical field of view (degrees). */
  fov: number;
  /** Horizontal field of view (degrees). */
  hfov: number;
  /** Moving between two spots. */
  moving: boolean;
}

export interface TourMove {
  from: LoadedPanorama;
  to: LoadedPanorama;
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** 0 → 1. */
  t: number;
  /** Seconds. */
  duration: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** How far up or down the view can look (degrees). */
export const MAX_PITCH = 85;

export class TourRig {
  /** Degrees, `atan2(x, z)`: 0 looks along +z. */
  heading = 0;
  /** Degrees above the horizon. */
  pitch = -8;
  /** Vertical field of view (degrees). */
  fov = 70;
  /** False until the view's shape has chosen the first field of view. */
  fovSet = false;
  readonly position = new THREE.Vector3(0, 1.5, 0);
  /** The spot the camera stands on (the one being left, while moving). */
  current: LoadedPanorama | null = null;
  move: TourMove | null = null;
  /** The glide after a flick (degrees per second). */
  spin: { heading: number; pitch: number } | null = null;
  /** Asks for a frame (the canvas draws on demand). */
  invalidate: () => void = () => {};
  /** Called when a move ends on its spot. */
  onArrive: (pano: LoadedPanorama) => void = () => {};

  private readonly listeners = new Set<() => void>();
  private snapshot: TourMapView = {
    x: 0,
    z: 0,
    heading: 0,
    pitch: 0,
    fov: 70,
    hfov: 90,
    moving: false,
  };

  /** Hands the rig the canvas's "draw a frame" function. */
  connect(invalidate: () => void) {
    this.invalidate = invalidate;
  }

  /** What to call when a move ends on its spot. */
  setOnArrive(onArrive: (pano: LoadedPanorama) => void) {
    this.onArrive = onArrive;
  }

  /** Looks along `heading`, `pitch` degrees above the horizon. */
  face(heading: number, pitch: number) {
    this.heading = normalizeHeading(heading);
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.invalidate();
  }

  /** The first field of view, from the view's shape (width / height). */
  fitFov(aspect: number, fov: (aspect: number) => number) {
    if (this.fovSet) return;
    this.fov = clamp(fov(aspect), MIN_FOV, MAX_FOV);
    this.fovSet = true;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getView = (): TourMapView => this.snapshot;

  /** Tells the mini-map where the camera is now (after each drawn frame). */
  publish(aspect: number) {
    const next: TourMapView = {
      x: this.position.x,
      z: this.position.z,
      heading: this.heading,
      pitch: this.pitch,
      fov: this.fov,
      hfov: horizontalFov(this.fov, aspect),
      moving: this.move !== null,
    };
    const s = this.snapshot;
    if (
      Math.abs(s.x - next.x) < 1e-4 &&
      Math.abs(s.z - next.z) < 1e-4 &&
      Math.abs(s.heading - next.heading) < 0.01 &&
      Math.abs(s.pitch - next.pitch) < 0.01 &&
      Math.abs(s.fov - next.fov) < 0.01 &&
      Math.abs(s.hfov - next.hfov) < 0.01 &&
      s.moving === next.moving
    ) {
      return;
    }
    this.snapshot = next;
    for (const l of this.listeners) l();
  }

  /** Stands on a spot at once. */
  arrive(pano: LoadedPanorama) {
    this.current = pano;
    this.move = null;
    this.position.set(pano.spot.position[0], pano.spot.position[1], pano.spot.position[2]);
    this.invalidate();
  }

  /** Stops a glide (the person took the view in hand again). */
  halt() {
    this.spin = null;
  }

  /** Turns the view: `dHeading` to the left, `dPitch` up (degrees). */
  look(dHeading: number, dPitch: number) {
    this.heading = normalizeHeading(this.heading + dHeading);
    this.pitch = clamp(this.pitch + dPitch, -MAX_PITCH, MAX_PITCH);
    this.invalidate();
  }

  setFov(fov: number) {
    this.fov = clamp(fov, MIN_FOV, MAX_FOV);
    this.fovSet = true;
    this.invalidate();
  }

  /** Zooms in (factor < 1) or out (factor > 1). */
  zoom(factor: number) {
    this.setFov(this.fov * factor);
  }

  /** Starts the move to another spot's panorama. False while another move runs. */
  moveTo(to: LoadedPanorama): boolean {
    const from = this.current;
    if (!from || this.move || from.spot.spot === to.spot.spot) return false;
    const start = this.position.clone();
    const end = new THREE.Vector3(...to.spot.position);
    const distance = start.distanceTo(end);
    this.move = { from, to, start, end, t: 0, duration: clamp(0.5 + distance * 0.25, 0.7, 1.4) };
    this.spin = null;
    this.invalidate();
    return true;
  }

  /** How far the picture has faded from the spot left to the spot ahead (0 → 1). */
  get fade(): number {
    const t = this.move?.t ?? 0;
    const x = clamp((t - 0.15) / 0.7, 0, 1);
    return x * x * (3 - 2 * x);
  }

  /** Advances the glide and the move by `dt` seconds. True while either still runs. */
  step(dt: number): boolean {
    const time = Math.min(dt, 0.1);
    let running = false;
    if (this.spin) {
      this.look(this.spin.heading * time, this.spin.pitch * time);
      const decay = Math.exp(-time * 5);
      this.spin = { heading: this.spin.heading * decay, pitch: this.spin.pitch * decay };
      if (Math.hypot(this.spin.heading, this.spin.pitch) < 2) this.spin = null;
      else running = true;
    }
    const move = this.move;
    if (move) {
      move.t = Math.min(1, move.t + time / move.duration);
      this.position.lerpVectors(move.start, move.end, easeInOut(move.t));
      if (move.t >= 1) {
        this.move = null;
        this.current = move.to;
        this.position.copy(move.end);
        this.onArrive(move.to);
      } else {
        running = true;
      }
    }
    return running;
  }
}
