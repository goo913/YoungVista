/**
 * A room: it opens straight onto the room in 3D with its furniture where it was left (no camera,
 * scan or line-up), then the ways to change it (furnish in 3D, see it in the camera view, edit
 * the walls), the plan and facts, the pictures, AI pictures from a photo, the private link, and
 * renaming or deleting it.
 */
import { formatArea, isFlatProduct, itemFootprint, roomArea } from '@youngvista/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import {
  LuArmchair,
  LuEllipsis,
  LuInfo,
  LuPencil,
  LuPencilRuler,
  LuRefreshCw,
  LuTrash2,
  LuTriangleAlert,
  LuView,
} from 'react-icons/lu';
import { AiPhotoCard } from '@/components/ai/ai-photo';
import { ConnectionBanner } from '@/components/connection-banner';
import { FloorPlan, type PlanFurniture } from '@/components/floor-plan';
import { PictureStrip } from '@/components/pictures/picture-strip';
import { RoomFacts } from '@/components/room-facts';
import {
  manageTarget,
  RoomManageSheet,
  type RoomManagePage,
  type RoomManageTarget,
} from '@/components/rooms/room-manage';
import { RoomPreview } from '@/components/rooms/room-preview';
import { ShareCard } from '@/components/share-card';
import { UnitsToggle } from '@/components/units-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useCatalog } from '@/lib/catalog';
import { formatDate } from '@/lib/format';
import { useRoomDeletion } from '@/lib/room-delete';
import { useRoom } from '@/lib/rooms';
import { useUnits } from '@/lib/units';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const roomId = String(id);
  const room = useRoom(roomId);
  const catalog = useCatalog();
  const [units, setUnits] = useUnits();
  const router = useRouter();
  const deletion = useRoomDeletion(roomId);
  const [manage, setManage] = useState<RoomManageTarget | null>(null);

  const design = room.status === 'ready' ? room.data.design : null;
  const furniture = useMemo<PlanFurniture[]>(() => {
    if (!design || catalog.status !== 'ready') return [];
    return design.items.flatMap((it) => {
      const product = catalog.data.byId.get(it.productId);
      if (!product) return [];
      return [
        {
          id: it.id,
          footprint: itemFootprint(it, product.dimensions),
          flat: isFlatProduct(product),
        },
      ];
    });
  }, [design, catalog]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (room.status === 'loading') return <RoomSkeleton />;
  if (room.status !== 'ready') {
    const gone = room.status === 'missing' && room.deleted;
    return (
      <View className="bg-background flex-1 gap-4 p-4">
        <Alert variant={gone ? 'default' : 'destructive'} icon={gone ? LuInfo : LuTriangleAlert}>
          <AlertTitle>
            {gone
              ? 'This room was deleted'
              : room.status === 'missing'
                ? 'Room not found'
                : 'Could not load'}
          </AlertTitle>
          <AlertDescription>
            {gone
              ? 'It is no longer on this phone or on the website.'
              : room.status === 'missing'
                ? 'This room does not exist or belongs to another account.'
                : room.message}
          </AlertDescription>
        </Alert>
        {room.status === 'error' ? (
          <Button onPress={room.retry}>
            <Icon as={LuRefreshCw} size={16} />
            <Text>Try again</Text>
          </Button>
        ) : null}
        <Button variant="outline" onPress={back}>
          <Text>Back to your rooms</Text>
        </Button>
      </View>
    );
  }

  const summary = room.data;
  const { name, updatedAt } = summary;
  const count = summary.design.items.length;
  const deleting = deletion?.status === 'deleting';
  const openManage = (page: RoomManagePage) => setManage(manageTarget(summary, room.online, page));
  const openFurnish = () =>
    router.push({ pathname: '/rooms/[id]/furnish', params: { id: roomId } });

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerRight: () => (
            <Button
              size="icon"
              variant="ghost"
              onPress={() => openManage('menu')}
              disabled={deleting}
              accessibilityLabel="Rename, edit or delete this room"
            >
              <Icon as={LuEllipsis} size={20} />
            </Button>
          ),
        }}
      />
      <ScrollView className="bg-background flex-1" contentContainerClassName="gap-4 p-4 pb-10">
        {deleting ? (
          <Alert icon={LuTrash2}>
            <AlertTitle>Deleting this room…</AlertTitle>
            <AlertDescription>Its pictures and its link go first, then the room.</AlertDescription>
          </Alert>
        ) : null}
        <ConnectionBanner online={room.online} />
        {summary.room ? (
          <>
            <RoomPreview
              room={summary.room}
              design={summary.design}
              catalog={catalog.status === 'ready' ? catalog.data : null}
              onOpen={openFurnish}
            />
            <View className="gap-3">
              <Button size="lg" onPress={openFurnish} disabled={deleting}>
                <Icon as={LuArmchair} size={18} />
                <Text>{count === 0 ? 'Furnish in 3D' : 'Move or add furniture in 3D'}</Text>
              </Button>
              <Button
                variant="outline"
                disabled={deleting}
                onPress={() => router.push({ pathname: '/rooms/[id]/ar', params: { id: roomId } })}
                accessibilityHint="Shows the furniture at real size in your room, through the camera."
              >
                <Icon as={LuView} size={16} />
                <Text>See it in your room</Text>
              </Button>
              <Button
                variant="outline"
                disabled={deleting}
                onPress={() =>
                  router.push({ pathname: '/rooms/[id]/edit', params: { id: roomId } })
                }
              >
                <Icon as={LuPencilRuler} size={16} />
                <Text>Edit walls, doors and windows</Text>
              </Button>
            </View>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-muted-foreground flex-1 text-sm">
                Updated {formatDate(updatedAt)}
              </Text>
              <UnitsToggle value={units} onChange={setUnits} />
            </View>
            <Card className="px-4">
              <FloorPlan
                room={summary.room}
                units={units}
                furniture={furniture}
                title={`Floor plan of ${name}, ${formatArea(roomArea(summary.room), units)}`}
              />
            </Card>
            <RoomFacts room={summary.room} units={units} />
            <Text className="text-muted-foreground text-sm">
              {count === 0
                ? 'No furniture yet.'
                : `${count} ${count === 1 ? 'piece' : 'pieces'} of furniture, shown at real size.`}
            </Text>
            <PictureStrip roomId={roomId} online={room.online} onTakePicture={openFurnish} />
            <AiPhotoCard
              summary={summary}
              catalog={catalog.status === 'ready' ? catalog.data : null}
              online={room.online}
            />
            <ShareCard summary={summary} />
          </>
        ) : (
          <Alert icon={LuInfo}>
            <AlertDescription>This room has no floor plan yet.</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle>This room</CardTitle>
            <CardDescription>Rename it, or delete it with its pictures and link.</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <Button variant="outline" onPress={() => openManage('rename')} disabled={deleting}>
              <Icon as={LuPencil} size={16} />
              <Text>Rename</Text>
            </Button>
            <Button variant="outline" onPress={() => openManage('delete')} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator />
              ) : (
                <Icon as={LuTrash2} size={16} className="text-destructive" />
              )}
              <Text className="text-destructive">{deleting ? 'Deleting…' : 'Delete room'}</Text>
            </Button>
          </CardContent>
        </Card>
        <Text className="text-muted-foreground text-xs">
          Sizes are approximate: check with a tape for tight gaps.
        </Text>
      </ScrollView>
      <RoomManageSheet target={manage} onClose={() => setManage(null)} onDeleteStarted={back} />
    </>
  );
}

/** The room page's shape while the room loads: the 3D view, the buttons and the facts. */
function RoomSkeleton() {
  return (
    <View className="bg-background flex-1 gap-4 p-4" accessibilityLabel="Loading the room">
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-24" />
      </View>
      <Skeleton className="h-24 w-full rounded-xl" />
    </View>
  );
}
