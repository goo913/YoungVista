/**
 * One picture, full screen, with when it was taken and how its upload is going. A picture that
 * cannot be uploaded can be removed from the list here (it stays in Photos).
 */
import { ActivityIndicator, Image, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LuImageOff, LuRefreshCw, LuTrash2, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDate } from '@/lib/format';
import type { StripPicture, UploadView } from '@/lib/picture-state';
import { pictureUploads, usePictureSource } from '@/lib/pictures';

export function PictureViewer({
  picture,
  status,
  onClose,
}: {
  picture: StripPicture | null;
  status: UploadView | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={picture !== null}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {picture ? <Viewer picture={picture} status={status} onClose={onClose} /> : null}
    </Modal>
  );
}

function Viewer({
  picture,
  status,
  onClose,
}: {
  picture: StripPicture;
  status: UploadView | null;
  onClose: () => void;
}) {
  const source = usePictureSource(picture);
  const when = formatDate(picture.time === Number.MAX_SAFE_INTEGER ? null : new Date(picture.time));
  const pending = picture.pending;
  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 px-4 py-2">
        <View className="flex-1">
          <Text className="font-semibold text-white">Picture</Text>
          <Text className="text-xs text-white/70">
            {when} · {picture.width} × {picture.height}
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
        {source.uri ? (
          <Image
            source={{ uri: source.uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
            onError={source.onError}
            accessibilityLabel={`Picture of the room from ${when}`}
          />
        ) : source.loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <View className="items-center gap-2">
            <Icon as={LuImageOff} size={28} className="text-white/70" />
            <Text className="text-sm text-white/70">This picture cannot be shown right now.</Text>
          </View>
        )}
      </View>
      {status && pending ? (
        <View className="gap-3 px-4 pb-2 pt-3">
          <Text className="text-center text-sm text-white/85" accessibilityLiveRegion="polite">
            {status.detail}
          </Text>
          {status.kind === 'failed' ? (
            <Button
              variant="secondary"
              onPress={() => {
                void pictureUploads.discard(pending.id);
                onClose();
              }}
            >
              <Icon as={LuTrash2} size={16} />
              <Text>Remove from this list</Text>
            </Button>
          ) : pending.attempts > 0 ? (
            <Button variant="secondary" onPress={pictureUploads.retryNow}>
              <Icon as={LuRefreshCw} size={16} />
              <Text>Try uploading again</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
