import { Link, useParams } from 'react-router';
import { LuArrowLeft, LuInfo, LuMapPinOff, LuTriangleAlert } from 'react-icons/lu';
import {
  formatArea,
  formatLength,
  roomArea,
  roomPerimeter,
  wallLengths,
  type Room,
  type UnitSystem,
} from '@youngvista/core';
import { FloorPlan } from '@/components/floor-plan';
import { PageSpinner } from '@/components/page-spinner';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { useRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/use-units';

/** Route element: a fresh page per room id, so one room's data never shows under another's URL. */
export function RoomRoute() {
  const { roomId = '' } = useParams();
  return <RoomPage key={roomId} roomId={roomId} />;
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
      <Link to="/">
        <LuArrowLeft aria-hidden />
        All rooms
      </Link>
    </Button>
  );
}

function RoomPage({ roomId }: { roomId: string }) {
  const state = useRoom(roomId);
  const [units, setUnits] = useUnits();

  if (state.status === 'loading') return <PageSpinner label="Loading room" />;

  if (state.status === 'missing' || state.status === 'error') {
    return (
      <div className="grid gap-6">
        <title>Room not found · YoungVista</title>
        <BackLink />
        {state.status === 'error' ? (
          <Alert variant="destructive">
            <LuTriangleAlert aria-hidden />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : (
          <Card className="items-center px-6 py-12 text-center">
            <LuMapPinOff className="size-8 text-muted-foreground" aria-hidden />
            <div className="grid gap-1">
              <h1 className="text-base font-medium">Room not found</h1>
              <p className="text-muted-foreground">
                It may have been deleted, or it belongs to another account.
              </p>
            </div>
          </Card>
        )}
      </div>
    );
  }

  const { name, room, updatedAt } = state.data;
  return (
    <div className="grid gap-6">
      <title>{`${name} · YoungVista`}</title>
      <div className="grid gap-3">
        <BackLink />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-sm text-muted-foreground">Updated {formatDate(updatedAt)}</p>
          </div>
          <UnitsToggle value={units} onChange={setUnits} />
        </div>
      </div>
      {room ? (
        <RoomDetails name={name} room={room} units={units} />
      ) : (
        <Card className="px-6 py-12 text-center text-muted-foreground">
          This room has no floor plan yet. Finish the scan in the phone app.
        </Card>
      )}
    </div>
  );
}

function RoomDetails({ name, room, units }: { name: string; room: Room; units: UnitSystem }) {
  const area = roomArea(room);
  const lengths = wallLengths(room);
  const stats = [
    { label: 'Floor area', value: formatArea(area, units) },
    { label: 'Perimeter', value: formatLength(roomPerimeter(room), units) },
    { label: 'Ceiling height', value: formatLength(room.ceilingHeight, units) },
    { label: 'Walls', value: String(room.walls.length) },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <CardContent className="flex justify-center">
          <FloorPlan
            room={room}
            units={units}
            title={`Floor plan of ${name}, ${formatArea(area, units)}`}
            className="max-h-[70vh]"
          />
        </CardContent>
      </Card>
      <div className="grid content-start gap-4">
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
          Sizes from a phone scan are approximate. Check with a tape measure before buying for a
          tight space.
        </p>
      </div>
    </div>
  );
}
