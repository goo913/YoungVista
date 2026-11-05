import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router';
import { LuBox, LuLoaderCircle, LuMap, LuTriangleAlert } from 'react-icons/lu';
import type { Room, UnitSystem } from '@youngvista/core';
import { ErrorBoundary } from '@/components/error-boundary';
import { FloorPlan } from '@/components/floor-plan';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FurnitureEntry } from '@/lib/furniture';

// three.js and React Three Fiber load only when the 3D tab opens.
const Room3D = lazy(() => import('@/components/room-3d'));

interface RoomViewerProps {
  room: Room;
  furniture: readonly FurnitureEntry[];
  name: string;
  units: UnitSystem;
  /** Accessible description of the plan. */
  planTitle: string;
}

/** The room's plan and 3D view as tabs. The open tab is kept in the address (`?view=3d`). */
export function RoomViewer({ room, furniture, name, units, planTitle }: RoomViewerProps) {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === '3d' ? '3d' : 'plan';
  return (
    <Tabs
      value={view}
      onValueChange={(next) =>
        setParams(
          (p) => {
            if (next === '3d') p.set('view', '3d');
            else p.delete('view');
            return p;
          },
          { replace: true },
        )
      }
      className="gap-4"
    >
      <TabsList>
        <TabsTrigger value="plan">
          <LuMap aria-hidden />
          Plan
        </TabsTrigger>
        <TabsTrigger value="3d">
          <LuBox aria-hidden />
          3D
        </TabsTrigger>
      </TabsList>
      <TabsContent value="plan" className="flex justify-center">
        <FloorPlan
          room={room}
          units={units}
          furniture={furniture}
          title={planTitle}
          className="max-h-[70vh]"
        />
      </TabsContent>
      <TabsContent value="3d">
        <ErrorBoundary fallback={() => <ViewerFailed />}>
          <Suspense fallback={<ViewerLoading />}>
            <Room3D room={room} furniture={furniture} name={name} />
          </Suspense>
        </ErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}

function ViewerLoading() {
  return (
    <div
      role="status"
      className="flex aspect-square max-h-[75vh] w-full items-center justify-center gap-2 rounded-lg border bg-muted/40 text-sm text-muted-foreground sm:aspect-[16/10]"
    >
      <LuLoaderCircle className="size-5 animate-spin" aria-hidden />
      Loading the 3D view
    </div>
  );
}

function ViewerFailed() {
  return (
    <div className="flex aspect-square max-h-[75vh] w-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/40 p-6 text-center text-sm sm:aspect-[16/10]">
      <LuTriangleAlert className="size-6 text-destructive" aria-hidden />
      <p className="max-w-sm text-muted-foreground">
        The 3D view could not load. Check your connection, then reload the page.
      </p>
      <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}
