import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { LuEye, LuLink2Off, LuTriangleAlert } from 'react-icons/lu';
import { formatArea, roomArea } from '@youngvista/core';
import { FurnitureList } from '@/components/furniture-list';
import { Logo } from '@/components/logo';
import { PageSpinner } from '@/components/page-spinner';
import { RoomFacts } from '@/components/room-facts';
import { RoomViewer } from '@/components/room-viewer';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { useCatalog } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { furnitureEntries } from '@/lib/furniture';
import { useShare, type SharedRoom } from '@/lib/shares';
import { useUnits } from '@/lib/use-units';

/** Route element for `/s/:shareId`: a public, view-only room. No sign-in needed. */
export function ShareRoute() {
  const { shareId = '' } = useParams();
  return <SharePage key={shareId} shareId={shareId} />;
}

function PublicLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          {loading ? null : (
            <Button variant="ghost" size="sm" asChild>
              <Link to={user ? '/' : '/sign-in'}>{user ? 'Your rooms' : 'Sign in'}</Link>
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

function SharePage({ shareId }: { shareId: string }) {
  const share = useShare(shareId);
  return (
    <PublicLayout>
      {share.status === 'loading' ? (
        <>
          <title>Shared room · YoungVista</title>
          <PageSpinner label="Loading the shared room" />
        </>
      ) : share.status === 'missing' ? (
        <LinkNotFound />
      ) : share.status === 'error' ? (
        <div className="grid gap-4">
          <title>Shared room · YoungVista</title>
          <Alert variant="destructive">
            <LuTriangleAlert aria-hidden />
            <AlertDescription>{share.message}</AlertDescription>
          </Alert>
          <Button variant="outline" className="w-fit" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      ) : (
        <SharedRoomView shared={share.data} />
      )}
    </PublicLayout>
  );
}

function LinkNotFound() {
  return (
    <Card className="mx-auto max-w-md items-center px-6 py-12 text-center">
      <title>Link not found · YoungVista</title>
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <LuLink2Off className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <div className="grid gap-1">
        <h1 className="text-base font-medium">Link not found or turned off</h1>
        <p className="text-muted-foreground">
          This link may be mistyped, or its owner has turned it off. Ask them for a new link.
        </p>
      </div>
    </Card>
  );
}

function SharedRoomView({ shared }: { shared: SharedRoom }) {
  const catalog = useCatalog();
  const [units, setUnits] = useUnits();
  const index = catalog.status === 'ready' ? catalog.data : null;
  const furniture = useMemo(() => furnitureEntries(shared.design, index), [shared.design, index]);
  const { room, name } = shared;
  return (
    <div className="grid gap-6">
      <title>{`${name} · Shared room · YoungVista`}</title>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <Badge variant="secondary">
            <LuEye aria-hidden />
            Shared room, view only
          </Badge>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted-foreground">Shared {formatDate(shared.updatedAt)}</p>
        </div>
        <UnitsToggle value={units} onChange={setUnits} />
      </div>
      {room ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid min-w-0 content-start gap-6">
            <Card>
              <CardContent>
                <RoomViewer
                  room={room}
                  furniture={furniture}
                  name={name}
                  units={units}
                  planTitle={`Floor plan of ${name}, ${formatArea(roomArea(room), units)}`}
                  tour={shared.tour}
                />
              </CardContent>
            </Card>
            <FurnitureList furniture={furniture} units={units} catalog={catalog.status} />
          </div>
          <div className="grid content-start gap-4">
            <RoomFacts room={room} units={units} />
          </div>
        </div>
      ) : (
        <Card className="px-6 py-12 text-center text-muted-foreground">
          This shared room has no floor plan.
        </Card>
      )}
    </div>
  );
}
