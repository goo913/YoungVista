import {
  bounds,
  formatLength,
  inwardNormal,
  wallEndpoints,
  wallLengths,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { THEME } from '@/lib/theme';

/** SVG units per metre (centimetres keep text sizes sensible). */
const S = 100;

interface FloorPlanProps {
  room: Room;
  units: UnitSystem;
  /** Wall lengths and a scale bar. Off for thumbnails. */
  labels?: boolean;
  /** Walls (indices into room.walls) the scan did not see; drawn dashed. */
  inferredWalls?: readonly number[];
  /** Spoken description, e.g. "Floor plan of Bedroom, 132 sq ft". */
  title?: string;
  /**
   * 'width' (default): full width, as tall as the plan needs. 'fill': fills the parent's box and
   * fits the plan inside it (thumbnails, previews).
   */
  layout?: 'width' | 'fill';
}

/**
 * Top-down plan of a room, as on the website: +X to the right and +Z down the screen, the view
 * from above.
 */
export function FloorPlan({
  room,
  units,
  labels = true,
  inferredWalls = [],
  title,
  layout = 'width',
}: FloorPlanProps) {
  const { colorScheme } = useColorScheme();
  const c = THEME[colorScheme === 'dark' ? 'dark' : 'light'];
  const b = bounds(room.points);
  const size = Math.max(b.width, b.depth, 0.5);
  const font = Math.max(size * 0.035, 0.11) * S;
  const wall = Math.max(size * 0.012, 0.05) * S;
  const pad = labels ? font * 2.4 + wall : wall * 2;
  const scaleStrip = labels ? font * 1.6 : 0;
  const view = {
    x: b.minX * S - pad,
    y: b.minZ * S - pad,
    w: b.width * S + 2 * pad,
    h: b.depth * S + 2 * pad + scaleStrip,
  };
  const outline = room.points.map(([x, z]) => `${x * S},${z * S}`).join(' ');
  const lengths = wallLengths(room);
  const inferred = new Set(inferredWalls);

  return (
    <View
      style={
        layout === 'fill'
          ? { width: '100%', height: '100%' }
          : { width: '100%', aspectRatio: view.w / view.h }
      }
      accessible={Boolean(title)}
      accessibilityRole="image"
      accessibilityLabel={title}
    >
      <Svg width="100%" height="100%" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}>
        <Polygon points={outline} fill={c.planFill} />
        {room.walls.map((w, i) => {
          const { a, b: end } = wallEndpoints(room, w);
          const dashed = inferred.has(i);
          return (
            <Line
              key={w.id}
              x1={a.x * S}
              y1={a.z * S}
              x2={end.x * S}
              y2={end.z * S}
              stroke={dashed ? c.planInferred : c.foreground}
              strokeWidth={dashed ? wall * 0.6 : wall}
              strokeLinecap="round"
              strokeDasharray={dashed ? [wall * 1.5, wall * 1.5] : undefined}
            />
          );
        })}

        {labels
          ? room.walls.map((w, i) => {
              const { a, b: end } = wallEndpoints(room, w);
              const len = lengths[i] ?? 0;
              if (len * S < font * 2.5) return null; // too short to label
              const n = inwardNormal(a, end);
              const offset = wall / 2 + font * 0.85;
              const x = ((a.x + end.x) / 2) * S - n.x * offset;
              const y = ((a.z + end.z) / 2) * S - n.z * offset;
              let deg = (Math.atan2(end.z - a.z, end.x - a.x) * 180) / Math.PI;
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
                  transform={`rotate(${deg.toFixed(2)} ${x} ${y})`}
                >
                  {formatLength(len, units)}
                </SvgText>
              );
            })
          : null}

        {labels ? (
          <ScaleBar
            units={units}
            x={b.minX * S}
            y={b.maxZ * S + pad + font * 0.6}
            font={font}
            color={c.mutedForeground}
          />
        ) : null}
      </Svg>
    </View>
  );
}

function ScaleBar({
  units,
  x,
  y,
  font,
  color,
}: {
  units: UnitSystem;
  x: number;
  y: number;
  font: number;
  color: string;
}) {
  const meters = units === 'metric' ? 1 : 0.9144;
  const label = units === 'metric' ? '1 m' : '3 ft';
  const w = meters * S;
  const tick = font * 0.35;
  const stroke = font * 0.08;
  return (
    <G>
      <Line x1={x} y1={y} x2={x + w} y2={y} stroke={color} strokeWidth={stroke} />
      <Line x1={x} y1={y - tick} x2={x} y2={y + tick} stroke={color} strokeWidth={stroke} />
      <Line x1={x + w} y1={y - tick} x2={x + w} y2={y + tick} stroke={color} strokeWidth={stroke} />
      <SvgText
        x={x + w + font * 0.5}
        y={y}
        fontSize={font * 0.85}
        alignmentBaseline="central"
        fill={color}
      >
        {label}
      </SvgText>
    </G>
  );
}
