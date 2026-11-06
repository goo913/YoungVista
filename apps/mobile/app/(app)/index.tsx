import { formatArea, roomArea, type UnitSystem } from '@youngvista/core';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LuRefreshCw,
  LuScanLine,
  LuSettings,
  LuSquareDashed,
  LuTriangleAlert,
  LuView,
} from 'react-icons/lu';
import { ConnectionBanner } from '@/components/connection-banner';
import { FloorPlan } from '@/components/floor-plan';
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
        renderItem={({ item }) => <RoomCard room={item} units={units} />}
      />
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

function RoomCard({ room, units }: { room: RoomSummary; units: UnitSystem }) {
  const area = room.room ? formatArea(roomArea(room.room), units) : 'No floor plan yet';
  return (
    <Link href={{ pathname: '/rooms/[id]', params: { id: room.id } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`${room.name}, ${area}`}>
        <Card className="gap-0 overflow-hidden py-0">
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
              {area} · {formatDate(room.updatedAt)}
            </CardDescription>
          </CardHeader>
        </Card>
      </Pressable>
    </Link>
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
