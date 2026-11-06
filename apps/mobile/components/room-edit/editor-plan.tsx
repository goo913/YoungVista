/**
 * The room editor's plan: drag a corner to move it, drag a door or window along its wall, tap a
 * wall, corner, door or window to select it. Wall lengths are written beside the walls.
 */
import {
  formatLength,
  inwardNormal,
  wallEndpoints,
  wallLengths,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { useColorScheme } from 'nativewind';
import { useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { OpeningShapes } from '@/components/plan/plan-shapes';
import { fitPlan, toRoom, toView, type PlanTransform } from '@/lib/plan-transform';
import { THEME } from '@/lib/theme';
import { editorHit, type EditorSelection, type RoomEditorAction } from '@/room-edit/editor-state';

/** Touches this close (points) to a corner, wall or opening still hit it. */
const SLOP = 18;
/** A dragged corner lines up with a neighbour within this many points. */
const SNAP = 10;

interface EditorPlanInput {
  room: Room;
  dispatch: (action: RoomEditorAction) => void;
}

/** Touch handling for the editor's plan, built once; `update` keeps what it reads current. */
class EditorControls {
  readonly gesture: ComposedGesture;
  private input: EditorPlanInput;
  private t: PlanTransform | null = null;
  private kind: 'corner' | 'opening' | null = null;
  private begin = { x: 0, y: 0 };

  constructor(input: EditorPlanInput) {
    this.input = input;
    // Handlers by reference: inline arrows in a gesture chain become worklets (see
    // components/furnish/view-3d-controls.ts), and then `this` is not this object.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(3)
      .onBegin(this.onPanBegin)
      .onStart(this.onPanStart)
      .onUpdate(this.onPanUpdate)
      .onFinalize(this.onPanEnd);
    const tap = Gesture.Tap().runOnJS(true).maxDuration(400).onEnd(this.onTapEnd);
    this.gesture = Gesture.Race(pan, tap);
  }

  private readonly onPanBegin = (e: { x: number; y: number }) => {
    this.begin = { x: e.x, y: e.y };
  };

  private readonly onPanStart = () => this.dragStart();

  private readonly onPanUpdate = (e: { x: number; y: number }) => this.dragMove(e.x, e.y);

  private readonly onPanEnd = () => {
    if (this.kind) this.input.dispatch({ type: 'drag-end' });
    this.kind = null;
  };

  private readonly onTapEnd = (e: { x: number; y: number }, success: boolean) => {
    if (!success || !this.t) return;
    const at = toRoom(this.t, { x: e.x, y: e.y });
    this.input.dispatch({
      type: 'select',
      selection: editorHit(this.input.room, at, SLOP / this.t.scale),
    });
  };

  update(input: EditorPlanInput, t: PlanTransform | null) {
    this.input = input;
    this.t = t;
  }

  private dragStart() {
    if (!this.t) return;
    const at = toRoom(this.t, this.begin);
    const hit = editorHit(this.input.room, at, SLOP / this.t.scale);
    if (hit?.kind === 'corner') {
      this.kind = 'corner';
      this.input.dispatch({ type: 'corner-drag-start', index: hit.index });
    } else if (hit?.kind === 'opening') {
      this.kind = 'opening';
      this.input.dispatch({ type: 'opening-drag-start', id: hit.id, point: at });
    }
  }

  private dragMove(x: number, y: number) {
    if (!this.t || !this.kind) return;
    const at = toRoom(this.t, { x, y });
    if (this.kind === 'corner') {
      this.input.dispatch({ type: 'corner-drag-move', point: at, snap: SNAP / this.t.scale });
    } else {
      this.input.dispatch({ type: 'opening-drag-move', point: at });
    }
  }
}

export function EditorPlan({
  room,
  units,
  selection,
  dragging,
  dispatch,
}: {
  room: Room;
  units: UnitSystem;
  selection: EditorSelection;
  dragging: boolean;
  dispatch: (action: RoomEditorAction) => void;
}) {
  const { colorScheme } = useColorScheme();
  const c = THEME[colorScheme === 'dark' ? 'dark' : 'light'];
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // Keep the framing still while a corner moves (even if the view resizes), so the plan does not
  // slide under the finger.
  const [framed, setFramed] = useState({ room, size });
  if (!dragging && (framed.room !== room || framed.size !== size)) setFramed({ room, size });
  const t: PlanTransform | null = useMemo(
    () =>
      framed.size ? fitPlan(framed.room.points, framed.size.width, framed.size.height, 0.7) : null,
    [framed],
  );
  const [controls] = useState(() => new EditorControls({ room, dispatch }));
  useLayoutEffect(() => controls.update({ room, dispatch }, t));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ width, height });
  };

  const pt = (p: { x: number; z: number }) => (t ? toView(t, p) : { x: 0, y: 0 });
  const wallWidth = t ? Math.max(0.1 * t.scale, 4) : 4;
  const lengths = wallLengths(room);
  const font = 12;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {t && size ? (
        <Svg width={size.width} height={size.height}>
          <Polygon
            points={room.points
              .map(([x, z]) => {
                const p = pt({ x, z });
                return `${p.x},${p.y}`;
              })
              .join(' ')}
            fill={c.planFill}
          />
          {room.walls.map((w) => {
            const { a, b } = wallEndpoints(room, w);
            const p = pt(a);
            const q = pt(b);
            const selected = selection?.kind === 'wall' && selection.id === w.id;
            return (
              <Line
                key={w.id}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke={selected ? c.planSelected : c.foreground}
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
            highlightId={selection?.kind === 'opening' ? selection.id : null}
            highlightColor={c.planSelected}
          />
          {room.walls.map((w, i) => {
            const { a, b } = wallEndpoints(room, w);
            const p = pt(a);
            const q = pt(b);
            const len = lengths[i] ?? 0;
            if (Math.hypot(q.x - p.x, q.y - p.y) < font * 3.2) return null;
            const n = inwardNormal(a, b);
            const off = wallWidth / 2 + font;
            const x = (p.x + q.x) / 2 - n.x * off;
            const y = (p.y + q.y) / 2 - n.z * off;
            let deg = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
            if (deg > 90) deg -= 180;
            if (deg < -90) deg += 180;
            return (
              <SvgText
                key={w.id}
                x={x}
                y={y}
                fontSize={font}
                fontWeight="500"
                fill={c.foreground}
                textAnchor="middle"
                alignmentBaseline="central"
                transform={`rotate(${deg.toFixed(1)} ${x} ${y})`}
              >
                {formatLength(len, units)}
              </SvgText>
            );
          })}
          <G>
            {room.points.map(([x, z], i) => {
              const p = pt({ x, z });
              const selected = selection?.kind === 'corner' && selection.index === i;
              return (
                <Circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={selected ? 10 : 7}
                  fill={selected ? c.planSelected : c.background}
                  stroke={selected ? c.planSelected : c.foreground}
                  strokeWidth={2}
                />
              );
            })}
          </G>
        </Svg>
      ) : null}
      <GestureDetector gesture={controls.gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
