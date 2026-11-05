import type { CoverageGap, Vec2 } from '@youngvista/core';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import type { ScanDerived } from '@/scan/session';

/** The map always shows at least this much of the room around the phone (m). */
const MIN_SPAN = 4;
const HEADING_SPREAD = 30;

/** Screen direction for a core angle (degrees CCW from +X seen from above; +Z is down). */
const dir = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r), y: -Math.sin(r) };
};

/** A pie slice from `fromDeg` turning counter-clockwise by `sizeDeg`. */
function wedge(cx: number, cy: number, r: number, fromDeg: number, sizeDeg: number): string {
  if (sizeDeg >= 359.9) {
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  const a = dir(fromDeg);
  const b = dir(fromDeg + sizeDeg);
  const large = sizeDeg > 180 ? 1 : 0;
  // Counter-clockwise on screen is SVG's sweep-flag 0 (y points down).
  return `M ${cx} ${cy} L ${cx + a.x * r} ${cy + a.y * r} A ${r} ${r} 0 ${large} 0 ${cx + b.x * r} ${cy + b.y * r} Z`;
}

/**
 * Live top-down map of the scan, drawn like the floor plan (+X right, +Z down): the walls found
 * so far, the phone and the way it faces, and in red the directions with no wall yet.
 */
export function MiniMap({ derived, size = 152 }: { derived: ScanDerived; size?: number }) {
  const { walls, cameraFloor, headingDeg, coverage, pendingPoint, aim } = derived;

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

  const points: Vec2[] = walls.flatMap((w) => [w.a, w.b]);
  if (cameraFloor) points.push(cameraFloor);
  if (pendingPoint) points.push(pendingPoint);
  const focus = cameraFloor ?? points[0] ?? { x: 0, z: 0 };
  let minX = focus.x - MIN_SPAN / 2;
  let maxX = focus.x + MIN_SPAN / 2;
  let minZ = focus.z - MIN_SPAN / 2;
  let maxZ = focus.z + MIN_SPAN / 2;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ) * 1.15;
  const scale = size / span;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const sx = (p: Vec2) => (p.x - cx) * scale + size / 2;
  const sy = (p: Vec2) => (p.z - cz) * scale + size / 2;

  const openGaps: CoverageGap[] = coverage?.gaps.filter((g) => !g.bridged) ?? [];
  const gapCenter = coverage?.center;

  return (
    <View
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-2xl bg-black/55"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Map of the scan: ${walls.length} wall${walls.length === 1 ? '' : 's'} found`}
    >
      <Svg width={size} height={size}>
        {gapCenter
          ? openGaps.map((g, i) => (
              <Path
                key={`gap-${i}`}
                d={wedge(sx(gapCenter), sy(gapCenter), size * 1.5, g.fromDeg, g.sizeDeg)}
                fill="rgba(239, 68, 68, 0.28)"
              />
            ))
          : null}
        {walls.map((w, i) => (
          <Line
            key={`wall-${i}`}
            x1={sx(w.a)}
            y1={sy(w.a)}
            x2={sx(w.b)}
            y2={sy(w.b)}
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
        {cameraFloor && aim?.ok ? (
          <Line
            x1={sx(cameraFloor)}
            y1={sy(cameraFloor)}
            x2={sx(aim.point)}
            y2={sy(aim.point)}
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth={1}
            strokeDasharray={[3, 3]}
          />
        ) : null}
        {pendingPoint ? (
          <Circle cx={sx(pendingPoint)} cy={sy(pendingPoint)} r={4} fill="#facc15" />
        ) : null}
        {cameraFloor ? (
          <G>
            {headingDeg !== null ? (
              <Path
                d={wedge(
                  sx(cameraFloor),
                  sy(cameraFloor),
                  Math.min(size / 4, 0.9 * scale),
                  headingDeg - HEADING_SPREAD,
                  2 * HEADING_SPREAD,
                )}
                fill="rgba(56, 189, 248, 0.45)"
              />
            ) : null}
            <Circle
              cx={sx(cameraFloor)}
              cy={sy(cameraFloor)}
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
