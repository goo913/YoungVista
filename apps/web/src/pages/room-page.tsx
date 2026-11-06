import { useCallback, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { LuArrowLeft, LuMapPinOff, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import {
  formatArea,
  roomArea,
  type Room,
  type SnapshotSource,
  type UnitSystem,
} from '@youngvista/core';
import { FurnitureList } from '@/components/furniture-list';
import { PageSpinner } from '@/components/page-spinner';
import { PictureGallery } from '@/components/picture-gallery';
import { RoomActions } from '@/components/room-actions';
import { RoomFacts } from '@/components/room-facts';
import { RoomViewer, type Furnish } from '@/components/room-viewer';
import { ShareCard } from '@/components/share-card';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCatalog, type CatalogIndex, type CatalogState } from '@/lib/catalog';
import { useDesignEditor } from '@/lib/design-editor';
import { formatDate } from '@/lib/format';
import { furnitureEntries } from '@/lib/furniture';
import { savePictureToRoom } from '@/lib/pictures';
import { deletedHere, useRoom, type RoomSummary } from '@/lib/rooms';
import { useUnits } from '@/lib/use-units';
import { useUser } from '@/lib/use-user';

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
  const navigate = useNavigate();

  if (state.status === 'loading') return <PageSpinner label="Loading room" />;

  if (state.status === 'deleted' && deletedHere.has(roomId)) {
    // Deleted from this page: back to the list, which says so.
    return <Navigate to="/" replace state={{ deletedRoom: deletedHere.get(roomId) }} />;
  }

  if (state.status === 'deleted') {
    return (
      <div className="grid gap-6">
        <title>Room deleted · YoungVista</title>
        <BackLink />
        <Card className="items-center px-6 py-12 text-center">
          <LuTrash2 className="size-8 text-muted-foreground" aria-hidden />
          <div className="grid gap-1">
            <h1 className="text-base font-medium">This room was deleted</h1>
            <p className="text-muted-foreground">
              It was deleted on another device or in another tab, with its furniture and pictures.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">Back to your rooms</Link>
          </Button>
        </Card>
      </div>
    );
  }

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
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
              <p className="text-sm text-muted-foreground">Updated {formatDate(updatedAt)}</p>
            </div>
            <RoomActions
              room={state.data}
              className="mt-0.5"
              onDeleted={() => navigate('/', { replace: true, state: { deletedRoom: name } })}
            />
          </div>
          <UnitsToggle value={units} onChange={setUnits} />
        </div>
      </div>
      {room ? (
        catalog.status === 'ready' ? (
          <FurnishedRoom
            summary={state.data}
            room={room}
            source={state.source}
            units={units}
            catalog={catalog.data}
          />
        ) : (
          <RoomDetails summary={state.data} room={room} units={units} catalog={catalog} />
        )
      ) : (
        <Card className="px-6 py-12 text-center text-muted-foreground">
          This room has no floor plan yet. Finish the scan in the phone app.
        </Card>
      )}
    </div>
  );
}

/** The room with the furniture editor (the catalog is loaded). */
function FurnishedRoom({
  summary,
  room,
  source,
  units,
  catalog,
}: {
  summary: RoomSummary;
  room: Room;
  source: SnapshotSource;
  units: UnitSystem;
  catalog: CatalogIndex;
}) {
  const user = useUser();
  const editor = useDesignEditor({
    roomId: summary.id,
    room,
    catalog,
    server: summary.design,
    source,
  });
  const onSavePicture = useCallback(
    async (jpeg: Blob, width: number, height: number) => {
      await savePictureToRoom({ uid: user.uid, roomId: summary.id, jpeg, width, height });
    },
    [user.uid, summary.id],
  );
  const furnish = useMemo<Furnish>(
    () => ({ editor, catalog, onSavePicture }),
    [editor, catalog, onSavePicture],
  );
  return (
    <RoomDetails
      summary={summary}
      room={room}
      units={units}
      catalog={{ status: 'ready', data: catalog }}
      design={editor.shown}
      furnish={furnish}
    />
  );
}

function RoomDetails({
  summary,
  room,
  units,
  catalog,
  design,
  furnish = null,
}: {
  summary: RoomSummary;
  room: Room;
  units: UnitSystem;
  catalog: CatalogState;
  /** The pieces as drawn while furnishing (the one being moved at its preview spot). */
  design?: RoomSummary['design']['items'];
  furnish?: Furnish | null;
}) {
  const index = catalog.status === 'ready' ? catalog.data : null;
  const items = design ?? summary.design.items;
  const furniture = useMemo(() => furnitureEntries({ items }, index), [items, index]);
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
              furnish={furnish}
            />
          </CardContent>
        </Card>
        <FurnitureList
          furniture={furniture}
          units={units}
          catalog={catalog.status}
          editable={!!furnish}
        />
        <PictureGallery roomId={summary.id} roomName={summary.name} />
      </div>
      <div className="grid content-start gap-4">
        <ShareCard room={summary} />
        <RoomFacts room={room} units={units} />
      </div>
    </div>
  );
}
