import { useEffect, useRef, useState } from 'react';
import {
  LuCheck,
  LuCopy,
  LuExternalLink,
  LuLink,
  LuLoaderCircle,
  LuRefreshCw,
  LuTriangleAlert,
  LuUnlink,
} from 'react-icons/lu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import type { RoomSummary } from '@/lib/rooms';
import {
  createShare,
  revokeShare,
  shareErrorMessage,
  shareLink,
  updateShare,
  useShare,
} from '@/lib/shares';

type Busy = null | 'create' | 'update' | 'revoke';

/** The owner's private link: create it, copy it, refresh the shared copy, or turn it off. */
export function ShareCard({ room }: { room: RoomSummary }) {
  const share = useShare(room.shareId);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function run(kind: Exclude<Busy, null>, action: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(shareErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // No clipboard access (e.g. not https): select the link so it can be copied by hand.
      input.current?.select();
    }
  }

  const spinner = <LuLoaderCircle className="animate-spin" aria-hidden />;
  const createButton = (label: string) => (
    <Button
      className="w-full"
      disabled={busy !== null || !room.stored}
      onClick={() => void run('create', () => createShare(room))}
    >
      {busy === 'create' ? spinner : <LuLink aria-hidden />}
      {label}
    </Button>
  );

  let body;
  if (!room.shareId) {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          {room.stored
            ? `Anyone with the link can see this room and its furniture${room.tour ? ', and its 360° pictures,' : ''} without signing in. You can turn it off at any time.`
            : 'Finish the floor plan in the phone app before sharing this room.'}
        </p>
        {createButton('Create private link')}
      </>
    );
  } else if (share.status === 'loading') {
    body = (
      <div className="grid gap-2" aria-label="Loading the link">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  } else if (share.status === 'missing') {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          The old link no longer works. Create a new one to share this room again.
        </p>
        {createButton('Create a new link')}
        <RevokeButton
          busy={busy}
          onConfirm={() => run('revoke', () => revokeShare(room, room.shareId!, false))}
          label="Forget the old link"
        />
      </>
    );
  } else {
    const shareId = room.shareId;
    const link = shareLink(shareId);
    const shared = share.status === 'ready' ? share.data : null;
    // The room's 360° pictures are not in the shared copy (it was made before they existed, or
    // they could not be shared then).
    const missingTour = !!room.tour && !!shared && !shared.tour;
    const outdated =
      (shared?.updatedAt && room.updatedAt
        ? room.updatedAt.getTime() > shared.updatedAt.getTime() + 1000
        : false) || missingTour;
    body = (
      <>
        <div className="flex gap-2">
          <Input
            ref={input}
            readOnly
            value={link}
            aria-label="Private link"
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => void copy(link)}
            aria-label={copied ? 'Link copied' : 'Copy link'}
          >
            {copied ? <LuCheck aria-hidden /> : <LuCopy aria-hidden />}
          </Button>
          <Button variant="outline" size="icon" asChild>
            <a href={link} target="_blank" rel="noreferrer" aria-label="Open the shared page">
              <LuExternalLink aria-hidden />
            </a>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {copied
            ? 'Link copied.'
            : shared
              ? `Shared copy from ${formatDate(shared.updatedAt)}.`
              : 'The link is active.'}
          {missingTour
            ? ' It does not show the 360° pictures yet: update it to add them.'
            : outdated
              ? ' The room has changed since then.'
              : shared?.tour
                ? ' It shows the 360° pictures too.'
                : ''}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Button
            variant={outdated ? 'default' : 'outline'}
            disabled={busy !== null || !room.stored || !shared}
            onClick={() => void run('update', () => updateShare(room, shareId))}
          >
            {busy === 'update' ? spinner : <LuRefreshCw aria-hidden />}
            Update shared copy
          </Button>
          <RevokeButton
            busy={busy}
            onConfirm={() => run('revoke', () => revokeShare(room, shareId, true))}
            label="Turn off link"
          />
        </div>
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share</CardTitle>
        <CardDescription>A private, view-only link to this room.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {body}
        {error || share.status === 'error' ? (
          <Alert variant="destructive">
            <LuTriangleAlert aria-hidden />
            <AlertDescription>
              {error ?? (share.status === 'error' ? share.message : '')}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RevokeButton({
  busy,
  label,
  onConfirm,
}: {
  busy: Busy;
  label: string;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={busy !== null}>
          {busy === 'revoke' ? (
            <LuLoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <LuUnlink aria-hidden />
          )}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Turn off this link?</AlertDialogTitle>
          <AlertDialogDescription>
            Anyone who opens it will see “link not found”. You can create a new link later; it will
            have a different address.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep the link</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void onConfirm()}>
            Turn off link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
