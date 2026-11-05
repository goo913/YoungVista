import { LuInfo } from 'react-icons/lu';
import {
  formatArea,
  formatLength,
  roomArea,
  roomPerimeter,
  wallLengths,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Measurements and wall lengths, plus the "check with a tape" note. */
export function RoomFacts({ room, units }: { room: Room; units: UnitSystem }) {
  const lengths = wallLengths(room);
  const stats = [
    { label: 'Floor area', value: formatArea(roomArea(room), units) },
    { label: 'Perimeter', value: formatLength(roomPerimeter(room), units) },
    { label: 'Ceiling height', value: formatLength(room.ceilingHeight, units) },
    { label: 'Walls', value: String(room.walls.length) },
  ];
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Measurements</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-1">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="text-base font-medium tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Walls</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-2 gap-x-4 gap-y-1.5 lg:grid-cols-1">
            {room.walls.map((w, i) => (
              <li key={w.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">Wall {i + 1}</span>
                <span className="font-medium tabular-nums">
                  {formatLength(lengths[i] ?? 0, units)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <p className="flex gap-2 text-xs text-muted-foreground">
        <LuInfo className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Sizes from a phone scan are approximate. Check with a tape measure before buying for a tight
        space.
      </p>
    </>
  );
}
