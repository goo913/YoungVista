/**
 * Moving the whole room by hand in the AR view ("Move the room"): one finger drags it along the
 * floor, two fingers turn it about the dot (or about the room's middle when the dot is off the
 * floor), as the furniture moves in ar/touch.ts. Everything here is in the AR world: a finger's
 * ray meets the real floor, and the room's line-up (core's lineup.ts) is shifted by how far that
 * point moved, so the room follows the finger and does not depend on where it is drawn.
 *
 * Rays come from ViroReact's `unproject`, which answers asynchronously (see ar/touch.ts); moves
 * that arrive while a ray is on its way are folded into the newest one.
 */
import { shiftLineUp, turnLineUp, type LineUp, type Vec2 } from '@youngvista/core';
import { rayFloorHit } from './pose';
import type { RayCaster } from './touch';

export interface RoomMoverInput {
  /** The room → world transform as drawn now, or null (nothing to move). */
  lineUp: LineUp | null;
  /** The AR floor's height (world), or null before it is found. */
  floorY: number | null;
  /** The world floor point to turn about: the dot on the floor, else the room's middle. */
  pivot: () => Vec2 | null;
  /** The room should be drawn with this line-up now (while a finger moves it). */
  onMove: (lineUp: LineUp) => void;
  /** The fingers lifted: the last `onMove` line-up is where the room stays. */
  onEnd: () => void;
}

type Phase = 'idle' | 'starting' | 'dragging';

export class RoomMover {
  private input: RoomMoverInput;
  private readonly cast: RayCaster;
  private phase: Phase = 'idle';
  private drag = 0;
  private start: { lineUp: LineUp; hit: Vec2 } | null = null;
  private latest: { x: number; y: number } | null = null;
  private moving = false;
  private ending = false;
  private turning: { lineUp: LineUp; pivot: Vec2 } | null = null;
  private moved = false;

  constructor(cast: RayCaster, input: RoomMoverInput) {
    this.cast = cast;
    this.input = input;
  }

  /** What the gestures read: the latest line-up, floor and handlers. */
  update(input: RoomMoverInput): void {
    this.input = input;
  }

  /** True while fingers are moving the room. */
  get busy(): boolean {
    return this.phase !== 'idle' || this.turning !== null;
  }

  /** Where the ray through (x, y) of the view meets the floor (world), or null. */
  private async floorHit(x: number, y: number): Promise<Vec2 | null> {
    const floorY = this.input.floorY;
    if (floorY === null) return null;
    const ray = await this.cast(x, y);
    return ray ? rayFloorHit(ray, floorY) : null;
  }

  /** One finger started moving from (x, y). */
  panStart(x: number, y: number): void {
    const lineUp = this.input.lineUp;
    if (!lineUp || this.turning !== null) return;
    const drag = ++this.drag;
    this.phase = 'starting';
    this.latest = null;
    this.ending = false;
    this.moved = false;
    void this.floorHit(x, y).then((hit) => {
      if (drag !== this.drag || this.phase !== 'starting') return;
      if (!hit) {
        this.phase = 'idle';
        this.ending = false;
        return;
      }
      this.start = { lineUp, hit };
      this.phase = 'dragging';
      if (this.latest) this.sendMove(drag);
      else if (this.ending) this.finish();
    });
  }

  /** The finger is now at (x, y). */
  panMove(x: number, y: number): void {
    if (this.phase === 'idle') return;
    this.latest = { x, y };
    if (this.phase === 'dragging') this.sendMove(this.drag);
  }

  /** The finger lifted. The drag ends once the last move has been placed. */
  panEnd(): void {
    if (this.phase === 'idle') return;
    this.ending = true;
    if (this.phase === 'dragging' && !this.moving && !this.latest) this.finish();
  }

  private sendMove(drag: number): void {
    if (this.moving || !this.latest) return;
    const p = this.latest;
    this.latest = null;
    this.moving = true;
    void this.floorHit(p.x, p.y).then((hit) => {
      this.moving = false;
      if (drag !== this.drag || this.phase !== 'dragging' || !this.start) return;
      if (hit) {
        const { lineUp, hit: from } = this.start;
        this.moved = true;
        this.input.onMove(shiftLineUp(lineUp, { x: hit.x - from.x, z: hit.z - from.z }));
      }
      if (this.latest) this.sendMove(drag);
      else if (this.ending) this.finish();
    });
  }

  private finish(): void {
    this.phase = 'idle';
    this.ending = false;
    this.latest = null;
    this.start = null;
    if (this.moved) this.input.onEnd();
    this.moved = false;
  }

  /** Two fingers started turning: the room turns with them, about the pivot. */
  turnStart(): void {
    const lineUp = this.input.lineUp;
    const pivot = this.input.pivot();
    if (!lineUp || !pivot || this.phase !== 'idle') return;
    this.turning = { lineUp, pivot };
  }

  /**
   * The fingers turned `degrees` (clockwise on screen is positive, as the gesture reports it).
   * Seen from above, which is how a phone held over the floor sees it, clockwise is a smaller
   * `rotationY`.
   */
  turnMove(degrees: number): void {
    if (!this.turning) return;
    this.input.onMove(turnLineUp(this.turning.lineUp, -degrees, this.turning.pivot));
  }

  turnEnd(): void {
    if (!this.turning) return;
    this.turning = null;
    this.input.onEnd();
  }

  /** A tap does nothing while moving the room. */
  async tap(): Promise<void> {}
}
