import { LuImage, LuImageOff, LuTriangleAlert } from 'react-icons/lu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { usePictureUrl, usePictures, type RoomPicture } from '@/lib/pictures';

const PLATFORM: Record<RoomPicture['platform'], string> = {
  ios: 'iPhone',
  android: 'Android',
  web: 'Website',
};

/** Final pictures taken in the phone app, newest first. */
export function PictureGallery({ roomId }: { roomId: string }) {
  const pictures = usePictures(roomId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pictures</CardTitle>
        <CardDescription>
          Final pictures of this room from the phone app, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pictures.status === 'loading' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Loading pictures">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
            ))}
          </div>
        ) : pictures.status === 'error' ? (
          <Alert variant="destructive">
            <LuTriangleAlert aria-hidden />
            <AlertDescription>{pictures.message}</AlertDescription>
          </Alert>
        ) : pictures.status === 'ready' && pictures.data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
            <LuImage className="size-7 text-muted-foreground" aria-hidden />
            <p className="font-medium">No pictures yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              In the phone app’s 3D view, choose an angle and tap Final picture. It will show up
              here.
            </p>
          </div>
        ) : pictures.status === 'ready' ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pictures.data.map((p) => (
              <li key={p.id}>
                <Picture picture={p} />
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Picture({ picture }: { picture: RoomPicture }) {
  const url = usePictureUrl(picture.storagePath);
  const caption = `${formatDate(picture.createdAt)} · ${picture.width} × ${picture.height} · ${PLATFORM[picture.platform]}`;
  return (
    <figure className="grid gap-1.5">
      {url.status === 'ready' ? (
        <a
          href={url.url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-lg border bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <img
            src={url.url}
            alt={`Picture of the room, ${caption}`}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover transition-transform hover:scale-[1.02]"
          />
        </a>
      ) : url.status === 'loading' ? (
        <Skeleton className="aspect-[4/3] rounded-lg" />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border bg-muted/40 text-xs text-muted-foreground">
          <LuImageOff className="size-5" aria-hidden />
          Picture unavailable
        </div>
      )}
      <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
