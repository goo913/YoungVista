/**
 * The AR view's finger gestures, built once: a tap, a one-finger drag and a two-finger turn,
 * handed to `ArTouch` (ar/touch.ts), which turns them into design actions in room space, or to
 * `RoomMover` (ar/room-mover.ts), which moves the whole room while "Move the room" is on.
 */
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';

type Point = { x: number; y: number };

/** What the gestures drive: ar/touch.ts's `ArTouch` or ar/room-mover.ts's `RoomMover`. */
export interface ArTouchTarget {
  panStart(x: number, y: number): void;
  panMove(x: number, y: number): void;
  panEnd(): void;
  turnStart(): void;
  turnMove(degrees: number): void;
  turnEnd(): void;
  tap(x: number, y: number): Promise<void>;
}

export class ArGestures {
  readonly gesture: ComposedGesture;
  private readonly touch: ArTouchTarget;
  private begin: Point = { x: 0, y: 0 };

  constructor(touch: ArTouchTarget) {
    this.touch = touch;
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
    const rotation = Gesture.Rotation()
      .runOnJS(true)
      .onStart(this.onTurnStart)
      .onUpdate(this.onTurnUpdate)
      .onFinalize(this.onTurnEnd);
    const tap = Gesture.Tap().runOnJS(true).maxDuration(400).onEnd(this.onTapEnd);
    this.gesture = Gesture.Race(rotation, pan, tap);
  }

  private readonly onPanBegin = (e: Point) => {
    this.begin = { x: e.x, y: e.y };
  };

  private readonly onPanStart = () => this.touch.panStart(this.begin.x, this.begin.y);

  private readonly onPanUpdate = (e: Point) => this.touch.panMove(e.x, e.y);

  private readonly onPanEnd = () => this.touch.panEnd();

  private readonly onTurnStart = () => this.touch.turnStart();

  private readonly onTurnUpdate = (e: { rotation: number }) =>
    this.touch.turnMove((e.rotation * 180) / Math.PI);

  private readonly onTurnEnd = () => this.touch.turnEnd();

  private readonly onTapEnd = (e: Point, success: boolean) => {
    if (success) void this.touch.tap(e.x, e.y);
  };
}
