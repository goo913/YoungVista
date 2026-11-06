/**
 * Pieces of the top-down plan shared by the room page, the furniture plan and the room editor:
 * doors, windows and openings in the walls, and furniture footprints. Each takes `pt`, which
 * turns room metres into drawing coordinates, and `unit`, drawing units per metre (for line widths).
 */
import {
  inwardNormal,
  openingSegment,
  type Footprint,
  type Opening,
  type Room,
  type Vec2,
} from '@youngvista/core';
import { G, Line, Path, Polygon } from 'react-native-svg';

export type ToDrawing = (p: Vec2) => { x: number; y: number };

export interface PlanColors {
  background: string;
  wall: string;
  door: string;
  glass: string;
}

/** Doors (leaf and swing), windows (glass across the gap) and openings (a gap) in the walls. */
export function OpeningShapes({
  room,
  pt,
  wallWidth,
  colors,
  highlightId,
  highlightColor,
}: {
  room: Room;
  pt: ToDrawing;
  /** Stroke width of the walls, in drawing units. */
  wallWidth: number;
  colors: PlanColors;
  highlightId?: string | null;
  highlightColor?: string;
}) {
  return (
    <G>
      {room.walls.flatMap((wall) =>
        wall.openings.map((o) => (
          <OpeningShape
            key={o.id}
            room={room}
            wallId={wall.id}
            opening={o}
            pt={pt}
            wallWidth={wallWidth}
            colors={colors}
            highlight={o.id === highlightId ? highlightColor : undefined}
          />
        )),
      )}
    </G>
  );
}

function OpeningShape({
  room,
  wallId,
  opening,
  pt,
  wallWidth,
  colors,
  highlight,
}: {
  room: Room;
  wallId: string;
  opening: Opening;
  pt: ToDrawing;
  wallWidth: number;
  colors: PlanColors;
  highlight?: string;
}) {
  const seg = openingSegment(room, wallId, opening);
  if (!seg) return null;
  const a = pt(seg.a);
  const b = pt(seg.b);
  const thin = Math.max(wallWidth * 0.18, 1);
  // Clear the wall where the opening is.
  const gap = (
    <Line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={colors.background}
      strokeWidth={wallWidth * 1.15}
    />
  );
  const accent = highlight ?? colors.door;
  if (opening.type === 'window') {
    return (
      <G>
        {gap}
        <Line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={highlight ?? colors.glass}
          strokeWidth={wallWidth * 0.75}
        />
        <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={accent} strokeWidth={thin} />
      </G>
    );
  }
  const n = inwardNormal(seg.a, seg.b);
  const ends = (
    <G>
      {[seg.a, seg.b].map((p, i) => {
        const o = pt({ x: p.x + n.x * 0.06, z: p.z + n.z * 0.06 });
        const q = pt({ x: p.x - n.x * 0.06, z: p.z - n.z * 0.06 });
        return (
          <Line key={i} x1={o.x} y1={o.y} x2={q.x} y2={q.y} stroke={accent} strokeWidth={thin} />
        );
      })}
    </G>
  );
  if (opening.type === 'opening') {
    return (
      <G>
        {gap}
        {highlight ? (
          <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={highlight} strokeWidth={thin * 2} />
        ) : null}
        {ends}
      </G>
    );
  }
  // A door: the leaf stands open into the room from the hinge at the start, with its swing.
  const leafEnd = pt({ x: seg.a.x + n.x * opening.width, z: seg.a.z + n.z * opening.width });
  const radius = Math.hypot(leafEnd.x - a.x, leafEnd.y - a.y);
  // Sweep direction: whichever way turns the leaf onto the wall's far end.
  const cross = (leafEnd.x - a.x) * (b.y - a.y) - (leafEnd.y - a.y) * (b.x - a.x);
  return (
    <G>
      {gap}
      <Line
        x1={a.x}
        y1={a.y}
        x2={leafEnd.x}
        y2={leafEnd.y}
        stroke={accent}
        strokeWidth={thin * 1.6}
      />
      <Path
        d={`M ${leafEnd.x} ${leafEnd.y} A ${radius} ${radius} 0 0 ${cross > 0 ? 1 : 0} ${b.x} ${b.y}`}
        stroke={accent}
        strokeWidth={thin}
        strokeDasharray={[thin * 3, thin * 2]}
        fill="none"
      />
      {ends}
    </G>
  );
}

export interface FootprintStyle {
  fill: string;
  stroke: string;
  /** The item's front edge. */
  front: string;
}

/** A piece of furniture seen from above, with its front edge drawn thicker. */
export function FootprintShape({
  footprint,
  pt,
  style,
  strokeWidth,
}: {
  footprint: Footprint;
  pt: ToDrawing;
  style: FootprintStyle;
  strokeWidth: number;
}) {
  const c = footprint.corners.map(pt);
  const points = c.map((p) => `${p.x},${p.y}`).join(' ');
  // corners: back-left, front-left, front-right, back-right.
  return (
    <G>
      <Polygon
        points={points}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Line
        x1={c[1]!.x}
        y1={c[1]!.y}
        x2={c[2]!.x}
        y2={c[2]!.y}
        stroke={style.front}
        strokeWidth={strokeWidth * 2.2}
        strokeLinecap="round"
      />
    </G>
  );
}
