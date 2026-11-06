/**
 * The room's final pictures on the room page: a row of thumbnails, newest first. Pictures still
 * on their way from this phone say how their upload is going ("Uploading 40%", "Waiting for
 * connection"); a tap opens one, and pressing and holding one deletes it (after asking), as does
 * the viewer's Delete. The website's gallery shows the same pictures once uploaded.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import {
  LuCamera,
  LuCloudOff,
  LuImageOff,
  LuLoaderCircle,
  LuRefreshCw,
  LuTriangleAlert,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import {
  isAiPicture,
  stripPictures,
  uploadView,
  type StripPicture,
  type UploadView,
} from '@/lib/picture-state';
import {
  pictureUploads,
  uploadedFile,
  usePictureSource,
  usePictureUploads,
  useRoomPictures,
  useUploadWhenOnline,
  type UploadsSnapshot,
} from '@/lib/pictures';
import { confirmDeletePicture } from './delete-picture';
import { AiBadge, PictureViewer } from './picture-viewer';

const STATUS_ICON: Record<UploadView['kind'], IconType> = {
  uploading: LuLoaderCircle,
  waiting: LuCloudOff,
  failed: LuTriangleAlert,
};

/** What a picture's tile says about its upload, or null once it is on the server. */
function statusOf(
  picture: StripPicture,
  uploads: UploadsSnapshot,
  online: boolean,
): UploadView | null {
  if (!picture.pending) return null;
  const active = uploads.active?.id === picture.id ? uploads.active : null;
  return uploadView(picture.pending, active?.progress ?? null, active?.slow ?? false, online);
}

export function PictureStrip({
  roomId,
  online,
  onTakePicture,
}: {
  roomId: string;
  /** From the room's snapshot: false while the server cannot be reached. */
  online: boolean;
  /** Opens the 3D view, where pictures are taken. */
  onTakePicture: () => void;
}) {
  const user = useUser();
  const remote = useRoomPictures(roomId);
  const uploads = usePictureUploads();
  const [openId, setOpenId] = useState<string | null>(null);
  // Pictures being deleted: their tiles say so until they are gone.
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());
  const uploaded = remote.status === 'ready' ? remote.pictures : null;
  const pictures = useMemo(
    () => stripPictures(roomId, uploads.queue, uploaded ?? [], uploadedFile),
    [roomId, uploads.queue, uploaded],
  );
  const open = pictures.find((p) => p.id === openId) ?? null;

  const askDelete = (picture: StripPicture) =>
    confirmDeletePicture({
      uid: user.uid,
      roomId,
      picture,
      online,
      onStart: () => {
        setOpenId(null);
        setDeleting((s) => new Set(s).add(picture.id));
      },
      onEnd: () =>
        setDeleting((s) => {
          const next = new Set(s);
          next.delete(picture.id);
          return next;
        }),
    });

  useUploadWhenOnline(online);

  const failed = pictures.some((p) => p.pending && p.pending.attempts > 0 && !p.pending.stuck);
  // Only the phone's memory so far: online, the server's answer is on its way.
  const fromCache = remote.status === 'ready' && remote.fromCache;
  const loading = remote.status === 'loading' || (fromCache && online);

  let body: React.ReactNode;
  if (pictures.length === 0 && loading) {
    body = (
      <View className="flex-row gap-3" accessibilityLabel="Loading pictures">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 w-28 rounded-lg" />
        ))}
      </View>
    );
  } else if (pictures.length === 0 && remote.status === 'error') {
    body = (
      <View className="gap-3">
        <Alert variant="destructive" icon={LuTriangleAlert}>
          <AlertDescription>{remote.message}</AlertDescription>
        </Alert>
        <Button variant="outline" onPress={remote.retry}>
          <Icon as={LuRefreshCw} size={16} />
          <Text>Try again</Text>
        </Button>
      </View>
    );
  } else if (pictures.length === 0) {
    body = (
      <View className="border-border items-center gap-3 rounded-lg border border-dashed px-4 py-6">
        <Icon as={LuCamera} size={24} className="text-muted-foreground" />
        <Text className="text-muted-foreground text-center text-sm">
          {fromCache
            ? 'No pictures on this phone. Pictures taken elsewhere show when the connection is back.'
            : 'No pictures yet. Open the 3D view, choose an angle and tap Take picture.'}
        </Text>
        <Button variant="outline" onPress={onTakePicture}>
          <Icon as={LuCamera} size={16} />
          <Text>Open the 3D view</Text>
        </Button>
      </View>
    );
  } else {
    body = (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Edge to edge of the card (its content has px-6), so tiles scroll out under its edge.
        className="-mx-6"
        contentContainerClassName="gap-3 px-6"
      >
        {pictures.map((p) => (
          <Tile
            key={p.id}
            picture={p}
            status={statusOf(p, uploads, online)}
            deleting={deleting.has(p.id)}
            onPress={() => setOpenId(p.id)}
            onDelete={() => askDelete(p)}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pictures</CardTitle>
        <CardDescription>
          {pictures.length > 0
            ? 'Taken in the 3D view: in Photos, here and on the website. Tap one to see it; press and hold to delete it.'
            : 'Pictures you take in the 3D view are saved to Photos and here, and show on the website.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {body}
        {pictures.length > 0 && remote.status === 'error' ? (
          <View className="flex-row items-center gap-2">
            <Icon as={LuTriangleAlert} size={14} className="text-destructive" />
            <Text className="text-destructive flex-1 text-xs">{remote.message}</Text>
            <Button variant="ghost" size="sm" onPress={remote.retry}>
              <Text>Try again</Text>
            </Button>
          </View>
        ) : null}
        {failed ? (
          <Button variant="outline" size="sm" onPress={pictureUploads.retryNow}>
            <Icon as={LuRefreshCw} size={14} />
            <Text>Try uploading again</Text>
          </Button>
        ) : null}
      </CardContent>
      <PictureViewer
        picture={open}
        status={open ? statusOf(open, uploads, online) : null}
        onClose={() => setOpenId(null)}
        onDelete={askDelete}
      />
    </Card>
  );
}

function Tile({
  picture,
  status,
  deleting,
  onPress,
  onDelete,
}: {
  picture: StripPicture;
  status: UploadView | null;
  deleting: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const source = usePictureSource(picture);
  const when = formatDate(picture.time === Number.MAX_SAFE_INTEGER ? null : new Date(picture.time));
  const ai = isAiPicture(picture);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDelete}
      disabled={deleting}
      accessibilityRole="button"
      accessibilityLabel={`${ai ? 'AI picture' : 'Picture'} from ${when}${deleting ? ', being deleted' : status ? `. ${status.detail}` : ''}`}
      accessibilityHint="Opens the picture. Press and hold to delete it."
      accessibilityActions={[{ name: 'delete', label: 'Delete picture' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') onDelete();
      }}
      className={deleting ? 'opacity-50' : 'active:opacity-80'}
    >
      <View className="bg-muted h-36 w-28 items-center justify-center overflow-hidden rounded-lg">
        {source.uri ? (
          <Image
            source={{ uri: source.uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onError={source.onError}
            accessible={false}
          />
        ) : source.loading ? (
          <Skeleton className="size-full rounded-none" />
        ) : (
          <Icon as={LuImageOff} size={22} className="text-muted-foreground" />
        )}
        {ai ? <AiBadge className="absolute left-1 top-1" /> : null}
        {deleting ? (
          <View className="absolute inset-0 items-center justify-center gap-1 bg-black/40">
            <ActivityIndicator color="white" />
            <Text className="text-[10px] font-medium text-white">Deleting…</Text>
          </View>
        ) : null}
        {status && !deleting ? (
          <View className="absolute inset-x-1 bottom-1 flex-row items-center gap-1 rounded-md bg-black/70 px-1.5 py-1">
            <Icon as={STATUS_ICON[status.kind]} size={11} className="text-white" />
            <Text className="flex-1 text-[10px] font-medium text-white" numberOfLines={1}>
              {status.text}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
