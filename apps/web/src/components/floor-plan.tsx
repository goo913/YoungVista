import {
  bounds,
  formatLength,
  inwardNormal,
  wallEndpoints,
  wallLengths,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { cn } from '@/lib/utils';

/** SVG units per metre. Working in centimetres keeps text sizes sensible in every browser. */
const S = 100;

interface FloorPlanProps {
  room: Room;
  units: UnitSystem;
  /** Wall lengths and a scale bar. Off for thumbnails. */
  labels?: boolean;
  /** Accessible description, e.g. "Floor plan of Bedroom, 132 sq ft". */
  title?: string;
  className?: string;
}

/**
 * Top-down plan of a room: +X to the right and +Z down the page, which is the view from above
 * (so counter-clockwise rooms stay counter-clockwise on screen).
 */
export function FloorPlan({ room, units, labels = true, title, className }: FloorPlanProps) {
  const b = bounds(room.points);
  const size = Math.max(b.width, b.depth, 0.5);
  const font = Math.max(size * 0.035, 0.11) * S;
  const wall = Math.max(size * 0.012, 0.05) * S;
  const pad = labels ? font * 2.4 + wall : wall * 2;
  // With labels, a strip below the bottom wall labels holds the scale bar.
  const scaleStrip = labels ? font * 1.6 : 0;
  const view = [
    b.minX * S - pad,
    b.minZ * S - pad,
    b.width * S + 2 * pad,
    b.depth * S + 2 * pad + scaleStrip,
  ];
  const outline = room.points.map(([x, z]) => `${x * S},${z * S}`).join(' ');
  const lengths = wallLengths(room);

  return (
    <svg
      viewBox={view.join(' ')}
      role="img"
      aria-label={title}
      className={cn('block h-auto w-full select-none', className)}
    >
      {title ? <title>{title}</title> : null}
      <polygon points={outline} className="fill-primary/5" />
      <polygon
        points={outline}
        fill="none"
        strokeWidth={wall}
        strokeLinejoin="round"
        className="stroke-foreground"
      />

      {room.walls.flatMap((w) => {
        const { a, b: end } = wallEndpoints(room, w);
        const len = Math.hypot(end.x - a.x, end.z - a.z);
        if (len === 0) return [];
        return w.openings.map((o) => {
          const t0 = Math.max(0, o.offset / len);
          const t1 = Math.min(1, (o.offset + o.width) / len);
          const x1 = (a.x + (end.x - a.x) * t0) * S;
          const y1 = (a.z + (end.z - a.z) * t0) * S;
          const x2 = (a.x + (end.x - a.x) * t1) * S;
          const y2 = (a.z + (end.z - a.z) * t1) * S;
          return (
            <g key={`${w.id}-${o.id}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={wall * 1.3}
                className="stroke-background"
              />
              {o.type !== 'opening' ? (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={wall * 0.4}
                  className={o.type === 'door' ? 'stroke-primary' : 'stroke-sky-500'}
                />
              ) : null}
            </g>
          );
        });
      })}

      {labels
        ? room.walls.map((w, i) => {
            const { a, b: end } = wallEndpoints(room, w);
            const len = lengths[i] ?? 0;
            if (len * S < font * 2.5) return null; // too short to label on the plan
            const n = inwardNormal(a, end);
            const offset = wall / 2 + font * 0.85;
            const x = ((a.x + end.x) / 2) * S - n.x * offset;
            const y = ((a.z + end.z) / 2) * S - n.z * offset;
            let deg = (Math.atan2(end.z - a.z, end.x - a.x) * 180) / Math.PI;
            if (deg > 90) deg -= 180;
            if (deg < -90) deg += 180;
            return (
              <text
                key={w.id}
                x={x}
                y={y}
                fontSize={font}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${deg.toFixed(2)} ${x} ${y})`}
                strokeWidth={font * 0.3}
                paintOrder="stroke"
                className="fill-foreground stroke-background font-medium tabular-nums"
              >
                {formatLength(len, units)}
              </text>
            );
          })
        : null}

      {labels ? (
        <ScaleBar units={units} x={b.minX * S} y={b.maxZ * S + pad + font * 0.6} font={font} />
      ) : null}
    </svg>
  );
}

function ScaleBar({
  units,
  x,
  y,
  font,
}: {
  units: UnitSystem;
  x: number;
  y: number;
  font: number;
}) {
  const meters = units === 'metric' ? 1 : 0.9144;
  const label = units === 'metric' ? '1 m' : '3 ft';
  const w = meters * S;
  const tick = font * 0.35;
  return (
    <g className="stroke-muted-foreground" strokeWidth={font * 0.08} aria-hidden>
      <line x1={x} y1={y} x2={x + w} y2={y} />
      <line x1={x} y1={y - tick} x2={x} y2={y + tick} />
      <line x1={x + w} y1={y - tick} x2={x + w} y2={y + tick} />
      <text
        x={x + w + font * 0.5}
        y={y}
        fontSize={font * 0.85}
        dominantBaseline="central"
        stroke="none"
        className="fill-muted-foreground"
      >
        {label}
      </text>
    </g>
  );
}
