/**
 * Fingers on the AR view: a tap selects the piece under the finger, one finger drags a piece
 * along the floor (the one it starts on, else the selected one), and two fingers turn the
 * selected piece. Picking and dragging use rays from the screen into the room, as the 3D view
 * does (furnish/view-3d-controls.ts), not Viro's own drag: Viro moves a dragged node itself
 * (VROInputControllerBase::processDragging sets its world transform), which would fight the
 * design's snapping and overlap rules.
 *
 * A ray comes from ViroReact's `unproject` (see `rayCaster`), which answers asynchronously. A
 * finger moves faster than that, so moves that arrive while a ray is on its way are folded into
 * the newest one. Everything here is in room space once the ray is turned with the line-up.
 */
import type { LineUp } from '@youngvista/core';
import { pickBox, type PickBox, type Ray } from '@/furnish/orbit';
import { rayFloorHit, rayThrough, rayToRoom, type V3 } from './pose';

/** A ray from the camera through a point of the AR view (points from its top left), or null. */
export type RayCaster = (x: number, y: number) => Promise<Ray | null>;

const positionOf = (v: unknown): V3 | null => {
  const p = (v as { position?: unknown } | null)?.position;
  return Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every((n) => Number.isFinite(n))
    ? [p[0] as number, p[1] as number, p[2] as number]
    : null;
};

/**
 * Rays from ViroReact's `ViroARSceneNavigator._unproject`. It takes a point of the AR view in
 * pixels (VRORenderer::unprojectPoint over the GL viewport, which is the view's size times its
 * scale on iPhone and its pixels on Android; y from the top, VROProjector flips it) and a depth
 * from 0 (the near plane) to 1 (the far plane), and returns that point in the world. Two depths
 * give the ray. `pixelRatio` turns React Native's points into pixels.
 */
export function rayCaster(
  unproject: () => ((point: V3) => Promise<unknown>) | null,
  pixelRatio: number,
): RayCaster {
  return async (x, y) => {
    const fn = unproject();
    if (!fn) return null;
    const px = x * pixelRatio;
    const py = y * pixelRatio;
    try {
      const [near, far] = await Promise.all([fn([px, py, 0]), fn([px, py, 0.1])]);
      const a = positionOf(near);
      const b = positionOf(far);
      return a && b ? rayThrough(a, b) : null;
    } catch {
      return null;
    }
  };
}

export interface ArTouchItem {
  id: string;
  x: number;
  z: number;
  rotationY: number;
}

export interface ArTouchInput {
  /** Room → world; null while lining up (touches do nothing then). */
  lineUp: LineUp | null;
  /** The pieces as boxes in room space, for picking. */
  boxes: readonly PickBox[];
  items: readonly ArTouchItem[];
  selectedId: string | null;
  onTap: (id: string | null) => void;
  onDragStart: (id: string) => void;
  /** The piece's centre should go to (x, z) on the floor, room space. */
  onDragMove: (x: number, z: number) => void;
  onRotateStart: (id: string) => void;
  /** The piece should turn to `rotationY` degrees. */
  onRotateMove: (rotationY: number) => void;
  onGestureEnd: () => void;
}

type Phase = 'idle' | 'starting' | 'dragging';

export class ArTouch {
  private input: ArTouchInput;
  private readonly cast: RayCaster;
  private phase: Phase = 'idle';
  /** Bumped by every new drag, so answers for an older one are ignored. */
  private drag = 0;
  private offset = { x: 0, z: 0 };
  private latest: { x: number; y: number } | null = null;
  private moving = false;
  private ending = false;
  private turning: number | null = null;

  constructor(cast: RayCaster, input: ArTouchInput) {
    this.cast = cast;
    this.input = input;
  }

  /** What the touches read: the latest line-up, pieces and handlers. */
  update(input: ArTouchInput): void {
    this.input = input;
  }

  /** True while a finger is moving a piece (or about to). */
  get busy(): boolean {
    return this.phase !== 'idle' || this.turning !== null;
  }

  private async roomRay(x: number, y: number): Promise<Ray | null> {
    const lineUp = this.input.lineUp;
    if (!lineUp) return null;
    const ray = await this.cast(x, y);
    const now = this.input.lineUp;
    return ray && now ? rayToRoom(now, ray) : null;
  }

  /** A tap at (x, y): selects the piece there, or nothing. */
  async tap(x: number, y: number): Promise<void> {
    if (!this.input.lineUp || this.busy) return;
    const ray = await this.roomRay(x, y);
    if (!ray) return;
    this.input.onTap(pickBox(ray, this.input.boxes));
  }

  /** A finger started moving from (x, y). */
  panStart(x: number, y: number): void {
    if (!this.input.lineUp || this.turning !== null) return;
    const drag = ++this.drag;
    this.phase = 'starting';
    this.latest = null;
    this.ending = false;
    void this.roomRay(x, y).then((ray) => {
      if (drag !== this.drag || this.phase !== 'starting') return;
      const hit = ray ? rayFloorHit(ray) : null;
      const id = (ray && pickBox(ray, this.input.boxes)) ?? this.input.selectedId;
      const item = id ? this.input.items.find((it) => it.id === id) : undefined;
      if (!ray || !hit || !item) {
        this.phase = 'idle';
        this.ending = false;
        return;
      }
      // Keep the piece where the finger holds it, not centred under the finger.
      this.offset = { x: item.x - hit.x, z: item.z - hit.z };
      this.phase = 'dragging';
      this.input.onDragStart(item.id);
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
    void this.roomRay(p.x, p.y).then((ray) => {
      this.moving = false;
      if (drag !== this.drag || this.phase !== 'dragging') return;
      const hit = ray ? rayFloorHit(ray) : null;
      if (hit) this.input.onDragMove(hit.x + this.offset.x, hit.z + this.offset.z);
      if (this.latest) this.sendMove(drag);
      else if (this.ending) this.finish();
    });
  }

  private finish(): void {
    this.phase = 'idle';
    this.ending = false;
    this.latest = null;
    this.input.onGestureEnd();
  }

  /** Two fingers started turning: the selected piece turns with them. */
  turnStart(): void {
    const { selectedId, items, lineUp } = this.input;
    const item = selectedId ? items.find((it) => it.id === selectedId) : undefined;
    if (!lineUp || !item || this.phase !== 'idle') return;
    this.turning = item.rotationY;
    this.input.onRotateStart(item.id);
  }

  /**
   * The fingers turned `degrees` (clockwise on screen is positive, as the gesture reports it).
   * Seen from above, which is how a phone held over the floor sees it, clockwise is a smaller
   * `rotationY` (rotationY turns counter-clockwise from above).
   */
  turnMove(degrees: number): void {
    if (this.turning === null) return;
    this.input.onRotateMove(this.turning - degrees);
  }

  turnEnd(): void {
    if (this.turning === null) return;
    this.turning = null;
    this.input.onGestureEnd();
  }
}
