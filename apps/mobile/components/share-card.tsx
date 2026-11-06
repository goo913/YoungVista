/**
 * The room's private link on the room page: create it (the system share sheet opens with it),
 * share it again, refresh the shared copy, or turn it off. The same links as the website's: they
 * open on https://young-vista.web.app/s/{id} for anyone, without signing in.
 */
import { shareUrl } from '@youngvista/core';
import { useState } from 'react';
import { Alert as NativeAlert, View } from 'react-native';
import { LuLink, LuRefreshCw, LuShare, LuTriangleAlert, LuUnlink } from 'react-icons/lu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { RoomSummary } from '@/lib/room-doc';
import { shareView, type ShareSource } from '@/lib/share-state';
import {
  createShare,
  revokeShare,
  shareErrorMessage,
  shareLink,
  updateShare,
  useShare,
} from '@/lib/shares';

type Busy = null | 'create' | 'update' | 'revoke';

export function ShareCard({ summary }: { summary: RoomSummary }) {
  const user = useUser();
  const snapshot = useShare(summary.shareId);
  const view = shareView(
    { shareId: summary.shareId, updatedAt: summary.updatedAt, hasPlan: summary.room !== null },
    snapshot,
  );
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const source: ShareSource | null = summary.room
    ? {
        roomId: summary.id,
        ownerId: user.uid,
        name: summary.name,
        units: summary.units,
        room: summary.room,
        design: summary.design,
      }
    : null;

  async function run<T>(kind: Exclude<Busy, null>, action: () => Promise<T>): Promise<T | null> {
    setBusy(kind);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(shareErrorMessage(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  const send = (link: string) =>
    void shareLink(summary.name, link).catch(() => {
      // The share sheet could not open; the link is on the card to copy.
    });

  const create = async () => {
    if (!source) return;
    const id = await run('create', () => createShare(source));
    if (id) send(shareUrl(id));
  };

  const turnOff = (shareId: string, snapshotExists: boolean) =>
    NativeAlert.alert(
      snapshotExists ? 'Turn off this link?' : 'Forget the old link?',
      snapshotExists
        ? 'Anyone who opens it will see "link not found". You can create a new link later; it will have a different address.'
        : 'It already does not work. The room page will offer a new link.',
      [
        { text: snapshotExists ? 'Keep the link' : 'Cancel', style: 'cancel' },
        {
          text: snapshotExists ? 'Turn off link' : 'Forget it',
          style: 'destructive',
          onPress: () => void run('revoke', () => revokeShare(summary.id, shareId, snapshotExists)),
        },
      ],
    );

  const disabled = busy !== null;
  let body: React.ReactNode;
  switch (view.kind) {
    case 'none':
      body = (
        <>
          <Text className="text-muted-foreground text-sm">{view.text}</Text>
          <Button onPress={() => void create()} disabled={disabled || !view.canCreate}>
            <Icon as={LuLink} size={16} />
            <Text>{busy === 'create' ? 'Creating…' : 'Create private link'}</Text>
          </Button>
        </>
      );
      break;
    case 'loading':
      body = (
        <View className="gap-2" accessibilityLabel="Loading the link">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </View>
      );
      break;
    case 'missing':
      body = (
        <>
          <Text className="text-muted-foreground text-sm">{view.text}</Text>
          <Button onPress={() => void create()} disabled={disabled || !view.canCreate}>
            <Icon as={LuLink} size={16} />
            <Text>{busy === 'create' ? 'Creating…' : 'Create a new link'}</Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => turnOff(view.shareId, false)}
            disabled={disabled}
          >
            <Icon as={LuUnlink} size={16} />
            <Text>Forget the old link</Text>
          </Button>
        </>
      );
      break;
    case 'error':
      body = (
        <Button variant="outline" onPress={() => turnOff(view.shareId, true)} disabled={disabled}>
          <Icon as={LuUnlink} size={16} />
          <Text>Turn off link</Text>
        </Button>
      );
      break;
    case 'active':
      body = (
        <>
          <View className="bg-muted rounded-md px-3 py-2">
            <Text className="font-mono text-xs" selectable accessibilityLabel="Private link">
              {view.link}
            </Text>
          </View>
          <Text className="text-muted-foreground text-sm" accessibilityLiveRegion="polite">
            {view.sharedAt ? `Shared copy from ${formatDate(view.sharedAt)}.` : 'The link is on.'}
            {view.outdated ? ' The room has changed since then.' : ''}
          </Text>
          <Button onPress={() => send(view.link)} disabled={disabled}>
            <Icon as={LuShare} size={16} />
            <Text>Share link</Text>
          </Button>
          <Button
            variant={view.outdated ? 'secondary' : 'outline'}
            onPress={() => source && void run('update', () => updateShare(source, view.shareId))}
            disabled={disabled || !view.canUpdate || !source}
          >
            <Icon as={LuRefreshCw} size={16} />
            <Text>{busy === 'update' ? 'Updating…' : 'Update shared copy'}</Text>
          </Button>
          <Button variant="outline" onPress={() => turnOff(view.shareId, true)} disabled={disabled}>
            <Icon as={LuUnlink} size={16} className="text-destructive" />
            <Text className="text-destructive">
              {busy === 'revoke' ? 'Turning off…' : 'Turn off link'}
            </Text>
          </Button>
        </>
      );
      break;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share</CardTitle>
        <CardDescription>A private, view-only link to this room.</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {body}
        {error || view.kind === 'error' ? (
          <Alert variant="destructive" icon={LuTriangleAlert}>
            <AlertDescription>{error ?? (view.kind === 'error' ? view.text : '')}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
