/**
 * On the room page: "AI: show my furniture in a photo". The user takes a photo of the room (or
 * chooses one from Photos), chooses which of the room's pieces to show (at most 8, biggest first
 * at the start), may say what else to change in their own words, and AI shows that room with them.
 * AI is told the room's real size and each piece's, and keeps the walls, doors and windows.
 * For the furniture exactly where it was placed, the camera view's "AI picture" is better; this
 * card says so.
 */
import { AI_MAX_PIECES, AI_MAX_REQUEST_LENGTH, cleanAiRequest } from '@youngvista/core';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LuCamera, LuImages, LuSparkles, LuSquare, LuSquareCheck, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  canAddPiece,
  chosenItemIds,
  firstChoice,
  photoPieces,
  type PhotoPiece,
} from '@/lib/ai-picture-state';
import { thumbUrl, type CatalogIndex } from '@/lib/catalog-data';
import type { RoomSummary } from '@/lib/room-doc';
import { toasts } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useAiPicture } from './use-ai-picture';

interface Photo {
  uri: string;
  width: number;
  height: number;
}

export function AiPhotoCard({
  summary,
  catalog,
  online,
}: {
  summary: RoomSummary;
  /** Null while the furniture list loads. */
  catalog: CatalogIndex | null;
  online: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ai = useAiPicture({ roomId: summary.id, online });
  const pieces = useMemo(
    () => (catalog ? photoPieces(summary.design.items, (id) => catalog.byId.get(id) ?? null) : []),
    [summary.design.items, catalog],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI pictures</CardTitle>
        <CardDescription>
          See your furniture in a real photo of this room. AI keeps the walls, doors and windows,
          and the furniture’s real size, as well as it can. For the furniture exactly where you put
          it, use AI picture in the camera view.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {ai.card}
        <Button
          variant="outline"
          onPress={() => setOpen(true)}
          disabled={ai.busy || !catalog}
          accessibilityHint="Take or choose a photo of the room, choose furniture, and AI shows them together."
        >
          <Icon as={LuSparkles} size={16} />
          <Text>AI: show my furniture in a photo</Text>
        </Button>
      </CardContent>
      <AiPhotoSheet
        visible={open}
        pieces={pieces}
        onClose={() => setOpen(false)}
        onMake={(photo, itemIds, request) => {
          setOpen(false);
          void ai.start({ use: 'photo', source: async () => photo.uri, itemIds, request });
        }}
      />
      {ai.modals}
    </Card>
  );
}

function AiPhotoSheet({
  visible,
  pieces,
  onClose,
  onMake,
}: {
  visible: boolean;
  pieces: readonly PhotoPiece[];
  onClose: () => void;
  onMake: (photo: Photo, itemIds: string[], request: string) => void;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => firstChoice(pieces));
  const [request, setRequest] = useState('');
  // The room's furniture changed since the choice was made (here or elsewhere): start again from
  // the biggest pieces. Compared by content: a fresh snapshot of the same design changes nothing.
  const signature = pieces.map((p) => `${p.key}:${p.itemIds.join(',')}`).join('|');
  const [madeFor, setMadeFor] = useState(signature);
  if (madeFor !== signature) {
    setMadeFor(signature);
    setChosen(firstChoice(pieces));
  }

  const itemIds = chosenItemIds(pieces, chosen);
  const words = cleanAiRequest(request);
  const ready = photo !== null && (itemIds.length > 0 || words.length > 0);

  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else if (canAddPiece(pieces, chosen, key)) next.add(key);
    else {
      toasts.show({
        tone: 'info',
        title: `At most ${AI_MAX_PIECES} pieces`,
        detail: 'Leave out another piece first.',
      });
      return;
    }
    setChosen(next);
  };

  const take = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toasts.show({
        tone: 'error',
        title: 'The camera is off for YoungVista',
        detail: 'Turn on Camera for YoungVista in Settings.',
      });
      if (!permission.canAskAgain) void Linking.openSettings();
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const choose = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: false,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="bg-background flex-1" edges={['top', 'bottom']}>
        <View className="border-border flex-row items-center gap-3 border-b px-4 py-3">
          <Text className="flex-1 text-base font-semibold" accessibilityRole="header">
            Show my furniture in a photo
          </Text>
          <Button size="icon" variant="ghost" onPress={onClose} accessibilityLabel="Close">
            <Icon as={LuX} size={20} />
          </Button>
        </View>
        <ScrollView contentContainerClassName="gap-5 p-4 pb-8" keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            <Text className="font-semibold">1. A photo of this room</Text>
            {photo ? (
              <Image
                source={{ uri: photo.uri }}
                className="bg-muted w-full rounded-lg"
                style={{
                  aspectRatio:
                    photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3,
                }}
                resizeMode="cover"
                accessibilityLabel="The photo of the room"
              />
            ) : (
              <Text className="text-muted-foreground text-sm">
                Stand in a corner and take in as much of the room as you can, with no people in it.
              </Text>
            )}
            <View className="flex-row gap-3">
              <Button variant="outline" className="flex-1" onPress={() => void take()}>
                <Icon as={LuCamera} size={16} />
                <Text>{photo ? 'Take another' : 'Take a photo'}</Text>
              </Button>
              <Button variant="outline" className="flex-1" onPress={() => void choose()}>
                <Icon as={LuImages} size={16} />
                <Text>Choose from Photos</Text>
              </Button>
            </View>
          </View>

          <View className="gap-2">
            <Text className="font-semibold">2. Furniture to show</Text>
            {pieces.length === 0 ? (
              <Text className="text-muted-foreground text-sm">
                This room has no furniture yet. You can still ask AI for a change below.
              </Text>
            ) : (
              <>
                <Text className="text-muted-foreground text-xs">
                  At most {AI_MAX_PIECES} pieces. AI places them where they fit in the photo.
                </Text>
                {pieces.map((p) => (
                  <PieceRow
                    key={p.key}
                    piece={p}
                    chosen={chosen.has(p.key)}
                    onToggle={() => toggle(p.key)}
                  />
                ))}
              </>
            )}
          </View>

          <View className="gap-2">
            <Text className="font-semibold">3. Anything else to change? (optional)</Text>
            <Input
              value={request}
              onChangeText={setRequest}
              placeholder="For example: warm evening light"
              maxLength={AI_MAX_REQUEST_LENGTH}
              multiline
              className="h-20 py-2"
              textAlignVertical="top"
              accessibilityLabel="Anything else to change"
            />
            <Text className="text-muted-foreground text-xs">
              AI never changes the walls, doors or windows.
            </Text>
          </View>

          <Button
            size="lg"
            disabled={!ready}
            onPress={() => photo && onMake(photo, itemIds, words)}
          >
            <Icon as={LuSparkles} size={18} className="text-primary-foreground" />
            <Text>Make AI picture</Text>
          </Button>
          {!photo ? (
            <Text className="text-muted-foreground text-center text-xs">
              Take or choose a photo first.
            </Text>
          ) : !ready ? (
            <Text className="text-muted-foreground text-center text-xs">
              Choose some furniture, or say what to change.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PieceRow({
  piece,
  chosen,
  onToggle,
}: {
  piece: PhotoPiece;
  chosen: boolean;
  onToggle: () => void;
}) {
  const thumb = thumbUrl(piece.product, piece.variant);
  const count = piece.itemIds.length;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: chosen }}
      accessibilityLabel={count > 1 ? `${count} × ${piece.name}` : piece.name}
      className={cn(
        'border-border flex-row items-center gap-3 rounded-lg border p-2',
        chosen && 'border-primary bg-accent',
      )}
    >
      <View className="bg-muted size-12 overflow-hidden rounded-md">
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : null}
      </View>
      <Text className="flex-1 text-sm" numberOfLines={2}>
        {count > 1 ? `${count} × ` : ''}
        {piece.name}
      </Text>
      <Icon
        as={chosen ? LuSquareCheck : LuSquare}
        size={22}
        className={chosen ? 'text-primary' : 'text-muted-foreground'}
      />
    </Pressable>
  );
}
