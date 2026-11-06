/**
 * The furniture plan: the room from above with every piece's footprint, for precise moves. Drag a
 * piece with one finger, turn the selected piece with two, tap to select. The same actions as the
 * 3D view, so both always show the same design.
 */
import { wallEndpoints, type Footprint, type Room } from '@youngvista/core';
import { useColorScheme } from 'nativewind';
import { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';
import Svg, { Line, Polygon } from 'react-native-svg';
import { FootprintShape, OpeningShapes } from '@/components/plan/plan-shapes';
import { fitPlan, itemAt, toRoom, toView, type PlanTransform } from '@/lib/plan-transform';
import { THEME } from '@/lib/theme';
import type { FurnitureGestures } from './view-3d-controls';

export interface PlanEditorItem {
  id: string;
  footprint: Footprint;
  flat: boolean;
  rotationY: number;
  highlight: 'none' | 'selected' | 'invalid';
}

export interface PlanEditorProps extends FurnitureGestures {
  room: Room;
  items: readonly PlanEditorItem[];
  selectedId: string | null;
}

/** Touches this close (points) to a piece still pick it. */
const SLOP = 10;

/** Touch handling for the plan, built once; `update` keeps what it reads current. */
class PlanControls {
  readonly gesture: ComposedGesture;
  private props: PlanEditorProps;
  private t: PlanTransform | null = null;
  private drag: { dx: number; dz: number } | null = null;
  private rotating: number | null = null;
  private begin = { x: 0, y: 0 };

  constructor(props: PlanEditorProps) {
    this.props = props;
    // Handlers by reference: inline arrows in a gesture chain become worklets (see
    // view-3d-controls.ts), and then `this` is not this object.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(4)
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

  private readonly onPanBegin = (e: { x: number; y: number }) => {
    this.begin = { x: e.x, y: e.y };
  };

  private readonly onPanStart = () => this.dragStart();

  private readonly onPanUpdate = (e: { x: number; y: number }) => this.dragMove(e.x, e.y);

  private readonly onPanEnd = () => {
    if (this.drag) this.props.onGestureEnd();
    this.drag = null;
  };

  private readonly onTurnStart = () => this.turnStart();

  // Clockwise on screen is clockwise from above: a smaller rotationY.
  private readonly onTurnUpdate = (e: { rotation: number }) => {
    if (this.rotating !== null) {
      this.props.onRotateMove(this.rotating - (e.rotation * 180) / Math.PI);
    }
  };

  private readonly onTurnEnd = () => {
    if (this.rotating !== null) this.props.onGestureEnd();
    this.rotating = null;
  };

  private readonly onTapEnd = (e: { x: number; y: number }, success: boolean) => {
    if (success) this.props.onTap(this.itemUnder(e.x, e.y));
  };

  update(props: PlanEditorProps, t: PlanTransform | null) {
    this.props = props;
    this.t = t;
  }

  private itemUnder(x: number, y: number) {
    if (!this.t) return null;
    const { items, selectedId } = this.props;
    return itemAt(items, toRoom(this.t, { x, y }), selectedId, SLOP / this.t.scale);
  }

  private dragStart() {
    const id = this.itemUnder(this.begin.x, this.begin.y);
    const item = id ? this.props.items.find((it) => it.id === id) : undefined;
    if (!this.t || !item) return;
    // Keep the piece where the finger holds it, not centred under the finger.
    const at = toRoom(this.t, this.begin);
    this.drag = { dx: item.footprint.center.x - at.x, dz: item.footprint.center.z - at.z };
    this.props.onDragStart(item.id);
  }

  private dragMove(x: number, y: number) {
    if (!this.drag || !this.t) return;
    const at = toRoom(this.t, { x, y });
    this.props.onDragMove(at.x + this.drag.dx, at.z + this.drag.dz);
  }

  private turnStart() {
    const { selectedId, items } = this.props;
    const selected = selectedId ? items.find((it) => it.id === selectedId) : undefined;
    if (!selected) return;
    this.rotating = selected.rotationY;
    this.props.onRotateStart(selected.id);
  }
}

export function PlanEditor(props: PlanEditorProps) {
  const { room, items } = props;
  const { colorScheme } = useColorScheme();
  const c = THEME[colorScheme === 'dark' ? 'dark' : 'light'];
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const t: PlanTransform | null = useMemo(
    () => (size ? fitPlan(room.points, size.width, size.height, 0.35) : null),
    [room, size],
  );
  const [controls] = useState(() => new PlanControls(props));
  useLayoutEffect(() => controls.update(props, t));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ width, height });
  };

  const pt = (p: { x: number; z: number }) => (t ? toView(t, p) : { x: 0, y: 0 });
  const wallWidth = t ? Math.max(0.1 * t.scale, 3) : 3;
  const ordered = [...items.filter((it) => it.flat), ...items.filter((it) => !it.flat)];
  // The selected or refused piece on top, so its outline is never hidden.
  ordered.sort((a, b) => Number(a.highlight !== 'none') - Number(b.highlight !== 'none'));

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {t && size ? (
        <Svg width={size.width} height={size.height}>
          <Polygon
            points={room.points
              .map(([x, z]) => `${x * t.scale + t.ox},${z * t.scale + t.oy}`)
              .join(' ')}
            fill={c.planFill}
          />
          {ordered.map((it) => (
            <FootprintShape
              key={it.id}
              footprint={it.footprint}
              pt={pt}
              strokeWidth={it.highlight === 'none' ? 1.2 : 2}
              style={
                it.highlight === 'invalid'
                  ? { fill: c.planInvalidFill, stroke: c.planInvalid, front: c.planInvalid }
                  : it.highlight === 'selected'
                    ? { fill: c.planSelectedFill, stroke: c.planSelected, front: c.planSelected }
                    : {
                        fill: it.flat ? c.planRug : c.planItem,
                        stroke: c.planItemStroke,
                        front: c.planItemStroke,
                      }
              }
            />
          ))}
          {room.walls.map((w) => {
            const { a, b } = wallEndpoints(room, w);
            const p = pt(a);
            const q = pt(b);
            return (
              <Line
                key={w.id}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke={c.foreground}
                strokeWidth={wallWidth}
                strokeLinecap="round"
              />
            );
          })}
          <OpeningShapes
            room={room}
            pt={pt}
            wallWidth={wallWidth}
            colors={{
              background: c.background,
              wall: c.foreground,
              door: c.mutedForeground,
              glass: c.planGlass,
            }}
          />
        </Svg>
      ) : null}
      <GestureDetector gesture={controls.gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
