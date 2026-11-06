import { toRoomFrame, type RoomAxes, type Vec2 } from '@youngvista/core';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import type { ScanDerived } from '@/scan/session';

/** The map always shows at least this much of the room around the phone (m). */
const MIN_SPAN = 4;
const HEADING_SPREAD = 30;

interface Pt {
  x: number;
  y: number;
}

/**
 * Map coordinates: once the first wall is marked, the room's own frame (walls run straight across
 * and down the map); before, the world seen from above (+X right, +Z down).
 */
const mapper =
  (axes: RoomAxes | null) =>
  (p: Vec2): Pt => {
    if (!axes) return { x: p.x, y: p.z };
    const [a, b] = toRoomFrame(axes, p);
    return { x: a, y: b };
  };

/** A pie slice around screen angle `centerDeg` (counter-clockwise on screen, y down). */
function wedge(cx: number, cy: number, r: number, centerDeg: number, spreadDeg: number): string {
  const at = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(rad) * r, y: cy - Math.sin(rad) * r };
  };
  const a = at(centerDeg - spreadDeg);
  const b = at(centerDeg + spreadDeg);
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 0 0 ${b.x} ${b.y} Z`;
}

/**
 * Live top-down map of the scan: the walls marked so far (red when they do not fit, dashed when
 * filled in), the room once it closes, the marks, the phone and the way it faces.
 */
export function MiniMap({ derived, size = 152 }: { derived: ScanDerived; size?: number }) {
  const { walls, cameraFloor, headingDeg, aim, axes, room, marks, firstWall } = derived;

  if (!derived.floor) {
    return (
      <View
        style={{ width: size, height: size }}
        className="items-center justify-center rounded-2xl bg-black/55 p-3"
      >
        <Text className="text-center text-xs text-white/80">
          The map starts once the floor is found
        </Text>
      </View>
    );
  }

  const map = mapper(axes);
  const outline = room?.ok ? room.room.points.map(([x, z]) => map({ x, z })) : [];
  const lines = walls.map((w) => ({ ...w, p: map(w.a), q: map(w.b) }));
  const dots = marks.flatMap((m) => (m.point ? [{ ...m, p: map(m.point) }] : []));
  const camera = cameraFloor ? map(cameraFloor) : null;
  const target = aim.point ? map(aim.point) : null;
  const pending = derived.step === 'second-mark' && firstWall.a ? map(firstWall.a) : null;

  const points: Pt[] = [
    ...outline,
    ...lines.flatMap((l) => [l.p, l.q]),
    ...dots.map((d) => d.p),
    ...(camera ? [camera] : []),
  ];
  const focus = camera ?? points[0] ?? { x: 0, y: 0 };
  let minX = focus.x - MIN_SPAN / 2;
  let maxX = focus.x + MIN_SPAN / 2;
  let minY = focus.y - MIN_SPAN / 2;
  let maxY = focus.y + MIN_SPAN / 2;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY) * 1.15;
  const scale = size / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const sx = (p: Pt) => (p.x - cx) * scale + size / 2;
  const sy = (p: Pt) => (p.y - cy) * scale + size / 2;

  // The heading, turned into the map's frame, as a screen angle.
  let headingScreen: number | null = null;
  if (headingDeg !== null) {
    const r = (headingDeg * Math.PI) / 180;
    const h = map({ x: Math.cos(r), z: -Math.sin(r) });
    const o = map({ x: 0, z: 0 });
    headingScreen = (Math.atan2(-(h.y - o.y), h.x - o.x) * 180) / Math.PI;
  }

  const n = walls.length;
  return (
    <View
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-2xl bg-black/55"
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        room?.ok
          ? 'Map of the scan: the room is closed'
          : `Map of the scan: ${n} wall${n === 1 ? '' : 's'} marked`
      }
    >
      <Svg width={size} height={size}>
        {outline.length >= 3 ? (
          <Polygon
            points={outline.map((p) => `${sx(p)},${sy(p)}`).join(' ')}
            fill="rgba(74, 222, 128, 0.22)"
          />
        ) : null}
        {lines.map((l, i) => (
          <Line
            key={`wall-${i}`}
            x1={sx(l.p)}
            y1={sy(l.p)}
            x2={sx(l.q)}
            y2={sy(l.q)}
            stroke={l.conflict ? '#ef4444' : l.fromPlanes ? '#38bdf8' : '#ffffff'}
            strokeWidth={l.inferred ? 1.5 : 3}
            strokeDasharray={l.inferred ? [4, 3] : undefined}
            strokeLinecap="round"
          />
        ))}
        {camera && target ? (
          <Line
            x1={sx(camera)}
            y1={sy(camera)}
            x2={sx(target)}
            y2={sy(target)}
            stroke={aim.ok ? 'rgba(74, 222, 128, 0.8)' : 'rgba(251, 191, 36, 0.8)'}
            strokeWidth={1}
            strokeDasharray={[3, 3]}
          />
        ) : null}
        {pending && target ? (
          <Line
            x1={sx(pending)}
            y1={sy(pending)}
            x2={sx(target)}
            y2={sy(target)}
            stroke="#facc15"
            strokeWidth={2}
          />
        ) : null}
        {dots.map((d) => (
          <Circle
            key={`mark-${d.id}`}
            cx={sx(d.p)}
            cy={sy(d.p)}
            r={3}
            fill={d.role === 'first' ? '#facc15' : d.edge === 'ceiling' ? '#22d3ee' : '#ffffff'}
          />
        ))}
        {camera ? (
          <G>
            {headingScreen !== null ? (
              <Path
                d={wedge(
                  sx(camera),
                  sy(camera),
                  Math.min(size / 4, 0.9 * scale),
                  headingScreen,
                  HEADING_SPREAD,
                )}
                fill="rgba(56, 189, 248, 0.45)"
              />
            ) : null}
            <Circle
              cx={sx(camera)}
              cy={sy(camera)}
              r={5}
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth={1.5}
            />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}
