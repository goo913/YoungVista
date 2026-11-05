import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { LuArrowLeft, LuMapPinOff, LuTriangleAlert } from 'react-icons/lu';
import { formatArea, roomArea, type UnitSystem } from '@youngvista/core';
import { FurnitureList } from '@/components/furniture-list';
import { PageSpinner } from '@/components/page-spinner';
import { PictureGallery } from '@/components/picture-gallery';
import { RoomFacts } from '@/components/room-facts';
import { RoomViewer } from '@/components/room-viewer';
import { ShareCard } from '@/components/share-card';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCatalog, type CatalogState } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { furnitureEntries } from '@/lib/furniture';
import { useRoom, type RoomSummary } from '@/lib/rooms';
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
  const catalog = useCatalog();
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
        <RoomDetails summary={state.data} units={units} catalog={catalog} />
      ) : (
        <Card className="px-6 py-12 text-center text-muted-foreground">
          This room has no floor plan yet. Finish the scan in the phone app.
        </Card>
      )}
    </div>
  );
}

function RoomDetails({
  summary,
  units,
  catalog,
}: {
  summary: RoomSummary;
  units: UnitSystem;
  catalog: CatalogState;
}) {
  const room = summary.room!;
  const index = catalog.status === 'ready' ? catalog.data : null;
  const furniture = useMemo(() => furnitureEntries(summary.design, index), [summary.design, index]);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardContent>
            <RoomViewer
              room={room}
              furniture={furniture}
              name={summary.name}
              units={units}
              planTitle={`Floor plan of ${summary.name}, ${formatArea(roomArea(room), units)}`}
            />
          </CardContent>
        </Card>
        <FurnitureList furniture={furniture} units={units} catalog={catalog.status} />
        <PictureGallery roomId={summary.id} />
      </div>
      <div className="grid content-start gap-4">
        <ShareCard room={summary} />
        <RoomFacts room={room} units={units} />
      </div>
    </div>
  );
}
