/**
 * One picture, full screen, with when it was taken, how its upload is going, and Delete (after
 * asking; the copy in Photos stays). An AI picture (components/ai) is marked "AI" and can be
 * compared with the picture it was made from ("Show original"), and saved to Photos from here:
 * AI can change details and sizes, and the original shows them exactly.
 */
import { AI_USE_LABEL } from '@youngvista/core';
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, View, type ModalProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LuArrowLeftRight,
  LuDownload,
  LuImageOff,
  LuRefreshCw,
  LuSparkles,
  LuTrash2,
  LuX,
} from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { saveRoomPictureToPhotos } from '@/lib/ai-picture';
import { formatDate } from '@/lib/format';
import { isAiPicture, type StripPicture, type UploadView } from '@/lib/picture-state';
import { pictureUploads, usePictureSource, usePictureUrl } from '@/lib/pictures';
import { toasts } from '@/lib/toast';
import { cn } from '@/lib/utils';

/** Over a camera screen, which runs in landscape, the viewer stays sideways. */
const CAMERA_ORIENTATIONS: ModalProps['supportedOrientations'] = [
  'landscape-left',
  'landscape-right',
];

export function PictureViewer({
  picture,
  status,
  onClose,
  onDelete,
  overCamera = false,
}: {
  picture: StripPicture | null;
  status: UploadView | null;
  onClose: () => void;
  /** Asks, then deletes the picture (see delete-picture.ts). */
  onDelete: (picture: StripPicture) => void;
  /** Opened over a camera screen (landscape). */
  overCamera?: boolean;
}) {
  return (
    <Modal
      visible={picture !== null}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={overCamera ? CAMERA_ORIENTATIONS : undefined}
    >
      {picture ? (
        <Viewer
          key={picture.id}
          picture={picture}
          status={status}
          onClose={onClose}
          onDelete={onDelete}
        />
      ) : null}
    </Modal>
  );
}

function Viewer({
  picture,
  status,
  onClose,
  onDelete,
}: {
  picture: StripPicture;
  status: UploadView | null;
  onClose: () => void;
  onDelete: (picture: StripPicture) => void;
}) {
  const source = usePictureSource(picture);
  const ai = isAiPicture(picture);
  const [original, setOriginal] = useState(false);
  const originalUrl = usePictureUrl(ai && original ? (picture.sourcePath ?? null) : null);
  const [saving, setSaving] = useState(false);
  const when = formatDate(picture.time === Number.MAX_SAFE_INTEGER ? null : new Date(picture.time));
  const pending = picture.pending;
  const madeFrom = ai && picture.sourceUse ? ` · ${AI_USE_LABEL[picture.sourceUse]}` : '';

  const showing: { uri: string | null; loading: boolean; onError?: () => void } = original
    ? {
        uri: originalUrl.status === 'ready' ? originalUrl.url : null,
        loading: originalUrl.status === 'loading',
      }
    : source;

  const saveToPhotos = async () => {
    setSaving(true);
    const result = await saveRoomPictureToPhotos(picture);
    setSaving(false);
    if (result === 'saved') toasts.show({ tone: 'success', title: 'Saved to Photos' });
    else if (result === 'denied') {
      toasts.show({
        tone: 'error',
        title: 'Not saved to Photos',
        detail: 'Allow YoungVista to add photos in Settings.',
      });
      void Linking.openSettings();
    } else {
      toasts.show({
        tone: 'error',
        title: 'Not saved to Photos',
        detail: 'Check your connection and try again.',
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom', 'left', 'right']}>
      <View className="flex-row items-center gap-3 px-4 py-2">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="font-semibold text-white">
              {ai ? (original ? 'Original' : 'AI picture') : 'Picture'}
            </Text>
            {ai ? <AiBadge className="bg-white/20" /> : null}
          </View>
          <Text className="text-xs text-white/70">
            {when} · {picture.width} × {picture.height}
            {madeFrom}
          </Text>
        </View>
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full bg-white/15"
          onPress={onClose}
          accessibilityLabel="Close the picture"
        >
          <Icon as={LuX} size={20} className="text-white" />
        </Button>
      </View>
      <View className="flex-1 items-center justify-center">
        {showing.uri ? (
          <Image
            source={{ uri: showing.uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            onError={showing.onError}
            accessibilityLabel={
              ai && !original
                ? `AI picture of the room from ${when}`
                : `Picture of the room from ${when}`
            }
          />
        ) : showing.loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <View className="items-center gap-2">
            <Icon as={LuImageOff} size={28} className="text-white/70" />
            <Text className="text-sm text-white/70">This picture cannot be shown right now.</Text>
          </View>
        )}
      </View>
      <View className="gap-3 px-4 pb-2 pt-3">
        {status && pending ? (
          <Text className="text-center text-sm text-white/85" accessibilityLiveRegion="polite">
            {status.detail}
          </Text>
        ) : ai ? (
          <Text className="text-center text-xs text-white/60">
            Made by AI, in this room and on the website. AI can change details and sizes: the
            original and the 3D view show them exactly.
          </Text>
        ) : (
          <Text className="text-center text-xs text-white/60">
            In Photos, in this room and on the website.
          </Text>
        )}
        {ai ? (
          <View className="flex-row gap-3">
            {picture.sourcePath ? (
              <Button
                variant="secondary"
                className="flex-1"
                onPress={() => setOriginal(!original)}
                accessibilityHint="Switches between the AI picture and the picture it was made from."
              >
                <Icon as={LuArrowLeftRight} size={16} />
                <Text>{original ? 'Show AI picture' : 'Show original'}</Text>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              className="flex-1"
              onPress={() => void saveToPhotos()}
              disabled={saving}
            >
              {saving ? <ActivityIndicator size="small" /> : <Icon as={LuDownload} size={16} />}
              <Text>Save to Photos</Text>
            </Button>
          </View>
        ) : null}
        <View className="flex-row gap-3">
          {pending && status?.kind !== 'failed' && pending.attempts > 0 ? (
            <Button variant="secondary" className="flex-1" onPress={pictureUploads.retryNow}>
              <Icon as={LuRefreshCw} size={16} />
              <Text>Try uploading again</Text>
            </Button>
          ) : null}
          <Button
            variant="destructive"
            className="flex-1"
            onPress={() => onDelete(picture)}
            accessibilityHint={
              ai
                ? 'Asks first. Deletes the AI picture and its original.'
                : 'Asks first. The copy in Photos stays.'
            }
          >
            <Icon as={LuTrash2} size={16} className="text-white" />
            <Text>Delete picture</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** "AI" on a picture made by AI: on its tile and in the viewer. */
export function AiBadge({ className }: { className?: string }) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5',
        className,
      )}
      accessibilityLabel="Made by AI"
    >
      <Icon as={LuSparkles} size={10} className="text-white" />
      <Text className="text-[10px] font-semibold text-white">AI</Text>
    </View>
  );
}
