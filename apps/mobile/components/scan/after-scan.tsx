/**
 * After a scan is saved, on the scan screen: "Room saved", and the saved room in the camera view
 * in the same AR session, lined up from the scan with no corner taps (see ar/pose.ts).
 */
import { describeRoomSize, formatArea, roomArea, type UnitSystem } from '@youngvista/core';
import { ActivityIndicator, View } from 'react-native';
import { LuView } from 'react-icons/lu';
import type { ArController } from '@/ar/controller';
import { scanLineUpOffset } from '@/ar/pose';
import { ArRoom } from '@/components/ar/ar-room';
import type { ArSceneState } from '@/components/ar/ar-scene';
import type { ArViewHandle } from '@/components/ar/ar-view';
import { useHudPadding, useLandscape } from '@/components/camera-hud';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCatalog } from '@/lib/catalog';
import { useRoom } from '@/lib/rooms';
import type { Store } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { SavedRoom } from './room-review';

/** Landscape: the saved card's width (points), at the bottom right like the scan's controls. */
const SAVED_CARD_WIDTH = 340;

export function SavedCard({
  saved,
  units,
  onSeeInRoom,
  onOpenRoom,
}: {
  saved: SavedRoom;
  units: UnitSystem;
  onSeeInRoom: () => void;
  onOpenRoom: () => void;
}) {
  const landscape = useLandscape();
  const padding = useHudPadding(landscape);
  return (
    <View
      className={cn('absolute inset-0 justify-end', landscape ? 'items-end' : 'px-4')}
      style={padding}
      pointerEvents="box-none"
    >
      <Card
        className={cn(landscape && 'gap-4 py-4')}
        style={landscape ? { width: SAVED_CARD_WIDTH } : undefined}
      >
        <CardHeader>
          <CardTitle className="text-lg">Room saved</CardTitle>
          <CardDescription>
            {saved.name}: {describeRoomSize(saved.room, units)},{' '}
            {formatArea(roomArea(saved.room), units)}. Furnish it here in the camera view: it is
            lined up with your room already.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Button size="lg" onPress={onSeeInRoom}>
            <Icon as={LuView} size={18} />
            <Text>See it in your room</Text>
          </Button>
          <Button variant="outline" onPress={onOpenRoom}>
            <Text>Open the room page</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}

/** The saved room in the scan's own AR session. */
export function ArAfterScan({
  saved,
  controller,
  scene,
  view,
  onClose,
}: {
  saved: SavedRoom;
  controller: ArController;
  scene: Store<ArSceneState>;
  view: React.RefObject<ArViewHandle | null>;
  onClose: () => void;
}) {
  const room = useRoom(saved.id);
  const catalog = useCatalog();
  if (room.status === 'ready' && room.settled && room.data.room && catalog.status === 'ready') {
    return (
      <ArRoom
        summary={room.data}
        room={room.data.room}
        online={room.online}
        catalog={catalog.data}
        controller={controller}
        scene={scene}
        view={view}
        fromScan={{ offset: scanLineUpOffset(room.data.room, saved.scaleFactor) }}
        server={room.server}
        pendingDesign={room.pendingDesign}
        onClose={onClose}
      />
    );
  }
  const failed = room.status === 'error' || room.status === 'missing' || catalog.status === 'error';
  return (
    <View className="absolute inset-0 items-center justify-center p-6">
      <View className="max-w-md items-center gap-3 rounded-2xl bg-black/60 px-6 py-5">
        {failed ? null : <ActivityIndicator color="white" />}
        <Text className="text-center text-sm text-white">
          {failed
            ? 'The room or the furniture list could not be loaded. Open the room page and try again.'
            : 'Loading the room…'}
        </Text>
        {failed ? (
          <Button variant="secondary" onPress={onClose}>
            <Text>Open the room page</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
