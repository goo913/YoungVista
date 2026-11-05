import { Link } from 'react-router';
import { LuScanLine, LuSquareDashed, LuTriangleAlert } from 'react-icons/lu';
import { formatArea, roomArea, type UnitSystem } from '@youngvista/core';
import { FloorPlan } from '@/components/floor-plan';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useRooms, type RoomSummary } from '@/lib/rooms';
import { useUnits } from '@/lib/use-units';
import { useUser } from '@/lib/use-user';

export function RoomsPage() {
  const user = useUser();
  const rooms = useRooms(user.uid);
  const [units, setUnits] = useUnits();

  return (
    <div className="grid gap-6">
      <title>Your rooms · YoungVista</title>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your rooms</h1>
          <p className="text-sm text-muted-foreground">
            Rooms you scan with the phone app, newest first.
          </p>
        </div>
        <UnitsToggle value={units} onChange={setUnits} />
      </div>

      {rooms.status === 'loading' ? <RoomGridSkeleton /> : null}

      {rooms.status === 'error' ? (
        <Alert variant="destructive">
          <LuTriangleAlert aria-hidden />
          <AlertDescription>{rooms.message}</AlertDescription>
        </Alert>
      ) : null}

      {rooms.status === 'ready' && rooms.data.length === 0 ? <EmptyRooms /> : null}

      {rooms.status === 'ready' && rooms.data.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.data.map((room) => (
            <li key={room.id}>
              <RoomCard room={room} units={units} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RoomCard({ room, units }: { room: RoomSummary; units: UnitSystem }) {
  const area = room.room ? formatArea(roomArea(room.room), units) : 'No floor plan yet';
  return (
    <Link
      to={`/rooms/${room.id}`}
      className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full pt-0 transition-shadow group-hover:shadow-md">
        <div className="flex aspect-[4/3] items-center justify-center border-b bg-muted/40 p-5">
          {room.room ? (
            <FloorPlan room={room.room} units={units} labels={false} className="h-full w-full" />
          ) : (
            <LuSquareDashed className="size-10 text-muted-foreground" aria-hidden />
          )}
        </div>
        <CardHeader>
          <CardTitle className="truncate">{room.name}</CardTitle>
          <CardDescription className="flex flex-wrap gap-x-2">
            <span>{area}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(room.updatedAt)}</span>
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

function RoomGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading rooms">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="pt-0">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <CardHeader>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function EmptyRooms() {
  return (
    <Card className="items-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <LuScanLine className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="grid max-w-sm gap-1">
        <h2 className="text-base font-medium">No rooms yet</h2>
        <p className="text-muted-foreground">
          Rooms come from the YoungVista phone app. Scan a room by turning around with your phone,
          save it, and it will show up here.
        </p>
      </div>
    </Card>
  );
}
