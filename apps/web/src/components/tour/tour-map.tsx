/**
 * The 360° view's mini-map: the room's plan seen from above (+x right, +z down, as the floor plan
 * draws it), the furniture, a dot per spot, and a cone for where the camera looks. Click a dot, or
 * anywhere on the plan for the nearest spot, to move there.
 */
import { useMemo, useSyncExternalStore, type MouseEvent } from 'react';
import {
  bounds,
  nearestTourSpot,
  type Room,
  type RoomTour,
  type RoomTourSpot,
} from '@youngvista/core';
import type { FurnitureEntry } from '@/lib/furniture';
import { cn } from '@/lib/utils';
import type { TourRig } from './tour-rig';

interface TourMapProps {
  room: Room;
  tour: RoomTour;
  rig: TourRig;
  /** The spot the camera stands on. */
  current: number | null;
  /** The spot being moved to (its dot pulses). */
  pending: number | null;
  /** Drawn when shown in the view. */
  furniture: readonly FurnitureEntry[];
  onPick: (spot: RoomTourSpot) => void;
  className?: string;
}

const PAD = 0.35;

export function TourMap({
  room,
  tour,
  rig,
  current,
  pending,
  furniture,
  onPick,
  className,
}: TourMapProps) {
  const view = useSyncExternalStore(rig.subscribe, rig.getView);
  const box = useMemo(() => bounds(room.points), [room]);
  const size = Math.max(box.width, box.depth, 1);
  const r = Math.max(0.12, size * 0.035);
  const outline = useMemo(
    () => `M${room.points.map(([x, z]) => `${x} ${z}`).join(' L')} Z`,
    [room],
  );
  const cone = useMemo(() => {
    const reach = Math.min(Math.max(size * 0.3, 0.8), 2.4);
    const half = Math.min(view.hfov, 170) / 2;
    const at = (h: number) => {
      const a = (h * Math.PI) / 180;
      return `${view.x + Math.sin(a) * reach} ${view.z + Math.cos(a) * reach}`;
    };
    // Rising headings turn counter-clockwise on the plan: SVG's sweep flag 0.
    return `M${view.x} ${view.z} L${at(view.heading - half)} A${reach} ${reach} 0 0 0 ${at(view.heading + half)} Z`;
  }, [view, size]);

  const pickAt = (e: MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    onPick(nearestTourSpot(tour, { x: p.x, z: p.y }));
  };

  return (
    <div
      className={cn(
        'rounded-lg border bg-background/85 p-1.5 shadow-sm backdrop-blur-sm',
        className,
      )}
      data-tour-map=""
    >
      <svg
        viewBox={`${box.minX - PAD} ${box.minZ - PAD} ${box.width + 2 * PAD} ${box.depth + 2 * PAD}`}
        className="block h-auto max-h-36 w-full cursor-pointer"
        style={{ aspectRatio: `${box.width + 2 * PAD} / ${box.depth + 2 * PAD}` }}
        role="group"
        aria-label="Map of the room: the spots, and where you are looking"
        onClick={pickAt}
      >
        <path
          d={outline}
          className="fill-muted stroke-foreground/70"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {furniture.map((f) => (
          <polygon
            key={f.item.id}
            points={f.footprint.corners.map((c) => `${c.x},${c.z}`).join(' ')}
            className="fill-foreground/20"
          />
        ))}
        {current !== null ? <path d={cone} className="fill-primary/30" /> : null}
        {tour.spots.map((s) => {
          const here = s.spot === current && !view.moving;
          const label =
            tour.spots.length > 1
              ? `Go to spot ${s.spot + 1}`
              : 'The spot the pictures were taken from';
          return (
            <circle
              key={s.spot}
              cx={s.position[0]}
              cy={s.position[2]}
              r={r}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-current={here ? 'location' : undefined}
              className={cn(
                'fill-background stroke-primary outline-none focus-visible:stroke-ring',
                s.spot === pending && 'animate-pulse',
              )}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              onClick={(e) => {
                e.stopPropagation();
                onPick(s);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(s);
                }
              }}
            />
          );
        })}
        {/* Where the camera is (it travels along while moving). */}
        {current !== null ? (
          <circle
            cx={view.x}
            cy={view.z}
            r={r * 0.62}
            className="pointer-events-none fill-primary stroke-background"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
    </div>
  );
}
