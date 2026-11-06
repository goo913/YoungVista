/**
 * `/embed/tour`: the 360° view, filling the page, for the phone app's WebView. The app sets
 * `window[TOUR_EMBED_GLOBAL]` to a `TourEmbed` (the room, its furniture, its tour and a download
 * URL per picture) before the page loads, so the page needs no sign-in and reads nothing itself
 * but the furniture catalog. It tells the app how it went through `window.ReactNativeWebView`
 * (`TourEmbedMessage`). Opened in a browser, it only says what it is for.
 */
import { Suspense, lazy, useEffect, useMemo } from 'react';
import { LuLoaderCircle, LuRotate3D } from 'react-icons/lu';
import { TOUR_EMBED_GLOBAL, tourEmbedFromJson, type TourEmbedMessage } from '@youngvista/core';
import { ErrorBoundary } from '@/components/error-boundary';
import { useCatalog } from '@/lib/catalog';
import { furnitureEntries } from '@/lib/furniture';
import { urlTourImages } from '@/lib/tour-images';

const TourView = lazy(() => import('@/components/tour/tour-view'));

/** What the phone app's WebView adds to the page's window. */
interface AppWindow {
  ReactNativeWebView?: { postMessage(message: string): void };
  [TOUR_EMBED_GLOBAL]?: unknown;
}
const appWindow = () => window as unknown as AppWindow;

/** Tells the phone app (when there is one) how the page is doing. */
function tellApp(message: TourEmbedMessage) {
  appWindow().ReactNativeWebView?.postMessage(JSON.stringify(message));
}

export function TourEmbedRoute() {
  const data = useMemo(() => tourEmbedFromJson(appWindow()[TOUR_EMBED_GLOBAL]), []);
  const catalog = useCatalog();
  const index = catalog.status === 'ready' ? catalog.data : null;
  const furniture = useMemo(
    () => (data ? furnitureEntries(data.design, index) : []),
    [data, index],
  );
  const images = useMemo(() => (data ? urlTourImages(data.images) : null), [data]);

  // Edge to edge on the phone: the view runs under the rounded corners and the camera, and its
  // controls keep clear of them (env(safe-area-inset-*)). The page itself never scrolls or zooms.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.content;
    if (meta) {
      meta.content =
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    }
    const { style } = document.documentElement;
    const overflow = style.overflow;
    style.overflow = 'hidden';
    return () => {
      if (meta && before !== undefined) meta.content = before;
      style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (!data) tellApp({ type: 'failed', message: 'There are no 360° pictures to show.' });
  }, [data]);

  if (!data || !images) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <title>360° pictures · YoungVista</title>
        <LuRotate3D className="size-8" aria-hidden />
        <p className="max-w-sm">
          This page shows a room’s 360° pictures inside the YoungVista app. Open the room in the
          app, or on the website.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-900">
      <title>{`${data.name} · 360° · YoungVista`}</title>
      <ErrorBoundary
        fallback={() => (
          <p className="flex h-full items-center justify-center p-6 text-center text-sm text-white">
            The 360° view could not start. Close it and try again.
          </p>
        )}
      >
        <Suspense
          fallback={
            <div
              role="status"
              className="flex h-full items-center justify-center gap-2 text-sm text-white"
            >
              <LuLoaderCircle className="size-5 animate-spin" aria-hidden />
              Loading the 360° view
            </div>
          }
        >
          <TourView
            embedded
            tour={data.tour}
            room={data.room}
            furniture={furniture}
            name={data.name}
            images={images}
            onReady={() => tellApp({ type: 'ready' })}
            onFailed={(message) => tellApp({ type: 'failed', message })}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
