import { formatArea, roomArea, type UnitSystem } from '@youngvista/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LuEllipsis,
  LuRefreshCw,
  LuScanLine,
  LuSettings,
  LuSquareDashed,
  LuTriangleAlert,
  LuView,
} from 'react-icons/lu';
import { ConnectionBanner } from '@/components/connection-banner';
import { FloorPlan } from '@/components/floor-plan';
import {
  manageTarget,
  RoomManageSheet,
  type RoomManageTarget,
} from '@/components/rooms/room-manage';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useUser } from '@/lib/auth';
import { emulatorHost } from '@/lib/firebase';
import { formatDate } from '@/lib/format';
import {
  dismissRoomDeletion,
  startRoomDeletion,
  useRoomDeletions,
  type RoomDeletion,
} from '@/lib/room-delete';
import { saveScannedRoom, useRooms, type RoomSummary } from '@/lib/rooms';
import { sampleRoom } from '@/lib/sample-room';
import { useUnits } from '@/lib/units';

export default function RoomsScreen() {
  const user = useUser();
  const rooms = useRooms(user.uid);
  const [units, setUnits] = useUnits();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasRooms = rooms.status === 'ready' && rooms.data.length > 0;
  const deletions = useRoomDeletions();
  const [manage, setManage] = useState<RoomManageTarget | null>(null);

  return (
    <View className="bg-background flex-1">
      <FlatList
        data={rooms.status === 'ready' ? rooms.data : []}
        keyExtractor={(room) => room.id}
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + (hasRooms ? 96 : 24) }}
        ListHeaderComponent={
          <View className="gap-4">
            <Text className="text-muted-foreground text-sm">
              Rooms you scan, newest first. They also show on young-vista.web.app.
            </Text>
            {/* In the page rather than floating in the header, where it covered the content. */}
            <View className="flex-row items-center justify-between gap-3">
              <UnitsToggle value={units} onChange={setUnits} />
              <Button
                variant="outline"
                size="sm"
                onPress={() => router.push('/settings')}
                accessibilityHint="Units, scanning tips, model credits and signing out."
              >
                <Icon as={LuSettings} size={16} />
                <Text>Settings</Text>
              </Button>
            </View>
            {rooms.status === 'ready' ? <ConnectionBanner online={rooms.online} /> : null}
            {rooms.status === 'loading' ? <RoomListSkeleton /> : null}
            {rooms.status === 'error' ? (
              <View className="gap-3">
                <Alert variant="destructive" icon={LuTriangleAlert}>
                  <AlertDescription>{rooms.message}</AlertDescription>
                </Alert>
                <Button variant="outline" onPress={rooms.retry}>
                  <Icon as={LuRefreshCw} size={16} />
                  <Text>Try again</Text>
                </Button>
              </View>
            ) : null}
            {rooms.status === 'ready' && rooms.data.length === 0 ? (
              <EmptyRooms
                onScan={() => router.push('/scan')}
                onPlaceFreely={() => router.push('/place')}
              />
            ) : null}
            {emulatorHost ? <SampleRoomButton ownerId={user.uid} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <RoomCard
            room={item}
            units={units}
            deletion={deletions.get(item.id) ?? null}
            onOpen={() => router.push({ pathname: '/rooms/[id]', params: { id: item.id } })}
            onManage={() => setManage(manageTarget(item, rooms.online))}
            onRetryDelete={() => startRoomDeletion(user.uid, item)}
          />
        )}
      />
      <RoomManageSheet target={manage} onClose={() => setManage(null)} />
      {hasRooms ? (
        <View
          className="absolute inset-x-0 bottom-0 flex-row gap-3 px-4"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <Button size="lg" className="flex-1" onPress={() => router.push('/scan')}>
            <Icon as={LuScanLine} size={18} />
            <Text>Scan a room</Text>
          </Button>
          <Button
            size="lg"
            variant="outline"
            onPress={() => router.push('/place')}
            accessibilityHint="Try furniture at real size in the camera view, without a room."
          >
            <Icon as={LuView} size={18} />
            <Text>Place freely</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Development runs against the Firebase emulators only (no AR there): adds an L-shaped room
 * through the app's own save code.
 */
function SampleRoomButton({ ownerId }: { ownerId: string }) {
  const [units] = useUnits();
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      await saveScannedRoom({
        ownerId,
        name: 'Sample L-shaped room',
        units,
        room: sampleRoom(),
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onPress={() => void add()} disabled={busy}>
      <Text>Add a sample room (emulator only)</Text>
    </Button>
  );
}

/**
 * A room in the list: its plan, name, size and date. A tap opens it; the ⋯ button (or a long
 * press) renames, edits or deletes it. While it is being deleted it says so and cannot be opened.
 */
function RoomCard({
  room,
  units,
  deletion,
  onOpen,
  onManage,
  onRetryDelete,
}: {
  room: RoomSummary;
  units: UnitSystem;
  deletion: RoomDeletion | null;
  onOpen: () => void;
  onManage: () => void;
  onRetryDelete: () => void;
}) {
  const area = room.room ? formatArea(roomArea(room.room), units) : 'No floor plan yet';
  const deleting = deletion?.status === 'deleting';
  const pieces = room.design.items.length;
  const furniture =
    pieces === 0 ? 'no furniture' : `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`;
  return (
    <Card
      className={deleting ? 'gap-0 overflow-hidden py-0 opacity-60' : 'gap-0 overflow-hidden py-0'}
    >
      <Pressable
        onPress={onOpen}
        onLongPress={onManage}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel={`${room.name}, ${area}, ${furniture}${deleting ? ', being deleted' : ''}`}
        accessibilityHint="Opens the room. Press and hold to rename or delete it."
        accessibilityActions={[{ name: 'manage', label: 'Rename, edit or delete' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'manage') onManage();
        }}
        className="active:opacity-80"
      >
        <View className="bg-muted/40 border-border aspect-[4/3] items-center justify-center border-b p-6">
          {room.room ? (
            <FloorPlan room={room.room} units={units} labels={false} layout="fill" />
          ) : (
            <Icon as={LuSquareDashed} size={40} className="text-muted-foreground" />
          )}
        </View>
        <CardHeader className="py-4">
          <CardTitle numberOfLines={1}>{room.name}</CardTitle>
          <CardDescription>
            {area} · {furniture} · {formatDate(room.updatedAt)}
          </CardDescription>
        </CardHeader>
      </Pressable>
      <Button
        size="icon"
        variant="ghost"
        className="bg-background/85 absolute right-2 top-2 rounded-full"
        onPress={onManage}
        disabled={deleting}
        accessibilityLabel={`Rename, edit or delete ${room.name}`}
      >
        <Icon as={LuEllipsis} size={20} />
      </Button>
      {deleting ? (
        <View
          className="absolute inset-x-0 top-0 aspect-[4/3] items-center justify-center gap-2"
          pointerEvents="none"
        >
          <ActivityIndicator />
          <Text className="text-sm font-medium">Deleting…</Text>
        </View>
      ) : null}
      {deletion?.status === 'failed' ? (
        <View className="border-border gap-2 border-t px-6 py-3">
          <View className="flex-row items-center gap-2">
            <Icon as={LuTriangleAlert} size={14} className="text-destructive" />
            <Text className="text-destructive flex-1 text-xs">{deletion.message}</Text>
          </View>
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" onPress={onRetryDelete}>
              <Icon as={LuRefreshCw} size={14} />
              <Text>Delete again</Text>
            </Button>
            <Button size="sm" variant="ghost" onPress={() => dismissRoomDeletion(room.id)}>
              <Text>Keep it</Text>
            </Button>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function RoomListSkeleton() {
  return (
    <View className="gap-4" accessibilityLabel="Loading rooms">
      {[0, 1].map((i) => (
        <Card key={i} className="gap-0 overflow-hidden py-0">
          <Skeleton className="aspect-[4/3] rounded-none" />
          <View className="gap-2 p-6">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </View>
        </Card>
      ))}
    </View>
  );
}

function EmptyRooms({ onScan, onPlaceFreely }: { onScan: () => void; onPlaceFreely: () => void }) {
  return (
    <Card className="items-center gap-4 px-6 py-10">
      <View className="bg-muted size-12 items-center justify-center rounded-full">
        <Icon as={LuScanLine} size={24} className="text-muted-foreground" />
      </View>
      <View className="items-center gap-1">
        <Text className="text-base font-medium">No rooms yet</Text>
        <Text className="text-muted-foreground text-center text-sm">
          Stand in a room, turn around slowly with your phone, and the app draws the floor plan.
        </Text>
      </View>
      <Button size="lg" onPress={onScan}>
        <Icon as={LuScanLine} size={18} />
        <Text>Scan a room</Text>
      </Button>
      <Button variant="ghost" onPress={onPlaceFreely}>
        <Icon as={LuView} size={16} />
        <Text>Or place furniture freely, no room needed</Text>
      </Button>
    </Card>
  );
}
