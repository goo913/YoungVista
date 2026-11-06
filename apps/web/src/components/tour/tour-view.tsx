/**
 * The 360° view of a room's real pictures (loaded lazily, with three.js). Stand on a spot of a
 * turn-around scan and look around its panorama: drag to look, pinch or scroll to zoom, the arrow
 * keys and + and − from the keyboard. A circle on the floor (or a dot on the mini-map) moves to
 * another spot, gliding through the room. The room's furniture is drawn in at true size, hidden
 * behind real walls, with soft shadows on the floor; "Show furniture" hides it.
 *
 * On the website it sits in the room's viewer next to the plan and 3D (with full screen); in the
 * phone app it fills a WebView (`embedded`: the controls float over the picture, clear of the
 * screen's rounded corners and camera).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import {
  LuLoaderCircle,
  LuMaximize,
  LuMinimize,
  LuTriangleAlert,
  LuZoomIn,
  LuZoomOut,
} from 'react-icons/lu';
import type { Room, RoomTour, RoomTourSpot } from '@youngvista/core';
import { ErrorBoundary } from '@/components/error-boundary';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { FurnitureEntry } from '@/lib/furniture';
import { storageTourImages, type TourImages } from '@/lib/tour-images';
import { cn } from '@/lib/utils';
import { PanoramaCache, startView, type LoadedPanorama } from './panorama';
import { TourMap } from './tour-map';
import { TourRig } from './tour-rig';
import { TourScene } from './tour-scene';

export interface TourViewProps {
  tour: RoomTour;
  room: Room;
  furniture: readonly FurnitureEntry[];
  /** The room's name, for the view's label. */
  name: string;
  /** Where the pictures come from (default: Firebase Storage). */
  images?: TourImages;
  /** Full screen for the viewer around this view (the website). */
  fullscreen?: { active: boolean; toggle: () => void } | null;
  /** Fills the page, controls over the picture (the phone's WebView). */
  embedded?: boolean;
  /** The first picture is on screen. */
  onReady?: () => void;
  /** The pictures could not load (plain words). */
  onFailed?: (message: string) => void;
}

const FAILED = 'The 360° pictures could not load. Check your connection and try again.';
const ZOOM_STEP = 1.2;

export default function TourView({
  tour,
  room,
  furniture,
  name,
  images = storageTourImages,
  fullscreen = null,
  embedded = false,
  onReady,
  onFailed,
}: TourViewProps) {
  const rig = useMemo(() => new TourRig(), []);
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  const cache = useMemo(
    () => (maxWidth ? new PanoramaCache(images, maxWidth) : null),
    [images, maxWidth],
  );
  useEffect(() => () => cache?.dispose(), [cache]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState<LoadedPanorama | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showFurniture, setShowFurniture] = useState(true);
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Read when a tour opens, without restarting it when the room or furniture changes.
  const latest = useRef({ room, furniture, onReady, onFailed });
  useLayoutEffect(() => {
    latest.current = { room, furniture, onReady, onFailed };
  });

  useEffect(() => {
    rig.setOnArrive((pano) => setCurrent(pano));
    return () => rig.setOnArrive(() => {});
  }, [rig]);

  // For checks and the curious: the view as data on the element (heading, pitch, field of view).
  useEffect(
    () =>
      rig.subscribe(() => {
        const v = rig.getView();
        box.current?.setAttribute(
          'data-tour-view',
          JSON.stringify({
            x: +v.x.toFixed(3),
            z: +v.z.toFixed(3),
            heading: +v.heading.toFixed(2),
            pitch: +v.pitch.toFixed(2),
            fov: +v.fov.toFixed(2),
            hfov: +v.hfov.toFixed(2),
            moving: v.moving,
          }),
        );
      }),
    [rig],
  );

  // Open on the first spot, then fetch the others in the background.
  useEffect(() => {
    if (!cache) return;
    let live = true;
    const start = startView(tour, latest.current.room, latest.current.furniture);
    cache.get(start.spot).then(
      (pano) => {
        if (!live) return;
        rig.arrive(pano);
        rig.face(start.heading, start.pitch);
        setCurrent(pano);
        setStatus('ready');
        latest.current.onReady?.();
        void (async () => {
          for (const s of tour.spots) {
            if (!live) return;
            if (s.spot !== pano.spot.spot) await cache.get(s).catch(() => undefined);
          }
        })();
      },
      () => {
        if (!live) return;
        setStatus('failed');
        latest.current.onFailed?.(FAILED);
      },
    );
    return () => {
      live = false;
    };
  }, [cache, tour, rig, attempt]);

  const goTo = useCallback(
    (target: RoomTourSpot) => {
      const here = rig.current;
      if (!cache || !here || rig.move || here.spot.spot === target.spot) return;
      setNote(null);
      setPending(target.spot);
      cache
        .get(target)
        .then(
          (pano) => {
            rig.moveTo(pano);
          },
          () =>
            setNote(
              'The picture for that spot could not load. Check your connection and try again.',
            ),
        )
        .finally(() => setPending(null));
    },
    [cache, rig],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step = e.shiftKey ? 15 : 5;
    rig.halt();
    switch (e.key) {
      case 'ArrowLeft':
        rig.look(step, 0);
        break;
      case 'ArrowRight':
        rig.look(-step, 0);
        break;
      case 'ArrowUp':
        rig.look(0, step);
        break;
      case 'ArrowDown':
        rig.look(0, -step);
        break;
      case '+':
      case '=':
        rig.zoom(1 / ZOOM_STEP);
        break;
      case '-':
      case '_':
        rig.zoom(ZOOM_STEP);
        break;
      default:
        return;
    }
    e.preventDefault();
    setTouched(true);
  };

  const shown = showFurniture ? furniture : [];
  const index = current ? tour.spots.findIndex((s) => s.spot === current.spot.spot) : -1;
  const spotLabel =
    tour.spots.length > 1
      ? `Spot ${Math.max(index, 0) + 1} of ${tour.spots.length}`
      : 'Taken from one spot';
  const many = tour.spots.length > 1;

  const zoomButtons = (
    <>
      <Button
        size="icon-sm"
        variant={embedded ? 'secondary' : 'ghost'}
        onClick={() => {
          rig.halt();
          rig.zoom(ZOOM_STEP);
        }}
        aria-label="Zoom out"
        title="Zoom out (−)"
      >
        <LuZoomOut aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant={embedded ? 'secondary' : 'ghost'}
        onClick={() => {
          rig.halt();
          rig.zoom(1 / ZOOM_STEP);
        }}
        aria-label="Zoom in"
        title="Zoom in (+)"
      >
        <LuZoomIn aria-hidden />
      </Button>
    </>
  );
  const furnitureSwitch = furniture.length ? (
    <Label className="cursor-pointer font-normal">
      <Switch
        checked={showFurniture}
        onCheckedChange={setShowFurniture}
        aria-label="Show furniture"
      />
      Show furniture
    </Label>
  ) : null;

  const view = (
    <div
      ref={box}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="application"
      aria-roledescription="360° view"
      aria-label={`360° pictures of ${name}. Drag or use the arrow keys to look around, plus and minus to zoom.`}
      data-tour=""
      data-tour-status={status}
      data-tour-spot={current?.spot.spot ?? ''}
      data-tour-moving={pending ?? ''}
      className={cn(
        'relative isolate w-full overflow-hidden bg-neutral-900 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        embedded
          ? 'h-full'
          : cn(
              'rounded-lg border',
              fullscreen?.active
                ? 'min-h-0 flex-1'
                : 'aspect-square max-h-[75vh] sm:aspect-[16/10]',
            ),
      )}
    >
      <ErrorBoundary fallback={() => <NoWebGL />}>
        <Canvas
          dpr={[1, 2]}
          frameloop="demand"
          camera={{ fov: 70, near: 0.05, far: 100, position: [0, 1.5, 0] }}
          gl={{ antialias: true }}
          onCreated={({ gl, invalidate }) => {
            gl.toneMapping = THREE.NeutralToneMapping;
            rig.connect(() => invalidate());
            let coarse = false;
            try {
              coarse = matchMedia('(pointer: coarse)').matches;
            } catch {
              // Old browsers: treat as a computer.
            }
            // Phones keep panoramas at 4096 px wide (GPU memory); computers up to 8192.
            setMaxWidth(Math.min(gl.capabilities.maxTextureSize, coarse ? 4096 : 8192));
          }}
          aria-hidden
        >
          <TourScene
            rig={rig}
            room={room}
            tour={tour}
            current={current}
            furniture={shown}
            onPick={goTo}
            onInteract={() => setTouched(true)}
          />
        </Canvas>
      </ErrorBoundary>

      {status === 'loading' ? (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center gap-2 bg-neutral-900/70 text-sm text-white"
        >
          <LuLoaderCircle className="size-5 animate-spin" aria-hidden />
          Loading the 360° pictures
        </div>
      ) : null}
      {status === 'failed' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/90 p-6 text-center text-sm text-white">
          <LuTriangleAlert className="size-6 text-red-400" aria-hidden />
          <p className="max-w-sm">{FAILED}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setStatus('loading');
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {status === 'ready' ? (
        // Floating controls, clear of the phone's rounded corners and camera when embedded.
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={
            embedded
              ? {
                  paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
                  paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
                  paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
                  paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
                }
              : { padding: '0.5rem' }
          }
        >
          <div className="relative h-full w-full">
            {embedded ? (
              <>
                {/* The app's own close button sits at the top left. */}
                <div className="pointer-events-auto absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-background/85 px-3 py-1 text-xs font-medium whitespace-nowrap shadow-sm backdrop-blur-sm">
                  {name} · {spotLabel}
                </div>
                <div className="pointer-events-auto absolute top-0 right-0 flex gap-1">
                  {zoomButtons}
                </div>
                {furnitureSwitch ? (
                  <div className="pointer-events-auto absolute right-0 bottom-0 rounded-full bg-background/85 px-3 py-2 shadow-sm backdrop-blur-sm">
                    {furnitureSwitch}
                  </div>
                ) : null}
              </>
            ) : null}
            <TourMap
              room={room}
              tour={tour}
              rig={rig}
              current={current?.spot.spot ?? null}
              pending={pending}
              furniture={shown}
              onPick={goTo}
              className={cn(
                'pointer-events-auto absolute bottom-0 left-0',
                embedded ? 'w-32' : 'w-32 sm:w-44',
              )}
            />
            {pending !== null || note ? (
              <div
                role="status"
                className={cn(
                  'absolute left-1/2 -translate-x-1/2 rounded-full border bg-background/90 px-3 py-1 text-xs shadow-sm',
                  embedded ? 'top-9' : 'top-0',
                  note && 'border-destructive/60 text-destructive',
                )}
              >
                {note ?? 'Moving…'}
              </div>
            ) : null}
            {embedded && !touched ? (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/70 px-3 py-1.5 text-xs whitespace-nowrap text-white">
                Drag to look around{many ? ' · tap a circle on the floor to move' : ''}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (embedded) return view;

  return (
    <div className={cn('gap-2', fullscreen?.active ? 'flex min-h-0 flex-1 flex-col' : 'grid')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm text-muted-foreground">{spotLabel}</span>
          {furnitureSwitch}
        </div>
        <div className="flex items-center gap-1">
          {zoomButtons}
          {fullscreen ? (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={fullscreen.toggle}
              aria-label={fullscreen.active ? 'Leave full screen' : 'Full screen'}
              aria-pressed={fullscreen.active}
              title={fullscreen.active ? 'Leave full screen' : 'Full screen'}
            >
              {fullscreen.active ? <LuMinimize aria-hidden /> : <LuMaximize aria-hidden />}
            </Button>
          ) : null}
        </div>
      </div>
      {view}
      <p className="text-xs text-muted-foreground">
        Real pictures of the room, with its furniture drawn in at true size. Drag to look around,
        scroll or pinch to zoom
        {many ? '; click a circle on the floor, or a dot on the map, to move there.' : '.'}
      </p>
    </div>
  );
}

function NoWebGL() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/80">
      This browser could not start the 360° view. It needs WebGL: try another browser, or turn on
      hardware acceleration.
    </div>
  );
}
