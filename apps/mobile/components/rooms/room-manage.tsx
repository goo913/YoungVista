/**
 * Managing a room: rename it, edit its walls, doors and windows, or delete it (after saying what
 * goes with it). One sheet with three pages, used from the rooms list (the ⋯ on a room, or a long
 * press) and from the room page. Deleting needs a connection (lib/room-delete.ts); renaming works
 * offline and is sent when the connection is back.
 */
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LuPencil, LuPencilRuler, LuTrash2, LuWifiOff } from 'react-icons/lu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { useUser } from '@/lib/auth';
import { startRoomDeletion } from '@/lib/room-delete';
import { cleanRoomName, MAX_ROOM_NAME, type RoomSummary } from '@/lib/room-doc';
import { renameRoom } from '@/lib/rooms';
import { toasts } from '@/lib/toast';

export type RoomManagePage = 'menu' | 'rename' | 'delete';

export interface RoomManageTarget {
  room: Pick<RoomSummary, 'id' | 'name'> & { room: unknown };
  /** From the room's (or the list's) snapshot: false while the server cannot be reached. */
  online: boolean;
  /** The page to open on. */
  page: RoomManagePage;
}

export function RoomManageSheet({
  target,
  onClose,
  onDeleteStarted,
}: {
  target: RoomManageTarget | null;
  onClose: () => void;
  /** Called once a delete has started (the room page closes itself). */
  onDeleteStarted?: () => void;
}) {
  // What to do once the sheet is gone (leave the page, open the editor): on iPhone a screen
  // cannot change while the sheet is still fading out, so it waits for `onDismiss`.
  const after = useRef<(() => void) | null>(null);
  const runAfter = () => {
    const next = after.current;
    after.current = null;
    next?.();
  };
  const close = (then?: () => void) => {
    after.current = then ?? null;
    onClose();
    if (then && Platform.OS !== 'ios') setTimeout(runAfter, 0);
  };
  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="fade"
      onRequestClose={() => close()}
      onDismiss={runAfter}
      statusBarTranslucent
    >
      {target ? (
        <Sheet
          key={`${target.room.id}-${target.page}`}
          target={target}
          onClose={close}
          onDeleteStarted={onDeleteStarted}
        />
      ) : null}
    </Modal>
  );
}

function Sheet({
  target,
  onClose,
  onDeleteStarted,
}: {
  target: RoomManageTarget;
  /** Closes the sheet, then runs `then` once it is gone. */
  onClose: (then?: () => void) => void;
  onDeleteStarted?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useUser();
  const [page, setPage] = useState<RoomManagePage>(target.page);
  const [name, setName] = useState(target.room.name);
  const [error, setError] = useState<string | null>(null);
  const { room, online } = target;

  const save = async () => {
    const clean = cleanRoomName(name);
    if (!clean) {
      setError('Type a name for the room.');
      return;
    }
    onClose();
    if (clean === room.name) return;
    const saved = await renameRoom(user.uid, room.id, clean);
    toasts.show({
      tone: 'success',
      title: `Renamed to “${saved}”`,
      detail: online
        ? undefined
        : 'Saved on this phone. It reaches the website when the connection is back.',
    });
  };

  const remove = () => {
    startRoomDeletion(user.uid, room);
    onClose(onDeleteStarted);
  };

  let body: React.ReactNode;
  if (page === 'rename') {
    body = (
      <View className="gap-4">
        <Text className="text-lg font-semibold">Rename room</Text>
        <View className="gap-2">
          <Label nativeID="room-name">Name</Label>
          <Input
            aria-labelledby="room-name"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            maxLength={MAX_ROOM_NAME}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            placeholder="Living room"
          />
          {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
        </View>
        <View className="flex-row gap-3">
          <Button variant="outline" className="flex-1" onPress={() => onClose()}>
            <Text>Cancel</Text>
          </Button>
          <Button className="flex-1" onPress={() => void save()}>
            <Text>Save</Text>
          </Button>
        </View>
      </View>
    );
  } else if (page === 'delete') {
    body = (
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-lg font-semibold">Delete “{room.name}”?</Text>
          <Text className="text-muted-foreground text-sm">
            Its furniture, its pictures and its share link are deleted too, from this phone and the
            website. Pictures saved to Photos stay there. This cannot be undone.
          </Text>
        </View>
        {online ? null : (
          <Alert icon={LuWifiOff}>
            <AlertTitle>No connection</AlertTitle>
            <AlertDescription>
              Deleting a room needs a connection, so its pictures and link go from the website too.
              Connect to the internet, then try again.
            </AlertDescription>
          </Alert>
        )}
        <View className="gap-3">
          <Button variant="destructive" onPress={remove} disabled={!online}>
            <Icon as={LuTrash2} size={16} className="text-white" />
            <Text>Delete room</Text>
          </Button>
          <Button variant="outline" onPress={() => onClose()}>
            <Text>Keep the room</Text>
          </Button>
        </View>
      </View>
    );
  } else {
    body = (
      <View className="gap-3">
        <Text className="text-lg font-semibold" numberOfLines={1}>
          {room.name}
        </Text>
        <Button variant="outline" className="justify-start" onPress={() => setPage('rename')}>
          <Icon as={LuPencil} size={16} />
          <Text>Rename</Text>
        </Button>
        <Button
          variant="outline"
          className="justify-start"
          disabled={!room.room}
          onPress={() =>
            onClose(() => router.push({ pathname: '/rooms/[id]/edit', params: { id: room.id } }))
          }
        >
          <Icon as={LuPencilRuler} size={16} />
          <Text>Edit walls, doors and windows</Text>
        </Button>
        <Button variant="outline" className="justify-start" onPress={() => setPage('delete')}>
          <Icon as={LuTrash2} size={16} className="text-destructive" />
          <Text className="text-destructive">Delete room</Text>
        </Button>
        <Button variant="ghost" onPress={() => onClose()}>
          <Text>Cancel</Text>
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={() => onClose()}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        className="bg-background border-border rounded-t-2xl border-t px-4 pt-5"
        style={{ paddingBottom: insets.bottom + 16 }}
        accessibilityViewIsModal
      >
        {body}
      </View>
    </KeyboardAvoidingView>
  );
}

/** The ⋯ menu target for a room, from its summary. */
export const manageTarget = (
  room: RoomSummary,
  online: boolean,
  page: RoomManagePage = 'menu',
): RoomManageTarget => ({ room, online, page });
