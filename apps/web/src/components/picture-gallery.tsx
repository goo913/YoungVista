import { useEffect, useState } from 'react';
import {
  LuCircleCheck,
  LuDownload,
  LuImage,
  LuImageOff,
  LuLoaderCircle,
  LuTrash2,
  LuTriangleAlert,
} from 'react-icons/lu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import {
  deletePicture,
  downloadPicture,
  pictureErrorMessage,
  pictureFileName,
  usePictureUrl,
  usePictures,
  type RoomPicture,
} from '@/lib/pictures';

const PLATFORM: Record<RoomPicture['platform'], string> = {
  ios: 'iPhone',
  android: 'Android',
  web: 'Website',
};

/** Final pictures of the room (the phone's, and the website's 3D view's), newest first. */
export function PictureGallery({ roomId, roomName }: { roomId: string; roomName: string }) {
  const pictures = usePictures(roomId);
  // What happened last, said where everyone can see it (a picture deleted goes from the list).
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(t);
  }, [note]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pictures</CardTitle>
        <CardDescription>
          Final pictures of this room, newest first: from the phone app’s 3D view, or saved from the
          3D view here.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p
          role="status"
          className="min-h-0 text-sm text-emerald-700 empty:hidden dark:text-emerald-400"
        >
          {note}
        </p>
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
              In the phone app’s 3D view, choose an angle and tap Take picture; or here, open the 3D
              view and choose Picture → Save to this room’s pictures. It will show up here.
            </p>
          </div>
        ) : pictures.status === 'ready' ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pictures.data.map((p) => (
              <li key={p.id}>
                <Picture
                  picture={p}
                  roomId={roomId}
                  roomName={roomName}
                  onDeleted={() => setNote('Picture deleted.')}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

type Saving =
  { state: 'idle' } | { state: 'busy' } | { state: 'done' } | { state: 'failed'; message: string };

function Picture({
  picture,
  roomId,
  roomName,
  onDeleted,
}: {
  picture: RoomPicture;
  roomId: string;
  roomName: string;
  onDeleted: () => void;
}) {
  const url = usePictureUrl(picture.storagePath);
  const caption = `${formatDate(picture.createdAt)} · ${picture.width} × ${picture.height} · ${PLATFORM[picture.platform]}`;
  const [saving, setSaving] = useState<Saving>({ state: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (saving.state !== 'done') return;
    const t = setTimeout(() => setSaving({ state: 'idle' }), 5000);
    return () => clearTimeout(t);
  }, [saving]);

  async function save() {
    setSaving({ state: 'busy' });
    try {
      await downloadPicture(picture, pictureFileName(roomName, picture));
      setSaving({ state: 'done' });
    } catch (error) {
      setSaving({ state: 'failed', message: pictureErrorMessage(error) });
    }
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePicture(roomId, picture);
      setConfirming(false);
      onDeleted();
    } catch (error) {
      setDeleteError(pictureErrorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <figure className="grid gap-1.5" data-picture-id={picture.id}>
      {url.status === 'ready' ? (
        <a
          href={url.url}
          target="_blank"
          rel="noreferrer"
          title="Open the full picture"
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
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={saving.state === 'busy' || url.status === 'error'}
          onClick={() => void save()}
        >
          {saving.state === 'busy' ? (
            <LuLoaderCircle className="animate-spin" aria-hidden />
          ) : saving.state === 'done' ? (
            <LuCircleCheck className="text-emerald-600" aria-hidden />
          ) : (
            <LuDownload aria-hidden />
          )}
          {saving.state === 'busy' ? 'Saving…' : saving.state === 'done' ? 'Saved' : 'Download'}
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => setConfirming(true)}
          aria-label="Delete picture"
          title="Delete picture"
        >
          <LuTrash2 className="text-destructive" aria-hidden />
        </Button>
      </div>
      <p role="status" className="text-xs empty:hidden">
        {saving.state === 'done' ? (
          <span className="text-emerald-700 dark:text-emerald-400">
            Saved to your downloads as {pictureFileName(roomName, picture)}.
          </span>
        ) : saving.state === 'failed' ? (
          <span className="text-destructive">{saving.message}</span>
        ) : null}
      </p>
      <AlertDialog
        open={confirming}
        onOpenChange={(o) => {
          if (deleting) return;
          setDeleteError(null);
          setConfirming(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this picture?</AlertDialogTitle>
            <AlertDialogDescription>
              It is deleted for good, from the phone app and the website. Copies already saved to a
              phone’s Photos or to a computer stay there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant="destructive">
              <LuTriangleAlert aria-hidden />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? (
                <LuLoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <LuTrash2 aria-hidden />
              )}
              {deleting ? 'Deleting…' : 'Delete picture'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </figure>
  );
}
