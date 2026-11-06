/**
 * The small plan shown while lining up: the room from above, its doors and windows in the same
 * colours as the ghost walls in the camera view, the wall whose ends are asked for, and its two
 * corners numbered 1 and 2. The corner to aim at now is the big green one; a corner already
 * tapped turns yellow.
 */
import { bounds, openingSegment, type Room } from '@youngvista/core';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

const COLORS = {
  wall: '#ffffff',
  fill: 'rgba(255, 255, 255, 0.12)',
  target: '#facc15',
  aim: '#4ade80',
  done: '#facc15',
  door: '#fbbf24',
  window: '#7dd3fc',
};

export function LineUpPlan({
  room,
  corners,
  step,
  size = 136,
}: {
  room: Room;
  corners: readonly [number, number];
  /** The corner to aim at now (0 or 1), or null when both are done. */
  step: 0 | 1 | null;
  size?: number;
}) {
  const b = bounds(room.points);
  const span = Math.max(b.width, b.depth, 0.5);
  const pad = span * 0.14;
  const view = { x: b.minX - pad, y: b.minZ - pad, w: b.width + 2 * pad, h: b.depth + 2 * pad };
  const unit = span / 100;
  const outline = room.points.map(([x, z]) => `${x},${z}`).join(' ');
  const a = room.points[corners[0]];
  const c = room.points[corners[1]];

  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center rounded-2xl bg-black/55 p-2"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Plan of the room with corner ${step === 1 ? 2 : 1} to aim at`}
    >
      <Svg width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}>
        <Polygon
          points={outline}
          fill={COLORS.fill}
          stroke={COLORS.wall}
          strokeWidth={unit * 1.6}
        />
        {room.walls.flatMap((w) =>
          w.openings.map((o) => {
            const seg = openingSegment(room, w.id, o);
            if (!seg) return null;
            return (
              <Line
                key={`${w.id}-${o.id}`}
                x1={seg.a.x}
                y1={seg.a.z}
                x2={seg.b.x}
                y2={seg.b.z}
                stroke={o.type === 'window' ? COLORS.window : COLORS.door}
                strokeWidth={unit * 4}
              />
            );
          }),
        )}
        {a && c ? (
          <Line
            x1={a[0]}
            y1={a[1]}
            x2={c[0]}
            y2={c[1]}
            stroke={COLORS.target}
            strokeWidth={unit * 3}
            strokeDasharray={[unit * 4, unit * 3]}
          />
        ) : null}
        {[a, c].map((p, k) =>
          p ? (
            <G key={k}>
              <Circle
                cx={p[0]}
                cy={p[1]}
                r={unit * (k === step ? 9 : 7)}
                fill={k === step ? COLORS.aim : step === null || k < step ? COLORS.done : '#000000'}
                stroke={COLORS.wall}
                strokeWidth={unit * 1.4}
              />
              <SvgText
                x={p[0]}
                y={p[1]}
                fontSize={unit * 9}
                fontWeight="700"
                fill={k === step || step === null || k < step ? '#000000' : COLORS.wall}
                textAnchor="middle"
                alignmentBaseline="central"
              >
                {String(k + 1)}
              </SvgText>
            </G>
          ) : null,
        )}
      </Svg>
    </View>
  );
}
