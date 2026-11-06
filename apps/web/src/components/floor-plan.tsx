import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  bounds,
  facingRotation,
  formatLength,
  inwardNormal,
  wallEndpoints,
  wallLengths,
  type Room,
  type UnitSystem,
  type Vec2,
} from '@youngvista/core';
import { formatDimensions, type FurnitureEntry } from '@/lib/furniture';
import { cn } from '@/lib/utils';

/** SVG units per metre. Working in centimetres keeps text sizes sensible in every browser. */
const S = 100;
/** A press that moves less than this (px) is a click, not a drag (the phone's pan starts at 4). */
const DRAG_SLOP = 4;

/**
 * Furnishing on the plan: the same actions as the 3D view and the phone (core's design reducer),
 * so every view shows the same design.
 */
export interface PlanEdit {
  selectedId: string | null;
  /** Pieces outside the room or on top of another: drawn red. */
  invalid: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onDragStart: (id: string) => void;
  /** The piece's centre should go here (m). */
  onDragMove: (x: number, z: number) => void;
  onRotateStart: (id: string) => void;
  /** The piece should face this way (degrees); it snaps to 15° steps. */
  onRotateMove: (rotationY: number) => void;
  onGestureEnd: () => void;
  onGestureCancel: () => void;
}

interface FloorPlanProps {
  room: Room;
  units: UnitSystem;
  /** Wall lengths and a scale bar. Off for thumbnails. */
  labels?: boolean;
  /** Furniture footprints to draw. */
  furniture?: readonly FurnitureEntry[];
  /** Accessible description, e.g. "Floor plan of Bedroom, 132 sq ft". */
  title?: string;
  className?: string;
  /** Drag, select and turn pieces (the owner's room page). */
  edit?: PlanEdit;
}

const pts = (ps: readonly Vec2[]) => ps.map((p) => `${p.x * S},${p.z * S}`).join(' ');

type Press =
  | { kind: 'item'; id: string; start: { x: number; y: number }; grab: Vec2; dragging: boolean }
  | { kind: 'turn'; id: string; center: Vec2 }
  | { kind: 'empty'; start: { x: number; y: number } };

/**
 * Top-down plan of a room: +X to the right and +Z down the page, which is the view from above
 * (so counter-clockwise rooms stay counter-clockwise on screen).
 */
export function FloorPlan({
  room,
  units,
  labels = true,
  furniture = [],
  title,
  className,
  edit,
}: FloorPlanProps) {
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const press = useRef<Press | null>(null);
  const selected = edit ? edit.selectedId : ownSelected;
  const select = (id: string | null) => (edit ? edit.onSelect(id) : setOwnSelected(id));

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
  // Rugs first, so furniture is drawn on top of them.
  const ordered = [...furniture].sort((p, q) => Number(q.flat) - Number(p.flat));
  const shown = furniture.find((f) => f.item.id === (hovered ?? selected));
  const chosen = edit && selected ? furniture.find((f) => f.item.id === selected) : undefined;

  /** The pointer on the floor, in metres. */
  const floorAt = (e: { clientX: number; clientY: number }): Vec2 | null => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x / S, z: p.y / S };
  };

  const onItemDown = (e: ReactPointerEvent, entry: FurnitureEntry) => {
    if (!edit || e.button !== 0) return;
    e.stopPropagation();
    const at = floorAt(e);
    if (!at) return;
    svg.current?.setPointerCapture(e.pointerId);
    press.current = {
      kind: 'item',
      id: entry.item.id,
      start: { x: e.clientX, y: e.clientY },
      // Keep the piece where the pointer holds it, not centred under it.
      grab: { x: entry.item.x - at.x, z: entry.item.z - at.z },
      dragging: false,
    };
  };

  const onTurnDown = (e: ReactPointerEvent, entry: FurnitureEntry) => {
    if (!edit || e.button !== 0) return;
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    press.current = { kind: 'turn', id: entry.item.id, center: entry.footprint.center };
    edit.onRotateStart(entry.item.id);
  };

  const onDown = (e: ReactPointerEvent) => {
    if (!edit || e.button !== 0) return;
    press.current = { kind: 'empty', start: { x: e.clientX, y: e.clientY } };
  };

  const onMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!edit || !p) return;
    if (p.kind === 'turn') {
      const at = floorAt(e);
      if (!at) return;
      const dir = { x: at.x - p.center.x, z: at.z - p.center.z };
      if (Math.hypot(dir.x, dir.z) > 1e-3) edit.onRotateMove(facingRotation(dir));
      return;
    }
    if (p.kind !== 'item') return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) < DRAG_SLOP) return;
      p.dragging = true;
      edit.onDragStart(p.id);
    }
    const at = floorAt(e);
    if (at) edit.onDragMove(at.x + p.grab.x, at.z + p.grab.z);
  };

  const onUp = (e: ReactPointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!edit || !p) return;
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    if (p.kind === 'turn') edit.onGestureEnd();
    else if (p.kind === 'item') {
      if (p.dragging) edit.onGestureEnd();
      else edit.onSelect(p.id);
    } else if (Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) < DRAG_SLOP) {
      edit.onSelect(null);
    }
  };

  const onCancel = () => {
    const p = press.current;
    press.current = null;
    if (edit && p && (p.kind === 'turn' || (p.kind === 'item' && p.dragging))) {
      edit.onGestureCancel();
    }
  };

  return (
    <svg
      ref={svg}
      viewBox={view.join(' ')}
      // A group when the furniture can be focused and tapped; a plain image otherwise.
      role={labels && (furniture.length || edit) ? 'group' : 'img'}
      aria-label={title}
      className={cn('block h-auto w-full select-none', edit && 'touch-none', className)}
      onClick={edit ? undefined : () => setOwnSelected(null)}
      onPointerDown={edit ? onDown : undefined}
      onPointerMove={edit ? onMove : undefined}
      onPointerUp={edit ? onUp : undefined}
      onPointerCancel={edit ? onCancel : undefined}
      onLostPointerCapture={edit ? onCancel : undefined}
      data-plan-editor={edit ? '' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <polygon points={outline} className="fill-primary/5" />

      {ordered.map((f) => (
        <FurnitureShape
          key={f.item.id}
          entry={f}
          units={units}
          stroke={wall * 0.22}
          active={f.item.id === selected || f.item.id === hovered}
          invalid={edit?.invalid.has(f.item.id) ?? false}
          interactive={labels}
          editable={!!edit}
          onSelect={() => select(edit ? f.item.id : selected === f.item.id ? null : f.item.id)}
          onHover={(on) => setHovered(on ? f.item.id : null)}
          onPointerDown={(e) => onItemDown(e, f)}
        />
      ))}

      <polygon
        points={outline}
        fill="none"
        strokeWidth={wall}
        strokeLinejoin="round"
        className="pointer-events-none stroke-foreground"
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
            <g key={`${w.id}-${o.id}`} className="pointer-events-none">
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
                className="pointer-events-none fill-foreground stroke-background font-medium tabular-nums"
              >
                {formatLength(len, units)}
              </text>
            );
          })
        : null}

      {chosen ? (
        <TurnHandle
          entry={chosen}
          size={font * 0.55}
          stroke={wall * 0.22}
          onPointerDown={(e) => onTurnDown(e, chosen)}
        />
      ) : null}

      {labels && shown ? <FurnitureLabel entry={shown} font={font} /> : null}

      {labels ? (
        <ScaleBar units={units} x={b.minX * S} y={b.maxZ * S + pad + font * 0.6} font={font} />
      ) : null}
    </svg>
  );
}

function FurnitureShape({
  entry,
  units,
  stroke,
  active,
  invalid,
  interactive,
  editable,
  onSelect,
  onHover,
  onPointerDown,
}: {
  entry: FurnitureEntry;
  units: UnitSystem;
  stroke: number;
  active: boolean;
  invalid: boolean;
  interactive: boolean;
  editable: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  const { footprint: fp, front, flat, product } = entry;
  // A small triangle just inside the front edge shows which way the item faces.
  const along = Math.min(fp.halfDepth * 0.5, fp.halfWidth * 0.6, 0.18);
  const apex = {
    x: fp.center.x + front.x * (fp.halfDepth - Math.min(fp.halfDepth * 0.12, 0.04)),
    z: fp.center.z + front.z * (fp.halfDepth - Math.min(fp.halfDepth * 0.12, 0.04)),
  };
  const base = { x: apex.x - front.x * along, z: apex.z - front.z * along };
  const half = along * 0.8;
  const marker = [
    apex,
    { x: base.x + fp.axisX.x * half, z: base.z + fp.axisX.z * half },
    { x: base.x - fp.axisX.x * half, z: base.z - fp.axisX.z * half },
  ];
  const description = product
    ? `${entry.name}${entry.variantName ? ` (${entry.variantName})` : ''}, ${formatDimensions(product.dimensions, units)}`
    : entry.name;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };
  return (
    <g
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? description : undefined}
      aria-pressed={editable ? active : undefined}
      data-item-id={entry.item.id}
      onClick={
        interactive && !editable
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      onPointerDown={editable ? onPointerDown : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onPointerEnter={interactive ? (e) => e.pointerType === 'mouse' && onHover(true) : undefined}
      onPointerLeave={interactive ? () => onHover(false) : undefined}
      onFocus={interactive ? () => onHover(true) : undefined}
      onBlur={interactive ? () => onHover(false) : undefined}
      className={cn('outline-none', interactive && (editable ? 'cursor-grab' : 'cursor-pointer'))}
    >
      <title>{description}</title>
      <polygon
        points={pts(fp.corners)}
        strokeWidth={active ? stroke * 2 : stroke}
        strokeLinejoin="round"
        strokeDasharray={flat || !product ? `${stroke * 3} ${stroke * 2}` : undefined}
        className={cn(
          'transition-[stroke-width]',
          invalid
            ? 'fill-red-600/25 stroke-red-700'
            : flat
              ? active
                ? 'fill-amber-500/20 stroke-amber-700'
                : 'fill-amber-500/10 stroke-amber-700/70'
              : product
                ? active
                  ? 'fill-sky-600/30 stroke-sky-800'
                  : 'fill-sky-600/15 stroke-sky-700'
                : 'fill-muted-foreground/10 stroke-muted-foreground',
        )}
      />
      {!flat ? (
        <polygon
          points={pts(marker)}
          className={invalid ? 'fill-red-700' : product ? 'fill-sky-700' : 'fill-muted-foreground'}
        />
      ) : null}
    </g>
  );
}

/** The selected piece's turn handle: a knob in front of it; drag it round to turn the piece. */
function TurnHandle({
  entry,
  size,
  stroke,
  onPointerDown,
}: {
  entry: FurnitureEntry;
  size: number;
  stroke: number;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  const { footprint: fp, front } = entry;
  const reach = fp.halfDepth + Math.max(0.18, size / S);
  const knob = { x: (fp.center.x + front.x * reach) * S, y: (fp.center.z + front.z * reach) * S };
  const edge = {
    x: (fp.center.x + front.x * fp.halfDepth) * S,
    y: (fp.center.z + front.z * fp.halfDepth) * S,
  };
  return (
    <g data-turn-handle="" className="cursor-grab" onPointerDown={onPointerDown} aria-hidden>
      <line
        x1={edge.x}
        y1={edge.y}
        x2={knob.x}
        y2={knob.y}
        strokeWidth={stroke}
        className="pointer-events-none stroke-sky-800"
      />
      <circle
        cx={knob.x}
        cy={knob.y}
        r={size}
        className="fill-background stroke-sky-800"
        strokeWidth={stroke * 1.4}
      />
      <path
        d={`M ${knob.x - size * 0.5} ${knob.y + size * 0.15} A ${size * 0.5} ${size * 0.5} 0 1 1 ${knob.x + size * 0.15} ${knob.y + size * 0.5}`}
        fill="none"
        strokeWidth={stroke * 1.1}
        className="pointer-events-none stroke-sky-800"
      />
    </g>
  );
}

function FurnitureLabel({ entry, font }: { entry: FurnitureEntry; font: number }) {
  const { x, z } = entry.footprint.center;
  return (
    <text
      x={x * S}
      y={z * S}
      fontSize={font * 0.95}
      textAnchor="middle"
      dominantBaseline="central"
      strokeWidth={font * 0.35}
      paintOrder="stroke"
      className="pointer-events-none fill-foreground stroke-background font-semibold"
    >
      {entry.name}
    </text>
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
    <g
      className="pointer-events-none stroke-muted-foreground"
      strokeWidth={font * 0.08}
      aria-hidden
    >
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
