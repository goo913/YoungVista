/**
 * The card over the 3D view after "Take picture": what happened to the new picture (saved to
 * Photos, uploading, waiting for the connection), with the picture itself. It goes by itself
 * once nothing is happening any more.
 */
import { useEffect } from 'react';
import { ActivityIndicator, Image, Linking, View } from 'react-native';
import { LuTriangleAlert, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  shotSettled,
  shotText,
  shotUpload,
  type PhotosState,
  type PictureQueue,
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
const LINGER_MS = 5000;

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
        <Text className="flex-1 text-sm">Taking the picture…</Text>
      </Card>
    );
  }
  if (shot.phase === 'failed') {
    return (
      <Card onDismiss={onDismiss}>
        <Icon as={LuTriangleAlert} size={18} className="text-destructive" />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-semibold">No picture</Text>
          <Text className="text-muted-foreground text-xs">{shot.message}</Text>
        </View>
      </Card>
    );
  }
  return (
    <Card onDismiss={onDismiss}>
      <Image
        source={{ uri: shot.file }}
        className="bg-muted size-14 rounded-md"
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold">Picture taken</Text>
        <Text className="text-muted-foreground text-xs">
          {shotText(shot.photos, upload ?? 'waiting', shot.incomplete)}
        </Text>
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

function Card({ children, onDismiss }: { children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <View
      className="bg-background border-border flex-row items-center gap-3 rounded-xl border p-3 shadow-sm shadow-black/10"
      accessibilityLiveRegion="polite"
    >
      {children}
      {onDismiss ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
        >
          <Icon as={LuX} size={16} />
        </Button>
      ) : null}
    </View>
  );
}
