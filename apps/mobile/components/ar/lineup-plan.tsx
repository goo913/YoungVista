/**
 * The small plan shown while lining up: the room from above, its doors and windows in the same
 * colours as the ghost walls in the camera view, the wall whose ends are asked for, and its two
 * corners numbered 1 (the left end, seen facing the wall) and 2 (the right end). A small arrow
 * shows where to stand and which way to face. The corner to aim at now is the big green one; a
 * corner already tapped turns yellow. While the room is moved by hand, the plan shows where the
 * phone is in the room as placed, so the user can check it against where they stand.
 */
import { bounds, openingSegment, type Room, type Vec2 } from '@youngvista/core';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { facingWall } from '@/ar/corner-prompts';

const COLORS = {
  wall: '#ffffff',
  fill: 'rgba(255, 255, 255, 0.12)',
  target: '#facc15',
  aim: '#4ade80',
  done: '#facc15',
  door: '#fbbf24',
  window: '#7dd3fc',
  you: '#60a5fa',
};

export function LineUpPlan({
  room,
  corners = null,
  step = null,
  phone = null,
  size = 136,
}: {
  room: Room;
  /** The two corners asked for, [left, right], or null (moving the room by hand). */
  corners?: readonly [number, number] | null;
  /** The corner to aim at now (0 or 1), or null when both are done. */
  step?: 0 | 1 | null;
  /** Where the phone is in the room (room space), shown as a blue dot, or null. */
  phone?: Vec2 | null;
  size?: number;
}) {
  const b = bounds(room.points);
  const span = Math.max(b.width, b.depth, 0.5);
  const pad = span * 0.14;
  const view = { x: b.minX - pad, y: b.minZ - pad, w: b.width + 2 * pad, h: b.depth + 2 * pad };
  const unit = span / 100;
  const outline = room.points.map(([x, z]) => `${x},${z}`).join(' ');
  const a = corners ? room.points[corners[0]] : undefined;
  const c = corners ? room.points[corners[1]] : undefined;
  const facing = corners ? facingWall(room, corners) : null;
  // The arrow: from where to stand toward the wall.
  const arrow = facing
    ? (() => {
        const { stand, facing: f } = facing;
        const tip = { x: stand.x + f.x * unit * 12, z: stand.z + f.z * unit * 12 };
        const side = { x: -f.z * unit * 6, z: f.x * unit * 6 };
        const back = { x: stand.x - f.x * unit * 2, z: stand.z - f.z * unit * 2 };
        return `${tip.x},${tip.z} ${back.x + side.x},${back.z + side.z} ${back.x - side.x},${back.z - side.z}`;
      })()
    : null;
  const label = corners
    ? `Plan of the room: stand where the arrow is and face the wall with corners 1 and 2. Corner ${step === 1 ? 2 : 1} is the one to aim at now.`
    : 'Plan of the room, with a blue dot where you are in the room as it is placed now';

  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center rounded-2xl bg-black/55 p-2"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
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
        {arrow ? <Polygon points={arrow} fill={COLORS.you} /> : null}
        {phone ? (
          <Circle
            cx={phone.x}
            cy={phone.z}
            r={unit * 6}
            fill={COLORS.you}
            stroke={COLORS.wall}
            strokeWidth={unit * 1.4}
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
