/**
 * The card over the 3D view after "Take picture": "Picture saved", the picture itself, and where
 * it went, one line each with a tick, a spinner or a warning: Photos, and this room's pictures
 * (and the website once uploaded). It stays until nothing is happening any more, then a few
 * seconds longer, so it is hard to miss.
 */
import { useEffect } from 'react';
import { ActivityIndicator, Image, Linking, View } from 'react-native';
import { LuCircleCheck, LuTriangleAlert, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  shotRows,
  shotSettled,
  shotUpload,
  type PhotosState,
  type PictureQueue,
  type ShotRow,
} from '@/lib/picture-state';

export type Shot =
  | { phase: 'taking' }
  | {
      phase: 'taken';
      pictureId: string;
      /** The picture on the phone, for its thumbnail. */
      file: string;
      photos: PhotosState;
      /** Some models had not loaded when it was taken. */
      incomplete: boolean;
    }
  | { phase: 'failed'; message: string };

/** How long the card stays once nothing is happening any more (ms). */
const LINGER_MS = 8000;

export function ShotNotice({
  shot,
  queue,
  active,
  online,
  onDismiss,
}: {
  shot: Shot;
  queue: PictureQueue;
  /** The upload running now, if any. */
  active: { id: string; slow: boolean } | null;
  /** False while the server cannot be reached. */
  online: boolean;
  onDismiss: () => void;
}) {
  const upload = shot.phase === 'taken' ? shotUpload(queue, active, shot.pictureId, online) : null;
  const settled =
    shot.phase === 'failed' ||
    (shot.phase === 'taken' && upload !== null && shotSettled(shot.photos, upload));

  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(onDismiss, LINGER_MS);
    return () => clearTimeout(t);
  }, [settled, onDismiss]);

  if (shot.phase === 'taking') {
    return (
      <Card>
        <ActivityIndicator />
        <Text className="flex-1 text-sm font-medium">Taking the picture…</Text>
      </Card>
    );
  }
  if (shot.phase === 'failed') {
    return (
      <Card onDismiss={onDismiss}>
        <Icon as={LuTriangleAlert} size={20} className="text-destructive" />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold">No picture</Text>
          <Text className="text-muted-foreground text-xs">{shot.message}</Text>
        </View>
      </Card>
    );
  }
  const rows = shotRows(shot.photos, upload ?? 'waiting');
  return (
    <Card onDismiss={onDismiss}>
      <Image
        source={{ uri: shot.file }}
        className="bg-muted h-20 w-16 rounded-md"
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <View className="flex-1 gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <Icon as={LuCircleCheck} size={18} className="text-green-600" />
          <Text className="text-base font-semibold">Picture saved</Text>
        </View>
        {rows.map((row) => (
          <Row key={row.text} row={row} />
        ))}
        {shot.incomplete ? (
          <Text className="text-muted-foreground text-xs">
            Some furniture was still loading and shows as grey boxes.
          </Text>
        ) : null}
        {shot.photos === 'denied' ? (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onPress={() => void Linking.openSettings()}
          >
            <Text>Open Settings</Text>
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

function Row({ row }: { row: ShotRow }) {
  return (
    <View className="flex-row items-start gap-1.5">
      <View className="mt-0.5 size-3.5 items-center justify-center">
        {row.tone === 'busy' ? (
          <ActivityIndicator size="small" style={{ transform: [{ scale: 0.6 }] }} />
        ) : (
          <Icon
            as={row.tone === 'done' ? LuCircleCheck : LuTriangleAlert}
            size={14}
            className={row.tone === 'done' ? 'text-green-600' : 'text-destructive'}
          />
        )}
      </View>
      <Text className="text-muted-foreground flex-1 text-xs">{row.text}</Text>
    </View>
  );
}

function Card({ children, onDismiss }: { children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <View
      className="bg-background border-border flex-row items-center gap-3 rounded-xl border p-3 shadow-md shadow-black/15"
      accessibilityLiveRegion="polite"
    >
      {children}
      {onDismiss ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-8 self-start"
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
        >
          <Icon as={LuX} size={16} />
        </Button>
      ) : null}
    </View>
  );
}
